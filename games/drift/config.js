// Central tuning values: distances are metres, speeds are metres/second, time is seconds.
// Keep presentation settings here so adding a server later does not affect the simulation.
export const GAME_CONFIG = Object.freeze({
    laps: 3,
    archiveDays: 10,
    fixedStep: 1 / 120,
    maximumFrameTime: 0.1,
    resetPenalty: 5,
    storageKey: 'apex-drift:v1',
    maximumRecords: 64,
    maximumSpeed: 39,
    acceleration: 14,
    brakeForce: 25,
    roadGrip: 6.5,
    driftGrip: 1.7,
    steeringRate: 2.2,
    minimumDriftSpeed: 7,
    minimumDriftAngle: 0.20,
    maximumDriftAngle: 1.45,
    comboGrace: 1.4,
});
