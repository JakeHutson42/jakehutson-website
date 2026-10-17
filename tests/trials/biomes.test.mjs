import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../lib/three/0.180.0/three.module.min.js';
import { BiomeCache,validateBiomeReferences,validateBiomeSpec } from '../../games/trials/biomes.js';
import { TrialsWorld } from '../../games/trials/rendering/world.js';
import { disposeTree } from '../../games/trials/rendering/dispose.js';
import { MotorcycleAudio } from '../../games/trials/audio.js';
import { TrialsGame,PHYSICS_VERSION } from '../../games/trials/simulation/game.js';
import { chooseChallenge,courseProgress,validateCourseEntry } from '../../games/trials/catalog.js';
import { TrialsRecords } from '../../games/trials/storage.js';
import { recordIdentity } from '../../games/trials/record-identity.js';
const base=new URL('../../scripts/trials/curation/forestry/',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,base),'utf8'));
const data=p=>{const b=fs.readFileSync(new URL(p,base));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
const ref={id:'forestry',name:'Alpine Forestry',spec:'biome.json',kit:'kit.glb',ambience:'ambience.wav'},catalog={biomes:{forestry:ref}};
const spec=read('biome.json'),bike=JSON.parse(fs.readFileSync(new URL('../../games/trials/content/bike.json',import.meta.url))),quarry=JSON.parse(fs.readFileSync(new URL('../../games/trials/content/course.json',import.meta.url)));

test('biome cache shares one actual GLB load and releases owned templates',async()=>{
    let reads=0;const cache=new BiomeCache(catalog,async p=>{reads++;return data(p);},base),[a,b]=await Promise.all([cache.load('forestry'),cache.load('forestry')]);assert.equal(a,b);assert.equal(reads,3);assert.equal(cache.entries.size,1);assert.equal(await cache.load('quarry'),null);for(const name of spec.prototypes)assert.ok(a.kit.getObjectByName(name));
    let disposed=0;a.kit.traverse(o=>o.geometry?.addEventListener('dispose',()=>disposed++));cache.dispose();await Promise.resolve();assert.ok(disposed>0);await assert.rejects(cache.load('forestry'),/disposed/);
});

test('failed/stale biome resources reject and allow a clean retry',async()=>{
    let broken=true;const cache=new BiomeCache(catalog,async p=>{if(broken&&p==='kit.glb')throw Error('checksum mismatch');return data(p);},base);await assert.rejects(cache.load('forestry'),/checksum/);assert.equal(cache.entries.size,0);broken=false;assert.equal((await cache.load('forestry')).id,'forestry');cache.dispose();
    assert.throws(()=>validateBiomeReferences({forestry:ref},{}),/hashed/);assert.throws(()=>validateBiomeSpec({...spec,lighting:{...spec.lighting,fogFar:NaN}}),/lighting/);
    const c=read('nursery/course.json'),entry={contentHash:c.contentHash,name:c.name,biome:'forestry',medals:c.medals};c.biomeProps[0].position[2]=0;assert.throws(()=>validateCourseEntry(c,entry),/clearance/);
});

test('quarry/forest scene changes dispose clones, preserve templates and keep allocations stable',async()=>{
    const cache=new BiomeCache(catalog,async p=>data(p),base),pack=await cache.load('forestry'),previous=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({},{get:()=>()=>{}})})};
    const world=Object.create(TrialsWorld.prototype);Object.assign(world,{scene:new T.Scene(),environment:new T.Group(),materials:[],textures:[],course:quarry});const sharedBike=new T.Group();world.scene.add(sharedBike,world.environment);const geometryCounts={quarry:[],forestry:[]};let templateDisposals=0;pack.kit.traverse(o=>o.geometry?.addEventListener('dispose',()=>templateDisposals++));
    try{for(let i=0;i<24;i++){let instances=0,released=0;world.environment.traverse(o=>{if(o.isInstancedMesh){instances++;o.addEventListener('dispose',()=>released++);}});const forest=i%2===0,c=forest?read('nursery/course.json'):quarry;world.setCourse(c,forest?pack:null);assert.equal(released,instances,'Instancing buffers must be released too');assert.equal(world.scene.children.length,2);assert.equal(sharedBike.parent,world.scene);let geometries=0;world.environment.traverse(o=>{if(o.geometry){geometries++;assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));}if(o.isInstancedMesh)assert.ok(o.instanceMatrix.array.every(Number.isFinite));});geometryCounts[forest?'forestry':'quarry'].push(geometries);assert.equal(templateDisposals,0);}
        for(const counts of Object.values(geometryCounts))assert.equal(new Set(counts).size,1);
    }finally{disposeTree(world.scene);globalThis.document=previous;cache.dispose();}
});

test('biome ambience is gesture-ready, cached, stopped on switch and immune to late decode',async()=>{
    let decoded=0,stopped=0;const gain=()=>({gain:{value:0,targets:[],cancelScheduledValues(){},setTargetAtTime(v){this.targets.push(v);}},connect(){},disconnect(){}});
    const context={currentTime:0,createGain:gain,createBufferSource:()=>({connect(){},disconnect(){},start(){},stop(){stopped++;}}),async decodeAudioData(){decoded++;return {};},close(){}};
    const audio=new MotorcycleAudio({});audio.context=context;audio.master=gain();audio.ready=true;const pack={id:'forestry',ambience:new ArrayBuffer(10)};
    await audio.setBiome(pack);assert.ok(audio.ambient);await audio.setBiome(null);assert.equal(stopped,1);await audio.setBiome(pack);assert.equal(decoded,1);audio.update({state:'paused',feedback:()=>({throttle:0,speed:0,grounded:true,rpm:0})},[]);assert.equal(audio.ambient.gain.gain.targets.at(-1),0);audio.dispose();assert.equal(stopped,2);assert.equal(audio.ambientBuffers.size,0);
    let resolve;const late=new MotorcycleAudio({});late.context={...context,decodeAudioData:()=>new Promise(r=>resolve=r)};late.master=gain();late.ready=true;const loading=late.setBiome(pack);await late.setBiome(null);resolve({});await loading;assert.equal(late.ambient,undefined);assert.equal(late.ambientBuffers.size,0);
});

test('biome progression/records isolate routes and challenges never choose unapproved forests',()=>{
    const forest=read('nursery/course.json'),courses=[{...quarry,biome:'quarry',approval:'approved',kind:'generated'},{...forest,biome:'forestry',approval:'pending',kind:'generated'}],records=new TrialsRecords(null);records.record(recordIdentity(PHYSICS_VERSION,forest,bike),{time:20,faults:0});const progress=courseProgress({courses},records,bike,PHYSICS_VERSION);assert.equal(progress[0].best,null);assert.equal(progress[1].best.time,20);assert.equal(chooseChallenge({courses},forest.id),null);assert.equal(chooseChallenge({courses},quarry.id,()=>0,'forestry'),null);courses[1].approval='approved';assert.equal(chooseChallenge({courses},quarry.id,()=>0,'forestry').id,forest.id);assert.notEqual(recordIdentity(PHYSICS_VERSION,forest,bike),recordIdentity(PHYSICS_VERSION,quarry,bike));
});

test('all frozen forestry witnesses replay through exact production physics',()=>{
    for(const id of ['nursery','sawyer','ridge']){const c=read(id+'/course.json'),inputs=read(id+'/replay.json'),report=read(id+'/report.json'),g=new TrialsGame(bike,c);g.start();for(let tick=0;tick<3600&&g.state==='running';tick++)g.update(inputs[Math.min(g.ticks,inputs.length-1)]);assert.equal(g.state,'finished',id);assert.equal(g.faults,0);assert.equal(report.physics,PHYSICS_VERSION);assert.ok(report.successRate>=(c.difficulty==='beginner'?1:.8));}
});
