import test from 'node:test';
import assert from 'node:assert/strict';
import { driftAngleReward } from '../../games/drift/drift-scoring.js';
import { Race } from '../../games/drift/race.js';
import { createCar } from '../../games/drift/physics.js';

test('measured drift angles scale smoothly from base points to double, independent of the input button', () => {
    const car = { speed: 25, slip: .2 };
    assert.equal(driftAngleReward(car), 1);
    assert.equal(driftAngleReward({ ...car, slip: .825 }), 1.5);
    assert.equal(driftAngleReward({ ...car, slip: 1.45 }), 2);
    assert.equal(driftAngleReward({ ...car, handbrake: true }), driftAngleReward(car));
    for (const overrides of [{ slip: .19 }, { slip: 1.46 }, { slip: NaN }, { speed: 6 },
        { offRoad: true }, { barrierHit: true }, { loopT: .5 }]) {
        assert.equal(driftAngleReward({ ...car, ...overrides }), 0);
    }
});

const track = { width: 15, length: Math.PI * 200,
    points: Array.from({ length: 320 }, (_, i) => [100 * Math.cos(i / 320 * Math.PI * 2), 100 * Math.sin(i / 320 * Math.PI * 2)]) };

function drive(angle, steps = 480, frameRate = 120) {
    const race = new Race(track); race.state = 'racing';
    let basePoints = 0;
    for (let step = 0; step < steps; step++) {
        const progress = .1 + step / frameRate * .012;
        race.car = createCar(track, progress);
        const heading = race.car.heading;
        race.car.vx = Math.sin(heading) * 25 * Math.cos(angle) + Math.cos(heading) * 25 * Math.sin(angle);
        race.car.vz = Math.cos(heading) * 25 * Math.cos(angle) - Math.sin(heading) * 25 * Math.sin(angle);
        race.previousProgress = progress - .000001;
        const before = race.previousProgress;
        race.update({ throttle: true, steer: 0, brake: false, handbrake: false }, 1 / frameRate);
        basePoints += (race.previousProgress - before) * track.length * 12;
    }
    return { race, pointsPerBasePoint: race.combo / basePoints };
}

test('real steering-independent slides at sharper angles score more per metre and reach higher tiers sooner', () => {
    const mild = drive(.3), steep = drive(1.2);
    assert.equal(mild.race.multiplier, 2);
    assert.equal(steep.race.multiplier, 3);
    assert.ok(steep.pointsPerBasePoint > mild.pointsPerBasePoint * 1.5);
    assert.ok(steep.race.driftDuration > mild.race.driftDuration);
    assert.equal(steep.race.car.braking, false);
    assert.ok(steep.race.car.brakeHeat > 0, 'The same measured slide must drive wheel heat');
});

test('angle points and tier progress stay consistent at different update rates and still cap at five', () => {
    const slow = drive(.8, 30 * 4, 30), fast = drive(.8, 120 * 4, 120);
    assert.equal(slow.race.multiplier, fast.race.multiplier);
    assert.ok(Math.abs(slow.pointsPerBasePoint - fast.pointsPerBasePoint) < .15);
    assert.equal(drive(1.2, 120 * 20).race.multiplier, 5);
});
