// Central tuning values: distances are metres, speeds are metres/second, time is seconds.
// Keep presentation settings here so adding a server later does not affect the simulation.
export const GAME_CONFIG = Object.freeze({
    laps: 3,
    archiveDays: 10,
    fixedStep: 1 / 120,
    maximumFrameTime: 0.1,
    resetPenalty: 5,
    // Redesigned layouts and elevation need their own records. Preserve earlier
    // device data rather than comparing runs on different circuits.
    storageKey: 'apex-drift:v13',
    maximumRecords: 64,
    maximumSpeed: 40,
    acceleration: 17.5,
    brakeForce: 28,
    roadGrip: 6,
    // 10% less lateral grip in both slide modes; retain normal recovery grip.
    driftGrip: 1.08,
    poweredSlideGrip: 1.935,
    slideCarrySeconds: 0.45,
    handbrakeDrag: 0.52,
    steeringRate: 1.85,
    poweredSlideSpeed: 11,
    minimumDriftSpeed: 7,
    minimumDriftAngle: 0.20,
    maximumDriftAngle: 1.45,
    maximumDriftPointFactor: 2,
    maximumDriftTierRate: 1.35,
    comboGrace: 1.8,
    // Base pace is 35% slower than the original. Sharper angles build faster;
    // even at the steepest valid angle each tier takes at least 1.8 seconds.
    comboTierSeconds: 2.43,
});

// Rendering and collision share the same verge and wall dimensions. Cosmetic
// cars use one generous hitbox, keeping the daily challenge fair across models.
export const TRACK_EDGE_CONFIG = Object.freeze({
    vergeWidth: 1,
    barrierThickness: 0.5,
    barrierHeight: 0.95,
    lineWidth: 0.32,
    carHalfWidth: 1.05,
    carHalfLength: 2.3,
    contactMargin: 0.12,
    restitution: 0.08,
    scrapeDrag: 3,
});

// A low chase view leaves the car in the lower third and makes the approaching
// bend readable, with a modest speed-dependent widening and lower viewpoint.
export const CAMERA_CONFIG = Object.freeze({
    fieldOfView: 56,
    speedFieldOfView: 12,
    speedHeightDrop: 0.8,
    followDistance: 9,
    followHeight: 4.4,
    lookAhead: 11,
    targetHeight: 1,
    headingResponse: 3.5,
});
