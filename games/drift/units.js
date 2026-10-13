export const METRES_PER_MILE = 1609.344;
export const SPEEDOMETER_MAX_MPH = 100;
export const miles = metres => metres / METRES_PER_MILE;
export const mph = metresPerSecond => metresPerSecond * 3600 / METRES_PER_MILE;
