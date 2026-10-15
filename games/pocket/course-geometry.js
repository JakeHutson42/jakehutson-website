// Shared, smoothly joined edge vertices for ramp skins and pencil barriers.
// Read samples directly: outgoing segment headings produce asymmetric corners.
export function courseEdges(track, clearance = 0, lift = 0) {
    const count = track.points.length;
    return [-1, 1].map(side => track.points.map((point, i) => {
        const previous = track.points[(i + count - 1) % count], next = track.points[(i + 1) % count];
        const dx = next[0] - previous[0], dz = next[1] - previous[1], length = Math.hypot(dx, dz);
        const surface = track.surfaces[i], offset = (surface.width / 2 + clearance) * side;
        return { x: point[0] + dz / length * offset, y: surface.y + lift, z: point[1] - dx / length * offset };
    }));
}

export function pencilSegments(track) {
    const edges = courseEdges(track, .7, .88), segments = [];
    edges.forEach((edge, side) => {
        // Endpoints are shared, including the final-to-first closing segment.
        // Painted bodies overlap by 1.2 units; tips and erasers add more overlap.
        for (let i = 0; i < edge.length; i += 4) {
            const a = edge[i], b = edge[(i + 4) % edge.length];
            segments.push({ a, b, side, index: i, length: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) + 1.2 });
        }
    });
    return segments;
}
