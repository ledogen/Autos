// test/taper-band-census.mjs — how tight are the taper bands the merge ladder builds?
//
// A merge hands the loser's vertices to the winner (`cededSpans` — real road, the winner's own
// geometry) and then needs a TAPER BAND to get the loser back onto its own line at the wye. The
// band is a retrofit: it exists only because the two runs were routed independently and merged
// afterwards. Its corner radius is the quality cost of doing it post-hoc, and it is the metric any
// change to how junctions are formed has to be scored on — FEAT-76's junction-leg re-scope,
// BUG-56 B5's band ladder, and the R1-R8 wye work all move this number.
//
// Band vertices = `offCurveSpans` minus `cededSpans`. Radius is Menger curvature over consecutive
// registered polyline vertices (4 m spacing), so it measures the SHIPPED geometry, not the planner's
// intent. Open-road vertices (neither ceded nor off-curve) are the control.
//
// Rainy-day script, not a gate. USAGE: node test/taper-band-census.mjs [seeds] [radius]
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const SEEDS = (process.argv[2] || '6,20,11,7,3').split(',').map(Number)
const RADIUS = Number(process.argv[3] || 1400)
const RMIN = RANGER_PARAMS.roadMinTurnRadius ?? 12

const radAt = (p0, p1, p2) => {
  const a = Math.hypot(p1.x - p0.x, p1.z - p0.z), b = Math.hypot(p2.x - p1.x, p2.z - p1.z)
  const c = Math.hypot(p2.x - p0.x, p2.z - p0.z)
  const area2 = Math.abs((p1.x - p0.x) * (p2.z - p0.z) - (p2.x - p0.x) * (p1.z - p0.z))
  return area2 < 1e-9 ? Infinity : (a * b * c) / (2 * area2)
}
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1)

const bandR = [], openR = [], perBand = []
let nCeded = 0
for (const seed of SEEDS) {
  const road = new RoadSystem(seed, RANGER_PARAMS)
  road.setRadius(RADIUS)
  road.update(new THREE.Vector3(0, 0, 0))
  for (const [, e] of road._network) {
    const off = e.offCurveSpans || [], ced = e.cededSpans || []
    if (!off.length) continue
    const cum = e.polyCum, p = e.points
    const inSpan = (s, spans) => spans.some((x) => s >= x.s0 - 1e-6 && s <= x.s1 + 1e-6)
    let worst = Infinity
    for (let i = 1; i < p.length - 1; i++) {
      const r = radAt(p[i - 1], p[i], p[i + 1])
      if (!isFinite(r)) continue
      const s = cum[i]
      if (!inSpan(s, off)) { openR.push(r); continue }
      if (inSpan(s, ced)) { nCeded++; continue }   // the winner's own vertices: real road, not a band
      bandR.push(r)
      if (r < worst) worst = r
    }
    if (isFinite(worst)) perBand.push(worst)
  }
}

console.log(`seeds ${SEEDS.join(',')} @ radius ${RADIUS} · ${perBand.length} taper bands · ${bandR.length} band vertices · ${nCeded} ceded (the winner's own) · ${openR.length} open-road vertices`)
console.log(`roadMinTurnRadius (the road's own contract) = ${RMIN} m\n`)
console.log(`                     min      1%      5%   median      mean`)
const row = (n, a) => console.log(`${n.padEnd(18)} ${Math.min(...a).toFixed(1).padStart(6)} ${pct(a, 0.01).toFixed(1).padStart(7)} ${pct(a, 0.05).toFixed(1).padStart(7)} ${pct(a, 0.5).toFixed(1).padStart(8)} ${mean(a).toFixed(1).padStart(9)}`)
row('taper band', bandR); row('open road', openR)
const open1 = pct(openR, 0.01)
console.log(`\nper-band TIGHTEST corner: min ${Math.min(...perBand).toFixed(1)} m · median ${pct(perBand, 0.5).toFixed(1)} m · p90 ${pct(perBand, 0.9).toFixed(1)} m`)
console.log(`   ${perBand.filter((r) => r < RMIN).length} of ${perBand.length} bands tighter than roadMinTurnRadius (${RMIN} m) — a band is road, it may not be tighter than road`)
console.log(`   ${perBand.filter((r) => r < open1).length} of ${perBand.length} bands tighter than open road's 1st percentile (${open1.toFixed(1)} m)`)
