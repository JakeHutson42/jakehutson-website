import { nearestTrackPoint, trackPose } from '../drift/math.js';
import { makeDeskTrack } from './desk-track.js';

export const ROOMS = [
    { id: 'desk', name: 'Desk Derby', tag: 'THE HOME OFFICE', description: 'Climb the books. Cross the ruler. Dive underneath it. A whole desk, built for little racers.', surface: '#bf8b62', road: '#eadac0', edge: '#e66b59', accent: '#ffdc70', props: ['pencil', 'notebook', 'mug', 'keyboard', 'eraser', 'clip'], difficulty: 'MULTI-LEVEL / TECHNICAL' },
    { id: 'kitchen', name: 'Kitchen Rush', tag: 'THE BREAKFAST CLUB', description: 'A breakfast-bar blast through cereal, cookies and cutlery. Please mind the morning coffee.', surface: '#b8ceca', road: '#f3eed9', edge: '#438e86', accent: '#f5c75e', props: ['plate', 'cookie', 'mug', 'cereal', 'spoon', 'sponge'], difficulty: 'FAST & TWISTY' },
    { id: 'playroom', name: 'Toybox GP', tag: 'THE PLAYROOM', description: 'Building blocks become grandstands. Dominoes mark the apex. This floor is yours to race.', surface: '#ada2c1', road: '#e9dff0', edge: '#8a64ae', accent: '#f0c85d', props: ['block', 'domino', 'crayon', 'notebook', 'ball', 'train'], difficulty: 'TIGHT & TECHNICAL' }
];

export function seededRandom(seed) {
    let value = 2166136261;
    for (const char of String(seed)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
    return () => {
        value += 0x6D2B79F5;
        let t = Math.imul(value ^ value >>> 15, 1 | value);
        t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function spline(anchors, samples = 1024) {
    return Array.from({ length: samples }, (_, index) => {
        const t = index / samples * anchors.length, i = Math.floor(t), u = t - i;
        const p = offset => anchors[(i + offset + anchors.length) % anchors.length];
        return [0, 1].map(axis => 0.5 * ((2 * p(0)[axis]) + (-p(-1)[axis] + p(1)[axis]) * u +
            (2 * p(-1)[axis] - 5 * p(0)[axis] + 4 * p(1)[axis] - p(2)[axis]) * u * u +
            (-p(-1)[axis] + 3 * p(0)[axis] - 3 * p(1)[axis] + p(2)[axis]) * u * u * u));
    });
}

// Equal arc-length samples make checkpoints, AI look-ahead and scenery spacing agree.
function resample(points, count = 256) {
    const lengths = [0];
    points.forEach((p, i) => lengths.push(lengths[i] + Math.hypot(p[0] - points[(i + 1) % points.length][0], p[1] - points[(i + 1) % points.length][1])));
    const total = lengths.at(-1);
    let segment = 0;
    const result = Array.from({ length: count }, (_, index) => {
        const distance = index * total / count;
        while (lengths[segment + 1] < distance) segment++;
        const a = points[segment], b = points[(segment + 1) % points.length];
        const f = (distance - lengths[segment]) / (lengths[segment + 1] - lengths[segment]);
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    });
    return { points: result, length: total };
}

export const PROP_RADIUS = { pencil: 13, notebook: 18, mug: 11, keyboard: 22, eraser: 8, clip: 8,
    plate: 16, cookie: 9, cereal: 16, spoon: 14, sponge: 11, block: 10, domino: 9, crayon: 13, ball: 10, train: 16 };

export function makeTrack(roomIndex = 0, seed = 'daily') {
    const room = ROOMS[roomIndex % ROOMS.length];
    const random = seededRandom(`pocket-v1:${room.id}:${seed}`);
    if (room.id === 'desk') return makeDeskTrack(room, seed, random);
    // A radial, smooth perimeter avoids ambiguous crossings. Each room has its
    // own bend rhythm; modest seeded offsets keep the whole road safely separated.
    const profiles = [[1, .88, 1, .86, 1, .9, 1, .83, 1, .9, 1, .85],
        [1, .8, .96, 1, .84, 1, .92, .8, 1, .92, .86, 1],
        [1, .78, 1, .85, 1, .78, 1, .84, 1, .8, .96, .85]];
    const anchors = profiles[roomIndex % 3].map((radius, i) => {
        const angle = i / 12 * Math.PI * 2 - Math.PI / 2;
        const r = radius + (random() - .5) * .07;
        return [Math.cos(angle) * 103 * r, Math.sin(angle) * 77 * r];
    });
    const track = { ...resample(spline(anchors)), width: 14, room, seed: String(seed), id: `v1:${room.id}:${seed}`, props: [], boosts: [] };
    const heroes = [
        [{ type: 'notebook', x: -28, z: 0, rotation: -.25 }, { type: 'keyboard', x: 25, z: -14, rotation: .2 }, { type: 'mug', x: 15, z: 24, rotation: .6 }],
        [{ type: 'plate', x: -24, z: 0, rotation: 0 }, { type: 'cereal', x: 24, z: -14, rotation: -.2 }, { type: 'mug', x: 17, z: 23, rotation: .3 }],
        [{ type: 'train', x: -29, z: 0, rotation: -.6 }, { type: 'block', x: 16, z: -15, rotation: .3 }, { type: 'ball', x: 23, z: 19, rotation: 0 }]
    ];
    for (const hero of heroes[roomIndex % 3]) {
        const radius = PROP_RADIUS[hero.type];
        if (nearestTrackPoint(track.points, hero.x, hero.z).distance > track.width / 2 + radius + 3)
            track.props.push({ ...hero, radius, color: Math.floor(random() * 5) });
    }
    // The same geometry defines the visible ribbon, collision corridor and map.
    // Props are outside it, including their full conservative bounding circles.
    for (let attempt = 0; attempt < 650 && track.props.length < 38; attempt++) {
        const type = room.props[attempt % room.props.length], radius = PROP_RADIUS[type];
        const x = (random() - .5) * 252, z = (random() - .5) * 190;
        if (Math.abs(x) + radius > 137 || Math.abs(z) + radius > 105) continue;
        if (nearestTrackPoint(track.points, x, z).distance < track.width / 2 + radius + 3) continue;
        if (track.props.some(p => Math.hypot(p.x - x, p.z - z) < radius + p.radius + 2)) continue;
        track.props.push({ type, x, z, radius, rotation: random() * Math.PI * 2, color: Math.floor(random() * 5) });
    }
    track.boosts = [.16, .49, .80].map(progress => ({ ...trackPose(track, progress), progress }));
    return track;
}
