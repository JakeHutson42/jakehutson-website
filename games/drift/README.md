# Apex Drift

A static Three.js driving game at `/drift.html`. No application server, account,
database, package installation, or JavaScript build step is needed to play.
The game has its own cyan-and-violet interface, separate from the main website,
with a night-city circuit preview, spacious launch menu, and illustrated driving guide.
All geometry and engine audio are created locally; no assets were copied from DailyDrift.

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
| `games/drift/race.js` | Countdown, checkpoints, laps, drift combos, reset penalties |
| `games/drift/world.js` | Three.js track, car, scenery, camera, tire marks |
| `games/drift/preview-camera.js` | Distance-based cinematic circuit fly-through |
| `games/drift/input.js` | Keyboard and multi-touch input, focus-loss handling |
| `games/drift/touch-controls.js` | Per-finger ownership, sliding pads, pointer capture and cleanup |
| `games/drift/mobile-play-view.js` | Stable phone play area, page locking/restoration, rotation |
| `games/drift/audio.js` | Optional synthesized engine audio |
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

The generator uses a SHA-256 seed of the UTC date and generator version. Version 4
uses a **14-metre road**, explicit 180-degree switchbacks and alternating S-bends.
Each layout must have at least three sustained corners turning 155 degrees or more,
at least 18 meaningful curvature reversals, and at least 23 radians of accumulated
absolute turning. These are geometry checks, not a displayed corner count.
Centreline radii below 18.9 metres and nearby overlapping road sections are rejected.
The loop is resampled to 320 evenly spaced points, then its start is moved to a
gentle section. Seeded reflection, rotation, lane lengths, bend amplitudes and
hairpin radii vary the rhythm while keeping joins tangent and roads separated.

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

The `apex-drift:v4` local-storage entry holds sound preference and up to 64 dated
records: best drift score, fastest finish (which may be from a different run), and
completed-run count. There is no tracking or data upload. If storage is inaccessible,
records stay in memory for the current visit and the page clearly says so. Clearing
site data removes saved records. Libraries, icons, and fonts are served locally from
the shared `lib/` directory; there are no browser requests to third-party CDNs.
The original `apex-drift:v1` records remain untouched, but are not compared with
times and scores on the revised layouts and handling.

To add a C# API, replace the storage adapter and add authentication/score validation.
Keep the driving loop in JavaScript. Three.js remains self-hosted, pinned, and licensed.
The prototype uses synthesized engine audio and geometric scenery/car art; driving
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

Road edges have a 0.32-metre white line, a one-metre desert verge, then a red/white wall 0.95 metres high and 0.5 metres thick. The existing desert scenery, horizon, materials and lighting remain in use. Start/finish supports and checkpoint markers sit beyond the walls.

`TRACK_EDGE_CONFIG` in `config.js` owns shared dimensions. `track-edges.js` provides the same offset vertices to the renderer's road ribbons and `barrier-mesh.js`. The walls are continuous prisms with joined endpoints, rendered as two batched meshes rather than hundreds of draw calls. This avoids gaps between rotated blocks in tight corners.

The physics resolves body corners, bumper centres and side midpoints against the corridor after each fixed step, removing outward velocity while preserving slower motion along the barrier. A small contact margin keeps wheels and body clear of the visible wall; all cosmetic models share a hitbox large enough for the widest and longest car. Contact banks the current combo and stops wall scraping from earning drift points. A conservative clearance test skips detailed collision work away from the edges.

The complete checked-in bank has been regenerated. Records use `apex-drift:v4` to avoid comparing previous layouts with the new challenge; previous records remain untouched in their old storage entries. The separate garage save is preserved. Scheduled track cache keys also use v4, so an old cached bank cannot restore superseded layouts.

## Cinematic lobby preview

The start-screen camera follows a closed Catmull–Rom spline eight metres per second,
5.2 metres above the centreline, looking 18 metres ahead. It loops continuously
without changing the car or race clock. Desaturation, darkening and a vignette
apply only to the preview canvas and disappear immediately on Start. Reduced-motion
users receive a stationary overview; off-screen and hidden previews stop animating.
The existing driving camera, handling, scenery and mobile play lock are preserved.

Night scenery uses procedural city blocks, instanced windows, rooftop neon, six nearby streetlights and layered additive road glints. Glints are stylised reflections rather than real-time mirror reflections. City blocks clear the driving corridor; physics and layouts are unchanged.

Pacing: 40 m/s (144 km/h) forward cap, 15 m/s² acceleration and 28 m/s² braking. Speed adds up to eight degrees of camera FOV and lowers the chase view slightly; reduced-motion mode disables these camera effects. A bounded pool of 96 soft smoke sprites emits from both rear tyres during scored drifts, trailing backwards and opposite actual lateral velocity. Pause freezes smoke and resets clear it. Faster runs use the v5 records namespace, preserving earlier device data.
