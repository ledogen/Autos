// SMOKE (not a gate — rainy-day script): roll Quick Jobs on the network story mode actually hands
// the planner, i.e. the PLAY RoadSystem warmed to REGION_RADIUS_M + WARM_MARGIN_M around the
// region centre and frozen. The mission-network gate plans on a 1400 m band for speed; this checks
// the real region band produces legal, in-region jobs.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { MissionSystem } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { mulberry32 } from '../src/seed.js'

let _rng = mulberry32(0xB0A7); Math.random = () => _rng()

const C = { x: 4500, z: 600 }
const t0 = Date.now()
const road = new RoadSystem(6, RANGER_PARAMS)
road.setRadius(REGION_WARM_RADIUS_M)
road.update(new THREE.Vector3(C.x, 0, C.z))
console.log(`region band ${REGION_WARM_RADIUS_M} m built in ${((Date.now() - t0) / 1000).toFixed(1)} s — ${road.networkGraph().edges.length} edges`)

const region = { x: C.x, z: C.z, r: REGION_RADIUS_M }
const ms = new MissionSystem({
  getRoad: () => road,
  getCar: () => ({ x: C.x, z: C.z, speed: 0 }),
  getSeed: () => 6,
  getRegion: () => region,
  teleport () {}, setMapOpen () {}, onChange () {},
})

let ok = 0, nulls = 0, escaped = 0, worst = 0
const lens = []
const t1 = Date.now()
for (let i = 0; i < 12; i++) {
  const m = ms._roll()
  if (!m) { nulls++; continue }
  ok++; lens.push(m.distance / 1000)
  for (const p of m.poly) {
    const d = Math.hypot(p.x - region.x, p.z - region.z)
    if (d > worst) worst = d
    if (d > region.r) { escaped++; break }
  }
}
const roll = (Date.now() - t1) / ok
console.log(`${ok}/12 rolls produced a job (${nulls} null), ${roll.toFixed(0)} ms/roll`)
console.log(`lengths ${Math.min(...lens).toFixed(1)}–${Math.max(...lens).toFixed(1)} km · worst radius ${worst.toFixed(0)} m of ${region.r} · ${escaped} escaped the wall`)
console.log(ok >= 10 && escaped === 0 ? 'SMOKE OK' : 'SMOKE BAD')
