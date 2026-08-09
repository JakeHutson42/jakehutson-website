$(document).ready(function () {

    /*
     * -----------------------------------------------
     * Navigation
     * -----------------------------------------------
     */

    $(window).on("scroll", function () {

        if ($(window).scrollTop() > 40) {
            $("#navbar").addClass("scrolled");
        } else {
            $("#navbar").removeClass("scrolled");
        }

    });


    /*
     * -----------------------------------------------
     * Scroll reveal
     * -----------------------------------------------
     */

    function revealElements() {

        $(".reveal").each(function () {

            const elementTop = $(this).offset().top;

            const windowBottom =
                $(window).scrollTop() +
                $(window).height();

            if (elementTop < windowBottom - 60) {
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

        const target = $(this.getAttribute("href"));

        if (target.length) {

            event.preventDefault();

            $("html, body").animate({
                scrollTop: target.offset().top - 80
            },
                350
            );

        }

    });


    /*
     * -----------------------------------------------
     * Current year
     * -----------------------------------------------
     */

    $("#year").text(new Date().getFullYear());

});