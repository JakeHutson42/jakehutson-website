import { roadSamples, offsetSurface, roadHeight, surfacePose } from './road-surface.js';
import { smokeVelocity } from './smoke-motion.js';
import { CircuitFlythrough } from './preview-camera.js';
import * as THREE from '../../lib/three/0.180.0/three.module.min.js';
import { nearestTrackPoint, trackPose, wrapAngle } from './math.js';
import { buildTrackBarriers } from './barrier-mesh.js';
import { TRACK_EDGE_CONFIG as EDGE, CAMERA_CONFIG } from './config.js';
import { buildCar, disposeCar } from './car-model.js';

const COLORS = { asphalt: 0x101624, sand: 0x202638, white: 0xa5dbe8, yellow: 0x36e6ed, red: 0xd66443 };

function seededRandom(seed) {
    return () => {
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}

// Ribbon geometry follows the same centerline used by the driving model. No hidden
// collision mesh can disagree with what the player sees on screen.
function ribbonGeometry(track, innerOffset, outerOffset, height) {
    const samples = roadSamples(track), vertices = [], indices = [];
    for (let i = 0; i <= samples.length; i++) {
        const pose = samples[i % samples.length];
        for (const offset of [innerOffset, outerOffset]) vertices.push(...offsetSurface(pose, offset, height));
        if (i < samples.length) { const j = i * 2; indices.push(j, j+2, j+1, j+1, j+2, j+3); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
}

export class DriftWorld {
    constructor(canvas) {
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.scene = new THREE.Scene();
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.3;
        this.scene.background = new THREE.Color(0x050817);
        this.scene.fog = new THREE.Fog(0x080d23, 140, 680);
        // A one-metre near plane preserves depth precision in the wide circuit preview.
        this.camera = new THREE.PerspectiveCamera(CAMERA_CONFIG.fieldOfView, 1, 1, 1100);
        this.scene.add(new THREE.HemisphereLight(0x92baff, 0x151028, 1.3));
        this.sun = new THREE.DirectionalLight(0x93b9ff, 1.8);
        this.sun.position.set(-110, 180, 75);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        Object.assign(this.sun.shadow.camera, { left: -210, right: 210, top: 210, bottom: -210, far: 450 });
        this.sun.shadow.normalBias = 0.15;
        this.scene.add(this.sun, this.sun.target);
        this.cameraTarget = new THREE.Vector3();
        this.cameraHeading = 0;
        this.followingCar = false;
        this.car = this.buildCar();
        this.scene.add(this.car);
        this.tireMarks = this.buildTireMarks();
        this.scene.add(this.tireMarks);
        this.markIndex = 0;
        this.lastMark = null;
        this.buildSmoke();
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(canvas.parentElement);
        this.resize();
    }

    material(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...extra }); }

    buildCar() { return buildCar(); }

    setCar(customization) {
        const replacement = buildCar(customization);
        replacement.position.copy(this.car.position);
        replacement.rotation.copy(this.car.rotation);
        this.scene.remove(this.car);
        disposeCar(this.car);
        this.car = replacement;
        this.scene.add(replacement);
    }

    async prepare(race) {
        // The lobby preview and full-screen race use different canvas bounds.
        this.resize();
        // Compile shaders behind the input lock, then submit the actual view.
        await this.renderer.compileAsync(this.scene, this.camera);
        this.render(race, 0, performance.now() / 1000);
    }

    buildSmoke() {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(190,205,225,0.65)');
        gradient.addColorStop(0.45, 'rgba(155,175,200,0.35)');
        gradient.addColorStop(1, 'rgba(140,160,190,0)');
        context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
        const texture = new THREE.CanvasTexture(canvas);
        this.smoke = Array.from({ length: 96 }, () => {
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture,
                transparent: true, depthWrite: false, opacity: 0 }));
            sprite.visible = false; this.scene.add(sprite);
            return { sprite, life: 0, vx: 0, vz: 0 };
        });
        this.smokeIndex = 0; this.smokeRemainder = 0;
    }

    updateSmoke(race, deltaTime) {
        // Pause freezes existing plumes; reset/teleport clears the trail.
        const car = race.car;
        if (this.lastSmokeCar !== car || race.state === 'ready') {
            this.smoke.forEach(puff => { puff.life = 0; puff.sprite.visible = false; });
            this.smokeRemainder = 0; this.lastSmokeCar = car;
        }
        if (race.state === 'paused') return;
        for (const puff of this.smoke) {
            if (puff.life <= 0) continue;
            puff.life = Math.max(0, puff.life - deltaTime);
            puff.sprite.visible = puff.life > 0;
            puff.sprite.position.x += puff.vx * deltaTime;
            puff.sprite.position.z += puff.vz * deltaTime;
            puff.sprite.position.y += 0.9 * deltaTime;
            const size = 0.6 + (1.5 - puff.life) * 2.8;
            puff.sprite.scale.setScalar(size);
            puff.sprite.material.opacity = 0.5 * Math.min(1, puff.life / 0.65);
        }
        if (race.state !== 'racing' || !race.drifting) { this.smokeRemainder = 0; return; }
        this.smokeRemainder += deltaTime;
        const velocity = smokeVelocity(car);
        while (this.smokeRemainder >= 1 / 24) {
            this.smokeRemainder -= 1 / 24;
            for (const side of [-0.8, 0.8]) {
                const puff = this.smoke[this.smokeIndex++ % this.smoke.length];
                puff.life = 1.5; puff.vx = velocity.x; puff.vz = velocity.z;
                puff.sprite.position.set(car.x - Math.sin(car.heading) * 1.6 + Math.cos(car.heading) * side,
                    (car.y || 0) + 0.35, car.z - Math.cos(car.heading) * 1.6 - Math.sin(car.heading) * side);
                puff.sprite.scale.setScalar(0.6); puff.sprite.material.opacity = 0.5;
                puff.sprite.material.rotation = Math.random() * Math.PI;
                puff.sprite.visible = true;
            }
        }
    }

    buildTireMarks() {
        // A bounded ring buffer avoids allocating thousands of objects during long runs.
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(1800 * 6), 3));
        const marks = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x172025, transparent: true, opacity: 0.3 }));
        marks.frustumCulled = false;
        return marks;
    }

    loadTrack(track) {
        if (this.environment) {
            this.scene.remove(this.environment);
            const geometries = new Set(); const materials = new Set();
            this.environment.traverse(object => {
                if (object.isInstancedMesh) object.dispose();
                if (object.geometry) geometries.add(object.geometry);
                if (object.material) materials.add(object.material);
            });
            geometries.forEach(geometry => geometry.dispose());
            materials.forEach(material => material.dispose());
        }
        this.track = track;
        this.flythrough = new CircuitFlythrough(track);
        this.environment = new THREE.Group();
        this.scene.add(this.environment);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), this.material(COLORS.sand));
        floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.environment.add(floor);
        const halfWidth = track.width / 2;
        const road = new THREE.Mesh(ribbonGeometry(track, -halfWidth, halfWidth, 0.08), this.material(COLORS.asphalt, { side: THREE.DoubleSide, roughness: 0.23, metalness: 0.35 }));
        road.receiveShadow = true; this.environment.add(road);
        const verge = new THREE.Mesh(ribbonGeometry(track, -halfWidth - EDGE.vergeWidth,
            halfWidth + EDGE.vergeWidth, 0.025), this.material(COLORS.sand, { side: THREE.DoubleSide }));
        verge.receiveShadow = true; this.environment.add(verge);
        for (const side of [-1, 1]) {
            const stripe = new THREE.Mesh(ribbonGeometry(track, side * (halfWidth - EDGE.lineWidth),
                side * halfWidth, 0.10), this.material(COLORS.white, { side: THREE.DoubleSide }));
            this.environment.add(stripe);
        }
        const barriers = buildTrackBarriers(track);
        this.environment.add(barriers);
        this.lampPoses = barriers.userData.lampPoses;
        this.buildStartLine(track);
        this.buildLoopEntry(track);
        this.buildScenery(track);
        this.buildBridgeSupports(track);
        this.markIndex = 0; this.lastMark = null;
        this.tireMarks.geometry.attributes.position.array.fill(0);
        this.tireMarks.geometry.attributes.position.needsUpdate = true;
        this.camera.position.set(240, 280, 240);
        this.cameraTarget.set(0, 0, 0);
        this.camera.lookAt(this.cameraTarget);
    }

    buildStartLine(track) {
        const pose = trackPose(track);
        const line = new THREE.Group();
        line.position.set(pose.x, roadHeight(track, 0) + 0.14, pose.z); line.rotation.y = pose.heading;
        const white = this.material(COLORS.white);
        const dark = this.material(0x172025);
        const yellow = this.material(COLORS.yellow);
        for (let across = 0; across < 12; across++) for (let row = 0; row < 3; row++) {
            const tile = new THREE.Mesh(new THREE.BoxGeometry(track.width / 12, 0.03, 0.8), (across + row) % 2 ? white : dark);
            tile.position.set((across + 0.5) * track.width / 12 - track.width / 2, 0, row * 0.8);
            line.add(tile);
        }
        for (const side of [-1, 1]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7, 0.35), dark);
            post.position.set(side * (track.width / 2 + EDGE.vergeWidth + EDGE.barrierThickness + 0.6), 3.5, 0); post.castShadow = true; line.add(post);
        }
        const banner = new THREE.Mesh(new THREE.BoxGeometry(track.width + 2 * (EDGE.vergeWidth + EDGE.barrierThickness + 0.8), 1, 0.4), yellow);
        banner.position.set(0, 7, 0); banner.castShadow = true; line.add(banner);
        this.environment.add(line);
        for (let index = 1; index <= 3; index++) {
            const checkpoint = trackPose(track, index / 4);
            for (const side of [-1, 1]) {
                const marker = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.6, 0.6), yellow);
                marker.position.set(checkpoint.x + Math.cos(checkpoint.heading) * (track.width / 2 + EDGE.vergeWidth + EDGE.barrierThickness + 1) * side, roadHeight(track, index / 4) + 1.8,
                    checkpoint.z - Math.sin(checkpoint.heading) * (track.width / 2 + EDGE.vergeWidth + EDGE.barrierThickness + 1) * side);
                marker.rotation.y = checkpoint.heading; marker.castShadow = true; this.environment.add(marker);
            }
        }
    }

    buildLoopEntry(track) {
        if (!track.loop) return;
        const pad = new THREE.Group(); pad.name = 'loop-entry-boost';
        const pose = surfacePose(track, track.loop.start);
        pad.position.set(pose.x, pose.y + 0.12, pose.z); pad.rotation.y = pose.heading;
        const glow = new THREE.MeshBasicMaterial({ color: 0xf34dac });
        const bar = new THREE.BoxGeometry(track.width * 0.32, 0.02, 0.3);
        for (let row = 0; row < 3; row++) for (const side of [-1, 1]) {
            const arrow = new THREE.Mesh(bar, glow);
            arrow.position.set(side * track.width * 0.14, 0, -3 - row * 2);
            arrow.rotation.y = side * 0.35; pad.add(arrow);
        }
        this.environment.add(pad);
    }

    buildScenery(track) {
        const random = seededRandom(track.seed);
        const box = new THREE.BoxGeometry(1, 1, 1);
        const facade = this.material(0x182238, { roughness: 0.48, metalness: 0.25 });
        const colors = [0x36e6ed, 0xf34dac, 0x9c83ff, 0xffc578];
        const neons = colors.map(color => new THREE.MeshBasicMaterial({ color }));
        const windows = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: 0xb7dfff }), 12000);
        const dummy = new THREE.Object3D();
        let count = 0;
        const block = (x, y, z, w, h, d, material, shadow = false) => {
            const mesh = new THREE.Mesh(box, material);
            mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
            mesh.castShadow = shadow; mesh.receiveShadow = shadow;
            this.environment.add(mesh);
        };
        // Extend the city along the larger layouts, spending geometry near roads.
        const blocksX = Math.ceil(Math.max(...track.points.map(p => Math.abs(p[0]))) / 48) + 3;
        const blocksZ = Math.ceil(Math.max(...track.points.map(p => Math.abs(p[1]))) / 48) + 3;
        for (let gx = -blocksX; gx <= blocksX; gx++) for (let gz = -blocksZ; gz <= blocksZ; gz++) {
            const x = gx * 48 + (random() - 0.5) * 8;
            const z = gz * 48 + (random() - 0.5) * 8;
            const w = 14 + random() * 10, d = 14 + random() * 10;
            const clearance = nearestTrackPoint(track.points, x, z).distance;
            if (clearance < track.width / 2 + Math.hypot(w, d) / 2 + 7 || clearance > 150) continue;
            if (track.loop) {
                const plaza = surfacePose(track, (track.loop.start + track.loop.end) / 2);
                if (Math.hypot(x - plaza.x, z - plaza.z) < 75 + Math.hypot(w, d) / 2) continue;
            }
            const h = 12 + random() * 65;
            // Spread the bounded window budget over every building and floor.
            const litChance = Math.min(0.65, 24 / ((h / 3.5) * (2 * w / 3 + 2 * d / 3)));
            block(x, h / 2, z, w, h, d, facade, true);
            block(x, h - 1, z, w + 0.2, 0.3, d + 0.2, neons[Math.floor(random() * 4)]);
            for (let y = 4; y < h - 3; y += 3.5) for (const side of [-1, 1]) {
                for (let u = -w / 2 + 2; u < w / 2 - 1; u += 3) {
                    if (random() > litChance || count >= 12000) continue;
                    dummy.position.set(x + u, y, z + side * (d / 2 + 0.04));
                    dummy.scale.set(1.1, 1.5, 0.08); dummy.updateMatrix(); windows.setMatrixAt(count++, dummy.matrix);
                }
                for (let u = -d / 2 + 2; u < d / 2 - 1; u += 3) {
                    if (random() > litChance || count >= 12000) continue;
                    dummy.position.set(x + side * (w / 2 + 0.04), y, z + u);
                    dummy.scale.set(0.08, 1.5, 1.1); dummy.updateMatrix(); windows.setMatrixAt(count++, dummy.matrix);
                }
            }
        }
        windows.count = count; windows.instanceMatrix.needsUpdate = true;
        this.environment.add(windows);
        for (let index = 0; index < 44; index++) {
            const progress = index / 44;
            if (track.loop && progress >= track.loop.start && progress <= track.loop.end) continue;
            const pose = trackPose(track, progress);
            // Layered glints suggest wet neon reflections without reflection passes.
            for (let layer = 0; layer < 4; layer++) {
                const glint = new THREE.Mesh(new THREE.PlaneGeometry(3 + layer * 1.4, 9 + layer * 2),
                    new THREE.MeshBasicMaterial({ color: colors[index % 4], transparent: true,
                        opacity: 0.025, depthWrite: false, blending: THREE.AdditiveBlending }));
                glint.rotation.set(-Math.PI / 2, 0, -pose.heading);
                glint.position.set(pose.x, roadHeight(track, index / 44) + 0.105 + layer * 0.001, pose.z);
                this.environment.add(glint);
            }
        }
        this.streetLamps = Array.from({ length: 6 }, () => {
            const lamp = new THREE.PointLight(0x36e6ed, 85, 30, 2);
            this.environment.add(lamp); return lamp;
        });
    }

    buildBridgeSupports(track) {
        const material = this.material(0x30394a, { roughness: 0.7 });
        const box = new THREE.BoxGeometry(1, 1, 1);
        for (let i = 0; i < track.points.length; i += 3) {
            const progress = i / track.points.length, height = roadHeight(track, progress);
            if (height < 2 || (track.loop && progress >= track.loop.start && progress <= track.loop.end)) continue;
            const pose = surfacePose(track, progress);
            const deck = new THREE.Mesh(box, material);
            deck.position.set(pose.x, height - 0.6, pose.z); deck.rotation.set(-pose.pitch, pose.heading, 0, 'YXZ');
            deck.scale.set(track.width + 2, 0.8, track.length / track.points.length * 3.1);
            deck.castShadow = true; deck.receiveShadow = true; this.environment.add(deck);
            // Keep pillars clear of the lower carriageway at the crossing.
            for (const side of [-1, 1]) {
                const x = pose.x + Math.cos(pose.heading) * (track.width / 2 + 2) * side;
                const z = pose.z - Math.sin(pose.heading) * (track.width / 2 + 2) * side;
                const lower = nearestTrackPoint(track.points, x, z);
                if (roadHeight(track, lower.progress) < height - 2 && lower.distance < track.width / 2 + 3) continue;
                const pillar = new THREE.Mesh(box, material);
                pillar.position.set(x, height / 2, z); pillar.scale.set(1.4, height, 1.4);
                pillar.castShadow = true; this.environment.add(pillar);
            }
        }
    }

    resize() {
        const width = this.renderer.domElement.parentElement.clientWidth;
        const height = this.renderer.domElement.parentElement.clientHeight;
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / Math.max(height, 1);
        this.camera.updateProjectionMatrix();
    }

    setPerformanceMode(enabled) {
        this.renderer.setPixelRatio(enabled ? 1 : Math.min(window.devicePixelRatio, 1.75));
        this.renderer.shadowMap.enabled = !enabled;
        this.resize();
    }

    addTireMarks(car) {
        const current = { x: car.x - Math.sin(car.heading) * 1.25, z: car.z - Math.cos(car.heading) * 1.25, heading: car.heading, y: car.y || 0 };
        if (this.lastMark) {
            const attribute = this.tireMarks.geometry.attributes.position;
            for (const side of [-0.8, 0.8]) {
                const previous = this.lastMark;
                const offset = (this.markIndex++ % 1800) * 6;
                attribute.array.set([previous.x + Math.cos(previous.heading) * side, previous.y + 0.13, previous.z - Math.sin(previous.heading) * side,
                    current.x + Math.cos(current.heading) * side, current.y + 0.13, current.z - Math.sin(current.heading) * side], offset);
            }
            attribute.needsUpdate = true;
        }
        this.lastMark = current;
    }

    render(race, deltaTime, time) {
        const car = race.car;
        this.car.position.set(car.x, (car.y || 0) + 0.1, car.z);
        this.car.rotation.set(-(car.pitch || 0), car.heading, 0, 'YXZ');
        const playing = race.state !== 'ready';
        const focus = playing ? car : this.camera.position;
        this.sun.position.set(focus.x - 110, (car.y || 0) + 180, focus.z + 75);
        this.sun.target.position.set(focus.x, car.y || 0, focus.z);
        const nearby = [...this.lampPoses].sort((a, b) =>
            Math.hypot(a.x - focus.x, a.z - focus.z) - Math.hypot(b.x - focus.x, b.z - focus.z));
        this.streetLamps.forEach((lamp, index) => {
            const pose = nearby[index % nearby.length];
            lamp.position.set(pose.x, (pose.y || 0) + 7.5, pose.z); lamp.color.setHex(pose.color);
        });
        this.car.visible = playing;
        // A tall mobile play area otherwise crops the chase view around an
        // oversized car. Preserve the desktop horizontal view in portrait,
        // without changing the camera's position or its driving angle.
        const pace = this.reducedMotion ? 0 : THREE.MathUtils.clamp(car.speed / 40, 0, 1);
        const drivingFov = CAMERA_CONFIG.fieldOfView + 8 * pace;
        this.camera.fov = playing && this.camera.aspect < 1 ? Math.min(94,
            THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(drivingFov / 2)) / this.camera.aspect))) :
            drivingFov;
        if (playing) {
            this.camera.filmOffset = 0;
            // Let the body rotate into a drift before the camera catches up. Angle
            // wrapping prevents a full camera spin when crossing +/- pi.
            if (!this.followingCar) this.cameraHeading = car.heading;
            else this.cameraHeading += wrapAngle(car.heading - this.cameraHeading) *
                (1 - Math.exp(-CAMERA_CONFIG.headingResponse * deltaTime));
            const forward = new THREE.Vector3(Math.sin(this.cameraHeading), 0, Math.cos(this.cameraHeading));
            const desiredPosition = new THREE.Vector3(car.x - forward.x * CAMERA_CONFIG.followDistance,
                (car.y || 0) + CAMERA_CONFIG.followHeight - 0.55 * pace, car.z - forward.z * CAMERA_CONFIG.followDistance);
            const desiredTarget = new THREE.Vector3(car.x + forward.x * CAMERA_CONFIG.lookAhead,
                (car.y || 0) + CAMERA_CONFIG.targetHeight, car.z + forward.z * CAMERA_CONFIG.lookAhead);
            if (car.loopT != null) {
                // Stay upright beside the circle, on the car's side of the road
                // surface. A normal chase camera would hide it behind the roof
                // of the loop when upside down.
                const blend = Math.min(1, car.loopT / 0.2, (1 - car.loopT) / 0.2);
                const pitch = car.pitch || 0;
                const sideView = new THREE.Vector3(
                    car.x + Math.cos(car.heading) * 34 - Math.sin(car.heading) * (10 + Math.sin(pitch) * 8),
                    (car.y || 0) + Math.cos(pitch) * 8,
                    car.z - Math.sin(car.heading) * 34 - Math.cos(car.heading) * (10 + Math.sin(pitch) * 8));
                desiredPosition.lerp(sideView, blend);
                desiredTarget.lerp(new THREE.Vector3(car.x, (car.y || 0) + Math.cos(pitch), car.z), blend);
            }
            // Follow position directly, smoothing only the view direction. A
            // world-position lerp falls farther behind as speed rises, shrinking
            // the car and changing the apparent pace. This also enters the chase
            // view immediately at countdown and after recovering the car.
            this.camera.position.copy(desiredPosition);
            this.cameraTarget.copy(desiredTarget);
        } else {
            this.camera.filmOffset = 0;
            if (this.reducedMotion) {
                // A stationary overview remains available for motion-sensitive players.
                this.camera.position.set(300, 410, 300);
                this.cameraTarget.set(0, 0, 0);
            } else {
                const view = this.flythrough.advance(deltaTime);
                this.camera.position.copy(view.position);
                this.cameraTarget.copy(view.target);
                this.camera.fov = 62;
            }
        }
        this.followingCar = playing;
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(this.cameraTarget);
        if (race.state === 'racing' && race.drifting) this.addTireMarks(car);
        else this.lastMark = null;
        this.updateSmoke(race, deltaTime);
        this.renderer.render(this.scene, this.camera);
    }
}
