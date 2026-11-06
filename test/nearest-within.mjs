// test/nearest-within.mjs — PERF-31: _nearestWithinXZ is EXACT. It may skip the full nearest-point scan
// only when it has PROVEN no point of the polyline lies within the bar; otherwise it must hand back
// _nearestOnPolyXZ's own hit. Random polylines (4 m and ragged spacing, zero-length segments, sliced
// polyCum offsets) and query points scattered near and far, plus points placed a hair either side of
// the bar. Pure math, no worldgen.
import { _nearestOnPolyXZ, _nearestWithinXZ } from '../src/road.js'

let seed = 0x9e3779b9
const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

const poly = () => {
  const n = 2 + Math.floor(rnd() * 300), pts = [{ x: (rnd() - 0.5) * 4000, y: 0, z: (rnd() - 0.5) * 4000 }]
  let hdg = rnd() * 2 * Math.PI
  for (let i = 1; i < n; i++) {
    const ds = rnd() < 0.05 ? 0 : (rnd() < 0.5 ? 4 : rnd() * 30)   // zero-length, survey, ragged
    hdg += (rnd() - 0.5) * (rnd() < 0.1 ? 2.5 : 0.3)
    const p = pts[i - 1]
    pts.push({ x: p.x + ds * Math.cos(hdg), y: rnd() * 5, z: p.z + ds * Math.sin(hdg) })
  }
  const off = rnd() < 0.3 ? rnd() * 900 : 0   // a slice's polyCum: T.polyCum[i0 + i] - p0
  const polyCum = new Float64Array(n)
  polyCum[0] = off
  for (let i = 1; i < n; i++) polyCum[i] = polyCum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
  if (off) for (let i = n - 1; i >= 0; i--) polyCum[i] -= off
  return { pts, polyCum }
}

let checks = 0, skipped = 0, bad = 0
for (let k = 0; k < 1500; k++) {
  const { pts, polyCum } = poly()
  for (let q = 0; q < 40; q++) {
    const bar = [5, 12, 18, 31, 60][Math.floor(rnd() * 5)]
    let px, pz
    if (q % 3 === 0) {   // a hair either side of the bar from a random segment's foot
      const i = 1 + Math.floor(rnd() * (pts.length - 1)), a = pts[i - 1], b = pts[i], t = rnd()
      const ex = b.x - a.x, ez = b.z - a.z, l = Math.hypot(ex, ez) || 1
      const side = bar + (rnd() - 0.5) * 2e-6 * (rnd() < 0.5 ? 1 : 1e6)
      px = a.x + t * ex - (ez / l) * side; pz = a.z + t * ez + (ex / l) * side
    } else { const a = pts[Math.floor(rnd() * pts.length)]; px = a.x + (rnd() - 0.5) * 1200; pz = a.z + (rnd() - 0.5) * 1200 }
    const full = _nearestOnPolyXZ(px, pz, pts, polyCum)
    const w = _nearestWithinXZ(px, pz, pts, polyCum, bar)
    checks++
    if (w === null) { skipped++; if (!(full.d > bar)) { bad++; if (bad < 5) console.log(`  false apart: d ${full.d} bar ${bar}`) } }
    else if (JSON.stringify(w) !== JSON.stringify(full)) { bad++; if (bad < 5) console.log('  hit differs', w, full) }
  }
}
const ok = bad === 0 && skipped > checks * 0.3
console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} _nearestWithinXZ == _nearestOnPolyXZ or proven apart\n        ${checks} queries · ${skipped} proven apart · ${bad} wrong`)
process.exit(ok ? 0 : 1)
