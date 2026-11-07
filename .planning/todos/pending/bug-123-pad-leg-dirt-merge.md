---
id: BUG-123
type: bug
status: open
opened: 2026-11-07
severity: major
source: Spare, found fixing BUG-122 (2026-11-07); the third cause of the doubled edge lip
owner: Spare (road / carve), after the BUG-122 landing
relates_to: BUG-122 (the edge lip; causes 1 and 2 fixed there), BUG-82 (pads weld to ribbons), QUAL-10 (the pad carve)
---

# BUG-123: outside a junction pad's ring, the leg and pad dirt merge by MIN, so the edge lip grows where their tops differ

## What happens

Outside a pad's ring, the carve merges the leg's cross-section dirt with the pad's dirt by taking the **lower** of
the two (`_mergeCarve`: `min`, capped, faded by the pad's blend weight). The pad's top is the node surface
(`_nodeSurfaceTop`, the ruled inter-leg blend); the leg's top is its own cross-section. Near a junction they differ by
0.1–0.25 m. Then the lip grows by that difference, on whichever side:

- **Beside a drawn ribbon** (past the mouth), the pad's top is lower than the leg's: the pad's lower dirt wins and the
  ribbon's edge stands clearance + the difference above it.
- **Beside the pad's rim**, the leg's top is lower than the pad's: the leg's lower dirt wins and the pad's edge
  stands clearance + the difference above it.

## Evidence (after BUG-122's fixes 1 + 2)

`wip/bug-122/census.mjs` (in `CarGame-land-bug122`), random seeds 1353361482 and 369055107, 52 leg edges. The edge
lip is physics 5 cm inside the asphalt edge minus 5 cm outside, walked 2–30 m out from each ringed node.

| | lip > 0.25 m | worst |
|---|---|---|
| beside the pads (signed ring distance ≤ 0.2) | 8 / 52 edges (main: 46) | 0.40 m |
| past the ring, on the approach | 8 / 52 edges (main: 36) | 0.34 m, over ≤ 6 m |

Example: 369055107, run `g:432652,568543,-1:1,0,0` from node (867.0, 358.3), s 13–15 m. The lip is 0.22–0.28 m
beside the drawn ribbon, with the pad's weight at full depth (`wip/bug-122/walk.mjs`).

## The rule to build (sketch)

The dirt beside an asphalt edge stands clearanceMargin below THAT edge's top:

- **beside a drawn ribbon** (outside the ring, the leg's ribbon drawn at the point's arc, `_ribbonDrawnAt`): the
  leg's dirt governs, and the pad may not lower it;
- **beside the pad's rim** (outside the ring, no ribbon drawn there): the pad's dirt governs, even above a lower leg
  dirt;
- **inside the ring:** unchanged (min, with the PAD_DIRT_EXTRA armor).

`_junctionPadCarve` and `_mergeCarve` feed BOTH the terrain mesh (`terrain.js` `_buildCarveTable`) and physics
(`_sampleCarveWorld`), so the rule lands in both, and MESH == PHYSICS holds by construction.

**Risk to measure first:** terrain dirt poking through the pad near its rim (the 1 m grid triangles straddling the
ring edge), which is what the old MIN and PAD_DIRT_EXTRA guarded. Add a probe or gate for it: mesh dirt, triangle
interpolated, never above the pad top inside the ring.

## Acceptance

- [ ] The census: edge lip ≤ ~0.18 m on every leg edge of a random-seed sample, beside pads and on approaches.
- [ ] No dirt above the pad top inside any ring (sampled), before and after.
- [ ] Before/after shots of a pad rim from road height; `fingerprint-world` explained.
