---
id: DEC-076
status: standing
decided: 2026-08-16
area: repo
governs: src/physics-engine.js, src/tire.js, src/suspension.js, src/physics.js, src/terrain-physics.js, src/debris.js
supersedes:
---

# DEC-076: The physics import seams

**Ruling.** tire.js and suspension.js are pure maths; physics.js is the only module combining them with engine bodies; terrain-physics.js works through an engine it is handed; world owners import only `createPhysicsEngine` and `GROUP_*`; everything else uses opaque handles.

**Why.** An import-direction contract is grep-enforceable and resists drift across sessions.

**Replaces.** Nothing.

**Source.** CLAUDE.md § Import seams (date from git). Agent wording.
