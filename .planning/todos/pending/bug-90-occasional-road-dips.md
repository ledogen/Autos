---
id: BUG-90
type: bug
status: open
severity: minor
opened: 2026-10-19
source: owner, 2026-10-19 — "dips in road are wack occasionally"
---

# BUG-90: Occasional bad dips in the road surface

## Symptom
Now and then the road has a dip that looks/feels wrong. No capture yet — location, seed and
kind (vertical kink, carve fold, junction/causeway seam) unknown.

## Next step
- [ ] Capture one in-game (capture key) and run `node test/replay.mjs <capture>`; classify from
      gradeY / runKey / minR. Do NOT reach for a longitudinal grade smoother (standing ruling).

## Acceptance
- [ ] Root cause found from a capture; fix proven by replay.
