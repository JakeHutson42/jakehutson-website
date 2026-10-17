import test from 'node:test';
import assert from 'node:assert/strict';
import { BonusReadout } from '../../games/drift/bonus-readout.js';

function fixture(reduced = false) {
    const animations = [];
    const root = { dataset: {}, classList: { toggle() {} } };
    const value = { textContent: '0', animate(frames, options) {
        const animation = { frames, options, playState: 'running', cancelled: false,
            cancel() { this.cancelled = true; this.playState = 'idle'; },
            pause() { this.playState = 'paused'; }, play() { this.playState = 'running'; } };
        animations.push(animation); return animation;
    } };
    const label = { textContent: '', setAttribute(name, text) { this[name] = text; } };
    const motion = { matches: reduced, addEventListener(_name, handler) { this.changed = handler; } };
    return { readout: new BonusReadout(root, value, label, motion), root, value, label, motion, animations };
}

test('tier entrances run once, cancel on the next tier, and clear when a combo banks', () => {
    const { readout, root, value, label, animations } = fixture();
    readout.update(100.9, 2, true);
    assert.equal(value.textContent, '100');
    assert.equal(root.dataset.bonusTier, '2');
    assert.equal(label.textContent, 'FLOW · BONUS INCLUDED');
    assert.match(label['aria-label'], /2 times base points/);
    for (let i = 0; i < 30; i++) readout.update(100 + i, 2, true);
    assert.equal(animations.length, 1, 'Score refreshes must not restart the entrance');
    for (const tier of [3, 4, 5]) readout.update(1000, tier, true);
    assert.equal(animations.length, 4);
    assert.ok(animations.slice(0, 3).every(animation => animation.cancelled));
    assert.equal(label.textContent, 'MAX BONUS · BONUS INCLUDED');
    assert.ok(animations.every(animation => animation.options.duration < 1800));
    readout.update(0, 1, true);
    assert.equal(root.dataset.bonusTier, '1');
    assert.equal(label.textContent, 'DRIFT · BONUS INCLUDED');
    assert.ok(animations.every(animation => animation.cancelled));
});

test('pause/resume preserves an entrance; reduced motion cancels and suppresses animation', () => {
    const { readout, animations, motion } = fixture();
    readout.update(100, 2, true);
    readout.setActive(false); assert.equal(animations[0].playState, 'paused');
    readout.setActive(false); assert.equal(animations[0].playState, 'paused');
    readout.setActive(true); assert.equal(animations[0].playState, 'running');
    motion.matches = true; motion.changed(); assert.ok(animations[0].cancelled);
    readout.update(200, 3, true); assert.equal(animations.length, 1);
    const reduced = fixture(true);
    reduced.readout.update(1000, 5, true);
    assert.equal(reduced.animations.length, 0);
    assert.equal(reduced.label.textContent, 'MAX BONUS · BONUS INCLUDED');
});

test('pausing after an entrance finishes cannot replay it on resume', () => {
    const { readout, animations } = fixture();
    readout.update(100, 2, true);
    animations[0].playState = 'finished';
    readout.setActive(false); readout.setActive(true);
    assert.equal(animations[0].playState, 'finished');
    assert.equal(animations.length, 1);
});
