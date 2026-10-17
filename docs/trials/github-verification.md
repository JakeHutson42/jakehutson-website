# GitHub handoff verification

17 October 2026. Quarry Trials is linked as a new tab in all five shared/duplicated desktop and mobile site navbars. Its navigation badge uses the quarry's green/amber palette. The six approved quarry courses remain the ordinary runtime bank; forestry stays in offline/local review. No deployment is triggered manually by this handoff.

Before committing, the complete staged checkout was materialized into an ignored clean directory, without the original tools, caches or build output. **134 JavaScript tests** (Trials, Drift and Pocket) and **18 Trials Python tests** passed there. Source/static-export checks verified 263 local references; asset/catalogue validation confirmed all pinned fetched resources and unchanged approved identities. Ordinary export required neither Blender nor search. The earlier phase-6 verification additionally records the eight passing Drift Python tests and desktop/responsive QA.

Two portability issues were corrected: standalone forestry/release tests now create their own scratch directory, and `.gitattributes` preserves exact checksum-addressed runtime/vendor/authoring bytes on both Windows and Linux. Git line-ending conversion must not rewrite immutable physics/verifier/resource hashes. The upstream Planck bundle's final blank line is retained deliberately. No physics, course, asset or record identity was changed.

Local tools, `.trials-build`, generated `dist`, Python caches and large generation diagnostics remain ignored. Frozen review packages and compact evidence are versioned so another checkout can validate/rebuild the approved catalogue without ignored local dependencies. Physical-device/content review gates remain those in `release-readiness.md`.
