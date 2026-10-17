"""Original parametric bike and skinned rider. Run only inside pinned Blender 4.5.3."""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--specs", type=Path, required=True)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])
args.output.mkdir(parents=True, exist_ok=True)
bike = json.loads((args.specs / "bike.json").read_text())
rider = json.loads((args.specs / "rider.json").read_text())
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)


def v(p):
    return Vector((p[0], -p[2] if len(p) > 2 else 0, p[1]))


def mat(name, hexcolor, metal=0, rough=0.55):
    color = tuple(int(hexcolor.lstrip("#")[i : i + 2], 16) / 255 for i in (0, 2, 4))
    # Input colours are sRGB; Principled expects scene-linear values.
    linear = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in color)
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*linear, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Roughness"].default_value = rough
    return material


steel = mat("Brushed alloy", "#b2b8b0", 0.8, 0.3)
dark = mat("Engine graphite", "#333b3b", 0.65, 0.42)
paint = mat("Works ochre", bike["paint"], 0.25, 0.38)
rubber = mat("Tyre rubber", "#202622", 0, 0.9)
black = mat("Grips and saddle", "#27322e", 0, 0.72)
brass = mat("Fork bronze", "#b18c52", 0.8, 0.28)
red = mat("Rear reflector", "#aa3929", 0.1, 0.35)


def finish(obj, name, material, parent=None, bone=None):
    obj.name = name
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if parent:
        obj.parent = parent
    if bone:
        group = obj.vertex_groups.new(name=bone)
        group.add(list(range(len(obj.data.vertices))), 1, "REPLACE")
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def empty(name, point=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = v(point)
    obj.parent = parent
    return obj


def tube(name, a, b, r, material, parent=None, bone=None, vertices=12):
    start, end = v(a), v(b)
    direction = end - start
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=r, depth=direction.length, location=(start + end) / 2
    )
    obj = bpy.context.object
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return finish(obj, name, material, parent, bone)


def ellipsoid(name, p, scale, material, parent=None, bone=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, location=v(p))
    obj = bpy.context.object
    obj.scale = (scale[0], scale[2], scale[1])
    return finish(obj, name, material, parent, bone)


def box(name, p, size, material, parent=None, bevel=0.02, bone=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=v(p))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("Machined edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj, name, material, parent, bone)


def ring(name, p, major, minor, material, parent, segments=48):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=segments,
        minor_segments=10,
        location=v(p),
        major_radius=major,
        minor_radius=minor,
        rotation=(math.pi / 2, 0, 0),
    )
    return finish(bpy.context.object, name, material, parent)


def ribbon(name, points, width, material, parent, bone=None):
    vertices = [v([x, y, z]) for x, y in points for z in [-width / 2, width / 2]]
    faces = [(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2) for i in range(len(points) - 1)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    solid = obj.modifiers.new("Moulded thickness", "SOLIDIFY")
    solid.thickness = 0.012
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=solid.name)
    return finish(obj, name, material, parent, bone)


def merge_meshes(root):
    # Merge by articulated parent and material; keep each mechanical pivot independent.
    groups = {}
    for obj in sorted(root.children_recursive, key=lambda obj: obj.name):
        if obj.type == "MESH":
            groups.setdefault((obj.parent.name, obj.data.materials[0].name), []).append(obj)
    for (parent, material), objects in sorted(groups.items()):
        if len(objects) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = f"{parent}_{material}"


root = empty("bikeRoot")
chassis = empty("chassis", parent=root)
for depth in [-0.095, 0.095]:
    frame = bike["frame"]
    for i, (a, b) in enumerate(zip(frame, frame[1:])):
        tube(f"Frame rail {i}", [*a, depth], [*b, depth], 0.025, steel, chassis)
    tube("Frame spine", [-0.16, 0.55, depth], [0.2, 0.13, depth], 0.022, dark, chassis)
box("Engine case", [-0.02, 0.23, 0], [0.35, 0.24, 0.23], dark, chassis, 0.055)
for i in range(6):
    box("Cooling fin", [-0.04, 0.25 + i * 0.021, 0], [0.27, 0.009, 0.27], steel, chassis, 0.003)
ellipsoid("Engine cover", [-0.08, 0.24, 0.14], [0.13, 0.13, 0.025], steel, chassis)
box("Skid plate", [0.03, 0.065, 0], [0.43, 0.045, 0.27], steel, chassis, 0.012)
ellipsoid("Fuel tank", [0.04, 0.51, 0], [0.23, 0.105, 0.13], paint, chassis)
box("Saddle", [-0.28, 0.54, 0], [0.39, 0.055, 0.19], black, chassis, 0.025)
ribbon(
    "Swept rear mudguard",
    [[-0.18, 0.52], [-0.38, 0.50], [-0.57, 0.48], [-0.77, 0.46], [-0.91, 0.42]],
    0.19,
    paint,
    chassis,
)
box("Rear marker", [-0.58, 0.48, 0], [0.03, 0.025, 0.12], red, chassis, 0.008)
tube("Exhaust header", [0.16, 0.29, -0.12], [0.29, 0.13, -0.13], 0.027, brass, chassis)
tube("Exhaust pipe", [0.29, 0.13, -0.13], [-0.39, 0.35, -0.17], 0.028, steel, chassis)
tube("Silencer", [-0.39, 0.35, -0.17], [-0.57, 0.43, -0.17], 0.05, dark, chassis)
for depth in [-0.17, 0.17]:
    box("Foot peg", [*bike["peg"], depth], [0.13, 0.035, 0.12], dark, chassis, 0.008)
head = bike["steeringHead"]
handle = bike["handlebar"]
tube(
    "Head tube",
    [head[0] - 0.03, head[1] - 0.06, 0],
    [head[0] + 0.03, head[1] + 0.06, 0],
    0.05,
    dark,
    chassis,
)
tube("Stem", [*head, 0], [*handle, 0], 0.025, steel, chassis)
tube("Handlebar", [*handle, -0.29], [*handle, 0.29], 0.021, steel, chassis)
for depth in [-0.24, 0.24]:
    tube("Grip", [*handle, depth - 0.05], [*handle, depth + 0.05], 0.027, black, chassis)
box("Number plate", [0.46, 0.65, 0], [0.025, 0.19, 0.23], paint, chassis, 0.015)
for depth in [-0.075, 0.075]:
    tube("Upper fork", [head[0], head[1], depth], [0.57, 0.22, depth], 0.033, brass, chassis)
slider = empty("forkSlider", parent=root)
for depth in [-0.075, 0.075]:
    tube("Fork slider", [0, 0, depth], [-0.10, 0.28, depth], 0.025, steel, slider)
ribbon(
    "Arched front mudguard",
    [[-0.25, 0.31], [-0.12, 0.37], [0.04, 0.39], [0.23, 0.35], [0.35, 0.29]],
    0.16,
    paint,
    slider,
)
swing = empty("swingarm", bike["swingPivot"], root)
relative = [bike["rearAxle"][i] - bike["swingPivot"][i] for i in (0, 1)]
for depth in [-0.085, 0.085]:
    tube("Swing arm", [0, 0, depth], [*relative, depth], 0.029, dark, swing)
shock = empty("shock", [-0.27, 0.41, 0], chassis)
tube("Shock damper", [0, 0, 0], [-0.14, -0.23, 0], 0.031, steel, shock)
for i in range(8):
    ring("Shock spring", [-0.02 - i * 0.013, -0.025 - i * 0.021, 0], 0.042, 0.008, paint, shock, 16)
for name, axle in [("rearWheel", bike["rearAxle"]), ("frontWheel", bike["frontAxle"])]:
    wheel = empty(name, [*axle, 0], root)
    tyre_half = bike["wheelWidth"] / 2
    ring("Trials tyre", (0, 0, 0), bike["wheelRadius"] - tyre_half, tyre_half, rubber, wheel)
    ring("Alloy rim", (0, 0, 0), bike["wheelRadius"] - tyre_half * 2, 0.017, steel, wheel)
    tube("Hub", [0, 0, -0.065], [0, 0, 0.065], 0.055, dark, wheel)
    for i in range(24):
        angle = i * math.tau / 24
        radius = bike["wheelRadius"] - tyre_half * 2
        tube(
            "Spoke",
            [0, 0, 0.01 if i % 2 else -0.01],
            [math.cos(angle) * radius, math.sin(angle) * radius, 0],
            0.0035,
            steel,
            wheel,
            vertices=6,
        )
    for i in range(40):
        angle = i * math.tau / 40
        tread = box(
            "Tread",
            [
                math.cos(angle) * (bike["wheelRadius"] - 0.014),
                math.sin(angle) * (bike["wheelRadius"] - 0.014),
                0,
            ],
            [0.028, 0.026, bike["wheelWidth"] * 0.96],
            rubber,
            wheel,
            0.003,
        )
        tread.rotation_euler[1] = -angle
    ring("Brake disc", (0, 0, 0.065), 0.115, 0.018, steel, wheel, 32)
    if name == "frontWheel":
        box("Caliper", [-0.07, 0.10, 0.075], [0.07, 0.09, 0.04], dark, slider, 0.01)
    else:
        box(
            "Caliper",
            [relative[0] - 0.07, relative[1] + 0.10, 0.075],
            [0.07, 0.09, 0.04],
            dark,
            swing,
            0.01,
        )
slider.location = v([*bike["frontAxle"], 0])
# Small mechanical details share the authored frame and socket coordinates.
for depth in [-0.145, 0.145]:
    box("Works side panel", [-0.16, 0.43, depth], [0.30, 0.13, 0.012], paint, chassis, 0.014)
    box("Works stripe", [-0.16, 0.44, depth * 1.05], [0.23, 0.022, 0.009], black, chassis, 0.002)
    for x, y in [(-0.28, 0.43), (0.15, 0.18), (0.03, 0.23)]:
        tube(
            "Hex fastener", [x, y, depth], [x, y, depth + 0.008], 0.012, steel, chassis, vertices=6
        )
    for x in [-0.20, -0.15]:
        box("01 plate", [x, 0.46, depth * 1.07], [0.018, 0.055, 0.006], steel, chassis, 0.002)
for depth in [-0.27, 0.27]:
    tube(
        "Brake lever",
        [handle[0] + 0.03, handle[1], depth],
        [handle[0] + 0.10, handle[1] - 0.025, depth],
        0.008,
        steel,
        chassis,
    )
tube("Brake hose", [head[0] + 0.02, head[1], 0.10], [0.60, 0.15, 0.10], 0.005, black, chassis)
merge_meshes(root)

# Named armature; mesh vertex groups survive material batching.
materials = {
    key: mat("Rider " + key, value, 0.1 if key == "visor" else 0, 0.25 if key == "visor" else 0.7)
    for key, value in rider["palette"].items()
}
j = rider["joints"]
rroot = empty("riderRoot")
arm_data = bpy.data.armatures.new("Works rider rig")
arm = bpy.data.objects.new("riderRig", arm_data)
bpy.context.collection.objects.link(arm)
arm.parent = rroot
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
definitions = [
    ("pelvis", "pelvis", "spine", None),
    ("spine", "spine", "chest", "pelvis"),
    ("chest", "chest", "neck", "spine"),
    ("head", "neck", "head", "chest"),
]
for side in "LR":
    definitions += [
        (f"upper_arm_{side}", f"shoulder_{side}", f"elbow_{side}", "chest"),
        (f"forearm_{side}", f"elbow_{side}", f"hand_{side}", f"upper_arm_{side}"),
        (f"thigh_{side}", f"hip_{side}", f"knee_{side}", "pelvis"),
        (f"shin_{side}", f"knee_{side}", f"foot_{side}", f"thigh_{side}"),
    ]
for name, start, end, parent in definitions:
    bone = arm_data.edit_bones.new(name)
    bone.head = v(j[start])
    bone.tail = v(j[end])
    bone.parent = arm_data.edit_bones.get(parent) if parent else None
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.select_all(action="DESELECT")
rider_meshes = []


def flesh(name, p, scale, material, bone):
    obj = ellipsoid(name, p, scale, materials[material], rroot, bone)
    rider_meshes.append(obj)
    return obj


def limb(name, start, end, radius, material, bone):
    a, b = j[start], j[end]
    mid = [(x + y) / 2 for x, y in zip(a, b)]
    length = (v(b) - v(a)).length
    obj = flesh(name, mid, (radius, length * 0.58, radius * 0.85), material, bone)
    direction = v(b) - v(a)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    # Ellipsoid local Z is the length axis in Blender, with local X/Y cross-section.
    obj.scale = (radius, radius * 0.85, length * 0.58)
    return obj


# A continuous tapered torso with blended skin weights, rather than stacked spheres.
rings = [
    (-0.13, 0.64, 0.11, 0.14),
    (-0.13, 0.70, 0.14, 0.16),
    (-0.09, 0.79, 0.11, 0.145),
    (-0.04, 0.91, 0.125, 0.17),
    (0.04, 1.03, 0.13, 0.195),
    (0.09, 1.12, 0.085, 0.15),
    (0.15, 1.17, 0.05, 0.07),
]
vertices = []
faces = []
segments = 24
for x, y, width, depth in rings:
    for i in range(segments):
        angle = i * math.tau / segments
        vertices.append(v((x + width * math.cos(angle), y, depth * math.sin(angle))))
for ring_index in range(len(rings) - 1):
    for i in range(segments):
        faces.append(
            (
                ring_index * segments + i,
                ring_index * segments + (i + 1) % segments,
                (ring_index + 1) * segments + (i + 1) % segments,
                (ring_index + 1) * segments + i,
            )
        )
faces += [
    tuple(reversed(range(segments))),
    tuple(range((len(rings) - 1) * segments, len(rings) * segments)),
]
mesh = bpy.data.meshes.new("Continuous suit")
mesh.from_pydata(vertices, [], faces)
mesh.update()
torso = bpy.data.objects.new("Tailored suit", mesh)
bpy.context.collection.objects.link(torso)
finish(torso, "Tailored suit", materials["suit"], rroot)
rider_meshes.append(torso)
groups = {name: torso.vertex_groups.new(name=name) for name in ["pelvis", "spine", "chest"]}
for index, (_, height, _, _) in enumerate(rings):
    indices = list(range(index * segments, (index + 1) * segments))
    if height < 0.80:
        weight = max(0, min(1, (height - 0.68) / 0.16))
        groups["pelvis"].add(indices, 1 - weight, "REPLACE")
        groups["spine"].add(indices, weight, "REPLACE")
    else:
        weight = max(0, min(1, (height - 0.86) / 0.22))
        groups["spine"].add(indices, 1 - weight, "REPLACE")
        groups["chest"].add(indices, weight, "REPLACE")
flesh("Chest protector", [0.12, 1.035, 0], [0.075, 0.13, 0.16], "panels", "chest")
flesh("Neck", [0.17, 1.20, 0], [0.07, 0.09, 0.075], "boots", "head")
flesh("Helmet shell", j["head"], [0.155, 0.17, 0.15], "helmet", "head")
flesh("Visor", [0.335, 1.37, 0], [0.065, 0.060, 0.145], "visor", "head")
flesh("Helmet chin", [0.32, 1.265, 0], [0.085, 0.043, 0.13], "helmet", "head")
obj = box(
    "Helmet peak", [0.29, 1.47, 0], [0.20, 0.018, 0.29], materials["helmet"], rroot, 0.008, "head"
)
rider_meshes.append(obj)
for depth in [-0.13, 0.13]:
    obj = box(
        "Helmet vent",
        [0.27, 1.29, depth],
        [0.07, 0.018, 0.008],
        materials["visor"],
        rroot,
        0.003,
        "head",
    )
    rider_meshes.append(obj)
for side in "LR":
    for name, start, end, radius, material, bone in [
        ("Sleeve", f"shoulder_{side}", f"elbow_{side}", 0.07, "suit", f"upper_arm_{side}"),
        ("Forearm", f"elbow_{side}", f"hand_{side}", 0.057, "panels", f"forearm_{side}"),
        ("Thigh", f"hip_{side}", f"knee_{side}", 0.095, "suit", f"thigh_{side}"),
        ("Shin", f"knee_{side}", f"foot_{side}", 0.07, "boots", f"shin_{side}"),
    ]:
        limb(name, start, end, radius, material, bone)
    flesh("Glove", j[f"hand_{side}"], [0.068, 0.045, 0.05], "boots", f"forearm_{side}")
    p = list(j[f"foot_{side}"])
    p[0] += 0.04
    flesh("Boot", p, [0.13, 0.065, 0.07], "boots", f"shin_{side}")
    flesh("Knee guard", j[f"knee_{side}"], [0.075, 0.095, 0.085], "panels", f"shin_{side}")
for depth in [-0.151, 0.151]:
    for y in [1.39, 1.42]:
        obj = box(
            "Helmet graphic",
            [0.20, y, depth],
            [0.12, 0.018, 0.006],
            materials["panels"],
            rroot,
            0.002,
            "head",
        )
        rider_meshes.append(obj)
    obj = box(
        "Helmet hinge",
        [0.26, 1.36, depth],
        [0.026, 0.028, 0.008],
        materials["boots"],
        rroot,
        0.004,
        "head",
    )
    rider_meshes.append(obj)
for side in "LR":
    p = list(j[f"foot_{side}"])
    p[0] += 0.04
    p[1] -= 0.045
    obj = box(
        "Boot sole", p, [0.22, 0.028, 0.13], materials["panels"], rroot, 0.006, f"shin_{side}"
    )
    rider_meshes.append(obj)
for obj in rider_meshes:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)
merge_meshes(rroot)
for obj in rroot.children_recursive:
    if obj.type == "MESH":
        mod = obj.modifiers.new("Runtime skeleton", "ARMATURE")
        mod.object = arm
        obj.parent = arm


def export(obj, filename):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    for child in obj.children_recursive:
        child.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(args.output / filename),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )


export(root, "bike.glb")
export(rroot, "rider.glb")
geometric_data = {}
for owner in [root, rroot]:
    for obj in sorted(owner.children_recursive, key=lambda o: o.name):
        if obj.type != "MESH":
            continue
        positions = [
            tuple(round(c, 5) for c in (obj.matrix_world @ vertex.co))
            for vertex in obj.data.vertices
        ]
        faces = sorted(
            tuple(sorted(positions[index] for index in face.vertices)) for face in obj.data.polygons
        )
        weights = sorted(
            (
                positions[vertex.index],
                tuple(
                    sorted(
                        (obj.vertex_groups[group.group].name, round(group.weight, 6))
                        for group in vertex.groups
                    )
                ),
            )
            for vertex in obj.data.vertices
            if vertex.groups
        )
        geometric_data[obj.name] = {
            "positions": sorted(positions),
            "faces": faces,
            "weights": weights,
        }
    for obj in sorted(owner.children_recursive, key=lambda o: o.name):
        if obj.type == "EMPTY":
            geometric_data["pivot:" + obj.name] = [
                [round(c, 6) for c in row] for row in obj.matrix_world
            ]
report = {
    "blender": bpy.app.version_string,
    "geometryHash": hashlib.sha256(
        json.dumps(geometric_data, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest(),
    "bikeVertices": sum(len(o.data.vertices) for o in root.children_recursive if o.type == "MESH"),
    "riderVertices": sum(
        len(o.data.vertices) for o in rroot.children_recursive if o.type == "MESH"
    ),
    "bones": [{"name": n, "start": s, "end": e, "parent": p} for n, s, e, p in definitions],
    "bikeNodes": sorted(o.name for o in root.children_recursive if o.type == "EMPTY"),
    "joints": j,
}
(args.output / "rig.json").write_text(json.dumps(report, indent=2))

# Neutral-lit visual QA; no external resources or procedural shader export assumptions.
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 20
scene.cycles.use_denoising = True
scene.render.resolution_x = 960
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.world.color = (0.25, 0.25, 0.25)
scene.view_settings.view_transform = "AgX"
floor = mat("Studio floor", "#89908b", 0, 0.9)
box("Studio floor", [0, -0.375, 0], [200, 0.04, 200], floor, bevel=0)
for name, p, power, size in [
    ("Key", (1, 5, 4), 950, 5),
    ("Rim", (-3, 3, -3), 1100, 4),
    ("Fill", (4, 2, -1), 600, 3),
]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = v(p)
    obj.rotation_euler = (v((0, 0.5, 0)) - obj.location).to_track_quat("-Z", "Y").to_euler()
camera_data = bpy.data.cameras.new("QA camera")
camera = bpy.data.objects.new("QA camera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = "ORTHO"
camera_data.ortho_scale = 2.8
for name, p in [("side", (0, 0.7, 5)), ("three-quarter", (3, 1.8, 4)), ("front", (5, 0.7, 0))]:
    camera.location = v(p)
    camera.rotation_euler = (v((0, 0.62, 0)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(args.output / f"preview-{name}.png")
    bpy.ops.render.render(write_still=True)
import numpy as np

sheet = np.zeros((720, 2880, 4), dtype=np.float32)
for index, name in enumerate(["side", "three-quarter", "front"]):
    picture = bpy.data.images.load(str(args.output / f"preview-{name}.png"), check_existing=False)
    pixels = np.empty(960 * 720 * 4, dtype=np.float32)
    picture.pixels.foreach_get(pixels)
    sheet[:, index * 960 : (index + 1) * 960, :] = pixels.reshape(720, 960, 4)
contact = bpy.data.images.new("Bike and rider contact sheet", 2880, 720, alpha=True)
contact.pixels.foreach_set(sheet.ravel())
contact.filepath_raw = str(args.output / "contact-sheet.png")
contact.file_format = "PNG"
contact.save()
(args.output / "build-complete.json").write_text(
    json.dumps(
        {
            "geometryHash": report["geometryHash"],
            "files": {
                name: hashlib.sha256((args.output / name).read_bytes()).hexdigest()
                for name in ["bike.glb", "rider.glb", "rig.json", "contact-sheet.png"]
            },
        }
    )
)
print("TRIALS_ASSETS_READY " + json.dumps(report))
