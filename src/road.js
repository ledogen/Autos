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

// ── Module-scope scratch vectors (queryNearest allocation guard) ───────────────
// queryNearest is called at near-60fps cadence (resolveSpawn + Phase 9 consumption).
// Using a single reusable scratch vector for the per-sample distance check avoids
// per-sample Vector3 allocation (RESEARCH anti-pattern; GC pressure kills frame time).
// The two final return vectors (point, tangent) are still allocated once per call — only
// the search loop scratch is reused.
const _scratchPt = new THREE.Vector3()

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
     * @param {number} wx — world x
     * @param {number} wz — world z
     * @param {number} [radiusM=200] — max XZ distance to accept a hit
     * @returns {{ point: THREE.Vector3, tangent: THREE.Vector3 } | null}
     */
    queryNearest(wx, wz, radiusM = 200) {
        if (!this._tiles) return null
        const r2 = radiusM * radiusM
        let bestD2 = r2
        let bestSpline = null
        let bestU = 0

        const qTileX = Math.floor(wx / CHUNK_SIZE)
        const qTileZ = Math.floor(wz / CHUNK_SIZE)

        // Probe one spline: sample at N arc-length intervals, track nearest U within radius.
        const probeSpline = (spline) => {
            const len = spline.getLength ? spline.getLength() : 0
            // ~1 sample / 2 m, clamped to [16, 256] — enough resolution for a 200 m radius query.
            const n = Math.max(16, Math.min(256, Math.ceil((len || 64) / 2)))
            for (let i = 0; i <= n; i++) {
                const u = i / n
                spline.getPointAt(u, _scratchPt)
                const dx = _scratchPt.x - wx, dz = _scratchPt.z - wz
                const d2 = dx * dx + dz * dz
                if (d2 < bestD2) { bestD2 = d2; bestSpline = spline; bestU = u }
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
                    for (const s of segs) probeSpline(s.spline)
                }
            }
        }

        if (bestSpline) {
            // The only two allocations on the spline path: the returned point + unit tangent.
            const point = bestSpline.getPointAt(bestU)
            const tangent = bestSpline.getTangentAt(bestU)   // getTangentAt returns a UNIT vector
            return { point, tangent }
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
        return { point, tangent }
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
        this._streamNetwork(center)
        this._sliceNetwork()
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

        const surf = this._proto.surfaceY
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
                if (surf) for (const p of seg) p.y = surf(p.x, p.z) + 1.0
                else      for (const p of seg) p.y += 1.0
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
            },
            paramDirtyAt: 0,
            radius:   640,                                   // m — streamed road radius (set from terrain stream radius)
            anchors:  new Map(),                             // "mx,mz" → THREE.Vector3 (valley-snapped)
            segs:     new Map(),                             // "ax,az>bx,bz" → THREE.Vector3[] (connection waypoints)
            lastCenter: null,
            dirty:    true,
            surfaceY: null,                                  // optional (x,z)=>renderedHeight for visual line placement
        }
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
    }

    // (08-07) The proto-only viz API (setProtoEnabled / setProtoParam / setProtoRadius / updateProto)
    // is retired — there is ONE viz now, toggled by setDebugVisible + driven by update()/buildDebugLines.
    // Live D-09 weight edits arrive by debug sliders mutating this._params; each re-stream refreshes
    // this._proto.params from this._params (see _refreshParams) so slider changes take effect.
    setSurfaceSampler(fn) { this._proto.surfaceY = fn }       // main.js passes terrainSystem.analyticHeight

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
    }

    _invalidateProto() { this._proto.anchors.clear(); this._proto.segs.clear() }

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
        // XZ 2-D segment intersection test (does NOT count shared endpoints as crossings).
        // Returns the intersection point as {x,z} or null if no proper crossing.
        const _segXZ = (ax, az, bx, bz, cx, cz, dx, dz) => {
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

    // Turn-penalty soft-cost A* between two anchors over a grid covering their bbox + N/S margin.
    // State = (cell, incoming-direction) so a per-45° turn penalty (wTurn) is charged — this is what
    // makes the route run long straights and only switchback where the grade truly forces it.
    // Never fails (soft penalty keeps all edges finite).
    _protoConnect(a, b) {
        const key = `${a.x.toFixed(0)},${a.z.toFixed(0)}>${b.x.toFixed(0)},${b.z.toFixed(0)}`
        const cached = this._proto.segs.get(key)
        if (cached) return cached
        const P = this._proto.params
        const minX = Math.min(a.x, b.x) - PROTO_MARGIN, maxX = Math.max(a.x, b.x) + PROTO_MARGIN
        const minZ = Math.min(a.z, b.z) - PROTO_MARGIN, maxZ = Math.max(a.z, b.z) + PROTO_MARGIN
        const NX = Math.max(2, Math.round((maxX - minX) / PROTO_CELL))
        const NZ = Math.max(2, Math.round((maxZ - minZ) / PROTO_CELL))
        const S = NX * NZ
        const H = new Float64Array(S)
        for (let gz = 0; gz < NZ; gz++) for (let gx = 0; gx < NX; gx++) {
            const wx = minX + (gx + 0.5) * (maxX - minX) / NX
            const wz = minZ + (gz + 0.5) * (maxZ - minZ) / NZ
            H[gz * NX + gx] = this._coarseH(wx, wz)
        }
        const cellW = (maxX - minX) / NX, cellH = (maxZ - minZ) / NZ
        const wxOf = gx => minX + (gx + 0.5) * cellW, wzOf = gz => minZ + (gz + 0.5) * cellH
        const toCell = (p) => [
            Math.max(0, Math.min(NX - 1, Math.round((p.x - minX) / cellW - 0.5))),
            Math.max(0, Math.min(NZ - 1, Math.round((p.z - minZ) / cellH - 0.5))),
        ]
        const [sgx, sgz] = toCell(a), [ggx, ggz] = toCell(b)
        const start = sgz * NX + sgx, goal = ggz * NX + ggx
        // State id = cellIdx*9 + dir (dir 0..7, 8 = start/no-direction).
        const g = new Float64Array(S * 9).fill(Infinity)
        const from = new Int32Array(S * 9).fill(-1)
        const seen = new Uint8Array(S * 9)
        const open = new MinHeap()
        const heur = (ci) => P.wDist * Math.hypot(wxOf(ggx) - wxOf(ci % NX), wzOf(ggz) - wzOf((ci / NX) | 0))
        const startState = start * 9 + 8
        g[startState] = 0; open.push(startState, heur(start))
        let goalState = -1
        while (open.size) {
            const sid = open.pop(); if (seen[sid]) continue; seen[sid] = 1
            const ci = (sid / 9) | 0, dir = sid % 9
            if (ci === goal) { goalState = sid; break }
            const cgx = ci % NX, cgz = (ci / NX) | 0, ch = H[ci]
            for (let nd = 0; nd < 8; nd++) {
                const nx = cgx + PROTO_DIRS[nd][0], nz = cgz + PROTO_DIRS[nd][1]
                if (nx < 0 || nx >= NX || nz < 0 || nz >= NZ) continue
                const ni = nz * NX + nx, nsid = ni * 9 + nd
                if (seen[nsid]) continue
                const horiz = Math.hypot(PROTO_DIRS[nd][0] * cellW, PROTO_DIRS[nd][1] * cellH)
                const turn = dir === 8 ? 0 : P.wTurn * _protoTurnSteps(dir, nd)
                const t = g[sid] + this._protoEdgeCost(ch, H[ni], horiz, P) + turn
                if (t < g[nsid]) { g[nsid] = t; from[nsid] = sid; open.push(nsid, t + heur(ni)) }
            }
        }
        if (goalState === -1) {  // goal not popped — pick its cheapest direction-state
            let best = Infinity
            for (let d = 0; d < 9; d++) { const sid = goal * 9 + d; if (g[sid] < best) { best = g[sid]; goalState = sid } }
        }
        const wps = []
        if (goalState !== -1 && isFinite(g[goalState])) {
            let sid = goalState; const chain = []
            while (sid !== -1) { chain.push((sid / 9) | 0); sid = from[sid] }
            chain.reverse()
            for (const ci of chain) wps.push(new THREE.Vector3(wxOf(ci % NX), H[ci], wzOf((ci / NX) | 0)))
        }
        // Endpoints anchored exactly (C0 join between consecutive connections), interior simplified.
        const raw = [a.clone(), ...this._protoSimplify(wps, 12), b.clone()]
        const out = []
        for (const p of raw) if (!out.length || out[out.length - 1].distanceToSquared(p) > 1e-4) out.push(p)
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
        // A real re-stream invalidates the previous slice; _sliceNetwork re-slices on next call.
        this._slicedFrom = null
        if (this._tiles) this._tiles.clear()
        if (this._tileObjects) this._tileObjects.clear()

        const R = this._proto.radius
        const mx0 = Math.floor((center.x - R) / PROTO_ANCHOR_SPACING) - 1
        const mx1 = Math.ceil((center.x + R) / PROTO_ANCHOR_SPACING)
        const mz0 = Math.floor((center.z - R) / PROTO_ANCHOR_SPACING)
        const mz1 = Math.ceil((center.z + R) / PROTO_ANCHOR_SPACING)

        // Inter-row same-direction overlap suppression: spatial hash of points kept from PRIOR rows.
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

        for (let mz = mz0; mz <= mz1; mz++) {
            // Concatenate this row's east connections into ONE continuous polyline, so loops at the
            // anchor junctions are visible to the loop remover and the row is a single road.
            let rowWps = []
            for (let mx = mx0; mx <= mx1; mx++) {
                const wps = this._protoConnect(this._protoAnchor(mx, mz), this._protoAnchor(mx + 1, mz))
                if (wps.length < 2) continue
                if (rowWps.length) { for (let k = 1; k < wps.length; k++) rowWps.push(wps[k]) }  // drop shared anchor
                else rowWps = wps.slice()
            }
            if (rowWps.length < 2) continue

            const spline = new THREE.CatmullRomCurve3(rowWps, false, 'centripetal', 0.5)
            let pts = spline.getPoints(Math.max(24, rowWps.length * 2))
            pts = this._removeLoops(pts)                                            // proximity-based fold removal (existing)
            pts = this._removeSelfCrossings(pts)                                    // QUAL-01 — true segment crossings
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

        // NOTE (CR-02): no post-build cache eviction. The previous `_network.size > 3000` guard
        // was non-deterministic — it depended on accumulated session history, not on
        // (seed, center, params), and could discard the network JUST built for this center,
        // violating the purity contract. _network is .clear()-ed + rebuilt for the current window
        // at the top of every real re-stream, so its size is window-bounded, not history-bounded;
        // no eviction is needed here. Proto-cache bounding moved BEFORE the build (see above).
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
            const flush = () => {
                if (current.length >= 2) this._assignSlice(current, runKey, runWeight)
                // start the next sub-polyline at the same boundary point we just closed on (shared)
            }
            for (let i = 1; i < points.length; i++) {
                const a = points[i - 1], b = points[i]
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
                    flush()
                    current = [cp.clone()]                            // next sub-polyline STARTS on the same point (C0)
                    prevT = t
                }
                current.push(b.clone())
            }
            flush()  // emit the trailing sub-polyline
        }

        this._slicedFrom = this._network
        return this._tiles
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
    _assignSlice(pts, runKey, runWeight) {
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
        if (tail.x < head.x) clean.reverse()

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
        arr.push({ spline, points: clean, waypoints: clean, runKey, runWeight, spanScore })
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
