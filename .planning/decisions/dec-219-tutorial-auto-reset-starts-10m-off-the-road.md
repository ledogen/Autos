---
id: DEC-219
status: superseded
decided: 2026-11-14
area: story
governs: FEAT-217, FEAT-184, src/main.js, tutorial
supersedes:
---
# DEC-219: The tutorial's automatic reset engages 10 m beyond the road's sides, with a visible countdown
**Ruling.** "Let's just disable automatic reset from 10 meters off the sides of the road. You can still manually reset if you're on the shoulder, but the countdown timer and automatic reset shouldn't engage until you're 10 meters off." The reset shows a countdown styled like the start-the-truck reminder. Also "disable the automatic reset within 50 or 100 meters of the destinations" (built as 75 m, `TUT_PARAMS.safeNearPoiM`).
**Why.** Pulling onto the shoulder to line up with a pump, or to fix the flat, was reset by the trap.
**Replaces.** Narrows DEC-151's "you drive off the road > reset": the reset stays, it just starts 10 m past the paved side (`TUT_PARAMS.offRoadM`) and never within 75 m of a place.
**Source.** Owner inbox of3s and bfs1, 2026-11-14. The 75 m is an agent default for the owner's "50 or 100".
