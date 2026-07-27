// test/route-bundle-parity.mjs — QUAL-14 bundled-cache staleness gate.
//
// data/route-cache-default.json ships the default world's routes as a static asset, imported on
// boot behind a param signature (src/route-store.js). The signature covers PARAMS but cannot see
// ROUTER CODE changes — a geometry-affecting router edit with unchanged params would let the
// bundle silently inject stale roads that no longer match what the sync fallback / worker would
// produce (breaking the cache↔fallback byte-identity invariant everything downstream leans on).
// This gate closes that hole: re-route a sample of bundled edges with the LIVE router (identical
// wiring to the bake script: WaterSystem on headless rawHeightWorld + setWaterNoGo) and assert
// byte-parity of the primitive descriptors. Fails ⇒ regenerate the asset (node
// test/bake-route-bundle.mjs) in the same commit as the router change.
//
// Run: node test/route-bundle-parity.mjs
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { routeCacheSig } from '../src/route-store.js'
import { parseWorldSeed, seedFor } from '../src/seed.js'
import { REGION_WARM_RADIUS_M } from '../src/story.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SEED = parseWorldSeed('6')   // main.js default seed

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

const rec = JSON.parse(gunzipSync(readFileSync(join(HERE, '../data/route-cache-default.json.gz'))).toString('utf8'))
// PERF-26: the bake emits TWO assets — BASE (above, awaited at boot) and the story-region DELTA
// (below, fetched lazily after boot). Both are written by the same bake run, so a half-regenerated
// pair is exactly the drift this gate exists to catch.
const reg = JSON.parse(gunzipSync(readFileSync(join(HERE, '../data/route-cache-region.json.gz'))).toString('utf8'))

// (a) SIG — the bundle must match the live params, or the loader never imports it (dead asset).
log(rec.sig === routeCacheSig(SEED, RANGER_PARAMS), 'BUNDLE-SIG',
    'bundle sig matches routeCacheSig(defaultSeed, RANGER_PARAMS) — loader will import it')
log(reg.sig === rec.sig, 'REGION-SIG',
    'region delta carries the SAME sig as base — a mismatched pair means only one half was re-baked')

// (a2) DISJOINT + NON-EMPTY — the region asset is a DELTA, not a second copy. Overlap means players
// download the same routes twice; an empty delta means the split silently collapsed and story entry
// is back to routing its whole region live (the 1700-vs-2800 bug, wearing a different hat).
{
    const baseKeys = new Set(rec.data.cls.map(e => e[0]))
    const dupes = reg.data.cls.filter(e => baseKeys.has(e[0])).length
    log(dupes === 0 && reg.data.cls.length > 0, 'REGION-DELTA',
        `${reg.data.cls.length} region-only routed connections, ${dupes} duplicated from base`)
}

// (b) PARITY — live router (game wiring) reproduces the bundled descriptors byte-for-byte over
// the spawn-probe region. A fresh instance routes every cache miss with the LIVE code; comparing
// the intersection of its cls against the bundle catches geometry drift.
{
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
    r.setRadius(480)   // small live-routed sample region (keeps the gate fast)
    r.update(new THREE.Vector3(baseX, 0, baseZ))

    const bundleCls = new Map(rec.data.cls)
    let compared = 0, mismatched = 0, firstBad = ''
    for (const [key, cl] of r._proto.cls) {
        if (!bundleCls.has(key)) continue
        compared++
        if (JSON.stringify(cl.primitives) !== JSON.stringify(bundleCls.get(key))) {
            mismatched++
            if (!firstBad) firstBad = key
        }
    }
    log(compared >= 3 && mismatched === 0, 'BUNDLE-PARITY',
        `${compared} bundled edges re-routed live, ${mismatched} descriptor mismatches${firstBad ? ` (first: ${firstBad})` : ''} — stale bundle ⇒ regenerate the asset`)
}

// (c) COVERAGE — the two assets together must cover the band story-mode entry actually warms.
// THE regression this pins: the bake targeted 1700 m while entry warmed to REGION_WARM_RADIUS_M
// (2800 m), so 104 of 216 in-band edges were uncached and routed live behind the loading screen on
// every single entry — invisible to the sig and parity checks above, because nothing was stale, it
// just stopped short. Now that the radii are imported rather than written down, this asserts the
// result rather than trusting the derivation.
{
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
    r.importRouteCache(rec.data)   // BASE  — what boot loads
    r.importRouteCache(reg.data)   // REGION — what story entry adds

    const ss = seedFor(SEED, 'spawn')
    const baseX = ((ss & 0xFFFF) / 0xFFFF - 0.5) * 200
    const baseZ = (((ss >>> 16) & 0xFFFF) / 0xFFFF - 0.5) * 200
    const R = REGION_WARM_RADIUS_M
    r.setRadius(R)
    const cmx = Math.floor(baseX / 256), HW = r._bandHalfWidth(), PM = 2
    const z0 = Math.floor((baseZ - R) / 256) - PM, z1 = Math.ceil((baseZ + R) / 256) + PM
    const g = r._buildUrquhart(cmx - HW - PM, cmx + HW + PM, z0, z1, false)
    const wx0 = (cmx - HW - PM) * 256, wx1 = (cmx + HW + PM + 1) * 256
    const wz0 = z0 * 256, wz1 = (z1 + 1) * 256
    const inBand = (c) => { const p = r._nodePos(c); return p.x >= wx0 && p.x < wx1 && p.z >= wz0 && p.z < wz1 }
    let n = 0, miss = 0
    for (const [c1, c2] of g.edges) {
        if (!inBand(c1) && !inBand(c2)) continue
        n++
        if (!r._proto.cls.has(r._edgeClsKey(c1, c2))) miss++
    }
    log(n > 50 && miss === 0, 'REGION-COVERAGE',
        `${miss} of ${n} in-band edges uncached at the ${R} m story warm — any miss routes live behind the loading screen`)
}

console.log(`\nROUTE-BUNDLE-PARITY GATE: ${pass} pass, ${fail} FAIL — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
