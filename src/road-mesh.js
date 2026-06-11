/**
 * src/road-mesh.js — RoadMeshSystem for RangerSim v1.1
 *
 * Sweeps a crowned, cambered ribbon mesh along per-tile Catmull-Rom road splines.
 * Road tiles are keyed "X,Z" (same format as terrain chunks) and stream in/out
 * co-located with terrain chunk lifetime — built on demand, disposed on evict.
 *
 * Crown + camber MUST match the carve gradeY formula (Plan 09-02/03) so that
 * analyticNormal returns the correct banked normal — the same crownProfile() and
 * camber tilt used in sweepRibbon() are folded into road.js _buildCarveTable().
 *
 * SURF-01: fixed-width ribbon swept along splines with streaming lifecycle.
 * SURF-03: centerline crown + curvature-driven camber as real surface geometry.
 *
 * Design decisions:
 *  - D-04: crown + camber are REAL geometry (vertex Y) so computeVertexNormals()
 *    returns the banked normal that physics analyticNormal agrees with.
 *  - T-09-04: zero-length tangent guard (NaN prevention); camber clamped ±6°.
 *  - Shared material — do NOT dispose per-tile (matches terrain._material pattern).
 *  - MAX_ROAD_BUILDS_PER_FRAME = 1 cap prevents frame spikes alongside terrain.
 *  - _scratchPt/_scratchTan: module-scope reuse avoids per-sample Vector3 alloc (GC).
 *
 * Phase: 09-road-surface
 * Plan: 09-03
 */

import * as THREE from 'three'
import { CHUNK_SIZE } from './terrain.js'
import { crownProfile } from './road-carve.js'

// ── Module-scope scratch vectors (GC-free per-sample allocation guard) ────────
// sweepRibbon is called for every tile's every segment, multiple times per stream.
// Reusing these avoids thousands of Vector3 allocations per re-stream.
const _scratchPt  = new THREE.Vector3()
const _scratchTan = new THREE.Vector3()

// ── Ribbon mesh constants ─────────────────────────────────────────────────────
// CROSS_SEGS: number of lateral segments across the road width.
// 8 gives 1.25 m lateral resolution on a 10 m road — sufficient for crown/camber.
const CROSS_SEGS = 8

// MAX_CAMBER_DEG: camber clamp in radians (±6°), T-09-04 mitigation.
const MAX_CAMBER_RAD = 6 * (Math.PI / 180)

// Build cap: one road tile per frame alongside terrain's MAX_BUILDS_PER_FRAME.
const MAX_ROAD_BUILDS_PER_FRAME = 1

// ── RoadMeshSystem ────────────────────────────────────────────────────────────

export class RoadMeshSystem {
    /**
     * @param {THREE.Scene}     scene      — Three.js scene to add/remove road meshes
     * @param {object}          roadSystem — RoadSystem instance (provides _tiles, ensureTile, _smoothDesignGrade)
     * @param {Function}        terrainRef — (wx,wz)=>number  analytic height sampler
     * @param {object}          params     — RANGER_PARAMS (roadWidth, roadHalfWidth, crownHeight, camberStrength, ...)
     */
    constructor(scene, roadSystem, terrainRef, params) {
        this._scene      = scene
        this._road       = roadSystem
        this._terrainRef = terrainRef
        this._params     = params

        // Tile map: "X,Z" → { meshes: THREE.Mesh[], geometries: THREE.BufferGeometry[] }
        // One tile may have multiple ribbon meshes (one per slice in road._tiles).
        this._tileMeshMap = new Map()

        // Pending queue: tile keys waiting to be built.
        this._pendingQueue = []
        this._pendingSet   = new Set()

        // Shared material — one instance reused across all road tiles.
        // Do NOT dispose per-tile (matches terrain._material shared pattern).
        // vertexColors: true enables the asphalt base color baked into vertex buffer.
        this._material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            side: THREE.FrontSide,
        })
    }

    /**
     * Compute the signed curvature of a Catmull-Rom spline at arc-length parameter u.
     * Uses finite differences on getTangentAt. Sign: positive = left turn (bank right),
     * negative = right turn (bank left) — matches Three.js Y-up right-hand convention.
     *
     * Guard: if either tangent is near-zero length (degenerate spline), returns 0 to
     * prevent NaN propagation (T-09-04 — Research "Pitfall — NaN curvature").
     *
     * @param {THREE.CatmullRomCurve3} spline
     * @param {number} u      — arc-length parameter [0,1]
     * @param {number} arcLen — spline total arc length in metres
     * @param {number} eps    — finite-diff step in normalized u (default 0.01)
     * @returns {number} Signed curvature κ (1/m). Positive = left turn.
     *
     * Pure function — no side effects (D-16).
     */
    _splineCurvatureSigned(spline, u, arcLen, eps = 0.01) {
        const u0 = Math.max(0.0, u - eps)
        const u1 = Math.min(1.0, u + eps)

        const T0 = spline.getTangentAt(u0)
        const T1 = spline.getTangentAt(u1)

        // Guard: near-zero tangent length means the spline collapsed (degenerate control points).
        // Return 0 to avoid NaN camber — T-09-04.
        const l0 = Math.sqrt(T0.x * T0.x + T0.z * T0.z)
        const l1 = Math.sqrt(T1.x * T1.x + T1.z * T1.z)
        if (l0 < 1e-8 || l1 < 1e-8) return 0

        // Signed curvature via XZ cross product of unit tangents.
        // cross = T0.x*T1.z - T0.z*T1.x  > 0 = left turn, < 0 = right turn
        const cross = T0.x * T1.z - T0.z * T1.x

        // Magnitude: |T1 - T0| / (2*eps * arcLen) approximates |dT/ds| (curvature).
        const dtx = T1.x - T0.x
        const dtz = T1.z - T0.z
        const dtLen = Math.sqrt(dtx * dtx + dtz * dtz)
        const du = (u1 - u0)   // actual finite-diff span (may be smaller at endpoints)
        if (du < 1e-10) return 0

        const kappa = dtLen / (du * arcLen)
        return Math.sign(cross) * kappa
    }

    /**
     * Sweep a ribbon mesh along a Catmull-Rom spline with per-section crown + camber.
     *
     * Vertex Y formula (same formula as carve gradeY on-ribbon vertices — SURF-03):
     *   vy = designGradeY[i] + crownProfile(uLat, roadHalfWidth, crownHeight)
     *      + uLat * Math.sin(camberAngle)
     *
     * This is the formula that must match what road.js folds into the carve gradeY
     * table so analyticNormal returns the crowned/cambered normal (height-agreement gate).
     *
     * @param {THREE.CatmullRomCurve3} spline       — per-tile slice spline
     * @param {Float32Array}           designGradeY — smoothed design grade heights (N values, 1:1 with points)
     * @param {THREE.Vector3[]}        points       — arc-length-sampled spline positions (N values)
     * @param {object}                 params       — RANGER_PARAMS
     * @returns {THREE.BufferGeometry} Ribbon geometry with positions, normals, and colors.
     *
     * Pure function of its inputs — no side effects. Deterministic (D-16).
     */
    sweepRibbon(spline, designGradeY, points, params) {
        const N_LONG = points.length     // number of longitudinal sections (from _smoothDesignGrade)
        const halfWidth      = params.roadHalfWidth    ?? 5
        const roadWidth      = params.roadWidth        ?? 10
        const crownHeightVal = params.crownHeight      ?? 0.05
        const camberStrength = params.camberStrength   ?? 200
        const arcLen = spline.getLength ? spline.getLength() : 64

        // Per-section (i) × per-lateral-vertex (j): total vertices = N_LONG × (CROSS_SEGS + 1)
        const nVerts = N_LONG * (CROSS_SEGS + 1)
        const positions = new Float32Array(nVerts * 3)
        const colors    = new Float32Array(nVerts * 3)

        // Dark grey asphalt base color (SURF-02 — vertex-color, no texture).
        // Linear-space: (0.15, 0.15, 0.17) — dark cool grey.
        const RC = 0.15, GC = 0.15, BC = 0.17

        for (let i = 0; i < N_LONG; i++) {
            const u = (N_LONG > 1) ? i / (N_LONG - 1) : 0

            // Arc-length-correct position and tangent at this section.
            // getPointAt/getTangentAt are arc-length-parameterized (not uniform-t).
            _scratchPt.copy(points[i])
            spline.getTangentAt(u, _scratchTan)

            const tx = _scratchTan.x
            const tz = _scratchTan.z
            const tLen = Math.sqrt(tx * tx + tz * tz)

            // Perpendicular right vector in XZ: right = (tan.z, 0, -tan.x).normalize()
            // Guard: degenerate tangent (T-09-04) — fallback to unit X right
            const rightX = tLen > 1e-8 ? tz / tLen : 1
            const rightZ = tLen > 1e-8 ? -tx / tLen : 0

            // Signed curvature → camber angle
            const signedKappa = this._splineCurvatureSigned(spline, u, arcLen)
            const rawCamber   = camberStrength * signedKappa
            const camberAngle = Math.max(-MAX_CAMBER_RAD, Math.min(MAX_CAMBER_RAD, rawCamber))

            const posX  = _scratchPt.x
            const posZ  = _scratchPt.z
            const gradeY = designGradeY[i]

            for (let j = 0; j <= CROSS_SEGS; j++) {
                // Lateral offset: -halfWidth (left edge) to +halfWidth (right edge)
                const uLat = (j / CROSS_SEGS - 0.5) * roadWidth

                // Crown: parabolic Y offset (peak at centerline, 0 at edges)
                const crownY = crownProfile(uLat, halfWidth, crownHeightVal)

                // Camber tilt: uLat * sin(camberAngle) — small-angle approximation valid ≤6°
                const tiltY = uLat * Math.sin(camberAngle)

                const vx = posX + rightX * uLat
                const vy = gradeY + crownY + tiltY
                const vz = posZ + rightZ * uLat

                const idx = (i * (CROSS_SEGS + 1) + j) * 3
                positions[idx    ] = vx
                positions[idx + 1] = vy
                positions[idx + 2] = vz

                // Asphalt vertex color (uniform for now — Plan 09-04 adds markings)
                colors[idx    ] = RC
                colors[idx + 1] = GC
                colors[idx + 2] = BC
            }
        }

        // ── Index buffer: quad strip → 2 triangles per quad (CCW winding) ────────
        // Each quad connects sections i and i+1 across lateral vertices j and j+1.
        const nQuads = (N_LONG - 1) * CROSS_SEGS
        const indices = new Uint32Array(nQuads * 6)
        let ii = 0
        for (let i = 0; i < N_LONG - 1; i++) {
            for (let j = 0; j < CROSS_SEGS; j++) {
                const a = i       * (CROSS_SEGS + 1) + j
                const b = i       * (CROSS_SEGS + 1) + (j + 1)
                const c = (i + 1) * (CROSS_SEGS + 1) + j
                const d = (i + 1) * (CROSS_SEGS + 1) + (j + 1)
                // CCW winding (Three.js default — FrontSide faces up).
                indices[ii++] = a; indices[ii++] = c; indices[ii++] = b
                indices[ii++] = b; indices[ii++] = c; indices[ii++] = d
            }
        }

        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3))
        geo.setIndex(new THREE.BufferAttribute(indices, 1))

        // computeVertexNormals: smooth normals reflecting crown/camber.
        // Physics uses analyticNormal (central-diff over analyticHeight which includes carve),
        // so visual normals and physics normals both reflect the crowned/cambered surface.
        geo.computeVertexNormals()

        return geo
    }

    /**
     * Enqueue a road tile for building if it has not been built yet.
     * Building is frame-spread (MAX_ROAD_BUILDS_PER_FRAME = 1) to avoid frame spikes.
     *
     * @param {number} tileX — tile column (integer, same scale as terrain chunk cx)
     * @param {number} tileZ — tile row
     */
    ensureRoadTile(tileX, tileZ) {
        const key = `${tileX},${tileZ}`
        if (this._tileMeshMap.has(key) || this._pendingSet.has(key)) return
        this._pendingSet.add(key)
        this._pendingQueue.push({ tileX, tileZ, key })
    }

    /**
     * Dispose a road tile: remove its meshes from the scene, dispose geometry.
     * Material is shared — never disposed here (matches terrain.js dispose pattern).
     *
     * @param {string} key — "X,Z" tile key
     */
    disposeRoadTile(key) {
        const entry = this._tileMeshMap.get(key)
        if (!entry) return
        for (const mesh of entry.meshes) {
            this._scene.remove(mesh)
        }
        for (const geo of entry.geometries) {
            geo.dispose()   // T-06-03: explicit GPU memory release
        }
        this._tileMeshMap.delete(key)
        this._pendingSet.delete(key)
    }

    /**
     * Process the pending build queue — build up to MAX_ROAD_BUILDS_PER_FRAME tiles.
     * Called once per frame from the streaming loop in main.js.
     */
    flushPendingQueue() {
        let built = 0
        while (this._pendingQueue.length > 0 && built < MAX_ROAD_BUILDS_PER_FRAME) {
            const { tileX, tileZ, key } = this._pendingQueue.shift()
            this._pendingSet.delete(key)
            this._buildRoadTile(tileX, tileZ, key)
            built++
        }
    }

    /**
     * Sync the road tile set with the provided set of terrain chunk keys.
     * Tiles in `activeKeys` that are not built are enqueued; tiles not in `activeKeys`
     * are disposed. This keeps road tile lifetime co-located with terrain chunk lifetime.
     *
     * @param {Set<string>} activeKeys — set of "X,Z" keys currently in the terrain ring
     */
    syncToChunkRing(activeKeys) {
        // Enqueue any active tile that does not have a road mesh yet
        for (const key of activeKeys) {
            const [cx, cz] = key.split(',').map(Number)
            this.ensureRoadTile(cx, cz)
        }
        // Dispose road tiles whose terrain chunk has been evicted
        for (const key of this._tileMeshMap.keys()) {
            if (!activeKeys.has(key)) {
                this.disposeRoadTile(key)
            }
        }
        // Also drop pending tiles that are no longer in the active ring
        const newQueue = []
        for (const item of this._pendingQueue) {
            if (activeKeys.has(item.key)) {
                newQueue.push(item)
            } else {
                this._pendingSet.delete(item.key)
            }
        }
        this._pendingQueue = newQueue
    }

    /**
     * Clear all built and pending road tiles — used when the road network re-streams.
     * All tile meshes are removed from the scene and geometries disposed.
     */
    clearAll() {
        for (const key of [...this._tileMeshMap.keys()]) {
            this.disposeRoadTile(key)
        }
        this._pendingQueue = []
        this._pendingSet.clear()
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /**
     * Build all ribbon meshes for a single road tile.
     * Reads the road tile's segment array from road._tiles.get(key), computes the
     * design grade for each slice, sweeps a ribbon, and adds the mesh to the scene.
     *
     * Pure function of (tileX, tileZ, road._tiles) — deterministic (D-16).
     * No allocations outside the geometry itself (scratch vectors reused above).
     *
     * @param {number} tileX
     * @param {number} tileZ
     * @param {string} key
     */
    _buildRoadTile(tileX, tileZ, key) {
        // Ensure the road slice data is available for this tile.
        // ensureTile() warms the network + slices if needed.
        this._road.ensureTile(tileX, tileZ)
        const segs = this._road._tiles.get(key)
        if (!segs || segs.length === 0) {
            // No road on this tile — mark as processed so we don't re-queue it.
            this._tileMeshMap.set(key, { meshes: [], geometries: [] })
            return
        }

        const meshes     = []
        const geometries = []

        for (const seg of segs) {
            const { spline } = seg
            if (!spline) continue

            // Design grade: smoothed analyticHeight profile along this spline slice.
            // _smoothDesignGrade is memoized by spline identity + window, so repeated calls
            // for the same tile (e.g. after re-stream to same canonical position) are O(1).
            const { points, designGradeY } = this._road._smoothDesignGrade(
                spline,
                this._terrainRef,
                this._params
            )

            if (points.length < 2) continue

            const geo  = this.sweepRibbon(spline, designGradeY, points, this._params)
            const mesh = new THREE.Mesh(geo, this._material)

            // Road mesh sits at world origin (geometry is already in world space).
            // Do NOT offset by tile center — ribbon vertices are world-space XZ from sweepRibbon.
            mesh.receiveShadow = true

            this._scene.add(mesh)
            meshes.push(mesh)
            geometries.push(geo)
        }

        this._tileMeshMap.set(key, { meshes, geometries })
    }
}
