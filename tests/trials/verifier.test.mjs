import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyCourse,budgetLimits,controlsFor } from '../../games/trials/course-verifier.js';
import { TrialsGame,STEP } from '../../games/trials/simulation/game.js';
import { recordIdentity } from '../../games/trials/record-identity.js';
const bike=JSON.parse(readFileSync(new URL('../../games/trials/content/bike.json',import.meta.url)));
const course=JSON.parse(readFileSync(new URL('../../games/trials/content/course.json',import.meta.url)));

test('bounded verifier rejects invalid budgets and terminates at a work limit',()=>{
    assert.throws(()=>budgetLimits({maxSteps:Infinity}),/budget/);
    assert.throws(()=>budgetLimits({beamWidth:5}),/budget/);
    assert.throws(()=>budgetLimits({unbounded:true}),/unknown/);
    const result=verifyCourse(bike,course,{maxSteps:12});
    assert.equal(result.status,'not-validated');assert.equal(result.reason,'budget-exhausted');assert.equal(result.usage.steps,12);
});
test('action budget and impossible gaps produce rejection, never impossibility claims',()=>{
    const result=verifyCourse(bike,course,{maxActions:1});assert.equal(result.reason,'action-budget');
    const broken=structuredClone(course);broken.paths[1][0][0]=90;
    const failure=verifyCourse(bike,broken,{maxSteps:12000,maxEvaluations:2});
    assert.equal(failure.status,'not-validated');assert.ok(!JSON.stringify(failure).includes('proven-impossible'));
});
test('per-tick replay input keeps the same continuous production state at rendering rates',()=>{
    const results=[];
    for(const fps of [30,60,120]){
        const g=new TrialsGame(bike,course);g.start();
        const control=game=>({throttle:game.ticks<120?.7:.5,lean:game.ticks<120?.2:.4});
        for(let i=0;i<fps*2;i++)g.advance(1/fps,control);
        results.push({ticks:g.ticks,pose:g.pose(),contacts:g.contacts.size});
    }
    assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
});
test('new handling is materially faster and retains controllable lift and neutral defaults',()=>{
    const flat={...course,paths:[[[-50,0],[200,0]]],checkpoints:[{x:2,y:.42}],finish:180,finishY:0};
    const g=new TrialsGame(bike,flat);g.start();for(let i=0;i<120;i++)g.update({throttle:1});
    assert.ok(g.chassis.getLinearVelocity().x>6.2,'Previous measured one-second neutral speed was 4.926 m/s');
    assert.equal(g.lean,0);assert.equal(g.state,'running');
    for(let i=0;i<240;i++)g.update({throttle:1});assert.equal(g.state,'running');
    g.retry();assert.equal(g.throttle,0);assert.equal(g.lean,0);
});
test('course/physics identities isolate records and camera failures reject a candidate',()=>{
    assert.notEqual(recordIdentity('qt-physics-2',course,bike),recordIdentity('qt-physics-3',course,bike));
    assert.notEqual(recordIdentity('qt-physics-3',course,bike),recordIdentity('qt-physics-3',{...course,contentHash:'candidate'},bike));
    const hidden=structuredClone(course);hidden.jump.landing[0]=100;
    const result=verifyCourse(bike,hidden);assert.equal(result.reason,'camera-sightline');assert.equal(result.usage.steps,0);
});
