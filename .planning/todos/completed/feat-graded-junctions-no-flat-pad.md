---
id: FEAT-19
type: feature
status: completed
resolved: 2026-06-30
resolution: "Junction flatten now eases gradeY toward a slope-preserving grade LINE (through-road grade projected) instead of a scalar nodeY, in _applyJunctionBlend + _applyMidspanJunctionBlend (src/road.js), commit 9b91d9a. Through road keeps its grade; joining road matches it. All road gates green. Verified in-browser by user ('good enough to call completed'). NOTE: junction footprint pad-mesh visual polish on slopes is deferred to QUAL-10 — user is hoping QUAL-10 improves the smoothness further."
opened: 2026-06-30
severity: minor
source: user-request
note: "Intersections flatten to LEVEL even on a slope, which breaks the road's natural descent grade and
makes them no-fun to drive through fast. For a mid-span T-junction we should NOT flatten all three legs:
keep the through road (the T's crossbar) on its grade + inclination, and have the joining road (the T's
upright/stem) match that grade/inclination where it joins. Four-way + on-slope junctions likewise should
follow the natural grade instead of going flat. Root cause: the flatten eases gradeY toward a scalar
nodeY (a constant height) → local slope forced to 0. Builds on FEAT-07/FEAT-13 junction work."
---

# FEAT-19: Graded junctions — stop flattening intersections to level; match the road's grade

## Problem

Intersections currently flatten to **level**, even when the road is descending. On a slope this reads
wrong and is hard to drive through quickly — it kills the fun. The user specifically wants:

- **Mid-span T-junction:** don't flatten all three legs to one level pad. The **crossbar** (the road that
  passes THROUGH the junction) keeps its grade and inclination; the **upright/stem** (the road that joins
  it) eases to **match the crossbar's grade and inclination** at the join point. Three legs, one surface,
  but that surface follows the through road's slope — not horizontal.
- **Four-way + on-slope junctions generally:** follow the natural descent grade through the crossing
  rather than collapsing to a flat pad.

## Root cause

Both flatten paths reconcile `gradeY` toward a **single scalar `nodeY`** — a constant height — over a
`roadJunctionBlendLength` smoothstep ramp. Easing the grade toward a *constant* necessarily drives the
local longitudinal slope to **zero**: that constant target IS the flat pad. Specifically:

- `_applyJunctionBlend` (`src/road.js:3199`) — shared-anchor (endpoint) junctions:
  `gradeY[i] += (ny - gradeY[i]) * fG`, where `ny = ej.jStart.y / jEnd.y`, a scalar.
- `_applyMidspanJunctionBlend` (`src/road.js:3224`) — FEAT-07 AT_GRADE mid-span crossings: same form,
  `ny = x.nodeY`, a scalar stored per crossing in `_crossingsByRun` (`{ arc, nodeY }`, `road.js:3225`).
- The scalar itself is the **mean incident road grade-Y**: `_graphJunctionGradeY` (`road.js:3182`) /
  `_anchorJunctionGradeY` average every incident strand's endpoint Y. So both strands of a crossing ease
  to the same height (`_addCrossingByRun(runA, arcA, nodeY)` + `(runB, arcB, nodeY)`, `road.js:2226`),
  which fixes the visible step (FEAT-07's "mess" fix) but also **flattens the slope** as a side effect.

There is already a grade-vs-camber distinction (`flatCamber: degree ≥ 3`; a degree-2 graph pass-through
keeps its banking — `road.js:3172`), but **grade is still reconciled to a flat scalar even for
pass-throughs**. The through road loses its slope at every join.

## Direction (decide specifics at planning)

The reconciliation target must be a **grade LINE (slope-preserving), not a height CONSTANT**:

- **Identify through vs joining at a crossing.** A mid-span crossing is interior (`arc`) to a run that
  passes THROUGH it (the crossbar); a run that terminates at the node is the upright/stem. T = one
  through + one terminating; 4-way = two through. The classifier already has the per-crossing records
  (`_detectJunctions` / `_recordCrossing`, runA/arcA/runB/arcB) — extend them to mark which strand is
  through (interior arc, well away from its own endpoints) vs terminating.
- **T-junction:** leave the crossbar's `gradeY`/`camberRad` **unchanged** through the crossing. Ease the
  upright's joining end to land **on the crossbar's surface** at the contact point — match its grade
  (height + local slope) and its inclination (cross-slope/camber at that lateral offset), instead of
  pulling both to a flat mean. The upright bends in the last `roadJunctionBlendLength` to meet the
  through surface tangentially.
- **Four-way / two-through:** can't preserve both grades unless they match. Pick a dominant surface
  (e.g. the through road, or the steeper/priority road) and have the other match it locally — but keep
  the dominant road's descent grade rather than averaging both to level.
- **Data-model change:** `_crossingsByRun` stores a scalar `nodeY`; to preserve slope the target needs a
  height AND a slope at the crossing (e.g. `{ arc, nodeY, dGradeDArc }`, or a reference to sample the
  through run's profile at the contact arc). The flatten math then eases toward `nodeY + slope·(s − arc)`
  instead of a constant.
- **Keep the C0 guarantees.** Whatever replaces the scalar must still make both strands AGREE at the
  contact (no invisible step — the FEAT-07 reason this exists), still respect the endpoint taper that
  protects shared-anchor continuity (`road.js:3239`), and still be a **pure fn of the network →
  window-invariant** (the flatten is consumed in `_buildRunProfile`/`_buildCamberProfile` and must read
  identically regardless of stream order; cf. RUNKEY-SET-INVARIANT).
- **Mesh == collision (QUAL-07):** the ribbon, carve, and physics all read this `gradeY`, so a graded
  junction surface must stay consistent across all three (no special-casing the mesh).

## Acceptance

- A T-junction on a slope: the through road holds its grade/inclination across the crossing; the joining
  road meets it smoothly at matching grade — no horizontal pad, no step, drivable at speed.
- A four-way on a slope follows the dominant grade through the crossing instead of flattening to level.
- Junctions still meet at one surface at the contact (no invisible C0 step — road-smoothness gate stays
  green) and stay window-invariant (graph-invariance / camber-continuity gates green); `npm test` green.
- Genuinely flat-terrain junctions still read fine (the change is grade-following, not grade-forcing).

## Related

- **FEAT-07** at-grade mid-span flatten (the `_applyMidspanJunctionBlend` this revises) +
  [[project_crossing_classifier]] (the crossing classifier feeding `_crossingsByRun`).
- **FEAT-13** graph network (`_runEndpointJunctions` degree logic, `_graphJunctionGradeY`) —
  [[project_feat13_v2_foundation]].
- **FEAT-08** self-overpasses / **FEAT-11** tunnels / **FEAT-18** river bridges — the grade-separated
  crossings; this ticket is the *at-grade* counterpart (keep the crossing on-grade rather than level).
- Camber march discipline to respect when touching the blend: [[project_road_camber_curvature]].
