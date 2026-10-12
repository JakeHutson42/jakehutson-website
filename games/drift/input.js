const DRIVING_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space']);

export class DrivingInput {
    constructor(stage, onCommand) {
        this.keys = new Set();
        this.pointers = new Map();
        this.active = false;
        window.addEventListener('keydown', event => {
            // Leave navigation, dialogs, and form inputs usable with a keyboard.
            if (!this.active || event.target.closest('input, select, textarea, dialog')) return;
            if (!event.repeat && ['Escape', 'KeyR'].includes(event.code)) { event.preventDefault(); onCommand(event.code); return; }
            if (event.target.closest('button, a')) return;
            if (DRIVING_KEYS.has(event.code)) { event.preventDefault(); this.keys.add(event.code); }
        });
        window.addEventListener('keyup', event => this.keys.delete(event.code));
        window.addEventListener('blur', () => { this.clear(); onCommand('blur'); });
        document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); onCommand('blur'); } });
        stage.querySelectorAll('[data-drive]').forEach(button => {
            button.addEventListener('pointerdown', event => {
                event.preventDefault();
                button.setPointerCapture(event.pointerId);
                this.pointers.set(event.pointerId, button.dataset.drive);
                button.classList.add('is-held');
            });
            const release = event => {
                this.pointers.delete(event.pointerId);
                if (![...this.pointers.values()].includes(button.dataset.drive)) button.classList.remove('is-held');
            };
            button.addEventListener('pointerup', release);
            button.addEventListener('pointercancel', release);
            button.addEventListener('lostpointercapture', release);
        });
    }

    clear() {
        this.keys.clear(); this.pointers.clear();
        document.querySelectorAll('[data-drive]').forEach(button => button.classList.remove('is-held'));
    }

    read() {
        const held = (...keys) => keys.some(key => this.keys.has(key) || [...this.pointers.values()].includes(key));
        return { throttle: held('KeyW', 'ArrowUp', 'throttle'), brake: held('KeyS', 'ArrowDown', 'brake'),
            steer: Number(held('KeyD', 'ArrowRight', 'right')) - Number(held('KeyA', 'ArrowLeft', 'left')),
            handbrake: held('Space', 'handbrake') };
    }
}
