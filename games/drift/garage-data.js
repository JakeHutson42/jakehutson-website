// Visual specifications are separate from physics: every car has the same pace.
export const CAR_MODELS = [
    { id: 'coupe', name: 'Sora GT', category: 'SPORT COUPE', description: 'Low roof. Long bonnet. A classic drift silhouette.', width: 1.85, length: 4.05, cabinLength: 1.7, roofHeight: 1.55, cabinZ: -0.24 },
    { id: 'hatch', name: 'Metro RX', category: 'HOT HATCH', description: 'Compact proportions and a squared-off rear roof.', width: 1.78, length: 3.55, cabinLength: 2.05, roofHeight: 1.75, cabinZ: -0.3 },
    { id: 'muscle', name: 'Vandal V8', category: 'MUSCLE CAR', description: 'Wide shoulders, a short cabin and a raised hood scoop.', width: 2.02, length: 4.55, cabinLength: 1.5, roofHeight: 1.48, cabinZ: -0.48 }
];
export const PAINT_COLORS = ['#dfff00', '#f2f0e8', '#ee654c', '#47b8d6', '#9375df', '#283339'];
export const WHEEL_FINISHES = { graphite: '#283339', silver: '#bfc8ca', gold: '#ba934e' };
export const DEFAULT_CUSTOMIZATION = { model: 'coupe', paint: '#dfff00', stripes: true, wheels: 'graphite', spoiler: true };
const STORAGE_KEY = 'apex-drift-garage-v1';

// Only allow known options from storage. Old or damaged saves fall back safely.
export function normalizeCustomization(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        model: CAR_MODELS.some(model => model.id === source.model) ? source.model : DEFAULT_CUSTOMIZATION.model,
        paint: typeof source.paint === 'string' && /^#[0-9a-f]{6}$/i.test(source.paint) ? source.paint : DEFAULT_CUSTOMIZATION.paint,
        stripes: typeof source.stripes === 'boolean' ? source.stripes : DEFAULT_CUSTOMIZATION.stripes,
        wheels: Object.hasOwn(WHEEL_FINISHES, source.wheels) ? source.wheels : DEFAULT_CUSTOMIZATION.wheels,
        spoiler: typeof source.spoiler === 'boolean' ? source.spoiler : DEFAULT_CUSTOMIZATION.spoiler
    };
}

export class GaragePreferences {
    constructor(storage) {
        this.available = true;
        this.value = { ...DEFAULT_CUSTOMIZATION };
        try {
            this.storage = storage || window.localStorage;
            this.value = normalizeCustomization(JSON.parse(this.storage.getItem(STORAGE_KEY)));
        } catch { this.available = false; }
    }
    save(value) {
        this.value = normalizeCustomization(value);
        try { this.storage.setItem(STORAGE_KEY, JSON.stringify(this.value)); }
        catch { this.available = false; }
    }
}
