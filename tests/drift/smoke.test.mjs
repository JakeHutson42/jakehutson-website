import test from 'node:test';
import assert from 'node:assert/strict';
import { smokeVelocity } from '../../games/drift/smoke-motion.js';
import { driftIntensity } from '../../games/drift/driving-feedback.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../lib/three/0.180.0/three.module.min.js';
import { CAMERA_CONFIG } from '../../games/drift/config.js';

test('world startup creates smoke before the first lobby update', () => {
    // Use real scene/sprite objects with only browser and WebGL boundaries stubbed.
    class Renderer {
        constructor({ canvas }) { this.domElement = canvas; this.shadowMap = {}; }
        setPixelRatio() {}
        setSize() {}
    }
    const source = readFileSync(new URL('../../games/drift/world.js', import.meta.url), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace('export class DriftWorld', 'class DriftWorld');
    const context = vm.createContext({
        THREE: { ...THREE, WebGLRenderer: Renderer }, CAMERA_CONFIG, smokeVelocity, driftIntensity,
        buildCar: () => new THREE.Group(),
        NightSky: class { constructor() { this.ready = Promise.resolve(); } },
        window: { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) },
        ResizeObserver: class { observe() {} },
        document: { createElement: () => ({ getContext: () => ({
            createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
        }) }) },
    });
    const world = vm.runInContext(source + '\nnew DriftWorld({ parentElement: { clientWidth: 800, clientHeight: 600 } });', context);
    assert.equal(world.smoke.length, 96);
    assert.equal(world.sparks.length, 72);
    const car = { x: 0, z: 0, heading: 0, vx: 8, vz: 25, speed: 26, slip: 0.55 };
    assert.doesNotThrow(() => world.updateSmoke({ car, state: 'ready' }, 0));
    world.updateSmoke({ car, state: 'racing', drifting: true }, 1 / 24);
    assert.equal(world.smoke.filter(puff => puff.sprite.visible).length, 2);
    world.updateSmoke({ car: { ...car }, state: 'ready' }, 0);
    assert.equal(world.smoke.filter(puff => puff.sprite.visible).length, 0);
    const smokeAt = slip => {
        const sliding = { ...car, slip };
        for (let i = 0; i < 60; i++) world.updateSmoke({ car: sliding, state: 'racing', drifting: true }, 1/60);
        return world.smoke.filter(puff => puff.sprite.visible).length;
    };
    assert.ok(smokeAt(1) > smokeAt(0.25)*2, 'Hard slides emit more smoke');
    const scraping = { ...car, barrierHit: true, scrapeSide: 1 };
    world.updateSparks({ car: scraping, state: 'racing' }, 0.1);
    assert.ok(world.sparks.some(p => p.life>0));
    const lives = world.sparks.map(p => p.life);
    world.updateSparks({ car: scraping, state: 'paused' }, 1);
    assert.deepEqual(world.sparks.map(p => p.life), lives);
    world.updateSparks({ car: { ...scraping }, state: 'ready' }, 0);
    assert.ok(world.sparks.every(p => p.life===0));
});

test('smoke opposes lateral drift at every heading and trails behind the car', () => {
    for (const heading of [0, 0.6, Math.PI / 2, Math.PI, -2]) {
        const fx = Math.sin(heading), fz = Math.cos(heading);
        for (const slide of [-8, 8]) {
            const plume = smokeVelocity({ heading, vx: fx * 30 + fz * slide, vz: fz * 30 - fx * slide });
            assert.ok((plume.x * fz - plume.z * fx) * slide < 0);
            assert.ok(plume.x * fx + plume.z * fz < 0);
        }
    }
});
