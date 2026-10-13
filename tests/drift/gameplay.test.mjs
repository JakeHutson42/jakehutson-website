import { nearestRoadPoint } from '../../games/drift/road-surface.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Race } from '../../games/drift/race.js';
import { nearestTrackPoint, trackPose, wrapAngle, clamp } from '../../games/drift/math.js';

test('a driver can complete generated circuits with the actual driving model', () => {
    const directory = new URL('../../games/drift/tracks/', import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory)));
    // Every published layout must remain drivable after changing corner complexity
    // or handling. The controller receives only the same input values as a player.
    for (const date of manifest.dates) {
        const track = JSON.parse(readFileSync(new URL(`${date}.json`, directory)));
        const race = new Race(track); race.start();
        let droveBridge = false, droveLoop = false;
        for (let step = 0; step < 120 * 900 && race.state !== 'finished'; step++) {
            const car = race.car;
            droveBridge ||= car.y >= 11;
            droveLoop ||= car.loopT != null;
            const nearest = nearestRoadPoint(track, car.x, car.z, car.progress);
            const target = trackPose(track, nearest.progress + 13 / track.length);
            const desiredHeading = Math.atan2(target.x - car.x, target.z - car.z);
            const headingError = wrapAngle(desiredHeading - car.heading);
            race.update({ throttle: car.speed < 20, brake: car.speed > 22,
                steer: clamp(-headingError * 2, -1, 1), handbrake: false }, 1 / 120);
        }
        assert.equal(race.state, 'finished', `The driving model must allow three laps on ${date}; reached lap ${race.lap}, gate ${race.checkpoint}`);
        assert.ok(race.elapsed > 50, 'A run must involve driving the full circuit');
        assert.ok(droveBridge, 'The driver must cross the elevated bridge');
        if (track.loop) assert.ok(droveLoop, 'The driver must traverse the vertical loop');
    }
});
