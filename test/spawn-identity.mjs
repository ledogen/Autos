// PERF-19.3 spawn-identity check (headless): does reducing the RECENTER stream radius change the
// chosen spawn for any seed? resolveSpawn's decision is a pure, deterministic function of the routed
// network (the warm is a no-op headlessly — the sync router fills the same byte-identical centerlines).
// So the only decision-affecting lever in the proposed "reduce what blocks ready" change is the
// stream radius the recenter's ensureTile registers over — and that feeds the BUG-25 cull, which can
// flip which run survives → change queryNearest. This harness measures that entanglement directly:
// for each seed it computes the spawn at the FULL recenter radius (HEAD) vs several REDUCED radii and
// diffs (x,z,heading) exactly.
import * as THREE from 'three'
import { RoadSystem, CHUNK_SIZE } from '../src/road.js'
import { seedFor } from '../src/seed.js'
import { COARSE_HEIGHT, TEST_PARAMS } from './lib/road-headless.mjs'

const PARAMS = { ...TEST_PARAMS, roadSiteSpacing: 640 }   // sparse graph (matches shipped default)

// Replicates resolveSpawn's road-probe DECISION (src/main.js ~349-415), minus the browser-only warms
// (headless has no dispatcher → _warmTileBand no-ops; ensureTile sync-routes the SAME centerlines).
// recenterRadius: null → HEAD behaviour (restore savedRadius before the recenter); a number → the
// candidate reduced radius the recenter's ensureTile streams over.
function spawnDecision(seed, { recenterRadius = null } = {}) {
    const road = new RoadSystem(seed, PARAMS, COARSE_HEIGHT)
    const spawnSeed = seedFor(seed, 'spawn')
    const baseX = ((spawnSeed & 0xFFFF) / 0xFFFF - 0.5) * 200
    const baseZ = (((spawnSeed >>> 16) & 0xFFFF) / 0xFFFF - 0.5) * 200
    const tightR = Math.max(320, Math.round((PARAMS.roadSiteSpacing ?? 256) * 0.85))
    const spawnR = Math.max(200, Math.round((PARAMS.roadSiteSpacing ?? 256) * 1.5))
    const baseTX = Math.floor(baseX / CHUNK_SIZE), baseTZ = Math.floor(baseZ / CHUNK_SIZE)
    const savedRadius = road._proto.radius
    const tiers = [[tightR, tightR + 128], [spawnR, spawnR + 200]]
    let nearest = null, tier = -1
    for (let t = 0; t < tiers.length; t++) {
        const [qR, streamR] = tiers[t]
        road.setRadius(Math.max(savedRadius, streamR))
        road.ensureTile(baseTX, baseTZ)
        nearest = road.queryNearest(baseX, baseZ, qR)
        if (nearest) { tier = t; break }
    }
    road.setRadius(savedRadius)
    if (!nearest) return { onRoad: false }
    const preRecenter = { x: nearest.point.x, z: nearest.point.z }
    const spawnTX = Math.floor(nearest.point.x / CHUNK_SIZE), spawnTZ = Math.floor(nearest.point.z / CHUNK_SIZE)
    if (recenterRadius != null) road.setRadius(recenterRadius)
    road.ensureTile(spawnTX, spawnTZ)
    if (recenterRadius != null) road.setRadius(savedRadius)
    const refined = road.queryNearest(nearest.point.x, nearest.point.z, 100) || nearest
    const moved = Math.hypot(refined.point.x - preRecenter.x, refined.point.z - preRecenter.z)
    return {
        onRoad: true, tier, recenterMoved: moved,
        x: refined.point.x, z: refined.point.z,
        heading: Math.atan2(refined.tangent.x, refined.tangent.z),
    }
}

const SEEDS = [6, 42, 7, 13, 21, 99, 100, 256, 777, 1234, 2026, 31337, 8, 55, 88]
const REDUCED = [228, 200, 150]   // 228 = the shipped recenter radius (100 m query + 128 m margin)
const eq = (a, b) => a.onRoad === b.onRoad && (!a.onRoad ||
    (a.x === b.x && a.z === b.z && a.heading === b.heading))

let anyDiff = false
console.log(`seed        tier  recenterΔ   ${REDUCED.map(r => `r=${r}`).join('   ')}`)
for (const seed of SEEDS) {
    const head = spawnDecision(seed, { recenterRadius: null })
    const cells = REDUCED.map(r => {
        const d = spawnDecision(seed, { recenterRadius: r })
        const same = eq(head, d)
        if (!same) anyDiff = true
        return same ? 'IDENT' : 'DIFFER'
    })
    const rc = head.onRoad ? head.recenterMoved.toFixed(2).padStart(8) : '   (off)'
    console.log(`${String(seed).padEnd(10)}  ${head.onRoad ? head.tier : '-'}   ${rc}    ${cells.map(c => c.padEnd(6)).join('  ')}`)
}
console.log(anyDiff
    ? '\nSPAWN-IDENTITY: at least one reduced radius CHANGED a spawn → that reduction is NOT byte-identical'
    : '\nSPAWN-IDENTITY: all reduced radii byte-identical across all seeds ✓')
