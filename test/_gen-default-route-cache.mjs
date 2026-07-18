// Regenerate ../data/route-cache-default.json.gz with the LIVE router + current RANGER_PARAMS
// (scratchpad pattern per QUAL-14/HANDOFF-2026-07-07: parity-gate wiring, bake radius 1160).
// Run from the worktree root so 'three' resolves.
import { writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { routeCacheSig } from '../src/route-store.js'
import { parseWorldSeed, seedFor } from '../src/seed.js'
import { makeTerrainHeadless } from '../test/lib/terrain-headless.mjs'

const SEED = parseWorldSeed('6')
const { rawHeightWorld } = makeTerrainHeadless(SEED, RANGER_PARAMS, null)
const water = new WaterSystem(SEED, RANGER_PARAMS, rawHeightWorld)
const r = new RoadSystem(SEED, RANGER_PARAMS)
r.setWaterNoGo(
    (x, z) => water.isRoadNoGo(x, z),
    (minX, minZ, maxX, maxZ) => {
        const discs = []
        for (const p of water.pondsNear(minX, minZ, maxX, maxZ)) discs.push(p.floorX, p.floorZ, p.radius + p.skirt)
        return discs
    }
)
const ss = seedFor(SEED, 'spawn')
const baseX = ((ss & 0xFFFF) / 0xFFFF - 0.5) * 200
const baseZ = (((ss >>> 16) & 0xFFFF) / 0xFFFF - 0.5) * 200
const t0 = performance.now()
r.setRadius(1160)
r.update(new THREE.Vector3(baseX, 0, baseZ))
const data = r.exportRouteCache()
const rec = { sig: routeCacheSig(SEED, RANGER_PARAMS), data }
writeFileSync('data/route-cache-default.json.gz', gzipSync(JSON.stringify(rec), { level: 9 }))
console.log(`baked ${data.cls.length} cls + ${data.clsSolo.length} solo in ${((performance.now() - t0) / 1000).toFixed(1)} s`)
