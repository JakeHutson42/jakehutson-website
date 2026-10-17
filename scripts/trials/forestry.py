"""One bounded forestry biome, shared terrain contracts, original offline kit."""

import copy
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import wave
from array import array
from content import canonical, digest, number, stream, surface_height, course_identity
from modules import compose, validate_contracts
from bank import invoke_verifier, sheet

ROOT = Path(__file__).resolve().parents[2]
SPEC = ROOT / "scripts/trials/specs/forestry.json"
SCRATCH = ROOT / ".trials-build/forestry"
VERSION = "forestry-composer-1"
ROUTES = [
    ("nursery", "Nursery Trail", "apprentice", "beginner", 0.12),
    ("sawyer", "Sawyer's Run", "cutstone", "beginner", 0.16),
    ("ridge", "Ridge Return", "cutstone", "intermediate", 0.20),
]


def validate_biome(spec):
    if (
        set(spec)
        != {
            "schemaVersion",
            "id",
            "name",
            "seed",
            "palette",
            "lighting",
            "corridor",
            "budgets",
            "prototypes",
        }
        or type(spec["schemaVersion"]) is not int
        or spec["schemaVersion"] != 1
        or spec["id"] != "forestry"
    ):
        raise ValueError("biome: missing/unknown fields or identity")
    colors = {
        "sky",
        "fog",
        "soil",
        "grass",
        "bark",
        "needles",
        "granite",
        "timber",
        "snow",
        "water",
    }
    import re

    if any(not isinstance(spec[k], str) or not spec[k].strip() for k in ["name", "seed"]):
        raise ValueError("biome: name/seed must be nonempty strings")

    if set(spec["palette"]) != colors or any(
        not isinstance(c, str) or not re.fullmatch(r"#[a-fA-F0-9]{6}", c)
        for c in spec["palette"].values()
    ):
        raise ValueError("biome.palette: invalid colours")
    if spec["corridor"] != {"halfWidth": 1.4, "height": 2.4, "sceneryBackLimit": -3.5}:
        raise ValueError("biome.corridor: clearance contract changed")
    if set(spec["lighting"]) != {"exposure", "sun", "sunIntensity", "fogNear", "fogFar"}:
        raise ValueError("biome.lighting: unknown fields")
    if not isinstance(spec["lighting"]["sun"], str) or not re.fullmatch(
        r"#[a-fA-F0-9]{6}", spec["lighting"]["sun"]
    ):
        raise ValueError("biome.lighting.sun: invalid colour")
    for k, bounds in {
        "exposure": (0.5, 2),
        "sunIntensity": (0.5, 5),
        "fogNear": (20, 40),
        "fogFar": (80, 150),
    }.items():
        number(spec["lighting"][k], "biome.lighting." + k, *bounds)
    if spec["prototypes"] != [
        "pine",
        "granite",
        "fallen_log",
        "stump",
        "timber_frame",
        "trail_marker",
        "cabin",
    ]:
        raise ValueError("biome.prototypes: unsupported kit contract")
    if set(spec["budgets"]) != {"props", "kitBytes", "triangles", "drawCalls"}:
        raise ValueError("biome.budgets: invalid fields")
    for k, maximum in {
        "props": 160,
        "kitBytes": 1500000,
        "triangles": 200000,
        "drawCalls": 100,
    }.items():
        if (
            isinstance(spec["budgets"][k], bool)
            or not isinstance(spec["budgets"][k], int)
            or not 1 <= spec["budgets"][k] <= maximum
        ):
            raise ValueError("biome.budgets." + k + ": invalid bound")
    return spec


def compose_forest(seed, route, repair=0):
    definition = next((r for r in ROUTES if r[0] == route), None)
    if definition is None:
        raise ValueError("forestry.route: unknown recipe")
    _, name, base, difficulty, amplitude = definition
    c = compose(seed, base, repair)
    # A root/log bed uses smooth low humps; recovery/checkpoint flats stay authored.
    for path in c["paths"]:
        for p in path:
            if 22 < p[0] < 30:
                p[1] = amplitude * (0.5 - 0.5 * math.cos((p[0] - 22) * math.pi))
        for i in range(1, len(path)):
            a, b = path[i - 1], path[i]
            if a[0] == b[0] and b[1] > a[1]:
                # Chamfered timber/rock steps share the exact rendered polyline.
                b[0] += max(0.4, (b[1] - a[1]) / 0.5)
    c.update(
        id=f"forestry-{route}-1",
        name=name,
        generator=VERSION,
        difficulty=difficulty,
        biome="forestry",
    )
    c["surfaceZones"] = [
        {"range": [22, 30], "material": "timber"},
        {"range": [53, 61], "material": "timber"},
        {"range": [83, 103], "material": "granite"},
    ]
    names = [
        "01 / Find the trail",
        "02 / Read the rise",
        "03 / Ride the roots",
        "04 / Cross the timber",
        "05 / Clear the stream",
        "06 / Return to the ridge",
    ]
    hints = [
        "Feed in the throttle. Brake before the trail rises.",
        "Shift forward on the climb; release as the crest falls away.",
        "Stay loose over the root bed. Keep both tyres following the trail.",
        "A short rearward shift lifts the front; settle before the crossing.",
        "Commit to the timber launch. Aim for the clear landing beyond the stream.",
        "Brake, lift and settle through the granite terraces.",
    ]
    for section, name, hint in zip(c["sections"], names, hints):
        section.update(name=name, hint=hint)
    for m in c["modules"]:
        for f in [m["entry"], m["exit"]]:
            f["y"] = surface_height(c, f["x"])
    c["contentHash"] = course_identity(c)
    c["recipe"]["contractHash"] = digest(c["modules"])
    rng = stream(seed, "forestry-scenery")
    c["biomeProps"] = []
    for i in range(100):
        z = rng.uniform(-36, -5.5)
        scale = rng.uniform(0.65, 1.5)
        c["biomeProps"].append(
            {
                "prototype": "pine" if i < 75 else "granite",
                "position": [rng.uniform(-25, 140), -0.3, z],
                "scale": [scale, scale, scale],
                "yaw": rng.uniform(0, math.tau),
            }
        )
    for prototype, x, z in [
        ("cabin", 12, -11),
        ("fallen_log", 31, -5),
        ("stump", 38, -4.5),
        ("timber_frame", 57, -4.8),
        ("trail_marker", 49, -4.4),
        ("trail_marker", 78, -4.4),
    ]:
        c["biomeProps"].append(
            {"prototype": prototype, "position": [x, 0, z], "scale": [1, 1, 1], "yaw": 0}
        )
    validate_forest(c)
    return c


def validate_forest(course):
    validate_contracts(course)
    if course.get("biome") != "forestry" or course.get("generator") != VERSION:
        raise ValueError("forestry: wrong biome identity")
    if not isinstance(course.get("biomeProps"), list) or len(course["biomeProps"]) > 160:
        raise ValueError("forestry: scenery budget")
    for prop in course["biomeProps"]:
        if (
            set(prop) != {"prototype", "position", "scale", "yaw"}
            or prop["prototype"] not in json.loads(SPEC.read_text())["prototypes"]
        ):
            raise ValueError("forestry: invalid prop")
        for vector in [prop["position"], prop["scale"]]:
            if len(vector) != 3:
                raise ValueError("forestry: prop dimensions")
            for v in vector:
                number(v, "forestry.prop", -200, 200)
        if min(prop["scale"]) <= 0 or max(prop["scale"]) > 2:
            raise ValueError("forestry: prop scale")
        # Kit depth bounds: largest local extent is cabin/log, 2 m at unit scale.
        if prop["position"][2] + 2 * prop["scale"][2] > -2.4:
            raise ValueError("forestry: scenery corridor/sightline")
        number(prop["yaw"], "forestry.yaw", 0, math.tau)
    if course.get("surfaceZones") != [
        {"range": [22, 30], "material": "timber"},
        {"range": [53, 61], "material": "timber"},
        {"range": [83, 103], "material": "granite"},
    ]:
        raise ValueError("forestry: invalid surface contract")


def ambience(path, seed):
    rate = 22050
    rng = stream(seed, "forest-audio")
    values = array("h")
    filtered = 0
    for i in range(rate * 8):
        t = i / rate
        filtered = 0.97 * filtered + 0.03 * rng.uniform(-1, 1)
        wind = filtered * (0.55 + 0.15 * math.sin(math.tau * t / 8))
        birds = 0
        for start in [1.2, 3.8, 6.3]:
            u = t - start
            if 0 < u < 0.3:
                birds += (
                    0.045
                    * math.sin(math.pi * u / 0.3) ** 2
                    * math.sin(math.tau * (1900 * u + 900 * u * u))
                )
        fade = min(1, t / 0.06, (8 - t) / 0.06)
        values.append(int(max(-0.9, min(0.9, wind + birds)) * fade * 32767))
    if sys.byteorder != "little":
        values.byteswap()
    with wave.open(str(path), "wb") as w:
        w.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        w.writeframes(values.tobytes())


def build_forest(explicit=None, seed="forestry-01", force=False):
    from build import blender_path, PIN, glb_json

    spec = validate_biome(json.loads(SPEC.read_text()))
    blender = blender_path(explicit)
    version = subprocess.run(
        [blender, "--version"], capture_output=True, text=True, check=True
    ).stdout.splitlines()[0]
    if version != f"Blender {PIN} LTS":
        raise ValueError("forestry: pinned Blender 4.5.3 LTS required")
    runtime_paths = [
        "games/trials/simulation/game.js",
        "games/trials/simulation/rider-pose.js",
        "games/trials/rendering/camera.js",
        "lib/planck/1.4.2/planck.module.js",
        "lib/three/0.180.0/three.module.min.js",
        "games/trials/course-verifier.js",
    ]
    inputs = {
        "version": VERSION,
        "seed": seed,
        "spec": spec,
        "python": sys.version.split()[0],
        "blender": PIN,
        "runtimeHashes": {
            p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in runtime_paths
        },
        "sources": {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in [Path(__file__), Path(__file__).with_name("blender_forestry.py")]
        },
    }
    stage = SCRATCH / digest(inputs)
    stage.mkdir(parents=True, exist_ok=True)
    cached = (
        json.loads((stage / "build.json").read_text()) if (stage / "build.json").exists() else None
    )
    if (
        force
        or not (stage / "kit.glb").exists()
        or not (stage / "kit-report.json").exists()
        or (
            cached
            and hashlib.sha256((stage / "kit.glb").read_bytes()).hexdigest()
            != cached["files"]["kit.glb"]
        )
    ):
        subprocess.run(
            [
                blender,
                "--background",
                "--factory-startup",
                "--python-exit-code",
                "1",
                "--python",
                str(Path(__file__).with_name("blender_forestry.py")),
                "--",
                "--output",
                str(stage),
                "--spec",
                str(SPEC),
            ],
            check=True,
            timeout=180,
        )
    document = glb_json(stage / "kit.glb")
    kit_report = json.loads((stage / "kit-report.json").read_text())
    if any(
        max(abs(p["runtimeBounds"]["min"][2]), abs(p["runtimeBounds"]["max"][2])) > 2
        for p in kit_report["prototypes"].values()
    ):
        raise ValueError("forestry: generated prototype exceeds reserved depth bound")
    if not set(spec["prototypes"]) <= {n.get("name") for n in document["nodes"]}:
        raise ValueError("forestry: missing named kit prototype")
    if (stage / "kit.glb").stat().st_size > spec["budgets"]["kitBytes"]:
        raise ValueError("forestry: kit exceeds budget")
    ambience(stage / "ambience.wav", seed)
    (stage / "biome.json").write_bytes(canonical(spec))
    bike = json.loads((ROOT / "games/trials/content/bike.json").read_text())
    routes = []
    started = time.monotonic()
    for id, name, _, difficulty, _ in ROUTES:
        attempts = []
        for repair in range(3):
            course = compose_forest(f"{seed}:{id}", id, repair)
            remaining = 120 - (time.monotonic() - started)
            report = (
                invoke_verifier(
                    {"protocol": 1, "bike": bike, "course": course},
                    timeout=min(31, max(1, remaining)),
                )
                if remaining > 0
                else {"status": "not-validated", "reason": "forestry-bank-time-budget"}
            )
            attempts.append(
                {
                    "repair": repair,
                    "status": report["status"],
                    "reason": report.get("reason"),
                    "rate": report.get("successRate"),
                    "usage": report.get("usage"),
                }
            )
            if report["status"] == "validated-for-review":
                break
        directory = stage / id
        directory.mkdir(exist_ok=True)
        replay = report.get("witness", {}).pop("inputs", [])
        report["attempts"] = attempts
        for file, value in [
            ("course.json", course),
            ("report.json", report),
            ("replay.json", replay),
        ]:
            (directory / file).write_bytes(canonical(value))
        (directory / "sheet.svg").write_text(sheet(course, report), encoding="utf-8")
        routes.append(
            {
                "id": id,
                "name": name,
                "difficulty": difficulty,
                "contentHash": course["contentHash"],
                "status": report["status"],
                "successRate": report.get("successRate"),
                "source": str((directory / "course.json").relative_to(ROOT)).replace("\\", "/"),
            }
        )
    files = {
        n: hashlib.sha256((stage / n).read_bytes()).hexdigest()
        for n in ["kit.glb", "biome.json", "ambience.wav"]
    }
    result = {
        "schemaVersion": 1,
        "inputs": inputs,
        "stage": str(stage),
        "files": files,
        "routes": routes,
        "approval": "pending-human-review",
        "fallback": "quarry-works-v2",
    }
    (stage / "build.json").write_bytes(canonical(result))
    SCRATCH.mkdir(exist_ok=True)
    pending = SCRATCH / "current.pending"
    pending.write_bytes(canonical({"stage": str(stage.relative_to(ROOT)).replace("\\", "/")}))
    os.replace(pending, SCRATCH / "current.json")
    return result


def freeze_forest():
    pointer = json.loads((SCRATCH / "current.json").read_text())
    source = ROOT / pointer["stage"]
    result = json.loads((source / "build.json").read_text())
    destination = ROOT / "scripts/trials/curation/forestry"
    destination.mkdir(parents=True, exist_ok=True)
    for name in [*result["files"], "kit-report.json"]:
        shutil.copyfile(source / name, destination / name)
    for route in result["routes"]:
        target = destination / route["id"]
        target.mkdir(exist_ok=True)
        for name in ["course.json", "report.json", "replay.json", "sheet.svg"]:
            shutil.copyfile(source / route["id"] / name, target / name)
        route["source"] = str((target / "course.json").relative_to(ROOT)).replace("\\", "/")
    result["stage"] = str(destination.relative_to(ROOT)).replace("\\", "/")
    (destination / "build.json").write_bytes(canonical(result))
    return result
