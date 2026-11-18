// ── FEAT-184: the tutorial seed ─────────────────────────────────────────────────────────────
// THE SEED IS THE WHOLE WORLD (as data/scenarios.js). The owner's pick 2026-11-17 (DEC-402, from the round-3
// search, wip/tut-seed-search-r3/): a 10.33 km day, the least hard driving over the whole tutorial (no climb over 20 %).
// It replaced 3590618618 (DEC-351, too steep), which replaced 822480141 (FEAT-184's pick).
// It is the owner's named exception to "there is no default seed" (DEC-111, DEC-149): the first playthrough
// ever is on it, and so is the main menu's "tutorial". Every other world stays random unless the player
// types one. A world-generation change can move its places (BUG-121 moved every region once): re-pick then.
export const TUTORIAL = { seed: '1872706826' }

// FEAT-184 (DEC-238): where mom's toss lands Larry's old pack — model-local m on her trailer-home-a (it faces −Z: the door
// spans x 0.6–1.5, the stoop runs out to z −2.8), beside the stoop's foot, dropped from y m so it falls to the ground.
// Measured off the GLB; test/tutorial-seed.mjs holds it in reach of the road. dropZoneWorld's box shape (src/poi.js).
export const PACK_TOSS = { x: 2.2, z: -3.5, y: 1.2 }

// FEAT-147 / FEAT-288 P6 (DEC-422: "I like the slow rotation in the opening sequence, but you should also be able to rotate
// with the right stick freely, and if you stop then it will start slowly rotating again"): the firing's orbit of the burger
// joint's ROAD face. radius m from the aim point; lift m, the aim point's height over the pad; swing rad, the start's angle
// short of square-on; rate rad/s (0.05 ≈ 2.9°/s: square-on at ~7 s, a full turn in ~2 min). The right stick or a drag with
// the RIGHT mouse button (the left one turns the card) turns it by hand; resumeS s after the last touch the slow turn picks
// up again from where the player left it, its rate eased in linearly from 0 over easeS s, so it never jerks.
export const FIRING_CAM = { radius: 16, lift: 2, swing: 0.35, rate: 0.05, resumeS: 3, easeS: 1.5 }
