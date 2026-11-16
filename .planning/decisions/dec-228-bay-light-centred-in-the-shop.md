---
id: DEC-228
status: standing
decided: 2026-11-15
area: assets
governs: FEAT-226, BUG-174, src/main.js, bay light, service station
supersedes:
---
# DEC-228: The bay light must not read as one source above the truck; one light, moved to the middle of the shop

**Ruling.** "add a second ceiling light to the service center. its obvious by the cast on the ceiling that the only
source is Directly above the truck. If the real-time light source that we ticketed makes this irrelevant because it's a
directional spotlight or something, then I trust you to figure out what the right call is. Brightness wise, it's about
short enough to not spill out of the door or through the walls but when we add shadows that may very well be what weAgent's pick under that delegation: no second light. The one point light moves to the middle of the bay block (between
the two bays, 2.0 m up), so the ceiling's glow is broad and centred on the room, not a hot spot over the truck.

**Why.** The giveaway was the hot spot of a point light 1.1 m under the ceiling (25× brighter straight above it than 3 m
away; at 2 m down the ratio is about 6). A second light would add work to every lit pixel in the world, everywhere; a
moved light changes no shader. A downward spotlight at the strips was tried and rejected: the ceiling went black. Spill
outside the walls and doors is lower than before (FEAT-226 log).

**Replaces.** The point light over lift A at 2.9 m (FEAT-219, BUG-174). Consistent with DEC-227: no shadow.

227: no shadow.

**Source.** Owner, 2026-11-15, card `lighting-bundle-look`, note box. Owner's words.
