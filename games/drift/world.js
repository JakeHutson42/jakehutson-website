import * as THREE from '../../lib/three/0.180.0/three.module.min.js';
import { nearestTrackPoint, trackPose, wrapAngle } from './math.js';
import { CAMERA_CONFIG } from './config.js';

const COLORS = { asphalt: 0x343c3e, sand: 0xb6b39a, white: 0xeae9db, yellow: 0xdfff00, red: 0xd66443 };

function seededRandom(seed) {
    return () => {
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}

// Ribbon geometry follows the same centerline used by the driving model. No hidden
// collision mesh can disagree with what the player sees on screen.
function ribbonGeometry(points, innerOffset, outerOffset, height) {
    const vertices = [];
    const normals = [];
    const indices = [];
    for (let index = 0; index <= points.length; index++) {
        const point = points[index % points.length];
        const previous = points[(index + points.length - 1) % points.length];
        const next = points[(index + 1) % points.length];
        const length = Math.hypot(next[0] - previous[0], next[1] - previous[1]);
        const normalX = (next[1] - previous[1]) / length;
        const normalZ = -(next[0] - previous[0]) / length;
        for (const offset of [innerOffset, outerOffset]) {
            vertices.push(point[0] + normalX * offset, height, point[1] + normalZ * offset);
            normals.push(0, 1, 0);
        }
        if (index < points.length) {
            const first = index * 2;
            indices.push(first, first + 2, first + 1, first + 1, first + 2, first + 3);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
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
        this.scene.background = new THREE.Color(0xc5cfc7);
        this.scene.fog = new THREE.Fog(0xc5cfc7, 420, 850);
        // A one-metre near plane preserves depth precision in the wide circuit preview.
        this.camera = new THREE.PerspectiveCamera(CAMERA_CONFIG.fieldOfView, 1, 1, 1100);
        this.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x7e7656, 2.2));
        this.sun = new THREE.DirectionalLight(0xffe7bc, 3.1);
        this.sun.position.set(-110, 180, 75);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        Object.assign(this.sun.shadow.camera, { left: -210, right: 210, top: 210, bottom: -210, far: 450 });
        this.sun.shadow.normalBias = 0.15;
        this.scene.add(this.sun);
        this.cameraTarget = new THREE.Vector3();
        this.cameraHeading = 0;
        this.followingCar = false;
        this.car = this.buildCar();
        this.scene.add(this.car);
        this.tireMarks = this.buildTireMarks();
        this.scene.add(this.tireMarks);
        this.markIndex = 0;
        this.lastMark = null;
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(canvas.parentElement);
        this.resize();
    }

    material(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...extra }); }

    buildCar() {
        const car = new THREE.Group();
        const bodyMaterial = this.material(COLORS.yellow, { roughness: 0.45, metalness: 0.12 });
        const black = this.material(0x171e21);
        const glass = this.material(0x354c50, { roughness: 0.2, metalness: 0.35 });
        const box = (width, height, depth, material, x, y, z) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
            mesh.position.set(x, y, z); mesh.castShadow = true; car.add(mesh);
            return mesh;
        };
        box(1.85, 0.55, 4.05, bodyMaterial, 0, 0.65, 0);
        box(1.62, 0.25, 1.3, bodyMaterial, 0, 0.96, 1.12);
        box(1.5, 0.68, 1.7, glass, 0, 1.17, -0.24);
        box(1.56, 0.10, 1.22, bodyMaterial, 0, 1.55, -0.35);
        box(0.23, 0.025, 1.25, black, -0.29, 1.61, -0.35);
        box(0.23, 0.025, 1.25, black, 0.29, 1.61, -0.35);
        box(1.95, 0.14, 0.35, black, 0, 1.23, -1.85);
        for (const x of [-0.64, 0.64]) {
            box(0.46, 0.17, 0.04, this.material(0xfff7cb, { emissive: 0xffe5a0, emissiveIntensity: 0.4 }), x, 0.81, 2.05);
            box(0.45, 0.12, 0.04, this.material(0xe74e36), x, 0.78, -2.05);
        }
        this.wheels = [];
        const geometry = new THREE.CylinderGeometry(0.4, 0.4, 0.28, 12);
        for (const x of [-0.97, 0.97]) for (const z of [-1.28, 1.25]) {
            const wheel = new THREE.Mesh(geometry, black);
            wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.43, z);
            wheel.castShadow = true; car.add(wheel); this.wheels.push(wheel);
        }
        return car;
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
        this.environment = new THREE.Group();
        this.scene.add(this.environment);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), this.material(COLORS.sand));
        floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.environment.add(floor);
        const halfWidth = track.width / 2;
        const road = new THREE.Mesh(ribbonGeometry(track.points, -halfWidth, halfWidth, 0.08), this.material(COLORS.asphalt, { side: THREE.DoubleSide }));
        road.receiveShadow = true; this.environment.add(road);
        const shoulder = new THREE.Mesh(ribbonGeometry(track.points, -halfWidth - 2.2, halfWidth + 2.2, 0.025), this.material(0xcac6ae, { side: THREE.DoubleSide }));
        shoulder.receiveShadow = true; this.environment.add(shoulder);
        for (const side of [-1, 1]) {
            const stripe = new THREE.Mesh(ribbonGeometry(track.points, side * (halfWidth - 0.5), side * (halfWidth - 0.3), 0.10), this.material(COLORS.white, { side: THREE.DoubleSide }));
            this.environment.add(stripe);
        }
        const curbMaterials = [this.material(COLORS.white), this.material(COLORS.red)];
        const curbGeometry = new THREE.BoxGeometry(0.8, 0.13, track.length / track.points.length + 0.08);
        // Instance the repeating curbs: two draw calls instead of 640 separate meshes.
        const curbMeshes = curbMaterials.map(material => new THREE.InstancedMesh(curbGeometry, material, track.points.length * 2));
        const curbCounts = [0, 0];
        const curbTransform = new THREE.Object3D();
        for (let index = 0; index < track.points.length; index++) {
            const pose = trackPose(track, index / track.points.length);
            for (const side of [-1, 1]) {
                const colorIndex = Math.floor(index / 3) % 2;
                curbTransform.position.set(pose.x + Math.cos(pose.heading) * (halfWidth + 0.4) * side, 0.1,
                    pose.z - Math.sin(pose.heading) * (halfWidth + 0.4) * side);
                curbTransform.rotation.y = pose.heading;
                curbTransform.updateMatrix();
                curbMeshes[colorIndex].setMatrixAt(curbCounts[colorIndex]++, curbTransform.matrix);
            }
        }
        curbMeshes.forEach((mesh, index) => { mesh.count = curbCounts[index]; this.environment.add(mesh); });
        this.buildStartLine(track);
        this.buildScenery(track);
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
        line.position.set(pose.x, 0.14, pose.z); line.rotation.y = pose.heading;
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
            post.position.set(side * (track.width / 2 + 1), 3.5, 0); post.castShadow = true; line.add(post);
        }
        const banner = new THREE.Mesh(new THREE.BoxGeometry(track.width + 2.4, 1, 0.4), yellow);
        banner.position.set(0, 7, 0); banner.castShadow = true; line.add(banner);
        this.environment.add(line);
        for (let index = 1; index <= 3; index++) {
            const checkpoint = trackPose(track, index / 4);
            for (const side of [-1, 1]) {
                const marker = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.6, 0.6), yellow);
                marker.position.set(checkpoint.x + Math.cos(checkpoint.heading) * (track.width / 2 + 1.8) * side, 1.8,
                    checkpoint.z - Math.sin(checkpoint.heading) * (track.width / 2 + 1.8) * side);
                marker.rotation.y = checkpoint.heading; marker.castShadow = true; this.environment.add(marker);
            }
        }
    }

    buildScenery(track) {
        const random = seededRandom(track.seed);
        const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
        const rockMaterial = this.material(0x8d8b78, { flatShading: true });
        const cactusGeometry = new THREE.CylinderGeometry(0.5, 0.65, 1, 6);
        const cactusMaterial = this.material(0x647365, { flatShading: true });
        for (let index = 0; index < 160; index++) {
            const x = (random() - 0.5) * 560;
            const z = (random() - 0.5) * 560;
            if (nearestTrackPoint(track.points, x, z).distance < track.width / 2 + 9) continue;
            if (index % 3 === 0) {
                const height = 3 + random() * 6;
                const cactus = new THREE.Mesh(cactusGeometry, cactusMaterial);
                cactus.position.set(x, height / 2, z); cactus.scale.y = height;
                cactus.castShadow = true; this.environment.add(cactus);
                const arm = new THREE.Mesh(cactusGeometry, cactusMaterial);
                arm.rotation.z = Math.PI / 2; arm.scale.y = 2.5;
                arm.position.set(x + 1, height * 0.55, z); arm.castShadow = true; this.environment.add(arm);
            } else {
                const rock = new THREE.Mesh(rockGeometry, rockMaterial);
                const scale = 1.5 + random() * 6;
                rock.position.set(x, scale * 0.3, z); rock.scale.set(scale, scale * 0.65, scale * 0.8);
                rock.rotation.set(random(), random() * 6, random()); rock.castShadow = true;
                this.environment.add(rock);
            }
        }
        // Distant mesas provide a horizon without textures or downloaded model assets.
        const mountainGeometry = new THREE.CylinderGeometry(15, 34, 45, 5);
        const mountainMaterial = this.material(0x969f90, { flatShading: true });
        for (let index = 0; index < 22; index++) {
            const angle = index / 22 * Math.PI * 2;
            const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
            const scale = 0.8 + random();
            mountain.position.set(Math.cos(angle) * 450, 13, Math.sin(angle) * 450);
            mountain.scale.set(scale * 1.8, scale, scale); this.environment.add(mountain);
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
        const current = { x: car.x - Math.sin(car.heading) * 1.25, z: car.z - Math.cos(car.heading) * 1.25, heading: car.heading };
        if (this.lastMark) {
            const attribute = this.tireMarks.geometry.attributes.position;
            for (const side of [-0.8, 0.8]) {
                const previous = this.lastMark;
                const offset = (this.markIndex++ % 1800) * 6;
                attribute.array.set([previous.x + Math.cos(previous.heading) * side, 0.13, previous.z - Math.sin(previous.heading) * side,
                    current.x + Math.cos(current.heading) * side, 0.13, current.z - Math.sin(current.heading) * side], offset);
            }
            attribute.needsUpdate = true;
        }
        this.lastMark = current;
    }

    render(race, deltaTime, time) {
        const car = race.car;
        this.car.position.set(car.x, 0.1, car.z); this.car.rotation.y = car.heading;
        const playing = race.state !== 'ready';
        // A tall mobile play area otherwise crops the chase view around an
        // oversized car. Preserve the desktop horizontal view in portrait,
        // without changing the camera's position or its driving angle.
        this.camera.fov = playing && this.camera.aspect < 1 ? Math.min(94,
            THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CAMERA_CONFIG.fieldOfView / 2)) / this.camera.aspect))) :
            CAMERA_CONFIG.fieldOfView;
        if (playing) {
            this.camera.filmOffset = 0;
            // Let the body rotate into a drift before the camera catches up. Angle
            // wrapping prevents a full camera spin when crossing +/- pi.
            if (!this.followingCar) this.cameraHeading = car.heading;
            else this.cameraHeading += wrapAngle(car.heading - this.cameraHeading) *
                (1 - Math.exp(-CAMERA_CONFIG.headingResponse * deltaTime));
            const forward = new THREE.Vector3(Math.sin(this.cameraHeading), 0, Math.cos(this.cameraHeading));
            const desiredPosition = new THREE.Vector3(car.x - forward.x * CAMERA_CONFIG.followDistance,
                CAMERA_CONFIG.followHeight, car.z - forward.z * CAMERA_CONFIG.followDistance);
            const desiredTarget = new THREE.Vector3(car.x + forward.x * CAMERA_CONFIG.lookAhead,
                CAMERA_CONFIG.targetHeight, car.z + forward.z * CAMERA_CONFIG.lookAhead);
            // Follow position directly, smoothing only the view direction. A
            // world-position lerp falls farther behind as speed rises, shrinking
            // the car and changing the apparent pace. This also enters the chase
            // view immediately at countdown and after recovering the car.
            this.camera.position.copy(desiredPosition);
            this.cameraTarget.copy(desiredTarget);
        } else {
            // Orbit only on the start screen; reduced motion keeps this view stationary.
            const angle = this.reducedMotion ? 0.8 : 0.8 + Math.sin(time * 0.045) * 0.12;
            const portrait = this.camera.aspect < 1.15;
            const distance = portrait ? 390 : 245;
            this.camera.position.set(Math.sin(angle) * distance, portrait ? 365 : 230, Math.cos(angle) * distance);
            this.cameraTarget.set(0, 0, 0);
            this.camera.filmOffset = portrait ? 0 : -6;
        }
        this.followingCar = playing;
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(this.cameraTarget);
        if (race.state === 'racing' && race.drifting) this.addTireMarks(car);
        else this.lastMark = null;
        this.renderer.render(this.scene, this.camera);
    }
}
