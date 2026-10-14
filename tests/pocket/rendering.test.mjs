import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../lib/three/0.180.0/three.module.min.js';
import { batchStaticMeshes } from '../../games/pocket/desk-world.js';
import { buildCar, disposeCar } from '../../games/drift/car-model.js';

test('material batching preserves transformed bounds, transparent details and instanced objects', () => {
    const root = new THREE.Group(); root.position.set(7, 2, -9); root.rotation.y = .3;
    const material = new THREE.MeshStandardMaterial({ color: '#ee8866' });
    for (const x of [-6, 6]) {
        const group = new THREE.Group(); group.position.set(x, 3, 2); group.rotation.z = .2;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4), material); group.add(mesh); root.add(group);
    }
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ transparent: true })); root.add(decal);
    const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, 1);
    instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(2, 1, 1)); root.add(instances);
    const before = new THREE.Box3().setFromObject(root);
    batchStaticMeshes(root);
    const after = new THREE.Box3().setFromObject(root);
    assert.ok(before.min.distanceTo(after.min) < .00001 && before.max.distanceTo(after.max) < .00001);
    assert.ok(decal.parent && instances.parent, 'Decals retain transparency sorting; instances retain per-instance transforms');
    const opaque = root.children.filter(mesh => mesh.isMesh && !mesh.isInstancedMesh && !mesh.material.transparent);
    assert.equal(opaque.length, 1, 'Objects sharing a material become one draw call');
    assert.equal(opaque[0].material, material);
});

test('batched cars retain model proportions, paint and working brake-light materials', () => {
    for (const model of ['coupe', 'hatch', 'muscle']) {
        const car = buildCar({ model, paint: '#65c9b2', stripes: true, spoiler: true, wheels: 'gold' });
        const count = root => { let n = 0; root.traverse(object => { if (object.isMesh) n++; }); return n; };
        const beforeCount = count(car), before = new THREE.Box3().setFromObject(car), lights = car.userData.tailLightMaterial;
        batchStaticMeshes(car);
        const after = new THREE.Box3().setFromObject(car);
        assert.ok(before.min.distanceTo(after.min) < .00001 && before.max.distanceTo(after.max) < .00001);
        assert.ok(count(car) < beforeCount / 2);
        assert.ok(car.children.some(mesh => mesh.material === lights));
        lights.emissiveIntensity = 2; assert.equal(car.userData.tailLightMaterial.emissiveIntensity, 2);
        assert.ok(car.children.some(mesh => mesh.material.color.getHexString() === '65c9b2'));
        disposeCar(car);
    }
});
