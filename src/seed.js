/**
 * src/seed.js — World-seed foundation for AUTOS v1.1
 *
 * ONE definition: every thread imports this module (the terrain and road Workers are ES modules).
 * The old rule that these bodies be pasted verbatim into a Worker source string is retired.
 *
 * SECURITY: seed strings flow only through djb2 charCodeAt() arithmetic —
 * no string-to-code execution path exists (T-07-02-INJ threat mitigated).
 *
 * WORKER-SAFE: No import statements, no DOM references, no THREE.* here — pure math.
 *
 * Domain tags (grep `seedFor(` for the live list): terrain "coarse"/"fine"/"regional", "spawn",
 * "flora", "streamKeep", "roadquality"/"roadsite"/"roadsitePri", the scatter's cover* and
 * *Rocks passes.
 */

// ── djb2 string→32-bit hash ───────────────────────────────────────────────────
// O(n) in string length; empty string → 5381 (deterministic).
// Math.imul performs 32-bit integer multiplication without overflow loss.
// Security: only charCodeAt() arithmetic — no code execution path.
export function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0
  }
  return h >>> 0
}

// ── parseWorldSeed — accepts string or integer → unsigned 32-bit int ─────────
// Used at startup (URL ?seed= param) and on debug-panel seed field change.
// Integer path:        (input | 0) >>> 0  (clips to signed 32-bit then forces unsigned)
// Numeric-text path:   all-digit strings parse as integers so ?seed=12345 and the debug
//                      field agree with a numeric seed — URLSearchParams.get is ALWAYS a
//                      string, so without this an all-digit URL seed would hash via djb2
//                      and silently diverge from the documented integer world (SEED-01/03).
// String path:         djb2(String(input))
export function parseWorldSeed(input) {
  if (typeof input === 'number') return (input | 0) >>> 0
  const s = String(input)
  if (/^-?\d+$/.test(s)) return (parseInt(s, 10) | 0) >>> 0
  return djb2(s)
}

// ── seedFor — domain-tagged sub-seed derivation ───────────────────────────────
// Returns a deterministic unsigned 32-bit sub-seed for a given worldSeed +
// domain tag + optional tile coordinates. Pure function; no mutable state.
//
// Mixing constants:
//   0x9e3779b9 — golden-ratio fractional part × 2^32 (Knuth / Fibonacci hashing)
//   0x85ebca6b — secondary avalanche constant (murmur3-inspired)
//
// Usage: seedFor(worldSeed, "coarse")           → coarse layer seed
//        seedFor(worldSeed, "road", tileX, tileZ) → per-tile road seed
export function seedFor(worldSeed, domainTag, ...coords) {
  // Step 1: hash the domain tag string
  let h = djb2(domainTag)
  // Step 2: mix in worldSeed using golden-ratio avalanche
  h = (Math.imul(h ^ (worldSeed >>> 0), 0x9e3779b9) >>> 0)
  // Step 3: fold each coordinate into h (enables per-tile independent streams)
  for (const coord of coords) {
    h = (Math.imul(h ^ ((coord | 0) >>> 0), 0x85ebca6b) >>> 0)
  }
  return h >>> 0
}

// ── mulberry32 — seeded PRNG closure ─────────────────────────────────────────
// Returns a `() => [0, 1)` closure seeded by a 32-bit integer.
// Used as the `random` argument to createNoise2D() for each terrain layer:
//   createNoise2D(mulberry32(seedFor(worldSeed, "coarse")))
//
// Passes PractRand at << 512 draws (256 values per buildPermutationTable call).
// Increment: 0x6D2B79F5 (Steele/Vigna / JSF-derived constant).
export function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── hash32 — FNV-1a string→32-bit hash ───────────────────────────────────────
// Keys the per-edge / per-cell PRNGs of poi.js (POI + customer layout), camp.js (FEAT-45 camping
// zones), campfire.js (log yaw) and debris.js; poi.js's model picks + variants (the seeding
// model-service.js and data/prop-models.js document) ride it too. Any stable hash would do, but it must STAY stable — do not
// "improve" it: every existing seed's POI and camp layout rides on it being byte-identical.
// (Distinct from djb2 above, which seeds worldgen; the two are not interchangeable.)
export function hash32(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}
