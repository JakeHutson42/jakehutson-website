document.addEventListener('DOMContentLoaded', function () {
    var navbar = document.getElementById('navbar');
    var menu = document.getElementById('mobileNavigation');
    var toggle = document.querySelector('.nav-menu-toggle');
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function setMenuOpen(open) {
        menu.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
        navbar.classList.toggle('is-open', open);
    }

    if (navbar && menu && toggle) {
        function updateNavbar() {
            navbar.classList.toggle('is-scrolled', window.scrollY > 24);
        }
        updateNavbar();
        window.addEventListener('scroll', updateNavbar, { passive: true });
        toggle.addEventListener('click', function () { setMenuOpen(menu.hidden); });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && !menu.hidden) {
                setMenuOpen(false);
                toggle.focus();
            }
        });
        window.matchMedia('(min-width: 992px)').addEventListener('change', function (event) {
            if (event.matches) { setMenuOpen(false); }
        });
    }

    document.addEventListener('click', function (event) {
        var link = event.target.closest('a[href]');
        if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) { return; }
        var destination = new URL(link.href, window.location.href);
        var currentPath = window.location.pathname.replace(/index\.html$/, '');
        var targetPath = destination.pathname.replace(/index\.html$/, '');
        if (menu && toggle && menu.contains(link)) { setMenuOpen(false); }
        if (destination.origin !== window.location.origin || currentPath !== targetPath || !destination.hash) { return; }
        var target = document.getElementById(decodeURIComponent(destination.hash.slice(1)));
        if (!target) { return; }
        event.preventDefault();
        history.pushState(null, '', destination.hash);
        target.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
        if (!target.hasAttribute('tabindex')) { target.setAttribute('tabindex', '-1'); }
        target.focus({ preventScroll: true });
    });

    var revealItems = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
        revealItems.forEach(function (item) { item.classList.add('is-visible'); });
    } else {
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        revealItems.forEach(function (item) { observer.observe(item); });
    }
    var year = document.getElementById('year');
    if (year) { year.textContent = new Date().getFullYear(); }
});
