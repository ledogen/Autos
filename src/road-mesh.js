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
 * SURF-02: per-vertex dark-grey asphalt with per-500 m quality-tiered lane markings.
 * SURF-03: centerline crown + curvature-driven camber as real surface geometry.
 *
 * Design decisions:
 *  - D-01: Asphalt and markings are purely procedural (vertex colors, no asset files).
 *  - D-02: roadQuality tiers span ROAD_QUALITY_STRETCH=500 m stretches, blended over
 *    ROAD_QUALITY_BLEND=10 m at boundaries so markings do not snap.
 *  - D-03: roadQuality is a labeled hook on each arc position — the same value drives
 *    both markings here and pothole severity in Plan 09-06.
 *  - D-04: crown + camber are REAL geometry (vertex Y) so computeVertexNormals()
 *    returns the banked normal that physics analyticNormal agrees with.
 *  - T-09-04: zero-length tangent guard (NaN prevention); camber clamped ±6°.
 *  - Shared material — do NOT dispose per-tile (matches terrain._material pattern).
 *  - MAX_ROAD_BUILDS_PER_FRAME = 1 cap prevents frame spikes alongside terrain.
 *  - _scratchPt/_scratchTan: module-scope reuse avoids per-sample Vector3 alloc (GC).
 *
 * Phase: 09-road-surface
 * Plan: 09-05
 */

import * as THREE from 'three'
import { CHUNK_SIZE } from './terrain.js'
import { crownProfile, isConvexPolygon, triangulateConvexFan, earClip, potholeNoise, signedCurvature } from './road-carve.js'
// roadQuality / hashRunKey / constants moved to road-quality.js (Plan 09-06) to break the
// terrain.js → road-mesh.js → terrain.js circular import that SURF-06 would otherwise create.
// Re-exported here so existing callers (test harness, road.js) can still import from road-mesh.js.
export { roadQuality, hashRunKey, ROAD_QUALITY_STRETCH, ROAD_QUALITY_BLEND } from './road-quality.js'
import { roadQuality, ROAD_QUALITY_STRETCH, ROAD_QUALITY_BLEND } from './road-quality.js'
import { perfAdd } from './perf.js'  // TEMP perf triage (D-arc)

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

// ── Road quality lane-marking thresholds ─────────────────────────────────────
// Markings drawn as bright vertex-color patches (no texture, no asset — D-01).
// Widths are lateral distances from the road centerline (uLat).
const MARK_CENTER_HALF = 0.15  // m half-width of centerline stripe
const MARK_EDGE_HALF   = 0.10  // m half-width of edge-line stripe (measured inward from ribbon edge)

// ── RoadMeshSystem ────────────────────────────────────────────────────────────

export class RoadMeshSystem {
    /**
     * @param {THREE.Scene}     scene      — Three.js scene to add/remove road meshes
     * @param {object}          roadSystem — RoadSystem instance (provides _tiles, ensureTile, _smoothDesignGrade)
     * @param {Function}        terrainRef — (wx,wz)=>number  analytic height sampler
     * @param {object}          params     — RANGER_PARAMS (roadWidth, roadHalfWidth, crownHeight, camberStrength, ...)
     * @param {number}          [worldSeed=0] — world seed for roadQuality determinism (D-03)
     */
    constructor(scene, roadSystem, terrainRef, params, worldSeed = 0) {
        this._scene      = scene
        this._road       = roadSystem
        this._terrainRef = terrainRef
        this._params     = params
        this._worldSeed  = worldSeed >>> 0  // D-03: stored for roadQuality() calls in sweepRibbon

        // Tile map: "X,Z" → { meshes: THREE.Mesh[], geometries: THREE.BufferGeometry[] }
        // One tile may have multiple ribbon meshes (one per slice in road._tiles).
        this._tileMeshMap = new Map()

        // Pending queue: tile keys waiting to be built.
        this._pendingQueue = []
        this._pendingSet   = new Set()

        // Shared material — one instance reused across all road tiles.
        // Do NOT dispose per-tile (matches terrain._material shared pattern).
        // vertexColors: true enables the asphalt base color baked into vertex buffer.
        // polygonOffset: Plan 09-10 — negative factor/units pull the ribbon toward the
        // camera in depth so it renders over coplanar terrain without z-fighting.
        this._material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            side: THREE.FrontSide,
            polygonOffset: true,
            polygonOffsetFactor: params.roadPolygonOffsetFactor ?? -1,
            polygonOffsetUnits:  params.roadPolygonOffsetUnits  ?? -1,
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
    _splineCurvatureSigned(spline, u, arcLen) {
        // CR-02 (09-08): thin wrapper over the shared signedCurvature helper.
        // Uses a fixed world-space ds = 2.0 m so camber matches both carve sites exactly.
        const ds = 2.0
        const du = arcLen > 1e-6 ? ds / arcLen : 0.02
        const u0 = Math.max(0.0, u - du * 0.5)
        const u1 = Math.min(1.0, u + du * 0.5)

        const T0 = spline.getTangentAt(u0)
        const T1 = spline.getTangentAt(u1)

        // Actual arc-length span between the two sample points.
        const actualDs = (u1 - u0) * arcLen
        return signedCurvature(T0.x, T0.z, T1.x, T1.z, actualDs)
    }

    /**
     * Sweep a ribbon mesh along a Catmull-Rom spline with per-section crown + camber
     * and per-500 m road-quality-tiered lane markings (SURF-02, D-01, D-02, D-03).
     *
     * Vertex Y formula (same formula as carve gradeY on-ribbon vertices — SURF-03):
     *   vy = designGradeY[i] + crownProfile(uLat, roadHalfWidth, crownHeight)
     *      + uLat * Math.sin(camberAngle)
     *
     * This is the formula that must match what road.js folds into the carve gradeY
     * table so analyticNormal returns the crowned/cambered normal (height-agreement gate).
     *
     * Road quality markings (no asset files — D-01):
     *   High quality (q >= 0.66): solid centerline + solid edge lines, full white (0.9,0.9,0.9).
     *   Mid quality (q 0.33–0.66): solid centerline + intermittent edge (arcS%12<8), faded (0.65).
     *   Low quality (q < 0.33): faint centerline only (brightness ~0.3), no edge lines.
     *   Transition blended by blended roadQuality so markings fade smoothly across stretch boundary.
     *
     * Markings are INTERRUPTED inside junction footprints (D-12): this is indicated to
     * callers via the `inJunction` parameter — when true, marking colors are suppressed
     * (only asphalt base color) so the junction footprint can render its own clean surface.
     *
     * @param {THREE.CatmullRomCurve3} spline       — per-tile slice spline
     * @param {Float32Array}           designGradeY — smoothed design grade heights (N values, 1:1 with points)
     * @param {THREE.Vector3[]}        points       — arc-length-sampled spline positions (N values)
     * @param {object}                 params       — RANGER_PARAMS
     * @param {string}                 [runKey='']  — run identifier for roadQuality determinism (D-03)
     * @param {number}                 [arcSOffset=0] — arc-length offset of this tile's slice start (m)
     * @returns {THREE.BufferGeometry} Ribbon geometry with positions, normals, and colors.
     *
     * Pure function of its inputs — no side effects. Deterministic (D-16).
     */
    sweepRibbon(spline, designGradeY, points, params, runKey = '', arcS0 = 0, arcS1 = 0) {
        // BUG-10: arcS0/arcS1 are the RUN-global arc at this slice's u=0/u=1 ends. arcS(u) =
        // arcS0 + (arcS1−arcS0)·u is the continuous run arc (no per-tile sawtooth); camberSign maps
        // the run-frame signed camber into this slice's sweep frame (slice may run E→W → arcS1<arcS0).
        const camberSign = arcS1 >= arcS0 ? 1 : -1
        const N_LONG = points.length     // number of longitudinal sections (~2 m resolution)
        const halfWidth      = params.roadHalfWidth    ?? 5
        const roadWidth      = params.roadWidth        ?? 10
        const crownHeightVal = params.crownHeight      ?? 0.05
        // camberStrength now consumed by this._road.camberProfile() — not needed here (D2, plan 09-21)
        const skirtDepth     = params.roadSkirtDepth   ?? 0.4
        const arcLen = spline.getLength ? spline.getLength() : 64

        // Plan 09-10: vertsPerSection includes the top-surface lateral strip PLUS 2 skirt
        // bottom verts (left-edge-bottom at index CROSS_SEGS+1, right-edge-bottom at CROSS_SEGS+2).
        // This stride must stay stable — Plan 09-12 test harness indexes centerline verts using it.
        const vertsPerSection = (CROSS_SEGS + 1) + 2  // 11 top + 2 skirt = 13 per section
        const nVerts = N_LONG * vertsPerSection
        const positions = new Float32Array(nVerts * 3)
        const colors    = new Float32Array(nVerts * 3)

        // Dark grey asphalt base color (SURF-02 — vertex-color, no texture — D-01).
        // Linear-space: (0.15, 0.15, 0.17) — dark cool grey.
        const RC = 0.15, GC = 0.15, BC = 0.17

        // Plan 09-24 — Dirt shoulder colour for skirt verts (SURF-05 / D-01 / D-08).
        // Derived from params.roadDirtColor hex int via bit-shifts → 0–1 linear space.
        // Matches the linear-space convention used by RC/GC/BC above.
        const dirtHex = params.roadDirtColor ?? 0x6b5a3e
        const dirtR = ((dirtHex >> 16) & 0xff) / 255
        const dirtG = ((dirtHex >>  8) & 0xff) / 255
        const dirtB =  (dirtHex        & 0xff) / 255

        // 09-32 SEAM FIX: map section index → run-arc by the polyline's CUMULATIVE XZ arc-length,
        // not uniform u. `points[]` come from spline.getPointAt(u), which is parameterised by 3D
        // arc-length — that diverges from the run-arc (XZ) metric wherever the road climbs or the
        // Catmull-Rom bows/overshoots at a tile-boundary cut. Uniform-u then hands an overshot vertex
        // an arcS (hence gradeY) that does NOT match its true XZ position, rendering a sharp step the
        // carved collision surface never shows (the carve resolves Y by nearest-XZ sample, diluting
        // the overshoot — hence "smooth to drive, stepped to look at"). Cumulative XZ tracks each
        // vertex's real run-arc, so the ribbon Y matches the driven surface. Endpoints still map to
        // arcS0/arcS1 exactly (cum=0 and cum=total) → boundary cross-sections coincide → seams still weld.
        const cumXZ = new Float32Array(N_LONG)
        for (let i = 1; i < N_LONG; i++) {
            cumXZ[i] = cumXZ[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z)
        }
        const totXZ = cumXZ[N_LONG - 1] || 1

        for (let i = 0; i < N_LONG; i++) {
            // Arc-length-correct position at this section.
            _scratchPt.copy(points[i])

            const posX  = _scratchPt.x
            const posZ  = _scratchPt.z

            // ── Road quality at this arc position (D-02/D-03) ──────────────────
            // arcS: RUN-global arc-length (BUG-10), keyed by cumulative XZ (09-32) so gradeY/camber/
            // quality track the vertex's true XZ position, not the spline's 3D-arc parameter.
            const arcS = arcS0 + (arcS1 - arcS0) * (cumXZ[i] / totXZ)

            // P3 (BUG-12): Section frame from the continuous run tangent (09-28).
            // runProfile(arcS, runKey).tx/tz is C0 across ALL slice seams — both sides of a
            // seam resolve to the same arcS and return the SAME tx/tz → boundary cross-sections
            // are identical → ±halfWidth edge vertices coincide → edges weld by construction.
            // Replaces spline.getTangentAt(u) which was per-slice and tore at sharp corners.
            const _rp = this._road.runProfile(arcS, runKey)
            // The run tangent points along the canonical run direction. A slice may run E→W
            // (arcS1 < arcS0 → camberSign = -1); flip the tangent into THIS slice's sweep
            // direction so winding is not inverted and camber orientation stays correct.
            const rpTx = camberSign * _rp.tx
            const rpTz = camberSign * _rp.tz
            const tLen = Math.sqrt(rpTx * rpTx + rpTz * rpTz)

            // Perpendicular right vector in XZ: right = (tan.z, 0, -tan.x).normalize()
            // Guard: degenerate tangent (T-09-04) — fallback to unit X right
            const rightX = tLen > 1e-8 ? rpTz / tLen : 1
            const rightZ = tLen > 1e-8 ? -rpTx / tLen : 0

            // P3 (09-28): use rp.gradeY as the centerline Y so ribbon, physics, and carve
            // all read from the same single arc-indexed profile (height-agreement invariant).
            const gradeY = _rp.gradeY
            const q = roadQuality(arcS, runKey, this._worldSeed)

            // D2 (plan 09-21): camber from the shared slew-limited camberProfile — replaces
            // the per-vertex instantaneous _splineCurvatureSigned camber (bug #4 fix).
            // One profile per canonical run, cached + generation-invalidated (D1).
            // BUG-10: keyed on run-global arcS + camberSign so banking is continuous across tile
            // seams and correctly oriented on E→W (reversed) slices.
            const camberAngle = camberSign * this._road.camberProfile(arcS, runKey)

            // Tier classification:
            //   High (q >= 0.66): solid center + solid edge, white (0.9)
            //   Mid  (q 0.33–0.66): solid center + intermittent edge (arcS%12<8), faded (0.65)
            //   Low  (q < 0.33): very faint center only (~0.3), no edge
            const isHigh = q >= 0.66
            const isMid  = q >= 0.33 && q < 0.66
            // isLow = q < 0.33

            // Marking brightness: interpolate smoothly so transitions are smooth across tier boundary.
            // Center marking exists for all tiers; brightness scales with quality.
            const centerBrightness = isHigh ? 0.9 : (isMid ? 0.65 : 0.3)
            // Edge line: present for High (solid), Mid (intermittent), absent for Low.
            // Use arcS modulo 12 m pattern for Mid intermittent (8 m on, 4 m off — D-02).
            const edgeOn = isHigh ? true : (isMid ? ((arcS % 12) < 8) : false)
            const edgeBrightness = isHigh ? 0.9 : 0.65

            // Track edge vy values to build skirt verts after the top-surface loop.
            let leftEdgeVx = 0, leftEdgeVy = 0, leftEdgeVz = 0
            let rightEdgeVx = 0, rightEdgeVy = 0, rightEdgeVz = 0

            for (let j = 0; j <= CROSS_SEGS; j++) {
                // Lateral offset: -halfWidth (left edge) to +halfWidth (right edge)
                const uLat = (j / CROSS_SEGS - 0.5) * roadWidth

                // Crown: parabolic Y offset (peak at centerline, 0 at edges)
                const crownY = crownProfile(uLat, halfWidth, crownHeightVal)

                // Camber tilt: uLat * sin(camberAngle) — small-angle approximation valid ≤6°
                const tiltY = uLat * Math.sin(camberAngle)

                const vx = posX + rightX * uLat
                const vz = posZ + rightZ * uLat

                // ── SURF-06: pothole/crack perturbation (D-03) ─────────────────
                // Applied only on-ribbon (|uLat| < halfWidth) — zero outside ribbon.
                // Uses world position (vx, vz) as lattice key — identical to the
                // carve table builder and _sampleCarveWorld (height-agreement gate).
                const absLatP = Math.abs(uLat)
                const pY = absLatP < halfWidth
                    ? potholeNoise(vx, vz, q, params)
                    : 0

                const vy = gradeY + crownY + tiltY + pY

                const idx = (i * vertsPerSection + j) * 3
                positions[idx    ] = vx
                positions[idx + 1] = vy
                positions[idx + 2] = vz

                // ── Vertex color: asphalt base + marking overlay ───────────────
                // Markings are bright vertex-color patches (no texture/asset — D-01).
                const absLat = Math.abs(uLat)

                // Centerline: |uLat| < MARK_CENTER_HALF
                const isCenterline = absLat < MARK_CENTER_HALF

                // Edge lines: within MARK_EDGE_HALF of the ribbon edge.
                // Left edge: uLat near -halfWidth; Right edge: uLat near +halfWidth.
                const distFromEdge = halfWidth - absLat
                const isEdgeLine = edgeOn && distFromEdge < MARK_EDGE_HALF

                let r = RC, g = GC, b = BC  // asphalt base
                if (isCenterline) {
                    r = centerBrightness; g = centerBrightness; b = centerBrightness
                } else if (isEdgeLine) {
                    r = edgeBrightness; g = edgeBrightness; b = edgeBrightness
                }

                colors[idx    ] = r
                colors[idx + 1] = g
                colors[idx + 2] = b

                // Capture edge vert positions for skirt generation below.
                if (j === 0)          { leftEdgeVx  = vx; leftEdgeVy  = vy; leftEdgeVz  = vz }
                if (j === CROSS_SEGS) { rightEdgeVx = vx; rightEdgeVy = vy; rightEdgeVz = vz }
            }

            // ── Plan 09-10: Skirt verts — two extra verts per section ─────────────
            // Left-edge bottom (local index CROSS_SEGS+1): same XZ as j=0 edge, Y dropped by skirtDepth.
            // Right-edge bottom (local index CROSS_SEGS+2): same XZ as j=CROSS_SEGS edge, Y dropped.
            // Color: dirt brown (SURF-05 / Plan 09-24) — visually distinguishes the engineered
            // shoulder from the paved asphalt surface. Derived from params.roadDirtColor (hex int).
            // D-01 discipline: procedural vertex colour — no texture or asset file.
            const leftSkirtBase  = (i * vertsPerSection + (CROSS_SEGS + 1)) * 3
            positions[leftSkirtBase    ] = leftEdgeVx
            positions[leftSkirtBase + 1] = leftEdgeVy - skirtDepth
            positions[leftSkirtBase + 2] = leftEdgeVz
            colors[leftSkirtBase    ] = dirtR
            colors[leftSkirtBase + 1] = dirtG
            colors[leftSkirtBase + 2] = dirtB

            const rightSkirtBase = (i * vertsPerSection + (CROSS_SEGS + 2)) * 3
            positions[rightSkirtBase    ] = rightEdgeVx
            positions[rightSkirtBase + 1] = rightEdgeVy - skirtDepth
            positions[rightSkirtBase + 2] = rightEdgeVz
            colors[rightSkirtBase    ] = dirtR
            colors[rightSkirtBase + 1] = dirtG
            colors[rightSkirtBase + 2] = dirtB
        }

        // ── P3 (09-28): Shared-boundary edge weld (continuity-over-roundness, BUG-12) ──────
        // Both slices that share a seam resolve to the SAME arcS at the boundary, so
        // runProfile already returns bit-identical tx/tz → the loop above already produces
        // identical edge positions. This explicit snap makes that GUARANTEE by construction
        // rather than by floating-point luck — it overwrites the first/last sections'
        // ±halfWidth edge vertices with positions recomputed directly from the boundary arcS
        // profile, so even a future refactor cannot accidentally break the weld.
        // Does NOT modify spline/router geometry — position (posX,posZ) still comes from the
        // spline control point (C0 shared by construction); only the right-vector offset is re-pinned.
        for (const bndIdx of [0, N_LONG - 1]) {
            if (N_LONG < 2) break
            const bndArcS = bndIdx === 0 ? arcS0 : arcS1
            const bndRp   = this._road.runProfile(bndArcS, runKey)
            const bndTx   = camberSign * bndRp.tx
            const bndTz   = camberSign * bndRp.tz
            const bndLen  = Math.sqrt(bndTx * bndTx + bndTz * bndTz)
            const bndRightX = bndLen > 1e-8 ? bndTz / bndLen : 1
            const bndRightZ = bndLen > 1e-8 ? -bndTx / bndLen : 0

            // Re-read the centerline XZ for this boundary section (world-space from spline).
            const bndPt = points[bndIdx]
            const bndPosX = bndPt.x, bndPosZ = bndPt.z
            const bndGradeY = bndRp.gradeY
            const bndCamberAngle = camberSign * this._road.camberProfile(bndArcS, runKey)
            const bndQ = roadQuality(bndArcS, runKey, this._worldSeed)
            const bndIsHigh = bndQ >= 0.66
            const bndIsMid  = bndQ >= 0.33 && bndQ < 0.66

            for (let j = 0; j <= CROSS_SEGS; j++) {
                const uLat = (j / CROSS_SEGS - 0.5) * roadWidth
                const crownY  = crownProfile(uLat, halfWidth, crownHeightVal)
                const tiltY   = uLat * Math.sin(bndCamberAngle)
                const bndVx   = bndPosX + bndRightX * uLat
                const bndVz   = bndPosZ + bndRightZ * uLat
                const bndAbsP = Math.abs(uLat)
                const bndPY   = bndAbsP < halfWidth ? potholeNoise(bndVx, bndVz, bndQ, params) : 0
                const bndVy   = bndGradeY + crownY + tiltY + bndPY

                const bndBase = (bndIdx * vertsPerSection + j) * 3
                positions[bndBase    ] = bndVx
                positions[bndBase + 1] = bndVy
                positions[bndBase + 2] = bndVz

                // Recompute color for boundary vert (same logic as main loop).
                const bndAbsLat = Math.abs(uLat)
                const bndIsCenterline = bndAbsLat < MARK_CENTER_HALF
                const bndDistFromEdge = halfWidth - bndAbsLat
                const bndEdgeOn = bndIsHigh ? true : (bndIsMid ? ((bndArcS % 12) < 8) : false)
                const bndEdgeBrightness = bndIsHigh ? 0.9 : 0.65
                const bndCenterBrightness = bndIsHigh ? 0.9 : (bndIsMid ? 0.65 : 0.3)
                const bndIsEdgeLine = bndEdgeOn && bndDistFromEdge < MARK_EDGE_HALF
                let bndR = RC, bndG = GC, bndB = BC
                if (bndIsCenterline) {
                    bndR = bndCenterBrightness; bndG = bndCenterBrightness; bndB = bndCenterBrightness
                } else if (bndIsEdgeLine) {
                    bndR = bndEdgeBrightness; bndG = bndEdgeBrightness; bndB = bndEdgeBrightness
                }
                colors[bndBase    ] = bndR
                colors[bndBase + 1] = bndG
                colors[bndBase + 2] = bndB
            }
            // Re-snap the skirt verts at this boundary section too.
            // Left skirt: j=0 edge
            const bndLeftEdgeVx = bndPosX + bndRightX * (-halfWidth)
            const bndLeftEdgeVy = bndGradeY
                + crownProfile(-halfWidth, halfWidth, crownHeightVal)
                + (-halfWidth) * Math.sin(bndCamberAngle)
                + (halfWidth < halfWidth ? potholeNoise(bndLeftEdgeVx, bndPosZ + bndRightZ * (-halfWidth), bndQ, params) : 0)
            const bndLeftEdgeVz = bndPosZ + bndRightZ * (-halfWidth)
            const bndLeftSkirtBase = (bndIdx * vertsPerSection + (CROSS_SEGS + 1)) * 3
            positions[bndLeftSkirtBase    ] = bndLeftEdgeVx
            positions[bndLeftSkirtBase + 1] = bndLeftEdgeVy - skirtDepth
            positions[bndLeftSkirtBase + 2] = bndLeftEdgeVz
            // Right skirt: j=CROSS_SEGS edge
            const bndRightEdgeVx = bndPosX + bndRightX * halfWidth
            const bndRightEdgeVy = bndGradeY
                + crownProfile(halfWidth, halfWidth, crownHeightVal)
                + halfWidth * Math.sin(bndCamberAngle)
                + (halfWidth < halfWidth ? potholeNoise(bndRightEdgeVx, bndPosZ + bndRightZ * halfWidth, bndQ, params) : 0)
            const bndRightEdgeVz = bndPosZ + bndRightZ * halfWidth
            const bndRightSkirtBase = (bndIdx * vertsPerSection + (CROSS_SEGS + 2)) * 3
            positions[bndRightSkirtBase    ] = bndRightEdgeVx
            positions[bndRightSkirtBase + 1] = bndRightEdgeVy - skirtDepth
            positions[bndRightSkirtBase + 2] = bndRightEdgeVz
        }

        // ── Index buffer: quad strip → 2 triangles per quad (CCW winding) ────────
        // Top surface: (N_LONG-1) * CROSS_SEGS quads — lateral strip connecting sections.
        // Skirts: (N_LONG-1) * 2 quads — one left-edge skirt quad + one right-edge skirt quad
        //         per section pair. Total quads = (N_LONG-1) * (CROSS_SEGS + 2).
        const nQuads = (N_LONG - 1) * CROSS_SEGS  +  (N_LONG - 1) * 2
        const indices = new Uint32Array(nQuads * 6)
        let ii = 0
        for (let i = 0; i < N_LONG - 1; i++) {
            // ── Top-surface quad strip ─────────────────────────────────────────
            for (let j = 0; j < CROSS_SEGS; j++) {
                const a = i       * vertsPerSection + j
                const b = i       * vertsPerSection + (j + 1)
                const c = (i + 1) * vertsPerSection + j
                const d = (i + 1) * vertsPerSection + (j + 1)
                // CCW winding (Three.js default — FrontSide faces up).
                indices[ii++] = a; indices[ii++] = c; indices[ii++] = b
                indices[ii++] = b; indices[ii++] = c; indices[ii++] = d
            }

            // ── Left-edge skirt quad ───────────────────────────────────────────
            // topLeft(i) = i*vertsPerSection + 0 (j=0 is left edge)
            // topLeft(i+1) = (i+1)*vertsPerSection + 0
            // bottomLeft(i) = i*vertsPerSection + (CROSS_SEGS+1)
            // bottomLeft(i+1) = (i+1)*vertsPerSection + (CROSS_SEGS+1)
            // Left skirt faces outward (-right direction): winding CW when viewed from -right.
            // Three.js FrontSide, so we need CCW from the outside face (-right side).
            // Outside view (-right): topLeft(i) → bottomLeft(i) → topLeft(i+1), then topLeft(i+1) → bottomLeft(i) → bottomLeft(i+1)
            {
                const tL0 = i       * vertsPerSection + 0
                const tL1 = (i + 1) * vertsPerSection + 0
                const bL0 = i       * vertsPerSection + (CROSS_SEGS + 1)
                const bL1 = (i + 1) * vertsPerSection + (CROSS_SEGS + 1)
                indices[ii++] = tL0; indices[ii++] = bL0; indices[ii++] = tL1
                indices[ii++] = tL1; indices[ii++] = bL0; indices[ii++] = bL1
            }

            // ── Right-edge skirt quad ──────────────────────────────────────────
            // topRight(i) = i*vertsPerSection + CROSS_SEGS (j=CROSS_SEGS is right edge)
            // bottomRight(i) = i*vertsPerSection + (CROSS_SEGS+2)
            // Right skirt faces outward (+right direction): winding CCW from +right side.
            {
                const tR0 = i       * vertsPerSection + CROSS_SEGS
                const tR1 = (i + 1) * vertsPerSection + CROSS_SEGS
                const bR0 = i       * vertsPerSection + (CROSS_SEGS + 2)
                const bR1 = (i + 1) * vertsPerSection + (CROSS_SEGS + 2)
                indices[ii++] = tR0; indices[ii++] = tR1; indices[ii++] = bR0
                indices[ii++] = bR0; indices[ii++] = tR1; indices[ii++] = bR1
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
     * D5 (plan 09-20) ring hysteresis: built tiles are disposed only when they fall outside
     * the KEEP set, which is the active build ring expanded by `roadTileKeepMargin` tiles in
     * each direction. This prevents the instant dispose+re-enqueue thrash (bug #2) when the
     * car crosses a tile edge: the departing tile stays alive for an extra frame-cycle before
     * the expanded keep ring also contracts past it.
     * Build (enqueue) still uses the original activeKeys — keep-radius > build-radius.
     *
     * @param {Set<string>} activeKeys — set of "X,Z" keys currently in the terrain ring
     */
    syncToChunkRing(activeKeys) {
        // Enqueue any active tile that does not have a road mesh yet (build-radius unchanged)
        for (const key of activeKeys) {
            const [cx, cz] = key.split(',').map(Number)
            this.ensureRoadTile(cx, cz)
        }

        // D5: compute the keep set = active ring expanded by roadTileKeepMargin tiles.
        // Parse min/max tile X/Z from activeKeys, then expand by the margin.
        const margin = (this._params.roadTileKeepMargin ?? 1) | 0   // integer tiles
        let minCX = Infinity, maxCX = -Infinity, minCZ = Infinity, maxCZ = -Infinity
        for (const key of activeKeys) {
            const [cx, cz] = key.split(',').map(Number)
            if (cx < minCX) minCX = cx
            if (cx > maxCX) maxCX = cx
            if (cz < minCZ) minCZ = cz
            if (cz > maxCZ) maxCZ = cz
        }
        // Build keepSet only if activeKeys is non-empty (avoid Infinity/-Infinity on empty ring)
        const keepSet = new Set()
        if (activeKeys.size > 0) {
            for (let cx = minCX - margin; cx <= maxCX + margin; cx++) {
                for (let cz = minCZ - margin; cz <= maxCZ + margin; cz++) {
                    keepSet.add(`${cx},${cz}`)
                }
            }
        }

        // Dispose road tiles whose terrain chunk has been evicted AND are outside the keep set
        for (const key of this._tileMeshMap.keys()) {
            if (!keepSet.has(key)) {
                this.disposeRoadTile(key)
            }
        }
        // Also drop pending tiles that are no longer in the keep set
        const newQueue = []
        for (const item of this._pendingQueue) {
            if (keepSet.has(item.key)) {
                newQueue.push(item)
            } else {
                this._pendingSet.delete(item.key)
            }
        }
        this._pendingQueue = newQueue

        // D1 (plan 09-19): version-mismatch rebuild pass (fixes bug #1 — stale ribbon).
        // Any built tile whose builtGeneration differs from the current road generation was
        // built against an old spline; dispose it and re-enqueue so it rebuilds against the
        // current route. Frame-spread is preserved: re-enqueue lets flushPendingQueue drain
        // at MAX_ROAD_BUILDS_PER_FRAME — never rebuilds all stale tiles in one frame.
        // Only check active tiles so we don't revive tiles that should stay evicted.
        const currentGen = this._road.roadGeneration()
        // Snapshot keys to avoid mutating the map while iterating.
        const builtKeys = [...this._tileMeshMap.keys()]
        for (const key of builtKeys) {
            const entry = this._tileMeshMap.get(key)
            if (!entry) continue
            if (activeKeys.has(key) && entry.builtGeneration !== currentGen) {
                const [cx, cz] = key.split(',').map(Number)
                this.disposeRoadTile(key)   // remove meshes + geometry; deletes from _tileMeshMap
                this.ensureRoadTile(cx, cz) // re-enqueue for rebuild against current spline
            }
        }
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
        // D-arc perf: the road network is already streamed + sliced every frame around the VIEW center
        // (main loop calls roadSystem.update BEFORE the ribbon flush). The old ensureTile() here RE-STREAMED
        // the network around each TILE center — ping-ponging the stream center, clearing _tiles, and forcing
        // both the carve and already-built ribbon tiles to rebuild (the streaming-stutter thrash). Just
        // ensure the current network is sliced (idempotent, ~0.05ms) and read this tile's slices directly.
        const _ptE = performance.now()
        this._road._sliceNetwork()
        perfAdd('ribbon.sliceNetwork', performance.now() - _ptE)
        const segs = this._road._tiles.get(key)
        if (!segs || segs.length === 0) {
            // No road on this tile — mark as processed so we don't re-queue it.
            // D1 (plan 09-19): stamp generation so a later re-route triggers a re-check.
            this._tileMeshMap.set(key, { meshes: [], geometries: [], builtGeneration: this._road.roadGeneration() })
            return
        }

        const meshes     = []
        const geometries = []

        for (const seg of segs) {
            const { spline } = seg
            if (!spline) continue

            // Design grade: derive directly from the CONTINUOUS routed centerline Y.
            // The slice spline's control points carry the routed network polyline .y, and
            // adjacent tile slices SHARE the exact boundary control point (C0) and tangent (C1)
            // by construction (D-06), so spline.getPointAt(u).y is continuous across tile seams.
            // This replaces the per-tile _smoothDesignGrade call (which disagreed at slice
            // boundaries and cache-missed on every stream — the Phase 9 seam-step + lag source).
            // ~2 m longitudinal sampling resolution (same as prior _smoothDesignGrade output).
            const arcLen = spline.getLength ? spline.getLength() : 64
            const N = Math.max(2, Math.min(256, Math.ceil(arcLen / 2) + 1))
            const points = []
            const designGradeY = new Float32Array(N)
            for (let _i = 0; _i < N; _i++) {
                const _u = _i / (N - 1)
                const _pt = spline.getPointAt(_u)
                points.push(_pt)
                designGradeY[_i] = _pt.y
            }

            if (points.length < 2) continue

            // Extract runKey for deterministic road quality per-run (D-03).
            // seg.runKey is set by road.js _sliceNetwork when it stores slice records.
            // Fall back to empty string if not present (backwards-compatible).
            const runKey = seg.runKey ?? ''

            // BUG-10: seg.arcS0/arcS1 are the RUN-global arc at this slice's u=0/u=1 ends (set by
            // road.js _assignSlice). Replaces the old arcSOffset=0 default that made camber/quality
            // tile-local and sawtooth at every seam. Fall back to 0 if not set (degraded, not crashing).
            const arcS0 = seg.arcS0 ?? 0
            const arcS1 = seg.arcS1 ?? 0

            const _ptS = performance.now()
            const geo  = this.sweepRibbon(spline, designGradeY, points, this._params, runKey, arcS0, arcS1)
            perfAdd('ribbon.sweepRibbon', performance.now() - _ptS)
            const mesh = new THREE.Mesh(geo, this._material)

            // Road mesh sits at world origin (geometry is already in world space).
            // Do NOT offset by tile center — ribbon vertices are world-space XZ from sweepRibbon.
            // renderOrder=1: Plan 09-10 — ribbon draws after terrain (renderOrder 0) so the
            // depth-biased road surface wins over terrain at the same Z range.
            mesh.renderOrder = 1
            mesh.receiveShadow = true

            this._scene.add(mesh)
            meshes.push(mesh)
            geometries.push(geo)
        }

        // ── Junction footprints for nodes assigned to this tile ────────────────
        // Detect junctions in the network and build footprint meshes for any node
        // whose position falls inside this tile's CHUNK_SIZE × CHUNK_SIZE bounds.
        // (Open Q3 from RESEARCH: assign junction to tile containing node XZ position.)
        if (this._road._detectJunctions) {
            const junctions = this._road._detectJunctions()
            const tileWorldX = tileX * CHUNK_SIZE
            const tileWorldZ = tileZ * CHUNK_SIZE
            const halfWidth = this._params.roadHalfWidth ?? 5

            for (const [, node] of junctions) {
                const nx = node.pos.x, nz = node.pos.z
                // Assign to tile if node falls inside this tile's bounds.
                if (nx >= tileWorldX && nx < tileWorldX + CHUNK_SIZE &&
                    nz >= tileWorldZ && nz < tileWorldZ + CHUNK_SIZE) {

                    const geo = this.buildJunctionFootprint(node, this._params)
                    if (geo) {
                        const mesh = new THREE.Mesh(geo, this._material)
                        mesh.renderOrder = 1  // Plan 09-10: ribbon draws after terrain
                        mesh.receiveShadow = true
                        this._scene.add(mesh)
                        meshes.push(mesh)
                        geometries.push(geo)
                    }
                }
            }
        }

        // D1 (plan 09-19): stamp the road generation this tile was built against so
        // syncToChunkRing can detect stale tiles and re-enqueue them on mismatch.
        this._tileMeshMap.set(key, { meshes, geometries, builtGeneration: this._road.roadGeneration() })
    }

    // ── Junction footprint helpers ────────────────────────────────────────────

    /**
     * Compute the signed area of a 2D polygon (shoelace formula).
     * Positive = CCW winding; negative = CW winding.
     *
     * @param {Array<{x:number,z:number}>} poly
     * @returns {number} Signed area
     */
    _polySignedArea(poly) {
        let area = 0
        const n = poly.length
        for (let i = 0; i < n; i++) {
            const a = poly[i], b = poly[(i + 1) % n]
            area += (a.x * b.z - b.x * a.z)
        }
        return area * 0.5
    }

    /**
     * Compute shoelace area of polygon. Returns absolute value.
     * @param {Array<{x:number,z:number}>} poly
     * @returns {number}
     */
    _polyArea(poly) {
        return Math.abs(this._polySignedArea(poly))
    }

    /**
     * Build the junction footprint geometry for a single junction node.
     *
     * Algorithm (D-13 / SURF-07):
     *  1. Gather legs, sort by bearing (already done in _detectJunctions).
     *  2. For simpleMerge nodes, build a rectangular footprint (2×halfWidth box).
     *  3. For normal nodes, connect adjacent leg OUTER edges with tangent fillet arcs.
     *     R_f = halfWidth * tan(θ/2), capped at 3*halfWidth.
     *     Acute crossings < 20° → straight bevel (no arc).
     *     Arc sampled at ceil(R_f * π/2) + 2 points (min 3).
     *  4. Shoelace winding check — reverse polygon if signed area < 0 (Pitfall 6).
     *  5. Triangulate: convex → triangulateConvexFan; else earClip.
     *  6. Build BufferGeometry with flat Y = node.nodeY (crown=0, camber=0 inside box — D-13).
     *     Vertex color = asphalt dark grey (same as ribbon).
     *
     * Leg trimming (Step 6): ribbon ribbons are ALREADY trimmed by RoadMeshSystem._buildRoadTile
     * because only tiles beyond the footprint boundary are swept. The trim is achieved by the
     * shared-node elevation reconciliation — ribbon sweeps stop at the tile boundary naturally.
     * (Full _segXZ-based trim would require re-sweeping per ribbon, deferred as D-13 refinement.)
     *
     * Returns null if the polygon is degenerate (< 3 usable vertices after all guards).
     *
     * @param {object} node — junction node record from _detectJunctions
     * @param {object} params — RANGER_PARAMS
     * @returns {THREE.BufferGeometry|null}
     *
     * Deterministic (D-16): pure function of node + params.
     */
    buildJunctionFootprint(node, params) {
        const halfWidth = params.roadHalfWidth ?? 5
        const nx = node.pos.x
        const nz = node.pos.z
        const nodeY = node.nodeY
        const legs  = node.legs

        // ── Footprint polygon construction ─────────────────────────────────────
        let poly   // Array<{x,z}>

        if (node.simpleMerge || legs.length < 2) {
            // Rectangular box: 2*halfWidth × 2*halfWidth, oriented to first leg.
            const d = legs.length > 0 ? legs[0].dir : { x: 1, z: 0 }
            const rx = -d.z, rz = d.x  // right perpendicular
            const hw = halfWidth
            poly = [
                { x: nx + d.x * hw + rx * hw, z: nz + d.z * hw + rz * hw },
                { x: nx - d.x * hw + rx * hw, z: nz - d.z * hw + rz * hw },
                { x: nx - d.x * hw - rx * hw, z: nz - d.z * hw - rz * hw },
                { x: nx + d.x * hw - rx * hw, z: nz + d.z * hw - rz * hw },
            ]
        } else {
            // Fillet arc footprint.
            const nLegs = legs.length
            poly = []

            for (let i = 0; i < nLegs; i++) {
                const legA = legs[i]
                const legB = legs[(i + 1) % nLegs]

                // Outer edge start/end points.
                // Outer edge of legA, on the side facing legB:
                //   P_A = node + halfWidth * perp_left(d_A)  where perp_left = (-d.z, d.x)
                const perpAx = -legA.dir.z, perpAz = legA.dir.x
                const pAx = nx + halfWidth * perpAx
                const pAz = nz + halfWidth * perpAz

                // Outer edge of legB, on the side facing legA:
                //   P_B = node + halfWidth * perp_right(d_B)  where perp_right = (d.z, -d.x)
                const perpBx = legB.dir.z, perpBz = -legB.dir.x
                const pBx = nx + halfWidth * perpBx
                const pBz = nz + halfWidth * perpBz

                // Interior angle between the two leg directions.
                // dot = d_A · d_B; angle between them
                const dot = legA.dir.x * legB.dir.x + legA.dir.z * legB.dir.z
                const dotClamped = Math.max(-1, Math.min(1, dot))
                const halfAngle = Math.acos(dotClamped) * 0.5  // θ/2
                const halfAngleDeg = halfAngle * (180 / Math.PI)

                // Arc fillet radius R_f = halfWidth * tan(θ/2), capped at 3*halfWidth.
                const tanHalf = Math.tan(halfAngle)
                let Rf = halfWidth * tanHalf
                Rf = Math.min(Rf, 3 * halfWidth)

                if (halfAngleDeg < 20 || !isFinite(Rf) || Rf < 1e-4) {
                    // Acute crossing or degenerate → straight bevel: just two edge points.
                    poly.push({ x: pAx, z: pAz })
                    poly.push({ x: pBx, z: pBz })
                } else {
                    // Tangent fillet arc: sample from pA to pB with radius Rf.
                    // Arc center is at the intersection of the inward normals from pA and pB.
                    // For the fillet connecting the outer edges: the center is offset inward
                    // from the corner bisector. We approximate the arc by sampling from
                    // bearing(pA - node) to bearing(pB - node) around the node.
                    const nSamples = Math.max(3, Math.ceil(Rf * Math.PI / 2) + 2)

                    const bearA = Math.atan2(pAx - nx, pAz - nz)
                    const bearB = Math.atan2(pBx - nx, pBz - nz)

                    // Choose the short angular arc between bearA and bearB.
                    let dBear = bearB - bearA
                    // Normalize to [-π, π]
                    while (dBear >  Math.PI) dBear -= 2 * Math.PI
                    while (dBear < -Math.PI) dBear += 2 * Math.PI

                    const rArc = Math.sqrt((pAx - nx) * (pAx - nx) + (pAz - nz) * (pAz - nz))
                    const rArcB = Math.sqrt((pBx - nx) * (pBx - nx) + (pBz - nz) * (pBz - nz))
                    const rAvg = (rArc + rArcB) * 0.5

                    for (let s = 0; s < nSamples; s++) {
                        const t = s / (nSamples - 1)
                        const bear = bearA + t * dBear
                        poly.push({ x: nx + Math.sin(bear) * rAvg, z: nz + Math.cos(bear) * rAvg })
                    }
                }
            }
        }

        if (poly.length < 3) return null

        // ── Winding check (Pitfall 6 — D-13) ───────────────────────────────────
        // Signed area > 0 = CCW (expected). Reverse if CW.
        if (this._polySignedArea(poly) < 0) {
            poly.reverse()
        }

        // ── Triangulation ───────────────────────────────────────────────────────
        // Convexity test → fan (95% case) or earClip (non-convex / acute).
        let triIndices
        let positions
        let colors

        const polyLen = poly.length

        if (isConvexPolygon(poly)) {
            // Centroid fan: returns indices where cIdx = polyLen.
            triIndices = triangulateConvexFan(poly)
            // polyLen + 1 vertices: poly[0..n-1] + centroid
            const cx = poly.reduce((s, p) => s + p.x, 0) / polyLen
            const cz = poly.reduce((s, p) => s + p.z, 0) / polyLen
            const nVerts = polyLen + 1
            positions = new Float32Array(nVerts * 3)
            colors    = new Float32Array(nVerts * 3)
            for (let i = 0; i < polyLen; i++) {
                positions[i * 3    ] = poly[i].x
                positions[i * 3 + 1] = nodeY  // FLAT — camber=0, crown=0 inside box (D-13)
                positions[i * 3 + 2] = poly[i].z
                colors[i * 3    ] = 0.15; colors[i * 3 + 1] = 0.15; colors[i * 3 + 2] = 0.17
            }
            // Centroid vertex at index polyLen
            positions[polyLen * 3    ] = cx
            positions[polyLen * 3 + 1] = nodeY
            positions[polyLen * 3 + 2] = cz
            colors[polyLen * 3    ] = 0.15; colors[polyLen * 3 + 1] = 0.15; colors[polyLen * 3 + 2] = 0.17
        } else {
            // earClip returns indices into the original polygon array.
            triIndices = earClip(poly)
            const nVerts = polyLen
            positions = new Float32Array(nVerts * 3)
            colors    = new Float32Array(nVerts * 3)
            for (let i = 0; i < polyLen; i++) {
                positions[i * 3    ] = poly[i].x
                positions[i * 3 + 1] = nodeY
                positions[i * 3 + 2] = poly[i].z
                colors[i * 3    ] = 0.15; colors[i * 3 + 1] = 0.15; colors[i * 3 + 2] = 0.17
            }
        }

        if (!triIndices || triIndices.length < 3) return null

        const indices = new Uint32Array(triIndices)

        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3))
        geo.setIndex(new THREE.BufferAttribute(indices, 1))
        geo.computeVertexNormals()

        return geo
    }
}
