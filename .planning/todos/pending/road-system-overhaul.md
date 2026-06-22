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

## Progress

- **Phase A — DONE** (primitive centerline model, built BESIDE the old path).
  - `src/centerline.js` (NEW): `makePrimitive` (line/arc/clothoid, κ linear in s — Fresnel table for
    clothoids) + `Centerline` class (`pointAt/tangentAt/curvatureAt/minRadius/nearest`, arc-length
    parameterised) + `centerlineFromDescriptors`.
  - `src/road-carve.js`: extracted `_dubinsBest`; added `dubinsPrimitives` (descriptors); added
    `arcPrimitiveConnect({emitPrimitives:true})` → typed descriptors (chain arcs + Dubins terminal),
    legacy points path byte-unchanged.
  - `src/road.js`: `_protoConnectCenterline()` mirrors `_protoConnect` opts, emits a cached
    `Centerline`. No consumer reads it yet (Phase B wires ribbon/carve/queryNearest).
  - `test/centerline-curvature.mjs` (NEW, registered): EXACT `minRadius ≥ floor` (8.0 m over 252
    conns), per-primitive bound (108k prims), two-center D-16 invariance (byte-identical). GREEN.
  - Gate state: 7/8 green; only `road-minradius.mjs` RED (BUG-12, held until Phase B as planned).
  - **Decision logged:** G1 Dubins terminal kept for Phase A — fold-safety is satisfied (every
    primitive radius ≥ hardR; the fold was 100% Catmull-Rom overshoot, now bypassed). The G2
    clothoid-pair terminal is a ride-feel upgrade (continuous curvature), NOT a fold fix — deferred.
- **Phase B — NEXT:** switch `road-mesh.js sweepRibbon` + carve table + `queryNearest` to SAMPLE the
  Centerline (no Catmull-Rom slice). Expect `road-minradius.mjs` + `ribbon-carve.mjs` green, camber
  from exact `curvatureAt(s)`. Keep `invariance.mjs`/`restream-invariance.mjs` green.

## State at handoff (branch road-invariance, UNCOMMITTED)
Phase-2 work done + worth keeping: `_protoAnchorHeading` (canonical, invariant) + `arcPrimitiveConnect`
`startHeading`/`goalHeading` + `dubinsPath` terminal → control polyline valid (0.5–2 m → 6–8 m). New
gate `test/road-minradius.mjs` registered (2/4; residual = Catmull-Rom overshoot + `_removeLoops` splice
corners, both dissolved by the rewrite). See [[project_bug12_execution_status]].
