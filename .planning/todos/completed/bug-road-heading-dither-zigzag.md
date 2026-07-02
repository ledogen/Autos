---
id: BUG-16
type: bug
status: open
opened: 2026-06-21
severity: major
source: user-observation (in-sim screenshot)
---

# BUG-16: Road centerline zigzags (heading-quantization dither) when bearing isn't on an arc quantum

## Symptom

Near-straight roads render with a periodic serpentine wiggle — the centerline weaves side to side in a
regular S-wave instead of running straight (see in-sim screenshot 2026-06-21: a road that should be a
gentle near-straight line snakes left-right repeatedly along the valley). It is drivable but wavy, and
the wiggle is purely a routing-geometry artifact, not terrain following.

**This is NOT the old staircasing.** The earlier routing-discretization staircasing (blocky stair-step
centerline that was "super hard to drive") is FIXED — the arc-primitive router now emits
min-turn-radius-VALID, G1-continuous arc primitives. What remains is a *heading dither*: the path can't
hold a bearing that lies between the discrete heading quanta, so it alternates between the two nearest
quanta to approximate that bearing on average.

## Root cause (from code)

The router is the arc-primitive hybrid-A* lattice search `arcPrimitiveConnect` (`src/road-carve.js:728`,
called from `road.js:1278` via `_protoConnect`). Its search state is **discretized**:

- `src/road-carve.js:732` — `hbins = opts.hbins ?? 24` → heading is quantized into 24 bins of **15°**.
- `src/road-carve.js:755` — `stateOf(x,z,th) = cellOf(x,z) * hbins + binOf(th)`; each primitive starts at
  the previous arc's end heading (G1), `stepLen ?? 8 m` per primitive (`:731`).

When the straight-line bearing from A to B is, say, 7.5° off a bin center, no single heading quantum
points at the goal, so the cheapest valid path threads alternately through the two adjacent 15° bins —
left-arc, right-arc, left-arc — yielding the observed zigzag. The wiggle amplitude scales with how far
the desired bearing sits between quanta; its period is a few `stepLen` primitives. Coarse `hbins` was
chosen for cold-route speed (`:732` comment "fewer states = faster cold route"), trading bearing fidelity.

Related prior note: `project_arc_road_defects` already flagged "heading-dither wander" as an open
arc-router defect alongside the (now-addressed) anchor-join kinks and vertical bumps.

## Fix directions (to design when addressed — not now)

- **Post-process the lattice polyline** with a min-radius-preserving smoothing / string-pulling
  (shortcut) pass: collapse the dither into the straightest path that still respects `roadMinTurnRadius`
  and clearance. Mirrors how grade is post-smoothed (`smoothGradeInPlace`) — need the XZ analogue that
  cannot violate min-radius (there is already `arcFilletWaypoints` / `filletMinRadius` machinery to lean on).
- **Finer heading discretization** (raise `hbins`, e.g. 48–72) — straightforward but increases state count
  and cold-route cost; likely a partial mitigation, not a real fix.
- **Goal-aware terminal primitive**: when the remaining span to B is clear and within a single arc,
  emit one arc to the exact goal instead of continuing the lattice (kills end-of-run dither).
- **Continuous refinement / relaxation** of the centerline toward the lattice's homotopy class (snap-free
  arc fit) so the final spline holds an arbitrary bearing.

## Relationships

- **QUAL-03** (re-architect roads around constrained-spline + swept cross-section): a continuous
  constrained-spline model would not quantize heading at all — this bug is strong motivation for that
  direction, and a smoothing/relaxation pass may be the bridge until then.
- **BUG-12** (ribbon tears at sharp corners) and **BUG-15/BUG-14** (carve↔surface steps): all are
  centerline/surface-geometry quality; a min-radius-preserving smoothing pass would help several.
- Prior arc-router defect notes: `project_arc_road_defects`, `project_arc_primitive_router`.

## Acceptance

- A road whose ideal bearing is off the heading quanta renders as a smooth near-straight line — no
  periodic lateral S-wave. The centerline's lateral deviation from its local straight-line/great-arc fit
  stays below a small threshold on low-curvature spans.
- Still min-turn-radius VALID BY CONSTRUCTION (no new kinks/folds introduced by the smoothing pass).
- Headless metric (candidate gate): on a near-straight A→B route at a bearing deliberately set between
  heading bins, assert the centerline's max lateral excursion from the A→B chord (or its curvature
  oscillation / sign-change count per 100 m) is below threshold — and that a coarse-`hbins` run exceeds it
  (negative control). Reuses the harness `arcPrimitiveConnect` path (already headless via road-carve.js).

## Files

- `src/road-carve.js` — `arcPrimitiveConnect` (`:728`), `hbins`/`stepLen`/`binOf`/`stateOf` discretization
  (`:732`/`:755`); `arcFilletWaypoints` / `filletMinRadius` / `smoothGradeInPlace` as smoothing-pass tools.
- `src/road.js` — `_protoConnect` (`:1262`, calls the router), `_limitCurvature` (`:1212`) context.

## Resolution (2026-07-01)

**Fixed** by the corridor Dubins shortcut pass inside `arcPrimitiveConnect` (BUG-16/FEAT-20 refit,
`src/road-carve.js`), enabled via `roadRefitShortcut` (data/ranger.js, debug slider "Refit Shortcut").

**Root cause CORRECTED during planning** — the ticket's diagnosis above is wrong in one important way:
the router stores CONTINUOUS headings per state (only the state *keys* are binned by `binOf`), so there
is no per-primitive alternation between adjacent 15° bins. The real artifact is a single
long-wavelength BOW/S (~22–36 m lateral over a ~500 m connection, measured headlessly): when the
canonical `startHeading` differs from the chord bearing (the normal case), the greedy weighted-A*
(wHeur 1.5) holds a quantized heading through long runs and defers the correction — consecutive
connections then read as the periodic serpentine. A κ box-filter alone cannot fix this (it preserves
∫κ / the long-wavelength shape: 33 m bow → 32.7 m at W=30); the shortcut was measured to fix it
(28.9 m → 1.57 m at 5° offset, 21.7 m → 3.46 m at 7.5°, endpoint pose error ~1e-14).

Acceptance is HARD per span — length ≤ raw·1.02, max sampled grade ≤ raw + slack AND grade-excess
∫max(0, g−maxGrade)ds ≤ raw + 1 m (the integral is what actually protects switchback stacks), pond
discs clear, lattice bounds — else split-and-recurse; a failed final validation falls back
deterministically. Gate: `test/road-dequantize.mjs` (registered in run-all), including the ≥10 m
negative control with the refit off.
