# Pocket Circuit

Open `pocket-circuit.html` through a static HTTP server. This is a browser-only,
top-down miniature racer using the repository's pinned local Three.js 0.180.0.
No install, backend, image downloads or new runtime dependencies are required.

## Maps

`tracks.js` generates a smooth, closed track from a versioned seed, room profile
and UTC date. Equal-distance samples feed the road ribbons, visible tape rails,
bumper collision capsules, ordered checkpoints, minimaps and AI look-ahead.
Desk Derby, Kitchen Rush and Toybox GP have different silhouettes, materials and
household props. Large room-specific objects anchor the scenery; remaining props
are placed deterministically with their full bounding circles outside the road.
Everything is geometry or a small canvas texture generated locally.

This is preferable to a huge raster map: geometry scales to every screen, avoids
large asset downloads, and keeps collision boundaries aligned with the visible
track. It also needs no Python job or scheduled map bank. Each room gets a daily
seed at midnight UTC; Remix adds a numbered seed. An active cup retains its seed
across all three rooms, including a midnight rollover. Bump the generator version
in the seed and track ID before changing layouts/handling that invalidate records.

## Play

- W/Up: throttle. S/Down: brake, then reverse. A/D or Left/Right: steer relative
  to the car. Space: handbrake. R: checkpoint recovery with a three-second penalty.
- Escape pauses/resumes through the native dialog. Focus loss, hiding the tab,
  mobile rotation and fullscreen changes pause and clear held controls.
- Touch uses Apex Drift's per-finger steering/pedal controls and stable mobile
  play shell. Check physical iOS/Android devices for OS gesture and audio behavior.
- Three laps with seven ordered intermediate gates and a forward finish crossing.
  The clock starts at GO, including the grid approach; lap splits start at the line.
- Yellow pads provide 0.9 seconds of acceleration/top-speed boost, once per lap.
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
caps device pixel ratio at 1.75; HUD updates run at about 10 Hz. Road strips use
batched geometry. Changing rooms disposes old geometry/textures; replacing cars
uses the shared disposal helper. Hidden tabs stop rendering and pause racing.
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
