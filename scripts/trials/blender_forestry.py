"""Original low-cost forestry kit, exported by pinned headless Blender 4.5.3."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import random
import sys
import bpy
from mathutils import Vector

p = argparse.ArgumentParser()
p.add_argument("--output", type=Path, required=True)
p.add_argument("--spec", type=Path, required=True)
args = p.parse_args(sys.argv[sys.argv.index("--") + 1 :])
args.output.mkdir(parents=True, exist_ok=True)
spec = json.loads(args.spec.read_text())
palette = spec["palette"]
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)


def material(name, color, rough=0.85, metal=0):
    c = tuple(int(color.lstrip("#")[i : i + 2], 16) / 255 for i in [0, 2, 4])
    c = tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*c, 1)
    m.use_nodes = True
    s = m.node_tree.nodes.get("Principled BSDF")
    s.inputs["Base Color"].default_value = (*c, 1)
    s.inputs["Roughness"].default_value = rough
    s.inputs["Metallic"].default_value = metal
    return m


mats = {k: material("Forestry / " + k, v) for k, v in palette.items()}
mats["steel"] = material("Forestry / dark steel", "#465354", 0.6, 0.5)
mats["needles_light"] = material("Forestry / fresh needles", "#547368")
parts = []


def finish(o, mat):
    o.data.materials.append(mats[mat])
    parts.append(o)
    return o


def box(p, size, mat, rotation=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=p)
    o = bpy.context.object
    o.scale = size
    o.rotation_euler[1] = rotation
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat)


def cylinder(p, radius, depth, mat, rotation=(0, 0, 0), vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=p, rotation=rotation
    )
    return finish(bpy.context.object, mat)


def cone(p, radius, depth, mat):
    bpy.ops.mesh.primitive_cone_add(
        vertices=14, radius1=radius, radius2=radius * 0.06, depth=depth, location=p
    )
    return finish(bpy.context.object, mat)


def join(name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    parts.clear()
    return o


roots = []
cylinder((0, 0, 2.1), 0.18, 4.2, "bark")
for i, (z, r, d) in enumerate(
    [(2.3, 1.25, 2.3), (3.25, 1.06, 2.05), (4.15, 0.82, 1.8), (4.85, 0.48, 1.35)]
):
    cone((0, 0, z), r, d, "needles" if i % 2 == 0 else "needles_light")
for z in [1.1, 1.7, 2.2]:
    for angle in [0, math.pi * 0.7, math.pi * 1.4]:
        cylinder(
            (math.cos(angle) * 0.22, math.sin(angle) * 0.22, z),
            0.045,
            0.6,
            "bark",
            (0, math.pi / 2, angle),
            8,
        )
roots.append(join("pine"))
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=(0, 0, 0.6))
o = bpy.context.object
finish(o, "granite")
rng = random.Random(521)
for v in o.data.vertices:
    v.co.x *= rng.uniform(1, 1.4)
    v.co.y *= rng.uniform(0.7, 1)
    v.co.z *= rng.uniform(0.5, 0.9)
roots.append(join("granite"))
cylinder((0, 0, 0.28), 0.28, 3.5, "bark", (0, math.pi / 2, 0), 16)
for x in [-1.76, 1.76]:
    cylinder((x, 0, 0.28), 0.255, 0.025, "timber", (0, math.pi / 2, 0), 16)
    for r in [0.08, 0.16]:
        bpy.ops.mesh.primitive_torus_add(
            major_segments=16,
            minor_segments=4,
            location=(x * 1.003, 0, 0.28),
            major_radius=r,
            minor_radius=0.007,
            rotation=(0, math.pi / 2, 0),
        )
        finish(bpy.context.object, "bark")
roots.append(join("fallen_log"))
cylinder((0, 0, 0.36), 0.43, 0.72, "bark", vertices=14)
cylinder((0, 0, 0.73), 0.405, 0.025, "timber", vertices=14)
for angle in [0, 1.5, 3, 4.5]:
    box((math.cos(angle) * 0.32, math.sin(angle) * 0.32, 0.1), (0.55, 0.15, 0.2), "bark", angle)
roots.append(join("stump"))
for x in [-1.1, 1.1]:
    for y in [-0.65, 0.65]:
        box((x, y, 0.7), (0.16, 0.16, 1.4), "timber")
for y in [-0.65, 0.65]:
    box((0, y, 1.4), (2.5, 0.18, 0.18), "timber")
    box((0, y, 0.65), (2.1, 0.1, 0.12), "bark", 0.48)
for x in [-1.1, 1.1]:
    box((x, 0, 1.4), (0.18, 1.55, 0.18), "timber")
roots.append(join("timber_frame"))
box((0, 0, 0.7), (0.12, 0.12, 1.4), "timber")
box((0, -0.05, 1.2), (0.8, 0.12, 0.35), "needles")
box((0.28, -0.12, 1.2), (0.07, 0.02, 0.22), "snow")
roots.append(join("trail_marker"))
box((0, 0, 0.9), (3.1, 2.6, 1.8), "timber")
for x in [-1.5, 1.5]:
    for y in [-1.25, 1.25]:
        box((x, y, 1), (0.14, 0.14, 2), "bark")
for z in [0.25, 0.55, 0.85, 1.15, 1.45]:
    for y in [-1.31, 1.31]:
        box((0, y, z), (3.12, 0.04, 0.035), "bark")
for x in [-0.8, 0.8]:
    box((x, 0, 2.05), (1.9, 3.1, 0.16), "steel", (-1 if x < 0 else 1) * 0.36)
box((-0.55, -1.32, 0.8), (0.7, 0.06, 1.45), "bark")
box((0.7, -1.34, 1.15), (0.6, 0.04, 0.55), "steel")
box((0.7, -1.37, 1.15), (0.05, 0.04, 0.55), "timber")
box((0.7, -1.37, 1.15), (0.6, 0.04, 0.05), "timber")
roots.append(join("cabin"))
bpy.context.view_layer.update()
geometry = {
    o.name: {
        "vertices": [list(v.co) for v in o.data.vertices],
        "faces": [list(f.vertices) for f in o.data.polygons],
        "matrix": [list(row) for row in o.matrix_world],
    }
    for o in roots
}


def runtime_bounds(o):
    points = [o.matrix_world @ v.co for v in o.data.vertices]
    points = [(v.x, v.z, -v.y) for v in points]
    return {
        "min": [min(v[i] for v in points) for i in range(3)],
        "max": [max(v[i] for v in points) for i in range(3)],
    }


report = {
    "blender": bpy.app.version_string,
    "geometryHash": hashlib.sha256(
        json.dumps(geometry, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest(),
    "prototypes": {
        o.name: {
            "vertices": len(o.data.vertices),
            "triangles": sum(len(f.vertices) - 2 for f in o.data.polygons),
            "runtimeBounds": runtime_bounds(o),
        }
        for o in roots
    },
}
(args.output / "kit-report.json").write_text(json.dumps(report, indent=2))
bpy.ops.export_scene.gltf(
    filepath=str(args.output / "kit.glb"),
    export_format="GLB",
    export_yup=True,
    export_cameras=False,
    export_lights=False,
)
# Neutral-lit source review, outside static export. Runtime scatters these templates.
for i, o in enumerate(roots):
    o.location = ((i % 4) * 4.8 - 7, (i // 4) * 5 - 2.5, 0)
floor = box((0, 0, -0.13), (23, 15, 0.2), "snow")
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.world.color = (0.35, 0.35, 0.35)
for name, power, position, size in [("Key", 1700, (1, -8, 11), 8), ("Fill", 1000, (-9, 1, 7), 7)]:
    d = bpy.data.lights.new(name, "AREA")
    d.energy = power
    d.shape = "DISK"
    d.size = size
    o = bpy.data.objects.new(name, d)
    scene.collection.objects.link(o)
    o.location = position
    o.rotation_euler = (Vector((0, 0, 1)) - o.location).to_track_quat("-Z", "Y").to_euler()
d = bpy.data.cameras.new("Review")
camera = bpy.data.objects.new("Review", d)
scene.collection.objects.link(camera)
camera.location = (13, -20, 13)
camera.rotation_euler = (Vector((0, 0, 1.3)) - camera.location).to_track_quat("-Z", "Y").to_euler()
d.type = "ORTHO"
d.ortho_scale = 25
scene.camera = camera
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(args.output / "kit-contact-sheet.png")
bpy.ops.render.render(write_still=True)
print("FORESTRY_KIT_READY " + json.dumps(report))
