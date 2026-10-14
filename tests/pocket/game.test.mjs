import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOMS, makeTrack } from '../../games/pocket/tracks.js';
import { PocketRace, STEP, aiInput, drive } from '../../games/pocket/race.js';
import { nearestTrackPoint, trackPose } from '../../games/drift/math.js';
import { PocketStorage } from '../../games/pocket/storage.js';
import { PocketCup } from '../../games/pocket/cup.js';

test('daily and remix maps are reproducible, separated and keep full props off the road', () => {
    for (let day = 1; day <= 20; day++) for (let room = 0; room < 3; room++) {
        const seed = `2026-10-${String(day).padStart(2, '0')}`, track = makeTrack(room, seed);
        assert.deepEqual(track, makeTrack(room, seed));
        assert.notDeepEqual(track.points, makeTrack(room, `${seed}-remix-1`).points);
        assert.equal(track.points.length, 256);
        assert.ok(track.length > 480 && track.length < 620);
        assert.ok(track.props.length >= 20);
        for (const prop of track.props) {
            assert.ok(ROOMS[room].props.includes(prop.type));
            assert.ok(nearestTrackPoint(track.points, prop.x, prop.z).distance >= track.width / 2 + prop.radius + 3);
        }
        // Nonadjacent road portions cannot overlap or provide shortcut gates.
        for (let i = 0; i < 256; i += 2) for (let j = i + 12; j < 256; j += 2) {
            if (256 - j + i < 12) continue;
            assert.ok(Math.hypot(track.points[i][0] - track.points[j][0], track.points[i][1] - track.points[j][1]) > track.width + 2);
        }
    }
});

test('all rooms and multiple layouts allow a complete race with the actual physics and AI', () => {
    for (const seed of ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-14-remix-7']) for (let room = 0; room < 3; room++) {
        const track = makeTrack(room, seed), race = new PocketRace(track);
        for (let tick = 0; tick < 120 * 150 && race.state !== 'finished'; tick++) race.update(aiInput(race.player, track), STEP);
        assert.equal(race.state, 'finished', `${ROOMS[room].name} / ${seed}`);
        assert.equal(race.player.laps, 3);
        assert.equal(race.player.lapTimes.length, 3);
        assert.ok(race.elapsed > 40 && race.elapsed < 110);
        assert.ok(race.cars.slice(1).every(car => car.laps >= 2), 'Rivals must remain competitive and complete checkpoints');
        assert.ok(race.player.boostClaims.size >= 8, 'Yellow pads must be reachable through driving');
        assert.equal(new Set(race.ranking.map(car => car.index)).size, 4);
    }
});

test('pause freezes the clock and car, and resets retain lap gates with a penalty', () => {
    const race = new PocketRace(makeTrack(0, 'pause'));
    race.state = 'racing';
    for (let tick = 0; tick < 120; tick++) race.update(aiInput(race.player, race.track), STEP);
    race.state = 'paused';
    const before = { x: race.player.x, z: race.player.z, time: race.elapsed };
    race.update({ throttle: true, steer: 1 }, 10);
    assert.deepEqual({ x: race.player.x, z: race.player.z, time: race.elapsed }, before);
    race.state = 'racing'; const gate = race.player.gate;
    race.reset(); assert.equal(race.penalty, 3); assert.equal(race.player.gate, gate); assert.equal(race.player.speed, 0);
    assert.equal(race.player.previousProgress, race.player.resetProgress);
});

test('a complete cup visits every room, scores once per round, breaks ties and can restart', () => {
    for (let first = 0; first < 3; first++) {
        const cup = new PocketCup(first), visited = [];
        assert.equal(cup.next(), false, 'An unfinished round cannot be skipped');
        for (let round = 0; round < 3; round++) {
            visited.push(cup.room);
            const track = makeTrack(cup.room, 'cup-loop'), race = new PocketRace(track);
            for (let tick = 0; tick < 120 * 150 && race.state !== 'finished'; tick++) race.update(aiInput(race.player, track), STEP);
            assert.equal(race.state, 'finished');
            cup.award(race.ranking);
            const totals = [...cup.totals]; cup.award(race.ranking);
            assert.deepEqual(cup.totals, totals, 'Reopening results must not award points twice');
            assert.equal(cup.totals.reduce((a, b) => a + b), (round + 1) * 22);
            assert.equal(cup.next(), round !== 2);
        }
        assert.equal(new Set(visited).size, 3); assert.equal(cup.finalRound, true);
        const fresh = new PocketCup(first); assert.deepEqual(fresh.totals, [0, 0, 0, 0]);
    }
    const tied = new PocketCup(); tied.totals = [10, 10, 10, 10]; tied.lastOrder = [3, 2, 1, 0];
    assert.deepEqual(tied.standings.map(car => car.index), [3, 2, 1, 0]);
});

test('finish-line loops, reversing and skipped checkpoints cannot award laps', () => {
    const race = new PocketRace(makeTrack(0, 'gates')), car = race.player;
    car.started = true; car.gate = 1;
    for (let repeat = 0; repeat < 10; repeat++) {
        car.previousProgress = .999; car.progress = .001; race.updateProgress(car);
        car.previousProgress = .001; car.progress = .999; race.updateProgress(car);
    }
    assert.equal(car.laps, 0); assert.equal(car.gate, 1);
    car.previousProgress = .10; car.progress = .3; race.updateProgress(car);
    assert.equal(car.gate, 1);
    for (let gate = 1; gate < 8; gate++) {
        car.previousProgress = gate / 8 - .001; car.progress = gate / 8 + .001; race.updateProgress(car);
    }
    assert.equal(car.gate, 8);
    car.previousProgress = .999; car.progress = .001; race.updateProgress(car);
    assert.equal(car.laps, 1);
});

test('boost pads can be claimed only once each lap, including after a reset', () => {
    const race = new PocketRace(makeTrack(0, 'boost'), 'trial'); race.state = 'racing';
    const pad = race.track.boosts[0];
    const visit = () => {
        Object.assign(race.player, pad, { previousProgress: pad.progress, vx: Math.sin(pad.heading) * 15, vz: Math.cos(pad.heading) * 15, speed: 15 });
        race.update({}, STEP);
    };
    visit(); assert.ok(race.player.boost > .8);
    race.reset(); visit(); assert.equal(race.player.boost, 0);
    race.player.laps = 1; visit(); assert.ok(race.player.boost > .8);
});

test('barriers contain the car during sustained full-throttle impacts; brake reverses', () => {
    const track = makeTrack(2, 'walls'), race = new PocketRace(track, 'trial'), car = race.player;
    for (let tick = 0; tick < 120 * 15; tick++) {
        drive(car, { throttle: true, steer: tick < 700 ? 1 : -1 }, track, STEP);
        assert.ok(Number.isFinite(car.speed));
        assert.ok(nearestTrackPoint(track.points, car.x, car.z).distance <= track.width / 2 - .8);
    }
    const pose = trackPose(track, .2); Object.assign(car, pose, { vx: 0, vz: 0 });
    for (let tick = 0; tick < 100; tick++) drive(car, { brake: true, steer: 0 }, track, STEP);
    assert.ok(car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading) < -1);
});

test('records separate layouts and modes, bound growth, survive reload and reject corrupt data', () => {
    let saved;
    const adapter = { getItem: () => saved || null, setItem: (_, value) => { saved = value; } };
    const store = new PocketStorage(adapter);
    assert.equal(store.saveRun('v1:desk:day:race', 63, 19), true);
    assert.equal(store.saveRun('v1:desk:day:race', 65, 18), false);
    store.saveRun('v1:desk:day:trial', 61, 18);
    const reloaded = new PocketStorage(adapter);
    assert.deepEqual(reloaded.records['v1:desk:day:race'], { time: 63, lap: 18, runs: 2 });
    assert.equal(reloaded.records['v1:desk:day:trial'].time, 61);
    for (let i = 0; i < 100; i++) store.saveRun(`layout:${i}`, 60, 18);
    assert.equal(Object.keys(store.records).length, 80);
    saved = '{broken'; assert.equal(new PocketStorage(adapter).available, false);
    const blocked = new PocketStorage({ getItem() { throw Error('blocked'); } });
    blocked.saveRun('memory', 50, 15); assert.equal(blocked.records.memory.time, 50);
    assert.equal(blocked.available, false);
    assert.equal(store.saveRun('invalid', Infinity, 20), false);
});
