import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/trials"))
import bank
import build
import modules
import content


class ToolingTests(unittest.TestCase):
    def test_composer_repeatability_and_skill_pacing(self):
        for profile in modules.PROFILES:
            a = modules.compose("repeatable", profile)
            self.assertEqual(a, modules.compose("repeatable", profile))
            self.assertNotEqual(
                a["contentHash"], modules.compose("different", profile)["contentHash"]
            )
            self.assertEqual([m["role"] for m in a["modules"]], [r for r, _ in modules.PACER])
            self.assertEqual(a["modules"][4]["recovery"], [72, 78])
            for repair in range(3):
                modules.validate_contracts(modules.compose("repeatable", profile, repair))

    def test_contract_dimension_seam_gap_corridor_and_stale_identity_fail(self):
        profile = copy.deepcopy(modules.PROFILES["apprentice"])
        profile["gap"] = float("inf")
        with self.assertRaisesRegex(ValueError, "gap"):
            modules.validate_profile(profile)
        profile = copy.deepcopy(modules.PROFILES["apprentice"])
        profile["unexpected"] = 1
        with self.assertRaisesRegex(ValueError, "unknown"):
            modules.validate_profile(profile)
        c = modules.compose("bad", "apprentice")
        c["modules"][1]["entry"]["x"] += 0.1
        with self.assertRaisesRegex(ValueError, "frame mismatch|seam"):
            modules.validate_contracts(c)
        c = modules.compose("bad", "apprentice")
        c["modules"][4]["gap"] = [60, 61]
        with self.assertRaisesRegex(ValueError, "not empty"):
            modules.validate_contracts(c)
        c = modules.compose("bad", "apprentice")
        c["modules"][4]["camera"]["mustSee"][1] = [100, 0]
        with self.assertRaisesRegex(ValueError, "sightline"):
            modules.validate_contracts(c)
        c = modules.compose("bad", "apprentice")
        c["scenery"][0]["position"][2] = 0
        with self.assertRaisesRegex(ValueError, "clearance"):
            modules.validate_contracts(c)
        c = modules.compose("bad", "apprentice")
        c["contentHash"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "stale collision"):
            modules.validate_contracts(c)

    def test_process_timeout_is_not_validated_and_memory_is_bounded(self):
        with mock.patch.object(
            bank.subprocess, "run", side_effect=subprocess.TimeoutExpired("node", 0.01)
        ) as call:
            result = bank.invoke_verifier({"protocol": 1}, timeout=0.01)
        self.assertEqual(result["status"], "not-validated")
        self.assertEqual(result["reason"], "verifier-process-timeout")
        self.assertIn("--max-old-space-size=192", call.call_args.args[0])
        self.assertEqual(call.call_args.kwargs["timeout"], 0.01)

    def test_real_review_bank_retains_curated_fallback_and_rejects_corruption(self):
        build.SCRATCH.mkdir(exist_ok=True)
        original = (bank.PUBLIC / "current.json").read_bytes()
        with tempfile.TemporaryDirectory(dir=build.SCRATCH) as directory, mock.patch.object(
            bank, "REVIEW", Path(directory)
        ):
            result = bank.build_review("quarry-review-01", max_repairs=0)
            stage = Path(result["stage"])
            manifest = bank.validate_review(stage)
            self.assertEqual(len(manifest["candidates"]), 3)
            self.assertEqual(manifest["approval"], "pending-human-review")
            self.assertEqual(manifest["fallback"]["release"], json.loads(original)["release"])
            self.assertEqual((bank.PUBLIC / "current.json").read_bytes(), original)
            cached = bank.build_review("quarry-review-01", max_repairs=0)
            self.assertTrue(cached["cached"])
            pointer = (Path(directory) / "current.json").read_bytes()
            with mock.patch.object(
                bank,
                "invoke_verifier",
                return_value={"status": "not-validated", "reason": "bounded-test"},
            ), mock.patch.object(bank, "sheet", side_effect=ValueError("render failed")):
                with self.assertRaisesRegex(ValueError, "render failed"):
                    bank.build_review("broken-next", max_repairs=0)
            self.assertEqual((Path(directory) / "current.json").read_bytes(), pointer)
            original_manifest = (stage / "bank.json").read_bytes()
            changed = json.loads(original_manifest)
            changed["runtimeHashes"]["games/trials/simulation/game.js"] = "0" * 64
            (stage / "bank.json").write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, "stale production"):
                bank.validate_review(stage)
            (stage / "bank.json").write_bytes(original_manifest)
            (stage / manifest["candidates"][0]["replay"]).write_bytes(b"corrupt")
            with self.assertRaisesRegex(ValueError, "stale resource"):
                bank.validate_review(stage)
        self.assertEqual((bank.PUBLIC / "current.json").read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
