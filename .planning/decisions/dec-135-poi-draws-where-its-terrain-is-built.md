---
id: DEC-135
status: standing
decided: 2026-11-13
area: world
governs: BUG-164, src/main.js, src/terrain.js, POI draw distance, pop-in
supersedes:
---
# DEC-135: A POI draws exactly where the terrain under it is built

**Ruling.** "lets push the poi pop in a bit further so it matches the terrain. it seems like terrain always builds out further than pois. and loading one poi at a time by definition has to be cheap enough to have loaded anytime."

**Why.** A building past the drawn terrain hangs in the fog with no ground; one that appears later than its ground pops in late.

**Replaces.** The fixed 192 m circle of BUG-164's first fix (0d9cb9f4).

**Source.** Owner, in chat with the orchestrator, 2026-11-13. Built in cc4652dd (`TerrainSystem.hasChunkAt`). Owner's words.
