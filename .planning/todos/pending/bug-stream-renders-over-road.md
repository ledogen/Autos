---
id: BUG-33
type: bug
status: open
opened: 2026-07-07
severity: major
source: user-observation
note: "User capture logs/rangersim-capture-1783408505947.json (seed testig, POS -679/750, image
2026-07-07): blue stream water draws ON TOP of the road surface, both at crossings and along a
long stretch where the stream and road share the same valley line."
---

# BUG-33: Stream water renders over the road — push streams below roads

## Symptom

Stream water surface overlays the road (visually paints the lane blue). Physics is fine (road
grade wins the drivable surface — the FEAT-18 v1 bridge rule), this is the RENDER ribbon.

## Root cause

The water ribbon (water-render.js) is placed at raw-terrain-based Y with `depthWrite:false,
renderOrder:1, transparent` — drawn after and on top of anything below the water plane. It knows
nothing about roads. Roads and streams both valley-seek, so overlaps can be LONG stretches, not
just point crossings.

## Fix plan

1. **Crossing clearance:** locally deepen the stream bed profile where a stream passes under a
   road (streamRoadCrossings + road surface query) so bed + waterDepth clears the road underside,
   with smooth approach ramps. Window-invariant: pure fn of routed network + stream records.
2. **Ribbon vs road:** where a ribbon vertex lies inside the road footprint with Y at/above the
   road surface − clearance, clamp it below the deck; long along-road overlaps get ribbon faces
   suppressed inside the footprint entirely.
3. **Physics check:** verify the deepened bed composes correctly in terrain `_composeCarvedY` /
   `analyticHeight` (road blend must still win the deck at crossings; wheels must not fall into
   the deepened notch).

## Acceptance

At the capture site (seed testig, −679/750): no blue over the lane; water passes visibly under
the road at crossings. `node test/replay.mjs` on the capture + carve gates + `npm test` green.
