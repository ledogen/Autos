---
id: DEC-207
status: standing
decided: 2026-11-14
area: perf
governs: PERF-48, terrain material, lever 6
supersedes:
---

# DEC-207: Terrain bake only far live shader near

**Ruling.** "i dont like the loss of detail nearby. can we build it so it uses the bake for things 70m+ from the truck and uses live for the things nearby? how much of our savings would we lose?" The all-baked version is not accepted; the build is bake from 70 m out, live shader near, and the lost saving is reported.

**Why.** Within ~20 m the baked version flattens dirt clods and pebbles.

**Replaces.** The ship-it-baked option on the lever 6 card.

**Source.** Card perf48-bake-look, 2026-11-14. Owner's words.
