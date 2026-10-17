const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
/** One pointer owns one channel. Coordinates are CSS pixels, never renderer pixels. */
export class TouchChannels {
    constructor() { this.owners = new Map(); this.values = { throttle: 0, brake: 0, lean: 0 }; }
    begin(channel, id, x, y, rect) {
        if (![x,y,rect.left,rect.top,rect.width,rect.height].every(Number.isFinite) || rect.width<=0 || rect.height<=0) return false;
        if (!(channel in this.values) || this.owners.has(channel) || [...this.owners.values()].includes(id)) return false;
        this.owners.set(channel, id); this.move(id, x, y, rect); return true;
    }
    move(id, x, y, rect) {
        const channel = [...this.owners].find(([, owner]) => owner === id)?.[0];
        if (!channel || !rect.width || !rect.height) return false;
        let value = channel === 'lean' ? clamp((x - rect.left) / rect.width * 2 - 1, -1, 1) : clamp(1 - (y - rect.top) / rect.height, 0, 1);
        if (channel === 'lean') value = Math.abs(value) < .08 ? 0 : Math.sign(value) * (Math.abs(value) - .08) / .92;
        this.values[channel] = value; return true;
    }
    end(id) { for (const [channel, owner] of this.owners) if (owner === id) { this.owners.delete(channel); this.values[channel] = 0; } }
    clear() { this.owners.clear(); for (const key in this.values) this.values[key] = 0; }
}
export class TouchControls {
    constructor(root, input, gesture) {
        this.root = root; this.input = input; this.captures=0; this.channels = new TouchChannels(); this.abort = new AbortController();
        this.elements = [...root.querySelectorAll('[data-channel]')];
        const options = { signal: this.abort.signal };
        for (const element of this.elements) {
            const channel = element.dataset.channel, rect = () => element.getBoundingClientRect();
            element.addEventListener('pointerdown', e => {
                if (!input.enabled || e.pointerType === 'mouse' && e.button !== 0) return;
                e.preventDefault();
                if (this.channels.begin(channel, e.pointerId, e.clientX, e.clientY, rect())) {
                    element.setPointerCapture(e.pointerId); this.captures++; gesture(); this.paint();
                }
            }, options);
            element.addEventListener('pointermove', e => { if (this.channels.move(e.pointerId, e.clientX, e.clientY, rect())) { e.preventDefault(); this.paint(); } }, options);
            const end = e => { this.channels.end(e.pointerId); this.paint(); };
            for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(type, end, options);
            element.addEventListener('keydown', e => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.code)) return;
                e.preventDefault(); e.stopPropagation(); if (!input.enabled) return;
                this.channels.values[channel] = e.code === 'Home' ? 0 : e.code === 'End' ? 1 : clamp(this.channels.values[channel] + (['ArrowLeft', 'ArrowDown'].includes(e.code) ? -.1 : .1), channel === 'lean' ? -1 : 0, 1);
                gesture(); this.paint();
            }, options);
            element.addEventListener('keyup', e => { if (e.code.startsWith('Arrow') || ['Home', 'End'].includes(e.code)) { this.channels.values[channel] = 0; this.paint(); } }, options);
            element.addEventListener('blur', () => { if (!this.channels.owners.has(channel)) { this.channels.values[channel] = 0; this.paint(); } }, options);
        }
        input.touch = this;
    }
    read() { return { ...this.channels.values }; }
    paint() { for (const e of this.elements) { const value = this.channels.values[e.dataset.channel]; e.setAttribute('aria-disabled',String(!this.input.enabled)); e.setAttribute('aria-valuenow', String(Math.round(value * 100))); e.style.setProperty('--value', String(value)); } this.root.dataset.input = JSON.stringify(this.read());this.root.dataset.ownership=JSON.stringify({captures:this.captures,owners:[...this.channels.owners]}); }
    clear() {
        const ids = [...this.channels.owners.values()];
        this.channels.clear();
        for (const e of this.elements) for (const id of ids) if (e.hasPointerCapture?.(id)) e.releasePointerCapture(id);
        this.paint();
    }
    dispose() { this.clear(); this.abort.abort(); }
}
