# Phase 2 verification — 16 October 2026

Status: **local implementation ready for review; phase-2 quality gate pending physical-controller, audio-listening and broader human handling/art review**. No deployment, additional biome/bike, procedural-search bank, online service or editor was performed.

## Implemented slice

The Works Line is a six-sector, 101 m ride from start X=2 to finish X=103: throttle/braking space, rounded crest, bounded suspension rollers, a .25 m teaching step, a 3.6 m explicit gap with broad landing/recovery, then three rising ledges to a finish at Y=1.25. Five ordered flat checkpoints isolate the challenges. Constant full throttle/forward lean fails at the final ascent; deliberate braking and a rearward lift followed by forward recovery completes it.

Handling changed to a 52 kg frame, 68 kg physical rider, 3.2 kg wheels, 8.5 Hz/.92 damped suspension, 265 Nm torque curve with smoothed throttle, and .36 m rider travel. Lean is a physical mass transfer; air correction is bounded at 32 Nm. Undefined/non-finite lean now stays neutral. No route-height snapping is used. Record identities changed to `qt-physics-2`, `qt-250-works-v2`, `quarry-works-v2`; older Trials records remain stored separately by identity, and existing game stores are untouched.

The generated bike has swept guards, side panels/graphics, fasteners, levers and hose detail. The rider has revised suit colours, helmet/visor graphics and boot soles. Python derives limb reach from the source rig, and the same bounded torso/head pose drives runtime articulation and the helmet sensor. Quarry dressing includes cut benches, rock scatter, crane/containers/timber, supported signs, a timber launch, marked step edges and a finish gantry. Neutral-lit side/three-quarter/front review: [asset contact sheet](asset-contact-sheet.png). Runtime evidence: [course](phase-2-course.jpg), [results](phase-2-finish.jpg), [keyboard finish](phase-2-keyboard-finish.jpg), [page](phase-2-page.jpg).

Original deterministic PCM idle/load/gravel/landing/checkpoint/finish cues are generated locally. Gesture resume, hash-checked loading/decoding, graph reuse, mute persistence, pause/blur fade and optional-error handling are implemented. QA autoplay leaves audio locked. Listening quality and real output-device balance have not been judged.

## Automated and browser evidence

- **120 tests passed** across 24 Trials JavaScript tests, 7 Trials Python tests, 81 Drift/Pocket JavaScript regressions and 8 Drift Python regressions. The available runtime was Node 24.19.0 / Python 3.12.14; CI remains Node 22 and Python 3.12.
- Meaningful checks include suspension rest, physical weight transfer, braking, controlled wheelie/recovery, airborne correction, real gap traversal/landing, deliberate final ascent, frame/body/helmet faults, sequential checkpoints, retry cleanup, pause timing, render-rate repeatability, keyboard/dialog/disconnect cleanup, record ranking, camera projection, rig reach across wheelies/jumps/crashes, audio lifecycle/failure, repeatable PCM/loop seams, 100 bounded roller seeds, safe recovery space, GLB pivot/socket alignment, integrity and corrupt-resource rejection.
- The structured production-simulation witness completed in **15.70 s / 0 faults**, with four landing events and all five checkpoints. [Replay samples](phase-2-witness.json). This is one explicit integration controller, not a search system or universal proof for random courses.
- Actual browser keyboard events exercised the initial run, coasting, teaching step/gap, a failed climb, R retry from the crash dialog, rearward lift/forward recovery, finish/results and restart. One complete keyboard-driven browser run finished at **14.46 s / 1 fault**, awarded silver, saved a personal best and restored it after reload. These were automated UI playtests, not independent human usability approval.
- The normal frame-loop witness completed at **15.69 s / 0 faults**, with **0.000000 m maximum measured IK endpoint error**. No browser warnings/errors were logged in the final route. Fullscreen keeps dialogs in its subtree. Records/help, Escape pause/resume, sound gesture/mute and a 390×844 responsive layout were inspected. Touch riding remains unsupported.
- Browser audio became `ready:true`, context `running`, `muted:true`, with no error after a sound-button gesture; unmute restored the preference. Speaker/headphone listening is untested.
- Source and exported static-resource checks passed **235 local references**, no missing references/CDNs. Trials validation additionally verified all **12 hashed runtime files**, including GLBs, rig/course/spec JSON and six WAVs. Current runtime payload is **1,334,939 bytes uncompressed**, excluding shared libraries/fonts. Ordinary export succeeded without invoking Blender.

## Identified desktop performance

Host: Windows desktop, AMD Ryzen 7 9800X3D (8 cores), NVIDIA GeForce RTX 5080, 33,461,846,016 bytes OS-visible physical memory (about 31.2 GiB). Browser: Codex in-app Chromium 155 on Windows, WebGL ANGLE / RTX 5080 / Direct3D11. Actual fullscreen canvas **2558×1334**, DPR 1, on a 2560×1440 desktop. Fullscreen used the desktop dimensions despite the earlier viewport override, so this is not mislabeled as a 1920×1080 render.

| Full-route counter | Observed |
| --- | ---: |
| Active rendering frames | 3138 |
| Mean RAF rate | 200.00 FPS |
| Frame interval p95 | 5.10 ms |
| Physics CPU work per render frame p95 | 0.20 ms |
| Render submission CPU work p95 | 0.60 ms |
| Maximum draw calls | 37 |
| Maximum visible triangles | 49,774 |

[Raw counters](phase-2-performance.json). The in-app browser appears capped near 200 Hz. CPU submission time is not GPU elapsed time; this short full-course capture is not a thermal, low-end desktop or physical-controller benchmark. Some rendering frames contain no 120 Hz physics step. Audio was locked during this reproducible performance witness; a separate gesture/audio check ran successfully.

## Content/build provenance

Pinned Blender **4.5.3 LTS**, Python **3.12.14**, local Planck **1.4.2**, local Three **0.180.0**. Approved content ID: `9468039a49972f5c3f28d1cda625da1174fd75efe215b15cc77aab6ddf4d1973`. Input hash: `62989d2821c05586a6b4e267ee21b0179716bb3cf98b05023aabcf689a25fc13`. Named seed: `quarry-01`; generator: `quarry-slice-2`. Source/config hashes, derived specifications, file integrity and tool pins are in the manifest. Headless Blender exported and rendered the revised assets; the final course rebuild reused those approved binaries. Staging and large previews/tools remain outside export. Superseded generated release copies were removed; stored records were not cleared.

## Remaining gate

No physical controller was available through the automation tools. Standard mapping/dead-zone/reset/disconnect logic tests pass, but trigger feel, controller reach/comfort and physical disconnect behavior need a real controller. Original audio needs actual listening and mixing judgement. The stylised art and final-ascent difficulty need independent human approval before describing this as the exceptionally polished finished slice in the plan. No blocker is being hidden behind a “phase complete” claim.

Local page: **http://127.0.0.1:8765/trials.html**. Exact next-phase prompt: [phase 3](phase-3-prompt.md); settle the remaining phase-2 review before using it.


## Subsequent user review / 16 October 2026

The user reported: “it all works fine” and “for the first go its pretty good,” while requesting more influential lean and much greater acceleration. This is recorded as overall human first-pass feedback, not invented controller-model or listening-test evidence. The requested handling revision and offline phase-3 review tooling are documented in `phase-3-verification.md`. Candidate publication and claims of human approval remain blocked until the candidates themselves are reviewed.
