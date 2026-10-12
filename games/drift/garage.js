import * as THREE from '../../lib/three/0.180.0/three.module.min.js';
import { buildCar, disposeCar } from './car-model.js';
import { CAR_MODELS, PAINT_COLORS, WHEEL_FINISHES } from './garage-data.js';

// Render on demand instead of running a second animation loop during races.
export class Garage {
    constructor(dialog, preferences, apply, prepare = operation => operation()) {
        this.dialog = dialog; this.preferences = preferences; this.apply = apply; this.prepare = prepare;
        this.canvas = dialog.querySelector('canvas');
        this.heading = 0.65;
        const modelList = dialog.querySelector('[data-car-models]');
        for (const model of CAR_MODELS) {
            const button = document.createElement('button'); button.type = 'button';
            button.dataset.model = model.id;
            const category = document.createElement('small'); category.textContent = model.category;
            const name = document.createElement('strong'); name.textContent = model.name;
            button.append(category, name);
            button.addEventListener('click', () => { this.draft.model = model.id; this.update(); });
            modelList.append(button);
        }
        const swatches = dialog.querySelector('[data-paint-swatches]');
        for (const color of PAINT_COLORS) {
            const button = document.createElement('button'); button.type = 'button';
            button.style.setProperty('--paint', color); button.dataset.paint = color;
            button.setAttribute('aria-label', `Paint ${color}`);
            button.addEventListener('click', () => { this.draft.paint = color; this.update(); });
            swatches.append(button);
        }
        const wheels = dialog.querySelector('[name="wheels"]');
        for (const finish of Object.keys(WHEEL_FINISHES)) {
            const option = document.createElement('option'); option.value = finish; option.textContent = finish;
            wheels.append(option);
        }
        for (const control of dialog.querySelectorAll('[name]')) control.addEventListener('input', () => {
            this.draft[control.name] = control.type === 'checkbox' ? control.checked : control.value;
            this.update();
        });
        dialog.querySelectorAll('[data-rotate]').forEach(button => button.addEventListener('click', () => {
            this.heading += Number(button.dataset.rotate); this.render();
        }));
        dialog.querySelector('[data-garage-apply]').addEventListener('click', async () => {
            try {
                await this.apply(this.draft);
                this.preferences.save(this.draft);
                this.dialog.close();
            } catch {
                dialog.querySelector('[data-garage-status]').textContent = 'Car could not be applied. Please try again.';
            }
        });
        this.resizeObserver = new ResizeObserver(() => { if (dialog.open && this.renderer) this.render(); });
        this.resizeObserver.observe(this.canvas.parentElement);
        dialog.addEventListener('close', () => {
            // A queued close event must not dispose a newly reopened preview.
            if (!dialog.open) this.disposePreview();
        });
    }
    disposePreview() {
        if (this.car) disposeCar(this.car);
        this.car = null; this.scene = null;
        this.renderer?.dispose(); this.renderer?.forceContextLoss(); this.renderer = null;
    }
    async open() {
        this.disposePreview();
        this.draft = { ...this.preferences.value };
        // A deliberately released WebGL context cannot be reused immediately.
        // A fresh canvas also isolates late context-lost events from the next visit.
        const canvas = this.canvas.cloneNode(false);
        this.canvas.replaceWith(canvas); this.canvas = canvas;
        this.dialog.showModal();
        this.update();
        try {
            await this.prepare(async () => {
                this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
                this.scene = new THREE.Scene();
                this.scene.add(new THREE.HemisphereLight(0xffffff, 0x58616f, 3));
                const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(3, 6, 4); this.scene.add(light);
                this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
                this.camera.position.set(6, 3.3, 7); this.camera.lookAt(0, 0.8, 0);
                this.dialog.querySelector('[data-garage-status]').textContent = this.preferences.available ? 'Saved on this device. All cars share the same handling.' : 'Storage unavailable. Your selection lasts for this visit.';
                this.update(false);
                await this.renderer.compileAsync(this.scene, this.camera);
                this.render();
            });
        } catch {
            this.disposePreview();
            this.dialog.querySelector('[data-garage-status]').textContent = '3D preview unavailable. You can still choose your car.';
        }
    }
    update(render = true) {
        const spec = CAR_MODELS.find(model => model.id === this.draft.model);
        this.dialog.querySelector('[data-car-name]').textContent = spec.name;
        this.dialog.querySelector('[data-car-description]').textContent = spec.description;
        this.dialog.querySelectorAll('[data-model]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.model === this.draft.model)));
        this.dialog.querySelectorAll('[data-paint]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.paint === this.draft.paint)));
        for (const control of this.dialog.querySelectorAll('[name]')) {
            if (control.type === 'checkbox') control.checked = this.draft[control.name];
            else control.value = this.draft[control.name];
        }
        if (!this.scene) return;
        if (this.car) { this.scene.remove(this.car); disposeCar(this.car); }
        this.car = buildCar(this.draft); this.scene.add(this.car);
        if (render) this.render();
    }
    render() {
        if (!this.renderer || !this.car) return;
        const width = this.canvas.parentElement.clientWidth;
        const height = this.canvas.parentElement.clientHeight;
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / Math.max(height, 1);
        this.camera.position.set(Math.sin(this.heading) * 9, 3.5, Math.cos(this.heading) * 9);
        this.camera.lookAt(0, 0.8, 0); this.camera.updateProjectionMatrix();
        this.renderer.render(this.scene, this.camera);
    }
}
