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

    // ── Public API (REBUILT in 08-06 / 08-07) ───────────────────────────────────
    // NOTE (08-05): The old per-tile router that these methods routed through has been
    // DELETED. They are retargeted onto the valley-trunk network (this._network) in 08-06
    // (ensureTile/queryNearest) and 08-07 (viz). Until then they are benign no-op stubs so
    // src/road.js imports cleanly and no live call path reaches removed symbols. main.js /
    // test harnesses are re-wired in 08-07.

    /**
     * STUB (08-06 retargets onto _streamNetwork). Warms the valley-trunk network around a
     * tile. No-op until 08-06 wires it to the streaming network — returns null so callers
     * that ignore the result keep working without touching deleted per-tile machinery.
     * @returns {null}
     */
    ensureTile(/* tileX, tileZ */) {
        return null
    }

    /**
     * STUB (08-06 retargets onto this._network sliced splines). Returns the nearest network
     * point + unit tangent within radius once wired; until 08-06 there is no queryable sliced
     * network, so this returns null (no road found).
     * @returns {{ point: THREE.Vector3, tangent: THREE.Vector3 } | null}
     */
    queryNearest(/* wx, wz, radiusM */) {
        return null
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
        this._invalidateProto()
    }

    /**
     * STUB (08-07 rebuilds viz from this._network). No-op until 08-07 replaces the viz with
     * centerline splines sampled from the valley-trunk network.
     */
    buildDebugLines() {
        // no-op (08-07)
    }

    /**
     * STUB (08-07 rebuilds viz). Records the requested visibility for 08-07 to honor; toggles
     * any lines that already exist. Auto-build is deferred to 08-07's network-backed viz.
     * @param {boolean} visible
     */
    setDebugVisible(visible) {
        this._debugVisible = visible
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
            // anchor junctions are visible to the loop remover and the row renders as a single road.
            let rowWps = []
            for (let mx = mx0; mx <= mx1; mx++) {
                const wps = this._protoConnect(this._protoAnchor(mx, mz), this._protoAnchor(mx + 1, mz))
                if (wps.length < 2) continue
                if (rowWps.length) { for (let k = 1; k < wps.length; k++) rowWps.push(wps[k]) }  // drop shared anchor
                else rowWps = wps.slice()
            }
            if (rowWps.length < 2) continue

            const spline = new THREE.CatmullRomCurve3(rowWps, false, 'centripetal', 0.5)
            const pts = this._removeLoops(spline.getPoints(Math.max(24, rowWps.length * 2)))
            if (pts.length < 2) continue
            const head = pts.map((p, i) => {
                const q = pts[Math.min(pts.length - 1, i + 1)], r = pts[Math.max(0, i - 1)]
                const hx = q.x - r.x, hz = q.z - r.z, l = Math.hypot(hx, hz) || 1
                return [hx / l, hz / l]
            })

            // Draw as contiguous runs, breaking wherever this row overlaps a PRIOR row (same dir).
            // Register this row's points only AFTER drawing it, so a straight road never self-culls.
            const kept = []
            let run = []
            const emitRun = () => {
                if (run.length >= PROTO_RUN_MIN) {
                    const seg = run.slice()
                    if (surf) for (const p of seg) p.y = surf(p.x, p.z) + 1.0
                    else for (const p of seg) p.y += 1.0
                    const line = _buildDebugLine2(seg, 0x00e5ff)
                    this._scene.add(line); this._proto.lines.push(line)
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

// (removed: _segIntersectXZ — replaced by proximity-based _removeLoops)
