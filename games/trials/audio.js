/** Local original PCM, unlocked only by an explicit player gesture. */
export class MotorcycleAudio {
    constructor(content, muted = false) { this.content = content; this.biome=content.environment||null;this.ambientBuffers=new Map();this.ambientVersion=0; this.muted = muted; this.loops = {}; this.voices=new Set();this.ready = false; this.error = ''; }
    async unlock() {
        try {
            if(this.closed)return;this.error='';
            if (!this.context) {
                const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
                if (!Context) throw new Error('Web Audio unavailable');
                this.context = new Context();this.context.onstatechange=()=>{if(!this.closed&&this.ready&&this.context.state!=='running'){this.silence();this.onInterrupted?.();}};
                this.master = this.context.createGain(); this.master.gain.value = 0;
                const compressor = this.context.createDynamicsCompressor();
                this.master.connect(compressor); compressor.connect(this.context.destination);
            }
            // Resume occurs synchronously within the gesture, before loading any data.
            await this.context.resume();
            if (!this.pending) this.pending = this.prepare().catch(error => { this.pending = null; throw error; });
            await this.pending;
        } catch (error) { this.error = error.message; }
    }
    async prepare() {
        this.buffers = Object.fromEntries(await Promise.all(Object.entries(this.content.manifest.sounds || {}).map(async ([name, file]) => [name, await this.context.decodeAudioData(await this.content.checked(file))])));
        if(this.closed)return;
        for (const name of ['idle', 'load', 'gravel']) {
            const source = this.context.createBufferSource(), gain = this.context.createGain();
            source.buffer = this.buffers[name]; source.loop = true; gain.gain.value = 0;
            source.connect(gain); gain.connect(this.master); source.start(); this.loops[name] = { source, gain };
        }
        this.ready = true;await this.setBiome(this.biome);
    }
    async setBiome(pack){this.biome=pack;const version=++this.ambientVersion;if(this.ambient){this.ambient.source.stop();this.ambient.source.disconnect();this.ambient.gain.disconnect();this.ambient=null;}if(this.closed||!pack?.ambience||!this.ready)return;
        try{if(!this.ambientBuffers.has(pack.id)){const buffer=await this.context.decodeAudioData(pack.ambience.slice(0));if(version!==this.ambientVersion)return;this.ambientBuffers.set(pack.id,buffer);while(this.ambientBuffers.size>4)this.ambientBuffers.delete(this.ambientBuffers.keys().next().value);}if(version!==this.ambientVersion)return;const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=this.ambientBuffers.get(pack.id);source.loop=true;gain.gain.value=0;source.connect(gain);gain.connect(this.master);source.start();this.ambient={source,gain};}catch(error){if(version===this.ambientVersion)this.error='Biome ambience unavailable: '+error.message;}
    }
    silence() {
        if (!this.master) return;
        const now = this.context.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(0, now, .03);
    }
    reset(){this.silence();this.finishUntil=0;for(const voice of this.voices){voice.source.stop();voice.source.disconnect();voice.gain.disconnect();}this.voices.clear();for(const loop of Object.values(this.loops))loop.gain.gain.setTargetAtTime(0,this.context.currentTime,.01);}
    update(game, events) {
        if (!this.ready) return;
        const now = this.context.currentTime, feedback = game.feedback();
        this.ambient?.gain.gain.setTargetAtTime(!this.muted&&game.state==='running' ? .18 : 0,now,.15);
        if(events.some(e=>e.type==='finish'))this.finishUntil=now+.9;
        this.master.gain.setTargetAtTime(!this.muted && (game.state === 'running'||game.state==='finished'&&now<this.finishUntil) ? .28 : 0, now, .06);
        const level = { idle: .5 * (1 - feedback.throttle * .65), load: feedback.throttle * .8, gravel: feedback.grounded ? Math.min(.25, feedback.speed * .018 + feedback.slip * .15) : 0 };
        for (const [name, loop] of Object.entries(this.loops)) {
            loop.gain.gain.setTargetAtTime(level[name], now, .08);
            if (name !== 'gravel') loop.source.playbackRate.setTargetAtTime(Math.max(.65, Math.min(2.5, feedback.rpm / (name === 'idle' ? 1800 : 3000))), now, .08);
        }
        if (!this.muted) for (const event of events) {
            const buffer = this.buffers[event.type]; if (!buffer) continue;
            const source = this.context.createBufferSource(), gain = this.context.createGain();
            if(this.voices.size>=8)continue;const voice={source,gain};this.voices.add(voice);
            source.buffer = buffer; gain.gain.value = event.strength || .7; source.connect(gain); gain.connect(this.master); source.start(); source.onended = () => {this.voices.delete(voice); source.disconnect(); gain.disconnect(); };
        }
    }
    dispose() {this.closed=true;if(this.context)this.context.onstatechange=null;this.reset();this.setBiome(null);this.ambientBuffers.clear();for (const loop of Object.values(this.loops)) loop.source.stop(); this.context?.close()?.catch?.(()=>{}); }
}
