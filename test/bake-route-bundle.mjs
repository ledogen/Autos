// test/bake-route-bundle.mjs — regenerate the two route-cache assets.
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
// TWO ASSETS, because they are needed at different MOMENTS (PERF-26):
//
//   data/route-cache-default.json.gz  BASE   — the spawn band + Quick Job planning radius
//                                              (MISSION_PLAN_RADIUS). Awaited at boot: this is what
//                                              makes the default world start without routing.
//   data/route-cache-region.json.gz   REGION — everything the FEAT-43 story region's entry warm
//                                              (REGION_WARM_RADIUS_M) needs ON TOP of BASE. Fetched
//                                              in the BACKGROUND after boot, awaited only by story
//                                              entry — so free roam never pays for it.
//
// REGION is a DELTA, not a superset: it holds only the connections BASE lacks, so the two together
// are the same bytes the single combined asset was, split at the point where they are actually
// needed. Routing is ~99% of the cost of building a network (19.5 s cold vs 0.21 s cached), so with
// both imported, entering story mode on the default seed does no routing at all.
//
// Radii are DERIVED from the consuming constants, never literals: this asset once baked to 1700 m
// while story entry warmed to 2800 m, so 104 of 216 in-band edges routed live behind the loading
// screen on every entry. Importing the radii is what makes that failure impossible to reintroduce.
//
// SIZE IS NOT FREE (PERF-26). These are a DEV convenience — instant playtest cycles on the default
// seed — and the gzip is only half the cost: the combined 8.31 MB asset is 24.85 MB of JSON, and
// the decompress + JSON.parse lands on the MAIN THREAD (~100 ms here, several hundred on an old
// machine, plus the allocation spike). That parse cost is why BASE is kept small, and it is paid on
// every load, cached or not. Growing either radius grows its asset roughly with R².
//
// Run: node test/bake-route-bundle.mjs        (writes both .gz files in place)
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
import { REGION_WARM_RADIUS_M } from '../src/story.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_BASE = join(HERE, '../data/route-cache-default.json.gz')
const OUT_REGION = join(HERE, '../data/route-cache-region.json.gz')
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
// Derived from the consumers' radii, never hardcoded — a literal here can drift either way: below
// them and half the region routes live on entry (the 1700-vs-2800 bug), above them and we ship a
// bigger network than the game will ever ask for.
// +BAKE_MARGIN because the bake centres on the seed's spawn BASE point while the game centres the
// planner on the RESOLVED spawn (resolveSpawn nudges it to low-slope ground — ~155 m away on the
// default seed). Without the margin the planner's band pokes past the baked one and routes live.
const BAKE_MARGIN = 300
const BASE_TARGET = MISSION_PLAN_RADIUS + BAKE_MARGIN            // boot-blocking asset
const TARGET = Math.max(BASE_TARGET, REGION_WARM_RADIUS_M + BAKE_MARGIN)   // + background asset
const RINGS = [480, 900, 1200, 1700, 2200, 2700].filter(r => r < TARGET).concat([TARGET])

// The BASE/REGION split is taken by SNAPSHOTTING the cache the moment the base radius is complete:
// everything routed up to BASE_TARGET is BASE, everything added afterwards is the REGION delta.
// Snapshotting beats re-deriving the split from radii — the cache holds each connection under its
// own key, and "which radius first needed this edge" is not recoverable from the key.
let baseKeys = null
const snapshotBase = () => {
    baseKeys = { cls: new Set(road._proto.cls.keys()), clsSolo: new Set(road._proto.clsSolo.keys()) }
}
for (const R of RINGS) {
    const t = Date.now()
    road.setRadius(R)
    road.update(new THREE.Vector3(baseX, 0, baseZ))
    console.log(`  ring ${String(R).padStart(4)} m … ${((Date.now() - t) / 1000).toFixed(1)} s  (cls ${road._proto.cls.size})`)
    // Ring ladder is ascending, so the first ring at/above BASE_TARGET closes the base set. The
    // base warm below then tops it up with the runtime warm's own in-band edges.
    if (!baseKeys && R >= BASE_TARGET) {
        warmBand(BASE_TARGET, 'base warm')
        snapshotBase()
    }
}

// Also route everything the RUNTIME WARM will ask for (warmBandComplete's in-band edge set), or the
// game still routes on first open despite the bundle. update() only routes the registered edges and
// their direct dependencies; the warm additionally covers edges that register from a band centred
// slightly differently. Call with road.setRadius() already at `radius` — the band half-width is read
// off the live instance.
function warmBand (radius, label) {
    const t = Date.now()
    const cmx = Math.floor(baseX / 256), HW = road._bandHalfWidth()
    const PM = 2
    const g = road._buildUrquhart(cmx - HW - PM, cmx + HW + PM,
        Math.floor((baseZ - radius) / 256) - PM, Math.ceil((baseZ + radius) / 256) + PM, false)
    const wx0 = (cmx - HW - PM) * 256, wx1 = (cmx + HW + PM + 1) * 256
    const wz0 = (Math.floor((baseZ - radius) / 256) - PM) * 256
    const wz1 = (Math.ceil((baseZ + radius) / 256) + PM + 1) * 256
    const inBand = (c) => { const p = road._nodePos(c); return p.x >= wx0 && p.x < wx1 && p.z >= wz0 && p.z < wz1 }
    let n = 0
    for (const [c1, c2] of g.edges) {
        if (!inBand(c1) && !inBand(c2)) continue
        road._edgeCenterline(c1, c2)   // synchronous route → fills the cache we are about to export
        n++
    }
    console.log(`  ${label.padEnd(9)} … ${((Date.now() - t) / 1000).toFixed(1)} s  (${n} in-band edges, cls ${road._proto.cls.size})`)
}
warmBand(TARGET, 'warm set')

// ── split + write ───────────────────────────────────────────────────────────────────────────────
// BASE is the snapshot; REGION is everything the full bake added on top of it. Written as the same
// { sig, data } shape so one loader handles both — REGION merges into the live cache exactly the
// way BASE does (importRouteCache loads INTO the existing maps, it does not replace them).
const full = road.exportRouteCache()
if (!baseKeys) throw new Error('base snapshot never taken — is BASE_TARGET above every ring?')
const split = (rows, keys) => ({ mine: rows.filter(r => keys.has(r[0])), rest: rows.filter(r => !keys.has(r[0])) })
const cls = split(full.cls, baseKeys.cls)
const solo = split(full.clsSolo, baseKeys.clsSolo)

const write = (path, data, label, covers) => {
    const gz = gzipSync(Buffer.from(JSON.stringify({ sig: routeCacheSig(SEED, RANGER_PARAMS), data }), 'utf8'), { level: 9 })
    writeFileSync(path, gz)
    console.log(`\nwrote ${path}  [${label}]`)
    console.log(`  ${data.cls.length} routed + ${data.clsSolo.length} solo · ${(gz.length / 1048576).toFixed(2)} MB gzipped`)
    console.log(`  ${covers}`)
}
write(OUT_BASE, { cls: cls.mine, clsSolo: solo.mine }, 'BASE — awaited at boot',
    `spawn (${baseX.toFixed(0)}, ${baseZ.toFixed(0)}) out to ${BASE_TARGET} m = plan ${MISSION_PLAN_RADIUS} + ${BAKE_MARGIN} margin`)
write(OUT_REGION, { cls: cls.rest, clsSolo: solo.rest }, 'REGION delta — background, story only',
    `+ out to ${TARGET} m = story warm ${REGION_WARM_RADIUS_M} + ${BAKE_MARGIN} margin`)
console.log('\nnow run: node test/route-bundle-parity.mjs')
