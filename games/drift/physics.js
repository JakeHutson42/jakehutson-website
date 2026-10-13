import { GAME_CONFIG as CONFIG } from './config.js';
import { clamp, trackPose } from './math.js';
import { resolveBarrierContacts } from './track-edges.js';
import { nearestRoadPoint, roadHeight, surfacePose, loopPose, advanceLoop } from './road-surface.js';
import { updateDrivingFeedback } from './driving-feedback.js';
import { resolveObstacleContacts } from './obstacles.js';

export function createCar(track, progress = 0) {
    const pose = surfacePose(track, progress);
    return { ...pose, progress, vx: 0, vz: 0, speed: 0, slip: 0, steering: 0, offRoad: false, barrierHit: false,
        loopT: track.loop && progress >= track.loop.start && progress < track.loop.end ?
            (progress - track.loop.start) / (track.loop.end - track.loop.start) : null };
}

// A small arcade model: velocity is split into forward and sideways components.
// The handbrake lowers sideways grip, making countersteering a useful part of driving.
// A fixed update interval keeps grip and scoring consistent across refresh rates.
export function updateCar(car, input, track, deltaTime) {
    const nearest = stepCar(car, input, track, deltaTime);
    updateDrivingFeedback(car, input, deltaTime);
    return nearest;
}

function stepCar(car, input, track, deltaTime) {
    if (car.loopT != null) return updateLoop(car, input, track, deltaTime);
    const forwardX = Math.sin(car.heading);
    const forwardZ = Math.cos(car.heading);
    let forwardSpeed = car.vx * forwardX + car.vz * forwardZ;
    let lateralSpeed = car.vx * forwardZ - car.vz * forwardX;
    const nearest = nearestRoadPoint(track, car.x, car.z, car.progress);
    car.offRoad = nearest.distance > track.width / 2;

    if (input.throttle) forwardSpeed += CONFIG.acceleration * deltaTime;
    if (input.brake) forwardSpeed -= (forwardSpeed > 0.8 ? CONFIG.brakeForce : 7) * deltaTime;
    if (input.handbrake) forwardSpeed *= Math.exp(-0.7 * deltaTime);
    forwardSpeed *= Math.exp(-(car.offRoad ? 1.8 : 0.16) * deltaTime);
    forwardSpeed = clamp(forwardSpeed, -9, CONFIG.maximumSpeed);
    car.steering += (input.steer - car.steering) * (1 - Math.exp(-10 * deltaTime));
    const speedSteering = clamp(Math.abs(forwardSpeed) / 12, 0, 1);
    const driftSteering = input.handbrake ? 1.38 : 1;
    car.heading += -car.steering * CONFIG.steeringRate * speedSteering * Math.sign(forwardSpeed) * driftSteering * deltaTime;

    // Reproject after turning. Momentum follows the old heading until tire grip acts.
    const rotation = -car.steering * CONFIG.steeringRate * speedSteering * Math.sign(forwardSpeed) * driftSteering * deltaTime;
    lateralSpeed -= forwardSpeed * Math.sin(rotation);
    // Gentle steering stays planted; deliberate cornering releases the rear sooner.
    const poweredSlide = Math.abs(car.steering) > 0.35 && forwardSpeed > CONFIG.poweredSlideSpeed;
    const grip = car.offRoad ? 4 : input.handbrake ? CONFIG.driftGrip : poweredSlide ? CONFIG.poweredSlideGrip : CONFIG.roadGrip;
    lateralSpeed *= Math.exp(-grip * deltaTime);
    const nextForwardX = Math.sin(car.heading);
    const nextForwardZ = Math.cos(car.heading);
    car.vx = nextForwardX * forwardSpeed + nextForwardZ * lateralSpeed;
    car.vz = nextForwardZ * forwardSpeed - nextForwardX * lateralSpeed;
    car.x += car.vx * deltaTime;
    car.z += car.vz * deltaTime;
    resolveObstacleContacts(car, track);
    resolveBarrierContacts(car, track, deltaTime);
    car.speed = Math.hypot(car.vx, car.vz);
    const resolvedForward = car.vx * nextForwardX + car.vz * nextForwardZ;
    const resolvedLateral = car.vx * nextForwardZ - car.vz * nextForwardX;
    car.slip = Math.abs(Math.atan2(resolvedLateral, Math.max(0.01, resolvedForward)));
    const finalRoad = nearestRoadPoint(track, car.x, car.z, car.progress);
    car.offRoad = finalRoad.distance > track.width / 2;
    if (track.loop && nearest.progress < track.loop.start && finalRoad.progress >= track.loop.start &&
        forwardSpeed > 0 && !car.offRoad) {
        car.loopT = 0;
        // The entry pad supplies a minimum 45 mph, then magnetic arcade grip
        // keeps the car attached. No uphill gravity penalty or inverted stalls.
        car.speed = Math.max(track.loop.minimumSpeed, car.speed);
        const remaining = deltaTime * clamp((finalRoad.progress - track.loop.start) /
            Math.max(1e-9, finalRoad.progress - nearest.progress), 0, 1);
        return updateLoop(car, input, track, remaining);
    }
    car.progress = finalRoad.progress;
    car.y = roadHeight(track, car.progress);
    car.pitch = surfacePose(track, car.progress).pitch;
    return finalRoad;
}

function updateLoop(car, input, track, deltaTime) {
    const minimum = track.loop.minimumSpeed;
    car.speed = clamp(Math.max(minimum, car.speed) + (input.throttle ? CONFIG.acceleration : 0) * deltaTime -
        (input.brake ? CONFIG.brakeForce * deltaTime : 0), minimum, CONFIG.maximumSpeed);
    car.loopT = advanceLoop(track,car.loopT,car.speed*deltaTime);
    const pose = loopPose(track, car.loopT);
    Object.assign(car, pose, { vx: pose.frame.forward[0] * car.speed,
        vz: pose.frame.forward[2] * car.speed, steering: 0, slip: 0, barrierHit: false, obstacleHit: false, offRoad: false });
    if (car.loopT >= 1) { car.loopT = null; car.pitch = 0; delete car.frame; }
    return { x: car.x, z: car.z, progress: pose.progress, distance: 0 };
}
