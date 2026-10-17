"""Pure specification and course generation. No Blender or third-party dependencies."""

import hashlib
import json
import math
import random
from pathlib import Path

VERSION = "quarry-slice-2"
SPEC_DIR = Path(__file__).parent / "specs"
BIKE_FIELDS = frozenset(
    "schemaVersion id name wheelbase wheelRadius wheelWidth chassisMass wheelMass riderMass rearAxle frontAxle swingPivot steeringHead handlebar peg suspensionHz suspensionDamping motorTorque motorSpeed brakeTorque friction riderTravel riderOffset riderHeight frame collision paint".split()
)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def stream(seed, name):
    return random.Random(
        int.from_bytes(hashlib.sha256(f"{VERSION}:{seed}:{name}".encode()).digest(), "big")
    )


def number(value, field, low, high):
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or not low <= value <= high
    ):
        raise ValueError(f"{field}: expected finite number in [{low}, {high}]")


def specs(directory=SPEC_DIR):
    bike = json.loads((directory / "bike.json").read_text())
    rider = json.loads((directory / "rider.json").read_text())
    if not isinstance(bike, dict) or not isinstance(rider, dict):
        raise ValueError("specifications: expected JSON objects")
    expected_bike = BIKE_FIELDS
    if set(bike) != expected_bike:
        raise ValueError(f"bike: missing/unknown fields {set(bike) ^ expected_bike}")
    ranges = {
        "wheelbase": (1, 1.8),
        "wheelRadius": (0.25, 0.45),
        "wheelWidth": (0.06, 0.2),
        "chassisMass": (30, 100),
        "wheelMass": (1, 8),
        "riderMass": (40, 110),
        "suspensionHz": (2, 12),
        "suspensionDamping": (0.3, 1.5),
        "motorTorque": (20, 400),
        "motorSpeed": (5, 40),
        "brakeTorque": (50, 400),
        "friction": (0.3, 2),
        "riderTravel": (0.1, 0.6),
        "riderHeight": (0.5, 1),
        "riderOffset": (-0.2, 0.25),
    }
    for field, bounds in ranges.items():
        number(bike[field], f"bike.{field}", *bounds)
    for field in ["rearAxle", "frontAxle", "swingPivot", "steeringHead", "handlebar", "peg"]:
        if not isinstance(bike[field], list) or len(bike[field]) != 2:
            raise ValueError(f"bike.{field}: expected XY pair")
        for value in bike[field]:
            number(value, f"bike.{field}", -2, 2)
    if abs(bike["frontAxle"][0] - bike["rearAxle"][0] - bike["wheelbase"]) > 1e-8:
        raise ValueError("bike.wheelbase: disagrees with axle positions")
    for field in ["frame", "collision"]:
        if not isinstance(bike[field], list) or len(bike[field]) < 3:
            raise ValueError(f"bike.{field}: expected polygon/polyline")
        for point in bike[field]:
            if not isinstance(point, list) or len(point) != 2:
                raise ValueError(f"bike.{field}: expected XY pairs")
            for value in point:
                number(value, f"bike.{field}", -2, 2)
    required = {"schemaVersion", "id", "palette", "joints", "elbowLimits", "kneeLimits"}
    if set(rider) != required:
        raise ValueError("rider: missing or unknown fields")
    if not isinstance(rider["palette"], dict) or set(rider["palette"]) != {
        "suit",
        "panels",
        "boots",
        "helmet",
        "visor",
    }:
        raise ValueError("rider.palette: incomplete material set")
    expected = {"pelvis", "spine", "chest", "neck", "head"} | {
        f"{joint}_{side}"
        for side in "LR"
        for joint in ["shoulder", "elbow", "hand", "hip", "knee", "foot"]
    }
    if not isinstance(rider["joints"], dict) or set(rider["joints"]) != expected:
        raise ValueError("rider.joints: incomplete named rig")
    for name, point in rider["joints"].items():
        if not isinstance(point, list) or len(point) != 3:
            raise ValueError(f"rider.joints.{name}: expected XYZ")
        for value in point:
            number(value, f"rider.joints.{name}", -2, 2)
    for field in ["elbowLimits", "kneeLimits"]:
        values = rider[field]
        if not isinstance(values, list) or len(values) != 2:
            raise ValueError(f"rider.{field}: expected two angles")
        for value in values:
            number(value, f"rider.{field}", 0, math.pi)
        if not 0 < values[0] < values[1] < math.pi:
            raise ValueError(f"rider.{field}: invalid joint limits")
    for label, spec in [("bike", bike), ("rider", rider)]:
        if spec["schemaVersion"] != 1 or isinstance(spec["schemaVersion"], bool):
            raise ValueError(f"{label}.schemaVersion: expected 1")
        if not isinstance(spec["id"], str) or not spec["id"]:
            raise ValueError(f"{label}.id: expected nonempty string")
    import re

    for field, color in {
        "bike.paint": bike["paint"],
        **{f"rider.palette.{k}": v for k, v in rider["palette"].items()},
    }.items():
        if not isinstance(color, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            raise ValueError(f"{field}: expected hex colour")
    polygon = bike["collision"]
    turns = []
    for i in range(len(polygon)):
        a, b, c = polygon[i - 2], polygon[i - 1], polygon[i]
        turns.append((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]))
    if not (all(t > 0 for t in turns) or all(t < 0 for t in turns)):
        raise ValueError("bike.collision: expected strictly convex polygon")
    return bike, rider


def bike_dimensions(bike, rider):
    bike = dict(bike)

    def reach(start, middle, end, limits):
        a = math.dist(rider["joints"][start], rider["joints"][middle])
        b = math.dist(rider["joints"][middle], rider["joints"][end])
        return math.sqrt(a * a + b * b + 2 * a * b * math.cos(limits[0])) * 0.995

    bike["riderReach"] = {
        "arm": reach("shoulder_L", "elbow_L", "hand_L", rider["elbowLimits"]),
        "leg": reach("hip_L", "knee_L", "foot_L", rider["kneeLimits"]),
    }
    return bike


def make_course(seed="quarry-01"):
    rng = stream(seed, "rollers")
    points = [[-12, 0], [0, 0], [8, 0]]
    for i in range(1, 25):
        x = 8 + i * 0.5
        points.append([x, 0.65 * (1 - math.cos((x - 8) / 12 * math.tau)) / 2])
    points.append([22, 0])
    amplitude = 0.14 + rng.uniform(-0.015, 0.015)
    for i in range(1, 41):
        x = 22 + i * 0.2
        points.append([x, amplitude * (1 - math.cos((x - 22) * math.pi)) / 2])
    points += [
        [34, 0],
        [38, 0],
        [38, 0.25],
        [41, 0.25],
        [44, 0],
        [49, 0],
        [53, 0],
        [56, 0.35],
        [59, 1.15],
        [61, 1.65],
    ]
    landing = [
        [64.6, 1.05],
        [68, 0.65],
        [72, 0],
        [78, 0],
        [83, 0],
        [85, 0.2],
        [87, 0.2],
        [87, 0.55],
        [91, 0.55],
        [93, 0.9],
        [95, 0.9],
        [95, 1.25],
        [99, 1.25],
        [103, 1.25],
        [135, 1.25],
    ]
    course = {
        "schemaVersion": 1,
        "id": "quarry-works-v2",
        "name": "The works line",
        "seed": str(seed),
        "generator": VERSION,
        "paths": [points, landing],
        "sections": [
            {
                "id": "flat",
                "name": "01 / Find your balance",
                "start": 0,
                "end": 8,
                "hint": "Feed in W / RT. S / LT brakes. A / left stick back shifts your weight rearward.",
            },
            {
                "id": "crest",
                "name": "02 / Read the crest",
                "start": 8,
                "end": 22,
                "hint": "Lean forward on the climb. Ease the throttle over the crest.",
            },
            {
                "id": "rollers",
                "name": "03 / Stay loose",
                "start": 22,
                "end": 34,
                "hint": "Keep a steady throttle. Let the suspension follow the rollers.",
            },
            {
                "id": "step",
                "name": "04 / Lift, then settle",
                "start": 34,
                "end": 49,
                "hint": "A / stick back and a burst of throttle lifts the front. D / forward brings it down.",
            },
            {
                "id": "jump",
                "name": "05 / Commit to the gap",
                "start": 49,
                "end": 78,
                "hint": "Build speed before the ramp. Lean forward in flight to meet the landing.",
            },
            {
                "id": "finish",
                "name": "06 / The final ascent",
                "start": 78,
                "end": 103,
                "hint": "Brake before the steps. Lean back to lift, then forward to keep climbing.",
            },
        ],
        "checkpoints": [{"x": x, "y": 0.42} for x in [2, 21, 34, 49, 78]],
        "finish": 103,
        "finishY": 1.25,
        "killY": -5,
        "width": 2.8,
        "jump": {"takeoff": [61, 1.65], "landing": [64.6, 1.05], "approach": 53, "end": 72},
        "medals": {
            "gold": {"faults": 0, "time": 23},
            "silver": {"faults": 2, "time": 40},
            "bronze": {"faults": 8, "time": 90},
        },
        "rollerAmplitude": amplitude,
        "scenerySeed": int(stream(seed, "scenery").random() * 2**32),
    }
    scenery = stream(seed, "scenery")
    course["scenery"] = []
    for i in range(90):
        size = scenery.uniform(0.35, 1.25)
        height = size * scenery.uniform(0.5, 0.8)
        course["scenery"].append(
            {
                "position": [scenery.uniform(-20, 125), -0.25 + height, scenery.uniform(-15, -6)],
                "scale": [size, height, size * 0.8],
                "rotation": [0, scenery.random() * math.tau, 0],
            }
        )
    course["presentationHash"] = digest(course["scenery"])
    course["contentHash"] = course_identity(course)
    validate_course(course)
    return course


def validate_course(course):
    if len(course["paths"]) != 2:
        raise ValueError("course.paths: expected separated takeoff and landing")
    for path in course["paths"]:
        for i, p in enumerate(path):
            for value in p:
                number(value, "course.paths", -200, 200)
            if i and p == path[i - 1]:
                raise ValueError("course.paths: zero-length edge")
            if i and p[0] < path[i - 1][0]:
                raise ValueError("course.paths: backward edge")
    checkpoints = course["checkpoints"]
    if any(b["x"] <= a["x"] for a, b in zip(checkpoints, checkpoints[1:])):
        raise ValueError("course.checkpoints: unordered")
    for checkpoint in checkpoints:
        surface = surface_height(course, checkpoint["x"])
        if surface is None or abs(checkpoint["y"] - surface - 0.42) > 1e-6:
            raise ValueError("course.checkpoints: unsafe respawn height")
        for offset in [-0.9, 0.9]:
            adjacent = surface_height(course, checkpoint["x"] + offset)
            if adjacent is None or abs(adjacent - surface) > 0.01:
                raise ValueError("course.checkpoints: insufficient flat recovery space")
    if course["paths"][1][0][0] <= course["paths"][0][-1][0]:
        raise ValueError("course.paths: jump gap must be empty")
    for prop in course.get("scenery", []):
        if prop["position"][2] + prop["scale"][2] > -2.4:
            raise ValueError("course.scenery: prop enters rider clearance corridor")
    finish = surface_height(course, course["finish"])
    if finish is None or abs(finish - course.get("finishY", 0)) > 1e-6:
        raise ValueError("course.finish: surface/height mismatch")


def course_identity(course):
    """Records depend on riding geometry and checkpoints, not decorative scatter."""
    return digest(
        {
            key: course.get(key, 0)
            for key in [
                "schemaVersion",
                "id",
                "generator",
                "paths",
                "checkpoints",
                "finish",
                "finishY",
                "killY",
                "width",
            ]
        }
    )


def surface_height(course, x):
    for path in course["paths"]:
        for a, b in zip(path, path[1:]):
            if a[0] <= x <= b[0] and b[0] > a[0]:
                return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])
    return None
