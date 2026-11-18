---
id: BUG-205
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "the waypoint distance measure at top of screen is wrong"
relates: BUG-204, FEAT-257, FEAT-266, src/main.js
---
lane: bug (alpha by default)

# BUG-205: The waypoint distance readout at the top of the screen is wrong

## Next steps
Reproduce: note the readout against the map ruler at a known waypoint, then find which distance it computes.

## Summary
The distance to the waypoint shown at the top of the screen does not match the real distance. No detail given: what it disagrees with (straight line, road distance, next stop vs. final stop) is not known.

## Description
Owner's words, verbatim (inbox 20261118003748-kztw):

> the waypoint distance measure at top of screen is wrong

## Tracker
- [ ] The top-of-screen waypoint distance matches the real distance to the waypoint it names
- [ ] Correct on a multi-stop mission, on the paper route and in free roam

## Decisions

## Open questions
- Is it wrong by a constant, by a unit, or after a stop changes (multi-stop missions)? The owner gave no numbers.

## Links
BUG-204, FEAT-257, FEAT-266, src/main.js

## Files
the HUD waypoint distance in src/main.js

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118003748-kztw).
