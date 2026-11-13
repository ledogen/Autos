---
id: BUG-137
type: bug
status: open
severity: major
opened: 2026-11-07
source: Lane B drive soak run8 (6 random seeds × 6 km, with BUG-116)
relates: BUG-122 (junction-edge lip; its gate pins "no dirt above the pad" on 2 seeds), road×stream causeways, MESH == PHYSICS
---
lane: B

# BUG-137: a carve cliff on the pavement at a T over water

Seed 917338424. At the T node (−204.2, −536.3), three runs meet over a causeway: the site reads `streamChannelAt`
and `pondSkirtAt` both true. On run `g:-2,-2,2:-204227,-536297,-1` near arcS 611, 1.5–1.7 m from its centreline
(inside the pavement), the carved ground (`analyticHeight`) climbs to 0.35 m above `sampleRoadTopY`. That is
0.21 m above the road-tile collider. It ends in a 0.44–0.50 m cliff along x ≈ −203.7, z −539.4…−540.1.

- Along z = −539.7: ground 122.32 → 122.67, then 122.24 at x −203.6; road top 122.31; collider 122.46.
- `carveHint` answers the same run and arcS on both sides. So the step is inside `analyticHeight`'s composition
  (the junction blend, or the stream/pond carve), not a hint switch.
- The tires ride the dirt: at 7 m/s a 137 kN strut, two wheel flags, 18 flags in 2 s. Since MESH == PHYSICS, the
  dirt should also show through the pad.

Capture: `CarGame-machine/wip/drive-soak/run8-bug116/917338424-strut-3.json`
(`SOAK_TRACE=1 node test/drive-soak.mjs --replay=<capture>`, `node test/soak-site.mjs <capture>`,
`node wip/drive-soak/step-hint.mjs <capture> -204.6,-539.7 -202.6,-539.7 10`).

## Acceptance

- The site's ground never stands above the road top inside the pavement, and has no step over 0.25 m.
- The cause is named, and fixed where every causeway junction routes through it.
- The junction-edge-lip check covers a causeway T (this seed), on top of its 2 seeds.

## Root cause and fix (Lane B, 2026-11-07, `land/bug-137`)

**Not the causeway.** The stream carve's weight is 0 across the site. The cliff is in the junction pad's own surface
(`padTopY` = `_nodeSurfaceTop`), in its through-road term `_throughDeckTop`: on a promoted T the pad IS the trunk's
deck, read from whichever trunk half is nearer. The trunk bends at this node, and two things broke where it does.

1. **Outside the bend: a runaway station.** `_legDeckTop` finds the deck's station with a few Newton steps, but
   `runPointAt` clamps to the run's ends. For a point past an end (the outside of the bend, where both halves' feet
   sit on the node) the station kept stepping outward while the point stood still. The two halves' runaway decks
   disagreed by up to 0.8 m there, and the nearer-half pick flipped between them: the 0.49 m cliff.
   **Fix:** the station stays on the run. Past an end the deck carries on at the end section's own grade, along the
   end tangent, so a half read past the node agrees with the other half (the same road continuing).
2. **Inside the bend: a fold.** There the point lies beside both halves at different stations; on this trunk's
   15–20 % grade their decks differ by the grade change between them, 0.24 m at the bisector (3.3 m north of the
   node). A pick can't be continuous there. **Fix:** the halves are smoothstep-blended by distance (|lateral| +
   overshoot past the end), the nearer alone `PAD_THROUGH_BLEND` = 2 m ahead. On a straight trunk the decks agree, so
   the blend has nothing to move.

Every promoted T routes through `_throughDeckTop` (physics `padTopY`, the pad mesh `samplePadY`, and the solved pad's
trunk samples in `_buildPadSurface`), so MESH == PHYSICS holds and the fix covers every T, causeway or not.

- **The site** (along z = −539.7): ground 122.56 → 122.04, smooth; no step over 0.06 m per 0.25 m (was 0.43 m).
  Inside the bend (z = −533) the fold is gone: the surface follows the trunk's grade.
- **What else moves:** across every T on 917338424 and 369055107, wherever main read the trunk on its own run, the
  new deck is within 2.5 cm of main's, at 3 m from the node (the slight bend every trunk has there). The BUG-137 node
  moves 0.15 m (the fold itself).
- **The gate:** `junction-edge-lip` gains seed 917338424 and SMOOTH: on every T's through road, no step over 0.08 m
  between points 5 cm apart. Main fails it at the site (0.499 m per 5 cm at (−203.68, −539.75)); this branch passes
  (worst 0.034 m).

**Found, not fixed (a separate class):** off the trunk, a pad still tears where two near-parallel legs' mouth bands
meet: `_padRibbonMask` takes the heavier leg's own deck, and there two legs 28 m out from a big node disagree by
0.13–0.23 m. Sites: 1353361482 (26.3, 721.3), 0.19 m per 5 cm; 917338424 (99.4, −1015.8), 0.14 m. Probe:
`CarGame-machine/wip/bug-137/mask-legs.mjs <seed> x,z`. Also at this node, outside the ring in the corner between the
side road and the trunk (−212.4, −540.8): the pad stands 0.95 m above the side road's own surface, and
`_mergeCarve`'s 0.55 m duck cap holds the dirt beside the rim 0.4 m low — a 0.54 m kerb where 0.15 m is designed.

Probes: `CarGame-machine/wip/bug-137/` (`padtop.mjs`, `halves.mjs`, `branch.mjs`, `decomp.mjs`, `vs-old.mjs`).
