/**
 * src/terrain-texture.js — FEAT-84: procedural GRASS / DIRT / ROCK surface textures for the terrain.
 *
 * The terrain colours its vertices per biome (terrain.js _writeChunkVertexColors) and the three
 * biome weights ride along as the `aSurf` attribute. This module bakes the per-zone DETAIL those
 * weights blend between in the fragment shader: for each zone a tileable
 *   • albedo MODULATION map (rgb, 0.5 = ×1.0 — it multiplies the vertex palette colour, so the
 *     debug-menu colour pickers keep working and the flat palette stays the palette) with the
 *     surface HEIGHT in alpha (the height-weighted blend reads it — the taller feature wins at an
 *     interface, so rock pokes through thinning grass instead of dissolving into it), and
 *   • a tangent-space NORMAL map (x→R, y→G, central difference of the wrapped heightfield).
 *
 * No image assets ship (ART-STYLE.md rule 1 / D-01): every map is a pure function of a seed,
 * generated at boot in ~40 ms, in the spirit of stone-texture.js's riverbed cobbles. Unlike that
 * module this one writes THREE.DataTexture from typed arrays instead of a 2D canvas — a canvas
 * PREMULTIPLIES colour by alpha on putImageData, which would corrupt the albedo wherever the
 * height channel is low — and that also makes it runnable headless (test/terrain-texture.mjs).
 *
 * Every field is TOROIDAL (distances wrap modulo the tile) so the maps tile seamlessly under
 * RepeatWrapping in world-XZ metres (the shader samples vWorldPos.xz × uSurfScale, no UVs).
 *
 * Recipes (all max-composited heightfields, then colour, then normal):
 *   GRASS — thousands of short tapered strokes = blade tufts over a soft fbm undulation.
 *   DIRT  — fbm clods under a patchy field of angular pebbles (~50 % cover) and a few stones.
 *   ROCK  — a packed field of angular fragments (~80 % cover) over a low plate/fissure filler.
 */

import * as THREE from 'three'
import { mulberry32 } from './seed.js'

const smooth = (t) => t * t * (3 - 2 * t)
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v

// ── seeded 2D value noise on the torus (integer lattice wraps at `period`) ────────────────────
function _hash2(ix, iy, seed) {
  let h = seed | 0
  h = Math.imul(h ^ (ix | 0), 0x9e3779b9)
  h = Math.imul(h ^ (iy | 0), 0x85ebca6b)
  h ^= h >>> 15
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}
function _vnoiseWrap(x, y, period, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const fx = smooth(x - x0), fy = smooth(y - y0)
  const w = (i) => ((i % period) + period) % period
  const a = _hash2(w(x0), w(y0), seed), b = _hash2(w(x0 + 1), w(y0), seed)
  const c = _hash2(w(x0), w(y0 + 1), seed), d = _hash2(w(x0 + 1), w(y0 + 1), seed)
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy
}
/** fbm over the torus: `cells` lattice cells per tile edge at octave 0 (must divide `size`). */
function _fbmWrap(px, py, size, cells, octaves, seed) {
  let s = 0, amp = 0.5, freq = cells / size, period = cells, tot = 0
  for (let o = 0; o < octaves; o++) {
    s += amp * _vnoiseWrap(px * freq, py * freq, period, seed + o * 131)
    tot += amp; amp *= 0.5; freq *= 2; period *= 2
  }
  return s / tot
}

// Rescale a composited heightfield to span [0,1] exactly (the alpha channel packs it as bytes,
// and the height-weighted blend compares zones against each other, so all three share one scale).
function _normalise(H) {
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < H.length; i++) { if (H[i] < lo) lo = H[i]; if (H[i] > hi) hi = H[i] }
  const k = hi > lo ? 1 / (hi - lo) : 1
  for (let i = 0; i < H.length; i++) H[i] = (H[i] - lo) * k
  return H
}

// Toroidal shortest signed offset between two coordinates on a tile of `size`.
const _wrapDelta = (a, b, size) => { let d = a - b; if (d > size / 2) d -= size; else if (d < -size / 2) d += size; return d }

/** Central-difference tangent-space normal map (RG = xy, B unused) of a wrapped heightfield. */
// Rank (quantile) of every texel's height: 0 = the lowest texel of the tile, 1 = the tallest,
// uniformly distributed BY CONSTRUCTION. The shader's coverage rules ("rock on s^γ of the tile,
// tallest fragments first"; "this share of the pebbles, tallest first") need a quantile, and the
// min–max normalised height is not one — measured 2026-09-28: only 1.8 % of the rock tile is
// above 0.5 and 0.3 % above 0.73, so "cov 0.27" admitted ~0.3 % of texels and the floor / pebble
// dials were dead below share ~0.7 (the whole rock front lived between s 0.7 and 0.8). The rank
// rides in the normal map's blue channel (the shader reads only .xy of it); relief, joints and the
// height contest keep the absolute height.
function _rankOf(H) {
  const N = H.length, idx = new Uint32Array(N)
  for (let i = 0; i < N; i++) idx[i] = i
  idx.sort((a, b) => H[a] - H[b])
  const rank = new Float32Array(N), k = 1 / (N - 1)
  for (let r = 0; r < N; r++) rank[idx[r]] = r * k
  return rank
}

function _normalBytes(H, size, strength, rank = null) {
  const out = new Uint8Array(size * size * 4)
  const at = (x, z) => H[(((z % size) + size) % size) * size + (((x % size) + size) % size)]
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const dX = (at(x - 1, z) - at(x + 1, z)) * strength   // ∝ −∂h/∂x (see terrain.js td_wb convention)
      const dZ = (at(x, z - 1) - at(x, z + 1)) * strength
      const inv = 1 / Math.sqrt(dX * dX + dZ * dZ + 1)
      const j = (z * size + x) * 4
      out[j]     = (dX * inv * 0.5 + 0.5) * 255
      out[j + 1] = (dZ * inv * 0.5 + 0.5) * 255
      out[j + 2] = rank ? rank[z * size + x] * 255 : (inv * 0.5 + 0.5) * 255   // B = height RANK (see _rankOf)
      out[j + 3] = 255
    }
  }
  return out
}

function _tex(bytes, size) {
  const t = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat, THREE.UnsignedByteType)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = true
  t.anisotropy = 4              // three clamps to the device max at upload
  t.flipY = false               // row index grows with world +Z, matching the normal encoding
  t.colorSpace = THREE.NoColorSpace   // modulation factors / normal vectors are data, never sRGB
  t.needsUpdate = true
  return t
}

// Pack an albedo modulation (rgb factors, 1.0 = the palette colour) + height into RGBA bytes.
// Factor f → f·63.75, so 1.0 lands on 0.25 and the shader multiplies the sample by 4.0 to recover
// it (max factor 4.0 — a grey pebble on the dark dirt base needs a ×3+ blue factor).
export const ALBEDO_PACK = 4.0
function _packAlbedo(mod, H, size) {
  const out = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const j = i * 4
    out[j]     = clamp01(mod[j]     / ALBEDO_PACK) * 255
    out[j + 1] = clamp01(mod[j + 1] / ALBEDO_PACK) * 255
    out[j + 2] = clamp01(mod[j + 2] / ALBEDO_PACK) * 255
    out[j + 3] = clamp01(H[i]) * 255
  }
  return out
}
// Factor that turns the zone's palette colour (linear rgb) into an absolute target colour.
const _toward = (target, base) => [
  Math.min(ALBEDO_PACK - 0.01, target[0] / Math.max(base[0], 0.02)),
  Math.min(ALBEDO_PACK - 0.01, target[1] / Math.max(base[1], 0.02)),
  Math.min(ALBEDO_PACK - 0.01, target[2] / Math.max(base[2], 0.02)),
]
const _hexLin = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]


// ── GRASS: tufts of short tapered strokes ─────────────────────────────────────────────────────
export function grassFields(seed, size) {
  const rng = mulberry32(seed >>> 0)
  const N = size * size
  const H = new Float32Array(N)
  const mod = new Float32Array(N * 4)
  // Soft undulation under the blades so bare gaps are not dead flat.
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    H[z * size + x] = 0.22 * _fbmWrap(x, z, size, 8, 2, seed)
  }
  // Tussocks (owner 2026-09-25: the meadow "reads as too flat esp. at distance … twiggy /
  // shrubby"): mounded bunchgrass 0.25–0.5 m across at the 2 m tile, packed ~55 %, each an
  // irregular dome (radius wobbles around the rim) so they read as clumps, not bubbles. This is
  // the relief that survives mipmapping at 30–80 m; the 5 cm strokes below ride on top of it.
  const nTuss = Math.round(size * size / 900)          // ~73 at 256²
  for (let t = 0; t < nTuss; t++) {
    const cx = rng() * size, cz = rng() * size
    const r = size * (0.06 + rng() * 0.06)              // 15–30 px = 12–24 cm radius
    const h = 0.42 + rng() * 0.22
    const p1 = rng() * Math.PI * 2, p2 = rng() * Math.PI * 2, a1 = 0.12 + rng() * 0.12, a2 = 0.08 + rng() * 0.1
    const ir = Math.ceil(r * 1.3)
    const x0 = Math.floor(cx), z0 = Math.floor(cz)
    for (let oz = -ir; oz <= ir; oz++) for (let ox = -ir; ox <= ir; ox++) {
      const ang = Math.atan2(oz, ox)
      const re = r * (1 + a1 * Math.sin(3 * ang + p1) + a2 * Math.sin(5 * ang + p2))
      const d = Math.hypot(ox, oz)
      if (d > re) continue
      const v = h * smooth(1 - d / re) * (0.85 + 0.15 * rng())
      const i = (((z0 + oz) % size + size) % size) * size + (((x0 + ox) % size + size) % size)
      if (v > H[i]) H[i] = v
    }
  }
  const strokeB = new Float32Array(N).fill(0.84)    // brightness factor per pixel (base: shaded ground)
  const strokeY = new Float32Array(N)               // yellowing per pixel [-1,1]
  const nStrokes = Math.round(size * size / 22)      // ~3000 at 256²
  for (let s = 0; s < nStrokes; s++) {
    const cx = rng() * size, cz = rng() * size
    const ang = rng() * Math.PI * 2
    const len = size * (0.02 + rng() * 0.03)         // 5–13 px at 256²
    const wid = 0.6 + rng() * 0.7                    // half-width px
    const peak = 0.45 + rng() * 0.55
    const bright = 0.78 + rng() * 0.44               // owner 2026-09-23: the tufts were unreadable — wider than 0.86–1.16
    const yel = rng() * 2 - 1
    const dx = Math.cos(ang), dz = Math.sin(ang)
    const bx0 = Math.floor(Math.min(cx, cx + dx * len) - wid - 1), bx1 = Math.ceil(Math.max(cx, cx + dx * len) + wid + 1)
    const bz0 = Math.floor(Math.min(cz, cz + dz * len) - wid - 1), bz1 = Math.ceil(Math.max(cz, cz + dz * len) + wid + 1)
    for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) {
      // project onto the stroke segment (unwrapped — bbox is small, wrap only the write index)
      const qx = x - cx, qz = z - cz
      let t = (qx * dx + qz * dz) / len
      if (t < 0 || t > 1) continue
      const px = qx - dx * t * len, pz = qz - dz * t * len
      const d = Math.sqrt(px * px + pz * pz)
      const w = wid * (1 - 0.7 * t)                  // taper toward the tip
      if (d > w) continue
      const h = peak * (1 - t * 0.35) * smooth(1 - d / w) + 0.2
      const i = (((z % size) + size) % size) * size + (((x % size) + size) % size)
      if (h > H[i]) { H[i] = h; strokeB[i] = bright + 0.12 * t; strokeY[i] = yel }
    }
  }
  for (let i = 0; i < N; i++) {
    const b = strokeB[i], y = strokeY[i]
    const j = i * 4
    mod[j]     = b * (1 + 0.16 * y)
    mod[j + 1] = b * (1 + 0.04 * y)
    mod[j + 2] = b * (1 - 0.18 * y)
  }
  return { H: _normalise(H), mod, normalStrength: 3.0 }
}

// ── DIRT: fbm clods + pebbles + a few stones ──────────────────────────────────────────────────
export function dirtFields(seed, size, base = _hexLin(0x69481b)) {
  const rng = mulberry32(seed >>> 0)
  // Pebble palette — sun-washed browns + greys (owner, 2026-09-22), as absolute linear colours the
  // modulation steers the dirt base toward. A neutral grey on a brown base needs a large blue
  // factor, which is what the ×4 packing exists for.
  // Kept only a little above the soil's own value: under full sun + ACES anything much brighter
  // than the brown base reads as white salt, not stone (seen at 5 m, 2026-09-23).
  const PEBBLES = [
    [0.42, 0.34, 0.24],   // sun-washed brown
    [0.40, 0.35, 0.26],   // pale tan
    [0.30, 0.29, 0.27],   // light grey
    [0.25, 0.24, 0.22],   // mid grey
    [0.22, 0.17, 0.11],   // dark brown (shadowed / wet)
  ]
  const N = size * size
  const H = new Float32Array(N)
  const mod = new Float32Array(N * 4)
  const owner = new Int32Array(N).fill(-1)
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    H[z * size + x] = 0.45 * _fbmWrap(x, z, size, 4, 3, seed + 7)
  }
  // Pebbles are ANGULAR fragments (owner 2026-09-23: "reshaped to match the rough shape of the
  // crumbs"), packed to ~half the tile, and PATCHY: an in-tile fbm mask gates where they land so
  // the tile has gravelly stretches and bare clod stretches (~0.6 m patches at the 2.4 m tile).
  const PEBBLE_COVER = 0.5
  const tint = []
  const N2 = size * size
  const covered = () => { let n = 0; for (let i = 0; i < N2; i++) if (owner[i] >= 0) n++; return n / N2 }
  let p = 0
  for (; p < 8000; p++) {
    const px = rng() * size, pz = rng() * size
    const mask = _fbmWrap(px, pz, size, 4, 2, seed + 17)
    if (rng() > 0.08 + 0.92 * smooth(clamp01((mask - 0.38) / 0.28))) continue   // sparse off-patch, dense on
    const stone = rng() < 0.06
    const r = stone ? size * (0.03 + rng() * 0.03) : size * (0.008 + rng() * rng() * 0.024)   // 8–15 px / 2–8 px
    const verts = _convexPoly(rng, px, pz, r)
    _rasterPoly(H, size, verts, 0.5 + rng() * 0.5, [(rng() - 0.5) * 0.16, (rng() - 0.5) * 0.16], owner, tint.length)
    const pick = PEBBLES[Math.min(PEBBLES.length - 1, Math.floor(rng() * rng() * 2 * PEBBLES.length) % PEBBLES.length)]
    const v = 0.9 + rng() * 0.2
    tint.push(_toward([pick[0] * v, pick[1] * v, pick[2] * v], base))
    if ((p & 63) === 63 && covered() >= PEBBLE_COVER) break
  }
  const pebbleCover = covered()
  // The soil between the pebbles: relief shading only (low clods darker, crowns lighter). The
  // "green under the rocks" is the shader's colour key (terrain.js uRockGapGreen), never baked
  // here — a baked tint on the fill skirt read as "green with rocks poking through" (owner
  // 2026-09-25).
  for (let i = 0; i < N; i++) {
    const j = i * 4
    const o = owner[i]
    if (o >= 0) {
      const t = tint[o]
      mod[j] = t[0]; mod[j + 1] = t[1]; mod[j + 2] = t[2]
    } else {
      const lift = 0.86 + 0.28 * clamp01(H[i] / 0.45)   // low clods darker, crowns lighter
      mod[j] = lift; mod[j + 1] = lift * 0.99; mod[j + 2] = lift * 0.96
    }
  }
  // Per-PEBBLE rank (owner pass 16, 2026-09-28): the shader's "this share of the pebbles goes
  // grey, tallest first" flips WHOLE pebbles, ranked by their peak height and weighted by their
  // texel count (so the share is a share of pebble AREA). Soil = 0; a pebble's texels all carry
  // (0.05, 1]. Ranking texels by height instead left every pebble's lower half — and every small
  // pebble — classed as a clod: brown, relief kept, no slider could reach it ("still brown").
  const nPeb = tint.length
  const peak = new Float32Array(nPeb), area = new Uint32Array(nPeb)
  for (let i = 0; i < N; i++) { const o = owner[i]; if (o >= 0) { area[o]++; if (H[i] > peak[o]) peak[o] = H[i] } }
  const order = Array.from({ length: nPeb }, (_, k) => k).sort((a, b) => peak[a] - peak[b])
  const pebRank = new Float32Array(nPeb)
  let cum = 0, total = 0; for (let k = 0; k < nPeb; k++) total += area[k]
  for (const k of order) { cum += area[k]; pebRank[k] = total > 0 ? 0.05 + 0.95 * (cum / total) : 1 }
  const rank = new Float32Array(N)
  for (let i = 0; i < N; i++) { const o = owner[i]; rank[i] = o >= 0 ? pebRank[o] : 0 }
  return { H: _normalise(H), mod, normalStrength: 2.2, pebbleCover, rank }
}

// ── ROCK: fractured plates + fissures + angular rubble ────────────────────────────────────────
// Owner, 2026-09-22: the first pass (bevelled Voronoi) read as a cracked mud flat. What reads as
// rock is BOTH scales at once — large plates with hard-edged fissures running through them, each
// plate a slightly tilted facet, and very small jagged fragments lying on top (crumble). So:
//   1. plates: domain-warped Voronoi cells, each a tilted plane (per-cell gradient) — no bevel,
//      the joint is a near-vertical step over ~2 px;
//   2. fissures: a few long random-walk cracks cutting across the plates, deep and narrow;
//   3. rubble: hundreds of small convex polygons (3–7 px) with flat tops, max-composited.
// Small rock shapes rasterise as polygons, not domes — a dome is the "cheese ball" the owner saw.
function _rasterPoly(H, size, verts, h, tilt, owner, id) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const [x, z] of verts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
  for (let z = Math.floor(z0); z <= Math.ceil(z1); z++) {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      // inside test: same side of every edge (verts are convex, CCW)
      let inside = true
      for (let i = 0; i < verts.length && inside; i++) {
        const a = verts[i], b = verts[(i + 1) % verts.length]
        if ((b[0] - a[0]) * (z + 0.5 - a[1]) - (b[1] - a[1]) * (x + 0.5 - a[0]) < 0) inside = false
      }
      if (!inside) continue
      const v = h + tilt[0] * (x - cx) + tilt[1] * (z - cz)
      const px = ((x % size) + size) % size, pz = ((z % size) + size) % size
      const i = pz * size + px
      if (v > H[i]) { H[i] = v; if (owner) owner[i] = id }
    }
  }
}
function _convexPoly(rng, cx, cz, r) {
  const n = 4 + Math.floor(rng() * 4)                 // 4–7 sides
  const angs = []
  for (let i = 0; i < n; i++) angs.push(rng() * Math.PI * 2)
  angs.sort((a, b) => a - b)                           // CCW by construction
  return angs.map(a => [cx + Math.cos(a) * r * (0.6 + rng() * 0.4), cz + Math.sin(a) * r * (0.6 + rng() * 0.4)])
}

// The gaps between the fragments are NEUTRAL here (relief shading only): the "foliage under the
// rocks" green is a shader colour key (terrain.js uRockGapGreen / uUnderRockGreen) applied to
// every biome's ground-between-rocks alike, so it never lives in this map (owner 2026-09-25).
export function rockFields(seed, size, paletteBase = _hexLin(0x5a5b5e)) {
  const rng = mulberry32(seed >>> 0)
  const N = size * size
  const H = new Float32Array(N)
  const mod = new Float32Array(N * 4)
  const owner = new Int32Array(N).fill(-1)

  // 1. plates — tilted facets, hard joints
  const nCells = 22 + Math.floor(rng() * 12)          // ~1.5–2 m plates at the 8 m tile
  const cx = new Float32Array(nCells), cz = new Float32Array(nCells)
  const base = new Float32Array(nCells), gx = new Float32Array(nCells), gz = new Float32Array(nCells)
  const tint = new Float32Array(nCells)
  for (let c = 0; c < nCells; c++) {
    cx[c] = rng() * size; cz[c] = rng() * size
    base[c] = 0.5 + rng() * 0.45
    const tiltMag = (0.16 + rng() * 0.24) / (size / 8)   // ±~0.2–0.5 across a plate — facets shade apart
    const ta = rng() * Math.PI * 2
    gx[c] = Math.cos(ta) * tiltMag; gz[c] = Math.sin(ta) * tiltMag
    tint[c] = 0.82 + rng() * 0.3
  }
  const joint = size * 0.006                          // px — crack half-width at the joint
  const warp = size * 0.035
  const plateTint = new Float32Array(N)
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const wx = x + (_fbmWrap(x, z, size, 8, 2, seed + 41) - 0.5) * 2 * warp
      const wz = z + (_fbmWrap(x, z, size, 8, 2, seed + 43) - 0.5) * 2 * warp
      let f1 = 1e9, f2 = 1e9, c1 = 0, d1x = 0, d1z = 0
      for (let c = 0; c < nCells; c++) {
        const dx = _wrapDelta(wx, cx[c], size), dz = _wrapDelta(wz, cz[c], size)
        const d = Math.sqrt(dx * dx + dz * dz)
        if (d < f1) { f2 = f1; f1 = d; c1 = c; d1x = dx; d1z = dz } else if (d < f2) f2 = d
      }
      const crack = clamp01((f2 - f1 - joint) / 2.0)   // 0 in the joint → 1 on the face over ~2 px
      // The face rolls off toward its joints (a slab has rounded shoulders, not a machined edge),
      // so the plate reads as a MASS with relief across it, not a tile with a seam round it.
      const shoulder = 0.7 + 0.3 * smooth(clamp01((f2 - f1) / (size * 0.05)))
      const grain = _fbmWrap(x, z, size, 32, 2, seed + 99)
      const face = (base[c1] + gx[c1] * d1x + gz[c1] * d1z) * shoulder + 0.05 * (grain - 0.5)
      const i = z * size + x
      // The plate field is the GAP FILLER under the fragments (owner 2026-09-23): kept low, so
      // every fragment stands proud of it, and a shade darker so the gaps read as shadowed cracks.
      H[i] = 0.06 + crack * (clamp01(face) * 0.42 - 0.06)
      plateTint[i] = (0.62 + 0.22 * crack) * tint[c1] * (0.95 + 0.1 * grain)
    }
  }

  // 2. fissures — long random-walk cracks across the plates
  const nFiss = 5 + Math.floor(rng() * 4)
  for (let f = 0; f < nFiss; f++) {
    let x = rng() * size, z = rng() * size
    let ang = rng() * Math.PI * 2
    const steps = Math.round(size * (0.5 + rng() * 0.8))
    const w = 0.8 + rng() * 1.2                        // half-width px
    for (let s = 0; s < steps; s++) {
      ang += (rng() - 0.5) * 0.5
      x += Math.cos(ang); z += Math.sin(ang)
      const ix = Math.floor(x), iz = Math.floor(z), r = Math.ceil(w) + 1
      for (let oz = -r; oz <= r; oz++) for (let ox = -r; ox <= r; ox++) {
        const d = Math.hypot(ox + 0.5 - (x - ix), oz + 0.5 - (z - iz))
        const k = clamp01((d - w) / 1.2)               // 0 in the crack → 1 outside
        const i = (((iz + oz) % size + size) % size) * size + (((ix + ox) % size + size) % size)
        const v = H[i] * (0.15 + 0.85 * k)
        if (v < H[i]) { H[i] = v; plateTint[i] *= (0.78 + 0.22 * k) }
      }
    }
  }

  // 3. rubble — small angular fragments lying on the plates
  // Rubble collects where the plates broke: candidates near a joint or fissure are kept 3× as
  // often as ones mid-face ("crumbling and falling down" — the crumble lies along the cracks).
  const jointDist = (x, z) => {
    let f1 = 1e9, f2 = 1e9
    for (let c = 0; c < nCells; c++) {
      const dx = _wrapDelta(x, cx[c], size), dz = _wrapDelta(z, cz[c], size)
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d < f1) { f2 = f1; f1 = d } else if (d < f2) f2 = d
    }
    return f2 - f1
  }
  // 3. fragments — THE surface (owner 2026-09-23: "grow the crumbs so they take up 80% of the
  //    available space"). Angular blocks from ~0.1 m to ~0.7 m, flat-topped and tilted, stacked
  //    until they own RUBBLE_COVER of the tile; the plate/fissure field shows only in the gaps.
  //    Big ones first (they set the structure), small ones fill in — each stands above the field
  //    (h ≥ 0.5) so a fragment always wins over the gap beneath it.
  const RUBBLE_COVER = 0.8
  const rubTint = []
  const N4 = size * size
  const covered = () => { let n = 0; for (let i = 0; i < N4; i++) if (owner[i] >= 0) n++; return n / N4 }
  let p = 0, cover = 0
  for (; p < 6000; p++) {
    const big = p < 40                                 // the first few are the large blocks
    const r = big ? size * (0.035 + rng() * 0.07) : size * (0.008 + rng() * rng() * 0.04)   // 9–27 px (0.3–0.85 m) / 2–12 px
    let px = rng() * size, pz = rng() * size
    if (!big) for (let tries = 0; tries < 4 && jointDist(px, pz) > size * 0.04 && rng() < 0.5; tries++) { px = rng() * size; pz = rng() * size }
    const verts = _convexPoly(rng, px, pz, r)
    const h = 0.5 + rng() * 0.5
    _rasterPoly(H, size, verts, h, [(rng() - 0.5) * 0.14, (rng() - 0.5) * 0.14], owner, p)
    const v = 0.75 + rng() * 0.5
    const warm = rng() < 0.3
    rubTint.push([v * (warm ? 1.06 : 0.98), v, v * (warm ? 0.9 : 1.03)])
    if ((p & 63) === 63) { cover = covered(); if (cover >= RUBBLE_COVER) break }
  }
  cover = covered()

  for (let i = 0; i < N; i++) {
    const j = i * 4
    const o = owner[i]
    if (o >= 0) { const t = rubTint[o]; mod[j] = t[0]; mod[j + 1] = t[1]; mod[j + 2] = t[2] }
    else { const f = plateTint[i]; mod[j] = f; mod[j + 1] = f; mod[j + 2] = f * 1.02 }   // joints: relief shading only
  }
  // Normal scale in physical terms: the height unit is ~0.25 m and a texel is 3 cm at the 8 m
  // tile, so ~12 puts a 0.3-high facet across a 1.5 m plate at ~6°; joints and rubble edges
  // saturate to steps, which is what they are. (2.4 left the facets under 2° — flat tiles.)
  return { H: _normalise(H), mod, normalStrength: 12, rubbleCover: cover }
}

/**
 * Bake the three surface texture pairs.
 * @param {number} seed  deterministic (world-independent — one shared look, like the riverbed)
 * @param {number} size  texture edge in px (power of two)
 * @param {{dirt?:number, rock?:number}} bases  palette hex colours the absolute-target palettes are relative to
 * @returns {{ grass: {map, normalMap}, dirt: {map, normalMap}, rock: {map, normalMap} }}
 */
export function makeSurfaceTextures(seed = 8401, size = 256, bases = {}) {
  // Normal map .b = the field's own rank when the bake supplies one (dirt: per-pebble, 0 = soil),
  // else the per-texel height rank (rock: coverage, tallest fragments first; grass: unused).
  const build = (fields) => ({
    map:       _tex(_packAlbedo(fields.mod, fields.H, size), size),
    normalMap: _tex(_normalBytes(fields.H, size, fields.normalStrength, fields.rank ?? _rankOf(fields.H)), size),
  })
  return {
    grass: build(grassFields(seed, size)),
    dirt:  build(dirtFields(seed + 1, size, bases.dirt ? _hexLin(bases.dirt) : undefined)),
    rock:  build(rockFields(seed + 2, size, bases.rock ? _hexLin(bases.rock) : undefined)),
  }
}
