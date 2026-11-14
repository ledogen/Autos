---
id: DEC-136
status: standing
decided: 2026-11-14
area: physics
governs: FEAT-202, src/damage.js, oil, air filter, engine wear, durOil, durFilter
supersedes:
---
# DEC-136: Oil and air filter penalties add; oil counts double; both dead kills half an engine in 15 minutes

**Ruling.** "swap air filter and oil lifetimes. 50% engine with 0% oil and 0% air filter should last 15m hard driving. Oil should contribute twice the wear of filter at 0% condition. They shouldn't stack, they should be additive."

**Why.** Multiplied, both neglected was x400 and a 50% engine lasted under a minute; the owner asked what it cost and set the numbers.

**Replaces.** FEAT-202's agent defaults (oil life 60 min, x20 at empty, multiplying with the filter's x20) and the filter's 30 min life (owner, 2026-08-23).

**Source.** Owner, in chat with the orchestrator, 2026-11-14. Owner's words. As built: oil 30 min and filter 60 min of hard driving; engine wear x (1 + filter extra + oil extra), 191/27 ≈ 7.07 at a blocked filter and 382/27 ≈ 14.15 at empty oil, x 200/9 ≈ 22.2 with both.
