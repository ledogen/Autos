---
id: DEC-012
status: standing
decided: 2026-10-19
area: world
governs: SM-INV-12, src/world-presets.js, src/terrain-height.js, worldgen, determinism
supersedes:
---

# DEC-012: Worldgen is a pure function of seed, world knobs and coordinates

**Ruling.** Worldgen is a pure function of (worldSeed, worldKnobs, coords) and no meta-progression input ever reaches it; run-layer state is (worldSeed, runState, coords) and resets with the run. A world code carries the knob VALUES, never a hash, so sharing the code shares the world.

**Why.** A seed must mean the same world for every player at every stage of progress — that is what makes seed sharing, daily seeds and a kilobyte save possible.

**Replaces.** The 2026-07-16 widening to (worldSeed, metaState, coords), reverted 2026-07-29.

**Source.** DESIGN.md § Invariants, SM-INV-12 [RATIFIED 2026-07-29; world-knobs amendment 2026-10-19]; design-amendments-2026-07-29.md §1. Owner's words.
