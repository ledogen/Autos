---
id: QUAL-13
type: quality
status: done
severity: major
depends: QUAL-14
resolved: 2026-07-06
---

# Junctions phase: sloped pads + network hygiene after honest-grade router

> RESOLVED 2026-07-06 — sloped pad planes + adaptive blend reach (commit on main).
>
> **What shipped:** `_junctionPadPlane` (road.js) — per ≥3-way node, a pad PLANE whose grade
> vector is least-squares fit from the incident strands' arrival slopes (clamped to new
> `roadJunctionPadMaxGrade` 0.07) and whose elevation is biased toward the L1 terrain fit over
> the pad disc (capped by `roadJunctionPadTerrainBias` 3 m). Approaches ease onto the plane via
> `_applyJunctionBlend`, whose GRADE reach now stretches adaptively so the correction never
> exceeds `roadJunctionBlendMaxGrade` 0.12 (the "longer uphill blend"). Pad mesh fallback +
> `_detectNodeJunctions.nodeY` ride the plane. Sliders in Roads→Junctions (fireRoadParam path).
> Bundled route cache regenerated (sig includes all road* params; routes byte-identical).
>
> **Measured (probe-junctions.mjs pattern, seed 6, 16 nodes around (-1490,527) r=1500, on the
> DRIVEN runProfile surface):** worst approach grade 105.3% → 42.7%, p50 55.4% → 27.0% — the
> item-4 grade artifact is gone. Pad-disc (15 m) cut walls max 19.5 → 16.4 m, p50 ~flat: the
> ≤4 m cut-face target is NOT reachable by pad shape alone — remaining walls are structural
> (junction nodes placed on 30–50% hillsides vs a drivable ≤7–12% pad; raising pad grade to
> 12% only bought 2 m of wall while regressing approach grades). The real fix is terrain-aware
> node PLACEMENT — that is QUAL-15 (terrain-blind graph) territory.
>
> **Acceptance mapping:** the two p-dump junction coords no longer exist (QUAL-14 re-routes moved
> the network) — verified on the current worst nodes instead, incl. before/after screenshots at
> (-884,-487) (no visual regression; downhill pad shelf softened). graph-topology 9/10 — the
> REACHABILITY red is the pre-existing QUAL-14 goalBlend-lever item, ticket-tracked there.
> npm test 30/31 = baseline. NOTE: test/road-character.mjs samples the ROUTED points, not the
> blended runProfile, so its numbers cannot move with junction-blend fixes — its current 65.8%
> max at (-2695,1864) is frontier/routing grade, not a junction artifact (possible follow-up:
> teach the instrument to read the driven surface).
>
> Items 2 & 3 were rescoped to QUAL-14 (2026-07-05) and landed there.

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
