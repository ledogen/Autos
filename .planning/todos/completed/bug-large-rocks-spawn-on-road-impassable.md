---
id: BUG-23
type: bug
status: completed
resolved: 2026-06-30
resolution: "Radius-aware road keep-out — scatter now inflates the road exclusion by the prop's bounding radius so no collidable rock/boulder overhangs the ribbon (src/props/prop-scatter.js + roadClear sampler in src/main.js), commit 786b549. New gate test/prop-road-clearance.mjs. Verified in-browser by user — no rocks blocking lanes."
opened: 2026-06-27
severity: high
source: user-observation
relates_to: [FEAT-06, FEAT-06b]
note: "User: large rocks occasionally spawn ON the road, making it impassable even when collisions are
correct. This is a SCATTER/PLACEMENT bug (FEAT-06), distinct from BUG-22 (collision accuracy). The
prop-scatter road-exclusion mask is missing or too narrow for large rocks/boulders, so a collidable
prop lands on the ribbon and walls off the lane."
---

# BUG-23: Large rocks spawn on the road, making it impassable

## Observed

Occasionally a **large rock / boulder spawns directly on the road**, blocking the lane. Because the
collision is (correctly) a hard contact, the truck physically cannot pass — the road is impassable at
that spot. This is independent of collision accuracy (BUG-22): here the placement itself is wrong.

## Likely cause (investigate before fixing)

Prop scatter (FEAT-06) places props deterministically over terrain. The bug is in the **road-exclusion
masking** of that scatter:

1. **No / insufficient road exclusion for large props.** The road carve footprint is either not
   sampled when scattering, or the keep-out radius doesn't account for the prop's own size — a large
   rock's *center* may land just off the ribbon while its body overhangs the lane.
2. **Exclusion width too narrow.** Mask may cover the centerline/ribbon but not the shoulder + the
   prop radius, so big rocks clip the edge of the driveable surface.
3. **Streaming / window variance.** Props stream at `PROP_RING` and the road streams separately; if a
   prop is placed before/independent of the road carve in that area, the exclusion test can miss it.

## Acceptance

- [ ] Reproduce: find a seed/location where a large rock lands on the ribbon (capture coords).
- [ ] Exclude collidable props from the road footprint, inflating the keep-out radius by the prop's
      bounding radius so no part of a large rock/boulder overhangs the driveable surface.
- [ ] Verify deterministically (headless scatter check) that no hard-collidable prop center-or-overhang
      intersects the road ribbon over a sweep of seeds.
- [ ] No regression to overall prop density / look away from roads.

## Notes

- FEAT-06 = palette + deterministic scatter + instancing; the road sampler is already passed into
  `PropSystem` (instantiated in `main.js` with real terrain/road samplers) — the exclusion logic to
  fix lives there.
- Sibling: BUG-22 (rock collision accuracy / huge rocks bumping the truck off-road). BUG-23 is about
  *where* rocks are placed; BUG-22 is about *how* the contact resolves.
