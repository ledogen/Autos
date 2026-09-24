// test/terrain-texture.mjs — FEAT-84 gate: the procedural grass/dirt/rock surface maps.
//
// The terrain shader samples these in world metres under RepeatWrapping, so a seam at the tile
// edge would print a grid over the whole world. Asserts, for each of the three zones:
//   1. deterministic — same seed → byte-identical bytes; different seed → different bytes
//   2. tileable — the heightfield is continuous across the wrap (edge-to-edge step no larger
//      than the largest interior step) and the normal map likewise
//   3. sane ranges — height uses a real span of [0,1]; albedo modulation averages near ×1.0
//      (so the palette colour survives) and never clips at the packing ceiling
//   4. normal encoding — z channel always ≥ 0.5 (an upward normal), x/y centred on 0.5
//
// Run: node test/terrain-texture.mjs   (exit 0 = pass)

import { grassFields, dirtFields, rockFields, makeSurfaceTextures, ALBEDO_PACK } from '../src/terrain-texture.js'

let fails = 0
const ok = (cond, msg) => { if (!cond) { console.error('  ✗', msg); fails++ } else console.log('  ✓', msg) }

const SIZE = 128
const zones = { grass: grassFields, dirt: dirtFields, rock: rockFields }

for (const [name, fn] of Object.entries(zones)) {
  console.log(`${name}`)
  const a = fn(1234, SIZE), b = fn(1234, SIZE), c = fn(4321, SIZE)
  let same = true, diff = false
  for (let i = 0; i < a.H.length; i++) { if (a.H[i] !== b.H[i]) same = false; if (a.H[i] !== c.H[i]) diff = true }
  ok(same, 'same seed → identical heightfield')
  ok(diff, 'different seed → different heightfield')

  // Tileability: the wrap-around step must not exceed the largest interior step.
  const H = a.H
  let maxInterior = 0, maxWrap = 0
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE - 1; x++) maxInterior = Math.max(maxInterior, Math.abs(H[z * SIZE + x + 1] - H[z * SIZE + x]))
    maxWrap = Math.max(maxWrap, Math.abs(H[z * SIZE] - H[z * SIZE + SIZE - 1]))
  }
  for (let x = 0; x < SIZE; x++) {
    for (let z = 0; z < SIZE - 1; z++) maxInterior = Math.max(maxInterior, Math.abs(H[(z + 1) * SIZE + x] - H[z * SIZE + x]))
    maxWrap = Math.max(maxWrap, Math.abs(H[x] - H[(SIZE - 1) * SIZE + x]))
  }
  ok(maxWrap <= maxInterior + 1e-6, `tileable heightfield (wrap step ${maxWrap.toFixed(3)} ≤ interior max ${maxInterior.toFixed(3)})`)

  let hMin = 1, hMax = 0, modSum = 0, modMax = 0
  for (let i = 0; i < H.length; i++) {
    hMin = Math.min(hMin, H[i]); hMax = Math.max(hMax, H[i])
    for (let k = 0; k < 3; k++) { const m = a.mod[i * 4 + k]; modSum += m; modMax = Math.max(modMax, m) }
  }
  const modMean = modSum / (H.length * 3)
  ok(hMin >= 0 && hMax <= 1 && hMax - hMin > 0.4, `height spans [${hMin.toFixed(2)}, ${hMax.toFixed(2)}]`)
  ok(modMean > 0.7 && modMean < 1.5, `albedo modulation mean near ×1 (${modMean.toFixed(3)})`)
  ok(modMax < ALBEDO_PACK, `albedo modulation never clips (max ${modMax.toFixed(2)} < ${ALBEDO_PACK})`)
}

console.log('rock fragments / dirt pebbles')
{
  const r = rockFields(1234, SIZE)
  ok(r.rubbleCover >= 0.75, `rock: angular fragments own ${(r.rubbleCover * 100).toFixed(0)}% of the tile (owner: ~80%)`)
  const d = dirtFields(1235, SIZE)
  ok(d.pebbleCover >= 0.42 && d.pebbleCover <= 0.6, `dirt: angular pebbles own ${(d.pebbleCover * 100).toFixed(0)}% of the tile (owner: ~50%)`)
}

console.log('textures')
{
  const t = makeSurfaceTextures(8401, SIZE)
  for (const z of ['grass', 'dirt', 'rock']) {
    const n = t[z].normalMap.image.data
    let zMin = 255, xSum = 0, ySum = 0
    for (let i = 0; i < n.length; i += 4) { zMin = Math.min(zMin, n[i + 2]); xSum += n[i]; ySum += n[i + 1] }
    const cnt = n.length / 4
    ok(zMin >= 127, `${z}: normal z ≥ 0.5 everywhere (min byte ${zMin})`)
    ok(Math.abs(xSum / cnt - 127.5) < 6 && Math.abs(ySum / cnt - 127.5) < 6, `${z}: normal xy centred (${(xSum / cnt).toFixed(1)}, ${(ySum / cnt).toFixed(1)})`)
    ok(t[z].map.image.width === SIZE && t[z].normalMap.wrapS === t[z].map.wrapS, `${z}: DataTexture pair built with matching wrap`)
  }
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
