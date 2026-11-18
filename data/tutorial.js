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

// FEAT-288 P4 (DEC-422: "Move the flat to be a little bit earlier in the sequence before you go into the tunnel"; DEC-426
// Q5: about 250 m into the drive home, "depending on the seed"): the flat goes off once the truck is closer to mom's, by
// crow, than the point alongM metres along the drive home's own line (the plan _homeGuide draws, the camping area's door to
// hers). A pure distance, no height: BUG-216's deck moves near the tunnel cannot shift it. Measured on 1872706826
// (test/tutorial-seed.mjs, 2026-11-18): the line is 0.78 km, its tunnel starts 457 m along it; the flat goes off 250 m along,
// ~200 m short of the portal (it went off at 433 m, 24 m short, on the old half-the-crow-distance rule).
export const FLAT = { alongM: 250 }
/** The crow radius round `home` inside which the flat goes off: `home` to the point `alongM` along the line `poly`
 *  ({x, z}[]); null with no line, or a line shorter than that. */
export function flatRadius (poly, home, alongM = FLAT.alongM) {
    let s = 0
    for (let i = 1; i < (poly?.length ?? 0); i++) {
        const a = poly[i - 1], b = poly[i], d = Math.hypot(b.x - a.x, b.z - a.z)
        if (s + d >= alongM) {
            const t = d ? (alongM - s) / d : 0
            return Math.hypot(a.x + (b.x - a.x) * t - home.x, a.z + (b.z - a.z) * t - home.z)
        }
        s += d
    }
    return null
}
