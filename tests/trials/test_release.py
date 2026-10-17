import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/trials"))
import release


class ReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        (release.ROOT / ".trials-build").mkdir(exist_ok=True)

    def test_release_has_human_evidence_and_no_unseen_courses(self):
        catalog = release.validate_current()
        approvals = json.loads(release.APPROVALS.read_text())
        self.assertGreaterEqual(len(catalog["courses"]), 4)
        for c in catalog["courses"]:
            self.assertIn(c["contentHash"], approvals["courses"])
            self.assertEqual(c["approval"], "approved")
        self.assertEqual(catalog["default"], "works")

    def test_release_is_repeatable_and_failed_build_keeps_manifest(self):
        with tempfile.TemporaryDirectory(
            dir=release.ROOT / ".trials-build"
        ) as directory, mock.patch.object(release, "PUBLIC", Path(directory)):
            first = release.build_release()
            pointer = (Path(directory) / "current.json").read_bytes()
            self.assertEqual(first, release.build_release())
            with mock.patch.object(
                release, "validate_review", side_effect=ValueError("stale verifier")
            ):
                with self.assertRaisesRegex(ValueError, "stale verifier"):
                    release.build_release()
            self.assertEqual(pointer, (Path(directory) / "current.json").read_bytes())

    def test_unapproved_corrupt_stale_and_outside_resources_fail(self):
        current = json.loads((release.PUBLIC / "current.json").read_text())
        source = (release.PUBLIC / current["catalog"]).parent
        catalog = json.loads((source / "catalog.json").read_text())
        with tempfile.TemporaryDirectory(dir=release.ROOT / ".trials-build") as directory:
            import shutil

            target = Path(directory) / "bank"
            shutil.copytree(source, target)
            for mutate, message in [
                (lambda c: c.update(physics="old"), "stale"),
                (lambda c: c["courses"][0].update(approval="pending"), "unapproved"),
                (lambda c: c["courses"][0].update(evidence=None), "human"),
                (lambda c: c["courses"][0]["evidence"].update(quote="bot success"), "human"),
                (lambda c: c["courses"][0]["medals"]["gold"].update(time=100), "medal"),
            ]:
                c = copy.deepcopy(catalog)
                mutate(c)
                identity = dict(c)
                identity.pop("id")
                c["id"] = release.digest(identity)
                (target / "catalog.json").write_text(json.dumps(c))
                with self.assertRaisesRegex((ValueError, TypeError), message):
                    release.validate_release(target)
            (target / "catalog.json").write_text(json.dumps(catalog))
            (target / catalog["courses"][0]["thumbnail"]).write_bytes(b"bad image")
            with self.assertRaisesRegex(ValueError, "corrupt"):
                release.validate_release(target)
        with self.assertRaisesRegex(ValueError, "outside"):
            release.safe_path(release.PUBLIC, "../escape.json")


if __name__ == "__main__":
    unittest.main()
