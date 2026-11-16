---
id: DEC-228
status: standing
decided: 2026-11-15
area: assets
governs: FEAT-226, BUG-174, src/main.js, bay light, service station
supersedes:
---
# DEC-228: The bay light must not read as one source above the truck; the agent picked the call

**Ruling.** "add a second ceiling light to the service center. its obvious by the cast on the ceiling that the only
source is Directly above the truck. If the real-time light source that we ticketed makes this irrelevant because it's a
directional spotlight or something, then I trust you to figure out what the right call is. Brightness wise, it's about
short enough to not spill out of the door or through the walls but when we add shadows that may very well be what we
want instead."

Agent's pick under that delegation: no second light. The one bay light becomes a downward spotlight at the strips'
height (FEAT-226's spotlight option), so the ceiling carries no cast at all and the light count stays the same.

**Why.** The giveaway was the ceiling hot spot of a point light 1.1 m under it (25× brighter straight above than 3 m
away). Two point lights would still both sit over the truck, and a second light adds work to every lit pixel in the
world. Spill outside the walls and the door stays at or below the old light's (FEAT-226 log).

**Replaces.** The point light at 2.9 m (FEAT-219, BUG-174). Consistent with DEC-227: no shadow.

**Source.** Owner, 2026-11-15, card `lighting-bundle-look`, note box. Owner's words.
