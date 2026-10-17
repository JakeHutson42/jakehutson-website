import copy
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
import hashlib
import wave

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/trials"))
import content
import build
import audio


class GenerationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        build.SCRATCH.mkdir(exist_ok=True)

    def test_repeatable_named_streams_and_bounded_variation(self):
        first = content.make_course("alpha")
        self.assertEqual(first, content.make_course("alpha"))
        other = content.make_course("beta")
        self.assertNotEqual(first["rollerAmplitude"], other["rollerAmplitude"])
        self.assertEqual(first["paths"][1], other["paths"][1])
        self.assertEqual(first["checkpoints"], other["checkpoints"])
        a = content.stream("alpha", "rollers")
        b = content.stream("alpha", "rollers")
        content.stream("alpha", "paint").random()
        self.assertEqual(a.random(), b.random())
        decorated = copy.deepcopy(first)
        decorated["scenery"][0]["scale"][0] *= 0.9
        self.assertEqual(content.course_identity(first), content.course_identity(decorated))
        for seed in range(100):
            course = content.make_course(seed)
            content.validate_course(course)
            self.assertGreaterEqual(course["rollerAmplitude"], 0.125)
            self.assertLessEqual(course["rollerAmplitude"], 0.155)

    def test_schema_rejects_bad_dimensions_and_anatomy(self):
        bike, rider = content.specs()
        with tempfile.TemporaryDirectory(dir=build.SCRATCH) as path:
            directory = Path(path)

            def check(b, r, field):
                (directory / "bike.json").write_text(json.dumps(b))
                (directory / "rider.json").write_text(json.dumps(r))
                with self.assertRaisesRegex(ValueError, field):
                    content.specs(directory)

            for value in [float("nan"), float("inf"), -0.3, True]:
                changed = copy.deepcopy(bike)
                changed["wheelRadius"] = value
                check(changed, rider, "wheelRadius")
            changed = copy.deepcopy(bike)
            changed["wheelbase"] = 1.6
            check(changed, rider, "wheelbase")
            changed = copy.deepcopy(rider)
            del changed["joints"]["head"]
            check(bike, changed, "named rig")
            changed = copy.deepcopy(bike)
            changed["paint"] = "red"
            check(changed, rider, "hex colour")

    def test_respawns_and_clearance_fail_explicitly(self):
        course = content.make_course()
        course["checkpoints"][2]["y"] = 3
        with self.assertRaisesRegex(ValueError, "unsafe respawn"):
            content.validate_course(course)
        course = content.make_course()
        course["scenery"][0]["position"][2] = 0
        with self.assertRaisesRegex(ValueError, "clearance"):
            content.validate_course(course)

    def test_recovery_space_and_finish_height_are_checked(self):
        course = content.make_course()
        course["checkpoints"][2] = {"x": 37.9, "y": 0.42}
        with self.assertRaisesRegex(ValueError, "flat recovery"):
            content.validate_course(course)
        course = content.make_course()
        course["finishY"] = 0
        with self.assertRaisesRegex(ValueError, "finish"):
            content.validate_course(course)

    def test_audio_is_repeatable_local_pcm_without_clipping(self):
        with tempfile.TemporaryDirectory(dir=build.SCRATCH) as path:
            directory = Path(path)
            sounds = audio.generate(directory)
            hashes = {
                name: hashlib.sha256((directory / Path(file).name).read_bytes()).hexdigest()
                for name, file in sounds.items()
            }
            audio.generate(directory)
            for name, file in sounds.items():
                resource = directory / Path(file).name
                audio.validate_audio(resource)
                self.assertEqual(hashlib.sha256(resource.read_bytes()).hexdigest(), hashes[name])
                if name in ["idle", "load", "gravel"]:
                    with wave.open(str(resource), "rb") as source:
                        samples = source.readframes(source.getnframes())
                    import struct

                    first, last = (
                        struct.unpack("<h", samples[:2])[0],
                        struct.unpack("<h", samples[-2:])[0],
                    )
                    self.assertLess(abs(first - last), 1500, "Loop seam must not click")

    def test_approved_runtime_manifest_glbs_and_rig(self):
        manifest = build.validate()
        self.assertIsNotNone(manifest["assets"])
        release = json.loads((build.PUBLIC / "current.json").read_text())["release"]
        approved = build.validate((build.PUBLIC / release).parent)
        self.assertEqual(approved["contentId"], manifest["contentId"])
        rig = json.loads((build.PUBLIC / manifest["assets"]["rig"]).read_text())
        self.assertEqual(rig["blender"], "4.5.3 LTS")
        self.assertGreaterEqual(len(rig["bones"]), 12)
        bike = json.loads((build.PUBLIC / manifest["bike"]).read_text())
        rider = json.loads((build.PUBLIC / manifest["rider"]).read_text())
        self.assertEqual(rig["joints"], rider["joints"])
        glb = build.glb_json(build.PUBLIC / manifest["assets"]["bike"])
        nodes = {node.get("name"): node for node in glb["nodes"]}
        for name, field in [("frontWheel", "frontAxle"), ("rearWheel", "rearAxle"), ("forkSlider", "frontAxle"), ("swingarm", "swingPivot")]:
            for actual, expected in zip(nodes[name]["translation"], [*bike[field], 0]):
                self.assertAlmostEqual(actual, expected, places=6)

    def test_corrupt_resource_is_rejected_without_touching_approved_bank(self):
        before = (build.PUBLIC / "current.json").read_bytes()
        with tempfile.TemporaryDirectory(dir=build.SCRATCH) as path:
            directory = Path(path)
            shutil.copytree(build.PUBLIC, directory, dirs_exist_ok=True)
            (directory / "assets/bike.glb").write_bytes(b"broken")
            with self.assertRaisesRegex(ValueError, "stale hash"):
                build.validate(directory)
        self.assertEqual((build.PUBLIC / "current.json").read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
