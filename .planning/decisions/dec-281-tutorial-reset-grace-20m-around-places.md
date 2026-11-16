---
id: DEC-281
status: standing
decided: 2026-11-16
area: story
governs: FEAT-217, FEAT-184, DEC-151, src/main.js, TUT_PARAMS, tutorial, reset
supersedes: DEC-219
---
# DEC-281: The tutorial's automatic reset engages 10 m beyond the road's sides, and never within 20 m of a place

**Ruling.** "shrink the offroad reset grace area around POIs to 20m. i think this is what threw me off to think it
didnt work. otherwise keep it." Everything else of DEC-219 stands: the countdown and automatic reset start 10 m past
the road's paved side (`TUT_PARAMS.offRoadM`), manual reset works on the shoulder, the countdown is styled like the
start-the-truck reminder, and it runs 4 s (`TUT_PARAMS.offRoadS`). The grace radius around every place is 20 m
(`TUT_PARAMS.safeNearPoiM`).

**Why.** At 75 m the reset stayed silent near places, which read as the reset not working.

**Replaces.** DEC-219's 75 m (an agent default for the owner's "50 or 100"). The card's option "1b" (a 1 s reset above
3 m/s) was not chosen.

**Source.** Owed card tutorial-gates, note item 1 (owner, 2026-11-16). Owner's words.
