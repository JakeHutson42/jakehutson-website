/** Explicit integration witness, never used for player input or records. */
export function witnessControls(game, memory) {
    const x = game.chassis.getPosition().x, speed = game.chassis.getLinearVelocity().x;
    const limit = (v,a,b) => Math.max(a,Math.min(b,v));
    if(x>83)return {throttle:1,lean:x<89?-.3:1};
    const target=x<72?8.5:3.5;
    return {throttle:limit((target-speed)*.45,0,1),brake:limit((speed-target-1)*.3,0,.7),
        lean:!game.grounded&&x>60&&x<74?limit((game.chassis.getAngle()-.08)*2+game.chassis.getAngularVelocity()*.8,-.8,.8):.3};
}
