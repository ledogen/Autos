---
id: BUG-110
type: bug
status: closed
severity: major
opened: 2026-11-05
source: Lane A, found while building FEAT-164 (feature/run-shape 4b9ffbe1; details in that ticket's Built section)
relates: FEAT-164 (test/camp-reach.mjs pins this seed's centre until this is fixed), test/lib/spawn-decision.mjs
---
lane: Spare

# BUG-110: the headless spawn replica puts seed 4194356868's spawn 325 m from the game's

A test-harness bug, not a game bug. `test/lib/spawn-decision.mjs` is the headless copy of the game's
spawn decision. It is what centres the story region in every headless story gate: world-determinism,
region-pieces, expedition-camp, demolition-site and camp-edge-census among them.

On the owner's seed **4194356868** it puts the spawn at **(−22.10, −160.63)**. The game puts it at
**(34.65, 158.45)**, with free roam and story agreeing, checked in a browser on :3731. That is 325 m off.
So the headless region holds 3 grid zones where the game has 6, and every story gate measures a different
region from the one the owner plays on this seed.

- Seeds 1 and 6 match to within centimetres, so it is seed-specific, not a constant offset.
- Play radius 320–640 m does not change the headless answer.

## Acceptance

- [ ] Find where the replica's decision departs from main.js's on this seed, and fix the replica (or
      share the game's code, if the decision can be made importable without the browser).
- [ ] A check pins spawn agreement on 4194356868, 1 and 6 against the game's numbers.
- [ ] camp-reach drops its pinned centre for this seed.

## Fixed (Spare, 2026-11-05, a2c5173c) — the replica never routed round the ponds

**Where it departs.** `resolveSpawn`'s probe and the replica's are the same steps (tiers, recenter, query). The
difference is the network they query: main.js injects the pond no-go (`setWaterNoGo`, FEAT-17) into the RoadSystem
before its first stream, and the replica built a bare one. On 4194356868 a pond beside the probe re-routes the
nearby roads, so the nearest road the replica found was a different one, 325 m away. Seeds 1 and 6 have no pond
near the probe, so they never showed it.

| seed | replica before | replica now | game (Lane A, browser) |
|---|---|---|---|
| 4194356868 | (−22.10, −160.63) | (34.54, 158.50) | (34.65, 158.45) |
| 1 | (420.69, 89.03) | unchanged | matches to cm |
| 6 | (−71.10, 149.10) | unchanged | matches to cm |

The 0.12 m left on 4194356868 is the same road and the same region (not chased). `spawnDecision` now wires the
pond no-go the way main.js does. **Check:** world-determinism section 1b pins the three seeds to the game's spawn
(< 0.25 m). The four gates on the replica are green (world-determinism, region-pieces, expedition-camp,
demolition-site), and none of their own seeds moved (`wip/bug-110/cmp.mjs`: 9 seeds, 0.00 m each).

**For Lane A:** camp-reach can drop its pinned centre for 4194356868 once this is on main.

**Found, not fixed here (a separate call):** those same gates, and camp-edge-census, build their REGION network
without the pond no-go too — so even centred right, their roads near a pond are not the game's. Wiring it in moves
what they measure (rosters, pieces, sites), so it wants its own pass with each gate's pins re-read.

## Resolution (2026-11-05) — CLOSED

On main since the Spare set 38765f33 (a2c5173c): the headless spawn replica routes round the ponds as main.js does,
so seed 4194356868 lands at (34.54, 158.50) against the game's (34.65, 158.45); world-determinism 1b pins it. The
replica now reaches the no-go through BUG-111's shared helper (test/lib/pond-no-go.mjs). Suite on main 125/125.
