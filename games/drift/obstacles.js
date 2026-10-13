import { trackPose, wrapAngle } from './math.js';
import { roadHeight } from './road-surface.js';
import { TRACK_EDGE_CONFIG as EDGE } from './config.js';

const cache = new WeakMap();
const distanceProgress = (a, b) => Math.min(Math.abs(a-b), 1-Math.abs(a-b));

export function roadObstacles(track) {
    if (cache.has(track)) return cache.get(track);
    const obstacles = [];
    // Old/synthetic fixtures remain obstacle-free; every published city layout
    // uses the same deterministic placements for rendering, contact and bonuses.
    if (!track.layout) { cache.set(track, obstacles); return obstacles; }
    for (let i = 28; i < track.points.length - 28 && obstacles.length < 8; i += 3) {
        const progress = i / track.points.length;
        if (roadHeight(track, progress) > 0.1) continue;
        if (track.loop && progress > track.loop.start - 140/track.length && progress < track.loop.end + 140/track.length) continue;
        if ((track.bridges || []).some(b => [b.upper,b.lower].some(p => distanceProgress(p,progress)*track.length < 150))) continue;
        if ([0,0.25,0.5,0.75].some(p => distanceProgress(p,progress)*track.length < 45)) continue;
        if (obstacles.some(o => distanceProgress(o.progress,progress)*track.length < 190)) continue;
        const pose = trackPose(track, progress);
        const before = trackPose(track, progress - 24/track.length), after = trackPose(track, progress + 24/track.length);
        if (Math.abs(wrapAngle(after.heading-before.heading)) > 0.45 ||
            Math.abs(wrapAngle(pose.heading-before.heading)) > 0.26) continue;
        const side = (obstacles.length + (track.seed >>> 1)) % 2 ? 1 : -1;
        const offset = side * (track.width/2 - 1.35);
        obstacles.push({ id: obstacles.length, progress, side, heading: pose.heading,
            x: pose.x + Math.cos(pose.heading)*offset, z: pose.z-Math.sin(pose.heading)*offset,
            y: roadHeight(track, progress), halfWidth: 0.95, halfLength: 2.3,
            type: obstacles.length % 2 ? 'construction' : 'parked-car' });
    }
    cache.set(track, obstacles); return obstacles;
}

// Rectangle separation on the two cars' local axes; corner contacts are resolved
// without an oversized circle that would block the clear passing lane.
export function obstacleOverlap(car, obstacle) {
    const axes = heading => [[Math.cos(heading), -Math.sin(heading)], [Math.sin(heading), Math.cos(heading)]];
    const a = axes(car.heading), b = axes(obstacle.heading);
    const dx = car.x-obstacle.x, dz = car.z-obstacle.z;
    let minimum = Infinity, normal;
    for (const axis of [...a,...b]) {
        const dot = v => Math.abs(v[0]*axis[0]+v[1]*axis[1]);
        const ra = EDGE.carHalfWidth*dot(a[0])+EDGE.carHalfLength*dot(a[1]);
        const rb = obstacle.halfWidth*dot(b[0])+obstacle.halfLength*dot(b[1]);
        const signed = dx*axis[0]+dz*axis[1], overlap = ra+rb-Math.abs(signed);
        if (overlap <= 0) return null;
        if (overlap < minimum) { minimum = overlap; const side = signed >= 0 ? 1 : -1; normal = [axis[0]*side,axis[1]*side]; }
    }
    return { penetration: minimum, normal };
}

export function resolveObstacleContacts(car, track) {
    car.obstacleHit = false;
    if (car.loopT != null) return;
    for (const obstacle of roadObstacles(track)) {
        if (Math.abs((car.y || 0)-obstacle.y) > 3 || Math.hypot(car.x-obstacle.x,car.z-obstacle.z) > 8) continue;
        const hit = obstacleOverlap(car, obstacle);
        if (!hit) continue;
        car.x += hit.normal[0]*(hit.penetration+0.015); car.z += hit.normal[1]*(hit.penetration+0.015);
        const incoming = car.vx*hit.normal[0]+car.vz*hit.normal[1];
        if (incoming < 0) { car.vx -= hit.normal[0]*incoming; car.vz -= hit.normal[1]*incoming; }
        car.vx *= 0.8; car.vz *= 0.8; car.obstacleHit = true;
    }
}

// Award only after a complete forward pass. A touch anywhere in the encounter
// invalidates it, and each obstacle can pay out once per lap, including resets.
export class NearMissChallenges {
    constructor(track) { this.obstacles = roadObstacles(track); this.encounters = new Map(); this.claimed = new Set(); }
    resetEncounter() { this.encounters.clear(); }
    update(car, lap) {
        let bonus = 0;
        for (const obstacle of this.obstacles) {
            const key = `${lap}:${obstacle.id}`;
            if (this.claimed.has(key)) continue;
            const dx = car.x-obstacle.x, dz = car.z-obstacle.z;
            const along = dx*Math.sin(obstacle.heading)+dz*Math.cos(obstacle.heading);
            const across = Math.abs(dx*Math.cos(obstacle.heading)-dz*Math.sin(obstacle.heading));
            const forward = car.vx*Math.sin(obstacle.heading)+car.vz*Math.cos(obstacle.heading);
            if (Math.abs((car.y || 0)-obstacle.y)>2 || across>9) { this.encounters.delete(key); continue; }
            let encounter = this.encounters.get(key);
            if (!encounter && along < -5 && along > -14 && forward > 12) {
                encounter = { clean: true, close: false }; this.encounters.set(key, encounter);
            }
            if (!encounter) continue;
            if (forward < 8 || car.barrierHit || car.obstacleHit || car.offRoad) encounter.clean = false;
            if (Math.abs(along)<2.5) {
                const angle = car.heading-obstacle.heading;
                const extent = EDGE.carHalfWidth*Math.abs(Math.cos(angle))+EDGE.carHalfLength*Math.abs(Math.sin(angle));
                const clearance = across-obstacle.halfWidth-extent;
                if (clearance>0.05 && clearance<1.25) encounter.close = true;
                if (clearance<=0.05) encounter.clean = false;
            }
            if (along>5) {
                this.claimed.add(key); this.encounters.delete(key);
                if (encounter.clean && encounter.close && forward>12) bonus += 250;
            }
        }
        return bonus;
    }
}
