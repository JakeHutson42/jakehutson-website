# Quarry Trials — phase 6 framework build

A static 2.5D motorcycle game at `/trials.html`, with the original generated QT 250/rider, six approved quarry routes and three staged alpine forestry routes. Current handling remains `qt-physics-3`. The user approved moving ahead with framework/game systems and deferred course/medal fine tuning; the actual evidence is in `docs/trials/phase-4-approval.md`. Forestry is local review only until explicitly approved. Nothing is deployed. Current evidence and limits: `docs/trials/phase-6-verification.md`; outstanding physical-device/human checks: `docs/trials/release-readiness.md`. Touch controls, detail tiers and context/audio/resource recovery are implemented; full hardware approval is not claimed.

## Run

From the repository root:

```text
python scripts/trials/serve.py
```

Open **http://127.0.0.1:8765/trials.html**. Checked-in assets are ready to play. Visitors and ordinary site exports need neither Blender nor a JavaScript build step. Direct `file:` opening does not support module/asset loading.

Development was verified with Python **3.12.14**, Node **24.19.0**, Blender **4.5.3 LTS**, local Three.js **0.180.0** and Planck **1.4.2**. CI uses Python 3.12 / Node 22. Blender's portable development copy is inside ignored `.tools/`; it was downloaded from Blender's official release server and checked against its published SHA-256 file. It is never exported.

## Controls and run rules

| Action | Keyboard | Standard controller |
| --- | --- | --- |
| Throttle | W / Up | Right trigger |
| Brake | S / Down | Left trigger |
| Lean back / forward | A / D, Left / Right | Left stick |
| Retry checkpoint | R | A |
| Restart course | Backspace | X |
| Pause | Escape | Menu |

The clock starts on Play. It continues after a crash and through a checkpoint retry; a deliberate pause freezes it. A failed attempt adds one fault, once. Retrying a failed attempt adds no second fault; voluntarily retrying a running attempt adds one. Restart clears time, faults and checkpoint progress. Checkpoints require sequential forward crossings by the bike; finish also requires all checkpoints.

Retry rebuilds the physics world at an authored safe pose and clears velocities, suspension/contact transients, accumulator and held input. Assets remain loaded. Controller input must return to neutral after pause/reset/disconnect. Focus loss and hidden tabs pause. Keyboard controls leave forms, links, buttons and dialogs usable.

Best runs rank faults first, then time, and are keyed by riding-geometry hash, physics version and bike handling ID. A dedicated, bounded 40-entry `quarry-trials:v1` store falls back to memory when local storage is unavailable. Development QA runs never save records.

## Generate and validate

There are no ordinary Python package dependencies. Blender supplies its own Python, `bpy` and NumPy. The generation scripts do not download or install software.

```text
python scripts/trials/build.py all
python scripts/trials/build.py all --blender "C:/path/to/blender.exe"
python scripts/trials/build.py courses --seed quarry-02
python scripts/trials/build.py validate
```

`BLENDER_PATH` is also supported. `assets`/`all` require exactly Blender 4.5.3 LTS; `courses` and `validate` work without Blender. Changing bike/rider specifications requires rebuilding assets. `--specs` selects a source specification directory. `--force` bypasses the validated asset cache. `--site-root dist` validates exported runtime resources.

The source specifications live in `scripts/trials/specs/`. Python validates dimensions, convex chassis geometry, named anatomy, palettes, joint limits, safe spawns and scenery clearance. The designed course has a flat run, smooth crest, bounded seeded rollers, a teaching step, a 3.6 m empty jump gap with recovery space, and a three-stage final climb. Separate named random streams keep roller changes and scenery independent. This is controlled variation of a designed course, not a general playability-search generator.

Build inputs include canonical specs, generator source hashes, seed and tool versions. A `.trials-build/<inputHash>/` staging directory contains GLBs, rig report, three neutral-lit renders, a **contact-sheet.png**, completion marker and integrity hashes. Interrupted or modified caches are regenerated. Python errors inside Blender propagate as a failed process.

Validation runs before publication. Runtime files are copied into a content-addressed release; a final atomic `content/current.json` replacement selects the approved release. The browser loads that immutable release and verifies file hashes. A failed build leaves its previous release pointer intact. Root-level current copies support CLI/test defaults. Large QA renders, tools and caches stay outside exported directories.

Repeated forced builds must preserve specifications, riding-course identity and the canonical geometry/pivot/skin-weight fingerprint. Blender can change GLB node/buffer ordering without changing geometry. Byte-identical forced exports are therefore **not promised**: file hashes and release IDs represent the actual exported bytes. A normal cached build reuses the existing binaries. Cosmetic scenery changes do not change the riding-course record identity.

## Runtime and rig contracts

| File | Responsibility |
| --- | --- |
| `main.js` | Loading, page state, dialogs, HUD, frame accumulator handoff, records |
| `input.js` | Keyboard ownership, analog input, controller edges/dead zone and cleanup |
| `storage.js` | Defensive, bounded personal records and memory fallback |
| `simulation/game.js` | Renderer-independent 120 Hz Planck simulation and run rules |
| `simulation/rider-pose.js` | Shared torso/head pose for rendering and the helmet sensor |
| `rendering/assets.js` | Release resolution, integrity checks and local GLB loading |
| `rendering/world.js` | Course mesh, quarry kit, mechanical articulation, rig and camera |
| `rendering/ik.js` | Two-bone IK with fixed limb lengths and flexion limits |
| `scripts/trials/content.py` | Strict specs, stable streams, course composition and validation |
| `scripts/trials/blender_assets.py` | Parametric bike, weighted rider, GLBs and review images |
| `scripts/trials/build.py` | Tool discovery, cache, staging, content identity and publication |
| `scripts/trials/headless.mjs` | Structured input replay using production simulation |

Physics and rendering use **X forward, Y up, Z depth**, metres/kilograms/seconds/radians. Blender conversion maps `(x,y,z)` to native `(x,-z,y)` before its Y-up GLB export. No road-height correction is applied during riding.

The bike specification controls wheel radius, axles, frame, steering head, swingarm pivot, bars, pegs, masses and tuning. GLB mechanical nodes are `chassis`, `rearWheel`, `frontWheel`, `forkSlider`, `swingarm`, `shock`. Wheels turn independently; calipers remain with the fork/swingarm. Visual pivots follow physical wheel centres. The linear rear suspension is represented visually with an adjusted swingarm length; a true swingarm linkage is later handling work.

The rider exports a weighted continuous torso and named `pelvis`, `spine`, `chest`, `head`, `upper_arm_L/R`, `forearm_L/R`, `thigh_L/R`, `shin_L/R` bones. Joint endpoints and limits are in the rig/spec files. Runtime IK uses exported limb lengths; Blender constraints are not required at runtime. Hands target bar sockets and boots target pegs. A shared torso-pose function positions the helmet contact sensor. The rider mass is allocated to one physical proxy, rather than counted again in the chassis.

## Verification

```text
node --test tests/trials/*.test.mjs
python -m unittest discover -s tests/trials -p "test_*.py"
node --test tests/drift/*.test.mjs tests/pocket/*.test.mjs
python -m unittest discover -s tests/drift -p "test_*.py"
python scripts/validate_static_assets.py
python scripts/drift/build_static.py
python scripts/validate_static_assets.py dist
python scripts/trials/build.py validate --site-root dist
```

The static checker verifies source dependencies. The Trials validator additionally checks runtime-fetched course/rig/GLB resources, checksums, GLB binary bounds, embedded dependencies, named pivots and skin presence. Existing CI runs the cheap Trials checks without rebuilding Blender assets.

`node scripts/trials/headless.mjs` emits a short input replay as JSON. Supply `{ "witness": true }` on stdin for the bounded, explicit full-course integration witness, or `{ "actions": [{ "seconds": 3, "throttle": 0.6, "lean": 0 }] }` for timed manual inputs. The browser's `?qa=witness` uses the same witness controller through the normal frame loop; `?qa=poses` exercises forward/back rider articulation. These are explicit development modes and do not save scores.

The canvas exposes `data-state`, `data-x`, `data-draw-calls`, `data-triangles`, `data-ik-error`, `data-max-ik-error`, `data-physics-ms` and a rolling `data-fps` for review. Per-frame physics time can be zero on a rendering frame without a physics step. Additional `data-performance`, `data-resolution`, `data-renderer` and `data-audio` attributes expose bounded frame samples, actual backing size, WebGL renderer and audio readiness. Timing uses the browser clock; it is not a GPU profiler or a substitute for a sustained thermal test.

## Phase-2 baseline and audio

The historical phase-2 handling identity was `qt-physics-2`, bike `qt-250-works-v2`, course `quarry-works-v2`. Previous records remain in the dedicated store and cannot compete against this changed layout/handling. The frame is 52 kg, rider 68 kg, wheel masses 3.2 kg each; suspension is 8.5 Hz / .92 damping. Throttle eases into a torque curve, with 265 Nm peak rear-joint torque and 26 rad/s wheel-speed ceiling. Partial throttle changes torque rather than acting as a different top speed. Brakes override engine torque. Rearward transfer permits a wheelie; forward transfer and throttle reduction recover it. Air correction remains bounded at 32 Nm alongside physical weight transfer.

Python derives `riderReach` from source bone lengths and minimum elbow/knee flexion. The shared torso/head contract limits visual hip/shoulder reach during hard impulses; it does not reposition physical wheels or constrain them to the road. This prevents limb stretching while retaining the constrained physical rider mass. Head sensor and visible pose use the same contract. Rear suspension remains a linear wheel joint with an adjusted visual swingarm length; a true linkage and ragdoll are outside this slice.

`scripts/trials/audio.py` generates original, deterministic, 22,050 Hz mono 16-bit WAVs for idle, loaded engine, gravel, landing, checkpoints and finish. No third-party recordings, car audio or network resources are used. Source and provenance: `CREDITS.md`. These stylised cues approximate a single-cylinder exhaust; human listening and mixing approval remain open. The pipeline checks format, duration, clipping and loop seams. The manifest hashes every sound. The first Play/sound-button gesture resumes Web Audio before asynchronous hash-checked loading/decoding; QA autoplay does not unlock sound. Mute and tutorial preferences persist separately from records. Pausing/blur fades the engine; landing/checkpoint/finish cues use simulation events. Audio failure leaves riding usable and gives a visible notice.

The tutorial follows six authored teaching sectors and can be hidden/restored. Five checkpoints sit on flat recovery areas. Gold requires zero faults under 23 seconds; silver ≤2 faults/40 seconds; bronze ≤8 faults/90 seconds. These are provisional design targets based on the available keyboard review and witness, awaiting human difficulty feedback. Records rank faults before time, independently of medals.

## Historical phase-2/3 review and scope limits

The full keyboard route, controlled jump, final ascent, retries, pause, results and record persistence were exercised through actual browser keyboard input. A separate production-simulation witness completes in 15.70 seconds without faults. Art is a coherent stylised generated set, with swept guards, panels, fasteners, full-face helmet/graphics and suit guards; neutral-lit review is in `docs/trials/asset-contact-sheet.png`.

The user’s overall first-pass review was positive. Individual controller/audio test details were not supplied, and no physical-controller pass by the agent is claimed. The revised handling and generated candidates still require human review. Standard controller mapping, dead zones, neutral reset and disconnect behavior are covered by logic tests; no physical controller pass is claimed. The high-end desktop performance capture is identified in the verification report and is not a low-end hardware guarantee. That historical phase-3 milestone preceded the forestry and touch systems now described below; no online service, editor or additional handling class has been added. The site has not been deployed.

## Current handling revision

`qt-physics-3` / `qt-250-works-v3` retains the same bike geometry and the exact curated Works Line geometry. Peak rear torque is 380 Nm (previously 265), wheel-speed ceiling 36 rad/s (26), traction 1.65 (1.45), rider travel .48 m (.36) and neutral rider offset +.10 m. Throttle response is 14 Hz. Physical rider transfer is deliberately damped at 8 Hz with .09 motor-joint correction, so reversing lean does not apply an instantaneous pose change. Air correction is 85 Nm plus angular damping, capped at 110 Nm. Engine torque reduces as pitch exceeds the lean-dependent lift target; this is a torque control, never a transform or height correction. Full throttle can lift the front; leaning forward supports a stronger launch, and hard rearward lean can still loop the bike.

The handling bump protects old scores. The new review modes do not save records. A standard W/Up launch is stable; braking from the higher top speed needs more distance. The production witness is retuned to the new bike and uses actual throttle/brake/lean commands, including a controlled approach to the final ascent.

## Offline course tooling

One documented entry point, from repository root:

```text
python scripts/trials/build.py review --seed quarry-review-01
python scripts/trials/build.py review-validate
```

`review` uses source contracts in `scripts/trials/modules.py`, a teaching/rehearsal/variation/recovery/climax pacing plan, separate named random streams and three bounded beginner/intermediate recipes. This milestone varies the existing quarry obstacle vocabulary and pacing structure; it is not arbitrary course order or arbitrary terrain generation. Module entry/exit frames, approach bounds, skills, explicit gaps, recovery zones, corridor and landing sightline anchors accompany the shared collision/visible polylines. The measured entry ranges are reported separately from declared recipe limits.

Python invokes `scripts/trials/verify.mjs` over bounded JSON. It runs `games/trials/course-verifier.js` using the production simulation and pinned libraries. It tries the curated policy first, then a bounded beam of action segments and further robustness searches where necessary. Branches replay their complete input prefix from the start; one continuous physics world carries velocity, rider, contact and suspension state across module joins. It never approximates a branch by restoring only its pose. Retained branch diagnostics include actual body velocities, angular velocities and suspension translations. Per-module traversal checks use the actual incoming state from the complete route, not a claim that every possible entry state has been tested.

Every successful witness is replayed with timing ±1%, throttle ±.01, lean ±.015 and initial speed ±.1 m/s. Beginner candidates need nine successes from nine declared cases; intermediate candidates need at least 80% (eight from nine), together with valid entry/camera checks, to be `validated-for-review`. These small tested ranges are explicit and do not establish universal solvability or fun. Reports retain failures; initial Cutstone and High Bench failed robustness and were repaired within their declared envelopes.

Budgets per verifier attempt: 350,000 physics steps, 110 evaluations, 20 seconds, 32 action segments, beam width 3. Accepted overrides are strictly capped. Python caps Node’s heap at 192 MiB, process time at 31 seconds, the bank at 120 seconds, candidates at three and repair attempts at two. Process timeouts and exhausted searches produce `not-validated`, never “impossible.” There is no unbounded retry. The curated Works Line remains the fallback/default.

Staging lives under `.trials-build/review/<inputHash>/`: course/rig-compatible specifications, per-tick input witnesses, per-module and perturbation reports, trajectory SVG contact sheets and a local dashboard. Large diagnostics and search caches stay outside export. Input identities include source/config/tool hashes; geometry/physics identities are immutable. Valid cached banks are checked and reused; corrupt/stale assets, physics code or fetched resources are rejected. `current.json` here selects a **local review bank**, not the approved game release. Failed jobs leave the prior review pointer and the curated default untouched.

The generated dashboard links to `trials.html?qa=review&bank=<hash>&candidate=<id>`. Local-only QA provides **Watch witness**, **Ride manually** and a three-candidate selector. Witness controls are fed at the production 120 Hz step, independently of rendering FPS. Retry switches to manual controls; Watch restarts the recorded witness. Human approval stays visibly pending, and scores are never written in QA. Ordinary `/trials.html` never reads this bank or changes course.

The dashboard’s SVG sheets show course geometry, checkpoints and the physical witness trajectory; they are diagnostics rather than Blender art renders. Browser screenshots supplement them. No approved bank is published by this command. Human candidate approval is required before promotion in phase 4.

Ordinary static export still requires neither Blender nor search. CI exercises bounded verifier tests in temporary directories, but export does not generate courses or include `.trials-build`. Review mode intentionally requires the local source server; it cannot load ignored staging data from `dist` or the deployed site. The local server uses no-store headers to prevent mixed revisions of ES modules during development.

## Exact phase-4 prompt

See `docs/trials/phase-4-prompt.md`. Use it after the new handling and candidate bank have received human review. No deployment is authorized by this milestone.

## Phase-4 release experience

The course board opens from **COURSES**, the launch panel, pause or results. It uses actual 960×480 browser-rendered thumbnails of each course's shared geometry. Every card shows its difficulty, taught skills, provisional gold target and version-isolated best. All courses remain open for practice; finished-line count, medals, a suggested beginner/next unfinished line and results **Next line** provide progression without locking practice behind grinding. **Pick a challenge** selects a different approved offline remix from the immutable bank. It performs no runtime terrain generation and excludes pending routes.

Works / ochre, Signal / clay and Survey / tide are original coordinated bike/rider palettes. `cosmetics.js` changes named material colours only; dimensions, mesh topology, skeleton, sockets, collision, mass and record identity are shared. Selection persists with sound/hint preferences. Choose a palette, then select/close the board to see it on the live bike. No new GLBs or handling class is introduced.

Course changes load/check the new route first, then replace the simulation and environment. The bike/rider GLBs, renderer and audio graph are reused. Old environment geometry/materials/textures are disposed once; input, one-shot audio, finish cues, camera interpolation, accumulator, contacts, faults and timer are reset. A failed load or scene rebuild retains the previous run; closing the selector resumes it. Escape closes the selector without restarting the bike. Records are not erased by course or palette changes.

The game is linked in all five shared/duplicated main-site navigation sources, including their mobile copies. Existing games and their record stores are independent.

```text
python scripts/trials/build.py release
python scripts/trials/build.py release-stage
python scripts/trials/build.py release-validate
python scripts/trials/build.py release-validate --site-root dist
```

`release` reads strict frozen geometry/proofs plus explicit hash-bound approval evidence from `scripts/trials/specs/approvals.json`; it copies only approved courses into `games/trials/courses/releases/<id>/` and atomically selects a checksum-protected catalogue. A generation pass is not approval. The original content pointer and Works Line fallback remain independent. `release-stage` builds all six proposed routes under ignored `.trials-build/release`, served only via **http://127.0.0.1:8765/trials.html?qa=release**. The latter has Watch witness / Ride manually controls and never stores records. Current pending routes: Timber Approach and Shift Change.

Compact frozen curation packages and actual thumbnails are checked in under `scripts/trials/curation`; rebuilding release catalogues needs neither ignored search caches nor Blender/Node search. New candidate generation still uses the Python/headless-Blender specification pipeline and the bounded production Node verifier. The failed additional High Bench variant remains a diagnostic source package, never an eligible release route. `release-validate` checks catalogue identity, approval evidence, hashes for every course/replay/thumbnail, source geometry, topology and byte budgets. Both asset and course validators run in CI/source/export checks. Ordinary static export performs neither asset generation nor search and excludes all scripts/curation, review staging and large diagnostics.

Changing physics/assets intentionally invalidates stale course packages. Re-run the verifier and record review evidence before publishing a catalogue against changed assets; never rewrite a physics/content identity just to preserve an old score. The phase-4 update preserves `qt-physics-3` and all previously reviewed riding hashes.

`?qa=endurance` is a local diagnostic: it replays the approved routes through the normal 120 Hz/frame loop until at least 120 riding seconds (maximum sixteen completions). It never saves scores. `data-endurance` contains route times/faults, renderer memory maxima and full-run performance totals. Samples are bounded to 3,600 recent frames; FPS/seconds/frame count cover the whole run, while p95 timings describe that bounded tail. `?qa=thumbnail` and local `shot=1` produce a consistent fixed-camera source view for actual thumbnails; normal riding never uses that camera override.

The six proposed routes currently span four beginner and two intermediate recipes, with the same six-sector quarry vocabulary. No advanced difficulty is claimed without a corresponding contract/playtest. Gold/silver/bronze targets remain explicitly provisional until human timing feedback. Physical controller feel and actual audio listening still require hardware/human checks. The phase-4 gate remains open until all six routes and the complete release experience receive human review.

Exact follow-on prompt: `docs/trials/phase-5-prompt.md`. Resolve the phase-4 gates before starting it.


## Phase 5 — biome framework and local review

The latest user instruction to implement systems before course fine tuning supersedes earlier stop conditions for provisional medals and general art/handling refinement. Physical-controller and listening checks remain unreported; no hardware approval is implied. The six quarry courses now enter the approved local catalogue. Alpine forestry is the recommended default direction; its three new routes remain pending human review.

```text
python scripts/trials/build.py biome --seed forestry-01
python scripts/trials/build.py biome --seed forestry-01 --force
python scripts/trials/build.py biome-freeze
python scripts/trials/build.py release-stage
python scripts/trials/build.py release
python scripts/trials/build.py release-validate
```

`biome` requires pinned Blender 4.5.3 LTS and Node, generates the seven-prototype forest kit/original ambience and three bounded production-physics course proofs into ignored `.trials-build/forestry/<inputHash>`. `--force` bypasses the kit cache; source/spec/runtime/tool hashes and canonical geometry fingerprints are retained. `biome-freeze` saves compact authoring inputs to `scripts/trials/curation/forestry`; it does **not** approve or export them. Preview/contact sheets stay outside the runtime tree. Real 960×480 local course thumbnails live alongside frozen route JSON/replay/report/trajectory SVGs. `release-stage` rebuilds the nine-course local review from frozen packages without Blender/search. `release` includes only routes with actual hash-bound ledger approval, currently six quarry courses. Failure leaves the old pointer and curated fallback intact.

Open http://127.0.0.1:8765/trials.html?qa=release&course=nursery#game for the biome selector. Forestry route IDs are `nursery`, `sawyer`, `ridge`. Watch witness runs retained inputs; Ride manually unlocks sound and gives player control. Review records are disabled. `?qa=endurance&review=1&course=nursery#game` cycles both biomes for sustained resource/performance QA. Canvas data attributes expose production state, resolution/renderer, performance/resources and audio lifecycle. Pending forestry routes cannot be selected as normal generated challenges and are absent from ordinary export.

New contracts: `scripts/trials/specs/forestry.json`, `forestry.py`, `blender_forestry.py`; exact shared terrain/collision paths, root beds, chamfered steps, timber surfaces, empty stream gap, ordered safe checkpoints, separate named scenery/audio seeds and conservative bounds-based corridor clearance. Blender exports X-forward/Y-up/Z-depth; each kit prototype retains a named local frame. Scenery instances are bounded to 160 and stay behind the bike/landing corridor. `biomes.js` owns lazily checked source-kit/audio caches; `rendering/forestry.js` clones/batches course-owned geometry/materials/instance buffers. Course changes dispose those resources while keeping the cached kit and existing bike/rider. Final cache disposal releases templates. One original eight-second wind/birds WAV is decoded after gesture and reused; leaving forestry stops/disconnects ambience, pause/mute silence it, and late decodes cannot resurrect old sources.

The same record identity, cosmetics/rig reach and physics apply across biomes. Progress and result-next choices are biome-scoped. Foreground ground uses exact collision polylines; decorative terrain never changes riding height. No handling class or runtime terrain generator was added. The three forest routes intentionally reuse the established taught six-sector vocabulary; exhaustive layout diversity and medal/art tuning remain later refinement.

Current evidence: 151 tests, source/export validation of 253 references and all fetched resources, three zero-fault browser witnesses, 24 alternating environment disposal checks, and a 131-second cross-biome desktop run. Nursery/Sawyer achieve 9/9 sampled perturbations, Ridge 8/9 (low throttle helmet fault retained). All remain pending human approval. See the phase-5 report for hashes, byte budgets, measured approach ranges, hardware and exact limits. Fine tuning is deferred; physical-controller, audio listening and mobile hardware tests are untested. Use the exact phase-6 prompt linked above; earlier phase prompts below/above are historical milestones.


## Phase 6 — mobile and release-hardening framework

**Current phase:** independent analog touch controls, graphics/detail tiers and recovery systems are implemented. All 160 tests and source/export checks pass. Actual phones/tablets, physical controller and listening/thermal checks remain open; the release is not claimed fully hardened. The user explicitly confirmed alpine forestry as the second biome, separately from its still-pending route approvals. Quarry geometry, physics and record identities remain unchanged.

Open **Options** for Graphics (automatic/high/balanced/low), Touch controls (automatic/show/hide) and Pedal hand (right/left). Slide a pedal upward to increase throttle/brake; drag balance left/back or right/forward. Channels can be held together, capture pointers and release independently. Keyboard-accessible sliders use arrow keys/Home/End and return to neutral on release. Every interruption clears held input; standard controller neutral gating and normal keyboard shortcuts remain. Riding controls sit below the canvas, with responsive HUD/dialogs and safe-area/dynamic-viewport CSS. Actual mobile browser chrome/fullscreen behaviour still needs device review.

Automatic graphics uses low on coarse-pointer/narrow devices and high on desktop. High/balanced/low cap DPR at 1.5/1.25/1 and shadows at 2048/1024/off. Decoration is stably subsampled; riding terrain, rig sockets, course/physics identities and records do not change. `quality.js`, `touch.js`, `recovery.js` and `resources.js` define these contracts. Old scene resources and shadow targets are disposed on transitions; cached source kits, bike/rider and simulation are retained.

Context loss clears input/audio and pauses the same simulation. A restored renderer rebuilds the retained scene; the player resumes deliberately. Reload remains available after failure. Audio suspension also pauses and needs a real gesture to resume. Entire asset/catalogue requests, including streamed body reads, have 15-second/2-MB bounds; manifests have a 100-KB bound. Checksums and canonical asset identity reject stale/corrupt data. Only the pinned immutable Works package can serve as asset-pointer fallback; missing bytes still fail visibly. Failed preparation cleans partial assets and supports Try again/Use Works Line. Storage reads/writes tolerate corruption, oversize and quotas without losing this visit's in-memory bests.

```text
python scripts/trials/serve.py --port 8766
```

8766 is the active review port for this session; default serving still uses 8765. Bests are origin-scoped, so ports keep separate stores without deleting one another. Ordinary game: `http://127.0.0.1:8766/trials.html`. Local system QA: `?qa=hardening&review=1&course=nursery&touch=1#game`; approved-only QA omits `review=1&course=nursery`. Run touch model check uses production channels/input/physics, not native multi-touch; Lose/Restore graphics uses the real WebGL extension; Suspend audio exercises actual Web Audio interruption. QA never saves scores. `touch=1` forces visible controls; `quality=high|balanced|low` temporarily overrides the tier. These helpers are local-only.

Sustained QA: `?qa=endurance&review=1&course=nursery&cycle=1#game` cycles all three tiers across nine routes; omit `cycle=1` and add `quality=low&touch=1` for fixed low-tier review. Canvas data attributes expose counters, quality, heap samples, audio/recovery and touch-model reports. Node tests reproduce simultaneous ownership, DOM capture/cleanup, interruptions, controller coexistence, exact production simulation, bounded resource failure, context restoration, repeated tier/biome disposal and storage failure. Standard source/export and runtime-fetched validators remain in CI; export uses neither Blender nor search and excludes pending forestry.

See `docs/trials/phase-6-verification.md` for exact commands, 131-second desktop/small-viewport captures, resource/heap evidence and limitations. `dist` is the concrete reviewed static export, fingerprinted in `docs/trials/phase-6-export.json`. Follow `docs/trials/release-readiness.md` for real-device/content checks and any later deployment decision. No deployment is authorized or performed.
