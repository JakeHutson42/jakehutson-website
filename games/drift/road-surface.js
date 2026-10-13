import { clamp, trackPose } from './math.js';

export function roadHeight(track, progress) {
    if (!track.elevations) return 0;
    const p = ((progress % 1 + 1) % 1) * track.points.length;
    const i = Math.floor(p), f = p - i;
    return track.elevations[i] * (1 - f) + track.elevations[(i + 1) % track.points.length] * f;
}

export function loopPose(track, t) {
    const loop = track.loop;
    const start = trackPose(track, loop.start), end = trackPose(track, loop.end);
    const dx = end.x - start.x, dz = end.z - start.z, span = Math.hypot(dx, dz);
    const r = loop.radius;
    // A complete circle between tangent-matched entry and exit straights.
    // Spreading the circle along the straight would make a self-crossing teardrop.
    const circle = t >= 0.25 && t <= 0.75;
    const angle = clamp((t - 0.25) * 2, 0, 1) * Math.PI * 2;
    const along = circle ? span / 2 + r * Math.sin(angle) : t < 0.25 ? span * t * 2 : span * (t * 2 - 1);
    const tangent = circle ? r * Math.PI * 4 * Math.cos(angle) : span * 2;
    const vertical = circle ? r * Math.PI * 4 * Math.sin(angle) : 0;
    const pitch = Math.atan2(vertical, tangent);
    return { x: start.x + dx / span * along, z: start.z + dz / span * along,
        y: roadHeight(track, loop.start) + r * (1 - Math.cos(angle)),
        heading: Math.atan2(dx, dz), pitch,
        metric: Math.hypot(tangent, vertical), progress: loop.start + (loop.end - loop.start) * t };
}

export function surfacePose(track, progress) {
    if (track.loop && progress >= track.loop.start && progress <= track.loop.end) {
        return loopPose(track, (progress - track.loop.start) / (track.loop.end - track.loop.start));
    }
    const pose = trackPose(track, progress);
    const step = 1 / track.points.length;
    const a = trackPose(track, progress - step), b = trackPose(track, progress + step);
    return { ...pose, heading: Math.atan2(b.x - a.x, b.z - a.z), y: roadHeight(track, progress), pitch: Math.atan2(
        roadHeight(track, progress + step) - roadHeight(track, progress - step), Math.hypot(b.x - a.x, b.z - a.z)), progress };
}

// Local progress separates overlapping roads: the lower road is never an exit
// from the bridge, even where their x/z coordinates coincide.
export function nearestRoadPoint(track, x, z, hint) {
    const n = track.points.length;
    const center = Number.isFinite(hint) ? Math.floor(hint * n) : null;
    let closest = { distance: Infinity, progress: 0, x: 0, z: 0 };
    const local = track.elevations && center !== null;
    const from = local ? center - 14 : 0, to = local ? center + 14 : n - 1;
    for (let segment = from; segment <= to; segment++) {
        const i = ((segment % n) + n) % n;
        const a = track.points[i], b = track.points[(i + 1) % n];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const f = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
        const px = a[0] + dx * f, pz = a[1] + dz * f;
        const distance = Math.hypot(x - px, z - pz);
        if (distance < closest.distance) closest = { x: px, z: pz, distance, progress: (i + f) / n };
    }
    return closest;
}

export function roadSamples(track) {
    const samples = [];
    for (let i = 0; i < track.points.length; i++) {
        const progress = i / track.points.length;
        if (!track.loop || progress < track.loop.start || progress > track.loop.end) samples.push(surfacePose(track, progress));
    }
    if (track.loop) for (let i = 0; i <= 120; i++) samples.push(loopPose(track, i / 120));
    samples.sort((a, b) => a.progress - b.progress);
    return samples;
}

export function offsetSurface(pose, across, height = 0) {
    const sine = Math.sin(pose.heading), cosine = Math.cos(pose.heading);
    return [pose.x + cosine * across - sine * Math.sin(pose.pitch) * height,
        pose.y + Math.cos(pose.pitch) * height,
        pose.z - sine * across - cosine * Math.sin(pose.pitch) * height];
}
