---
id: BUG-214
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "Sometimes POI pads or the camping pad that's constructed make big ugly spiky walls on their perimeter."
relates: FEAT-103, FEAT-164, FEAT-52, DEC-068
---
lane: bug (alpha by default)

# BUG-214: POI and camp pads make big ugly spiky walls around their edge

## Next steps
Needs a capture from the owner (place capture key) or a lane that samples pads across random seeds.

## Summary
Sometimes the terrain pad built for a POI or the campsite throws up tall spiky walls round its perimeter. "Sometimes": no seed or place was given.

## Description
Owner's words, verbatim (inbox 20261118064848-ixas):

> Sometimes POI pads or the camping pad that's constructed make big ugly spiky walls on their perimeter.

## Tracker
- [ ] No spiky walls on any pad perimeter (POI pads or camp pad), across sampled random seeds
- [ ] A repro place is captured with the pad's position and seed first

## Decisions

## Open questions
- Which seed and place? He gave none.

## Links
FEAT-103, FEAT-164, FEAT-52, DEC-068

## Files
the pad / carve code in src/terrain*.js and src/poi.js

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118064848-ixas).
