/**
 * src/stone-texture.js — FEAT-25: procedural cobbled-riverbed texture (no asset files, D-01).
 *
 * Generates a seamless, tileable cobble surface entirely in-browser from a mulberry32 seed:
 *   1. HEIGHTFIELD — ~100-150 overlapping rounded domes, MAX-composited so each stone reads as
 *      an individual river rock (a max of dome bumps keeps their crowns; a sum would smear them
 *      into a lumpy sheet). Domes are placed with TOROIDAL wrap (modular distance) so the field
 *      tiles seamlessly along the stream ribbon.
 *   2. COLOR MAP — a warm gray/tan Sierra-granite palette. Each stone gets a per-dome tint drawn
 *      between tan and cool gray; the crevices (low heightfield) darken toward wet dark brown
 *      because the bed sits UNDER the stream water. High-frequency per-pixel noise breaks flatness.
 *   3. NORMAL MAP — central-difference slope of the (wrapped) heightfield, standard tangent-space
 *      encoding (x→R, y→G, up→B). Strength tuned so cobbles catch the game's directional sun.
 *
 * Browser-only (uses a 2D canvas → THREE.CanvasTexture). Not imported by any headless gate; the
 * bed MESH builder in water-render.js takes the material as an argument so it stays THREE-testable.
 */

import * as THREE from 'three'
import { mulberry32 } from './seed.js'

// Sierra-granite palette (0xRRGGBB → linear-ish sRGB bytes; the material's map is sRGB-decoded).
const BASE = [0x8a, 0x83, 0x78]   // warm gray granite
const TAN  = [0xa8, 0x98, 0x80]   // per-stone warm drift
const COOL = [0x7d, 0x7f, 0x7e]   // per-stone cool drift
const WET  = [0x4a, 0x42, 0x38]   // wet dark brown — crevice / submerged shadow

const smooth = (t) => t * t * (3 - 2 * t)               // smoothstep 0..1
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v

/**
 * Build the shared cobble textures.
 * @param {number} seed  deterministic mulberry32 seed (world-independent — one shared bed look).
 * @param {number} size  texture edge in px (power of two; 256 is plenty at ribbon scale).
 * @returns {{ map: THREE.CanvasTexture, normalMap: THREE.CanvasTexture }}
 */
export function makeCobbleTextures(seed = 1234, size = 256) {
  const rng = mulberry32(seed >>> 0)
  const N = size * size

  // ── 1. Heightfield: max-composited toroidal domes ──────────────────────────────────────
  const H = new Float32Array(N)            // [0,1] surface height
  const owner = new Int32Array(N).fill(-1) // dome index whose crown owns each pixel (for its tint)
  const nDomes = 100 + Math.floor(rng() * 51)   // ~100-150 stones
  const tintR = new Float32Array(nDomes), tintG = new Float32Array(nDomes), tintB = new Float32Array(nDomes)

  for (let d = 0; d < nDomes; d++) {
    const cx = rng() * size, cz = rng() * size
    const r = 8 + rng() * 20                 // 8-28 px radius
    // Per-stone tint: blend BASE toward TAN (warm) or COOL (gray) by a signed pick, amplitude ≤~1.
    const tsel = rng() * 2 - 1               // [-1,1]
    const tgt = tsel >= 0 ? TAN : COOL
    const amt = Math.abs(tsel)
    tintR[d] = BASE[0] + (tgt[0] - BASE[0]) * amt
    tintG[d] = BASE[1] + (tgt[1] - BASE[1]) * amt
    tintB[d] = BASE[2] + (tgt[2] - BASE[2]) * amt
    const domeH = 0.55 + rng() * 0.45        // crown height of this stone

    // Only pixels within r of the (wrapped) centre can be affected — bound the loop to that box.
    const ir = Math.ceil(r)
    for (let oz = -ir; oz <= ir; oz++) {
      for (let ox = -ir; ox <= ir; ox++) {
        const d2 = ox * ox + oz * oz
        if (d2 > r * r) continue
        const dist = Math.sqrt(d2)
        // Smooth radial falloff → rounded dome (1 at centre, 0 at rim). smooth() rounds the crown.
        const h = domeH * smooth(1 - dist / r)
        // Wrapped pixel index (toroidal → seamless tile).
        const px = ((Math.floor(cx) + ox) % size + size) % size
        const pz = ((Math.floor(cz) + oz) % size + size) % size
        const idx = pz * size + px
        if (h > H[idx]) { H[idx] = h; owner[idx] = d }
      }
    }
  }

  // ── 2. Color map ────────────────────────────────────────────────────────────────────────
  const cCanvas = document.createElement('canvas')
  cCanvas.width = cCanvas.height = size
  const cCtx = cCanvas.getContext('2d')
  const cImg = cCtx.createImageData(size, size)
  const cData = cImg.data
  for (let i = 0; i < N; i++) {
    const o = owner[i]
    let r = o >= 0 ? tintR[o] : BASE[0]
    let g = o >= 0 ? tintG[o] : BASE[1]
    let b = o >= 0 ? tintB[o] : BASE[2]
    // Crevice darkening: low heightfield → wet dark brown (the bed is underwater).
    const lit = smooth(clamp01(H[i] * 1.3))
    r = WET[0] + (r - WET[0]) * lit
    g = WET[1] + (g - WET[1]) * lit
    b = WET[2] + (b - WET[2]) * lit
    // Subtle high-frequency grain so flats don't read as plastic (±~6%, deterministic).
    const n = (rng() * 2 - 1) * 0.06 + 1
    const j = i * 4
    cData[j + 0] = clamp01(r * n / 255) * 255
    cData[j + 1] = clamp01(g * n / 255) * 255
    cData[j + 2] = clamp01(b * n / 255) * 255
    cData[j + 3] = 255
  }
  cCtx.putImageData(cImg, 0, 0)

  // ── 3. Normal map: central difference over the WRAPPED heightfield ────────────────────────
  const STRENGTH = 3.0                       // slope gain — tuned so cobbles catch the sun
  const nCanvas = document.createElement('canvas')
  nCanvas.width = nCanvas.height = size
  const nCtx = nCanvas.getContext('2d')
  const nImg = nCtx.createImageData(size, size)
  const nData = nImg.data
  const at = (x, z) => H[(((z % size) + size) % size) * size + (((x % size) + size) % size)]
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const dX = (at(x - 1, z) - at(x + 1, z)) * STRENGTH
      const dY = (at(x, z - 1) - at(x, z + 1)) * STRENGTH
      // normal = normalize(dX, dY, 1); encode to [0,1] bytes (x→R, y→G, z→B).
      const inv = 1 / Math.sqrt(dX * dX + dY * dY + 1)
      const j = (z * size + x) * 4
      nData[j + 0] = (dX * inv * 0.5 + 0.5) * 255
      nData[j + 1] = (dY * inv * 0.5 + 0.5) * 255
      nData[j + 2] = (inv * 0.5 + 0.5) * 255
      nData[j + 3] = 255
    }
  }
  nCtx.putImageData(nImg, 0, 0)

  const map = new THREE.CanvasTexture(cCanvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  const normalMap = new THREE.CanvasTexture(nCanvas)
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping
  return { map, normalMap }
}
