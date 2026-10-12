// A touch race has its own stable play area. The surrounding page is locked and
// inert until exit, so scrolling cannot move the controls or steal a gesture.
export class MobilePlayView {
    constructor(stage, onLayoutChange) {
        this.stage = stage;
        this.onLayoutChange = onLayoutChange;
        this.active = false;
        // Phone-width windows also get the compact layout; keyboard driving is
        // still available. Coarse-pointer tablets work in either orientation.
        this.mobileMedia = window.matchMedia('(any-pointer: coarse), (max-width: 767px)');
        this.portraitMedia = window.matchMedia('(orientation: portrait)');
        this.shell = document.createElement('div');
        this.shell.className = 'mobile-play-shell';
        this.shell.setAttribute('role', 'region');
        this.shell.setAttribute('aria-label', 'Apex Drift mobile play view');
        window.addEventListener('resize', () => this.handleResize());
        window.visualViewport?.addEventListener('resize', () => this.handleResize());
        // Some devices rotate 180 degrees without changing viewport dimensions.
        if (window.screen.orientation?.addEventListener) {
            window.screen.orientation.addEventListener('change', () => this.relayout());
        } else window.addEventListener('orientationchange', () => this.relayout());
        document.addEventListener('fullscreenchange', () => this.relayout());
    }

    enter() {
        if (this.active || !this.mobileMedia.matches) return;
        this.active = true;
        this.scrollPosition = { x: window.scrollX, y: window.scrollY };
        this.previousBodyTop = document.body.style.top;
        this.placeholder = document.createComment('Mobile race returns here on exit');
        this.stage.before(this.placeholder);
        this.shell.append(this.stage);
        document.body.append(this.shell);
        // Moving the stage directly under body avoids ancestor clipping and
        // transformed containers interfering with fixed positioning.
        this.backgroundElements = [...document.body.children].filter(element => element !== this.shell)
            .map(element => ({ element, wasInert: element.inert }));
        for (const { element } of this.backgroundElements) element.inert = true;
        document.body.style.top = `${-this.scrollPosition.y}px`;
        document.documentElement.classList.add('mobile-race-open');
        document.body.classList.add('mobile-race-open');
        this.stage.classList.add('mobile-play');
        this.updateDimensions();
    }

    measureHeight() {
        // svh reserves space for expanded browser bars. Use a probe rather than
        // recomputing dvh on every toolbar animation, keeping held controls still.
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;height:100vh;height:100svh;width:0;';
        this.shell.append(probe);
        const smallHeight = probe.getBoundingClientRect().height;
        probe.remove();
        const visibleHeight = window.visualViewport?.height || window.innerHeight;
        const availableHeight = document.fullscreenElement ? visibleHeight : (smallHeight || visibleHeight);
        return Math.floor(Math.min(availableHeight, visibleHeight));
    }

    updateDimensions() {
        this.width = window.innerWidth;
        this.portrait = this.portraitMedia.matches;
        this.height = this.measureHeight();
        this.stage.style.setProperty('--mobile-play-height', `${this.height}px`);
        this.stage.classList.toggle('is-short-portrait', this.portrait && this.height <= 650);
    }

    handleResize() {
        if (!this.active) return;
        const visibleHeight = window.visualViewport?.height || window.innerHeight;
        if (Math.abs(window.innerWidth - this.width) > 2 || this.portraitMedia.matches !== this.portrait ||
            visibleHeight < this.height - 2) this.relayout();
        // Toolbar retraction increases available height. Keep the existing play
        // area and button positions instead of following that animation.
    }

    relayout() {
        if (!this.active) return;
        // Pause and release pointers before changing any cached hit geometry.
        this.onLayoutChange();
        cancelAnimationFrame(this.resizeFrame);
        this.resizeFrame = requestAnimationFrame(() => {
            if (this.active) this.updateDimensions();
        });
    }

    exit() {
        if (!this.active) return;
        this.active = false;
        cancelAnimationFrame(this.resizeFrame);
        if (document.fullscreenElement === this.stage) document.exitFullscreen().catch(() => {});
        this.placeholder.replaceWith(this.stage);
        this.shell.remove();
        this.stage.classList.remove('mobile-play', 'is-short-portrait');
        this.stage.style.removeProperty('--mobile-play-height');
        for (const { element, wasInert } of this.backgroundElements) element.inert = wasInert;
        document.documentElement.classList.remove('mobile-race-open');
        document.body.classList.remove('mobile-race-open');
        document.body.style.top = this.previousBodyTop;
        window.scrollTo({ left: this.scrollPosition.x, top: this.scrollPosition.y, behavior: 'instant' });
    }
}
