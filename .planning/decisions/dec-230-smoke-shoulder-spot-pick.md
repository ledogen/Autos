---
id: DEC-230
status: standing
decided: 2026-11-15
area: process
governs: BUG-173, FEAT-217, test/cdp-smoke.mjs, smoke, shoulder check
supersedes:
---
# DEC-230: The smoke's shoulder check picks a flat spot clear of props; the check itself stands

**Ruling.** "allow the spot-pick change, then land BUG-158 (recommended)" — in `test/cdp-smoke.mjs` the FEAT-217 shoulder step picks its spot clear of hard props within 6 m and graded under 1.5 % (the agent's proposal). As built: the flattest such point within 300 m of the truck, 11–14 m from the centreline (all four wheels past the road mesh, inside DEC-219's 15 m) and 90 m from every place; the road-following ±9 m search the proposal kept finds nothing under 6.4 % on seed 822480141. The check (no reset and no countdown on the shoulder, lateral > 5.5 m after 9 s) is unchanged.

**Why.** On seed 822480141 the old pick (the first ±9 m point) sat on a 13–35 % cross-slope 2.3 m from a tree trunk. The truck perched on the trunk or rolled toward the road, and which one depended on frame timing: with main's own road.js one of two runs ended 6.3 m out still rolling at 2.7 m/s (the fail line is 5.5 m), and BUG-173's road.js does not move the spot, the ground or the trunks. The fixture was flaky, not the shoulder rule (DEC-219).

**Replaces.** Nothing; DEC-219 stands.

**Source.** Owner, owed card bug158-smoke-spot, 2026-11-15 (no note). Owner's words; the spot-pick wording is the agent's proposal the owner allowed. "BUG-158" there is this ticket, renumbered BUG-173 the same day.
