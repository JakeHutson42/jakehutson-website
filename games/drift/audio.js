// All audio is synthesized locally. An explicit sound-button gesture unlocks Web Audio.
export class EngineAudio {
    constructor() { this.enabled = false; }

    async setEnabled(enabled) {
        if (enabled && !this.context) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return false;
            this.context = new AudioContext();
            this.oscillator = this.context.createOscillator();
            this.oscillator.type = 'sawtooth';
            this.filter = this.context.createBiquadFilter();
            this.filter.type = 'lowpass'; this.filter.frequency.value = 350;
            this.gain = this.context.createGain(); this.gain.gain.value = 0;
            this.oscillator.connect(this.filter).connect(this.gain).connect(this.context.destination);
            this.oscillator.start();
        }
        if (enabled) await this.context.resume();
        this.enabled = enabled;
        if (!enabled && this.gain) this.gain.gain.value = 0;
        return enabled;
    }

    update(car, racing) {
        if (!this.context) return;
        const now = this.context.currentTime;
        this.oscillator.frequency.setTargetAtTime(34 + car.speed * 3.2, now, 0.08);
        this.filter.frequency.setTargetAtTime(180 + car.speed * 19, now, 0.1);
        this.gain.gain.setTargetAtTime(this.enabled && racing ? 0.025 : 0, now, 0.04);
    }
}
