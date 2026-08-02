// test/route-character.mjs — rainy-day tool: characterise the ROUTING CHARACTER of the run at a
// captured mark. Answers "why is this stretch wiggly and that one smooth?" with numbers.
//
//   node test/route-character.mjs <place-capture.json>
//
// The discriminator it prints last is the one that matters: net endpoint grade DEMAND divided by the
// router's soft grade target (roadGraphMaxGrade). Below 1 the router goes straight; above 1 it MUST
// lengthen the route by at least that ratio to gain the height inside the cap, and the only way to
// buy length inside a corridor is to switchback — so the road wiggles. Wiggliness is not a style
// choice anywhere in the cost model; it is that ratio crossing 1.
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'

const cap = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const { seed, params } = cap.world
const { mark } = cap.place
const road = new RoadSystem(seed, params)
road.update(new THREE.Vector3(mark.x, 0, mark.z))
const at = road.debugSampleAt(mark.x, mark.z)
const runKey = at.runKey
const e = road._network.get(runKey)
console.log(`\n### ${process.argv[2].split('/').pop()}  seed=${seed}  mark=(${mark.x.toFixed(0)},${mark.z.toFixed(0)})`)
console.log(`run ${runKey}  markArcS=${at.arcS.toFixed(1)}  cells ${e.cellA}→${e.cellB}`)

const L = e.polyCum.at(-1)
const DS = 2
const ks = [], gs = [], rawH = [], desH = []
for (let s = 0; s <= L; s += DS) {
    const a0 = road.runProfile(s - 4, runKey), a1 = road.runProfile(s + 4, runKey)
    const dot = Math.max(-1, Math.min(1, a0.tx*a1.tx + a0.tz*a1.tz))
    const cross = a0.tx*a1.tz - a0.tz*a1.tx
    ks.push(Math.sign(cross) * Math.acos(dot) / 8)          // signed curvature 1/m
    const p0 = road.runProfile(s - DS, runKey), p1 = road.runProfile(s + DS, runKey)
    gs.push((p1.gradeY - p0.gradeY) / (2*DS))
    const q = road.runPointAt(runKey, s)
    if (q) { rawH.push(road._coarseH(q.x, q.z)); desH.push(road.runProfile(s, runKey).gradeY) }
}
const stat = (a, f = v=>v) => { const b = a.map(f); const m = b.reduce((x,y)=>x+y,0)/b.length
    return { mean: m, max: Math.max(...b), p90: b.slice().sort((x,y)=>x-y)[Math.floor(b.length*0.9)] } }
const absK = stat(ks, Math.abs), absG = stat(gs, Math.abs)
let flips = 0, last = 0
for (const k of ks) { const s = Math.abs(k) < 1/400 ? 0 : Math.sign(k); if (s && last && s !== last) flips++; if (s) last = s }
const turnPer100 = ks.reduce((a,k)=>a+Math.abs(k),0) * DS / L * 100 * 180/Math.PI
const dev = desH.map((h,i)=>h - rawH[i])
const devS = stat(dev, Math.abs)
let rough = 0
for (let i = 1; i < rawH.length; i++) rough += Math.abs(rawH[i]-rawH[i-1])
console.log(`|κ|  mean ${absK.mean.toFixed(5)}  p90 ${absK.p90.toFixed(5)}  max ${absK.max.toFixed(5)}  (min radius ${(1/absK.max).toFixed(1)} m)`)
console.log(`grade  mean ${(absG.mean*100).toFixed(1)}%  p90 ${(absG.p90*100).toFixed(1)}%  max ${(absG.max*100).toFixed(1)}%`)
console.log(`WIGGLE: curvature sign flips ${flips} over ${L.toFixed(0)} m = 1 per ${(L/Math.max(1,flips)).toFixed(0)} m`)
console.log(`heading change ${turnPer100.toFixed(1)} deg per 100 m`)
console.log(`earthwork: |design-raw| mean ${devS.mean.toFixed(2)} m  max ${devS.max.toFixed(2)} m   (cap ${params.roadDeviationCap})`)
console.log(`terrain roughness along route: ${(rough/rawH.length/DS*100).toFixed(1)}% mean |dH/ds| of RAW ground`)
if (road._nodeJunctionsRev !== road._networkRev) road._detectNodeJunctions()
let deg2 = 0, nodes = 0
for (const n of road._nodeJunctions.values()) { if (n.legs.some(l=>l.runKey===runKey)) { nodes++; if (n.deg2) deg2++ } }
console.log(`nodes touching this run: ${nodes}  (deg-2 connector kinks: ${deg2})`)

// ── the routing-decision discriminator ────────────────────────────────────────────
const P = e.points
const a = P[0], b = P.at(-1)
const straight = Math.hypot(b.x-a.x, b.z-a.z)
const demand = Math.abs(road._coarseH(b.x, b.z) - road._coarseH(a.x, a.z)) / straight
const softCap = params.roadGraphMaxGrade ?? 0.20
console.log(`ROUTE DEMAND: straight ${straight.toFixed(0)} m, route ${L.toFixed(0)} m → detour ×${(L/straight).toFixed(2)}`)
console.log(`  endpoint grade demand ${(demand*100).toFixed(1)}%  ÷ soft cap ${(softCap*100).toFixed(0)}% (roadGraphMaxGrade)`
    + `  = FORCING RATIO ${(demand/softCap).toFixed(2)}  → ${demand/softCap > 1 ? 'SWITCHBACKS FORCED' : 'free to run straight'}`)
