import test from 'node:test';
import assert from 'node:assert/strict';
import { GaragePreferences, DEFAULT_CUSTOMIZATION, normalizeCustomization, CAR_MODELS } from '../../games/drift/garage-data.js';
import { buildCar, disposeCar } from '../../games/drift/car-model.js';
import { LoadingOverlay } from '../../games/drift/loading-overlay.js';

test('garage saves a build across visits without changing race records', () => {
    const entries = new Map([['apex-drift-v2', 'existing records']]);
    const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) };
    const garage = new GaragePreferences(storage);
    garage.save({ model: 'hatch', paint: '#123abc', wheels: 'gold', stripes: false, spoiler: false });
    assert.deepEqual(new GaragePreferences(storage).value, garage.value);
    assert.equal(entries.get('apex-drift-v2'), 'existing records');
});

test('unknown models, colours and inherited wheel names fall back safely', () => {
    assert.deepEqual(normalizeCustomization({ model: '../invalid', paint: 'url(bad)', wheels: 'toString', stripes: 1, spoiler: null }), DEFAULT_CUSTOMIZATION);
    for (const value of [null, [], 42, 'invalid']) assert.deepEqual(normalizeCustomization(value), DEFAULT_CUSTOMIZATION);
});

test('broken storage keeps the chosen build in memory', () => {
    const storage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } };
    const garage = new GaragePreferences(storage);
    garage.save({ ...DEFAULT_CUSTOMIZATION, model: 'muscle' });
    assert.equal(garage.value.model, 'muscle');
    assert.equal(garage.available, false);
    assert.deepEqual(new GaragePreferences({ getItem: () => '{broken' }).value, DEFAULT_CUSTOMIZATION);
});

test('all three models have distinct bodies and use the selected paint and rims', () => {
    const lengths = new Set();
    for (const model of CAR_MODELS) {
        const car = buildCar({ ...DEFAULT_CUSTOMIZATION, model: model.id, paint: '#123abc', wheels: 'gold' });
        lengths.add(car.children[0].geometry.parameters.depth);
        assert.equal(car.children[0].material.color.getHexString(), '123abc');
        assert.ok(car.children.some(mesh => mesh.material.color.getHexString() === 'ba934e'));
        disposeCar(car);
    }
    assert.equal(lengths.size, 3);
});

test('cosmetic options remove stripes and spoiler and shared GPU assets dispose once', () => {
    const full = buildCar(DEFAULT_CUSTOMIZATION);
    const plain = buildCar({ ...DEFAULT_CUSTOMIZATION, stripes: false, spoiler: false });
    assert.equal(full.children.length - plain.children.length, 7);
    const resources = new Set(full.children.flatMap(mesh => [mesh.geometry, mesh.material]));
    const disposalCounts = new Map();
    for (const resource of resources) resource.addEventListener('dispose', () => disposalCounts.set(resource, (disposalCounts.get(resource) || 0) + 1));
    disposeCar(full); disposeCar(plain);
    assert.equal(disposalCounts.size, resources.size);
    assert.ok([...disposalCounts.values()].every(count => count === 1));
});

test('nested loading blocks once, cannot be cancelled, and releases after failure', async () => {
    const oldDocument = globalThis.document; const oldRaf = globalThis.requestAnimationFrame;
    const attributes = new Map(); const events = new Map(); const label = {};
    globalThis.document = { documentElement: { setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) } };
    globalThis.requestAnimationFrame = callback => queueMicrotask(callback);
    let locks = 0; let opens = 0; let closes = 0;
    const loader = new LoadingOverlay({ addEventListener: (event, callback) => events.set(event, callback), querySelector: () => label,
        open: false, showModal() { opens++; this.open = true; }, close() { closes++; this.open = false; } }, () => locks++);
    try {
        await assert.rejects(loader.run('Circuit', async () => {
            assert.equal(loader.active, true);
            assert.equal(attributes.get('aria-busy'), 'true');
            let prevented = false; events.get('cancel')({ preventDefault: () => { prevented = true; } });
            assert.equal(prevented, true);
            await loader.run('Car', async () => { assert.equal(label.textContent, 'Car'); });
            assert.equal(loader.active, true);
            assert.equal(closes, 0);
            throw Error('graphics failed');
        }), /graphics failed/);
        assert.equal(loader.active, false);
        assert.equal(attributes.size, 0);
        assert.equal(locks, 1); assert.equal(opens, 1); assert.equal(closes, 1);
        await loader.run('Retry', async () => {});
        assert.equal(closes, 2);
    } finally { globalThis.document = oldDocument; globalThis.requestAnimationFrame = oldRaf; }
});
