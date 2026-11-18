---
id: BUG-221
type: bug
status: open
severity: major
opened: 2026-11-18
source: FEAT-293 driving-AI soak, 2026-11-18
---
lane: engine & world

# BUG-221: A truck climbing into a tunnel portal at about 37 % stops dead and cannot reverse out

## Next steps
Reproduce headless at the seed and spot; find what the truck hits (portal collider, deck step, lining). The FEAT-293 close-out agent is writing up the reproduction.

## Summary
Seed 1830183820 at (125, -42): 8.5 m/s to 0 in 1 s on a roughly 37 % climb at a tunnel portal; reversing does not free the truck. The one intervention in 40 km of AI driving.

## Description
Looks like a world or collider defect, not a driving one. A human driver would hit the same thing.

## Tracker
- [ ] Cause found
- [ ] Fix and a gate

## Decisions

## Open questions

## Links
FEAT-293

## Files

## Log
- 2026-11-18 minted by the orchestrator.
