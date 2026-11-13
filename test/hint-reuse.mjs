// test/hint-reuse.mjs — PERF-43 gate: a wheel's surface PATCH (road.surfacePatch, built once at its hub) gives every
// tread and normal sample within PATCH_R the height a fresh evaluation there gives — and the patch is actually in
// force where wheels drive.
//
// The tread solve (src/tire-contact.js) samples ~65 heights per wheel per step. PERF-43 works out the road context once
// per wheel per step (the patch) and leaves every sample only its local maths. This proves the patch exact, layer by
// layer — each family of hubs below sits where one layer of the carve stack (road.js _sampleCarveWorld) decides:
//   run         every run, every 2.7 m of arc, at laterals −22…22 m (deck, edge, shoulder, bank, toe, beyond)
//   junction    round every ringed node: inside the pad, the rim hold, the ramp, the inter-leg gore (r 0…ring + 14 m)
//   connector   along every deg-2 kink connector at laterals 0…16 m both sides (its core, shoulder and toe)
//   band        along every BUG-53 departure band at the run laterals (band frames are no line or arc: PERF-42's 48 mm)
//   bore        along every bore span, the query IN the tube and on the hill over it (FEAT-40 ownership, the notch)
//   poi         round synthetic lay-by pads beside the road (FEAT-46; none are set in free roam, so the gate sets some)
// (The FEAT-18 stream carve is applied per sample outside the road stack, analyticHeight; the patch never holds it.)
//   points  6 per hub within PATCH_R = 1 m (the tread lies within 0.39 m, a normal's ±0.5 m differences round it)
//   check   |analyticHeight(p, patch) − analyticHeight(p, fresh)| ≤ TOL at every point, every family;
//           and the patch VALID (no sample needed a cold search) on ≥ MIN_VALID of the DRIVEN hubs (deck + 2 m, pad interiors,
//           connector cores) — non-vacuous: the patch is in force where the wheels are
// Seeds: two drawn at random (2026-11-12) and pinned — CLAUDE.md § Seeds: not "the world", a fixed sample.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const SEEDS = [1768572700, 759313244]
// m — the tread solve's own budget is 2 mm (test/tire-contact.mjs); the patch re-projects on a line or arc where a fresh
// evaluation searches the centreline numerically, which agree to < 1 µm almost everywhere and to 1–2 mm on the 0.15 m
// deck-edge lip of the tightest (12 m) arcs, where a millimetre of lateral is a millimetre of height.
const TOL = 2.5e-3
const MIN_VALID = 0.8
const PATCH_R = 1
const LATS = [-22, -17, -13, -9.5, -7, -5.6, -5.05, -4.6, -2, 0, 2, 4.6, 5.05, 5.6, 7, 9.5, 13, 17, 22]
const hw = P.roadHalfWidth ?? 5, DRIVEN_LAT = hw + 2
let fail = 0
const total = {}
for (const seed of SEEDS) {
  const road = new RoadSystem(seed, P); road.setRadius(900); road.update(new THREE.Vector3(0, 0, 0))
  const T = makeTerrainHeadless(seed, P, road)
  let s = seed >>> 0
  const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)

  // ── the hubs: [family, x, z, queryY | undefined (a wheel's own: the fresh height + r), driven]
  const hubs = []
  const along = (pt, tx, tz, lat) => [pt.x - tz * lat, pt.z + tx * lat]
  const frameAt = (pts, cum, a) => {   // a polyline's point + unit tangent at chord arc `a`
    let i = 0; while (i < pts.length - 2 && cum[i + 1] < a) i++
    const u = Math.min(1, Math.max(0, (a - cum[i]) / ((cum[i + 1] - cum[i]) || 1)))
    const tx = pts[i + 1].x - pts[i].x, tz = pts[i + 1].z - pts[i].z, l = Math.hypot(tx, tz) || 1
    return { pt: { x: pts[i].x + tx * u, z: pts[i].z + tz * u }, tx: tx / l, tz: tz / l }
  }
  for (const [rk, e] of road._network) {
    const cl = e.centerline; if (!cl) continue
    for (let a = 3, i = 0; a < cl.length - 3; a += 2.7, i++) {
      const p = cl.pointAt(a), q = cl.pointAt(Math.min(cl.length, a + 0.5)), tx = q.x - p.x, tz = q.z - p.z, l = Math.hypot(tx, tz) || 1
      const lat = LATS[i % LATS.length]
      hubs.push(['run', ...along(p, tx / l, tz / l, lat), undefined, Math.abs(lat) <= DRIVEN_LAT])
    }
    if (e.offCurveSpans && e.points && e.polyCum) for (const sp of e.offCurveSpans) {
      for (let a = sp.s0, i = 0; a <= sp.s1; a += 1.3, i++) {
        const f = frameAt(e.points, e.polyCum, a), lat = LATS[(i * 7) % LATS.length]
        hubs.push(['band', ...along(f.pt, f.tx, f.tz, lat), undefined, Math.abs(lat) <= DRIVEN_LAT])
      }
    }
    if (e.tunnelSpans && e.points && e.polyCum) for (const sp of e.tunnelSpans) {
      for (let a = sp.s0 - 12, i = 0; a <= sp.s1 + 12; a += 2.1, i++) {
        const f = frameAt(e.points, e.polyCum, a + (e.arcOrigin ?? 0)), lat = [0, -3, 4.6, -7, 9][i % 5]
        const [x, z] = along(f.pt, f.tx, f.tz, lat), gy = road.runProfile(a, rk).gradeY
        hubs.push(['bore', x, z, gy + 1, Math.abs(lat) <= DRIVEN_LAT])                         // a wheel in the tube
        hubs.push(['bore', x, z, gy + (P.tunnelBoreRadius ?? 8) + 6, false])                    // a probe on the hill over it
      }
    }
  }
  road._detectNodeJunctions()
  for (const node of road._nodeJunctions.values()) {
    if (!node.ring) continue
    const R = node.ringMaxR ?? 15
    for (const r of [0, 0.35 * R, 0.7 * R, R - 1, R + 0.5, R + 3, R + 7, R + 14]) for (let k = 0; k < 8; k++) {
      const ang = (k + rng()) * Math.PI / 4
      hubs.push(['junction', node.pos.x + Math.cos(ang) * r, node.pos.z + Math.sin(ang) * r, undefined, r <= R])
    }
  }
  const arcs = new Set(); for (const l of road._deg2ArcTiles?.values() ?? []) for (const a of l) arcs.add(a)
  for (const arc of arcs) {
    for (let a = 0.5, i = 0; a < arc.totalLen; a += 1.1, i++) {
      const f = frameAt(arc.points, arc.polyCum, a), lat = [0, 3, -4.6, 6, -8, 11, -16][i % 7]
      hubs.push(['connector', ...along(f.pt, f.tx, f.tz, lat), undefined, Math.abs(lat) <= hw])
    }
  }
  // FEAT-46 lay-by pads beside a few runs, off the shoulder (the poi.js record shape), then hubs round each.
  const pads = []
  for (const [, e] of road._network) {
    const cl = e.centerline; if (!cl || cl.length < 80 || pads.length >= 12) continue
    const a = cl.length / 2, p = cl.pointAt(a), q = cl.pointAt(a + 0.5), l = Math.hypot(q.x - p.x, q.z - p.z) || 1
    const tx = (q.x - p.x) / l, tz = (q.z - p.z) / l, side = pads.length % 2 ? 1 : -1, off = hw + 2.5 + 9
    const [x, z] = along(p, tx, tz, side * off)
    pads.push({ x, z, y: T.rawHeightWorld(x, z), tx, tz, halfLen: 12, halfWid: 7 })
  }
  road.setPoiPads(pads)
  for (const pd of pads) for (let k = 0; k < 24; k++) {
    const u = (rng() * 2 - 1) * (pd.halfLen + 6), v = (rng() * 2 - 1) * (pd.halfWid + 6)
    hubs.push(['poi', pd.x + pd.tx * u - pd.tz * v, pd.z + pd.tz * u + pd.tx * v, undefined, Math.abs(u) <= pd.halfLen && Math.abs(v) <= pd.halfWid])
  }

  // ── the check
  const st = {}
  const patch = {}
  for (const [fam, hx, hz, qY, driven] of hubs) {
    const f = st[fam] ??= { hubs: 0, n: 0, mm: 0, worst: 0, at: null, driven: 0, valid: 0 }
    road._hintCache = null
    const qy = qY ?? T.analyticHeight(hx, hz, undefined, 1e9) + (P.wheelRadius ?? 0.37)
    road.surfacePatch(hx, hz, qy, patch)
    f.hubs++
    for (let k = 0; k < 6; k++) {
      const ang = rng() * 2 * Math.PI, rad = PATCH_R * Math.sqrt(rng())
      const x = hx + Math.cos(ang) * rad, z = hz + Math.sin(ang) * rad
      const fresh = T.analyticHeight(x, z, undefined, qy), viaPatch = T.analyticHeight(x, z, patch, qy)
      const d = Math.abs(fresh - viaPatch); f.n++; if (d > 1e-3) f.mm++
      if (!(d <= f.worst)) { f.worst = d; f.at = { x: +x.toFixed(2), z: +z.toFixed(2), hub: [+hx.toFixed(2), +hz.toFixed(2)], qy: +qy.toFixed(2), valid: !!patch.valid } }
    }
    if (driven) { f.driven++; if (patch.valid) f.valid++ }   // read AFTER the samples: false once any one searched cold
  }
  road.setPoiPads(null)
  let dr = 0, va = 0, bad = false
  for (const [fam, f] of Object.entries(st)) {
    dr += f.driven; va += f.valid
    const t = total[fam] ??= { hubs: 0 }; t.hubs += f.hubs
    const ok = f.worst <= TOL
    if (!ok) bad = true
    console.log(`  seed ${seed} ${fam.padEnd(9)} ${String(f.hubs).padStart(5)} hubs, worst ${(f.worst * 1000).toFixed(4)} mm (${f.mm} over 1 mm)` +
      ` · valid on ${f.driven ? (f.valid / f.driven * 100).toFixed(0) : '–'} % of ${f.driven} driven${ok ? '' : ` — FAIL at ${JSON.stringify(f.at)}`}`)
  }
  const share = dr ? va / dr : 0
  if (share < MIN_VALID) bad = true
  if (bad) fail++
  console.log(`seed ${seed}: patch valid on ${(share * 100).toFixed(1)} % of driven hubs (≥ ${MIN_VALID * 100} %) — ${bad ? 'FAIL' : 'PASS'}`)
}
// non-vacuous: every family was sampled somewhere
for (const fam of ['run', 'junction', 'connector', 'band', 'bore', 'poi']) if (!total[fam]?.hubs) { fail++; console.log(`FAIL: no ${fam} hubs on any seed`) }
console.log(fail ? `FAIL (${fail})` : 'PASS')
process.exit(fail ? 1 : 0)
