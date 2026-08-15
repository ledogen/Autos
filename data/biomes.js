/**
 * data/biomes.js — the ground-cover biome thresholds, as exported config (see data/ranger.js and
 * data/flora.js for the convention).
 *
 * A biome here is a coarse statement about what GROWS on a patch of ground, nothing more. It does
 * not carry weather, palette, or species — those are already handled elsewhere (flora.js picks
 * aspen vs pine, sky.js owns the look). It exists because the world needed openings: before it,
 * tree scatter was uniform everywhere it was not underwater, and the 2D map had no honest way to
 * print anything but green (measured 2026-08-15 — the old slopeRejectMax of 0.75 never once fired,
 * because this terrain tops out at slope 0.593).
 *
 * Three biomes, and both consumers must agree on them: prop-scatter.js decides where trees stand,
 * map-cover.js decides where the map prints green. Same function, same thresholds, one source.
 *
 * Units: slope is `1 - normal.y` (0 flat → 1 vertical), matching flora.js's scatter thresholds.
 * Distances in metres.
 */

export const BIOME_PARAMS = {
  // ── ROCK: too steep to hold a forest ───────────────────────────────────────────────────────
  // Kept ABOVE flora's slopeSteepMin (0.34) on purpose. Below that line the scatter favours pine
  // over aspen, which is a statement that steep ground is still FORESTED — dropping the reject
  // under it would delete the pine-dominant band the species mix exists to describe.
  // 0.38 puts bare rock on ~1.2% of ground (measured, seed 6) — occasional, which is the point:
  // it should read as a place the mountain broke through, not as a texture. flora.js's per-tree
  // slopeRejectMax mirrors this value; the two are the same rule at different granularities (this
  // one clears a whole cluster, that one rejects a single tree on a local steep).
  rockSlopeMin: 0.38,

  // ── MEADOW: flat, low-lying, collecting water ──────────────────────────────────────────────
  // Montane meadows form where a valley floor is flat enough to hold water and low enough to
  // receive it. Both tests are needed: a flat shelf part-way up a ridge sheds water and grows
  // trees, and a steep gully bottom carries water away rather than holding it.
  // Both meadow tests read ONE 4-point ring at this radius — the landform's gradient across it,
  // and its height against the ring's mean. Deliberately wide: read at a short baseline, flatness
  // spikes over every metre-scale wrinkle on a basin floor and the meadow comes out shot through
  // with green ribbons that no one standing in the field would call a treeline.
  // Wide on purpose, and this radius is the single biggest lever on whether meadows read as solid
  // regions or as ribbons. Measured over seed 6, holding the other two fixed (open% / boundary
  // neighbours per open cell — lower is more solid):
  //
  //     r=55  →  7.5% / 1.277      r=180 → 16.3% / 0.557
  //     r=90  → 10.1% / 0.907      r=250 → 21.1% / 0.398
  //     r=130 → 12.5% / 0.715      r=320 → 25.2% / 0.306
  //
  // A short ring asks "is the ground under my feet flat", which every wrinkle on a basin floor
  // answers differently, so the meadow shatters. A wide one asks "is this a broad flat basin",
  // which is what a meadow actually is — and it is the same five samples either way.
  meadowRingR:      320,    // m
  meadowSlopeMax:   0.020,  // above this the landform drains and stays forest. Small-looking
                            // because a gradient across 640 m is far gentler than a local one.
  meadowReliefMin:  2.0,    // m — must sit at least this far below the surrounding ground

  // Not every flat hollow is a meadow. This is a low-frequency world-space gate that lets some
  // qualifying ground stay wooded, so meadows read as particular places rather than as a rule
  // mechanically applied to every basin in the world.
  meadowNoiseFreq:  0.0022, // 1/m — ~450 m wavelength; the scale of a meadow, not of a clearing
  meadowNoiseMin:   0.42,   // qualifying ground becomes meadow only where the mask clears this

  // ── WET GROUND: where the map stamps marsh symbols ─────────────────────────────────────────
  // Same shape of question as MEADOW — flat ground sitting below what surrounds it — asked at a
  // much SMALLER radius, and that difference is the point. A meadow is a landform, so it is read
  // across 320 m; boggy ground is a hollow you could walk across, so it is read across 48 m. Wet
  // and open are independent: a spring seep under closed canopy is wet and not a meadow, and a
  // well-drained meadow on a bench is open and not wet.
  //
  // These thresholds live here, next to the meadow ones, because the two ARE the same drainage
  // idea and drift apart the moment they are kept in different files. An earlier pass had the wet
  // test inlined in map2d.js on its own lattice with its own constants; it covered 0.47% of ground
  // (measured, seed 6), so marsh symbols were effectively invisible, and nothing about the file it
  // lived in made that comparable to the meadow test it duplicated.
  wetRingR:         48,     // m
  wetSlopeMax:      0.035,  // gradient across the ring
  wetReliefMin:     1.0,    // m below the ring mean — together ≈16% of ground (was 0.47%)
}

export const BIOME = { FOREST: 0, MEADOW: 1, ROCK: 2 }
