---
id: BUG-229
type: bug
status: open
severity: minor
opened: 2026-11-18
source: owner, 2026-11-18 (card bug217-shadow-seam-look) — "Now when the near map draws grass at the crest of a hill, the course map terrain doesn't quite line up with it so there's a little seam, a little disconnect. Same place in the tutorial world around the same time you can see this."
relates: BUG-217, PERF-41, src/main.js
---
lane: Engine & world

# BUG-229: Grass shadows from the near map and terrain shadow from the coarse map do not line up at a hill crest

## Next steps
After BUG-217 round 2 is on main: capture it at the owner's spot (tutorial world, same place and time as BUG-217's
capture), measure the offset between the two maps' edges, find the cause (bias, texel size or the handover).

## Summary
BUG-217 round 2 moved the terrain out of the near shadow map (hills cast in the coarse map only). The owner accepted
it ("Good: land it") and reported this follow-on: at the crest of a hill the near map still draws the grass's shadow
while the coarse map draws the terrain's, and the two do not quite meet: "a little seam, a little disconnect".

## Tracker
- [ ] Reproduced at the owner's spot with a capture.
- [ ] Cause named, with the measured offset.
- [ ] Fixed or the options shown to the owner.

## Log
- 2026-11-18 minted by the orchestrator from the owner's card note.
