---
closed: 2026-07-01
id: FEAT-22
type: feature
status: closed
opened: 2026-07-01
severity: minor
source: scoped from FEAT-17/FEAT-18 (shared detection layer both water features need)
relates_to: FEAT-17 (ponds — consumes the basin index), FEAT-18 (streams — consumes the flow trace)
---

# FEAT-22: Deterministic water-placement foundation — basins, flow traces, saddles

## Why this exists

Ponds (FEAT-17) and streams (FEAT-18) both need the SAME deterministic, window-invariant way to
read the terrain and answer: *where does water collect (basins), where does it flow (downhill
traces), and where does it spill (saddles/passes)?* Rather than duplicate that detection design in
both tickets, it lives here as the shared foundation. FEAT-17/18 are the feature-specific consumers.

## The enabling fact (why this is tractable)

`terrain.js analyticHeight(wx, wz)` is a **pure analytic function** of `(seed, x, z, params)` — it
computes `height()` from three seeded noise closures with **no chunk lookup**, samplable at ANY
(x,z) whether or not that region is streamed (contract: "never returns 0 for unloaded chunks",
terrain.js:14/1201). So water detection is **NOT limited to loaded chunks**: any algorithm over a
**bounded region** is computable anywhere and is window-invariant by construction — the same
discipline the road router already uses when it valley-seeks.

Terrain is **ridged multifractal** (`pow(1 - abs(noise), ridgeSharpness)`, terrain.js:201): coarse
layer 150 m amplitude at ~2 km wavelength (`coarseFreq 0.0005`), regional modulation at 500 m.
Ridged noise makes sharp crests with broad valleys between them, so valleys and passes are NATIVE
features — we detect them, we don't invent them.

## What this foundation provides

1. **Basin index (pond sites)** — a macro-cell-keyed pass that samples analytic height on a bounded
   coarse grid (~30–50 m spacing, mirror the router's valley-seeking), finds **local minima** (cells
   below all 8 neighbors), refines with a few gradient-descent steps. A minimum qualifies as a water
   site only if it has a **closed basin within a bounded ring** (rim above a threshold on all sides) —
   which is what makes ponds naturally RARE and tunable (no random dice roll: the threshold IS the
   rarity dial). Window-invariant because the ring is bounded and the sampling is pure.

2. **Flow trace (streams)** — gradient descent: from a source point step along −∇height (central
   differences, already done in `analyticNormal`) until reaching a local minimum. **A traced stream
   ALWAYS terminates at a basin** — that's a property of gradient descent, not something to enforce.
   So "streams end up at ponds" falls out for free.

3. **Saddle detection (passes / stream sources / basin spill points)** — a critical point where
   ∇height ≈ 0 and the 2×2 Hessian (second differences on the coarse grid) has **mixed-sign
   eigenvalues** (min along one axis, max along the perpendicular). A saddle is simultaneously the
   *spill point* of the uphill basin and the natural *source* of the downhill stream. This is the
   generator that couples the whole system: **find saddles → trace streams down from them → they pool
   into basins → those basins are ponds.**

4. **Generic `submerged` CG hook** — a general water-plane-vs-CG test any water feature reuses: the
   vehicle body origin is `vehicleState.position` + `cgHeight` param, so CG world Y is directly
   available. Hook = *if CG-XZ inside a water footprint AND cgWorldY < waterY → set
   `vehicleState.submerged = true` + a submerged depth*. v1 just SETS the flag (+ optional shallow
   drag stub); hydrolock / buoyancy / drag consume it later. Cheap to wire, expensive to retrofit —
   land the flag in v1. (Add `submerged`/`submergedDepth` to vehicleState in all THREE places —
   [[project_vehiclestate_three_places]].)

## Window-invariance discipline (non-negotiable)

Every basin, saddle, and flow decision must be a **pure function of a bounded neighborhood** keyed
to a macro-cell — NOT an unbounded flood over the loaded window. Because analytic height is
samplable anywhere, we CAN evaluate a bounded region deterministically; the limit is compute (how
big a region), not data availability. Extend `invariance`/`restream-invariance` gates: a given
basin/stream/saddle must resolve identically regardless of stream center or draw distance, and must
not pop.

## Acceptance

- A deterministic basin index yields the same pond sites + a flow-trace API + saddle list for a
  given (seed, region, params), identical from any stream center or draw distance.
- `vehicleState.submerged` flag exists and flips correctly for a water plane over a footprint.
- New water-invariance gate green; `npm test` stays green.

## Files (anticipated)

- `src/water.js` (new) — basin index, flow trace, saddle detection over `analyticHeight`.
- `src/vehicle.js` / `src/main.js` — `submerged`/`submergedDepth` vehicleState fields (3 places).
- `data/ranger.js` — basin-closure threshold, min basin size, coarse-grid spacing knobs.
- `test/` — water-invariance + basin-determinism gates.

## Related
- **FEAT-17** ponds — first consumer (basin index + fill + submerged flag wiring).
- **FEAT-18** streams — consumer (flow trace from saddles + channel carve + bridges).
- Terrain analytic sampling + Worker/CARVE SYNC discipline: CLAUDE.md "Terrain Worker",
  [[project_terrain_worker_constraints]], [[project_carve_invisible_cliff]].

## RESOLUTION (2026-07-01) — CLOSED, shipped

Generation landed in 27908e7 (src/water.js — basins/saddles/traceFlow + submerged hook, 9-gate
test/water-invariance.mjs). Wired into the game 2026-07-01: b31b60c (WaterSystem/WaterRenderer in
main.js over rawHeightWorld, submerged/submergedDepth on vehicleState in all four state sites,
per-frame CG test; water-invariance registered in run-all). Acceptance met: deterministic +
window-invariant basin/saddle/flow API from any stream center, submerged flag flips (gate
SUBMERGED-HOOK), npm test green.
