import { clamp } from './math.js';
import { driftAngleReward } from './drift-scoring.js';

export function driftIntensity(car) {
    if (car.barrierHit || car.offRoad || car.loopT != null || car.speed < 7) return 0;
    return clamp((car.slip - 0.16) / 0.85, 0, 1) * clamp(car.speed / 22, 0, 1);
}

// Cosmetic automatic gearbox: engine pitch and gauges share the same readings.
// Gear changes never alter the established acceleration or handling model.
export function updateDrivingFeedback(car, input, dt) {
    car.throttle = Boolean(input.throttle);
    car.braking = Boolean(input.brake || input.handbrake);
    const brakeHeating = car.braking && car.speed > 5 ? 0.45 + car.speed / 55 : 0;
    const angleReward = driftAngleReward(car);
    const driftHeating = angleReward ? 0.35 + angleReward * 0.5 : 0;
    // Keep brake lights tied to pedals; wheel heat also follows natural slides.
    const heating = Math.max(brakeHeating, driftHeating) || -0.16;
    car.brakeHeat = clamp((car.brakeHeat || 0) + heating * dt, 0, 1);
    const forward = car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading);
    car.reverse = forward < -0.8;
    let gear = Number.isInteger(car.gear) ? car.gear : 1;
    const boundaries = [0, 9, 17, 25, 33, 43];
    while (gear < 5 && car.speed > boundaries[gear]) gear++;
    while (gear > 1 && car.speed < boundaries[gear - 1] - 2) gear--;
    car.gear = gear;
    car.gearLabel = car.reverse ? 'R' : car.speed < 0.5 && !input.throttle ? 'N' : String(gear);
    car.rpm = clamp(950 + car.speed / (car.reverse ? 10 : boundaries[gear]) * 6200, 950, 8000);
}
