# Apex Drift

A static Three.js driving game at `/drift.html`. No application server, account,
database, package installation, or JavaScript build step is needed to play.
The game has its own cyan-and-violet interface, separate from the main website,
with a night-city circuit preview, spacious launch menu, and illustrated driving guide.
All geometry is created locally; recorded engine and tyre audio is freely licensed and self-hosted (see `sounds/CREDITS.txt`). No assets were copied from DailyDrift.

## Run locally

From the repository root, with Python 3.12+ and Node 22+ installed:

```sh
python scripts/drift/generate_tracks.py
python -m http.server 8000
```

Open `http://localhost:8000/drift.html`. ES modules and track fetching require HTTP;
opening the HTML directly as a `file:` URL is unsupported.

```sh
node --test tests/drift/*.test.mjs
python -m unittest discover -s tests/drift -p 'test_*.py'
python scripts/drift/build_static.py
```

The final command exports the **whole public website** to `dist/`, excluding Git
metadata, tests, Python tooling, and documentation. Cloudflare Pages can use
`python scripts/drift/generate_tracks.py && python scripts/drift/build_static.py`
as its build command, and `dist` as its output directory. The build needs Python.
Using the existing root-directory deployment also works with the checked-in bank.

## File map

| File | Responsibility |
| --- | --- |
| `drift.html` (repository root) | Accessible page, menus, race HUD, dialogs |
| `css/drift.css` | Standalone game theme, lobby, tutorials, and responsive menus |
| `css/drift-play.css` | Race HUD, floating controls, mobile safe areas and scroll lock |
| `css/drift-garage.css` | Garage and input-blocking loader |
| `games/drift/tutorial.js` | Keyboard-accessible keyboard/touch tutorial tabs |
| `css/racing-nav.css` | Shared bordered link and waving checkerboard animation |
| `games/drift/main.js` | Loading, UI state, fixed-step loop, UTC rollover |
| `games/drift/config.js` | Race length, physics tuning, archive and storage limits |
| `games/drift/physics.js` | Arcade acceleration, grip, steering, handbrake, runoff |
| `games/drift/road-surface.js` | Shared elevated road frames, crossover routing and vertical-loop poses |
| `games/drift/race.js` | Countdown, checkpoints, laps, drift combos, reset penalties |
| `games/drift/world.js` | Three.js track, car, scenery, camera, tire marks |
| `games/drift/preview-camera.js` | Distance-based cinematic circuit fly-through |
| `games/drift/input.js` | Keyboard and multi-touch input, focus-loss handling |
| `games/drift/touch-controls.js` | Per-finger ownership, sliding pads, pointer capture and cleanup |
| `games/drift/mobile-play-view.js` | Stable phone play area, page locking/restoration, rotation |
| `games/drift/audio.js` | Recorded engine/tyre mixer and start-light tones |
| `games/drift/storage.js` | Versioned, defensive local-storage adapter |
| `games/drift/track-loader.js` | Track files, validation, UTC archive filtering |
| `games/drift/math.js` | Shared track projections, poses, formatting |
| `games/drift/tracks/` | Dated JSON circuits and a manifest |
| `lib/` (repository root) | Pinned local libraries, icons, fonts, and licenses |
| `scripts/drift/` | Python circuit generation, refill configuration, static export |
| `tests/drift/` | Simulation, persistence, date filtering, generator tests |
| `.github/workflows/drift-tracks.yml` | Scheduled generation and optional Pages deployment |

CSS is authored directly here; the existing site's compiled SCSS remains separate.
The game uses its own navigation. Main-site navigation is duplicated in the other
static pages and `partials/navbar.html`;
update all copies when adding links, as there is no server-side template include.

## Daily circuits and the archive

The generator uses a SHA-256 seed of the UTC date and generator version. Version 9
uses **14-metre roads**, three distinct sketch-inspired layout families and 640
evenly spaced planar points. The first is a polished trace of the supplied drawing;
the others replace the southern districts and change the route proportions and
orientation. Small seeded scale and rotation changes give later dates variation.
Pen kinks are rounded to centreline radii of at least 20 metres, with linked drift
corners and returning sweepers rather than abrupt zigzags.

Version 9 adds linked S bends along the western and northern runs and bends
sustained flat sections after smoothing. Geometry tests cap nearly flat runs at
240 metres across 60 dates. Powered-slide and handbrake grip are reduced by 10%
(1.935 and 1.08); normal road grip remains 6 for clean recovery. Revised circuits
and handling use v10 personal records. Fullscreen is hidden on touch devices and
phone-width screens, including the mobile play view.

Every crossover receives a 12-metre raised deck, 105-metre eased ramps and a
35-metre level approach around the crossing. An elevation array accompanies the
planar points; local progress searches keep cars on their own road at overlaps.
The stunt family adds an 18-metre-radius vertical loop on a level straight. Its
entry pad provides at least 20 m/s (45 mph), and guided arcade grip carries the
car through the complete circle before returning steering control. There is no
gravity slowdown or falling simulation. Road, barriers, car pitch, lights, tyre
marks and chase-camera height follow the surface. Checkpoints and resets retain
the correct progress and road height. The loop does not earn drift points.

The development bank contains **four circuits**, initially dated 2026-10-11 through
2026-10-14: two recent dates, today and tomorrow. The browser exposes only dates
up to today; the upcoming circuit unlocks at midnight UTC. A race already underway
stays attached to its original date. A missing daily file is shown as unavailable.

Change `scripts/drift/track-bank.json` to configure the rolling bank:

- `archive_days`: previous dates retained (development setting 2).
- `minimum_future_tracks`: refill below this future count (development setting 1).
- `refill_future_tracks`: future dates prepared (development setting 1).

Bank maintenance also prunes excess dates when these settings are reduced.
The browser still supports up to ten archive dates via `archiveDays` in
`games/drift/config.js`; raise the bank settings again when development is complete.
`--today YYYY-MM-DD` provides a reproducible reference date for development.

The workflow runs at **22:43 UTC daily** and supports manual dispatch. It caches
the bank and exports a static-site artifact. The small development buffer needs
regular generation; restore a larger future buffer before relying on scheduled
production refreshes. Publication remains separately configurable below.

### Enable automatic publication on your existing Cloudflare Pages site

The workflow is prepared but **publication is not enabled or configured by this change**.
It requires repository settings, not a running game backend:

1. Add GitHub Actions secrets `CLOUDFLARE_API_TOKEN` (Cloudflare Pages Edit permission
   for the relevant account) and `CLOUDFLARE_ACCOUNT_ID`.
2. Add repository variables `CLOUDFLARE_PAGES_PROJECT` and
   `CLOUDFLARE_PRODUCTION_BRANCH`, matching the existing Pages project's exact values.
3. Set `DRIFT_AUTO_DEPLOY` to `true` and manually run **Refresh daily circuits** once.
4. Verify the production deployment and keep the daily scheduled workflow enabled.

This uses Wrangler direct deployment to the existing Pages project and exports all
public pages, not just the game. If using a Git-integrated Pages project, coordinate
its existing automatic builds so competing pipelines do not overwrite deployments.
The track generator should also run in that pipeline so regular source deployments
cannot reintroduce an old bank. No credentials belong in the repository.

References: [Cloudflare CI direct upload](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/),
[Wrangler Action](https://github.com/cloudflare/wrangler-action),
[GitHub scheduled events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Controls and race rules

W/↑ accelerates; S/↓ brakes then reverses; A/D or ←/→ steers. Space lowers rear grip;
tap while turning, then release and countersteer. R resets to the last checkpoint
with a five-second penalty; Escape pauses. Losing window focus also pauses. Touch
devices receive independent steering, throttle, brake, and handbrake buttons.

On coarse-pointer devices and phone-width windows, starting a race opens a fixed
mobile play view and locks page scrolling. Exit restores the original page position.
The play area reserves space for expanded browser toolbars using the small viewport;
toolbar retraction does not move held buttons. Safe-area padding protects the home
indicator and cutouts. Rotation, fullscreen changes, and a smaller usable viewport
pause the run and release all inputs before rebuilding the layout. Pause and results
stay in the play view; background page controls are inert until exit.

Touch controls have larger targets and independent pointer ownership. A steering
thumb can slide left through a neutral centre into right without lifting. Leaving
a pad releases its action, while returning resumes it. Pedal gaps are neutral, and
lifting/cancelling one finger never releases another. Interrupted capture, focus
loss, pause, and exit clear the appropriate inputs. Desktop keyboard mappings are
unchanged. Portrait play widens the camera lens to keep the road visible around
the floating controls. No auto-throttle or joystick is enabled.

Browser previews verify layout and pointer handling, but physical iOS Safari and
Android Chrome checks are still needed for OS edge gestures and actual browser bars.

Three ordered quarter-track checkpoints must be passed on asphalt each lap. A run
finishes after three laps. Drift points require speed, a slide angle, and new forward
progress. Repeating a bend cannot farm points. Linked slides retain a combo for 1.4
seconds and grow the multiplier to ×5. Leaving the road banks a combo. There is no
global leaderboard or claim of cheat-proof scoring.

The simulation uses metres, seconds, and a 120 Hz fixed update. The render loop uses
the screen refresh rate, while HUD updates are throttled. Frame time is clamped after
stalls; long background gaps never fast-forward the car.

Top forward speed is 32 m/s (about 115 km/h), with gentler acceleration and steering
than the initial prototype. Throttle slides still work at the lower cornering pace.
`CAMERA_CONFIG` in `config.js` controls a low chase camera: 10 m behind, 4.8 m high,
52-degree vertical field of view. Its heading follows smoothly through slides while
its position stays attached to the car, keeping the view scale stable at speed.
This was tuned by playing DailyDrift; it approximates the observed framing and feel
rather than claiming identical physics or copying its implementation.

## Records, privacy, and future backend

The `apex-drift:v9` local-storage entry holds sound preference and up to 64 dated
records: best total score, fastest finish (which may be from a different run), and
completed-run count. There is no tracking or data upload. If storage is inaccessible,
records stay in memory for the current visit and the page clearly says so. Clearing
site data removes saved records. Libraries, icons, and fonts are served locally from
the shared `lib/` directory; there are no browser requests to third-party CDNs.
The original `apex-drift:v1` records remain untouched, but are not compared with
times and scores on the revised layouts and handling.

To add a C# API, replace the storage adapter and add authentication/score validation.
Keep the driving loop in JavaScript. Three.js remains self-hosted, pinned, and licensed.
The prototype uses recorded engine/tyre audio and geometric scenery/car art; driving
feel can be tuned independently from graphics and styling.


### Garage and loading surfaces

Open **Garage** from the page, the selected car under the start button, or the pause/results panel. The responsive native dialog previews Sora GT (coupe), Metro RX (hatchback), and Vandal V8 (muscle) with palette/custom paint, twin stripes, three wheel finishes, and an optional spoiler. Rotate the preview with its two buttons. **Use this build** applies and saves; close/Escape discards the draft. All three use identical physics and scoring, so existing records remain comparable. Garage storage is separate from race records and falls back to memory if browser storage is blocked.

- `garage-data.js` owns the model specifications, allowed options, save validation, and local preferences. Add body specifications here and corresponding geometry details in the factory to extend the roster.
- `car-model.js` creates the exact same car in the garage and circuit; it also disposes shared geometry and materials when a car is replaced.
- `garage.js` owns the draft, controls, and on-demand Three.js preview. It releases the preview renderer between visits and uses a fresh canvas when reopening to avoid stale WebGL context events.
- `loading-overlay.js` owns a nested input lock with a native top-layer dialog, real operation messages, reduced-motion support, and cleanup on success or failure. Scene preparation compiles shaders before submitting a rendered frame. The simulation freezes while loading, and held controls are cleared before preparation. Background-tab interruptions still pause a run.
- `css/drift-garage.css` contains the garage and loader styling, with independent surface tokens for the upcoming game theme. Dialog actions remain visible while their contents scroll on small screens. The dialogs live inside the game stage so they work in fullscreen and the mobile play shell.

Everything remains static, local, and backend-free. No additional libraries or downloaded car models are required.


### Track edges and solid barriers

Road edges have a 0.32-metre pale line, a one-metre paved shoulder, then a dark concrete wall 0.95 metres high and 0.5 metres thick. Integrated amber arrows and barrier-mounted streetlights follow the raised road heights. Start/finish supports and checkpoint markers sit beyond the walls.

`TRACK_EDGE_CONFIG` in `config.js` owns shared dimensions. `road-surface.js` supplies shared surface frames to the road ribbons and `barrier-mesh.js`; `track-edges.js` resolves body contacts against the same road corridor. The walls are continuous prisms with joined endpoints, rendered as two batched meshes rather than hundreds of draw calls. This avoids gaps between rotated blocks in tight corners.

The physics resolves body corners, bumper centres and side midpoints against the corridor after each fixed step, removing outward velocity while preserving slower motion along the barrier. A small contact margin keeps wheels and body clear of the visible wall; all cosmetic models share a hitbox large enough for the widest and longest car. Contact banks the current combo and stops wall scraping from earning drift points. A conservative clearance test skips detailed collision work away from the edges.

The complete checked-in bank has been regenerated. Records use `apex-drift:v9` to avoid comparing previous layouts with the new challenge; previous records remain untouched in their old storage entries. The separate garage save is preserved. Scheduled track cache keys also use v8, so an old cached bank cannot restore superseded layouts.

## Cinematic lobby preview

The start-screen camera follows a closed Catmull–Rom spline eight metres per second,
5.2 metres above the centreline, looking 18 metres ahead. It loops continuously
without changing the car or race clock. Desaturation, darkening and a vignette
apply only to the preview canvas and disappear immediately on Start. Reduced-motion
users receive a stationary overview; off-screen and hidden previews stop animating.
The existing driving camera, handling, scenery and mobile play lock are preserved.

Night scenery uses procedural city blocks, instanced windows, rooftop neon, six nearby streetlights and layered additive road glints. Glints are stylised reflections rather than real-time mirror reflections. City blocks clear the driving corridor; physics and layouts are unchanged.

Pacing: 40 m/s (89 mph) forward cap, 17.5 m/s² acceleration and 28 m/s² braking. Speed adds up to twelve degrees of camera FOV and lowers the chase view slightly; reduced-motion mode disables these camera effects. A bounded pool of 96 soft smoke sprites emits from both rear tyres during scored drifts, trailing backwards and opposite actual lateral velocity. Pause freezes smoke and resets clear it. Redesigned circuits use the v9 records namespace, preserving earlier device data.

Street-race boundaries use dark wall faces with repeated forward-pointing amber chevrons and a thin amber cap. Barrier-mounted streetlights alternate sides at approximately 30-metre arc-length intervals; six nearby lights illuminate the road while all lamp heads remain visible. Slightly reduced grip makes powered and handbrake slides easier, while releasing the handbrake restores traction.

Circuit selection upgrades the native select to an animated, keyboard-accessible list of route cards with small SVG maps, dates, distances and feature badges. Arrow keys/Home/End navigate; Enter selects; Escape/outside clicks dismiss. The panel uses the browser top layer when available and stays within the viewport. The original select supplies race locking and remains a fallback if the enhancement fails to load. The header wheel spins and emits CSS smoke on hover or keyboard focus; reduced-motion settings stop these decorative animations.

The freestanding directional-helper panels and posts have been removed. Both inner wall faces now carry batched orange chevrons aligned with increasing track progress, including bridge and inverted loop surfaces. The solid collision boundary and barrier-mounted lamps are preserved.

Driving feedback uses one cosmetic automatic gearbox for engine pitch, the animated 0–100 mph dial, RPM strip and gear readout. Shifts include hysteresis and drop RPM without changing acceleration. Brake/handbrake use builds disc heat; discs cool gradually and brake lights brighten. Tyre smoke emission rate, plume size and recorded squeal increase with slide angle. Wall scrapes produce a bounded 72-particle spark effect; reduced motion disables sparks. All audio obeys the sound toggle and pauses with the race.

### Sound and start sequence

Sound defaults on and unlocks synchronously from the Drive/Resume gesture, before loading or animation awaits. The small speaker button mutes every channel and cue, with a red slash when muted. Explicit choices persist; legacy default-off records migrate once without losing scores. Lite mode and its renderer/smoke switches have been removed.

The mixer crossfades idle and rev recordings, follows RPM and automatic shifts, changes engine brightness/volume under throttle, and blends recorded tyre squeal according to slide angle. A master compressor controls peaks. Local 44.1 kHz/16-bit PCM assets total about 664 KiB; download/decode failures can be retried without duplicate audio nodes. `sounds/CREDITS.txt` documents CC0/CC BY sources, adaptations and licences, and is linked in the public footer. `scripts/drift/prepare_audio.py` prepares downloaded sources with mono conversion, level adjustment and a crossfaded loop seam.

`start-sequence.js` follows the simulation's three-second countdown: READY at the beginning, SET halfway, then GO when driving starts. Two short beeps precede a higher, longer third beep at GO. The animated three-light panel scales for mobile and respects reduced motion. Pausing freezes the sequence and silences audio; resuming never repeats a previously played cue.

Near-miss challenges deterministically place four to eight shoulder-side parked cars/construction barriers on suitably straight, level sections, outside starts/checkpoints, bridge approaches and loop entries. Shared rectangular hitboxes preserve the open centre lane. A clean forward pass above 12 m/s, within 1.25 m of the obstacle body, pays 250 points once per obstacle per lap. Contact, reversing and runoff invalidate the encounter; resetting cannot repeat a claimed reward. Total score includes drift and near-miss bonuses. Narrower roads and new scoring use v9 device records, preserving previous data.

Version 8 circuits target 1–2 miles per lap, measured along the elevated road and full stunt path. Current laps are about 1.42 miles (Sketch Run), 1.60 miles (Neon Borough) and 1.48 miles (Skyline Stunt Run). Menu distances are miles; dial and digital speed are mph. Physics still uses metres and seconds internally.

The stunt loop shifts 24 metres to the right during its full turn, with tangent-matched entry/exit straights and a smooth return into the normal route. The car enters on the left and exits on the right facing its original direction. A shared orthonormal surface frame positions the road, walls, car and chase camera, including inversion. The camera stays nine metres behind the car rather than cutting to a side view. A cached arc-length table preserves travel speed through the lateral shift.

Handling refinement: handbrake grip is 1.2 and powered-slide grip is 2.15, with a 0.45-second progressive return to road grip after releasing a handbrake tap. Handbrake longitudinal drag is reduced to retain pace. Acceleration rises by roughly 17%; maximum speed remains about 89 mph. The chase camera sits closer and lower, widening from 56 to 68 degrees as speed builds; reduced motion disables the speed-dependent changes. Updated handling uses v9 personal records while the track generator/cache remains v8.
