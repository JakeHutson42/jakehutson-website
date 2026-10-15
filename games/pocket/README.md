# Pocket Circuit

Open `pocket-circuit.html` through a static HTTP server. This is a browser-only,
top-down miniature racer using the repository's pinned local Three.js 0.180.0.
No install, backend, external asset requests or new runtime dependencies are
required. A generated 239 KB material atlas is served locally with the game.

## Maps

`tracks.js` selects the room generator. Desk Derby's v2 flagship uses a designed
sequence of household surfaces in `desk-track.js`: a low notebook climb, a raised
book stack, a ruled bridge, a paper ramp, cutting-mat bends, a separate underpass,
a paper sweep and a pencil chicane. Its 512 equal-distance points carry height,
width and material. Seeds make bounded variations around the designed connections.
Kitchen Rush and Toybox GP retain their original v1 flat layouts in this revision.

`surface.js` supplies poses and progress-local projections to the driving model.
The bridge is twelve units high; the underpass is a different portion of the lap.
Both collision and race progress retain the current road layer. Capsule contacts
use interpolated widths (12–24 units). Cars on different levels cannot collide or
claim each other's boost pads. Ordered gates retain the existing lap rules.

`desk-world.js` builds beveled books with layered page edges, ruled ramps, a ruler
with measurement markings, a detailed keyboard with instanced caps
and legends, mugs, pencils, notebooks, a monitor and an articulated desk lamp.
The wood, paper, cloth and mat use [original generated textures](../../images/pocket/materials/README.md).
Overlapping pencil barriers follow both sides of the entire course, including
the slopes, bridge and start/finish join. Shared ramp edge vertices prevent torn
paper joins; direction arrows stay on level surfaces. The barrier bodies share
low-poly geometry and merge into the existing material batches. A small player-coloured ring
keeps the car readable while it passes under the ruler. Paper reduces lateral grip
and the cutting mat increases it. Other rooms retain their original props.

Geometry keeps the elevation and route boundaries independent of image resolution.
No Python map job or scheduled bank is needed. Each room gets a daily seed at
midnight UTC; Remix adds a numbered seed. An active cup retains its seed across
all three rooms, including a midnight rollover. Desk v2 records remain separate
from its original flat v1 course; old records are preserved. Bump the track ID
version before changing geometry or handling that invalidates records.

## Play

- W/Up: throttle. S/Down: brake, then reverse. A/D or Left/Right: steer relative
  to the car. Space: handbrake. R: checkpoint recovery with a three-second penalty.
- Escape pauses/resumes through the native dialog. Focus loss, hiding the tab,
  mobile rotation and fullscreen changes pause and clear held controls.
- Touch uses Apex Drift's per-finger steering/pedal controls and stable mobile
  play shell. Check physical iOS/Android devices for OS gesture and audio behavior.
- Three laps with seven ordered intermediate gates and a forward finish crossing.
  The clock starts at GO, including the grid approach; lap splits start at the line.
- Yellow pads provide 0.9 seconds of acceleration/top-speed boost, once per lap,
  with the existing HUD meter and no popup announcement.
- Cup mode races all three rooms from the selected starting room. Four racers
  score 10/6/4/2. At the player's finish, unfinished rivals are ordered by progress.
  Their finish times are never invented. Final ties use the last race order.
- Quick race runs only the selected room. Time trial removes rivals. Race and
  trial records are separate. A replay retains the selected layout.

## Reuse and performance

`main.js` imports Apex's keyboard/touch input, mobile shell and recorded audio.
`world.js` imports its car factory; `race.js` imports its gearbox/audio feedback.
Math and formatting are shared too. Apex source and records remain independent.
Pocket records, paint and sound live under `pocket-circuit:v1`, with at most 80
layout/mode entries and an in-memory fallback. No data is transmitted.

Simulation runs at a fixed 120 Hz with a bounded frame accumulator. The renderer
caps device pixel ratio at 1.75; HUD updates run at about 10 Hz. Immutable opaque
desk meshes merge into material batches, with instanced keycaps. Car meshes also
batch by material while retaining working brake lights. The directional shadow
map renders once per layout; cars use small soft contact shadows. Four
512-pixel material textures stay cached across room changes. Changing rooms
disposes map geometry and transient textures; replacing cars uses the shared
disposal helper. Hidden tabs stop rendering and pause racing.
The north-fixed orthographic camera lowers from about 68° to 58° above the surface,
showing book edges and ramps while keeping the driving route readable. The view
follows road height smoothly. Canvas `data-draw-calls` and `data-triangles` expose
renderer counts for development without adding debug controls to the player UI.
Sound uses the existing licensed local loops (`../drift/sounds/CREDITS.txt`).

## Verification and deployment

Run from the repository root:

```text
node --test tests/pocket/*.test.mjs
node --test tests/drift/*.test.mjs
python scripts/validate_static_assets.py
python scripts/drift/build_static.py
python scripts/validate_static_assets.py dist
```

The existing static exporter includes the page and game automatically. The
existing deployment workflow now runs the Pocket simulation tests too. Deploy
through the site's existing Cloudflare Pages process; no new hosting is needed.

Tests cover seeded reproducibility, road separation, prop clearance, complete
three-lap AI races on all rooms/multiple seeds, ordered gates, reverse crossing,
reset penalties, pause, boost farming, wall impacts and defensive local records.
Additional v2 checks cover continuous grades, variable widths, separate crossover
projections, recovery at bridge height, and cross-level collision/boost isolation.
