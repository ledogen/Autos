/**
 * src/road.js — RoadSystem for RangerSim v1.1
 *
 * Responsibilities:
 *  - Per-tile A* road routing over raw coarseHeight (forbidden: chunk-sampled or amplitude-scaled height)
 *  - Shared boundary seam crossings (_seamPoint, keyed by boundary not tile) so adjacent
 *    tile splines join exactly at 64 m seams — C0 by construction (D-06 exit gate)
 *  - THREE.CatmullRomCurve3 per tile segment anchored at those shared seam crossings
 *  - Lazy tile generation, cached in Map<"tX,tZ", { waypoints, spline }>; invalidated on param change
 *  - queryNearest(wx, wz) → { point, tangent } for resolveSpawn and Phase 9
 *  - Debug line visualization toggled via line.visible (set from debug.js checkbox)
 *
 * FORBIDDEN patterns:
 *   Do NOT call terrain.getChunkHeight / chunk-sampled functions (chunk-load-order dependent).
 *   Do NOT call terrain.getAmplitudeScaledHeight (multiplies by terrainAmplitude — grade wrong).
 *   Do NOT call road.js from inside the physics fixed-timestep loop (route lazily, query O(1)).
 *   Do NOT allocate new THREE.Vector3 per frame in queryNearest (GC pressure).
 *
 * Design decisions implemented here:
 *  - D-01: Sparse trunk + seeded spurs (trunk routing East-West; spur seeding stub)
 *  - D-02: max grade ~12% with hard block + quadratic slope cost driving tighter hairpins
 *  - D-04: Valley/pass-seeking via altitude cost term in _edgeCost + lowest-point seam crossings
 *  - D-06: Shared boundary seam crossings give C0/C1 continuity at tile seams (exit gate)
 *
 * Phase: 8-road-routing
 * Plan: 08-01 (core); 08-02 (public API + debug viz)
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

// ── Module constants ───────────────────────────────────────────────────────────
/**
 * Tile side length in metres. MUST match terrain.js CHUNK_SIZE.
 * Both modules use 64 m tiles — roads and terrain chunks are aligned.
 * Coupling: if terrain.js CHUNK_SIZE changes, this must change too.
 */
export const CHUNK_SIZE = 64

/**
 * Number of samples taken along a vertical tile-boundary edge when locating the
 * shared seam crossing (the lowest-altitude point on that edge). 33 samples = 2 m
 * spacing on a 64 m edge — fine enough to find the valley notch deterministically.
 */
const SEAM_SAMPLES = 33

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
        this._tileCache          = new Map()  // key: "tX,tZ" → { waypoints, spline }
        this._waypointCache      = new Map()  // key: "tX,tZ" → waypoints[] (spline-free)
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

    // ── Shared seam crossing ─────────────────────────────────────────────────────
    /**
     * The shared road crossing on the vertical tile boundary at world x = boundaryTileX * CHUNK_SIZE,
     * within row `tileZ`. Defined as the LOWEST-altitude point along that boundary edge.
     *
     * Why this gives seam continuity (the D-06 exit gate):
     *   The crossing is a pure function of (boundaryTileX, tileZ) via raw coarseHeight —
     *   it contains NO per-tile seed. So tile A = (tX, tZ) querying its EAST boundary
     *   (boundaryTileX = tX+1) and its neighbor B = (tX+1, tZ) querying its WEST boundary
     *   (boundaryTileX = tX+1) call _seamPoint(tX+1, tZ) with identical arguments and get
     *   the IDENTICAL point. Both tiles' splines terminate exactly here → C0 continuity by
     *   construction (no ghost-point trickery, no gap).
     *
     * Lowest-point selection also serves D-04 (valley-seeking): the trunk threads through
     * the natural low notch of each ridge boundary rather than crossing at a random Z.
     *
     * @param {number} boundaryTileX — integer tile-boundary index (world x = boundaryTileX * CHUNK_SIZE)
     * @param {number} tileZ — row index; crossing is searched within [tileZ*CHUNK_SIZE, (tileZ+1)*CHUNK_SIZE]
     * @returns {THREE.Vector3} the shared crossing point (raw coarse height as y)
     */
    _seamPoint(boundaryTileX, tileZ) {
        const wx = boundaryTileX * CHUNK_SIZE
        const z0 = tileZ * CHUNK_SIZE
        let bestZ = z0
        let bestH = Infinity
        for (let i = 0; i < SEAM_SAMPLES; i++) {
            const wz = z0 + (i / (SEAM_SAMPLES - 1)) * CHUNK_SIZE
            const h  = this._coarseH(wx, wz)
            if (h < bestH) { bestH = h; bestZ = wz }
        }
        return new THREE.Vector3(wx, bestH, bestZ)
    }

    // ── Edge waypoints (shared seam endpoints) ───────────────────────────────────
    /**
     * West-entry and east-exit crossings for a tile — the deterministic, NEIGHBOR-SHARED
     * seam points on this tile's two vertical boundaries.
     *
     * Trunk road convention: East-West trunk.
     *   entry = west boundary crossing  = _seamPoint(tileX,     tileZ)  (x = tileX * CHUNK_SIZE)
     *   exit  = east boundary crossing  = _seamPoint(tileX + 1, tileZ)  (x = (tileX+1) * CHUNK_SIZE)
     *
     * Because the crossings are keyed by BOUNDARY (not by tile), the east exit of tile
     * (tX, tZ) is byte-identical to the west entry of tile (tX+1, tZ) — this is what makes
     * adjacent tile splines join at the seam (D-06). The entry/exit are also used as the
     * A* start/goal anchors inside _routeTile.
     *
     * @param {number} tileX
     * @param {number} tileZ
     * @returns {{ entry: THREE.Vector3, exit: THREE.Vector3 }}
     */
    _deriveEdgeWaypoints(tileX, tileZ) {
        return {
            entry: this._seamPoint(tileX,     tileZ),  // west boundary (shared with tileX-1's east)
            exit:  this._seamPoint(tileX + 1, tileZ),  // east boundary (shared with tileX+1's west)
        }
    }

    // ── A* routing ────────────────────────────────────────────────────────────
    /**
     * Compute edge cost between two adjacent routing grid cells.
     *
     * Cost components:
     *  - dist: 3D Euclidean distance (base cost for moving further)
     *  - HARD BLOCK (D-02): if grade > maxRoadGrade → return Infinity (impassable)
     *  - slopeCost: grade² × roadSlopePenalty — quadratic penalty drives tighter hairpins
     *    (2× grade → 4× penalty; strongly discourages steep over multiple cells)
     *  - altCost: toCell.h × roadAltWeight — valley-seeking (D-04)
     *    Lower raw coarseHeight is cheaper; roads hug valley floors.
     *
     * @param {{ wx, wz, h }} fromCell
     * @param {{ wx, wz, h }} toCell
     * @returns {number} cost ≥ 0, or Infinity if grade exceeds limit
     */
    _edgeCost(fromCell, toCell) {
        const dx = toCell.wx - fromCell.wx
        const dz = toCell.wz - fromCell.wz
        const dh = toCell.h  - fromCell.h

        const horizDist = Math.sqrt(dx * dx + dz * dz)
        if (horizDist < 1e-9) return 0  // same cell (shouldn't happen in 8-dir grid)

        const grade = Math.abs(dh) / horizDist

        // D-02: Hard grade block — impassable if exceeds maxRoadGrade
        if (grade > this._params.maxRoadGrade) return Infinity

        const dist     = Math.sqrt(dx * dx + dz * dz + dh * dh)  // 3D distance
        const slopeCost = grade * grade * this._params.roadSlopePenalty  // quadratic (D-02)
        const altCost   = toCell.h * this._params.roadAltWeight          // valley-seeking (D-04)

        return dist + slopeCost + altCost
    }

    /**
     * A* heuristic: XZ Euclidean distance to goal (admissible).
     * Ignores altitude — 3D distance >= XZ distance, so never overestimates.
     */
    _heuristic(cell, goalCell) {
        const dx = goalCell.wx - cell.wx
        const dz = goalCell.wz - cell.wz
        return Math.sqrt(dx * dx + dz * dz)
    }

    /**
     * Route a tile via A* on the routing grid.
     *
     * Builds a routeGridSize × routeGridSize grid (default 16×16 = 4 m cells).
     * Runs A* with 8-directional connectivity from west entry to east exit.
     * Per-tile visited Set — no global state (RESEARCH Pitfall 1).
     *
     * If A* finds no path (all frontier edges over-grade — degenerate terrain),
     * falls back to a direct entry→exit two-point list and console.warns.
     *
     * @param {number} tileX
     * @param {number} tileZ
     * @returns {{ waypoints: THREE.Vector3[], spline: null }}
     */
    _routeTile(tileX, tileZ) {
        const { routeGridSize } = this._params
        const cellSize = CHUNK_SIZE / routeGridSize  // m per cell (4 m at routeGridSize=16)

        // Build grid: N×N cells, each storing world coords + raw height
        const grid = []
        for (let gz = 0; gz < routeGridSize; gz++) {
            for (let gx = 0; gx < routeGridSize; gx++) {
                // Cell centre position in world coords
                const wx = tileX * CHUNK_SIZE + (gx + 0.5) * cellSize
                const wz = tileZ * CHUNK_SIZE + (gz + 0.5) * cellSize
                grid.push({ gx, gz, wx, wz, h: this._coarseH(wx, wz) })
            }
        }

        const cellIdx = (gx, gz) => gz * routeGridSize + gx

        // Derive entry/exit edge waypoints (seeded, on tile boundaries)
        const edges = this._deriveEdgeWaypoints(tileX, tileZ)

        // Map entry/exit to nearest grid cells
        const entryGX = 0  // west edge → column 0
        const entryGZ = Math.max(0, Math.min(routeGridSize - 1,
            Math.round((edges.entry.z - tileZ * CHUNK_SIZE - cellSize * 0.5) / cellSize)))
        const exitGX  = routeGridSize - 1  // east edge → last column
        const exitGZ  = Math.max(0, Math.min(routeGridSize - 1,
            Math.round((edges.exit.z  - tileZ * CHUNK_SIZE - cellSize * 0.5) / cellSize)))

        const startIdx = cellIdx(entryGX, entryGZ)
        const goalIdx  = cellIdx(exitGX,  exitGZ)
        const goalCell = grid[goalIdx]

        // A* — 8-directional connectivity
        const open    = new MinHeap()
        const visited = new Set()
        const gCost   = new Float64Array(routeGridSize * routeGridSize).fill(Infinity)
        const cameFrom = new Int32Array(routeGridSize * routeGridSize).fill(-1)

        gCost[startIdx] = 0
        open.push(startIdx, this._heuristic(grid[startIdx], goalCell))

        while (open.size > 0) {
            const curIdx = open.pop()
            if (curIdx === goalIdx) break
            if (visited.has(curIdx)) continue
            visited.add(curIdx)

            const cur = grid[curIdx]

            // 8-directional neighbors
            for (let dgz = -1; dgz <= 1; dgz++) {
                for (let dgx = -1; dgx <= 1; dgx++) {
                    if (dgx === 0 && dgz === 0) continue
                    const ngx = cur.gx + dgx
                    const ngz = cur.gz + dgz
                    if (ngx < 0 || ngx >= routeGridSize || ngz < 0 || ngz >= routeGridSize) continue

                    const nIdx = cellIdx(ngx, ngz)
                    if (visited.has(nIdx)) continue

                    const neighbor = grid[nIdx]
                    const edgeCost = this._edgeCost(cur, neighbor)
                    if (!isFinite(edgeCost)) continue

                    const tentative = gCost[curIdx] + edgeCost
                    if (tentative < gCost[nIdx]) {
                        gCost[nIdx]    = tentative
                        cameFrom[nIdx] = curIdx
                        open.push(nIdx, tentative + this._heuristic(neighbor, goalCell))
                    }
                }
            }
        }

        // Reconstruct path
        let waypoints
        if (cameFrom[goalIdx] !== -1 || goalIdx === startIdx) {
            const pathIndices = []
            let cur = goalIdx
            while (cur !== -1) {
                pathIndices.push(cur)
                cur = cameFrom[cur]
            }
            pathIndices.reverse()
            waypoints = pathIndices.map(i => {
                const cell = grid[i]
                return new THREE.Vector3(cell.wx, cell.h, cell.wz)
            })
        } else {
            // Degenerate: no path found (all frontier edges over-grade)
            console.warn(`[RoadSystem] _routeTile(${tileX},${tileZ}): A* found no path — using direct fallback`)
            waypoints = [
                new THREE.Vector3(edges.entry.x, edges.entry.y, edges.entry.z),
                new THREE.Vector3(edges.exit.x,  edges.exit.y,  edges.exit.z),
            ]
        }

        return { waypoints, spline: null }
    }

    // ── Tile access (waypoints only, no spline) ────────────────────────────────
    /**
     * Return routed waypoints for a tile WITHOUT building its spline.
     * Used for ghost-point lookups during spline construction to avoid recursion.
     * Memoized in _waypointCache.
     *
     * @param {number} tileX
     * @param {number} tileZ
     * @returns {THREE.Vector3[]} waypoints
     */
    _getTileWaypointsOnly(tileX, tileZ) {
        const key = `${tileX},${tileZ}`
        if (!this._waypointCache.has(key)) {
            const result = this._routeTile(tileX, tileZ)
            this._waypointCache.set(key, result.waypoints)
        }
        return this._waypointCache.get(key)
    }

    // ── Spline construction ────────────────────────────────────────────────────
    /**
     * Build a THREE.CatmullRomCurve3 spline for a tile, anchored at the shared seam crossings.
     *
     * Control points: [ westSeam, ...routedWaypoints, eastSeam ]
     *   westSeam = _seamPoint(tileX,     tileZ)  — shared with tile (tileX-1, tileZ)'s eastSeam
     *   eastSeam = _seamPoint(tileX + 1, tileZ)  — shared with tile (tileX+1, tileZ)'s westSeam
     *
     * Seam continuity (D-06 exit gate):
     *   For an open Catmull-Rom curve getPoint(0) === first control point and
     *   getPoint(1) === last control point. Because adjacent tiles compute the SAME
     *   boundary crossing (_seamPoint is keyed by boundary, not tile), getPoint(1) of
     *   tile A === getPoint(0) of tile B exactly → C0 continuity by construction. The
     *   matching interior cells on either side keep the seam tangents aligned → C1.
     *   (The earlier ghost-point scheme could not join the splines because adjacent
     *   tiles never shared a boundary point — see VERIFICATION.md.)
     *
     * Anchoring the spline endpoints to the seam points does NOT affect the grade-checked
     * route: _getTileWaypointsOnly() still returns only the A* cells (ROAD-02/03 operate on
     * those). The seam endpoints are spline-shaping anchors, not graded route edges.
     *
     * Uses 'centripetal' parameterization (RESEARCH A5): avoids self-intersection at tight
     * hairpin bends. Consecutive coincident points are de-duplicated so a zero-length segment
     * never makes the centripetal exponent divide by zero (e.g. degenerate direct-fallback routes).
     *
     * @param {number} tileX
     * @param {number} tileZ
     * @param {THREE.Vector3[]} waypoints — routed A* cell waypoints for this tile
     * @returns {THREE.CatmullRomCurve3}
     */
    _buildTileSpline(tileX, tileZ, waypoints) {
        const { entry: westSeam, exit: eastSeam } = this._deriveEdgeWaypoints(tileX, tileZ)

        // De-duplicate consecutive coincident control points (centripetal guard).
        const raw = [westSeam, ...waypoints, eastSeam]
        const pts = []
        for (const p of raw) {
            if (pts.length === 0 || pts[pts.length - 1].distanceToSquared(p) > 1e-6) {
                pts.push(p)
            }
        }

        if (pts.length < 2) {
            console.warn(`[RoadSystem] _buildTileSpline(${tileX},${tileZ}): fewer than 2 control points`)
        }

        return new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5)
    }

    // ── Primary tile access ────────────────────────────────────────────────────
    /**
     * Return { waypoints, spline } for a tile.
     * Staged construction (RESEARCH §Pattern 3 caveat):
     *   Stage 1: ensure routed waypoints exist in _waypointCache
     *   Stage 2: build spline with ghost points on first full access
     *
     * Memoized in _tileCache — calling _getTile() multiple times is O(1) after first call.
     * Pure function of (worldSeed, tileX, tileZ, params) — cache is memoization only.
     *
     * @param {number} tileX
     * @param {number} tileZ
     * @returns {{ waypoints: THREE.Vector3[], spline: THREE.CatmullRomCurve3 }}
     */
    _getTile(tileX, tileZ) {
        const key = `${tileX},${tileZ}`
        if (this._tileCache.has(key)) {
            return this._tileCache.get(key)
        }

        // Stage 1: get waypoints (may already be in _waypointCache)
        const waypoints = this._getTileWaypointsOnly(tileX, tileZ)

        // Stage 2: build spline with ghost points
        const spline = this._buildTileSpline(tileX, tileZ, waypoints)

        const tile = { waypoints, spline }
        this._tileCache.set(key, tile)
        return tile
    }

    // ── Public API ─────────────────────────────────────────────────────────────
    /**
     * Eagerly generate a tile if not already cached, and return the tile object.
     * Idempotent — calling twice with the same coords returns the same cached reference.
     * Used by resolveSpawn to warm the cache before querying nearest road point,
     * and by buildDebugLines to ensure tiles exist before visualizing.
     *
     * @param {number} tileX
     * @param {number} tileZ
     * @returns {{ waypoints: THREE.Vector3[], spline: THREE.CatmullRomCurve3 }}
     */
    ensureTile(tileX, tileZ) {
        return this._getTile(tileX, tileZ)
    }

    /**
     * Return the nearest point on any road spline within search radius.
     *
     * Samples each cached tile's spline at N arc-length intervals and finds the closest.
     * Results are O(1) per cached tile — use ensureTile() to warm the cache first.
     *
     * Anti-pattern: do NOT call this per-frame without caching the result.
     *
     * @param {number} wx — world X coordinate (metres)
     * @param {number} wz — world Z coordinate (metres)
     * @param {number} [radiusM=200] — search radius in metres
     * @returns {{ point: THREE.Vector3, tangent: THREE.Vector3 } | null}
     */
    queryNearest(wx, wz, radiusM = 200) {
        let bestDist = radiusM
        let bestU = -1
        let bestSpline = null

        // Search loop uses module-scope _scratchPt to avoid per-sample Vector3 allocation.
        // Three.js getPointAt(u, target) writes into target in-place when target is provided.
        for (const [, tile] of this._tileCache) {
            if (!tile.spline) continue
            const SAMPLES = 32
            for (let i = 0; i <= SAMPLES; i++) {
                const u = i / SAMPLES
                tile.spline.getPointAt(u, _scratchPt)  // writes into scratch; no allocation
                const dx = _scratchPt.x - wx
                const dz = _scratchPt.z - wz
                const d2d = Math.sqrt(dx * dx + dz * dz)
                if (d2d < bestDist) {
                    bestDist   = d2d
                    bestU      = u
                    bestSpline = tile.spline
                }
            }
        }

        if (bestSpline === null) return null

        // Allocate the two return vectors only once (one point, one tangent)
        return {
            point:   bestSpline.getPointAt(bestU),
            tangent: bestSpline.getTangentAt(bestU),
        }
    }

    // ── Cache invalidation ─────────────────────────────────────────────────────
    /**
     * Clear all cached tile data and remove debug lines from scene.
     * Call after routing params change (debounced from debug panel onChange).
     * Pattern: same as TerrainSystem.rebuildAllChunksFromWorker() in terrain.js.
     */
    invalidateCache() {
        for (const line of this._debugLines) {
            if (this._scene) this._scene.remove(line)
            if (line.geometry) line.geometry.dispose()
        }
        this._debugLines = []
        this._tileCache.clear()
        this._waypointCache.clear()
    }

    // ── Debug visualization ────────────────────────────────────────────────────
    /**
     * Build debug centerline lines for all currently-cached tiles and add to scene.
     * Toggle visibility via setDebugVisible().
     * Pattern: Three.js LINE + BufferGeometry.setFromPoints() (same as terrain.js usage).
     */
    buildDebugLines() {
        if (!this._scene) return
        // Clear existing debug lines first
        for (const line of this._debugLines) {
            this._scene.remove(line)
            if (line.geometry) line.geometry.dispose()
        }
        this._debugLines = []

        for (const [, tile] of this._tileCache) {
            if (!tile.spline) continue
            const line = _buildDebugLine(tile.spline)
            this._scene.add(line)
            this._debugLines.push(line)
        }
    }

    /**
     * Show or hide all debug road centerlines.
     *
     * If enabling (visible=true) and no lines exist yet, calls buildDebugLines() first
     * so the caller does not need to manually call buildDebugLines after a fresh init.
     * Toggle is via line.visible (NOT dispose/recreate) — avoids GC at 60fps (RESEARCH anti-pattern).
     *
     * @param {boolean} visible
     */
    setDebugVisible(visible) {
        this._debugVisible = visible
        if (visible && this._debugLines.length === 0) {
            // Auto-build on first enable — caller need not call buildDebugLines() explicitly
            this.buildDebugLines()
        }
        for (const line of this._debugLines) {
            line.visible = visible
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROTOTYPE — valley-following streaming trunk (Phase-8 redesign spike)
    //
    // Endless deterministic roads as a chain of valley-anchor connections, streamed
    // around the view center each frame (same model as terrain chunks). Cost is
    // dominated by altitude + grade with a SOFT (finite) grade penalty, so the route
    // wraps AROUND high ground instead of climbing it. Fully non-destructive: this
    // path does not touch _routeTile / ensureTile / queryNearest (the spawn path).
    // If validated, this replaces the per-tile router. Toggle + tune from the Roads
    // debug folder.
    // ═══════════════════════════════════════════════════════════════════════════

    _protoInit() {
        this._proto = {
            enabled: false,
            params: {
                wDist:   1,        // directness
                wAlt:    0.85,     // stay low (valley-seeking) — user-tuned default
                wGrade:  400,      // gentle (quadratic) — user-tuned default
                wOver:   8000,     // soft over-cap penalty — user-tuned default
                maxGrade: 0.15,    // grade the soft penalty kicks in above — user-tuned default
                wTurn:   120,      // per-45° turn penalty — long straights / true switchbacks (user-tuned)
            },
            paramDirtyAt: 0,
            radius:   640,                                   // m — visible road radius (set from terrain stream radius)
            anchors:  new Map(),                             // "mx,mz" → THREE.Vector3 (valley-snapped)
            segs:     new Map(),                             // "ax,az>bx,bz" → THREE.Vector3[] (connection waypoints)
            lines:    [],                                    // THREE.Line debug objects
            lastCenter: null,
            dirty:    true,
            surfaceY: null,                                  // optional (x,z)=>renderedHeight for visual line placement
        }
    }

    setProtoEnabled(v) {
        this._proto.enabled = !!v
        if (!v) this._clearProtoLines()
        else { this._proto.dirty = true }
    }
    setProtoParam(key, value) {
        if (key in this._proto.params) { this._proto.params[key] = value; this._proto.dirty = true; this._proto.paramDirtyAt = Date.now(); this._proto.segs.clear() }
    }
    setProtoRadius(r) { if (r > 0 && r !== this._proto.radius) { this._proto.radius = r; this._proto.dirty = true } }
    setSurfaceSampler(fn) { this._proto.surfaceY = fn }       // main.js passes terrainSystem.analyticHeight

    _invalidateProto() { this._proto.anchors.clear(); this._proto.segs.clear() }

    _clearProtoLines() {
        for (const line of this._proto.lines) {
            if (this._scene) this._scene.remove(line)
            if (line.geometry) line.geometry.dispose()
            if (line.material) line.material.dispose()
        }
        this._proto.lines = []
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

    // Remove self-intersection loops from a single road's polyline: where segment (i,i+1)
    // crosses a non-adjacent segment (j,j+1), splice out the loop between them and stitch at the
    // crossing point. Crossing-based → switchbacks (parallel, non-crossing legs) are never touched;
    // only genuine loops (e.g. centripetal spline overshoot at sharp turns) are cut.
    _removeLoops(pts) {
        let p = pts
        for (let guard = 0; guard < 40; guard++) {
            let found = false
            for (let i = 0; i < p.length - 1 && !found; i++) {
                for (let j = i + 2; j < p.length - 1; j++) {
                    const X = _segIntersectXZ(p[i], p[i + 1], p[j], p[j + 1])
                    if (X) { p = [...p.slice(0, i + 1), X, ...p.slice(j + 1)]; found = true; break }
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

    // Stream the trunk: regenerate visible east-running valley roads around `center`.
    // Called each render frame from main.js with the same stream center as terrain.
    updateProto(center) {
        if (!this._proto.enabled || !this._scene) return
        // Debounce slider drags: wait for the cost weights to settle before re-routing.
        if (this._proto.dirty && this._proto.paramDirtyAt && (Date.now() - this._proto.paramDirtyAt) < PROTO_PARAM_DEBOUNCE) return
        const moved = !this._proto.lastCenter || center.distanceTo(this._proto.lastCenter) > PROTO_REGEN_MOVE
        if (!moved && !this._proto.dirty) return
        this._proto.lastCenter = center.clone()
        this._proto.dirty = false
        this._clearProtoLines()

        const R = this._proto.radius
        const mx0 = Math.floor((center.x - R) / PROTO_ANCHOR_SPACING) - 1
        const mx1 = Math.ceil((center.x + R) / PROTO_ANCHOR_SPACING)
        const mz0 = Math.floor((center.z - R) / PROTO_ANCHOR_SPACING)
        const mz1 = Math.ceil((center.z + R) / PROTO_ANCHOR_SPACING)
        const surf = this._proto.surfaceY
        const drawn = new Set()       // dedupe identical segments (collapsed anchors → same road)
        const cover = new Map()       // spatial hash: "cx,cz" → [x, z, hx, hz] of already-drawn road points
        const ckey = (x, z) => `${Math.floor(x / PROTO_COVER_D)},${Math.floor(z / PROTO_COVER_D)}`
        const registerPoint = (x, z, hx, hz) => {
            const k = ckey(x, z); let arr = cover.get(k); if (!arr) { arr = []; cover.set(k, arr) }
            arr.push(x, z, hx, hz)
        }
        const pointCovered = (x, z, hx, hz) => {
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
            for (let mx = mx0; mx <= mx1; mx++) {
                const a = this._protoAnchor(mx, mz)
                const e = this._protoAnchor(mx + 1, mz)               // east-running valley road
                const segKey = `${a.x.toFixed(0)},${a.z.toFixed(0)}>${e.x.toFixed(0)},${e.z.toFixed(0)}`
                if (drawn.has(segKey)) continue
                drawn.add(segKey)
                const wps = this._protoConnect(a, e)
                if (wps.length < 2) continue
                const spline = new THREE.CatmullRomCurve3(wps, false, 'centripetal', 0.5)
                const pts = this._removeLoops(spline.getPoints(Math.max(16, wps.length * 3)))  // intra-road loop cleanup
                // Per-point heading (unit, xz) for the parallel-overlap test.
                const head = pts.map((p, i) => {
                    const q = pts[Math.min(pts.length - 1, i + 1)], r = pts[Math.max(0, i - 1)]
                    const hx = q.x - r.x, hz = q.z - r.z, l = Math.hypot(hx, hz) || 1
                    return [hx / l, hz / l]
                })
                // Drop the road if too much of it overlaps an already-drawn same-direction road.
                let coveredN = 0
                for (let i = 0; i < pts.length; i++) if (pointCovered(pts[i].x, pts[i].z, head[i][0], head[i][1])) coveredN++
                if (coveredN / pts.length > PROTO_COVER_FRAC) continue
                // Keep it: register its points so later roads suppress against it, then draw.
                for (let i = 0; i < pts.length; i++) registerPoint(pts[i].x, pts[i].z, head[i][0], head[i][1])
                if (surf) for (const p of pts) p.y = surf(p.x, p.z) + 1.0  // hug rendered surface
                else for (const p of pts) p.y += 1.0
                const line = _buildDebugLine2(pts, 0x00e5ff)
                this._scene.add(line)
                this._proto.lines.push(line)
            }
        }
        // Bound caches during endless play.
        if (this._proto.anchors.size > 4000) this._proto.anchors.clear()
        if (this._proto.segs.size    > 1500) this._proto.segs.clear()
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

// PROTOTYPE: XZ segment intersection (a→b vs c→d). Returns the crossing point (with
// interpolated y on a→b) or null. Strict interior test (eps) so shared vertices of
// adjacent segments don't count as crossings. Used by _removeLoops.
function _segIntersectXZ(a, b, c, d) {
    const r1 = b.x - a.x, r2 = b.z - a.z, s1 = d.x - c.x, s2 = d.z - c.z
    const denom = r1 * s2 - r2 * s1
    if (Math.abs(denom) < 1e-9) return null                     // parallel / collinear
    const t = ((c.x - a.x) * s2 - (c.z - a.z) * s1) / denom
    const u = ((c.x - a.x) * r2 - (c.z - a.z) * r1) / denom
    const eps = 1e-4
    if (t > eps && t < 1 - eps && u > eps && u < 1 - eps) {
        return new THREE.Vector3(a.x + t * r1, a.y + t * (b.y - a.y), a.z + t * r2)
    }
    return null
}
