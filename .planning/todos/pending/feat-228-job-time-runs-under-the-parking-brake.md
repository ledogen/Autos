---
id: FEAT-228
type: feature
status: open
severity: major
opened: 2026-11-15
source: owner, 2026-11-15 — "I don't like the way pulling the handbrake during a mission pauses the mission timer. I think mission and rank calculation and deadline should all continue to scroll But world clock should be stopped when the truck is Parked with the Handbrake."
relates: FEAT-194, FEAT-113, QUAL-36, DEC-289, DEC-024, DEC-023, src/main.js, src/mission.js, src/paper-route.js, src/offer-board.js
---
lane: unplaced

# FEAT-228: The job's time runs under the parking brake; the world clock does not

## Next steps
Orchestrator: land `land/clock-1116`. Owner: the open questions below (screens it now covers, DEC-023's wording).

## Summary
The parking brake froze the world clock (DEC-024), and a job's elapsed time, rank bar and deadline all read that clock,
so a latched brake paused the job. Now the world clock, energy, hunger, sky and offer expiries still stand still
parked, but a job or paper round in hand keeps spending its time at the driving rate (DEC-289).

## Description
### What a job's timer was
`elapsed = (clockH − t0H) × secPerGameH` (mission.js, paper-route.js), and the deadline is an absolute clock hour
`dueH` stamped by the board's `take()`. Everything time-based on a job hangs off those two: the rank letter and bar
(`gradeRun(elapsed, par)`), the tip (the par ratio at settle), "due in", expiry, and the board locking a taken slot
at `dueH`. No job deadline is a fixed world hour (none found); shop hours, restocks and the opening's 07:00 are not job deadlines.

### What changed
Each fixed step the clock is held AND the brake is latched, main.js calls `spendParked(dH)` on the mission and the
paper route: the start line (`t0H`, while running) and `dueH` move dH earlier, dH being the hours the clock would
have moved. The board hears the summed dH once per stop through a logged mutator `spend(offerId, dH)` (on release,
and before a save), so its slot lock follows the moved deadline and a save replays it. `t0H` / `dueH` were already
in the job and round snapshots, so a mid-job save keeps the shifted values.

### Cases the sentence did not name (built as below; the owner may overrule)
- Menus that latch or need the brake (shop / service screen, pump, inventory, damage screen, camp card and a pitched
  camp, offer cards, Larry's panel, the map at rest): the job's time runs there too.
- Game paused (pause menu, tab hidden): nothing steps, so the job stays stopped as before.
- A clock hold with the brake NOT latched (the service screen after a Space tap, the opening's evening while driving):
  the job holds as before; only the brake was named.
- Sleep, service work and tows (`advanceMinutes`): unchanged; they move the world clock and the job with it.

## Tracker
- [x] Job elapsed, rank and deadline run under the latch at the driving rate; world clock, energy, hunger, offers frozen
- [x] Board slot lock follows the moved deadline; save log replays it
- [x] Gate: park-brake.mjs § 6 rewritten (it pinned the old pause)
- [ ] Owner: the open questions

## Decisions
- 2026-11-15, owner: the source sentence (DEC-289, supersedes DEC-024).

## Open questions
- DEC-023 says a deadline is "measured on world time"; under DEC-289 it is world time plus parked time. Recommend a
  superseding record restating DEC-023 that way (camping allowed, expiry pays nothing, unchanged).
- Should parked time spend the job inside the shop / pump / camp too (as built), or only on a bare handbrake stop?

## Files
`src/main.js` · `src/mission.js` · `src/paper-route.js` · `src/offer-board.js` · `src/save.js` · `src/day.js` · `test/park-brake.mjs`

## Log
- 2026-11-15: built on land/clock-1116 (d6195d14). park-brake gate green. Not driven in the browser.
