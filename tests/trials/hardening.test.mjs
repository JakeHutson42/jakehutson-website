import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../lib/three/0.180.0/three.module.min.js';
import { TouchChannels, TouchControls } from '../../games/trials/touch.js';
import { TrialsInput } from '../../games/trials/input.js';
import { cameraFrame } from '../../games/trials/rendering/camera.js';
import { resolveQuality } from '../../games/trials/quality.js';
import { GraphicsRecovery } from '../../games/trials/recovery.js';
import { resourceBytes } from '../../games/trials/resources.js';
import { loadContent, validateAssetManifest, FALLBACK_CONTENT } from '../../games/trials/rendering/assets.js';
import { TrialsWorld } from '../../games/trials/rendering/world.js';
import { BiomeCache } from '../../games/trials/biomes.js';
import { disposeTree } from '../../games/trials/rendering/dispose.js';
import { TrialsGame, PHYSICS_VERSION } from '../../games/trials/simulation/game.js';
import { recordIdentity } from '../../games/trials/record-identity.js';
import { Preferences } from '../../games/trials/experience.js';
import { TrialsRecords } from '../../games/trials/storage.js';
import { touchSequence } from '../../games/trials/qa-hardening.js';
const read = path => JSON.parse(fs.readFileSync(new URL('../../' + path, import.meta.url)));
const bike = read('games/trials/content/bike.json'), quarry = read('games/trials/content/course.json');
const forest = read('scripts/trials/curation/forestry/nursery/course.json');
const rect = {left:0,top:0,width:100,height:100};
const zero = {throttle:0,brake:0,lean:0};
function event(type, properties={}) { const e=new Event(type,{cancelable:true});for(const [key,value] of Object.entries(properties))Object.defineProperty(e,key,{value});return e; }
class Slider extends EventTarget {
    constructor(channel){super();this.dataset={channel};this.style={setProperty(){}};this.captures=new Set();this.attributes={};}
    getBoundingClientRect(){return rect;}
    setPointerCapture(id){this.captures.add(id);}
    hasPointerCapture(id){return this.captures.has(id);}
    releasePointerCapture(id){this.captures.delete(id);this.dispatchEvent(event('lostpointercapture',{pointerId:id}));}
    setAttribute(k,v){this.attributes[k]=v;}
}
test('three touch channels own independent pointers, clamp outside bounds and cancel to neutral',()=>{
    const c=new TouchChannels();assert.equal(c.begin('throttle',1,50,25,rect),true);c.begin('lean',2,100,50,rect);c.begin('brake',3,50,60,rect);
    assert.deepEqual(c.values,{throttle:.75,brake:.4,lean:1});assert.equal(c.begin('lean',4,0,0,rect),false);assert.equal(c.begin('brake',1,0,0,rect),false);
    c.move(2,-50,50,rect);assert.equal(c.values.lean,-1);c.end(1);assert.equal(c.values.throttle,0);assert.equal(c.values.brake,.4);c.clear();assert.deepEqual(c.values,zero);assert.equal(c.move(2,0,0,rect),false);
    assert.equal(c.begin('lean',9,NaN,0,rect),false);assert.equal(c.begin('lean',9,0,0,{...rect,width:0}),false);
});
test('DOM touch adapter captures separate pointers, handles lost capture and releases every capture on reset',()=>{
    const elements=['lean','throttle','brake'].map(c=>new Slider(c)),root={querySelectorAll:()=>elements,dataset:{}},input={enabled:true};let gestures=0;
    const touch=new TouchControls(root,input,()=>gestures++);
    elements[0].dispatchEvent(event('pointerdown',{pointerId:1,pointerType:'touch',clientX:100,clientY:50}));elements[1].dispatchEvent(event('pointerdown',{pointerId:2,pointerType:'touch',clientX:50,clientY:0}));
    assert.equal(gestures,2);assert.equal(elements[0].hasPointerCapture(1),true);assert.equal(touch.read().throttle,1);
    elements[0].dispatchEvent(event('pointercancel',{pointerId:1}));assert.equal(touch.read().lean,0);assert.equal(touch.read().throttle,1);
    touch.clear();assert.equal(elements[1].captures.size,0);assert.deepEqual(touch.read(),zero);
    elements[2].dispatchEvent(event('keydown',{code:'ArrowUp'}));assert.equal(touch.read().brake,.1);elements[2].dispatchEvent(event('keyup',{code:'ArrowUp'}));assert.equal(touch.read().brake,0);
    input.enabled=false;elements[1].dispatchEvent(event('pointerdown',{pointerId:3,pointerType:'touch',clientX:50,clientY:0}));assert.deepEqual(touch.read(),zero);touch.dispose();
});
test('touch coexists with controller/keyboard, blocks UI commands and clears on every interruption',()=>{
    const win=globalThis.window,doc=globalThis.document,nav=Object.getOwnPropertyDescriptor(globalThis,'navigator');
    globalThis.window=new EventTarget();globalThis.document=new EventTarget();
    const buttons=Array.from({length:10},()=>({value:0,pressed:false})),pad={connected:true,mapping:'standard',index:0,axes:[0],buttons};
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[pad]}});
    try {
        const commands=[],input=new TrialsInput(null,c=>commands.push(c)),channels=new TouchChannels();input.touch={read:()=>({...channels.values}),clear:()=>channels.clear()};input.enabled=true;input.read();
        channels.begin('throttle',1,50,40,rect);channels.begin('lean',2,100,50,rect);buttons[6].value=.3;assert.deepEqual(input.read(),{throttle:.6,brake:.3,lean:1});
        for(const type of ['blur','resize','orientationchange','gamepaddisconnected']){channels.begin('throttle',5,50,0,rect);window.dispatchEvent(new Event(type));assert.deepEqual(channels.values,zero);assert.equal(input.blockPad,true);}
        channels.begin('brake',7,50,0,rect);input.enabled=false;assert.deepEqual(channels.values,zero);
        window.dispatchEvent(event('keydown',{code:'Backspace',target:{closest:selector=>selector.includes('button')}}));assert.equal(commands.includes('Backspace'),false);
        window.dispatchEvent(event('keydown',{code:'KeyW',target:{closest:selector=>selector.includes('slider')}}));assert.equal(input.keys.size,0);
        buttons[0].pressed=true;input.blockPad=false;input.read();assert.equal(commands.includes('KeyR'),false);window.dispatchEvent(event('keydown',{code:'KeyR',target:{closest:selector=>selector==='dialog'?{dataset:{kind:'crash'}}:selector==='button,a,dialog'}}));assert.equal(commands.includes('KeyR'),true,'Crash dialog retains the explicit retry shortcut');input.dispose();
    } finally {globalThis.window=win;globalThis.document=doc;if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator;}
});
test('touch QA uses exact production simulation and remains deterministic under frame interpolation',()=>{
    const run=rate=>{const channels=new TouchChannels(),g=new TrialsGame(bike,quarry);g.start();for(let i=0;i<rate*2.1&&g.state==='running';i++)g.advance(1/rate,()=>{touchSequence(g.ticks,channels);return {...channels.values};});return {pose:g.pose(),ticks:g.ticks,values:channels.values};};
    const a=run(30),b=run(120);assert.deepEqual(a.values,zero);assert.deepEqual(b.values,zero);assert.ok(Math.abs(a.pose.chassis.x-b.pose.chassis.x)<.1);assert.ok(a.pose.chassis.x>2);
});
test('context interruption freezes production state, clears input, rejects failed/stale restoration',async()=>{
    const canvas=new EventTarget(),g=new TrialsGame(bike,quarry),channels=new TouchChannels();g.start();g.advance(.1,{throttle:1});channels.begin('throttle',1,0,0,rect);
    const before=g.pose(),clock=g.elapsed,states=[];let rebuilds=0;
    const recovery=new GraphicsRecovery(canvas,{stop(){g.pause();channels.clear();},rebuild(){rebuilds++;},status:s=>states.push(s)});
    const loss=event('webglcontextlost');canvas.dispatchEvent(loss);assert.equal(loss.defaultPrevented,true);g.advance(.1,{throttle:1});assert.deepEqual(g.pose(),before);assert.equal(g.elapsed,clock);assert.deepEqual(channels.values,zero);
    canvas.dispatchEvent(new Event('webglcontextrestored'));await Promise.resolve();await Promise.resolve();assert.equal(recovery.state,'ready');assert.equal(g.state,'paused');assert.equal(rebuilds,1);recovery.dispose();
    const failed=new GraphicsRecovery(canvas,{stop(){},rebuild(){throw Error('driver');},status(){}});canvas.dispatchEvent(loss);await failed.restore();assert.equal(failed.state,'error');assert.equal(failed.blocked,true);failed.dispose();
    let finish;const late=new GraphicsRecovery(canvas,{stop(){},rebuild:()=>new Promise(r=>finish=r),status(){}});canvas.dispatchEvent(loss);const pending=late.restore();canvas.dispatchEvent(loss);finish();await pending;assert.equal(late.state,'lost');late.dispose();
});
test('whole-body deadlines, size limits and corrupt manifests fail closed',async()=>{
    let signal;await assert.rejects(resourceBytes(new URL('http://localhost/hang'),{timeoutMs:10,fetcher:async(_,options)=>{signal=options.signal;return {ok:true,arrayBuffer:()=>new Promise(()=>{})};}}),/timed out/);assert.equal(signal.aborted,true);
    await assert.rejects(resourceBytes(new URL('http://localhost/big'),{maxBytes:4,fetcher:async()=>new Response(new Uint8Array(8))}),/byte limit/);
    const manifest=read('games/trials/content/manifest.json');await validateAssetManifest(manifest,FALLBACK_CONTENT);
    await assert.rejects(validateAssetManifest({...manifest,files:{...manifest.files,'bike.json':'0'.repeat(64)}},FALLBACK_CONTENT),/identity/);
    await assert.rejects(validateAssetManifest({...manifest,contentId:'0'.repeat(64)},FALLBACK_CONTENT),/Stale/);
});
test('missing pointer uses only the immutable known-good asset fallback, fetched bytes still verify',async()=>{
    let reads=0;const fetcher=async url=>{reads++;const path=new URL(url).pathname;const local=path.replace(/^.*\/games\/trials\//,'games/trials/');if(path.endsWith('/content/current.json'))return new Response('{"release":"../bad"}');return new Response(fs.readFileSync(new URL('../../'+local,import.meta.url)));};
    const content=await loadContent({fetcher});assert.equal(content.fallback,true);assert.equal(content.manifest.contentId,FALLBACK_CONTENT);assert.equal(content.course.contentHash,quarry.contentHash);assert.ok(reads<12);disposeTree(content.bike);disposeTree(content.rider);
});
test('quality tiers preserve shared riding geometry and reduce decorative triangle cost without growth',async()=>{
    for(const course of [quarry,forest])for(const aspect of [.75,1.3,1.95,3.2])for(const x of [55,58,60,62]){const frame=cameraFrame(course,{x,y:1},8,aspect),halfWidth=Math.tan(16*Math.PI/180)*frame.distance*aspect;for(const endpoint of [course.jump.takeoff,course.jump.landing])assert.ok(Math.abs(endpoint[0]-frame.x)<halfWidth*.95,'Takeoff and landing remain in the responsive frustum');}
    assert.equal(resolveQuality('auto',{coarse:true,dpr:3}).name,'low');assert.equal(resolveQuality('high',{dpr:4}).pixelRatio,1.5);assert.equal(resolveQuality('low',{dpr:2}).shadow,0);
    const base=new URL('../../scripts/trials/curation/forestry/',import.meta.url),cache=new BiomeCache({biomes:{forestry:{spec:'biome.json',kit:'kit.glb',ambience:'ambience.wav'}}},async p=>{const b=fs.readFileSync(new URL(p,base));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);},base),pack=await cache.load('forestry');
    const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})};
    try {
        const world=Object.create(TrialsWorld.prototype);Object.assign(world,{scene:new T.Scene(),environment:new T.Group(),materials:[],textures:[],course:quarry});world.scene.add(world.environment);
        const costs={};for(const c of [quarry,forest])for(let repeat=0;repeat<3;repeat++)for(const tier of ['high','balanced','low']){world.quality=resolveQuality(tier);world.setCourse(c,c===forest?pack:null);assert.equal(world.course,c);let triangles=0;world.environment.traverse(o=>{if(o.geometry)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});const key=c.biome||'quarry';costs[key]??={};if(costs[key][tier])assert.equal(costs[key][tier],triangles);costs[key][tier]=triangles;assert.equal(world.scene.children.length,1);assert.equal(recordIdentity(PHYSICS_VERSION,c,bike),recordIdentity(PHYSICS_VERSION,world.course,bike));}
        for(const tiers of Object.values(costs)){assert.ok(tiers.low<tiers.balanced);assert.ok(tiers.balanced<tiers.high);}disposeTree(world.environment);
    } finally {globalThis.document=previous;cache.dispose();}
});
test('preference and record storage tolerate oversized data, invalid settings and write-only failure',()=>{
    const bad=new Preferences({getItem:()=>JSON.stringify({quality:'ultra',touch:5,handedness:'unknown'}),setItem(){throw Error('quota');}});assert.equal(bad.quality,'auto');assert.equal(bad.touch,'auto');bad.quality='low';bad.save();assert.equal(bad.quality,'low');
    assert.equal(new Preferences({getItem:()=> 'x'.repeat(5000)}).quality,'auto');const records=new TrialsRecords({getItem:()=>JSON.stringify({version:1,entries:[]}),setItem(){throw Error('quota');}});records.record('run',{time:10,faults:0});assert.equal(records.available,false);assert.equal(records.read('run').time,10);assert.equal(records.record('x'.repeat(500),{time:10,faults:0}),false);
});
