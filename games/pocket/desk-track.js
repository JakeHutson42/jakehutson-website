import { nearestTrackPoint } from '../drift/math.js';
import { surfacePose } from './surface.js';

// A designed sequence of compatible household surfaces. Position is a smooth
// closed curve; height transitions ease between book covers and the desktop.
const MODULES = [
    [-120, 60, 0, 24, 'wood'], [-110, 60, 0, 20, 'ramp'], [-95, 60, 4, 20, 'book'],
    [-73, 60, 4, 20, 'book'], [-60, 34, 4, 18, 'ramp'], [-60, 14, 12, 16, 'book'],
    [-38, 0, 12, 12, 'ruler'], [0, 0, 12, 12, 'ruler'], [38, 0, 12, 16, 'book'],
    [60, 0, 12, 20, 'book'], [76, -18, 12, 16, 'ramp'], [91, -45, 0, 20, 'wood'],
    [120, -55, 0, 18, 'paper'], [143, -80, 0, 18, 'paper'], [127, -108, 0, 20, 'wood'],
    [88, -110, 0, 22, 'mat'], [51, -105, 0, 20, 'mat'], [25, -87, 0, 18, 'mat'],
    [10, -55, 0, 16, 'wood'], [0, -25, 0, 18, 'wood'], [0, 0, 0, 18, 'wood'],
    [-4, 30, 0, 20, 'wood'], [18, 58, 0, 22, 'paper'], [50, 74, 0, 20, 'paper'],
    [78, 88, 0, 18, 'wood'], [72, 112, 0, 18, 'wood'], [33, 120, 0, 20, 'wood'],
    [-2, 111, 0, 20, 'wood'], [-34, 116, 0, 18, 'wood'], [-70, 96, 0, 16, 'wood'],
    [-112, 114, 0, 22, 'wood'], [-138, 82, 0, 24, 'wood'], [-138, 60, 0, 24, 'wood']
];
const ease = t => t * t * (3 - 2 * t);

export function makeDeskTrack(room, seed, random) {
    const anchors = MODULES.map((point, i) => {
        // Small variations preserve the designed object connections. The ruler
        // and its underpass remain aligned; complex modules are never random soup.
        const movable = i >= 11 && i <= 18 || i >= 22 && i <= 29;
        return [point[0] + (movable ? (random() - .5) * 3 : 0),
            point[1] + (movable ? (random() - .5) * 3 : 0), ...point.slice(2)];
    });
    const dense = [], lengths = [0];
    for (let i = 0; i < anchors.length; i++) {
        const p = offset => anchors[(i + offset + anchors.length) % anchors.length];
        for (let s = 0; s < 48; s++) {
            const t = s / 48;
            const coordinates = [0, 1].map(axis => .5 * (2 * p(0)[axis] + (-p(-1)[axis] + p(1)[axis]) * t +
                (2 * p(-1)[axis] - 5 * p(0)[axis] + 4 * p(1)[axis] - p(2)[axis]) * t * t +
                (-p(-1)[axis] + 3 * p(0)[axis] - 3 * p(1)[axis] + p(2)[axis]) * t * t * t));
            dense.push({ x: coordinates[0], z: coordinates[1], y: p(0)[2] + (p(1)[2] - p(0)[2]) * ease(t),
                width: p(0)[3] + (p(1)[3] - p(0)[3]) * ease(t), kind: p(0)[4] });
        }
    }
    dense.forEach((a, i) => { const b = dense[(i + 1) % dense.length]; lengths.push(lengths[i] + Math.hypot(a.x - b.x, a.z - b.z)); });
    const length = lengths.at(-1), points = [], surfaces = [];
    let j = 0;
    for (let i = 0; i < 512; i++) {
        const distance = i * length / 512;
        while (lengths[j + 1] < distance) j++;
        const a = dense[j], b = dense[(j + 1) % dense.length], f = (distance - lengths[j]) / (lengths[j + 1] - lengths[j]);
        points.push([a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f]);
        surfaces.push({ y: a.y + (b.y - a.y) * f, width: a.width + (b.width - a.width) * f, kind: a.kind });
    }
    const track = { room, seed: String(seed), id: `v2:desk:${seed}`, points, surfaces, length, width: 20,
        bounds: { width: 350, depth: 285 }, props: [], boosts: [], authored: true,
        features: ['BOOK CLIMB', 'RULER BRIDGE', 'UNDERPASS', 'PAPER SWEEP', 'PENCIL CHICANE'] };
    const candidates = [
        ['keyboard', -64, -64, 37, -.12], ['notebook', -115, -42, 19, .22],
        ['mug', -29, -43, 12, -.3], ['mug', 58, 41, 12, .4],
        ['pencil', -102, -91, 13, 1.1], ['pencil', -100, 13, 13, .1],
        ['clip', -38, 55, 8, .4], ['eraser', 106, 13, 8, -.2],
        ['notebook', -26, -111, 19, -.1], ['clip', 111, 110, 8, .3],
        ['pencil', 105, -16, 13, .7], ['eraser', -18, 77, 8, .4]
    ];
    const add = (type, x, z, radius, rotation) => {
        if (nearestTrackPoint(points, x, z).distance < radius + 15) return;
        if (track.props.some(p => Math.hypot(x - p.x, z - p.z) < radius + p.radius + 2)) return;
        track.props.push({ type, x, z, radius, rotation, color: Math.floor(random() * 5) });
    };
    candidates.forEach(args => add(...args));
    for (let i = 0; i < 400 && track.props.length < 18; i++) {
        const type = ['pencil', 'clip', 'eraser'][i % 3], radius = type === 'pencil' ? 13 : 8;
        const x = (random() - .5) * 310, z = (random() - .5) * 245;
        add(type, x, z, radius, random() * Math.PI * 2);
    }
    // Two pads on wood, one on the cutting mat. No boosts launch cars into the
    // narrow ruler. Explicit surface heights prevent claims from the underpass.
    track.boosts = [.46, .69, .89].map(progress => ({ ...surfacePose(track, progress), progress }));
    return track;
}
