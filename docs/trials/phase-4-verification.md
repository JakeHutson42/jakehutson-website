# Quarry Trials — phase 4 verification

**Later status update:** The user subsequently approved the six-course/system foundation and deferred course/medal fine tuning. The two pending quarry routes are now approved against exact hashes in `phase-4-approval.md`. Hardware checks remain untested. See `phase-5-verification.md` for the current six-course release and second-biome framework; the original measurements below remain historical evidence.

16 October 2026. **Local release experience implemented; four approved routes available, two further routes staged. Phase 4 is not declared complete pending human review. Nothing deployed.**

## Approval and playable result

The user explicitly stated **“Phase 3 looks good”** and requested phase 4. [The approval ledger](phase-4-approval.md) binds that actual feedback to `qt-physics-3` and the exact three reviewed candidates plus the retained Works Line. No further handling/readability defect was reported. Those four routes are eligible for the local runtime catalogue. Bot completion did not provide their approval, and that statement does not approve unseen phase-4 variants.

- [Ordinary game / four approved courses](http://127.0.0.1:8765/trials.html).
- [Six-course local review](http://127.0.0.1:8765/trials.html?qa=release).
- [Timber Approach](http://127.0.0.1:8765/trials.html?qa=release&course=timber) and [Shift Change](http://127.0.0.1:8765/trials.html?qa=release&course=shift) are the two new proposed routes. Watch witness runs automatically; Ride manually returns control. QA scores never save.

Start `python scripts/trials/serve.py` if needed. The original asset release, physics/bike identities, curated default and all previous riding hashes are retained. Palette and medal presentation changes do not erase records. Existing games/record stores remain independent.

## Implemented experience

The course board has actual browser-rendered 960×480 local thumbnails, taught skills, beginner/intermediate labels, provisional medal targets and per-course bests. It shows completed-line count and earned medals, suggests an unfinished beginner route, and provides Next line from results. All courses stay available for practice. Pick a challenge selects a different **approved** fixed offline remix; it cannot choose pending/rejected geometry and runs no browser terrain generation.

Three original liveries coordinate the QT 250 and rider: Works / ochre, Signal / clay and Survey / tide. Only named material colours change. Meshes, bones, dimensions, sockets, collision and physics are shared; no asset or handling class is substituted. Palette selection persists separately from records.

Course selection loads and validates first, then replaces simulation/environment while reusing the GLBs, renderer and audio graph. It resets input, run time/faults/contact/suspension state, camera interpolation and one-shot audio. Effects are capped at eight concurrent voices; switching/restarting stops old voices and finish cues. Failed/superseded loads and failed scene rebuilds retain the previous run. Closing the selector resumes it. Geometry/material/texture disposal covers each old environment; final disposal also releases skeleton textures. Escape closes the selector, and riding keys cannot reset the paused run behind it.

Tutorial, retry/pause/results and records operate on the selected route. Result medal copy uses that course's targets. Main-site navigation includes Quarry Trials in desktop/mobile copies of index, browser-device, droidframe, privacy and the navbar partial. No existing game implementation was changed.

## Curation, source packages and manifests

`python scripts/trials/build.py release` builds only hash-bound human-approved entries from frozen compact source packages and `specs/approvals.json`. `release-stage` builds all six into ignored local review storage. `release-validate` checks catalogue/content identity, actual human evidence, source geometry/topology, checksums for every course/replay/thumbnail, ordered finite medal targets and byte budgets. A failed build retains the previous pointer. Runtime fetches recheck catalogue/resource hashes and reject stale assets or physics. If the catalogue is unavailable, the independent curated Works Line remains playable.

The source packages and thumbnail inputs in `scripts/trials/curation` are checked in so release rebuilds do not depend on ignored search caches. Original generation reports remain immutable; human approval is separate. Their original generator pointers/HTML are historical diagnostics, not the release selector. Large diagnostics/tools/caches remain outside static export. The Python/headless-Blender pipeline is retained; phase 4 reuses its generated bike/rider and changes palettes without changing geometry. New generation still uses the versioned bounded production verifier. Rebuilding a catalogue or ordinary static export needs neither Blender nor search.

Current asset release: `c1b84012482089ec1b89bf38b87b4bb63a6ee08d3518feb3fc81eb137abc5dbd`.

Approved catalogue: `e5a7fe14bb33aff1413136611ab9c25c59fa65a34be2aa2fce8fdfdd5a56907e`, four courses / eleven fetched course resources / **469,805 bytes**. The asset manifest's twelve existing resources total 1,334,957 bytes, excluding shared libraries/page code. Catalogue files are streamed/checked as needed. The initial loaded course bank is comfortably below its 2 MB limit.

Six-course review catalogue: `864e26e6c0d31d52bedab1119d65a1fd37b34dfd3f2ee53447d79f3b908ba566`, with exactly two pending routes. Ordinary export includes the approved catalogue only, and excludes scripts/curation, `.trials-build`, tools and documentation. Superseded catalogue copies were moved into ignored local history, rather than left in export.

## New candidates and bounded failure

Named source seed: `quarry-release-02`; original review input identity `a30d3f62a99752b0b5a9ad32bdcc7c7458f00ff14bb48b04790fd8c2a8a85ed2`. Existing obstacle contracts, six-sector pacing, scenery clearance and take-off/landing requirements are preserved. These are deliberately bounded variants of the established vocabulary, not arbitrary new layouts or advanced difficulty claims. Six proposed courses currently comprise four beginner and two intermediate recipes.

| Proposed route | Riding identity | Node witness | Perturbations | Search evaluations / steps | Approval |
| --- | --- | ---: | ---: | ---: | --- |
| Timber Approach | `9774e7e51ab79a708f70507f1925b3072d1836b33b9a4a8a877707dbe9370436` | 12.950 s | 9/9 | 10 / 15,603 | Pending |
| Shift Change | `40e01393d5cdb11dc5b0ccab60db14a704cc3a274f4a2a6bbf2c131d8492d936` | 13.208 s | 9/9 | 10 / 16,013 | Pending |

The nine cases remain baseline, timing ±1%, throttle ±.01, lean ±.015 and initial speed ±.1 m/s, with measured module entry ranges and camera checks. These sampled successes do not prove every point in an interval succeeds or establish human difficulty/fun. [Structured evidence](phase-4-summary.json) retains actual approach envelopes, attempts and resource/performance values.

An additional intermediate High Bench variant failed at 6/9, then 7/9 after each of two bounded repairs. Its final hash is `24571cb148be0da6fad3b8ae4c6fad537e33968fb8cf1d846c170c7cc47951a1`; rejection reason `perturbation-success-below-required-rate`. Attempts used 91/73/82 evaluations and 191,235/142,390/169,203 steps. It is absent from the release specification and both runtime selectors. Its report is retained outside export. A bounded failure is not a proof of impossibility. The already approved phase-3 High Bench is a different immutable route and remains available with its documented 8/9 evidence.

## Tests, export and browser checks

**141 tests passed:** 119 JavaScript (38 Trials, 81 Drift/Pocket), 14 Trials Python and eight Drift Python. The new tests cover approved/pending selection, catalogue/physics/resource staleness, corrupt fetched geometry, progression/medals/record isolation, palette alignment/identity, async course-load failure/races, environment rebuild rollback and 24 actual quarry rebuilds with old-resource disposal. Audio tests cover voice bounds and transition cleanup; counters retain bounded samples and full-run totals. Python checks deterministic release rebuilds, retained pointers after failure, forged/missing human evidence, invalid medals, resource corruption and path containment.

Source and static export checks each verified **246 local resource references**, with no missing files/CDN dependencies. Exported asset validation passed all twelve GLB/rig/spec/course/audio resources; exported course-catalogue validation passed all eleven course/replay/thumbnail resources. CI now checks both validators. Export was executed without asset generation or search.

All six proposed routes completed in the actual browser with zero faults. The approved four completed repeatedly in the sustained run. The new route result dialogs showed Timber 12.94 s / zero faults and Shift 13.14 s / zero faults, with maximum reported IK error 0.000000 and no console errors. Node and browser runs are reported separately; bit-identical numerical results across different V8 builds are not promised. [Timber screenshot](phase-4-timber.jpg), [Shift screenshot](phase-4-shift.jpg).

Pointer/keyboard checks exercised livery changes, selecting from lobby and pause, W+D acceleration, Escape pause, selector Escape dismissal, timer/fault/input reset after a switch, and gesture-unlocked decoded audio. The context/graph is reused; paused/lobby gain is silenced. No actual listening judgement is claimed. Palette changes were visible on the bike/rider. [Course board](phase-4-course-board.jpg), [livery](phase-4-livery.jpg), [390 px board](phase-4-narrow-board.jpg). At 390 px the selector was a single 284 px column, 320 px client/scroll width with no horizontal content overflow. This checks responsive menus, not mobile riding or physical-device touch controls.

Fresh browser QA also verified that an unknown course request retains the playable Works Line and reports catalogue unavailability without a console error. The loading toolbar is disabled until preparation finishes, with an additional handler guard against early course-board access. A real Pick a challenge click selected approved High Bench, with neutral inputs and a fresh lobby. The six-course review selector showed exactly six cards and two human-review-pending entries; its default Works Line witness completed successfully. [Fallback evidence](phase-4-fallback-browser.json), [pending-route board](phase-4-review-board.jpg).

## Sustained performance and resource stability

Identified desktop: Windows, Ryzen 7 9800X3D (eight cores), NVIDIA RTX 5080, approximately 31.2 GiB OS-visible RAM, Chromium 155 / ANGLE D3D11. Actual full-screen play surface **2558×1334**, DPR 1. The bounded `?qa=endurance` diagnostic ran through the normal production simulation/frame loop for **132.55 riding seconds**, ten zero-fault completions and nine course changes. It stopped at the declared duration limit. QA wrote no records.

| Counter | Full-size sustained capture |
| --- | ---: |
| Rendered samples across the run | 26,460 frames / 132.713 measured seconds |
| Mean FPS | 199.38 (apparent browser ceiling near 200) |
| Tail p95 frame interval | 5.1 ms |
| Tail p95 physics CPU | .1 ms |
| Tail p95 render submission CPU | 1.5 ms |
| Maximum calls / triangles | 37 / 49,774 |
| Resource counts at **each** route finish | 49 geometries / 12 textures / 14 shader programs |
| Maximum IK error | 0.000000 |

[Raw sustained counters](phase-4-endurance.json), [screenshot](phase-4-endurance.jpg). A separate panel-size sustained capture is retained in `phase-4-endurance-panel.json`. The 3,600-frame ring bounds retained timing samples; p95 describes the tail, while FPS/frame count/duration cover the complete run. Counts are renderer allocations, not a complete process-heap profiler. The repeated finishes show no renderer-resource growth. CPU submission time is not GPU elapsed time. This approximately two-minute high-end desktop run exceeds the full-HD pixel/60 FPS target but is not a low-end or long thermal benchmark. Autoplay keeps audio locked during performance measurement.

## Remaining phase-4 gate

The two unseen routes are staged until the user approves their immutable identities. The new course-board/progression/livery experience also needs human acceptance, and medal targets need actual human timing feedback; they remain labelled provisional. No physical-controller run, trigger feel, real disconnect test or independent audio-listening review was performed by the agent. Controller gameplay mappings/dead zones/reset/disconnect logic are tested; course menus use keyboard/pointer. No advanced course quality, new biome/bike class, mobile riding, online feature or editor is claimed.

No deployment is authorized or performed. The exact follow-on [phase-5 prompt](phase-5-prompt.md) begins by closing these gates before adding biome content.
