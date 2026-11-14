---
id: DEC-168
status: standing
decided: 2026-11-14
area: physics
governs: BUG-166, FEAT-97, FEAT-139, src/fragile.js, src/main.js, fragile cargo, felt g
supersedes:
---

# DEC-168: A crash breaks a fragile load: felt g is the load's own Δv over the step

**Ruling.** "yes, a crash breaks it" — a fragile load's shock is priced from its own change in velocity across the fixed step, not the strap's joint force.

**Why.** The engine reports the joint force from the last substep, which misses a chassis contact: a 53 g body strike read 0.47 g. The load's Δv / dt equals the joint force in driving and sees strikes, so the tiers' calibration stands.

**Replaces.** feltG from the weld's joint force (FEAT-97).

**Source.** Owner, 2026-11-14, on BUG-166's owner call.
