// test/ride-probe.mjs — FEAT-81 rainy-day probe (NOT a gate): ride quality at PAR speed.
//
// Owner 2026-09-08: "tiny wobbles and bumps in the road that can launch the car and crests that fall
// away quickly enough for the car to become airborne". Earlier tuning (vSmoothM, ranger.js) measured
// vertical jolt at a FIXED 20 m/s. This probe walks every streamed run at the speed the par oracle
// says the road allows there (curvature envelope + accel/brake passes, PAR_REF), so a crest is judged
// against the speed a committed driver actually carries into it — the owner's ruling: "use the run
// solver to determine the allowable speed for the corners in that area and set crest rate off that".
//
// Two scales, two complaints:
//   CREST  (5 m baseline): vertical curvature κv, lift = v²·κv/g. lift ≥ 1 is airborne at par speed.
//   WOBBLE (1 m baseline): |Δ²y| in mm — station corners, grid quanta, carve ripple.
//
// usage: node test/ride-probe.mjs <seed> [<seed> ...] [--top=10] [--over=1.25]
//   --over  also report lift at over × par speed (the owner drives above par).

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { parseWorldSeed, seedFor } from '../src/seed.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { computePar } from '../src/par.js'

const CS = 64, G = 9.81
const args = process.argv.slice(2)
const seeds = args.filter(a => !a.startsWith('--'))
const opt = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d }
const TOP = opt('top', 10), OVER = opt('over', 1.25)
if (!seeds.length) { console.error('usage: node test/ride-probe.mjs <seed> ...'); process.exit(2) }

function streamSpawnRegion (seedStr) {
  const ws = parseWorldSeed(seedStr)
  const road = new RoadSystem(ws, P)
  const ss = seedFor(ws, 'spawn')
  const bx = ((ss & 0xFFFF) / 0xFFFF - 0.5) * 200
  const bz = (((ss >>> 16) & 0xFFFF) / 0xFFFF - 0.5) * 200
  road.ensureTile(Math.floor(bx / CS), Math.floor(bz / CS))
  let n = road.queryNearest(bx, bz, 200)
  if (n) {
    road.ensureTile(Math.floor(n.point.x / CS), Math.floor(n.point.z / CS))
    n = road.queryNearest(n.point.x, n.point.z, 100) || n
    road.update(new THREE.Vector3(n.point.x, 0, n.point.z))
  }
  return road
}

// Same sampler shape road.js hands par (its _pointSampler is module-private).
function pointSampler (points, arc) {
  const n = arc.length
  const at = (s) => {
    if (s <= arc[0]) return { x: points[0].x, z: points[0].z }
    if (s >= arc[n - 1]) return { x: points[n - 1].x, z: points[n - 1].z }
    let lo = 0, hi = n - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arc[mid] <= s) lo = mid; else hi = mid }
    const span = arc[hi] - arc[lo], t = span > 1e-9 ? (s - arc[lo]) / span : 0
    return { x: points[lo].x + (points[hi].x - points[lo].x) * t, z: points[lo].z + (points[hi].z - points[lo].z) * t }
  }
  const tangentAt = (s) => {
    const a = at(Math.max(arc[0], s - 2)), b = at(Math.min(arc[n - 1], s + 2))
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz)
    return l > 1e-9 ? { x: dx / l, z: dz / l } : { x: 1, z: 0 }
  }
  return {
    length: arc[n - 1], pointAt: at, tangentAt,
    curvatureAt (s) {
      const h = 3
      const t0 = tangentAt(Math.max(arc[0] + h, s - h)), t1 = tangentAt(Math.min(arc[n - 1] - h, s + h))
      const cross = t0.x * t1.z - t0.z * t1.x
      const dot = Math.max(-1, Math.min(1, t0.x * t1.x + t0.z * t1.z))
      return Math.atan2(cross, dot) / (2 * h)
    },
  }
}

const pct = (arr, p) => { if (!arr.length) return 0; const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(p * a.length))] }

const all = { m: 0, lift: [], liftOver: [], wob: [], worst: [], crestR: [] }
for (const seedStr of seeds) {
  const road = streamSpawnRegion(seedStr)
  const S = { m: 0, air: 0, light: 0, airOver: 0, wob10: 0, wob25: 0, runs: 0 }
  for (const [runKey, { points, polyCum }] of road._network) {
    if (!polyCum || points.length < 4) continue
    const L = polyCum[points.length - 1]
    if (L < 30) continue
    S.runs++
    const cl = pointSampler(points, polyCum)
    const y = (s) => road.runProfile(Math.max(0, Math.min(L, s)), runKey).gradeY
    const par = computePar([{ centerline: cl, gradeAt: y, s0: 0, s1: L }])
    const nS = par.speeds.length
    const vAt = (s) => par.speeds[Math.max(0, Math.min(nS - 1, Math.round(s / L * (nS - 1))))]
    for (let s = 6; s <= L - 6; s += 1) {
      const y0 = y(s)
      const k5 = (y(s + 5) - 2 * y0 + y(s - 5)) / 25          // 1/m, + = sag, − = crest
      const w1 = Math.abs(y(s + 1) - 2 * y0 + y(s - 1)) * 1000  // mm
      const v = vAt(s)
      const lift = -v * v * k5 / G, liftOver = -(OVER * v) * (OVER * v) * k5 / G
      S.m++; all.m++
      all.lift.push(lift); all.liftOver.push(liftOver); all.wob.push(w1)
      if (lift >= 1) S.air++
      if (lift >= 0.5) S.light++
      if (liftOver >= 1) S.airOver++
      if (w1 >= 10) S.wob10++
      if (w1 >= 25) S.wob25++
      if (k5 < -1e-6) all.crestR.push(-1 / k5)
      if (lift > 0.3) {
        const p = cl.pointAt(s)
        // dEnd: distance to the nearer run end (junction blend reach is ≥ 30 m); blendΔ: shipped −
        // solved deck (points[].y lerp) — non-zero means the junction blend, not the solver, made it.
        const so = (q) => { let lo = 0, hi = points.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (polyCum[m] <= q) lo = m; else hi = m }; const t = (q - polyCum[lo]) / Math.max(1e-9, polyCum[hi] - polyCum[lo]); return points[lo].y + (points[hi].y - points[lo].y) * t }
        all.worst.push({ seed: seedStr, runKey, s: Math.round(s), dEnd: Math.round(Math.min(s, L - s)), blendD: (y0 - so(s)).toFixed(2), x: Math.round(p.x), z: Math.round(p.z), v: v.toFixed(1), R: Math.round(-1 / k5), lift: lift.toFixed(2), w1: w1.toFixed(0) })
      }
    }
  }
  console.log(`seed ${seedStr}: ${S.runs} runs · ${(S.m / 1000).toFixed(1)} km · at par: light(≥0.5 g) ${(100 * S.light / S.m).toFixed(1)} % · AIRBORNE(≥1 g) ${(100 * S.air / S.m).toFixed(2) } % (${S.air} m) · at ${OVER}× par airborne ${(100 * S.airOver / S.m).toFixed(2)} % (${S.airOver} m) · wobble ≥10 mm ${S.wob10}/km-ish (${(1000 * S.wob10 / S.m).toFixed(1)} per km) · ≥25 mm ${(1000 * S.wob25 / S.m).toFixed(1)} per km`)
}
console.log(`\nALL (${(all.m / 1000).toFixed(1)} km): lift at par p50 ${pct(all.lift, 0.5).toFixed(3)} · p99 ${pct(all.lift, 0.99).toFixed(2)} · p99.9 ${pct(all.lift, 0.999).toFixed(2)} · max ${Math.max(...all.lift).toFixed(2)} g`)
console.log(`   lift at ${OVER}× par: p99 ${pct(all.liftOver, 0.99).toFixed(2)} · p99.9 ${pct(all.liftOver, 0.999).toFixed(2)} · max ${Math.max(...all.liftOver).toFixed(2)} g`)
console.log(`   crest radius (5 m baseline) p1 ${pct(all.crestR, 0.01).toFixed(0)} · p5 ${pct(all.crestR, 0.05).toFixed(0)} · p25 ${pct(all.crestR, 0.25).toFixed(0)} · median ${pct(all.crestR, 0.5).toFixed(0)} m`)
console.log(`   wobble |Δ²y| at 1 m: p50 ${pct(all.wob, 0.5).toFixed(1)} · p90 ${pct(all.wob, 0.9).toFixed(1)} · p99 ${pct(all.wob, 0.99).toFixed(1)} · max ${Math.max(...all.wob).toFixed(0)} mm`)
// Worst sites, de-duplicated to one row per 30 m of run.
all.worst.sort((a, b) => b.lift - a.lift)
const seen = new Map(), rows = []
for (const w of all.worst) {
  const k = `${w.seed}|${w.runKey}`
  const list = seen.get(k) || []
  if (list.some(s => Math.abs(s - w.s) < 30)) continue
  list.push(w.s); seen.set(k, list); rows.push(w)
  if (rows.length >= TOP) break
}
console.log(`\nworst ${rows.length} crests at par speed (lift in g; R = vertical radius):`)
console.table(rows)
