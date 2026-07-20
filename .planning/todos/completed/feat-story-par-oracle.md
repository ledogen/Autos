---
id: FEAT-29
type: feature
status: completed
opened: 2026-07-16
closed: 2026-07-20
severity: minor
source: story-mode design (.planning/story-mode/DESIGN.md — read it first)
relates_to: STORY MODE SM-2 (.planning/story-mode/MILESTONES.md), router arc primitives
  (src/road-carve.js), route cache/bundle, FEAT-21 (POIs — future mission endpoints)
depends_on: nothing — pure math over existing route data; order-independent
---

# FEAT-29: Par oracle — physics-honest reference time for any route

## Request

A pure-math module that, given a route through the road network (a chain of the router's arc
primitives / centerline data), returns a **reference time**: the time a fixed-reference point
mass driving on a friction circle would take. Curvature bounds cornering speed
(`v² ≤ μ_ref · g · R`, camber optionally honored), grade bounds accel/decel capability, and a
forward-backward pass (accel-limited forward, brake-limited backward, curvature envelope min)
yields the speed profile; integrate for time.

This is the economic foundation of story mode: mission payout = margin against par
(SM-INV-4). It exists because par derived from the same cost model that made the road
inherits the road's character *by construction* — no per-mission tuning, auto-scales with
regional difficulty (see DESIGN.md, "The organizing problem").

## Invariants that bind this ticket (from DESIGN.md)

- **SM-INV-2 — Par NEVER scales with the player's car.** Inputs are road geometry + fixed
  reference constants (`parMu`, `parAccel`, `parBrake`, `parMass` if needed) — NEVER live
  vehicle params, RANGER_PARAMS, or the current drivetrain. Reference constants live in
  their own const object; they are design-tuning knobs, not vehicle stats.
- **SM-INV-3 — Never render a countdown.** This module computes a number; no HUD surface in
  this ticket. Debug-panel readout for tuning is fine (dev tooling), player HUD is not.
- Determinism: pure function of route data → same par from any stream center
  (window-invariance discipline). Par must be computed from the routed centerline (the same
  arc/clothoid data the carve uses), not from a live-sampled drive.

## Amendment 2026-07-20 — endpoints are mid-edge, so par takes an arc range

DESIGN.md ("Where missions and POIs live", RATIFIED 2026-07-20) binds mission starts/ends and
POIs to **arbitrary `(runKey, arcS)` points on an edge**, never snapped to graph nodes. So the
oracle's unit of work is a **half-open arc range on one centerline**, not a whole edge:
`parForRange(centerline, gradeAt, s0, s1, refParams)`. Whole-edge par is the `s0=0, s1=length`
case. A multi-edge route is a chain of ranges (first and last partial), with the speed profile
carried *across* the joins — the backward brake pass must reach back into the previous edge, or
a fast approach to a slow corner one edge later prices as free.

## Open questions (scope in plan mode when picked up)

- Input representation: per-connection run centerlines already carry arcS/curvature/gradeY —
  consume those directly, or the arc-primitive list pre-refit? (Must match what the route
  cache stores so par is available for any A→B the mission system proposes.)
- Multi-edge routes: par for a mission = sum over graph path edges + junction penalty? How do
  junctions/pads price (slow-to-X through a junction)?
- Route bundle coupling: road* param changes regenerate routes (see memory
  project_qual13_sloped_pads) — par is a function of the same data, so it regenerates with
  them; no separate cache invalidation story needed. Confirm.
- Camber/width: include in the lateral envelope now, or geometry-only v1?

## Acceptance

- [ ] `src/` pure-math module (no Three.js scene deps, importable headlessly like tire.js)
      exposing `computePar(routeData, refParams) → { time, speedProfile? }`.
- [ ] Reads ONLY route geometry + fixed reference constants; a test proves par is identical
      before/after changing vehicle params (SM-INV-2 as a gate assertion).
- [ ] Deterministic + window-invariant: same route → same par regardless of stream center.
- [ ] Sanity gates: par(flat straight) ≈ length-limited by accel/vmax; par monotonically
      increases with added switchbacks/grade on fixture routes; a real seeded route's par is
      within plausible bounds of a recorded human drive (report-only, not a hard gate).
- [ ] Registered in test/gates.mjs with subsystem/cost/desc.
- [ ] No per-frame cost — par computed at mission-offer time (or cached per edge), never in
      the physics loop.


## Resolution (2026-07-20)

**Shipped** as `src/par.js` + gate `test/par-oracle.mjs` (registered in `test/gates.mjs`,
subsystem `story`, cost `fast`), together with the beta mission harness that consumes it
(`src/mission.js`, pause-menu entry "story mode (beta)").

- `computePar(segments, ref)` takes a chain of **arc ranges** (`{centerline, gradeAt, s0, s1}`),
  per the 2026-07-20 amendment — mid-edge endpoints, reverse traversal, and multi-edge routes all
  fall out of the same call. Three passes: curvature envelope (`v² ≤ μ·g·cosθ·R`), accel-limited
  forward, brake-limited backward, friction-circle coupled longitudinally, grade in both. The
  speed profile carries across segment joins; junction corners are priced from the heading change
  between consecutive edges.
- `RoadSystem.missionGraph(cx, cz, r)` and `RoadSystem.edgeParData(c1, c2)` are the two seams added
  to road.js — a side-effect-free node graph over arbitrary bounds, and routed-centerline +
  elevation-sampler for one edge (reusing the streamed entry when present).
- Acceptance met, with one carry-over: **the "par vs a recorded human drive" check is still
  report-only and uncalibrated.** `PAR_REF` is a first pass (μ 0.75 / accel 2.8 / brake 5.5 /
  vMax 28) pricing a winding leg at ~55-60 km/h average. Calibrating it against real drives is
  the follow-up ticket **FEAT-30**, and is precisely what the beta harness exists to enable.
