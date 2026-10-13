import test from 'node:test';
import assert from 'node:assert/strict';
import { smokeVelocity } from '../../games/drift/smoke-motion.js';

test('smoke opposes lateral drift at every heading and trails behind the car', () => {
    for (const heading of [0, 0.6, Math.PI / 2, Math.PI, -2]) {
        const fx = Math.sin(heading), fz = Math.cos(heading);
        for (const slide of [-8, 8]) {
            const plume = smokeVelocity({ heading, vx: fx * 30 + fz * slide, vz: fz * 30 - fx * slide });
            assert.ok((plume.x * fz - plume.z * fx) * slide < 0);
            assert.ok(plume.x * fx + plume.z * fz < 0);
        }
    }
});
