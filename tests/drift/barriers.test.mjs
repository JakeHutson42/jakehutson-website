import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCar, updateCar } from '../../games/drift/physics.js';
import { carContactPoints, resolveBarrierContacts, offsetTrackPoint } from '../../games/drift/track-edges.js';
import { TRACK_EDGE_CONFIG as EDGE } from '../../games/drift/config.js';
import { nearestTrackPoint, trackPose } from '../../games/drift/math.js';
import { buildTrackBarriers } from '../../games/drift/barrier-mesh.js';
import { disposeCar } from '../../games/drift/car-model.js';
import { Race } from '../../games/drift/race.js';

const straightTrack = { width: 10, length: 400, points: [[0, 0], [0, 100], [100, 100], [100, 0]] };
const noControls = { throttle: false, brake: false, steer: 0, handbrake: false };
const staysInside = (car, track) => {
    for (const [x, z] of carContactPoints(car)) {
        assert.ok(nearestTrackPoint(track.points, x, z).distance <= track.width / 2 + EDGE.vergeWidth - EDGE.contactMargin + 0.02,
            'Bumpers and body corners must remain inside the solid wall');
    }
};

test('both walls block a maximum-speed sideways impact without losing tangential motion', () => {
    for (const side of [-1, 1]) {
        const car = { ...createCar(straightTrack), x: side * 5.2, z: 40, heading: 0, vx: side * 32, vz: 18 };
        const result = resolveBarrierContacts(car, straightTrack, 1 / 120);
        assert.equal(result.contact, true); assert.equal(car.barrierHit, true);
        staysInside(car, straightTrack);
        assert.ok(car.vx * side <= 0, 'Outward velocity must be removed');
        assert.ok(car.vz > 16 && car.vz < 18, 'Scraping slows but preserves travel along the wall');
    }
});

test('continuous throttle into a wall cannot tunnel through it and reversing releases the car', () => {
    const car = { ...createCar(straightTrack), x: 0, z: 40, heading: Math.PI / 2, vx: 32 };
    for (let step = 0; step < 600; step++) {
        updateCar(car, { ...noControls, throttle: true }, straightTrack, 1 / 120);
        staysInside(car, straightTrack);
    }
    const touchingX = car.x;
    for (let step = 0; step < 120; step++) updateCar(car, { ...noControls, brake: true }, straightTrack, 1 / 120);
    assert.ok(car.x < touchingX - 1, 'The wall must not trap a car that reverses away');
});

test('angled contacts settle safely on inside and outside bends throughout a generated circuit', () => {
    const track = JSON.parse(readFileSync(new URL('../../games/drift/tracks/2026-10-13.json', import.meta.url)));
    for (let index = 0; index < track.points.length; index += 4) {
        const pose = trackPose(track, index / track.points.length);
        for (const side of [-1, 1]) {
            const normalX = Math.cos(pose.heading) * side;
            const normalZ = -Math.sin(pose.heading) * side;
            const car = { ...createCar(track), x: pose.x + normalX * 5.5, z: pose.z + normalZ * 5.5,
                heading: pose.heading + 0.6, vx: normalX * 25, vz: normalZ * 25 };
            resolveBarrierContacts(car, track, 1 / 120);
            staysInside(car, track);
            assert.ok(Number.isFinite(car.x) && Number.isFinite(car.vx));
        }
    }
});

test('an impact banks the existing combo and cannot score a collision as a drift', () => {
    const race = new Race(straightTrack); race.state = 'racing';
    race.car = { ...race.car, x: 4.9, z: 40, heading: Math.PI / 4, vx: 24, vz: 14 };
    race.combo = 100;
    race.update(noControls, 1 / 120);
    assert.equal(race.car.barrierHit, true);
    assert.equal(race.combo, 0); assert.equal(race.score, 100); assert.equal(race.drifting, false);
});

test('continuous concrete walls close the seam alongside batched urban signs and lamps', () => {
    const track = JSON.parse(readFileSync(new URL('../../games/drift/tracks/2026-10-13.json', import.meta.url)));
    for (const offset of [-6, 6]) assert.deepEqual(offsetTrackPoint(track.points, 0, offset), offsetTrackPoint(track.points, track.points.length, offset));
    const walls = buildTrackBarriers(track);
    assert.equal(walls.children.filter(child => child.name === 'concrete-boundary').length, 2);
    for (const wall of walls.children.filter(child => child.name === 'concrete-boundary')) {
        wall.geometry.computeBoundingBox();
        assert.ok(Math.abs(wall.geometry.boundingBox.max.y - EDGE.barrierHeight) < 0.0001);
        assert.equal(wall.castShadow, true);
        assert.ok([...wall.geometry.attributes.position.array].every(Number.isFinite));
    }
    const lamps = walls.getObjectByName('barrier-streetlights');
    assert.ok(lamps.userData.spacing >= 29 && lamps.userData.spacing <= 31);
    assert.equal(lamps.getObjectByName('lamp-heads').count, walls.userData.lampPoses.length);
    assert.ok(walls.getObjectByName('direction-chevrons').geometry.attributes.position.count > 0);
    disposeCar(walls);
});
