// Keep each gesture on one control group, allowing a thumb to slide between its
// buttons. Freeze geometry at press time; relayout always clears gestures first.
export class TouchDrivingControls {
    constructor(surface, isEnabled, eventRoot = window) {
        this.surface = surface;
        this.isEnabled = isEnabled;
        this.pointers = new Map();
        this.buttons = [...surface.querySelectorAll('[data-drive]')];
        surface.addEventListener('pointerdown', event => this.begin(event));
        surface.addEventListener('pointermove', event => this.move(event));
        surface.addEventListener('lostpointercapture', event => this.release(event.pointerId));
        // Window listeners also clean up if capture fails or a gesture ends
        // outside its original control surface.
        eventRoot.addEventListener('pointerup', event => this.release(event.pointerId));
        eventRoot.addEventListener('pointercancel', event => this.release(event.pointerId));
        surface.addEventListener('contextmenu', event => event.preventDefault());
    }

    begin(event) {
        if (!this.isEnabled() || (event.pointerType === 'mouse' && event.button !== 0)) return;
        const group = event.target.closest('[data-control-group]');
        if (!group || !this.surface.contains(group)) return;
        event.preventDefault();
        this.pointers.set(event.pointerId, {
            group: group.dataset.controlGroup,
            bounds: group.getBoundingClientRect(),
            buttons: this.buttons.filter(button => group.contains(button)).map(button => ({
                action: button.dataset.drive, bounds: button.getBoundingClientRect(),
            })),
            action: null,
        });
        try { this.surface.setPointerCapture(event.pointerId); }
        catch { /* Global release handlers still prevent stuck input. */ }
        this.move(event);
    }

    move(event) {
        const pointer = this.pointers.get(event.pointerId);
        if (!pointer) return;
        if (!this.isEnabled()) { this.release(event.pointerId); return; }
        event.preventDefault();
        const { clientX: x, clientY: y } = event;
        const bounds = pointer.bounds;
        // Small vertical forgiveness accommodates natural thumb movement;
        // leaving the pad releases its action even while capture continues.
        const inside = x >= bounds.left - 12 && x <= bounds.right + 12 &&
            y >= bounds.top - 18 && y <= bounds.bottom + 18;
        pointer.action = null;
        if (inside && pointer.group === 'steering') {
            const midpoint = (bounds.left + bounds.right) / 2;
            // A neutral centre lets the driver straighten between directions.
            if (x < midpoint - 6) pointer.action = 'left';
            else if (x > midpoint + 6) pointer.action = 'right';
        } else if (inside) {
            const button = pointer.buttons.find(({ bounds: area }) =>
                x >= area.left && x <= area.right && y >= area.top && y <= area.bottom) ||
                // Forgiveness belongs outside the group, not between stacked
                // pedals where it could accidentally activate the handbrake.
                ((y < bounds.top || y > bounds.bottom) && pointer.buttons.find(({ bounds: area }) =>
                    x >= area.left && x <= area.right && y >= area.top - 12 && y <= area.bottom + 12));
            pointer.action = button?.action || null;
        }
        this.updateButtons();
    }

    release(pointerId) {
        if (!this.pointers.delete(pointerId)) return;
        // Remove ownership before capture emits its own cleanup event.
        if (this.surface.hasPointerCapture(pointerId)) this.surface.releasePointerCapture(pointerId);
        this.updateButtons();
    }

    clear() {
        for (const pointerId of [...this.pointers.keys()]) this.release(pointerId);
    }

    held(action) {
        return [...this.pointers.values()].some(pointer => pointer.action === action);
    }

    updateButtons() {
        for (const button of this.buttons) {
            const held = this.held(button.dataset.drive);
            button.classList.toggle('is-held', held);
            button.setAttribute('aria-pressed', String(held));
        }
    }
}
