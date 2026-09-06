// test/ride-census.mjs — FEAT-76 D2: does the router actually ride, and at what rho?
//
// Sweeps rideRho and reports, per seed, how much of the network ends up coincident with an older
// road. "Coincident" here is the same measure the sharing census uses (centres within mergeProxM),
// but reported as a SWEEP so the shape of the response to rho is visible — the question is whether
// riding switches on gradually (a knob) or all at once (a cliff), and whether it plateaus before
// road character goes.
//
// rho = 1 is OFF and must reproduce the shipped baseline exactly; that row is the control.
//
// Rainy-day script, not a gate. USAGE: node test/ride-census.mjs [seeds] [rhos] [radius]
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const SEEDS = (process.argv[2] || '6,20,11').split(',').map(Number)
const RHOS = (process.argv[3] || '1,0.5,0.35,0.25,0.15').split(',').map(Number)
const RADIUS = Number(process.argv[4] || 1400)
const PROX = RANGER_PARAMS.roadV2?.mergeProxM ?? 18
const MINREG = 30

function nearestD(px, pz, pts) {
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, az = pts[i - 1].z, dx = pts[i].x - ax, dz = pts[i].z - az
    const L2 = dx * dx + dz * dz
    let t = L2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const d = Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
    if (d < best) best = d
  }
  return best
}

function run(seed, rho) {
  const P = JSON.parse(JSON.stringify(RANGER_PARAMS))
  P.roadV2.rideRho = rho
  const t0 = Date.now()
  const road = new RoadSystem(seed, P)
  road.setRadius(RADIUS)
  road.update(new THREE.Vector3(0, 0, 0))
  const ms = Date.now() - t0
  const runs = [...road._network.entries()].map(([k, e]) => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const p of e.points) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z
    }
    return { k, e, a: e.cellA?.join(','), b: e.cellB?.join(','), minX, maxX, minZ, maxZ, L: e.polyCum[e.polyCum.length - 1] }
  })
  let pairs = 0, sharedM = 0, longest = 0, disjoint = 0, midspan = 0
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
    const A = runs[i], B = runs[j]
    if (A.maxX + PROX < B.minX || B.maxX + PROX < A.minX || A.maxZ + PROX < B.minZ || B.maxZ + PROX < A.minZ) continue
    const pA = A.e.points, cA = A.e.polyCum
    const shareN = [A.a, A.b].some((n) => n === B.a || n === B.b)
    let s0 = null, prev = null, tot = 0, lng = 0, mid = false
    const LA = cA[cA.length - 1]
    for (let m = 0; m < pA.length; m++) {
      const d = nearestD(pA[m].x, pA[m].z, B.e.points)
      if (d <= PROX) { if (s0 === null) s0 = cA[m]; prev = cA[m] }
      else if (s0 !== null) {
        const L = prev - s0
        if (L >= MINREG) { tot += L; if (L > lng) lng = L; if (!(shareN && (s0 < 40 || LA - prev < 40))) mid = true }
        s0 = null
      }
    }
    if (s0 !== null) { const L = prev - s0; if (L >= MINREG) { tot += L; if (L > lng) lng = L; if (!(shareN && (s0 < 40 || LA - prev < 40))) mid = true } }
    if (tot > 0) { pairs++; sharedM += tot; if (lng > longest) longest = lng; if (!shareN) disjoint++; if (mid) midspan++ }
  }
  const netL = runs.reduce((a, r) => a + r.L, 0)
  return { runs: runs.length, netL, pairs, sharedM, longest, disjoint, midspan, ms,
           merges: road._v2Merges || 0, shoves: road._v2Shoves || 0,
           condemned: road._v2Condemned || 0, reroutes: road._v2Reroutes || 0 }
}

console.log(` rho  seed  runs     km  pairs  disj  mid  sharedM  %net  longest  merges  cond   build`)
const agg = new Map()
for (const rho of RHOS) {
  let P = 0, S = 0, N = 0, M = 0, D = 0, MS = 0, C = 0, T = 0
  for (const seed of SEEDS) {
    const r = run(seed, rho)
    P += r.pairs; S += r.sharedM; N += r.netL; M += r.merges; D += r.disjoint; MS += r.midspan; C += r.condemned; T += r.ms
    console.log(`${rho.toFixed(2).padStart(5)} ${String(seed).padStart(5)} ${String(r.runs).padStart(5)} ${(r.netL / 1000).toFixed(1).padStart(6)} ${String(r.pairs).padStart(6)} ${String(r.disjoint).padStart(5)} ${String(r.midspan).padStart(4)} ${r.sharedM.toFixed(0).padStart(8)} ${(100 * r.sharedM / r.netL).toFixed(1).padStart(5)} ${r.longest.toFixed(0).padStart(8)} ${String(r.merges).padStart(7)} ${String(r.condemned).padStart(5)} ${(r.ms / 1000).toFixed(1).padStart(6)}s`)
  }
  agg.set(rho, { P, S, N, M, D, MS, C, T })
}
console.log(`\n rho   pairs  disjoint  mid-span   sharedM   %net   merges  condemned   total build`)
for (const rho of RHOS) {
  const a = agg.get(rho)
  console.log(`${rho.toFixed(2).padStart(5)} ${String(a.P).padStart(7)} ${String(a.D).padStart(9)} ${String(a.MS).padStart(9)} ${a.S.toFixed(0).padStart(9)} ${(100 * a.S / a.N).toFixed(2).padStart(6)} ${String(a.M).padStart(8)} ${String(a.C).padStart(10)} ${(a.T / 1000).toFixed(1).padStart(12)}s`)
}
const base = agg.get(RHOS[0])
console.log(`\nbaseline row is rho=${RHOS[0].toFixed(2)}; disjoint + mid-span sharing is the NEW geometry (there is essentially none at rho=1).`)
