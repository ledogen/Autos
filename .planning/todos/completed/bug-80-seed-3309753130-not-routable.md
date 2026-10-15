---
id: BUG-80
type: bug
status: fixed
severity: minor
opened: 2026-10-03
closed: 2026-10-15
relates: src/world-validate.js (the player bar), feat-region-gated-connectivity
---

# BUG-80 — seed 3309753130 is not routable

## What

Story-mode entry refused seed **3309753130** with the world-validate disclaimer ("This seed is not
routable with the current router parameters and terrain generation parameters"). Recorded by the
owner from play, 2026-10-03.

## Acceptance

- Reproduce headless: run the `world-validate` routine on 3309753130 over the region story mode
  builds, and report which bar failed (`components > 1` split vs a condemned edge) and where.
- Decide: a router/terrain defect to fix, or a genuinely unplayable seed that stays refused
  (connectivity goes UP — add options, not cull roads).
- If fixed, add the seed to the regression set so it stays routable.

## Finding (2026-10-12, while working BUG-85)

Reproduced headless: spawn (93, −13); **components 2**; condemned 0. The failing bar is a **split**.
The orphan is a 3-run, 2.68 km spur whose nearest point is 1711 m from spawn. Its tip `-3,-1,2` at
(−1618, −30) is a **leaf in the raw Urquhart graph** (degree 1, no deletion). Its only attachment is
`-4,0,0` at 2415 m, and the spur leaves the wall from there. **The world graph is whole. The circular
wall clips it.**

This is not the router defect behind BUG-85. Either the region has to treat a spur whose only
attachment is outside the wall as part of the region, or the seed stays refused. That is a
story-layer design call for the owner.

## 2026-10-15 — fixed by BUG-85

Same fix as BUG-85 (see its HANDOFF): a wall-cut piece becomes a *stranded piece* with no POIs or
destinations instead of refusing the seed. Close together.

**Closed with BUG-85 (2026-10-15).** Under the planners' cut (wall less `REGION_MARGIN`) this seed
has no stranded piece at all: the clipped spur lies in the 100 m band no planner uses. It enters,
and it is in `test/region-pieces.mjs`.
