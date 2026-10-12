// Central tuning values: distances are metres, speeds are metres/second, time is seconds.
// Keep presentation settings here so adding a server later does not affect the simulation.
export const GAME_CONFIG = Object.freeze({
    laps: 3,
    archiveDays: 10,
    fixedStep: 1 / 120,
    maximumFrameTime: 0.1,
    resetPenalty: 5,
    // Revised circuits and barriers need their own personal records. Keep old data
    // untouched on the device rather than comparing times on different layouts.
    storageKey: 'apex-drift:v3',
    maximumRecords: 64,
    maximumSpeed: 32,
    acceleration: 11,
    brakeForce: 22,
    roadGrip: 6.5,
    driftGrip: 1.7,
    steeringRate: 1.85,
    poweredSlideSpeed: 12,
    minimumDriftSpeed: 7,
    minimumDriftAngle: 0.20,
    maximumDriftAngle: 1.45,
    comboGrace: 1.4,
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
// bend readable. Keep the view steady instead of widening the lens with speed.
export const CAMERA_CONFIG = Object.freeze({
    fieldOfView: 52,
    followDistance: 10,
    followHeight: 4.8,
    lookAhead: 10,
    targetHeight: 1,
    headingResponse: 3.5,
});
