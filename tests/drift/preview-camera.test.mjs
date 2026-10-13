import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CircuitFlythrough } from '../../games/drift/preview-camera.js';
import { nearestTrackPoint } from '../../games/drift/math.js';

const track = JSON.parse(readFileSync(new URL('../../games/drift/tracks/2026-10-13.json', import.meta.url)));

test('fly-through stays above the road through every hairpin and loops without a camera jump', () => {
    const preview = new CircuitFlythrough(track);
    for (let index = 0; index < 600; index++) {
        const distance = index / 600 * preview.length;
        const view = preview.sample(distance);
        assert.ok(nearestTrackPoint(track.points, view.position.x, view.position.z).distance < .3,
            'The preview camera must remain over the centreline even in a tight hairpin');
        assert.equal(view.position.y, 5.2);
        assert.equal(view.target.y, 1.4);
        assert.ok(view.position.distanceTo(view.target) > 8, 'Look ahead through the bend rather than spinning in place');
    }
    const before = preview.sample(preview.length - .01);
    const after = preview.sample(.01);
    assert.ok(before.position.distanceTo(after.position) < .03);
    assert.ok(before.target.distanceTo(after.target) < .03);
});

test('preview travel is frame-rate independent and never mutates the race track', () => {
    const original = JSON.stringify(track);
    const slow = new CircuitFlythrough(track), fast = new CircuitFlythrough(track);
    for (let frame = 0; frame < 30 * 10; frame++) slow.advance(1 / 30);
    for (let frame = 0; frame < 144 * 10; frame++) fast.advance(1 / 144);
    assert.ok(slow.sample().position.distanceTo(fast.sample().position) < .00001);
    assert.equal(JSON.stringify(track), original);
    const stationary = fast.sample().position;
    assert.ok(stationary.distanceTo(fast.advance(0).position) === 0);
});
