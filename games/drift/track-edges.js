import { TRACK_EDGE_CONFIG as EDGE } from './config.js';
import { nearestTrackPoint } from './math.js';

// Offset a vertex along its smoothed normal. Both road ribbons and walls use
// these vertices, so wall segments join continuously even around tight bends.
export function offsetTrackPoint(points, index, offset) {
    const point = points[index % points.length];
    const before = points[(index + points.length - 1) % points.length];
    const after = points[(index + 1) % points.length];
    const length = Math.hypot(after[0] - before[0], after[1] - before[1]);
    return [point[0] + (after[1] - before[1]) / length * offset,
        point[1] - (after[0] - before[0]) / length * offset];
}

export function carContactPoints(car) {
    const forward = [Math.sin(car.heading), Math.cos(car.heading)];
    const right = [forward[1], -forward[0]];
    const points = [];
    for (const along of [-EDGE.carHalfLength, 0, EDGE.carHalfLength]) {
        // Checking side and bumper centres as well as corners catches the concave side
        // of a bend without treating a rotated car as a large bounding circle.
        for (const across of [-EDGE.carHalfWidth, 0, EDGE.carHalfWidth]) {
            if (along === 0 && across === 0) continue;
            points.push([car.x + forward[0] * along + right[0] * across,
                car.z + forward[1] * along + right[1] * across]);
        }
    }
    return points;
}

export function resolveBarrierContacts(car, track, deltaTime) {
    const maximumDistance = track.width / 2 + EDGE.vergeWidth - EDGE.contactMargin;
    car.barrierHit = false;
    // Distance to a curve cannot increase by more than the distance moved.
    // This conservative circle skips corner searches when the entire body is
    // comfortably clear, keeping normal driving inexpensive on mobile devices.
    const bodyRadius = Math.hypot(EDGE.carHalfWidth, EDGE.carHalfLength);
    if (nearestTrackPoint(track.points, car.x, car.z).distance + bodyRadius <= maximumDistance) {
        return { contact: false, impactSpeed: 0 };
    }
    let contact = false; let impactSpeed = 0;
    // Resolve several corners in turn. Additional passes settle a sideways car
    // against a curved wall without bouncing it between competing contacts.
    for (let pass = 0; pass < 4; pass++) {
        let corrected = false;
        for (let contactIndex = 0; contactIndex < 8; contactIndex++) {
            // Earlier contacts move the whole car; sample the next bumper point
            // from its corrected pose instead of applying stale penetrations.
            const [x, z] = carContactPoints(car)[contactIndex];
            const road = nearestTrackPoint(track.points, x, z);
            if (road.distance <= maximumDistance) continue;
            const normalX = (x - road.x) / road.distance;
            const normalZ = (z - road.z) / road.distance;
            const penetration = road.distance - maximumDistance;
            car.x -= normalX * penetration; car.z -= normalZ * penetration;
            const outwardSpeed = car.vx * normalX + car.vz * normalZ;
            if (outwardSpeed > 0) {
                impactSpeed = Math.max(impactSpeed, outwardSpeed);
                car.vx -= normalX * outwardSpeed * (1 + EDGE.restitution);
                car.vz -= normalZ * outwardSpeed * (1 + EDGE.restitution);
            }
            corrected = true; contact = true;
        }
        if (!corrected) break;
    }
    if (contact) {
        // Preserve motion along the wall, but make scraping slower than driving
        // cleanly. Per-second drag behaves consistently at every refresh rate.
        const retention = Math.exp(-EDGE.scrapeDrag * deltaTime);
        car.vx *= retention; car.vz *= retention;
    }
    // A sustained scrape must not become a way to farm drift points along a wall.
    car.barrierHit = contact;
    return { contact, impactSpeed };
}
