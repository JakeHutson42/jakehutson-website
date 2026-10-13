import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { driftIntensity, updateDrivingFeedback } from '../../games/drift/driving-feedback.js';
import { roadObstacles, NearMissChallenges, resolveObstacleContacts, obstacleOverlap } from '../../games/drift/obstacles.js';
import { trackPose, wrapAngle } from '../../games/drift/math.js';
import { roadHeight } from '../../games/drift/road-surface.js';

const track = JSON.parse(readFileSync(new URL('../../games/drift/tracks/2026-10-13.json', import.meta.url)));

test('drift feedback grows with angle and remains silent at rest, during contact and in the loop', () => {
    const car = { speed: 25, slip: 0.3 };
    const mild = driftIntensity(car);
    assert.ok(driftIntensity({ ...car, slip: 0.9 }) > mild * 2);
    for (const overrides of [{ speed: 0 }, { slip: 0 }, { barrierHit: true }, { obstacleHit: true }, { loopT: 0.5 }]) {
        assert.equal(driftIntensity({ ...car, ...overrides }), 0);
    }
});

test('automatic shifts drop RPM, resist threshold chatter and show reverse; brakes heat and cool', () => {
    const car = { speed: 8.9, vx: 0, vz: 8.9, heading: 0 };
    updateDrivingFeedback(car, { throttle: true }, 1 / 120);
    const before = car.rpm; assert.equal(car.gear, 1);
    car.speed = car.vz = 9.1; updateDrivingFeedback(car, {}, 1 / 120);
    assert.equal(car.gear, 2); assert.ok(car.rpm < before);
    car.speed = car.vz = 8.9; updateDrivingFeedback(car, {}, 1 / 120); assert.equal(car.gear, 2);
    car.vz = -5; car.speed = 5; updateDrivingFeedback(car, {}, 1 / 120); assert.equal(car.gearLabel, 'R');
    car.speed = car.vz = 25;
    for (let i = 0; i < 120; i++) updateDrivingFeedback(car, { brake: true }, 1 / 120);
    const hot = car.brakeHeat; assert.ok(hot > 0.8);
    for (let i = 0; i < 120; i++) updateDrivingFeedback(car, {}, 1 / 120);
    assert.ok(car.brakeHeat < hot);
});

test('obstacles occupy gently curving level shoulders and leave a wide passing lane on every map', () => {
    for (const day of ['11','12','13','14']) {
        const t = JSON.parse(readFileSync(new URL(`../../games/drift/tracks/2026-10-${day}.json`, import.meta.url)));
        assert.equal(t.width, 14);
        const obstacles = roadObstacles(t); assert.ok(obstacles.length >= 4 && obstacles.length <= 8);
        for (const o of obstacles) {
            const before = trackPose(t, o.progress - 24/t.length), after = trackPose(t, o.progress + 24/t.length);
            assert.ok(Math.abs(wrapAngle(after.heading-before.heading)) <= 0.45);
            assert.ok(roadHeight(t, o.progress) <= 0.1);
            const center = trackPose(t,o.progress), offset = Math.hypot(o.x-center.x,o.z-center.z);
            assert.ok(offset + o.halfWidth < t.width/2);
            assert.ok(t.width/2 + offset-o.halfWidth > 10, 'More than ten metres of clear road remain');
            if (t.loop) assert.ok(o.progress < t.loop.start - 140/t.length || o.progress > t.loop.end + 140/t.length);
        }
    }
});

function carAt(o, along, across) {
    return { x:o.x+Math.sin(o.heading)*along+Math.cos(o.heading)*across,
        z:o.z+Math.cos(o.heading)*along-Math.sin(o.heading)*across,
        heading:o.heading, y:o.y, speed:25, vx:Math.sin(o.heading)*25, vz:Math.cos(o.heading)*25 };
}

function pass(challenge, o, lap, across, flags = {}) {
    let bonus = 0;
    for (let along = -12; along <= 7; along += 0.25) bonus += challenge.update({ ...carAt(o,along,across), ...flags },lap);
    return bonus;
}

test('only clean close forward passes pay, once per lap even after resets', () => {
    const o = roadObstacles(track)[0], challenge = new NearMissChallenges(track);
    const across = -o.side * 2.6;
    assert.equal(pass(challenge,o,1,across),250);
    challenge.resetEncounter(); assert.equal(pass(challenge,o,1,across),0);
    assert.equal(pass(challenge,o,2,across),250);
    for (const flags of [{ obstacleHit:true },{ barrierHit:true },{ offRoad:true },{ vx:0,vz:0 }]) {
        assert.equal(pass(new NearMissChallenges(track),o,1,across,flags),0);
    }
    assert.equal(pass(new NearMissChallenges(track),o,1,-o.side*5),0);
    assert.equal(pass(new NearMissChallenges(track),o,1,-o.side*1.9),0);
});

test('obstacle impact stops penetration while leaving the centre lane open', () => {
    const o = roadObstacles(track)[0], car = carAt(o,-4.4,0);
    assert.ok(obstacleOverlap(car,o)); resolveObstacleContacts(car,track);
    assert.equal(car.obstacleHit,true); assert.equal(obstacleOverlap(car,o),null);
    assert.ok(Math.hypot(car.vx,car.vz)<1);
    const lane = carAt(o,0,-o.side*5.65); resolveObstacleContacts(lane,track);
    assert.equal(lane.obstacleHit,false);
});
