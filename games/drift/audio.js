import { driftIntensity } from './driving-feedback.js';
import { clamp } from './math.js';

const ASSETS = { idle: 'engine-idle.wav', engine: 'engine-rev.wav', tyres: 'tyres.wav' };

// Recorded loops, mixed locally. No sound requests leave the site during a race.
export class EngineAudio {
    constructor(enabled = true) {
        this.enabled = enabled;
        this.voices = new Set();
    }

    async setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) { this.silence(); return false; }
        if (!this.context) {
            const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
            if (!Context) { this.enabled = false; return false; }
            this.context = new Context();
            this.master = this.context.createGain(); this.master.gain.value = 0.72;
            const limiter = this.context.createDynamicsCompressor();
            limiter.threshold.value = -12; limiter.knee.value = 12; limiter.ratio.value = 4;
            limiter.attack.value = 0.006; limiter.release.value = 0.18;
            this.master.connect(limiter).connect(this.context.destination);
        }
        // Resume before awaiting anything, while Start Race has user activation.
        const resumed = this.context.resume();
        this.loading ||= this.loadLoops().catch(error => { this.loading = null; throw error; });
        await Promise.all([resumed, this.loading]);
        return this.enabled;
    }

    async loadLoops() {
        // Decode everything before starting nodes, making a failed load retryable.
        const buffers = await Promise.all(Object.entries(ASSETS).map(async ([name, file]) => {
            const response = await fetch(new URL(`./sounds/${file}`, import.meta.url));
            if (!response.ok) throw new Error(`Audio asset unavailable: ${file}`);
            return [name, await this.context.decodeAudioData(await response.arrayBuffer())];
        }));
        this.channels = {};
        for (const [name, buffer] of buffers) {
            const source = this.context.createBufferSource(); source.buffer = buffer; source.loop = true;
            const filter = this.context.createBiquadFilter(); filter.type = 'lowpass';
            filter.frequency.value = name === 'tyres' ? 5200 : 4500;
            const gain = this.context.createGain(); gain.gain.value = 0;
            source.connect(filter).connect(gain).connect(this.master); source.start();
            this.channels[name] = { source, filter, gain };
        }
    }

    silence() {
        if (!this.context) return;
        const now = this.context.currentTime;
        for (const channel of Object.values(this.channels || {})) {
            channel.gain.gain.cancelScheduledValues(now);
            channel.gain.gain.setValueAtTime(0, now);
        }
        for (const voice of this.voices) { voice.stop(); voice.disconnect(); }
        this.voices.clear();
    }

    countdown(go = false) {
        if (!this.enabled || this.context?.state !== 'running') return;
        const now = this.context.currentTime, duration = go ? 0.48 : 0.16;
        // Shaped start-light tones. GO is higher and sustained.
        for (const [frequency, level] of [[go ? 1046.5 : 698.46, 0.23], [go ? 2093 : 1396.92, 0.035]]) {
            const tone = this.context.createOscillator(), envelope = this.context.createGain();
            tone.type = 'sine'; tone.frequency.value = frequency;
            envelope.gain.setValueAtTime(0, now);
            envelope.gain.linearRampToValueAtTime(level, now + 0.008);
            envelope.gain.setValueAtTime(level * 0.8, now + duration * 0.55);
            envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
            tone.connect(envelope).connect(this.master);
            this.voices.add(tone);
            tone.onended = () => { this.voices.delete(tone); tone.disconnect(); envelope.disconnect(); };
            tone.start(now); tone.stop(now + duration + 0.02);
        }
    }

    update(car, active) {
        if (!active || !this.enabled) { this.silence(); return; }
        if (!this.channels) return;
        const now = this.context.currentTime, rpm = clamp(car.rpm || 950, 950, 8000);
        const blend = clamp((rpm - 1500) / 3800, 0, 1), load = car.throttle ? 1 : 0.58;
        const target = (param, value, lag = 0.07) => param.setTargetAtTime(value, now, lag);
        const { idle, engine, tyres } = this.channels;
        target(idle.source.playbackRate, clamp(rpm / 1800, 0.75, 1.65));
        target(engine.source.playbackRate, clamp(rpm / 6800, 0.55, 1.2), 0.045);
        target(idle.gain.gain, Math.cos(blend * Math.PI / 2) * 0.34);
        target(engine.gain.gain, Math.sin(blend * Math.PI / 2) * 0.52 * load);
        target(engine.filter.frequency, 1800 + load * 3000 + blend * 1200);
        const slide = driftIntensity(car);
        target(tyres.gain.gain, Math.pow(slide, 0.8) * 0.28, 0.055);
        target(tyres.source.playbackRate, 0.87 + slide * 0.18 + clamp(car.speed / 40, 0, 1) * 0.06, 0.12);
        target(tyres.filter.frequency, 2600 + slide * 2600);
    }
}
