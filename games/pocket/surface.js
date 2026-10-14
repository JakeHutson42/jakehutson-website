import { clamp, nearestTrackPoint, trackPose } from '../drift/math.js';

export function surfacePose(track, progress = 0) {
    const pose = trackPose(track, progress);
    if (!track.surfaces) return { ...pose, y: 0, pitch: 0, width: track.width, kind: 'wood' };
    const t = ((progress % 1 + 1) % 1) * track.points.length, i = Math.floor(t), f = t - i;
    const a = track.surfaces[i], b = track.surfaces[(i + 1) % track.points.length];
    const segmentLength = track.length / track.points.length;
    return { ...pose, y: a.y + (b.y - a.y) * f, width: a.width + (b.width - a.width) * f,
        pitch: Math.atan2(b.y - a.y, segmentLength), kind: a.kind };
}

// Progress-local projections distinguish a ruler bridge from the road below it.
// The search covers much more than one fixed-step movement, but never the far
// side of a crossover. Resetting supplies an explicit surface progress instead.
export function nearestSurfacePoint(track, x, z, progress) {
    if (!track.surfaces) return { ...nearestTrackPoint(track.points, x, z), y: 0, width: track.width, kind: 'wood' };
    const count = track.points.length, center = Math.floor(((progress % 1 + 1) % 1) * count);
    let best = { distance: Infinity };
    for (let step = -22; step <= 22; step++) {
        const i = (center + step + count) % count;
        const a = track.points[i], b = track.points[(i + 1) % count];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const f = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
        const px = a[0] + dx * f, pz = a[1] + dz * f, distance = Math.hypot(x - px, z - pz);
        if (distance < best.distance) {
            const p = ((i + f) / count) % 1;
            best = { distance, progress: p, x: px, z: pz };
        }
    }
    return { ...surfacePose(track, best.progress), ...best };
}
