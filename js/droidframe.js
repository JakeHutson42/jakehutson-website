document.addEventListener('DOMContentLoaded', function () {
    var carousel = document.querySelector('.droid-carousel');
    if (!carousel) { return; }
    var slides = Array.from(carousel.querySelectorAll('.droid-slide'));
    var selectors = Array.from(carousel.querySelectorAll('[data-droid-slide]'));
    var announcement = carousel.querySelector('.droid-announcement');
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var current = 0;
    var pointerStart = null;
    carousel.querySelector('.droid-carousel-footer').hidden = false;

    function showSlide(index) {
        var next = (index + slides.length) % slides.length;
        if (next === current) { return; }
        slides[current].hidden = true;
        current = next;
        slides[current].hidden = false;
        selectors.forEach(function (button, i) { button.setAttribute('aria-current', String(i === current)); });
        announcement.textContent = slides[current].getAttribute('aria-label');
        if (!reducedMotion.matches && slides[current].animate) {
            slides[current].animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 300, easing: 'ease-out' });
        }
    }
    selectors.forEach(function (button, i) { button.addEventListener('click', function () { showSlide(i); }); });
    carousel.querySelector('[data-droid-prev]').addEventListener('click', function () { showSlide(current - 1); });
    carousel.querySelector('[data-droid-next]').addEventListener('click', function () { showSlide(current + 1); });
    carousel.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            showSlide(current + (event.key === 'ArrowRight' ? 1 : -1));
        }
    });
    carousel.addEventListener('pointerdown', function (event) {
        if (event.pointerType === 'touch') { pointerStart = { x: event.clientX, y: event.clientY }; }
    }, { passive: true });
    carousel.addEventListener('pointerup', function (event) {
        if (!pointerStart) { return; }
        var dx = event.clientX - pointerStart.x;
        var dy = event.clientY - pointerStart.y;
        pointerStart = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { showSlide(current + (dx < 0 ? 1 : -1)); }
    }, { passive: true });
    carousel.addEventListener('pointercancel', function () { pointerStart = null; });
});
