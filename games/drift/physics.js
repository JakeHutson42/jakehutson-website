import { GAME_CONFIG as CONFIG } from './config.js';
import { clamp, nearestTrackPoint, trackPose } from './math.js';
import { resolveBarrierContacts } from './track-edges.js';

export function createCar(track, progress = 0) {
    return { ...trackPose(track, progress), vx: 0, vz: 0, speed: 0, slip: 0, steering: 0, offRoad: false, barrierHit: false };
}

// A small arcade model: velocity is split into forward and sideways components.
// The handbrake lowers sideways grip, making countersteering a useful part of driving.
// A fixed update interval keeps grip and scoring consistent across refresh rates.
export function updateCar(car, input, track, deltaTime) {
    const forwardX = Math.sin(car.heading);
    const forwardZ = Math.cos(car.heading);
    let forwardSpeed = car.vx * forwardX + car.vz * forwardZ;
    let lateralSpeed = car.vx * forwardZ - car.vz * forwardX;
    const nearest = nearestTrackPoint(track.points, car.x, car.z);
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
    resolveBarrierContacts(car, track, deltaTime);
    car.speed = Math.hypot(car.vx, car.vz);
    const resolvedForward = car.vx * nextForwardX + car.vz * nextForwardZ;
    const resolvedLateral = car.vx * nextForwardZ - car.vz * nextForwardX;
    car.slip = Math.abs(Math.atan2(resolvedLateral, Math.max(0.01, resolvedForward)));
    const finalRoad = nearestTrackPoint(track.points, car.x, car.z);
    car.offRoad = finalRoad.distance > track.width / 2;
    return finalRoad;
}
