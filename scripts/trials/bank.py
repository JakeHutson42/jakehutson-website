"""Offline review bank: compose, verify, diagnose, stage. Never approves or deploys."""

import hashlib
import html
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from content import canonical, digest
from modules import compose, validate_contracts, PROFILES, VERSION

ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / ".trials-build/review"
PUBLIC = ROOT / "games/trials/content"


def invoke_verifier(request, node="node", timeout=31):
    try:
        result = subprocess.run(
            [node, "--max-old-space-size=192", str(ROOT / "scripts/trials/verify.mjs")],
            input=canonical(request),
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"protocol": 1, "status": "not-validated", "reason": "verifier-process-timeout"}
    if result.returncode:
        return {
            "protocol": 1,
            "status": "not-validated",
            "reason": "verifier-process-failed",
            "diagnostic": (result.stderr + result.stdout).decode(errors="replace")[-1200:],
        }
    if len(result.stdout) > 8_000_000:
        raise ValueError("verifier: output exceeds budget")
    report = json.loads(result.stdout)
    if report.get("protocol") != 1 or report.get("status") not in [
        "validated-for-review",
        "not-validated",
    ]:
        raise ValueError("verifier: invalid response protocol/status")
    return report


def sheet(course, report):
    def xy(x, y):
        return f"{30+(x+12)*7:.2f},{210-y*38:.2f}"

    terrain = "".join(
        f'<polyline points="{" ".join(xy(x,y) for x,y in path)}" fill="none" stroke="#233e36" stroke-width="3"/>'
        for path in course["paths"]
    )
    trajectory = " ".join(xy(s["x"], s["y"]) for s in report.get("witness", {}).get("samples", []))
    checkpoints = "".join(
        f'<circle cx="{30+(p["x"]+12)*7}" cy="{210-p["y"]*38}" r="4" fill="#d59629"/>'
        for p in course["checkpoints"]
    )
    labels = "".join(
        f'<text x="{30+(m["entry"]["x"]+12)*7}" y="265" font-size="10">{html.escape(m["id"])}</text>'
        for m in course["modules"]
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="310" viewBox="0 0 1100 310"><rect width="1100" height="310" fill="#ece9dd"/><g font-family="sans-serif" fill="#233e36"><text x="30" y="35" font-size="23">{html.escape(course['name'])} / {html.escape(course['difficulty'])}</text><text x="30" y="61" font-size="13">{html.escape(report['status'])} · geometry and 10 Hz trajectory contact sheet · not an art render</text>{terrain}<polyline points="{trajectory}" fill="none" stroke="#d59629" stroke-width="1.5"/>{checkpoints}{labels}<text x="30" y="295" font-size="11">Amber: physical witness / checkpoints. Green: shared visual and collision profile. Gap remains empty. Human approval pending.</text></g></svg>"""


def validate_review(stage):
    stage = Path(stage).resolve()
    manifest = json.loads((stage / "bank.json").read_text())
    if (
        manifest.get("schemaVersion") != 1
        or manifest.get("approval") != "pending-human-review"
        or len(manifest.get("candidates", [])) != 3
    ):
        raise ValueError("review: invalid bank/approval contract")
    current = json.loads((PUBLIC / "manifest.json").read_text())
    if manifest["assetContentId"] != current["contentId"]:
        raise ValueError("review: stale approved assets")
    if (
        manifest.get("fallback", {}).get("release")
        != json.loads((PUBLIC / "current.json").read_text())["release"]
    ):
        raise ValueError("review: stale curated fallback")
    expected_runtime = {
        "games/trials/simulation/game.js",
        "games/trials/simulation/rider-pose.js",
        "lib/planck/1.4.2/planck.module.js",
        "games/trials/rendering/camera.js",
        "lib/three/0.180.0/three.module.min.js",
    }
    if set(manifest.get("runtimeHashes", {})) != expected_runtime:
        raise ValueError("review: missing physics/runtime hashes")
    for name, expected in manifest["runtimeHashes"].items():
        if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != expected:
            raise ValueError("review: stale production simulation")
    for name, expected in manifest["files"].items():
        path = (stage / name).resolve()
        if not path.is_relative_to(stage) or not path.is_file():
            raise ValueError("review: missing/outside resource")
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"review: stale resource {name}")
    for candidate in manifest["candidates"]:
        for key in ["course", "report", "replay", "sheet"]:
            if candidate[key] not in manifest["files"]:
                raise ValueError("review: unhashed fetched resource")
        course = json.loads((stage / candidate["course"]).read_text())
        validate_contracts(course)
        if course["contentHash"] != candidate["contentHash"]:
            raise ValueError("review: course identity mismatch")
        report = json.loads((stage / candidate["report"]).read_text())
        if report["status"] != candidate["status"]:
            raise ValueError("review: stale validation status")
        if report.get("physics") not in [None, manifest["physics"]]:
            raise ValueError("review: physics identity mismatch")
        replay = json.loads((stage / candidate["replay"]).read_text())
        if candidate["status"] == "validated-for-review" and (
            not replay or report.get("successRate", 0) < 0.8
        ):
            raise ValueError("review: missing robustness evidence")
        if len(replay) > 3600:
            raise ValueError("review: replay exceeds 30 seconds")
        for frame in replay:
            if any(
                isinstance(frame.get(k), bool)
                or not isinstance(frame.get(k), (int, float))
                or not (-1 if k == "lean" else 0) <= frame[k] <= 1
                for k in ["throttle", "brake", "lean"]
            ):
                raise ValueError("review: invalid replay control")
            if set(frame) != {"throttle", "brake", "lean"} or not all(
                isinstance(frame[k], (int, float))
                and not isinstance(frame[k], bool)
                and (-1 if k == "lean" else 0) <= frame[k] <= 1
                for k in frame
            ):
                raise ValueError("review: invalid replay control")
    return manifest


def build_review(seed="quarry-review", max_repairs=2):
    if isinstance(max_repairs, bool) or max_repairs not in [0, 1, 2]:
        raise ValueError("review: repair budget 0..2 required")
    pointer_before = (PUBLIC / "current.json").read_bytes()
    approved = json.loads((PUBLIC / "manifest.json").read_text())
    bike = json.loads((PUBLIC / approved["bike"]).read_text())
    node = os.environ.get("TRIALS_NODE_PATH") or shutil.which("node")
    if not node:
        raise RuntimeError("Node 22+ required for offline production-physics verification")
    node_version = subprocess.run(
        [node, "--version"], capture_output=True, text=True, check=True
    ).stdout.strip()
    major = int(node_version.lstrip("v").split(".")[0])
    if not 22 <= major <= 24:
        raise RuntimeError("Verified Node major must be 22..24")
    sources = [
        *Path(__file__).parent.glob("*.py"),
        ROOT / "scripts/trials/verify.mjs",
        ROOT / "games/trials/course-verifier.js",
        ROOT / "games/trials/simulation/game.js",
        ROOT / "games/trials/simulation/rider-pose.js",
        ROOT / "games/trials/rendering/camera.js",
        ROOT / "lib/three/0.180.0/three.module.min.js",
        ROOT / "lib/planck/1.4.2/planck.module.js",
    ]
    source_hash = digest(
        {
            str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(sources)
        }
    )
    inputs = {
        "generator": VERSION,
        "seed": seed,
        "sourceHash": source_hash,
        "assetContentId": approved["contentId"],
        "node": node_version,
        "python": sys.version.split()[0],
        "repairs": max_repairs,
    }
    stage = REVIEW / digest(inputs)
    if (stage / "bank.json").exists():
        cached = validate_review(stage)
        if cached["inputs"] != inputs:
            raise ValueError("review: cached input mismatch")
        pending = REVIEW / "current.pending"
        pending.write_bytes(canonical({"bank": f"{stage.name}/bank.json"}))
        os.replace(pending, REVIEW / "current.json")
        return {
            "stage": str(stage),
            "url": f"http://127.0.0.1:8765/.trials-build/review/{stage.name}/index.html",
            "candidates": [{"id": c["id"], "status": c["status"]} for c in cached["candidates"]],
            "approval": "pending-human-review",
            "cached": True,
        }
    stage.mkdir(parents=True, exist_ok=True)
    candidates = []
    started = time.monotonic()
    physics = None
    for profile_id in PROFILES:
        attempts = []
        report = None
        course = None
        for repair in range(max_repairs + 1):
            if time.monotonic() - started > 120:
                report = {"status": "not-validated", "reason": "bank-wall-clock-budget"}
                break
            course = compose(f"{seed}:{profile_id}", profile_id, repair)
            report = invoke_verifier(
                {"protocol": 1, "bike": bike, "course": course},
                node,
                min(31, max(1, 120 - (time.monotonic() - started))),
            )
            physics = report.get("physics", physics)
            attempts.append(
                {
                    "repair": repair,
                    "contentHash": course["contentHash"],
                    "status": report["status"],
                    "reason": report.get("reason"),
                    "rate": report.get("successRate"),
                    "usage": report.get("usage"),
                }
            )
            if report["status"] == "validated-for-review":
                break
        if course is None:
            course = compose(f"{seed}:{profile_id}", profile_id)
        candidate_dir = stage / profile_id
        candidate_dir.mkdir(exist_ok=True)
        witness = report.get("witness", {})
        replay = witness.pop("inputs", [])
        report["attempts"] = attempts
        report["difficulty"] = {
            "skills": sorted({s for m in course["modules"] for s in m["skills"]}),
            "recoveryCount": len(course["checkpoints"]),
            "gapMetres": course["jump"]["landing"][0] - 61,
            "maximumVerticalStep": max(
                b[1] - a[1] for p in course["paths"] for a, b in zip(p, p[1:]) if a[0] == b[0]
            ),
            "testedEnvelopes": report.get("perturbations", []),
            "humanRating": "pending",
        }
        for name, value in [
            ("course.json", course),
            ("report.json", report),
            ("replay.json", replay),
        ]:
            (candidate_dir / name).write_bytes(canonical(value))
        (candidate_dir / "sheet.svg").write_text(sheet(course, report), encoding="utf-8")
        candidates.append(
            {
                "id": profile_id,
                "name": course["name"],
                "status": report["status"],
                "approval": "pending",
                "contentHash": course["contentHash"],
                **{
                    key: f"{profile_id}/{file}"
                    for key, file in [
                        ("course", "course.json"),
                        ("report", "report.json"),
                        ("replay", "replay.json"),
                        ("sheet", "sheet.svg"),
                    ]
                },
            }
        )
    links = "".join(
        f'<article><h2>{html.escape(c["name"])}</h2><p>{c["status"]} / human approval pending</p><img width="100%" src="{c["sheet"]}" alt="Course geometry and witness trajectory"/><p><a href="/trials.html?qa=review&amp;bank={stage.name}&amp;candidate={c["id"]}">Ride / watch in local QA</a> · <a href="{c["report"]}">Validation report</a></p></article>'
        for c in candidates
    )
    (stage / "index.html").write_text(
        '<!doctype html><meta charset="utf-8"><title>Quarry course review</title><style>body{max-width:1100px;margin:40px auto;padding:20px;font:16px system-ui;background:#ece9dd;color:#233e36}article{border-top:1px solid #89978c;margin-top:40px}a{color:#285c49}</style><h1>Quarry / offline course review</h1><p>Staged candidates. No approval or publication. The curated Works Line remains the default.</p>'
        + links,
        encoding="utf-8",
    )
    files = {
        str(p.relative_to(stage)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in stage.rglob("*")
        if p.is_file() and p.name != "bank.json"
    }
    manifest = {
        "schemaVersion": 1,
        "approval": "pending-human-review",
        "physics": physics,
        "inputs": inputs,
        "assetContentId": approved["contentId"],
        "sourceHash": source_hash,
        "runtimeHashes": {
            name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
            for name in [
                "games/trials/simulation/game.js",
                "games/trials/simulation/rider-pose.js",
                "lib/planck/1.4.2/planck.module.js",
                "games/trials/rendering/camera.js",
                "lib/three/0.180.0/three.module.min.js",
            ]
        },
        "candidates": candidates,
        "files": files,
        "fallback": {
            "kind": "curated-works-line",
            "release": json.loads(pointer_before)["release"],
            "reason": "Any rejected/unapproved candidate keeps the curated default",
        },
        "budgets": {
            "candidates": 3,
            "repairsPerCandidate": max_repairs,
            "bankSeconds": 120,
            "processSeconds": 31,
            "nodeHeapMiB": 192,
        },
    }
    (stage / "bank.json").write_bytes(canonical(manifest))
    validate_review(stage)
    if (PUBLIC / "current.json").read_bytes() != pointer_before:
        raise RuntimeError("Curated release changed during review build")
    pending = REVIEW / "current.pending"
    pending.write_bytes(canonical({"bank": f"{stage.name}/bank.json"}))
    os.replace(pending, REVIEW / "current.json")
    return {
        "stage": str(stage),
        "url": f"http://127.0.0.1:8765/.trials-build/review/{stage.name}/index.html",
        "candidates": [{"id": c["id"], "status": c["status"]} for c in candidates],
        "approval": "pending-human-review",
    }
