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
GENERATOR_VERSION = 4


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
        if radius < width * 1.35:
            return False
        for other_index in range(index + 1, count):
            separation = min(other_index - index, count - (other_index - index))
            if separation > 20 and distance(point, points[other_index]) < width * 2:
                return False
    return True


def corner_profile(points):
    """Measure meaningful direction changes, ignoring nearly straight sections.

    A circuit can pass every safety check and still be almost an oval. Requiring
    alternating curvature creates linked bends without adding abrupt zigzags.
    """
    turns = []
    directions = []
    count = len(points)
    for index, point in enumerate(points):
        before, after = points[(index - 4) % count], points[(index + 4) % count]
        incoming = (point[0] - before[0], point[1] - before[1])
        outgoing = (after[0] - point[0], after[1] - point[1])
        turn = math.atan2(incoming[0] * outgoing[1] - incoming[1] * outgoing[0],
                          incoming[0] * outgoing[0] + incoming[1] * outgoing[1])
        turns.append(turn / 4)
        # Ignore broad inflection zones rather than counting rounding noise as a bend.
        if abs(turn) > 0.035:
            direction = 1 if turn > 0 else -1
            if not directions or directions[-1] != direction:
                directions.append(direction)
    reversals = sum(directions[index] != directions[(index + 1) % len(directions)]
                    for index in range(len(directions)))
    return sum(abs(turn) for turn in turns), reversals


def hairpin_count(points):
    """Count sustained same-direction corners turning at least 155 degrees.

    Unlike total curvature, this cannot be satisfied by lots of shallow wiggles.
    Grouping the real centreline turns also verifies the resampled road, not just
    the control points that were intended to become hairpins.
    """
    groups = []
    for index, point in enumerate(points):
        before, after = points[index - 1], points[(index + 1) % len(points)]
        ax, az = point[0] - before[0], point[1] - before[1]
        bx, bz = after[0] - point[0], after[1] - point[1]
        turn = math.atan2(ax * bz - az * bx, ax * bx + az * bz)
        if abs(turn) < 0.003:
            continue
        if groups and groups[-1] * turn > 0:
            groups[-1] += turn
        else:
            groups.append(turn)
    if len(groups) > 1 and groups[0] * groups[-1] > 0:
        groups[0] += groups.pop()
    return sum(abs(turn) >= math.radians(155) for turn in groups)


def hairpin_layout(rng):
    """Build linked esses separated by explicit semicircular 180-degree turns.

    A radial outline cannot reliably form a proper returning hairpin. This route
    uses tangent-matched lanes and half circles, then varies lane lengths, bend
    amplitudes, radii, reflection and rotation to give each date its own rhythm.
    """
    points = []
    radii = [rng.uniform(29, 37) for _ in range(3)]
    levels = [0]
    for radius in radii:
        levels.append(levels[-1] + radius * 2)
    outer_x = rng.uniform(-200, -185)
    left_x = rng.uniform(-110, -90)
    right_x = [rng.uniform(100, 135), rng.uniform(90, 125)]
    ends = [(outer_x, right_x[0]), (right_x[0], left_x),
            (left_x, right_x[1]), (right_x[1], outer_x)]
    for lane, (start_x, end_x) in enumerate(ends):
        amplitude = rng.uniform(17, 25) if lane in (0, 3) else rng.uniform(13, 20)
        cycles = 2 if lane in (0, 3) else 1.5
        bend_side = rng.choice([-1, 1])
        for step in range(240):
            fraction = step / 240
            # The envelope flattens the lane ends so every hairpin meets the
            # preceding and following road tangentially, without a sharp kink.
            offset = bend_side * amplitude * math.sin(math.tau * cycles * fraction) * math.sin(math.pi * fraction) ** 2
            points.append([start_x + (end_x - start_x) * fraction, levels[lane] + offset])
        if lane < 3:
            radius = radii[lane]
            turn_side = 1 if lane % 2 == 0 else -1
            for step in range(120):
                angle = math.pi * step / 120
                points.append([end_x + turn_side * radius * math.sin(angle),
                               levels[lane] + radius * (1 - math.cos(angle))])
    # A sweeping return leg closes the circuit outside the three switchbacks.
    # Its lateral clearance is independent of the internal hairpin radii.
    vertical_radius = levels[-1] / 2
    horizontal_radius = rng.uniform(85, 115)
    for step in range(240):
        angle = math.pi * step / 240
        points.append([outer_x - horizontal_radius * math.sin(angle),
                       vertical_radius * (1 + math.cos(angle))])
    center_x = (min(point[0] for point in points) + max(point[0] for point in points)) / 2
    center_z = levels[-1] / 2
    rotation = rng.uniform(0, math.tau)
    reflection = rng.choice([-1, 1])
    transformed = []
    for x, z in points:
        x = (x - center_x) * reflection
        z -= center_z
        transformed.append([x * math.cos(rotation) - z * math.sin(rotation),
                            x * math.sin(rotation) + z * math.cos(rotation)])
    return resample_closed_loop(transformed, POINT_COUNT)


def generate_track(track_date):
    seed = int.from_bytes(hashlib.sha256(f"apex-v{GENERATOR_VERSION}:{track_date}".encode()).digest()[:4], "big")
    rng = random.Random(seed)
    width = 14
    for attempt in range(600):
        points = hairpin_layout(rng)
        total_turn, reversals = corner_profile(points)
        if total_turn >= 23 and reversals >= 18 and hairpin_count(points) >= 3 and validate_geometry(points, width):
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
    # File schema and layout generation are separate versions: the browser can
    # read the same format while the bank replaces superseded circuit layouts.
    return {"version": 1, "generatorVersion": GENERATOR_VERSION, "date": str(track_date), "seed": seed,
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
    # Respect a smaller configured development bank even when a larger bank exists.
    horizon = future_days if remaining < threshold else min(remaining, future_days)
    last = today + timedelta(days=horizon)
    created = 0
    for offset in range((last - first).days + 1):
        track_date = first + timedelta(days=offset)
        path = directory / f"{track_date}.json"
        existing_version = None
        if path.exists():
            try:
                existing_version = json.loads(path.read_text(encoding="utf-8")).get("generatorVersion", 1)
            except (ValueError, AttributeError):
                pass  # Repair an incomplete/corrupt generated file on the next build.
        if existing_version != GENERATOR_VERSION:
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
