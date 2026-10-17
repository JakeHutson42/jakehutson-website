import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../lib/three/0.180.0/three.module.min.js';
import { DriftWorld } from '../../games/drift/world.js';
import { CAMERA_CONFIG } from '../../games/drift/config.js';

// Exercise the actual chase-camera renderer with real Three.js vectors/cameras;
// only GPU submission and unrelated scenery/particle effects are omitted.
function fixture(aspect = 1.5) {
    return Object.assign(Object.create(DriftWorld.prototype), {
        camera: new THREE.PerspectiveCamera(CAMERA_CONFIG.fieldOfView, aspect, 1, 1100),
        cameraTarget: new THREE.Vector3(), cameraHeading: 0, cameraDistanceScale: 1,
        car: new THREE.Group(), sun: new THREE.DirectionalLight(),
        lampPoses: [], streetLamps: [], reducedMotion: false,
        nightSky: { update() {} }, renderer: { render() {} },
        updateSmoke() {}, updateSparks() {},
    });
}

test('camera toggle halves the car distance at rest and speed, in landscape and portrait, then restores it', () => {
    for (const aspect of [1.5, .46]) for (const speed of [0, 40]) {
        const world = fixture(aspect);
        const car = { x: 10, y: 5, z: 30, heading: .6, speed };
        const race = { state: 'racing', drifting: false, car };
        const origin = new THREE.Vector3(car.x, car.y, car.z);
        world.render(race, 1 / 60, 0);
        const standard = world.camera.position.clone().sub(origin);
        const target = world.cameraTarget.clone(), fov = world.camera.fov;
        assert.ok(Math.abs(Math.hypot(standard.x, standard.z) - 9) < 1e-9);
        assert.equal(world.toggleCameraDistance(), true);
        world.render(race, 1 / 60, 1);
        const close = world.camera.position.clone().sub(origin);
        assert.ok(close.distanceTo(standard.clone().multiplyScalar(.5)) < 1e-9);
        assert.ok(world.cameraTarget.distanceTo(target) < 1e-9);
        assert.equal(world.camera.fov, fov, 'Distance toggling must retain the existing field of view');
        assert.equal(world.toggleCameraDistance(), false);
        world.render(race, 1 / 60, 2);
        assert.ok(world.camera.position.clone().sub(origin).distanceTo(standard) < 1e-9);
    }
});

test('camera selection carries into a new run without changing the lobby fly-through', () => {
    const world = fixture();
    const position = new THREE.Vector3(50, 80, 40), target = new THREE.Vector3(52, 78, 45);
    world.flythrough = { advance: () => ({ position, target }) };
    world.toggleCameraDistance();
    const car = { x: 10, y: 0, z: 20, heading: 0, speed: 0 };
    world.render({ state: 'ready', car }, 1 / 60, 0);
    assert.ok(world.camera.position.distanceTo(position) < 1e-9);
    world.render({ state: 'countdown', car }, 1 / 60, 1);
    assert.equal(world.cameraDistanceScale, .5);
    assert.equal(world.camera.position.z, car.z - 4.5);
});
