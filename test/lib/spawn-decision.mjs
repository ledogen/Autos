// The spawn DECISION, replicated headlessly — shared by test/world-determinism.mjs (the gate) and
// test/spawn-identity.mjs (the PERF-19.3 measurement script).
//
// It is a replica of src/main.js `resolveSpawn`'s road probe, minus the browser-only warms: headless
// has no dispatcher, so `_warmTileBand` no-ops and `ensureTile` sync-routes the same byte-identical
// centerlines. ONE copy, because two would drift and the whole point of the gate above it is that
// this decision is stable.
//
// If resolveSpawn's probe changes — the tier radii, the recenter, the ±100 m seeded offset — this
// must change with it in the same commit, or the gate is asserting the determinism of something the
// game no longer does.
import * as THREE from 'three'
import { RoadSystem, CHUNK_SIZE } from '../../src/road.js'
import { seedFor } from '../../src/seed.js'

/** The seeded probe geometry — src/main.js `_spawnProbeBase`, verbatim. */
export function spawnProbeBase (seed, params) {
    const spawnSeed = seedFor(seed, 'spawn')
    return {
        spawnSeed,
        baseX: ((spawnSeed & 0xFFFF) / 0xFFFF - 0.5) * 200,
        baseZ: (((spawnSeed >>> 16) & 0xFFFF) / 0xFFFF - 0.5) * 200,
        tightR: Math.max(320, Math.round((params.roadSiteSpacing ?? 256) * 0.85)),
        spawnR: Math.max(200, Math.round((params.roadSiteSpacing ?? 256) * 1.5)),
    }
}

/**
 * Resolve the spawn for `seed`, optionally after laying down a prior streaming history.
 *
 * @param {number|string} seed
 * @param {object} params            RANGER_PARAMS (or a test variant)
 * @param {object} [opts]
 * @param {{x,z,r}|null} [opts.pre]  stream this first — what a warm session looks like when story
 *                                   mode is re-entered on an already-loaded seed
 * @param {number} [opts.recenterRadius]  radius the recenter's ensureTile streams over (PERF-19.3)
 * @param {number} [opts.playRadius]      the restored play radius
 * @param {Function} [opts.coarseHeight]  height sampler, when the caller has a headless one
 * @returns {{onRoad:boolean, tier?:number, x?:number, z?:number, heading?:number, recenterMoved?:number}}
 */
export function spawnDecision (seed, params, opts = {}) {
    const { pre = null, recenterRadius = 228, playRadius = 320, coarseHeight = null } = opts
    const road = coarseHeight ? new RoadSystem(seed, params, coarseHeight) : new RoadSystem(seed, params)
    if (pre) { road.setRadius(pre.r); road.update(new THREE.Vector3(pre.x, 0, pre.z)) }

    const { baseX, baseZ, tightR, spawnR } = spawnProbeBase(seed, params)
    const baseTX = Math.floor(baseX / CHUNK_SIZE), baseTZ = Math.floor(baseZ / CHUNK_SIZE)
    const tiers = [[tightR, tightR + 128], [spawnR, spawnR + 200]]
    let nearest = null, tier = -1
    for (let t = 0; t < tiers.length; t++) {
        const [qR, streamR] = tiers[t]
        road.setRadius(Math.max(playRadius, streamR))
        road.ensureTile(baseTX, baseTZ)
        nearest = road.queryNearest(baseX, baseZ, qR)
        if (nearest) { tier = t; break }
    }
    road.setRadius(playRadius)
    if (!nearest) return { onRoad: false }

    const preRecenter = { x: nearest.point.x, z: nearest.point.z }
    const spawnTX = Math.floor(nearest.point.x / CHUNK_SIZE), spawnTZ = Math.floor(nearest.point.z / CHUNK_SIZE)
    if (recenterRadius != null) road.setRadius(recenterRadius)
    road.ensureTile(spawnTX, spawnTZ)
    if (recenterRadius != null) road.setRadius(playRadius)
    const refined = road.queryNearest(nearest.point.x, nearest.point.z, 100) || nearest
    return {
        onRoad: true, tier,
        recenterMoved: Math.hypot(refined.point.x - preRecenter.x, refined.point.z - preRecenter.z),
        x: refined.point.x, z: refined.point.z,
        heading: Math.atan2(refined.tangent.x, refined.tangent.z),
    }
}
