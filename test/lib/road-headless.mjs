// test/lib/road-headless.mjs — construct + sample a real RoadSystem in node, no game / no dumps.
//
// The browser builds the road network from a live simplex coarse-height closure; here we inject a
// DETERMINISTIC synthetic coarseHeight via the RoadSystem ctor's coarseHeightOverride arg
// (road.js:345) so the network is a pure function of (worldSeed, world-coords, params) with no
// terrain Worker, no TerrainSystem, and no THREE scene. This is the substrate every headless road
// gate stands on (invariance.mjs, future replay.mjs).
//
// What it exposes:
//   COARSE_HEIGHT          — the synthetic terrain function (smooth, curving, real grade)
//   TEST_PARAMS            — RANGER_PARAMS subset the router + surface queries read
//   buildNetwork(center)   — a RoadSystem streamed + sliced around `center` (a fresh instance each
//                            call → independent streaming history, i.e. "freecam" vs "drive-in")
//   sampleRegion(road, region) → { runKeys, regionPoints, worldSamples, sliceBoundaries }
//
// The invariant under test (D-16): for a FIXED world region, everything sampleRegion returns must be
// identical regardless of which `center` the network was streamed around.

import * as THREE from 'three'
import { RoadSystem } from '../../src/road.js'

// ── Synthetic coarse terrain ────────────────────────────────────────────────────
// Smooth, low-frequency, multi-axis — produces gently curving valley-snapped anchors and roads with
// real (non-flat) grade so gradeY invariance is actually exercised (flat terrain → gradeY≈0 would
// pass d/gradeY trivially while hiding the bug). Deterministic, no RNG, no noise import.
export function COARSE_HEIGHT(x, z) {
    return (
        60 * Math.sin(x * 0.0040) +
        45 * Math.cos(z * 0.0032) +
        30 * Math.sin((x + z) * 0.0021) +
        18 * Math.cos((x - 2 * z) * 0.0015)
    )
}

// ── Params ───────────────────────────────────────────────────────────────────────
// Coarse + D-09 routing values mirror test/road-test-harness.js TEST_PARAMS (Phase 7/8 locked),
// plus the Phase 9 surface/query + arc-router fields the streaming + queryNearest paths read.
export const TEST_PARAMS = {
    // Coarse terrain layer (router ignores these when an override is supplied, but ctor still reads
    // them to build the simplex closure; harmless).
    coarseAmplitude: 150, coarseFreq: 0.0005, coarseOctaves: 4, ridgeSharpness: 1.6, terrainAmplitude: 1.0,

    // D-09 locked cost model (valley-trunk routing).
    maxRoadGrade: 0.15, roadWDist: 1, roadWAlt: 0.85, roadWGrade: 400, roadWOver: 8000, roadWTurn: 120,
    spurProbability: 0.15,

    // Arc-primitive router (D-arc) — defaults match _protoConnect's `?? ` fallbacks; set explicitly
    // so the harness is independent of those defaults drifting.
    roadArcHardRadius: 8, roadArcGentleRadius: 30, roadClearanceMargin: 0.5, roadArcHeurWeight: 1.5,
    roadMinTurnRadius: 45,

    // Phase 9 surface / query geometry (queryNearest footprint + grade smoothing window).
    roadHalfWidth: 5, roadShoulderWidth: 2.5, designGradeWindow: 50,
}

const WORLD_SEED = 6   // matches the seed used in the BUG-14 instrumented logs (memory)

// ── buildNetwork ───────────────────────────────────────────────────────────────
/**
 * Fresh RoadSystem streamed + sliced around `center`. A new instance per call gives each center an
 * independent streaming history — the faithful headless analogue of freecam-jumping vs driving-in.
 * @param {{x:number,z:number}} center — stream center (world XZ)
 * @returns {RoadSystem}
 */
export function buildNetwork(center) {
    const road = new RoadSystem(WORLD_SEED, TEST_PARAMS, COARSE_HEIGHT)
    road.update(new THREE.Vector3(center.x, 0, center.z))   // _streamNetwork + _sliceNetwork (no scene → no viz)
    return road
}

/**
 * ONE RoadSystem driven through a SEQUENCE of stream centers (the headless analogue of actually
 * driving/freecamming across the world — each update() is a real re-stream with cache reuse).
 * Used by restream-invariance.mjs to prove the final-state region is identical to a fresh build,
 * i.e. that re-stream cache handling never serves stale geometry/arc/grade.
 * @param {Array<{x:number,z:number}>} centers — visited in order; the LAST is the final state
 * @returns {RoadSystem}
 */
export function buildNetworkPath(centers, { probe = false } = {}) {
    const road = new RoadSystem(WORLD_SEED, TEST_PARAMS, COARSE_HEIGHT)
    for (const c of centers) {
        road.update(new THREE.Vector3(c.x, 0, c.z))
        // probe=true mirrors the real game: queries run EVERY frame, so runProfile/camberProfile
        // caches fill DURING streaming (keyed per-run, generation-not-bumped on positional re-stream).
        // A later re-stream that changes a run's extent must invalidate those caches or it serves
        // stale arcS→gradeY. Sampling around each center here populates the caches so the final-state
        // comparison actually exercises that invalidation path (without probe the caches are empty
        // until the final sample → the staleness is masked).
        if (probe) {
            for (let x = c.x - 600; x <= c.x + 600; x += 24)
                for (let z = c.z - 600; z <= c.z + 600; z += 24)
                    road.debugSampleAt(x, z)
        }
    }
    return road
}

// ── sampleRegion ──────────────────────────────────────────────────────────────────
const r3 = (v) => Math.round(v * 1000) / 1000   // mm rounding for byte-identical set comparison

/**
 * Extract everything the D-16 invariant must hold over, for a fixed world AABB region.
 * @param {RoadSystem} road
 * @param {{x0:number,x1:number,z0:number,z1:number,step?:number}} region
 * @returns {{
 *   runKeys: string[],                  // (a) band-relative run identities covering the region
 *   regionPoints: string[],             // (b) key-AGNOSTIC network geometry "x,y,z" inside region
 *   worldSamples: Array<{x,z,hit,rk,arcS,gradeY,pointY}>,  // (c)/(d) physics resolution per grid point
 *   sliceBoundaries: string[],          // (e) per-tile slice arcS0,arcS1 over region tiles
 * }}
 */
export function sampleRegion(road, region) {
    const { x0, x1, z0, z1 } = region
    const step = region.step ?? 8
    const inRegion = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1

    // (a) + (b): walk this._network (the canonical store) — runKeys touching the region, and the
    // geometry of every network point inside it (compared by VALUE so a key rename is not a failure;
    // a geometry shift is).
    const runKeys = []
    const regionPoints = []
    for (const [runKey, { points }] of road._network) {
        let touches = false
        for (const p of points) {
            if (inRegion(p.x, p.z)) {
                touches = true
                regionPoints.push(`${r3(p.x)},${r3(p.y)},${r3(p.z)}`)
            }
        }
        if (touches) runKeys.push(runKey)
    }

    // (e): slice arcS boundaries for every tile overlapping the region.
    const sliceBoundaries = []
    for (const [tileKey, segs] of road._tiles) {
        const [tx, tz] = tileKey.split(',').map(Number)
        const cx = (tx + 0.5) * 64, cz = (tz + 0.5) * 64   // CHUNK_SIZE = 64
        if (cx < x0 - 64 || cx > x1 + 64 || cz < z0 - 64 || cz > z1 + 64) continue
        for (const s of segs) sliceBoundaries.push(`${r3(s.arcS0 ?? 0)},${r3(s.arcS1 ?? 0)}`)
    }

    // (c) + (d): the physics resolution path itself (queryNearest → runProfile.gradeY), sampled on a
    // grid. This is the surface the truck actually drives on — the freecam tear made visible.
    const worldSamples = []
    for (let x = x0; x <= x1; x += step) {
        for (let z = z0; z <= z1; z += step) {
            const s = road.debugSampleAt(x, z)
            worldSamples.push({ x, z, hit: s.hit, rk: s.rk, arcS: s.arcS, gradeY: s.gradeY, camber: s.camber ?? 0, pointY: s.pointY })
        }
    }

    runKeys.sort()
    regionPoints.sort()
    sliceBoundaries.sort()
    return { runKeys, regionPoints, worldSamples, sliceBoundaries }
}
