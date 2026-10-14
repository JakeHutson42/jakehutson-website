import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CircuitLibrary, generateCircuit, safeCircuit } from '../../games/drift/biome-circuits.js';
import { buildSynthwave } from '../../games/drift/synthwave.js';
import { buildTrackBarriers } from '../../games/drift/barrier-mesh.js';
import { LocalRecords } from '../../games/drift/storage.js';
import { Race } from '../../games/drift/race.js';
import { trackPose, wrapAngle, clamp } from '../../games/drift/math.js';
import { nearestRoadPoint } from '../../games/drift/road-surface.js';
import * as math from '../../games/drift/math.js';
import * as surface from '../../games/drift/road-surface.js';
import * as THREE from '../../lib/three/0.180.0/three.module.min.js';
import vm from 'node:vm';
import { CAMERA_CONFIG, TRACK_EDGE_CONFIG as EDGE } from '../../games/drift/config.js';
import { CircuitFlythrough } from '../../games/drift/preview-camera.js';
import { smokeVelocity } from '../../games/drift/smoke-motion.js';
import { driftIntensity } from '../../games/drift/driving-feedback.js';
const base=JSON.parse(readFileSync(new URL('../../games/drift/tracks/biome-base.json',import.meta.url)));

test('regenerated circuits are deterministic, short, level and safe in both biomes',()=>{
    const options=new Set();
    for(let seed=0;seed<24;seed++) for(const biome of ['city','synthwave']) {
        const t=generateCircuit(base,biome,seed);
        assert.ok(safeCircuit(t.points,t.width));
        assert.ok(t.length<1810 && t.length>base.length*0.9);
        assert.ok(t.elevations.every(y=>y===0));
        if(biome==='city') assert.equal(t.structures.length,0);
        else options.add(t.structures.map(f=>f.type).sort().join(','));
        for(const f of t.structures) {
            assert.ok(f.start>0.05 && f.end<0.95);
            assert.ok((f.end-f.start)*t.length>=60);
        }
    }
    assert.ok(options.has('bridge,tunnel'));
    assert.ok(options.size>=3,'Structures should vary rather than appear on every map');
    assert.deepEqual(generateCircuit(base,'synthwave',42),generateCircuit(base,'synthwave',42));
    assert.notDeepEqual(generateCircuit(base,'city',42).points,generateCircuit(base,'city',43).points);
});

test('each biome retains one route; regeneration persists and records stay route-specific',()=>{
    let saved={};const storage={getItem:key=>saved[key]||null,setItem:(key,value)=>{saved[key]=value;}};
    const library=new CircuitLibrary(base,storage),city=library.get('city'),synth=library.get('synthwave');
    const newSynth=library.regenerate('synthwave',1234);
    assert.equal(library.get('city'),city);assert.notEqual(newSynth.date,synth.date);
    const restored=new CircuitLibrary(base,storage);
    assert.deepEqual(restored.get('synthwave'),newSynth);
    const records=new LocalRecords(storage);records.saveRun(newSynth.date,123,55);
    assert.equal(new LocalRecords(storage).get(newSynth.date).score,123);
    assert.equal(records.get(synth.date),null);
});

test('synthwave has curved tunnel shells, straight portal markers and level bridge decks',()=>{
    const t=new CircuitLibrary(base).get('synthwave');
    assert.equal(t.structures.length,2,'The initial synthwave route showcases both structures');
    const scene=buildSynthwave(t),barriers=buildTrackBarriers(t);
    assert.ok(scene.getObjectByName('curved-mountain-tunnel'));
    assert.equal(scene.children.filter(o=>o.name==='straight-portal-markers').length,2);
    const deck=scene.getObjectByName('flat-curved-bridge-deck');assert.ok(deck);
    const y=deck.geometry.attributes.position;
    for(let i=0;i<y.count;i++) assert.ok(Math.abs(y.getY(i)+0.15)<0.001 || Math.abs(y.getY(i)+1.4)<0.001);
    const floor=scene.getObjectByName('canyon-terrain');floor.geometry.computeBoundingBox();
    assert.ok(floor.geometry.boundingBox.min.y<-30);
    assert.equal(barriers.getObjectByName('direction-chevrons').material.color.getHex(),0xff39d4);
    scene.traverse(o=>{if(o.geometry) assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));});
});

test('the actual driving model completes regenerated city and synthwave circuits',()=>{
    for(const biome of ['city','synthwave']) {
        const track=generateCircuit(base,biome,1637726400),race=new Race(track);race.start();
        for(let step=0;step<120*600 && race.state!=='finished';step++) {
            const car=race.car,nearest=nearestRoadPoint(track,car.x,car.z,car.progress);
            const target=trackPose(track,nearest.progress+13/track.length);
            const heading=wrapAngle(Math.atan2(target.x-car.x,target.z-car.z)-car.heading);
            race.update({throttle:car.speed<20,brake:car.speed>22,steer:clamp(-heading*2,-1,1),handbrake:false},1/120);
        }
        assert.equal(race.state,'finished',biome);
    }
});

test('the world switches biomes and regenerates without retaining old scenery',async()=>{
    class Renderer {
        constructor({canvas}) { this.domElement=canvas;this.shadowMap={}; }
        setPixelRatio() {} setSize() {} render() {} async compileAsync() {}
    }
    const source=readFileSync(new URL('../../games/drift/world.js',import.meta.url),'utf8')
        .replace(/^import .*;\r?\n/gm,'').replace('export class DriftWorld','class DriftWorld');
    const context=vm.createContext({THREE:{...THREE,WebGLRenderer:Renderer},...math,...surface,
        EDGE,CAMERA_CONFIG,CircuitFlythrough,buildSynthwave,buildTrackBarriers,smokeVelocity,driftIntensity,
        buildCar:()=>new THREE.Group(),performance,
        NightSky:class { constructor(){this.ready=Promise.resolve();} async setBiome(biome){this.biome=biome;} update(){} },
        window:{devicePixelRatio:1,matchMedia:()=>({matches:false})},ResizeObserver:class{observe(){}},
        document:{createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})},
    });
    const world=vm.runInContext(source+'\nnew DriftWorld({parentElement:{clientWidth:800,clientHeight:600}})',context);
    const library=new CircuitLibrary(base);
    for(const biome of ['city','synthwave','city','synthwave']) {
        const old=world.environment,track=library.get(biome);
        world.loadTrack(track);await world.prepare(new Race(track));
        if(old) assert.equal(world.scene.children.includes(old),false);
        assert.equal(world.nightSky.biome,biome);
        assert.equal(Boolean(world.environment.getObjectByName('black-mountain-peaks')),biome==='synthwave');
        assert.ok(world.lampPoses.length>0);
    }
});
