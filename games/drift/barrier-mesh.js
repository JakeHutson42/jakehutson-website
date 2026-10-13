import { roadSamples, offsetSurface, roadHeight } from './road-surface.js';
import * as THREE from '../../lib/three/0.180.0/three.module.min.js';
import { TRACK_EDGE_CONFIG as EDGE } from './config.js';
import { offsetTrackPoint } from './track-edges.js';
import { trackPose } from './math.js';

// Build two continuous, low-poly wall meshes. Adjacent blocks share the same
// corner positions: tight bends cannot expose the gaps left by rotated boxes.
export function buildTrackBarriers(track) {
    const surfaces = [[], []];
    const innerOffset = track.width / 2 + EDGE.vergeWidth;
    const interpolate = (first, second, fraction) => first.map((value, axis) => value + (second[axis] - value) * fraction);
    const face = (target, first, second, third, fourth) => {
        target.push(...first, ...second, ...third, ...first, ...third, ...fourth);
    };
    const samples = roadSamples(track);
    for (let index = 0; index < samples.length; index++) {
        for (const side of [-1, 1]) for (let half = 0; half < 2; half++) {
            const poseA = samples[index], poseB = samples[(index+1) % samples.length];
            const at = (offset, height, f) => interpolate(offsetSurface(poseA, offset * side, height),
                offsetSurface(poseB, offset * side, height), f);
            const lowA = at(innerOffset, 0.025, half/2), lowB = at(innerOffset, 0.025, (half+1)/2);
            const highA = at(innerOffset, EDGE.barrierHeight, half/2), highB = at(innerOffset, EDGE.barrierHeight, (half+1)/2);
            const outer = innerOffset + EDGE.barrierThickness;
            const outLowA = at(outer, 0.025, half/2), outLowB = at(outer, 0.025, (half+1)/2);
            const outHighA = at(outer, EDGE.barrierHeight, half/2), outHighB = at(outer, EDGE.barrierHeight, (half+1)/2);
            const v = surfaces[half];
            face(v, lowA, lowB, highB, highA); face(v, outLowB, outLowA, outHighA, outHighB);
            face(v, highA, highB, outHighB, outHighA); face(v, outLowA, outLowB, lowB, lowA);
            face(v, outLowA, lowA, highA, outHighA); face(v, lowB, outLowB, outHighB, highB);
        }
    }
    const walls = new THREE.Group(); walls.name = 'solid-track-barriers';
    surfaces.forEach((vertices, index) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ color: 0x17202c, roughness: 0.82, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'concrete-boundary';
        mesh.castShadow = true; mesh.receiveShadow = true; walls.add(mesh);
    });
    walls.add(buildArrowBarriers(track, samples));
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
    let lampCount = 0;
    for (let index = 0; index < count; index++) {
        let distance = total * index / count, segment = 0;
        while (segment < lengths.length - 1 && distance >= lengths[segment]) distance -= lengths[segment++];
        const pose = trackPose(track, (segment + distance / Math.max(lengths[segment], 0.001)) / track.points.length);
        if (track.loop && (segment / track.points.length) >= track.loop.start &&
            (segment / track.points.length) <= track.loop.end) continue;
        const elevation = roadHeight(track, (segment + distance / Math.max(lengths[segment], 0.001)) / track.points.length);
        const side = index % 2 ? 1 : -1;
        const offset = track.width / 2 + EDGE.vergeWidth + EDGE.barrierThickness / 2;
        const rx = Math.cos(pose.heading), rz = -Math.sin(pose.heading);
        const x = pose.x + rx * offset * side, z = pose.z + rz * offset * side;
        dummy.rotation.set(0, pose.heading, 0);
        dummy.position.set(x, elevation + 4, z); dummy.scale.set(0.2, 8, 0.2); dummy.updateMatrix();
        poles.setMatrixAt(lampCount * 2, dummy.matrix);
        dummy.position.set(x - rx * side, elevation + 8, z - rz * side);
        dummy.scale.set(2.2, 0.16, 0.2); dummy.updateMatrix(); poles.setMatrixAt(lampCount * 2 + 1, dummy.matrix);
        const headX = x - rx * side * 2, headZ = z - rz * side * 2;
        dummy.position.set(headX, elevation + 7.9, headZ); dummy.scale.set(0.8, 0.12, 0.45); dummy.updateMatrix();
        heads.setMatrixAt(lampCount++, dummy.matrix);
        poses.push({ x: headX, y: elevation, z: headZ, color: 0xffdeb0, progress: index / count });
    }
    poles.count = lampCount * 2; heads.count = lampCount;
    group.add(poles, heads); group.userData.lampPoses = poses;
    group.userData.spacing = total / count;
    return group;
}

// Repeated amber chevrons are part of the wall, not freestanding helper signs.
// Increasing interpolation always means forward travel, on both road sides and
// through bridges/inverted loop sections. No bend-sign guessing or flipped arrows.
function buildArrowBarriers(track, samples) {
    const group = new THREE.Group(); group.name = 'arrow-barrier-faces';
    const arrows = [], trim = [];
    const offset = track.width / 2 + EDGE.vergeWidth;
    const quad = (target, a, b, c, d) => target.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let index = 0; index < samples.length; index++) {
        const a = samples[index], b = samples[(index + 1) % samples.length];
        const length = Math.hypot(b.x-a.x, b.y-a.y, b.z-a.z);
        const count = Math.max(1, Math.round(length / 3));
        for (const side of [-1, 1]) {
            const point = (f, height, across = offset - 0.025) => {
                const start = offsetSurface(a, across * side, height);
                const end = offsetSurface(b, across * side, height);
                return start.map((value, axis) => value + (end[axis] - value) * f);
            };
            for (let cell = 0; cell < count; cell++) {
                const p = (f, height) => point((cell + f) / count, height);
                const low = EDGE.barrierHeight * 0.18, mid = EDGE.barrierHeight * 0.5, high = EDGE.barrierHeight * 0.82;
                quad(arrows, p(0.18, low), p(0.4, low), p(0.82, mid), p(0.6, mid));
                quad(arrows, p(0.6, mid), p(0.82, mid), p(0.4, high), p(0.18, high));
            }
            // A fine amber cap connects the arrow panels into a readable boundary.
            quad(trim, point(0, EDGE.barrierHeight + 0.008, offset),
                point(1, EDGE.barrierHeight + 0.008, offset),
                point(1, EDGE.barrierHeight + 0.008, offset + 0.09),
                point(0, EDGE.barrierHeight + 0.008, offset + 0.09));
        }
    }
    for (const [name, vertices] of [['direction-chevrons', arrows], ['amber-barrier-trim', trim]]) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const material = new THREE.MeshBasicMaterial({ color: 0xffb04a, side: THREE.DoubleSide, toneMapped: false });
        const mesh = new THREE.Mesh(geometry, material); mesh.name = name; group.add(mesh);
    }
    return group;
}
