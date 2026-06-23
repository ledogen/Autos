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
- **Phase B — MACHINERY BUILT, HELD OFF (flag `USE_CENTERLINE_RIBBON=false`).** Consumers can sample
  the exact centerline (CenterlineCurve + per-run centerline + monotonic polyline→centerline arc
  table); flipping the flag makes `road-minradius.mjs` GREEN — **the BUG-12 fold is genuinely fixed**.
  Held off because activating it regresses `invariance.mjs`. Root cause found (see HANDOFF §11):
  1. The raw arc SEARCH wanders km (`wAlt·nH` absolute-altitude attractor; 21/45 conns >5×, one 132×)
     → cleanup stack (`_removeLoops`/COVER) is load-bearing → routed centerline ≠ rendered polyline →
     slice mapping breaks at loop-removal splices.
  2. The research-correct fix (bounded "avoid-ridges" valley cost) tames the wander (loops 23→1,
     arc-router stays 9/9) BUT shifts routing → flips COVER/`_runOwnerAnchor` thresholds → breaks
     RUNKEY/ARCS/SLICE invariance (BUG-14 class). Routing + assembly are COUPLED.
- **NEXT (coordinated rewrite, not a bolt-on):** land the loop-free search AND replace the
  COVER/owner/loop-removal polyline assembly with primitive-centerline-native run identity
  (HANDOFF §5/§8) so invariance no longer depends on routing-sensitive thresholds. Then delete the
  patch stack (Phase C) and flip `USE_CENTERLINE_RIBBON=true`. Baseline is GREEN at 7/8 (road-minradius
  red by design); dormant machinery + `centerline-curvature.mjs` gate ready to validate.

## State at handoff (branch road-invariance, UNCOMMITTED)
Phase-2 work done + worth keeping: `_protoAnchorHeading` (canonical, invariant) + `arcPrimitiveConnect`
`startHeading`/`goalHeading` + `dubinsPath` terminal → control polyline valid (0.5–2 m → 6–8 m). New
gate `test/road-minradius.mjs` registered (2/4; residual = Catmull-Rom overshoot + `_removeLoops` splice
corners, both dissolved by the rewrite). See [[project_bug12_execution_status]].
