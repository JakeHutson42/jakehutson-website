import test from 'node:test';
import assert from 'node:assert/strict';
import { Race } from '../../games/drift/race.js';
import { createCar, updateCar } from '../../games/drift/physics.js';
import { trackPose, formatTime } from '../../games/drift/math.js';
import { GAME_CONFIG } from '../../games/drift/config.js';
import { LocalRecords } from '../../games/drift/storage.js';
import { availableTrackDates, utcDate } from '../../games/drift/track-loader.js';

// A permanent test circuit keeps rules tests independent of the rolling daily bank.
const track = { date: '2026-10-12', width: 15, length: Math.PI * 200,
    points: Array.from({ length: 320 }, (_, index) => [100 * Math.cos(index / 320 * Math.PI * 2), 100 * Math.sin(index / 320 * Math.PI * 2)]) };
const noInput = { throttle: false, brake: false, steer: 0, handbrake: false };

// Place the car on either side of a real gate. These tests exercise race rules without
// relying on a driving bot that could hide shortcut/reset regressions.
function cross(race, previous, next) {
    race.previousProgress = previous;
    race.car = createCar(track, next);
    race.update(noInput, GAME_CONFIG.fixedStep);
}

test('all three ordered checkpoints are required on every lap', () => {
    const race = new Race(track); race.state = 'racing';
    cross(race, 0.995, 0.005);
    assert.equal(race.lap, 1, 'crossing the finish without checkpoints must not count');
    for (let lap = 1; lap <= 3; lap++) {
        for (let gate = 1; gate <= 3; gate++) {
            cross(race, gate / 4 - 0.005, gate / 4 + 0.005);
            assert.equal(race.checkpoint, gate);
        }
        cross(race, 0.995, 0.005);
    }
    assert.equal(race.state, 'finished');
    assert.equal(race.lap, 3);
});

test('reverse gate crossing does not unlock a checkpoint', () => {
    const race = new Race(track); race.state = 'racing';
    cross(race, 0.255, 0.245);
    assert.equal(race.checkpoint, 0);
});

test('pause freezes the clock, car, and countdown; reset applies a time penalty', () => {
    const race = new Race(track); race.start(); race.pause();
    race.update({ ...noInput, throttle: true }, 1);
    assert.equal(race.countdown, 3); assert.equal(race.elapsed, 0);
    race.resume(); race.update(noInput, 3.1); assert.equal(race.state, 'racing');
    race.checkpoint = 2; race.elapsed = 10; race.combo = 123.9;
    race.resetCar();
    const checkpoint = trackPose(track, 0.5);
    assert.equal(race.elapsed, 15); assert.equal(race.car.x, checkpoint.x);
    assert.equal(race.previousProgress, 0.5); assert.equal(race.score, 123);
});

test('revisiting already scored road cannot increase the combo', () => {
    const race = new Race(track); race.state = 'racing';
    race.furthestProgress = 0.4; race.previousProgress = 0.2999;
    race.car = createCar(track, 0.3);
    const forwardX = Math.sin(race.car.heading); const forwardZ = Math.cos(race.car.heading);
    race.car.vx = forwardX * 20 + forwardZ * 10;
    race.car.vz = forwardZ * 20 - forwardX * 10;
    race.update({ ...noInput, handbrake: true }, GAME_CONFIG.fixedStep);
    assert.equal(race.drifting, true); assert.equal(race.combo, 0);
});

test('fixed-step simulation matches at 30, 60, and 144 Hz and remains finite', () => {
    function simulate(frameRate) {
        const car = createCar(track);
        let accumulator = 0;
        for (let frame = 0; frame < frameRate * 10; frame++) {
            accumulator += 1 / frameRate;
            while (accumulator + 1e-10 >= GAME_CONFIG.fixedStep) {
                updateCar(car, { ...noInput, throttle: true, steer: 0.35, handbrake: frame > frameRate * 5 }, track, GAME_CONFIG.fixedStep);
                accumulator -= GAME_CONFIG.fixedStep;
            }
        }
        return car;
    }
    const slow = simulate(30); const normal = simulate(60); const fast = simulate(144);
    for (const car of [slow, normal, fast]) assert.ok(Number.isFinite(car.x) && car.speed < 65);
    // Handbrake activation can differ by one frame, so allow a small position tolerance.
    assert.ok(Math.hypot(slow.x - fast.x, slow.z - fast.z) < 2);
    assert.ok(Math.hypot(normal.x - fast.x, normal.z - fast.z) < 2);
});

test('acceleration is progressive, speed is capped, and lower-speed handbrake drifts still score', () => {
    // A long straight isolates pacing from runoff drag and corner geometry.
    const straight = { width: 15, points: [[0, -1000], [0, 1000], [1000, 1000], [1000, -1000]] };
    const car = { x: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, steering: 0 };
    let speedAfterTwoSeconds;
    for (let step = 0; step < 120 * 10; step++) {
        updateCar(car, { ...noInput, throttle: true }, straight, GAME_CONFIG.fixedStep);
        if (step === 239) speedAfterTwoSeconds = car.speed;
    }
    assert.ok(speedAfterTwoSeconds > 29 && speedAfterTwoSeconds < 31, 'Reach roughly 67 mph in two seconds while building speed progressively');
    assert.ok(car.speed >= 39 && car.speed <= 40.01, 'Cruising pace should stay near 89 mph');

    const race = new Race(track); race.state = 'racing';
    race.car.vx = Math.sin(race.car.heading) * 16;
    race.car.vz = Math.cos(race.car.heading) * 16;
    let scoredDrift = false;
    for (let step = 0; step < 60; step++) {
        race.update({ ...noInput, throttle: true, steer: -0.6, handbrake: true }, GAME_CONFIG.fixedStep);
        if (race.drifting && race.combo > 0) scoredDrift = true;
    }
    assert.ok(scoredDrift, 'A cornering slide at about 60 km/h must remain rewarding');
});

test('handbrake holds a slide while releasing it restores grip', () => {
    const openRoad = { width: 200, points: [[0, -1000], [0, 1000], [1000, 1000], [1000, -1000]] };
    const sliding = { x: 0, z: 0, heading: 0, vx: 8, vz: 22, speed: 23, steering: 0 };
    const recovering = { ...sliding };
    for (let step = 0; step < 60; step++) {
        updateCar(sliding, { ...noInput, handbrake: true }, openRoad, GAME_CONFIG.fixedStep);
        updateCar(recovering, noInput, openRoad, GAME_CONFIG.fixedStep);
    }
    assert.ok(sliding.vx > 3.5, 'A held drift should retain sideways momentum');
    assert.ok(recovering.vx < 0.5, 'Releasing the handbrake should let the tyres recover');
});

test('a handbrake tap carries the slide briefly, then normal grip returns', () => {
    const road = { width: 200, points: [[0,-1000],[0,1000],[1000,1000],[1000,-1000]] };
    const car = { x:0, z:0, heading:0, vx:8, vz:22, speed:23, steering:0 };
    for (let i=0;i<24;i++) updateCar(car,{ ...noInput,handbrake:true },road,1/120);
    const immediateGrip = { ...car,slideCarry:0 };
    for (let i=0;i<24;i++) {
        updateCar(car,noInput,road,1/120);
        updateCar(immediateGrip,noInput,road,1/120);
    }
    assert.ok(car.vx>immediateGrip.vx*1.5,'Releasing the handbrake must not instantly end the slide');
    for (let i=0;i<240;i++) updateCar(car,noInput,road,1/120);
    assert.equal(car.slideCarry,0);
    assert.ok(Math.abs(car.vx)<0.1,'The car must still settle back onto its line');
});

test('records persist highest score and fastest time independently', () => {
    let saved = null;
    const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
    const records = new LocalRecords(storage);
    assert.equal(records.saveRun(track.date, 500, 100), true);
    assert.equal(records.saveRun(track.date, 400, 90), false);
    const restored = new LocalRecords(storage);
    assert.deepEqual(restored.get(track.date), { score: 500, time: 90, runs: 2 });
});

test('blocked/corrupt browser storage keeps the game usable in memory', () => {
    const blocked = new LocalRecords({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
    blocked.saveRun(track.date, 123, 80); assert.equal(blocked.available, false); assert.equal(blocked.get(track.date).score, 123);
    const corrupt = new LocalRecords({ getItem: () => '{bad json', setItem() {} });
    assert.equal(corrupt.get(track.date), null);
});

test('archive includes today and ten previous UTC dates, never future tracks', () => {
    const dates = ['2026-10-01', '2026-10-02', '2026-10-11', '2026-10-12', '2026-10-13'];
    assert.deepEqual(availableTrackDates({ dates }, '2026-10-12'), ['2026-10-12', '2026-10-11', '2026-10-02']);
    assert.equal(utcDate(new Date('2026-10-12T23:30:00-02:00')), '2026-10-13');
    assert.equal(formatTime(129.567), '02:09.56');
});
