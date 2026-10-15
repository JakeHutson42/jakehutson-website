import * as THREE from '../../lib/three/0.180.0/three.module.min.js';
import { surfacePose } from './surface.js';
import { courseEdges, pencilSegments } from './course-geometry.js';

const PALETTE = ['#db7a68', '#5d9b8c', '#e1b851', '#85779b', '#e5d9bf'];

export async function loadDeskMaterials() {
    const image = await new THREE.ImageLoader().loadAsync(new URL('../../images/pocket/materials/desk-atlas.webp', import.meta.url).href);
    const materials = {};
    ['wood', 'paper', 'cloth', 'mat'].forEach((name, i) => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
        canvas.getContext('2d').drawImage(image, i % 2 * image.width / 2, Math.floor(i / 2) * image.height / 2,
            image.width / 2, image.height / 2, 0, 0, 512, 512);
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        // Mirrored wood repeats join the generated grain without colour seams.
        texture.wrapS = texture.wrapT = name === 'wood' ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping; texture.anisotropy = 4;
        materials[name] = new THREE.MeshStandardMaterial({ map: texture, roughness: name === 'wood' ? .64 : .94, side: THREE.DoubleSide });
    });
    return materials;
}

function softGeometry(w, h, d, radius = .3) {
    const r = Math.min(radius, w / 3, d / 3, h / 3), shape = new THREE.Shape();
    // Extrusion bevels expand the outline. Inset first so the final dimensions
    // match the physical footprints and inset monitor screen precisely.
    w -= r * 2; d -= r * 2;
    shape.moveTo(-w / 2 + r, -d / 2); shape.lineTo(w / 2 - r, -d / 2);
    shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r); shape.lineTo(w / 2, d / 2 - r);
    shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); shape.lineTo(-w / 2 + r, d / 2);
    shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); shape.lineTo(-w / 2, -d / 2 + r);
    shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: Math.max(.01, h - r * 2), bevelEnabled: true, bevelThickness: r,
        bevelSize: r, bevelSegments: 2, steps: 1, curveSegments: 3 });
    geometry.rotateX(-Math.PI / 2); geometry.translate(0, -h / 2 + r, 0);
    return geometry;
}

export class DeskBuilder {
    constructor(world) { this.w = world; this.root = world.map; this.geometries = new Map(); }
    soft(parent, x, y, z, width, height, depth, color, radius = .3) {
        const key = [width, height, depth, radius].join(':');
        if (!this.geometries.has(key)) this.geometries.set(key, softGeometry(width, height, depth, radius));
        return this.w.mesh(this.geometries.get(key), color, parent, x, y, z);
    }
    group(x, y, z, rotation = 0) {
        const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = rotation; this.root.add(group); return group;
    }
    plane(parent, x, y, z, width, depth, material) {
        const mesh = this.w.mesh(new THREE.PlaneGeometry(width, depth), material, parent, x, y, z);
        mesh.rotation.x = -Math.PI / 2; mesh.castShadow = false; return mesh;
    }
    book(x, z, width, depth, height, color, title, rotation = 0) {
        const p = this.group(x, 0, z, rotation), w = this.w;
        this.soft(p, 0, .3, 0, width, .55, depth, color, .15);
        this.soft(p, .2, height / 2, -.1, width - 1, height - .65, depth - 1, '#dfd6be', .15);
        for (let y = .8; y < height - .35; y += .48) {
            w.box(p, 0, y, depth / 2 - .45, width - 1.3, .035, .035, '#b2a897');
            w.box(p, width / 2 - .45, y, 0, .035, .035, depth - 1.3, '#b2a897');
        }
        this.soft(p, 0, height - .2, 0, width, .4, depth, color, .12);
        this.plane(p, 0, height + .025, 0, width - .4, depth - .4, w.deskMaterials.cloth);
        w.box(p, -width / 2 + .45, height / 2, 0, .9, height, depth, color);
        if (title) w.topLabel(p, title, 0, height + .06, depth * .28, width * .64, 8, '#e5ce90', '#244e55');
        for (const inset of [2.5, 3.1]) {
            w.box(p, 0, height + .04, -depth / 2 + inset, width - 6, .02, .07, '#c7ac70');
            w.box(p, 0, height + .04, depth / 2 - inset, width - 6, .02, .07, '#c7ac70');
        }
        return p;
    }
    pencil(parent, x, y, z, rotation, color, length = 19) {
        const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.y = rotation; parent.add(p);
        const w = this.w, radius = .7;
        const body = w.mesh(new THREE.CylinderGeometry(radius, radius, length, 6), color, p, 0, radius, 0); body.rotation.x = Math.PI / 2;
        const wood = w.mesh(new THREE.ConeGeometry(radius, 2.5, 6), '#d9b681', p, 0, radius, length / 2 + 1.25); wood.rotation.x = Math.PI / 2;
        const lead = w.mesh(new THREE.ConeGeometry(.18, .8, 6), '#3b353c', p, 0, radius, length / 2 + 2.65); lead.rotation.x = Math.PI / 2;
        const ferrule = w.mesh(new THREE.CylinderGeometry(.76, .76, 1.8, 12), '#bcb9a7', p, 0, radius, -length / 2 - .8); ferrule.rotation.x = Math.PI / 2;
        for (let k = 0; k < 3; k++) {
            const ring = w.mesh(new THREE.TorusGeometry(.77, .055, 4, 12), '#86847d', p, 0, radius, -length / 2 - .2 - k * .5);
            ring.rotation.z = 0;
        }
        this.soft(p, 0, radius, -length / 2 - 2.4, 1.25, 1.25, 1.9, '#cd8b87', .2);
        return p;
    }
    keyboard(spec) {
        const p = this.group(spec.x, 0, spec.z, spec.rotation), w = this.w;
        this.soft(p, 0, 1.25, 0, 65, 2.5, 27, '#454b4a', 1);
        this.soft(p, 0, 2.4, 0, 63, .7, 25, '#d6cebc', .2);
        const rows = ['ESC 1234567890', 'QWERTYUIOP[]', 'ASDFGHJKL;', 'ZXCVBNM,.'];
        const matrices = new THREE.Matrix4(), positions = [];
        rows.forEach((row, r) => [...row].forEach((char, col) => {
            if (char === ' ') return;
            positions.push({ x: -27 + col * 4.5 + r * .7, z: -8.5 + r * 4.7, char });
        }));
        const caps = new THREE.InstancedMesh(softGeometry(3.8, 1.0, 3.9, .22), w.material('#f0e8d8'), positions.length);
        positions.forEach((key, i) => { matrices.makeTranslation(key.x, 3.2, key.z); caps.setMatrixAt(i, matrices); });
        caps.castShadow = true; caps.receiveShadow = true; p.add(caps);
        this.soft(p, 0, 3.2, 10.6, 25, 1, 3.4, '#e0b45b', .2);
        this.soft(p, -28, 3.2, 10.6, 6, 1, 3.4, '#6c9a8f', .2);
        const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#4b4b49'; ctx.font = '20px monospace'; ctx.textAlign = 'center';
        positions.forEach(key => ctx.fillText(key.char, (key.x / 63 + .5) * 1024, (key.z / 25 + .5) * 512 + 7));
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        const legend = new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: .9 });
        this.plane(p, 0, 3.76, 0, 63, 25, legend);
        const cord = new THREE.CatmullRomCurve3([new THREE.Vector3(-8, .5, -14), new THREE.Vector3(-15, .4, -22), new THREE.Vector3(0, .4, -29), new THREE.Vector3(12, .4, -25)]);
        w.mesh(new THREE.TubeGeometry(cord, 30, .3, 6, false), '#4a4b47', p);
    }
    mug(spec) {
        const w = this.w, p = this.group(spec.x, 0, spec.z, spec.rotation), color = PALETTE[spec.color];
        w.cylinder(p, 0, .25, 0, 9.2, .5, '#d9cdb7');
        w.cylinder(p, 0, 4.5, 0, 5.4, 8.2, color, 6.1);
        w.cylinder(p, 0, 8.45, 0, 5.55, .12, '#614230');
        const rim = w.mesh(new THREE.TorusGeometry(5.8, .4, 8, 40), '#ece1ca', p, 0, 8.5, 0); rim.rotation.x = Math.PI / 2;
        const handle = w.mesh(new THREE.TorusGeometry(3.05, .85, 8, 24), color, p, 7, 4.5, 0); handle.rotation.y = Math.PI / 2;
        for (let i = 0; i < 2; i++) {
            const coffee = w.mesh(new THREE.TorusGeometry(2.8 + i * .85, .08, 4, 32, Math.PI * 1.4), '#a87c50', p, .4, 8.55, .2);
            coffee.rotation.x = Math.PI / 2;
        }
    }
    notebook(spec) {
        const w = this.w, p = this.group(spec.x, 0, spec.z, spec.rotation);
        this.soft(p, 0, .7, 0, 26, 1.4, 29, PALETTE[spec.color], .25);
        this.soft(p, .4, 1.5, 0, 24.5, .4, 27.5, '#e9dfc9', .1);
        this.plane(p, .4, 1.73, 0, 24.5, 27.5, w.deskMaterials.paper);
        for (let z = -12; z <= 12; z += 3) {
            const ring = w.mesh(new THREE.TorusGeometry(.95, .13, 6, 12, Math.PI * 1.7), '#545d59', p, -12.2, 1.8, z); ring.rotation.x = Math.PI / 2;
        }
        w.topLabel(p, 'THE NEXT\nBIG IDEA', 1, 1.77, 1, 17, 9, '#556b68', '#eee3ca');
    }
    monitor() {
        const w = this.w, p = this.group(-79, 0, -113, .04);
        this.soft(p, 0, 1, 0, 26, 2, 17, '#444d4c', .7);
        this.soft(p, 0, 11, -2, 7, 20, 5, '#3c4546', .7);
        this.soft(p, 0, 31, -5, 71, 43, 4, '#303d3f', 1.3);
        const face = w.mesh(new THREE.PlaneGeometry(65, 36), w.label('POCKET CIRCUIT\nDESIGN STUDIO', '#9fc8b5', '#203b40'), p, 0, 32, -2.93);
        face.castShadow = false;
        w.cylinder(p, 27, 11.2, -2.8, .22, .2, '#b6ddbe');
    }
    lamp() {
        const w = this.w, p = this.group(-150, 0, -28, 0);
        w.cylinder(p, 0, 1.2, 0, 10, 2.4, '#788d79');
        const arm = this.soft(p, 0, 24, 0, 1.4, 44, 1.4, '#c4bd9c', .2); arm.rotation.z = -.22;
        const arm2 = this.soft(p, 10, 44, 0, 25, 1.4, 1.4, '#c4bd9c', .2); arm2.rotation.z = .3;
        const shade = w.mesh(new THREE.ConeGeometry(9, 12, 24, 1, true), '#709485', p, 23, 43, 0); shade.rotation.z = Math.PI;
        w.cylinder(p, 23, 38.2, 0, 7, .2, '#e5d8ae');
    }
    ruler() {
        const w = this.w, p = this.group(0, 0, 0);
        this.soft(p, 0, 11.55, 0, 92, .9, 14, '#d9b663', .22);
        this.soft(p, 0, 12.02, 0, 90, .08, 13.4, '#efcc79', .02);
        for (let i = 0; i <= 40; i++) {
            const x = -44 + i * 2.2, size = i % 5 === 0 ? 2.8 : i % 2 ? 1.1 : 1.7;
            w.box(p, x, 12.1, -5.4 + size / 2, .12, .025, size, '#584a36');
            w.box(p, x, 12.1, 5.4 - size / 2, .12, .025, size, '#584a36');
        }
        for (let i = 0; i <= 8; i++) w.topLabel(p, String(i * 5), -44 + i * 11, 12.12, -2.8, 2.7, 1.5, '#5b4c36', '#efcc79');
        w.topLabel(p, 'POCKET / PRECISION', 0, 12.12, 1, 29, 2.8, '#7a6442', '#efcc79');
    }
    ramps(track) {
        const positions = [], uv = [], indices = [], edges = courseEdges(track, 0, .08);
        // One pair of shared vertices per cross-section prevents torn/jagged
        // joins. The paper stops at the same full-width landing as the road.
        for (let i = 0; i < track.points.length; i++) {
            for (let side = 0; side < 2; side++) {
                const point = edges[side][i]; positions.push(point.x, point.y, point.z); uv.push(side, i / 12);
            }
            if (track.surfaces[i].kind !== 'ramp') continue;
            const base = i * 2, next = (i + 1) % track.points.length * 2;
            indices.push(base, next, base + 1, base + 1, next, next + 1);
        }
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geometry.setIndex(indices); geometry.computeVertexNormals(); this.w.mesh(geometry, this.w.deskMaterials.paper, this.root);
    }
    courseEdges(track) {
        const w = this.w;
        const bodyGeometry = new THREE.CylinderGeometry(.7, .7, 1, 6); bodyGeometry.rotateX(Math.PI / 2);
        const woodGeometry = new THREE.ConeGeometry(.7, 1.2, 6); woodGeometry.rotateX(-Math.PI / 2);
        const leadGeometry = new THREE.ConeGeometry(.17, .45, 6); leadGeometry.rotateX(-Math.PI / 2);
        const ferruleGeometry = new THREE.CylinderGeometry(.74, .74, .9, 8); ferruleGeometry.rotateX(Math.PI / 2);
        const eraserGeometry = new THREE.CylinderGeometry(.7, .7, .8, 8); eraserGeometry.rotateX(Math.PI / 2);
        for (const segment of pencilSegments(track)) {
            const { a, b, length } = segment;
            const p = this.group((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
            p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize());
            const body = w.mesh(bodyGeometry, PALETTE[(Math.floor(segment.index / 12) + segment.side) % PALETTE.length], p);
            body.scale.z = length;
            w.mesh(woodGeometry, '#d9b681', p, 0, 0, length / 2 + .6);
            w.mesh(leadGeometry, '#3b353c', p, 0, 0, length / 2 + 1.15);
            w.mesh(ferruleGeometry, '#bcb9a7', p, 0, 0, -length / 2 - .35);
            w.mesh(eraserGeometry, '#cd8b87', p, 0, 0, -length / 2 - 1.1);
        }
        for (let i = 8; i < track.points.length; i += 14) {
            const pose = surfacePose(track, i / track.points.length);
            if (pose.kind === 'ruler' || pose.kind === 'ramp' || Math.abs(pose.pitch) > .025) continue;
            const arrow = this.group(pose.x, pose.y + .27, pose.z, pose.heading);
            for (const side of [-1, 1]) {
                const mark = w.box(arrow, side * .75, 0, 0, .4, .025, 2.5,
                    pose.kind === 'paper' || pose.kind === 'ramp' ? '#9f7a59' : '#eddcc0');
                // Arms converge toward local +Z: the direction of travel.
                mark.rotation.y = -side * .7; mark.castShadow = false;
            }
        }
    }
    build(track) {
        const w = this.w;
        this.soft(this.root, 0, -6, 0, 350, 12, 285, '#715540', 3);
        const desktop = this.plane(this.root, 0, .01, 0, 349, 284, w.deskMaterials.wood);
        const woodUV = desktop.geometry.attributes.uv;
        for (let i = 0; i < woodUV.count; i++) woodUV.setXY(i, woodUV.getX(i) * 5, woodUV.getY(i) * 4);
        this.soft(this.root, 0, -27, 0, 650, 3, 600, '#504a46', .5);
        const mat = this.group(68, 0, -98, .05); this.soft(mat, 0, .08, 0, 114, .16, 65, '#3a5f53', .04);
        this.plane(mat, 0, .18, 0, 113.5, 64.5, w.deskMaterials.mat);
        for (const [x, z, width, depth, rotation] of [[125, -78, 53, 74, -.23], [34, 65, 88, 39, -.36]]) {
            const paper = this.group(x, 0, z, rotation);
            this.soft(paper, 0, .04, 0, width, .08, depth, '#e4d5b9', .02);
            this.plane(paper, 0, .09, 0, width, depth, w.deskMaterials.paper);
        }
        this.book(-69, 56, 52, 56, 4, '#a75c4d', 'FIELD NOTES');
        this.book(-56, 0, 40, 28, 12, '#526e79', 'DESIGN / VOL. 02');
        this.book(54, 0, 44, 36, 12, '#6b7960', 'THE LITTLE ATLAS');
        this.ruler(); this.ramps(track); this.courseEdges(track); this.monitor(); this.lamp();
        for (const prop of track.props) {
            if (prop.type === 'keyboard') this.keyboard(prop);
            else if (prop.type === 'mug') this.mug(prop);
            else if (prop.type === 'notebook') this.notebook(prop);
            else if (prop.type === 'pencil') this.pencil(this.root, prop.x, 0, prop.z, prop.rotation, PALETTE[prop.color]);
            else w.prop(prop);
        }
        w.topLabel(this.root, 'DESK DERBY / THE LONG WAY HOME', -78, .09, 128, 94, 6, '#e5d3ac', '#67503e');
    }
}

// Flatten immutable opaque scenery into a small set of material batches. The
// detailed desk keeps its individual geometry without hundreds of draw calls.
export function batchStaticMeshes(root) {
    root.updateMatrixWorld(true);
    const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const groups = new Map(), keep = new Set(), originals = [];
    root.traverse(mesh => { if (mesh.isInstancedMesh && mesh.geometry) keep.add(mesh.geometry); });
    root.traverse(mesh => {
        if (!mesh.isMesh || mesh.isInstancedMesh || Array.isArray(mesh.material) || mesh.material.transparent) return;
        const key = `${mesh.material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}`;
        if (!groups.has(key)) groups.set(key, { material: mesh.material, castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow, positions: [], normals: [], uv: [] });
        const group = groups.get(key), geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld));
        group.positions.push(...geometry.attributes.position.array);
        group.normals.push(...geometry.attributes.normal.array);
        if (geometry.attributes.uv) group.uv.push(...geometry.attributes.uv.array);
        else group.uv.push(...new Float32Array(geometry.attributes.position.count * 2));
        geometry.dispose(); originals.push(mesh);
    });
    const obsolete = new Set();
    originals.forEach(mesh => { mesh.removeFromParent(); if (!keep.has(mesh.geometry)) obsolete.add(mesh.geometry); });
    obsolete.forEach(geometry => geometry.dispose());
    groups.forEach(group => {
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(group.positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(group.normals, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(group.uv, 2));
        const mesh = new THREE.Mesh(geometry, group.material); mesh.castShadow = group.castShadow; mesh.receiveShadow = group.receiveShadow; root.add(mesh);
    });
}
