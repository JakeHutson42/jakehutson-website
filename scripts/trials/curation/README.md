# Frozen curation inputs

These compact JSON/replay/report packages preserve the exact source geometry and validation evidence used for the course catalogue. They are authoring inputs, not the runtime or a general search cache. Their original generation reports remain unchanged; actual human approval is recorded separately against riding hashes in `../specs/approvals.json` and `docs/trials/phase-4-approval.md`.

`phase3` contains the three phase-3 routes approved by the user. `phase4-proposals` retains two successful new beginner variants and one rejected intermediate variant. The rejected variant is not selected by `release.json` and cannot be promoted by the release command. `thumbnails` contains real browser captures of the specified courses, using the local thumbnail camera, original renderer and approved asset pipeline.

Ordinary static export excludes this entire tooling tree. Rebuilding the checked-in approved catalogue uses these frozen inputs without Blender or search. Preparing new geometry remains an offline generation/verifier task with separate human approval.
