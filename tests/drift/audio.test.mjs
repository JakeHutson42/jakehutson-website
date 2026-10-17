import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EngineAudio } from '../../games/drift/audio.js';
import { StartSequence } from '../../games/drift/start-sequence.js';
import { LocalRecords } from '../../games/drift/storage.js';
import { driftIntensity } from '../../games/drift/driving-feedback.js';

function param() {
    return { value: 0, setTargetAtTime(v) { this.value = v; }, cancelScheduledValues() {},
        setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; },
        exponentialRampToValueAtTime(v) { this.value = v; } };
}
function node() {
    return { gain: param(), frequency: param(), playbackRate: param(), connect() { return this; },
        disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; } };
}
function context() {
    return { currentTime: 0, state: 'running', destination: node(), tones: [], sources: [], resumes: 0,
        resume() { this.resumes++; return Promise.resolve(); },
        decodeAudioData() { return Promise.resolve({ duration: 3 }); },
        createGain: node, createBiquadFilter: node,
        createDynamicsCompressor() { return { ...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param() }; },
        createBufferSource() { const n = node(); this.sources.push(n); return n; },
        createOscillator() { const n = node(); this.tones.push(n); return n; } };
}

test('idle and rev loops are 45% quieter while tyre levels retain their original gain', () => {
    const audio = new EngineAudio(); audio.context = context();
    audio.channels = Object.fromEntries(['idle', 'engine', 'tyres'].map(name => [name, { source: node(), filter: node(), gain: node() }]));
    audio.update({ rpm: 950, speed: 0, slip: 0 }, true);
    assert.ok(Math.abs(audio.channels.idle.gain.gain.value - .34 * .55) < 1e-10);
    const car = { rpm: 8000, speed: 25, slip: .7, throttle: true };
    audio.update(car, true);
    assert.ok(Math.abs(audio.channels.engine.gain.gain.value - .52 * .55) < 1e-10);
    assert.ok(Math.abs(audio.channels.tyres.gain.gain.value - Math.pow(driftIntensity(car), .8) * .28) < 1e-10);
});

test('audio unlocks synchronously, loads only one mixer and remains muted if toggled during loading', async () => {
    const previousContext = globalThis.AudioContext, previousFetch = globalThis.fetch;
    const ctx = context(); let downloads = 0;
    globalThis.AudioContext = function() { return ctx; };
    globalThis.fetch = async () => { downloads++; return { ok:true,arrayBuffer:async () => new ArrayBuffer(8) }; };
    try {
        const audio = new EngineAudio(); assert.equal(audio.enabled,true);
        const loading = audio.setEnabled(true);
        assert.equal(ctx.resumes,1,'Resume must happen inside the click before awaiting downloads');
        await audio.setEnabled(false); await loading;
        assert.equal(audio.enabled,false); assert.equal(ctx.sources.length,3);
        await audio.setEnabled(true); await audio.setEnabled(true);
        assert.equal(downloads,3); assert.equal(ctx.sources.length,3);
        const car = { rpm:6000,speed:25,slip:0.3,throttle:true };
        audio.update(car,true); const mild = audio.channels.tyres.gain.gain.value;
        const highPitch = audio.channels.engine.source.playbackRate.value;
        audio.update({ ...car,slip:0.9,rpm:4200 },true);
        assert.ok(audio.channels.tyres.gain.gain.value > mild);
        assert.ok(audio.channels.engine.source.playbackRate.value < highPitch,'Upshift drops recorded engine pitch');
        audio.countdown(); audio.countdown(true);
        assert.ok(ctx.tones[2].frequency.value > ctx.tones[0].frequency.value);
        audio.update(car,false);
        assert.ok(ctx.tones.every(t => t.stopped)); assert.equal(audio.voices.size,0);
        for (const c of Object.values(audio.channels)) assert.equal(c.gain.gain.value,0);
        audio.update(car,true); await audio.setEnabled(false);
        for (const c of Object.values(audio.channels)) assert.equal(c.gain.gain.value,0);
        const before = ctx.tones.length; audio.countdown(true); assert.equal(ctx.tones.length,before);
    } finally { globalThis.AudioContext = previousContext; globalThis.fetch = previousFetch; }
});

test('a failed asset load starts no partial mixer and can be retried', async () => {
    const previousContext = globalThis.AudioContext, previousFetch = globalThis.fetch;
    const ctx = context(); globalThis.AudioContext = function() { return ctx; };
    globalThis.fetch = async () => ({ ok:false });
    try {
        const audio = new EngineAudio(); await assert.rejects(audio.setEnabled(true));
        assert.equal(ctx.sources.length,0);
        globalThis.fetch = async () => ({ ok:true,arrayBuffer:async () => new ArrayBuffer(8) });
        await audio.setEnabled(true); assert.equal(ctx.sources.length,3);
    } finally { globalThis.AudioContext = previousContext; globalThis.fetch = previousFetch; }
});

test('three start cues follow the race, survive pause and restart cleanly without duplicate beeps', () => {
    const cues = [], text = {}, element = { hidden:true,dataset:{},querySelector(key) { return text[key] ||= {}; } };
    const sequence = new StartSequence(element,{ countdown: go => cues.push(go) });
    const race = { state:'countdown',countdown:3,elapsed:0 };
    sequence.update(race); sequence.update(race); assert.deepEqual(cues,[false]);
    race.state = 'paused'; sequence.update(race); assert.equal(element.hidden,true);
    race.state = 'countdown'; sequence.update(race); assert.equal(cues.length,1);
    race.countdown = 1.5; sequence.update(race); sequence.update(race);
    race.state = 'racing'; sequence.update(race); assert.deepEqual(cues,[false,false,true]);
    assert.equal(text['[data-start-word]'].textContent,'GO');
    race.elapsed = 1; sequence.update(race); assert.equal(element.hidden,true);
    sequence.update({ state:'countdown',countdown:3 }); assert.equal(cues.length,4);
});

test('sound defaults on, migrates legacy defaults and remembers an explicit mute without losing records', () => {
    let saved = JSON.stringify({ version:1,sound:false,records:{ '2026-10-13':{ score:100,time:80,runs:1 } } });
    const storage = { getItem:() => saved,setItem:(_key,value) => { saved=value; } };
    const records = new LocalRecords(storage); assert.equal(records.data.sound,true);
    records.setSound(false);
    const restored = new LocalRecords(storage); assert.equal(restored.data.sound,false);
    assert.equal(restored.get('2026-10-13').score,100);
    assert.equal(new LocalRecords({ getItem:() => null }).data.sound,true);
});

test('shipped recordings are full-rate PCM with headroom and smooth loop boundaries', () => {
    for (const file of ['engine-idle.wav','engine-rev.wav','tyres.wav']) {
        const wav = readFileSync(new URL(`../../games/drift/sounds/${file}`,import.meta.url));
        assert.equal(wav.readUInt32LE(24),44100); assert.equal(wav.readUInt16LE(34),16);
        let peak=0;
        for (let i=44;i<wav.length;i+=2) peak=Math.max(peak,Math.abs(wav.readInt16LE(i)));
        assert.ok(peak>20000 && peak<32000);
        assert.ok(Math.abs(wav.readInt16LE(44)-wav.readInt16LE(wav.length-2))<4000,'No large discontinuity at the seam');
    }
});
