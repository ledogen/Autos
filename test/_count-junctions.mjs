// scratch: junction degree histogram for a streamed window — delete after PERF work
// usage: node test/_count-junctions.mjs [k=v overrides incl. seed=N]
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
const overrides = {}
let seed = 6
for (const a of process.argv.slice(2)) {
  const m = a.match(/^([A-Za-z][A-Za-z0-9]*)=(.+)$/)
  if (!m) continue
  if (m[1] === 'seed') { seed = Number(m[2]); continue }
  overrides[m[1]] = m[2] === 'true' ? true : m[2] === 'false' ? false : Number(m[2])
}
const road = new RoadSystem(seed, { ...RANGER_PARAMS, ...overrides })
road.setRadius(1400)
road.update(new THREE.Vector3(-975, 0, 765))
const deg = new Map()
for (const [, e] of road._network) {
  for (const c of [e.cellA, e.cellB]) {
    const k = `${c[0]},${c[1]},${c[2]}`
    deg.set(k, (deg.get(k) || 0) + 1)
  }
}
const hist = {}
for (const [, d] of deg) hist[d] = (hist[d] || 0) + 1
console.log(`seed ${seed} | runs ${road._network.size} | degree histogram:`, JSON.stringify(hist))
