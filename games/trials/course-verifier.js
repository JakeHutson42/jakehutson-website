import { TrialsGame, STEP, PHYSICS_VERSION, clamp } from './simulation/game.js';
import * as T from '../../lib/three/0.180.0/three.module.min.js';
import { cameraFrame } from './rendering/camera.js';
export const VERIFIER_VERSION='quarry-verifier-1';
export const DEFAULT_BUDGET={maxSteps:350000,maxEvaluations:110,maxMilliseconds:20000,maxActions:32,beamWidth:3};
export function budgetLimits(overrides={}) {
    const ranges={maxSteps:[1,500000],maxEvaluations:[1,200],maxMilliseconds:[1,30000],maxActions:[1,96],beamWidth:[1,4]};
    if(Object.keys(overrides).some(k=>!ranges[k]))throw Error('budget: unknown field');
    const result={...DEFAULT_BUDGET,...overrides};
    for(const [k,[a,b]]of Object.entries(ranges))if(!Number.isInteger(result[k])||result[k]<a||result[k]>b)throw Error(`budget.${k}: outside [${a},${b}]`);
    return result;
}
export function controlsFor(game,segment) {
    const speed=game.chassis.getLinearVelocity().x;
    const air=segment.air&& !game.grounded;
    return {throttle:segment.targetSpeed===undefined?segment.throttle:clamp((segment.targetSpeed-speed)*.45,0,1),
        brake:segment.targetSpeed===undefined?0:clamp((speed-segment.targetSpeed-1)*.3,0,.7),
        lean:air?clamp((game.chassis.getAngle()-.08)*2+game.chassis.getAngularVelocity()*.8,-.8,.8):segment.lean};
}
export function cameraCoverage(course) {
    const checks=[];
    for(const aspect of [16/9,4/3])for(const x of [56,59,61,63]){
        const pose={x,y:2},framing=cameraFrame(course,pose,9,aspect),target=new T.Vector3(framing.x,framing.y,0),camera=new T.PerspectiveCamera(32,aspect,.1,160);
        camera.position.copy(target).add(new T.Vector3(.7,2.2,framing.distance));camera.lookAt(target);camera.updateMatrixWorld();
        const projected=[[x,2],course.jump.takeoff,course.jump.landing].map(p=>new T.Vector3(...p,0).project(camera));
        checks.push({aspect,x,visible:projected.every(p=>Math.abs(p.x)<.98&&Math.abs(p.y)<.98),maxProjection:Math.max(...projected.flatMap(p=>[Math.abs(p.x),Math.abs(p.y)]))});
    }
    return {passed:checks.every(c=>c.visible),checks};
}
function fingerprint(g) {
    return {pose:g.pose(),velocities:Object.fromEntries(['chassis','rider','front','rear'].map(name=>{const b=g[name].body||g[name],v=b.getLinearVelocity();return [name,{x:v.x,y:v.y,angular:b.getAngularVelocity()}];})),
        suspension:[g.front.joint.getJointTranslation(),g.rear.joint.getJointTranslation()],contacts:g.contacts.size,checkpoint:g.checkpoint};
}
export function verifyCourse(bike,course,overrides={}) {
    const requiredRate=course.difficulty==='beginner'?1:.8;
    const budget=budgetLimits(overrides),started=performance.now(),usage={steps:0,evaluations:0},failures=[];
    const sightlines=cameraCoverage(course);
    if(!sightlines.passed)return {version:VERIFIER_VERSION,physics:PHYSICS_VERSION,status:'not-validated',reason:'camera-sightline',usage,budget,sightlines};
    const exhausted=()=>usage.steps>=budget.maxSteps||usage.evaluations>=budget.maxEvaluations||performance.now()-started>budget.maxMilliseconds;
    function run(segments, replay=null,perturb={}) {
        if(exhausted())throw Error('budget-exhausted');
        if(segments.length>budget.maxActions)throw Error('action-budget');
        usage.evaluations++;
        const g=new TrialsGame(bike,course);g.start();
        if(perturb.initialSpeed)for(const name of ['chassis','rider','front','rear']){const body=g[name].body||g[name];body.setLinearVelocity({x:perturb.initialSpeed,y:0});}
        const inputs=[],samples=[],entries=[],seen=new Set();let segmentIndex=0;
        while(g.state==='running'&&g.ticks<3600){
            if(usage.steps>=budget.maxSteps||performance.now()-started>budget.maxMilliseconds)throw Error('budget-exhausted');
            let input;
            if(replay){const index=Math.floor(g.ticks/(perturb.timing||1));input=replay[Math.min(index,replay.length-1)];input={throttle:clamp(input.throttle+(perturb.throttle||0),0,1),brake:input.brake,lean:clamp(input.lean+(perturb.lean||0),-1,1)};}
            else {
                while(segmentIndex<segments.length&&g.chassis.getPosition().x>=segments[segmentIndex].untilX)segmentIndex++;
                if(segmentIndex===segments.length)break;
                input=controlsFor(g,segments[segmentIndex]);
            }
            const x=g.chassis.getPosition().x;
            for(const m of course.modules||[])if(x>=m.entry.x&&!seen.has(m.id)){
                seen.add(m.id);const speed=g.chassis.getLinearVelocity().x,angle=g.chassis.getAngle();
                entries.push({id:m.id,time:g.elapsed,speed,angle,inEnvelope:speed>=m.speedEnvelope[0]-.01&&speed<=m.speedEnvelope[1]&&angle>=m.angleEnvelope[0]&&angle<=m.angleEnvelope[1],state:fingerprint(g)});
            }
            inputs.push(input);g.update(input);g.drainEvents();usage.steps++;
            if(g.ticks%12===0)samples.push({time:g.elapsed,...g.pose().chassis,checkpoint:g.checkpoint,grounded:!!g.grounded});
        }
        return {state:g.state,reason:g.reason,x:g.chassis.getPosition().x,time:g.elapsed,checkpoint:g.checkpoint,inputs,samples,entries,exit:fingerprint(g)};
    }
    const makePlan=(speed=8.5,lift=83,lean=course.difficulty==='beginner'?0:-.3,recover=89)=>[
        {untilX:60,targetSpeed:speed,lean:.3},{untilX:72,targetSpeed:speed,lean:.3,air:true},
        {untilX:lift,targetSpeed:3.5,lean:.3},{untilX:recover,throttle:1,lean},
        {untilX:course.finish+.1,throttle:1,lean:1}];
    let winner=null,plan=null,retained=[];
    try {
        const baseline=makePlan();let attempt=run(baseline);
        if(attempt.state==='finished'&&attempt.entries.every(e=>e.inEnvelope)){winner=attempt;plan=baseline;}
        else {
            failures.push({stage:'curated-witness',state:attempt.state,x:attempt.x,reason:attempt.reason||'entry-envelope'});
            let beam=[{segments:[],result:null}];
            // Each branch replays its prefix from the start. The full world, including
            // contacts and warm-started joints, continues across every module seam.
            // No pose-only restoration or reset at a module boundary is used.
            for(let stage=0;stage<5;stage++){
                const expanded=[];
                for(const node of beam){
                    const variants=stage===0?[7.8,8.5,9.1].map(s=>makePlan(s)[stage]):stage===1?[8,8.5,9].map(s=>makePlan(s)[stage]):stage===2?[82.5,83,84.5].map(x=>makePlan(8.5,x)[stage]):stage===3?[-.4,-.2,0,.2].map(l=>makePlan(8.5,83,l)[stage]):[makePlan()[stage]];
                    for(const segment of variants){
                        const segments=[...node.segments,segment],result=run(segments);
                        if(result.state!=='crashed'&&result.entries.every(e=>e.inEnvelope)&&result.x>=segment.untilX-.1)expanded.push({segments,result});
                        else failures.push({stage,state:result.state,x:result.x,reason:result.reason||'entry-envelope-or-no-progress'});
                    }
                }
                beam=expanded.sort((a,b)=>a.result.time-b.result.time).slice(0,budget.beamWidth);
                retained.push({stage,nodes:beam.map(n=>({segments:n.segments,state:n.result.exit}))});
                if(!beam.length)break;
            }
            const success=beam.find(n=>n.result?.state==='finished');if(success){winner=success.result;plan=success.segments;}
        }
        if(!winner)return {version:VERIFIER_VERSION,physics:PHYSICS_VERSION,status:'not-validated',reason:'bounded-search-found-no-witness',usage,budget,failures,retained};
        const cases=[{name:'baseline'},{name:'timing-early',timing:.99},{name:'timing-late',timing:1.01},{name:'throttle-low',throttle:-.01},{name:'throttle-high',throttle:.01},{name:'lean-back',lean:-.015},{name:'lean-forward',lean:.015},{name:'speed-low',initialSpeed:-.1},{name:'speed-high',initialSpeed:.1}];
        const perturb=(w)=>cases.map(c=>{const r=run([],w.inputs,c);return {...c,success:r.state==='finished'&&r.entries.every(e=>e.inEnvelope),state:r.state,reason:r.reason,time:r.time,x:r.x,entries:r.entries.map(({state,...e})=>e)};});
        let trials=perturb(winner),successes=trials.filter(t=>t.success).length,rate=successes/trials.length;
        if(rate<requiredRate){
            for(const lift of [82.5,84.5,83]){
                for(const lean of [-.2,-.4,0]){
                    const alternative=makePlan(8.5,lift,lean),result=run(alternative);
                    retained.push({stage:'robustness-search',nodes:[{segments:alternative,state:result.exit}]});
                    if(result.state!=='finished'||!result.entries.every(e=>e.inEnvelope))continue;
                    const candidateTrials=perturb(result),candidateRate=candidateTrials.filter(t=>t.success).length/candidateTrials.length;
                    if(candidateRate>rate){winner=result;plan=alternative;trials=candidateTrials;rate=candidateRate;successes=trials.filter(t=>t.success).length;}
                    if(rate>=requiredRate)break;
                }
                if(rate>=requiredRate)break;
            }
        }
        return {version:VERIFIER_VERSION,physics:PHYSICS_VERSION,status:rate>=requiredRate?'validated-for-review':'not-validated',reason:rate>=requiredRate?null:'perturbation-success-below-required-rate',usage,budget,sightlines,requiredSuccessRate:requiredRate,successRate:rate,successes,trials:trials.length,perturbations:trials,
            testedApproachEnvelopes:(course.modules||[]).map(m=>{const es=trials.filter(t=>t.success).flatMap(t=>t.entries.filter(e=>e.id===m.id));return {id:m.id,samples:es.length,speed:es.length?[Math.min(...es.map(e=>e.speed)),Math.max(...es.map(e=>e.speed))]:null,angle:es.length?[Math.min(...es.map(e=>e.angle)),Math.max(...es.map(e=>e.angle))]:null};}),
            moduleChecks:winner.entries.map((e,i)=>({id:e.id,traversed:!!winner.entries[i+1]||winner.state==='finished',entry:e.state,exit:winner.entries[i+1]?.state||winner.exit})),
            witness:{segments:plan,inputs:winner.inputs,samples:winner.samples,time:winner.time,entries:winner.entries},failures,retained};
    }catch(error){if(!['budget-exhausted','action-budget'].includes(error.message))throw error;return {version:VERIFIER_VERSION,physics:PHYSICS_VERSION,status:'not-validated',reason:error.message,usage,budget,failures,retained};}
}
