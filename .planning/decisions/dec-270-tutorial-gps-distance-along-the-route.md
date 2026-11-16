---
id: DEC-270
status: standing
decided: 2026-11-15
area: story
governs: FEAT-217, FEAT-184, src/main.js, src/mission.js, tutorial, HUD, GPS
supersedes:
---
# DEC-270: The tutorial's distance readout is the distance along the route, as in a job

**Ruling.** "For some reason it seems like the GPS distance to go at the top middle of the screen is tracking distance to mom's house as the crow flies, not along your route." Every tutorial leg's top readout (to the station, to mom's, the morning's stops) reads the metres left along the line the GPS draws (its re-plan when the truck strays), as a job's "to go" does; crow-flies only when there is no line.

**Why.** The line's readout was coded crow-flies (`Math.hypot` to the door), so on a winding road it grew while the player drove the route correctly.

**Replaces.** The crow-flies readout of FEAT-170/FEAT-184's evening line. The custom waypoint's line (DEC-225, "1.12 km to the waypoint") is unchanged.

**Source.** Owner, owed card feat217-try, 2026-11-15. Owner's words; the "every leg" scope is the orchestrator's brief.
