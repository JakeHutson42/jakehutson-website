import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../lib/three/0.180.0/three.module.min.js';
import { NightSky } from '../../games/drift/night-sky.js';

function setup(fail = false) {
    const scene=new THREE.Scene();
    const loader={ load(url,loaded,progress,error) { fail ? error() : loaded(new THREE.Texture()); } };
    const sky=new NightSky(scene,{ random:()=>0.5,loader });
    const camera=new THREE.PerspectiveCamera(); camera.position.set(20,5,70);
    camera.lookAt(20,5,100);
    return { scene,sky,camera };
}

test('sky texture failure keeps a usable dome, and GPU resources can be released',async()=>{
    const {sky,scene,camera}=setup(true);
    await sky.ready;
    sky.update(camera,0);
    assert.deepEqual(sky.group.position.toArray(),camera.position.toArray());
    assert.equal(sky.material.uniforms.panorama.value,sky.fallback);
    assert.equal(sky.dome.material.depthWrite,false);
    sky.dispose(); assert.equal(scene.children.length,0);
});

test('shooting stars are occasional, meteors rare, and effects reuse a bounded pool',()=>{
    const {sky,camera}=setup();
    assert.ok(sky.streaks[0].remaining>=18 && sky.streaks[0].remaining<=48);
    assert.ok(sky.streaks[1].remaining>=180 && sky.streaks[1].remaining<=360);
    const buffers=sky.streaks.map(s=>s.mesh.geometry.attributes.position.array);
    for(let i=0;i<330;i++) sky.update(camera,0.1);
    assert.ok(sky.streaks[0].active);
    assert.equal(sky.streaks[1].active,false);
    assert.ok([...buffers[0]].every(Number.isFinite));
    const age=sky.streaks[0].age;
    sky.update(camera,1,{paused:true}); assert.equal(sky.streaks[0].age,age);
    sky.update(camera,1,{reducedMotion:true});
    assert.ok(sky.streaks.every(s=>!s.active && !s.mesh.visible));
    for(let i=0;i<4000;i++) sky.update(camera,0.1);
    assert.equal(sky.group.children.length,3);
    sky.streaks.forEach((s,i)=>assert.equal(s.mesh.geometry.attributes.position.array,buffers[i]));
    sky.dispose();
});

test('switching biomes caches sky textures and shows the striped sun only in synthwave',async()=>{
    let loads=0;
    const sky=new NightSky(new THREE.Scene(),{loader:{load(url,loaded){loads++;loaded(new THREE.Texture());}}});
    await sky.setBiome('synthwave');
    assert.equal(loads,2);assert.equal(sky.sun.visible,true);
    const synth=sky.material.uniforms.panorama.value;
    await sky.setBiome('city');assert.equal(sky.sun.visible,false);
    await sky.setBiome('synthwave');assert.equal(loads,2);
    assert.equal(sky.material.uniforms.panorama.value,synth);
    sky.dispose();
});
