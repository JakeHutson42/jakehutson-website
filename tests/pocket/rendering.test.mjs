import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../lib/three/0.180.0/three.module.min.js';
import { DeskBuilder, batchStaticMeshes } from '../../games/pocket/desk-world.js';
import { PocketWorld } from '../../games/pocket/world.js';
import { buildCar, disposeCar } from '../../games/drift/car-model.js';
import { makeTrack } from '../../games/pocket/tracks.js';
import { courseEdges, pencilSegments } from '../../games/pocket/course-geometry.js';

test('both pencil barriers close the whole lap and overlap at every join on every level', () => {
    for (const seed of ['2026-10-15', '2026-10-16', '2026-10-15-remix-7']) {
        const track = makeTrack(0, seed), segments = pencilSegments(track);
        for (const side of [0, 1]) {
            const rail = segments.filter(segment => segment.side === side);
            assert.equal(rail.length, track.points.length / 4);
            rail.forEach((segment, i) => {
                assert.deepEqual(segment.b, rail[(i + 1) % rail.length].a, 'Shared joints include the start/finish seam');
                const { a, b } = segment;
                assert.ok(segment.length > Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) + 1.19);
                assert.ok([a.x, a.y, a.z, b.x, b.y, b.z].every(Number.isFinite));
            });
            assert.ok(rail.some(segment => segment.a.y > 12));
            assert.ok(rail.some(segment => segment.a.y < 1));
        }
    }
});

test('paper ramp cross-sections remain full width with finite upward-facing faces', () => {
    const track = makeTrack(0, '2026-10-15'), edges = courseEdges(track, 0, .08);
    for (let i = 0; i < track.points.length; i++) {
        const left = new THREE.Vector3(...Object.values(edges[0][i])), right = new THREE.Vector3(...Object.values(edges[1][i]));
        assert.ok(Math.abs(left.distanceTo(right) - track.surfaces[i].width) < 1e-8);
        if (track.surfaces[i].kind !== 'ramp') continue;
        const next = new THREE.Vector3(...Object.values(edges[0][(i + 1) % track.points.length]));
        const normal = next.clone().sub(left).cross(right.clone().sub(left));
        assert.ok(normal.y > 0, 'Ramp triangles cannot fold into white back-facing slivers');
        assert.ok(Math.abs(left.y - track.surfaces[i].y - .08) < 1e-8);
    }
});

test('assembled pencil rails and ramp skins batch efficiently without invalid geometry', () => {
    // Use the real world mesh/material methods without requiring a WebGL context.
    const world = Object.create(PocketWorld.prototype);
    world.map = new THREE.Group(); world.materials = new Map();
    world.deskMaterials = { paper: new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }) };
    const builder = new DeskBuilder(world), track = makeTrack(0, '2026-10-15');
    builder.ramps(track); builder.courseEdges(track);
    const before = new THREE.Box3().setFromObject(world.map, true);
    batchStaticMeshes(world.map);
    const after = new THREE.Box3().setFromObject(world.map, true);
    assert.ok(before.min.distanceTo(after.min) < 1e-5 && before.max.distanceTo(after.max) < 1e-5);
    assert.ok(world.map.children.filter(mesh => mesh.isMesh).length <= 12, 'Hundreds of pencils share material draw calls');
    let triangles = 0;
    world.map.traverse(mesh => {
        if (!mesh.isMesh) return;
        for (const attribute of Object.values(mesh.geometry.attributes)) {
            assert.ok(attribute.array.every(Number.isFinite));
        }
        triangles += mesh.geometry.attributes.position.count / 3;
    });
    assert.ok(triangles < 40000, `Rail/ramp geometry stays within its mobile budget (${triangles} triangles)`);
});

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
