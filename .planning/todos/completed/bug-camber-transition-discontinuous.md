---
id: BUG-19
type: bug
status: closed
opened: 2026-06-24
closed: 2026-06-24
severity: major
source: user-observation
regression_of: BUG-10
resolution: "Root cause was NOT the run adjacency (predecessor lookup + node coincidence verified correct). It was a DESYNC between two camber computations: _buildCamberProfile (the profile the carve/ribbon read via camberProfile()) uses arc-length-WINDOWED curvature (the BUG-12 camber fix), but _runEndCamber (the cross-run SEED source feeding the next run's start) still used the old per-adjacent-point finite difference. So each run was seeded from a value that didn't match the predecessor profile's real end → banking stepped at every continuing run boundary. Fix: extracted ONE canonical _computeCamberArrays (windowed curvature + slew march) and routed BOTH _buildCamberProfile and _runEndCamber through it, so the seed equals the predecessor's real end and they can't desync again. Restored + registered the camber-continuity gate (test/camber-continuity.mjs, deleted in the overhaul — why this regressed silently): drives the network run chains and asserts banking carries across every continuing boundary; worst boundary step 5.95° → 0.00°. 10/10 gates green. NOTE: _buildRunProfile.camberRad is still per-point but is vestigial (only feeds the uncalled sampleRoadAt; the surface reads camberProfile). Angled cross-run queryNearest flips (parallel switchback arms / crossings) are a separate, narrower phenomenon tied to the FEAT-07 junction model, not this seeding contract."
---

# BUG-19: Camber transitions are discontinuous again (regression of BUG-10)

## Symptom

Road banking changes abruptly at points along the road instead of easing in/out — the same felt jolt
BUG-10 fixed. Confirmed currently in-sim (2026-06-24). Camber is read per-vertex by the ribbon, the
terrain carve cross-section (terrain.js camberProfile), AND physics, so the step is both visible and
felt (a sideways jolt where banking snaps).

## Why it regressed (the BUG-10 fix is present but no longer connects everywhere)

BUG-10's fix — seed each run's start camber from its predecessor's end instead of resetting to 0 — is
still in the code: `_runStartCamber` / `_runEndCamber` (road.js ~2175) walk a predecessor chain and
forward-march slew-limited camber. The break is in **how the predecessor is resolved after the Road
Overhaul rewrite**:

- `_predecessorRunKey` (road.js ~2300) builds adjacency by spatial-hashing run **endpoints**: a run's
  predecessor is whichever run's END point lands within `XZ_EPS = 2 m` of this run's START. Camber is
  only continuous along an unbroken end→start geometric chain.
- That chain breaks (→ `seed = 0`, banking resets mid-road → the discontinuity) wherever a run's start
  has no end→start predecessor in `_network`:
  1. **COVER-suppressed predecessor.** COVER suppression DELETES overlapping connections from
     `_network`. If `mz:mx-1` was dropped, `mz:mx`'s start node has no matching end → seed 0.
  2. **Branch / junction nodes.** The endpoint hash maps a shared node → exactly ONE runKey
     (last-writer-wins). Where 3+ runs meet (junctions, switchback apex), only one branch gets the
     predecessor; the others reset.
  3. **queryNearest run-flip between parallel arms.** Two switchback arms running alongside each other
     are NOT in an end→start relationship, so they carry independently-seeded camber profiles; where
     the nearest-run flips between them (D4 disambiguation), camber jumps between the two — exactly the
     BUG-10 failure mode, now reachable through a different adjacency gap.

## Why it slipped through

The camber-across-run continuity gate (`test/spline-continuity.mjs`) was left as an **on-demand
diagnostic, NOT registered in `npm test`** (see BUG-10 resolution). So the rewrite's adjacency change
regressed camber continuity with no gate to catch it.

## Fix directions

- **Promote + harden the gate first.** Register a camber-continuity gate in `test/run-all.mjs` that
  builds a multi-run road crossing run boundaries mid-turn — including a COVER-dropped neighbour and a
  switchback where the nearest run flips between arms — and asserts `|Δcamber|` per metre ≤ slew rate
  ACROSS every seam a wheel can traverse (not just sequential end→start joins).
- **Close the adjacency gaps:** seed from the geometrically-nearest run's camber at the start node even
  when it isn't a strict end→start predecessor (COVER-dropped / branch / parallel-arm cases), or stitch
  camber over the continuous physical neighbourhood the wheel actually traverses rather than the
  per-connection run graph. Keep it deterministic + window-invariant (must not reintroduce
  restream-variance — the reason the recursion is order-independent today).
- Consider symmetric (forward+backward) slew limiting so the banking ramp is centred on the curvature
  change rather than lagging it (noted but unaddressed since BUG-10).

## Acceptance

- Driving across run boundaries — including COVER-dropped neighbours and switchback arm flips — banking
  eases in/out; no felt sideways jolt and no visible camber step.
- A camber-continuity gate covering those seam types is registered in `npm test` and green.
- `invariance` / `restream-invariance` stay green (the seeding stays a pure fn of the band's run set,
  not streaming/cache history).

## Files

- `src/road.js` — `_runStartCamber` / `_runEndCamber` / `_predecessorRunKey` (adjacency by endpoint
  hash), `_buildCamberProfile`, COVER suppression in `_streamNetwork`, the D4 nearest-run flip in
  `queryNearest`.
- `test/spline-continuity.mjs` — the existing on-demand camber-across-run check to extend + promote.
- `test/run-all.mjs` — register the gate.

## Relationships

- **Regression of BUG-10** (closed 2026-06-21) — same symptom, new root cause (post-overhaul run
  adjacency gaps + an unregistered gate).
- Related to the per-connection run identity + COVER suppression introduced by the Road Overhaul
  (cancelled `road-overhaul` ticket) and the D4 switchback disambiguation in `queryNearest`.
