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
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SEED = parseWorldSeed('6')   // main.js default seed

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

const rec = JSON.parse(gunzipSync(readFileSync(join(HERE, '../data/route-cache-default.json.gz'))).toString('utf8'))

// (a) SIG — the bundle must match the live params, or the loader never imports it (dead asset).
log(rec.sig === routeCacheSig(SEED, RANGER_PARAMS), 'BUNDLE-SIG',
    'bundle sig matches routeCacheSig(defaultSeed, RANGER_PARAMS) — loader will import it')

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

console.log(`\nROUTE-BUNDLE-PARITY GATE: ${pass} pass, ${fail} FAIL — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
