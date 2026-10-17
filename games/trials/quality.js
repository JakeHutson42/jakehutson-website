export const TIERS = Object.freeze({
    high: Object.freeze({ dpr: 1.5, shadow: 2048, scenery: 1, benches: 4 }),
    balanced: Object.freeze({ dpr: 1.25, shadow: 1024, scenery: .6, benches: 2 }),
    low: Object.freeze({ dpr: 1, shadow: 0, scenery: .3, benches: 1 })
});
export function resolveQuality(choice = 'auto', { coarse = false, width = 1920, dpr = 1 } = {}) {
    const name = choice in TIERS ? choice : coarse || width < 760 ? 'low' : 'high';
    return { name, ...TIERS[name], pixelRatio: Math.min(Math.max(Number.isFinite(dpr) ? dpr : 1, .5), TIERS[name].dpr) };
}
/** Stable subsampling; decorative placement never consumes a physics seed. */
export function scenerySubset(items, fraction) { return fraction === 1 ? items : items.filter((_, i) => i % Math.ceil(1 / fraction) === 0); }
