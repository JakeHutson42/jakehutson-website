import * as THREE from '../../lib/three/0.180.0/three.module.min.js';
import { buildCar, disposeCar } from '../drift/car-model.js';
import { trackPose } from '../drift/math.js';
import { RACERS } from './race.js';
import { surfacePose } from './surface.js';
import { DeskBuilder, loadDeskMaterials, batchStaticMeshes } from './desk-world.js';

const COLORS = ['#ed7866', '#69b5a8', '#f1c85b', '#8f80b5', '#ede6d8'];

export class PocketWorld {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.12;
        // All scenery is static. Cars use soft contact shadows, allowing the
        // detailed scene's directional shadow map to be baked once per layout.
        this.renderer.shadowMap.autoUpdate = false;
        this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#282333');
        this.camera = new THREE.OrthographicCamera(-100, 100, 75, -75, .1, 800);
        this.camera.up.set(0, 0, -1);
        this.scene.add(new THREE.HemisphereLight('#fff4df', '#7d8790', 2.0));
        this.sun = new THREE.DirectionalLight('#fff1d1', 2.4);
        this.sun.position.set(-65, 140, -40); this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        Object.assign(this.sun.shadow.camera, { left: -220, right: 220, top: 195, bottom: -195, near: 1, far: 400 });
        this.sun.shadow.bias = -.0006;
        this.scene.add(this.sun);
        this.materials = new Map(); this.labels = new Map(); this.cars = [];
        this.assetMaterials = new Set();
        this.underpassMarker = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.9, 24),
            new THREE.MeshBasicMaterial({ color: '#ffdc70', transparent: true, opacity: .9, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
        this.underpassMarker.rotation.x = -Math.PI / 2; this.underpassMarker.renderOrder = 10;
        this.underpassMarker.visible = false; this.scene.add(this.underpassMarker);
        this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas.parentElement);
        canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.onContextLost?.(); });
        canvas.addEventListener('webglcontextrestored', () => { this.renderer.shadowMap.needsUpdate = true; this.onContextRestored?.(); });
    }
    async loadAssets() {
        try { this.deskMaterials = await loadDeskMaterials(); }
        catch (error) {
            console.warn('Using simple desk materials while texture detail is unavailable.', error);
            this.deskMaterials = Object.fromEntries(Object.entries({ wood: '#98704b', paper: '#e9dfc7', cloth: '#3e6970', mat: '#456454' })
                .map(([name, color]) => [name, new THREE.MeshStandardMaterial({ color, roughness: .85, side: THREE.DoubleSide })]));
        }
        this.assetMaterials = new Set(Object.values(this.deskMaterials));
        const shadow = document.createElement('canvas'); shadow.width = shadow.height = 64;
        const ctx = shadow.getContext('2d'), gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
        gradient.addColorStop(0, '#0009'); gradient.addColorStop(.5, '#0005'); gradient.addColorStop(1, '#0000');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
        this.carShadow = new THREE.CanvasTexture(shadow);
    }
    material(color) {
        if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .76 }));
        return this.materials.get(color);
    }
    mesh(geometry, color, parent, x = 0, y = 0, z = 0) {
        const mesh = new THREE.Mesh(geometry, typeof color === 'string' ? this.material(color) : color);
        mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    }
    box(parent, x, y, z, w, h, d, color) { return this.mesh(new THREE.BoxGeometry(w, h, d), color, parent, x, y, z); }
    cylinder(parent, x, y, z, r, h, color, top = r) { return this.mesh(new THREE.CylinderGeometry(top, r, h, 32), color, parent, x, y, z); }
    label(text, color = '#494254', background = '#f4eddb') {
        const key = `${text}:${color}:${background}`;
        if (this.labels.has(key)) return this.labels.get(key);
        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = background; ctx.fillRect(0, 0, 512, 256);
        ctx.fillStyle = color; ctx.font = 'bold 54px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        text.split('\n').forEach((line, i, lines) => ctx.fillText(line, 256, 128 + (i - (lines.length - 1) / 2) * 65, 470));
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .8 });
        this.labels.set(key, material); return material;
    }
    topLabel(parent, text, x, y, z, w, d, color, background) {
        const label = this.mesh(new THREE.PlaneGeometry(w, d), this.label(text, color, background), parent, x, y, z);
        label.rotation.x = -Math.PI / 2; label.castShadow = false; return label;
    }
    surfaceTexture(room) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = room.surface; ctx.fillRect(0, 0, 512, 512);
        ctx.strokeStyle = '#503832';
        if (room.id === 'desk') {
            for (let i = 0; i < 180; i++) {
                ctx.globalAlpha = .018 + (i % 7) * .004; ctx.beginPath();
                ctx.moveTo(0, i * 3); ctx.bezierCurveTo(140, i * 3 - 8, 280, i * 3 + 8, 512, i * 3); ctx.stroke();
            }
        } else if (room.id === 'kitchen') {
            ctx.globalAlpha = .17; ctx.lineWidth = 2;
            for (let i = 0; i < 512; i += 128) { ctx.strokeRect(i, 0, 128, 512); ctx.strokeRect(0, i, 512, 128); }
        } else {
            ctx.globalAlpha = .07;
            for (let x = 0; x < 512; x += 8) { ctx.fillStyle = x % 16 ? '#fff' : '#252033'; ctx.fillRect(x, 0, 1, 512); ctx.fillRect(0, x, 512, 1); }
        }
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({ map: texture, roughness: .95 });
    }
    ribbon(track, offset, width, height, color) {
        const positions = [], indices = [];
        for (let i = 0; i <= track.points.length; i++) {
            const pose = trackPose(track, i / track.points.length);
            for (const side of [-1, 1]) {
                const distance = offset + side * width / 2;
                positions.push(pose.x + Math.cos(pose.heading) * distance, height, pose.z - Math.sin(pose.heading) * distance);
            }
            if (i < track.points.length) { const n = i * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
        const mesh = this.mesh(geometry, color, this.map); mesh.castShadow = false;
        // Closed spline winding is clockwise from above; double-sided ribbons
        // also keep road markings visible on implementations with reversed normals.
        mesh.material.side = THREE.DoubleSide;
    }
    build(track) {
        this.clearMap(); this.track = track; this.map = new THREE.Group(); this.scene.add(this.map);
        const room = track.room;
        if (track.authored) new DeskBuilder(this).build(track);
        else {
        this.box(this.map, 0, -4, 0, 284, 7, 222, '#65505c');
        this.mesh(new THREE.BoxGeometry(280, .8, 218), this.surfaceTexture(room), this.map, 0, -.45, 0);
        this.ribbon(track, 0, track.width + 1.5, .03, room.edge);
        this.ribbon(track, 0, track.width - .8, .05, room.road);
        for (const side of [-1, 1]) {
            this.ribbon(track, side * (track.width / 2 - .35), .32, .08, '#fff5df');
            // Low tape rails cast a readable shadow; the collision capsule uses
            // their inner face as its boundary.
            for (const y of [.12, .32, .52, .72]) this.ribbon(track, side * track.width / 2, .55, y, room.edge);
        }
        for (let i = 0; i < 48; i++) {
            const pose = trackPose(track, i / 48 + .006);
            const dash = this.box(this.map, pose.x, .08, pose.z, .17, .015, 2, '#c5b6a6'); dash.rotation.y = pose.heading;
        }
        }
        const finish = surfacePose(track, 0), line = new THREE.Group(); line.position.set(finish.x, finish.y + .2, finish.z); line.rotation.y = finish.heading; this.map.add(line);
        const square = (finish.width - 1.5) / 10;
        for (let x = 0; x < 10; x++) for (let z = 0; z < 3; z++)
            this.box(line, (x - 4.5) * square, 0, (z - 1) * 1.1, square, .04, 1.1, (x + z) % 2 ? '#42384f' : '#fff9e7');
        for (const side of [-1, 1]) {
            this.box(line, side * (finish.width / 2 + 1), 3, 0, .6, 6, .6, '#f3dbac');
            this.topLabel(line, side < 0 ? 'START' : 'FINISH', side * (finish.width / 2 + 4), .17, 0, 6, 3, '#483545', '#ffdc70');
        }
        if (!track.authored) {
        this.topLabel(this.map, 'POCKET / CIRCUIT', -62, .1, 92, 43, 7, room.edge, room.surface);
        for (const prop of track.props) this.prop(prop);
        }
        for (const boost of track.boosts) {
            const pad = new THREE.Group(); pad.position.set(boost.x, (boost.y || 0) + .24, boost.z); pad.rotation.set(-(boost.pitch || 0), boost.heading, 0, 'YXZ');
            this.map.add(pad); this.box(pad, 0, 0, 0, 10, .06, 5, room.accent);
            for (let z = -1.4; z <= 1.4; z += 1.4) for (const side of [-1, 1]) {
                const chevron = this.box(pad, side * .65, .05, z, .35, .03, 1.8, '#645037'); chevron.rotation.y = -side * .7;
            }
        }
        if (track.authored) batchStaticMeshes(this.map);
        this.renderer.shadowMap.needsUpdate = true;
        this.cameraTarget = new THREE.Vector3(0, 0, 0); this.resize();
    }
    prop(spec) {
        const p = new THREE.Group(), color = COLORS[spec.color];
        p.position.set(spec.x, 0, spec.z); p.rotation.y = spec.rotation; this.map.add(p);
        const box = (x, y, z, w, h, d, c) => this.box(p, x, y, z, w, h, d, c);
        const cylinder = (x, y, z, r, h, c, top) => this.cylinder(p, x, y, z, r, h, c, top);
        const type = spec.type;
        if (['pencil', 'crayon'].includes(type)) {
            const body = this.mesh(new THREE.CylinderGeometry(1, 1, 21, 6), color, p, 0, 1.1, 0); body.rotation.x = Math.PI / 2;
            const tip = this.mesh(new THREE.ConeGeometry(1, 3.2, 6), type === 'pencil' ? '#edd6a7' : color, p, 0, 1.1, 12); tip.rotation.x = Math.PI / 2;
            box(0, 1.1, -11, 1.7, 1.7, 2, type === 'pencil' ? '#e89894' : '#ece0b9');
            if (type === 'crayon') { const band = this.mesh(new THREE.CylinderGeometry(1.05, 1.05, 12, 8), '#efdfa9', p, 0, 1.1, 0); band.rotation.x = Math.PI / 2; }
        } else if (type === 'notebook') {
            box(0, .8, 0, 24, 1.6, 19, color); box(.5, 1.7, 0, 22, .2, 17, '#f4eddb');
            for (let z = -7; z <= 7; z += 2) { box(1, 1.83, z, 18, .03, .12, '#bbced1'); box(-10, 1.9, z, 3, .2, .25, '#5b5460'); }
            this.topLabel(p, 'BIG IDEAS', 2, 1.88, -3, 12, 4, '#8a6e85');
        } else if (type === 'mug') {
            cylinder(0, 4, 0, 6.3, 8, '#f2e4cb'); cylinder(0, 8.02, 0, 5.3, .15, '#67483b');
            const handle = this.mesh(new THREE.TorusGeometry(3, 1.1, 8, 24), '#f2e4cb', p, 7, 4.5, 0); handle.rotation.y = Math.PI / 2;
            cylinder(0, .2, 0, 8.6, .4, color);
        } else if (type === 'keyboard') {
            box(0, 1, 0, 37, 2, 14, '#e4dccb');
            for (let row = 0; row < 4; row++) for (let col = 0; col < 12; col++) box((col - 5.5) * 2.8, 2.25, (row - 1.5) * 2.9, 2.3, .5, 2.3, col % 5 === 0 ? color : '#f8f2e3');
            box(0, 2.2, 6, 13, .5, 1.5, '#f8f2e3');
        } else if (type === 'eraser' || type === 'sponge') {
            box(0, 1.5, 0, type === 'eraser' ? 11 : 15, 3, type === 'eraser' ? 6 : 10, type === 'eraser' ? '#eb9d9a' : '#f1cc66');
            box(0, 3.1, 0, type === 'eraser' ? 6 : 15, .4, type === 'eraser' ? 6.1 : 10, type === 'eraser' ? '#e5e7db' : '#72947a');
        } else if (type === 'clip') {
            const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-2, .3, -5), new THREE.Vector3(3, .3, -5), new THREE.Vector3(3, .3, 5), new THREE.Vector3(-3, .3, 5), new THREE.Vector3(-3, .3, -3), new THREE.Vector3(1, .3, -3), new THREE.Vector3(1, .3, 3)]);
            this.mesh(new THREE.TubeGeometry(curve, 32, .4, 6, false), '#d2d7d5', p);
        } else if (type === 'plate') {
            cylinder(0, .6, 0, 14, 1.2, '#f4eee4'); cylinder(0, 1.2, 0, 11, .3, '#e4d9c7');
            for (let i = 0; i < 3; i++) { const cookie = cylinder((i - 1) * 5, 2, i % 2 * 4 - 2, 4, 1.3, '#c98c4e'); cookie.rotation.y = i; }
        } else if (type === 'cookie') {
            cylinder(0, .7, 0, 7, 1.4, '#cd955b');
            for (let i = 0; i < 9; i++) cylinder(Math.sin(i * 4) * (i % 3 + 1.5), 1.45, Math.cos(i * 4) * (i % 3 + 1.5), .65, .2, '#6c493c');
        } else if (type === 'cereal') {
            box(0, 10, 0, 17, 20, 8, color);
            this.topLabel(p, 'TURBO\nLOOPS', 0, 20.05, 0, 16, 7, '#4a3a47', '#ffdc70');
            for (let i = 0; i < 5; i++) { const loop = this.mesh(new THREE.TorusGeometry(1.2, .5, 6, 12), '#eab76c', p, -8 + i * 3, .6, 9 + i % 2 * 2); loop.rotation.x = Math.PI / 2; }
        } else if (type === 'spoon') {
            box(0, .5, -3, 1.6, .7, 18, '#c8d2d0'); const bowl = this.mesh(new THREE.SphereGeometry(3.8, 20, 10), '#dce3dc', p, 0, .8, 8); bowl.scale.set(1, .2, 1.4);
        } else if (type === 'block') {
            box(0, 3, 0, 13, 6, 9, color);
            for (const x of [-4, 0, 4]) for (const z of [-2.2, 2.2]) cylinder(x, 6.5, z, 1.4, 1.2, color);
        } else if (type === 'domino') {
            box(0, 1, 0, 8, 2, 14, '#eee9dd'); box(0, 2.05, 0, 7, .1, .18, '#574655');
            for (let i = 0; i < 5; i++) cylinder(i % 2 ? -2 : 2, 2.1, i < 2 ? -4 : 3 + i % 2 * 2, .45, .1, '#574655');
        } else if (type === 'ball') {
            this.mesh(new THREE.SphereGeometry(7.5, 24, 16), color, p, 0, 7.5, 0);
            const band = this.mesh(new THREE.TorusGeometry(7.5, .3, 6, 32), '#f1dfb9', p, 0, 7.5, 0); band.rotation.x = .6;
        } else if (type === 'train') {
            box(0, 3.5, 0, 9, 5, 22, color); box(0, 8, -6, 8, 6, 8, '#e5c667'); cylinder(0, 6, 5, 3, 6, '#5b6678');
            for (const x of [-5, 5]) for (const z of [-7, 7]) { const wheel = cylinder(x, 2, z, 2, 1.2, '#554956'); wheel.rotation.z = Math.PI / 2; }
        }
    }
    setCars(drivers, paint) {
        this.underpassMarker.material.color.set(paint);
        this.cars.forEach(car => { this.scene.remove(car); disposeCar(car); });
        this.cars = drivers.map(driver => {
            const spec = RACERS[driver.index];
            const car = buildCar({ model: spec.model, paint: driver.index === 0 ? paint : spec.color, stripes: true, spoiler: true, wheels: 'graphite' });
            car.traverse(mesh => { if (mesh.isMesh) mesh.castShadow = false; });
            batchStaticMeshes(car);
            const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4, 6.3), new THREE.MeshBasicMaterial({ map: this.carShadow, transparent: true, depthWrite: false, opacity: .65 }));
            shadow.rotation.x = -Math.PI / 2; shadow.position.y = .02; car.add(shadow);
            this.scene.add(car); return car;
        });
    }
    resize() {
        const { width, height } = this.canvas.getBoundingClientRect();
        if (width < 1 || height < 1) return;
        this.renderer.setSize(width, height, false); this.aspect = width / height;
    }
    render(drivers, playing, dt, reducedMotion) {
        if (!this.map || !this.aspect) return;
        drivers.forEach((driver, i) => {
            const mesh = this.cars[i]; if (!mesh) return;
            mesh.position.set(driver.x, (driver.y || 0) + .12, driver.z); mesh.rotation.set(-(driver.pitch || 0), driver.heading, 0, 'YXZ');
            mesh.userData.tailLightMaterial.emissiveIntensity = driver.braking ? 2 : .5;
        });
        const player = drivers[0];
        this.underpassMarker.visible = Boolean(playing && this.track.authored && player.y < 3 && Math.abs(player.x) < 46 && Math.abs(player.z) < 8);
        this.underpassMarker.position.set(player.x, 12.5, player.z);
        const desired = new THREE.Vector3(playing ? player.x + player.vx * .35 : 0, playing ? player.y || 0 : 0, playing ? player.z + player.vz * .35 : 0);
        this.cameraTarget.lerp(desired, playing && !reducedMotion ? 1 - Math.exp(-6 * dt) : 1);
        const halfHeight = playing ? (this.aspect < .8 ? 57 : 40) : this.track.authored ? Math.max(148, 186 / this.aspect) : Math.max(108, 146 / this.aspect);
        Object.assign(this.camera, { left: -halfHeight * this.aspect, right: halfHeight * this.aspect, top: halfHeight, bottom: -halfHeight });
        this.camera.updateProjectionMatrix();
        this.camera.position.copy(this.cameraTarget).add(new THREE.Vector3(0, 150, 95)); this.camera.lookAt(this.cameraTarget);
        this.renderer.render(this.scene, this.camera);
        const calls = String(this.renderer.info.render.calls);
        if (this.canvas.dataset.drawCalls !== calls) {
            this.canvas.dataset.drawCalls = calls;
            this.canvas.dataset.triangles = String(this.renderer.info.render.triangles);
        }
    }
    clearMap() {
        if (!this.map) return;
        this.scene.remove(this.map);
        const geometries = new Set(), surfaceMaterials = new Set();
        this.map.traverse(object => { if (object.isInstancedMesh) object.dispose(); if (object.geometry) geometries.add(object.geometry); if (object.material?.map && ![...this.labels.values()].includes(object.material) && !this.assetMaterials.has(object.material)) surfaceMaterials.add(object.material); });
        geometries.forEach(geometry => geometry.dispose());
        surfaceMaterials.forEach(material => { material.map.dispose(); material.dispose(); });
    }
}
