// FEAT-68 M0 workbench — corridor+profile on single anchor pairs, seed 20. Not a gate.
// Run: node test/corridor-m0.mjs
// Canonical case: edge 0,-1,2 : -1,0,2 (the BUG-51 cliff edge) — a bore must EMERGE by cost.
// Also runs the lowest-cover long edge in the window as the benign control (expect: no structures).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { truncatedHeightField, corridorConnect, CLS_NAME, CLS, V2_COSTS } from '../src/corridor-router.js'

const road = new RoadSystem(20, RANGER_PARAMS)
road.setRadius(1400)
road.update(new THREE.Vector3(0, 0, 0))
const hFull = (x, z) => road._coarseH(x, z)
const hTrunc = truncatedHeightField(road._noiseCoarse, RANGER_PARAMS, 2)

const posOf = new Map()
for (let cz = -8; cz <= 8; cz++) for (let cx = -8; cx <= 8; cx++)
  for (const s of road._aliveSitesIn(cx, cz)) posOf.set(`${s.id[0]},${s.id[1]},${s.id[2]}`, s.pos)

function coverOf(A, B) {
  const chord = Math.hypot(B.x - A.x, B.z - A.z)
  const hA = hFull(A.x, A.z), hB = hFull(B.x, B.z)
  let cover = 0
  const n = Math.ceil(chord / 2)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const h = hFull(A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t)
    if (h - (hA + (hB - hA) * t) > cover) cover = h - (hA + (hB - hA) * t)
  }
  return { chord, cover }
}

// benign control: longest edge with < 15 m cover
let benign = null
const g = road._proto.graph
for (const [a, b] of g.edges) {
  const A = posOf.get(g.key(a)), B = posOf.get(g.key(b))
  if (!A || !B) continue
  const { chord, cover } = coverOf(A, B)
  if (cover < 15 && chord > 300 && (!benign || chord > benign.chord)) benign = { a, b, chord, cover }
}

function repriceIndependent(res, C) {
  // same right-Riemann convention as the DP, separate code path
  const { stations: st, profile: p } = res
  let tot = 0
  const clsAt = i => p.cls[i]
  for (let i = 1; i < st.s.length; i++) {
    const ds = st.s[i] - st.s[i - 1]
    const d = p.y[i] - st.ground[i]
    let rate
    if (Math.abs(d) <= C.onTol) rate = C.cRoadM
    else if (d < 0 && d >= -C.cutMax) rate = C.cRoadM + C.cCutM * (-d) + (C.cCut2 ?? 0) * d * d
    else if (d < 0) rate = C.cBoreM
    else if (d <= C.fillMax) rate = C.cRoadM + C.cFillM * d
    else rate = C.bridgesOn ? C.cBridgeM : Infinity
    const grade = (p.y[i] - p.y[i - 1]) / ds
    tot += ds * rate + ds * C.cRoadM * C.wGrade * grade * grade
    if ((clsAt(i - 1) === CLS.BORE) !== (clsAt(i) === CLS.BORE)) tot += C.cPortal
    if ((clsAt(i - 1) === CLS.BRIDGE) !== (clsAt(i) === CLS.BRIDGE)) tot += C.cAbutment
  }
  return tot
}

function runEdge(name, a, b) {
  const A = posOf.get(`${a[0]},${a[1]},${a[2]}`), B = posOf.get(`${b[0]},${b[1]},${b[2]}`)
  const { chord, cover } = coverOf(A, B)
  const anchorA = { x: A.x, z: A.z, y: hFull(A.x, A.z) }
  const anchorB = { x: B.x, z: B.z, y: hFull(B.x, B.z) }
  const t0 = performance.now()
  const res = corridorConnect(anchorA, anchorB, hTrunc, hFull)
  const ms = performance.now() - t0
  console.log(`\n── ${name}: chord ${chord.toFixed(0)} m, chord-line cover ${cover.toFixed(0)} m, yA ${anchorA.y.toFixed(0)} yB ${anchorB.y.toFixed(0)}`)
  if (!res) { console.log('   INFEASIBLE'); return }
  const L = res.stations.s[res.stations.s.length - 1]
  console.log(`   corridor: ${L.toFixed(0)} m (detour x${(L / chord).toFixed(2)}), lower-bound cost ${res.corridor.cost.toFixed(0)}, ${res.corridor.expanded} cells expanded, ${ms.toFixed(0)} ms total`)
  console.log(`   profile cost ${res.profile.cost.toFixed(0)}  (corridor bound ${res.corridor.cost.toFixed(0)} — bound ${res.corridor.cost <= res.profile.cost + 1e-6 ? 'HOLDS' : 'VIOLATED'})`)
  let maxG = 0, maxCut = 0, maxFill = 0
  const gh = [0, 0, 0]  // ≤10%, 10–20%, 20–35% (m of road)
  for (let i = 1; i < res.pts.length; i++) {
    const ds = res.stations.s[i] - res.stations.s[i - 1]
    const g = Math.abs(res.profile.y[i] - res.profile.y[i - 1]) / ds
    maxG = Math.max(maxG, g)
    gh[g <= 0.10 ? 0 : g <= 0.20 ? 1 : 2] += ds
    const d = res.profile.y[i] - res.stations.ground[i]
    if (d < 0 && res.profile.cls[i] === CLS.CUT) maxCut = Math.max(maxCut, -d)
    if (d > 0 && res.profile.cls[i] === CLS.FILL) maxFill = Math.max(maxFill, d)
  }
  console.log(`   max grade ${(100 * maxG).toFixed(1)}%   grade mix: ${gh[0].toFixed(0)} m ≤10% | ${gh[1].toFixed(0)} m 10–20% | ${gh[2].toFixed(0)} m 20–35%`)
  console.log(`   max cut depth ${maxCut.toFixed(1)} m, max fill height ${maxFill.toFixed(1)} m`)
  for (const sg of res.profile.segs.filter(s => s.len > 40 || s.cls === CLS.BORE || s.cls === CLS.BRIDGE)) {
    let extra = ''
    if (sg.cls === CLS.BORE) {
      let maxCover = 0, maxBg = 0
      for (let i = 1; i < res.pts.length; i++) {
        if (res.stations.s[i] >= sg.s0 && res.stations.s[i] <= sg.s1) {
          maxCover = Math.max(maxCover, res.stations.ground[i] - res.profile.y[i])
          const ds = res.stations.s[i] - res.stations.s[i - 1]
          maxBg = Math.max(maxBg, Math.abs(res.profile.y[i] - res.profile.y[i - 1]) / ds)
        }
      }
      extra = `  cover ${maxCover.toFixed(0)} m, bore grade ≤ ${(100 * maxBg).toFixed(0)}%`
    }
    console.log(`     ${CLS_NAME[sg.cls].padEnd(6)} ${sg.s0.toFixed(0).padStart(5)} → ${sg.s1.toFixed(0).padStart(5)}  (${sg.len.toFixed(0)} m)${extra}`)
  }
  const rp = repriceIndependent(res, V2_COSTS)
  console.log(`   priced==built: DP ${res.profile.cost.toFixed(2)} vs independent re-price ${rp.toFixed(2)} → ${Math.abs(rp - res.profile.cost) < 0.01 ? 'OK' : 'MISMATCH'}`)
}

runEdge('CANONICAL ridge edge 0,-1,2 : -1,0,2', [0, -1, 2], [-1, 0, 2])
if (benign) runEdge(`benign control ${g.key(benign.a)} : ${g.key(benign.b)} (cover ${benign.cover.toFixed(0)} m)`, benign.a, benign.b)

// gully check: benign edge, deck vs ground through the bridge span
{
  const A = posOf.get(g.key(benign.a)), B = posOf.get(g.key(benign.b))
  const res = corridorConnect({ x: A.x, z: A.z, y: hFull(A.x, A.z) }, { x: B.x, z: B.z, y: hFull(B.x, B.z) }, hTrunc, hFull)
  console.log('\nbenign edge, s=1040..1244 (deck vs ground):')
  for (let i = 0; i < res.pts.length; i++) {
    const s = res.stations.s[i]
    if (s >= 1040 && s <= 1250 && i % 2 === 0)
      console.log(`  s ${s.toFixed(0).padStart(5)}  ground ${res.stations.ground[i].toFixed(1).padStart(7)}  deck ${res.profile.y[i].toFixed(1).padStart(7)}  d ${(res.profile.y[i] - res.stations.ground[i]).toFixed(1).padStart(6)}`)
  }
}
