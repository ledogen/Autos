---
id: BUG-165
type: bug
status: closed
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

- [x] A loose block on the bed level with a rear hub (the freight-strap §7 setup, unwelded) gets no tire push at
      any ride height or at ±30° roll.
- [x] Rock / debris contact at the tread is unchanged in kind: the debris gates stay green and the physics
      fingerprint change (if any) is explained by the narrower query alone.

## Implementation (Lane B, 2026-11-13)

- `src/physics-engine.js` `contactSphere` takes `slab: { axis, halfWidth }`: the query becomes the sphere CUT to
  |(x − hub)·axle| ≤ halfWidth. Per candidate shape, its extent along the axle (`_specSpan`: sphere offset ± radius,
  hull vertices, cylinder by its round section) is tested against the slab; a shape wholly beside the tire is no
  contact. That is an exact separating-axis test, not a filter on the contact normal. A shape that crosses the slab
  keeps the sphere's manifold byte for byte.
- `src/physics.js` Step 0.5 passes the corner's spin axle (`_axle[corner]`, Step 1's) with halfWidth
  `wheelWidth/2` (0.1175 m) + this step's hub travel ALONG the axle × dt (the look-ahead's share in that direction).
  `skipWeldedTo` (BUG-161) and the n.y < −0.1 filter stay.
- Approximations left, stated: a body that crosses the tread's edge plane keeps the sphere's contact, whose deepest
  point can lie beside the tire (up to ≈ r − √(r² − (w/2)²) = 2 cm short of the real cylinder at the tread edge, and
  the cylinder's tread-edge corner is not modelled). Fixing that needs a cylinder narrow-phase (the engine's only
  cylinder is a faceted hull, whose normals would jump as the tire rolls), so it is out of scope here.
- Proof: `test/freight-strap.mjs` §7. The BUG-161 inboard block (2 cm inside the sphere, level with the RR hub) is
  swept over roll −30/−15/0/15/30° × strut 0 / 0.12 / 0.25 m (bump stop): 0 pushes over 15 poses. With the slab removed it is 56 pushes, so the check
  is live. The control: a loose block AHEAD of the tread is still pressed (6 pushes), and welded it is not (0).
- `wip/bug-161/pose.mjs` with the slab (`pose-slab.mjs`): every freight load passes the filter in 0 poses (was up to
  612). plywoodSheets still overlaps, directly ABOVE the tread at strut > travel, normal −0.88 down: overhead, held
  by the n.y filter, as it should be.
- `test/fingerprint-physics.mjs` vs main: ALL IDENTICAL (bumpy ground, no debris bodies, so the cut never acts).


## Resolution (2026-11-13)
On main b512c2a2 (smoke 26/26, affected gates 30/30, physics fingerprint identical). The debris sphere is cut to the tire width by a separating-axis test along the axle; gate test/freight-strap.mjs §7.
