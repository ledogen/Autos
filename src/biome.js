/**
 * src/biome.js — what grows on a patch of ground: forest, meadow, or bare rock.
 *
 * ONE definition, two consumers that must never disagree:
 *   - prop-scatter.js  decides where trees actually stand in the world
 *   - map-cover.js     decides where the 2D map prints green
 * If those two ever read different rules the map starts lying about the forest, which is the whole
 * failure this module exists to make impossible. Neither may inline its own copy of the test.
 *
 * ── Why meadows are derived and not painted ───────────────────────────────────────────────────
 * A meadow is not noise dropped on the map. It is flat ground, sitting low relative to what
 * surrounds it, at a scale where water collects — which is how montane meadows actually form, and
 * why the owner's USGS reference shows them on valley floors with marsh symbols inside them rather
 * than scattered arbitrarily across slopes. The terrain decides where they can be; a low-frequency
 * mask then decides which of those places one actually is, so a meadow reads as a particular place
 * instead of a rule applied uniformly to every basin.
 *
 * Rock is simply ground too steep to hold trees.
 *
 * ── Purity ────────────────────────────────────────────────────────────────────────────────────
 * No imports beyond config, no THREE, no terrain/road/water instances — height and slope arrive as
 * injected samplers, the same discipline prop-scatter.js follows. That is what lets the map feed it
 * the coarse height field while the world feeds it the full analytic terrain, and lets
 * test/map-cover.mjs drive both from synthetic fields.
 */

import { BIOME_PARAMS, BIOME } from '../data/biomes.js'

export { BIOME }

/**
 * Deterministic low-frequency world-space mask in ~[0,1].
 *
 * Same shape as prop-scatter's biomeNoise (sin + cos, seed-folded) rather than a simplex octave,
 * and deliberately so: it is called from the map's per-chunk replay as well as the world scatter,
 * it must be identical in both, and it must not drag a noise generator's construction cost into
 * either. Cheap, pure, and window-invariant.
 */
export function meadowMask (x, z, freq, seed) {
  const s = Math.sin(x * freq + seed * 0.0013) + Math.cos(z * freq * 1.27 + seed * 0.0021)
  return (s * 0.5 + 1) * 0.5
}

/**
 * The biome at a world point.
 *
 * @param {number} x,z
 * @param {number} seed   world seed (folds the meadow mask, so meadows move with the world)
 * @param {{heightAt:(x,z)=>number, slopeAt:(x,z)=>number}} s
 *        slopeAt must return `1 - normal.y` — see data/biomes.js on units.
 * @returns {number} BIOME.FOREST | BIOME.MEADOW | BIOME.ROCK
 *
 * Cost: 1 slope sample, and on flat ground 5 height samples for the relief ring. Callers are
 * expected to evaluate this per CLUSTER, not per tree — see prop-scatter's tree pass.
 */
export function biomeAt (x, z, seed, s, P = BIOME_PARAMS) {
  const slope = s.slopeAt(x, z)
  if (slope >= P.rockSlopeMin) return BIOME.ROCK
  if (slope > P.meadowSlopeMax) return BIOME.FOREST

  // Relief against the surrounding ground, as a 4-point ring rather than a full neighbourhood
  // average. The ring is what makes this cheap enough to sit in the scatter's hot path, and at this
  // radius the two readings differ by less than the threshold's own slack.
  const r = P.meadowReliefR
  const h = s.heightAt(x, z)
  const around = (s.heightAt(x + r, z) + s.heightAt(x - r, z) +
                  s.heightAt(x, z + r) + s.heightAt(x, z - r)) * 0.25
  if (around - h < P.meadowReliefMin) return BIOME.FOREST

  return meadowMask(x, z, P.meadowNoiseFreq, seed) >= P.meadowNoiseMin ? BIOME.MEADOW : BIOME.FOREST
}
