"""Constrained quarry recipes and pacing contracts; no physics approximation."""

import copy
import math
from content import (
    canonical,
    digest,
    make_course,
    number,
    stream,
    surface_height,
    validate_course,
    course_identity,
)

VERSION = "quarry-composer-1"
PROFILES = {
    "apprentice": {
        "name": "Apprentice line",
        "difficulty": "beginner",
        "crest": 0.8,
        "rollers": 0.8,
        "step": 0.72,
        "gap": 2.8,
        "climb": 0.65,
    },
    "cutstone": {
        "name": "Cutstone rhythm",
        "difficulty": "beginner",
        "crest": 1.0,
        "rollers": 1.0,
        "step": 0.88,
        "gap": 3.1,
        "climb": 0.8,
    },
    "highbench": {
        "name": "High bench",
        "difficulty": "intermediate",
        "crest": 1.1,
        "rollers": 1.08,
        "step": 1.0,
        "gap": 3.4,
        "climb": 0.96,
    },
}
FIELDS = {"name", "difficulty", "crest", "rollers", "step", "gap", "climb"}
RANGES = {
    "crest": (0.6, 1.2),
    "rollers": (0.6, 1.15),
    "step": (0.6, 1.0),
    "gap": (2.5, 3.6),
    "climb": (0.5, 1.0),
}
PACER = [
    ("teach", "flat"),
    ("rehearse", "crest"),
    ("vary", "rollers"),
    ("rehearse", "step"),
    ("commit-and-recover", "jump"),
    ("climax", "finish"),
]
SKILLS = {
    "flat": ["throttle", "brake"],
    "crest": ["weight-transfer"],
    "rollers": ["suspension", "traction"],
    "step": ["front-lift"],
    "jump": ["speed", "air-control", "landing"],
    "finish": ["brake", "lift", "settle"],
}


def validate_profile(profile):
    if not isinstance(profile, dict) or set(profile) != FIELDS:
        raise ValueError("profile: missing/unknown fields")
    if (
        profile["difficulty"] not in ["beginner", "intermediate"]
        or not isinstance(profile["name"], str)
        or not profile["name"]
    ):
        raise ValueError("profile: invalid name/difficulty")
    for key, bounds in RANGES.items():
        number(profile[key], f"profile.{key}", *bounds)


def compose(seed, profile_id, repair=0):
    if profile_id not in PROFILES:
        raise ValueError("profile: unknown quarry recipe")
    if isinstance(repair, bool) or repair not in [0, 1, 2]:
        raise ValueError("repair: expected 0..2")
    profile = copy.deepcopy(PROFILES[profile_id])
    validate_profile(profile)
    profile["climb"] *= 1 - 0.05 * repair
    profile["gap"] = max(2.5, profile["gap"] - 0.1 * repair)
    # Pacing is authored first. Only dimensions within each skill contract vary.
    course = make_course(seed)
    variation = stream(seed, "module-dimensions")
    amplitude = profile["rollers"] * (1 + variation.uniform(-0.02, 0.02))
    for path in course["paths"]:
        for point in path:
            x, y = point
            if 8 < x <= 20:
                point[1] *= profile["crest"]
            elif 22 < x <= 30:
                point[1] *= amplitude
            elif 38 <= x <= 41:
                point[1] *= profile["step"]
            elif x >= 83:
                point[1] *= profile["climb"]
    course["paths"][1][0][0] = 61 + profile["gap"]
    course["jump"]["landing"][0] = 61 + profile["gap"]
    course["finishY"] *= profile["climb"]
    course.update(
        id=f"quarry-review-{profile_id}-1",
        name=profile["name"],
        generator=VERSION,
        difficulty=profile["difficulty"],
    )
    course["rollerAmplitude"] *= amplitude
    course["modules"] = []
    for (role, kind), section in zip(PACER, course["sections"]):
        start, end = section["start"], section["end"]
        course["modules"].append(
            {
                "id": kind,
                "role": role,
                "skills": SKILLS[kind],
                "entry": {"x": start, "y": surface_height(course, start), "angle": 0},
                "exit": {"x": end, "y": surface_height(course, end), "angle": 0},
                "speedEnvelope": [-0.25 if kind == "flat" else 0, 13.5],
                "angleEnvelope": [-0.8, 1.3],
                "clearance": {"halfWidth": 1.4, "height": 2.4},
                "collisionPolicy": "shared-contiguous-chain",
                "recovery": [72, 78] if kind == "jump" else None,
                "gap": [61, 61 + profile["gap"]] if kind == "jump" else None,
                "camera": (
                    {"mustSee": [course["jump"]["takeoff"], course["jump"]["landing"]]}
                    if kind == "jump"
                    else None
                ),
            }
        )
    course["contentHash"] = course_identity(course)
    course["recipe"] = {
        "profile": profile_id,
        "parameters": profile,
        "dimensionSeed": str(seed),
        "contractHash": digest(course["modules"]),
    }
    validate_contracts(course)
    return course


def validate_contracts(course):
    validate_course(course)
    modules = course.get("modules")
    if (
        not isinstance(modules, list)
        or len(modules) != 6
        or [m["role"] for m in modules] != [r for r, _ in PACER]
    ):
        raise ValueError("modules: invalid teaching/recovery pacing")
    if len({m["id"] for m in modules}) != len(modules):
        raise ValueError("modules: duplicate IDs")
    for i, module in enumerate(modules):
        expected = {
            "id",
            "role",
            "skills",
            "entry",
            "exit",
            "speedEnvelope",
            "angleEnvelope",
            "clearance",
            "collisionPolicy",
            "recovery",
            "gap",
            "camera",
        }
        if set(module) != expected:
            raise ValueError("module: unknown/missing contract fields")
        if (
            module["id"] != PACER[i][1]
            or module["skills"] != SKILLS[module["id"]]
            or module["collisionPolicy"] != "shared-contiguous-chain"
        ):
            raise ValueError("module: invalid obstacle/skill/collision contract")
        start, end = module["entry"], module["exit"]
        for frame in [start, end]:
            if set(frame) != {"x", "y", "angle"}:
                raise ValueError("module: invalid entry/exit frame")
            if abs(frame["angle"]) > 1e-8:
                raise ValueError("module: seam frame must be level")
            for key, value in frame.items():
                number(value, f"module.frame.{key}", -200, 200)
        if module["speedEnvelope"] != (
            [-0.25, 13.5] if module["id"] == "flat" else [0, 13.5]
        ) or module["angleEnvelope"] != [-0.8, 1.3]:
            raise ValueError("module: invalid approach envelope")
        if start["x"] >= end["x"]:
            raise ValueError("module: reversed entry/exit")
        for frame in [start, end]:
            if (
                surface_height(course, frame["x"]) is None
                or abs(surface_height(course, frame["x"]) - frame["y"]) > 1e-8
            ):
                raise ValueError("module: visual/collision frame mismatch")
        if i and modules[i - 1]["exit"] != start:
            raise ValueError("module: disconnected seam")
        if module["clearance"] != {"halfWidth": 1.4, "height": 2.4}:
            raise ValueError("module: corridor contract changed")
        if module["gap"]:
            a, b = module["gap"]
            if surface_height(course, (a + b) / 2) is not None:
                raise ValueError("module: gap is not empty")
            if b - a > 3.6 or b <= a:
                raise ValueError("module: gap outside envelope")
            if module["camera"]["mustSee"] != [
                course["jump"]["takeoff"],
                course["jump"]["landing"],
            ]:
                raise ValueError("module: stale sightline anchors")
    for path in course["paths"]:
        for a, b in zip(path, path[1:]):
            if b[0] > a[0] and abs((b[1] - a[1]) / (b[0] - a[0])) > 0.65:
                raise ValueError("module: grade outside recipe envelope")
            if a[0] == b[0] and abs(a[1] - b[1]) > 0.36:
                raise ValueError("module: step exceeds physical recipe bound")
    if course_identity(course) != course["contentHash"]:
        raise ValueError("course: stale collision identity")
