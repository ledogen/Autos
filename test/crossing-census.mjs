// test/crossing-census.mjs — BUG-53: where do roads actually cross each other?
//
// Every place two registered runs cross in PLAN view, classified so the count means something:
//   - at-junction   crossing within 40 m of a shared run end. Two edges of the same junction
//                   converging is expected geometry, not a defect. Reported and excluded.
//   - through a bore  one of the two is inside a tunnel span there — it genuinely passes under.
//                   Also excluded; this is the vocabulary working.
//   - REAL          everything else: two roads crossing mid-span with nothing to separate them.
//                   Split into node-sharing (the two runs meet at some node elsewhere) and
//                   disjoint (they have no node in common at all).
// The VERTICAL GAP at each crossing is the severity: under ~6 m the two carve footprints fight over
// the same dirt and it reads as a terrain tear; tens of metres apart is just two roads on a hillside.
//
// Rainy-day script, not a gate — run it when working BUG-53.
// USAGE: node test/crossing-census.mjs
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const seg = (ax,az,bx,bz,cx,cz,dx,dz) => {
  const r1=bx-ax, r2=bz-az, s1=dx-cx, s2=dz-cz
  const den = r1*s2 - r2*s1
  if (Math.abs(den) < 1e-12) return null
  const t = ((cx-ax)*s2 - (cz-az)*s1)/den, u = ((cx-ax)*r2 - (cz-az)*r1)/den
  return (t>=0&&t<=1&&u>=0&&u<=1) ? {t,u,x:ax+t*r1,z:az+t*r2} : null
}
for (const seed of [6, 20, 11]) {
  const road = new RoadSystem(seed, RANGER_PARAMS)
  road.setRadius(1400)
  road.update(new THREE.Vector3(0, 0, 0))
  const runs = [...road._network.entries()].map(([k,e]) => ({ k, e,
    a: e.cellA?.join(','), b: e.cellB?.join(','),
    inBore: (s) => (e.tunnelSpans||[]).some(sp => s >= sp.s0 && s <= sp.s1) }))
  let disjoint = 0, shared = 0, nearNode = 0, structural = 0, worst = null
  const report = []
  for (let i = 0; i < runs.length; i++) for (let j = i+1; j < runs.length; j++) {
    const A = runs[i], B = runs[j]
    const shareN = [A.a,A.b].filter(n => n===B.a || n===B.b)
    const pA = A.e.points, cA = A.e.polyCum, pB = B.e.points, cB = B.e.polyCum
    for (let m = 1; m < pA.length; m++) for (let n = 1; n < pB.length; n++) {
      const X = seg(pA[m-1].x,pA[m-1].z,pA[m].x,pA[m].z, pB[n-1].x,pB[n-1].z,pB[n].x,pB[n].z)
      if (!X) continue
      const sA = cA[m-1] + X.t*(cA[m]-cA[m-1]), sB = cB[n-1] + X.u*(cB[n]-cB[n-1])
      const yA = pA[m-1].y + X.t*(pA[m].y-pA[m-1].y), yB = pB[n-1].y + X.u*(pB[n].y-pB[n-1].y)
      const dA = Math.min(sA, cA[cA.length-1]-sA), dB = Math.min(sB, cB[cB.length-1]-sB)
      const fromNode = Math.min(dA, dB)
      const gap = Math.abs(yA-yB)
      const inStruct = A.inBore(sA) || B.inBore(sB)
      if (shareN.length && fromNode < 40) { nearNode++; continue }   // at the shared junction: expected
      if (inStruct) { structural++; continue }                        // a bore passing under: not a defect
      if (shareN.length) shared++; else disjoint++
      report.push({ x:X.x, z:X.z, gap, fromNode, kA:A.k, kB:B.k, sh: !!shareN.length })
      if (!worst || gap < worst.gap) worst = { x:X.x, z:X.z, gap, fromNode }
    }
  }
  report.sort((a,b) => a.gap - b.gap)
  console.log(`\nseed ${seed}: ${runs.length} runs · REAL crossings ${report.length} (node-sharing ${shared}, disjoint ${disjoint}) · at-junction ${nearNode} (expected) · through a bore ${structural} (fine)`)
  for (const r of report.slice(0, 5))
    console.log(`   (${r.x.toFixed(0)}, ${r.z.toFixed(0)})  vertical gap ${r.gap.toFixed(1)} m · ${r.fromNode.toFixed(0)} m from the nearest run end · ${r.sh ? 'share a node' : 'DISJOINT'}`)
  const tight = report.filter(r => r.gap < 6).length
  console.log(`   → ${tight} of ${report.length} have < 6 m vertical gap (roads genuinely on top of each other)`)
}
