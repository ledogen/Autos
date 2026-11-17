---
id: DEC-395
status: standing
decided: 2026-11-17
area: physics
governs: FEAT-242, src/damage.js, impactMinMph, impacts, damage
supersedes:
---

# DEC-395: An impact starts at 5 mph

**Ruling.** "bump min speed trigger to 5mph"

**Why.** His tutorial run log (seed 3590618618) recorded an impact at 1.23 m/s (2.75 mph) that wore seven parts, the
radiator (89.55 % → 87.68 %) and a headlight (77.00 % → 73.26 %) among them.

**Replaces.** The 2 mph floor (`DAMAGE_PARAMS.impactMinMph`), which no record held.

**Source.** Chat, 2026-11-17, after `node tools/run-log-summary.mjs` on his log. Owner's words.
