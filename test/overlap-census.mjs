// test/overlap-census.mjs — BUG-53 Phase A: the OVERLAP class + detour feasibility.
//
// crossing-census.mjs counts where runs CROSS. This measures the class it cannot see: two runs
// meeting at a node whose centres stay within shared-earthworks distance (~18 m: 2×(halfWidth 5 +
// shoulder 2.5) + carve extra 3) for a long way — they never cross, they just carve the same dirt
// (the seed-6 `-7,2,0` case: 244 m at 0.1 m min separation). And for every CONFLICT of either
// class it answers the fix's load-bearing question: if we delete one leg (the owner's ranked
// preference), do the endpoints reconnect, and within how many hops?
//
// Rainy-day script, not a gate — run it when working BUG-53.
// USAGE: node test/overlap-census.mjs [--costprune]   (--costprune = QUAL-22 cost-weighted vote A/B)
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

if (process.argv.includes('--costprune')) {
  RANGER_PARAMS.roadV2.costPrune = true
  console.log('== QUAL-22 cost-weighted Urquhart vote: ON ==')
}

const NEAR = 18      // m — shared-earthworks centre separation
const PAD = 40       // m — junction vicinity: overlap inside this is expected pad geometry

// point→segment distance in XZ
const d2seg = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az
  const l2 = dx * dx + dz * dz
  const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}
const minDistTo = (px, pz, pts) => {
  let d = Infinity, y = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const dx = b.x - a.x, dz = b.z - a.z
    const l2 = dx * dx + dz * dz
    const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l2)) : 0
    const dd = Math.hypot(px - (a.x + t * dx), pz - (a.z + t * dz))
    if (dd < d) { d = dd; y = a.y + t * (b.y - a.y) }
  }
  return { d, y }
}
const seg = (ax, az, bx, bz, cx, cz, dx, dz) => {
  const r1 = bx - ax, r2 = bz - az, s1 = dx - cx, s2 = dz - cz
  const den = r1 * s2 - r2 * s1
  if (Math.abs(den) < 1e-12) return null
  const t = ((cx - ax) * s2 - (cz - az) * s1) / den, u = ((cx - ax) * r2 - (cz - az) * r1) / den
  return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? { t, u } : null
}

for (const seed of [6, 20, 11, 67]) {
  const road = new RoadSystem(seed, RANGER_PARAMS)
  road.setRadius(1400)
  road.update(new THREE.Vector3(0, 0, 0))
  const runs = [...road._network.entries()].map(([k, e]) => ({
    k, e, a: e.cellA?.join(','), b: e.cellB?.join(','),
    len: e.polyCum[e.polyCum.length - 1],
    inBore: (s) => (e.tunnelSpans || []).some(sp => s >= sp.s0 && s <= sp.s1),
  })).filter(r => r.a && r.b)

  // node graph for detour BFS
  const adj = new Map()
  const addA = (a, b, k) => { (adj.get(a) || adj.set(a, []).get(a)).push({ n: b, k }) }
  for (const r of runs) { addA(r.a, r.b, r.k); addA(r.b, r.a, r.k) }
  const detourHops = (a, b, dropK, cap = 8) => {
    const q = [[a, 0]], seen = new Set([a])
    while (q.length) {
      const [u, d] = q.shift()
      if (d >= cap) continue
      for (const { n, k } of adj.get(u) || []) {
        if (k === dropK) continue
        if (n === b) return d + 1
        if (!seen.has(n)) { seen.add(n); q.push([n, d + 1]) }
      }
    }
    return Infinity
  }

  // ── node-sharing pairs: overlap + crossings ──
  const pairsSeen = new Set()
  const conflicts = []   // {type, A, B, detail}
  let pairsTotal = 0
  const overlapLens = []   // from-node contiguous overlap, every node-sharing pair (distribution)
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
    const A = runs[i], B = runs[j]
    const sharedNodes = [A.a, A.b].filter(n => n === B.a || n === B.b)
    if (!sharedNodes.length) {
      // DISJOINT pairs cannot legitimately come near each other at all (nodes are blue-noise
      // spaced), so any shared-earthworks proximity is a tear candidate — the graph-topology
      // SURFACE-SMOOTH step at seed 6 (3328,-27) is two NO-shared-node runs 11 m apart with a
      // 31 m deck mismatch. Crossings between disjoint runs stay censused by crossing-census.
      const pA0 = A.e.points, cA0 = A.e.polyCum
      let nearLen = 0, minSep = Infinity, maxDy = 0
      for (let m = 0; m < pA0.length; m++) {
        const r = minDistTo(pA0[m].x, pA0[m].z, B.e.points)
        if (r.d < NEAR) {
          minSep = Math.min(minSep, r.d)
          maxDy = Math.max(maxDy, Math.abs(pA0[m].y - r.y))
          if (m > 0) nearLen += cA0[m] - cA0[m - 1]
        }
      }
      if (nearLen >= 20 && (minSep < 9 || maxDy > 3))
        conflicts.push({ type: 'overlap', A, B, tear: true, disjoint: true,
          detail: `DISJOINT · near ${nearLen.toFixed(0)} m, minSep ${minSep.toFixed(1)}, deck mismatch ${maxDy.toFixed(1)} m` })
      continue
    }
    const pk = A.k + '|' + B.k
    if (pairsSeen.has(pk)) continue
    pairsSeen.add(pk)
    pairsTotal++
    // walk A's samples: distance to B, arc position, bore state
    const pA = A.e.points, cA = A.e.polyCum
    const near = new Array(pA.length), nearY = new Array(pA.length)
    for (let m = 0; m < pA.length; m++) { const r = minDistTo(pA[m].x, pA[m].z, B.e.points); near[m] = r.d; nearY[m] = r.y }
    // (a) from-node contiguous overlap, per shared node
    let fromNodeOverlap = 0, minSepMid = Infinity
    for (const sn of sharedNodes) {
      const fromStart = (A.a === sn)
      let s = 0
      const idx = fromStart ? [...pA.keys()] : [...pA.keys()].reverse()
      for (const m of idx) {
        const arc = fromStart ? cA[m] : cA[cA.length - 1] - cA[m]
        if (near[m] >= NEAR) break
        s = arc
      }
      fromNodeOverlap = Math.max(fromNodeOverlap, s)
    }
    overlapLens.push(fromNodeOverlap)
    // (b) mid-span proximity (beyond PAD from every shared node end of A): min separation, the
    //     DECK MISMATCH where the two stencils meet (|yA - yB| while within NEAR — two benches at
    //     different heights tear the carve even at 15 m lateral: the lone-pine 28 m case), and the
    //     total near-length.
    let maxDyMid = 0, midNearLen = 0
    for (let m = 0; m < pA.length; m++) {
      const dEnd = Math.min(
        sharedNodes.includes(A.a) ? cA[m] : Infinity,
        sharedNodes.includes(A.b) ? cA[cA.length - 1] - cA[m] : Infinity)
      if (dEnd <= PAD) continue
      minSepMid = Math.min(minSepMid, near[m])
      if (near[m] < NEAR) {
        maxDyMid = Math.max(maxDyMid, Math.abs(pA[m].y - nearY[m]))
        if (m > 0) midNearLen += cA[m] - cA[m - 1]
      }
    }
    const isTear = (minSepMid < 9 && midNearLen >= 20) || (maxDyMid > 3 && midNearLen >= 20)
    if (fromNodeOverlap > PAD || isTear)
      conflicts.push({ type: 'overlap', A, B, tear: isTear,
        detail: `${fromNodeOverlap.toFixed(0)} m from node, mid-span near ${midNearLen.toFixed(0)} m, minSep ${minSepMid === Infinity ? '—' : minSepMid.toFixed(1)}, deck mismatch ${maxDyMid.toFixed(1)} m` })
    // (c) crossings (REAL class, same rules as crossing-census)
    const pB = B.e.points, cB = B.e.polyCum
    let crossed = false
    for (let m = 1; m < pA.length && !crossed; m++) for (let n = 1; n < pB.length; n++) {
      const X = seg(pA[m - 1].x, pA[m - 1].z, pA[m].x, pA[m].z, pB[n - 1].x, pB[n - 1].z, pB[n].x, pB[n].z)
      if (!X) continue
      const sA = cA[m - 1] + X.t * (cA[m] - cA[m - 1]), sB = cB[n - 1] + X.u * (cB[n] - cB[n - 1])
      const dA = Math.min(sA, cA[cA.length - 1] - sA), dB = Math.min(sB, cB[cB.length - 1] - sB)
      if (Math.min(dA, dB) < PAD) continue
      if (A.inBore(sA) || B.inBore(sB)) continue
      const yA = pA[m - 1].y + X.t * (pA[m].y - pA[m - 1].y), yB2 = pB[n - 1].y + X.u * (pB[n].y - pB[n - 1].y)
      conflicts.push({ type: 'cross', A, B, detail: `gap ${Math.abs(yA - yB2).toFixed(1)} m, ${Math.min(dA, dB).toFixed(0)} m from run end` })
      crossed = true
      break
    }
  }

  // ── the fix question, per conflict: nominate the LONGER leg; does its detour exist? ──
  const kmTotal = runs.reduce((s, r) => s + r.len, 0) / 1000
  const compSeen = new Set(), compQ = runs.length ? [runs[0].a] : []
  compSeen.add(compQ[0])
  while (compQ.length) { const u = compQ.pop(); for (const { n } of adj.get(u) || []) if (!compSeen.has(n)) { compSeen.add(n); compQ.push(n) } }
  const comps = compSeen.size === adj.size ? 1 : '>1'
  console.log(`\nseed ${seed}: ${runs.length} runs, ${kmTotal.toFixed(1)} km, ${comps} component(s), ${pairsTotal} node-sharing pairs · conflicts: ${conflicts.filter(c => c.type === 'cross').length} crossing, ${conflicts.filter(c => c.type === 'overlap').length} overlap`)
  const dist = overlapLens.filter(x => x > 1)
  dist.sort((a, b) => b - a)
  console.log(`   from-node overlap distribution (top 8): ${dist.slice(0, 8).map(x => x.toFixed(0)).join(', ')} m`)
  for (const c of conflicts) {
    const [long_, short_] = c.A.len >= c.B.len ? [c.A, c.B] : [c.B, c.A]
    const hL = detourHops(long_.a, long_.b, long_.k)
    const hS = detourHops(short_.a, short_.b, short_.k)
    console.log(`   ${c.type.toUpperCase()}  ${c.A.k} × ${c.B.k}`)
    console.log(`       ${c.detail} · legs ${c.A.len.toFixed(0)}/${c.B.len.toFixed(0)} m`)
    console.log(`       drop LONGER (${long_.k}, ${long_.len.toFixed(0)} m): detour ${hL === Infinity ? 'NONE — would strand' : hL + ' hops'} · drop shorter: ${hS === Infinity ? 'NONE' : hS + ' hops'}`)
  }

  // ── DEFECT pairs (tightened: benign shallow-angle departures sit at minSep 11-18 m, true
  //    corridor-sharing at 0-8 m — the data has a clean gap; any REAL crossing is a defect) ──
  const defects = new Map()   // pairKey → {A, B, why}
  for (const c of conflicts) {
    const pk = c.A.k + '|' + c.B.k
    // Defect = a REAL crossing, or a mid-span tear (stencils overlap outright, or two benches at
    // mismatched heights while within shared-earthworks distance). A shallow-angle departure that
    // stays laterally clear and height-agreeing is junction geometry, not a defect.
    const isDefect = c.type === 'cross' || c.tear
    if (!isDefect) continue
    if (!defects.has(pk)) defects.set(pk, { A: c.A, B: c.B, why: c.type })
    else defects.get(pk).why += '+' + c.type
  }

  // ── greedy drop simulation (deterministic): can option 1 — delete a leg — clear the board?
  //    Pick the edge in the most unresolved defect pairs (tie: longer, then key); drop it only if
  //    its endpoints reconnect within hopCap on the CURRENT graph (an edge whose endpoints stay
  //    connected can never disconnect the component). Report per hop tolerance. ──
  for (const cap of [4, 6, 99]) {
    const dropped = new Set()
    const live = new Map(defects)
    const hops2 = (a, b, extraDrop) => {
      const q = [[a, 0]], seen = new Set([a])
      while (q.length) {
        const [u, d] = q.shift()
        if (d >= cap) continue
        for (const { n, k } of adj.get(u) || []) {
          if (dropped.has(k) || k === extraDrop) continue
          if (n === b) return d + 1
          if (!seen.has(n)) { seen.add(n); q.push([n, d + 1]) }
        }
      }
      return Infinity
    }
    let kmLost = 0
    for (;;) {
      const tally = new Map()   // runKey → count of live pairs it appears in
      for (const { A, B } of live.values()) { tally.set(A.k, (tally.get(A.k) || 0) + 1); tally.set(B.k, (tally.get(B.k) || 0) + 1) }
      const cand = [...tally.entries()]
        .map(([k, cnt]) => ({ k, cnt, run: runs.find(r => r.k === k) }))
        .sort((x, y) => (y.cnt - x.cnt) || (y.run.len - x.run.len) || (x.k < y.k ? -1 : 1))
        .find(c => hops2(c.run.a, c.run.b, c.k) !== Infinity)
      if (!cand) break
      dropped.add(cand.k)
      kmLost += cand.run.len / 1000
      for (const [pk, d] of live) if (d.A.k === cand.k || d.B.k === cand.k) live.delete(pk)
    }
    console.log(`   SIM hopCap ${cap === 99 ? '∞' : cap}: defect pairs ${defects.size} → ${live.size} unresolved · ${dropped.size} legs dropped (${kmLost.toFixed(1)} km lost)${live.size ? ' · stuck: ' + [...live.values()].map(d => `${d.A.k}×${d.B.k}`).join(', ') : ''}`)
  }
}
