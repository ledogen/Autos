// test/bake-route-bundle.mjs — regenerate data/route-cache-default.json.gz.
//
// Routed centerlines are pure functions of (worldSeed, routing-relevant params), so the default
// world's routes are baked at commit time and imported on boot: the shipped world never routes.
//
// This script is COMMITTED on purpose. It used to be recreated in a scratchpad each time it was
// needed, which meant the exact bake wiring (WaterSystem on headless rawHeightWorld, setWaterNoGo,
// the covered region) lived only in someone's memory — and the asset silently drifted from what
// the game actually needs. `test/route-bundle-parity.mjs` is the gate that catches drift; this is
// the fix it tells you to apply.
//
// COVERAGE: spawn band AND the story-mode mission planning radius. Missions plan over a 2.2 km
// network around the player (MISSION_PLAN_RADIUS); routing is ~99% of the cost of building it
// (19.5 s cold vs 0.21 s cached), so if those routes are in the bundle, opening story mode on the
// default seed is instant with no background warm-up at all.
//
// Run: node test/bake-route-bundle.mjs        (writes the .gz in place)
// Not a gate.
import { writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { routeCacheSig } from '../src/route-store.js'
import { parseWorldSeed, seedFor } from '../src/seed.js'
import { MISSION_PLAN_RADIUS } from '../src/mission.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '../data/route-cache-default.json.gz')
const SEED = parseWorldSeed('6')          // main.js default seed

// Live game wiring — must match route-bundle-parity.mjs exactly or the gate will reject the bake.
const { rawHeightWorld } = makeTerrainHeadless(SEED, RANGER_PARAMS, null)
const water = new WaterSystem(SEED, RANGER_PARAMS, rawHeightWorld)
const road = new RoadSystem(SEED, RANGER_PARAMS)
road.setWaterNoGo(
    (x, z) => water.isRoadNoGo(x, z),
    (minX, minZ, maxX, maxZ) => {
        const discs = []
        for (const p of water.pondsNear(minX, minZ, maxX, maxZ)) discs.push(p.floorX, p.floorZ, p.radius + p.skirt)
        return discs
    }
)

// Spawn point, same derivation main.js uses.
const ss = seedFor(SEED, 'spawn')
const baseX = ((ss & 0xFFFF) / 0xFFFF - 0.5) * 200
const baseZ = (((ss >>> 16) & 0xFFFF) / 0xFFFF - 0.5) * 200

// Grow the radius in rings: each ring reuses the previous ring's cache, so this is far cheaper
// than one cold pass at the final radius, and it keeps memory flat.
// Derived from the target, never hardcoded past it — a stale literal above MISSION_PLAN_RADIUS
// silently bakes (and ships) a bigger network than the game will ever ask for.
const RINGS = [480, 900, 1200].filter(r => r < MISSION_PLAN_RADIUS).concat([MISSION_PLAN_RADIUS])
for (const R of RINGS) {
    const t = Date.now()
    road.setRadius(R)
    road.update(new THREE.Vector3(baseX, 0, baseZ))
    console.log(`  ring ${String(R).padStart(4)} m … ${((Date.now() - t) / 1000).toFixed(1)} s  (cls ${road._proto.cls.size})`)
}

const dump = road.exportRouteCache()
const rec = { sig: routeCacheSig(SEED, RANGER_PARAMS), data: dump }
const gz = gzipSync(Buffer.from(JSON.stringify(rec), 'utf8'), { level: 9 })
writeFileSync(OUT, gz)
console.log(`\nwrote ${OUT}`)
console.log(`  ${dump.cls.length} routed + ${dump.clsSolo.length} solo connections · ${(gz.length / 1048576).toFixed(2)} MB gzipped`)
console.log(`  covers spawn (${baseX.toFixed(0)}, ${baseZ.toFixed(0)}) out to ${MISSION_PLAN_RADIUS} m (story-mode planning radius)`)
console.log('\nnow run: node test/route-bundle-parity.mjs')
