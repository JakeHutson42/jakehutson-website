/* A reversible, scroll-scrubbed interface study. No wheel interception. */
document.addEventListener('DOMContentLoaded', function () {
    var stage = document.querySelector('.df-story-stage');
    var chapters = Array.from(document.querySelectorAll('.df-chapter'));
    var states = ['Assembled', 'App library', 'Android device', 'Automation', 'Recording editor', 'Reassembled'];
    var dialog = document.querySelector('.df-image-dialog');
    var previousFocus = null;

    document.querySelectorAll('[data-full-image]').forEach(function (button) {
        button.addEventListener('click', function () {
            if (!dialog || !dialog.showModal) { return; }
            previousFocus = button;
            dialog.querySelector('img').src = button.dataset.fullImage;
            dialog.querySelector('img').alt = button.querySelector('img').alt;
            dialog.querySelector('p').textContent = button.dataset.imageCaption;
            dialog.showModal();
            document.documentElement.classList.add('df-dialog-open');
        });
    });
    if (dialog) {
        dialog.querySelector('.df-dialog-close').addEventListener('click', function () { dialog.close(); });
        dialog.addEventListener('click', function (event) { if (event.target === dialog) { dialog.close(); } });
        dialog.addEventListener('close', function () {
            document.documentElement.classList.remove('df-dialog-open');
            if (previousFocus) { previousFocus.focus({ preventScroll: true }); }
        });
    }

    // Without the animation libraries, every chapter remains in normal flow.
    if (!window.gsap || !window.ScrollTrigger || !stage) { return; }
    gsap.registerPlugin(ScrollTrigger);
    // Avoid re-pinning when mobile browser chrome changes the visible height.
    ScrollTrigger.config({ ignoreMobileResize: true });
    var media = gsap.matchMedia();

    media.add({ motion: '(prefers-reduced-motion: no-preference)', compact: '(max-width: 899px)', wide: '(min-width: 900px)', short: '(max-height: 649px)' }, function (context) {
        if (!context.conditions.motion || (context.conditions.wide && context.conditions.short)) { return; }
        stage.classList.add('has-scroll-story');
        var active = -1;
        var compact = window.innerWidth < 900;
        stage.classList.toggle('has-compact-story', compact);
        // Leave room for forward-projecting panels on smaller laptop screens.
        function sceneFit() { return compact ? 1 : (window.innerWidth < 1200 ? .82 : 1); }
        function showChapter(index) {
            if (index === active) { return; }
            active = index;
            chapters.forEach(function (chapter, i) {
                chapter.classList.toggle('is-active', i === index);
                chapter.setAttribute('aria-hidden', String(i !== index));
                chapter.inert = i !== index;
            });
            stage.querySelector('.df-scene-state').textContent = states[index];
            stage.querySelector('.df-story-count').textContent = '0' + (index + 1) + ' / 06';
        }
        showChapter(0);
        gsap.set('.df-model', { xPercent: -50, yPercent: -50, x: 0, y: 0, force3D: true });
        var timeline = gsap.timeline({
            defaults: { ease: 'power2.inOut' },
            scrollTrigger: {
                id: 'droidframe-anatomy',
                trigger: stage,
                start: function () { return 'top ' + parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')); },
                end: function () { return '+=' + Math.round(window.innerHeight * (compact ? 4.5 : 6)); },
                pin: true,
                scrub: compact ? .35 : .65,
                anticipatePin: 1,
                invalidateOnRefresh: true
            },
            onUpdate: function () {
                var progress = timeline.progress();
                var boundaries = [0, .18, .34, .50, .66, .84];
                var chapter = 0;
                boundaries.forEach(function (boundary, i) { if (progress >= boundary) { chapter = i; } });
                showChapter(chapter);
            }
        });
        // Assemble → lift apart → inspect each working area → reassemble.
        timeline.to('.df-model', { rotationX: compact ? 20 : 24, rotationY: compact ? -18 : -24, rotationZ: -5, scale: function () { return .82 * sceneFit(); }, duration: .9 }, .3)
            .to('.df-shell', { z: compact ? -35 : -90, opacity: .5, duration: .9 }, .3)
            .to('.df-library', { x: compact ? -22 : -38, y: compact ? -28 : -40, z: compact ? 65 : 150, duration: .9 }, .3)
            .to('.df-device', { z: compact ? 25 : 65, duration: .9 }, .3)
            .to('.df-automation', { x: compact ? 24 : 42, y: compact ? 28 : 48, z: compact ? 90 : 210, duration: .9 }, .3)
            .to('.df-layer-label', { opacity: 1, duration: .4 }, .8)
            .to('.df-library', { x: compact ? 28 : -70, y: compact ? -18 : -30, z: compact ? 120 : 200, scale: compact ? 1.45 : 1.12, duration: .5 }, 1.3)
            .to(['.df-device', '.df-automation'], { opacity: .42, duration: .5 }, 1.3)
            .to('.df-model', { rotationX: 13, rotationY: -12, rotationZ: -3, scale: function () { return .9 * sceneFit(); }, duration: .6 }, 2.35)
            .to('.df-library', { scale: 1, x: compact ? -22 : -70, z: compact ? 45 : 100, opacity: .35, duration: .6 }, 2.35)
            .to('.df-device', { opacity: 1, z: compact ? 85 : 160, duration: .6 }, 2.35)
            .to('.df-android-insert', { opacity: 1, duration: .6 }, 2.35)
            .to('.df-model', { rotationX: 17, rotationY: 20, rotationZ: 4, scale: function () { return .85 * sceneFit(); }, duration: .6 }, 3.45)
            .to('.df-device', { opacity: .35, z: compact ? 25 : 60, duration: .6 }, 3.45)
            .to('.df-automation', { opacity: 1, x: compact ? -30 : 10, y: 0, z: compact ? 120 : 240, scale: compact ? 1.3 : 1.1, duration: .6 }, 3.45)
            .to('.df-model', { rotationX: 0, rotationY: 0, rotationZ: 0, scale: function () { return sceneFit(); }, duration: .7 }, 4.5)
            .to(['.df-shell', '.df-library', '.df-device', '.df-automation'], { opacity: 0, duration: .6 }, 4.5)
            .fromTo('.df-editor', { autoAlpha: 0, z: compact ? 100 : 300, y: compact ? 24 : 60 }, { autoAlpha: 1, z: compact ? 100 : 360, y: 0, duration: .7 }, 4.5)
            .to('.df-editor', { autoAlpha: 0, z: 0, y: 20, duration: .7 }, 5.8)
            .to('.df-model', { rotationX: 0, rotationY: 0, rotationZ: 0, scale: 1, duration: .9 }, 5.8)
            .to(['.df-shell', '.df-library', '.df-device', '.df-automation'], { x: 0, y: 0, z: 0, scale: 1, opacity: 1, duration: .9 }, 5.8)
            .to('.df-android-insert', { opacity: 0, duration: .7 }, 5.8)
            .to('.df-layer-label', { opacity: 0, duration: .5 }, 5.8)
            .to('.df-story-progress span', { scaleX: 1, ease: 'none', duration: 7 }, 0);

        return function () {
            stage.classList.remove('has-scroll-story', 'has-compact-story');
            chapters.forEach(function (chapter) {
                chapter.classList.remove('is-active');
                chapter.removeAttribute('aria-hidden');
                chapter.inert = false;
            });
            stage.querySelector('.df-scene-state').textContent = 'Assembled';
        };
    });

    media.add('(prefers-reduced-motion: no-preference)', function () {
        gsap.fromTo('.df-gesture-cursor', { y: 0 }, { y: -280, ease: 'none', scrollTrigger: { trigger: '.df-gesture-art', start: 'top 75%', end: 'bottom 35%', scrub: .5 } });
        gsap.fromTo('.df-gesture-trail', { strokeDasharray: 280, strokeDashoffset: 280 }, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: '.df-gesture-art', start: 'top 75%', end: 'bottom 35%', scrub: .5 } });
        gsap.fromTo('.df-profile-back', { x: 12, y: -10 }, { x: 56, y: -46, scrollTrigger: { trigger: '.df-profile-art', start: 'top 80%', end: 'bottom 40%', scrub: .6 } });
        gsap.fromTo('.df-profile-mid', { x: 6, y: -5 }, { x: 28, y: -23, scrollTrigger: { trigger: '.df-profile-art', start: 'top 80%', end: 'bottom 40%', scrub: .6 } });
    });
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { ScrollTrigger.refresh(); }); }
    window.addEventListener('load', function () { ScrollTrigger.refresh(); }, { once: true });
});
