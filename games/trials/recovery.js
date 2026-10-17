/** Context loss never resumes riding automatically or recreates the simulation. */
export class GraphicsRecovery {
    constructor(canvas, { stop, rebuild, status }) {
        Object.assign(this, { canvas, stop, rebuild, status }); this.state = 'ready'; this.epoch = 0;
        this.abort = new AbortController(); const options = { signal: this.abort.signal };
        canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.epoch++; this.state = 'lost'; stop(); status('lost'); }, options);
        canvas.addEventListener('webglcontextrestored', () => this.restore(), options);
    }
    get blocked() { return this.state !== 'ready'; }
    async restore() {
        if (this.state !== 'lost') return;
        const epoch = this.epoch; this.state = 'recovering'; this.status('recovering');
        try { await this.rebuild(); if (epoch !== this.epoch) return; this.state = 'ready'; this.status('ready'); }
        catch (error) { if (epoch !== this.epoch) return; this.state = 'error'; this.status('error', error); }
    }
    dispose() { this.epoch++; this.abort.abort(); }
}
