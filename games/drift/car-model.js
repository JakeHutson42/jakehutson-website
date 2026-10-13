import * as THREE from '../../lib/three/0.180.0/three.module.min.js';
import { CAR_MODELS, WHEEL_FINISHES, normalizeCustomization } from './garage-data.js';

// The garage and circuit use this exact model factory, so preview and race agree.
// Geometry is generated locally; no model downloads or external assets are needed.
export function buildCar(customization) {
    const options = normalizeCustomization(customization);
    const spec = CAR_MODELS.find(model => model.id === options.model);
    const car = new THREE.Group();
    const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
    const paint = material(options.paint, { metalness: 0.25 });
    const rubber = material('#141b1f', { roughness: 0.95 });
    const trim = material('#20292e');
    const glass = material('#354c50', { roughness: 0.2, metalness: 0.35 });
    const rim = material(WHEEL_FINISHES[options.wheels], { metalness: 0.65, roughness: 0.3 });
    const box = (width, height, depth, surface, x, y, z) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), surface);
        mesh.position.set(x, y, z); mesh.castShadow = true; car.add(mesh);
        return mesh;
    };
    const front = spec.length / 2;
    box(spec.width, 0.55, spec.length, paint, 0, 0.65, 0);
    box(spec.width * 0.88, 0.20, 1.2, paint, 0, 1.01, front - 0.67);
    box(spec.width * 0.8, spec.roofHeight - 0.94, spec.cabinLength, glass, 0, (spec.roofHeight + 0.94) / 2, spec.cabinZ);
    box(spec.width * 0.83, 0.1, spec.cabinLength * 0.77, paint, 0, spec.roofHeight, spec.cabinZ);
    box(spec.width + 0.04, 0.17, 0.12, trim, 0, 0.45, front);
    box(spec.width + 0.04, 0.17, 0.12, trim, 0, 0.45, -front);
    if (options.model === 'muscle') box(0.72, 0.15, 0.65, trim, 0, 1.18, 1.2);
    if (options.stripes) for (const x of [-0.28, 0.28]) {
        box(0.19, 0.015, spec.cabinLength * 0.77, trim, x, spec.roofHeight + 0.06, spec.cabinZ);
        box(0.19, 0.015, 1.2, trim, x, 1.12, front - 0.67);
    }
    if (options.spoiler) {
        for (const x of [-0.6, 0.6]) box(0.09, 0.28, 0.12, trim, x, 1.08, -front + 0.2);
        box(spec.width + 0.1, 0.12, 0.35, trim, 0, 1.25, -front + 0.2);
    }
    const headlights = material('#fff7cb', { emissive: '#ffe5a0', emissiveIntensity: 0.4 });
    const taillights = material('#e74e36', { emissive: '#e72914', emissiveIntensity: 0.5 });
    car.userData.tailLightMaterial = taillights;
    for (const x of [-spec.width * 0.34, spec.width * 0.34]) {
        box(0.44, 0.16, 0.04, headlights, x, 0.81, front + 0.02);
        box(0.44, 0.12, 0.04, taillights, x, 0.78, -front - 0.02);
    }
    const tireGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.28, 16);
    const rimGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.3, 8);
    const discGeometry = new THREE.RingGeometry(0.255, 0.32, 20);
    const discs = material('#56616a', { metalness: 0.55, roughness: 0.35, emissive: '#ff4208', emissiveIntensity: 0, side: THREE.DoubleSide });
    car.userData.brakeDiscMaterial = discs;
    for (const x of [-spec.width / 2 - 0.03, spec.width / 2 + 0.03]) for (const z of [-spec.length * 0.31, spec.length * 0.31]) {
        for (const [geometry, surface] of [[tireGeometry, rubber], [rimGeometry, rim]]) {
            const wheel = new THREE.Mesh(geometry, surface);
            wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.43, z);
            wheel.castShadow = true; car.add(wheel);
        }
        const disc = new THREE.Mesh(discGeometry, discs); disc.name = 'brake-disc';
        disc.rotation.y = Math.PI / 2; disc.position.set(Math.sign(x)*(spec.width/2+0.19), 0.43, z);
        car.add(disc);
    }
    return car;
}

// Shared materials/geometries must be disposed once when replacing a car.
export function disposeCar(car) {
    const geometries = new Set(); const materials = new Set();
    car.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) materials.add(object.material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
}
