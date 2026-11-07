---
id: FEAT-164
type: feature
status: closed
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

## Built — 2026-11-05 (feature/run-shape, Lane A)

**Measured before** (`node test/camp-reach.mjs --report`): the worst ROAD drive from any point of the planners'
graph to a road point inside a zone disc.
- Seed 4194356868 at its in-game centre: 6 zones, 4.7 of 37.5 km of road in a zone, worst **5289 m**.
- Seeds 1–20: worst 2268–5876 m, median 3686 m; every one has a road more than 2.2 km from a zone.

**The fill** (`CampSystem.fillReach`, `src/camp.js`; run by main.js at go-live right after `campSystem.build`):
farthest-point greedy. `campReach()` measures every road's drive to the nearest zone (multi-source Dijkstra
over the nodes, then the worst point of each road). A `campMinRadiusM` (350 m) zone flagged `fill: true` goes on
the worst point, and that repeats until the worst point is ≤ `CAMP_PARAMS.campReachM` (**2000 m, owner 2026-11-05**).
It only adds: grid zones are untouched, and the camp-zones gate (pure f(seed, cell)) never calls it. It reads
the region's built network like the POI roster does, so it is cold (nothing saved). Idempotent, 1–23 ms.
There is no "good-ground score" to relax: a zone is a pure permission disc, and site quality is graded live
at the truck.

**Zones added per cap**: seeds 1–20 mean (range); the owner's seed in brackets.
1500 m: 6.2 (2–12) [5] · 2000 m: 3.8 (1–7) [5] · 2500 m: 2.5 (0–5) [3] · 3000 m: 1.4 (0–4) [2].

**Gate** `test/camp-reach.mjs` (heavy, registered): seeds 4194356868 (pinned centre), 1 and 6, measured
independently. After the fill every node reaches a zone, the worst point is ≤ campReachM, the fill only adds,
and a second fill adds nothing. Green.

**Before/after shots**: https://claude.ai/artifact/SvWko63QjRmdGWkyUSp3bD (the in-game map of 4194356868,
flipped between before and each cap, with the cost table).

**Found on the way, not FEAT-164's**: `test/lib/spawn-decision.mjs` (the headless spawn replica every
story gate uses) puts seed 4194356868's spawn at (−22, −161). The game (free roam and story alike) puts it at
(34.65, 158.45), 325 m away, so the headless region holds 3 grid zones where the game has 6. Seeds 1 and 6
match to within centimetres. Play radius 320–640 m does not explain it. ~~The gate pins this seed's centre
until that is fixed.~~ BUG-110 fixed it (the replica now routes round the ponds): the replica puts the spawn at
(34.5, 158.5), and camp-reach takes it from spawnDecision like the other seeds (366d8b6d).

**RULED (owner, 2026-11-05): `campReachM` = 2000 m** — *"i like the 2000m spacing between camping zones
best"*. Set in src/camp.js; camp-reach green on 4194356868, 1 and 6. `test/fingerprint-world.mjs` hashes no camp
zones and no worldgen changed, so it cannot diff; not run.

## Resolution — Lane A, 2026-11-07 (close-on-evidence sweep)

On main (cb5dcf84). `campReachM` = 2000 m (owner, 2026-11-05); `CampSystem.fillReach` adds zones at go-live until the worst drive is under it. Gate camp-reach (heavy) green; before/after shots on artifact SvWko63QjRmdGWkyUSp3bD. The fingerprint does not apply: it hashes no camp zones, and no worldgen changed. The acceptance above is met as written in Built.
