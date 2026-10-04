// test/junction-ride.mjs — rainy-day probe (NOT a gate): ride quality THROUGH junctions.
//
// Owner 2026-10-04: "it feels like we fall right through the junction pad and hit the terrain below
// — a rather large dip at every junction". Nothing measured the drive ACROSS a pad: junction-stitch
// only reports its PAD bucket, ride-probe walks runs one at a time. This drives every ordered
// leg-to-leg path through every >=3-leg pad on the PHYSICS surface the wheels ride
// (analyticHeight → _sampleCarveWorld) and reports, per path:
//
//   dip   (m) — deepest the surface falls below the straight chord between the two legs' decks
//               10 m outside the pad (the "fall in and climb out"), positive = below.
//   kink  (g) — worst vertical-curvature lift v²·κv/g on a 5 m baseline at the turn speed (crest
//               lift >= 1 airborne; sag numbers are the "slam" into the bottom of a dip).
//   step  (mm)— worst 1 m-baseline |Δ²y|, the seam / lip scale.
//
// Path: leg A's centreline in to its cutback, a cubic Hermite across the pad between the two mouths
// (tangents along the legs — the line a driver steers), leg B's centreline out.
//
// usage: node test/junction-ride.mjs [--window=<substr>] [--top=12] [--v=15]

import { RANGER_PARAMS as P } from '../data/ranger.js'
import { WINDOWS, buildWindow } from './lib/road-battery.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { parseWorldSeed } from '../src/seed.js'

const argv = process.argv.slice(2)
const opt = (k, d) => { const a = argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d }
const ONLY = opt('window', null), TOP = Number(opt('top', 12)), V = Number(opt('v', 15)), G = 9.81
const DUMP = argv.includes('--dump'), DUMP_I = Number(opt('i', 0))
const AT = opt('at', null)?.split(',').map(Number)
const OUT = 25          // metres of leg ridden past each mouth
const DS = 0.25

function legPoint (e, atStart, d) {            // point at distance d from the node along the leg
  const cum = e.polyCum, L = cum[cum.length - 1]
  const s = atStart ? d : L - d
  let lo = 0, hi = cum.length - 1
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m }
  const t = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1)
  const a = e.points[lo], b = e.points[hi]
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, len: L }
}

const rows = []
for (const W of WINDOWS) {
  if (ONLY && !W.name.includes(ONLY)) continue
  const road = buildWindow(W, P)
  const terr = makeTerrainHeadless(parseWorldSeed(W.seed), P, road)
  // queryY at wheel height (deck + 1.5 m), as the game's contact probe does: a probe from 1e6 m reads
  // the hill over a tunnel bore instead of the floor (FEAT-40 bore ownership).
  const H = (x, z) => { const d = road.sampleRoadTopY(x, z); return terr.analyticHeight(x, z, undefined, d != null ? d + 1.5 : 1e6) }
  const nodes = road._detectNodeJunctions()
  for (const node of nodes.values()) {
    if (!node.ring || node.legs.length < 3) continue
    if (AT && Math.hypot(node.pos.x - AT[0], node.pos.z - AT[1]) > 5) continue
    for (const A of node.legs) for (const B of node.legs) {
      if (A === B) continue
      const ea = road._network.get(A.runKey), eb = road._network.get(B.runKey)
      if (!ea?.polyCum || !eb?.polyCum) continue
      const ca = A.cutback ?? 10, cb = B.cutback ?? 10
      const La = ea.polyCum.at(-1), Lb = eb.polyCum.at(-1)
      if (La < ca + OUT + 2 || Lb < cb + OUT + 2) continue
      const sa = A.arc < 1e-6, sb = B.arc < 1e-6
      // path pieces → dense XZ polyline
      const pts = []
      for (let d = ca + OUT; d > ca; d -= DS) pts.push(legPoint(ea, sa, d))
      const pa = legPoint(ea, sa, ca), pa2 = legPoint(ea, sa, ca + 1)
      const pb = legPoint(eb, sb, cb), pb2 = legPoint(eb, sb, cb + 1)
      const chord = Math.hypot(pb.x - pa.x, pb.z - pa.z)
      const ta = { x: pa.x - pa2.x, z: pa.z - pa2.z }, tb = { x: pb2.x - pb.x, z: pb2.z - pb.z }   // inward, outward
      const k = chord                            // Hermite tangent magnitude
      const nH = Math.max(4, Math.ceil(chord * 1.4 / DS))
      for (let i = 0; i < nH; i++) {
        const t = i / nH, t2 = t * t, t3 = t2 * t
        const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2
        pts.push({ x: h00 * pa.x + h10 * k * ta.x + h01 * pb.x + h11 * k * tb.x,
                   z: h00 * pa.z + h10 * k * ta.z + h01 * pb.z + h11 * k * tb.z, pad: true })
      }
      for (let d = cb; d <= cb + OUT; d += DS) pts.push(legPoint(eb, sb, d))
      // resample at uniform arc, height
      const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z))
      const Ltot = s.at(-1), n = Math.floor(Ltot / DS)
      const ys = new Float64Array(n + 1), onPad = new Uint8Array(n + 1)
      let j = 0
      for (let i = 0; i <= n; i++) {
        const si = i * DS
        while (j < s.length - 2 && s[j + 1] < si) j++
        const t = (si - s[j]) / ((s[j + 1] - s[j]) || 1)
        const x = pts[j].x + (pts[j + 1].x - pts[j].x) * t, z = pts[j].z + (pts[j + 1].z - pts[j].z) * t
        ys[i] = H(x, z); onPad[i] = pts[j].pad ? 1 : 0
        if (DUMP) { (globalThis.__xz ||= [])[i] = [x, z] }
      }
      // dip vs chord between the decks 10 m outside each mouth
      const iA = Math.round((OUT - 10) / DS), iB = n - Math.round((OUT - 10) / DS)
      let dip = -Infinity
      for (let i = iA; i <= iB; i++) {
        const c = ys[iA] + (ys[iB] - ys[iA]) * (i - iA) / (iB - iA)
        dip = Math.max(dip, c - ys[i])
      }
      // hdev: deviation from the smoothest join — a cubic in height matching both legs' deck height
      // AND slope 2 m outside each mouth (what a perfect pad would ride). Unlike dip, a node on a
      // valley floor whose legs both descend into it scores 0 here.
      const m0 = Math.round((OUT - 2) / DS), m1 = n - m0, dsl = Math.round(2 / DS)
      const y0 = ys[m0], y1 = ys[m1], g0 = (ys[m0] - ys[m0 - dsl]) / 2, g1 = (ys[m1 + dsl] - ys[m1]) / 2
      const Lm = (m1 - m0) * DS
      let hdev = 0, hdevS = 0
      for (let i = m0; i <= m1; i++) {
        const t = (i - m0) / (m1 - m0), t2 = t * t, t3 = t2 * t
        const ref = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * Lm * g0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * Lm * g1
        const dv = ref - ys[i]
        if (Math.abs(dv) > Math.abs(hdev)) { hdev = dv; hdevS = i * DS - OUT }
        if (DUMP && rows.length === DUMP_I && i % 4 === 0) { const [x, z] = globalThis.__xz[i]; const c = road._sampleCarveWorld(x, z, terr.rawHeightWorld(x, z), undefined, 1e6); const ns = road._nodeSurfaceTop(node, x, z), lg = road._legSurfaceTop(node, x, z), sr = road.sampleRoadTopY(x, z); console.log(`  s ${(i * DS - OUT).toFixed(1)}  y ${ys[i].toFixed(2)}  ref ${ref.toFixed(2)} pad ${onPad[i]} ns ${ns?.toFixed(2)} leg ${lg?.toFixed(2)} sRT ${sr?.toFixed(2)} r ${Math.hypot(x-node.pos.x,z-node.pos.z).toFixed(1)}`) }
      }
      // Judge at the speed the path's own turn allows (par's mu): nobody takes a 90° turn at 15 m/s.
      let kxz = 0
      for (let i = 4; i < pts.length - 4; i++) {
        const a = pts[i - 4], b = pts[i], c = pts[i + 4]
        const ux = b.x - a.x, uz = b.z - a.z, wx = c.x - b.x, wz = c.z - b.z
        const lu = Math.hypot(ux, uz), lw = Math.hypot(wx, wz)
        if (lu < 1e-6 || lw < 1e-6) continue
        kxz = Math.max(kxz, Math.abs(Math.atan2(ux * wz - uz * wx, ux * wx + uz * wz)) / (0.5 * (lu + lw)))
      }
      const v = Math.min(V, Math.sqrt(0.8 * G / Math.max(kxz, 1e-6)))
      const b5 = Math.round(5 / DS), b1 = Math.round(1 / DS)
      let kink = 0, kinkSag = 0, step = 0
      for (let i = b5; i <= n - b5; i++) {
        const kv = (ys[i + b5] - 2 * ys[i] + ys[i - b5]) / 25
        const lift = v * v * kv / G
        if (-lift > kink) kink = -lift          // crest (κ<0) → lift
        if (lift > kinkSag) kinkSag = lift      // sag slam
      }
      let stepS = 0
      for (let i = b1; i <= n - b1; i++) { const v = Math.abs(ys[i + b1] - 2 * ys[i] + ys[i - b1]) * 1000; if (v > step) { step = v; stepS = i * DS - OUT } }
      const ang = Math.acos(Math.max(-1, Math.min(1, -(A.dir.x * B.dir.x + A.dir.z * B.dir.z)))) * 180 / Math.PI
      rows.push({ stepS, padLen: (m1 - m0) * DS - 4, hdev, hdevS, win: W.name, x: node.pos.x, z: node.pos.z, legs: node.legs.length, turn: ang, dip, kink, kinkSag, step })
    }
  }
}

const pct = (a, p) => { const s = [...a].sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const f = (v, d = 2) => v.toFixed(d)
for (const r of rows) r.ahdev = Math.abs(r.hdev)
for (const [key, name] of [['ahdev', 'hdev m'], ['dip', 'dip m'], ['kink', 'crest lift g'], ['kinkSag', 'sag g'], ['step', 'step mm']]) {
  const a = rows.map(r => r[key])
  console.log(`${name.padEnd(13)} p50 ${f(pct(a, .5))}  p90 ${f(pct(a, .9))}  p99 ${f(pct(a, .99))}  max ${f(Math.max(...a))}`)
}
console.log(`paths ${rows.length}  (v = min(${V}, turn-limited) m/s)  dip>0.3 m: ${rows.filter(r => r.dip > 0.3).length}  sag>0.5 g: ${rows.filter(r => r.kinkSag > 0.5).length}`)
const SORT = opt('sort', 'ahdev')
rows.sort((a, b) => b[SORT] - a[SORT])
console.log(`\nworst ${SORT}:`)
for (const r of rows.slice(0, TOP)) console.log(`  ${r.win.padEnd(20)} (${f(r.x, 0)},${f(r.z, 0)}) legs ${r.legs} turn ${f(r.turn, 0).padStart(3)}°  hdev ${f(r.hdev)}@${f(r.hdevS,0)}m  dip ${f(r.dip)}  crest ${f(r.kink)}g  sag ${f(r.kinkSag)}g  step ${f(r.step, 0)}mm@${f(r.stepS,1)}/${f(r.padLen,0)}`)

// where along the path do the steps sit? (s from mouth A; pad spans 0..padLen)
const hist = {}
for (const r of rows) { const b = r.stepS < -0.5 ? 'legA' : r.stepS > r.padLen + 0.5 ? 'legB' : (Math.abs(r.stepS) <= 0.5 || Math.abs(r.stepS - r.padLen) <= 0.5) ? 'mouth' : 'pad'; hist[b] = (hist[b] || 0) + 1 }
console.log('\nworst-step location:', JSON.stringify(hist))
