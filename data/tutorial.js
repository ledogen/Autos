// ── FEAT-184: the tutorial seed ─────────────────────────────────────────────────────────────
// THE SEED IS THE WHOLE WORLD (as data/scenarios.js). The owner's pick 2026-11-16 (DEC-351, from the
// DEC-344 search, wip/tut-seed-search/): a 9.96 km day, the joint in a green meadow. It replaced 822480141 (FEAT-184's pick).
// It is the owner's named exception to "there is no default seed" (DEC-111, DEC-149): the first playthrough
// ever is on it, and so is the main menu's "tutorial". Every other world stays random unless the player
// types one. A world-generation change can move its places (BUG-121 moved every region once): re-pick then.
export const TUTORIAL = { seed: '3590618618' }

// FEAT-184 (DEC-238): where mom's toss lands Larry's old pack — model-local m on her trailer-home-a (it faces −Z: the door
// spans x 0.6–1.5, the stoop runs out to z −2.8), beside the stoop's foot, dropped from y m so it falls to the ground.
// Measured off the GLB; test/tutorial-seed.mjs holds it in reach of the road. dropZoneWorld's box shape (src/poi.js).
export const PACK_TOSS = { x: 2.2, z: -3.5, y: 1.2 }
