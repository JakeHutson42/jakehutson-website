"""Freeze explicitly human-approved courses; stage unseen routes separately."""

import hashlib
import json
import math
import os
from pathlib import Path
import re
from content import canonical, digest, validate_course, course_identity
from modules import validate_contracts
from bank import validate_review

ROOT = Path(__file__).resolve().parents[2]
SPEC = ROOT / "scripts/trials/specs/release.json"
APPROVALS = ROOT / "scripts/trials/specs/approvals.json"
PUBLIC = ROOT / "games/trials/courses"
LOCAL = ROOT / ".trials-build/release"
PHYSICS = "qt-physics-3"


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def safe_path(base, name):
    if not isinstance(name, str) or not re.fullmatch(r"[a-zA-Z0-9/._-]+", name):
        raise ValueError("release: invalid resource path")
    path = (base / name).resolve()
    if not path.is_relative_to(base.resolve()) or ".." in name:
        raise ValueError("release: resource outside staging")
    return path


def validate_release(directory, site_root=ROOT, allow_pending=False):
    directory = Path(directory)
    catalog = json.loads((directory / "catalog.json").read_text(encoding="utf-8"))
    manifest = json.loads((site_root / "games/trials/content/manifest.json").read_text())
    if (
        catalog.get("schemaVersion") != 1
        or catalog.get("physics") != PHYSICS
        or catalog.get("assetContentId") != manifest["contentId"]
    ):
        raise ValueError("release: stale physics/assets")
    if (
        not re.fullmatch(r"[a-f0-9]{64}", catalog.get("id", ""))
        or not 1 <= len(catalog.get("courses", [])) <= 12
    ):
        raise ValueError("release: invalid catalogue")
    identity = dict(catalog)
    identity.pop("id")
    if digest(identity) != catalog["id"]:
        raise ValueError("release: stale catalogue identity")
    for name, expected in catalog["files"].items():
        if file_hash(safe_path(directory, name)) != expected:
            raise ValueError("release: corrupt resource " + name)
    ids, hashes = set(), set()
    approvals = json.loads(APPROVALS.read_text(encoding="utf-8"))["courses"]
    for entry in catalog["courses"]:
        if (
            not re.fullmatch(r"[a-z][a-z0-9-]{0,39}", entry.get("id", ""))
            or entry.get("difficulty") not in ["beginner", "intermediate"]
            or entry.get("kind") not in ["curated", "generated"]
            or entry.get("approval") not in ["approved", "pending"]
        ):
            raise ValueError("release: invalid course metadata")
        for name in ["gold", "silver", "bronze"]:
            medal = entry.get("medals", {}).get(name, {})
            if (
                set(medal) != {"time", "faults"}
                or isinstance(medal.get("faults"), bool)
                or not isinstance(medal.get("faults"), int)
                or medal["faults"] < 0
                or isinstance(medal.get("time"), bool)
                or not isinstance(medal.get("time"), (int, float))
                or not math.isfinite(medal["time"])
                or not 0 < medal["time"] <= 180
            ):
                raise ValueError("release: invalid medal target")
        for a, b in [("gold", "silver"), ("silver", "bronze")]:
            if any(entry["medals"][a][key] > entry["medals"][b][key] for key in ["faults", "time"]):
                raise ValueError("release: unordered medals")
        if entry["id"] in ids or entry["contentHash"] in hashes:
            raise ValueError("release: duplicate course identity")
        ids.add(entry["id"])
        hashes.add(entry["contentHash"])
        if entry["approval"] != "approved" and not allow_pending:
            raise ValueError("release: unapproved course")
        if entry["approval"] == "approved" and (
            (entry.get("evidence") or {}).get("contentHash") != entry["contentHash"]
            or not entry["evidence"].get("quote")
        ):
            raise ValueError("release: missing human evidence")
        if entry["approval"] == "approved" and entry["evidence"]["quote"] != approvals.get(
            entry["contentHash"], {}
        ).get("quote"):
            raise ValueError("release: evidence does not match human approval ledger")
        for name in [entry["course"], entry["thumbnail"], entry.get("replay")]:
            if name and name not in catalog["files"]:
                raise ValueError("release: unhashed resource")
        course = json.loads(safe_path(directory, entry["course"]).read_text())
        validate_course(course)
        if (
            course_identity(course) != entry["contentHash"]
            or course["contentHash"] != entry["contentHash"]
        ):
            raise ValueError("release: stale course identity")
        if entry.get("biome") == "forestry":
            from forestry import validate_forest

            validate_forest(course)
            if "forestry" not in catalog.get("biomes", {}):
                raise ValueError("release: missing biome assets")
        elif course.get("modules"):
            validate_contracts(course)
        image = safe_path(directory, entry["thumbnail"]).read_bytes()
        if not (
            allow_pending and entry["approval"] == "pending" and entry["thumbnail"].endswith(".svg")
        ) and (
            not (image.startswith(b"\xff\xd8\xff") or image.startswith(b"\x89PNG\r\n\x1a\n"))
            or len(image) > 300_000
        ):
            raise ValueError("release: actual compact browser thumbnail required")
    if catalog["default"] not in ids:
        raise ValueError("release: missing fallback")
    for id, biome in catalog.get("biomes", {}).items():
        if id not in ["quarry", "forestry"] or biome.get("id") != id:
            raise ValueError("release: invalid biome identity")
        if id == "forestry":
            from forestry import validate_biome
            from build import glb_json

            for key in ["spec", "kit", "ambience"]:
                if biome[key] not in catalog["files"]:
                    raise ValueError("release: unhashed biome asset")
            spec = validate_biome(json.loads(safe_path(directory, biome["spec"]).read_text()))
            doc = glb_json(safe_path(directory, biome["kit"]))
            if not set(spec["prototypes"]) <= {n.get("name") for n in doc["nodes"]}:
                raise ValueError("release: incomplete biome kit")
            import wave, struct

            with wave.open(str(safe_path(directory, biome["ambience"])), "rb") as sound:
                if (sound.getnchannels(), sound.getsampwidth(), sound.getframerate()) != (
                    1,
                    2,
                    22050,
                ) or not 22050 <= sound.getnframes() <= 22050 * 12:
                    raise ValueError("release: invalid biome audio")
                data = sound.readframes(sound.getnframes())
                samples = struct.unpack("<" + str(len(data) // 2) + "h", data)
                if max(abs(v) for v in samples) >= 32767 or abs(samples[0] - samples[-1]) > 100:
                    raise ValueError("release: clipped/unseamed ambience")
    if sum(safe_path(directory, n).stat().st_size for n in catalog["files"]) > 4_000_000:
        raise ValueError("release: course bank resource budget exceeded")
    return catalog


def build_release(review=False):
    specification = json.loads(SPEC.read_text(encoding="utf-8"))
    approvals = json.loads(APPROVALS.read_text(encoding="utf-8"))
    if specification["physics"] != PHYSICS or approvals["physics"] != PHYSICS:
        raise ValueError("release: handling approval does not match")
    assets = json.loads((ROOT / "games/trials/content/manifest.json").read_text())
    output = LOCAL if review else PUBLIC
    stage = ROOT / ".trials-build/release-work"
    stage.mkdir(parents=True, exist_ok=True)
    courses, files = [], {}
    biomes = {"quarry": {"id": "quarry", "name": "Industrial Quarry"}}
    entries = list(specification["courses"])
    forest_frozen = ROOT / "scripts/trials/curation/forestry/build.json"
    forest_available = (
        forest_frozen.exists() or (ROOT / ".trials-build/forestry/current.json").exists()
    )
    forest_preview = json.loads(forest_frozen.read_text()) if forest_frozen.exists() else None
    eligible = bool(
        forest_preview
        and any(r["contentHash"] in approvals["courses"] for r in forest_preview["routes"])
    )
    if forest_available and (review or eligible):
        forest_stage = (
            forest_frozen.parent
            if forest_frozen.exists()
            else safe_path(
                ROOT,
                json.loads((ROOT / ".trials-build/forestry/current.json").read_text())["stage"],
            )
        )
        forest = json.loads((forest_stage / "build.json").read_text())
        for name, expected in forest["files"].items():
            if file_hash(forest_stage / name) != expected:
                raise ValueError("release: stale forestry asset")
            target = stage / "biomes/forestry" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((forest_stage / name).read_bytes())
            files["biomes/forestry/" + name] = expected
        for name, expected in forest["inputs"]["runtimeHashes"].items():
            if file_hash(ROOT / name) != expected:
                raise ValueError("release: stale forestry verifier/physics")
        biomes["forestry"] = {
            "id": "forestry",
            "name": "Alpine Forestry",
            "spec": "biomes/forestry/biome.json",
            "kit": "biomes/forestry/kit.glb",
            "ambience": "biomes/forestry/ambience.wav",
        }
        for route in forest["routes"]:
            if route["status"] != "validated-for-review":
                continue
            frozen_thumb = forest_stage / route["id"] / "thumbnail.jpg"
            thumb = (
                frozen_thumb
                if frozen_thumb.exists()
                else ROOT / f".trials-build/thumbnails/{route['id']}.jpg"
            )
            entries.append(
                {
                    **route,
                    "biome": "forestry",
                    "kind": "generated",
                    "description": "A taught forestry trail through roots, timber crossings and granite terraces. Development route; tuning follows human review.",
                    "skills": ["trail balance", "timber crossing", "rock terraces"],
                    "medals": {
                        "gold": {"time": 25, "faults": 0},
                        "silver": {"time": 45, "faults": 2},
                        "bronze": {"time": 90, "faults": 8},
                    },
                    "thumbnail": str(
                        (
                            thumb
                            if thumb.exists()
                            else safe_path(ROOT, route["source"]).with_name("sheet.svg")
                        ).relative_to(ROOT)
                    ).replace("\\", "/"),
                    "forestryProof": True,
                }
            )
    for entry in entries:
        evidence = approvals["courses"].get(entry["contentHash"])
        if not evidence and not review:
            continue
        source = safe_path(ROOT, entry["source"])
        if entry.get("forestryProof"):
            report = json.loads(source.with_name("report.json").read_text())
            threshold = 1 if entry["difficulty"] == "beginner" else 0.8
            if (
                report.get("physics") != PHYSICS
                or report.get("status") != "validated-for-review"
                or report.get("successRate", 0) < threshold
            ):
                raise ValueError("release: forestry witness insufficient")
        if entry.get("bank"):
            bank = validate_review(safe_path(ROOT, entry["bank"]))
            candidate = next(
                c for c in bank["candidates"] if c["contentHash"] == entry["contentHash"]
            )
            if candidate["status"] != "validated-for-review":
                raise ValueError("release: failed candidate cannot be promoted")
            report = json.loads((source.parent / "report.json").read_text())
            threshold = 1 if entry["difficulty"] == "beginner" else 0.8
            if report.get("successRate", 0) < threshold:
                raise ValueError("release: insufficient robustness")
        course = json.loads(source.read_text())
        if course_identity(course) != entry["contentHash"]:
            raise ValueError("release: approved geometry has changed")
        public_entry = {
            k: entry[k]
            for k in [
                "id",
                "name",
                "description",
                "difficulty",
                "skills",
                "kind",
                "contentHash",
                "medals",
            ]
        }
        public_entry.update(
            biome=entry.get("biome", "quarry"),
            approval="approved" if evidence else "pending",
            evidence={**evidence, "contentHash": entry["contentHash"]} if evidence else None,
        )
        for field, path in [
            ("course", source),
            ("thumbnail", safe_path(ROOT, entry["thumbnail"])),
            (
                "replay",
                (
                    source.parent / "replay.json"
                    if entry.get("bank") or entry.get("forestryProof")
                    else None
                ),
            ),
        ]:
            if path is None:
                continue
            extension = path.suffix if field == "thumbnail" else ".json"
            name = f"{entry['id']}/{field}{extension}"
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(path.read_bytes())
            files[name] = file_hash(target)
            public_entry[field] = name
        courses.append(public_entry)
    catalog = {
        "schemaVersion": 1,
        "physics": PHYSICS,
        "bike": "qt-250-works-v3",
        "assetContentId": assets["contentId"],
        "default": "works",
        "courses": courses,
        "biomes": biomes,
        "files": files,
        "medalStatus": "provisional-human-timing-review-pending",
        "review": review,
    }
    catalog["id"] = digest(catalog)
    (stage / "catalog.json").write_bytes(canonical(catalog))
    validate_release(stage, allow_pending=review)
    destination = output / "releases" / catalog["id"]
    destination.mkdir(parents=True, exist_ok=True)
    for name in [*files, "catalog.json"]:
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((stage / name).read_bytes())
    validate_release(destination, allow_pending=review)
    pending = output / "current.pending"
    pending.write_bytes(
        canonical(
            {
                "catalog": f"releases/{catalog['id']}/catalog.json",
                "sha256": file_hash(destination / "catalog.json"),
            }
        )
    )
    os.replace(pending, output / "current.json")
    return {
        "catalog": catalog["id"],
        "courses": len(courses),
        "pending": sum(c["approval"] != "approved" for c in courses),
        "review": review,
        "url": "http://127.0.0.1:8765/trials.html" + ("?qa=release" if review else ""),
    }


def validate_current(site_root=ROOT):
    root = site_root / "games/trials/courses"
    pointer = json.loads((root / "current.json").read_text())
    if not re.fullmatch(r"releases/[a-f0-9]{64}/catalog.json", pointer["catalog"]):
        raise ValueError("release: invalid pointer")
    path = safe_path(root, pointer["catalog"])
    if file_hash(path) != pointer["sha256"]:
        raise ValueError("release: stale pointer checksum")
    return validate_release(path.parent, site_root)
