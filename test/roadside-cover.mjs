// test/roadside-cover.mjs — FEAT-85 gate: roadside cover (grass tufts + woody brush).
//
// Headless, synthetic road (a straight run along +Z at mid-chunk), analytic samplers. Asserts:
//   1. clump geometry — opaque non-indexed flat-shaded meshes, finite, `aSway` spans 0 (root) → ~1 (tip)
//   2. the WALL stands only in the beat-back band: every cover clump is ≥ halfWidth + beatBackMin
//      off the centreline (never on the pavement or in the mown verge), the band is populated on
//      BOTH sides, and every placement lands inside its own chunk (the 3×3 walk hands the edges
//      to the chunk they land in)
//   3. nothing stands beside a bore span or on a pad
//   4. deterministic, and INVARIANT to the order the road slices arrive in (every per-candidate
//      draw is keyed by world position, not by iteration order)
//   5. additive — a sampler set without the FEAT-85 samplers yields byte-identical pre-existing
//      placements and no cover; rock yields none, dirt yields a sparser grass/sage-only cover
//
// Run: node test/roadside-cover.mjs   (exit 0 = pass)

import { makeGrassClump, makeRyeClump, makeSageClump } from '../src/props/prop-geometry.js'
import { scatterChunk } from '../src/props/prop-scatter.js'
import { FLORA_PARAMS } from '../data/flora.js'
import { mulberry32 } from '../src/seed.js'

let fails = 0
const ok = (cond, msg) => { if (!cond) { console.error('  ✗', msg); fails++ } else console.log('  ✓', msg) }

const P = FLORA_PARAMS, S = P.scatter, C = S.cover
const HALF = S.roadHalfWidth, BB0 = C.wallBeatBack[0], BB1 = C.wallBeatBack[1]
const SIZE = P.chunkSize
const isCover = (p) => p.cat === 'grass' || p.cat === 'rye' || p.cat === 'sage'
const isTall = (p) => p.cat === 'rye' || p.cat === 'sage'

console.log('1. clump geometry')
for (const [name, fn, cfg] of [['grass', makeGrassClump, P.grass], ['rye', makeRyeClump, P.rye], ['sage', makeSageClump, P.sage]]) {
  const geo = fn(cfg, mulberry32(7))
  const pos = geo.attributes.position.array, sway = geo.attributes.aSway.array
  let finite = true, sMin = 1, sMax = 0, yMax = 0
  for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) finite = false
  for (let i = 0; i < sway.length; i++) { sMin = Math.min(sMin, sway[i]); sMax = Math.max(sMax, sway[i]) }
  for (let i = 1; i < pos.length; i += 3) yMax = Math.max(yMax, pos[i])
  const tris = pos.length / 9
  ok(geo.index === null && geo.attributes.normal && geo.attributes.color, `${name}: non-indexed, normals + colours baked`)
  ok(finite, `${name}: all vertices finite`)
  ok(sMin === 0 && sMax > (name === 'sage' ? 0.25 : 0.5) && sMax <= 1.0001, `${name}: aSway spans root 0 → tip ${sMax.toFixed(2)} (sage sways least by design)`)
  ok(yMax >= cfg.height[0] * 0.7 && yMax <= cfg.height[1] * 1.3, `${name}: height ${yMax.toFixed(2)} m within [${cfg.height}] (+ seed heads)`)
  ok(tris >= 20 && tris <= 130, `${name}: ${tris} tris (budgeted small-scatter)`)
}

// ── synthetic world: flat-ish green ground, a straight road along +Z at x = RX (mid-chunk, so
//    both verges belong to the chunk under test) ────────────────────────────────────────────
const RX = SIZE / 2
const makeSamplers = (opts = {}) => {
  const bore = opts.bore || (() => false)
  const walk = (cx, cz, step) => {
    const runs = []
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (cx + dx !== 0) continue   // the road lives in tile column 0
      const z0 = (cz + dz) * SIZE, n = Math.ceil(SIZE / step)
      const samples = []
      for (let i = 0; i <= n; i++) {
        const z = z0 + (SIZE * i) / n
        samples.push({ x: RX, z, tx: 0, tz: 1, arcS: z + 5000, bore: bore(z) })
      }
      runs.push({ runKey: 'run-A', samples })
    }
    return opts.reorder ? opts.reorder(runs) : runs
  }
  return {
    heightAt: (x, z) => 30 + 2 * Math.sin(x * 0.03) * Math.cos(z * 0.02),
    normalAt: () => ({ x: 0, y: 0.995, z: 0 }),
    roadBlocked: (x) => Math.abs(x - RX) < S.roadExclusion,
    roadClear: (x, z, keepOut) => Math.abs(x - RX) >= keepOut,
    roadDist: (x) => Math.abs(x - RX),
    ...(opts.noCover ? {} : {
      roadWalk: walk,
      groundAt: opts.groundAt || (() => ({ green: 1, rock: 0 })),
      padBlocked: opts.padBlocked || (() => false),
    }),
  }
}

console.log('2. the wall stands in the beat-back band, both sides, inside its own chunk')
{
  const A = scatterChunk(0, 3, 606, makeSamplers())
  const cover = A.filter(isCover)
  ok(cover.length > 100, `cover present beside the road (${cover.length} clumps)`)
  const inner = cover.every(p => Math.abs(p.x - RX) >= HALF + BB0 - 1e-6)
  ok(inner, `every clump ≥ ${HALF + BB0} m off the centreline (pavement + minimum beat-back clear)`)
  const bandMax = HALF + BB1 + C.wallDepth
  const left = cover.filter(p => p.x < RX && RX - p.x <= bandMax).length
  const right = cover.filter(p => p.x > RX && p.x - RX <= bandMax).length
  ok(left > 30 && right > 30, `wall populated on both sides (L ${left} / R ${right} in the ≤ ${bandMax.toFixed(1)} m band)`)
  const owned = cover.every(p => Math.floor(p.x / SIZE) === 0 && Math.floor(p.z / SIZE) === 3)
  ok(owned, 'every placement lands inside its own chunk')
  const wallGrass = cover.filter(p => Math.abs(p.x - RX) <= bandMax && p.cat === 'grass').length
  const wallTall = cover.filter(p => Math.abs(p.x - RX) <= bandMax && isTall(p)).length
  ok(wallGrass > 0 && wallTall > 0, `wall mixes ricegrass (${wallGrass}) with rye/sage (${wallTall})`)
  // the inner face must WANDER: the nearest clump per 8 m stretch should vary along the road
  const nearest = []
  for (let z0 = 3 * SIZE; z0 < 4 * SIZE; z0 += 8) {
    const stretch = cover.filter(p => p.x > RX && p.z >= z0 && p.z < z0 + 8)
    if (stretch.length) nearest.push(Math.min(...stretch.map(p => p.x - RX)))
  }
  const spread = Math.max(...nearest) - Math.min(...nearest)
  ok(spread > 0.75, `inner face wanders along the road (spread ${spread.toFixed(2)} m over 8 m stretches)`)
}

console.log('3. bores and pads stay bare')
{
  const B = scatterChunk(0, 3, 606, makeSamplers({ bore: (z) => z >= 3 * SIZE + 16 && z <= 3 * SIZE + 40 }))
  const bandMax = HALF + BB1 + C.wallDepth
  // (a half-step along-road jitter can carry a clump just past the flagged sample; the real
  //  walk flags 8 m beyond the span, so test the span interior)
  //  Only the wall's exclusive zone (< halfWidth + beatBackMax) is tested: backcountry clumps may
  //  stand from halfWidth + beatBackMax outward whether or not there is a bore.
  const inBore = B.filter(isCover).filter(p => Math.abs(p.x - RX) < HALF + BB1 && p.z >= 3 * SIZE + 17 && p.z <= 3 * SIZE + 39)
  ok(inBore.length === 0, `no wall clumps beside a bore span (${inBore.length})`)
  const padX = RX + 8.5, padZ = 3 * SIZE + 50, padR = 6
  const Pd = scatterChunk(0, 3, 606, makeSamplers({ padBlocked: (x, z, k) => Math.hypot(x - padX, z - padZ) <= padR + k }))
  const onPad = Pd.filter(isCover).filter(p => Math.hypot(p.x - padX, p.z - padZ) <= padR)
  ok(onPad.length === 0, `no clumps on a pad disc (${onPad.length})`)
}

console.log('4. determinism + slice-order invariance')
{
  const key = (p) => `${p.cat}#${p.variant}@${p.x.toFixed(4)},${p.z.toFixed(4)},${p.y.toFixed(4)},${p.scale.toFixed(4)},${p.rotY.toFixed(4)}`
  const A = scatterChunk(0, 3, 606, makeSamplers()).filter(isCover).map(key).sort()
  const B = scatterChunk(0, 3, 606, makeSamplers()).filter(isCover).map(key).sort()
  ok(A.length === B.length && A.every((k, i) => k === B[i]), 'chunk scattered twice → identical cover')
  const R = scatterChunk(0, 3, 606, makeSamplers({
    reorder: (runs) => runs.reverse().map(r => ({ ...r, samples: [...r.samples].reverse() })),
  })).filter(isCover).map(key).sort()
  ok(A.length === R.length && A.every((k, i) => k === R[i]), 'road slices in reverse order → identical cover set (position-keyed draws)')
}

console.log('5. additive; green-gated')
{
  const full = scatterChunk(0, 3, 606, makeSamplers())
  const legacy = scatterChunk(0, 3, 606, makeSamplers({ noCover: true }))
  ok(!legacy.some(isCover), 'sampler set without FEAT-85 samplers → no cover')
  // The FEAT-85 sampler set also switches on the zone-rock pass (groundAt-gated, 2026-09-23),
  // which is additive the same way: the legacy scatter must be a byte-identical PREFIX of the
  // full non-cover list, and everything appended after it must be rock.
  const base = full.filter(p => !isCover(p))
  let same = base.length >= legacy.length
  for (let i = 0; same && i < legacy.length; i++) {
    const u = base[i], w = legacy[i]
    if (u.cat !== w.cat || u.variant !== w.variant || u.x !== w.x || u.z !== w.z || u.y !== w.y || u.rotY !== w.rotY) same = false
  }
  ok(same, 'pre-existing placements byte-identical with the cover pass on (purely additive)')
  const appended = base.slice(legacy.length)
  ok(appended.every(p => p.cat === 'smallRock' || p.cat === 'medRock' || p.cat === 'rock'),
    `only zone rocks appended after the legacy passes (${appended.length}: ${['smallRock','medRock','rock'].map(c => c + ' ' + appended.filter(p => p.cat === c).length).join(', ')})`)
  const rock = scatterChunk(0, 3, 606, makeSamplers({ groundAt: () => ({ green: 0, rock: 1 }) }))
  ok(!rock.some(isCover), 'all rock → no cover')
  const dirt = scatterChunk(0, 3, 606, makeSamplers({ groundAt: () => ({ green: 0, rock: 0 }) })).filter(isCover)
  const greenN = full.filter(isCover).length
  ok(dirt.length > 0 && dirt.length < greenN * 0.5, `all dirt → sparser cover (${dirt.length} vs ${greenN} on green)`)
  ok(!dirt.some(p => p.cat === 'rye'), 'wild rye never stands on dirt')
}

console.log('6. riverbanks: clumps stand in the stream bank, never in the channel, no green gate')
{
  // A stream along z = 3.5 chunks: channel |dz| ≤ 3 m, bank 3–9 m. Ground reads dirt everywhere.
  const ZS = 3.5 * SIZE
  const streamAt = (x, z) => { const d = Math.abs(z - ZS); return d <= 3 ? { inChannel: true, inBank: false } : d <= 9 ? { inChannel: false, inBank: true } : { inChannel: false, inBank: false } }
  const s = makeSamplers({ groundAt: () => ({ green: 0, rock: 0 }) })
  const withBank = scatterChunk(0, 3, 606, { ...s, streamAt }).filter(isCover)
  const bank = withBank.filter(p => Math.abs(p.z - ZS) > 3 && Math.abs(p.z - ZS) <= 9)
  const chan = withBank.filter(p => Math.abs(p.z - ZS) <= 3)
  ok(bank.length > 40, `bank populated on dirt ground (${bank.length} clumps in the 3–9 m band)`)
  ok(chan.length === 0, `nothing stands in the channel (${chan.length})`)
  ok(bank.some(p => p.cat === 'rye'), 'wild rye stands on the bank (moisture) even though the ground is dirt')
  // The same band without a stream still gets wall + backcountry clumps (dirt at dirtFrac); the
  // bank pass must add on top of that, clearly.
  const dry = scatterChunk(0, 3, 606, { ...s, streamAt: () => ({ inChannel: false, inBank: false }) }).filter(isCover)
  const dryBand = dry.filter(p => Math.abs(p.z - ZS) > 3 && Math.abs(p.z - ZS) <= 9).length
  ok(bank.length > dryBand * 1.5, `the bank pass adds on top of the dry scatter (${bank.length} vs ${dryBand} in the band)`)
}

console.log(fails ? `\nROADSIDE-COVER GATE: ${fails} FAILED` : '\nROADSIDE-COVER GATE: PASS')
process.exit(fails ? 1 : 0)
