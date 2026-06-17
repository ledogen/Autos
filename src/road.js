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
import { crownProfile, potholeNoise, signedCurvature, filletMinRadius, arcFilletWaypoints, arcPrimitiveConnect } from './road-carve.js'
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
 * Promoted from the closure inside _removeSelfCrossings (P9 plan 01-01) so that
 * Wave 3 junction detection (_detectJunctions) can reuse it across different runs
 * in this._network without duplicating the math. _removeSelfCrossings delegates here.
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
const PROTO_MARGIN         = 200   // m — N/S detour room so a connection can wrap around a peak
const PROTO_REGEN_MOVE     = 96    // m — re-stream the trunk once the view center moves this far
const PROTO_SNAP_CAP       = PROTO_ANCHOR_SPACING * 0.45  // m — max anchor gradient-descent displacement (keeps anchors in their lane → fewer parallel/duplicate roads)
const PROTO_PARAM_DEBOUNCE = 160   // ms — coalesce slider drags before re-routing
// 8-connectivity direction vectors (index 0..7); used for the turn-penalty A* state.
const PROTO_DIRS = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]
const _protoTurnSteps = (d1, d2) => { const a = Math.abs(d1 - d2); return Math.min(a, 8 - a) }  // 0..4 (×45°)
// Parallel-overlap suppression: a candidate road is dropped if more than COVER_FRAC of its sample
// points run within COVER_D metres of an already-drawn road heading the same way (dot > COVER_DOT).
// Crossings (different heading where they meet) are preserved — only same-direction overlaps are cut.
const PROTO_COVER_D    = 36     // m — proximity that counts as "on top of" another road
const PROTO_COVER_DOT  = 0.93   // cos(~21°) — heading similarity that counts as "same direction"
const PROTO_COVER_FRAC = 0.5    // drop the road if more than half its length overlaps a same-dir road
// Intra-road loop removal (proximity-based): if the path returns within PROTO_LOOP_D metres of
// somewhere it was already PROTO_LOOP_ARCLAG metres-of-travel ago, the intervening stretch is a
// loop/fold and gets spliced out. ARCLAG > LOOP_D keeps switchbacks (legs sit > LOOP_D apart).
const PROTO_LOOP_D      = 11    // m — "returned to where it was" distance
const PROTO_LOOP_ARCLAG = 38    // m — min along-path travel before a return counts as a loop
const PROTO_RUN_MIN     = 4     // min points for an emitted road run (avoids tiny fragments)

// ── D-16: Canonical anchor-band half-width for window-invariant runs ───────────
// _streamNetwork builds each macro-row run over a canonical fixed-width band keyed by
// (mz, mx0, mx1) rather than the transient streaming window. CANONICAL_HALF_WIDTH is the
// number of macro-column cells to extend either side of the view-center column, derived
// by rounding the streaming radius (640 m) up to the nearest PROTO_ANCHOR_SPACING (256 m).
// This ensures no rendered road escapes the canonical band while keeping the band finite.
// The canonical mx0/mx1 for a given center remains the same so long as the integer quotient
// floor(center.x / PROTO_ANCHOR_SPACING) is unchanged — the memo key "mz:mx0:mx1" then
// short-circuits the per-run rebuild without recomputing the polyline (same discipline as
// _slicedFrom identity guard). The value 4 covers ±1024 m (4 × 256 m), safely wider than
// the default 640 m streaming radius.
const CANONICAL_HALF_WIDTH = 4  // macro-column cells each side of the center column

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
        if (!this._tiles) return { pts: [], sampleArcS: [], sampleRunKeys: [], sampleCamberSign: [] }

        const qTileX = Math.floor(centerX / CHUNK_SIZE)
        const qTileZ = Math.floor(centerZ / CHUNK_SIZE)
        const blk    = Math.ceil(radiusM / CHUNK_SIZE)

        const pts          = []
        const sampleArcS   = []
        const sampleRunKeys = []
        const sampleCamberSign = []   // BUG-10: per-sample run-frame→slice-frame camber sign

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
                    for (let i = 0; i <= n; i++) {
                        const u = i / n
                        const p = spline.getPointAt(u)   // allocates; only site — pre-loop
                        const t = spline.getTangentAt(u) // D4: tangent for arm-disambiguation
                        // Stride 5: [x, y, z, tx, tz]
                        pts.push(p.x, p.y, p.z, t.x, t.z)
                        // D3: parallel arc-length + runKey + camberSign arrays (indexed by sample number)
                        sampleArcS.push(arcS0 + (arcS1 - arcS0) * u)
                        sampleRunKeys.push(runKey)
                        sampleCamberSign.push(camberSign)
                    }
                }
            }
        }

        return { pts, sampleArcS, sampleRunKeys, sampleCamberSign }
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
        if (this._canonRunCache) this._canonRunCache.clear()
        this._slicedFrom = null
        // D1: bump the single invalidation counter — signals ribbon tiles + carve chunks to rebuild.
        this._generation++
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
            segs:     new Map(),                             // "ax,az>bx,bz" → THREE.Vector3[] (connection waypoints)
            lastCenter: null,
            dirty:    true,
            surfaceY: null,                                  // optional (x,z)=>renderedHeight for visual line placement
        }
        // D1 — single invalidation source (plan 09-19).
        // Bumped on every re-route (invalidateCache) AND every real re-stream (_streamNetwork past
        // lazy gate). Consumed by ribbon tiles (road-mesh.js builtGeneration) and terrain-carve
        // chunks (terrain.js builtRoadGeneration) to detect and rebuild stale geometry.
        this._generation = 0

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
        this._proto.segs.clear()
        // Clear the canonical run cache: param changes affect routing results.
        if (this._canonRunCache) this._canonRunCache.clear()
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

    _protoEdgeCost(fromH, toH, horiz, P) {
        const grade = Math.abs(toH - fromH) / horiz
        const over  = Math.max(0, grade - P.maxGrade)
        return P.wDist * horiz + P.wAlt * toH + P.wGrade * grade * grade + P.wOver * over
    }

    // Collinear simplify: drop waypoints that don't represent a real turn (relative to the last
    // kept point). Collapses grid-discretization micro-jogs into long straights → smoother spline,
    // fewer control points, fewer overshoot self-intersections.
    _protoSimplify(points, angleThreshDeg) {
        if (points.length < 3) return points.slice()
        const th = angleThreshDeg * Math.PI / 180
        const out = [points[0]]
        for (let i = 1; i < points.length - 1; i++) {
            const p = out[out.length - 1], c = points[i], n = points[i + 1]
            const v1x = c.x - p.x, v1z = c.z - p.z, v2x = n.x - c.x, v2z = n.z - c.z
            const l1 = Math.hypot(v1x, v1z), l2 = Math.hypot(v2x, v2z)
            if (l1 < 1e-6 || l2 < 1e-6) continue
            const cos = (v1x * v2x + v1z * v2z) / (l1 * l2)
            if (Math.acos(Math.max(-1, Math.min(1, cos))) > th) out.push(c)  // keep real turns
        }
        out.push(points[points.length - 1])
        return out
    }

    // Remove loops / self-folds from a single road's polyline (PROXIMITY based, not crossing based):
    // if point j returns within PROTO_LOOP_D of an earlier point i that is > PROTO_LOOP_ARCLAG metres
    // back along the path, the stretch i+1..j-1 is a loop or tight fold and is spliced out (i joins j).
    // Catches spline-overshoot loops AND junction folds even when the sampled crossing is imperfect;
    // switchbacks survive because their parallel legs sit farther apart than PROTO_LOOP_D.
    _removeLoops(pts) {
        let p = pts
        for (let guard = 0; guard < 200; guard++) {
            const arc = new Float64Array(p.length)
            for (let k = 1; k < p.length; k++) arc[k] = arc[k - 1] + Math.hypot(p[k].x - p[k - 1].x, p[k].z - p[k - 1].z)
            let found = false
            for (let i = 0; i < p.length - 1 && !found; i++) {
                for (let j = i + 2; j < p.length; j++) {
                    if (arc[j] - arc[i] < PROTO_LOOP_ARCLAG) continue       // too close along the path
                    const dx = p[j].x - p[i].x, dz = p[j].z - p[i].z
                    if (dx * dx + dz * dz < PROTO_LOOP_D * PROTO_LOOP_D) {  // returned near an earlier point
                        p = [...p.slice(0, i + 1), ...p.slice(j)]          // splice out the loop
                        found = true; break
                    }
                }
            }
            if (!found) break
        }
        return p
    }

    // Remove TRUE segment-segment self-crossings from a polyline (QUAL-01 — complements proximity
    // _removeLoops which only catches wide arcs; this catches Image-2 X-crossings and tight loops
    // that fall below PROTO_LOOP_ARCLAG). Algorithm: for each pair of non-adjacent segments
    // (i,i+1) and (j,j+1) with j >= i+2, test XZ intersection; on the first crossing found,
    // splice to [...pts[0..i], intersectionPoint, ...pts[j+1..]] and restart. Bounded ≤ 200
    // iterations so it cannot loop infinitely on a degenerate polyline.
    // Pure function of its input — no Math.random, no Date, no session state → deterministic (D-03).
    _removeSelfCrossings(pts) {
        // Delegates to the module-scope _segXZ (promoted in P9 plan 01-01 for D-16 junction reuse).
        // No behavior change — same open-interval crossing test, same splice logic.
        let p = pts
        for (let guard = 0; guard < 200; guard++) {
            let found = false
            outer: for (let i = 0; i < p.length - 2; i++) {
                for (let j = i + 2; j < p.length - 1; j++) {
                    const ix = _segXZ(p[i].x, p[i].z, p[i+1].x, p[i+1].z,
                                      p[j].x, p[j].z, p[j+1].x, p[j+1].z)
                    if (ix) {
                        // Insert the crossing point and drop the self-crossing interior
                        const crossPt = new THREE.Vector3(ix.x, (p[i].y + p[j].y) * 0.5, ix.z)
                        p = [...p.slice(0, i + 1), crossPt, ...p.slice(j + 1)]
                        found = true; break outer
                    }
                }
            }
            if (!found) break
        }
        return p
    }

    // Arc-fillet minimum-turn-radius pass (D0 — replaces the coil-excision _limitCurvature).
    // At each interior vertex where the implied corner radius < minRadius, insert a circular arc
    // of radius = minRadius tangent to both legs, replacing the sharp corner. The centerline is
    // ROUNDED (not excised) to minRadius so the two arms of a hairpin are separated by ~2·minRadius.
    // At a 180° hairpin this yields a semicircle → arm separation ≈ 2·minRadius — wide enough that
    // the ribbon (±roadHalfWidth) never folds onto itself when minRadius ≥ roadHalfWidth + clearance.
    //
    // Algorithm per interior vertex B between legs A→B (incoming) and B→C (outgoing):
    //   1. Compute XZ heading vectors for both legs.
    //   2. Turn angle φ = exterior deflection angle (the angle you must steer through).
    //      φ = π − (interior angle at B) = |atan2 cross, dot| of normalized leg directions.
    //   3. Tangent length (how far back each leg is trimmed): t = R · tan(φ/2).
    //      (Standard road geometry: tangent distance for a circular arc of radius R and deflection φ.)
    //   4. If either leg is shorter than t, skip the fillet (degenerate; the point is too close to
    //      a neighbor for the arc to fit). The point is left as-is.
    //   5. Trim points: T1 = B − t·dir_incoming, T2 = B + t·dir_outgoing.
    //   6. Insert N_ARC arc sample points along the circular arc from T1 to T2 (interpolated in XZ
    //      with Y linearly blended from T1.y to T2.y so the routed grade stays continuous).
    //
    // Pure function of (pts, minRadius) — deterministic, window-invariant. Runs on the canonical
    // run (not a windowed slice) like the other post-passes. No Math.random, no session state.
    //
    // NOTE ON MAX GRADE: Filleting a hairpin rounds the corner and may slightly lengthen the path.
    // The existing soft-cost router already balances grade (D-09); the fillet does not bypass it.
    // A re-stream after a slider change re-routes with the updated minRadius, re-evaluating grade.
    // Thin THREE-adapter around the pure filletMinRadius (src/road-carve.js). The pure
    // function does the real work: an iterative curvature-clamp that relaxes any vertex
    // whose local turn radius is below minRadius toward its neighbour midpoint, until
    // every interior turn radius ≥ minRadius. A previous version filleted per-vertex
    // (tangent = minRadius·tan(φ/2)), which BAILED at hairpins — the tangent couldn't fit
    // between the dense Catmull-Rom samples, so the sharp apex passed through unchanged
    // and the ribbon (±roadHalfWidth) folded. The pure curvature-clamp handles dense
    // polylines and hairpins correctly and is gated headlessly by the fillet-enforcement
    // fixture in test/spline-continuity.mjs.
    _filletMinRadius(pts, minRadius) {
        if (pts.length < 3 || !(minRadius > 0)) return pts
        // filletMinRadius works on plain {x,y,z}; map back to THREE.Vector3 so downstream
        // consumers (emitRun's p.clone(), the Catmull-Rom slicer) keep their Vector3 API.
        const relaxed = filletMinRadius(pts, minRadius)
        return relaxed.map(p => new THREE.Vector3(p.x, p.y, p.z))
    }

    // Excise over-tight coils by CURVATURE (angle-per-distance), not per-vertex angle (QUAL-01).
    // A tight loop/teardrop is many small-deflection vertices that ACCUMULATE a large heading change
    // over a short arc — per-vertex angle never catches it. Here we scan spans of signed cumulative
    // heading change vs arc length: where a span turns >= TURN_MIN and its effective radius
    // (arc / |Δheading|) < minRadius, the path is curling tighter than a road of radius minRadius can
    // — excise the span (join its entry directly to its exit). Signed accumulation means S-curves
    // (alternating turns) cancel and are NOT excised; only consistent coils are. Endpoints are
    // preserved by the slice (p[0..i] and p[j+1..end] are kept). Deterministic, no random state (D-03).
    // NOTE: _limitCurvature is superseded by _filletMinRadius (D0) — kept for reference only.
    _limitCurvature(pts, minRadius) {
        if (pts.length < 4 || !(minRadius > 0)) return pts
        const TURN_MIN = 150 * Math.PI / 180  // only scrutinize spans that turn >= 150° (a coil/loop)
        const TURN_CAP = 2.2 * Math.PI        // stop growing a window past ~400° of accumulation
        let p = pts.slice()
        for (let guard = 0; guard < 200; guard++) {
            const n = p.length
            if (n < 4) break
            // Per-segment heading + length.
            const len = new Float64Array(n - 1)
            const ang = new Float64Array(n - 1)
            for (let k = 0; k < n - 1; k++) {
                const dx = p[k + 1].x - p[k].x, dz = p[k + 1].z - p[k].z
                len[k] = Math.hypot(dx, dz)
                ang[k] = Math.atan2(dz, dx)
            }
            let found = false
            for (let i = 0; i < n - 2 && !found; i++) {
                let cumTurn = 0          // signed cumulative heading change (rad)
                let cumArc  = len[i]
                for (let j = i + 1; j < n - 1; j++) {
                    let d = ang[j] - ang[j - 1]
                    while (d >  Math.PI) d -= 2 * Math.PI
                    while (d < -Math.PI) d += 2 * Math.PI
                    cumTurn += d
                    cumArc  += len[j]
                    const absTurn = Math.abs(cumTurn)
                    if (absTurn >= TURN_MIN && (cumArc / absTurn) < minRadius) {
                        p = [...p.slice(0, i + 1), ...p.slice(j + 1)]  // excise coil; join entry→exit
                        found = true
                        break
                    }
                    if (absTurn > TURN_CAP) break  // window already a full coil — move the start
                }
            }
            if (!found) break
        }
        return p
    }

    // Turn-penalty soft-cost A* between two anchors over a grid covering their bbox + N/S margin.
    // State = (cell, incoming-direction) so a per-45° turn penalty (wTurn) is charged — this is what
    // makes the route run long straights and only switchback where the grade truly forces it.
    // Never fails (soft penalty keeps all edges finite).
    _protoConnect(a, b) {
        const key = `${a.x.toFixed(0)},${a.z.toFixed(0)}>${b.x.toFixed(0)},${b.z.toFixed(0)}`
        const cached = this._proto.segs.get(key)
        if (cached) return cached
        const P = this._proto.params
        // Arc-primitive hybrid-A* (D-arc): the centerline is min-turn-radius-VALID BY CONSTRUCTION,
        // replacing the 8-grid cell A* whose 45°/cell corners folded the ribbon and which the
        // post-hoc fillet/cleanup stack could not repair. The hardest motion primitive's radius is
        // the geometric fold-safe floor (~halfWidth + clearance, user-set ≥ 8 m); cost mirrors
        // _protoEdgeCost (valley wAlt, grade², soft over-cap) plus a curvature penalty (wCurv = wTurn)
        // so the straight primitive is cheapest → long near-straights, with switchbacks emerging
        // deterministically only where grade forces them. Pure fn in road-carve.js.
        const pp = this._params || {}
        const halfW = pp.roadHalfWidth ?? 5, clearance = pp.roadClearanceMargin ?? 0.5
        const hardR = Math.max(pp.roadArcHardRadius ?? 8, halfW + clearance + 0.1)  // tightest turn; ≥ floor
        const _ptAC = performance.now()
        const rawPts = arcPrimitiveConnect(a.x, a.z, b.x, b.z, (x, z) => this._coarseH(x, z), {
            hardR, gentleR: pp.roadArcGentleRadius ?? 30, margin: PROTO_MARGIN,
            wDist: P.wDist, wAlt: P.wAlt, wGrade: P.wGrade, wOver: P.wOver,
            maxGrade: P.maxGrade, wCurv: P.wTurn, wHeur: pp.roadArcHeurWeight ?? 1.5,
        })
        perfAdd('road.arcPrimitiveConnect', performance.now() - _ptAC)  // TEMP (D-arc): cold-route cost = the spawn lag
        const raw = rawPts.map(p => new THREE.Vector3(p.x, p.y, p.z))
        // Collapse true straights (drop near-collinear interior points) → variable spacing; the
        // arc corners (≥ ~3.8°/sample) are kept, so re-splining downstream cannot undershoot to a fold.
        const simp = this._protoSimplify(raw, 2)
        const out = []
        for (const p of simp) if (!out.length || out[out.length - 1].distanceToSquared(p) > 1e-4) out.push(p)
        this._proto.segs.set(key, out)
        return out
    }

    // ── Canonical network builder (D-08) ────────────────────────────────────────
    /**
     * Build the canonical valley-trunk network around `center` into this._network — the
     * single source of truth for slicing (08-06), viz (08-07), and queries. Pure data:
     * allocates NO scene lines and applies NO visual y-lift (those are render-only, 08-07);
     * the network y is the raw routed height.
     *
     * Pipeline (validated in spike-001): over the streamed macro-cell window, for each row
     * concatenate the row's east _protoConnect(_protoAnchor(mx,mz), _protoAnchor(mx+1,mz))
     * segments into ONE continuous polyline (dropping the shared anchor), centripetal-sample
     * it, _removeLoops, then split into kept runs using the inter-row same-direction overlap
     * suppression (PROTO_COVER_* spatial hash; a row is registered only AFTER it is emitted so
     * a straight road never self-culls). Each kept run (≥ PROTO_RUN_MIN points) is stored as
     * this._network["<mz>:<runIndex>"] = { points: THREE.Vector3[] }.
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

        this._networkCenter = center.clone()
        this._proto.lastCenter = center.clone()
        this._proto.dirty = false
        // Refresh live D-09 weights from this._params (debug sliders mutate it in place) so this
        // re-stream uses the current slider values — deterministic re-route (D-03).
        this._refreshParams()
        // Bound the proto caches BEFORE building (CR-02). anchors/segs are pure functions of
        // coords, so a cache miss recomputes the identical value — evicting them is always benign.
        // Doing it pre-build (rather than post-build) makes the result independent of WHEN the
        // size threshold trips, preserving the module's purity contract (a network is a pure
        // function of seed+center+params, caches are memoization only).
        if (this._proto.anchors.size > 4000) this._proto.anchors.clear()
        if (this._proto.segs.size    > 1500) this._proto.segs.clear()
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

        // ── BUG-14 fix: keep the per-run profile caches COHERENT with the re-sliced tiles ──
        // runProfile (gradeY/camberRad/tangent) and camberProfile index by run-arc measured from
        // each run's points[0]. The canonical band [mx0,mx1] is anchored to center_mx (below), which
        // tracks the streaming center — so when the truck moves a run's points[0] (the arc origin)
        // shifts, and every arcS along it shifts with it. We intentionally do NOT bump _generation on
        // a positional re-stream (see note above), but these caches are generation-keyed, so without
        // an explicit clear they stay built against the PREVIOUS band's arc origin. queryNearest then
        // returns arcS in the new slice parameterization while runProfile serves the stale old-origin
        // profile → arcS indexes the wrong gradeY → the ~20 m on-road teleport at tile seams (BUG-14).
        // Clearing here (alongside this._tiles) forces a lazy O(N)-per-run rebuild from the SAME
        // this._network the new slices came from, so arcS and gradeY always share one arc origin.
        // No per-frame cost: this runs only when _streamNetwork actually rebuilds (gated above), and
        // it does NOT bump generation, so it triggers no ribbon-mesh rebuild (no flicker).
        if (this._runProfileCache) this._runProfileCache.clear()
        if (this._camberProfileCache) this._camberProfileCache.clear()
        this._runAdjacencyCache = null
        this._designGradeCache = new WeakMap()

        // ── D-16: Canonical per-run derivation (window-invariant) ─────────────────
        // Pure function of (worldSeed, world coords, params) — window-invariant (D-16);
        // identical world regions yield identical runs across re-streams.
        //
        // The mz row range follows the streaming radius (so we render roads out to R metres),
        // but each row's COLUMN extent (mx0..mx1) is derived from a STABLE world-aligned
        // grid anchor rather than the transient streaming window. This means the same macro-row
        // always gets the same polyline regardless of where the view center happens to be.
        //
        // Canonical column band: center_mx ± CANONICAL_HALF_WIDTH, where center_mx =
        //   floor(center.x / PROTO_ANCHOR_SPACING). Rows that would fall partially outside
        //   the streaming radius are still included, but their COVER suppression operates on
        //   the full canonical band — not the window slice.
        //
        // Row results are memoized by (mz, mx0, mx1) in this._canonRunCache. A re-stream whose
        // center still maps to the same canonical band key is a no-op for all rows that hit the
        // cache — same discipline as the _slicedFrom identity guard.
        // ─────────────────────────────────────────────────────────────────────────

        const R = this._proto.radius
        // Canonical X band — fixed per center_mx, not per streaming window edge.
        const center_mx = Math.floor(center.x / PROTO_ANCHOR_SPACING)
        const mx0 = center_mx - CANONICAL_HALF_WIDTH
        const mx1 = center_mx + CANONICAL_HALF_WIDTH
        // Z row range still follows streaming radius (rows come and go as we move N/S).
        const mz0 = Math.floor((center.z - R) / PROTO_ANCHOR_SPACING)
        const mz1 = Math.ceil((center.z + R) / PROTO_ANCHOR_SPACING)

        // Per-mz canonical run cache: memoize rows by "mz:mx0:mx1" so re-streams within the
        // same canonical band are free. Cleared on dirty/param-change (see _invalidateProto
        // / invalidateCache which call this._proto.dirty = true).
        if (!this._canonRunCache) this._canonRunCache = new Map()

        // Build each row over the canonical band and cache the result keyed "mz:mx0:mx1".
        // Collect all canonical runs in sorted mz order so that the COVER suppression pass
        // (which must be deterministic) sees rows in a fixed order — not streaming order.
        const canonRuns = []  // [{ mz, pts }] in mz order
        for (let mz = mz0; mz <= mz1; mz++) {
            const bandKey = `${mz}:${mx0}:${mx1}`
            let cachedPts = this._canonRunCache.get(bandKey)
            if (!cachedPts) {
                // Concatenate this row's east connections into ONE continuous polyline.
                let rowWps = []
                for (let mx = mx0; mx <= mx1; mx++) {
                    const wps = this._protoConnect(this._protoAnchor(mx, mz), this._protoAnchor(mx + 1, mz))
                    if (wps.length < 2) continue
                    if (rowWps.length) { for (let k = 1; k < wps.length; k++) rowWps.push(wps[k]) }
                    else rowWps = wps.slice()
                }
                if (rowWps.length < 2) {
                    cachedPts = []
                } else {
                    // D-arc: rowWps already comes from the arc-primitive router — min-radius-VALID by
                    // construction AND already dense (arc emission). The old `getPoints(rowWps.length*2)`
                    // existed to DENSIFY the old SPARSE grid points; applied to the already-dense arc
                    // output it multiplied the centerline into 5-20x the geometry the downstream slicer/
                    // ribbon/carve must process every stream — the streaming-cost regression. Use the
                    // arc points directly. _removeLoops/_removeSelfCrossings stay as transition nets
                    // (VBC-07) — deleted in Step 4 after in-sim confirms crease-free.
                    let pts = this._removeLoops(rowWps)
                    pts = this._removeSelfCrossings(pts)
                    cachedPts = pts
                }
                this._canonRunCache.set(bandKey, cachedPts)
            }
            if (cachedPts.length >= 2) canonRuns.push({ mz, pts: cachedPts })
        }

        // ── COVER suppression pass (deterministic mz-ordered) ─────────────────
        // Rebuild the spatial hash from scratch using the completed canonical rows in mz
        // order. Never accumulate across re-streams — always rebuilt from the canonical set.
        // Operating on the canonical band means the same row always sees the same neighbors,
        // making overlap suppression window-invariant (D-16).
        const cover = new Map()
        const ckey = (x, z) => `${Math.floor(x / PROTO_COVER_D)},${Math.floor(z / PROTO_COVER_D)}`
        const registerPoint = (x, z, hx, hz) => {
            const k = ckey(x, z); let arr = cover.get(k); if (!arr) { arr = []; cover.set(k, arr) }
            arr.push(x, z, hx, hz)
        }
        const sameDirCovered = (x, z, hx, hz) => {
            const cx = Math.floor(x / PROTO_COVER_D), cz = Math.floor(z / PROTO_COVER_D)
            for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
                const arr = cover.get(`${cx + dx},${cz + dz}`); if (!arr) continue
                for (let i = 0; i < arr.length; i += 4) {
                    const ex = arr[i] - x, ez = arr[i + 1] - z
                    if (ex * ex + ez * ez < PROTO_COVER_D * PROTO_COVER_D &&
                        hx * arr[i + 2] + hz * arr[i + 3] > PROTO_COVER_DOT) return true
                }
            }
            return false
        }

        for (const { mz, pts } of canonRuns) {
            if (pts.length < 2) continue
            const head = pts.map((p, i) => {
                const q = pts[Math.min(pts.length - 1, i + 1)], r = pts[Math.max(0, i - 1)]
                const hx = q.x - r.x, hz = q.z - r.z, l = Math.hypot(hx, hz) || 1
                return [hx / l, hz / l]
            })

            // Split into contiguous runs, breaking wherever this row overlaps a PRIOR row (same dir).
            // Register this row's points only AFTER emitting it, so a straight road never self-culls.
            const kept = []
            let run = []
            let runIndex = 0
            const emitRun = () => {
                if (run.length >= PROTO_RUN_MIN) {
                    // Canonical centerline — raw routed y, no visual lift/surfaceY (render-only, 08-07).
                    this._network.set(`${mz}:${runIndex}`, { points: run.map(p => p.clone()) })
                    runIndex++
                }
                run = []
            }
            for (let i = 0; i < pts.length; i++) {
                const x = pts[i].x, z = pts[i].z, hx = head[i][0], hz = head[i][1]
                if (sameDirCovered(x, z, hx, hz)) emitRun()
                else { run.push(pts[i]); kept.push(x, z, hx, hz) }
            }
            emitRun()
            for (let i = 0; i < kept.length; i += 4) registerPoint(kept[i], kept[i + 1], kept[i + 2], kept[i + 3])
        }

        // NOTE (CR-02): no post-build cache eviction. _network is .clear()-ed + rebuilt for the
        // current window at the top of every real re-stream, so its size is window-bounded.
        // The canonical run cache (_canonRunCache) is bounded by the number of rows in the
        // streaming window × the CANONICAL_HALF_WIDTH span — also window-bounded.
        return this._network
    }

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
        for (const [runKey, { points }] of this._network) {
            if (!points || points.length < 2) continue

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
            let runArcAtA = 0       // run-arc at points[i-1] (current segment start)
            let sliceStartArc = 0   // run-arc at current[0]
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
            arcS,
            gradeY,
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
     * Pure read; no mutation. Feed the JSON into test/diag-minradius-pipeline.mjs as a fixture.
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
    _sampleCarveWorld(wx, wz, rawAmp) {
        const p             = this._params
        const halfWidth     = p.roadHalfWidth     ?? 5
        const shoulderWidth = p.roadShoulderWidth  ?? 2.5
        const crownHeight   = p.crownHeight        ?? 0.05
        // camberStrength now consumed by camberProfile() — not needed here (D2, plan 09-21)
        // roadFillHeight cap intentionally NOT read here (BUG-13): physics tracks the uncapped grade.

        const maxExt = halfWidth + shoulderWidth + 4
        const nr = this.queryNearest(wx, wz, maxExt)
        if (!nr) return null

        const dx = wx - nr.point.x
        const dz = wz - nr.point.z
        const tx = nr.tangent.x, tz = nr.tangent.z

        // Signed lateral distance (positive = right of road heading, negative = left).
        // right = (tz, 0, -tx) so signedLat = dx*(-tz) + dz*tx = dot(d, perp).
        // Wait — right vector is (tz, 0, -tx); signed lateral = dot((dx,dz), (tz,-tx)) = dx*tz - dz*tx.
        // But historically latDist = |dx*(-tz) + dz*tx| = |-(dx*tz - dz*tx)| = |dx*tz - dz*tx|.
        // So signedLat = dx*tz - dz*tx (positive = right side of travel direction).
        const signedLat = dx * tz - dz * tx
        const latDist   = Math.abs(signedLat)

        if (latDist > halfWidth + shoulderWidth) return null

        // Design grade Y — P2 (09-27): replace per-slice spline nr.point.y with the run-global
        // continuous profile gradeY. nr.arcS is run-global (BUG-10 fix in 3df47cd) and is C0
        // across a slice-switch (both sides of the boundary resolve to the same arcS), so
        // runProfile(nr.arcS).gradeY is C0 across tile/chunk seams → no teleport, no upward-step
        // penetration → no launch (BUG-14 closed).
        //
        // Previous: let designY = nr.point.y
        // Problem: nr.point.y came from a per-slice spline whose "nearest" sample snapped to a
        // different slice across the boundary, producing a discrete Y step that kicked the truck
        // (~300 mm at Coarse Amp 150, seed 7 behind spawn). That step caused chassis penetration
        // into the terrain which the physics solver resolved as an upward impulse → launch.
        //
        // PERF NOTE: runProfile allocates one { gradeY, camberRad, tx, tz } per call. This is
        // the hot physics path (4 wheels × ~5 substeps = ~20 calls/frame). If runProfile was
        // called with an out-object parameter (09-25 optional 3rd arg), pass a module-scope
        // reusable object here to avoid per-call allocation. TODO(perf-cache): wire the out-object
        // once profiled as a hot spot (09-CONTINUOUS-PROFILE-DESIGN.md line 70).
        //
        // BUG-13: do NOT cap the physics grade to rawAmp + fillHeight. That cap pulled the road DOWN
        // to follow the terrain on causeway sections taller than fillHeight so the truck fell through.
        // Physics rides the true ribbon grade (decal contract); the raised dirt foundation is the
        // terrain carve's job (also uncapped now, terrain.js _buildCarveTable).
        let designY = this.runProfile(nr.arcS ?? 0, nr.runKey ?? '').gradeY

        // ── Crown + camber fold-in (SURF-03 / D-04) ─────────────────────────────
        // Same formula as sweepRibbon in road-mesh.js — ensures analyticNormal returns
        // the crowned/cambered surface normal that physics feels (height-agreement gate).
        // Only applied on the ribbon (blendW=1 zone) so the crown/camber doesn't bleed
        // into the shoulder blend where the road is transitioning back to raw terrain.
        if (latDist < halfWidth) {
            // Crown: parabolic profile — peak at centerline, 0 at edges.
            // Uses crownProfile() from road-carve.js — SAME formula as sweepRibbon.
            const crownY = crownProfile(signedLat, halfWidth, crownHeight)

            // BUG-10: nr.arcS is now the RUN-GLOBAL arc straight from queryNearest (no per-tile
            // sawtooth); matches sweepRibbon's run-arc keying. Used for camber AND pothole below.
            const centerlineArcS = nr.arcS ?? 0

            // D2 (plan 09-21): replace second-queryNearest camber estimate with the shared
            // slew-limited camberProfile — visual ribbon and physics now read the SAME angle.
            // camberSign maps the run-frame camber into the (possibly E→W reversed) slice frame.
            const camberAngle = (nr.camberSign ?? 1) * this.camberProfile(centerlineArcS, nr.runKey ?? '')

            // Tilt: signedLat * sin(camberAngle) — same formula as sweepRibbon
            const tiltY = signedLat * Math.sin(camberAngle)

            designY = designY + crownY + tiltY

            // ── SURF-06: pothole micro-noise (D-03) ─────────────────────────────
            // Only on-ribbon (latDist < halfWidth) — does NOT affect shoulder blend.
            // CR-03 (09-08): key on centerline arcS (same as camber above — consistent keying).
            if (p.potholeEnabled) {
                const rq = roadQuality(centerlineArcS, nr.runKey ?? '', this._worldSeed)
                designY += potholeNoise(wx, wz, rq, p)
            }
        }

        // Blend weight: 1 on ribbon, ramp down across shoulder.
        let blendW
        if (latDist < halfWidth) {
            blendW = 1.0
        } else {
            blendW = Math.max(0.0, 1.0 - (latDist - halfWidth) / shoulderWidth)
        }

        return { blendW, gradeY: designY }
    }

    // ── Phase 9: Design grade smoothing (D-06) ────────────────────────────────────
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

        const currentGen = this._generation
        // Rebuild adjacency index when generation changes or not yet built.
        if (!this._runAdjacencyCache || this._runAdjacencyCache.generation !== currentGen) {
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

            this._runAdjacencyCache = { generation: currentGen, map: adjMap }
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
        if (!predKey) return 0

        // Fast path: predecessor already cached this generation.
        if (this._camberProfileCache) {
            const cached = this._camberProfileCache.get(predKey)
            if (cached && cached.generation === this._generation && cached.camberRad.length > 0) {
                return cached.camberRad[cached.camberRad.length - 1]
            }
        }

        // Slow path: predecessor not yet built — compute its end camber from raw curvature only.
        // We walk predecessor's points and forward-march the slew from 0 (unseeded) to avoid
        // recursive calls to _buildCamberProfile. This is the natural "unseeded" profile for that run.
        const predEntry = this._network?.get(predKey)
        if (!predEntry || !predEntry.points || predEntry.points.length < 2) return 0

        const pts = predEntry.points
        const N   = pts.length
        const p   = this._params || {}
        const camberStrength  = p.camberStrength ?? 200
        const slewRateRadPerM = (p.roadCamberRate ?? 1.5) * (Math.PI / 180)
        const MAX_CAMBER      = 6 * (Math.PI / 180)

        const arcPos    = new Array(N)
        const rawCamber = new Array(N)
        arcPos[0] = 0
        rawCamber[0] = 0  // predecessor's own start is unseeded (avoids deeper recursion)

        for (let i = 1; i < N; i++) {
            const ax = pts[i].x - pts[i - 1].x
            const az = pts[i].z - pts[i - 1].z
            const ds = Math.sqrt(ax * ax + az * az)
            arcPos[i] = arcPos[i - 1] + ds
            const t0x = ax, t0z = az
            let t1x, t1z, effectiveDs
            if (i < N - 1) {
                t1x = pts[i + 1].x - pts[i].x
                t1z = pts[i + 1].z - pts[i].z
                const ds1 = Math.sqrt(t1x * t1x + t1z * t1z) || 1e-8
                effectiveDs = (ds + ds1) * 0.5
            } else {
                t1x = t0x; t1z = t0z
                effectiveDs = ds || 1e-8
            }
            const kappa = signedCurvature(t0x, t0z, t1x, t1z, effectiveDs)
            rawCamber[i] = Math.max(-MAX_CAMBER, Math.min(MAX_CAMBER, camberStrength * kappa))
        }

        // Forward-march slew from 0 (no boundary seed for the predecessor itself).
        let prev = 0
        for (let i = 1; i < N; i++) {
            const ds = arcPos[i] - arcPos[i - 1]
            const maxDelta = slewRateRadPerM * ds
            const delta = rawCamber[i] - prev
            if      (delta >  maxDelta) prev = prev + maxDelta
            else if (delta < -maxDelta) prev = prev - maxDelta
            else                        prev = rawCamber[i]
        }
        // prev is now the predecessor's last slew-limited camber (starting from 0 seed).
        return prev
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
    _buildCamberProfile(runKey) {
        const netEntry = this._network?.get(runKey)
        if (!netEntry || !netEntry.points || netEntry.points.length < 2) return null

        const pts = netEntry.points
        const N = pts.length

        const p = this._params || {}
        const camberStrength = p.camberStrength ?? 200
        // roadCamberRate in °/m → rad/m for the slew limiter
        const slewRateRadPerM = (p.roadCamberRate ?? 1.5) * (Math.PI / 180)
        const MAX_CAMBER = 6 * (Math.PI / 180)   // ±6° clamp

        // Step 1: build arc-position LUT for the polyline.
        const arcPos = new Array(N)
        arcPos[0] = 0
        for (let i = 1; i < N; i++) {
            const dx = pts[i].x - pts[i - 1].x, dz = pts[i].z - pts[i - 1].z
            arcPos[i] = arcPos[i - 1] + Math.sqrt(dx * dx + dz * dz)
        }
        const totalArc = arcPos[N - 1]

        // Step 3 (BUG-12 camber fix): compute curvature using a CONSISTENT ARC-LENGTH WINDOW
        // (camberArcWindow metres) instead of the per-adjacent-point finite difference.
        // Per-point diff is SPACING-SENSITIVE: a 2 m segment + 90° turn gives kappa ≈ 1/2 m
        // regardless of the 20 m road context → massive camber spikes at uneven-spacing points.
        // Arc-length window: sample tangent at (s − W/2) and (s + W/2); the direction change
        // over W metres is spacing-invariant → camber is smooth regardless of point distribution.
        //
        // Helper: polyline tangent at arc-length s (binary-search into arcPos LUT).
        const windowM = p.camberArcWindow ?? 20  // m — arc-length curvature window (D-src Step 3)
        const tangentAtArcS = (s) => {
            s = Math.max(0, Math.min(totalArc, s))
            // Binary search for the segment containing s.
            let lo = 0, hi = N - 1
            while (lo < hi - 1) {
                const mid = (lo + hi) >> 1
                if (arcPos[mid] <= s) lo = mid; else hi = mid
            }
            const span = arcPos[hi] - arcPos[lo]
            if (span < 1e-9) {
                // Zero-length segment — use the segment tangent from the nearest non-degenerate pair.
                for (let k = lo; k < N - 1; k++) {
                    const dx = pts[k + 1].x - pts[k].x, dz = pts[k + 1].z - pts[k].z
                    const len = Math.sqrt(dx * dx + dz * dz)
                    if (len > 1e-9) return { tx: dx / len, tz: dz / len }
                }
                return { tx: 1, tz: 0 }
            }
            // Interpolate direction between pts[lo] and pts[hi].
            const dx = pts[hi].x - pts[lo].x, dz = pts[hi].z - pts[lo].z
            const len = Math.sqrt(dx * dx + dz * dz) || 1e-9
            return { tx: dx / len, tz: dz / len }
        }

        const rawCamber = new Array(N)
        // P4 (BUG-10): seed from predecessor's end camber instead of hard 0.
        rawCamber[0] = this._runStartCamber(runKey)

        for (let i = 1; i < N; i++) {
            const s = arcPos[i]
            const sA = Math.max(0, s - windowM / 2)
            const sB = Math.min(totalArc, s + windowM / 2)
            const tA = tangentAtArcS(sA)
            const tB = tangentAtArcS(sB)
            const ds = sB - sA
            // signedCurvature: |dT/ds| × sign(cross) — spacing-invariant over the window.
            const kappa = signedCurvature(tA.tx, tA.tz, tB.tx, tB.tz, ds)
            const raw = camberStrength * kappa
            rawCamber[i] = Math.max(-MAX_CAMBER, Math.min(MAX_CAMBER, raw))
        }

        // Step 2: forward-march slew-rate limit.
        // |camberRad[i] - camberRad[i-1]| ≤ slewRateRadPerM * Δs
        const camberRad = new Array(N)
        camberRad[0] = rawCamber[0]
        for (let i = 1; i < N; i++) {
            const ds = arcPos[i] - arcPos[i - 1]
            const maxDelta = slewRateRadPerM * ds
            const prev = camberRad[i - 1]
            const target = rawCamber[i]
            const delta = target - prev
            if (delta >  maxDelta) camberRad[i] = prev + maxDelta
            else if (delta < -maxDelta) camberRad[i] = prev - maxDelta
            else camberRad[i] = target
        }

        return { arcPos, camberRad }
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

        arcPos[0]    = 0
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

        // D1 generation invalidation: rebuild if the generation changed since last build.
        const currentGen = this._generation
        const cached = this._camberProfileCache.get(runKey)
        if (cached && cached.generation === currentGen) {
            // Fast path: binary-search and interpolate.
            return _interpolateCamber(cached.arcPos, cached.camberRad, arcS)
        }

        // (Re)build the profile for this run.
        const profile = this._buildCamberProfile(runKey)
        if (!profile) return 0

        this._camberProfileCache.set(runKey, { generation: currentGen, ...profile })
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

        const currentGen = this._generation
        const cached = this._runProfileCache.get(runKey)
        if (cached && cached.generation === currentGen) {
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

        this._runProfileCache.set(runKey, { generation: currentGen, ...profile })
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

        const spline = new THREE.CatmullRomCurve3(clean, false, 'centripetal', 0.5)
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

// (removed: _segIntersectXZ — replaced by proximity-based _removeLoops)
