import { GAME_CONFIG as CONFIG } from './config.js';

// Slip is the measured angle between facing and travel, in radians. Reward the
// resulting slide equally whether it came from steering, throttle or handbrake.
// Zero means no valid drift; valid angles return a smooth 1..maximum reward.
export function driftAngleReward(car) {
    if (!Number.isFinite(car.slip) || !Number.isFinite(car.speed) || car.barrierHit ||
        car.offRoad || car.loopT != null || car.speed < CONFIG.minimumDriftSpeed ||
        car.slip < CONFIG.minimumDriftAngle || car.slip > CONFIG.maximumDriftAngle) return 0;
    const angle = (car.slip - CONFIG.minimumDriftAngle) / (CONFIG.maximumDriftAngle - CONFIG.minimumDriftAngle);
    return 1 + angle * (CONFIG.maximumDriftPointFactor - 1);
}
