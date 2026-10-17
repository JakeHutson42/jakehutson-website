/** Anticipate authored terrain without constraining the simulation. */
export function cameraFrame(course, pose, speed, aspect = 1.8) {
    const x = pose.x, jump = course.jump;
    let look = 1.7 + Math.min(Math.max(speed, 0) * .21, 1.8);
    let y = Math.max(.9, pose.y + .6), distance = 12.5;
    if (jump && x > jump.approach - 2 && x < jump.end) {
        const influence = Math.min(1, (x - jump.approach + 2) / 4, (jump.end - x) / 4);
        const centre = (jump.takeoff[0] + jump.landing[0]) / 2;
        look += Math.min(2, Math.max(0, centre - x - look)) * influence;
        y = Math.max(y, (jump.takeoff[1] + jump.landing[1]) / 2 + 1);
        distance += 3 * influence;
    }
    // Narrow windows need enough horizontal field of view to read the landing.
    distance *= Math.max(1, 1.45 / Math.max(.6, aspect));
    return { x: x + look, y, distance };
}
