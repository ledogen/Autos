// RAINY-DAY (BUG-158): census of hard STEPS in the dirt round every padded junction, by resolver class. Not a gate.
//
//   node test/junction-dirt-census.mjs [seed,seed,…] [--r=1000] [--top=8] [--json=out.json]
//
// For every ringed junction within R of the origin, each leg's both sides are walked in straight lines at 5 cm: lateral
// lines (lat 5.2 → 24 m) at every metre of arc 1–30 m out from the node, and arc lines (0 → 30 m) at every metre of lat
// 6–19 m. Height = physics (analyticHeight with the road carve, Y-less: the mesh view, no stream carve). A 5 cm move
// that rises more than STEP_MIN is bisected down to 0.5 mm: if it still jumps there (a slope > 40:1) it is a STEP, and the
// two sides' resolver state names its CLASS, first difference wins:
//   winner     _resolveRoadSurface's winner run flips (a Voronoi seam the blend does not cover)
//   connector  _connectorCarve switches on / off
//   rivalFrame a rival keeps its run but switches end-cap ↔ interior frame, or its foot hops
//   rivalSet   a rival appears / disappears with weight
//   arcHop     the winner keeps its run but its foot hops along the arc (a polyline kink, a flat wrap)
//   limb       the ruled blend (_carveDirtY) gains or loses a leg limb (_projectLegNearNode's local minima)
//   jcNode     _junctionCarve changes node
//   pad        _junctionPadCarve switches on / off
//   other      none of the above
// A step the mesh DIRT (the composition test/junction-edge-lip.mjs rebuilds) does not share is the designed asphalt
// edge (a ribbon shoulder or the pad rim kerb), counted as `asphalt` and not classed. Steps within 1 m of each other are
// one SITE; the report gives sites and the worst jump per class, then the worst sites with their coordinates.
import * as THREE from 'three'
import { writeFileSync } from 'node:fs'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const args = process.argv.slice(2), opt = (k, d) => (args.find(a => a.startsWith(`--${k}=`)) ?? `=${d}`).split('=')[1]
// BUG-158's five seeds (BUG-156's gore census) + four drawn at random for this census (2026-11-14). No default seed.
const SEEDS = (args.find(a => !a.startsWith('--')) ?? '1074499174,565500664,11,917338424,169372896,2840193377,407711925,3561904408,1290356127').split(',')
const R = +opt('r', 1000), TOP = +opt('top', 8), JSON_OUT = opt('json', '')
const STEP_MIN = 0.05, DS = 0.05, hw = P.roadHalfWidth ?? 5
const CLASSES = ['winner', 'connector', 'rivalFrame', 'rivalSet', 'arcHop', 'limb', 'jcNode', 'pad', 'other']

const all = []   // every classed step: { seed, cls, jump, x, z, node, detail }
for (const S of SEEDS) {
  const t0 = Date.now()
  const ws = parseWorldSeed(S), road = new RoadSystem(ws, P)
  wirePondNoGo(road, ws, P); road.setRadius(R + 300); road.update(new THREE.Vector3(0, 0, 0))
  const terrain = makeTerrainHeadless(ws, P, road)
  road._detectNodeJunctions()
  const H = (x, z) => terrain.analyticHeight(x, z)
  const dirt = (x, z) => {   // test/junction-edge-lip.mjs meshDirt: the terrain mesh's composition (no asphalt overlay)
    const raw = terrain.rawHeightWorld(x, z), nr = road._resolveRoadSurface(x, z)
    let cs = null, dRib = Infinity
    if (nr) {
      const dx = x - nr.point.x, dz = z - nr.point.z, arc = (nr.arcS ?? 0) + dx * nr.tangent.x + dz * nr.tangent.z, sl = dx * nr.tangent.z - dz * nr.tangent.x
      cs = road._carveCrossSectionBlended(nr, sl, arc, raw, undefined, x, z)
      dRib = road._ribbonEdgeDist?.(nr.runKey ?? '', arc, Math.abs(sl)) ?? Infinity
    }
    const co = road._connectorCarve(x, z, raw)
    if (co) cs = { blendW: Math.max(cs ? cs.blendW : 0, co.blendW), gradeY: cs ? co.gradeY * co.dom + cs.gradeY * (1 - co.dom) : co.gradeY }
    const m = road._mergeCarve(cs, road._junctionPadCarve(x, z, raw), dRib)
    return m ? raw + m.blendW * (m.gradeY - raw) : raw
  }
  const state = (x, z) => {
    const raw = terrain.rawHeightWorld(x, z), nr = road._resolveRoadSurface(x, z)
    const st = { win: nr?.runKey ?? null, arc: nr?.arcS ?? 0, endR: nr?.endRadial != null, rivals: new Map(), co: !!road._connectorCarve(x, z, raw), jc: null, pad: !!road._junctionPadCarve(x, z, raw), bore: false }
    if (nr) {
      for (const rv of nr.rivals) st.rivals.set(rv.runKey + '@' + Math.round(rv.arcS / 4), { end: !!rv.end, arc: rv.arcS, m: rv.m ?? 1, key: rv.runKey })
      const dx = x - nr.point.x, dz = z - nr.point.z
      const jc = road._junctionCarve(nr.runKey, nr.arcS + dx * nr.tangent.x + dz * nr.tangent.z)
      st.jc = jc.node ? `${jc.node.pos.x.toFixed(0)},${jc.node.pos.z.toFixed(0)}` : null
      // the ruled blend's limbs (_projectLegNearNode): how many feet each of the node's legs contributes
      st.limbs = jc.node ? jc.node.legs.map(l => (road._projectLegNearNode(road._network.get(l.runKey), x, z, l.arc, 40) ?? []).map(f => Math.round(f.arcS)).join('/')).join(' ') : ''
      st.bore = !!road.tunnelSpanAt(nr.runKey, nr.arcS)
    }
    return st
  }
  const classify = (a, b) => {
    if (a.win !== b.win) return ['winner', `${a.win} → ${b.win}`]
    if (a.co !== b.co) return ['connector', `co ${a.co} → ${b.co} (winner arc ${a.arc.toFixed(1)} → ${b.arc.toFixed(1)})`]
    // a rival of the same run on both sides whose frame (end ↔ interior) or foot changed
    const byKey = (st) => { const m = new Map(); for (const r of st.rivals.values()) if (r.m > 1e-3) (m.get(r.key) ?? m.set(r.key, []).get(r.key)).push(r); return m }
    const ka = byKey(a), kb = byKey(b)
    for (const [k, ra] of ka) {
      const rb = kb.get(k); if (!rb) continue
      for (const r of ra) {
        const near = rb.reduce((best, q) => Math.abs(q.arc - r.arc) < Math.abs(best.arc - r.arc) ? q : best)
        if (near.end !== r.end || Math.abs(near.arc - r.arc) > 0.3) return ['rivalFrame', `${k} ${r.end ? 'end' : 'int'} ${r.arc.toFixed(1)} → ${near.end ? 'end' : 'int'} ${near.arc.toFixed(1)}`]
      }
    }
    const sa = [...ka.keys()].map(k => k + 'x' + ka.get(k).length).sort().join('|'), sb = [...kb.keys()].map(k => k + 'x' + kb.get(k).length).sort().join('|')
    if (sa !== sb) return ['rivalSet', `${sa} → ${sb}`]
    if (Math.abs(a.arc - b.arc) > 0.3 || a.endR !== b.endR) return ['arcHop', `${a.win} arc ${a.arc.toFixed(1)}${a.endR ? 'E' : ''} → ${b.arc.toFixed(1)}${b.endR ? 'E' : ''}`]
    if (a.limbs !== b.limbs) return ['limb', `${a.limbs} → ${b.limbs}`]
    if (a.jc !== b.jc) return ['jcNode', `${a.jc} → ${b.jc}`]
    if (a.pad !== b.pad) return ['pad', `pad ${a.pad} → ${b.pad}`]
    return ['other', `${a.win} arc ${a.arc.toFixed(2)}`]
  }
  let lines = 0, samples = 0, asphalt = 0
  const nodes = [...road._nodeJunctions.values()].filter(n => n.ring && Math.hypot(n.pos.x, n.pos.z) <= R)
  const found = []
  // walk p(t) = (x0 + ux t, z0 + uz t), t ∈ [0, len], at DS; bisect each over-threshold move
  const walk = (x0, z0, ux, uz, len, nodeTag) => {
    lines++
    let hPrev = H(x0, z0), tPrev = 0
    for (let t = DS; t <= len + 1e-9; t += DS) {
      const h = H(x0 + ux * t, z0 + uz * t); samples++
      if (Math.abs(h - hPrev) > STEP_MIN) {
        let lo = tPrev, hi = t, hLo = hPrev, hHi = h
        while (hi - lo > 5e-4) {
          const mid = (lo + hi) / 2, hm = H(x0 + ux * mid, z0 + uz * mid)
          if (Math.abs(hm - hLo) >= Math.abs(hHi - hm)) { hi = mid; hHi = hm } else { lo = mid; hLo = hm }
        }
        const jump = Math.abs(hHi - hLo)
        if (jump > 0.02) {
          const xa = x0 + ux * lo, za = z0 + uz * lo, xb = x0 + ux * hi, zb = z0 + uz * hi
          if (Math.abs(dirt(xb, zb) - dirt(xa, za)) < 0.5 * jump) asphalt++
          else {
            const sa = state(xa, za), sb = state(xb, zb)
            if (!sa.bore && !sb.bore) { const [cls, detail] = classify(sa, sb); found.push({ seed: S, cls, jump, x: xa, z: za, ux: xb - xa, uz: zb - za, node: nodeTag, detail }) }
          }
        }
      }
      hPrev = h; tPrev = t
    }
  }
  for (const node of nodes) {
    const tag = `${node.pos.x.toFixed(0)},${node.pos.z.toFixed(0)}`
    for (const leg of node.legs) {
      const e = road._network.get(leg.runKey); if (!e?.polyCum) continue
      const L = e.polyCum.at(-1), fromStart = leg.arc < L / 2
      if (L < 32) continue
      const at = (s) => {
        const a = fromStart ? s : L - s, p = road.runPointAt(leg.runKey, a), q = road.runPointAt(leg.runKey, a + (fromStart ? 0.5 : -0.5))
        let tx = q.x - p.x, tz = q.z - p.z; const l = Math.hypot(tx, tz); return { p, tx: tx / l, tz: tz / l }
      }
      for (const side of [1, -1]) {
        for (let s = 1; s <= 30; s++) {   // lateral lines
          const { p, tx, tz } = at(s), nx = side * tz, nz = -side * tx
          walk(p.x + nx * 5.2, p.z + nz * 5.2, nx, nz, 24 - 5.2, tag)
        }
        const { p, tx, tz } = at(0)   // arc lines, straight along the leg's mouth tangent
        for (let lat = 6; lat <= 19; lat++) walk(p.x + side * tz * lat, p.z - side * tx * lat, tx, tz, 30, tag)
      }
    }
  }
  // sites: steps within 1 m of each other, keep the worst
  const sites = []
  for (const f of found.sort((a, b) => b.jump - a.jump)) {
    const s = sites.find(q => q.cls === f.cls && Math.hypot(q.x - f.x, q.z - f.z) < 1)
    if (s) s.hits++; else sites.push({ ...f, hits: 1 })
  }
  all.push(...sites)
  const by = Object.fromEntries(CLASSES.map(c => [c, sites.filter(s => s.cls === c)]))
  console.log(`seed ${S}: ${nodes.length} padded nodes, ${lines} lines, ${samples} samples, ${(Date.now() - t0) / 1000 | 0} s · asphalt-edge steps ${asphalt} · ` +
    CLASSES.filter(c => by[c].length).map(c => `${c} ${by[c].length} (${by[c][0].jump.toFixed(2)} m)`).join(', '))
}
console.log('\nclass       sites  >0.15m  worst')
for (const c of CLASSES) {
  const s = all.filter(q => q.cls === c); if (!s.length) continue
  console.log(`${c.padEnd(11)} ${String(s.length).padStart(5)} ${String(s.filter(q => q.jump > 0.15).length).padStart(7)}  ${Math.max(...s.map(q => q.jump)).toFixed(2)} m`)
}
console.log(`\nworst ${TOP} sites:`)
for (const s of all.sort((a, b) => b.jump - a.jump).slice(0, TOP))
  console.log(`  ${s.jump.toFixed(2)} m ${s.cls.padEnd(10)} seed ${s.seed} (${s.x.toFixed(5)}, ${s.z.toFixed(5)}) node ${s.node} ×${s.hits} d(${s.ux.toFixed(6)},${s.uz.toFixed(6)}) · ${s.detail}`)
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(all))
