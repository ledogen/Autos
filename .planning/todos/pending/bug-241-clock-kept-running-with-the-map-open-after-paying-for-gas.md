---
id: BUG-241
type: bug
status: open
severity: major
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "After paying for gas, I opened the map and checked out a mission and realized theclock was still running."
relates: DEC-024, DEC-289, DEC-363, DEC-431, src/day.js, src/main.js, src/map2d.js
---
lane: unplaced (scribe: SM-1 / run shape; Opus: it is gameplay logic around the clock)

# BUG-241: After paying for gas, the map was opened on a mission and the clock was still running

## Next steps
A lane reproduces it (pay at the pump, release, open the map, read a mission) and logs `clockHeld` inputs while the map is open. The owner answers whether the map with an offer open should hold the clock.

## Summary
Owner's words:
> After paying for gas, I opened the map and checked out a mission and realized theclock was still running.

### What the rules are today
`src/day.js` `clockHeld(camp, service, tutorial, parked)`: the world clock stops only for a camp menu, the service screen, the tutorial drive, or the latched parking brake (DEC-024, DEC-289). The map is NOT in that list, so reading a mission on the map has always run the clock. The owner expected it to be held, which is a different rule from today's code. It may also be the parking brake: "Release the handbrake to pay" (the pump asks the brake off); after paying the brake is free, so the clock runs while the map is open.

## Description
(See Summary.)

## Tracker
- [ ] Reproduced: pump, release, map, clock
- [ ] Decide the rule (Open questions) and record it in a DEC
- [ ] The clock holds (or the owner confirms it should not) while the map is open
- [ ] A check in `test/` for `clockHeld` with the chosen input
- [ ] Owner has looked

## Open questions
- Is this a bug or a missing rule? DEC-024 / DEC-289 hold the world clock only under the parking brake; nothing holds it for the map. The owner wants "the clock still running" to be wrong. Owner's call: should the open map hold the world clock (and the job timer? DEC-289 says the job's time keeps running under the brake), or only when a mission offer is open on it?
- Related: DEC-431 and DEC-363 (the pump and parked screens). Not a conflict, but the pump finishing releases the screen lock, so the brake state after paying is the first thing to log.

## Links
DEC-024 (superseded), DEC-289.

## Files
`src/day.js` (clockHeld) · `src/main.js` (~11125) · `src/map2d.js`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
