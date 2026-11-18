---
id: DEC-400
status: standing
decided: 2026-11-17
area: story
governs: FEAT-26, FEAT-27, MILESTONES.md, src/debris.js, rock slide, rockslide, hazards, alpha
supersedes:
---

# DEC-400: Rock slides are in the alpha, with no spirit ties

**Ruling.** "lets build rock slides into alpha. no spirit ties. the rules are they can only generate in an area where the player can see them coming i.e. not a blind corner. they must come from a steep enough side slope (most likely only earthworks apply) such that they will roll all the way down the hill and into the road and the spawn must be timed in such a way that the engine is attempting to directly nail the player. this will require some testing to see how quickly the small rigid body rocks fall down slopes so we can get the timing correct. i think 5-15 rocks spawned all at once in a 3m region on the slope surface itself seems about right but feel free to test. optionally if it adds consistency they can spawn with some slope aligned velocity. if possible it would be nice to use a shader to \"fade them in\" over .5s so the spawn isnt as obvious (since the spawn will probably be visible). it should only happen once in ~20km driving, but fully random apart from the road section candidacy"

**Why.** Not stated. Asked whether rock slides were planned for the alpha; they were "later" (no row in the Alpha table).

**Replaces.** FEAT-26's release (later, with its event rate keyed to a spirit's favour) and its older batch and spawn-out-of-view text. The Alpha table in MILESTONES.md gains the row. FEAT-27 (static slides) is untouched.

**Source.** Chat with the orchestrator, 2026-11-17. Owner's words.
