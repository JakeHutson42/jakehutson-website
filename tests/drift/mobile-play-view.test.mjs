import test from 'node:test';
import assert from 'node:assert/strict';
import { MobilePlayView } from '../../games/drift/mobile-play-view.js';

// A minimal page model tests scroll restoration and resize ordering without
// pretending to emulate a phone's browser chrome or its safe-area calculations.
function pageFixture(run) {
    const original = Object.fromEntries(['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]));
    const viewport = { width: 390, height: 740, smallHeight: 640, visibleHeight: 640, coarse: true };
    const frames = new Map(); let frameId = 0;
    class PageNode {
        constructor() {
            this.children = []; this.inert = false;
            const classes = new Set();
            this.classList = { add: (...names) => names.forEach(name => classes.add(name)),
                remove: (...names) => names.forEach(name => classes.delete(name)),
                contains: name => classes.has(name), toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) };
            this.style = { top: '', setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } };
        }
        addEventListener() {}
        setAttribute() {}
        append(child) { child.remove(); this.children.push(child); child.parent = this; }
        before(node) { this.parent.children.splice(this.parent.children.indexOf(this), 0, node); node.parent = this.parent; }
        remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
        replaceWith(node) { const parent = this.parent; const index = parent.children.indexOf(this); node.remove(); parent.children[index] = node; node.parent = parent; this.parent = null; }
        getBoundingClientRect() { return { height: viewport.smallHeight }; }
    }
    const body = new PageNode(); const root = new PageNode(); const page = new PageNode(); const stage = new PageNode();
    const alreadyInert = new PageNode(); alreadyInert.inert = true;
    body.append(page); body.append(alreadyInert); page.append(stage); body.style.top = '3px';
    let restoredScroll;
    globalThis.document = { body, documentElement: root, createElement: () => new PageNode(), createComment: () => new PageNode(), addEventListener() {}, fullscreenElement: null };
    globalThis.window = {
        get innerWidth() { return viewport.width; }, get innerHeight() { return viewport.height; },
        scrollX: 0, scrollY: 542, screen: { orientation: { addEventListener() {} } }, addEventListener() {},
        visualViewport: { get height() { return viewport.visibleHeight; }, addEventListener() {} },
        matchMedia: query => ({ get matches() { return query.includes('orientation') ? viewport.height > viewport.width : viewport.coarse || viewport.width <= 767; } }),
        scrollTo: position => { restoredScroll = position; },
    };
    globalThis.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
    globalThis.cancelAnimationFrame = id => frames.delete(id);
    const flushFrames = () => { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } };
    try { run({ viewport, body, root, page, stage, alreadyInert, flushFrames, restoredScroll: () => restoredScroll }); }
    finally { for (const [key, value] of Object.entries(original)) globalThis[key] = value; }
}

test('mobile entry locks the page and exit restores DOM, scroll, and previous inert state', () => pageFixture(({ body, root, page, stage, alreadyInert, restoredScroll }) => {
    const view = new MobilePlayView(stage, () => {}); view.enter();
    assert.ok(view.active && page.inert && root.classList.contains('mobile-race-open'));
    assert.equal(body.style.top, '-542px'); assert.equal(stage.parent, view.shell);
    view.exit();
    assert.equal(stage.parent, page); assert.equal(page.inert, false); assert.equal(alreadyInert.inert, true);
    assert.equal(body.style.top, '3px'); assert.ok(!root.classList.contains('mobile-race-open'));
    assert.deepEqual(restoredScroll(), { left: 0, top: 542, behavior: 'instant' });
}));

test('toolbar retraction keeps the play height stable, while a smaller viewport pauses before resizing', () => pageFixture(({ viewport, stage, flushFrames }) => {
    let pauses = 0; const view = new MobilePlayView(stage, () => pauses++); view.enter();
    assert.equal(stage.style['--mobile-play-height'], '640px');
    viewport.visibleHeight = 740; view.handleResize();
    assert.equal(pauses, 0); assert.equal(stage.style['--mobile-play-height'], '640px');
    viewport.visibleHeight = 580; view.handleResize();
    assert.equal(pauses, 1); assert.equal(stage.style['--mobile-play-height'], '640px');
    flushFrames(); assert.equal(stage.style['--mobile-play-height'], '580px');
}));

test('rotation pauses before updating the play area and does not resume automatically', () => pageFixture(({ viewport, stage, flushFrames }) => {
    let pauses = 0; const view = new MobilePlayView(stage, () => pauses++); view.enter();
    viewport.width = 844; viewport.height = 390; viewport.visibleHeight = 390; viewport.smallHeight = 390;
    view.handleResize(); assert.equal(pauses, 1); assert.equal(stage.style['--mobile-play-height'], '640px');
    flushFrames(); assert.equal(stage.style['--mobile-play-height'], '390px');
    assert.ok(!stage.classList.contains('is-short-portrait'));
}));

test('desktop entry leaves page scrolling and the stage in their original state', () => pageFixture(({ viewport, stage, page, root }) => {
    viewport.width = 1265; viewport.coarse = false;
    const view = new MobilePlayView(stage, () => {}); view.enter();
    assert.equal(view.active, false); assert.equal(stage.parent, page);
    assert.equal(page.inert, false); assert.ok(!root.classList.contains('mobile-race-open'));
}));
