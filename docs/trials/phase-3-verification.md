# Quarry Trials — phase 3 verification

16 October 2026. **Technical local review build ready; human candidate approval pending. Phase 3 is not declared complete. Nothing deployed.**

The user reported that the initial game works well, while requesting substantially stronger acceleration and more influential lean. This is overall first-pass feedback. It does not identify a tested physical controller or provide a specific audio-listening approval. The revised handling, candidate difficulty/readability and generated art still need explicit human review before any bank promotion. No candidate is part of the approved browser default.

## Local review

- [Play the curated Works Line](http://127.0.0.1:8765/trials.html).
- [Three-candidate dashboard](http://127.0.0.1:8765/.trials-build/review/260454678ce677df9c95d7fc66c0df22d9988325580bd0f77ce5207b0f05deab/index.html), with trajectory sheets, JSON reports and Ride / Watch links.
- Run `python scripts/trials/serve.py` from the repository root if the preview server has stopped.
- Reproduce with `python scripts/trials/build.py review --seed quarry-review-01`, then `python scripts/trials/build.py review-validate`.

The QA selector is local-only. Watch plays retained per-tick input through the production runtime; Ride manually and Retry return control to the player. QA runs never save records. The ordinary page keeps The Works Line as its default and never reads the candidate bank.

## Requested handling revision

Physics is now `qt-physics-3`, bike `qt-250-works-v3`. Rear torque rises from 265 to 380 Nm, wheel-speed ceiling from 26 to 36 rad/s, tyre friction from 1.45 to 1.65, rider travel from .36 to .48 m and throttle response from 7 to 14 Hz. Physical rider mass transfer, damped lean and bounded airborne correction affect the bike. A lean-dependent motor torque limiter keeps a neutral launch manageable; hard rearward throttle can still loop the bike. There is no riding-height correction.

Measured after one second of full throttle on the same flat course/start pose:

| Lean input | Previous speed | Revised speed | Gain |
| --- | ---: | ---: | ---: |
| Neutral | 4.926 m/s | 6.707 m/s | 36.2% |
| Full forward | 5.019 m/s | 7.570 m/s | 50.8% |

Rearward lean produces 2.451 radians of pitch after that one-second burst versus 1.373 previously; full forward lean keeps revised pitch at .061 radians. This is a response measurement, not a recommended sustained wheelie input. Browser keyboard A+W visibly lifted/looped the bike; recovery, retries and witness restart were exercised. Meaningful tests also cover rearward lift followed by forward recovery and braking from the increased speed. [Raw comparison](phase-3-handling.json).

The curated Works Line course JSON is byte-identical to the phase-2 baseline. Its riding `contentHash` remains `9d0386a46f7378211941a5a5b4be2f264a214bf419e38e3e47b912c0060a99bd`. Records use that riding content hash plus physics/bike identity. Old records are retained and isolated from revised handling. The shared generated geometry/rig fingerprint remains `457713bca35a9d1be345f93a2a88e59171d9a47dd917e4ce6165e6f117096848`.

## Offline planner and validation

The deterministic Python composer uses separate named random streams and strict obstacle contracts. It composes three bounded recipes using the existing six-sector teaching, rehearsal, variation, recovery and climax structure. It varies obstacle dimensions within that structure; arbitrary module order and arbitrary terrain are not implemented. The shared source polylines drive rendering and collision. Contracts cover entry/exit frames, finite dimensions, skills/difficulty, approach bounds, explicit empty gaps, seam/contact topology, safe checkpoints, scenery clearance and jump sightline anchors.

Python invokes versioned Node JSON protocol 1, verifier `quarry-verifier-1`, running the exact production 120 Hz simulation and pinned Planck. It starts with curated integration policies, then uses bounded action-segment search and robustness searches where needed. Branches replay their entire prefix from the start in one continuous physics world. Actual velocity/angular velocity, rider state, suspension translations and contacts carry across joins. Retained diagnostics contain this state; pose-only branch restoration is not used. Complete routes and each module's traversal within those routes are checked. Arbitrary entry states outside the measured ranges are not certified.

Every retained witness has nine cases: baseline, timing ±1%, throttle ±.01, lean ±.015, initial speed ±.1 m/s. Beginner acceptance requires 9/9, intermediate acceptance at least 80% (8/9). These are measured successes over specific perturbations, not a statistical guarantee of human success. Camera checks project the rider/take-off/landing at four approach positions in 16:9 and 4:3. They supplement browser review, rather than establishing universal visibility at every aspect ratio.

| Candidate | Recipe | Repair | Baseline time | Cases passed | Latest search evaluations / steps |
| --- | --- | ---: | ---: | ---: | ---: |
| Apprentice line | Beginner | 0 | 12.967 s | 9/9 | 10 / 15,598 |
| Cutstone rhythm | Beginner | 1 | 13.175 s | 9/9 | 20 / 31,510 |
| High bench | Intermediate | 1 | 13.350 s | 8/9 | 20 / 40,500 |

Initial Cutstone passed 8/9 but was rejected by the stricter beginner gate after 100 evaluations / 169,243 steps. Initial High Bench passed 6/9 and was rejected after 91 evaluations / 188,491 steps. Bounded repairs reduce the gap and final-climb scale within declared limits. Their identities and rejection reasons remain in the final reports. Revised High Bench still fails the +.01 throttle case: it remains running near x=85.984 m when the 30-second route limit expires. That case is explicitly unvalidated. No search failure is described as proof of impossibility. No staged candidate is human-approved.

Measured successful jump-entry speed ranges are Apprentice 8.192–8.800, Cutstone 8.098–8.725 and High Bench 8.346–9.141 m/s. These are sampled ranges, not proof that every point in the interval succeeds. [Structured evidence](phase-3-summary.json) includes all module speed/angle ranges, failed perturbations, identities, resource sizes, browser counters and attempts. Full retained replay and state reports are linked from the local dashboard.

Per-attempt limits are 350,000 physics steps, 110 evaluations, 20 seconds, 32 action segments and beam width 3. Override ceilings are enforced. Python caps the Node heap at 192 MiB and subprocess time at 31 seconds; bank time is 120 seconds with three candidates and at most two repairs each. Process timeouts and exhausted budgets produce explicit rejection. The curated default and previous valid review pointer survive failed jobs. There is no approval/promote command in this milestone.

## Provenance and resources

Python 3.12.14, Node 24.19.0, Blender 4.5.3 LTS, Three.js 0.180.0 and Planck 1.4.2. CI targets Node 22 / Python 3.12. The existing Python/headless-Blender bike/rider pipeline was retained and exercised; no placeholder backend substitution occurred. Cached bank generation needs Python and Node, but uses the already generated approved bike assets without invoking Blender.

Current asset release: `c1b84012482089ec1b89bf38b87b4bb63a6ee08d3518feb3fc81eb137abc5dbd`.

Review input identity: `260454678ce677df9c95d7fc66c0df22d9988325580bd0f77ce5207b0f05deab`; seed `quarry-review-01`. Full source/config/tool/runtime hashes are in its manifest. Candidate riding identities:

| Candidate | Content hash |
| --- | --- |
| Apprentice | `6f50f6b5e4a09c15df509ad25a3313d5f1fecc3c5763c946adeae54ca4f914dd` |
| Cutstone | `9e2ff874588f07ce54ba4ddf986d7a505d78c799250c309781f11397e0380abd` |
| High Bench | `126f447c8d4d11c1eedc4018789bc9347750e7bcd30fc10233f6f52e4813dd20` |

The approved manifest's twelve runtime resources total 1,334,957 bytes, excluding shared libraries/page code. Each candidate course is about 21.6 kB; per-tick replay 68–71 kB, report 48–51 kB and SVG sheet about 4.4 kB. This entire review stage is 441,151 bytes and stays outside export. Superseded generated runtime releases were moved into ignored local history. Tools, large Blender previews, search diagnostics and `.trials-build` are absent from `dist`. The ordinary static export ran without Blender or course search.

## Verification and browser evidence

**129 tests passed:** 110 JavaScript (29 Trials, 81 Drift/Pocket), 11 Trials Python and 8 Drift Python. After the final verifier acceptance change, the 29 Trials JavaScript and 11 Python tests were re-run successfully. Coverage includes suspension/lean/landing, checkpoints/faults/retry/pause/input, exact per-tick replay across rendering rates, record isolation, deterministic streams, dimension/schema failures, seams/gaps/spawns, scenery/sightlines, bounded failure, subprocess timeout, fallback retention and stale/corrupt resource rejection. The Python bank test invokes the real Node verifier in temporary staging.

Source and exported static validation each verified **240 local references** with no missing files or CDN dependencies. Exported Trials validation additionally passed the manifest/checksum/GLB/rig/course/audio contract for all twelve fetched resources. Local review validation passed with approval still pending. Export contains no generation diagnostics. No deployment or external publication was performed.

All three retained witnesses completed in the browser with zero faults, no console errors and maximum reported IK reach error 0.000000. Displayed times were Apprentice 12.96, repaired Cutstone 13.17 and High Bench 13.34 seconds (HUD truncates hundredths). The curated witness also completed at 13.49 seconds / zero faults under revised handling. The selector, manual controls, pause/resume, retry and witness restart were exercised. Screenshots: [Apprentice](phase-3-apprentice.jpg), [Cutstone](phase-3-cutstone.jpg), [High Bench](phase-3-highbench.jpg), [dashboard](phase-3-review.jpg). The SVG sheets are geometry/trajectory diagnostics, not new Blender art renders.

Identified desktop: Windows, AMD Ryzen 7 9800X3D (8 cores), NVIDIA RTX 5080, approximately 31.2 GiB OS-visible RAM, Chromium 155 / ANGLE D3D11, DPR 1. A dedicated High Bench full-route run at roughly 2558×1231 backing pixels recorded 2,668 frames, 200 FPS mean (apparent browser ceiling), p95 frame interval 5.1 ms, p95 physics CPU .1 ms and render submission CPU .5 ms, maximum 37 draw calls / 49,774 triangles. Repaired Cutstone at the smaller panel size recorded about 200 FPS, p95 physics .2 ms / render .6 ms. Maximum IK error was zero in both. The structured report preserves actual dimensions and samples for every run.

These short route captures meet the current draw/triangle/60 FPS targets on this identified high-end machine. CPU submission timing is not GPU elapsed time; this is not a sustained thermal or low-end-device benchmark. Background/concurrent tabs can reduce measured FPS. Autoplay witnesses intentionally leave audio locked; prior gesture unlock/decode checks and audio integrity tests do not replace human listening. No physical controller was exercised by the agent, so trigger feel, comfort and real disconnect behavior remain untested on hardware.

## Remaining gate and next phase

Review revised launch/lean recovery, all three candidate routes, their teaching/readability/difficulty and the current bike/rider art; supply explicit candidate approval or fixes. Confirm physical-controller and audio listening checks where applicable. Until then the bank stays staged and the exceptionally polished slice/full phase-3 gate remains open. No additional biome, bike class, online service, mobile controls or editor was added.

The exact follow-on is [phase-4-prompt.md](phase-4-prompt.md); it begins by checking actual human approval before promotion.
