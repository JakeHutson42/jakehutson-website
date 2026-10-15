import { miles } from './units.js';
export class CircuitPicker {
    constructor(select, getTrack) {
        this.select = select;
        this.getTrack = getTrack;
        this.tracks = new Map();
        this.button = document.createElement('button');
        this.button.type = 'button'; this.button.id = 'circuitPickerButton';
        this.button.className = 'circuit-picker-button';
        this.button.setAttribute('aria-haspopup', 'listbox');
        this.button.setAttribute('aria-expanded', 'false');
        this.button.setAttribute('aria-controls', 'circuitPickerPanel');
        this.panel = document.createElement('div');
        this.panel.id = 'circuitPickerPanel'; this.panel.className = 'circuit-picker-panel';
        this.panel.hidden = true;
        this.nativePopover = typeof this.panel.showPopover === 'function';
        if (this.nativePopover) this.panel.setAttribute('popover', 'auto');
        const heading = document.createElement('div'); heading.className = 'picker-heading';
        heading.innerHTML = '<span>CHOOSE YOUR WORLD</span><small>CITY STREETS / SYNTHWAVE PEAKS</small>';
        this.list = document.createElement('div'); this.list.className = 'circuit-picker-list';
        this.list.setAttribute('role', 'listbox'); this.list.setAttribute('aria-label', 'Choose a world');
        this.panel.append(heading, this.list); document.body.append(this.panel);
        select.after(this.button); select.hidden = true;
        const label = document.querySelector(`label[for="${select.id}"]`);
        if (label) label.htmlFor = this.button.id;
        this.button.addEventListener('click', () => this.isOpen ? this.close() : this.open());
        this.button.addEventListener('keydown', event => {
            if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
                event.preventDefault(); this.open(event.key === 'ArrowUp' ? -1 : 0);
            }
        });
        this.list.addEventListener('keydown', event => {
            const rows = [...this.list.children], index = rows.indexOf(document.activeElement);
            let next;
            if (event.key === 'ArrowDown') next = (index + 1) % rows.length;
            if (event.key === 'ArrowUp') next = (index - 1 + rows.length) % rows.length;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = rows.length - 1;
            if (next !== undefined) { event.preventDefault(); rows[next]?.focus(); }
            if (event.key === 'Escape') { event.preventDefault(); this.close(true); }
            if (event.key === 'Tab') { this.close(true); }
        });
        this.panel.addEventListener('toggle', event => {
            if (event.newState === 'closed') {
                this.isOpen = false; this.panel.hidden = true;
                this.button.setAttribute('aria-expanded', 'false');
            }
        });
        document.addEventListener('pointerdown', event => {
            if (this.isOpen && !this.panel.contains(event.target) && !this.button.contains(event.target)) this.close();
        });
        window.addEventListener('resize', () => { if (this.isOpen) this.position(); });
        window.addEventListener('scroll', event => {
            if (this.isOpen && !this.panel.contains(event.target)) this.close();
        }, true);
        select.addEventListener('change', () => this.sync());
        this.observer = new MutationObserver(() => this.sync());
        this.observer.observe(select, { childList: true, attributes: true, attributeFilter: ['disabled'] });
        this.sync();
    }

    sync() {
        // Read current routes again after regeneration instead of retaining a
        // stale map thumbnail or distance from the old daily-track cache.
        for (const option of this.select.options) {
            try {
                const track = this.getTrack(option.value);
                if (track) this.tracks.set(option.value, track);
            } catch { this.tracks.delete(option.value); }
        }
        this.button.disabled = this.select.disabled;
        if (this.select.disabled && this.isOpen) this.close();
        const date = this.select.value, track = this.tracks.get(date);
        this.button.replaceChildren();
        const text = document.createElement('span'); text.className = 'picker-current';
        const eyebrow = document.createElement('small'); eyebrow.textContent = this.select.disabled ? 'WORLD SELECT' : 'YOUR WORLD';
        const name = document.createElement('strong'); name.textContent = track?.name || this.select.selectedOptions[0]?.textContent || 'Loading circuits…';
        const arrow = document.createElement('span'); arrow.className = 'picker-chevron'; arrow.textContent = '⌄'; arrow.setAttribute('aria-hidden', 'true');
        text.append(eyebrow, name); this.button.append(text, arrow);
        this.button.setAttribute('aria-label', `Choose world. ${name.textContent}`);
        this.renderRows();
    }

    renderRows() {
        const focused = document.activeElement?.dataset?.date;
        this.list.replaceChildren();
        [...this.select.options].filter(option => ['city', 'synthwave'].includes(option.value)).forEach((option, index) => {
            const date = option.value, track = this.tracks.get(date), selected = this.select.value === date;
            const row = document.createElement('button'); row.type = 'button'; row.className = 'circuit-picker-row';
            row.dataset.date = date; row.style.setProperty('--row', index);
            row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(selected));
            row.tabIndex = selected ? 0 : -1;
            const number = document.createElement('span'); number.className = 'picker-number'; number.textContent = String(index + 1).padStart(2, '0');
            const details = document.createElement('span'); details.className = 'picker-details';
            const name = document.createElement('strong'); name.textContent = track?.name || option.textContent;
            const features = track?.structures?.map(feature => feature.type === 'tunnel' ? 'TUNNEL' : 'BRIDGE') || [];
            const note = document.createElement('small'); note.textContent = track ?
                `${miles(track.drivingLength || track.length).toFixed(2)} MI · ${features.length ? features.join(' + ') : date === 'city' ? 'CITY STREETS' : 'MOUNTAIN RUN'}` : 'FINDING YOUR LINE…';
            const badge = document.createElement('span'); badge.className = 'picker-badge';
            badge.textContent = date === 'city' ? 'AFTER HOURS' : 'SYNTHWAVE';
            row.dataset.biome = date;
            const status = document.createElement('span'); status.className = 'picker-row-status'; status.setAttribute('aria-hidden', 'true'); status.textContent = selected ? '✓' : '↗';
            details.append(badge, name, note); row.append(number);
            if (track) row.append(this.preview(track));
            row.append(details, status);
            row.addEventListener('click', () => {
                if (this.select.disabled) return;
                this.select.value = date; this.close(true);
                this.select.dispatchEvent(new Event('change', { bubbles: true }));
            });
            this.list.append(row);
        });
        if (this.isOpen && focused) [...this.list.children].find(row => row.dataset.date === focused)?.focus();
    }

    preview(track) {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 80 66'); svg.setAttribute('aria-hidden', 'true');
        svg.classList.add('picker-map');
        const xs = track.points.map(p => p[0]), zs = track.points.map(p => p[1]);
        const minX = Math.min(...xs), minZ = Math.min(...zs), dx = Math.max(...xs) - minX, dz = Math.max(...zs) - minZ;
        const scale = Math.min(66 / Math.max(dx, 1), 52 / Math.max(dz, 1));
        const line = document.createElementNS(ns, 'polyline');
        const points = track.points.filter((_, index) => index % 4 === 0); points.push(points[0]);
        line.setAttribute('points', points.map(([x, z]) => `${40 + (x - minX - dx / 2) * scale},${33 + (z - minZ - dz / 2) * scale}`).join(' '));
        svg.append(line); return svg;
    }

    open(edge) {
        if (this.select.disabled || !this.list.children.length) return;
        this.sync();
        this.panel.hidden = false; this.isOpen = true;
        if (this.nativePopover) this.panel.showPopover();
        this.button.setAttribute('aria-expanded', 'true'); this.position();
        const rows = [...this.list.children];
        (edge === -1 ? rows.at(-1) : edge === 0 ? rows[0] : rows.find(row => row.getAttribute('aria-selected') === 'true'))?.focus();
    }

    position() {
        const rect = this.button.getBoundingClientRect();
        const width = Math.min(460, window.innerWidth - 24);
        const below = window.innerHeight - rect.bottom - 16;
        const above = below < 240 && rect.top > below;
        Object.assign(this.panel.style, {
            width: `${width}px`, left: `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`,
            top: above ? 'auto' : `${rect.bottom + 8}px`, bottom: above ? `${window.innerHeight - rect.top + 8}px` : 'auto',
            maxHeight: `${Math.max(120, Math.min(480, above ? rect.top - 20 : below))}px`,
        });
    }

    close(focus = false) {
        if (this.nativePopover && this.panel.matches(':popover-open')) this.panel.hidePopover();
        this.isOpen = false; this.panel.hidden = true; this.button.setAttribute('aria-expanded', 'false');
        if (focus && !this.button.disabled) this.button.focus();
    }
}
