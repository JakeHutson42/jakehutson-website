$(function () {
    var $siteNavbar = $("#siteNavbar");
    var $window = $(window);

    /*
     * Load the shared navigation first so every page keeps the same header.
     */
    $siteNavbar.load("partials/navbar.html", function (response, status) {
        if (status === "error") {
            console.error("The shared navigation could not be loaded.");
            return;
        }

        initialiseNavigation();
    });

    /*
     * Keep the navigation visually quiet at the top of the page and give it
     * a solid backdrop once content begins to move behind it.
     */
    function initialiseNavigation() {
        var $navbar = $("#navbar");
        var $mobileNavigation = $("#mobileNavigation");

        function updateNavbar() {
            $navbar.toggleClass("is-scrolled", $window.scrollTop() > 24);
        }

        updateNavbar();
        $window.on("scroll", updateNavbar);

        $mobileNavigation.on("show.bs.collapse", function () {
            $navbar.addClass("is-open");
        });

        $mobileNavigation.on("hidden.bs.collapse", function () {
            $navbar.removeClass("is-open");
        });

        $mobileNavigation.find("a").on("click", function () {
            if (window.bootstrap) {
                bootstrap.Collapse.getOrCreateInstance($mobileNavigation[0]).hide();
            }
        });
    }

    /*
     * Reveal content once, as it enters the viewport. IntersectionObserver is
     * used instead of a continuous scroll calculation to keep the page light.
     */
    function initialiseReveal() {
        var $revealItems = $(".reveal");

        if (!("IntersectionObserver" in window)) {
            $revealItems.addClass("is-visible");
            return;
        }

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) {
                    return;
                }

                $(entry.target).addClass("is-visible");
                observer.unobserve(entry.target);
            });
        }, {
            threshold: 0.12,
            rootMargin: "0px 0px -40px 0px"
        });

        $revealItems.each(function () {
            observer.observe(this);
        });
    }

    initialiseReveal();

    /*
     * Use native smooth scrolling so anchor links remain accessible and work
     * even when JavaScript enhancements are unavailable.
     */
    $(document).on("click", 'a[href^="#"]', function (event) {
        var href = $(this).attr("href");
        var $target;

        if (!href || href === "#") {
            return;
        }

        $target = $(href);

        if (!$target.length) {
            return;
        }

        event.preventDefault();
        window.scrollTo({ top: Math.max(0, $target.offset().top - 72), behavior: "smooth" });
    });

    $("#year").text(new Date().getFullYear());
});
