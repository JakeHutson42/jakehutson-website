"""Generator tests cover determinism, safe geometry, and bank replenishment."""
import importlib.util
import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

spec = importlib.util.spec_from_file_location("generate_tracks", Path(__file__).resolve().parents[2] / "scripts/drift/generate_tracks.py")
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


class TrackTests(unittest.TestCase):
    def test_repeat_builds_are_identical_and_dates_differ(self):
        first = generator.generate_track(date(2026, 10, 12))
        self.assertEqual(first, generator.generate_track(date(2026, 10, 12)))
        self.assertNotEqual(first["points"], generator.generate_track(date(2026, 10, 13))["points"])

    def test_many_dates_produce_safe_evenly_spaced_circuits(self):
        for offset in range(60):
            track = generator.generate_track(date(2026, 10, 1) + timedelta(days=offset))
            self.assertEqual(track["width"], 14)
            points = track["points"]
            self.assertTrue(generator.validate_geometry(points, track["width"]))
            segments = [generator.distance(points[index], points[(index + 1) % len(points)]) for index in range(len(points))]
            self.assertLess(max(segments) / min(segments), 1.03)
            self.assertAlmostEqual(sum(segments), track["length"], places=1)
            total_turn, reversals = generator.corner_profile(points)
            self.assertGreaterEqual(generator.hairpin_count(points), 3, "Require real returning hairpins, not shallow wiggles")
            self.assertGreaterEqual(total_turn, 23)
            self.assertLessEqual(total_turn, 32)
            self.assertGreaterEqual(reversals, 18, "Each circuit needs linked left/right bends")
            self.assertLessEqual(reversals, 26, "Keep bends distinct rather than noisy")

    def test_development_bank_shrinks_a_previously_larger_bank(self):
        today = date(2026, 10, 13)
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            directory = Path(temporary)
            generator.maintain_bank(today, directory, {"archive_days": 3, "minimum_future_tracks": 1, "refill_future_tracks": 4})
            generator.maintain_bank(today, directory, {"archive_days": 2, "minimum_future_tracks": 1, "refill_future_tracks": 1})
            self.assertEqual(len(list(directory.glob("????-??-??.json"))), 4)
            manifest = json.loads((directory / "manifest.json").read_text())
            self.assertEqual(manifest["dates"], ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"])

    def test_bank_replaces_old_layouts_and_repairs_corrupt_files(self):
        today = date(2026, 10, 12)
        config = {"archive_days": 0, "minimum_future_tracks": 1, "refill_future_tracks": 1}
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            directory = Path(temporary)
            generator.maintain_bank(today, directory, config)
            old_layout = json.loads((directory / f"{today}.json").read_text())
            old_layout.pop("generatorVersion")
            generator.write_json(directory / f"{today}.json", old_layout)
            (directory / f"{today + timedelta(days=1)}.json").write_text("incomplete")
            self.assertEqual(generator.maintain_bank(today, directory, config), (2, 2))
            self.assertEqual(json.loads((directory / f"{today}.json").read_text())["generatorVersion"], generator.GENERATOR_VERSION)

    def test_bank_is_idempotent_repairs_gaps_and_refills_at_threshold(self):
        today = date(2026, 10, 12)
        config = {"archive_days": 2, "minimum_future_tracks": 2, "refill_future_tracks": 4}
        # Keep temporary files inside the checkout for restricted Windows workspaces.
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            directory = Path(temporary)
            self.assertEqual(generator.maintain_bank(today, directory, config), (7, 7))
            self.assertEqual(generator.maintain_bank(today, directory, config), (0, 7))
            (directory / "2026-10-13.json").unlink()
            self.assertEqual(generator.maintain_bank(today, directory, config), (1, 7))
            generator.maintain_bank(today + timedelta(days=3), directory, config)
            manifest = json.loads((directory / "manifest.json").read_text())
            self.assertEqual(manifest["dates"][0], "2026-10-13")
            self.assertEqual(manifest["dates"][-1], "2026-10-19")
            self.assertFalse((directory / "2026-10-12.json").exists())


if __name__ == "__main__":
    unittest.main()
