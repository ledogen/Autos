---
id: BUG-130
type: bug
status: open
opened: 2026-11-07
severity: major
source: Spare, the BUG-129 census (2026-11-07)
owner: Spare (road / carve), after BUG-127
relates_to: BUG-129 (carve compositions), BUG-64 (the rival union), FEAT-40 (rival blend), MESH == PHYSICS
---

# BUG-130: at a switchback the ground beside the road steps by the arms' grade difference

## What happens

Between two arms of ONE run (a switchback climbing a slope), `_resolveRoadSurface` flips from one arm to the other at
the halfway line. Each arm's cross-section carries its own grade, and the arms differ by up to ~10 m. The rival union
(`_carveCrossSectionBlended`, BUG-64) that makes two runs' banks meet continuously does not get the OTHER ARM at the
flip point (`nr.rivals` empty there), so the bank steps by the grades' difference.

Example: random seed 861989012, run `g:-2,-1,1:-2,0,1`, the line across arc 532 (side −1). At 13.60 → 13.65 m out the
resolved arc jumps 521.6 → 560.4 (both arms ~12.3 m away), and the ground drops 141.22 → 131.15 m: a 10 m step
(`wip/bug-129/line.mjs` in CarGame-land-bug129).

## How common (the BUG-129 census, after its fix)

`wip/bug-129/census.mjs`: random seeds 24316861, 1717534236 and 861989012; 16.5 km of road; lines across every run
every 8 m, both sides, 5.3–28 m. **32 sites where a step sits across an arm flip, 21 over 0.5 m, worst 10.09 m.** Many
of the 24 remaining in-section steps over 0.5 m sit at the same switchbacks.

## Acceptance

- [ ] Root cause in the resolver / rival list confirmed.
- [ ] The census: arm-flip steps over 0.5 m to 0 on random seeds, nothing new elsewhere.
- [ ] A gate pins it (sampled); `fingerprint-world` explained; a before/after shot of a switchback bank.
