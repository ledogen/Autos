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
 * Ground that collects water, for the map's marsh symbols.
 *
 * THE drainage test — there is deliberately only one. It asks exactly what the MEADOW branch of
 * biomeAt asks (is this flat, and does it sit below what surrounds it) at a much smaller radius,
 * because a meadow is a landform and a bog is a hollow. Keeping both readings in this file, off one
 * parameter block, is what stops them drifting into two different ideas of drainage.
 *
 * Independent of biome, and layered over it: a seep under closed canopy is wet without being open,
 * and a meadow on a well-drained bench is open without being wet.
 *
 * @param {{heightAt:(x,z)=>number}} s   heightAt only — wetness needs no slope sampler, since the
 *                                       gradient comes off the same ring as the relief.
 */
export function isWetGround (x, z, s, P = BIOME_PARAMS) {
  const r = P.wetRingR
  const h  = s.heightAt(x, z)
  const hE = s.heightAt(x + r, z), hW = s.heightAt(x - r, z)
  const hS = s.heightAt(x, z + r), hN = s.heightAt(x, z - r)

  const gx = (hE - hW) / (2 * r), gz = (hS - hN) / (2 * r)
  if (1 - 1 / Math.sqrt(1 + gx * gx + gz * gz) > P.wetSlopeMax) return false
  return (hE + hW + hS + hN) * 0.25 - h >= P.wetReliefMin
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
  // ROCK is a LOCAL question — a face is steep where you stand on it — so it reads the caller's
  // own slope sampler at whatever baseline that caller uses.
  if (s.slopeAt(x, z) >= P.rockSlopeMin) return BIOME.ROCK

  // MEADOW is a question about a LANDFORM, and both of its tests are answered from one 4-point
  // ring at meadowRingR. That shared ring is not just a saving — it is the fix for meadows that
  // came out shot through with green strips.
  //
  // Flatness used to read the caller's slope sampler too, at whatever short baseline it had (±0.5 m
  // through analyticNormal in the world, ±8 m on the map — which also meant the two consumers were
  // not answering quite the same question). At that scale every ridgelet crossing a basin floor
  // spikes the slope over the threshold, so the meadow broke into ribbons of forest following
  // metre-scale wrinkles that nobody standing in the field would call a treeline. Reading the
  // gradient across the ring instead asks whether the LANDFORM is flat, which is what a meadow is,
  // and it makes both consumers read identically.
  const r = P.meadowRingR
  const h  = s.heightAt(x, z)
  const hE = s.heightAt(x + r, z), hW = s.heightAt(x - r, z)
  const hS = s.heightAt(x, z + r), hN = s.heightAt(x, z - r)

  const gx = (hE - hW) / (2 * r), gz = (hS - hN) / (2 * r)
  if (1 - 1 / Math.sqrt(1 + gx * gx + gz * gz) > P.meadowSlopeMax) return BIOME.FOREST

  // Sitting low relative to what surrounds it — the same four samples.
  if ((hE + hW + hS + hN) * 0.25 - h < P.meadowReliefMin) return BIOME.FOREST

  return meadowMask(x, z, P.meadowNoiseFreq, seed) >= P.meadowNoiseMin ? BIOME.MEADOW : BIOME.FOREST
}
