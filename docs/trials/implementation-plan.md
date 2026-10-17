# Trials-inspired browser game — implementation plan

Planning baseline: 16 October 2026. This document proposes work; it does not implement or deploy the game.

## Decisions and recommended scope

Confirmed by Jake:

- Trials-style 2.5D: fully 3D presentation, side-view riding, movement constrained to a vertical plane.
- First biome: industrial quarry, combining machinery, rock and timber.
- Desktop keyboard and controller first; mobile controls and optimisation follow.

Confirmed by Jake: development-time asset generation uses Python driving headless Blender. Python-only track generation remains independent of Blender. No Blender executable was found on PATH or in the checked standard installation locations; use an official portable copy for development if needed.

Proposed defaults, adjustable without blocking the architecture:

- Working title **Quarry Trials**, page `/trials.html`; original branding, bikes, riders and scenery.
- Precise, learnable handling with convincing weight, suspension and traction; generous early tutorials and progressively technical obstacles.
- One polished biome and one tuned bike before additional worlds or handling classes.
- First content release: six curated quarry courses, two each at beginner, intermediate and advanced difficulty, plus a separately labelled generated challenge bank once validated.
- Time and faults determine results: fewer faults rank first, elapsed time breaks ties. Medals have explicit fault/time requirements.
- Browser-local progress and best runs. Online competition, multiplayer and a public level editor are separate future projects.

## What the existing games establish

Reviewed `drift.html` and `pocket-circuit.html` in the local browser, plus their runtime, generator, documentation and deployment code. Pocket Racer is named **Pocket Circuit** in this repository.

- Both are static, self-hosted ES-module games using local Three.js **0.180.0**. Their distinct interfaces share a clear hierarchy: wordmark, live scene, launch panel, world selection, controls and records.
- Apex Drift has useful patterns for loading, fullscreen, input clearing, reduced motion, defensive local storage and resource cleanup. Its driving model is arcade road following; the motorcycle needs a new rigid-body simulation.
- Pocket's Desk Derby uses an authored sequence with bounded seeded variation. This is a better foundation for trials courses than arbitrary terrain noise.
- Pocket uses a 120 Hz fixed simulation step and rendering budgets. The new game should retain that separation of simulation and presentation.
- `scripts/drift/build_static.py` already exports root HTML and `css`, `games`, `images` and `lib`. Keeping public assets in those folders makes the new game compatible with the existing export.
- Main-site navigation is duplicated in `index.html`, `browser-device.html`, `droidframe.html`, `privacy.html` and `partials/navbar.html`, with desktop/mobile copies. Add the game link consistently when it is ready to advertise.

Reuse pinned Three.js, fonts, navigation conventions and proven lifecycle patterns. Share helpers only where their interfaces fit. Introduce a trials input adapter for analog throttle/lean and controller support rather than forcing motorcycle controls into the car input class. Keep existing games and record formats independent.

## Architecture

| Layer | Responsibility | Proposed implementation |
| --- | --- | --- |
| Page and menus | Lobby, track selection, instructions, accessible dialogs, HUD | Buildless HTML/CSS and ES modules |
| Simulation | Bike, rider mass, contact, checkpoints, faults, input timeline | Rendering-independent JavaScript |
| Physics engine | Rigid bodies, wheel contacts, springs, motors, joint constraints | Locally vendored, pinned Planck.js; prove suitability in phase 1 |
| Presentation | Bike/rider articulation, scene, camera, lighting, effects | Existing Three.js 0.180.0 |
| Content specifications | Dimensions, attachment points, surfaces, obstacle recipes, biome rules | Versioned JSON with strict validation |
| Generation | Bikes, riders, environment kit, course composition, materials | Python; Blender asset backend if accepted |
| Playability verification | Input search, witness runs, perturbation tests | Headless Node using the production simulation |
| Publication | Checked-in approved assets and courses, ordinary static export | Existing Cloudflare Pages process |

Planck is the initial choice because it is a JavaScript Box2D implementation with a wheel joint designed for vehicle suspension. This is an engineering recommendation, not a claim to reproduce RedLynx's proprietary simulation. Its spring, contact and high-speed behaviour must pass the test course before content production grows. [Planck overview](https://piqnt.github.io/planck.js/docs/), [wheel joint API](https://piqnt.github.io/planck.js/docs/api/classes/WheelJoint.html).

Physics uses metres, kilograms, seconds and radians: **X forward, Y up**. Rendering uses the same axes, with Z for depth. Explicit conversion at the asset boundary handles Blender coordinates. Rideable geometry stays in a single plane initially; track metadata can identify route sections without introducing curved riding planes or crossovers yet.

Start with 120 Hz fixed updates, bounded catch-up, and interpolation for drawing. Hidden tabs pause; long stalls cannot advance the clock or cause a giant collision step. Browser and Node execute the same simulation module. Test repeatability within the pinned environment with numeric tolerances; do not assume bit-identical results across every browser and CPU.

### Bike and rider behaviour

- Separate chassis and wheel bodies with rear-wheel drive, torque limits, angular-speed limits, braking, contact friction and damped suspension. Frame and wheels have collision geometry; the bike cannot survive everything just because the wheels have not hit a kill plane.
- Derive physical dimensions, joint anchors and visual pivots from one bike specification. The visible tyres, wheel centres and contact circles must agree.
- A constrained rider mass proxy moves relative to the chassis with bounded forces and travel. Lean must alter the physical response, not just rotate a mesh. Allocate rider mass once; do not count it both in chassis mass and a separate body.
- Begin with a stable pelvis/torso approximation. Add limb collision and crash ragdoll complexity after the core bike is controllable. Ground contacts for the helmet/body determine faults; normal wheelies do not.
- Grounded weight transfer enables wheelies, rear-wheel balance and controlled landings. Airborne correction is bounded and tuned explicitly; no unlimited angular acceleration. Suspension compression/release should support later bunny-hop techniques.
- Visual pelvis/spine pose follows the mass proxy and impacts. Runtime two-bone IK keeps hands on bars and boots on pegs, with joint limits and reachable targets. Fork extension, swingarm angle, wheel rotation and shock compression follow physics.
- Camera look-ahead considers velocity and the next obstacle, keeps take-off/landing visible, and avoids large vertical jolts. Reduced motion removes impact shake and optional camera effects.

Faults count once per failed attempt. R retries the latest checkpoint; Backspace restarts the course; Escape pauses. Retry restores an authored safe bike/rider pose, clears all velocities, contact state and held input, and resumes the existing timer/fault rules. Full restart resets both. Checkpoints require an ordered directional crossing, and cannot be activated by a detached crashed body.

## Python generation system

The asset pipeline is a small production toolchain with separate stages, explicit contracts and useful diagnostics. Scripts run during development or offline builds; visitors receive ordinary static files. Design below assumes the recommended Blender backend; if declined, preserve the specifications and orchestration while implementing a standalone mesh/GLB exporter and adjusting rig/material scope explicitly.

### Proposed tool layout

```text
trials.html
css/trials.css
games/trials/
  main.js, game-state.js, input.js, storage.js, audio.js
  simulation/          # bike, rider, contacts, checkpoints, replay
  rendering/           # scene, camera, asset-loader, bike/rider views
  content/             # approved manifests, course JSON, public specs
  assets/              # GLBs, textures, thumbnails, local sounds
scripts/trials/
  build.py             # explicit subcommands; dependency ordering and cache
  specs/               # source bike, rider, obstacle and biome definitions
  common/              # schema checks, seeded RNG, geometry, manifests
  assets/              # bike/rider/prop/material generators and exports
  courses/             # module grammar, composition, clearance and pacing
  qa/                  # asset checks, previews, reports, bank acceptance
tests/trials/
  *.test.mjs, test_*.py
docs/trials/
  implementation-plan.md, phase-1-prompt.md
```

This is an intended separation of responsibilities. Create modules when they have real work; phase 1 should not contain a forest of empty frameworks.

### Build orchestration and reproducibility

- One documented entry point, with `assets`, `courses`, `validate` and `all` commands introduced as implemented. Accept explicit seed, specification, output directory and quality tier.
- Use stable named seed streams for layout, obstacles, rocks, foliage, paint and material wear. Changing a paint detail must not rearrange the course. Never use Python's process-randomised `hash()` for seeds.
- Hash canonical specification content, generator versions and tool versions. Cache by those inputs; support a clean rebuild. Reject non-finite dimensions, missing fields, duplicate IDs and out-of-range parameters with field-specific errors.
- Generate into a verified staging directory, validate there, then atomically publish the manifest after outputs exist. Failed jobs retain the previous approved content; they do not silently emit an empty course bank.
- Include tool versions, seeds, content hashes, polygon/material counts, bounds, sockets, collision data and validation results in reports. Keep timestamps outside content identity.
- Pin Python dependencies and the selected Blender release; find Blender through an explicit path/configuration and known installation locations. Missing tooling produces actionable diagnostics. No automatic installation or hidden network downloads in generation scripts.
- Require equivalent content/specification hashes and geometric output on repeated builds. Binary GLB hashes are a stronger goal only after removing incidental metadata and establishing exporter repeatability.
- Keep generation scripts, `.blend` sources, caches and large QA renders outside exported public folders. Commit the compact approved runtime bank; ordinary site deployment must not regenerate Blender assets or require Blender on the server.

### Bike generation

Use a constrained parametric design rather than unrelated random parts. A specification defines wheelbase, wheel radii/widths, frame control points, steering head, fork travel, swingarm pivot, shock mounts, engine envelope, bars, saddle and pegs.

Generate a coherent frame, fork, hubs, rims/spokes, tyres/tread, brake discs, engine case, exhaust and body panels. Put silhouette and believable proportions before fine bolts. Stable named pivots include chassis root, front/rear wheel, fork slider, swingarm, handlebars, shock mounts and rider sockets. Export low-cost collision shapes separately from visual detail.

Produce shared physically based materials, consistent UVs, paint masks, controlled wear and two initial detail tiers. Inspect neutral-lit side/front/three-quarter turntables plus maximum suspension compression and extension. Test mechanical clearances through the full travel range. Cosmetic variations retain the same handling identity; new geometry/handling classes receive separate physics versions and records.

### Rider generation

Generate one convincing helmeted rider first: continuous torso/limb forms, gloves, boots, protective pads and a coherent suit. Use proportions constrained to the bike's reach envelope. Avoid random human anatomy.

The rig contract names pelvis, spine, chest, neck/head, upper/lower arms, hands, thighs, shins and feet; records rest transforms, bone lengths, bind pose, attachment points and limits. Rigged GLB contains skinning data; Blender IK constraints are not assumed to transfer to Three.js. Runtime IK solves the exported skeleton explicitly.

Render neutral stance, forward/back lean, deep compression, extension and landing poses. Check weights, elbow/knee direction, skin penetration, reach and helmet silhouette at actual gameplay distance. Suit palette changes must not alter mass. A convincing procedural rider needs visual iteration; valid geometry alone does not satisfy the quality bar.

### Environment kit and biome generation

Quarry kit: stratified rock faces, cut stone blocks, timber ramps/pallets, concrete barriers, steel beams, cable reels, containers, fencing, conveyors, cranes and distant work lights. Props have dimensions, connection sockets, material IDs, collision policy, detail tiers and allowed slope/placement tags.

Biomes specify more than colour: terrain profile, obstacle vocabulary, geology/vegetation, materials, atmosphere, lighting, distant silhouettes, audio character, density and camera visibility rules. Quarry is the reference implementation. Future alpine forest, warehouse and desert scrapyard presets should reuse obstacle semantics while producing different compositions.

Place foreground, riding layer, midground and distant backdrop separately. Reserve a swept bike/rider corridor and landing sightlines. Decorative scatter cannot enter that space or hide obstacle edges. Use instancing/material atlases for repeat props; keep background physics absent unless a prop participates in gameplay.

Blender's Python scripting and headless glTF export are established workflows; exported runtime assets avoid a Blender requirement for players. [Khronos Blender/glTF automation example](https://github.com/KhronosGroup/glTF-Tutorials/blob/main/BlenderGltfConverter/README.md). Vendor Three's matching **r180** GLTFLoader and its required local utilities, adapting bare imports for this buildless repository; the loader is not present in the current `lib/three` folder. [r180 GLTFLoader source](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/loaders/GLTFLoader.js).

## Track design and generation

### Designed modules with contracts

Each obstacle recipe defines entry/exit frames, admissible approach speeds and orientations, surfaces/collision primitives, take-off and landing zones, rider clearance, skill tags, difficulty bounds, checkpoint candidates and scenery sockets.

Begin with flat run, gentle climb, rounded crest, rollers, short gap, step-up, drop and precision landing. Later introduce log/pallet balance, chained climbs, steeper technical steps and selected moving mechanisms. One heightfield cannot represent gaps, ceilings, vertical faces and bridges correctly; courses contain explicit segments/polygons and empty space.

Join modules using their entry/exit contracts, accounting for the range of outgoing speed and orientation. Match edge endpoints/normals and maintain intentional collision topology to prevent seam snagging. Derive visible rideable mesh and physics shapes from the same geometry specification. Decoration has its own seed stream.

### Pacing before randomisation

Curated courses establish a readable rhythm: introduction, rehearsal, variation, recovery, climax and finish. Beginner tracks teach throttle and lean before requiring combinations. Advanced tracks can demand precision, but checkpoints isolate deliberate challenges.

Difficulty is a vector: required skills, clearance margin, approach/landing tolerance, precision demand, challenge density, recovery cost and expected faults. Avoid a single random roughness slider. Course generation assembles a short skill/pacing plan first, chooses compatible modules second, then varies parameters within validated envelopes.

### Validation and playability

1. Validate schemas, units, bounds, collision topology, start/finish, checkpoint order and safe respawn clearance.
2. Check module connections, grade/curvature where relevant, rider envelope, take-off/landing geometry and camera sightlines.
3. Use conservative kinematic estimates only to reject clearly infeasible candidates cheaply.
4. Python launches a versioned Node verifier through structured JSON input/output with timeouts. It uses the exact production simulation and pinned engine, not a Python physics clone.
5. Replay curated witness inputs first. For new variants, use bounded search over throttle/brake/lean action segments, retaining useful progress states. Carry actual exit velocity, angular velocity and suspension state across module boundaries; also verify the full course end-to-end.
6. Re-run successful witnesses with small timing, speed and input perturbations. A single frame-perfect success is insufficient for a beginner course. Publish success rates and tested ranges rather than calling this a universal proof of solvability.
7. A failed bounded search means **not validated**, not proven impossible. Reject/repair that candidate; after bounded retries retain a known-good authored fallback and record the reason.
8. Human playtesting judges readability, flow, challenge and fun. Bot completion alone cannot establish those qualities or set medal times.

Keep success witnesses, failure images/trajectory overlays and machine-readable rejection reasons. Freeze published layout content; changing generator code does not silently change an existing course ID.

Initially, generated courses are prepared offline and shipped as a validated bank. A browser Remix button can select another approved seed. Arbitrary runtime generation is a later feature requiring the same validation contract and bounded worker execution; Python is not running on a static host per button press.

## Page and presentation

Build a standalone industrial identity using charcoal, limestone, weathered steel and restrained safety amber. Use local typefaces, crisp labels and tactile material detail. Give the live quarry scene generous space and keep Play immediately visible.

Lobby: track cards with real generated thumbnails, difficulty, taught skills, medals, best result and one clear start action. Workshop: bike/rider turntable and cosmetic presets once the core asset quality is proven. HUD: timer, faults, checkpoint/progress, pause and retry; avoid covering the next landing.

Launch/pause/results/loading/error states form one explicit state machine. Dialogs retain focus, keyboard controls avoid text fields, loading failures are recoverable, and WebGL loss pauses with a useful recovery path. Sound starts after a user gesture and has a persistent mute control. Motorcycle audio needs its own tuning/assets; existing car recordings are not automatically a suitable final soundscape.

Controller input: analog triggers for throttle/brake, horizontal stick for lean, retry/restart/pause buttons, dead zones, device disconnect pause and correct UI hints. Keyboard provides the complete equivalent. Mobile later uses separate lean and pedal controls plus the existing mobile-shell lessons.

## Phases and completion gates

| Phase | Deliverable | Gate before moving on |
| --- | --- | --- |
| **1. Playable foundation** | New page, isolated runtime, pinned physics trial, one generated bike/rider, five obstacle test sections, quarry art sample, input/retry/pause and generation proof | Bike contacts, suspension and physical lean work; rider articulation and visual/collision alignment are demonstrated; build is reproducible and existing games remain healthy |
| **2. Finished vertical slice** | One short, exceptionally polished quarry course, finished bike/rider, camera, checkpoints/results, tutorial, sound and local bests | Course is satisfying to replay, readable and stable; manual keyboard/controller review and performance capture pass |
| **3. Intelligent course tooling** | Module contracts, pacing planner, Python composer, Node verifier, witness runs, perturbation reports, approved seed bank and contact sheets | Deterministic generation, bounded failures and robust beginner/intermediate witnesses; human approval of published courses |
| **4. Quarry release** | Six curated courses, medals, progressive teaching, cosmetics, generated challenge selector and site navigation integration | Complete end-to-end experience; records respect all content/physics identities; no placeholder game features |
| **5. Biomes and bike variety** | Next biome, new coherent prop kit, later bike classes with separate handling/records | Worlds differ in geometry, atmosphere and skill rhythm; every supported bike/course combination is validated or explicitly restricted |
| **6. Mobile and release hardening** | Touch controls, lower scene tier, lifecycle/error recovery, device QA and deployment readiness | Physical-device controls/audio checks, sustained performance, memory stability and static export verification |

Phase 1 includes a visually convincing art sample so the pipeline proves both mechanical and visual feasibility. Full course-bank intelligence follows tuned physics; building it first would embed assumptions that tuning invalidates.

## Quality, verification and delivery

Provisional budgets, to be measured on an agreed reference desktop in phase 2: sustained 60 FPS at 1080p, initial playable assets around 8 MiB compressed, roughly 200 or fewer scene draw calls and under 500k visible triangles. These are starting budgets, not measured claims. Stream later courses/biomes, cap pixel ratio and implement detail tiers before adding expensive effects. Identify the actual test machine/browser in reports.

Simulation tests cover seam traversal, rest/suspension stability, braking slopes, wheelies, air correction bounds, high-speed landing/tunnelling, body/helmet faults, ordered checkpoint crossings, full retry cleanup, pause timing and input repeatability at different rendering frame rates. Tests should assert meaningful behaviour, not merely mirror implementation.

Generator tests cover schema failures, named seed isolation, repeatability, geometry/physics alignment, safe spawns, bounded search failures, fallback and atomic manifest publication. Asset QA checks node names, bounds, skeleton/weights, dependency completeness and GLB/texture size. Extend resource validation for manifests, GLB textures and fetched courses: the current static validator checks source references and does not verify every runtime-loaded asset.

Records include course content hash, physics version, bike handling identity and mode. Cosmetic versions do not invalidate results. Store versioned bounded records with an in-memory fallback; optional later ghosts save sampled transforms for robust visual playback, with input replays retained for same-version QA.

Run targeted Trials tests, existing Drift/Pocket suites, static export and source/export resource checks when implementation reaches each gate. Keep large art rebuilds separate from the daily Drift workflow; add cheap manifest/content validation to ordinary CI. Browser QA includes loading, full run, crash/retry, pause, finish, reload, blocked storage, controller disconnect and repeated course changes without resource growth. State any untested hardware clearly.

Each phase ends with a working local result, meaningful tests, visual evidence where available, measured limitations and the next phase's exact prompt. Passing automated tests does not replace reviewing handling and art. Blender is confirmed and the phase-1 foundation is implemented locally; see `games/trials/README.md` for its contracts, limits and exact phase-2 prompt, and `docs/trials/verification.md` for the evidence.


## Phase-2 local implementation / 16 October 2026

The development course has been replaced by the six-sector **Works Line** (`quarry-works-v2`) using `qt-physics-2` and `qt-250-works-v2`. Python/headless Blender 4.5.3 remains the asset backend. The slice includes refined torque/weight transfer, the taught lift/committed gap/final ascent, derived rig reach bounds, generated bike/rider refinements, jump anticipation, original local PCM, contextual tutorial, medals, results and persistent version-isolated bests. No procedural-search bank or deployment was started.

Available tests, keyboard browser play, end-to-end witness, art/rig inspection and identified-desktop counters are recorded in `phase-2-verification.md`. **The phase-2 gate remains pending physical-controller feel, real audio listening and broader human quality approval.** Automated completion and a high-end desktop measurement do not close those gates. The exact later prompt is `phase-3-prompt.md`; settle that review before beginning intelligent bank tooling.


## Phase-3 local review implementation / 16 October 2026

The user’s overall first-pass review was positive, with explicit requests to strengthen lean and acceleration. Handling is revised as `qt-physics-3` / `qt-250-works-v3`; existing records are retained under their previous identities and the curated Works Line geometry remains intact. Source recipes, bounded production-physics verification/search, nine-case perturbation reports, repair/fallback handling and three local staged candidates are implemented. See `phase-3-verification.md` for exact evidence and limitations. No candidate bank has been human-approved, promoted into the default game or deployed. Individual hardware review details were not supplied. The final phase-3 gate remains human review of the revised handling and the three proposed courses.

## Phase-4 local implementation / 16 October 2026

The subsequent user message “Phase 3 looks good,” followed by the explicit phase-4 request, approves `qt-physics-3` and the reviewed phase-3 bank. Exact hash-bound evidence is recorded in `phase-4-approval.md`. The local runtime catalogue now contains Works Line plus those three approved routes. Two further validated beginner variants are staged for the six-course target; a failed additional intermediate variant remains excluded. The course board, actual thumbnails, approved-bank challenge selection, progress/best/medals, palette-only cosmetics, course-switch/input/audio/resource lifecycle and main-site navigation integration are implemented. The default remains Works Line and existing records/games are preserved.

See `phase-4-verification.md` for current tests, browser/endurance measurements and pending gates. Human approval of the two unseen routes and the complete new release experience, medal timing refinement and specific controller/audio hardware evidence remain outstanding. No six-course release or deployment is claimed without those gates. Exact next prompt: `phase-5-prompt.md`.


## Phase-5 framework implementation / 16 October 2026

The user explicitly approved moving ahead with game systems before course fine tuning: “Yes it’s good so far. We can refine the courses later on. I want to make sure we get all framework and game systems implemented before we fine tune.” This supersedes prior sequencing requirements to stop independent framework work for provisional medals, handling/art refinement or unreported hardware checks. The six quarry-course foundation is approved against actual hashes in the ledger; controller/listening remain untested rather than implied approved.

Alpine forestry, the stated recommended default, now has an original Python/headless-Blender kit, original ambient PCM, strict biome/scenery contracts, three bounded production-verifier routes and real thumbnails. Biome selection/progression, cache ownership, instanced resource disposal, cross-biome course/audio/input lifecycle and approved-only promotion/export are implemented. The same QT 250 / `qt-physics-3`, old records and Works fallback remain. Three new forestry routes are staged for human review, never silently approved. See `phase-5-verification.md` and structured evidence for 151 tests, static validation, witnesses and desktop endurance. The technical framework is delivered; final art/course/medal and hardware gates remain explicit. Follow-on systems instruction: `phase-6-prompt.md`. No deployment.


## Phase-6 framework implementation / 17 October 2026

Touch channels and handedness/layout, bounded graphics tiers/DPR, context/audio interruption recovery, complete-body resource limits and immutable fallback, defensive storage and local production-code QA are implemented. All reviewed geometry, QT 250 / `qt-physics-3`, old records, the six approved quarry courses and staged forestry bank remain intact. The user's explicit “Alpine forestry (Recommended)” response confirms the biome direction only; its individual routes remain pending. Framework-first sequencing and deferred course/medal refinement remain in force.

See `phase-6-verification.md` for tests, responsive/native desktop checks, sustained counters/heap and export fingerprint. Real phone/tablet multi-touch, browser/safe-area/fullscreen/audio/thermal behaviour, physical controller and listening checks remain open; fully hardened release approval is not claimed. `release-readiness.md` is the actionable next checklist. No additional biome, handling class, service, editor or deployment was added.
