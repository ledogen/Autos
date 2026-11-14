---
id: DEC-167
status: standing
decided: 2026-11-14
area: physics
governs: BUG-168, SM-INV-1, src/damage.js, fatalMphBare, fatalMphFull, fatal crash
supersedes: DEC-034
---

# DEC-167: The fatal speed is 40 mph of Δv bare, 65 mph full armor

**Ruling.** "40 bare / 65 full" — mph of the truck's own Δv, still scaled linearly by the hit panel's armor condition read before the hit.

**Why.** 60 / 100 sat above any Δv the roads let you hold, so no crash ever killed (BUG-168). Belted-occupant frontal fatality risk climbs steeply past Δv ≈ 40 mph.

**Replaces.** DEC-034's 60 / 100 mph numbers; its armor-scaling rule carries over unchanged.

**Source.** Owner, 2026-11-14, on Lane B's BUG-168 proposal.
