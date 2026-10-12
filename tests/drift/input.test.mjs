import test from 'node:test';
import assert from 'node:assert/strict';
import { TouchDrivingControls } from '../../games/drift/touch-controls.js';
import { DrivingInput } from '../../games/drift/input.js';

// Dispatch through the registered event handlers. These small DOM doubles let us
// exercise simultaneous fingers and OS cancellation, which a mouse cannot mimic.
class ControlElement {
    constructor(dataset = {}, bounds = {}) {
        this.dataset = dataset; this.bounds = bounds; this.children = [];
        this.listeners = new Map(); this.captures = new Set(); this.attributes = {};
        const classes = new Set();
        this.classList = { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) };
    }
    append(child) { child.parent = this; this.children.push(child); return child; }
    contains(child) { return child === this || this.children.some(node => node.contains(child)); }
    closest() { return this.dataset.controlGroup ? this : this.parent?.closest(); }
    querySelectorAll() { return this.children.flatMap(child => child.dataset.drive ? [child] : child.querySelectorAll()); }
    getBoundingClientRect() { return { ...this.bounds }; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, listener) { this.listeners.set(name, [...(this.listeners.get(name) || []), listener]); }
    emit(name, properties) {
        const event = { target: this, pointerType: 'touch', button: 0, preventDefault() {}, ...properties };
        for (const listener of this.listeners.get(name) || []) listener(event);
    }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); this.emit('lostpointercapture', { pointerId: id }); }
}

function setup() {
    const surface = new ControlElement(); const root = new ControlElement();
    const steering = surface.append(new ControlElement({ controlGroup: 'steering' }, { left: 0, right: 140, top: 200, bottom: 280 }));
    const pedals = surface.append(new ControlElement({ controlGroup: 'pedals' }, { left: 200, right: 340, top: 140, bottom: 280 }));
    const left = steering.append(new ControlElement({ drive: 'left' }, { left: 0, right: 64, top: 200, bottom: 280 }));
    const right = steering.append(new ControlElement({ drive: 'right' }, { left: 76, right: 140, top: 200, bottom: 280 }));
    const slide = pedals.append(new ControlElement({ drive: 'handbrake' }, { left: 200, right: 340, top: 140, bottom: 190 }));
    const brake = pedals.append(new ControlElement({ drive: 'brake' }, { left: 200, right: 264, top: 204, bottom: 280 }));
    const throttle = pedals.append(new ControlElement({ drive: 'throttle' }, { left: 276, right: 340, top: 204, bottom: 280 }));
    let enabled = true;
    const controls = new TouchDrivingControls(surface, () => enabled, root);
    const down = (pointerId, target, clientX, clientY) => surface.emit('pointerdown', { pointerId, target, clientX, clientY });
    const move = (pointerId, clientX, clientY) => surface.emit('pointermove', { pointerId, clientX, clientY });
    return { surface, root, steering, left, right, slide, brake, throttle, controls, down, move, disable: () => { enabled = false; } };
}

test('one thumb can steer left, neutral, then right without lifting', () => {
    const { controls, down, move, left, right, root } = setup();
    down(1, left, 30, 240); assert.ok(controls.held('left'));
    move(1, 70, 240); assert.ok(!controls.held('left') && !controls.held('right'));
    move(1, 110, 240); assert.ok(controls.held('right') && !controls.held('left'));
    assert.equal(right.attributes['aria-pressed'], 'true');
    root.emit('pointerup', { pointerId: 1 }); assert.ok(!controls.held('right'));
});

test('steering, throttle, and drift have independent finger lifetimes', () => {
    const { controls, down, left, throttle, slide, root } = setup();
    down(1, left, 30, 240); down(2, throttle, 310, 240); down(3, slide, 240, 165);
    for (const action of ['left', 'throttle', 'handbrake']) assert.ok(controls.held(action));
    root.emit('pointerup', { pointerId: 3 });
    assert.ok(controls.held('left') && controls.held('throttle') && !controls.held('handbrake'));
    root.emit('pointercancel', { pointerId: 1 });
    assert.ok(!controls.held('left') && controls.held('throttle'));
});

test('releasing one of two fingers on a pedal keeps the other held', () => {
    const { controls, down, throttle, root } = setup();
    down(1, throttle, 310, 240); down(2, throttle, 310, 240);
    root.emit('pointerup', { pointerId: 1 }); assert.ok(controls.held('throttle'));
    root.emit('pointerup', { pointerId: 2 }); assert.ok(!controls.held('throttle'));
});

test('leaving a pad stops its action and re-entering resumes it', () => {
    const { controls, down, move, left, throttle } = setup();
    down(1, left, 30, 240); down(2, throttle, 310, 240);
    move(1, 160, 320); assert.ok(!controls.held('left') && controls.held('throttle'));
    move(1, 110, 240); assert.ok(controls.held('right'));
});

test('capture failure and lost capture cannot leave a pedal stuck', () => {
    const { controls, surface, down, throttle, root } = setup();
    surface.setPointerCapture = () => { throw new Error('capture interrupted'); };
    down(1, throttle, 310, 240); root.emit('pointercancel', { pointerId: 1 });
    assert.ok(!controls.held('throttle'));
    down(2, throttle, 310, 240); surface.emit('lostpointercapture', { pointerId: 2 });
    assert.ok(!controls.held('throttle'));
});

test('pause/rotation clears capture and prevents stale moves from reactivating input', () => {
    const { controls, surface, down, move, left, throttle, disable } = setup();
    down(1, left, 30, 240); down(2, throttle, 310, 240);
    disable(); controls.clear(); move(1, 110, 240); down(3, throttle, 310, 240);
    assert.equal(controls.pointers.size, 0); assert.equal(surface.captures.size, 0);
    assert.ok(!left.classList.contains('is-held') && !throttle.classList.contains('is-held'));
});

test('stacked pedal boundaries do not accidentally activate the handbrake', () => {
    const { controls, down, move, brake } = setup();
    down(1, brake, 230, 205); assert.ok(controls.held('brake') && !controls.held('handbrake'));
    move(1, 230, 197); assert.ok(!controls.held('brake') && !controls.held('handbrake'));
    move(1, 230, 170); assert.ok(controls.held('handbrake'));
});

test('keyboard controls still work and interruption clears keyboard and touch together', () => {
    const fixture = setup();
    fixture.surface.listeners.clear(); fixture.root.listeners.clear();
    const previousWindow = globalThis.window; const previousDocument = globalThis.document;
    globalThis.window = fixture.root; globalThis.document = new ControlElement();
    const commands = [];
    try {
        const input = new DrivingInput({ querySelector: () => fixture.surface }, command => commands.push(command));
        input.active = true;
        const target = { closest: () => null };
        fixture.root.emit('keydown', { target, code: 'KeyW' });
        fixture.root.emit('keydown', { target, code: 'ArrowRight' });
        assert.deepEqual(input.read(), { throttle: true, brake: false, steer: 1, handbrake: false });
        fixture.root.emit('keyup', { code: 'ArrowRight' });
        fixture.down(1, fixture.left, 30, 240);
        assert.equal(input.read().steer, -1);
        fixture.root.emit('blur', {});
        assert.deepEqual(input.read(), { throttle: false, brake: false, steer: 0, handbrake: false });
        assert.deepEqual(commands, ['blur']);
        input.suspended = true;
        fixture.root.emit('keydown', { target, code: 'KeyW' });
        fixture.down(2, fixture.throttle, 310, 240);
        fixture.root.emit('keydown', { target, code: 'Escape' });
        assert.equal(input.read().throttle, false);
        assert.equal(commands.at(-1), 'Escape', 'Pause commands remain accessible while driving is suspended');
    } finally {
        globalThis.window = previousWindow; globalThis.document = previousDocument;
    }
});
