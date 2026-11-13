---
id: BUG-165
type: bug
status: open
severity: minor
opened: 2026-11-12
source: Lane B, BUG-161 findings (follow-up named there, not fixed in that landing)
relates: [BUG-161]
---
lane: B

# The wheel's debris query is a sphere wider than the tire and reaches loose bed cargo

## What

physics.js Step 0.5 asks the adapter's `contactSphere` for debris contacts around each hub with a SPHERE of the
tire radius (0.368 m). The tire is 0.12 m half-width, so the sphere reaches ~0.35 m inboard of the hub: past the
rear wheelhouse wall (0.545 m from the truck's centreline) and into the bed. BUG-161 closed this for loads WELDED
to the chassis (`skipWeldedTo`). LOOSE bed cargo between the wheelhouses (firewood, the loose tire, any unstrapped
FREIGHT item) is still inside the sphere and is held off only by physics.js's world-frame `n.y < −0.1` filter.
That filter passes when the compressed wheel is on the high side of a 15–25° roll (one rear wheel up a bank or a
rock at the bump stop), so off-road the tire can press on its own load. BUG-161's sweep (`wip/bug-161/pose.mjs` on
land/bug-161) measured overlaps up to 12 cm at the bump stop for loads that span the arch.

## Fix direction

Clip the debris query to the tire's width, the way the rim core is already a disk for this reason: a disk (or a
short cylinder) about the axle instead of a sphere. It changes rock and debris contact for every wheel, so it
needs its own proof, not a ride-along on BUG-161.

## Acceptance

- [ ] A loose block on the bed level with a rear hub (the freight-strap §7 setup, unwelded) gets no tire push at
      any ride height or at ±30° roll.
- [ ] Rock / debris contact at the tread is unchanged in kind: the debris gates stay green and the physics
      fingerprint change (if any) is explained by the narrower query alone.
