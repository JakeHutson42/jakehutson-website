import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TrialsGame, STEP } from '../../games/trials/simulation/game.js';
import { riderTorso,localToWorld } from '../../games/trials/simulation/rider-pose.js';
import { Vec2 } from '../../lib/planck/1.4.2/planck.module.js';
import { gamepadInput, TrialsInput } from '../../games/trials/input.js';
import { solveLimb } from '../../games/trials/rendering/ik.js';
import { TrialsRecords } from '../../games/trials/storage.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { witnessControls } from '../../games/trials/qa-controls.js';
import { cameraFrame } from '../../games/trials/rendering/camera.js';
import { medal, Preferences } from '../../games/trials/experience.js';
import * as T from '../../lib/three/0.180.0/three.module.min.js';
import { beamGeometry } from '../../games/trials/rendering/geometry.js';
const read=name=>JSON.parse(readFileSync(new URL(`../../games/trials/content/${name}.json`,import.meta.url)));
const bike=read('bike'),course=read('course');
const flat=()=>({...course,paths:[[[-50,0],[200,0]]],checkpoints:[{x:2,y:.42}],finish:180});
const simulate=(g,seconds,input={})=>{for(let i=0;i<Math.round(seconds/STEP);i++)g.update(input);return g;};
const fresh=(c=flat())=>{const g=new TrialsGame(bike,c);g.start();return g;};

test('suspension settles and tyre contacts support the bike and rider mass',()=>{
    const g=fresh();simulate(g,3);const before=g.pose();simulate(g,2);const after=g.pose();
    assert.equal(g.state,'running');assert.ok(Math.abs(after.chassis.y-before.chassis.y)<.002);
    for(const wheel of ['front','rear'])assert.ok(Math.abs(after[wheel].y-bike.wheelRadius)<.01);
    assert.ok(after.chassis.y>.22&&after.chassis.y<.31);
    assert.ok(g.contacts.size>=2);assert.equal(g.chassis.getMass()+g.rider.getMass(),120);
});
test('lean shifts a physical mass and changes wheel loading and chassis angle',()=>{
    const back=fresh(),front=fresh();simulate(back,2,{lean:-1});simulate(front,2,{lean:1});
    assert.ok(back.rider.getPosition().x<back.chassis.getPosition().x-.3);
    assert.ok(front.rider.getPosition().x>front.chassis.getPosition().x+.15);
    assert.ok(back.chassis.getAngle()-front.chassis.getAngle()>.05);
    assert.equal(back.state,'running');assert.equal(front.state,'running');
});
test('brakes remove real momentum without snapping wheels onto a route',()=>{
    const g=fresh();simulate(g,3,{throttle:1});const speed=g.chassis.getLinearVelocity().x;
    assert.ok(speed>4);simulate(g,2,{brake:1});assert.ok(Math.abs(g.chassis.getLinearVelocity().x)<speed*.25);
    assert.ok(g.front.body.getPosition().y>=bike.wheelRadius-.02);
});
test('controlled riding clears the gap, lands, brakes and lifts through the final ascent',()=>{
    const g=fresh(course),memory={};let airborne=0,landings=0,braking=0,backLean=0;
    for(let i=0;i<3600&&g.state==='running';i++){
        const controls=witnessControls(g,memory);g.update(controls);
        if(controls.brake)braking++;if(controls.lean<0)backLean++;
        const x=g.chassis.getPosition().x;if(x>61&&x<64.6&&!g.grounded)airborne++;
        landings+=g.drainEvents().filter(e=>e.type==='land').length;
    }
    assert.equal(g.state,'finished');assert.equal(g.faults,0);assert.equal(g.checkpoint,4);
    assert.ok(airborne>10);assert.ok(landings>0);assert.ok(braking>20);assert.ok(backLean>10);
    assert.ok(g.elapsed>12&&g.elapsed<16);
    const reckless=fresh(course);simulate(reckless,20,{throttle:1,lean:.3});
    assert.equal(reckless.state,'crashed');assert.ok(reckless.pose().chassis.x>85);
});

test('failed jumps produce one fault per attempt, even across repeated updates',()=>{
    const g=fresh(course);for(let i=0;i<2400&&g.state==='running';i++)g.update({throttle:.55});
    assert.equal(g.state,'crashed');assert.equal(g.faults,1);const elapsed=g.elapsed;simulate(g,1);
    assert.equal(g.faults,1);assert.ok(g.elapsed>elapsed);
});
test('retry replaces contact/suspension state and preserves clock and fault rules',()=>{
    const g=fresh(course);simulate(g,6,{throttle:.8,lean:.3});const time=g.elapsed,checkpoint=g.checkpoint,oldWorld=g.world;
    assert.ok(checkpoint>=1);assert.equal(g.retry(),true);assert.notEqual(g.world,oldWorld);
    assert.equal(g.elapsed,time);assert.equal(g.checkpoint,checkpoint);assert.equal(g.faults,1);assert.equal(g.contacts.size,0);
    for(const body of [g.chassis,g.rider,g.rear.body,g.front.body,g.helmet]){assert.equal(body.getAngularVelocity(),0);assert.equal(body.getLinearVelocity().length(),0);}
    assert.equal(g.lean,0);assert.equal(g.accumulator,0);assert.equal(g.pendingFault,false);
    g.crash();assert.equal(g.faults,2);g.retry();assert.equal(g.faults,2);
    g.restart();assert.equal(g.elapsed,0);assert.equal(g.faults,0);assert.equal(g.checkpoint,0);
});
test('only sequential forward checkpoint crossings count; finish cannot be skipped',()=>{
    const g=fresh(course);
    const move=x=>{const delta=x-g.chassis.getPosition().x;for(const body of [g.chassis,g.rider,g.rear.body,g.front.body]){const p=body.getPosition();body.setPosition(Vec2(p.x+delta,p.y));}};
    move(51);g.previousX=49;g.update({});assert.equal(g.checkpoint,0);
    g.previousX=22;move(20);g.update({});assert.equal(g.checkpoint,0);
    g.previousX=20;move(21.1);g.update({});assert.equal(g.checkpoint,1);
    g.previousX=66;move(68);g.update({});assert.notEqual(g.state,'finished');
});
test('pause freezes pose and timer; stalls have bounded catch-up',()=>{
    const g=fresh();simulate(g,.5,{throttle:1});g.pause();const before=g.pose(),time=g.elapsed;
    g.advance(10,{throttle:1});g.update({throttle:1});assert.deepEqual(g.pose(),before);assert.equal(g.elapsed,time);
    g.resume();assert.ok(g.advance(100,{throttle:1})<=12);assert.ok(g.elapsed-time<=.101);
});
test('fixed simulation is repeatable across different rendering rates',()=>{
    const poses=[];
    for(const fps of [30,60,120]){const g=fresh();for(let i=0;i<fps*3;i++)g.advance(1/fps,{throttle:.6,lean:.2});poses.push(g.pose());}
    for(const pose of poses.slice(1))assert.ok(Math.abs(pose.chassis.x-poses[0].chassis.x)<.03);
});
test('air correction is bounded and helmet sensor uses the rendered torso contract',()=>{
    const g=fresh();g.chassis.setPosition(Vec2(2,10));g.rider.setPosition(Vec2(1.9,10.77));g.rear.body.setPosition(Vec2(1.33,10));g.front.body.setPosition(Vec2(2.67,10));
    simulate(g,.2,{lean:100});assert.ok(Math.abs(g.chassis.getAngularVelocity())<2);assert.ok(g.lean<=1);
    const p=g.pose(),head=localToWorld(riderTorso(p,bike).head,p.chassis);assert.ok(Math.hypot(g.helmet.getPosition().x-head.x,g.helmet.getPosition().y-head.y)<1e-9);
});
test('body and helmet contacts fault, but resting tyres do not',()=>{
    const g=fresh();simulate(g,2);assert.equal(g.faults,0);
    g.rider.setPosition(Vec2(g.chassis.getPosition().x,.01));g.update({});assert.equal(g.state,'crashed');
    const inverted=fresh();
    inverted.chassis.setTransform(Vec2(2,1.45),Math.PI);
    inverted.rider.setTransform(Vec2(2.1,1.45-bike.riderHeight),Math.PI);
    inverted.front.body.setPosition(Vec2(2-bike.frontAxle[0],1.45));
    inverted.rear.body.setPosition(Vec2(2-bike.rearAxle[0],1.45));
    inverted.update({});assert.equal(inverted.state,'crashed');assert.equal(inverted.reason,'helmet');
});
test('two-bone IK preserves exported limb lengths within the reachable envelope',()=>{
    for(const target of [[.4,-.1,.1],[.2,-.3,-.05],[.35,.2,.08]]){
        const start=[0,0,0],joint=solveLimb(start,target,.3,.27,-1);
        const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
        assert.ok(Math.abs(distance(start,joint)-.3)<1e-9);assert.ok(Math.abs(distance(joint,target)-.27)<1e-9);
    }
});
test('controller dead zone and analog triggers are normalised safely',()=>{
    assert.deepEqual(gamepadInput(null),{throttle:0,brake:0,lean:0});
    const buttons=Array.from({length:10},()=>({value:0}));buttons[7].value=.64;buttons[6].value=.3;
    assert.deepEqual(gamepadInput({buttons,axes:[.1]}),{throttle:.64,brake:.3,lean:0});
    assert.equal(gamepadInput({buttons,axes:[-1]}).lean,-1);
});
test('keyboard input avoids forms and clears on focus loss',()=>{
    const originalWindow=globalThis.window,originalDocument=globalThis.document;
    globalThis.window=new EventTarget();globalThis.document=new EventTarget();
    const commands=[],input=new TrialsInput(null,c=>commands.push(c));input.enabled=true;
    const key=(code,editable=false)=>{const e=new Event('keydown',{cancelable:true});Object.defineProperty(e,'code',{value:code});Object.defineProperty(e,'target',{value:{closest:()=>editable}});window.dispatchEvent(e);return e;};
    assert.equal(key('KeyW').defaultPrevented,true);assert.ok(input.keys.has('KeyW'));
    input.clear();assert.equal(key('KeyW',true).defaultPrevented,false);assert.equal(input.keys.size,0);
    key('KeyD');window.dispatchEvent(new Event('blur'));assert.equal(input.keys.size,0);assert.ok(commands.includes('blur'));
    input.enabled=false;key('KeyR');assert.ok(commands.includes('KeyR'),'Crash dialog must allow keyboard retry');
    key('KeyW');assert.equal(input.keys.size,0,'Paused movement cannot remain held');
    window.dispatchEvent(new Event('gamepaddisconnected'));assert.equal(input.blockPad,true);assert.ok(commands.includes('disconnect'));
    input.dispose();globalThis.window=originalWindow;globalThis.document=originalDocument;
});
test('records rank faults before time and survive blocked storage in memory',()=>{
    const records=new TrialsRecords({getItem(){throw new Error('Blocked');},setItem(){throw new Error('Blocked');}});
    records.record('course',{faults:2,time:20});records.record('course',{faults:1,time:30});records.record('course',{faults:3,time:10});
    assert.deepEqual(records.read('course'),{faults:1,time:30});assert.equal(records.available,false);
    records.record('course',{faults:1,time:25});assert.equal(records.read('course').time,25);
    for(let i=0;i<50;i++)records.record(`layout${i}`,{faults:0,time:12});assert.equal(records.entries.size,40);
    assert.equal(records.record('bad',{faults:-1,time:NaN}),false);
});
test('the headless CLI accepts structured inputs and rejects unbounded replays',()=>{
    const script=fileURLToPath(new URL('../../scripts/trials/headless.mjs',import.meta.url));
    const result=spawnSync(process.execPath,[script],{input:JSON.stringify({actions:[{seconds:15,throttle:.9,lean:.15}]}),encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).state,'crashed');
    const invalid=spawnSync(process.execPath,[script],{input:JSON.stringify({actions:[{seconds:10000}]}),encoding:'utf8'});
    assert.equal(invalid.status,1);assert.match(JSON.parse(invalid.stdout).error,/120 seconds/);
});
test('quarry steel beams have finite vertices, correct centres and real extents',()=>{
    for(const [start,end] of [[[1,0,-3],[1,4,-3]],[[0,2,-5],[8,2,-5]],[[0,0,0],[3,4,1]]]){
        const geometry=beamGeometry(start,end,.1);assert.ok(geometry.attributes.position.array.every(Number.isFinite));geometry.computeBoundingBox();
        for(const [i,axis] of ['x','y','z'].entries())assert.ok(Math.abs((geometry.boundingBox.min[axis]+geometry.boundingBox.max[axis])/2-(start[i]+end[i])/2)<1e-6);
        assert.ok(geometry.boundingBox.max.distanceTo(geometry.boundingBox.min)>3.9);geometry.dispose();
    }
    assert.throws(()=>beamGeometry([0,0,0],[0,0,0],.1),/positive length/);
});

test('throttle creates a wheelie only with rearward transfer; forward shift recovers it',()=>{
    const g=fresh();simulate(g,.45,{throttle:1,lean:-1});
    assert.equal(g.state,'running');assert.ok(g.front.body.getPosition().y-g.rear.body.getPosition().y>.2);
    simulate(g,1.5,{throttle:.35,lean:1});assert.equal(g.state,'running');assert.ok(Math.abs(g.chassis.getAngle())<.15);
    const neutral=fresh();simulate(neutral,3,{throttle:1});assert.equal(neutral.state,'running');assert.ok(neutral.wheelieTime<1.2);
});
test('undefined and invalid lean stay neutral, and retry removes torque and event transients',()=>{
    const g=fresh();g.update({lean:NaN});assert.equal(g.lean,0);g.update({});assert.equal(g.lean,0);
    simulate(g,1,{throttle:.6,lean:.3});g.events.push({type:'land'});g.retry();assert.equal(g.throttle,0);assert.equal(g.brake,0);assert.deepEqual(g.drainEvents(),[]);
});
test('jump framing contains takeoff, landing and rider in a desktop viewport',()=>{
    for(const x of [56,59,61,63,65]){
        const pose={x,y:2},f=cameraFrame(course,pose,8,16/9),target=new T.Vector3(f.x,f.y,0),camera=new T.PerspectiveCamera(32,16/9,.1,160);
        camera.position.copy(target).add(new T.Vector3(.7,2.2,f.distance));camera.lookAt(target);camera.updateMatrixWorld();
        for(const p of [[x,2],[61,1.65],[64.6,1.05]]){const projected=new T.Vector3(...p,0).project(camera);assert.ok(Math.abs(projected.x)<.98);assert.ok(Math.abs(projected.y)<.98);}
    }
});
test('medals and preferences are bounded and tolerate blocked storage',()=>{
    assert.equal(medal(course,{faults:0,time:20}),'gold');assert.equal(medal(course,{faults:1,time:20}),'silver');assert.equal(medal(course,{faults:9,time:20}),'finisher');
    const p=new Preferences({getItem:()=>'{"sound":"false","hints":false}',setItem:()=>{throw Error('blocked')}});assert.equal(p.sound,true);assert.equal(p.hints,false);p.save();
});

test('the shared torso stays within exported limb reach through wheelies, jumps and crashes',()=>{
    const rider=read('rider'),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
    for(const mode of ['witness','rear','front']){
        const g=fresh(course),memory={};
        for(let tick=0;tick<2400&&g.state==='running';tick++){
            g.update(mode==='witness'?witnessControls(g,memory):{throttle:1,lean:mode==='rear'?-1:1});
            const p=riderTorso(g.pose(),bike),j=rider.joints;
            for(const [start,target,upper,middle,end,limits,depth] of [['chest',bike.handlebar,'shoulder_L','elbow_L','hand_L',rider.elbowLimits,.1],['pelvis',bike.peg,'hip_L','knee_L','foot_L',rider.kneeLimits,.08]]){
                const a=distance(j[upper],j[middle]),b=distance(j[middle],j[end]),d=Math.hypot(p[start][0]-target[0],p[start][1]-target[1],depth);
                const max=Math.sqrt(a*a+b*b+2*a*b*Math.cos(limits[0])),min=Math.sqrt(a*a+b*b+2*a*b*Math.cos(limits[1]));
                assert.ok(d<=max+1e-8,`${mode}: ${start} overreach`);assert.ok(d>=min-1e-8,`${mode}: ${start} overflexion`);
            }
        }
    }
});
