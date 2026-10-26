// test/deg2-apex-decomp.mjs — rainy-day tool (BUG-90 crest, the BUG-40 apex residual). NOT a gate.
//
//   node test/deg2-apex-decomp.mjs <place-capture.json>
//
// Finds the deg-2 connector nearest the capture's mark and walks its centreline, printing what
// _connectorDesignAt blends at each station: each leg's centreline grade, its lateral fold xs (crown +
// camber·lat), its gap to that leg's asphalt edge, its off-end distance, leg A's share of the weight,
// and the resulting design top (grade + lateral) relative to the node height. A crest that the legs do
// not have shows up as `vs node` going positive while both legs' grades fall away from the node.
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { WaterSystem } from '../src/water.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const cap = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const { seed, params } = cap.world, { mark } = cap.place
// Same water no-go wiring as replay.mjs — without it the network differs near ponds.
const { rawHeightWorld } = makeTerrainHeadless(seed, params, null)
const water = new WaterSystem(seed, params, rawHeightWorld)
const road = new RoadSystem(seed, params)
road.setWaterNoGo((x, z) => water.isRoadNoGo(x, z), (a, b, c, d) => {
    const o = []; for (const p of water.pondsNear(a, b, c, d)) o.push(p.floorX, p.floorZ, p.radius + p.skirt); return o })
road.update(new THREE.Vector3(mark.x, 0, mark.z))
road._detectNodeJunctions()

let node = null, best = 60
for (const n of road._nodeJunctions.values()) {
    const d = Math.hypot(n.pos.x - mark.x, n.pos.z - mark.z)
    if (n.deg2?.points && d < best) { best = d; node = n }
}
if (!node) { console.log('no deg-2 connector within 60 m of the mark'); process.exit(1) }
const arc = node.deg2, [kA, kB] = arc.netKeys
const nodeY = road.runProfile(road._network.get(kA).polyCum.at(-1), kA).gradeY
console.log(`node (${node.pos.x.toFixed(1)}, ${node.pos.z.toFixed(1)})  connector ${arc.polyCum.at(-1).toFixed(1)} m  A=${kA}  B=${kB}`)
console.log('    s |  A grade     xs   gap   off camb° |  B grade     xs   gap   off camb° | wA% | design top  vs node')
const deg = (k, x, z) => road.camberProfile(road._projectOntoRun(road._network.get(k), x, z).arcS, k) * 180 / Math.PI
const f = (v, w, d = 2) => v.toFixed(d).padStart(w)
for (let i = 0; i < arc.points.length; i++) {
    const p = arc.points[i]
    const a = road._runGradeAt(kA, p.x, p.z, {}), b = road._runGradeAt(kB, p.x, p.z, {})
    const cd = road._connectorDesignAt(arc, p.x, p.z, {})
    const fade = (d) => { const u = Math.min(1, Math.max(0, d / 4)); return 1 - u * u * (3 - 2 * u) }   // XS_OFF_FADE = 4
    let wA = 1 / (a.gap ** 2 + 0.25), wB = 1 / (b.gap ** 2 + 0.25)                                        // XS_SOFT² = 0.25
    if (wA * fade(a.off) + wB * fade(b.off) > 1e-9) { wA *= fade(a.off); wB *= fade(b.off) }
    const top = cd.grade + cd.lateral
    console.log(`${f(arc.polyCum[i], 5, 1)} | ${f(a.grade, 8, 3)} ${f(a.xs, 6, 3)} ${f(a.gap, 5)} ${f(a.off, 5)} ${f(deg(kA, p.x, p.z), 5, 1)} |` +
        ` ${f(b.grade, 8, 3)} ${f(b.xs, 6, 3)} ${f(b.gap, 5)} ${f(b.off, 5)} ${f(deg(kB, p.x, p.z), 5, 1)} | ${f(100 * wA / (wA + wB), 3, 0)} |` +
        ` ${f(top, 9, 3)} ${f(top - nodeY, 8, 3)}`)
}
