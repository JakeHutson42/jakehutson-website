export const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
export const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function formatTime(seconds) {
    const centiseconds = Math.floor(Math.max(0, seconds) * 100);
    return `${String(Math.floor(centiseconds / 6000)).padStart(2, '0')}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
}

// Search segments, rather than vertices, so road distance and lap progress remain smooth.
export function nearestTrackPoint(points, x, z) {
    let closest = { distance: Infinity, progress: 0, x: 0, z: 0 };
    for (let index = 0; index < points.length; index++) {
        const start = points[index];
        const end = points[(index + 1) % points.length];
        const dx = end[0] - start[0];
        const dz = end[1] - start[1];
        const fraction = clamp(((x - start[0]) * dx + (z - start[1]) * dz) / (dx * dx + dz * dz), 0, 1);
        const px = start[0] + dx * fraction;
        const pz = start[1] + dz * fraction;
        const distance = Math.hypot(x - px, z - pz);
        if (distance < closest.distance) closest = { distance, progress: (index + fraction) / points.length, x: px, z: pz };
    }
    return closest;
}

export function trackPose(track, progress = 0) {
    const position = ((progress % 1 + 1) % 1) * track.points.length;
    const index = Math.floor(position);
    const fraction = position - index;
    const start = track.points[index];
    const end = track.points[(index + 1) % track.points.length];
    return { x: start[0] + (end[0] - start[0]) * fraction, z: start[1] + (end[1] - start[1]) * fraction,
        heading: Math.atan2(end[0] - start[0], end[1] - start[1]) };
}
