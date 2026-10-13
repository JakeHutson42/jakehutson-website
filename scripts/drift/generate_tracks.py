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
GENERATOR_VERSION = 8


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


# Hand-traced from the supplied sketch; the right-hand lobe crosses the return leg.
SKETCH = [(540,140),(590,155),(620,205),(620,260),(600,295),(605,335),
          (650,348),(695,345),(723,385),(727,445),(683,477),(646,500),
          (635,544),(666,590),(710,631),(760,646),(817,645),(855,611),
          (868,575),(858,544),(819,535),(741,535),(713,540),(681,578),
          (667,620),(670,675),(694,732),(741,785),(790,834),(815,891),
          (818,955),(800,983),(749,1009),(685,1019),(640,1005),(608,970),
          (575,961),(547,974),(515,1014),(490,1070),(460,1101),(416,1120),
          (374,1132),(361,1123),(361,1087),(329,1098),(306,1124),(281,1155),
          (261,1143),(244,1104),(224,1088),(203,1100),(173,1136),(151,1132),
          (140,1090),(144,1049),(185,1020),(226,1004),(276,992),(307,970),
          (319,932),(317,878),(305,856),(263,839),(213,825),(197,811),
          (186,770),(182,718),(193,683),(233,651),(268,610),(269,575),
          (243,550),(218,519),(204,480),(204,422),(235,382),(273,356),
          (318,337),(355,330),(392,309),(421,276),(439,222),(466,175),(501,150)]


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


def generate_track(track_date):
    seed = int.from_bytes(hashlib.sha256(f"apex-v{GENERATOR_VERSION}:{track_date}".encode()).digest()[:4], "big")
    rng = random.Random(seed)
    variant = (track_date - date(2026, 10, 11)).days % 3
    controls = list(SKETCH)
    if variant == 1:
        # Replace the southern switchbacks with a wide westward chicane district.
        controls[38:56] = [(505,1010),(454,1025),(411,1077),(352,1104),
            (302,1080),(267,1025),(212,1040),(158,1080),(110,1100),(120,1045)]
        controls[1:6] = [(615,150),(657,203),(650,269),(614,303),(620,350)]
    elif variant == 2:
        # Longer southern sweep and two generous returning drift corners.
        controls[38:56] = [(505,1010),(460,1080),(400,1120),(330,1120),
            (295,1080),(290,1018),(251,995),(206,1014),(178,1070),(129,1092),(95,1090),(115,1040)]
        controls[29:35] = [(840,879),(850,951),(818,1008),(760,1040),(690,1040),(638,1010)]
    points = smooth_outline(controls)
    # The drawing's small bottom kinks become generous drift corners at this scale.
    variation = 1 if str(track_date) == "2026-10-11" else rng.uniform(0.96, 1.05)
    sx = [1.12, 1.4, 1.2][variant] * variation
    sz = [1.12, 0.92, 1.22][variant] * variation
    angle = 0 if variant == 0 else rng.uniform(-0.45, 0.45)
    mirror = -1 if variant == 1 else 1
    transformed = []
    for x, z in points:
        x, z = (x-490)*sx*mirror, (z-650)*sz
        transformed.append([x*math.cos(angle)-z*math.sin(angle), x*math.sin(angle)+z*math.cos(angle)])
    points = resample_closed_loop(transformed, POINT_COUNT)
    # Shorter 1–2 mile laps; smooth at the final scale so road-width corner
    # clearance is retained instead of shrinking already validated bends.
    raw_length = sum(distance(points[i], points[(i+1) % POINT_COUNT]) for i in range(POINT_COUNT))
    scale = [2600, 3700, 3050][variant] / raw_length
    points = [[x*scale,z*scale] for x,z in points]
    # Round the sketch's pen kinks until the complete road width fits each bend.
    for _ in range(1200):
        radii = []
        for i, point in enumerate(points):
            before, after = points[i-1], points[(i+1) % POINT_COUNT]
            ax, az = point[0]-before[0], point[1]-before[1]
            bx, bz = after[0]-point[0], after[1]-point[1]
            turn = abs(math.atan2(ax*bz-az*bx, ax*bx+az*bz))
            radii.append(distance(point,after)/max(turn,1e-6))
        if min(radii) >= 20:
            break
        points = resample_closed_loop([[(points[i-1][a]+2*point[a]+points[(i+1)%POINT_COUNT][a])/4 for a in range(2)] for i,point in enumerate(points)], POINT_COUNT)
    points = resample_closed_loop(points, POINT_COUNT)
    # Move the start to the sweeping left flank, clear of the crossover and stunt.
    start = min(range(len(points)), key=lambda i: distance(points[i], transformed[int(0.83*POINT_COUNT)]))
    points = points[start:] + points[:start]
    length = sum(distance(points[i], points[(i+1) % POINT_COUNT]) for i in range(POINT_COUNT))
    spacing = length / POINT_COUNT
    crossings = crossing_pairs(points)
    elevations = [0.0] * POINT_COUNT
    bridges = []
    for upper, lower in crossings:
        # 12 m deck clearance and eased 120 m approaches on each side.
        for i in range(POINT_COUNT):
            separation = abs(i-upper)
            separation = min(separation, POINT_COUNT-separation)*spacing
            if separation < 140:
                h = 12 if separation <= 35 else 12*(0.5+0.5*math.cos(math.pi*(separation-35)/105))
                elevations[i] = round(max(elevations[i], h), 3)
        bridges.append({"upper": upper/POINT_COUNT, "lower": lower/POINT_COUNT, "clearance": 12})
    track = {"version": 1, "generatorVersion": GENERATOR_VERSION, "date": str(track_date), "seed": seed,
        "name": ["After Hours — Sketch Run", "Neon Borough", "Skyline Stunt Run"][variant],
        "layout": ["sketch", "borough", "stunt"][variant], "environment": "NIGHT CITY", "width": 14,
        "length": round(length, 2), "points": points, "elevations": elevations, "bridges": bridges}
    if variant == 2:
        # Pick a straight, level section away from the bridge, not a corner apex.
        span = max(6, round(48/spacing))
        candidates = []
        for i in range(20, POINT_COUNT-span-20):
            if max(elevations[i:i+span+1]) > 0:
                continue
            a, b = points[i], points[i+span]
            direct = distance(a,b)
            path = sum(distance(points[j],points[j+1]) for j in range(i,i+span))
            candidates.append((direct/path, i))
        _, i = max(candidates)
        a,b=points[i],points[i+span]
        heading=math.atan2(b[0]-a[0],b[1]-a[1])
        rx,rz=math.cos(heading),-math.sin(heading)
        shift=24
        return_span=max(20,round(120/spacing))
        for j in range(i,i+span+return_span+1):
            if j>=POINT_COUNT:
                break
            if j<=i+span:
                u=(j-i)/span
                lateral=shift*(u-math.sin(math.tau*u)/math.tau)
            else:
                u=(j-i-span)/return_span
                lateral=shift*(0.5+0.5*math.cos(math.pi*u))
            points[j]=[round(points[j][0]+rx*lateral,3),round(points[j][1]+rz*lateral,3)]
        track["loop"] = {"start": i/POINT_COUNT, "end": (i+span)/POINT_COUNT,
                          "heading":heading,"offset":shift,"radius": 18, "minimumSpeed": 20}
        # Keep geometry-distance progress and public centreline length consistent
        # after moving the exit lane and easing it back into the city route.
        track["length"]=round(sum(distance(points[j],points[(j+1)%POINT_COUNT]) for j in range(POINT_COUNT)),2)
    if not validate_geometry(points, 14, elevations):
        raise RuntimeError(f"Unsafe generated circuit: {track_date}")
    driving_length = sum(math.hypot(
        distance(points[i], points[(i+1) % POINT_COUNT]),
        elevations[i]-elevations[(i+1) % POINT_COUNT]) for i in range(POINT_COUNT))
    if "loop" in track:
        loop=track["loop"]
        start,end=round(loop["start"]*POINT_COUNT),round(loop["end"]*POINT_COUNT)
        dx,dz=points[end][0]-points[start][0],points[end][1]-points[start][1]
        forward_span=dx*math.sin(loop["heading"])+dz*math.cos(loop["heading"])
        poses=[]
        for step in range(241):
            t=step/240
            u=max(0,min(1,(t-0.25)*2)); angle=math.tau*u
            along=forward_span/2+loop["radius"]*math.sin(angle) if 0.25<=t<=0.75 else forward_span*t*2 if t<0.25 else forward_span*(t*2-1)
            poses.append((along,loop["radius"]*(1-math.cos(angle)),loop["offset"]*(u-math.sin(angle)/math.tau)))
        driving_length += sum(math.dist(a,b) for a,b in zip(poses,poses[1:]))-sum(distance(points[j],points[j+1]) for j in range(start,end))
    track["drivingLength"] = round(driving_length,2)
    if not 1609.344 <= track["drivingLength"] <= 3218.688:
        raise RuntimeError(f"Circuit is outside the 1–2 mile target: {track_date}")
    return track


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
