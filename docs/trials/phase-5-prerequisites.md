# Phase 5 — original prerequisite review (superseded)

Historical pre-feedback status on 16 October 2026: phase 5 requested; phase-4 human review remains open. No new biome assets, courses or runtime changes have been started, and no pending course has been promoted.

The user's phase-5 instruction explicitly requires: **“First close the outstanding phase-4 gates”** and **“After those gates are closed, confirm the next biome direction with the user.”** This review records missing evidence rather than interpreting the request to start phase 5 as approval of unseen routes.

## Evidence already present

The approval ledger records the actual feedback **“Phase 3 looks good”** for `qt-physics-3`, the retained Works Line and the three phase-3 candidates. The current approved catalogue contains those four routes. Phase-4 technical evidence is in [phase-4-verification.md](phase-4-verification.md), including 141 passing tests, all six browser witnesses, resource validation and the sustained full-size desktop capture. Those technical results do not supply the missing human review.

Fresh preflight validation passed for the existing asset manifest `c1b84012482089ec1b89bf38b87b4bb63a6ee08d3518feb3fc81eb137abc5dbd` and approved catalogue `e5a7fe14bb33aff1413136611ab9c25c59fa65a34be2aa2fce8fdfdd5a56907e`. Node v24.19.0 and the official Blender 4.5.3 LTS executable (build `67807e1800cc`) remain available. No content/physics identities or records were changed by this preflight.

## Human review needed

1. Approve or describe fixes for all six routes and the course-selection, progression and three-livery experience. The two unapproved riding hashes remain:
   - Timber Approach: `9774e7e51ab79a708f70507f1925b3072d1836b33b9a4a8a877707dbe9370436`.
   - Shift Change: `40e01393d5cdb11dc5b0ccab60db14a704cc3a274f4a2a6bbf2c131d8492d936`.
2. Supply actual riding feedback on medal targets: course, typical time/faults, and whether gold/silver/bronze feel too easy, fair or too difficult. Targets should change only where that feedback warrants it; unchanged targets can be accepted if human riding supports them.
3. Record physical-controller and listening results honestly: controller model, analog throttle/lean feel, retry/pause, real disconnect behaviour, and engine/landing/checkpoint mix. Untested checks stay marked untested. Automated mappings and successful sound decoding are not hardware/listening approval.

## Review links and current medal targets

- [Six-course review board](http://127.0.0.1:8765/trials.html?qa=release).
- [Timber Approach](http://127.0.0.1:8765/trials.html?qa=release&course=timber).
- [Shift Change](http://127.0.0.1:8765/trials.html?qa=release&course=shift).
- [Ordinary approved game](http://127.0.0.1:8765/trials.html), for persistent bests/progression review.

Use **Ride manually** to judge handling and difficulty. Review autoplay is only a witness; QA runs deliberately do not write personal records. Use the ordinary game to check saving/reloading bests, course selection and liveries. Start `python scripts/trials/serve.py` from the repository root if the local server has stopped.

| Routes | Gold | Silver | Bronze |
| --- | --- | --- | --- |
| Apprentice Line, Cutstone Rhythm, Timber Approach, Shift Change | ≤25 s / 0 faults | ≤45 s / ≤2 faults | ≤90 s / ≤8 faults |
| The Works Line, High Bench | ≤23 s / 0 faults | ≤40 s / ≤2 faults | ≤90 s / ≤8 faults |

Once actual responses arrive, record their wording and scope in the approval ledger, apply any warranted fixes/medal refinement, validate the release and close only the evidenced gates. Then confirm the next biome; the recommendation remains original alpine forestry with the same QT 250. The new biome's three routes will have their own staging and human-review gate. Nothing is deployed by this process.


## Superseding user direction / 16 October 2026

The subsequent user message states: “Yes it’s good so far. We can refine the courses later on. I want to make sure we get all framework and game systems implemented before we fine tune.” This approves the six-course quarry/system foundation and explicitly defers course/medal refinement. It authorizes independent phase-5 framework work without waiting for those refinements. Exact two-route approval evidence is now in `phase-4-approval.md` / the JSON ledger. Physical-controller and real listening checks remain untested; no hardware results were invented. Alpine forestry was presented as the recommended default, with no contrary preference received. The new biome is implemented locally with three routes still pending their own human approval. Current state/evidence: `phase-5-verification.md`; this earlier preflight does not remain a blocker to framework work.
