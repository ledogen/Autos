---
id: DEC-491
status: standing
decided: 2026-11-24
area: physics
governs: FEAT-326, src/debris.js, src/physics.js, blasting run, boss, rock slide, rock count, collider
supersedes: 
---

# DEC-491: Boss rocks — aim for 150 a slide, a 12-point physics shape

**Ruling.** "Let's see if we can get away with 150 rocks. I'd like to keep the less powerful machines in mind." The blasting-run boss targets about 150 rocks per slide, not the 300 the research recommended. A boss rock's physics shape is a 12-point convex hull while the drawn rock is unchanged ("Yes: 12-point physics shape for boss rocks").

**Why.** Weaker machines get roughly half the measured budget. The 12-point hull is 2.2× cheaper in the shape-against-shape tests, which are 60–70 % of a blast's engine time.

**Replaces.** Nothing standing. DEC-400 and DEC-425 (5–15 rocks, written for the live slides) keep governing the live slides; the change that builds the boss settles DEC-425 as the owner cleared on 2026-11-23. For boss rocks only, the drawn mesh and the physics shape may differ by the hull simplification.

**Source.** Owner, owed cards `feat326-rock-count-pick` and `feat326-collider-pick`, 2026-11-24. The first quote is the owner's words; the second is the orchestrator's option text, picked by the owner.
