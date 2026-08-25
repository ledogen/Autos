// test/crossing-rung-parity.mjs — BUG-57: the crossing-rung parity battery.
//
// Dumps, for each battery window: every delete-rung victim, the registered network's component
// count, and the census-style REAL crossing list (post-registration, offCurveSpans-sanctioned).
// Run it BEFORE and AFTER a rung change and diff the JSON — victims must match the parity table
// (ROAD-CLOSEOUT-PLAN.md), component counts must be unchanged, and REAL crossings must go to zero
// once the crossing rung lands.
//
// Rainy-day script, not a gate. USAGE:
//   node test/crossing-rung-parity.mjs out.json          # write the dump
//   node test/crossing-rung-parity.mjs a.json b.json --diff   # compare two dumps
import fs from 'node:fs'
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

if (process.argv.includes('--diff')) {
  const A = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  const B = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
  let drift = 0
  for (const k of Object.keys(A)) {
    const a = A[k], b = B[k]
    if (!b) { console.log(`${k}: MISSING in B`); drift++; continue }
    const aD = new Set(a.deleted.map((d) => d.ck)), bD = new Set(b.deleted.map((d) => d.ck))
    const onlyA = [...aD].filter((x) => !bD.has(x)), onlyB = [...bD].filter((x) => !aD.has(x))
    const compsSame = a.components === b.components
    const line = `${k}: victims A=${aD.size} B=${bD.size}` +
      (onlyA.length ? ` · UNDELETED in B: ${onlyA.join(' ')}` : '') +
      (onlyB.length ? ` · NEW in B: ${onlyB.join(' ')}` : '') +
      ` · comps ${a.components}→${b.components}${compsSame ? '' : '  <<< COMPONENT DRIFT'}` +
      ` · REAL crossings ${a.realCrossings.length}→${b.realCrossings.length}`
    console.log(line)
    if (onlyA.length || onlyB.length || !compsSame) drift++
  }
  console.log(drift ? `\n${drift} window(s) differ` : '\nno victim/component drift')
  process.exit(0)
}

// The battery: the census seeds + the windows the ruling measured (plan doc, 2026-08-25).
const WINDOWS = [
  { seed: 3,  cx: 0,     cz: 0,    r: 1400 },  // origin 'detour' decline pair 0,-1,0|0,-1,1
  { seed: 6,  cx: 0,     cz: 0,    r: 1400 },
  { seed: 6,  cx: -1692, cz: 1759, r: 1400 },  // the nest — resolution parity expected
  { seed: 6,  cx: 4500,  cz: 600,  r: 1600 },  // the graph-topology gate window (hairpin stacks)
  { seed: 7,  cx: 0,     cz: 0,    r: 1400 },
  { seed: 20, cx: 0,     cz: 0,    r: 1400 },
  { seed: 11, cx: 0,     cz: 0,    r: 1400 },  // two census-stuck pairs
  { seed: 67, cx: 0,     cz: 0,    r: 1400 },  // 2 components pre-existing — must stay 2
]

// strict proper crossing (open interval — matches the census/_segCrossParam convention)
const seg = (ax, az, bx, bz, cx, cz, dx, dz) => {
  const r1 = bx - ax, r2 = bz - az, s1 = dx - cx, s2 = dz - cz
  const den = r1 * s2 - r2 * s1
  if (Math.abs(den) < 1e-12) return null
  const t = ((cx - ax) * s2 - (cz - az) * s1) / den, u = ((cx - ax) * r2 - (cz - az) * r1) / den
  return (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) ? { t, u, x: ax + t * r1, z: az + t * r2 } : null
}

const out = {}
for (const W of WINDOWS) {
  const t0 = Date.now()
  const road = new RoadSystem(W.seed, { ...RANGER_PARAMS, roadNetworkMode: 'graph' })
  road.setRadius(W.r)
  road.update(new THREE.Vector3(W.cx, 0, W.cz))

  // components over the registered network (posKey graph, as graph-topology (a))
  const posKey = (p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`
  const adj = new Map()
  const addN = (k) => adj.get(k) || adj.set(k, new Set()).get(k)
  for (const [, e] of road._network) {
    const a = posKey(road._nodePos(e.cellA)), b = posKey(road._nodePos(e.cellB))
    addN(a).add(b); addN(b).add(a)
  }
  const seen = new Set(); let components = 0
  for (const s of adj.keys()) {
    if (seen.has(s)) continue
    components++
    const q = [s]; seen.add(s)
    while (q.length) { const u = q.pop(); for (const v of adj.get(u)) if (!seen.has(v)) { seen.add(v); q.push(v) } }
  }

  // census-style REAL crossings over the registered network
  const runs = [...road._network.entries()].map(([k, e]) => ({ k, e,
    a: e.cellA?.join(','), b: e.cellB?.join(','),
    inBore: (s) => (e.tunnelSpans || []).some((sp) => s >= sp.s0 && s <= sp.s1) }))
  const real = []
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
    const A = runs[i], B = runs[j]
    const shareN = [A.a, A.b].filter((n) => n === B.a || n === B.b)
    const pA = A.e.points, cA = A.e.polyCum, pB = B.e.points, cB = B.e.polyCum
    const sancOf = (run, partner) => {
      const spans = []
      for (const sp of run.e.offCurveSpans || []) if (sp.owner === partner.k) spans.push([sp.s0, sp.s1])
      for (const sp of run.e.offCurveSpans || []) if ((partner.e.offCurveSpans || []).some((o) => o.owner === sp.owner)) spans.push([sp.s0, sp.s1])
      return spans
    }
    const sancA = sancOf(A, B), sancB = sancOf(B, A)
    for (let m = 1; m < pA.length; m++) for (let n = 1; n < pB.length; n++) {
      const X = seg(pA[m - 1].x, pA[m - 1].z, pA[m].x, pA[m].z, pB[n - 1].x, pB[n - 1].z, pB[n].x, pB[n].z)
      if (!X) continue
      const sA = cA[m - 1] + X.t * (cA[m] - cA[m - 1]), sB = cB[n - 1] + X.u * (cB[n] - cB[n - 1])
      const dA = Math.min(sA, cA[cA.length - 1] - sA), dB = Math.min(sB, cB[cB.length - 1] - sB)
      if (sancA.some(([s0, s1]) => sA >= s0 - 1 && sA <= s1 + 1)
        || sancB.some(([s0, s1]) => sB >= s0 - 1 && sB <= s1 + 1)) continue
      if (shareN.length && Math.min(dA, dB) < 40) continue
      if (A.inBore(sA) || B.inBore(sB)) continue
      real.push({ x: +X.x.toFixed(0), z: +X.z.toFixed(0), kA: A.k, kB: B.k })
    }
  }

  const deleted = [...(road._v2Deleted || new Map()).values()]
    .map((r) => ({ ck: r.ck, hops: r.hops ?? null, cluster: r.cluster ? r.cluster.members.length : 0,
                   crossings: r.crossings ?? null }))
    .sort((a, b) => (a.ck < b.ck ? -1 : 1))
  const key = `s${W.seed}@${W.cx},${W.cz}`
  out[key] = { runs: runs.length, components, deleted, realCrossings: real,
               skips: road._v2MergeSkip || {} }
  console.log(`${key}: ${runs.length} runs · ${components} comps · deleted ${deleted.length} [${deleted.map((d) => d.ck).join(' ')}] · REAL crossings ${real.length} · ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}
fs.writeFileSync(process.argv[2] ?? 'crossing-rung-parity.json', JSON.stringify(out, null, 1))
console.log(`\nwrote ${process.argv[2] ?? 'crossing-rung-parity.json'}`)
