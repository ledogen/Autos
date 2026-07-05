---
id: QUAL-13
type: quality
status: pending
severity: major
depends: QUAL-14
---

# Junctions phase: sloped pads + network hygiene after honest-grade router

> RESCOPED 2026-07-05: items 2 & 3 (self-intersection/crossing hygiene + NO-LOOPS gate rework)
> moved to QUAL-14 (route clearance), which runs FIRST — user decision, junction pads should
> land on stabilized routes. This ticket keeps sloped pads (item 1) + junction grade artifacts
> (item 4).

The honest-grade router (fix committed on road-feel-phase-1-2: 1-D along-path EMA design
profile in search + refit; straights >200m 35%→5%, switchbacks 13→39, grade p95 36.7%→21.4%)
made routes wander/switchback much more. USER-CONFIRMED in-game: road feel significantly
improved; slight regression in self-intersections/junctions accepted and deferred to THIS phase.

## Scope

1. **Sloped junction pads** (user-approved design): pad follows terrain at up to ~6-8% grade —
   fit plane through approach endpoints, elevation biased to minimize |pad − raw| over the pad
   disc, replace flat `nodeY = mean(end Ys)` (road.js:2579). Ease approach grade+camber onto the
   pad plane; longer uphill blend. Fixes the huge uphill cut walls (p-dumps seed 6: (−1135,669),
   (−1845,385)).
2. **Self-intersection / crossing hygiene regression**: loopier honest routes cross sibling edges
   more → crossing culler prunes → `graph-topology.mjs` REACHABILITY fails (5 comps, largest 76%)
   + CROSSINGS-CULLED (9→5 survivors) + SURFACE-SMOOTH (8 steps, worst 0.76 m at a crossing zone).
3. **Gate reconciliation**: GRAPH-NO-LOOPS asserts total edge turn ≤200° — structurally
   anti-switchback now that 1000°+ alpine stacks are intentional. Rework the check to flag only
   true spirals/self-crossings, not switchback stacks (e.g. assert no XZ self-intersection and no
   net-360° loop, instead of cumulative |Δheading|).
4. **Grade artifacts at junctions**: road-character report max grade (61-130%) always lands at
   junction blend zones (e.g. (21,-51) near spawn) — _applyJunctionBlend pulls endpoints to nodeY
   over 30 m; sloped pads should mostly absorb this; verify with `node test/road-character.mjs`.

## Ideas parked (out of scope)

- Spawn has a gnarly carve over a ridge — ripe for a TUNNEL feature (no ticket yet).

## Acceptance

- graph-topology.mjs 9/9 (with the reworked NO-LOOPS check).
- No cut face > ~4 m at the two p-dump junctions; junction screenshot sweep clean (test/screenshot.mjs).
- road-character grade max no longer pinned at junction blends.
