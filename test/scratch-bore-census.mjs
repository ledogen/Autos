// test/scratch-bore-census.mjs — rainy-day script, NOT a gate.
// Every tunnel span in a streamed region, with length + world position, at a chosen portal price.
// USAGE: node test/scratch-bore-census.mjs [cPortal] [seed ...]
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const cPortal = Number(process.argv[2] ?? RANGER_PARAMS.roadV2.cPortal)
const seeds = process.argv.slice(3).length ? process.argv.slice(3) : ['6', '20', '11']
RANGER_PARAMS.roadV2.cPortal = cPortal

const RADIUS = 1400
const all = []
for (const seed of seeds) {
    const road = new RoadSystem(seed, RANGER_PARAMS)
    road.setRadius(RADIUS)
    road.update(new THREE.Vector3(0, 0, 0))
    let roadM = 0, boreM = 0, nBores = 0
    const bores = []
    for (const [runKey, e] of road._network) {
        roadM += e.polyCum[e.polyCum.length - 1]
        for (const sp of e.tunnelSpans || []) {
            const len = sp.s1 - sp.s0
            const c = road.runPointAt(runKey, (sp.s0 + sp.s1) / 2)
            const a = road.runPointAt(runKey, sp.s0)
            const b = road.runPointAt(runKey, sp.s1)
            boreM += len; nBores++
            bores.push({ seed, runKey, len, s0: sp.s0, s1: sp.s1,
                x: c?.x ?? NaN, y: c?.y ?? NaN, z: c?.z ?? NaN,
                ax: a?.x ?? NaN, az: a?.z ?? NaN, bx: b?.x ?? NaN, bz: b?.z ?? NaN })
        }
    }
    bores.sort((p, q) => p.len - q.len)
    const lens = bores.map((b) => b.len)
    const med = lens.length ? lens[Math.floor(lens.length / 2)] : 0
    console.log(`\n== seed ${seed}  cPortal=${cPortal}  r=${RADIUS} m ==`)
    console.log(`   edges ${road._network.size}  road ${(roadM / 1000).toFixed(1)} km  bores ${nBores}  bored ${boreM.toFixed(0)} m (${(100 * boreM / roadM).toFixed(2)} % of network)`)
    console.log(`   len: min ${lens[0]?.toFixed(1) ?? '-'}  med ${med.toFixed(1)}  max ${lens[lens.length - 1]?.toFixed(1) ?? '-'}`)
    const buckets = [[12, 25], [25, 50], [50, 100], [100, 200], [200, 1e9]]
    console.log('   ' + buckets.map(([a, b]) => `${a}-${b > 1e8 ? 'inf' : b}m:${lens.filter((l) => l >= a && l < b).length}`).join('  '))
    for (const b of bores.slice(0, 6)) {
        console.log(`     ${b.len.toFixed(1).padStart(6)} m  run ${b.runKey.padEnd(10)} mid (${b.x.toFixed(0)}, ${b.z.toFixed(0)})  y ${b.y.toFixed(1)}`)
    }
    all.push(...bores)
}
console.log('\nJSON ' + JSON.stringify(all))
