---
id: BUG-123
type: bug
status: closed
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

## Fixed on `land/bug-123` (Spare, 2026-11-07)

**The rule.** `_mergeCarve`: inside the ring nothing changes (the lower dirt, the armor). Outside it, the NEARER asphalt
edge governs.

- **The distances:** `dRib` is the distance to the nearest drawn ribbon edge (`_ribbonEdgeDist`). Inside a padded
  leg's trim it measures to where the ribbon begins, so it is continuous across the mouth. `b.sd` is the distance
  outside the ring.
- **The blend:** the pad's share smoothsteps over ±0.5 m of `dRib − b.sd`. `duckCap` bounds its pull either way (it
  may now raise dirt as well as lower it).
- **Both consumers:** `terrain.js` `_buildCarveTable` and `_sampleCarveWorld` pass `dRib`, so MESH == PHYSICS by
  construction.

**Census** (`wip/bug-123/census.mjs`, edge lip = physics 5 cm inside the asphalt edge minus 5 cm outside, every
ringed junction's legs, 2–30 m out):

| sample | lip > 0.25 m beside pads | lip > 0.25 m on approaches |
|---|---|---|
| the BUG-122 seeds (52 edges): BUG-122 alone → this fix | 7 → 0 | 8 → 0 |
| fresh random seeds 1717534236, 861989012, 1107599406 (116 edges): main a77c30c5 → this fix | 31 → 0 | 15 → 0 |

- On the fresh seeds, the median worst lip is 0.15 m beside pads and 0.16 m on approaches, and no approach edge
  stays above 0.2 m for more than 2 m.
- The lowest lip anywhere is −0.103 m (dirt just above an asphalt edge). That spot is identical on main, so it is
  pre-existing.

**Poke-through** (`wip/bug-123/poke.mjs`, mesh dirt rebuilt with `dRib` as `terrain.js` does, 18,390 points up to
1.5 m inside the rings, worst triangle split): 0 points with dirt above the pad, on main and with the fix. The
tightest margin is 9.3 cm below the pad on main and 5.1 cm with the fix.

**Gates:** all 61 affected gates green.

**Fingerprint vs main a77c30c5:** surface and carve differ in the 5 windows with junctions. The stream meshes differ
in 3 and props in 1, because they drape on the carved ground (the pond/stream data half of the hash is identical
everywhere). Seed 3 is identical. Network, profiles, junctions, POIs and tiles are untouched.

**Owner page** (no ruling): https://claude.ai/artifact/SJkBs2vrhvjVGEiM4mdc73

**Lane B's sites on main (after BUG-122):**
- The capture `try4/6-strut-1.json` replays clean: strut 0, jolt 0. The edge there is 0.162 m.
- 1527888912 at (1047, −316): 0.153 m on one side, pad-to-pad on the other. The 0.30 m drop did not survive BUG-122.

## Resolution (closed 2026-11-07)

Landed on main (merge 202a0631; 62/62 affected gates, smoke 25/25). Pinned by the `junction-edge-lip` gate (added
with BUG-127): 52 leg edges on two random seeds, worst lip 0.199 m, no dirt above any pad.
