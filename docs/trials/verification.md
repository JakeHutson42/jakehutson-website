# Phase-1 verification

Date: 16 October 2026. Local work only; no deployment or publication.

## Demonstrated

- Official portable Blender 4.5.3 LTS was downloaded into ignored `.tools/` and verified against the release's published SHA-256 checksum.
- Python 3.12.14 generated the bike/rider GLBs, named skinned rig, shared course specification, independent seeded scenery, three neutral-lit review renders and a contact sheet.
- Forced rebuilds preserve input/specification hashes, the canonical geometry/pivot/skin-weight fingerprint and riding-course identity. Blender binary ordering can differ; actual binary hashes determine each release ID.
- Node 24.19.0 production-simulation witnesses finish the five-section course at throttle 0.8/0.9/1.0 and lean 0/0.15/0.3, including a genuinely airborne gap crossing and controlled landing.
- The in-app browser completed the 0.9-throttle / 0.15-lean witness in **11.38 seconds, zero faults**. It exercises the ordinary simulation/rendering loop and suppresses record saving.
- Browser R retry adds one fault, Backspace clears the run, and pause held the displayed timer at **00:06.80** until resumed.
- Runtime rig diagnostics reported **0.000000 m** maximum hand/foot attachment error through the complete exported-page witness as well as the inspected pose exercises. The final exported scene reported **29 draw calls** and **41,704 triangles**; these are scene counters rather than a hardware FPS guarantee.
- Source and exported runtime resources are validated separately, including fetched course JSON, GLB buffers, embedded resource policy, skin presence, mechanical pivots and checksums.

## Test suites

| Suite | Tests |
| --- | ---: |
| Trials simulation, IK, input, records, CLI and geometry | 17 |
| Trials generation, schemas, resource integrity and safe failure | 5 |
| Existing Apex Drift/Pocket Circuit JavaScript | 81 |
| Existing Drift/static Python | 8 |
| Total | **111** |

All **111 tests passed**. Source and exported static checks each verified **230 local references**, and the exported Trials release passed its JSON/GLB/integrity validation. The exported page also completed the 11.38-second zero-fault witness in-browser. Initial test issues were corrected: checkpoint tests now move the whole constrained bike when probing crossings, and scratch fixtures use the checkout's ignored build directory in the Windows sandbox. A final visual check caught an invalid beam-height argument; the dedicated beam generator now has finite-geometry and dimension coverage.

## Limits

The browser ride used scripted witness inputs; human review of sustained keyboard/controller handling remains important for phase 2. Physical gamepad connection/disconnection, touch input, mobile OS audio, and reference-desktop sustained frame rate have not been verified. Standard gamepad mapping and focus-loss cleanup have automated coverage. No claim is made that the full game's art, handling or level-generation quality bar has been achieved by this foundation.

The approved bike/rider and neutral-lit contact sheet are reviewable outputs of the generator. Large renders/caches remain outside the public export; the compact contact sheet in this documentation is for review.
