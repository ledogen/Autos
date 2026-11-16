---
id: DEC-234
status: standing
decided: 2026-11-15
area: perf
governs: PERF-48, lever 6, src/terrain-bake.js, terrain material
supersedes:
---

# DEC-234: Terrain bake hybrid ships on by default

**Ruling.** "ship it (hybrid on by default)". The DEC-207 hybrid ships at the settings the owner looked at: ground 70 m and farther from the truck baked, a 55–70 m cross-fade, live shader nearer, 256 px per chunk (0.25 m/texel). It is the default path; `?terrainBake=0` stays as the A/B off switch.

**Why.** It keeps about 60 % of the all-baked GPU saving (median −12.8 % active cycles) without the near-field detail loss DEC-207 rejected.

**Replaces.** The `?terrainBake=<px>` opt-in prototype.

**Source.** Card perf48-hybrid-look, 2026-11-15, no note. Owner's words.
