"""Explicit offline content build. Downloads nothing; runtime export needs no Blender."""

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import struct
import subprocess
import sys
from audio import generate as generate_audio, validate_audio
from content import (
    VERSION,
    bike_dimensions,
    SPEC_DIR,
    canonical,
    digest,
    make_course,
    specs,
    validate_course,
    course_identity,
)

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "games/trials/content"
SCRATCH = ROOT / ".trials-build"
PIN = "4.5.3"


def blender_path(explicit=None):
    candidates = [
        explicit,
        os.environ.get("BLENDER_PATH"),
        shutil.which("blender"),
        ROOT / f".tools/blender-{PIN}-windows-x64/blender.exe",
    ]
    for directory in [
        Path("C:/Program Files/Blender Foundation"),
        Path.home() / "AppData/Local/Programs/Blender Foundation",
    ]:
        if directory.exists():
            candidates.extend(directory.glob("Blender */blender.exe"))
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(Path(candidate).resolve())
    raise RuntimeError(
        f"Blender {PIN} required for assets. Set BLENDER_PATH or pass --blender. Course generation and checked-in content validation do not need Blender."
    )


def glb_json(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data)
    if magic != b"glTF" or version != 2 or length != len(data):
        raise ValueError(f"{path.name}: malformed GLB header")
    size, kind = struct.unpack_from("<II", data, 12)
    if kind != 0x4E4F534A:
        raise ValueError(f"{path.name}: missing JSON chunk")
    document = json.loads(data[20 : 20 + size])
    binary_size = 0
    cursor = 20 + size
    while cursor < len(data):
        chunk_size, chunk_type = struct.unpack_from("<II", data, cursor)
        if chunk_type == 0x004E4942:
            binary_size = chunk_size
        cursor += 8 + chunk_size
    if cursor != len(data):
        raise ValueError(f"{path.name}: invalid chunk lengths")
    for view in document.get("bufferViews", []):
        if view.get("byteOffset", 0) + view["byteLength"] > binary_size:
            raise ValueError(f"{path.name}: buffer view exceeds binary chunk")
    for entry in document.get("images", []) + document.get("buffers", []):
        if entry.get("uri") and not entry["uri"].startswith("data:"):
            raise ValueError(f"{path.name}: unexpected external dependency")
    return document


def cached_assets_valid(directory):
    """Interrupted or edited caches are rebuilt, never treated as approved content."""
    try:
        report = json.loads((directory / "build-complete.json").read_text())
        return bool(report["files"]) and all(
            (directory / name).resolve().is_relative_to(directory.resolve())
            and hashlib.sha256((directory / name).read_bytes()).hexdigest() == expected
            for name, expected in report["files"].items()
        )
    except (OSError, ValueError, KeyError):
        return False


def validate(directory=PUBLIC):
    manifest = json.loads((directory / "manifest.json").read_text())
    if manifest.get("schemaVersion") != 1:
        raise ValueError("manifest: unsupported schema")
    references = [
        manifest["bike"],
        manifest["rider"],
        manifest["course"],
        *(manifest.get("assets") or {}).values(),
        *(manifest.get("sounds") or {}).values(),
    ]
    if any(name not in manifest["files"] for name in references):
        raise ValueError("manifest: unhashed runtime resource")
    for name, expected in manifest["files"].items():
        path = (directory / name).resolve()
        if not path.is_relative_to(directory.resolve()) or not path.is_file():
            raise ValueError(f"manifest: missing/outside resource {name}")
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"manifest: stale hash {name}")
    for name in (manifest.get("sounds") or {}).values():
        validate_audio(directory / name)
    course = json.loads((directory / manifest["course"]).read_text())
    validate_course(course)
    if course_identity(course) != course["contentHash"]:
        raise ValueError("course: content identity mismatch")
    if manifest.get("assets"):
        bike = glb_json(directory / manifest["assets"]["bike"])
        rider = glb_json(directory / manifest["assets"]["rider"])
        names = {n.get("name") for n in bike["nodes"]}
        required = {"chassis", "frontWheel", "rearWheel", "forkSlider", "swingarm", "shock"}
        if not required <= names:
            raise ValueError(f"bike: missing pivots {required-names}")
        if not rider.get("skins"):
            raise ValueError("rider: missing skinning")
        rig = json.loads((directory / manifest["assets"]["rig"]).read_text())
        if not {b["name"] for b in rig["bones"]} <= {n.get("name") for n in rider["nodes"]}:
            raise ValueError("rider: rig names do not match export")
    pointer = directory / "current.json"
    if pointer.exists():
        name = json.loads(pointer.read_text())["release"]
        if not re.fullmatch(r"releases/[a-f0-9]{64}/manifest.json", name):
            raise ValueError("current: invalid release path")
        approved = validate((directory / name).parent)
        if approved["contentId"] != manifest["contentId"]:
            raise ValueError("current: release/manifest identity mismatch")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=[
            "courses",
            "assets",
            "all",
            "validate",
            "review",
            "review-validate",
            "release",
            "release-stage",
            "release-validate",
            "biome",
            "biome-freeze",
        ],
    )
    parser.add_argument("--seed", default="quarry-01")
    parser.add_argument("--blender")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--specs", type=Path, default=SPEC_DIR)
    parser.add_argument(
        "--site-root",
        type=Path,
        default=ROOT,
        help="For validate: source checkout or exported dist directory",
    )
    parser.add_argument("--max-repairs", type=int, default=2)
    parser.add_argument("--review-dir", type=Path)
    args = parser.parse_args()
    if args.command in ["biome", "biome-freeze"]:
        from forestry import build_forest, freeze_forest

        print(
            json.dumps(
                freeze_forest()
                if args.command == "biome-freeze"
                else build_forest(
                    args.blender,
                    "forestry-01" if args.seed == "quarry-01" else args.seed,
                    force=args.force,
                )
            )
        )
        return
    if args.command in ["release", "release-stage", "release-validate"]:
        from release import build_release, validate_current

        result = (
            {"valid": True, "catalog": validate_current(args.site_root)["id"]}
            if args.command == "release-validate"
            else build_release(args.command == "release-stage")
        )
        print(json.dumps(result))
        return
    if args.command in ["review", "review-validate"]:
        from bank import build_review, validate_review, REVIEW

        if args.command == "review":
            print(json.dumps(build_review(args.seed, args.max_repairs)))
        else:
            directory = args.review_dir
            if directory is None:
                pointer = json.loads((REVIEW / "current.json").read_text())["bank"]
                if not re.fullmatch(r"[a-f0-9]{64}/bank.json", pointer):
                    raise ValueError("review: invalid pointer")
                directory = (REVIEW / pointer).parent
            print(json.dumps({"valid": True, "approval": validate_review(directory)["approval"]}))
        return
    if args.command == "validate":
        print(
            json.dumps(
                {
                    "valid": True,
                    "manifest": validate(args.site_root / "games/trials/content")["contentId"],
                }
            )
        )
        return
    bike, rider = specs(args.specs)
    bike = bike_dimensions(bike, rider)
    SCRATCH.mkdir(exist_ok=True)
    source_hash = digest(
        {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(Path(__file__).parent.glob("*.py"))
        }
    )
    identity = digest(
        {
            "generator": VERSION,
            "sources": source_hash,
            "bike": bike,
            "rider": rider,
            "seed": args.seed,
            "blender": PIN,
            "python": sys.version.split()[0],
        }
    )
    stage = SCRATCH / identity
    stage.mkdir(exist_ok=True)
    (stage / "bike.json").write_bytes(canonical(bike))
    (stage / "rider.json").write_bytes(canonical(rider))
    (stage / "course.json").write_bytes(canonical(make_course(args.seed)))
    assets = None
    if args.command in ["assets", "all"]:
        blender = blender_path(args.blender)
        version = subprocess.run(
            [blender, "--version"], capture_output=True, text=True, check=True
        ).stdout.splitlines()[0]
        if version != f"Blender {PIN} LTS":
            raise RuntimeError(f"Expected Blender {PIN} LTS, found {version}")
        asset_dir = stage / "assets"
        if args.force or not cached_assets_valid(asset_dir):
            subprocess.run(
                [
                    blender,
                    "--background",
                    "--factory-startup",
                    "--python-exit-code",
                    "1",
                    "--python",
                    str(Path(__file__).with_name("blender_assets.py")),
                    "--",
                    "--output",
                    str(asset_dir),
                    "--specs",
                    str(args.specs.resolve()),
                ],
                check=True,
                timeout=600,
            )
        assets = {
            name: f"assets/{file}"
            for name, file in [("bike", "bike.glb"), ("rider", "rider.glb"), ("rig", "rig.json")]
        }
    elif PUBLIC.exists() and (PUBLIC / "manifest.json").exists():
        previous = validate()
        if previous.get("assets"):
            if (PUBLIC / "bike.json").read_bytes() != canonical(bike) or (
                PUBLIC / "rider.json"
            ).read_bytes() != canonical(rider):
                raise ValueError("Changed asset specifications require an assets/all rebuild")
            shutil.copytree(PUBLIC / "assets", stage / "assets", dirs_exist_ok=True)
            assets = previous["assets"]
    sounds = generate_audio(stage / "audio")
    public_files = (
        ["bike.json", "rider.json", "course.json"]
        + list((assets or {}).values())
        + list(sounds.values())
    )
    file_hashes = {
        file: hashlib.sha256((stage / file).read_bytes()).hexdigest() for file in public_files
    }
    published_id = digest({"inputs": identity, "files": file_hashes})
    manifest = {
        "schemaVersion": 1,
        "generator": VERSION,
        "contentId": published_id,
        "inputHash": identity,
        "sourceHash": source_hash,
        "specHashes": {"bike": digest(bike), "rider": digest(rider)},
        "seed": args.seed,
        "bike": "bike.json",
        "rider": "rider.json",
        "course": "course.json",
        "assets": assets,
        "sounds": sounds,
        "tools": {"python": sys.version.split()[0], "blender": PIN if assets else None},
        "files": file_hashes,
    }
    (stage / "manifest.json").write_bytes(canonical(manifest))
    validate(stage)
    # Content-addressed release directories allow atomic pointer publication. A failed
    # copy leaves the currently referenced release intact, even during a rebuild.
    release = PUBLIC / "releases" / published_id
    release.mkdir(parents=True, exist_ok=True)
    for file in public_files:
        destination = release / file
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(stage / file, destination)
    shutil.copy2(stage / "manifest.json", release / "manifest.json")
    validate(release)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    # Compatibility/current files support CLI defaults; the browser uses the release pointer.
    for file in public_files:
        destination = PUBLIC / file
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(stage / file, destination)
    pending = PUBLIC / "manifest.pending"
    pending.write_bytes(canonical(manifest))
    os.replace(pending, PUBLIC / "manifest.json")
    pointer = PUBLIC / "current.pending"
    pointer.write_bytes(canonical({"release": f"releases/{published_id}/manifest.json"}))
    os.replace(pointer, PUBLIC / "current.json")
    print(json.dumps({"published": published_id, "assets": bool(assets), "stage": str(stage)}))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, subprocess.SubprocessError) as error:
        raise SystemExit(str(error))
