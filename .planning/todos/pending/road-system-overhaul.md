---
id: road-overhaul
type: refactor
status: pending
severity: high
---

# Road system overhaul — primitive-centerline rewrite (supersedes BUG-12 patching)

Owner-sanctioned major rewrite. `src/road.js` (~2,800 LOC, largest file) patches a structural
mismatch: the arc-router emits a valid curvature-bounded path, then `_assignSlice` **re-interpolates
it with overshooting centripetal Catmull-Rom** + `_removeLoops`/`_removeSelfCrossings` cleanup → ribbon
folds (BUG-12), slow streaming, not future-proof.

**Full plan + research + phased approach: `.planning/ROAD-OVERHAUL-HANDOFF.md` (read first).**

Target: carry ONE curvature-bounded centerline (line/arc/**clothoid** primitives, G2) from routing to
every consumer; consumers SAMPLE it (no re-spline, no patch). Industry standard (arc-splines/clothoids,
hybrid-A* + analytic smoothing, OpenDRIVE-style model). Deletes the Catmull-Rom slice + cleanup stack.

## Acceptance
- `test/road-minradius.mjs` GREEN (per-slice arc-spaced min radius ≥ fold floor on all fixtures incl.
  the 3 seed-6 captures) — plus an exact `|1/curvatureAt(s)| ≥ minR` primitive-level gate.
- `invariance.mjs` + `restream-invariance.mjs` stay GREEN (window-invariance / D-16 — top risk).
- `ribbon-carve.mjs`, `arc-router.mjs`, `defect-b-grade.mjs`, `replay-selftest.mjs` stay GREEN.
- Cold-stream a region without a visible hitch (perf).
- `road.js` materially smaller (patch stack deleted).

## State at handoff (branch road-invariance, UNCOMMITTED)
Phase-2 work done + worth keeping: `_protoAnchorHeading` (canonical, invariant) + `arcPrimitiveConnect`
`startHeading`/`goalHeading` + `dubinsPath` terminal → control polyline valid (0.5–2 m → 6–8 m). New
gate `test/road-minradius.mjs` registered (2/4; residual = Catmull-Rom overshoot + `_removeLoops` splice
corners, both dissolved by the rewrite). See [[project_bug12_execution_status]].
