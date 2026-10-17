import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/trials"))
import forestry
import release
from content import course_identity, surface_height
from build import glb_json


class ForestryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        (forestry.ROOT / ".trials-build").mkdir(exist_ok=True)

    def test_biome_schema_dimensions_and_clearance_fail_explicitly(self):
        spec = json.loads(forestry.SPEC.read_text())
        forestry.validate_biome(spec)
        for mutate in [
            lambda s: s.update(extra=1),
            lambda s: s.update(schemaVersion=True),
            lambda s: s.update(seed=""),
            lambda s: s["lighting"].update(sun="red"),
            lambda s: s["lighting"].update(exposure=float("inf")),
            lambda s: s["corridor"].update(halfWidth=0),
            lambda s: s["budgets"].update(props=100000),
            lambda s: s["palette"].update(soil="red"),
        ]:
            bad = copy.deepcopy(spec)
            mutate(bad)
            with self.assertRaisesRegex(ValueError, "biome"):
                forestry.validate_biome(bad)
        c = forestry.compose_forest("test", "nursery")
        c["biomeProps"][0]["position"][2] = 0
        with self.assertRaisesRegex(ValueError, "corridor"):
            forestry.validate_forest(c)

    def test_routes_repeat_and_decorative_changes_do_not_change_riding_identity(self):
        for id, *_ in forestry.ROUTES:
            a = forestry.compose_forest("repeat:" + id, id)
            b = forestry.compose_forest("repeat:" + id, id)
            self.assertEqual(a, b)
            self.assertIsNone(surface_height(a, (61 + a["jump"]["landing"][0]) / 2))
            identity = course_identity(a)
            a["biomeProps"][0]["position"][0] += 1
            self.assertEqual(course_identity(a), identity)
        with self.assertRaisesRegex(ValueError, "recipe"):
            forestry.compose_forest("x", "unknown")
        with self.assertRaisesRegex(ValueError, "repair"):
            forestry.compose_forest("x", "nursery", 10)

    def test_frozen_kit_bounds_and_original_audio_are_valid_and_repeatable(self):
        root = forestry.ROOT / "scripts/trials/curation/forestry"
        spec = json.loads(forestry.SPEC.read_text())
        report = json.loads((root / "kit-report.json").read_text())
        doc = glb_json(root / "kit.glb")
        self.assertTrue(set(spec["prototypes"]) <= {n.get("name") for n in doc["nodes"]})
        for p in report["prototypes"].values():
            self.assertLessEqual(
                max(abs(p["runtimeBounds"]["min"][2]), abs(p["runtimeBounds"]["max"][2])), 2
            )
        with tempfile.TemporaryDirectory(dir=forestry.ROOT / ".trials-build") as directory:
            a, b = Path(directory) / "a.wav", Path(directory) / "b.wav"
            forestry.ambience(a, "repeat")
            forestry.ambience(b, "repeat")
            self.assertEqual(a.read_bytes(), b.read_bytes())
            with wave.open(str(a), "rb") as sound:
                self.assertEqual(sound.getnframes(), 22050 * 8)
                self.assertEqual(sound.getnchannels(), 1)

    def test_approved_release_excludes_new_biome_and_stage_retains_failure_pointer(self):
        with tempfile.TemporaryDirectory(
            dir=forestry.ROOT / ".trials-build"
        ) as directory, mock.patch.object(
            release, "PUBLIC", Path(directory) / "public"
        ), mock.patch.object(
            release, "LOCAL", Path(directory) / "review"
        ):
            normal = release.build_release()
            self.assertEqual(normal["courses"], 6)
            public_root = release.PUBLIC
            pointer = json.loads((public_root / "current.json").read_text())
            catalog = json.loads((public_root / pointer["catalog"]).read_text())
            self.assertNotIn("forestry", catalog["biomes"])
            staged = release.build_release(True)
            self.assertEqual(staged["courses"], 9)
            self.assertEqual(staged["pending"], 3)
            old = (release.LOCAL / "current.json").read_bytes()
            original = release.file_hash
            with mock.patch.object(
                release,
                "file_hash",
                side_effect=lambda p: "0" * 64 if Path(p).name == "kit.glb" else original(p),
            ):
                with self.assertRaisesRegex(ValueError, "stale forestry"):
                    release.build_release(True)
            self.assertEqual((release.LOCAL / "current.json").read_bytes(), old)


if __name__ == "__main__":
    unittest.main()
