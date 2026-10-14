import { GAME_CONFIG as CONFIG } from './config.js';
import { createCar, updateCar } from './physics.js';

export class Race {
    constructor(track) {
        this.track = track;
        this.car = createCar(track);
        this.state = 'ready';
        this.elapsed = 0;
        this.lap = 1;
        this.checkpoint = 0;
        this.previousProgress = 0;
        this.furthestProgress = 0;
        this.score = 0;
        this.combo = 0;
        this.multiplier = 1;
        this.driftDuration = 0;
        this.comboIdle = 0;
        this.drifting = false;
        this.countdown = 3;
        this.message = '';
    }

    start() { this.state = 'countdown'; }
    pause() { if (['racing', 'countdown'].includes(this.state)) { this.resumeState = this.state; this.state = 'paused'; } }
    resume() { if (this.state === 'paused') this.state = this.resumeState; }

    resetCar() {
        if (this.state !== 'racing') return;
        const progress = this.checkpoint / 4;
        this.car = createCar(this.track, progress);
        this.previousProgress = progress;
        this.elapsed += CONFIG.resetPenalty;
        this.bankCombo();
        this.message = `Back on track · +${CONFIG.resetPenalty}s`;
    }

    bankCombo() {
        this.score += Math.floor(this.combo);
        this.combo = 0; this.multiplier = 1; this.driftDuration = 0; this.comboIdle = 0;
    }

    update(input, deltaTime) {
        if (this.state === 'countdown') {
            this.countdown -= deltaTime;
            if (this.countdown <= 0) this.state = 'racing';
            return;
        }
        if (this.state !== 'racing') return;
        this.elapsed += deltaTime;
        const nearest = updateCar(this.car, input, this.track, deltaTime);
        let progressDelta = nearest.progress - this.previousProgress;
        if (progressDelta < -0.5) progressDelta += 1;
        if (progressDelta > 0.5) progressDelta -= 1;
        const onRoad = nearest.distance <= this.track.width / 2;
        const validMovement = Math.abs(progressDelta) < 0.03;
        const movingForward = progressDelta > 0 && validMovement && onRoad;

        // Ordered gates prevent shortcut laps. Only a forward crossing on asphalt counts.
        if (movingForward) {
            if (this.checkpoint < 3) {
                const target = (this.checkpoint + 1) / 4;
                if (this.previousProgress < target && nearest.progress >= target) {
                    this.checkpoint++;
                    this.message = `Checkpoint ${this.checkpoint} / 3`;
                }
            } else if (this.previousProgress > 0.9 && nearest.progress < 0.1) {
                this.bankCombo();
                if (this.lap === CONFIG.laps) { this.state = 'finished'; this.drifting = false; return; }
                this.lap++; this.checkpoint = 0; this.furthestProgress = 0;
                this.message = this.lap === CONFIG.laps ? 'Final lap. Make it count.' : `Lap ${this.lap} / ${CONFIG.laps}`;
            }
        }

        // High-water progress means circling or repeating a bend cannot farm drift points.
        const newRoad = movingForward && nearest.progress > this.furthestProgress;
        if (this.car.barrierHit) this.bankCombo();
        this.drifting = !this.car.barrierHit && onRoad && this.car.speed >= CONFIG.minimumDriftSpeed &&
            this.car.slip >= CONFIG.minimumDriftAngle && this.car.slip <= CONFIG.maximumDriftAngle;
        if (this.drifting && newRoad) {
            this.driftDuration += deltaTime;
            this.multiplier = Math.min(5, 1 + Math.floor(this.driftDuration / 1.8));
            this.combo += progressDelta * this.track.length * 12 * this.multiplier;
            this.comboIdle = 0;
        } else {
            this.comboIdle += deltaTime;
            if (!onRoad || this.comboIdle > CONFIG.comboGrace) this.bankCombo();
        }
        if (movingForward) this.furthestProgress = Math.max(this.furthestProgress, nearest.progress);
        this.previousProgress = nearest.progress;
    }
}
