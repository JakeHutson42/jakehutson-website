import * as THREE from '../../lib/three/0.180.0/three.module.min.js';
import { TRACK_EDGE_CONFIG as EDGE } from './config.js';
import { offsetTrackPoint } from './track-edges.js';
import { trackPose, wrapAngle } from './math.js';

// Build two continuous, low-poly wall meshes. Adjacent blocks share the same
// corner positions: tight bends cannot expose the gaps left by rotated boxes.
export function buildTrackBarriers(track) {
    const surfaces = [[], []];
    const innerOffset = track.width / 2 + EDGE.vergeWidth;
    const interpolate = (first, second, fraction) => first.map((value, axis) => value + (second[axis] - value) * fraction);
    const face = (target, first, second, third, fourth) => {
        target.push(...first, ...second, ...third, ...first, ...third, ...fourth);
    };
    for (let index = 0; index < track.points.length; index++) {
        for (const side of [-1, 1]) {
            const innerStart = offsetTrackPoint(track.points, index, innerOffset * side);
            const innerEnd = offsetTrackPoint(track.points, index + 1, innerOffset * side);
            const outerStart = offsetTrackPoint(track.points, index, (innerOffset + EDGE.barrierThickness) * side);
            const outerEnd = offsetTrackPoint(track.points, index + 1, (innerOffset + EDGE.barrierThickness) * side);
            for (let half = 0; half < 2; half++) {
                const innerA = interpolate(innerStart, innerEnd, half / 2);
                const innerB = interpolate(innerStart, innerEnd, (half + 1) / 2);
                const outerA = interpolate(outerStart, outerEnd, half / 2);
                const outerB = interpolate(outerStart, outerEnd, (half + 1) / 2);
                const low = point => [point[0], 0.025, point[1]];
                const high = point => [point[0], EDGE.barrierHeight, point[1]];
                const vertices = surfaces[half];
                face(vertices, low(innerA), low(innerB), high(innerB), high(innerA));
                face(vertices, low(outerB), low(outerA), high(outerA), high(outerB));
                face(vertices, high(innerA), high(innerB), high(outerB), high(outerA));
                face(vertices, low(outerA), low(outerB), low(innerB), low(innerA));
                face(vertices, low(outerA), low(innerA), high(innerA), high(outerA));
                face(vertices, low(innerB), low(outerB), high(outerB), high(innerB));
            }
        }
    }
    const walls = new THREE.Group(); walls.name = 'solid-track-barriers';
    surfaces.forEach((vertices, index) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ color: index ? 0x30394a : 0x424b5b, roughness: 0.82, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'concrete-boundary';
        mesh.castShadow = true; mesh.receiveShadow = true; walls.add(mesh);
    });
    walls.add(buildStreetRaceSigns(track));
    const lighting = buildBarrierStreetlights(track);
    walls.add(lighting);
    walls.userData.lampPoses = lighting.userData.lampPoses;
    return walls;
}

function buildBarrierStreetlights(track) {
    const group = new THREE.Group(); group.name = 'barrier-streetlights';
    const lengths = track.points.map((point, index) => {
        const next = track.points[(index + 1) % track.points.length];
        return Math.hypot(next[0] - point[0], next[1] - point[1]);
    });
    const total = lengths.reduce((sum, length) => sum + length, 0);
    const count = Math.max(1, Math.round(total / 30));
    const box = new THREE.BoxGeometry(1, 1, 1);
    const metal = new THREE.MeshStandardMaterial({ color: 0x353f52, metalness: 0.65, roughness: 0.4 });
    const poles = new THREE.InstancedMesh(box, metal, count * 2);
    const heads = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: 0xffdeb0 }), count);
    poles.name = 'lamp-poles-and-arms'; heads.name = 'lamp-heads'; poles.castShadow = true;
    const dummy = new THREE.Object3D(); const poses = [];
    for (let index = 0; index < count; index++) {
        let distance = total * index / count, segment = 0;
        while (segment < lengths.length - 1 && distance >= lengths[segment]) distance -= lengths[segment++];
        const pose = trackPose(track, (segment + distance / Math.max(lengths[segment], 0.001)) / track.points.length);
        const side = index % 2 ? 1 : -1;
        const offset = track.width / 2 + EDGE.vergeWidth + EDGE.barrierThickness / 2;
        const rx = Math.cos(pose.heading), rz = -Math.sin(pose.heading);
        const x = pose.x + rx * offset * side, z = pose.z + rz * offset * side;
        dummy.rotation.set(0, pose.heading, 0);
        dummy.position.set(x, 4, z); dummy.scale.set(0.2, 8, 0.2); dummy.updateMatrix();
        poles.setMatrixAt(index * 2, dummy.matrix);
        dummy.position.set(x - rx * side, 8, z - rz * side);
        dummy.scale.set(2.2, 0.16, 0.2); dummy.updateMatrix(); poles.setMatrixAt(index * 2 + 1, dummy.matrix);
        const headX = x - rx * side * 2, headZ = z - rz * side * 2;
        dummy.position.set(headX, 7.9, headZ); dummy.scale.set(0.8, 0.12, 0.45); dummy.updateMatrix();
        heads.setMatrixAt(index, dummy.matrix);
        poses.push({ x: headX, z: headZ, color: 0xffdeb0, progress: index / count });
    }
    group.add(poles, heads); group.userData.lampPoses = poses;
    group.userData.spacing = total / count;
    return group;
}

// Batched, texture-free warning panels sit behind the continuous concrete wall.
// Their forward-facing arrows follow actual bend direction, on either roadside.
function buildStreetRaceSigns(track) {
    const group = new THREE.Group(); group.name = 'street-race-signs';
    const panels = [], arrows = [], reflectors = [];
    const quad = (target, a, b, c, d) => target.push(...a, ...b, ...c, ...a, ...c, ...d);
    const count = Math.max(12, Math.floor(track.length / 24));
    for (let index = 0; index < count; index++) {
        const progress = index / count;
        const pose = trackPose(track, progress);
        const ahead = trackPose(track, progress + 18 / track.length);
        const turn = wrapAngle(ahead.heading - pose.heading);
        const rightX = Math.cos(pose.heading), rightZ = -Math.sin(pose.heading);
        const forwardX = Math.sin(pose.heading), forwardZ = Math.cos(pose.heading);
        for (const side of [-1, 1]) {
            const offset = track.width / 2 + EDGE.vergeWidth + EDGE.barrierThickness + 0.2;
            const x = pose.x + rightX * offset * side, z = pose.z + rightZ * offset * side;
            const point = (u, y, front = 0) => [x + rightX * u - forwardX * front, y, z + rightZ * u - forwardZ * front];
            // Small cyan reflectors make the wall line readable between signs.
            quad(reflectors, point(-0.18, 0.65), point(0.18, 0.65), point(0.18, 0.9), point(-0.18, 0.9));
            if (Math.abs(turn) < 0.08 && index % 3 !== 0) continue;
            quad(panels, point(-1.7, 1.1), point(1.7, 1.1), point(1.7, 2.5), point(-1.7, 2.5));
            // Signed chevrons for corners; paired upright stripes on straights.
            for (const u of [-0.8, 0.8]) {
                if (Math.abs(turn) < 0.08) {
                    quad(arrows, point(u - 0.14, 1.3, 0.025), point(u + 0.14, 1.3, 0.025),
                        point(u + 0.14, 2.3, 0.025), point(u - 0.14, 2.3, 0.025));
                } else {
                    const sign = Math.sign(turn);
                    quad(arrows, point(u - sign * 0.4, 1.3, 0.025), point(u, 1.3, 0.025),
                        point(u + sign * 0.45, 1.8, 0.025), point(u + sign * 0.05, 1.8, 0.025));
                    quad(arrows, point(u + sign * 0.05, 1.8, 0.025), point(u + sign * 0.45, 1.8, 0.025),
                        point(u, 2.3, 0.025), point(u - sign * 0.4, 2.3, 0.025));
                }
            }
            // Posts are part of the same panel batch.
            for (const u of [-1.35, 1.35]) quad(panels, point(u - 0.06, 0), point(u + 0.06, 0),
                point(u + 0.06, 1.1), point(u - 0.06, 1.1));
        }
    }
    for (const [name, vertices, color] of [['sign-panels', panels, 0x101727], ['direction-chevrons', arrows, 0xffc578], ['wall-reflectors', reflectors, 0x36e6ed]]) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
        mesh.name = name; group.add(mesh);
    }
    return group;
}
