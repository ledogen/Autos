// GATE (BUG-179, DEC-366): the owner's capture seed 1684703087 — two legs of node −1,0,0 shared 30 m of pavement as
// two roads (the merge plan's role rule dropped the chained fork) and tore 6.12 m past the plane hold. With the chain
// admitted the second leg is a T off the first. Asserts: no leg pair within 1000 m of the origin tears on shared
// pavement (test/leg-overlap-census.mjs's measure: a 5 cm move across a winner flip rising > 0.10 m).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { legOverlaps } from './leg-overlap-census.mjs'

const ws = parseWorldSeed('1684703087'), road = new RoadSystem(ws, P)
wirePondNoGo(road, ws, P); road.setRadius(1300); road.update(new THREE.Vector3(0, 0, 0))
const terrain = makeTerrainHeadless(ws, P, road)
const rows = legOverlaps(road, (x, z) => terrain.analyticHeight(x, z), 1000)
for (const r of rows) console.log(`  step ${r.step.toFixed(2)} m  node ${r.node} (${r.x.toFixed(1)}, ${r.z.toFixed(1)}) ${r.d} m out  ${r.a} × ${r.b}`)
console.log(`${rows.length ? 'FAIL' : 'PASS'}: ${rows.length} leg pairs tear on shared pavement (${rows.pairs} walked)`)
process.exit(rows.length ? 1 : 0)
