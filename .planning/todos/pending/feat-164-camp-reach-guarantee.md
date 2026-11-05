---
id: FEAT-164
type: feature
status: open
severity: major
opened: 2026-11-04
source: owner, 2026-11-04 (page inbox) — "4194356868 Huge portion of map does not have any camping areas. we need to improve the campable land generation algorithm so that it guarantees a minimum drive to a campable area from anywhere on the map."
relates: FEAT-45 (camp zones, shipped), feat-off-network-generator-cuts (one generator for spurs, cuts, camping areas), FEAT-103 (the expedition camp), feedback_cold_generation_only
---
lane: A

# FEAT-164: a campable area is never more than a set drive away

On seed 4194356868 a large part of the map has no camping area at all. Sleep is the clock (SM-1), so a
region with no camp in reach strands the run.

## What

Change camp-zone generation so that from any point on the drivable network, the shortest drive (along
roads) to the nearest campable area is at most a cap `CAMP_REACH_M`. Measure first: the worst-case drive on
that seed and on a sample of seeds, today. Then fill the gaps. Prefer relaxing the good-ground score
inside an under-served stretch over adding new roads. Every world is still generated cold (no saved
world data).

## Acceptance

- [ ] A headless gate measures the worst road-distance from any network node to the nearest camp zone
      over N seeds (seed 4194356868 included), and fails above `CAMP_REACH_M`.
- [ ] `CAMP_REACH_M` proposed to the owner with today's measured worst case per seed (the number is the
      owner's call; build with a default and mark it `[DEFAULT]`).
- [ ] Before/after map shots of seed 4194356868 showing the new camp areas.
- [ ] `test/fingerprint-world.mjs` diffs only in the camp zones.
