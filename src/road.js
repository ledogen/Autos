/**
 * src/road.js — RoadSystem for RangerSim v1.1
 *
 * Responsibilities:
 *  - Per-tile A* road routing over raw coarseHeight (forbidden: chunk-sampled or amplitude-scaled height)
 *  - Seeded tile-edge waypoints via seedFor("roads", tileX, tileZ) for seam continuity
 *  - THREE.CatmullRomCurve3 per tile segment with ghost control points (C1 across seams)
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
 *  - D-04: Valley/pass-seeking via altitude cost term in _edgeCost
 *  - D-06: Ghost control points enable C0/C1 continuity at tile seams (exit gate)
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

    // ── Seeded edge waypoints ──────────────────────────────────────────────────
    /**
     * Derive the west-entry and east-exit waypoints for a tile.
     *
     * Trunk road convention (Open Q3 → Claude's discretion): East-West trunk.
     * West entry lies on x = tileX * CHUNK_SIZE (western edge of this tile).
     * East exit lies on x = (tileX+1) * CHUNK_SIZE (eastern edge of this tile).
     *
     * Ownership convention (RESEARCH §Pattern 3):
     *   Tile (tX, tZ) OWNS its western edge waypoints.
     *   Its eastern exit == western entry of tile (tX+1, tZ), but the eastern exit
     *   is derived using THIS tile's seed — not the neighbor's.
     *   The neighbor (tX+1, tZ) derives its own entry by calling _deriveEdgeWaypoints(tX+1, tZ)
     *   which produces the same value by construction (different rng draw from the same tile seed).
     *
     * Seam continuity: because both tiles call _deriveEdgeWaypoints with THEIR OWN tile coords,
     * the east exit of tile A (tX, tZ) is DIFFERENT from the west entry of tile B (tX+1, tZ).
     * Instead, ghost points are used for C1 continuity — see _buildTileSpline().
     * The east exit position is used as the A* goal on THIS tile only.
     *
     * @param {number} tileX
     * @param {number} tileZ
     * @returns {{ entry: THREE.Vector3, exit: THREE.Vector3 }}
     */
    _deriveEdgeWaypoints(tileX, tileZ) {
        const rng = mulberry32(seedFor(this._worldSeed, 'roads', tileX, tileZ))

        // West entry: random Z offset on western edge
        const entryX = tileX * CHUNK_SIZE
        const entryZ = tileZ * CHUNK_SIZE + rng() * CHUNK_SIZE
        const entryH = this._coarseH(entryX, entryZ)

        // East exit: second random draw from same tile seed, on eastern edge
        const exitX = (tileX + 1) * CHUNK_SIZE
        const exitZ  = tileZ * CHUNK_SIZE + rng() * CHUNK_SIZE
        const exitH  = this._coarseH(exitX, exitZ)

        return {
            entry: new THREE.Vector3(entryX, entryH, entryZ),
            exit:  new THREE.Vector3(exitX,  exitH,  exitZ),
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
     * Build a THREE.CatmullRomCurve3 spline for a tile with ghost control points.
     *
     * Ghost points (RESEARCH §Pattern 3):
     *  - Ghost-left:  last waypoint of tile (tileX-1, tileZ)
     *  - Ghost-right: first waypoint of tile (tileX+1, tileZ)
     *
     * Why ghost points give C1 continuity:
     *   Catmull-Rom tangent at P_i = τ(P_{i+1} - P_{i-1})
     *   Both tile A and tile B share P_{i-1} (ghost) and P_{i+1} (ghost).
     *   → The tangent at the seam waypoint P_i is identical on both sides.
     *
     * Ghost lookups use _getTileWaypointsOnly() NOT _getTile() to avoid recursion:
     *   tile A builds spline → asks B for waypoints only → B does NOT build spline → no cycle.
     *
     * Uses 'centripetal' parameterization (RESEARCH A5): avoids self-intersection
     * at tight hairpin bends.
     *
     * @param {number} tileX
     * @param {number} tileZ
     * @param {THREE.Vector3[]} waypoints — routed waypoints for this tile
     * @returns {THREE.CatmullRomCurve3}
     */
    _buildTileSpline(tileX, tileZ, waypoints) {
        // Fetch ghost points from adjacent tiles (waypoints only — no recursion)
        const leftWaypoints  = this._getTileWaypointsOnly(tileX - 1, tileZ)
        const rightWaypoints = this._getTileWaypointsOnly(tileX + 1, tileZ)

        const ghostLeft  = leftWaypoints.length  > 0 ? leftWaypoints[leftWaypoints.length - 1]  : null
        const ghostRight = rightWaypoints.length > 0 ? rightWaypoints[0] : null

        // Assemble control points: [ghostLeft, ...waypoints, ghostRight]
        // filter(Boolean) removes null ghosts at world edges
        const pts = [ghostLeft, ...waypoints, ghostRight].filter(Boolean)

        // Need at least 2 points for a valid spline
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
