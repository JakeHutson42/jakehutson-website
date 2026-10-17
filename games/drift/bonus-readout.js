const TIERS = ['DRIFT', 'FLOW', 'SURGE', 'OVERDRIVE', 'MAX BONUS'];
const ENTRANCES = [null,
    [{ opacity: 0, transform: 'translateY(10px) scale(.88)' }, { opacity: 1, transform: 'none' }],
    [{ opacity: .3, transform: 'translateX(-12px) skewX(-9deg)' }, { opacity: 1, transform: 'none' }],
    [{ transform: 'scale(.8) rotate(-4deg)' }, { transform: 'scale(1.12) rotate(1deg)', offset: .55 }, { transform: 'none' }],
    [{ opacity: .4, transform: 'translateY(8px) scale(.72)' }, { opacity: 1, transform: 'translateY(-3px) scale(1.2)', offset: .5 }, { opacity: 1, transform: 'none' }],
];

// Animate only tier transitions, never the 12 Hz score updates. One owned animation
// is cancelled on banking/restart so an old entrance cannot leak into the next combo.
export class BonusReadout {
    constructor(root, value, label, motion = window.matchMedia('(prefers-reduced-motion: reduce)')) {
        this.root = root;
        this.value = value;
        this.label = label;
        this.motion = motion;
        this.tier = 1;
        this.animation = null;
        motion.addEventListener('change', () => {
            if (motion.matches) this.animation?.cancel();
        });
    }

    setActive(active) {
        this.root.classList.toggle('is-bonus-paused', !active);
        if (!active && this.animation?.playState === 'running') this.animation.pause();
        else if (active && this.animation?.playState === 'paused') this.animation.play();
    }

    update(combo, multiplier, active) {
        const text = Math.floor(combo).toLocaleString();
        if (this.value.textContent !== text) this.value.textContent = text;
        if (multiplier !== this.tier) {
            const upgraded = multiplier > this.tier;
            this.tier = multiplier;
            this.animation?.cancel();
            this.animation = null;
            this.root.dataset.bonusTier = String(multiplier);
            this.label.textContent = `${TIERS[multiplier - 1]} · BONUS INCLUDED`;
            this.label.setAttribute('aria-label', `${TIERS[multiplier - 1]}. Earning rate: ${multiplier} times base points. Bonus already included in the displayed score.`);
            if (upgraded && !this.motion.matches && active) {
                this.animation = this.value.animate(ENTRANCES[multiplier - 1], {
                    duration: multiplier === 5 ? 750 : 500,
                    easing: 'cubic-bezier(.2,.8,.25,1)',
                });
            }
        }
        this.setActive(active);
    }
}
