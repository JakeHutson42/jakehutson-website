import * as THREE from '../../lib/three/0.180.0/three.module.min.js';
import { TRACK_EDGE_CONFIG as EDGE } from './config.js';
import { offsetTrackPoint } from './track-edges.js';

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
        const material = new THREE.MeshStandardMaterial({ color: index ? 0xd6533f : 0xeae9db, roughness: 0.8, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true; mesh.receiveShadow = true; walls.add(mesh);
    });
    return walls;
}
