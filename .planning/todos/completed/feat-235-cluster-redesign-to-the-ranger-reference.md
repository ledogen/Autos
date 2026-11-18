---
id: FEAT-235
type: feature
status: closed
severity: major
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "At one point you pulled an epic forward ranger instrument cluster reference. It looks like it was from a user manual of some kind. Here's the link   to the artifact. https://claude.ai/artifact/XJrmfoRMYu4Rd77onpbAmF   Let's reopen the instrument cluster design. I would really love if we could recreate the pods that frame the gauges I think our tachometer and speedo   are arranged pretty similar I would like to see the coolant and gas gauge separated slightly left and right and maybe a little bit closer together   vertically like the reference and then I would love to see this rectangular background reshaped into the cluster outline so big broad curve on top and   flat on the bottom I even think we should add the little inset on the bottom then similarly the coolant and gas gauge should also get a roughly   triangular but very automotive curves background as well and then the lighter cluster background behind all of that so two gauges on the left with a   dark background in a triangular shape two gauges on the right with pretty much the existing shape of the dark background that we have maybe you can   make the bottom flat like the reference and then behind everything is a vaguely cluster shaped light background the key can still stay in the bottom   right and we're not adding an oil pressure or battery gauge go ahead and keep the warning lights and shift indicator where they are."
relates: FEAT-34, src/cluster.js
---
lane: B (after FEAT-233)

# FEAT-235: Gauge cluster reshaped to the Ranger reference: pods, cluster outline, light backing

## Next steps
None: round 3 (DEC-391) landed (integration `land/int-1117d`).

## Summary
The owner reopens the cluster design against the Ranger owner-manual reference (artifact https://claude.ai/artifact/XJrmfoRMYu4Rd77onpbAmF). Wanted: the pods that frame the gauges; tach and speedo roughly as now; coolant and fuel separated slightly left and right and closer together vertically; the dark rectangle reshaped to the cluster outline (broad curve on top, flat bottom, the small inset at the bottom); a roughly triangular, automotive-curved dark backing for the two small gauges; a lighter cluster-shaped backing behind everything; the key stays bottom right; no oil pressure or battery gauge; warning lights and shift indicator stay where they are.

## Tracker
- [x] Reference read and its named features listed
- [x] Reference read and its named features listed (see Decisions)
- [x] Round 1 pictures against the reference
- [x] Round 2 built (`land/feat-235-r2`, never landed); owner: revert to V1, keep its key place and frame (DEC-391)
- [x] Round 3 built (`land/feat-235-r3`)
- [x] Owner approves a round (round 3, "Good: land it", 2026-11-17)

## Decisions
- DEC-331 records the owner's note. Reference features built in round 1: the broad arch on top; the flat bottom with the raised inset under the dials; the lighter face inside a dark housing band (the drawing's double outline); a dark rounded-triangle pod for temp + fuel whose right side follows the tach's pod at a constant GAP; temp up-and-right, fuel down-and-left (24 apart across, 76 apart down, was 0 and 92); the dial pod kept (cusp between tach and speedo) with a flat bottom (the tach's indent reaches 9 lower, level with the speedo's); key, lamp row, gear readout, low-fuel and overheat dots where they were.
- Not copied: the right-hand pod (oil, battery: the owner's "not adding"); the drawing's mirror-symmetric right end (ours is a shoulder round the key, which DEC-267/285 pin); the drawing's separate text telltales.
- Judgment calls (agent, owner asleep): the left pod sits 15 below the dial axis (the drawing's temp is near the axis, fuel low), so both pods' bottoms are level; the face colour `#575049` (a lighter plastic, not the drawing's white; one constant); the canvas grows 494 → 516 layout units wide (568 → 593 CSS px) to fit the staggered pod at the old GAP.

- DEC-391 (round 3, owner 2026-11-17, supersedes DEC-350): "revert back to V1. The only changes from V2 that I preferred are the ignition location and the shape change of the frame. So bring those into V1. I prefer having the two ton pod/gauges from v1 / Then make the bottom notch in the background a little bit narrower so that the left side pod fits neatly into the crook Maybe you can bring the bottom edge of the left side pod down so that it matches the same margin on the left side of the pod". Built: key in the corner under the speedo and the right edge straight down (from r2); notch's left top now ROOM right of the left pod's corner (INSET_L, 240 to 187 wide); FUEL_DROP 7 so the pod's bottom margin is 13 like its left.

## Log
- 2026-11-16: filed from the owner's inbox note.
2026-11-16 (bookkeeping sweep): round 1 built 059259a8 (branch land/feat-235 @ 70f9ee99, DEC-331); boxes 1-2 ticked per the night log (wip/orch/night-1116.md). Not landed.
- 2026-11-16 (lane A, round 1): `land/feat-235`. src/cluster.js: the housing is the hull of the pods' grown circles with one arch tangent to temp and speedo (`OUTLINE`, `_outlinePath`), the light face inside, `_leftPodPath` for the triangle pod, the flat-bottomed dial pod. Least light face 7 around every pod (`wip/feat-235/check-geom.mjs`). Per-frame draw (update(), batches of 50, 3 × 400): median 0.018–0.020 ms before and after. gpu-reset --mode=crash PASS (cluster blank 0.221 → 0.221); SMOKE_STEPS=boot PASS. Pictures `wip/feat-235/` (sheet.jpg). Unverified: the owner's look.
- 2026-11-17 (lane u, round 3): `land/feat-235-r3`. Only the key place and frame hunks of r2 ported; notch and pod per DEC-391. Sheet `wip/feat-235/cluster-r3-sheet.jpg`. Gates: see commit. Unverified: the owner's look.
- 2026-11-17 CLOSED: owner "Good: land it" on round 3. `land/feat-235-r3` @ f72c5d15 merged into `land/int-1117d`; gpu-reset webgl PASS (cluster blank 0.186 → 0.186); crash mode fails only on the impostor-atlas count (0 → 8), which also reads 8 → 8 on main: timing noise, not the cluster.
