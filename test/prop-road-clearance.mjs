// test/prop-road-clearance.mjs — BUG-23 gate: no hard-collidable prop overhangs the driveable lane.
//
// The scatter road-exclusion must keep a collidable prop's WHOLE BODY (centre + overhang) off the
// road, inflating the keep-out by the prop's bounding radius — a big rock/boulder whose centre sits
// just off the ribbon used to wall off the lane (BUG-23). This gate scatters a band of chunks across
// a synthetic road over a sweep of seeds and asserts, for every collidable (rock/boulder) placement,
// that its VISIBLE horizontal extent clears the driveable surface. Plus two guards:
//   • teeth   — the same sweep with a LEGACY fixed-radius mask DOES produce an overhang (the gate can
//               actually detect the bug it protects against).
//   • density — collidable counts in chunks far from the road are UNCHANGED vs no road at all (the
//               inflated mask doesn't thin props away from roads).
//
// Run: node test/prop-road-clearance.mjs   (exit 0 = pass)

import { buildPalette } from '../src/props/prop-palette.js'
import { scatterChunk } from '../src/props/prop-scatter.js'
import { FLORA_PARAMS } from '../data/flora.js'

let fails = 0
const ok = (cond, msg) => { if (!cond) { console.error('  ✗', msg); fails++ } else console.log('  ✓', msg) }

const P = FLORA_PARAMS
const ROAD_HALF = P.scatter.roadHalfWidth          // driveable half-width (m)
const FOOTPRINT_HALF = ROAD_HALF + 2.5             // + a nominal shoulder (matches road footprint)

// ── synthetic road: a gentle S-curve polyline through the scatter band ───────────────────────────
const roadPts = []
for (let s = -400; s <= 400; s += 4) roadPts.push({ x: 40 * Math.sin(s * 0.012), z: s })
const distToRoad = (x, z) => {
  let best = Infinity
  for (let i = 1; i < roadPts.length; i++) {
    const a = roadPts[i - 1], b = roadPts[i]
    const ex = b.x - a.x, ez = b.z - a.z
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez || 1e-9)))
    const px = a.x + ex * t, pz = a.z + ez * t
    const d = Math.hypot(x - px, z - pz)
    if (d < best) best = d
  }
  return best
}

const baseSamplers = (roadClear) => ({
  heightAt: (x, z) => 20 + 5 * Math.sin(x * 0.01) * Math.cos(z * 0.013),
  normalAt: () => ({ x: 0, y: 0.99, z: 0 }),
  roadBlocked: (x, z) => distToRoad(x, z) < P.scatter.roadExclusion,
  roadDist: (x, z) => { const d = distToRoad(x, z); return d < 25 ? d : Infinity },
  roadClear,
})
// Real (radius-aware) keep-out and a legacy fixed-radius keep-out (the pre-fix behaviour).
const realSamplers   = baseSamplers((x, z, keepOut) => distToRoad(x, z) >= keepOut)
const legacySamplers = baseSamplers((x, z) => distToRoad(x, z) >= P.scatter.roadExclusion)

// ── per-(cat,variant) VISIBLE horizontal radius, from the baked geometry (worst overhang) ─────────
const { variants } = buildPalette(1234, P)
const visHRadius = {}   // "cat#v" -> max horizontal vertex distance (unit instance scale)
for (const cat of ['rock', 'boulder']) {
  variants[cat].forEach((entry, v) => {
    const pos = entry.geo.attributes.position
    let maxHr = 0
    for (let i = 0; i < pos.count; i++) maxHr = Math.max(maxHr, Math.hypot(pos.getX(i), pos.getZ(i)))
    visHRadius[cat + '#' + v] = maxHr
  })
}
const isCollidable = (cat) => cat === 'rock' || cat === 'boulder'
const worldVisR = (pl) => visHRadius[pl.cat + '#' + pl.variant] * pl.scale

// Chunks spanning the road band (road runs along x≈0). chunkSize 64 → cols −2..2 cross the road.
const COLS = [-2, -1, 0, 1, 2]
const ROWS = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]
const SEEDS = [1, 2, 3, 7, 11, 19, 42, 99, 123, 777, 1009, 2024]

console.log('1. no collidable prop overhangs the driveable lane (real radius-aware mask)')
{
  let worstClear = Infinity, checked = 0, collidables = 0
  for (const seed of SEEDS) {
    for (const cx of COLS) for (const cz of ROWS) {
      for (const pl of scatterChunk(cx, cz, seed, realSamplers, P)) {
        if (!isCollidable(pl.cat)) continue
        collidables++
        const clear = distToRoad(pl.x, pl.z) - worldVisR(pl)   // gap from prop edge to centreline
        worstClear = Math.min(worstClear, clear)
        checked++
      }
    }
  }
  ok(collidables > 50, `swept enough collidables across the road band (${collidables})`)
  // No part of any collidable reaches the driveable surface (clear margin beyond ROAD_HALF).
  ok(worstClear >= ROAD_HALF, `worst prop-edge→centreline gap ${worstClear.toFixed(2)} m ≥ roadHalf ${ROAD_HALF} m`)
  ok(worstClear >= FOOTPRINT_HALF, `…and clears the shoulder/footprint (${FOOTPRINT_HALF} m) too`)
}

console.log('2. teeth: the legacy fixed-radius mask DOES let a collidable overhang the carved road')
{
  let footprintOverhang = false, laneOverhang = false, worstLegacy = Infinity
  for (const seed of SEEDS) {
    for (const cx of COLS) for (const cz of ROWS) {
      for (const pl of scatterChunk(cx, cz, seed, legacySamplers, P)) {
        if (!isCollidable(pl.cat)) continue
        const clear = distToRoad(pl.x, pl.z) - worldVisR(pl)
        worstLegacy = Math.min(worstLegacy, clear)
        if (clear < FOOTPRINT_HALF) footprintOverhang = true
        if (clear < ROAD_HALF) laneOverhang = true
      }
    }
  }
  // The legacy fixed keep-out lets a prop's body reach onto the carved road footprint (= the bug the
  // inflated mask fixes). Worst gap printed; a sub-lane overhang (rarer, needs a boulder) noted too.
  ok(footprintOverhang, `legacy mask overhangs the carved road footprint (worst gap ${worstLegacy.toFixed(2)} m < ${FOOTPRINT_HALF} m) — gate has teeth`)
  console.log(`    (legacy sub-lane overhang seen: ${laneOverhang})`)
}

console.log('3. density: collidables far from the road are NOT thinned by the inflated mask')
{
  // Chunks well away from the road (x ≥ ~190 m): real mask must yield the SAME collidables as no road.
  const noRoad = baseSamplers(() => true)
  const farCols = [3, 4, 5]
  let same = true, total = 0
  for (const seed of SEEDS) {
    for (const cx of farCols) for (const cz of ROWS) {
      const a = scatterChunk(cx, cz, seed, realSamplers, P).filter((p) => isCollidable(p.cat))
      const b = scatterChunk(cx, cz, seed, noRoad, P).filter((p) => isCollidable(p.cat))
      total += b.length
      if (a.length !== b.length) same = false
    }
  }
  ok(total > 0 && same, `far-from-road collidable counts identical with/without road (${total} sampled)`)
}

console.log(fails === 0 ? '\nPROP-ROAD-CLEARANCE GATE: PASS' : `\nPROP-ROAD-CLEARANCE GATE: FAIL (${fails})`)
process.exit(fails === 0 ? 0 : 1)
