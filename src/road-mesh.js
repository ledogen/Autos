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
 *  - D-01: Asphalt and markings are purely procedural (no asset files). Asphalt/dirt are
 *    vertex colors; lane MARKINGS are evaluated per-fragment in the road shader (BUG-28) —
 *    vertex-colour painting could not draw a 0.3 m stripe at ~1.1 m vertex spacing (it
 *    Gouraud-smeared white→dark into a ~2 m gradient). The marking spatial/dash test now
 *    runs in onBeforeCompile off an `aMark = vec4(uLat, arcS, q, markEnable)` attribute, so
 *    stripes are crisp + antialiased at any distance and dashes are real on/off.
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
import { addWorldVaryings } from './terrain-detail.js'  // FEAT-05: shared procedural detail
import { crownProfile, potholeNoise, signedCurvature, earClip } from './road-carve.js'
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

// ── Junction pad constants (QUAL-10/11) ──────────────────────────────────────
// PAD_FILL_MAX_EDGE: red-green subdivision target (m) for the non-planar pad fill — interior
// verts every ~3 m so the lifted surface follows the sloped pad plane + crown (QUAL-13 field).
// (The pad BOUNDARY ring — weld/fillet/legacy ladder, STRAIGHT_GAP, LEGACY_PAD_FLARE — moved to
// road.js so the collision carve and this mesh share ONE ring; see RoadSystem._buildJunctionRing.)
const PAD_FILL_MAX_EDGE = 3.0
// MARK_JUNCTION_FEATHER: metres over which lane markings fade back in past a junction cutback —
// real intersections lose the centerline gradually instead of hard-stopping (QUAL-11/QUAL-10).
const MARK_JUNCTION_FEATHER = 8

// ── Road quality lane-marking thresholds ─────────────────────────────────────
// Markings are evaluated PER-FRAGMENT in the road shader (BUG-28), not painted as
// vertex colours — vertex spacing (~1.1 m) is far wider than the stripe (0.3 m), so
// Gouraud interpolation smeared white→dark over ~2 m. The lateral half-widths below are
// passed to the shader (uMarkCenterHalf / uMarkEdgeHalf) and tested against the
// per-fragment lateral coord `uLat`; the longitudinal dash pattern is tested against the
// per-fragment run-arc `arcS`. Widths are lateral distances from the road centerline.
const MARK_CENTER_HALF = 0.15  // m half-width of centerline stripe
const MARK_EDGE_HALF   = 0.10  // m half-width of edge-line stripe (measured inward from ribbon edge)

// Longitudinal dash geometry (metres of run-arc). BUG-28: real on/off dashes, crisp by
// fragment evaluation. Centerline is a dashed lane-divider for every tier that draws it;
// the Mid-tier edge line keeps its historical intermittent pattern (8 m on / 12 m period).
const MARK_CENTER_DASH_PERIOD = 12  // m: centerline dash cycle
const MARK_CENTER_DASH_ON     = 4   // m: painted length per centerline cycle (4 on / 8 off)
const MARK_EDGE_DASH_PERIOD   = 12  // m: Mid-tier edge dash cycle
const MARK_EDGE_DASH_ON       = 8   // m: painted length per Mid-tier edge cycle (8 on / 4 off)

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
        this._initialFillDone = false   // PERF-13: burst tile builds until the first full drain

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

        // FEAT-05: procedural gravel bump on the DIRT SHOULDER only. The shoulder skirt verts
        // are warm dirt-brown (roadDirtColor) and the paved surface is neutral grey — markings
        // are now per-fragment (BUG-28), so they never tint vColor — so (vColor.r - vColor.b)
        // cleanly isolates the shoulder, keeping the paved surface flat. Shares the terrain
        // fbm + uDetailScale kill-switch.
        this._roadUniforms = {
            uDetailScale:  { value: params.terrainDetailScale ?? 1.0  },
            uNoiseScale:   { value: params.terrainNoiseScale   ?? 0.15 },
            uShoulderBump: { value: params.roadShoulderBump    ?? 0.5  },
            // BUG-28: ribbon half-width drives the per-fragment edge-line distance test.
            uRoadHalf:     { value: params.roadHalfWidth       ?? 5    },
        }
        this._material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, this._roadUniforms)
            addWorldVaryings(shader)

            // ── BUG-28: per-vertex marking coord → fragment ────────────────────
            // aMark = vec4(uLat, arcS, q, markEnable). markEnable is 0 on the dirt skirt
            // verts and on junction pads so stripes are confined to the paved top surface.
            shader.vertexShader = 'attribute vec4 aMark;\nvarying vec4 vMark;\n' + shader.vertexShader
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>\n  vMark = aMark;'
            )

            shader.fragmentShader =
                'uniform float uDetailScale, uNoiseScale, uShoulderBump, uRoadHalf;\n' +
                'varying vec4 vMark;\n' +
                // Marking spatial/dash constants baked from the JS module constants above.
                `const float RS_CENTER_HALF = ${MARK_CENTER_HALF.toFixed(4)};
                 const float RS_EDGE_HALF   = ${MARK_EDGE_HALF.toFixed(4)};
                 const float RS_C_PERIOD = ${MARK_CENTER_DASH_PERIOD.toFixed(2)};
                 const float RS_C_ON     = ${MARK_CENTER_DASH_ON.toFixed(2)};
                 const float RS_E_PERIOD = ${MARK_EDGE_DASH_PERIOD.toFixed(2)};
                 const float RS_E_ON     = ${MARK_EDGE_DASH_ON.toFixed(2)};
                 // Antialiased on/off dash along run-arc s: 1 inside [0,onLen] of each period.
                 float rsDash(float s, float period, float onLen) {
                     float ph = mod(s, period);
                     float w  = max(fwidth(s), 1e-4);
                     float rise = smoothstep(-w, w, ph);
                     float fall = 1.0 - smoothstep(onLen - w, onLen + w, ph);
                     return clamp(rise * fall, 0.0, 1.0);
                 }\n` +
                shader.fragmentShader

            // FEAT-05 shoulder gravel bump (unchanged — keys off vColor.r - vColor.b, which
            // is still clean dirt-vs-asphalt now that markings are no longer painted into vColor).
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_begin>',
                `#include <normal_fragment_begin>
                if (uDetailScale > 0.0) {
                    float td_shoulder = smoothstep(0.04, 0.10, vColor.r - vColor.b);
                    if (td_shoulder > 0.001) {
                        vec2 td_p = vWorldPos.xz * (uNoiseScale * 2.0);
                        float td_e = 0.4;
                        float td_h0 = tdFbm(td_p);
                        float td_hx = tdFbm(td_p + vec2(td_e, 0.0));
                        float td_hz = tdFbm(td_p + vec2(0.0, td_e));
                        vec3 td_wb = vec3(-(td_hx - td_h0), 0.0, -(td_hz - td_h0)) * (uShoulderBump * uDetailScale * td_shoulder);
                        normal = normalize(normal + mat3(viewMatrix) * td_wb);
                    }
                }`
            )

            // ── BUG-28: procedural lane markings, per-fragment over the asphalt base ──
            // diffuseColor.rgb is the asphalt/dirt vertex colour after <color_fragment>.
            // We composite crisp, antialiased grey stripes on top. Tier brightness/dash
            // gating mirrors roadQuality() exactly (move only the SPATIAL test to the GPU):
            //   High (q>=0.66): solid edge lines + dashed centerline, full white (0.9)
            //   Mid  (0.33–0.66): dashed edge (8/12) + dashed centerline, faded (0.65)
            //   Low  (q<0.33): faint dashed centerline only (0.3), no edge lines
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `#include <color_fragment>
                if (vMark.w > 0.003) {
                    // vMark.w is a 0..1 FEATHER, not a binary gate (QUAL-11): 1 on open road,
                    // ramping to 0 over MARK_JUNCTION_FEATHER m into a junction mouth (and 0 on
                    // skirts/pads) — markings fade into the junction instead of hard-stopping.
                    float mFeather = clamp(vMark.w, 0.0, 1.0);
                    float uLat = vMark.x;
                    float arcS = vMark.y;
                    float q    = vMark.z;
                    float aaL  = max(fwidth(uLat), 1e-4);
                    // Lateral masks (crisp constant-width stripes — the core BUG-28 fix).
                    float centerSpatial = 1.0 - smoothstep(RS_CENTER_HALF - aaL, RS_CENTER_HALF + aaL, abs(uLat));
                    float distEdge      = uRoadHalf - abs(uLat);
                    float edgeSpatial   = 1.0 - smoothstep(RS_EDGE_HALF - aaL, RS_EDGE_HALF + aaL, distEdge);
                    // Tier brightness + dash gating (matches roadQuality tiers).
                    float centerB = q >= 0.66 ? 0.9 : (q >= 0.33 ? 0.65 : 0.3);
                    float edgeB   = q >= 0.66 ? 0.9 : 0.65;
                    float edgeGate = q >= 0.66 ? 1.0 : (q >= 0.33 ? rsDash(arcS, RS_E_PERIOD, RS_E_ON) : 0.0);
                    float centerDash = rsDash(arcS, RS_C_PERIOD, RS_C_ON);
                    float centerAlpha = centerSpatial * centerDash * mFeather;
                    float edgeAlpha   = edgeSpatial   * edgeGate   * mFeather;
                    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(centerB), centerAlpha);
                    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(edgeB),   edgeAlpha);
                }`
            )
        }
        this._material.customProgramCacheKey = () => 'bug28-road-markings'
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
        // BUG-28: per-vertex marking coord vec4(uLat, arcS, q, markEnable). The fragment
        // shader evaluates the stripe/dash mask from this — crisp at any vertex spacing.
        const marks     = new Float32Array(nVerts * 4)

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

        // QUAL-11: markings FEATHER into junction mouths. The trim (_buildRoadTile) already removed
        // sections within `cutback` of a junction endpoint arc; surviving sections ramp markEnable
        // (vMark.w, now a 0..1 stripe-alpha multiplier) from 0 at the cut to 1 over
        // MARK_JUNCTION_FEATHER m, so the centerline fades out approaching the pad instead of
        // hard-stopping at the seam.
        const jArcs = this._road._junctionCarveArcs ? this._road._junctionCarveArcs.get(runKey) : null
        const jCutback = jArcs && jArcs.length && this._road.junctionCutbackDist ? this._road.junctionCutbackDist() : 0
        const markFeather = (aS) => {
            if (!jArcs || jArcs.length === 0) return 1
            let f = 1
            for (const j of jArcs) {
                const d = (Math.abs(aS - j.arc) - jCutback) / MARK_JUNCTION_FEATHER
                if (d < f) f = d
            }
            return f < 0 ? 0 : (f > 1 ? 1 : f)
        }

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
            // BUG-28: q (road quality) is carried per-vertex in the aMark attribute; the
            // marking tier (brightness / edge presence / dash) is decided per-FRAGMENT in
            // the shader, not here. q is still needed for pothole severity (potholeNoise).
            const q = roadQuality(arcS, runKey, this._worldSeed)

            // D2 (plan 09-21): camber from the shared slew-limited camberProfile — replaces
            // the per-vertex instantaneous _splineCurvatureSigned camber (bug #4 fix).
            // One profile per canonical run, cached + generation-invalidated (D1).
            // BUG-10: keyed on run-global arcS + camberSign so banking is continuous across tile
            // seams and correctly oriented on E→W (reversed) slices.
            const camberAngle = camberSign * this._road.camberProfile(arcS, runKey)

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

                // ── Vertex color: asphalt base only (BUG-28) ───────────────────
                // Markings are no longer painted here — they are evaluated per-fragment
                // from the aMark attribute below. The asphalt base stays a clean neutral
                // grey so FEAT-05's shoulder isolation (vColor.r - vColor.b) is unaffected.
                colors[idx    ] = RC
                colors[idx + 1] = GC
                colors[idx + 2] = BC

                // ── Marking coord (BUG-28): vec4(uLat, arcS, q, markEnable) ───
                // Top-surface verts are markable; the shader masks the stripe spatially.
                // markEnable = junction feather (QUAL-11): 1 on open road, →0 at a pad mouth.
                const midx = (i * vertsPerSection + j) * 4
                marks[midx    ] = uLat
                marks[midx + 1] = arcS
                marks[midx + 2] = q
                marks[midx + 3] = markFeather(arcS)

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
            // BUG-28: markEnable=0 — the dirt skirt is the vertical shoulder wall; no stripes.
            marks[(i * vertsPerSection + (CROSS_SEGS + 1)) * 4 + 3] = 0

            const rightSkirtBase = (i * vertsPerSection + (CROSS_SEGS + 2)) * 3
            positions[rightSkirtBase    ] = rightEdgeVx
            positions[rightSkirtBase + 1] = rightEdgeVy - skirtDepth
            positions[rightSkirtBase + 2] = rightEdgeVz
            colors[rightSkirtBase    ] = dirtR
            colors[rightSkirtBase + 1] = dirtG
            colors[rightSkirtBase + 2] = dirtB
            marks[(i * vertsPerSection + (CROSS_SEGS + 2)) * 4 + 3] = 0
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

                // BUG-28: base asphalt only; markings are per-fragment from aMark.
                colors[bndBase    ] = RC
                colors[bndBase + 1] = GC
                colors[bndBase + 2] = BC

                const bndMidx = (bndIdx * vertsPerSection + j) * 4
                marks[bndMidx    ] = uLat
                marks[bndMidx + 1] = bndArcS
                marks[bndMidx + 2] = bndQ
                marks[bndMidx + 3] = markFeather(bndArcS)   // QUAL-11: junction feather
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
            marks[(bndIdx * vertsPerSection + (CROSS_SEGS + 1)) * 4 + 3] = 0  // BUG-28: skirt, no stripes
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
            marks[(bndIdx * vertsPerSection + (CROSS_SEGS + 2)) * 4 + 3] = 0  // BUG-28: skirt, no stripes
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
        geo.setAttribute('aMark',    new THREE.BufferAttribute(marks,     4))  // BUG-28: per-fragment markings
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
     * Show/hide every road mesh currently in the scene. The FEAT-31 testing lab tears the
     * generated world down to a bare plane; before this existed only the TERRAIN chunks were
     * hidden, so the ribbons and junction pads stayed floating at their real elevations and the
     * flat world read as "parked underneath the real one". Visibility only — nothing is disposed,
     * so returning to the world is instant.
     */
    setVisible(visible) {
        this._meshesVisible = visible
        for (const entry of this._tileMeshMap.values())
            for (const mesh of entry.meshes) mesh.visible = visible
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
        // PERF-13: initial-fill burst — until the queue first drains empty (the spawn ring's tiles
        // have all been built once), build up to 8 tiles/frame; pre-drivable hitches are free.
        // After that the steady MAX_ROAD_BUILDS_PER_FRAME=1 cap owns the frame.
        const cap = this._initialFillDone ? MAX_ROAD_BUILDS_PER_FRAME : 8
        let built = 0
        while (this._pendingQueue.length > 0 && built < cap) {
            const { tileX, tileZ, key } = this._pendingQueue.shift()
            this._pendingSet.delete(key)
            this._buildRoadTile(tileX, tileZ, key)
            built++
        }
        if (!this._initialFillDone && built > 0 && this._pendingQueue.length === 0) this._initialFillDone = true
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
        this._initialFillDone = false   // PERF-13: a full clear precedes a regen — burst the refill
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
        // QUAL-10: build the node-junction set (+ per-run cutback arcs) before sweeping so the ribbon
        // trim below sees this run's junction endpoints. Cached by network revision (cheap re-call).
        if (this._road._detectNodeJunctions) this._road._detectNodeJunctions()
        perfAdd('ribbon.sliceNetwork', performance.now() - _ptE)
        const segs = this._road._tiles.get(key)

        const meshes     = []
        const geometries = []

        // NB: do NOT early-return when segs is empty. A junction NODE's tile can legitimately have zero
        // ribbon slices — the ribbons are trimmed back (roadJunctionCutback) from the node, so when the
        // node sits near a tile corner (e.g. seed-6 node 253,-131 is ~3 m from both edges of tile 3,-3),
        // every trimmed leg stub falls in the NEIGHBOUR tiles and this tile gets no slice. The old
        // early-return then skipped the junction-pad loop below → the pad was never built (bare-terrain
        // hole where three roads meet). Falling through builds the pad; an empty ribbon loop is a no-op.
        for (const seg of (segs || [])) {
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

            // ── QUAL-10: cut the ribbon back near junction nodes so the radiused pad has room ──────
            // Node junctions sit at run ENDPOINTS, so trimming just shortens the slice end that touches
            // the node (contiguous — no mid-run split). Drop samples whose run-global arc is within
            // `cutback` of a junction endpoint arc for this run; buildJunctionFootprint fills the cleared
            // disc at the same cutback. Skip the slice entirely if nothing survives (short run node↔node).
            let usePoints = points, useGrade = designGradeY, useArcS0 = arcS0, useArcS1 = arcS1
            const jArcs = this._road._junctionCarveArcs ? this._road._junctionCarveArcs.get(runKey) : null
            if (jArcs && jArcs.length) {
                const cutback = this._road.junctionCutbackDist()
                const Np = points.length
                const cum = new Float32Array(Np)
                for (let _i = 1; _i < Np; _i++) cum[_i] = cum[_i - 1] + Math.hypot(points[_i].x - points[_i - 1].x, points[_i].z - points[_i - 1].z)
                const tot = cum[Np - 1] || 1
                let k0 = -1, k1 = -1
                for (let _i = 0; _i < Np; _i++) {
                    const aS = arcS0 + (arcS1 - arcS0) * (cum[_i] / tot)
                    let trimmed = false
                    for (const j of jArcs) { if (Math.abs(aS - j.arc) < cutback) { trimmed = true; break } }
                    if (!trimmed) { if (k0 < 0) k0 = _i; k1 = _i }
                }
                if (k0 < 0 || k1 - k0 < 1) continue   // fully trimmed → the pad(s) cover this stub
                if (k0 > 0 || k1 < Np - 1) {
                    useArcS0  = arcS0 + (arcS1 - arcS0) * (cum[k0] / tot)
                    useArcS1  = arcS0 + (arcS1 - arcS0) * (cum[k1] / tot)
                    usePoints = points.slice(k0, k1 + 1)
                    useGrade  = designGradeY.slice(k0, k1 + 1)
                }
            }

            const _ptS = performance.now()
            const geo  = this.sweepRibbon(spline, useGrade, usePoints, this._params, runKey, useArcS0, useArcS1)
            perfAdd('ribbon.sweepRibbon', performance.now() - _ptS)
            const mesh = new THREE.Mesh(geo, this._material)

            // Road mesh sits at world origin (geometry is already in world space).
            // Do NOT offset by tile center — ribbon vertices are world-space XZ from sweepRibbon.
            // renderOrder=1: Plan 09-10 — ribbon draws after terrain (renderOrder 0) so the
            // depth-biased road surface wins over terrain at the same Z range.
            mesh.renderOrder = 1
            mesh.receiveShadow = true
            if (this._meshesVisible === false) mesh.visible = false   // built while the lab is up

            this._scene.add(mesh)
            meshes.push(mesh)
            geometries.push(geo)
        }

        // ── Junction footprints for nodes assigned to this tile ────────────────
        // Detect junctions in the network and build footprint meshes for any node
        // whose position falls inside this tile's CHUNK_SIZE × CHUNK_SIZE bounds.
        // (Open Q3 from RESEARCH: assign junction to tile containing node XZ position.)
        //
        // FEAT-07 Step 2: render the at-grade junction pad. _detectJunctions() is now the BOUNDED,
        // once-per-build, identity-cached crossing classifier (no longer the O(runs²×seg²) per-tile
        // rescan that cost the 296 ms Ultra stall — _streamNetwork warms it, so this is a cache hit).
        // Only AT_GRADE nodes get a pad. QUAL-10: the pad is a GRADED apron (buildJunctionFootprint samples
        // sampleRoadTopY per vertex), so it rides the same FEAT-19-graded ribbon surface it overlaps
        // (mesh == collision surface). NEAR_PARALLEL nodes are glancing grazes — they get no pad.
        if (this._params.roadJunctionFootprints) {
            const tileWorldX = tileX * CHUNK_SIZE
            const tileWorldZ = tileZ * CHUNK_SIZE
            const buildPad = (node) => {
                if (node.kind !== 'AT_GRADE') return   // only flat junctions; a near-parallel graze gets no pad
                const nx = node.pos.x, nz = node.pos.z
                // Assign to tile if node falls inside this tile's bounds.
                if (nx >= tileWorldX && nx < tileWorldX + CHUNK_SIZE &&
                    nz >= tileWorldZ && nz < tileWorldZ + CHUNK_SIZE) {
                    const geo = this.buildJunctionFootprint(node, this._params)
                    if (geo) {
                        const mesh = new THREE.Mesh(geo, this._getJunctionMaterial())
                        mesh.renderOrder = 1  // Plan 09-10: ribbon draws after terrain
                        mesh.receiveShadow = true
                        if (this._meshesVisible === false) mesh.visible = false
                        this._scene.add(mesh)
                        meshes.push(mesh)
                        geometries.push(geo)
                    }
                }
            }
            // QUAL-10: NODE junctions are the real graph T/X/Y intersections (≥3 runs meeting at a shared
            // anchor). _detectJunctions only finds mid-span CROSSINGS, which graph mode culls — so without
            // this the shipped network gets no pads at all. Build both (they never coincide: node = run
            // endpoint, crossing = run interior); in graph mode _detectJunctions is empty.
            if (this._road._detectNodeJunctions) for (const [, node] of this._road._detectNodeJunctions()) buildPad(node)
            if (this._road._detectJunctions)     for (const [, node] of this._road._detectJunctions())     buildPad(node)
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
     * Junction pad material — a clone of the shared road material with a STRONGER polygonOffset than
     * the ribbon (which sits at roadPolygonOffset -1/-1). QUAL-10: the graded apron overlaps the ribbon
     * ends COPLANARLY (both sample the same asphalt-top surface); a more-negative offset lets the apron
     * win the depth test and replace the ribbon end seamlessly — no z-fight, no geometric lift/lip.
     */
    _getJunctionMaterial() {
        if (!this._junctionMaterial) {
            const m = this._material.clone()
            m.polygonOffsetFactor = this._params.roadJunctionPolyOffsetFactor ?? -4
            m.polygonOffsetUnits  = this._params.roadJunctionPolyOffsetUnits  ?? -4
            this._junctionMaterial = m
        }
        return this._junctionMaterial
    }

    /**
     * Build the junction pad geometry for a single junction node (QUAL-11 pad v2).
     *
     * The ribbons are cut back `cutback` from the node (RoadMeshSystem._buildRoadTile); this pad
     * fills the cleared area. QUAL-11: the boundary is built from the legs' REAL trimmed-end
     * cross-sections — each mouth is the run's own frame (runPointAt centre + runProfile tangent,
     * the SAME frame sweepRibbon sections use) a hair past the ribbon cut, so the pad edge
     * COINCIDES with the swept ribbon's end cross-section (exact weld — no flare hiding a seam).
     * Adjacent legs' facing ribbon-edge lines are joined by a tangent ARC (true fillet — concave
     * between legs, the pad hugs the roads); ill-conditioned corners get a tangent-matched cubic
     * Hermite; a through road's wide back side connects straight (no phantom bulge).
     *
     * Simplicity ladder (the first QUAL-10 exact-weld attempt self-intersected 19/24 boundaries —
     * so guarantee constructively, then VERIFY): the assembled ring gets an explicit XZ
     * self-intersection check; on failure the fillets shrink ×0.5 and retry once; on second
     * failure the node falls back to the QUAL-10 circle pad (_junctionRingLegacy) — failure is
     * graceful, never a spike, never a hole.
     *
     * Fill is NON-PLANAR: earClip triangulates the ring in XZ, interior detail comes from
     * red-green midpoint subdivision (_buildPadGeometry), and every vertex rides
     * this._road.sampleRoadTopY — the QUAL-13 sloped-pad/blended height field IS the pad surface
     * (mesh == collision by construction; the boundary/fill here is GEOMETRY only).
     *
     * Handles n = 2 legs too (QUAL-16 deg-2 kink mini-junctions): the generic corner walk yields
     * mouth → inside fillet → mouth → outside Hermite/fillet with no special casing.
     *
     * @param {object} node — junction node record ({pos,nodeY,plane,legs,kind}) from _detectNodeJunctions
     * @param {object} params — RANGER_PARAMS
     * @returns {THREE.BufferGeometry|null}
     *
     * Deterministic (D-16): pure function of node + params + streamed network.
     */
    buildJunctionFootprint(node, params) {
        if (!node.legs || node.legs.length < 2) return null

        const apronLift = params.roadJunctionApronLift ?? 0.0
        const nodeY = node.nodeY
        // QUAL-13: beyond the road footprint the fallback rides the node's sloped pad PLANE (when
        // present) instead of the flat nodeY, so an apron corner on the uphill side doesn't sink
        // below the tilted plaza the approaches blend onto.
        const fallbackY = (x, z) => node.plane
            ? node.plane.y0 + node.plane.gx * (x - node.plane.cx) + node.plane.gz * (z - node.plane.cz)
            : nodeY
        // Per-vertex asphalt-TOP Y — the graded surface the ribbon mesh + collision carve ride
        // (sampleRoadTopY = FEAT-19 grade + crown/camber), plane fallback beyond the road footprint.
        // Kept identical to the collision surface (mesh == collision).
        const sampleY = (x, z) => {
            const y = this._road.sampleRoadTopY ? this._road.sampleRoadTopY(x, z) : null
            return (y != null && isFinite(y) ? y : fallbackY(x, z)) + apronLift
        }

        // ── Boundary: the welded pad ring is now built + cached in road.js (_buildJunctionRing, by
        // _networkRev) so it is the SINGLE source shared by the collision carve (_junctionPadCarve) and
        // this mesh — mesh == collision by construction. The fallback ladder (exact weld → shrunk fillets
        // → legacy circle pad) + _ringSelfIntersects gate all live there now.
        const ring = node.ring
        if (!ring || ring.length < 3) return null

        return this._buildPadGeometry(ring, sampleY)
    }

    /**
     * Triangulate + lift a pad boundary ring (QUAL-11 non-planar fill). Topology is solved in
     * XZ: earClip the (verified-simple) ring, force up-facing winding, then red-green midpoint
     * subdivision — any edge longer than PAD_FILL_MAX_EDGE splits, and the split decision is
     * PER-EDGE so neighbouring triangles always agree (crack-free) — giving the interior detail
     * the lifted surface needs to follow the sloped pad plane + crown smoothly. Every vertex Y
     * comes from sampleY (the asphalt-top surface → mesh == collision by construction). Vertex
     * colours = ribbon asphalt base; aMark all-zero → no stripes on the pad (BUG-28 contract).
     *
     * @param {Array<{x:number,z:number}>} ring — simple XZ boundary (open)
     * @param {(x:number,z:number)=>number} sampleY
     * @returns {THREE.BufferGeometry|null}
     */
    _buildPadGeometry(ring, sampleY) {
        const tri0 = earClip(ring)
        if (!tri0 || tri0.length < 3) return null
        let tris = Array.from(tri0)
        // Force UP-facing winding PER TRIANGLE. A single global sum-of-areas flip assumes earClip emits
        // uniformly-wound triangles, but on a strongly NON-CONVEX ring (the open-side back-arc bulb + the
        // narrow inter-leg crotches of this one-sided trident) earClip returns MIXED winding — here 56 of
        // 609 tris came out reversed. The global flip then aligns only the majority, leaving those 56
        // BACK-facing; with the FrontSide pad material they're CULLED, so the terrain/dirt behind the pad
        // shows THROUGH the holes (the tan wedges) with a dark backing (the "black gash"). Normalising each
        // triangle independently (UP-facing = CW in XZ, i.e. signed area < 0) makes the whole pad
        // watertight regardless of earClip's per-tri winding; the red-green split below preserves it.
        for (let t = 0; t < tris.length; t += 3) {
            const a = ring[tris[t]], b = ring[tris[t + 1]], c = ring[tris[t + 2]]
            const areaXZ = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)
            if (areaXZ > 0) { const tmp = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = tmp }
        }

        // Red-green refinement: split every edge > PAD_FILL_MAX_EDGE at its midpoint (midpoints
        // deduped per-edge → no T-junction cracks); 1/2/3-split triangle patterns keep winding.
        const verts = ring.map(p => ({ x: p.x, z: p.z }))
        const MAX_E2 = PAD_FILL_MAX_EDGE * PAD_FILL_MAX_EDGE
        for (let pass = 0; pass < 3; pass++) {
            const mid = new Map()
            let split = false
            const needs = (i, j) => {
                const dx = verts[i].x - verts[j].x, dz = verts[i].z - verts[j].z
                return dx * dx + dz * dz > MAX_E2
            }
            const midIdx = (i, j) => {
                const k = i < j ? `${i},${j}` : `${j},${i}`
                let v = mid.get(k)
                if (v === undefined) {
                    v = verts.length
                    verts.push({ x: (verts[i].x + verts[j].x) * 0.5, z: (verts[i].z + verts[j].z) * 0.5 })
                    mid.set(k, v)
                    split = true
                }
                return v
            }
            const out = []
            for (let t = 0; t < tris.length; t += 3) {
                let a = tris[t], b = tris[t + 1], c = tris[t + 2]
                let sab = needs(a, b), sbc = needs(b, c), sca = needs(c, a)
                const cnt = (sab ? 1 : 0) + (sbc ? 1 : 0) + (sca ? 1 : 0)
                if (cnt === 0) { out.push(a, b, c); continue }
                // Rotate (cyclic — winding preserved) until edge ab is a split edge.
                while (!sab) { const ta = a; a = b; b = c; c = ta; const s = sab; sab = sbc; sbc = sca; sca = s }
                if (cnt === 3) {
                    const mab = midIdx(a, b), mbc = midIdx(b, c), mca = midIdx(c, a)
                    out.push(a, mab, mca, mab, b, mbc, mca, mbc, c, mab, mbc, mca)
                } else if (cnt === 2) {
                    // Rotate so the two split edges are ab and bc.
                    if (sca) { const tc = c; c = b; b = a; a = tc; sbc = true; sca = false }
                    const mab = midIdx(a, b), mbc = midIdx(b, c)
                    out.push(mab, b, mbc, a, mab, mbc, a, mbc, c)
                } else {
                    const mab = midIdx(a, b)
                    out.push(a, mab, c, mab, b, c)
                }
            }
            tris = out
            if (!split) break
        }

        const V = verts.length
        const positions = new Float32Array(V * 3)
        const colors    = new Float32Array(V * 3)
        for (let v = 0; v < V; v++) {
            positions[v * 3    ] = verts[v].x
            positions[v * 3 + 1] = sampleY(verts[v].x, verts[v].z)
            positions[v * 3 + 2] = verts[v].z
            colors[v * 3] = 0.15; colors[v * 3 + 1] = 0.15; colors[v * 3 + 2] = 0.17
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3))
        // BUG-28: pads share the road shader (reads aMark). All-zero aMark (feather 0) → no stripes.
        geo.setAttribute('aMark',    new THREE.BufferAttribute(new Float32Array(V * 4), 4))
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(tris), 1))
        geo.computeVertexNormals()

        return geo
    }
}
