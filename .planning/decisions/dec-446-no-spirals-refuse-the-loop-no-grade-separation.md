---
id: DEC-446
status: standing
decided: 2026-11-19
area: roads
governs: BUG-232, BUG-234, src/corridor-router.js, src/road.js, spiral, helix, tunnel, over under pass, grade separation
supersedes: 
---

# DEC-446: No spiral tunnels: the router refuses a loop; the game keeps no grade separation

**Ruling.** "No spirals: refuse the loop"

**Why.** The game has no bridges; a lower pass lifted onto an upper one builds a 97 to 224 % ramp. Refusing the loop removes 4 of the 5 known cases (the fifth needs a retry search). The card said the same answer covers BUG-234 (two roads crossing with no junction), so no over/under passes there either.

**Replaces.** Nothing replaces it; it drops option 3 of BUG-232 (spiral tunnels).

**Source.** Owner, card bug232-spiral-tunnels, answered 2026-11-19. Owner's words, no note.
