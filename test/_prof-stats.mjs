// scratch: per-search stats for a cold stream (seed 6) — delete after PERF work
// usage: node test/_prof-stats.mjs [k=v RANGER_PARAMS overrides]
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
const overrides = {}
for (const a of process.argv.slice(2)) {
  const m = a.match(/^([A-Za-z][A-Za-z0-9]*)=(.+)$/)
  if (m) overrides[m[1]] = m[2] === 'true' ? true : m[2] === 'false' ? false : Number(m[2])
}
globalThis.__apcStats = []
const t0 = performance.now()
const road = new RoadSystem(6, { ...RANGER_PARAMS, ...overrides })
road.update(new THREE.Vector3(0, 0, 0))
const total = performance.now() - t0
const S = globalThis.__apcStats
const sum = (arr, k) => arr.reduce((a, s) => a + s[k], 0)
const grp = (name, arr) => console.log(`${name.padEnd(28)} n=${String(arr.length).padStart(4)} | ms ${sum(arr,'ms').toFixed(0).padStart(7)} | expand ${String(sum(arr,'expanded')).padStart(9)} | goal-miss ${arr.filter(s=>!s.goal).length}`)
console.log(`cold ${total.toFixed(0)} ms | searches ${S.length} | search-ms ${sum(S,'ms').toFixed(0)} | expansions ${sum(S,'expanded')}`)
grp('coarse passes', S.filter(s => s.coarse))
grp('tube-restricted fine', S.filter(s => s.tube))
grp('full fine (no tube)', S.filter(s => !s.coarse && !s.tube))
console.log(`escape-hatch retries: ${S.filter(s => s.escape).length}`)
