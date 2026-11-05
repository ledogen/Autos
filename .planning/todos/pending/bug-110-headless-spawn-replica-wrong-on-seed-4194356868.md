---
id: BUG-110
type: bug
status: open
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
