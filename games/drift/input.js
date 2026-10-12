import { TouchDrivingControls } from './touch-controls.js';

const DRIVING_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space']);

export class DrivingInput {
    constructor(stage, onCommand) {
        this.keys = new Set();
        this.active = false;
        this.suspended = false;
        this.touch = new TouchDrivingControls(stage.querySelector('.touch-controls'), () => this.active && !this.suspended);
        window.addEventListener('keydown', event => {
            // Leave navigation, dialogs, and form inputs usable with a keyboard.
            if (!this.active || event.target.closest('input, select, textarea, dialog')) return;
            if (!event.repeat && ['Escape', 'KeyR'].includes(event.code)) { event.preventDefault(); onCommand(event.code); return; }
            if (event.target.closest('button, a')) return;
            if (!this.suspended && DRIVING_KEYS.has(event.code)) { event.preventDefault(); this.keys.add(event.code); }
        });
        window.addEventListener('keyup', event => this.keys.delete(event.code));
        window.addEventListener('blur', () => { this.clear(); onCommand('blur'); });
        document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); onCommand('blur'); } });
    }

    clear() {
        this.keys.clear(); this.touch.clear();
    }

    read() {
        if (!this.active || this.suspended) return { throttle: false, brake: false, steer: 0, handbrake: false };
        const held = (...keys) => keys.some(key => this.keys.has(key) || this.touch.held(key));
        return { throttle: held('KeyW', 'ArrowUp', 'throttle'), brake: held('KeyS', 'ArrowDown', 'brake'),
            steer: Number(held('KeyD', 'ArrowRight', 'right')) - Number(held('KeyA', 'ArrowLeft', 'left')),
            handbrake: held('Space', 'handbrake') };
    }
}
