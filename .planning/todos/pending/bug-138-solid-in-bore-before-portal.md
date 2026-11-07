---
id: BUG-138
type: bug
status: open
severity: major
opened: 2026-11-07
source: Lane B drive soak run8 (6 random seeds × 6 km, with BUG-116)
relates: BUG-107 (tunnel mouth at a bend), BUG-67 (shared bores), BUG-126 (NOT this class: an autopilot steer into a 7.9 m wall)
---
lane: B

# BUG-138: a solid in the lane inside a bore, just before its portal

Seed 717319401. In the tunnel of run `g:-1,-1,2:0,-1,0` (bore [359, 518]), at arcS 514–517, 1–4 m before its
portal. The run ends at a T node (14.8, −75.0), 10 m past the portal. From the same node, the leg
`g:0,-1,0:-1,0,2` enters its own bore at its arcS 10.

- A road-tile solid (`{kind: road, key "0,-2"}`) stands 0.89 m from the centreline at arcS 514.7 and 2.21 m at
  516.7. It runs from 0.3 m to at least 1.5 m above the road top, with two vertical faces at right angles.
- Everywhere else in that bore the lining is 7.8–8.0 m out on both sides.
- The struck face is 10.5 m from the other leg's centreline at its arcS 8.7, 1.3 m outside that leg's portal.
  Reading, not yet proven: the second tunnel's portal structure intrudes into the first one's bore.
- The truck was on the line at 5.8 m/s and hit the face with its front-right corner: a 10.4 m/s jolt.

Capture: `CarGame-machine/wip/drive-soak/run8-bug116/717319401-jolt-1.json`
(`node wip/drive-soak/bore-scan.mjs <capture>`).

## Acceptance

- Nothing solid inside a bore's driving envelope; the cause is proven, not read.
- A census of portals that meet another tunnel's bore within a few metres, on random seeds: the count before and after.
- A gate pins this seed.

## Root cause and fix (Lane B, 2026-11-07, `land/bug-138`)

**Proven: the other leg's portal collar.** Built with `RoadMeshSystem.buildPortalRing` and cast with the soak's own
ray, the portal ring of `g:0,-1,0:-1,0,2` at its s0 (arcS 10.0) is hit at exactly the engine's struck point,
(1.33, 131.85, −77.07); no other ring or tube near the site is (`wip/bug-138/prove.mjs`). Both legs of the T at
(14.8, −75.0) dive into the hill ~10 m out, and there their bores run ~11 m apart (two radius-8 bores need 16 m). The
masonry collar is 10.6 m in radius and stands 1.35 m proud of the hill, so each leg's collar stood inside the other's
bore: a stone block in leg 1's lane 0.9–2.2 m off the centreline, and leg 1's upper arch 6 m up inside leg 2.

The tubes already merge into an underground Y here (BUG-67's `siblingTubeTest`: a tube triangle inside a sibling's
tube is not built), and `isMouth` correctly calls both ends portals. Only the ring ignored the sibling.

**Fix:** `buildPortalRing` drops a quad when ANY of its corners is inside a sibling's tube (the tube's own rule is
all corners, but the ring's quads are 1.7 m across, so that rule would have kept most of the block). Same
geometry for the mesh and the road-tile collider, so MESH == PHYSICS. The two mouths now open onto one forecourt
where the block stood; the floor runs on smoothly (−0.15 m at 2 m out to −1.0 m at 9 m).

- **Census** (`wip/bug-138/census.mjs`, 10 random seeds, pond no-go, every true portal ring tested at triangle
  corners, edge midpoints and centroids against every other bore's driving envelope, R − 0.25 above its floor):
  main 2 of 234 rings (both at this T, both a sibling's bore); this branch 0 of 234. No portal met an unrelated bore.
- **The capture** replays clean (no flags; main: the 10.4 m/s jolt).
- **The gate:** new `portal-clear` pins seed 717319401 (22 rings): main fails 2, this branch passes.
