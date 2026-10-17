import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../lib/three/0.180.0/three.module.min.js';
import { validateCatalog,validateCourseEntry,courseProgress,chooseChallenge,loadCatalog } from '../../games/trials/catalog.js';
import { PHYSICS_VERSION } from '../../games/trials/simulation/game.js';
import { TrialsRecords } from '../../games/trials/storage.js';
import { recordIdentity } from '../../games/trials/record-identity.js';
import { medal,Preferences } from '../../games/trials/experience.js';
import { Cosmetics,LIVERIES } from '../../games/trials/cosmetics.js';
import { TrialsWorld } from '../../games/trials/rendering/world.js';
import { disposeTree } from '../../games/trials/rendering/dispose.js';
import { CourseSession } from '../../games/trials/session.js';
import { PerformanceSample } from '../../games/trials/performance.js';
const read=url=>JSON.parse(fs.readFileSync(new URL(url,import.meta.url),'utf8'));
const pointer=read('../../games/trials/courses/current.json');
const catalogURL=new URL('../../games/trials/courses/'+pointer.catalog,import.meta.url);
const catalog=read(catalogURL),bike=read('../../games/trials/content/bike.json');
const content={bikeSpec:bike,manifest:read('../../games/trials/content/manifest.json')};
const course=c=>read(new URL(c.course,catalogURL));
const clone=x=>structuredClone(x);

test('release catalogue pins approved identities, resources and ordered medal targets',()=>{
    assert.equal(validateCatalog(catalog,content,PHYSICS_VERSION),catalog);assert.ok(catalog.courses.length>=4);
    for(const mutate of [c=>c.physics='old',c=>c.assetContentId='0'.repeat(64),c=>c.courses[0].approval='pending',c=>c.courses[0].evidence=null,c=>c.courses[0].course='../escape',c=>c.courses[0].medals.gold.time=100,c=>c.courses.push(c.courses[0])]){const broken=clone(catalog);mutate(broken);assert.throws(()=>validateCatalog(broken,content,PHYSICS_VERSION));}
    const c=catalog.courses[1],geometry=course(c);assert.equal(validateCourseEntry(geometry,c).contentHash,c.contentHash);geometry.paths[0][0][0]=Infinity;assert.throws(()=>validateCourseEntry(geometry,c),/point/);
});

test('course progression and medals use existing records with physics isolation',()=>{
    const records=new TrialsRecords(null),c=catalog.courses[1];assert.equal(courseProgress(catalog,records,bike,PHYSICS_VERSION).filter(p=>p.best).length,0);
    records.record(recordIdentity(PHYSICS_VERSION,c,bike),{time:c.medals.gold.time,faults:0});
    assert.equal(courseProgress(catalog,records,bike,PHYSICS_VERSION).filter(p=>p.best).length,1);assert.equal(courseProgress(catalog,records,bike,'other').filter(p=>p.best).length,0);
    assert.equal(medal(c,{faults:0,time:c.medals.gold.time}),'gold');assert.equal(medal(c,{faults:0,time:c.medals.gold.time+.01}),'silver');assert.equal(medal(c,{faults:9,time:10}),'finisher');
    assert.equal(courseProgress(catalog,records,bike,PHYSICS_VERSION).find(p=>p.id===c.id).best.faults,0);
});

test('challenge selection excludes pending, current and curated routes without generation',()=>{
    const staged=clone(catalog);staged.courses[0].approval='pending';for(const random of [0,.5,.999,1]){const next=chooseChallenge(staged,staged.courses[1].id,()=>random);assert.equal(next.approval,'approved');assert.equal(next.kind,'generated');assert.notEqual(next.id,staged.courses[1].id);}
    assert.equal(chooseChallenge({courses:[]},'works'),null);
});

test('palette changes preserve physical specs, geometry, bones, sockets and record identity',()=>{
    const root=new T.Group(),material=new T.MeshStandardMaterial({color:'#d9a348'});material.name='Works ochre';const mesh=new T.Mesh(new T.BoxGeometry(),material),bone=new T.Bone();bone.name='pelvis';root.add(mesh,bone);const cosmetics=new Cosmetics([root]),before=JSON.stringify(root.toJSON().geometries),spec=JSON.stringify(bike),key=recordIdentity(PHYSICS_VERSION,catalog.courses[0],bike),q=bone.quaternion.clone();
    for(let i=0;i<30;i++)cosmetics.apply(LIVERIES[i%3].id);
    assert.equal(JSON.stringify(root.toJSON().geometries),before);assert.equal(JSON.stringify(bike),spec);assert.deepEqual(bone.quaternion.toArray(),q.toArray());assert.equal(recordIdentity(PHYSICS_VERSION,catalog.courses[0],bike),key);
    cosmetics.apply('signal');assert.notEqual(material.color.getHexString(),'d9a348');cosmetics.apply('works');assert.equal(material.color.getHexString(),'d9a348');
    const prefs=new Preferences({getItem:()=>'{"livery":"injected"}',setItem(){}});assert.equal(prefs.livery,'works');disposeTree(root);
});

test('course session resets run/input/audio while a failed or superseded load retains the run',async()=>{
    let cleared=0,reset=0;const input={enabled:true,clear(){cleared++;}},audio={reset(){reset++;}},world={setCourse(c){this.course=c;}},data={bikeSpec:bike,course:course(catalog.courses[0])};const session=new CourseSession(data,world,input,audio);session.game.start();session.game.update({throttle:1,lean:1});const old=session.game;
    await assert.rejects(session.change(async()=>{throw Error('checksum');}),/checksum/);assert.equal(session.game,old);assert.equal(old.state,'paused');
    let resolve;const first=session.change(()=>new Promise(r=>resolve=r));const next=course(catalog.courses[1]);await session.change(async()=>next);resolve(data.course);assert.equal(await first,false);assert.notEqual(session.game,old);assert.equal(session.game.state,'lobby');assert.equal(session.game.elapsed,0);assert.equal(session.game.faults,0);assert.equal(session.game.throttle,0);assert.equal(session.game.lean,0);assert.equal(session.switches,1);assert.ok(cleared>=3&&reset>=3);assert.equal(input.enabled,false);
});

test('actual quarry environment rebuilds dispose old resources and retain shared bike across 24 switches',()=>{
    const previous=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({},{get:()=>()=>{}})})};
    const world=Object.create(TrialsWorld.prototype);Object.assign(world,{scene:new T.Scene(),course:course(catalog.courses[0]),materials:[],textures:[],environment:new T.Group()});const bikeMesh=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());world.scene.add(bikeMesh,world.environment);let bikeDisposed=0;bikeMesh.geometry.addEventListener('dispose',()=>bikeDisposed++);
    try{world.makeQuarry();const geometryCounts=[],materialCounts=[];
        for(let i=0;i<24;i++){const old=world.environment;let owned=0,disposed=0;const seen=new Set();old.traverse(o=>{if(o.geometry&&!seen.has(o.geometry)){seen.add(o.geometry);owned++;o.geometry.addEventListener('dispose',()=>disposed++);}});world.setCourse(course(catalog.courses[i%catalog.courses.length]));assert.equal(disposed,owned);assert.equal(old.parent,null);assert.equal(world.scene.children.length,2);assert.equal(bikeDisposed,0);geometryCounts.push(world.environment.children.length);materialCounts.push(world.materials.length);}
        assert.ok(Math.max(...geometryCounts)-Math.min(...geometryCounts)<=2);assert.ok(Math.max(...materialCounts)-Math.min(...materialCounts)<=1);
    }finally{disposeTree(world.scene);globalThis.document=previous;}
});

test('failed quarry rebuild rolls back without disposing the existing environment',()=>{
    const world=Object.create(TrialsWorld.prototype),old=new T.Group();Object.assign(world,{course:{name:'old'},environment:old,materials:[],textures:[],scene:new T.Scene(),makeQuarry(){throw Error('bad mesh');}});world.scene.add(old);assert.throws(()=>world.setCourse({name:'new'}),/bad mesh/);assert.equal(world.environment,old);assert.equal(world.course.name,'old');assert.equal(old.parent,world.scene);
});

test('runtime loader rejects corrupt fetched thumbnails/course and stale catalogue bytes',async()=>{
    const root=new URL('../../games/trials/courses/',import.meta.url);let corrupt='';const fetcher=async url=>{const relative=url.pathname.split('/courses/')[1];const data=fs.readFileSync(new URL(relative,root));return new Response(relative===corrupt?Buffer.from('corrupt'):data);};const loaded=await loadCatalog(content,PHYSICS_VERSION,{fetcher});assert.equal((await loaded.load('works')).contentHash,catalog.courses[0].contentHash);
    corrupt=pointer.catalog.replace('catalog.json',catalog.courses[0].course);await assert.rejects(loaded.load('works'),/corrupt/);corrupt=pointer.catalog;await assert.rejects(loadCatalog(content,PHYSICS_VERSION,{fetcher}),/checksum/);
});

test('sustained performance counters retain bounded samples and full-run totals',()=>{
    const p=new PerformanceSample();for(let i=0;i<30000;i++)p.add(5,.1,.5,40,50000);assert.equal(p.frames.length,3600);assert.equal(p.report().totalFrames,30000);assert.equal(p.report().seconds,150);assert.equal(p.report().fps,200);assert.equal(p.report().frameP95,5);p.reset();assert.equal(p.report().totalFrames,0);
});
