---
id: FEAT-287
type: feature
status: open
severity: minor
opened: 2026-11-18
source: owner, in chat, 2026-11-18 (DEC-420)
relates: DEC-420, FEAT-247, BUG-206, src/pad-rumble.js
---
lane: free lane

# FEAT-287: Bent-wheel controller vibration: 60 % floor, 10–25 mph band peaking at 17, pulsed at wheel rate

## Next steps
Build on top of BUG-206's branch (`land/bugs-1117-pad-cam-light`), which rewrote parts of `src/pad-rumble.js`.

## Summary
The bent-wheel vibration runs only for a wheel below 60 % condition, inside a speed band, and pulses once per wheel turn.

## Description
The owner's words are DEC-420's Ruling. In numbers: 10 mph = 4.47 m/s, 17 mph = 7.60 m/s, 25 mph = 11.18 m/s.
A wheel at 60 % condition or better gives zero. Between 60 % and 25 % the output is confined to the band: zero at 10 mph, peak at 17, zero at 25. Below 25 % it can also be felt above 25 mph.
The intensity pulses at the wheel's rotation frequency (speed / (2π × rolling radius)); it is not a steady level.

## Tracker
- [ ] Zero output for every wheel at ≥ 60 % condition, any speed
- [ ] 25–60 %: zero at ≤ 10 mph and ≥ 25 mph, peak at 17 mph
- [ ] < 25 %: still felt above 25 mph
- [ ] Output pulses at the wheel's turn rate
- [ ] A gate holds the four rules as numbers
- [ ] Owner has felt it

## Decisions
DEC-420.

## Open questions
- How strong the high-speed output is for a wheel below 25 %, and how it grows from 25 % down to 0 % (builder proposes, flagged on the card).

## Links
FEAT-247, BUG-206.

## Files
src/pad-rumble.js

## Log
- 2026-11-18 minted by the orchestrator from the owner's chat message.
