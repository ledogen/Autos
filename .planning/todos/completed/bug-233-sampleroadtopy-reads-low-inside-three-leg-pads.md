---
id: BUG-233
type: bug
status: closed
severity: major
opened: 2026-11-18
source: BUG-230 census, 2026-11-18
relates: BUG-230, src/road.js
---
lane: Engine & world

# BUG-233: sampleRoadTopY reads up to 0.86 m under the surface inside junction pads with 3 or more legs

## Next steps
After BUG-230's join fix lands (same file): make sampleRoadTopY agree with _nodeSurfaceTop inside a pad, and list what each caller did with the low value.

## Summary
Inside pads with 3 or more legs the drawn mesh and the physics collider both ride `_nodeSurfaceTop` and agree to 0.000 m. `sampleRoadTopY` uses the free resolve there and reads up to 0.863 m lower. Callers that read it: the truck seat (`_groundSampleY`: a truck seated or reset on a pad), the camp check and the paper drop. What the player sees from each is not yet measured.

## Tracker
- [x] Reproduced and measured on 13+ random seeds.
- [x] Cause named in the code.
- [x] Fixed with a gate, fingerprint and a 400-seed no-throw sweep (below).
- [x] Landed on main (orchestrator).

## Log
- 2026-11-18 minted by the orchestrator from the BUG-230 census.
- 2026-11-18 fixed on land/bug-230-ribbon-above-deck (ae7a2a64; gate `test/pad-top.mjs`): pad-top worst 91.7 cm -> 0.00 cm. 90 gates green. Fingerprint vs main: poi and props identical in all 6 windows, no POI moved,
  network identical. Sweeps 2 x 200 seeds (400): 0 throws, bad 0. cdp-smoke 40 steps and pad-e2e green.
