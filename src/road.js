/**
 * src/road.js — RoadSystem for RangerSim v1.1
 *
 * VALLEY-TRUNK STREAMING MODEL (the real routing core):
 *  - Endless roads are a deterministic chain of valley-snapped macro-anchors (256 m grid),
 *    connected east→east per macro-row by a soft-cost turn-penalty A* over raw coarseHeight.
 *  - Each row's east connections concatenate into ONE continuous polyline, post-processed
 *    (segment dedupe + collinear-simplify + proximity loop-removal), then split into kept runs.
 *  - _streamNetwork(center) builds those canonical centerline polylines into this._network
 *    (Map keyed deterministically by macro-row "<mz>:<runIndex>"), streamed around the view
 *    center like terrain chunks. this._network is the single source of truth for slicing (08-06),
 *    viz/wiring (08-07), and queries.
 *  - Cost model (D-09, LOCKED): edgeCost = wDist·horiz + wAlt·h + wGrade·grade²
 *      + wOver·max(0, grade − maxGrade) + wTurn·(Δheading/45°). The over-cap penalty is FINITE/SOFT
 *      (D-02 REVISED) — there is NEVER an Infinity edge / hard grade block. wAlt is the dominant
 *      stay-low term, so the route wraps AROUND high ground (D-04) instead of climbing it.
 *
 * FORBIDDEN patterns:
 *   Do NOT call terrain.getChunkHeight / chunk-sampled functions (chunk-load-order dependent).
 *   Do NOT call terrain.getAmplitudeScaledHeight (multiplies by terrainAmplitude — grade wrong).
 *   Do NOT call road.js from inside the physics fixed-timestep loop (route lazily, query O(1)).
 *   Do NOT allocate new THREE.Vector3 per frame in queryNearest (GC pressure).
 *   Do NOT re-introduce a hard grade block (grade > max → Infinity) — D-02 REVISED, soft over-cap only.
 *
 * Design decisions implemented here:
 *  - D-08: Valley-following streaming-anchor model IS the real RoadSystem core (not a disabled proto).
 *  - D-09: soft-cost A* (altitude + grade² + finite over-cap + turn penalty), never "no path".
 *  - D-02 (REVISED): soft over-cap penalty, NEVER a hard Infinity grade block.
 *  - D-04: dominant wAlt term makes the route wrap AROUND high ground.
 *
 * Phase: 8-road-routing
 * Plan: 08-05 (valley-trunk core); 08-06 (slicing); 08-07 (viz + wiring)
 */

import * as THREE from 'three'
import { seedFor, mulberry32 } from './seed.js'
import { createNoise2D } from 'simplex-noise'
import { crownProfile, potholeNoise, signedCurvature, arcPrimitiveConnect, smoothGradeInPlace } from './road-carve.js'
import { centerlineFromDescriptors, CenterlineCurve, Centerline } from './centerline.js'
// roadQuality imported for SURF-06 D-03: pothole severity uses the same per-stretch
// quality hook as markings. Importing from road-quality.js (not road-mesh.js) avoids
// the road-mesh.js → terrain.js → road.js chain issues.
import { roadQuality } from './road-quality.js'
import { perfAdd } from './perf.js'  // TEMP perf triage (D-arc)

// ── Module-scope scratch vectors (queryNearest allocation guard) ───────────────
// queryNearest is called at near-60fps cadence (resolveSpawn + Phase 9 consumption).
// Using a single reusable scratch vector for the per-sample distance check avoids
// per-sample Vector3 allocation (RESEARCH anti-pattern; GC pressure kills frame time).
// The two final return vectors (point, tangent) are still allocated once per call — only
// the search loop scratch is reused.
const _scratchPt  = new THREE.Vector3()
// _scratchTan: module-scope scratch for getTangentAt reuse in queryNearest D4 footprint check
// (avoids one Vector3 allocation per new-nearest sample — consistent with _scratchPt rationale).
const _scratchTan = new THREE.Vector3()

// ── Module-scope 2D segment intersection (D-16 / P9 junction detection) ────────
/**
 * XZ 2-D segment intersection test. Returns the crossing point {x,z} or null if
 * the segments are parallel, collinear, or only touch at an endpoint.
 * Open-interval test (t, u ∈ (1e-6, 1−1e-6)) means shared endpoints are NOT
 * counted as crossings — the caller's self-crossing removal / junction detection
 * logic handles endpoint touching cases separately.
 *
 * Pure function of its inputs — no allocations, no side effects.
 * Module scope so junction detection (_detectJunctions) can reuse it to find inter-run
 * crossings across different runs in this._network without duplicating the math.
 *
 * @param {number} ax — segment A start X
 * @param {number} az — segment A start Z
 * @param {number} bx — segment A end X
 * @param {number} bz — segment A end Z
 * @param {number} cx — segment B start X
 * @param {number} cz — segment B start Z
 * @param {number} dx — segment B end X
 * @param {number} dz — segment B end Z
 * @returns {{x:number, z:number}|null}
 */
function _segXZ(ax, az, bx, bz, cx, cz, dx, dz) {
    const ex = bx - ax, ez = bz - az
    const fx = dx - cx, fz = dz - cz
    const denom = ex * fz - ez * fx
    if (Math.abs(denom) < 1e-10) return null  // parallel/collinear
    const t = ((cx - ax) * fz - (cz - az) * fx) / denom
    const u = ((cx - ax) * ez - (cz - az) * ex) / denom
    if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) {
        return { x: ax + t * ex, z: az + t * ez }
    }
    return null
}

/**
 * Allocating linear interpolation between two Vector3 (used at SLICE time, not query cadence —
 * slicing is a one-shot per re-stream, so the allocation here is not on the hot query path).
 * @param {THREE.Vector3} a
 * @param {THREE.Vector3} b
 * @param {number} t — 0..1
 * @returns {THREE.Vector3} new vector a + (b-a)·t
 */
// Squared minimum distance between XZ segments A→B and C→D (no allocations). Used as the cheap
// COVER pre-filter: two connections can only overlap if their ANCHOR segments come close, and
// anchors are cheap/cached — so distant neighbours are skipped WITHOUT routing their centerline.
function _segSegDist2(ax, az, bx, bz, cx, cz, dx, dz) {
    const ux = bx - ax, uz = bz - az, vx = dx - cx, vz = dz - cz, wx = ax - cx, wz = az - cz
    const a = ux * ux + uz * uz, b = ux * vx + uz * vz, c = vx * vx + vz * vz
    const d = ux * wx + uz * wz, e = vx * wx + vz * wz
    const D = a * c - b * b
    let sc, sN, sD = D, tc, tN, tD = D
    if (D < 1e-9) { sN = 0; sD = 1; tN = e; tD = c }
    else {
        sN = b * e - c * d; tN = a * e - b * d
        if (sN < 0) { sN = 0; tN = e; tD = c }
        else if (sN > sD) { sN = sD; tN = e + b; tD = c }
    }
    if (tN < 0) { tN = 0; if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a } }
    else if (tN > tD) { tN = tD; if (-d + b < 0) sN = 0; else if (-d + b > a) sN = sD; else { sN = -d + b; sD = a } }
    sc = Math.abs(sN) < 1e-9 ? 0 : sN / sD
    tc = Math.abs(tN) < 1e-9 ? 0 : tN / tD
    const px = wx + sc * ux - tc * vx, pz = wz + sc * uz - tc * vz
    return px * px + pz * pz
}

function _lerpVec3(a, b, t) {
    return new THREE.Vector3(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t,
    )
}

// ── D2 camberProfile binary-search interpolation (plan 09-21) ─────────────────
/**
 * Binary-search + linear interpolation on a camber profile array pair.
 * Module-scope (allocation-free, no `this`) so camberProfile() can call it without
 * creating a closure per query. O(log N) per call.
 *
 * @param {number[]} arcPos    — monotone arc-length positions (metres)
 * @param {number[]} camberRad — corresponding banking angles (radians)
 * @param {number}   s         — query arc-length (metres)
 * @returns {number} interpolated camber angle (radians)
 */
function _interpolateCamber(arcPos, camberRad, s) {
    const N = arcPos.length
    if (N === 0) return 0
    if (s <= arcPos[0])     return camberRad[0]
    if (s >= arcPos[N - 1]) return camberRad[N - 1]
    let lo = 0, hi = N - 1
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1
        if (arcPos[mid] <= s) lo = mid; else hi = mid
    }
    const span = arcPos[hi] - arcPos[lo]
    if (span < 1e-9) return camberRad[lo]
    const t = (s - arcPos[lo]) / span
    return camberRad[lo] + t * (camberRad[hi] - camberRad[lo])
}

// ── P0 run-profile sampler (plan 09-25) ───────────────────────────────────────
/**
 * ONE binary search on arcPos, then interpolate all four profile arrays.
 * Module-scope (allocation-free, no `this`), O(log N) per call.
 * Returns the out-object reference (caller provides or we allocate once).
 *
 * @param {number[]} arcPos    — monotone arc-length positions (metres)
 * @param {number[]} gradeY    — Y-height per sample
 * @param {number[]} camberRad — banking angle (radians) per sample
 * @param {number[]} tx        — unit XZ tangent X per sample
 * @param {number[]} tz        — unit XZ tangent Z per sample
 * @param {number}   s         — query arc-length (metres)
 * @param {object}   out       — { gradeY, camberRad, tx, tz } object to write into
 * @returns {object} out — mutated with interpolated values
 */
function _interpolateRunProfile(arcPos, gradeY, camberRad, tx, tz, s, out) {
    const N = arcPos.length
    if (N === 0) {
        out.gradeY = 0; out.camberRad = 0; out.tx = 1; out.tz = 0
        return out
    }
    if (s <= arcPos[0]) {
        out.gradeY = gradeY[0]; out.camberRad = camberRad[0]; out.tx = tx[0]; out.tz = tz[0]
        return out
    }
    if (s >= arcPos[N - 1]) {
        out.gradeY = gradeY[N-1]; out.camberRad = camberRad[N-1]; out.tx = tx[N-1]; out.tz = tz[N-1]
        return out
    }
    // Binary search for interval [lo, hi] containing s.
    let lo = 0, hi = N - 1
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1
        if (arcPos[mid] <= s) lo = mid; else hi = mid
    }
    const span = arcPos[hi] - arcPos[lo]
    if (span < 1e-9) {
        out.gradeY = gradeY[lo]; out.camberRad = camberRad[lo]; out.tx = tx[lo]; out.tz = tz[lo]
        return out
    }
    const t = (s - arcPos[lo]) / span
    out.gradeY    = gradeY[lo]    + t * (gradeY[hi]    - gradeY[lo])
    out.camberRad = camberRad[lo] + t * (camberRad[hi] - camberRad[lo])
    out.tx        = tx[lo]        + t * (tx[hi]        - tx[lo])
    out.tz        = tz[lo]        + t * (tz[hi]        - tz[lo])
    return out
}

// Interpolate a monotonic table key[]→val[] (both ascending Float64Array, same length) at `k`.
// Used to map a run's polyline cumulative-XZ arc → centerline arc (Phase B slice mapping).
function _interpArcTable(key, val, k) {
    const n = key.length
    if (n === 0) return 0
    if (k <= key[0]) return val[0]
    if (k >= key[n - 1]) return val[n - 1]
    let lo = 0, hi = n - 1
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (key[m] <= k) lo = m; else hi = m }
    const span = key[hi] - key[lo] || 1
    const t = (k - key[lo]) / span
    return val[lo] + t * (val[hi] - val[lo])
}

// ── Module constants ───────────────────────────────────────────────────────────
/**
 * Tile side length in metres. MUST match terrain.js CHUNK_SIZE.
 * Both modules use 64 m tiles — roads and terrain chunks are aligned.
 * Coupling: if terrain.js CHUNK_SIZE changes, this must change too.
 */
export const CHUNK_SIZE = 64

// ── PROTOTYPE constants (valley-following streaming trunk — spike) ─────────────
// Non-destructive experimental routing for the Phase-8 redesign. Endless roads as a
// deterministic chain of valley-anchor connections, streamed around the view like terrain.
const PROTO_ANCHOR_SPACING = 256   // m between macro-grid anchors
const PROTO_CELL           = 10    // m — A* grid resolution for an anchor→anchor connection
const PROTO_MARGIN         = 120   // m — N/S detour room so a connection can wrap around a peak. PERF
                                   // (Tier 1): the arc-search lattice area is (256+2·margin)² so this
                                   // is the dominant per-connection cost knob (200→120 ≈ 1.8× faster);
                                   // 120 m still clears the DETOURS-AROUND-PEAK gate (119 m detour).
const PROTO_REGEN_MOVE     = 96    // m — re-stream the trunk once the view center moves this far
const PROTO_SAMPLE_DS      = 4     // m — centerline → polyline sampling spacing (profile/slice/query density)
// COVER suppression: a connection run is dropped where it runs on TOP of a lower-priority (lower-mz)
// row's road — adjacent rows whose valley-snapped anchors converge route duplicates otherwise. Checked
// against canonical neighbour geometry at fixed depth so the decision is window-invariant (see
// _streamNetwork). Crossings (different heading) are preserved — only same-direction overlap is cut.
const PROTO_COVER_D    = 36     // m — proximity that counts as "on top of" another road
const PROTO_COVER_DOT  = 0.93   // |cos| ~21° — heading similarity that counts as "parallel"
const PROTO_COVER_FRAC = 0.5    // drop the connection if more than half its length overlaps a lower row
const PROTO_COVER_DEPTH = 1     // rows below to check. Adjacent-row only: rows ≥2 apart are ≥282m apart
                               // after the ≤115m anchor snap (base 512m) — can't overlap (COVER_D 36m).
const PROTO_COVER_PREFILTER = 110  // m — anchor-segment proximity gate (slack over COVER_D for mid-span detour) before routing a neighbour
const PROTO_SNAP_CAP       = PROTO_ANCHOR_SPACING * 0.45  // m — max anchor gradient-descent displacement (keeps anchors in their lane → fewer parallel/duplicate roads)
const PROTO_PARAM_DEBOUNCE = 160   // ms — coalesce slider drags before re-routing
// 8-connectivity direction vectors (index 0..7); used for the turn-penalty A* state.
const PROTO_DIRS = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]
const _protoTurnSteps = (d1, d2) => { const a = Math.abs(d1 - d2); return Math.min(a, 8 - a) }  // 0..4 (×45°)
// Road Overhaul: the ribbon/carve sample each run's exact primitive centerline (CenterlineCurve)
// instead of re-fitting centripetal Catmull-Rom — the BUG-12 fold fix. (Flag retained as a guard:
// a run with no centerline descriptors still falls back to Catmull-Rom in _assignSlice.)
// Phase C deleted the patch stack that the dormant flag waited on (COVER overlap suppression,
// proximity loop-removal, owner-ratio run origin) — run identity is now the connection's own
// world key "mz:mx", band-independent by construction (see _streamNetwork).
const USE_CENTERLINE_RIBBON = true

// ── D-16: anchor-band half-width, SCALED to the active road radius ─────────────
// _streamNetwork builds each macro-row run over a band keyed by (mz, mx0, mx1). The Z (mz) extent
// already scales with the road radius R (= the draw-distance preset's terrain ring); the X (mx) band
// must too, or it under-covers the carved disc at the larger presets → runs that curve into the
// VISIBLE region but are anchored just outside the band drop out → a chunk gets carved with no road
// there → whole sections "disappear" on fly-over and never self-heal (Mechanism B).
//
// A run is keyed by its WEST anchor "mz:mx" but its geometry spans EAST to anchor(mx+1) (~1 cell) and
// each anchor valley-snaps ±PROTO_SNAP_CAP (~0.45 cell), so a west-anchored run reaches ~2.5 cells
// east of its column. To register every run whose geometry can enter the disc (radius R), the band
// half-width = ceil(R / spacing) + ROAD_BAND_MARGIN cells, where the margin absorbs that east-reach +
// snap + arc bulge. Per draw-distance preset: Near (R=192) → HW 2 / ±512 m (= the PERF-05 cost, the
// small disc can't be reached by a run anchored further out), Normal/Far (R=320/512) → HW 3 / ±768 m,
// Ultra (R=640) → HW 4 / ±1024 m. Run identity stays band-independent ("mz:mx"), so widening only
// changes WHICH runs land in the network, never their geometry/arcS (D-16 invariant). [margin=1
// validated: replay window-invariance on the disappearing-road capture passes with gradeΔ=hitΔ=0.]
const ROAD_BAND_MARGIN = 1  // extra macro-cols beyond ceil(R/spacing) each side (run east-reach + snap + bulge)

// ── D-16: grade-smoothing pad for band-edge gradeY invariance ──────────────────
// The longitudinal grade moving-average (smoothGradeInPlace, ±designGradeWindow m) reaches ACROSS
// connection joins for C0 continuity. A connection at the band edge (mx0/mx1) would otherwise get a
// TRUNCATED averaging window → its smoothed gradeY (and the terrain carve cut to it) shifts as the
// player moves and the band slides → window-VARIANT drivable surface (terrain holes / floating road
// on fly-over, not self-healing on drive-over). _streamNetwork assembles + grades PROTO_GRADE_PAD
// extra connections beyond the band on EACH side (pure fns of (mx,mz), identical from any center),
// then registers only the in-band connections — so every registered run is INTERIOR to the smoother
// and its gradeY is invariant. One connection (~256 m) already dwarfs the ±50 m window; 2 covers
// valley-snapped short connections too.
const PROTO_GRADE_PAD = 2

// ── Off-thread route pre-warm tuning (PERF-03 Workstream A) ───────────────────
const PREWARM_MARGIN    = 2   // extra macro-cols/rows beyond the streamer band to route AHEAD of need
const PREWARM_MAX_JOBS  = 4   // route jobs dispatched per warmRoutes() call — trickle, so they interleave
                              // with terrain heightmap generation on the shared Worker (no head-of-line stall)
const PREWARM_WARM_MOVE = 32  // m — only rescan/redispatch the pre-warm band after the center moves this far

// ── Module-scope pure height function ─────────────────────────────────────────
/**
 * Raw coarse terrain height at world (wx, wz), pre-amplitude.
 *
 * SYNC RULE: This function body is BYTE-IDENTICAL to coarseHeight() in
 * src/terrain.js (lines 284–300). Do NOT change either without updating the other.
 * The byte-identical copy ensures road grade math uses the same raw values as the
 * terrain rendering — grade is independent of the terrainAmplitude visual slider.
 *
 * @param {number} wx — world X coordinate (metres)
 * @param {number} wz — world Z coordinate (metres)
 * @param {Function} noiseCoarse — simplex noise closure (createNoise2D result)
 * @param {object} params — RANGER_PARAMS (needs coarseAmplitude, coarseFreq, coarseOctaves, ridgeSharpness)
 * @returns {number} raw coarse height in metres (pre-amplitude)
 */
function _coarseHeight(wx, wz, noiseCoarse, params) {
    const { coarseAmplitude, coarseFreq, coarseOctaves, ridgeSharpness } = params
    let h = 0
    let freq = coarseFreq
    let amp  = coarseAmplitude
    const gain = 0.5
    const lacunarity = 2.0
    for (let o = 0; o < coarseOctaves; o++) {
        const n = noiseCoarse(wx * freq, wz * freq)
        const ridged = 1.0 - Math.abs(n)
        const shaped = Math.pow(ridged, ridgeSharpness)
        h += shaped * amp
        freq *= lacunarity
        amp  *= gain
    }
    return h
}

// ── MinHeap — priority queue for A* open set ──────────────────────────────────
/**
 * Binary min-heap for A* open set.
 * push(item, priority) — O(log n)
 * pop()                — O(log n), returns lowest-priority item
 * size (getter)        — O(1)
 *
 * Source: standard binary heap pattern; sufficient for 16×16=256-cell routing grids.
 */
class MinHeap {
    constructor() {
        this._data = []
    }

    /**
     * Add an item with the given priority.
     * @param {*} item
     * @param {number} priority — lower value = higher priority (dequeued first)
     */
    push(item, priority) {
        this._data.push({ item, priority })
        this._bubbleUp(this._data.length - 1)
    }

    /**
     * Remove and return the lowest-priority item.
     * @returns {*} item
     */
    pop() {
        const top = this._data[0].item
        const last = this._data.pop()
        if (this._data.length > 0) {
            this._data[0] = last
            this._sinkDown(0)
        }
        return top
    }

    /** Number of items in the heap. */
    get size() { return this._data.length }

    _bubbleUp(i) {
        while (i > 0) {
            const p = (i - 1) >> 1
            if (this._data[p].priority <= this._data[i].priority) break
            ;[this._data[p], this._data[i]] = [this._data[i], this._data[p]]
            i = p
        }
    }

    _sinkDown(i) {
        const n = this._data.length
        while (true) {
            let min = i
            const l = 2 * i + 1
            const r = 2 * i + 2
            if (l < n && this._data[l].priority < this._data[min].priority) min = l
            if (r < n && this._data[r].priority < this._data[min].priority) min = r
            if (min === i) break
            ;[this._data[min], this._data[i]] = [this._data[i], this._data[min]]
            i = min
        }
    }
}

// ── RoadSystem ─────────────────────────────────────────────────────────────────
/**
 * Per-tile deterministic road routing system.
 *
 * Pure function of (worldSeed, tileX, tileZ, params) — the tile cache is
 * memoization only, not persistent state. Clearing the cache and re-routing
 * identical inputs always produces identical results.
 *
 * Constructor optionally accepts a coarseHeightOverride function for testing:
 * new RoadSystem(ws, params, mockCoarseHeight) — replaces the simplex closure
 * with the provided function, allowing switchback tests on synthetic terrain.
 */
export class RoadSystem {
    /**
     * @param {number} worldSeed — uint32 from parseWorldSeed()
     * @param {object} params — RANGER_PARAMS (road routing + coarse terrain fields required)
     * @param {Function|null} [coarseHeightOverride] — optional override for testing
     */
    constructor(worldSeed, params, coarseHeightOverride = null) {
        this._worldSeed          = worldSeed
        this._params             = params
        // (08-06) Old per-tile router caches (_tileCache/_waypointCache) removed — the canonical
        // stores are this._network (08-05) sliced into this._tiles (this plan). No per-tile cache.
        this._debugLines         = []         // THREE.Line objects added to scene on demand
        this._scene              = null       // set via init(scene)
        this._debugVisible       = false      // D-05: clean by default; toggled via setDebugVisible()
        this._noiseCoarse        = null       // built by _reinitNoise()
        this._coarseHeightOverride = coarseHeightOverride  // test injection point
        this._reinitNoise(worldSeed, params)
        this._protoInit()
    }

    /**
     * Attach a Three.js scene for debug line visualization.
     * Must be called before buildDebugLines().
     * @param {THREE.Scene} scene
     */
    init(scene) {
        this._scene = scene
    }

    // ── Noise init ─────────────────────────────────────────────────────────────
    /**
     * Build the coarse noise closure using the same seed derivation as TerrainSystem.
     * Byte-identical derivation: createNoise2D(mulberry32(seedFor(worldSeed, 'coarse')))
     * ensures _coarseH() returns the same raw heights as terrain.js main-thread closure.
     * @param {number} worldSeed
     * @param {object} params
     */
    _reinitNoise(worldSeed, params) {
        this._worldSeed  = worldSeed
        this._params     = params
        this._noiseCoarse = createNoise2D(mulberry32(seedFor(worldSeed, 'coarse')))
    }

    // ── Height accessor ────────────────────────────────────────────────────────
    /**
     * Raw coarse height at world (wx, wz).
     * If a coarseHeightOverride was provided at construction (test injection),
     * delegates to that instead of the simplex closure.
     *
     * @param {number} wx
     * @param {number} wz
     * @returns {number} raw metres (pre-amplitude)
     */
    _coarseH(wx, wz) {
        if (this._coarseHeightOverride) {
            return this._coarseHeightOverride(wx, wz)
        }
        return _coarseHeight(wx, wz, this._noiseCoarse, this._params)
    }

    // ── Public API (REBUILT in 08-06 / 08-07) ───────────────────────────────────
    // NOTE (08-05): The old per-tile router that these methods routed through has been
    // DELETED. They are retargeted onto the valley-trunk network (this._network) in 08-06
    // (ensureTile/queryNearest) and 08-07 (viz). Until then they are benign no-op stubs so
    // src/road.js imports cleanly and no live call path reaches removed symbols. main.js /
    // test harnesses are re-wired in 08-07.

    /**
     * Warm + slice the valley-trunk network around tile `(tileX, tileZ)` and return that tile's
     * single representative per-tile spline object — the exit-gate contract the seam harness reads
     * (`tile.spline.getPoint(1.0)`/`getPoint(0.0)`/`getTangentAt(...)`).
     *
     * Streams `_streamNetwork` centered on the tile's world center then `_sliceNetwork()` so the
     * sliced per-tile splines around the tile exist. Returns `{ spline, waypoints }` where `spline`
     * is the tile's representative segment (the longest segment, by control-point count) and
     * `waypoints` its control points, or `{ spline: null, waypoints: [] }` when the tile carries no
     * road (no throw). Idempotent: repeated calls with the same coords return the SAME cached tile
     * object (memoized per "tileX,tileZ" so the seam harness's two grid passes see identical splines).
     *
     * Because the network is streamed over a radius spanning the whole 3×3 grid, the trunk runs
     * continuously across adjacent tiles, so at least one E-W adjacent pair carries a spline on both
     * sides (exit-gate totalSeams >= 1).
     *
     * ⚠ IMPORTANT (WR-02): `.spline` is the *E-W-SPANNING SEAM REPRESENTATIVE ONLY* — the single
     * slice that touches BOTH the west and east tile boundary (`spanScore === 2`). It is NOT "the
     * road on this tile". A tile crossed by road that enters and exits the same edge, or runs
     * mostly N-S, has no spanning slice and returns `{ spline: null }` even though it visibly
     * carries road. Consumers needing the ACTUAL per-tile geometry (e.g. Phase 9 ribbon meshing)
     * MUST iterate `this._tiles.get("<tileX>,<tileZ>")` for ALL slices, not read this representative.
     * This method exists for the seam exit-gate's single-representative endpoint comparison; do not
     * repurpose its `.spline` as a per-tile road accessor.
     *
     * @param {number} tileX — tile column (world tile = [tileX·64,(tileX+1)·64))
     * @param {number} tileZ — tile row
     * @returns {{ spline: THREE.CatmullRomCurve3|null, waypoints: THREE.Vector3[] }}
     */
    ensureTile(tileX, tileZ) {
        const key = `${tileX},${tileZ}`

        // Warm + slice the network around this tile's world center. _streamNetwork is lazy-gated
        // (move-threshold / dirty), so close-together ensureTile calls across the 3×3 grid reuse the
        // same stream; on a real re-stream the memo is cleared (this._tileObjects nulled there).
        const cx = (tileX + 0.5) * CHUNK_SIZE
        const cz = (tileZ + 0.5) * CHUNK_SIZE
        this._streamNetwork(_scratchPt.set(cx, 0, cz))
        this._sliceNetwork()

        // Idempotency: same coords after the same slice → same cached tile object.
        const memo = this._tileObjects.get(key)
        if (memo) return memo

        // Pick the representative spline for this tile. The seam harness reads ONE .spline per tile
        // and compares end(A)=getPoint(1.0) of the west tile against start(B)=getPoint(0.0) of the
        // east tile. For that comparison to be C0/C1 for EVERY adjacent splined pair, a tile's single
        // representative must both END on its east boundary AND START on its west boundary — i.e. be
        // a FULL E-W-spanning slice (spanScore === 2, west→east-oriented in _assignSlice). Tiles whose
        // road only weaves through (no E-W-spanning slice) expose spline:null so the harness SKIPS
        // them (sparse-seam path) rather than comparing mismatched endpoints. Among spanning slices,
        // tie-break by heaviest parent run → run key → length (deterministic). queryNearest is
        // unaffected — it searches ALL slices in this._tiles directly, not this representative.
        const segs = this._tiles.get(key)
        let best = null
        const better = (s, m) => {
            if (s.spanScore !== 2) return false          // only full E-W-spanning slices are eligible
            if (!m) return true
            if (s.runWeight !== m.runWeight) return s.runWeight > m.runWeight
            if (s.runKey !== m.runKey) return s.runKey > m.runKey
            return s.points.length > m.points.length
        }
        if (segs && segs.length) {
            for (const s of segs) if (better(s, best)) best = s
        }
        const tile = best
            ? { spline: best.spline, waypoints: best.waypoints }
            : { spline: null, waypoints: [] }
        this._tileObjects.set(key, tile)
        return tile
    }

    /**
     * Find the nearest valley-trunk centerline point to world position `(wx, wz)` within `radiusM`,
     * returning `{ point, tangent }` (tangent UNIT length) or `null` if nothing is within radius.
     * D-07 consumer: `resolveSpawn` reads `nearest.point` + `nearest.tangent` to place the truck on
     * the road facing down it.
     *
     * Searches the sliced per-tile splines in `this._tiles`, restricted to a tile block sized from
     * the radius (`ceil(radiusM/CHUNK_SIZE)` tiles each way, so the block always covers the full
     * radius — CR-01), falling back to the raw `this._network` polylines if no spline came within
     * radius. Samples each candidate spline at arc-length intervals using the
     * module-scope `_scratchPt` for the per-sample probe (no per-sample allocation); only the two
     * returned vectors are allocated. Safe to call before any tile is warmed (returns null, no throw).
     *
     * 09-17 (SURF-04 gap closure): after probeSpline finds the nearest DISCRETE sample bestU (=i/n,
     * ~2 m spacing), a LOCAL PROJECTION REFINE maps (wx,wz) to a continuous parameter refinedU by
     * projecting onto the two XZ polyline segments bracketing bestU (prev→bestU and bestU→next).
     * This makes nr.point.y C0-continuous as the query moves — eliminating the ~2 m staircase that
     * previously kicked the suspension via _sampleCarveWorld(designY = nr.point.y). The refine is
     * O(1) and allocation-free (uses only scalar locals + _scratchPt reuse for bracket evaluation).
     *
     * @param {number} wx — world x
     * @param {number} wz — world z
     * @param {number} [radiusM=200] — max XZ distance to accept a hit
     * @returns {{ point: THREE.Vector3, tangent: THREE.Vector3, runKey: string, arcS: number, spline: THREE.Curve } | null}
     */
    queryNearest(wx, wz, radiusM = 200) {
        if (!this._tiles) return null
        const r2 = radiusM * radiusM

        // ── D4 (plan 09-20): stateless arm-disambiguation ─────────────────────────
        // Switchback arms are always laterally separated (never vertically stacked, user-confirmed).
        // Physics stays a pure 2D height field — signature unchanged.
        //
        // Strategy: track TWO parallel bests:
        //   intBest* — nearest sample on a spline whose footprint the query is INTERIOR to
        //              (|signedLat| ≤ footprint half-width = roadHalfWidth + roadShoulderWidth)
        //   extBest* — globally nearest sample regardless of footprint membership
        //
        // Final selection: if any interior candidate was found, prefer it over the exterior
        // globally-nearest; otherwise fall back to the globally-nearest (existing behavior).
        //
        // signedLat = dx*tz − dz*tx  (lateral distance, sign = side — same formula as _sampleCarveWorld).
        // getTangentAt is called ONLY when a new nearest sample is discovered (rare), so the per-sample
        // hot path adds no extra work beyond the one getPointAt that already runs.
        // No new Vector3 allocations in the hot path — getTangentAt reuse via _scratchTan.
        const footprintHW = (this._params.roadHalfWidth ?? 5) + (this._params.roadShoulderWidth ?? 2.5)

        let extBestD2 = r2,  intBestD2 = r2
        let extBestSpline = null, intBestSpline = null
        let extBestU = 0,    intBestU = 0
        let extBestN = 0,    intBestN = 0
        let extBestRunKey = '', intBestRunKey = ''
        let extBestArcLen = 0,  intBestArcLen = 0
        // BUG-10: run-arc endpoints of the matched slice (for run-global camber arcS + sign).
        let extBestArcS0 = 0, extBestArcS1 = 0, intBestArcS0 = 0, intBestArcS1 = 0

        // Aliases for the 09-17 projection refine (applied to whichever best wins below)
        let bestSpline = null, bestU = 0, bestN = 0, bestRunKey = '', bestArcLen = 0
        let bestArcS0 = 0, bestArcS1 = 0

        const qTileX = Math.floor(wx / CHUNK_SIZE)
        const qTileZ = Math.floor(wz / CHUNK_SIZE)

        // Probe one spline: sample at N arc-length intervals, track nearest U within radius.
        // D4: at each new global nearest, check footprint membership via getTangentAt → signedLat.
        const probeSpline = (spline, runKey, arcS0In, arcS1In) => {
            const len = spline.getLength ? spline.getLength() : 0
            // ~1 sample / 2 m, clamped to [16, 256] — enough resolution for a 200 m radius query.
            const n = Math.max(16, Math.min(256, Math.ceil((len || 64) / 2)))
            for (let i = 0; i <= n; i++) {
                const u = i / n
                spline.getPointAt(u, _scratchPt)
                const dx = _scratchPt.x - wx, dz = _scratchPt.z - wz
                const d2 = dx * dx + dz * dz
                if (d2 < extBestD2) {
                    extBestD2 = d2; extBestSpline = spline; extBestU = u; extBestN = n
                    extBestRunKey = runKey; extBestArcLen = len
                    extBestArcS0 = arcS0In; extBestArcS1 = arcS1In
                }
                // D4: check if this sample is a new interior nearest (footprint membership)
                if (d2 < intBestD2) {
                    // Compute signed lateral at this sample — getTangentAt reuses _scratchTan.
                    // This branch fires only when a new candidate is closer than the current
                    // interior best; the getTangentAt call is bounded by intBestD2, not extBestD2.
                    spline.getTangentAt(u, _scratchTan)
                    const tz = _scratchTan.z, tx = _scratchTan.x
                    // dx/dz are query − sample, so lateral = (sample − query) cross tangent
                    // signedLat = −dx*tz + dz*tx  (point-to-sample offset cross tangent, consistent
                    // with _sampleCarveWorld: signedLat = dx*tz − dz*tx where dx = samplePt − query)
                    const signedLat = (-dx) * tz - (-dz) * tx  // = dx_fwd*tz − dz_fwd*tx
                    if (Math.abs(signedLat) <= footprintHW) {
                        intBestD2 = d2; intBestSpline = spline; intBestU = u; intBestN = n
                        intBestRunKey = runKey; intBestArcLen = len
                        intBestArcS0 = arcS0In; intBestArcS1 = arcS1In
                    }
                }
            }
        }

        // Size the search block from the radius (CR-01). A hard-coded 3×3 block spans only ±1 tile
        // (±64 m), narrower than the default 200 m radius, so in-radius roads 2–3 tiles away were
        // silently missed and resolveSpawn fell through to terrain-only. `blk = ceil(radiusM/CHUNK_SIZE)`
        // guarantees every tile that could hold an in-radius point is scanned (200/64 → 4 tiles each way).
        const blk = Math.ceil(radiusM / CHUNK_SIZE)
        for (let dx = -blk; dx <= blk; dx++) {
            for (let dz = -blk; dz <= blk; dz++) {
                const key = `${qTileX + dx},${qTileZ + dz}`
                const segs = this._tiles.get(key)
                if (segs && segs.length) {
                    for (const s of segs) probeSpline(s.spline, s.runKey ?? '', s.arcS0 ?? 0, s.arcS1 ?? 0)
                }
            }
        }

        // D4 (plan 09-20): arm-disambiguation — prefer interior spline over exterior.
        // If any spline's footprint contains the query, use it; otherwise fall back to the
        // globally-nearest spline (existing 09-17 behavior, fully preserved).
        if (intBestSpline) {
            bestSpline  = intBestSpline;  bestU = intBestU; bestN = intBestN
            bestRunKey  = intBestRunKey;  bestArcLen = intBestArcLen
            bestArcS0   = intBestArcS0;   bestArcS1 = intBestArcS1
        } else {
            bestSpline  = extBestSpline;  bestU = extBestU; bestN = extBestN
            bestRunKey  = extBestRunKey;  bestArcLen = extBestArcLen
            bestArcS0   = extBestArcS0;   bestArcS1 = extBestArcS1
        }

        if (bestSpline) {
            // ── 09-17 PROJECTION REFINE ─────────────────────────────────────────────
            // probeSpline found the nearest DISCRETE sample bestU (step = du = 1/bestN, ~2 m).
            // Project (wx,wz) onto the two XZ segments bracketing bestU to find a continuous
            // refinedU. This eliminates the ~2 m Y staircase that causes the physics bounce.
            // All work is done in scalars or by reusing _scratchPt — no new Vector3 per call.
            const du = 1 / bestN
            const uPrev = Math.max(0, bestU - du)
            const uNext = Math.min(1, bestU + du)

            // Evaluate the three bracket points into scalars (reuse _scratchPt repeatedly).
            bestSpline.getPointAt(uPrev, _scratchPt)
            const prevX = _scratchPt.x, prevZ = _scratchPt.z

            bestSpline.getPointAt(bestU, _scratchPt)
            const midX = _scratchPt.x, midZ = _scratchPt.z

            bestSpline.getPointAt(uNext, _scratchPt)
            const nextX = _scratchPt.x, nextZ = _scratchPt.z

            // Project query (wx,wz) onto segment [prev→mid].
            let refinedU
            {
                const abX = midX - prevX, abZ = midZ - prevZ
                const lenSq = abX * abX + abZ * abZ
                const tA = lenSq < 1e-12 ? 0
                    : Math.max(0, Math.min(1, ((wx - prevX) * abX + (wz - prevZ) * abZ) / lenSq))
                const pxA = prevX + tA * abX, pzA = prevZ + tA * abZ
                const dA2 = (wx - pxA) ** 2 + (wz - pzA) ** 2

                // Project query (wx,wz) onto segment [mid→next].
                const cbX = nextX - midX, cbZ = nextZ - midZ
                const lenSqB = cbX * cbX + cbZ * cbZ
                const tB = lenSqB < 1e-12 ? 0
                    : Math.max(0, Math.min(1, ((wx - midX) * cbX + (wz - midZ) * cbZ) / lenSqB))
                const pxB = midX + tB * cbX, pzB = midZ + tB * cbZ
                const dB2 = (wx - pxB) ** 2 + (wz - pzB) ** 2

                // Pick the closer segment and map its projection fraction to a u value.
                if (dA2 <= dB2) {
                    refinedU = uPrev + tA * (bestU - uPrev)
                } else {
                    refinedU = bestU + tB * (uNext - bestU)
                }
            }
            refinedU = Math.max(0, Math.min(1, refinedU))

            // Two allocations (the returned vectors): point + unit tangent at the refined position.
            const point = bestSpline.getPointAt(refinedU)
            const tangent = bestSpline.getTangentAt(refinedU)   // getTangentAt returns a UNIT vector
            // BUG-10: arcS is now the RUN-GLOBAL arc (arcS0 + (arcS1−arcS0)·refinedU), NOT tile-local,
            // so camberProfile/roadQuality index the continuous run profile (no per-tile sawtooth).
            // camberSign maps the run-frame signed camber into a slice that may run E→W (reversed).
            // spline exposed for sampleDesignGradeAt (CR-01, plan 09-08) — WeakMap cache key.
            const runArcS = bestArcS0 + (bestArcS1 - bestArcS0) * refinedU
            const camberSign = bestArcS1 >= bestArcS0 ? 1 : -1
            return { point, tangent, runKey: bestRunKey, arcS: runArcS, camberSign, spline: bestSpline }
        }

        // Fallback: no sliced spline came within radius — probe the raw network polylines
        // (covers tiles whose slices were too short to spline, or queries before slicing settled).
        let fbD2 = r2
        let fbPoints = null
        let fbIdx = -1
        if (this._network) {
            for (const { points } of this._network.values()) {
                for (let i = 0; i < points.length; i++) {
                    const p = points[i]
                    const dx = p.x - wx, dz = p.z - wz
                    const d2 = dx * dx + dz * dz
                    if (d2 < fbD2) { fbD2 = d2; fbPoints = points; fbIdx = i }
                }
            }
        }
        if (!fbPoints) return null
        const p = fbPoints[fbIdx]
        const q = fbPoints[Math.min(fbPoints.length - 1, fbIdx + 1)]
        const rr = fbPoints[Math.max(0, fbIdx - 1)]
        const point = p.clone()
        const tangent = new THREE.Vector3(q.x - rr.x, q.y - rr.y, q.z - rr.z)
        if (tangent.lengthSq() < 1e-12) tangent.set(0, 0, 1)
        // Orient the fallback tangent WEST→EAST (increasing x) to match the sliced-spline path's
        // convention (_assignSlice reverses slices so getPoint(0)=west, getPoint(1)=east). Raw
        // this._network runs keep their build order and are NOT consistently W→E, so without this
        // the spawn heading (atan2(tangent.x, tangent.z)) could flip 180° vs the primary path
        // depending on build order (WR-04). Negate when the run points E→W so parity is deterministic.
        if (tangent.x < 0) tangent.negate()
        tangent.normalize()   // UNIT tangent (contract)
        // Fallback path: runKey unknown (network fallback lacks segment metadata), arcS=0.
        return { point, tangent, runKey: '', arcS: 0, camberSign: 1 }
    }

    /**
     * collectChunkSplinePoints — Pre-sample nearby road splines into a flat numeric array for the terrain carve hot path.
     *
     * This is the SINGLE getPointAt site for the _buildCarveTable carve path.  It performs the
     * same tile-block scan as queryNearest (CR-01 radius-sized block) and samples every
     * candidate spline at a fixed ~1.5 m arc interval.
     *
     * D4 (plan 09-20): stride widened from 3 to 5 to carry tangent XZ alongside position XYZ.
     * Each entry is [x, y, z, tx, tz] where (tx,tz) is the unit tangent at that arc position.
     * The carve inner loop (_buildCarveTable) uses these tangent components to apply the SAME
     * footprint-preference arm-disambiguation as queryNearest D4 — so the carved trough and
     * the physics height pick the same arm at switchbacks.
     *
     * Samples include points slightly beyond the chunk edge (the caller passes
     * `queryRadius = maxExt + CHUNK_SIZE * 0.71`, same as the chunk-level early-reject) so
     * adjacent chunks share the same spline points near their shared boundary — continuity
     * is preserved with no seam steps.
     *
     * @param {number} centerX — chunk centre world X
     * @param {number} centerZ — chunk centre world Z
     * @param {number} radiusM — search radius in metres (same value as queryNearest early-reject)
     * @returns {{ pts: number[], sampleArcS: number[], sampleRunKeys: string[] }}
     *   pts — flat [x0,y0,z0,tx0,tz0, x1,...] stride-5 (D4: position XYZ + tangent XZ).
     *   sampleArcS[i] — arc-length along the spline (metres) for sample i (pts[i*5..i*5+4]).
     *   sampleRunKeys[i] — canonical run key for sample i.
     *   D3 (plan 09-22): sampleArcS + sampleRunKeys allow _buildCarveTable to call
     *   camberProfile(arcS, runKey) per vertex (O(1) array lookup post-build — no spline eval).
     */
    collectChunkSplinePoints(centerX, centerZ, radiusM) {
        if (!this._tiles) return { pts: [], sampleArcS: [], sampleRunKeys: [], sampleCamberSign: [], sampleSegStart: [] }

        const qTileX = Math.floor(centerX / CHUNK_SIZE)
        const qTileZ = Math.floor(centerZ / CHUNK_SIZE)
        const blk    = Math.ceil(radiusM / CHUNK_SIZE)

        const pts          = []
        const sampleArcS   = []
        const sampleRunKeys = []
        const sampleCamberSign = []   // BUG-10: per-sample run-frame→slice-frame camber sign
        // QUAL-07: marks the FIRST sample of each seg. The flat array concatenates per-tile-slice segs;
        // the mesh carve (_buildCarveTable) does point-to-SEGMENT projection on consecutive samples, so
        // it must NOT form a segment across a seg boundary (segs aren't spatially contiguous in the
        // array). sampleSegStart[i] === 1 ⇒ sample i begins a new seg ⇒ segment [i-1,i] is invalid.
        const sampleSegStart = []

        for (let dx = -blk; dx <= blk; dx++) {
            for (let dz = -blk; dz <= blk; dz++) {
                const key  = `${qTileX + dx},${qTileZ + dz}`
                const segs = this._tiles.get(key)
                if (!segs || !segs.length) continue
                for (const seg of segs) {
                    const { spline } = seg
                    if (!spline) continue
                    // ~1 sample per 1.5 m, clamped to [2, 512].  This is the ONLY getPointAt
                    // site on the carve path — it runs ONCE per chunk (not per vertex).
                    const len    = spline.getLength ? (spline.getLength() || 64) : 64
                    const n      = Math.max(2, Math.min(512, Math.ceil(len / 1.5)))
                    const runKey = seg.runKey ?? ''
                    // BUG-10: run-GLOBAL arc + camber sign from the slice's arcS0/arcS1. Was tile-local
                    // (arcSOffset=0) → camber sawtoothed to the run start at every tile seam in the carve
                    // too, desyncing the trough from the banked ribbon. arcS(u)=arcS0+(arcS1−arcS0)·u.
                    const arcS0 = seg.arcS0 ?? 0, arcS1 = seg.arcS1 ?? len
                    const camberSign = arcS1 >= arcS0 ? 1 : -1
                    // 09-32: arcS keyed by CUMULATIVE XZ arc-length (identical to road-mesh.js
                    // sweepRibbon) — NOT uniform u. getPointAt(u) is 3D-arc-parameterised, which
                    // diverges from the run-arc (XZ) metric where the road climbs or the Catmull-Rom
                    // overshoots a boundary cut. With uniform u here but cumulative-XZ in the ribbon,
                    // the carved physics surface (analyticHeight, this table) drifted up to ~9 m from
                    // the rendered ribbon → the truck sank through the visual road. Keying BOTH on
                    // cumulative XZ makes analyticHeight == ribbon Y by construction (0 gap). Endpoints
                    // still map to arcS0/arcS1 (cum=0, cum=total) so chunk-seam continuity is preserved.
                    // Two-pass: getPointAt once per sample into a buffer, accumulate XZ, then emit.
                    const _bx = new Float64Array(n + 1), _by = new Float64Array(n + 1), _bz = new Float64Array(n + 1)
                    const _btx = new Float64Array(n + 1), _btz = new Float64Array(n + 1)
                    const _cum = new Float64Array(n + 1)
                    for (let i = 0; i <= n; i++) {
                        const u = i / n
                        const p = spline.getPointAt(u)   // allocates; only site — pre-loop
                        const t = spline.getTangentAt(u) // D4: tangent for arm-disambiguation
                        _bx[i] = p.x; _by[i] = p.y; _bz[i] = p.z; _btx[i] = t.x; _btz[i] = t.z
                        if (i > 0) _cum[i] = _cum[i - 1] + Math.hypot(_bx[i] - _bx[i - 1], _bz[i] - _bz[i - 1])
                    }
                    const _totXZ = _cum[n] || 1
                    for (let i = 0; i <= n; i++) {
                        // Stride 5: [x, y, z, tx, tz]
                        pts.push(_bx[i], _by[i], _bz[i], _btx[i], _btz[i])
                        // D3: parallel arc-length + runKey + camberSign arrays (indexed by sample number)
                        sampleArcS.push(arcS0 + (arcS1 - arcS0) * (_cum[i] / _totXZ))
                        sampleRunKeys.push(runKey)
                        sampleCamberSign.push(camberSign)
                        sampleSegStart.push(i === 0 ? 1 : 0)   // QUAL-07: seg boundary marker
                    }
                }
            }
        }

        return { pts, sampleArcS, sampleRunKeys, sampleCamberSign, sampleSegStart }
    }

    /**
     * Clear cached road data and remove any debug lines from the scene.
     * Clears the valley-trunk network and proto caches (the per-tile caches are gone).
     */
    invalidateCache() {
        for (const line of this._debugLines) {
            if (this._scene) this._scene.remove(line)
            if (line.geometry) line.geometry.dispose()
        }
        this._debugLines = []
        if (this._network) this._network.clear()
        if (this._tiles) this._tiles.clear()
        if (this._tileObjects) this._tileObjects.clear()
        this._slicedFrom = null
        this._lastBandSig = null   // force the next _streamNetwork to rebuild (route/params changed)
        // D1: bump the single invalidation counter — signals ribbon tiles + carve chunks to rebuild.
        this._generation++
        this._networkRev++         // invalidate per-run profile/adjacency caches (route/params changed)
        this._invalidateProto()
    }

    /**
     * Per-frame entry point (08-07): stream the valley-trunk network around `center`, slice it into
     * per-tile splines, and — if the viz is enabled — refresh the centerline debug lines for the new
     * window. The streamer is lazy-gated (move-threshold / dirty / param-debounce) so this is cheap
     * when nothing changed. This is THE single road update path the render loop calls (replaces the
     * retired updateProto).
     *
     * @param {THREE.Vector3} center — stream center (same as terrain stream center)
     */
    update(center) {
        const before = this._networkCenter
        // TEMP perf buckets (D-arc): split stream(routing) vs slice(spline build).
        let _pt = performance.now()
        this._streamNetwork(center)
        perfAdd('road.streamNetwork', performance.now() - _pt)
        _pt = performance.now()
        this._sliceNetwork()
        perfAdd('road.sliceNetwork', performance.now() - _pt)
        // Refresh viz lines only when the network actually re-streamed (center changed / first
        // build / re-route) and the viz is currently visible.
        if (this._debugVisible && (before !== this._networkCenter || this._debugLines.length === 0)) {
            this.buildDebugLines()
        }
    }

    /**
     * Set the streamed road radius (m) — how far around the view center the valley-trunk network is
     * built. Marks the network dirty so the next `update`/stream rebuilds the window at the new
     * radius. (Replaces the retired setProtoRadius — one viz now.)
     * @param {number} r — radius in metres
     */
    setRadius(r) {
        if (r > 0 && r !== this._proto.radius) {
            this._proto.radius = r
            this._proto.dirty = true
        }
    }

    /**
     * Rebuild the shipped centerline viz (D-05: centerline splines only) from the streamed/sliced
     * network. Clears any prior debug lines, then adds one THREE.Line per per-tile slice in
     * `this._tiles`, lifted onto the rendered surface (`this._proto.surfaceY` sampler if set, else
     * +1.0 m) so the lines sit on the terrain. Lines honor the current `this._debugVisible` flag.
     * Per-toggle visibility uses `setDebugVisible` (`.visible`), not a rebuild — no GC churn beyond
     * this one-shot rebuild on a new streamed window / re-route.
     */
    buildDebugLines() {
        // Clear prior lines (one-shot rebuild for a new streamed window / re-route).
        for (const line of this._debugLines) {
            if (this._scene) this._scene.remove(line)
            if (line.geometry) line.geometry.dispose()
            if (line.material) line.material.dispose()
        }
        this._debugLines = []
        if (!this._scene || !this._tiles) return

        // Draw the routed spline geometry Y (the truth) with a small constant lift (+0.5 m)
        // so the line sits just above the road ribbon.  The terrain is carved to meet the
        // spline, so the centerline viz simply draws the spline — no surface-lift toggle needed.
        for (const segs of this._tiles.values()) {
            for (const { spline, points } of segs) {
                if (!points || points.length < 2) continue
                // Sample the actual Catmull-Rom curve at ~2 m resolution (bounded 8..256) so the
                // debug line draws the smooth spline, not the coarse control polyline. Falls back
                // to points-clone if spline is absent (should not happen, but defensive).
                let seg
                if (spline) {
                    const len = spline.getLength()
                    const n = Math.max(8, Math.min(256, Math.ceil(len / 2)))
                    seg = spline.getPoints(n)
                } else {
                    seg = points.map(p => p.clone())
                }
                // Draw at routed spline Y + 0.5 m lift (continuous truth, no analyticHeight distortion).
                for (const p of seg) p.y += 0.5
                const line = _buildDebugLine2(seg, 0x00e5ff)
                line.visible = this._debugVisible
                this._scene.add(line)
                this._debugLines.push(line)
            }
        }
    }

    /**
     * Toggle the shipped centerline viz (D-05). Records the requested visibility and toggles each
     * existing line's `.visible` (NO dispose/recreate — GC anti-pattern). Auto-builds the lines on
     * first enable if none exist yet. `_debugVisible` defaults false (clean by default).
     * @param {boolean} visible
     */
    setDebugVisible(visible) {
        this._debugVisible = visible
        if (visible && this._debugLines.length === 0) {
            this.buildDebugLines()   // auto-build on first enable
        }
        for (const line of this._debugLines) {
            line.visible = visible
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VALLEY-TRUNK STREAMING CORE (the real routing engine — D-08)
    //
    // Endless deterministic roads as a chain of valley-anchor connections, streamed
    // around the view center each frame (same model as terrain chunks). Cost is
    // dominated by altitude + grade with a SOFT (finite) grade penalty, so the route
    // wraps AROUND high ground instead of climbing it (D-04 / D-02 REVISED). This IS
    // the canonical RoadSystem core: _streamNetwork(center) builds this._network (the
    // single source of truth for slicing/viz/queries). 08-07 retired the proto-only viz
    // API; the shipped centerline viz (buildDebugLines/setDebugVisible) and the per-frame
    // update(center) entry point now drive the one-and-only road visualization. The
    // network DATA is always built by _streamNetwork. (`this._proto` is kept as the
    // streamer's internal state bag — cost params, anchors, segs, stream radius.)
    // ═══════════════════════════════════════════════════════════════════════════

    _protoInit() {
        // Seed the cost weights from this._params (D-09 locked defaults in data/ranger.js)
        // — NO hardcoded weight literals. Live slider edits flow through via _refreshParams()
        // on each re-stream (debug sliders mutate this._params in place).
        const p = this._params || {}
        this._proto = {
            params: {
                wDist:      p.roadWDist      ?? 1,    // directness
                wAlt:       p.roadWAlt       ?? 0.85, // stay low (valley-seeking) — DOMINANT term (D-04)
                wGrade:     p.roadWGrade     ?? 400,  // gentle (quadratic grade²)
                wOver:      p.roadWOver      ?? 8000, // SOFT over-cap penalty — never Infinity (D-02 REVISED)
                maxGrade:   p.maxRoadGrade   ?? 0.15, // SOFT target the over-cap penalty measures against
                wTurn:      p.roadWTurn      ?? 120,  // per-45° turn penalty — long straights / true switchbacks
                minTurnRadius: p.roadMinTurnRadius ?? 45,  // QUAL-01 — m; coils tighter than this are excised
            },
            paramDirtyAt: 0,
            radius:   640,                                   // m — streamed road radius (set from terrain stream radius)
            anchors:  new Map(),                             // "mx,mz" → THREE.Vector3 (valley-snapped)
            cls:      new Map(),                             // "mx,mz:…" → Centerline (per-connection primitive curve)
            lastCenter: null,
            dirty:    true,
            surfaceY: null,                                  // optional (x,z)=>renderedHeight for visual line placement
        }
        // D1 — single invalidation source (plan 09-19).
        // Bumped on every re-route (invalidateCache) AND every real re-stream (_streamNetwork past
        // lazy gate). Consumed by ribbon tiles (road-mesh.js builtGeneration) and terrain-carve
        // chunks (terrain.js builtRoadGeneration) to detect and rebuild stale geometry.
        this._generation = 0

        // Network-content revision (D-16 Phase 3). Bumped on every re-route (invalidateCache) and
        // every re-stream that actually REBUILDS the network (not the identical-signature skip below).
        // Per-run caches (runProfile/camberProfile/adjacency) key off this instead of _generation:
        // a positional re-stream that produces identical geometry leaves _networkRev untouched, so
        // those caches survive (the perf win) — and a real change bumps it, lazily invalidating them
        // (replaces the old eager BUG-14 clear-on-restream band-aid). Distinct from _generation, which
        // still drives ribbon/carve MESH rebuilds.
        this._networkRev = 0
        this._lastBandSig = null   // signature of the last built network window (for the rebuild skip)

        // Canonical valley-trunk network store — built ONLY by _streamNetwork.
        // key "<mz>:<runIndex>" → { points: THREE.Vector3[] } (continuous centerline, raw routed y).
        this._network = new Map()
        this._networkCenter = null   // center the current network was streamed around

        // Per-tile sliced spline store — built ONLY by _sliceNetwork from this._network.
        // key "<tileX>,<tileZ>" → { spline, points, waypoints }[] (a tile MAY hold several segments).
        // Each segment is a slice of ONE continuous network polyline cut at 64 m (CHUNK_SIZE)
        // boundaries, so adjacent tiles share the exact boundary point (C0) and tangent (C1) by
        // construction — NO shared-seam-waypoint machinery (D-06 REVISED).
        this._tiles = new Map()
        this._slicedFrom = null      // identity of the network the current slice was built from
        // Memoized representative tile objects returned by ensureTile (idempotency for the seam
        // harness's two passes). key "<tileX>,<tileZ>" → { spline, waypoints }. Rebuilt on re-slice.
        this._tileObjects = new Map()

        // Junction detection cache (P9 plan 04 — SURF-07).
        // key nodeKey "<round(x)>,<round(z)>" → { pos: THREE.Vector3, legs: [{runKey, segIdx, dir}],
        //   nodeY: number, simpleMerge: bool }
        // Pure function of this._network — deterministic + window-invariant by transitivity (D-16).
        // Cleared on re-stream (same site as this._tiles.clear()).
        this._junctions = new Map()
        this._junctionsFrom = null   // identity guard for _detectJunctions memoization

        // ── Off-thread route pre-warming (PERF-03 Workstream A) ──────────────────
        // warmRoutes() asks a Worker to route the connections the streamer will soon need and posts
        // the resulting primitives back; ingestRoutedConnections() drops them into _proto.cls. The
        // synchronous _streamNetwork then finds cache HITS instead of paying the 12–21 ms arc search
        // on a macro-cell crossing — the routing hitch moves off the main thread. If no dispatcher is
        // set (headless gates, or before wiring) routing stays fully synchronous: identical behaviour,
        // so the invariance/restream gates are untouched. _routeEpoch tags each dispatch so a reply
        // from before a re-route (cls cleared) is discarded as stale.
        this._routeDispatch  = null        // (jobs, epoch) => post to Worker; set via setRouteDispatcher
        this._pendingRoutes  = new Set()   // cls keys requested from the Worker, awaiting a reply
        this._routeEpoch     = 0           // bumped on every _invalidateProto (param/route change)
        this._lastWarmCenter = null        // throttle: only rescan the pre-warm band after moving
    }

    // (08-07) The proto-only viz API (setProtoEnabled / setProtoParam / setProtoRadius / updateProto)
    // is retired — there is ONE viz now, toggled by setDebugVisible + driven by update()/buildDebugLines.
    // Live D-09 weight edits arrive by debug sliders mutating this._params; each re-stream refreshes
    // this._proto.params from this._params (see _refreshParams) so slider changes take effect.
    setSurfaceSampler(fn) { this._proto.surfaceY = fn }       // main.js passes terrainSystem.analyticHeight

    /**
     * D1 — generation counter accessor (plan 09-19).
     * Returns the current generation; increments whenever the road network re-routes
     * (invalidateCache) or truly re-streams (_streamNetwork past lazy gate).
     * Consumed by road-mesh.js (builtGeneration) and terrain.js (builtRoadGeneration)
     * to detect and frame-spread-rebuild stale ribbon tiles and carve chunks.
     * @returns {number}
     */
    roadGeneration() { return this._generation }

    /**
     * Wire the carve-free raw-height sampler used by sampleDesignGradeAt (CR-01, plan 09-08).
     * Must be rawHeightWorld — NOT analyticHeight (which re-introduces carve and would recurse).
     * Called from main.js after terrainSystem is constructed.
     * @param {Function} fn — (wx, wz) => number  carve-free raw terrain height (metres)
     */
    setRawHeightSampler(fn) { this._rawHeightSampler = fn }

    // Refresh the live cost weights from this._params (debug sliders mutate this._params in place).
    // Called on every re-stream so D-09 slider edits flow through deterministically (D-03).
    _refreshParams() {
        const p = this._params || {}
        const P = this._proto.params
        P.wDist      = p.roadWDist      ?? P.wDist
        P.wAlt       = p.roadWAlt       ?? P.wAlt
        P.wGrade     = p.roadWGrade     ?? P.wGrade
        P.wOver      = p.roadWOver      ?? P.wOver
        P.maxGrade   = p.maxRoadGrade   ?? P.maxGrade
        P.wTurn      = p.roadWTurn      ?? P.wTurn
        // D0: floor minTurnRadius ≥ roadHalfWidth + clearanceMargin + ε so the ribbon inner edge
        // cannot fold by construction. This clamp applies even when the slider is dragged below
        // the floor — the arc-fillet always receives a geometrically safe radius.
        const halfW     = p.roadHalfWidth       ?? 5
        const clearance = p.roadClearanceMargin ?? 0.5
        const floorR    = halfW + clearance + 0.1  // +0.1 m epsilon
        P.minTurnRadius = Math.max(p.roadMinTurnRadius ?? P.minTurnRadius, floorR)  // D0 floor
    }

    _invalidateProto() {
        this._proto.anchors.clear()
        // Param changes affect routing results → drop the per-connection centerline cache
        // (a pure fn of params, so the next miss recomputes the new value).
        if (this._proto.cls) this._proto.cls.clear()
        // Off-thread routing (PERF-03 WS-A): the cleared cache must be re-warmable, and any Worker
        // reply still in flight was routed against the OLD params → bump the epoch so it's discarded
        // as stale, and clear pending so the new params' connections get re-dispatched.
        this._routeEpoch++
        this._pendingRoutes.clear()
        this._lastWarmCenter = null   // force the next warmRoutes() to rescan against the new params
    }

    // ── Off-thread route pre-warming API (PERF-03 Workstream A) ──────────────────
    /**
     * Wire the Worker route dispatcher. `fn(jobs, epoch)` posts the jobs to a Worker that runs
     * arcPrimitiveConnect and replies via ingestRoutedConnections(). main.js routes this through the
     * terrain Worker (which already has the seeded coarse-noise the routes are computed against).
     * Until set, routing is fully synchronous (headless gates never set it → unchanged behaviour).
     */
    setRouteDispatcher(fn) { this._routeDispatch = fn }

    /** Current route epoch — dispatch tags carry it so stale (pre-re-route) replies are dropped. */
    routeEpoch() { return this._routeEpoch }

    /**
     * Macro-column band half-width (cells each side of the center column), SCALED to the active road
     * radius so the registered network always covers the carved disc at every draw-distance preset.
     * See the ROAD_BAND_MARGIN block: ceil(R / spacing) covers the disc, +margin absorbs a west-anchored
     * run's east-reach + anchor snap so no visible run is dropped (Mechanism B fix). Used by BOTH
     * warmRoutes (pre-warm) and _streamNetwork (register) so they stay consistent.
     */
    _bandHalfWidth() {
        return Math.ceil(this._proto.radius / PROTO_ANCHOR_SPACING) + ROAD_BAND_MARGIN
    }

    /**
     * Pre-warm the per-connection centerline cache around `center` by routing the connections the
     * streamer will soon need ON THE WORKER, ahead of need. By the time _streamNetwork's band reaches
     * a connection, it's already in _proto.cls → cache hit, no synchronous arc search → no macro-cell
     * crossing hitch. No-op without a dispatcher (gates / pre-wiring). Trickles ≤ PREWARM_MAX_JOBS
     * jobs per call and only rescans after the center moves PREWARM_WARM_MOVE m, so it can't flood the
     * shared Worker. Throttle is bypassed right after a re-route (_lastWarmCenter nulled).
     * @param {THREE.Vector3} center — same stream center the terrain + road update use
     */
    warmRoutes(center) {
        if (!this._routeDispatch) return
        if (this._lastWarmCenter && center.distanceTo(this._lastWarmCenter) < PREWARM_WARM_MOVE) return
        this._refreshParams()   // route against the CURRENT slider values (same as the next _streamNetwork)

        const R = this._proto.radius
        const center_mx = Math.floor(center.x / PROTO_ANCHOR_SPACING)
        // Pre-warm a superset of the registered band (+PREWARM_MARGIN) so the off-thread router fills
        // every connection _streamNetwork will register — same R-scaled half-width as the real stream.
        const HW = this._bandHalfWidth()
        const mx0 = center_mx - HW - PREWARM_MARGIN
        const mx1 = center_mx + HW + PREWARM_MARGIN
        const mz0 = Math.floor((center.z - R) / PROTO_ANCHOR_SPACING) - PREWARM_MARGIN
        const mz1 = Math.ceil((center.z + R) / PROTO_ANCHOR_SPACING) + PREWARM_MARGIN

        const jobs = []
        // Nearest macro-row first so the connections under/ahead of the view warm before the fringe.
        const center_mz = Math.floor(center.z / PROTO_ANCHOR_SPACING)
        const rows = []
        for (let mz = mz0; mz <= mz1; mz++) rows.push(mz)
        rows.sort((a, b) => Math.abs(a - center_mz) - Math.abs(b - center_mz))
        for (const mz of rows) {
            for (let mx = mx0; mx <= mx1; mx++) {
                if (jobs.length >= PREWARM_MAX_JOBS) break
                const spec = this._connRouteSpec(mx, mz)
                if (this._proto.cls?.has(spec.key) || this._pendingRoutes.has(spec.key)) continue
                this._pendingRoutes.add(spec.key)
                jobs.push({ key: spec.key, ax: spec.ax, az: spec.az, bx: spec.bx, bz: spec.bz, opts: spec.opts })
            }
            if (jobs.length >= PREWARM_MAX_JOBS) break
        }
        // Only advance the throttle anchor once the visible band is fully warmed/pending — otherwise a
        // single move could leave fringe connections un-dispatched until the NEXT PREWARM_WARM_MOVE.
        if (jobs.length < PREWARM_MAX_JOBS) this._lastWarmCenter = center.clone()
        if (jobs.length > 0) this._routeDispatch(jobs, this._routeEpoch)
    }

    /**
     * Consume Worker-routed connections: drop each {key, prims} into _proto.cls (the memoization the
     * synchronous router would otherwise fill). Stale replies (epoch != current — a re-route happened
     * since dispatch) are discarded wholesale. Pure cache population: the network/slices/queries are
     * untouched until the next natural _streamNetwork, which then finds these as cache hits.
     * @param {Array<{key:string, prims:object[]}>} results
     * @param {number} epoch — the route epoch the dispatch carried
     */
    ingestRoutedConnections(results, epoch) {
        if (epoch !== this._routeEpoch) return   // routed against stale params — discard
        if (!this._proto.cls) this._proto.cls = new Map()
        for (const { key, prims } of results) {
            this._pendingRoutes.delete(key)
            if (!prims) continue
            if (!this._proto.cls.has(key)) this._proto.cls.set(key, centerlineFromDescriptors(prims))
        }
    }

    // Deterministic valley anchor for macro-cell (mx,mz): seeded candidate in the cell,
    // then gradient-descended onto the local valley floor (pure function of seed+coords).
    _protoAnchor(mx, mz) {
        const key = `${mx},${mz}`
        const cached = this._proto.anchors.get(key)
        if (cached) return cached
        const rng = mulberry32(seedFor(this._worldSeed, 'roadanchor', mx, mz))
        let wx = (mx + rng()) * PROTO_ANCHOR_SPACING
        let wz = (mz + rng()) * PROTO_ANCHOR_SPACING
        let h  = this._coarseH(wx, wz)
        const ox = wx, oz = wz   // original candidate — cap displacement so anchors stay in their lane
        // Gradient descent to a local minimum (bounded so adjacent cells don't collapse to one valley).
        for (let s = 0; s < 48; s++) {
            const step = 8
            let bx = wx, bz = wz, bh = h
            for (let a = 0; a < 8; a++) {
                const ang = a / 8 * Math.PI * 2
                const nx = wx + Math.cos(ang) * step, nz = wz + Math.sin(ang) * step
                const nh = this._coarseH(nx, nz)
                if (nh < bh) { bh = nh; bx = nx; bz = nz }
            }
            if (bh >= h) break
            if (Math.hypot(bx - ox, bz - oz) > PROTO_SNAP_CAP) break  // lane cap (reduces duplicate roads)
            wx = bx; wz = bz; h = bh
        }
        const v = new THREE.Vector3(wx, h, wz)
        this._proto.anchors.set(key, v)
        return v
    }

    // BUG-12: canonical per-anchor heading — the chord direction through the row neighbors
    // (anchor(mx-1) → anchor(mx+1)). A PURE function of world anchors (each itself a deterministic
    // function of grid coords), so it is window-invariant: every segment touching anchor (mx,mz) —
    // on either side — independently targets this SAME heading there, so consecutive arc segments
    // meet G1 (shared tangent) instead of at a sharp corner. No runtime pose is threaded across the
    // window, which is what keeps the join fix invariant (D-16).
    _protoAnchorHeading(mx, mz) {
        const prev = this._protoAnchor(mx - 1, mz)
        const next = this._protoAnchor(mx + 1, mz)
        return Math.atan2(next.z - prev.z, next.x - prev.x)
    }

    _protoEdgeCost(fromH, toH, horiz, P) {
        const grade = Math.abs(toH - fromH) / horiz
        const over  = Math.max(0, grade - P.maxGrade)
        return P.wDist * horiz + P.wAlt * toH + P.wGrade * grade * grade + P.wOver * over
    }

    // (Road Overhaul Phase C: _protoConnect / _protoSimplify / _removeLoops / _removeSelfCrossings
    // deleted. The routed centerline (_protoConnectCenterline below) is now the SOLE representation;
    // _streamNetwork samples it into the run polyline (Y = coarse height), so the separate point-mode
    // search + collinear-simplify + loop/self-crossing cleanup are all gone — and routing runs ONCE
    // per connection, not twice. _segXZ stays (module scope, _detectJunctions inter-run crossings).)

    // Road Overhaul — the connection's primitive centerline (THE routed representation). Same anchors,
    // same canonical headings, same
    // router cost model — but emitPrimitives:true so the result is the EXACT curvature-bounded curve
    // (line/arc/Dubins-terminal primitives, radius ≥ hardR by construction) carried end-to-end with
    // no Catmull-Rom re-fit. Returns a Centerline; window-invariant (pure fn of the anchor pair).
    // Deterministic route SPEC for east connection (mx,mz)→(mx+1,mz): the cls cache key, anchor
    // endpoints, and the exact arcPrimitiveConnect opts. Shared by _protoConnectCenterline (synchronous
    // compute) and warmRoutes (the off-thread Worker job) so the pre-warmed route is byte-identical to
    // the synchronous fallback — same anchors, same canonical headings, same cost weights.
    _connRouteSpec(mx, mz) {
        const a = this._protoAnchor(mx, mz), b = this._protoAnchor(mx + 1, mz)
        const key = `${mx},${mz}:${a.x.toFixed(0)},${a.z.toFixed(0)}>${b.x.toFixed(0)},${b.z.toFixed(0)}`
        const P = this._proto.params
        const pp = this._params || {}
        const halfW = pp.roadHalfWidth ?? 5, clearance = pp.roadClearanceMargin ?? 0.5
        const hardR = Math.max(pp.roadArcHardRadius ?? 8, halfW + clearance + 0.1)
        const opts = {
            hardR, gentleR: pp.roadArcGentleRadius ?? 30, margin: PROTO_MARGIN,
            wDist: P.wDist, wAlt: P.wAlt, wGrade: P.wGrade, wOver: P.wOver,
            maxGrade: P.maxGrade, wCurv: P.wTurn, wHeur: pp.roadArcHeurWeight ?? 1.5,
            valleyDepthCap: pp.roadValleyDepthCap ?? 40,
            // QUAL-05 follow-up: fixed-angle palette → large sweeping radii (see ranger.js roadArc*).
            radii: pp.roadArcRadii, hbins: pp.roadArcHeadingBins, gradeSamples: pp.roadArcGradeSamples,
            maxNodes: pp.roadArcMaxNodes ?? 300000,
            // FEAT-10 earthwork routing: when earthworkWindow>0 the router costs grade against a
            // spatially LOW-PASSED terrain (the design grade the carve will build) instead of raw
            // terrain — so it stops spiralling to follow every bump — and pays wDev per metre of
            // |lowpass − raw| (the fill/cut earthwork). Default 0 = off (terrain-following, unchanged).
            earthworkWindow: pp.roadEarthworkWindow ?? 0, wDev: pp.roadWDeviation ?? 0,
            deviationCap: pp.roadDeviationCap ?? Infinity,
            startHeading: this._protoAnchorHeading(mx, mz),
            goalHeading:  this._protoAnchorHeading(mx + 1, mz),
            emitPrimitives: true,
        }
        return { key, ax: a.x, az: a.z, bx: b.x, bz: b.z, opts }
    }

    _protoConnectCenterline(mx, mz) {
        if (!this._proto.cls) this._proto.cls = new Map()
        const spec = this._connRouteSpec(mx, mz)
        const cached = this._proto.cls.get(spec.key)
        if (cached) return cached
        // Synchronous miss: the pre-warm Worker didn't reach this connection in time (cold load / fast
        // teleport / no dispatcher) — route it now. Same spec the Worker uses → identical result, so
        // the cache value is the same whichever path populates it (and gates, which never set a
        // dispatcher, always take this path → unchanged behaviour).
        const descs = arcPrimitiveConnect(spec.ax, spec.az, spec.bx, spec.bz, (x, z) => this._coarseH(x, z), spec.opts)
        const cl = centerlineFromDescriptors(descs)
        this._proto.cls.set(spec.key, cl)
        this._pendingRoutes.delete(spec.key)   // a still-in-flight Worker reply for this key is now redundant
        return cl
    }

    // Road Overhaul, Phase B — a primitive centerline over the ABSOLUTE column span [mxLo, mxHi],
    // concatenating each east connection's primitives. They join G1 at the shared anchors (canonical
    // headings), so the concatenation is the EXACT curve the row polyline samples. A COVER-split run
    // restricts it to its own span (subrange) → the run centerline the ribbon/carve/query sample
    // instead of re-fitting Catmull-Rom (BUG-12 fold fix).
    //
    // D-16: the span MUST be derived from the run's own (window-invariant) geometry, NOT the streaming
    // band [mx0,mx1] — a band-relative span makes the centerline length (and thus nearest()'s
    // coarse-scan resolution) center-dependent, drifting the subrange clip points and breaking
    // arcS/gradeY invariance. Per-connection centerlines are cached, so per-run rebuild is cheap.
    _buildRowCenterline(mxLo, mxHi, mz) {
        const prims = []
        for (let mx = mxLo; mx <= mxHi; mx++) {
            const cl = this._protoConnectCenterline(mx, mz)
            for (const p of cl.primitives) prims.push(p)
        }
        return new Centerline(prims)
    }

    // ── Canonical network builder (D-08) ────────────────────────────────────────
    /**
     * Build the canonical valley-trunk network around `center` into this._network — the
     * single source of truth for slicing (08-06), viz (08-07), and queries. Pure data:
     * allocates NO scene lines and applies NO visual y-lift (those are render-only, 08-07);
     * the network y is the raw routed height.
     *
     * Pipeline (Road Overhaul): over the streamed macro-cell window, each east connection
     * _protoConnect(_protoAnchor(mx,mz), _protoAnchor(mx+1,mz)) is ONE run keyed "<mz>:<mx>" —
     * a pure function of the anchor pair, band-independent → window-invariant by construction
     * (no COVER overlap split, no loop-removal, no owner-ratio origin). Grade is smoothed over the
     * whole row then split at anchors (C0 at the shared point). Each run is stored as
     * this._network["<mz>:<mx>"] = { points, arcOrigin:0, centerline, polyCum, clArc }, where
     * `centerline` is the connection's exact curvature-bounded primitive curve the ribbon samples.
     *
     * Lazy streaming: honors PROTO_REGEN_MOVE move-threshold, the dirty flag, and
     * PROTO_PARAM_DEBOUNCE slider-settle gating. On a real re-stream this._network is cleared
     * and rebuilt; the cache is bounded for endless play. Pure function of
     * (worldSeed, center, params) → identical inputs yield identical polylines.
     *
     * @param {THREE.Vector3} center — stream center (same as terrain stream center)
     * @returns {Map<string, {points: THREE.Vector3[]}>} this._network (also stored on the instance)
     */
    _streamNetwork(center) {
        // Lazy gating (mirrors the old updateProto gating; viz-independent so it works headless).
        if (this._proto.dirty && this._proto.paramDirtyAt && (Date.now() - this._proto.paramDirtyAt) < PROTO_PARAM_DEBOUNCE) {
            return this._network
        }
        const moved = !this._networkCenter || center.distanceTo(this._networkCenter) > PROTO_REGEN_MOVE
        if (!moved && !this._proto.dirty && this._network.size > 0) return this._network

        // ── Network window signature (D-16 Phase 3) ───────────────────────────────
        // The network is a PURE function of (mz row range, mx band, _generation): the band
        // columns are derived from world coords + the active radius (center_mx ± _bandHalfWidth())
        // and per-row geometry is a pure fn of (mz, band). So if this signature is unchanged since the
        // last build and nothing is dirty, a re-stream would reproduce byte-identical geometry — skip
        // the whole rebuild/re-slice and KEEP every cache (the common case: moving within one 256 m cell).
        const R = this._proto.radius
        const center_mx = Math.floor(center.x / PROTO_ANCHOR_SPACING)
        const HW = this._bandHalfWidth()
        const mx0 = center_mx - HW
        const mx1 = center_mx + HW
        const mz0 = Math.floor((center.z - R) / PROTO_ANCHOR_SPACING)
        const mz1 = Math.ceil((center.z + R) / PROTO_ANCHOR_SPACING)
        const bandSig = `${mz0}:${mz1}:${mx0}:${mx1}:${this._generation}`
        if (!this._proto.dirty && bandSig === this._lastBandSig && this._network.size > 0 && this._tiles && this._tiles.size > 0) {
            // Identical window → network/slices/profiles all still valid; just track the new center
            // so the next <PROTO_REGEN_MOVE move short-circuits at the lazy gate above.
            this._networkCenter = center.clone()
            this._proto.lastCenter = center.clone()
            return this._network
        }

        this._networkCenter = center.clone()
        this._proto.lastCenter = center.clone()
        this._proto.dirty = false
        this._lastBandSig = bandSig
        this._networkRev++   // real rebuild → invalidate per-run profile/adjacency caches (lazy)
        // Refresh live D-09 weights from this._params (debug sliders mutate it in place) so this
        // re-stream uses the current slider values — deterministic re-route (D-03).
        this._refreshParams()
        // Bound the proto caches BEFORE building (CR-02). anchors/cls are pure functions of
        // coords, so a cache miss recomputes the identical value — evicting them is always benign.
        // Doing it pre-build (rather than post-build) makes the result independent of WHEN the
        // size threshold trips, preserving the module's purity contract (a network is a pure
        // function of seed+center+params, caches are memoization only).
        if (this._proto.anchors.size > 4000) this._proto.anchors.clear()
        if (this._proto.cls && this._proto.cls.size > 1500) this._proto.cls.clear()
        this._network.clear()
        // D1: do NOT bump _generation here. A positional re-stream produces window-INVARIANT
        // geometry (D-16: the network is a pure function of seed+world-coords+params), so an
        // in-range tile's geometry is identical before and after — rebuilding it is pure waste.
        // _streamNetwork is also called from multiple centers per frame (update() with the view
        // center AND ensureTile()/spawn with a tile center); they ping-pong _networkCenter past
        // PROTO_REGEN_MOVE and would bump generation every frame, forcing a continuous ribbon
        // rebuild + terrain re-carve loop (flicker + FPS collapse). Generation is bumped ONLY on a
        // real ROUTE/PARAM change via invalidateCache() — that is the only path that changes tile
        // geometry, and it is the path the maxGrade/camber sliders take (fixes bug #1 + #6).
        // A real re-stream invalidates the previous slice; _sliceNetwork re-slices on next call.
        this._slicedFrom = null
        if (this._tiles) this._tiles.clear()
        if (this._tileObjects) this._tileObjects.clear()
        // Junction cache is a pure function of this._network — clear and rebuild on re-stream.
        if (this._junctions) this._junctions.clear()
        this._junctionsFrom = null

        // Per-run profile caches (runProfile/camberProfile) and the run-adjacency cache are keyed by
        // this._networkRev (bumped just above), so this real rebuild lazily invalidates them — no eager
        // clear needed (replaces the old BUG-14 clear-on-restream band-aid). With owner-anchored arc
        // origins (D-16 Phase 2) the arcS↔gradeY domain is window-invariant, so the only thing a real
        // rebuild changes is run EXTENT at the frontier; the rev bump re-derives those lazily.
        this._designGradeCache = new WeakMap()

        // ── Per-connection run assembly (Road Overhaul, Phase B/C) ────────────────
        // Each east connection anchor(mx,mz)→anchor(mx+1,mz) is ONE run, keyed "<mz>:<mx>".
        // This identity is a PURE function of world coords (the anchor pair) — band-INDEPENDENT,
        // so it is window-invariant BY CONSTRUCTION. There is no COVER overlap split, no owner-ratio
        // threshold, and no loop/self-crossing removal — all of which depended on the routed geometry
        // (and on the transient band) and were the source of the BUG-14/invariance fragility: a
        // routing change flipped a near-threshold decision and the runKey/arcS moved. With bounded-
        // wAlt routing (road-carve.js) the centerline no longer wanders/self-crosses, so the cleanup
        // stack is unnecessary and the connection IS the world-fixed unit of identity.
        //
        // arcS is LOCAL to the connection (0 at anchor mx) ⇒ arcOrigin = 0, no global-row arc to
        // track. Grade is smoothed over the WHOLE row polyline FIRST (so the shared anchor point gets
        // ONE continuous smoothed Y), THEN the row is split per connection at the anchor boundaries ⇒
        // gradeY is C0 across the join. Each run carries its connection's EXACT primitive centerline
        // (radius ≥ hardR by construction) so the ribbon/carve sample it directly (the BUG-12 fold
        // fix), never a Catmull-Rom re-fit.
        for (let mz = mz0; mz <= mz1; mz++) {
            // Sample each east connection's EXACT primitive centerline (a SINGLE arc-search, cached)
            // into a polyline; Y = coarse terrain height (graded below). The centerline is the sole
            // routed representation — the polyline is merely its dense sampling — so the polyline→
            // centerline arc correspondence is EXACT by construction (no projection search): the
            // centerline arc at sample i is simply s_i = i·(L/n). Connections share their terminal
            // anchor with the next connection's start anchor (skipped on append).
            // D-16: build PROTO_GRADE_PAD extra connections beyond the band on each side so the
            // grade smoother (below) sees a fully-fed window at every IN-BAND connection's start/end;
            // the pad spans are graded for continuity but NOT registered (skipped in the loop below).
            let rowPts = []
            const spans = []   // { mx, i0, i1, clArc } — run index range in rowPts + per-sample centerline arc
            for (let mx = mx0 - PROTO_GRADE_PAD; mx <= mx1 + PROTO_GRADE_PAD; mx++) {
                const cl = this._protoConnectCenterline(mx, mz)
                if (!cl || cl.length < 1e-6) continue
                const n = Math.max(1, Math.ceil(cl.length / PROTO_SAMPLE_DS))
                const i0 = rowPts.length ? rowPts.length - 1 : 0   // share anchor mx with the prev connection's end
                const clArc = new Float64Array(n + 1)
                const startK = rowPts.length ? 1 : 0               // skip the shared start anchor on append
                for (let i = 0; i <= n; i++) {
                    const s = cl.length * i / n
                    clArc[i] = s
                    if (i >= startK) { const p = cl.pointAt(s); rowPts.push(new THREE.Vector3(p.x, this._coarseH(p.x, p.z), p.z)) }
                }
                spans.push({ mx, i0, i1: rowPts.length - 1, clArc })
            }
            if (rowPts.length < 2 || spans.length === 0) continue

            // Grade the continuous row Y in one pass (so the shared anchor point gets ONE smoothed Y →
            // gradeY is C0 across every join), then split per connection at the anchor boundaries.
            // FEAT-10 earthwork: when earthwork routing is on, the road must follow the DESIGN line, not
            // raw terrain — otherwise the straighter route just dives into valleys / over ridges (steeper,
            // dippy). Smooth the row Y over the WIDER earthwork window so the road bridges valleys and cuts
            // ridges at a gentle grade (the carve then fills/cuts to it), and clamp the smoothed Y to
            // ±deviationCap of raw so fills/cuts stay within what the carve can build (matches the router's
            // designH). Off → legacy ±designGradeWindow terrain-following smoothing, unchanged.
            const ewWindow = this._params?.roadEarthworkWindow ?? 0
            const ewActive = ewWindow > 0 && (this._params?.roadWDeviation ?? 0) > 0
            const legacyWin = this._params?.designGradeWindow ?? 50
            if (!ewActive) {
                smoothGradeInPlace(rowPts, legacyWin)
            } else {
                // FEAT-10 earthwork design line: (1) wide-smooth raw → the gentle bridged/cut grade;
                // (2) a SMOOTH terrain reference (legacy-window smooth of raw) for the cap; (3) clamp the
                // design to ±cap of that SMOOTH reference. Clamping against the smooth ref (not raw coarse)
                // is essential — clamping against raw would make the design follow raw's bumps wherever the
                // cap bites, putting near-vertical steps into the collision surface (road-smoothness).
                const rowRaw = rowPts.map(pt => pt.y)
                smoothGradeInPlace(rowPts, ewWindow)            // rowPts.y = wide design line
                const design = rowPts.map(pt => pt.y)
                for (let i = 0; i < rowPts.length; i++) rowPts[i].y = rowRaw[i]
                smoothGradeInPlace(rowPts, legacyWin)           // rowPts.y = smooth terrain reference
                const cap = this._params?.roadDeviationCap ?? Infinity
                for (let i = 0; i < rowPts.length; i++) {
                    const ref = rowPts[i].y, y = design[i]
                    rowPts[i].y = y > ref + cap ? ref + cap : (y < ref - cap ? ref - cap : y)
                }
            }

            for (const { mx, i0, i1, clArc } of spans) {
                if (mx < mx0 || mx > mx1) continue   // pad connection: graded for window-invariance, not registered
                if (i1 - i0 < 1) continue
                const M = i1 - i0 + 1
                const run = new Array(M)
                const polyCum = new Float64Array(M)   // cumulative-XZ (chord) arc from run[0]
                for (let i = 0; i < M; i++) {
                    run[i] = rowPts[i0 + i].clone()
                    if (i > 0) polyCum[i] = polyCum[i - 1] + Math.hypot(run[i].x - run[i - 1].x, run[i].z - run[i - 1].z)
                }
                const centerline = this._protoConnectCenterline(mx, mz)
                this._network.set(`${mz}:${mx}`, { points: run, arcOrigin: 0, centerline, polyCum, clArc })
            }
        }

        // ── COVER suppression (window-invariant, per-connection) ──────────────────
        // Adjacent rows whose valley-snapped anchors converged route their roads on top of each other;
        // draw only ONE. A connection mz:mx is DROPPED iff > COVER_FRAC of its samples lie within
        // COVER_D of a SAME-HEADING point on a LOWER-mz row's road (lower mz = higher priority, the
        // deterministic tie-break). Coverage is tested against the lower rows' CANONICAL centerline
        // geometry (a pure fn, computed even for out-of-band neighbour rows) at FIXED depth
        // (PROTO_COVER_DEPTH rows — beyond the snap+detour overlap reach) → both stream centers make
        // identical drop decisions for a shared connection, so it stays window-invariant (unlike the
        // old band-relative ordered-registration pass that this replaces). Whole-connection grain.
        const D2 = PROTO_COVER_D * PROTO_COVER_D
        const toDrop = (this._params?.roadCoverSuppress ?? true) ? [] : null
        for (const [key, entry] of (toDrop ? this._network : [])) {
            const c = key.indexOf(':'); const mz = +key.slice(0, c), mx = +key.slice(c + 1)
            if (!Number.isInteger(mz) || !Number.isInteger(mx)) continue
            const pts = entry.points
            if (!pts || pts.length < 2) continue
            // Gather lower-priority neighbour sample points (canonical, band-independent). CHEAP
            // PRE-FILTER first: route+sample a neighbour ONLY if its anchor segment comes within
            // COVER_D+slack of this run's anchor segment (anchors are cached, pure — no routing). This
            // keeps COVER near-free: distant rows (the common case) never trigger an arc search.
            const aA = this._protoAnchor(mx, mz), aB = this._protoAnchor(mx + 1, mz)
            const gate2 = (PROTO_COVER_D + PROTO_COVER_PREFILTER) ** 2
            const neigh = []   // flat [x, z, tx, tz, ...]
            for (let dmz = 1; dmz <= PROTO_COVER_DEPTH; dmz++) {
                for (let dmx = -1; dmx <= 1; dmx++) {
                    const nmx = mx + dmx, nmz = mz - dmz
                    const nA = this._protoAnchor(nmx, nmz), nB = this._protoAnchor(nmx + 1, nmz)
                    if (_segSegDist2(aA.x, aA.z, aB.x, aB.z, nA.x, nA.z, nB.x, nB.z) > gate2) continue
                    const cl = this._protoConnectCenterline(nmx, nmz)
                    if (!cl || cl.length < 1e-6) continue
                    const n = Math.max(1, Math.ceil(cl.length / PROTO_COVER_D))   // ~1 sample / COVER_D
                    for (let i = 0; i <= n; i++) {
                        const s = cl.length * i / n, p = cl.pointAt(s), t = cl.tangentAt(s)
                        neigh.push(p.x, p.z, t.x, t.z)
                    }
                }
            }
            if (neigh.length === 0) continue
            let covered = 0
            const needToDrop = Math.floor(pts.length * PROTO_COVER_FRAC) + 1
            for (let i = 0; i < pts.length; i++) {
                const px = pts[i].x, pz = pts[i].z
                const q = pts[Math.min(pts.length - 1, i + 1)], r = pts[Math.max(0, i - 1)]
                let hx = q.x - r.x, hz = q.z - r.z; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl
                for (let k = 0; k < neigh.length; k += 4) {
                    const ex = neigh[k] - px, ez = neigh[k + 1] - pz
                    if (ex * ex + ez * ez < D2 && Math.abs(hx * neigh[k + 2] + hz * neigh[k + 3]) > PROTO_COVER_DOT) {
                        covered++; break
                    }
                }
                if (covered >= needToDrop) { toDrop.push(key); break }
            }
        }
        if (toDrop) for (const key of toDrop) this._network.delete(key)

        // NOTE (CR-02): no post-build cache eviction. _network is .clear()-ed + rebuilt for the
        // current window at the top of every real re-stream, so its size is window-bounded. The
        // per-connection centerline cache (_proto.cls) is evicted by size above.
        return this._network
    }

    // (Road Overhaul Phase C: _runOwnerAnchor / _canonSegArc deleted. Run identity is now the
    // connection's own world key "mz:mx" — band-independent by construction — so the owner-ratio
    // search that picked a world-fixed origin inside a band-truncated whole-row run is unnecessary.)

    // ── Per-tile slicing (D-06 REVISED — C0/C1 seam continuity is FREE) ──────────
    /**
     * Slice the canonical `this._network` continuous polylines into per-tile Catmull-Rom
     * splines stored in `this._tiles` (key "<tileX>,<tileZ>" → segment[]). Because each per-tile
     * spline is a SLICE of ONE continuous parent polyline, consecutive tiles share the exact
     * boundary-crossing point (C0) and — being samples of the same parent geometry — align
     * tangents there (C1). There is NO shared-seam-waypoint / ghost-point machinery (the old
     * approach that failed VERIFICATION.md is gone for good).
     *
     * For each network polyline: walk it segment-by-segment, and wherever the segment crosses a
     * 64 m (CHUNK_SIZE) tile boundary in x or z, insert the exact crossing point (linear
     * interpolation at the integer-boundary coordinate) into BOTH the ending sub-polyline and the
     * starting sub-polyline — so the two adjacent per-tile splines share that exact point. Each
     * sub-polyline is assigned to the tile containing its midpoint. Sub-polylines are de-duplicated
     * (consecutive coincident control points removed — centripetal divide-by-zero guard) and those
     * with < 2 distinct points are skipped. Each kept sub-polyline becomes a
     * `THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5)` — the SAME parameterization as
     * the source network curve (so the slice geometry matches the rendered/source curve).
     *
     * Deterministic: pure function of `this._network` (itself a pure function of seed+coords+params).
     * Idempotent: re-slicing the same network identity is a no-op (memoized via `this._slicedFrom`).
     *
     * @returns {Map<string, {spline: THREE.CatmullRomCurve3, points: THREE.Vector3[], waypoints: THREE.Vector3[]}[]>} this._tiles
     */
    _sliceNetwork() {
        // Identity guard: re-slicing the identical network is a no-op. _streamNetwork/invalidateCache
        // null this._slicedFrom on any real network change, forcing a re-slice.
        if (this._slicedFrom === this._network && this._tiles.size > 0) return this._tiles

        this._tiles.clear()
        this._tileObjects.clear()

        const S = CHUNK_SIZE
        for (const [runKey, entry] of this._network) {
            const points = entry.points
            if (!points || points.length < 2) continue
            // D-16 Phase 2: slice arcS measured from the run's world-deterministic owner anchor,
            // not run[0] — so arcS0/arcS1 (and the runProfile/camberProfile they index) are
            // window-invariant. Matches _buildRunProfile / _buildCamberProfile arcPos[0] = -arcOrigin.
            const arcOrigin = entry.arcOrigin ?? 0

            // Parent-run weight = total control-point count. A tile picks its representative as the
            // slice from the heaviest parent run that touches it; because ONE parent run yields one
            // slice per tile it crosses, all tiles along that run pick the SAME parent → their shared
            // boundary slices match exactly (C0) with aligned tangents (C1). This is what makes the
            // seam harness's single-.spline-per-tile comparison green by construction.
            const runWeight = points.length

            // Walk the polyline, cutting at every x/z integer-multiple-of-S boundary crossing.
            // `current` accumulates the active sub-polyline; on a cut we push the boundary point to
            // BOTH the closing sub-polyline and the new one (shared C0 point).
            let current = [points[0].clone()]
            // BUG-10 camber continuity: track cumulative XZ run arc-length so each slice records the
            // run-arc at its endpoints. XZ metric matches _buildCamberProfile's arcPos. Without this,
            // arcSOffset defaulted to 0 and camber sawtoothed back to the run start at every tile seam.
            let runArcAtA = -arcOrigin       // run-arc at points[i-1] (owner-origined)
            let sliceStartArc = -arcOrigin   // run-arc at current[0] (owner-origined)
            const flush = (sliceEndArc) => {
                if (current.length >= 2) this._assignSlice(current, runKey, runWeight, sliceStartArc, sliceEndArc)
                // start the next sub-polyline at the same boundary point we just closed on (shared)
            }
            for (let i = 1; i < points.length; i++) {
                const a = points[i - 1], b = points[i]
                const segLen = Math.hypot(b.x - a.x, b.z - a.z)  // XZ segment length (matches camber arcPos)
                // Collect all boundary crossings along segment a→b, ordered by parametric t∈(0,1).
                const crossings = []
                this._collectCrossings(a.x, b.x, S, (t) => crossings.push(t))
                this._collectCrossings(a.z, b.z, S, (t) => crossings.push(t))
                crossings.sort((p, q) => p - q)
                let prevT = 0
                for (const t of crossings) {
                    if (t <= 1e-9 || t >= 1 - 1e-9) continue        // skip endpoints (no zero-length cut)
                    if (t <= prevT + 1e-9) continue                  // coincident crossings (corner) → one cut
                    const cp = _lerpVec3(a, b, t)
                    current.push(cp.clone())                          // close current sub-polyline ON the boundary
                    const cpArc = runArcAtA + segLen * t
                    flush(cpArc)
                    current = [cp.clone()]                            // next sub-polyline STARTS on the same point (C0)
                    sliceStartArc = cpArc
                    prevT = t
                }
                current.push(b.clone())
                runArcAtA += segLen
            }
            flush(runArcAtA)  // trailing slice ends at the run's total arc
        }

        this._slicedFrom = this._network
        return this._tiles
    }

    // ── Phase 9: Junction detection (SURF-07 / P9 plan 04) ───────────────────────────
    /**
     * Detect inter-run crossings in this._network and build the junction cache.
     *
     * Returns a Map of nodeKey → { pos, legs, nodeY, simpleMerge } where:
     *   - pos:         THREE.Vector3 — crossing point (Y = avg of 4 segment-endpoint Ys)
     *   - legs:        Array of { runKey: string, segIdx: number, dir: {x,z} } — legs leaving
     *                  the node in each road direction, sorted by bearing
     *   - nodeY:       number — shared elevation (average of 4 endpoint Ys, used for footprint)
     *   - simpleMerge: boolean — true = fall back to rectangular box (no fillet):
     *                    - crossing half-angle < 10° (near-parallel roads)
     *                    - or legs.length > 4 (3+ roads meeting)
     *
     * Memoized via this._junctionsFrom identity guard (same pattern as _slicedFrom).
     * Cleared on re-stream at the this._tiles.clear() site.
     *
     * Pure function of this._network — deterministic + window-invariant by transitivity (D-16).
     *
     * @returns {Map<string, {pos: THREE.Vector3, legs: Array, nodeY: number, simpleMerge: boolean}>}
     */
    _detectJunctions() {
        // Identity guard: re-detecting the same network is a no-op.
        if (this._junctionsFrom === this._network && this._junctions.size > 0) {
            return this._junctions
        }

        this._junctions.clear()

        const runs = [...this._network.entries()]  // [[runKey, {points}], ...]
        const nRuns = runs.length

        // Pairwise inter-run crossing detection using module-scope _segXZ.
        for (let ri = 0; ri < nRuns - 1; ri++) {
            const [keyA, { points: ptsA }] = runs[ri]
            for (let rj = ri + 1; rj < nRuns; rj++) {
                const [keyB, { points: ptsB }] = runs[rj]

                for (let ai = 0; ai < ptsA.length - 1; ai++) {
                    const a0 = ptsA[ai], a1 = ptsA[ai + 1]
                    for (let bi = 0; bi < ptsB.length - 1; bi++) {
                        const b0 = ptsB[bi], b1 = ptsB[bi + 1]

                        const ix = _segXZ(a0.x, a0.z, a1.x, a1.z, b0.x, b0.z, b1.x, b1.z)
                        if (!ix) continue

                        // Shared node elevation: average of the 4 segment endpoint Ys.
                        const posY = (a0.y + a1.y + b0.y + b1.y) * 0.25

                        const nodeKey = `${Math.round(ix.x)},${Math.round(ix.z)}`
                        let node = this._junctions.get(nodeKey)
                        if (!node) {
                            node = {
                                pos:         new THREE.Vector3(ix.x, posY, ix.z),
                                legs:        [],
                                nodeY:       posY,
                                simpleMerge: false,
                            }
                            this._junctions.set(nodeKey, node)
                        }

                        // Compute unit direction vectors from node toward adjacent segment endpoints.
                        // Each road contributes two legs (one each direction away from crossing).
                        const addLeg = (runKey, segIdx, fromPt, toPt) => {
                            const dx = toPt.x - ix.x
                            const dz = toPt.z - ix.z
                            const len = Math.sqrt(dx * dx + dz * dz) || 1
                            node.legs.push({ runKey, segIdx, dir: { x: dx / len, z: dz / len } })
                        }
                        addLeg(keyA, ai,     a0,  a1)   // run A, toward a1
                        addLeg(keyA, ai + 1, a1,  a0)   // run A, toward a0
                        addLeg(keyB, bi,     b0,  b1)   // run B, toward b1
                        addLeg(keyB, bi + 1, b1,  b0)   // run B, toward b0

                        // Half-angle guard: if crossing is near-parallel (< ~10°), use simple box.
                        // Compute the acute angle between the two road directions.
                        const edgeAx = a1.x - a0.x, edgeAz = a1.z - a0.z
                        const edgeBx = b1.x - b0.x, edgeBz = b1.z - b0.z
                        const lenA = Math.sqrt(edgeAx * edgeAx + edgeAz * edgeAz) || 1
                        const lenB = Math.sqrt(edgeBx * edgeBx + edgeBz * edgeBz) || 1
                        const dot  = (edgeAx * edgeBx + edgeAz * edgeBz) / (lenA * lenB)
                        const acuteAngle = Math.acos(Math.min(1, Math.abs(dot))) * (180 / Math.PI)
                        if (acuteAngle < 10) node.simpleMerge = true
                    }
                }
            }
        }

        // Post-process each detected node.
        for (const node of this._junctions.values()) {
            // Guard: more than 4 legs → fall back to simple box (3+ roads meeting — T-09-07).
            if (node.legs.length > 4) node.simpleMerge = true

            // Sort legs by bearing angle around node (atan2(dx, dz) → [-π, π]).
            // Sorted CCW from -π so fillet arcs connect adjacent legs in winding order.
            node.legs.sort((a, b) => Math.atan2(a.dir.x, a.dir.z) - Math.atan2(b.dir.x, b.dir.z))

            // Shared-node elevation hook (D-14): nodeY is stored on the node record so both
            // road-mesh and the carve builder read the same value.
            // approach_Y(s) = lerp(designGradeY(s), nodeY, max(0, 1 - dist_to_node / blendLength))
            // blendLength is read from params.roadJunctionBlendLength (default 30 m, ranger.js).
            // The actual lerp is applied during ribbon mesh building, not here — this method
            // just stores nodeY on the record as the authoritative shared elevation.
        }

        // Purity comment: Pure function of this._network — deterministic + window-invariant
        // by transitivity (D-16).
        this._junctionsFrom = this._network
        return this._junctions
    }

    // ── BUG-14 diagnostic (read-only) ────────────────────────────────────────────────
    /**
     * Resolve the road at (wx, wz) EXACTLY as the physics carve path (_sampleCarveWorld)
     * does, and return NUMERIC diagnostics for the frame logger. Read-only — no state mutation.
     *
     * runKeys are hashed to small non-negative ints — the value is opaque; what matters for
     * diagnosis is whether `rk` (resolved run) and `arcS` stay CONTINUOUS across a tile seam.
     * (`lrk` is retained at 0 for log-column stability — it logged the now-removed hysteresis hint.)
     *
     * @param {number} wx — world X
     * @param {number} wz — world Z
     * @returns {{ hit:number, rk:number, arcS:number, gradeY:number, pointY:number, lat:number, lrk:number }}
     */
    debugSampleAt(wx, wz) {
        const p             = this._params
        const halfWidth     = p.roadHalfWidth     ?? 5
        const shoulderWidth = p.roadShoulderWidth ?? 2.5
        const maxExt        = halfWidth + shoulderWidth + 4
        const hashKey = (k) => {
            if (!k) return 0
            let h = 0
            for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0
            return h & 0x7fffffff
        }
        const nr = this.queryNearest(wx, wz, maxExt)
        if (!nr) return { hit: 0, rk: 0, arcS: 0, gradeY: 0, pointY: 0, lat: 0, lrk: 0, minR: 9999 }
        const dx = wx - nr.point.x, dz = wz - nr.point.z
        const signedLat = dx * nr.tangent.z - dz * nr.tangent.x
        const arcS = nr.arcS ?? 0
        const runKey = nr.runKey ?? ''
        const gradeY = this.runProfile(arcS, runKey).gradeY
        const camber = this.camberProfile(arcS, runKey)   // banking (rad) — couples runs via seed; gated by restream-invariance
        // BUG-12 diagnostic: local XZ turn radius of THIS run's centerline near the truck, from the
        // continuous-profile tangents at arcS±ds. radius = arc / heading-change. If a ribbon FOLD is
        // seen where minR is still >> halfWidth (e.g. ≥15 m), the fold is NOT the per-run centerline —
        // it's a junction/mesh issue (between two runs), not the spline this run delivers.
        let minR = 9999
        {
            const ds = 4
            const a0 = this.runProfile(arcS - ds, runKey)
            const a1 = this.runProfile(arcS + ds, runKey)
            const dot = Math.max(-1, Math.min(1, a0.tx * a1.tx + a0.tz * a1.tz))
            const dth = Math.acos(dot)               // heading change over 2·ds
            minR = dth > 1e-6 ? (2 * ds) / dth : 9999 // arc / angle
        }
        return {
            hit:    1,
            rk:     hashKey(runKey),
            runKey,                         // the canonical key string (capture/replay diff; rk is its hash)
            arcS,
            gradeY,
            camber,
            pointY: nr.point.y,
            lat:    signedLat,
            lrk:    0,
            minR,
        }
    }

    // ── BUG-12 fix-dev tool: dump real run geometry at a failing corner (read-only) ────
    /**
     * Export the centerline geometry of the run nearest (wx, wz) so the constructive
     * min-radius fix can be developed + verified against REAL seeded geometry (not just
     * synthetic harness fixtures). Returns:
     *   - networkPoints: the raw routed run polyline (this._network points — what runProfile
     *     and the slicer consume; the post-fillet "design grade" centerline).
     *   - slices: for each per-tile slice of this run, the Catmull-Rom spline DENSELY sampled
     *     (~1 pt/2 m) — this is the actual curve the ribbon sweeps, so its curvature reveals
     *     CR overshoot relative to networkPoints.
     * Pure read; no mutation. Consumed by the ribbon↔carve gate (test/ribbon-carve.mjs).
     * @returns {{ runKey:string, minTurnRadius:number, networkPoints:Array, slices:Array } | null}
     */
    debugDumpNearestRun(wx, wz) {
        const p = this._params
        const maxExt = (p.roadHalfWidth ?? 5) + (p.roadShoulderWidth ?? 2.5) + 4
        const nr = this.queryNearest(wx, wz, Math.max(maxExt, 50))
        if (!nr || !nr.runKey) return null
        const runKey = nr.runKey
        const netEntry = this._network?.get(runKey)
        const networkPoints = netEntry?.points
            ? netEntry.points.map(q => ({ x: +q.x.toFixed(3), y: +q.y.toFixed(3), z: +q.z.toFixed(3) }))
            : []
        const slices = []
        if (this._tiles) {
            for (const [tileKey, segs] of this._tiles) {
                for (const s of segs) {
                    if ((s.runKey ?? '') !== runKey || !s.spline) continue
                    const len = s.spline.getLength ? s.spline.getLength() : 64
                    const n = Math.max(8, Math.min(256, Math.ceil(len / 2)))
                    const pts = s.spline.getPoints(n).map(q => ({ x: +q.x.toFixed(3), y: +q.y.toFixed(3), z: +q.z.toFixed(3) }))
                    slices.push({ tileKey, arcS0: s.arcS0 ?? 0, arcS1: s.arcS1 ?? 0, length: +len.toFixed(2), samples: pts })
                }
            }
        }
        return {
            runKey,
            query: { wx: +wx.toFixed(2), wz: +wz.toFixed(2) },
            minTurnRadius: p.roadMinTurnRadius ?? 0,
            roadHalfWidth: p.roadHalfWidth ?? 5,
            networkPoints,
            slices,
        }
    }

    // ── Phase 9: Analytic carve world sampler (SURF-04) ──────────────────────────────
    /**
     * Sample the road carve at a world-space position (wx, wz) for use in analyticHeight.
     * Returns { blendW, gradeY } or null if no road is near.
     *
     * The blend formula is byte-identical to carveBlend() in road-carve.js and to the
     * _buildCarveTable inner loop (SURF-05 height-agreement requirement).
     *
     * NOTE: does NOT receive or call terrain — the caller (analyticHeight) already has the
     * raw height and passes rawAmp separately to avoid infinite recursion.
     *
     * @param {number} wx     — world X
     * @param {number} wz     — world Z
     * @param {number} rawAmp — raw terrain height at (wx,wz), amplitude already applied (metres)
     * @returns {{ blendW: number, gradeY: number } | null}
     *
     * Pure function of (wx, wz, roadSystem, params, rawAmp) — deterministic (D-16).
     */
    /**
     * Continuous nearest-point projection of (wx,wz) onto a run's centerline POLYLINE.
     *
     * Unlike queryNearest (which samples the per-tile CatmullRom spline at ~2 m then refines within a
     * ±1-sample bracket — that bracket cannot track the true nearest point where the road curves, so
     * its arcS/signedLat LURCH, tearing the carve surface: the "invisible cliff" that pinned the truck
     * at the lone-pine spawn), this projects onto the raw network segments — the SAME points
     * _buildRunProfile integrates — so the foot point, run-global arcS and signed lateral are all
     * continuous in (wx,wz). arcS = (cumulative chord to foot) − arcOrigin, exactly the runProfile arc
     * domain (arcPos[0] = −arcOrigin, arcPos[i] = arcPos[i−1] + chord).
     *
     * @returns {{ fx,fz, tx,tz, arcS, signedLat, d2 } | null}
     */
    _projectOntoRun(netEntry, wx, wz) {
        const pts = netEntry.points
        const N = pts ? pts.length : 0
        if (N < 2) return null
        const arcOrigin = netEntry.arcOrigin ?? 0
        let bestD2 = Infinity, bestFx = 0, bestFz = 0, bestTx = 1, bestTz = 0, bestCum = 0
        let bestI = 0, bestTclamp = 0
        let cum = 0
        for (let i = 0; i < N - 1; i++) {
            const ax = pts[i].x, az = pts[i].z
            const ex = pts[i + 1].x - ax, ez = pts[i + 1].z - az
            const segLen2 = ex * ex + ez * ez
            const segLen = Math.sqrt(segLen2) || 1e-8
            let t = segLen2 > 1e-12 ? ((wx - ax) * ex + (wz - az) * ez) / segLen2 : 0
            if (t < 0) t = 0; else if (t > 1) t = 1
            const fx = ax + t * ex, fz = az + t * ez
            const ddx = wx - fx, ddz = wz - fz
            const d2 = ddx * ddx + ddz * ddz
            if (d2 < bestD2) {
                bestD2 = d2; bestFx = fx; bestFz = fz
                bestTx = ex / segLen; bestTz = ez / segLen
                bestCum = cum + t * segLen
                bestI = i; bestTclamp = t
            }
            cum += segLen
        }
        // Terminus overshoot: nearest foot is the run's very first/last vertex AND the query lies
        // longitudinally BEYOND that end (not beside the ribbon). Such a point is off the end of THIS
        // run — its continuation run (junction neighbour) owns the surface there — so reject it rather
        // than carve a bogus endpoint height (the 40 m "topmost" artifact came from accepting these).
        const overBefore = bestI === 0 && bestTclamp === 0 &&
            ((wx - pts[0].x) * bestTx + (wz - pts[0].z) * bestTz) < 0
        const overAfter  = bestI === N - 2 && bestTclamp === 1 &&
            ((wx - pts[N - 1].x) * bestTx + (wz - pts[N - 1].z) * bestTz) > 0
        return {
            fx: bestFx, fz: bestFz, tx: bestTx, tz: bestTz,
            arcS: bestCum - arcOrigin,
            // signedLat sign convention matches _sampleCarveWorld: (query − foot) cross tangent.
            signedLat: (wx - bestFx) * bestTz - (wz - bestFz) * bestTx,
            d2: bestD2,
            offEnd: overBefore || overAfter
        }
    }

    /**
     * Resolve WHICH road the physics carve sits on at (wx,wz) — the nearest run whose footprint contains
     * the point — via the continuous polyline projection, returned in queryNearest's shape so
     * _sampleCarveWorld can consume it. This replaces queryNearest in the carve path.
     *
     * queryNearest answers "nearest centerline of ANY run" by sampling the per-tile spline at ~2 m and
     * refining within a ±1-sample bracket. That bracket cannot track the true nearest point where the
     * road curves, so its arcS/signedLat LURCH (→ same-run carve cliffs, e.g. the 66 cm step at the
     * lone-pine spawn); and at footprint overlaps the discrete sampling flips runs at different heights
     * (→ cross-run cliffs). Projecting onto the raw network segments (_projectOntoRun) makes arcS and
     * signedLat continuous in (wx,wz), and selecting the nearest footprint-INTERIOR run (queryNearest's
     * own interior policy, but continuous) removes both tear classes — the physics surface now tracks
     * the swept visual ribbon (road-mesh.js sweepRibbon, which resolves per-run along ordered points).
     *
     * A height-based "topmost" selection was tried and REJECTED: it teleported the surface onto
     * wrong-height runs that merely pass nearby (a 40 m artifact). Terminus-overshoot candidates
     * (off the end of a run) are also rejected — the junction-neighbour run owns the surface there.
     *
     * Candidates come from the 3×3 tile block (footprint ≤ halfWidth+shoulder ≈ 7.5 m ≪ 64 m tile, so
     * any run that can carve here has a slice in-block). Returns null off all road → raw terrain.
     */
    _resolveRoadSurface(wx, wz) {
        if (!this._tiles || !this._network) return null
        const p = this._params
        const halfWidth     = p.roadHalfWidth     ?? 5
        const shoulderWidth = p.roadShoulderWidth  ?? 2.5
        // BUG-15 (fill): the footprint must reach the MESH carve extent (carveHalfWidth + shoulderWidth,
        // carveHalfWidth = halfWidth + carveExtraWidth capped at minRadius — same as terrain.js
        // _buildCarveTable), not just halfWidth + shoulderWidth. Otherwise the physics resolver returns
        // "no road" across the outer fill embankment the mesh raised, and the car falls through it.
        const carveExtraWidth = p.roadCarveExtraWidth ?? 3.0
        const minRadius       = p.roadMinTurnRadius   ?? 12
        // FEAT-10: the embankment now reaches carveHalfWidth + roadMaxEmbankmentToe (capped apron), so the
        // resolver footprint must extend to the SAME toe — otherwise a wheel on the far fill embankment
        // (>carveHalfWidth + shoulderWidth lateral) returns "no road" and drops through the raised dirt.
        const maxEmbankmentToe = p.roadMaxEmbankmentToe ?? 10
        const footHW = Math.min(halfWidth + carveExtraWidth, minRadius) + maxEmbankmentToe

        const qtx = Math.floor(wx / CHUNK_SIZE)
        const qtz = Math.floor(wz / CHUNK_SIZE)
        const seen = new Set()
        // Select the NEAREST footprint-interior run by true lateral distance (queryNearest's interior
        // policy), but via the continuous polyline projection so arcS/signedLat don't lurch at curves.
        // (Height-based "topmost" selection was tried and rejected — it teleported the surface onto
        // wrong-height runs that merely pass nearby.) Where genuinely overlapping runs at different
        // heights remain, this leaves at most a localized crease, not the old sampled-spline cliff.
        let bestLat = Infinity, bestPr = null, bestRunKey = ''
        // BUG-21: terminal-vertex sliver fallback. At a shared hairpin apex BOTH continuation arms treat
        // the wedge just beyond the anchor as off-their-end (_projectOntoRun offEnd), so the primary
        // interior pass finds nothing and the surface pops to raw terrain (the +0.6 m jolt). Collect
        // offEnd candidates whose foot is the terminal vertex and that lie within footHW RADIALLY of it
        // (pr.d2 ≤ footHW² — a radial gate, NOT lateral-only: a run merely ending ~40 m off the query
        // has a small perpendicular lat but a large d2, so the radial gate still rejects the old
        // "topmost" 40 m artifact offEnd was added to kill). Used only if nothing interior wins; the
        // candidate's arcS is already clamped to the run end, so runProfile gives the endpoint gradeY —
        // C0 with the sibling arm, which shares the anchor (synced run-end camber, BUG-19/QUAL-05).
        let bestEndD2 = Infinity, bestEndPr = null, bestEndRunKey = ''
        const footHW2 = footHW * footHW
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const segs = this._tiles.get(`${qtx + dx},${qtz + dz}`)
                if (!segs) continue
                for (const s of segs) {
                    const runKey = s.runKey ?? ''
                    if (seen.has(runKey)) continue
                    seen.add(runKey)
                    const netEntry = this._network.get(runKey)
                    if (!netEntry) continue
                    const pr = this._projectOntoRun(netEntry, wx, wz)
                    if (!pr) continue
                    const latDist = Math.abs(pr.signedLat)
                    if (pr.offEnd) {   // BUG-21 apex-sliver candidate (radial gate, weakest priority)
                        if (pr.d2 <= footHW2 && pr.d2 < bestEndD2) { bestEndD2 = pr.d2; bestEndPr = pr; bestEndRunKey = runKey }
                        continue
                    }
                    if (latDist > footHW) continue
                    if (latDist < bestLat) { bestLat = latDist; bestPr = pr; bestRunKey = runKey }
                }
            }
        }
        if (!bestPr && bestEndPr) { bestPr = bestEndPr; bestRunKey = bestEndRunKey }  // BUG-21: fill the apex sliver
        if (!bestPr) return null
        // camberSign = 1: the projection uses the run's own canonical polyline direction (arcS increases
        // along it), so run-frame camber maps to the world frame directly (no E→W slice reversal here).
        return {
            point:      new THREE.Vector3(bestPr.fx, this.runProfile(bestPr.arcS, bestRunKey).gradeY, bestPr.fz),
            tangent:    new THREE.Vector3(bestPr.tx, 0, bestPr.tz),
            runKey:     bestRunKey,
            arcS:       bestPr.arcS,
            camberSign: 1
        }
    }

    // Carve-radius nearest-run query — the run-match the physics carve path uses. Exposed so a caller
    // doing several samples in a tiny neighbourhood (terrain.analyticNormal's ±0.5 m finite differences,
    // queryContacts' height+normal for one wheel) can find the run ONCE and pass it back as a hint to
    // _sampleCarveWorld for every offset, instead of re-running the tile scan ~5× per wheel-contact.
    // (That redundancy is the "lag only when wheels touch the ground" symptom: ~5 full queries/wheel/
    // substep, but ONLY when in contact — analyticNormal is skipped airborne.)
    // Memoized by quantized position + networkRev so the physics death-spiral can't explode the cost:
    // a slow frame makes the fixed-timestep accumulator dispatch up to ~15 outer steps × 4 suspension
    // substeps × (4 wheels), all calling queryContacts → carveHint at NEARLY the same wheel position
    // (the spiral fires when the truck is ~stationary). queryNearest is O(slices in the 3×3 tile block),
    // which BALLOONS on tight switchbacks (many road arms per tile) — so those ~300 calls/frame at full
    // cost are the 5fps lock that only a slow CPU on a switchback hits (and that recovers airborne, when
    // no wheel is in contact). 0.1 m cells: a wheel's substeps (sub-cm apart) share one query; distinct
    // wheels (≥1.6 m apart = 16 cells) and distinct runs never collide. Pure fn of (pos, rev) → a hit is
    // identical to a fresh query at the cell; rev-cleared (re-stream) and size-bounded.
    carveHint(wx, wz) {
        if (!this._hintCache || this._hintCache.rev !== this._networkRev) {
            this._hintCache = { rev: this._networkRev, map: new Map() }
        }
        const m = this._hintCache.map
        // 0.05 m cells: the death-spiral fires when the truck is ~STATIONARY (a slow frame dispatches
        // many catch-up steps at one spot), so even a tiny cell fully collapses it — while keeping the
        // cached-run position error small during normal driving (≤0.05 m → grade error sub-cm), which
        // bounds rest-height drift well under the penetration tolerance. Wheels (≥1.6 m = 32 cells) and
        // distinct runs never share a cell.
        const key = `${Math.round(wx * 20)},${Math.round(wz * 20)}`
        let nr = m.get(key)
        if (nr === undefined) {
            // Continuous-projection road resolver, NOT queryNearest — see _resolveRoadSurface.
            nr = this._resolveRoadSurface(wx, wz)
            if (m.size > 128) m.clear()
            m.set(key, nr)
        }
        return nr
    }

    /**
     * @param {number} wx @param {number} wz
     * @param {number} rawAmp
     * @param {object|null|undefined} [nrHint] — precomputed carveHint(wx,wz) result. When provided
     *   (incl. null), it is used in place of a fresh queryNearest and the point is PROJECTED onto that
     *   run (arcSEff/signedLat) — so the 4 offsets of one normal share one tile scan, accurately
     *   (projection error over ±0.5 m on radius≥8 m is sub-mm; no position quantization → no stepping).
     */
    _sampleCarveWorld(wx, wz, rawAmp, nrHint) {
        const p             = this._params
        const halfWidth     = p.roadHalfWidth     ?? 5
        const clearanceMargin = p.roadClearanceMargin ?? 0.25

        // Continuous-projection road resolver replaces queryNearest in the carve path —
        // see _resolveRoadSurface. nrHint (from carveHint) is already a _resolveRoadSurface result.
        const nr = (nrHint !== undefined) ? nrHint : this._resolveRoadSurface(wx, wz)
        if (!nr) return null

        const dx = wx - nr.point.x
        const dz = wz - nr.point.z
        const tx = nr.tangent.x, tz = nr.tangent.z

        // Per-point arc via projection onto the run tangent. For a FRESH query nr.point is the exact
        // foot of perpendicular so this is ~0 (no change). For a CACHE HIT at a nearby quantized cell
        // it recovers the offset's true along-run arc, so analyticNormal's ±0.5 m finite differences
        // still see the road's longitudinal GRADE (not just lateral crown/camber) → correct normal
        // from ONE query instead of 4. (signedLat below already varies via dx,dz for the lateral term.)
        const arcSEff = (nr.arcS ?? 0) + dx * tx + dz * tz

        // Signed lateral distance (positive = right of road heading, negative = left).
        // signedLat = dx*tz - dz*tx (positive = right side of travel direction).
        const signedLat = dx * tz - dz * tx
        const latDist   = Math.abs(signedLat)

        // QUAL-07: one carve cross-section function shared with the terrain mesh (_buildCarveTable).
        // It returns the DIRT-trough surface (clearanceMargin ALWAYS subtracted) + the shoulder blend.
        const cs = this._carveCrossSection(signedLat, arcSEff, nr.runKey ?? '', nr.camberSign ?? 1, rawAmp)
        if (!cs) return null   // beyond the fill/cut toe — unaffected terrain

        // ── Physics-only on-ribbon overlay (the one intentional mesh↔collision difference) ──
        // The terrain mesh draws the dirt trough everywhere; ON the ribbon the truck instead rides the
        // asphalt DECAL on top, which sits clearanceMargin above the dirt (BUG-15 edge dropoff: off the
        // ribbon the wheel drops onto the lower carved dirt). So on-ribbon we add clearanceMargin back
        // (ride the decal) + the SURF-06 pothole micro-noise (D-03, physics-only, on-ribbon only). Off
        // the ribbon the surface == the mesh dirt by construction (QUAL-07 agreement).
        let gradeY = cs.gradeY
        if (latDist < halfWidth) {
            gradeY += clearanceMargin
            if (p.potholeEnabled) {
                const rq = roadQuality(arcSEff, nr.runKey ?? '', this._worldSeed)
                gradeY += potholeNoise(wx, wz, rq, p)
            }
        }

        return { blendW: cs.blendW, gradeY }
    }

    // ── QUAL-07: dirt-surface helper (the crown/camber/clearance fold, shared) ───────────────
    /**
     * The carve DIRT surface at a resolved point: run-global grade + crown + camber tilt − clearance.
     * Single source of the cross-section's vertical fold, used by _carveCrossSection AND the terrain
     * mesh's D3 cross-arm max-floor (so the exterior-arm floor uses identical math). Clearance is
     * ALWAYS subtracted (terrain-carve convention); physics adds it back on-ribbon to ride the decal.
     *
     * BUG-14: run-global continuous gradeY is C0 across slice/chunk seams. BUG-13: NOT capped to
     * rawAmp + fillHeight. BUG-15: crown/camber fold across the WHOLE footprint with full signedLat
     * (same formula as sweepRibbon) so the surface is C0 at the ribbon edge into the shoulder.
     */
    _carveDirtY(signedLat, arcSEff, runKey, camberSign) {
        const p = this._params
        const halfWidth     = p.roadHalfWidth      ?? 5
        const crownHeight   = p.crownHeight         ?? 0.05
        const clearanceMargin = p.roadClearanceMargin ?? 0.25
        const crownY = crownProfile(signedLat, halfWidth, crownHeight)
        const camberAngle = camberSign * this.camberProfile(arcSEff, runKey)
        const tiltY = signedLat * Math.sin(camberAngle)
        return this.runProfile(arcSEff, runKey).gradeY + crownY + tiltY - clearanceMargin
    }

    // ── QUAL-07: the ONE road-carve cross-section function ───────────────────────────────────
    /**
     * Resolve the carve DIRT-trough surface + shoulder blend at a point already resolved to a run.
     * This is the single cross-section both consumers share: the terrain mesh (_buildCarveTable,
     * tessellation) and physics (_sampleCarveWorld, point sample) — so mesh vertex Y == collision
     * surface by construction (no more float-above-the-bank on fills).
     *
     * Inputs are the resolved (signedLat, arcSEff, runKey, camberSign) — each consumer computes those
     * its own way: physics via continuous polyline projection (_resolveRoadSurface); the mesh via
     * point-to-segment projection onto the pre-collected sample polyline. rawAmp is the raw terrain
     * height (world-space, amplitude applied) at the point, for the fill/cut toe.
     *
     * Returns the DIRT surface: gradeY = runProfile.gradeY + crown + camberTilt − clearanceMargin
     * (clearance ALWAYS subtracted — the terrain-carve convention). Physics rides the asphalt decal
     * on-ribbon by adding clearanceMargin back (see _sampleCarveWorld). Off-ribbon both read this dirt.
     *
     * @param {number} [floorY=-Infinity] — QUAL-07/D3 cross-arm max-floor: where this vertex overlaps a
     *   HIGHER neighbouring arm's footprint, the carve must not cut below that arm's dirt surface (a
     *   lower arm's cut can't remove an upper arm's support). The mesh passes the exterior arm's
     *   _carveDirtY; physics (single-arm) leaves it at the default.
     * @returns {{ blendW:number, gradeY:number } | null}  null = beyond the fill/cut toe (raw terrain)
     */
    _carveCrossSection(signedLat, arcSEff, runKey, camberSign, rawAmp, floorY = -Infinity) {
        const p             = this._params
        const halfWidth     = p.roadHalfWidth      ?? 5
        const shoulderWidth = p.roadShoulderWidth   ?? 2.5
        // BUG-15 (fill): hold the full road grade out to carveHalfWidth (= halfWidth + carveExtraWidth,
        // capped at minRadius) so the raised fill embankment / cut bench has a flat core wider than the
        // ribbon, then ramp to raw over the variable toe. Same extent the mesh carve uses.
        const carveExtraWidth = p.roadCarveExtraWidth ?? 3.0
        const minRadius       = p.roadMinTurnRadius   ?? 12
        const carveHalfWidth  = Math.min(halfWidth + carveExtraWidth, minRadius)

        const latDist = Math.abs(signedLat)

        // Dirt surface (run grade + crown/camber − clearance). D3: a higher overlapping arm raises it.
        let designY = this._carveDirtY(signedLat, arcSEff, runKey, camberSign)
        if (floorY > designY) designY = floorY

        // Fill/cut toe + blend (FEAT-10): the embankment ramps at its SLOPE over the variable toe so a
        // tall fill descends gently to terrain instead of dropping its height over a fixed shoulder.
        // FEAT-10 cap: apron ≤ carveHalfWidth + roadMaxEmbankmentToe (no shard-fighting at tight turns).
        const fillSlope = p.roadFillSlope ?? 3.0
        const cutSlope  = p.roadCutSlope  ?? 1.0
        const maxEmbankmentToe = p.roadMaxEmbankmentToe ?? 10
        const fillToe = halfWidth + shoulderWidth + Math.max(0, designY - rawAmp) * fillSlope
        const cutToe  = halfWidth + shoulderWidth + Math.max(0, rawAmp - designY) * cutSlope
        const toeExt  = Math.min(Math.max(fillToe, cutToe), carveHalfWidth + maxEmbankmentToe)
        if (latDist > toeExt) return null   // beyond the fill/cut toe — unaffected terrain

        const ramp = Math.max(shoulderWidth, toeExt - carveHalfWidth)
        let blendW
        if (latDist < carveHalfWidth) {
            blendW = 1.0
        } else {
            blendW = Math.max(0.0, 1.0 - (latDist - carveHalfWidth) / ramp)
        }

        return { blendW, gradeY: designY }
    }

    // ── Phase 9: Design grade smoothing (D-06) ────────────────────────────────────
    // NOTE (09-31, defect B): the LIVE longitudinal grade smoother is smoothGradeInPlace()
    // in road-carve.js, applied to the canonical run polyline in _streamNetwork BEFORE the
    // COVER split — it grades the single `this._network` polyline that BOTH consumers read
    // (physics via _buildRunProfile.gradeY, ribbon via _buildRoadTile slicing). The
    // per-spline _smoothDesignGrade below is the BYPASSED legacy path (reachable only via the
    // dead sampleDesignGradeAt → test harness); kept until the cleanup step.
    /**
     * Compute a smoothed "design grade" Y array for a per-tile spline.
     * Purpose: suppress fine-noise terrain texture (±0.5 m) from the road vertical profile
     * while preserving coarse terrain grade (mountains / valleys). The smoothed grade is used
     * as the target elevation for cut-and-fill carve (carveBlend in road-carve.js).
     *
     * Algorithm: Arc-length sliding window average over `analyticHeight` samples.
     *   For each sample point i with arc-length position s_i:
     *     designGradeY[i] = mean(analyticHeight at all samples j where |s_j - s_i| < window)
     *   Window half-width = params.designGradeWindow (default 50 m).
     *
     * Boundary stability: the spline is sampled 2 extra samples past each tile endpoint so the
     * sliding window has valid values at the tile edges (Pitfall 7). The returned array matches
     * the sampled `points` array 1:1.
     *
     * Memoized: the result is cached by spline + window identity. Re-calling with the same spline
     * object and same window returns the cached array without re-computing. The cache is a
     * WeakMap keyed by the spline object — cleared automatically when the spline is GC'd.
     *
     * @param {THREE.CatmullRomCurve3} spline     — per-tile slice spline (from this._tiles)
     * @param {Function}               terrainRef — `(wx, wz) => number` analytic height sampler
     *                                              (pass terrain.analyticHeight.bind(terrain))
     * @param {object}                 params     — RANGER_PARAMS (reads designGradeWindow)
     * @returns {{ points: THREE.Vector3[], designGradeY: Float32Array }}
     *   points: arc-length-sampled spline positions (N samples × tile length ~2 m apart)
     *   designGradeY: smoothed height at each sample position (metres, terrainAmplitude included)
     *
     * Pure function of (spline, terrainRef, params) — no side effects (D-16).
     */
    _smoothDesignGrade(spline, terrainRef, params) {
        // Lazy-init the per-instance WeakMap cache.
        if (!this._designGradeCache) this._designGradeCache = new WeakMap()

        const window = params.designGradeWindow ?? 50   // half-width in metres
        const cacheKey = spline   // WeakMap key — unique per spline object

        // Return cached result if still valid (same window value).
        const cached = this._designGradeCache.get(cacheKey)
        if (cached && cached.window === window) return cached.result

        // ── Sample the spline at ~2 m arc-length intervals ────────────────────────
        // Use at least 32 samples even for short splines; cap at 512.
        const arcLen = spline.getLength ? spline.getLength() : 64
        const N = Math.max(32, Math.min(512, Math.ceil(arcLen / 2) + 1))

        const pts = []
        for (let i = 0; i < N; i++) {
            const u = i / (N - 1)
            pts.push(spline.getPointAt(u))
        }

        // ── Evaluate analyticHeight at each sample point ───────────────────────────
        const rawY = new Float32Array(N)
        for (let i = 0; i < N; i++) {
            rawY[i] = terrainRef(pts[i].x, pts[i].z)
        }

        // ── Compute arc-length positions for sliding window indexing ───────────────
        const arcPos = new Float32Array(N)
        arcPos[0] = 0
        for (let i = 1; i < N; i++) {
            const dx = pts[i].x - pts[i-1].x
            const dz = pts[i].z - pts[i-1].z
            arcPos[i] = arcPos[i-1] + Math.sqrt(dx*dx + dz*dz)
        }

        // ── Sliding window average ─────────────────────────────────────────────────
        // For each sample i, sum rawY[j] for all j where |arcPos[j] - arcPos[i]| < window.
        // Use two-pointer technique for O(N) total cost.
        const designGradeY = new Float32Array(N)
        let lo = 0
        let hi = 0
        let sum = 0
        // Initialize window around sample 0
        while (hi < N && arcPos[hi] - arcPos[0] < window) {
            sum += rawY[hi]
            hi++
        }

        for (let i = 0; i < N; i++) {
            designGradeY[i] = sum / (hi - lo)

            // Advance window: add next sample within window
            while (hi < N && arcPos[hi] - arcPos[i+1 < N ? i+1 : i] < window) {
                sum += rawY[hi]
                hi++
            }
            // Drop samples that fell behind the window
            while (lo < hi && arcPos[i+1 < N ? i+1 : i] - arcPos[lo] >= window) {
                sum -= rawY[lo]
                lo++
            }
        }

        // Expose arcPos alongside points and designGradeY — sampleDesignGradeAt needs it for
        // arc-length interpolation without re-computing arc positions on each call.
        const result = { points: pts, designGradeY, arcPos }
        this._designGradeCache.set(cacheKey, { window, result })
        return result
    }

    /**
     * Drop all memoized design-grade entries so the next ribbon sweep recomputes smoothed grade.
     * Call this whenever surface-param sliders (crownHeight, terrainAmplitude, camberStrength)
     * change via debouncedRoadSurfaceRebuild — the spline objects persist across rebuilds, so
     * the WeakMap would otherwise return stale pre-change profiles (CR-04 stale-cache fix).
     */
    invalidateDesignGradeCache() {
        this._designGradeCache = new WeakMap()
    }

    // ── P4: Run-adjacency index (plan 09-29) ─────────────────────────────────────
    /**
     * Return the canonical run key whose LAST point XZ-matches THIS run's first point
     * (within XZ_ADJACENCY_EPS). Used by _buildCamberProfile / _buildRunProfile to seed
     * the start camber from the predecessor run's end camber instead of forcing 0 (BUG-10).
     *
     * Built once per generation into `this._runAdjacencyCache`:
     *   { generation: number, map: Map<runKey → predecessorRunKey> }
     *
     * Algorithm: for each network run, record its last-point XZ in a spatial hash
     * (keyed by rounded metre). A second pass looks up each run's first-point. O(R)
     * where R = number of runs in the current network window — negligible vs profile build.
     *
     * Cycle-safe: we only return the predecessor KEY; the caller decides how to read the
     * camber value (from an already-cached profile or from raw curvature) — no recursion here.
     *
     * @param {string} runKey — canonical run key to look up
     * @returns {string|null} predecessor runKey, or null if none found
     */
    _predecessorRunKey(runKey) {
        if (!this._network) return null

        const currentRev = this._networkRev
        // Rebuild adjacency index when the network content changes (rev bump) or not yet built.
        if (!this._runAdjacencyCache || this._runAdjacencyCache.rev !== currentRev) {
            // Spatial hash: "<rx>,<rz>" → runKey  (endpoint → runKey whose END is there)
            const XZ_EPS = 2.0   // metres — shared boundary nodes are exact duplicates; use generous eps
            const hash = new Map()
            const hashKey = (x, z) => `${Math.round(x / XZ_EPS)},${Math.round(z / XZ_EPS)}`

            for (const [rk, entry] of this._network) {
                const pts = entry.points
                if (!pts || pts.length < 2) continue
                const last = pts[pts.length - 1]
                hash.set(hashKey(last.x, last.z), rk)
            }

            // Now build map from runKey → predecessor (the run whose end matches this run's start).
            const adjMap = new Map()
            for (const [rk, entry] of this._network) {
                const pts = entry.points
                if (!pts || pts.length < 2) continue
                const first = pts[0]
                const predKey = hash.get(hashKey(first.x, first.z))
                // Guard: a run must not be its own predecessor (shouldn't happen but be safe).
                if (predKey && predKey !== rk) {
                    adjMap.set(rk, predKey)
                }
            }

            this._runAdjacencyCache = { rev: currentRev, map: adjMap }
        }

        return this._runAdjacencyCache.map.get(runKey) ?? null
    }

    /**
     * Return the start-camber seed (radians) for the given run.
     * Used by _buildCamberProfile / _buildRunProfile to replace the forced rawCamber[0]=0.
     *
     * Lookup order (cycle-safe — no recursive call to _buildCamberProfile):
     *   1. Find predecessor run via _predecessorRunKey.
     *   2. If predecessor profile is already in _camberProfileCache (current generation):
     *      use its last camberRad value (stitched, slew-limited end camber).
     *   3. Else: compute predecessor's end camber from raw curvature only — walk the
     *      predecessor points, build rawCamber[], forward-march slew from 0 — and return
     *      the last value. No seeding of the predecessor (avoids deeper recursion).
     *   4. If no predecessor: return 0 (genuine run start, no boundary context).
     *
     * @param {string} runKey
     * @returns {number} start camber in radians
     */
    _runStartCamber(runKey) {
        const predKey = this._predecessorRunKey(runKey)
        return predKey ? this._runEndCamber(predKey) : 0
    }

    /**
     * Deterministic, ORDER-INDEPENDENT slew-limited END camber of a run, seeded by its predecessor
     * chain. Memoized per network revision.
     *
     * Why this exists (Road Overhaul): with per-connection runs every macro-anchor is a run boundary,
     * so camber is stitched across a chain of predecessors (mz:mx ← mz:mx-1 ← …). The previous
     * _runStartCamber read the predecessor's end from the camber-profile CACHE when present and
     * otherwise recomputed it UNSEEDED — so the seed (hence the whole downstream profile) depended on
     * cache-fill order, i.e. on streaming history. That is exactly the restream-variance the gate
     * catches. This recursion is a pure function of the band's run set: it walks the predecessor chain
     * to the band frontier (predecessor absent → seed 0) and forward-marches each run's raw camber,
     * so the value is identical regardless of which run was queried first. Acyclic (the predecessor
     * always has a strictly smaller mx); depth-capped as a belt-and-braces guard.
     *
     * @param {string} runKey
     * @param {number} [depth=0]
     * @returns {number} slew-limited end camber (radians)
     */
    _runEndCamber(runKey, depth = 0) {
        if (!this._runEndCamberCache || this._runEndCamberCache.rev !== this._networkRev) {
            this._runEndCamberCache = { rev: this._networkRev, map: new Map() }
        }
        const memo = this._runEndCamberCache.map
        const hit = memo.get(runKey)
        if (hit !== undefined) return hit

        const entry = this._network?.get(runKey)
        if (!entry || !entry.points || entry.points.length < 2) { memo.set(runKey, 0); return 0 }

        // Seed from the predecessor's stitched end camber (bounded recursion up the row chain).
        const predKey = depth < 16 ? this._predecessorRunKey(runKey) : null
        const seed = predKey ? this._runEndCamber(predKey, depth + 1) : 0
        memo.set(runKey, seed)   // tentative cycle-guard; overwritten with the true end below

        // BUG-19 FIX: march via the SHARED canonical camber routine — the SAME arc-length-windowed
        // curvature _buildCamberProfile uses — so the end value this returns is byte-identical to the
        // predecessor profile's real end. Previously this used a per-adjacent-point finite difference
        // while _buildCamberProfile used the arc-window (the BUG-12 camber fix), so the seed handed to
        // the next run didn't match the predecessor's actual end → banking stepped at every run
        // boundary (the camber discontinuity). One routine = they can't desync again.
        const { camberRad } = this._computeCamberArrays(entry.points, entry.arcOrigin, seed)
        const end = camberRad[camberRad.length - 1]
        memo.set(runKey, end)
        return end
    }

    // ── D2: One slew-limited camber profile per canonical run (plan 09-21) ───────
    /**
     * Build and cache a rate-limited camber profile for the canonical run `runKey`.
     * Called once per run; subsequent calls return the cached sampled array.
     *
     * Algorithm:
     *   1. Walk the network run's control points, computing arc positions and
     *      tangents (finite-difference between adjacent points).
     *   2. At each sample i, compute raw camber = clamp(camberStrength·κ_i, ±6°)
     *      where κ_i = signedCurvature(T_{i-1}, T_i, ds_i).
     *   3. Forward-march a slew-rate limit: the stored camber at i+1 cannot change
     *      by more than roadCamberRate·Δs from the stored camber at i.
     *   4. Return { arcPos: Float64Array, camberRad: Float64Array } arrays.
     *
     * Cache: Map keyed by runKey, invalidated when this._generation changes.
     * O(N) build once per run, O(log N) binary-search per camberProfile query.
     * No allocation per query (allocation-disciplined inner loop).
     *
     * P4 (09-29): camberRad[0] is now seeded from the adjacent predecessor run's end
     * camber (via _runStartCamber) instead of being forced to 0. Runs with no predecessor
     * (genuine free starts) still fall through to 0. Cycle-safe: _runStartCamber never
     * calls _buildCamberProfile recursively (it reads from the already-cached profile or
     * from a raw forward-march without seeding the predecessor further).
     *
     * @param {string} runKey — canonical run key (e.g. "0:0")
     * @returns {{ arcPos: number[], camberRad: number[] } | null}
     */
    /**
     * BUG-19: the SINGLE canonical camber computation for a run's centerline points. Arc-length-WINDOWED
     * curvature (camberArcWindow m — spacing-invariant, the BUG-12 camber fix) → ±6° clamp → forward
     * slew-rate march from `seed`. Shared by _buildCamberProfile (the profile the carve/ribbon read) AND
     * _runEndCamber (the cross-run seed source) so the two can NEVER desync. They HAD desynced —
     * _runEndCamber used a per-adjacent-point finite difference while _buildCamberProfile used the
     * window — so the seed handed to each run didn't match the predecessor's real end camber and banking
     * stepped at every continuing run boundary (BUG-19, a regression of BUG-10).
     *
     * @param {THREE.Vector3[]} pts — run centerline points (≥ 2)
     * @param {number} arcOrigin — owner arc origin; arcPos[0] = -arcOrigin (D-16 frame, matches slicer)
     * @param {number} seed — camber (rad) at sample 0 (predecessor end, or 0 for a free run start)
     * @returns {{ arcPos: number[], camberRad: number[] }}
     */
    _computeCamberArrays(pts, arcOrigin, seed) {
        const N = pts.length
        const p = this._params || {}
        const camberStrength  = p.camberStrength ?? 200
        const slewRateRadPerM = (p.roadCamberRate ?? 1.5) * (Math.PI / 180)
        const MAX_CAMBER      = 6 * (Math.PI / 180)   // ±6° clamp
        const windowM         = p.camberArcWindow ?? 20  // m — arc-length curvature window

        // Arc-position LUT (D-16 Phase 2: owner-origined so arcS indexes the slicer's frame).
        const arcPos = new Array(N)
        arcPos[0] = -(arcOrigin ?? 0)
        for (let i = 1; i < N; i++) {
            const dx = pts[i].x - pts[i - 1].x, dz = pts[i].z - pts[i - 1].z
            arcPos[i] = arcPos[i - 1] + Math.sqrt(dx * dx + dz * dz)
        }
        const totalArc = arcPos[N - 1], arc0 = arcPos[0]

        // Polyline tangent at arc-length s (binary search) — spacing-invariant curvature over windowM.
        const tangentAtArcS = (s) => {
            s = Math.max(arc0, Math.min(totalArc, s))
            let lo = 0, hi = N - 1
            while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (arcPos[mid] <= s) lo = mid; else hi = mid }
            const span = arcPos[hi] - arcPos[lo]
            if (span < 1e-9) {
                for (let k = lo; k < N - 1; k++) {
                    const dx = pts[k + 1].x - pts[k].x, dz = pts[k + 1].z - pts[k].z
                    const len = Math.sqrt(dx * dx + dz * dz)
                    if (len > 1e-9) return { tx: dx / len, tz: dz / len }
                }
                return { tx: 1, tz: 0 }
            }
            const dx = pts[hi].x - pts[lo].x, dz = pts[hi].z - pts[lo].z
            const len = Math.sqrt(dx * dx + dz * dz) || 1e-9
            return { tx: dx / len, tz: dz / len }
        }

        // Windowed curvature → clamp → forward slew-rate march, seeded at sample 0.
        const camberRad = new Array(N)
        camberRad[0] = seed
        let prev = seed
        for (let i = 1; i < N; i++) {
            const s = arcPos[i]
            const sA = Math.max(arc0, s - windowM / 2)
            const sB = Math.min(totalArc, s + windowM / 2)
            const tA = tangentAtArcS(sA), tB = tangentAtArcS(sB)
            const kappa = signedCurvature(tA.tx, tA.tz, tB.tx, tB.tz, sB - sA)
            const raw = Math.max(-MAX_CAMBER, Math.min(MAX_CAMBER, camberStrength * kappa))
            const maxDelta = slewRateRadPerM * (arcPos[i] - arcPos[i - 1])
            const delta = raw - prev
            if      (delta >  maxDelta) prev = prev + maxDelta
            else if (delta < -maxDelta) prev = prev - maxDelta
            else                        prev = raw
            camberRad[i] = prev
        }
        return { arcPos, camberRad }
    }

    _buildCamberProfile(runKey) {
        const netEntry = this._network?.get(runKey)
        if (!netEntry || !netEntry.points || netEntry.points.length < 2) return null
        // BUG-19: build via the shared canonical routine, seeded from the predecessor's end (P4/BUG-10).
        // _runEndCamber uses the SAME routine, so the seed equals the predecessor profile's real end.
        return this._computeCamberArrays(netEntry.points, netEntry.arcOrigin, this._runStartCamber(runKey))
    }

    // ── P0 — Continuous per-run profile (plan 09-25) ──────────────────────────
    /**
     * Build a unified RoadRunProfile for the given run, holding parallel arc-indexed arrays.
     *
     * GEOMETRY SOURCE: this._network.get(runKey).points ONLY — no new geometry source,
     * no getPointAt/getTangentAt, no _tiles read. Same XZ arc-walk as _buildCamberProfile.
     * DETERMINISM (D-16): pure function of network entry — no Math.random, no Date, no session state.
     *
     * @param {string} runKey — canonical run key (e.g. "0:0")
     * @returns {{ arcPos: number[], gradeY: number[], camberRad: number[], tx: number[], tz: number[] } | null}
     *   arcPos   — monotone XZ arc-length positions (metres), N entries
     *   gradeY   — routed centerline Y per sample (metres), continuous along the full run
     *   camberRad — slew-limited banking angle (radians), same computation as _buildCamberProfile
     *   tx/tz    — unit XZ tangent (forward direction) per sample; last sample replicates previous
     */
    _buildRunProfile(runKey) {
        const netEntry = this._network?.get(runKey)
        if (!netEntry || !netEntry.points || netEntry.points.length < 2) return null

        const pts = netEntry.points
        const N = pts.length

        const p = this._params || {}
        const camberStrength  = p.camberStrength ?? 200
        const slewRateRadPerM = (p.roadCamberRate ?? 1.5) * (Math.PI / 180)
        const MAX_CAMBER      = 6 * (Math.PI / 180)   // ±6° clamp

        const arcPos    = new Array(N)
        const gradeY    = new Array(N)
        const rawCamber = new Array(N)
        const tx        = new Array(N)
        const tz        = new Array(N)

        arcPos[0]    = -(netEntry.arcOrigin ?? 0)   // D-16 Phase 2: owner-origined (matches slicer arcS0/arcS1)
        gradeY[0]    = pts[0].y
        // P4 (BUG-10): seed from predecessor's end camber instead of hard 0.
        // Curvature is undefined at sample 0 (no predecessor segment); the boundary
        // seed carries the correct banking across the shared run boundary node.
        // _runStartCamber reads from the predecessor's ALREADY-CACHED profile (fast path)
        // or from a raw forward-march without recursion (slow path). Returns 0 for
        // genuine free run starts (no predecessor). Cycle-safe.
        rawCamber[0] = this._runStartCamber(runKey)

        // Forward tangent for sample 0: direction toward sample 1.
        {
            const ax = pts[1].x - pts[0].x
            const az = pts[1].z - pts[0].z
            const len = Math.sqrt(ax * ax + az * az) || 1e-8
            tx[0] = ax / len
            tz[0] = az / len
        }

        for (let i = 1; i < N; i++) {
            const ax = pts[i].x - pts[i - 1].x
            const az = pts[i].z - pts[i - 1].z
            const ds = Math.sqrt(ax * ax + az * az)
            arcPos[i] = arcPos[i - 1] + ds
            gradeY[i]  = pts[i].y

            // Unit XZ tangent at sample i: forward segment i-1 → i (normalized).
            const segLen = ds || 1e-8
            tx[i] = ax / segLen
            tz[i] = az / segLen

            // Curvature at i: finite-difference using prev-seg tangent (T0) and next-seg tangent (T1).
            const t0x = ax, t0z = az   // unnormalized; signedCurvature normalises internally
            let t1x, t1z, effectiveDs
            if (i < N - 1) {
                t1x = pts[i + 1].x - pts[i].x
                t1z = pts[i + 1].z - pts[i].z
                const ds1 = Math.sqrt(t1x * t1x + t1z * t1z) || 1e-8
                effectiveDs = (ds + ds1) * 0.5
            } else {
                t1x = t0x; t1z = t0z   // boundary: replicate
                effectiveDs = ds || 1e-8
            }

            const kappa = signedCurvature(t0x, t0z, t1x, t1z, effectiveDs)
            const raw   = camberStrength * kappa
            rawCamber[i] = Math.max(-MAX_CAMBER, Math.min(MAX_CAMBER, raw))
        }

        // Last sample: replicate tangent from second-to-last segment.
        // (already computed above — tx[N-1]/tz[N-1] = forward tangent of last segment, correct)

        // Forward-march slew-rate limit for camber.
        const camberRad = new Array(N)
        camberRad[0] = rawCamber[0]
        for (let i = 1; i < N; i++) {
            const ds       = arcPos[i] - arcPos[i - 1]
            const maxDelta = slewRateRadPerM * ds
            const prev     = camberRad[i - 1]
            const target   = rawCamber[i]
            const delta    = target - prev
            if      (delta >  maxDelta) camberRad[i] = prev + maxDelta
            else if (delta < -maxDelta) camberRad[i] = prev - maxDelta
            else                        camberRad[i] = target
        }

        return { arcPos, gradeY, camberRad, tx, tz }
    }

    /**
     * Return the banking angle (radians) at continuous-run arc-position `arcS` for `runKey`.
     * D2 (plan 09-21): ONE slew-rate-limited profile per canonical run — ribbon sweep,
     * terrain carve, and physics all call this so visual == physics banking.
     *
     * Cache: keyed by runKey, invalidated when this._generation changes (D1).
     * Query: O(log N) binary search — allocation-free in the inner loop (no new arrays).
     *
     * @param {number} arcS   — continuous arc-length position along the run (metres)
     * @param {string} runKey — canonical run key matching the network entry
     * @returns {number} banking angle in radians (positive = bank right on left turn)
     */
    camberProfile(arcS, runKey) {
        if (!runKey) return 0

        // Lazy-init the per-instance cache Map.
        if (!this._camberProfileCache) this._camberProfileCache = new Map()

        // Network-revision invalidation: rebuild if the network content changed since last build.
        const currentRev = this._networkRev
        const cached = this._camberProfileCache.get(runKey)
        if (cached && cached.rev === currentRev) {
            // Fast path: binary-search and interpolate.
            return _interpolateCamber(cached.arcPos, cached.camberRad, arcS)
        }

        // (Re)build the profile for this run.
        const profile = this._buildCamberProfile(runKey)
        if (!profile) return 0

        this._camberProfileCache.set(runKey, { rev: currentRev, ...profile })
        return _interpolateCamber(profile.arcPos, profile.camberRad, arcS)
    }

    /**
     * P0 — Continuous per-run profile sampler (plan 09-25).
     * Returns gradeY/camberRad/tx/tz sampled at run-global arc-position `arcS` for `runKey`.
     *
     * ONE source, ONE arc domain. Both sides of any tile/chunk seam resolve to the same arcS,
     * so anything read by arcS is C0 by construction — seam-continuity is guaranteed.
     *
     * Cache: lazy-init `this._runProfileCache` Map, entries keyed by runKey carrying
     *   { generation, arcPos, gradeY, camberRad, tx, tz }.
     * Invalidation: D1 — rebuilt when `this._generation` differs from stored (same discipline
     *   as camberProfile / _camberProfileCache).
     * Query: ONE binary search on arcPos via _interpolateRunProfile, O(log N) per call.
     * Allocation: the returned object { gradeY, camberRad, tx, tz } is the ONLY allocation
     *   per query. Signature optionally accepts a caller-provided `out` object to avoid it.
     *
     * @param {number} arcS   — run-global arc-length position (metres)
     * @param {string} runKey — canonical run key matching the network entry (e.g. "0:0")
     * @param {object} [out]  — optional reusable { gradeY, camberRad, tx, tz } to write into
     * @returns {{ gradeY: number, camberRad: number, tx: number, tz: number }}
     *   gradeY    — routed centerline Y (metres)
     *   camberRad — slew-limited banking angle (radians)
     *   tx / tz   — unit XZ forward tangent components
     *   Falls back to zeroed sample { gradeY:0, camberRad:0, tx:1, tz:0 } for unknown/empty run.
     */
    runProfile(arcS, runKey, out) {
        const result = out ?? { gradeY: 0, camberRad: 0, tx: 1, tz: 0 }

        if (!runKey) {
            result.gradeY = 0; result.camberRad = 0; result.tx = 1; result.tz = 0
            return result
        }

        // Lazy-init per-instance cache.
        if (!this._runProfileCache) this._runProfileCache = new Map()

        const currentRev = this._networkRev
        const cached = this._runProfileCache.get(runKey)
        if (cached && cached.rev === currentRev) {
            // Fast path: ONE binary search, interpolate all four arrays.
            return _interpolateRunProfile(
                cached.arcPos, cached.gradeY, cached.camberRad, cached.tx, cached.tz,
                arcS, result
            )
        }

        // (Re)build profile for this run.
        const profile = this._buildRunProfile(runKey)
        if (!profile) {
            // BUG-14 secondary: runKey not found in this._network — _tiles/_network desync.
            // This can happen when queryNearest returns a runKey that has already been evicted
            // from this._network by a re-stream. Fail loud so the caller can diagnose (D-16).
            // Do NOT silently snap gradeY to 0 (that would pull the truck underground).
            if (runKey) console.warn(`[road] runProfile: runKey "${runKey}" not in _network (desync) arcS=${arcS.toFixed(1)}`)
            result.gradeY = 0; result.camberRad = 0; result.tx = 1; result.tz = 0
            return result
        }

        this._runProfileCache.set(runKey, { rev: currentRev, ...profile })
        return _interpolateRunProfile(
            profile.arcPos, profile.gradeY, profile.camberRad, profile.tx, profile.tz,
            arcS, result
        )
    }

    // ── Phase 9 P1: Road-query API — single seam-continuous surface ──────────────

    /**
     * @typedef {Object} RoadSample
     * Road surface sample — the single struct every consumer reads.
     * Implement-now fields (P1): all geometry needed by BUG-14/12/10 fixes.
     * Design-for-later hooks: surfaceType, onRoad — carried but no feature logic built (P1 scope).
     *
     * @property {boolean} onRoad         — true if blendW > 0 (query is within road corridor)
     * @property {string}  runKey         — canonical run key matching this._network entry
     * @property {number}  arcS           — run-global arc-length position (metres)
     * @property {number}  lateralSigned  — signed lateral distance from centerline (metres; positive = right of travel)
     * @property {number}  gradeY         — seam-continuous routed centerline Y (metres) from runProfile
     * @property {{ x: number, z: number }} tangent — unit XZ forward tangent from runProfile
     * @property {number}  camber         — banking angle (radians) in world/slice frame (camberSign applied)
     * @property {number}  crown          — crown height offset at lateralSigned (metres)
     * @property {number}  blendW         — blend weight: 1 on ribbon, ramps to 0 at shoulder edge
     * @property {string}  surfaceType    — surface material hook ('asphalt' default; friction/tier NOT built here)
     */

    /**
     * `byArc(runKey, arcS, lateralSigned?)` → RoadSample
     *
     * Build a RoadSample for consumers that already have (runKey, arcS) — ribbon, carve, physics.
     * All geometry is read from the P0 runProfile (seam-continuous by construction).
     *
     * Does NOT read queryNearest or per-tile splines — geometry comes ONLY from runProfile.
     * Crown and camber are returned as SEPARATE fields; physics/carve fold them in their own way (P2).
     *
     * @param {string} runKey         — canonical run key
     * @param {number} arcS           — run-global arc-length (metres)
     * @param {number} [lateralSigned=0] — signed lateral offset from centerline (metres)
     * @returns {RoadSample}
     */
    byArc(runKey, arcS, lateralSigned = 0) {
        const p             = this._params
        const halfWidth     = p.roadHalfWidth     ?? 5
        const shoulderWidth = p.roadShoulderWidth  ?? 2.5
        const crownHeight   = p.crownHeight        ?? 0.05

        // All geometry from P0 runProfile — seam-continuous across tile/slice boundaries.
        const prof = this.runProfile(arcS, runKey)

        // Crown: parabolic profile via road-carve.js crownProfile (same formula as sweepRibbon).
        const crown = crownProfile(lateralSigned, halfWidth, crownHeight)

        // Blend weight: 1 on ribbon (|lat| < halfWidth), ramp down over shoulder, 0 beyond.
        const latAbs = Math.abs(lateralSigned)
        let blendW
        if (latAbs < halfWidth) {
            blendW = 1.0
        } else {
            blendW = Math.max(0.0, 1.0 - (latAbs - halfWidth) / shoulderWidth)
        }

        return {
            onRoad:        blendW > 0,
            runKey,
            arcS,
            lateralSigned,
            gradeY:        prof.gradeY,
            tangent:       { x: prof.tx, z: prof.tz },
            // camber in run-frame — caller (sampleRoadAt) applies camberSign for world/slice frame.
            // byArc exposes the raw run-frame angle; direct callers that already have camberSign
            // should multiply it themselves (e.g. physics via _sampleCarveWorld already does this).
            camber:        prof.camberRad,
            crown,
            blendW,
            surfaceType:   'asphalt',   // hook for future friction/tier — no logic built (P1 scope)
        }
    }

    /**
     * `sampleRoadAt(wx, wz, radiusM?)` → RoadSample | null
     *
     * World-space road query. Uses `queryNearest` as the PROJECTOR (keeps _tiles block acceleration
     * + 09-17 projection refine) to find `(runKey, arcS)`, then delegates ALL geometry to
     * `byArc` which reads the P0 runProfile — so gradeY/camber/tangent are seam-continuous.
     *
     * queryNearest is ONLY the projector here; no geometry values (nr.point.y, etc.) are used
     * for the returned sample — only nr.point/nr.tangent for the lateral-sign derivation and
     * nr.runKey/nr.arcS/nr.camberSign for routing to the profile.
     *
     * Returns null when:
     *  - queryNearest finds no road within maxExt radius, OR
     *  - the computed lateral distance exceeds (halfWidth + shoulderWidth) — off-road reject,
     *    same threshold as _sampleCarveWorld line ~1706.
     *
     * Performance note: sampleRoadAt is the future per-wheel cache chokepoint — accumulating
     * per-wheel results across suspension substeps to amortize the O(log N) profile cost on the
     * 60 fps hot path. Caching is NOT built in this plan (P1 scope); the chokepoint design is
     * preserved so it slots in without another refactor.
     *
     * @param {number} wx       — world X
     * @param {number} wz       — world Z
     * @param {number} [radiusM] — max search radius (defaults to halfWidth + shoulderWidth + 4)
     * @returns {RoadSample | null}
     */
    sampleRoadAt(wx, wz, radiusM) {
        const p             = this._params
        const halfWidth     = p.roadHalfWidth     ?? 5
        const shoulderWidth = p.roadShoulderWidth  ?? 2.5

        const maxExt = halfWidth + shoulderWidth + 4
        const nr = this.queryNearest(wx, wz, radiusM ?? maxExt)
        if (!nr) return null

        // Derive signed lateral using the established sign convention (same as _sampleCarveWorld):
        // signedLat = dx*tz − dz*tx, where dx/dz = query point relative to nearest road point.
        const dx = wx - nr.point.x
        const dz = wz - nr.point.z
        const tx = nr.tangent.x, tz = nr.tangent.z
        const signedLat = dx * tz - dz * tx

        // Off-road reject — same threshold as _sampleCarveWorld.
        if (Math.abs(signedLat) > halfWidth + shoulderWidth) return null

        // All geometry from byArc → runProfile (P0). nr.point.y is NOT used for gradeY.
        const sample = this.byArc(nr.runKey, nr.arcS, signedLat)

        // Apply camberSign to put camber into the world/slice frame (matches _sampleCarveWorld
        // and the carve: camberSign = sign(arcS1−arcS0) accounts for E→W slice reversal).
        sample.camber = (nr.camberSign ?? 1) * sample.camber

        return sample
    }

    /**
     * Return the smoothed design-grade Y at arc-length position arcS along spline.
     * Delegates to _smoothDesignGrade (shared WeakMap memo — O(1) after first sweep per spline).
     * arcS is clamped to [arcPos[0], arcPos[N-1]] before interpolation.
     *
     * This is the SINGLE shared elevation source for plan 09-08 carve sites. Calling it at
     * nr.arcS from both _sampleCarveWorld and _buildCarveTable gives a clean, cache-coherent,
     * carve-free grade that does NOT double-count crown/camber/pothole.
     *
     * @param {THREE.CatmullRomCurve3} spline  — spline object (WeakMap key)
     * @param {number}                 arcS    — arc-length position along spline (metres)
     * @param {Function}               terrainRef — carve-free raw-height sampler (rawHeightWorld)
     * @param {object}                 params  — RANGER_PARAMS (for designGradeWindow)
     * @returns {number} Smoothed design-grade height in metres.
     */
    sampleDesignGradeAt(spline, arcS, terrainRef, params) {
        const { designGradeY, arcPos } = this._smoothDesignGrade(spline, terrainRef, params)
        const N = arcPos.length
        if (N === 0) return 0

        // Clamp to sampled arc range.
        const s = Math.max(arcPos[0], Math.min(arcPos[N - 1], arcS))

        // Binary search for the interval containing s.
        let lo = 0
        let hi = N - 1
        while (lo < hi - 1) {
            const mid = (lo + hi) >> 1
            if (arcPos[mid] <= s) lo = mid; else hi = mid
        }

        // Linear interpolation between lo and hi.
        const span = arcPos[hi] - arcPos[lo]
        if (span < 1e-9) return designGradeY[lo]
        const t = (s - arcPos[lo]) / span
        return designGradeY[lo] + t * (designGradeY[hi] - designGradeY[lo])
    }

    /**
     * Invoke `cb(t)` for every t∈(0,1) at which the linear segment [v0,v1] crosses an
     * integer multiple of `step` (a tile boundary on one axis). No allocation.
     * @param {number} v0 — segment start coordinate (x or z)
     * @param {number} v1 — segment end coordinate
     * @param {number} step — CHUNK_SIZE
     * @param {(t:number)=>void} cb
     */
    _collectCrossings(v0, v1, step, cb) {
        if (v0 === v1) return
        const lo = Math.min(v0, v1), hi = Math.max(v0, v1)
        // First boundary strictly greater than lo.
        let k = Math.floor(lo / step) + 1
        let boundary = k * step
        while (boundary < hi - 1e-9) {
            const t = (boundary - v0) / (v1 - v0)
            if (t > 1e-9 && t < 1 - 1e-9) cb(t)
            k++
            boundary = k * step
        }
    }

    /**
     * De-duplicate a sub-polyline's coincident control points, assign it to the tile containing
     * its midpoint, build its centripetal Catmull-Rom spline, and store it in `this._tiles`.
     * Skips sub-polylines that collapse to < 2 distinct points.
     * @param {THREE.Vector3[]} pts — a sub-polyline (one tile's slice of a network polyline)
     * @param {string} runKey — parent network-run key (so adjacent tiles can pick the same run)
     * @param {number} runWeight — parent run's total point count (representative tie-break)
     */
    _assignSlice(pts, runKey, runWeight, arcSHead = 0, arcSTail = 0) {
        // Centripetal divide-by-zero guard: drop consecutive coincident control points.
        const clean = []
        for (const p of pts) {
            const last = clean[clean.length - 1]
            if (!last || Math.abs(last.x - p.x) > 1e-6 || Math.abs(last.y - p.y) > 1e-6 || Math.abs(last.z - p.z) > 1e-6) {
                clean.push(p)
            }
        }
        if (clean.length < 2) return

        // Assign by midpoint tile (a slice lies within one tile by construction, since it was cut
        // at every boundary crossing; the midpoint is an unambiguous, deterministic representative).
        const mid = clean[(clean.length / 2) | 0]
        const tileX = Math.floor(mid.x / CHUNK_SIZE)
        const tileZ = Math.floor(mid.z / CHUNK_SIZE)
        const key = `${tileX},${tileZ}`

        // Orient the slice WEST→EAST (increasing x) so the seam harness's getPoint(0.0)=west-edge /
        // getPoint(1.0)=east-edge convention holds: a tile's east-edge point matches the east
        // neighbour's west-edge point (both are the same sliced boundary crossing → C0/C1).
        const head = clean[0], tail = clean[clean.length - 1]
        const reversed = (tail.x < head.x)
        if (reversed) clean.reverse()

        // BUG-10 camber continuity: arcS0/arcS1 = the RUN-arc-length at this slice's oriented u=0 and
        // u=1 endpoints. arcSHead/arcSTail are the run-arc at the original (pre-orientation) head/tail
        // (arcSHead < arcSTail since the run is walked in order). After the W→E reversal, the u=0 end
        // is the original tail. Consumers compute arcS(u) = arcS0 + (arcS1−arcS0)·u (the true run-arc,
        // monotonic in u even when the slice runs E→W) and camberSign = sign(arcS1−arcS0) to express
        // the run-frame signed camber in this slice's sweep frame.
        const arcS0 = reversed ? arcSTail : arcSHead
        const arcS1 = reversed ? arcSHead : arcSTail

        // Record which tile boundaries this slice touches, so ensureTile can prefer an E-W-spanning
        // representative (one whose endpoints sit on the shared E/W boundaries the harness reads).
        const xw = tileX * CHUNK_SIZE, xe = (tileX + 1) * CHUNK_SIZE
        const a0 = clean[0], a1 = clean[clean.length - 1]
        const touchesWest = Math.abs(a0.x - xw) < 1e-3
        const touchesEast = Math.abs(a1.x - xe) < 1e-3
        const spanScore = (touchesWest ? 1 : 0) + (touchesEast ? 1 : 0)

        // Phase B (BUG-12 fold fix): sample the run's EXACT primitive centerline instead of re-fitting
        // these control points with overshooting centripetal Catmull-Rom. Map this slice's owner-
        // origined run-arc [arcS0, arcS1] to centerline arc by fraction of polyArc (both endpoints of a
        // tile-boundary cut map to the SAME fraction from each side → seam C0 preserved). Y is carried
        // from `clean` (already graded) so gradeY/camber agreement is unchanged; only XZ stops folding.
        // Fallback to Catmull-Rom for edge fragments with no centerline (tiny truncated bits).
        const entry = this._network.get(runKey)
        let spline
        if (USE_CENTERLINE_RIBBON && entry && entry.centerline && entry.centerline.length > 1e-6 && entry.polyCum) {
            // Map this slice's owner-origined arcS endpoints to centerline arc through the run's exact
            // polyline→centerline correspondence table (built in _streamNetwork by sequential
            // projection). arcS + arcOrigin = run polyline cumulative-XZ arc = the table's polyCum key.
            // A tile-boundary cut has one arcS shared by both adjacent slices → identical centerline arc
            // → seam C0 preserved. clean carries the graded Y (overlaid by CenterlineCurve).
            const arcOrigin = entry.arcOrigin ?? 0
            const s0 = _interpArcTable(entry.polyCum, entry.clArc, arcS0 + arcOrigin)
            const s1 = _interpArcTable(entry.polyCum, entry.clArc, arcS1 + arcOrigin)
            spline = new CenterlineCurve(entry.centerline, s0, s1, clean)
        } else {
            spline = new THREE.CatmullRomCurve3(clean, false, 'centripetal', 0.5)
        }
        let arr = this._tiles.get(key)
        if (!arr) { arr = []; this._tiles.set(key, arr) }
        arr.push({ spline, points: clean, waypoints: clean, runKey, runWeight, spanScore, arcS0, arcS1 })
    }

}

// ── Module-scope debug line builder ───────────────────────────────────────────
/**
 * Build a THREE.Line debug object from a CatmullRomCurve3 spline.
 * Uses .visible toggle rather than dispose/recreate to avoid GC pressure at 60fps.
 * @param {THREE.CatmullRomCurve3} spline
 * @param {number} [color=0xffaa00] — orange default
 * @returns {THREE.Line}
 */
function _buildDebugLine(spline, color = 0xffaa00) {
    const pts = spline.getPoints(64)
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color, depthTest: true })
    return new THREE.Line(geo, mat)
}

// PROTOTYPE: build a THREE.Line directly from a point array (valley-trunk proto).
function _buildDebugLine2(pts, color = 0x00e5ff) {
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color, depthTest: true })
    return new THREE.Line(geo, mat)
}
