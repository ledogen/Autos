---
id: DEC-445
status: standing
decided: 2026-11-19
area: world
governs: BUG-222, FEAT-154, FEAT-292, src/poi.js, edge fade, return spot
supersedes: 
---

# DEC-445: The edge fade returns the truck to the nearest spot; no own-road preference

**Ruling.** "A: keep nearest spot (recommended by the agent)" (the card's option A: keep the rule as it is: the nearest spot to the truck wins, and the test is changed to check exactly that).

**Why.** Options B (prefer the truck's own road within about 60 m) and C (own-road spots out to 2400 m) were new rules, unmeasured; the agent recommended A.

**Replaces.** Nothing replaces it. It keeps the FEAT-154 / 10-31 rule as built.

**Source.** Owner, card bug222-edge-return-rule, answered 2026-11-19. Owner's words, no note.
