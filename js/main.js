$(function () {
    const $navbar = $("#navbar");
    const $mobileNavigation = $("#mobileNavigation");

    /*
     * -----------------------------------------------
     * Navigation
     * -----------------------------------------------
     */

    loadSharedNavbar();

    /*
     * -----------------------------------------------
     * Shared layout
     * -----------------------------------------------
     */

    function loadSharedNavbar() {
        $("#siteNavbar").load("partials/navbar.html", function (response, status) {
            if (status === "error") {
                console.error("The shared navigation could not be loaded.");
                return;
            }

            initialiseNavigation();
        });
    }

    function initialiseNavigation() {
        const $navbar = $("#navbar");
        const $mobileNavigation = $("#mobileNavigation");

        function updateNavbar() {
            $navbar.toggleClass("scrolled", $(window).scrollTop() > 40);
        }

        updateNavbar();
        $(window).on("scroll", updateNavbar);

        $mobileNavigation.on("show.bs.collapse", function () {
            $navbar.addClass("mobile-menu-open");
        });

        $mobileNavigation.on("hidden.bs.collapse", function () {
            $navbar.removeClass("mobile-menu-open");
        });
    }

    /*
     * -----------------------------------------------
     * Scroll reveal
     * -----------------------------------------------
     */

    function revealElements() {
        const windowBottom = $(window).scrollTop() + $(window).height();

        $(".reveal").each(function () {
            if ($(this).offset().top < windowBottom - 60) {
                $(this).addClass("visible");
            }
        });
    }

    revealElements();
    $(window).on("scroll", revealElements);

    /*
     * -----------------------------------------------
     * Smooth navigation
     * -----------------------------------------------
     */

    $('a[href^="#"]').on("click", function (event) {
        const href = $(this).attr("href");

        if (!href || href === "#") {
            return;
        }

        const $target = $(href);

        if (!$target.length) {
            return;
        }

        event.preventDefault();

        $("html, body").animate({
            scrollTop: $target.offset().top - 80
        }, 350);

        if ($(this).closest("#mobileNavigation").length && $mobileNavigation.length && window.bootstrap) {
            bootstrap.Collapse.getOrCreateInstance($mobileNavigation[0]).hide();
        }
    });

    /*
     * -----------------------------------------------
     * Current year
     * -----------------------------------------------
     */

    $("#year").text(new Date().getFullYear());
});