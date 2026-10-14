import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roadHeight, nearestRoadPoint, loopPose, offsetSurface, loopChaseView } from '../../games/drift/road-surface.js';
import { miles, mph } from '../../games/drift/units.js';
import { trackPose } from '../../games/drift/math.js';
import { createCar, updateCar } from '../../games/drift/physics.js';
import { Race } from '../../games/drift/race.js';

// Legacy geometry remains a fixture for the shared surface engine; no daily track uses it.
const track = JSON.parse(readFileSync(new URL('./fixtures/legacy-stunt.json', import.meta.url)));
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
    assert.ok(top.frame.up[1] < -0.99, 'Car and road turn upside down at the apex');
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
            entered = true; inverted ||= car.frame.up[1] < -0.9;
            assert.ok(car.speed >= track.loop.minimumSpeed);
        } else if (entered) { exited = true; break; }
    }
    assert.ok(entered && inverted && exited);
    assert.ok(Math.abs(car.progress - track.loop.end) < 0.001);
    assert.equal(car.pitch, 0);
});

test('loop enters left and exits right with the same forward direction', () => {
    const start=loopPose(track,0),end=loopPose(track,1);
    const lateral=(end.x-start.x)*Math.cos(start.heading)-(end.z-start.z)*Math.sin(start.heading);
    assert.ok(Math.abs(lateral-track.loop.offset)<0.01);
    assert.ok(lateral>track.width+4,'Entry and exit lanes must be separate');
    assert.ok(Math.abs(start.heading-end.heading)<0.001);
    assert.ok(start.frame.up[1]>0.99 && end.frame.up[1]>0.99);
});

test('loop camera remains behind the car and follows its road-relative up vector', () => {
    for(let i=0;i<=120;i++) {
        const car=loopPose(track,i/120),view=loopChaseView(car,10,4.8,10,1);
        const displacement=view.position.map((v,a)=>v-[car.x,car.y,car.z][a]);
        const dot=axis=>displacement.reduce((sum,v,a)=>sum+v*axis[a],0);
        assert.ok(Math.abs(dot(car.frame.forward)+10)<0.001);
        assert.ok(Math.abs(dot(car.frame.right))<0.001,'Never switch to a side camera');
        assert.ok(Math.abs(dot(car.frame.up)-4.8)<0.001);
        assert.deepEqual(view.up,car.frame.up);
    }
});

test('published laps are 0.5625-1.125 miles and speed conversions use imperial units', () => {
    assert.ok(Math.abs(mph(40)-89.47745168)<0.0001);
    assert.equal(miles(1609.344),1);
    for(const day of ['11','12','13','14']) {
        const t=JSON.parse(readFileSync(new URL(`../../games/drift/tracks/2026-10-${day}.json`,import.meta.url)));
        assert.ok(miles(t.drivingLength)>=0.5625 && miles(t.drivingLength)<=1.125);
    }
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
