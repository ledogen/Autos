---
id: BUG-129
type: bug
status: closed
opened: 2026-11-07
severity: major
source: Lane B's drive soak (test/drive-soak.mjs on main), run4, 2026-11-07
owner: Spare (road carve / embankment fill), after BUG-127
relates_to: BUG-74 (roadwork seam: fill buries rock), the carve's fill feather, MESH == PHYSICS
---

# BUG-129: an embankment's fill stops in a ~1 m cliff instead of feathering down

## What happens

Random seed 24316861, road `g:-2,-3,2:-1,-2,0` near arcS 628, along a line ~19.0 m from its centreline around
(−482.0, −984.7 … −986.6). The road sits on fill 6 m above raw ground (raw 101.9 m, analytic 107.8 m, road top 110.7 m).
The fill ends at ~19 m instead of feathering down: `analyticHeight` drops up to 1.04 m within 0.1 m. There are 111
such steps > 0.15 m within 4 m of the site.

Mesh and physics share the analytic carve, so it should also show as a visible cliff.

## What it does

The soak's off-road leg drove onto it at 4.9 m/s. The front-right wheel's ground rose 0.68 m in one step while the hub
moved ~8 cm. The tire load went negative (−6.7 kN), and the wheel ended 0.25 m below ground. run2 flagged the same
place twice.

## Replay

- Capture: `CarGame-machine/wip/drive-soak/run4/24316861-wheel-1.json`; `SOAK_TRACE=2 node test/drive-soak.mjs
  --replay=<capture>` from main.
- Scan: `node CarGame-machine/wip/drive-soak/site-steps.mjs <capture> [r]` lists steps > 0.15 m per 0.1 m around a site.

## Acceptance

- [ ] Root cause named: why the fill ends in a step here (a clamp, a band edge, a min/max merge, a corridor cut-off).
- [ ] A census on random seeds: how many fill edges carry a step > 0.15 m per 0.1 m, before and after.
- [ ] The fill feathers down everywhere, with no step above that threshold.
- [ ] The capture replays without the wheel-under-ground event; `fingerprint-world` changes explained.

## Root cause and fix (Spare, 2026-11-07, `land/bug-129`)

**Not the fill's toe.** The run's own cross-section is smooth across the site (weight 0.59 → 0.39 over 14–24 m,
`wip/bug-129/xprof.mjs SOLO=1`). Two compositions on top of it popped:

1. **The junction ruled blend (`_carveDirtY`) kept a lone sibling leg at 100 % to the reach edge.** At 19 m out, the
   site lies inside the bank of a rival run (`g:-223875,-1121716,-1:-1,-2,0`), whose own cross-section is blended
   toward its T node at (−459.5, −972.9). There, the rival's own leg is out of reach (the point is past its end). The
   only leg in range was the site's road (grade 111.79), easing out at `RULE_LEG_REACH` with a taper. But
   `gSum / wSum` normalises the taper away: that leg kept 100 % of the blend to the very edge, then dropped out, and
   the design jumped to the rival's own 113.15. That is a 1.15 m step inside a 0.95-weight bank.
   **Fix:** the blend is also scaled by the strongest in-range leg's taper (`tMax`). Where the run's own leg is in
   range its taper is 1, so nothing changes there.
2. **The deg-2 connector's dominance did not fade at its toe.** `domGrade = co.gradeY·dom + cs.gradeY·(1 − dom)`
   with `blendW = max(cs, co)` applied the connector's design (dom 1) under the run's larger weight (co.blendW 0.01,
   cs.blendW 0.65) and snapped back where the connector ended: a 0.5 m step at 18.25 m.
   **Fix:** `_withConnector`. The dominance is scaled by the connector's share of the coverage
   (`co.blendW / max(cs, co)`). The physics (`_sampleCarveWorld`) and the mesh (`terrain.js` `_buildCarveTable`)
   share it, so MESH == PHYSICS. In the connector's core nothing changes.

**At the site** (`wip/bug-129/site-steps.mjs`, Lane B's scan): steps > 0.15 m within 4 m go from 111 to 0.

**The capture can't replay the fix.** Its start state was recorded on the old ground, and the fix raises the ground
beside the fill there by up to 1.5 m, so a wheel starts buried. The trace printer also crashes off-road
(`queryNearest` null at drive-soak.mjs:308, Lane B's harness).

**Census** (`wip/bug-129/census.mjs`): random seeds 24316861, 1717534236 and 861989012; 16.5 km of road; lines
across every run every 8 m, both sides, 5.3–28 m at 0.1 m; a step is > 0.15 m between neighbours. Main 2f878836 (no
src change since this branch's base) → fix:

| class | main: sites (> 0.5 m) | fix: sites (> 0.5 m) |
|---|---|---|
| bank, within one cross-section | 438 (58), worst 8.69 m | 370 (24), worst 8.69 m |
| bank, a switchback's arms flip | 31 (21), worst 10.09 m | 32 (21), worst 10.09 m |
| bank, two runs flip | 7 (3), worst 1.22 m | 5 (2), worst 0.66 m |
| near a bore | 81 (39) | 68 (23) |
| an asphalt deck edge (the designed kerb) | 56 (0), worst 0.21 m | 56 (0) |

**Left for follow-ups (not this ticket's site):**
- **Switchback arm flips.** The resolver flips between two arms of ONE run at the halfway line, and the arms' grades
  differ by up to ~10 m. The rival union does not get the other arm at the flip point (`rivals` 0), so the bank
  steps by the grade difference. Example: 861989012 (−662.8, −185.9), arcs 521.6 / 560.4, 138.7 vs 129.3.
- **The remaining in-section steps > 0.5 m (24),** many at the same switchbacks. These need their own look.
- **Steps near bores,** mostly at portals' hill faces, which may be by design.

## Landed (orchestrator, 2026-11-07)

Merge of ea87ac03 on main: affected 62/62, cdp-smoke 25/25. The capture can't replay (its start state sits on the old ground); Lane B re-records stale captures.
