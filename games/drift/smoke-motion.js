// Project actual sideways momentum, so countersteering cannot reverse the plume.
export function smokeVelocity(car) {
    const forwardX = Math.sin(car.heading), forwardZ = Math.cos(car.heading);
    const lateral = car.vx * forwardZ - car.vz * forwardX;
    return {
        x: -forwardX * 2 - forwardZ * lateral * 0.65,
        z: -forwardZ * 2 + forwardX * lateral * 0.65,
    };
}
