import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roadHeight, nearestRoadPoint, loopPose, offsetSurface } from '../../games/drift/road-surface.js';
import { trackPose } from '../../games/drift/math.js';
import { createCar, updateCar } from '../../games/drift/physics.js';
import { Race } from '../../games/drift/race.js';

const track = JSON.parse(readFileSync(new URL('../../games/drift/tracks/2026-10-13.json', import.meta.url)));
const noInput = { throttle: false, brake: false, handbrake: false, steer: 0 };

test('overlapping roads retain their own progress and vertical clearance', () => {
    const bridge = track.bridges[0];
    const upper = trackPose(track, bridge.upper), lower = trackPose(track, bridge.lower);
    assert.ok(Math.hypot(upper.x - lower.x, upper.z - lower.z) < 0.02);
    assert.ok(roadHeight(track, bridge.upper) - roadHeight(track, bridge.lower) >= 10);
    for (const progress of [bridge.upper, bridge.lower]) {
        const road = nearestRoadPoint(track, upper.x, upper.z, progress);
        assert.ok(Math.abs(road.progress - progress) < 0.001, 'A crossing must never change road layer');
        const car = createCar(track, progress);
        assert.ok(Math.abs(car.y - roadHeight(track, progress)) < 0.001);
        car.vx = Math.sin(car.heading) * 20; car.vz = Math.cos(car.heading) * 20;
        for (let i = 0; i < 30; i++) updateCar(car, noInput, track, 1 / 120);
        assert.ok(car.progress > progress && car.progress < progress + 0.01);
    }
});

test('vertical loop joins the road and carries its barrier normal upside down', () => {
    const start = loopPose(track, 0), end = loopPose(track, 1), top = loopPose(track, 0.5);
    assert.ok(Math.abs(top.y - start.y - track.loop.radius * 2) < 0.001);
    assert.ok(Math.cos(top.pitch) < -0.99, 'Car and road turn upside down at the apex');
    assert.ok(offsetSurface(top, 0, 1)[1] < top.y, 'Loop barriers point toward the inside of the circle');
    for (const [pose, progress] of [[start, track.loop.start], [end, track.loop.end]]) {
        const road = trackPose(track, progress);
        assert.ok(Math.hypot(road.x - pose.x, road.z - pose.z) < 0.001);
        assert.ok(Math.abs(pose.pitch) < 0.001);
    }
});

test('slow entry gets enough speed to complete a loop without throttle or gravity stalls', () => {
    const car = createCar(track, track.loop.start - 0.0005);
    car.speed = 12; car.vx = Math.sin(car.heading) * 12; car.vz = Math.cos(car.heading) * 12;
    let entered = false, inverted = false, exited = false;
    for (let i = 0; i < 120 * 15; i++) {
        updateCar(car, noInput, track, 1 / 120);
        if (car.loopT != null) {
            entered = true; inverted ||= Math.cos(car.pitch) < -0.9;
            assert.ok(car.speed >= track.loop.minimumSpeed);
        } else if (entered) { exited = true; break; }
    }
    assert.ok(entered && inverted && exited);
    assert.ok(Math.abs(car.progress - track.loop.end) < 0.001);
    assert.equal(car.pitch, 0);
});

test('loop travel is consistent across frame rates and pause/reset are safe', () => {
    const cars = [30, 60, 144].map(hz => {
        const car = createCar(track, track.loop.start);
        for (let i = 0; i < hz * 4; i++) updateCar(car, noInput, track, 1 / hz);
        return car;
    });
    assert.ok(Math.hypot(cars[0].x - cars[2].x, cars[0].y - cars[2].y, cars[0].z - cars[2].z) < 0.1);
    const race = new Race(track); race.state = 'racing'; race.car = cars[0];
    race.pause(); const paused = JSON.stringify(race.car);
    race.update(noInput, 1); assert.equal(JSON.stringify(race.car), paused);
    race.resume(); race.resetCar();
    assert.equal(race.car.loopT, null); assert.equal(race.car.progress, 0);
});
