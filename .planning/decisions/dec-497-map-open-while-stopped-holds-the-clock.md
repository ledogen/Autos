---
id: DEC-497
status: standing
decided: 2026-11-24
area: story
governs: BUG-241, src/day.js, clockHeld, world clock, map, parking brake
supersedes: 
---

# DEC-497: The map open while the truck is stopped holds the world clock

**Ruling.** The owner picked, on card `bug241-clock-map-pick`: "Map open while the truck is stopped (under 5 km/h) holds the world clock. Opened rolling, the clock runs. This matches when the map already holds the handbrake, so lamp and clock agree. No free reading while driving."

**Why.** After paying at a pump the brake is released, so nothing was latched and the clock ran while the owner read a mission on the map (measured: +10.05 game minutes in 10 s). The map at rest already holds the handbrake and lights its lamp, and DEC-024 called the lamp the visible sign that the clock is held.

**Replaces.** Nothing. It adds one case to DEC-024 and DEC-289, which stand; the job's own timer keeps to DEC-289.

**Source.** Owner, 2026-11-24, card `bug241-clock-map-pick`, option 1. An agent's wording, picked by the owner.
