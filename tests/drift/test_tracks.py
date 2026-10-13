"""Generator tests cover determinism, safe geometry, and bank replenishment."""
import importlib.util
import json
import math
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
            self.assertEqual(track["width"], 15)
            points = track["points"]
            # Broad, nearly flat stretches should not dominate the lap. Walk
            # twice so a run crossing the start line is measured as one run.
            flat_run = longest_flat_run = 0
            for i in range(len(points)*2):
                j = i % len(points)
                before, point, after = points[j-4], points[j], points[(j+4) % len(points)]
                ax, az = point[0]-before[0], point[1]-before[1]
                bx, bz = after[0]-point[0], after[1]-point[1]
                turn = abs(math.atan2(ax*bz-az*bx, ax*bx+az*bz))
                flat_run = (flat_run + generator.distance(point, points[(j+1) % len(points)])
                            if turn/max(math.hypot(ax, az), 0.001) < 1/180 else 0)
                longest_flat_run = max(longest_flat_run, flat_run)
            self.assertLess(longest_flat_run, 100, "Break long flat runs into linked bends")
            self.assertTrue(generator.validate_geometry(points, track["width"], track["elevations"]))
            segments = [generator.distance(points[index], points[(index + 1) % len(points)]) for index in range(len(points))]
            self.assertNotIn("loop", track)
            self.assertLess(max(segments) / min(segments), 1.03)
            self.assertAlmostEqual(sum(segments), track["length"], places=1)
            self.assertGreaterEqual(track["drivingLength"],1207.008)
            self.assertLessEqual(track["drivingLength"],2414.016)
            total_turn, reversals = generator.corner_profile(points)
            self.assertGreaterEqual(generator.hairpin_count(points), 1, "Keep at least one returning drift corner")
            self.assertGreaterEqual(total_turn, 38)
            self.assertLessEqual(total_turn, 75)
            self.assertGreaterEqual(reversals, 24, "Each circuit needs linked left/right bends")
            self.assertLessEqual(reversals, 44, "Keep bends distinct rather than noisy")

    def test_existing_daily_laps_are_25_percent_shorter(self):
        previous_lengths = [2734.52, 2658.05, 2690.99, 2829.78]
        for day, previous in zip(range(11,15), previous_lengths):
            track = generator.generate_track(date(2026,10,day))
            self.assertAlmostEqual(track["length"], previous*0.75, delta=0.02)

    def test_daily_layouts_change_corner_geometry_and_have_no_stunts(self):
        tracks = [generator.generate_track(date(2026, 10, 11) + timedelta(days=i)) for i in range(6)]
        # Rotation, uniform scale and a different start cannot change total turn.
        profiles = [generator.corner_profile(t["points"])[0] for t in tracks]
        self.assertGreater(max(profiles)-min(profiles), 3)
        for track in tracks:
            self.assertNotIn("loop", track)
            self.assertEqual(track["bridges"], [])
            self.assertEqual(track["elevations"], [0.0]*len(track["points"]))
            self.assertEqual(generator.crossing_pairs(track["points"]), [])

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
