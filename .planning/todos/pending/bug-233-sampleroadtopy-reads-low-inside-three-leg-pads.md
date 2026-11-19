---
id: BUG-233
type: bug
status: open
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
- [ ] Reproduced and measured on 13+ random seeds.
- [ ] Cause named in the code.
- [ ] Fixed with a gate, fingerprint and a 400-seed no-throw sweep.

## Log
- 2026-11-18 minted by the orchestrator from the BUG-230 census.
