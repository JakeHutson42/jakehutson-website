import test from 'node:test';
import assert from 'node:assert/strict';
import { MotorcycleAudio } from '../../games/trials/audio.js';

test('audio stays locked until requested, then pause silences it without another frame',async()=>{
    const original=globalThis.AudioContext;
    let resumes=0,stopped=0,closed=false;
    class Context {
        currentTime=1;
        destination={};
        createGain(){return {gain:{value:0,targets:[],cancelScheduledValues(){},setTargetAtTime(value){this.targets.push(value);}},connect(){},disconnect(){}};}
        createDynamicsCompressor(){return {connect(){}};}
        createBufferSource(){return {playbackRate:{setTargetAtTime(){}},connect(){},disconnect(){},start(){},stop(){stopped++;}};}
        async resume(){resumes++;}
        async decodeAudioData(){return {};}
        close(){closed=true;}
    }
    globalThis.AudioContext=Context;
    try {
        const content={manifest:{sounds:Object.fromEntries(['idle','load','gravel','land','checkpoint','finish'].map(n=>[n,n+'.wav']))},async checked(){assert.ok(resumes>0,'Resume must happen before asynchronous loading');return new ArrayBuffer(1);}};
        const audio=new MotorcycleAudio(content);
        assert.equal(resumes,0);assert.equal(audio.context,undefined);
        await audio.unlock();assert.equal(audio.ready,true);assert.equal(Object.keys(audio.loops).length,3);
        const game={state:'running',feedback:()=>({throttle:.8,speed:6,slip:.2,grounded:true,rpm:3600})};
        audio.update(game,[]);assert.equal(audio.master.gain.targets.at(-1),.28);
        audio.silence();assert.equal(audio.master.gain.targets.at(-1),0,'Blur can silence audio while RAF is stopped');
        audio.muted=true;audio.update(game,[]);assert.equal(audio.master.gain.targets.at(-1),0);
        await audio.unlock();assert.equal(Object.keys(audio.loops).length,3,'Repeated gestures must reuse the graph');
        audio.muted=false;audio.update(game,Array.from({length:20},()=>({type:'land',strength:.5})));assert.equal(audio.voices.size,8,'Overlapping effects must be bounded');audio.finishUntil=10;audio.reset();assert.equal(audio.voices.size,0);assert.equal(audio.finishUntil,0);assert.equal(stopped,8);assert.equal(audio.master.gain.targets.at(-1),0,'Course change must silence and stop effects');
        audio.dispose();assert.equal(stopped,11);assert.equal(closed,true);
    } finally {globalThis.AudioContext=original;}
});

test('unavailable audio reports a recoverable error',async()=>{
    const original=globalThis.AudioContext,webkit=globalThis.webkitAudioContext;
    delete globalThis.AudioContext;delete globalThis.webkitAudioContext;
    try {const audio=new MotorcycleAudio({});await audio.unlock();assert.match(audio.error,/unavailable/);assert.equal(audio.ready,false);audio.silence();audio.dispose();}
    finally {globalThis.AudioContext=original;globalThis.webkitAudioContext=webkit;}
});
