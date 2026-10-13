import { driftIntensity } from './driving-feedback.js';

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
            const noise = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
            const samples = noise.getChannelData(0);
            for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
            this.tyreNoise = this.context.createBufferSource(); this.tyreNoise.buffer = noise; this.tyreNoise.loop = true;
            this.tyreFilter = this.context.createBiquadFilter(); this.tyreFilter.type = 'bandpass'; this.tyreFilter.frequency.value = 1700;
            this.tyreGain = this.context.createGain(); this.tyreGain.gain.value = 0;
            this.tyreTone = this.context.createOscillator(); this.tyreTone.type = 'triangle';
            this.toneGain = this.context.createGain(); this.toneGain.gain.value = 0;
            this.tyreNoise.connect(this.tyreFilter).connect(this.tyreGain).connect(this.context.destination);
            this.tyreTone.connect(this.toneGain).connect(this.context.destination);
            this.tyreNoise.start(); this.tyreTone.start();
        }
        if (enabled) await this.context.resume();
        this.enabled = enabled;
        if (!enabled && this.gain) for (const gain of [this.gain, this.tyreGain, this.toneGain]) {
            gain.gain.cancelScheduledValues(0); gain.gain.setValueAtTime(0, this.context.currentTime);
        }
        return enabled;
    }

    update(car, racing) {
        if (!this.context) return;
        const now = this.context.currentTime;
        const rpm = car.rpm || 950, intensity = driftIntensity(car);
        this.oscillator.frequency.setTargetAtTime(rpm / 30, now, 0.045);
        this.filter.frequency.setTargetAtTime(200 + rpm * 0.065, now, 0.08);
        this.gain.gain.setTargetAtTime(this.enabled && racing ? 0.025 : 0, now, 0.04);
        this.tyreTone.frequency.setTargetAtTime(850 + intensity * 650, now, 0.07);
        this.tyreFilter.frequency.setTargetAtTime(1200 + intensity * 1400, now, 0.08);
        this.tyreGain.gain.setTargetAtTime(this.enabled && racing ? intensity * 0.018 : 0, now, 0.04);
        this.toneGain.gain.setTargetAtTime(this.enabled && racing ? intensity * 0.007 : 0, now, 0.04);
    }
}
