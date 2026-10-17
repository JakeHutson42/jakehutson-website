import test from 'node:test';
import assert from 'node:assert/strict';
import { driftIntensity, updateDrivingFeedback } from '../../games/drift/driving-feedback.js';
import { updateCar } from '../../games/drift/physics.js';


test('drift feedback grows with angle and remains silent at rest, during contact and in the loop', () => {
    const car = { speed: 25, slip: 0.3 };
    const mild = driftIntensity(car);
    assert.ok(driftIntensity({ ...car, slip: 0.9 }) > mild * 2);
    for (const overrides of [{ speed: 0 }, { slip: 0 }, { barrierHit: true }, { loopT: 0.5 }]) {
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

test('sharp steering heats wheels without pressing Slide or lighting the brake lights', () => {
    const road = { width: 200, points: [[0, -1000], [0, 1000], [1000, 1000], [1000, -1000]] };
    const sharp = { x: 0, z: 0, heading: 0, vx: 0, vz: 25, speed: 25, steering: 0 };
    const gentle = { ...sharp };
    for (let i = 0; i < 120; i++) {
        updateCar(sharp, { throttle: true, steer: 1 }, road, 1 / 120);
        updateCar(gentle, { throttle: true, steer: .1 }, road, 1 / 120);
    }
    assert.ok(sharp.brakeHeat > .4, 'A real steering-induced slide must turn the wheel discs red');
    assert.equal(sharp.braking, false, 'A steering drift must not fake a brake pedal press');
    assert.equal(gentle.brakeHeat, 0, 'Ordinary gentle cornering stays cool');
});

test('steeper slides heat faster; spinning, wall contact and off-road travel cannot add drift heat', () => {
    const car = { speed: 25, vx: 0, vz: 25, heading: 0, slip: .3 };
    const mild = { ...car }, steep = { ...car, slip: 1.2 };
    updateDrivingFeedback(mild, {}, .5); updateDrivingFeedback(steep, {}, .5);
    assert.ok(steep.brakeHeat > mild.brakeHeat);
    for (const overrides of [{ slip: 1.6 }, { barrierHit: true }, { offRoad: true }, { speed: 0 }, { loopT: .5 }]) {
        const invalid = { ...car, ...overrides, brakeHeat: .5 };
        updateDrivingFeedback(invalid, {}, .5);
        assert.ok(invalid.brakeHeat < .5);
    }
});
