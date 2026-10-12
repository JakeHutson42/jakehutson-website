"""Build a deterministic bank of daily circuits using only Python's standard library.

Python runs at build time, never in a visitor's browser. Every date has a stable seed,
so rebuilding on another machine produces exactly the same track and scenery seed.
"""
import argparse
import hashlib
import json
import math
import random
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TRACK_DIRECTORY = ROOT / "games" / "drift" / "tracks"
POINT_COUNT = 320
GENERATOR_VERSION = 1


def distance(first, second):
    return math.hypot(second[0] - first[0], second[1] - first[1])


def resample_closed_loop(points, count):
    """Even spacing makes checkpoints, rendering, and progress agree on distance."""
    closed = points + [points[0]]
    lengths = [0.0]
    for first, second in zip(closed, closed[1:]):
        lengths.append(lengths[-1] + distance(first, second))
    result = []
    segment = 0
    for index in range(count):
        target = lengths[-1] * index / count
        while lengths[segment + 1] < target:
            segment += 1
        fraction = (target - lengths[segment]) / (lengths[segment + 1] - lengths[segment])
        first, second = closed[segment:segment + 2]
        result.append([round(first[axis] + fraction * (second[axis] - first[axis]), 3) for axis in range(2)])
    return result


def validate_geometry(points, width):
    """Reject tight corners and nearby road sections before publishing a circuit."""
    count = len(points)
    for index, point in enumerate(points):
        previous, following = points[(index - 1) % count], points[(index + 1) % count]
        incoming = (point[0] - previous[0], point[1] - previous[1])
        outgoing = (following[0] - point[0], following[1] - point[1])
        turn = abs(math.atan2(incoming[0] * outgoing[1] - incoming[1] * outgoing[0],
                              incoming[0] * outgoing[0] + incoming[1] * outgoing[1]))
        radius = distance(point, following) / max(turn, 0.00001)
        if radius < width * 1.7:
            return False
        for other_index in range(index + 1, count):
            separation = min(other_index - index, count - (other_index - index))
            if separation > 20 and distance(point, points[other_index]) < width * 2:
                return False
    return True


def generate_track(track_date):
    seed = int.from_bytes(hashlib.sha256(f"apex-v{GENERATOR_VERSION}:{track_date}".encode()).digest()[:4], "big")
    rng = random.Random(seed)
    width = 15
    for attempt in range(100):
        radius = rng.uniform(87, 108)
        stretch = rng.uniform(1.05, 1.35)
        phases = [rng.uniform(0, math.tau) for _ in range(3)]
        amplitudes = [rng.uniform(0.06, 0.13), rng.uniform(0.025, 0.07), rng.uniform(0.01, 0.035)]
        rotation = rng.uniform(0, math.tau)
        points = []
        for index in range(960):
            angle = index / 960 * math.tau
            radial = radius * (1 + sum(amplitude * math.sin((harmonic + 2) * angle + phase)
                                      for harmonic, (amplitude, phase) in enumerate(zip(amplitudes, phases))))
            x, z = math.cos(angle) * radial * stretch, math.sin(angle) * radial
            points.append([x * math.cos(rotation) - z * math.sin(rotation), x * math.sin(rotation) + z * math.cos(rotation)])
        points = resample_closed_loop(points, POINT_COUNT)
        if validate_geometry(points, width):
            break
    else:
        raise RuntimeError(f"Could not generate a safe circuit for {track_date}")

    # Put the start line on the gentlest section, leaving room to accelerate.
    def corner_angle(index):
        before, point, after = points[(index - 4) % POINT_COUNT], points[index], points[(index + 4) % POINT_COUNT]
        first = math.atan2(point[0] - before[0], point[1] - before[1])
        second = math.atan2(after[0] - point[0], after[1] - point[1])
        return abs(math.atan2(math.sin(second - first), math.cos(second - first)))

    start = min(range(POINT_COUNT), key=corner_angle)
    points = points[start:] + points[:start]
    length = sum(distance(points[index], points[(index + 1) % POINT_COUNT]) for index in range(POINT_COUNT))
    locations = ["Salt Flats", "Copper Basin", "Juniper Ridge", "Dry Creek", "Sierra Loop", "Sunstone Valley"]
    return {"version": GENERATOR_VERSION, "date": str(track_date), "seed": seed,
            "name": locations[seed % len(locations)], "environment": "HIGH DESERT", "width": width,
            "length": round(length, 2), "points": points}


def write_json(path, data):
    path.write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8")


def maintain_bank(today, directory=TRACK_DIRECTORY, config=None):
    config = config or json.loads((Path(__file__).with_name("track-bank.json")).read_text())
    directory.mkdir(parents=True, exist_ok=True)
    archive_days = config["archive_days"]
    threshold = config["minimum_future_tracks"]
    future_days = config["refill_future_tracks"]
    if not 0 <= archive_days <= 365 or not 1 <= threshold <= future_days <= 365:
        raise ValueError("Invalid archive or refill settings")
    first = today - timedelta(days=archive_days)
    # A gap tomorrow matters more than the number of unrelated future files.
    remaining = 0
    while (directory / f"{today + timedelta(days=remaining + 1)}.json").exists():
        remaining += 1
    horizon = future_days if remaining < threshold else remaining
    last = today + timedelta(days=horizon)
    created = 0
    for offset in range((last - first).days + 1):
        track_date = first + timedelta(days=offset)
        path = directory / f"{track_date}.json"
        if not path.exists():
            write_json(path, generate_track(track_date))
            created += 1
    # Only individual, date-named generated files are pruned; no recursive deletion.
    for path in directory.glob("????-??-??.json"):
        if path.stem < str(first) or path.stem > str(last):
            path.unlink()
    dates = [str(first + timedelta(days=offset)) for offset in range((last - first).days + 1)]
    write_json(directory / "manifest.json", {"version": 1, "dates": dates})
    return created, len(dates)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--today", type=date.fromisoformat, default=datetime.now(timezone.utc).date())
    args = parser.parse_args()
    created, total = maintain_bank(args.today)
    print(f"Track bank ready: {created} generated, {total} available. UTC date: {args.today}")
