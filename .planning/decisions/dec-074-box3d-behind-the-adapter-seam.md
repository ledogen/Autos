---
id: DEC-074
status: standing
decided: 2026-08-16
area: repo
governs: FEAT-48, src/physics-engine.js, vendor/box3d, Box3D
supersedes:
---

# DEC-074: The rigid-body core is Box3D behind one adapter

**Ruling.** The rigid-body core is Box3D, and `src/physics-engine.js` is the only module that touches engine types; everything else consumes opaque handles. Swapping backends (fallback: Rapier) must touch only the adapter.

**Why.** A thin seam keeps the engine replaceable and the vehicle model ours.

**Replaces.** The original hand-rolled-only rule (reversed 2026-07-29 / FEAT-48).

**Source.** CLAUDE.md § Constraints, Physics (owner decision 2026-07-29; date from git 2026-08-16). Owner's words.
