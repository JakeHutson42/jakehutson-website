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
POINT_COUNT = 640
GENERATOR_VERSION = 11
# Keep daily corner choices stable while changing road dimensions.
SHAPE_SEED_VERSION = 10


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


def validate_geometry(points, width, elevations=None):
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
            if (separation > 20 and distance(point, points[other_index]) < width + 3 and
                    (not elevations or abs(elevations[index]-elevations[other_index]) < 7)):
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


# Perimeter trace of the twist-heavy reference: linked chicanes and returning
# corners distributed around the entire lap, with space for a 15-metre road.
SKETCH = [(365,185),(410,163),(445,175),(465,210),(460,270),(480,282),
 (510,260),(510,180),(525,163),(555,163),(570,185),(568,270),
 (590,270),(615,255),(615,205),(635,175),(675,173),(708,192),
 (700,240),(687,300),(690,330),(735,330),(755,310),(775,265),
 (800,260),(850,260),(875,280),(895,320),(898,375),(870,405),
 (845,450),(840,495),(850,540),(880,580),(910,630),(922,680),
 (915,730),(890,745),(868,738),(847,700),(820,690),(795,695),
 (792,735),(810,755),(840,770),(845,805),(840,838),(812,850),
 (750,848),(733,860),(735,880),(758,901),(724,902),(705,920),
 (707,970),(696,1003),(664,1020),(643,1010),(632,985),(632,960),
 (603,958),(560,970),(556,918),(540,896),(494,894),(450,905),
 (419,927),(396,966),(374,974),(360,950),(355,912),(358,896),
 (390,885),(412,862),(417,833),(403,816),(352,805),(350,780),
 (362,750),(337,746),(309,763),(287,795),(274,810),(264,784),
 (260,754),(281,733),(306,722),(325,740),(350,740),(372,720),
 (385,675),(400,663),(440,663),(460,674),(465,700),(480,708),
 (495,687),(500,650),(488,625),(454,597),(425,588),(406,593),
 (384,611),(368,588),(360,557),(365,527),(390,480),(378,465),
 (350,463),(330,481),(310,519),(298,540),(285,535),(270,506),
 (266,473),(270,445),(299,416),(321,405),(356,415),(378,410),
 (381,385),(355,375),(340,363),(340,340),(361,315),(383,300),
 (400,275),(401,248),(383,225)]


def smooth_outline(controls):
    result = []
    for index, p1 in enumerate(controls):
        p0, p2, p3 = controls[index - 1], controls[(index + 1) % len(controls)], controls[(index + 2) % len(controls)]
        for step in range(24):
            t = step / 24
            result.append([0.5 * ((2*p1[a]) + (-p0[a]+p2[a])*t +
                (2*p0[a]-5*p1[a]+4*p2[a]-p3[a])*t*t +
                (-p0[a]+3*p1[a]-3*p2[a]+p3[a])*t*t*t) for a in range(2)])
    return resample_closed_loop(result, POINT_COUNT)


def crossing_pairs(points):
    hits = []
    for i, a in enumerate(points):
        b = points[(i+1) % len(points)]
        for j in range(i+12, len(points)):
            if len(points)-(j-i) < 12:
                continue
            c, d = points[j], points[(j+1) % len(points)]
            ux, uz, vx, vz = b[0]-a[0], b[1]-a[1], d[0]-c[0], d[1]-c[1]
            det = ux*vz-uz*vx
            if abs(det) < 1e-8:
                continue
            dx, dz = c[0]-a[0], c[1]-a[1]
            t, u = (dx*vz-dz*vx)/det, (dx*uz-dz*ux)/det
            if 0 <= t < 1 and 0 <= u < 1:
                hits.append((i+t, j+u))
    return hits


def longest_flat_run(points):
    """Length of the longest road run with a turning radius over 180 metres."""
    run = longest = 0.0
    count = len(points)
    for i in range(count*2):
        j = i % count
        before, point, after = points[j-4], points[j], points[(j+4)%count]
        ax, az = point[0]-before[0], point[1]-before[1]
        bx, bz = after[0]-point[0], after[1]-point[1]
        turn = abs(math.atan2(ax*bz-az*bx, ax*bx+az*bz))
        run = run + distance(point, points[(j+1)%count]) if turn/max(math.hypot(ax,az),0.001) < 1/180 else 0
        longest = max(longest,run)
    return longest


def round_corners(points, target_length=None):
    """Round tight corners locally, optionally retaining a chosen lap length."""
    # Smooth only tight corners and their neighbours. Global smoothing was
    # erasing nearby chicanes while fixing an unrelated tight corner.
    for _ in range(700):
        if target_length is not None:
            length = sum(distance(points[i-1], p) for i,p in enumerate(points))
            scale = target_length/length
            points = [[x*scale,z*scale] for x,z in points]
        tight = set()
        for i, point in enumerate(points):
            before, after = points[i-1], points[(i+1) % POINT_COUNT]
            ax, az = point[0]-before[0], point[1]-before[1]
            bx, bz = after[0]-point[0], after[1]-point[1]
            turn = abs(math.atan2(ax*bz-az*bx, ax*bx+az*bz))
            if distance(point,after)/max(turn,1e-6) < 21:
                tight.update((i+j)%POINT_COUNT for j in range(-2,3))
        if not tight:
            break
        points = resample_closed_loop([
            [(points[i-1][a]+2*p[a]+points[(i+1)%POINT_COUNT][a])/4 for a in range(2)]
            if i in tight else p for i,p in enumerate(points)], POINT_COUNT)
    return points


def generate_track(track_date):
    seed = int.from_bytes(hashlib.sha256(f"apex-v{SHAPE_SEED_VERSION}:{track_date}".encode()).digest()[:4], "big")
    rng = random.Random(seed)
    for attempt in range(80):
        # Each date changes individual corner positions, proportions and driving
        # direction. Deterministic retries reject unsafe or overly bland routes.
        phase = rng.uniform(0, math.tau)
        sx, sz = rng.uniform(0.9, 1.15), rng.uniform(0.9, 1.15)
        outline = list(SKETCH)
        # Exchange entire corner sequences, so dates can have different bend
        # counts as well as different corner depths and positions.
        northern_routes = [outline[6:18],
            [(505,260),(510,180),(530,165),(548,180),(550,260),
             (568,278),(588,260),(590,180),(610,165),(630,180),
             (632,260),(650,278),(675,260),(682,195)],
            [(505,260),(520,220),(550,210),(575,230),(580,285),
             (605,300),(630,282),(640,220),(650,175),(675,173)]]
        outline[6:18] = rng.choice(northern_routes)
        controls = []
        for i, (x, z) in enumerate(outline):
            wobble = math.sin(i*0.53 + phase)
            controls.append([(x-590)*sx + wobble*12 + 55*math.sin(z/150+phase) + rng.uniform(-7,7),
                             (z-590)*sz + math.cos(i*0.41+phase)*12 + 35*math.sin(x/130+phase) + rng.uniform(-7,7)])
        if rng.random() < 0.5:
            controls.reverse()
        points = smooth_outline(controls)
        length = sum(distance(points[i-1], p) for i, p in enumerate(points))
        scale = rng.uniform(4050, 4350)/length
        points = [[x*scale, z*scale] for x,z in points]
        points = round_corners(points)
        length = sum(distance(points[i-1], p) for i,p in enumerate(points))
        total_turn, reversals = corner_profile(points)
        if not (1609.344 <= length <= 3218.688 and total_turn >= 38 and reversals >= 24 and longest_flat_run(points) < 100):
            continue
        if not validate_geometry(points,14) or crossing_pairs(points):
            continue
        # Retain the established daily shapes and shorten their actual lap
        # distance by 25%. Re-round tighter corners at the new scale, restoring
        # the target length during smoothing so it cannot shorten the lap again.
        target_length = length * 0.75
        points = round_corners(points, target_length)
        length = sum(distance(points[i-1], p) for i,p in enumerate(points))
        total_turn, reversals = corner_profile(points)
        if not (validate_geometry(points,15) and total_turn >= 38 and reversals >= 24
                and longest_flat_run(points) < 100 and not crossing_pairs(points)):
            continue
        start = rng.randrange(POINT_COUNT)
        points = points[start:]+points[:start]
        return {"version":1, "generatorVersion":GENERATOR_VERSION, "date":str(track_date),
                "seed":seed, "name":["Midnight Switchbacks", "Neon Chicanes", "Skyline Esses"][seed%3],
                "layout":"switchbacks", "environment":"NIGHT CITY", "width":15,
                "length":round(length,2), "drivingLength":round(length,2),
                "points":points, "elevations":[0.0]*POINT_COUNT, "bridges":[]}
    raise RuntimeError(f"Unable to generate a safe twisty circuit: {track_date}")


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
