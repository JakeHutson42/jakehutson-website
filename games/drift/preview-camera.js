import * as THREE from '../../lib/three/0.180.0/three.module.min.js';

// The preview travels along a closed spline of the published centreline. It never
// advances the car or race clock, and its local distance freezes off screen.
export class CircuitFlythrough {
    constructor(track) {
        this.path = new THREE.CatmullRomCurve3(track.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
        this.path.arcLengthDivisions = track.points.length * 4;
        this.length = this.path.getLength();
        this.distance = 0;
    }

    sample(distance = this.distance) {
        const progress = ((distance / this.length) % 1 + 1) % 1;
        const ahead = ((distance + 18) / this.length) % 1;
        const position = this.path.getPointAt(progress);
        const target = this.path.getPointAt((ahead + 1) % 1);
        position.y = 5.2;
        target.y = 1.4;
        return { position, target };
    }

    advance(seconds) {
        // Eight metres per second gives bends time to unfold without sharp pans.
        this.distance = (this.distance + Math.max(0, seconds) * 8) % this.length;
        return this.sample();
    }
}
