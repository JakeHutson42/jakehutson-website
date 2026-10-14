import { clamp, wrapAngle, trackPose } from '../drift/math.js';
import { updateDrivingFeedback } from '../drift/driving-feedback.js';
import { surfacePose, nearestSurfacePoint } from './surface.js';

export const STEP = 1 / 120;
export const LAPS = 3;
export const RACERS = [
    { name: 'YOU', color: '#f8cf5c', model: 'coupe' },
    { name: 'POPPY', color: '#ed736c', model: 'hatch' },
    { name: 'MINT', color: '#65c9b2', model: 'coupe' },
    { name: 'BOLT', color: '#a28ce5', model: 'muscle' }
];

export function createDriver(track, index) {
    const progress = 1 - (8 + Math.floor(index / 2) * 7) / track.length;
    const pose = surfacePose(track, progress), lane = (index % 2 ? 1 : -1) * 2.6;
    return { ...pose, x: pose.x + Math.cos(pose.heading) * lane, z: pose.z - Math.sin(pose.heading) * lane,
        index, progress, previousProgress: progress, vx: 0, vz: 0, speed: 0, steering: 0, slip: 0,
        distance: 0, gate: 0, laps: 0, started: false, lapStart: 0, lapTimes: [], finished: false,
        boost: 0, boostClaims: new Set(), barrierHit: false, resetProgress: progress, stuck: 0 };
}

export function drive(car, input, track, dt) {
    let forward = car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading);
    let lateral = car.vx * Math.cos(car.heading) - car.vz * Math.sin(car.heading);
    car.boost = Math.max(0, car.boost - dt);
    if (input.throttle) forward += (car.boost > 0 ? 39 : 25) * dt;
    if (input.brake) forward -= (forward > .5 ? 42 : 10) * dt;
    forward *= Math.exp(-(input.handbrake ? .7 : .24) * dt);
    forward = clamp(forward, -9, car.boost > 0 ? 53 : 38);
    const steer = clamp(Number(input.steer) || 0, -1, 1);
    car.steering += (steer - car.steering) * (1 - Math.exp(-14 * dt));
    const rotation = -car.steering * 2.9 * clamp(Math.abs(forward) / 11, 0, 1) * Math.sign(forward) * (input.handbrake ? 1.26 : 1) * dt;
    car.heading = wrapAngle(car.heading + rotation);
    lateral -= forward * Math.sin(rotation);
    const surfaceGrip = car.surfaceKind === 'paper' ? 7.5 : car.surfaceKind === 'mat' ? 12 : 10;
    lateral *= Math.exp(-(input.handbrake ? 2.5 : surfaceGrip) * dt);
    car.vx = Math.sin(car.heading) * forward + Math.cos(car.heading) * lateral;
    car.vz = Math.cos(car.heading) * forward - Math.sin(car.heading) * lateral;
    car.x += car.vx * dt; car.z += car.vz * dt;
    car.barrierHit = false;
    // Capsule contacts at both bumpers keep the entire shared car model within
    // the tape barriers, not just its centre. Rendering uses this exact width.
    for (const offset of [-1.6, 0, 1.6]) {
        const x = car.x + Math.sin(car.heading) * offset, z = car.z + Math.cos(car.heading) * offset;
        const near = nearestSurfacePoint(track, x, z, car.progress), limit = near.width / 2 - 1.2;
        if (near.distance > limit) {
            const nx = (x - near.x) / near.distance, nz = (z - near.z) / near.distance;
            const penetration = near.distance - limit;
            car.x -= nx * penetration; car.z -= nz * penetration;
            const outward = Math.max(0, car.vx * nx + car.vz * nz);
            car.vx -= nx * outward * 1.08; car.vz -= nz * outward * 1.08;
            car.vx *= Math.exp(-2 * dt); car.vz *= Math.exp(-2 * dt);
            car.barrierHit = true;
        }
    }
    const near = nearestSurfacePoint(track, car.x, car.z, car.progress);
    car.progress = near.progress;
    car.y = near.y; car.pitch = near.pitch || 0; car.surfaceKind = near.kind;
    car.speed = Math.hypot(car.vx, car.vz);
    car.slip = Math.abs(Math.atan2(lateral, Math.max(.01, Math.abs(forward))));
    updateDrivingFeedback(car, input, dt);
    return near;
}

export function aiInput(car, track) {
    const ahead = surfacePose(track, car.progress + (8 + car.speed * .23) / track.length);
    const error = wrapAngle(Math.atan2(ahead.x - car.x, ahead.z - car.z) - car.heading);
    const later = trackPose(track, car.progress + 24 / track.length);
    const bend = Math.abs(wrapAngle(later.heading - ahead.heading));
    const target = clamp(32 - bend * 20 + car.index * .8 - Math.max(0, 16 - ahead.width) * 1.3, 15, 33);
    return { throttle: car.speed < target, brake: car.speed > target + 2,
        steer: clamp(-error * 2.0, -1, 1), handbrake: false };
}

export class PocketRace {
    constructor(track, mode = 'cup') {
        this.track = track; this.mode = mode;
        this.cars = Array.from({ length: mode === 'trial' ? 1 : 4 }, (_, index) => createDriver(track, index));
        this.state = 'countdown'; this.countdown = 3; this.elapsed = 0; this.penalty = 0;
        this.finishOrder = []; this.events = [];
    }
    get player() { return this.cars[0]; }
    get ranking() {
        return [...this.cars].sort((a, b) => {
            if (a.finished || b.finished) return a.finished && b.finished ? a.finishTime - b.finishTime : a.finished ? -1 : 1;
            return (b.laps + (b.started ? 0 : -1) + b.progress) - (a.laps + (a.started ? 0 : -1) + a.progress);
        });
    }
    update(input, dt) {
        this.events = [];
        if (this.state === 'countdown') {
            this.countdown -= dt;
            if (this.countdown <= 0) { this.state = 'racing'; this.events.push('go'); }
            return;
        }
        if (this.state !== 'racing') return;
        this.elapsed += dt;
        for (const car of this.cars) {
            if (car.finished) continue;
            drive(car, car.index === 0 ? input : aiInput(car, this.track), this.track, dt);
            this.updateProgress(car);
            this.track.boosts.forEach((pad, index) => {
                const claim = `${car.laps}:${index}`;
                if (!car.boostClaims.has(claim) && Math.hypot(car.x - pad.x, car.z - pad.z) < 4 && Math.abs((car.y || 0) - (pad.y || 0)) < 2 && car.speed > 8) {
                    car.boostClaims.add(claim); car.boost = .9;
                    if (car.index === 0) this.events.push('boost');
                }
            });
            // AI recovery is visible and costs time; it never changes lap gates.
            if (car.index) {
                car.stuck = car.speed < 3 ? car.stuck + dt : 0;
                if (car.stuck > 2.5) { this.reset(car, false); car.stuck = 0; }
            }
        }
        this.resolveCars();
        // Finish the player's event when their third lap ends. Remaining rivals
        // get their current on-track order for cup points, without fabricating times.
        if (this.player.finished) { this.state = 'finished'; this.events.push('finish'); }
    }
    updateProgress(car) {
        let delta = car.progress - car.previousProgress;
        if (delta > .5) delta--;
        if (delta < -.5) delta++;
        // Ignore teleports and backward gate crossings. A lap requires all seven
        // ordered gates, then a forward crossing of the actual finish line.
        const valid = delta > 0 && delta < .025;
        const crossedLine = car.previousProgress > .9 && car.progress < .1 && valid;
        if (!car.started && crossedLine) { car.started = true; car.lapStart = this.elapsed; car.gate = 1; }
        else if (car.started && valid) {
            const next = car.gate / 8;
            if (car.gate < 8 && car.previousProgress < next && car.progress >= next) {
                car.gate++; car.resetProgress = Math.max(0, next - .012);
            }
            if (crossedLine && car.gate === 8) {
                car.laps++; car.lapTimes.push(this.elapsed - car.lapStart); car.lapStart = this.elapsed;
                car.gate = 1; car.resetProgress = .005;
                if (car.index === 0) this.events.push('lap');
                if (car.laps === LAPS) {
                    car.finished = true; car.finishTime = this.elapsed + (car.index === 0 ? this.penalty : 0);
                    this.finishOrder.push(car.index);
                }
            }
        }
        car.previousProgress = car.progress;
    }
    resolveCars() {
        for (let i = 0; i < this.cars.length; i++) for (let j = i + 1; j < this.cars.length; j++) {
            const a = this.cars[i], b = this.cars[j];
            if (a.finished || b.finished) continue;
            if (Math.abs((a.y || 0) - (b.y || 0)) > 2.5) continue;
            const dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
            if (distance > 0 && distance < 2.5) {
                const nx = dx / distance, nz = dz / distance, push = (2.5 - distance) * .5;
                a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
                const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
                if (closing > 0) { a.vx -= nx * closing * .55; a.vz -= nz * closing * .55; b.vx += nx * closing * .55; b.vz += nz * closing * .55; }
            }
        }
    }
    reset(car = this.player, penalize = true) {
        if (!['racing', 'countdown'].includes(this.state) || car.finished) return;
        Object.assign(car, surfacePose(this.track, car.resetProgress), { vx: 0, vz: 0, speed: 0, steering: 0, boost: 0,
            progress: car.resetProgress, previousProgress: car.resetProgress });
        if (penalize) { this.penalty += 3; this.events.push('reset'); }
    }
}
