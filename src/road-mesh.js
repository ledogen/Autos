/**
 * src/road-mesh.js — RoadMeshSystem: everything of the road that is DRAWN.
 *
 * Per 64 m tile (keyed "X,Z", same as a terrain chunk, and streamed with it): one ribbon per road
 * slice through the tile, the junction pad of any node inside it, and the tunnel tube + portal
 * rings of any bore crossing it. Each geometry is also handed to RoadPhysics as a trimesh
 * collider (setPhysicsHook) — MESH == PHYSICS.
 *
 * The ribbon does not own a surface. Height, tangent and camber come from the run profile
 * (road.runProfile / camberProfile), pad heights from the node's surface field — the same
 * functions the terrain carve and the wheels read, which is what keeps the three in agreement.
 *
 * Decisions that still bind:
 *  - D-01: no asset files. Asphalt and dirt are vertex colours; lane MARKINGS are evaluated
 *    per fragment (BUG-28) from an `aMark = vec4(uLat, arcS, q, markEnable)` attribute — a 0.3 m
 *    stripe cannot be painted at ~1.1 m vertex spacing (it smeared into a ~2 m gradient).
 *  - D-02/D-03: roadQuality(arcS, runKey) is one value per arc position, in 500 m stretches. It
 *    drives the marking tier here and pothole severity in road-carve.js.
 *  - D-04: crown + camber are REAL geometry (vertex Y), so computeVertexNormals() returns the
 *    banked normal that physics agrees with.
 *  - T-09-04: zero-length tangent guard (NaN prevention).
 *  - Materials are shared per system, never disposed per tile (dispose() releases them).
 *  - MAX_ROAD_BUILDS_PER_FRAME = 1 after the initial fill, so a tile build never stacks on a
 *    terrain chunk build in the same frame.
 */

import * as THREE from 'three'
import { CHUNK_SIZE } from './terrain.js'
import { addWorldVaryings, tdBumpGLSL } from './terrain-detail.js'  // FEAT-05: shared procedural detail
import { makeMasonryTextures } from './stone-texture.js' // FEAT-40: portal-ring masonry
import { crownProfile, potholeNoise, earClip, padFillDelaunay } from './road-carve.js'
// roadQuality lives in road-quality.js (Plan 09-06) to break the terrain.js → road-mesh.js →
// terrain.js circular import that SURF-06 would otherwise create.
import { roadQuality } from './road-quality.js'
import { perfAdd, perfEvent } from './perf.js'  // ?hitch / ?prof timing buckets (no-op otherwise)
import { streamScore } from './stream-priority.js'   // PERF-33: near-then-ahead queue ordering

// ── Ribbon mesh constants ─────────────────────────────────────────────────────
// CROSS_SEGS: number of lateral segments across the road width.
// 8 gives 1.25 m lateral resolution on a 10 m road — sufficient for crown/camber.
const CROSS_SEGS = 8

// Build cap: one road tile per frame alongside terrain's MAX_BUILDS_PER_FRAME.
const MAX_ROAD_BUILDS_PER_FRAME = 1

// ── Junction pad constants (QUAL-10/11) ──────────────────────────────────────
// PAD_FILL_SPACING: BUG-82 pad fill point spacing (m) — outline steps + hex-lattice interior, Delaunay-
// connected. PAD_FILL_MAX_EDGE: red-green subdivision target (m) for the earClip FALLBACK fill.
// (The pad BOUNDARY ring — weld → hull ladder, STRAIGHT_GAP — moved to
// road.js so the collision carve and this mesh share ONE ring; see RoadSystem._buildJunctionRing.)
const PAD_FILL_SPACING = 1.5
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
     * @param {object}          roadSystem — RoadSystem instance (provides _tiles, runProfile)
     * @param {Function}        terrainRef — (wx,wz)=>number  RAW (carve-free) terrain height sampler
     *                                        (CR-04; BUG-74 reads it for the skirt's cut fade)
     * @param {object}          params     — RANGER_PARAMS (roadWidth, roadHalfWidth, crownHeight, camberMaxAngleDeg, ...)
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
        this._physicsHook = null   // FEAT-48: RoadPhysics (engine trimesh colliders) — syncTile/disposeTile/clear

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
            // QUAL-32: asphalt keeps a faint sheen, the dirt shoulder none (terrain is matte too).
            specular: new THREE.Color(params.roadSpecular ?? 0x0a0a0a),
            shininess: params.roadShininess ?? 20,
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
                        ${tdBumpGLSL('vWorldPos.xz * (uNoiseScale * 2.0)', '0.4', 'uShoulderBump * uDetailScale * td_shoulder')}
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
     * Sweep one slice's ribbon: a crowned, cambered strip of CROSS_SEGS quads per section plus a
     * dirt skirt down each edge (SURF-02, D-01..D-03).
     *
     * Every section is framed by the RUN, not by the slice: its run-global arc `arcS` picks the
     * centreline height, tangent and camber out of road.runProfile / camberProfile, so two slices
     * that share a seam resolve the same arc and produce the same cross-section — the edges weld by
     * construction (BUG-12). The first and last sections sit at exactly arcS0 and arcS1. Each section's
     * top verts come from _ribbonSection (the vertex-Y formula lives there).
     *
     * Lane markings are NOT painted here. Each top vertex carries aMark = (uLat, arcS, q, feather)
     * and the fragment shader draws the stripes from it (BUG-28); the feather fades them out into
     * a junction mouth (QUAL-11).
     *
     * @param {THREE.Vector3[]} points   — the slice's centreline samples (~2 m apart); only XZ is read
     * @param {object}          params   — RANGER_PARAMS
     * @param {string}          [runKey] — the run this slice belongs to
     * @param {number}          [arcS0]  — run-global arc at the first point (BUG-10)
     * @param {number}          [arcS1]  — run-global arc at the last point (< arcS0 on a reversed slice)
     * @returns {THREE.BufferGeometry} positions, normals, colours and aMark.
     *
     * Pure function of its inputs and the road network — deterministic (D-16).
     */
    sweepRibbon(points, params, runKey = '', arcS0 = 0, arcS1 = 0) {
        // BUG-10: arcS0/arcS1 are the RUN-global arc at this slice's u=0/u=1 ends. arcS(u) =
        // arcS0 + (arcS1−arcS0)·u is the continuous run arc (no per-tile sawtooth); camberSign maps
        // the run-frame signed camber into this slice's sweep frame (slice may run E→W → arcS1<arcS0).
        const camberSign = arcS1 >= arcS0 ? 1 : -1
        const N_LONG = points.length     // number of longitudinal sections (~2 m resolution)
        const roadWidth      = params.roadWidth        ?? 10
        const skirtDepth     = params.roadSkirtDepth   ?? 0.4

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
                // junction-flow stage 3: a deg-2 node that got a CONNECTOR is a road bending through,
                // not an intersection — the connector strip carries the centreline across the kink with
                // this ribbon's own dash phase (road.js markPhase), so feathering here would punch a
                // 20 m marking hole into a continuous road. Real (≥3-leg, padded) junctions still feather.
                if (j.node && j.node.deg2) continue
                const d = (Math.abs(aS - j.arc) - (j.mouth ?? j.cutback ?? jCutback)) / MARK_JUNCTION_FEATHER
                if (d < f) f = d
            }
            return f < 0 ? 0 : (f > 1 ? 1 : f)
        }

        const sec = this._sectionScratch || (this._sectionScratch = new Float64Array((CROSS_SEGS + 1) * 3))
        for (let i = 0; i < N_LONG; i++) {
            // arcS: RUN-global arc-length (BUG-10), keyed by cumulative XZ (09-32) so gradeY/camber/
            // quality track the vertex's true XZ position, not the spline's 3D-arc parameter.
            // The last section is pinned to arcS1 itself: the interpolation lands within an ulp of it,
            // and the neighbouring slice starts at exactly that arc — the seam must be the same number.
            const arcS = i > 0 && i === N_LONG - 1 ? arcS1 : arcS0 + (arcS1 - arcS0) * (cumXZ[i] / totXZ)
            const q = this._ribbonSection(points[i].x, points[i].z, arcS, runKey, camberSign, params, sec)
            const feather = markFeather(arcS)   // QUAL-11: 1 on open road, →0 at a pad mouth

            for (let j = 0; j <= CROSS_SEGS; j++) {
                const idx = (i * vertsPerSection + j) * 3
                positions[idx    ] = sec[j * 3]
                positions[idx + 1] = sec[j * 3 + 1]
                positions[idx + 2] = sec[j * 3 + 2]

                // ── Vertex color: asphalt base only (BUG-28) ───────────────────
                // Markings are no longer painted here — they are evaluated per-fragment
                // from the aMark attribute below. The asphalt base stays a clean neutral
                // grey so FEAT-05's shoulder isolation (vColor.r - vColor.b) is unaffected.
                colors[idx    ] = RC
                colors[idx + 1] = GC
                colors[idx + 2] = BC

                // ── Marking coord (BUG-28): vec4(uLat, arcS, q, markEnable) ───
                // Top-surface verts are markable; the shader masks the stripe spatially.
                const midx = (i * vertsPerSection + j) * 4
                marks[midx    ] = (j / CROSS_SEGS - 0.5) * roadWidth
                marks[midx + 1] = arcS
                marks[midx + 2] = q
                marks[midx + 3] = feather
            }
            const L = 0, R = CROSS_SEGS * 3
            const leftEdgeVx  = sec[L], leftEdgeVy  = sec[L + 1], leftEdgeVz  = sec[L + 2]
            const rightEdgeVx = sec[R], rightEdgeVy = sec[R + 1], rightEdgeVz = sec[R + 2]

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
            this._skirtColor(leftEdgeVx, leftEdgeVy, leftEdgeVz, params, colors, leftSkirtBase)
            // BUG-28: markEnable=0 — the dirt skirt is the vertical shoulder wall; no stripes.
            marks[(i * vertsPerSection + (CROSS_SEGS + 1)) * 4 + 3] = 0

            const rightSkirtBase = (i * vertsPerSection + (CROSS_SEGS + 2)) * 3
            positions[rightSkirtBase    ] = rightEdgeVx
            positions[rightSkirtBase + 1] = rightEdgeVy - skirtDepth
            positions[rightSkirtBase + 2] = rightEdgeVz
            this._skirtColor(rightEdgeVx, rightEdgeVy, rightEdgeVz, params, colors, rightSkirtBase)
            marks[(i * vertsPerSection + (CROSS_SEGS + 2)) * 4 + 3] = 0
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
     * The ribbon's top cross-section at run arc `arcS`, centred on (posX, posZ): CROSS_SEGS+1 verts,
     * left → right in the sweep frame, written as x,y,z into `out`. Returns the road quality q there.
     * ONE formula: sweepRibbon draws every section with it, and a junction pad copies its mouth section
     * onto its mouth verts (the ribbon-pad weld), so the shared edge is the same numbers on both sides.
     *
     * P3 (BUG-12): the frame is the continuous run tangent runProfile(arcS).tx/tz — both sides of a slice
     * seam resolve the same arcS and get the SAME frame, so the edge vertices coincide. camberSign = −1
     * on a slice swept against the run (arcS1 < arcS0) flips the tangent into the sweep direction, so
     * winding is not inverted and camber keeps its orientation. Camber from the shared slew-limited
     * camberProfile (D2, plan 09-21), tilt = uLat · sin(camber), small-angle valid to ≤ 6°.
     *
     * Vertex Y (the formula the carve folds into its gradeY table — SURF-03, height agreement):
     *   vy = runProfile(arcS).gradeY + crownProfile(uLat) + uLat * sin(camber) + potholeNoise
     * SURF-06 potholes only on the pavement (|uLat| < halfWidth), keyed by world (vx, vz) like the carve.
     */
    _ribbonSection(posX, posZ, arcS, runKey, camberSign, params, out) {
        const halfWidth = params.roadHalfWidth ?? 5
        const roadWidth = params.roadWidth     ?? 10
        const crownH    = params.crownHeight   ?? 0.05
        const rp = this._road.runProfile(arcS, runKey, this._rpScratch ??= { gradeY: 0, tx: 1, tz: 0 })
        const tx = camberSign * rp.tx, tz = camberSign * rp.tz, tLen = Math.sqrt(tx * tx + tz * tz)
        // Perpendicular right vector in XZ; degenerate tangent (T-09-04) falls back to unit X.
        const rightX = tLen > 1e-8 ? tz / tLen : 1
        const rightZ = tLen > 1e-8 ? -tx / tLen : 0
        // BUG-28: q rides per-vertex in aMark (the shader decides the marking tier); here it only
        // scales potholes.
        const q = roadQuality(arcS, runKey, this._worldSeed)
        const sinCamber = Math.sin(camberSign * this._road.camberProfile(arcS, runKey))
        for (let j = 0; j <= CROSS_SEGS; j++) {
            const uLat = (j / CROSS_SEGS - 0.5) * roadWidth      // -halfWidth (left edge) … +halfWidth (right edge)
            const vx = posX + rightX * uLat, vz = posZ + rightZ * uLat
            const pY = Math.abs(uLat) < halfWidth ? potholeNoise(vx, vz, q, params) : 0
            out[j * 3] = vx
            out[j * 3 + 1] = rp.gradeY + crownProfile(uLat, halfWidth, crownH) + uLat * sinCamber + pY
            out[j * 3 + 2] = vz
        }
        return q
    }

    /**
     * Skirt-bottom vertex colour, written to out[o..o+2]. Dirt shoulder (SURF-05 / Plan 09-24,
     * params.roadDirtColor, linear like the asphalt RC/GC/BC). BUG-74: the skirt follows the
     * terrain's cut fade — where the road sits IN the hill the face under the asphalt edge is the
     * same broken rock as the ballast bench beside it (terrainCutoutColor), not a tan dirt line
     * against it. Same centred depth fade as terrain.js _writeChunkVertexColors: delta = dirt grade
     * − raw hill, cutness = smooth(−F, F, −delta). Shared by the ribbon and the junction skirts.
     */
    _skirtColor(edgeX, edgeY, edgeZ, params, out, o) {
        const dirtHex = params.roadDirtColor ?? 0x6b5a3e
        const cutHex  = params.terrainCutoutColor ?? 0x757066
        const cutFade = params.roadCutRockFade ?? 2.0
        const raw = this._terrainRef ? this._terrainRef(edgeX, edgeZ) : NaN
        let k = 0                                                       // headless stub → plain dirt skirt
        if (Number.isFinite(raw)) {
            const delta = (edgeY - (params.roadClearanceMargin ?? 0.25)) - raw   // + fill, − cut
            const t = Math.max(0, Math.min(1, (-delta + cutFade) / (2 * cutFade)))
            k = t * t * (3 - 2 * t)
        }
        for (let c = 0; c < 3; c++) {
            const sh = 16 - 8 * c
            const d = ((dirtHex >> sh) & 0xff) / 255, r = ((cutHex >> sh) & 0xff) / 255
            out[o + c] = d + (r - d) * k
        }
    }

    /**
     * Junction skirt: the ribbon's folded-over edge (sweepRibbon's skirt quads) carried round a pad
     * or deg-2 connector, so the junction reads as the same solid asphalt slab as the road. Walks the
     * up-facing mesh's BOUNDARY edges (used by exactly one triangle) — the skirt top is the pad's own
     * edge vertices, so it welds by construction, refinement midpoints included — and drops each one
     * roadSkirtDepth into a dirt/rock wall, wound outward exactly like the ribbon skirt. `skip(a, b)`
     * drops the mouth edges: they sit under the ribbon end they weld to, and the junction material's
     * polygon offset would pull a wall there up through the asphalt. Walls are steep, so the pad's
     * colliderSurfaceOnly filter keeps them out of physics like the ribbon skirt.
     */
    _withJunctionSkirt(positions, colors, marks, tris, params, skip) {
        const depth = params.roadSkirtDepth ?? 0.4
        const V = positions.length / 3
        const count = new Map()
        for (let t = 0; t < tris.length; t += 3) {
            for (let e = 0; e < 3; e++) {
                const a = tris[t + e], b = tris[t + (e + 1) % 3]
                const k = a < b ? a * V + b : b * V + a
                count.set(k, (count.get(k) || 0) + 1)
            }
        }
        const edges = []
        for (let t = 0; t < tris.length; t += 3) {
            for (let e = 0; e < 3; e++) {
                const a = tris[t + e], b = tris[t + (e + 1) % 3]
                if (count.get(a < b ? a * V + b : b * V + a) === 1 && !skip(a, b)) edges.push(a, b)
            }
        }
        const bottom = new Map()            // top vertex → its dropped twin
        for (const v of edges) if (!bottom.has(v)) bottom.set(v, V + bottom.size)
        const nV = V + bottom.size
        const pos = new Float32Array(nV * 3); pos.set(positions)
        const col = new Float32Array(nV * 3); col.set(colors)
        const mrk = new Float32Array(nV * 4); mrk.set(marks)
        for (const [v, w] of bottom) {
            pos[w * 3] = positions[v * 3]; pos[w * 3 + 1] = positions[v * 3 + 1] - depth; pos[w * 3 + 2] = positions[v * 3 + 2]
            this._skirtColor(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2], params, col, w * 3)
            mrk[w * 4] = marks[v * 4]                        // markEnable (w) stays 0 — no stripes on the wall
        }
        const out = new Uint32Array(tris.length + edges.length * 3)
        out.set(tris)
        let ii = tris.length
        for (let k = 0; k < edges.length; k += 2) {
            // Directed a→b as wound in the up-facing pad tri → (a, a', b) + (b, a', b') faces outward.
            const a = edges[k], b = edges[k + 1], a2 = bottom.get(a), b2 = bottom.get(b)
            out[ii++] = a; out[ii++] = a2; out[ii++] = b
            out[ii++] = b; out[ii++] = a2; out[ii++] = b2
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        geo.setAttribute('color',    new THREE.BufferAttribute(col, 3))
        geo.setAttribute('aMark',    new THREE.BufferAttribute(mrk, 4))
        geo.setIndex(new THREE.BufferAttribute(out, 1))
        geo.computeVertexNormals()
        return geo
    }

    /**
     * Does the streamed road network reach this tile? Corners + centre, because coverage is a
     * circle and a tile is CHUNK_SIZE square. Mirrors TerrainSystem._roadCoversChunk — the ribbon
     * and the carve have to agree about when a tile's emptiness is real.
     */
    _roadCoversTile(tileX, tileZ) {
        const rs = this._road
        if (!rs || typeof rs.networkCoversXZ !== 'function') return true
        const S = CHUNK_SIZE, x0 = tileX * S, z0 = tileZ * S
        return rs.networkCoversXZ(x0, z0) || rs.networkCoversXZ(x0 + S, z0)
            || rs.networkCoversXZ(x0, z0 + S) || rs.networkCoversXZ(x0 + S, z0 + S)
            || rs.networkCoversXZ(x0 + S / 2, z0 + S / 2)
    }

    /**
     * Queue a tile build. `rebuild` queues a tile that is already standing: the new meshes are built
     * FIRST and the old ones removed in the same frame (_buildRoadTile), so a stale tile never has a
     * frame with no road in it — dispose-then-rebuild showed as the road ahead blinking out and back
     * (owner, 2026-10-03: every time the first full-band adopt widened the coverage circle).
     */
    ensureRoadTile(tileX, tileZ, rebuild = false) {
        const key = `${tileX},${tileZ}`
        if (this._pendingSet.has(key) || (!rebuild && this._tileMeshMap.has(key))) return
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
        this._releaseEntry(entry)
        this._tileMeshMap.delete(key)
        this._pendingSet.delete(key)
        this._physicsHook?.disposeTile(key)   // FEAT-48: drop the engine trimesh with the visuals
    }

    /** Remove a tile entry's meshes from the scene and free their geometry (T-06-03). */
    _releaseEntry(entry) {
        for (const mesh of entry.meshes) this._scene.remove(mesh)
        for (const geo of entry.geometries) geo.dispose()
    }

    /**
     * FEAT-48: attach the engine road-collider mirror (RoadPhysics). Every committed tile's
     * geometries (ribbon slices, junction pads, tunnel bores — world-space vertices) become
     * static trimesh shapes; every dispose path funnels through disposeRoadTile above. Late
     * registration re-syncs tiles already standing.
     */
    setPhysicsHook(hook) {
        this._physicsHook = hook ?? null
        if (hook) {
            for (const [key, entry] of this._tileMeshMap) hook.syncTile(key, entry.geometries)
        }
    }

    /**
     * Process the pending build queue — build up to MAX_ROAD_BUILDS_PER_FRAME tiles.
     * Called once per frame from the streaming loop in main.js.
     * @param {number|null} ccx stream-centre tile X (PERF-33: with ccz, orders the queue near-then-ahead;
     *   null keeps enqueue order — headless callers)
     * @param {number|null} ccz
     * @param {import('./stream-priority.js').StreamMotion|null} motion
     * @param {number} deadline PERF-33: performance.now() cutoff from the shared streaming budget. A tile
     *   build is not sliced, so this only decides whether to START one (Infinity ⇒ count cap only).
     */
    flushPendingQueue(ccx = null, ccz = null, motion = null, deadline = Infinity) {
        // PERF-13: initial-fill burst — until the queue first drains empty (the spawn ring's tiles
        // have all been built once), build up to 8 tiles/frame; pre-drivable hitches are free.
        // After that the steady MAX_ROAD_BUILDS_PER_FRAME=1 cap owns the frame.
        const cap = this._initialFillDone ? MAX_ROAD_BUILDS_PER_FRAME : 8
        // PERF-33: was FIFO (enqueue order = the terrain ring's key order), so a tile beside the truck
        // could wait behind the whole far edge. Same streamScore as terrain and props.
        if (ccx != null && this._pendingQueue.length > 1) {
            for (const q of this._pendingQueue) q.score = streamScore(q.tileX - ccx, q.tileZ - ccz, motion)
            this._pendingQueue.sort((a, b) => a.score - b.score)
        }
        let built = 0
        while (this._pendingQueue.length > 0 && built < cap && performance.now() < deadline) {
            const { tileX, tileZ, key } = this._pendingQueue.shift()
            this._pendingSet.delete(key)
            this._buildRoadTile(tileX, tileZ, key)
            perfEvent('road.tile')   // PERF-26: commit point — ribbon geometry enters the scene
            built++
        }
        if (!this._initialFillDone && built > 0 && this._pendingQueue.length === 0) this._initialFillDone = true
    }

    /** PERF-33: true while the ribbon is in its initial-fill burst (the frame loop lifts the budget). */
    isFilling() { return !this._initialFillDone }

    /** PERF-33: tile (tileX, tileZ) has a ribbon the truck can drive on (freeze-guard lookahead). An
     *  empty tile — no road through it — is a built tile. A tile pending a rebuild IN PLACE
     *  (invalidateRegions) keeps its old mesh + collider until the new one swaps in, so it counts. */
    isTileBuilt(tileX, tileZ) { return this._tileMeshMap.has(`${tileX},${tileZ}`) }

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
        // Enqueue any active tile that does not have a road mesh yet (build-radius unchanged), and
        // D5: take the ring's min/max tile X/Z in the same pass — the keep set below is that ring
        // expanded by roadTileKeepMargin tiles.
        const margin = (this._params.roadTileKeepMargin ?? 1) | 0   // integer tiles
        let minCX = Infinity, maxCX = -Infinity, minCZ = Infinity, maxCZ = -Infinity
        for (const key of activeKeys) {
            const [cx, cz] = key.split(',').map(Number)
            this.ensureRoadTile(cx, cz)
            if (cx < minCX) minCX = cx
            if (cx > maxCX) maxCX = cx
            if (cz < minCZ) minCZ = cz
            if (cz > maxCZ) maxCZ = cz
        }
        // The keep set only changes when the ring moves a chunk (or the margin changes): rebuilt on
        // a bounds change, not every frame. Empty ring → empty set (no Infinity loop bounds).
        const keepSig = activeKeys.size > 0 ? `${minCX},${maxCX},${minCZ},${maxCZ},${margin}` : ''
        if (keepSig !== this._keepSig) {
            this._keepSig = keepSig
            this._keepSet = new Set()
            if (activeKeys.size > 0) {
                for (let cx = minCX - margin; cx <= maxCX + margin; cx++) {
                    for (let cz = minCZ - margin; cz <= maxCZ + margin; cz++) {
                        this._keepSet.add(`${cx},${cz}`)
                    }
                }
            }
        }
        const keepSet = this._keepSet

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
        // built against an old spline; re-enqueue it (rebuild in place) so it rebuilds against the
        // current route. Frame-spread is preserved: re-enqueue lets flushPendingQueue drain
        // at MAX_ROAD_BUILDS_PER_FRAME — never rebuilds all stale tiles in one frame.
        // Only check active tiles so we don't revive tiles that should stay evicted.
        const currentGen = this._road.roadGeneration()
        // Snapshot keys to avoid mutating the map while iterating.
        const builtKeys = [...this._tileMeshMap.keys()]
        for (const key of builtKeys) {
            const entry = this._tileMeshMap.get(key)
            if (!entry) continue
            if (!activeKeys.has(key)) continue
            const [cx, cz] = key.split(',').map(Number)
            // Two reasons a built tile is stale. The generation check catches a re-ROUTE. It cannot
            // catch a network that simply had not ARRIVED yet: a tile sliced while the streamed
            // network did not reach it builds legitimately empty (the comment in _buildRoadTile is
            // explicit that empty slices are normal at a junction node, so it must not early-return),
            // caches that empty entry, and ensureRoadTile then refuses to re-queue it forever —
            // while a positional adopt never bumps the generation. That is a teleport destination
            // with no ribbon on it until the tile is evicted. Pair the stamp with coverage.
            const covered = this._roadCoversTile(cx, cz)
            if (entry.builtGeneration !== currentGen || entry.builtCovered !== covered) {
                this.ensureRoadTile(cx, cz, true)   // rebuild in place against the current network (old meshes stay up until then)
            }
        }
    }

    /**
     * BUG-76: rebuild the built tiles a positional adopt re-shaped. `regions` are the
     * `{x, z, reach}` discs RoadSystem._adoptDirtyRegions() returns — the same ones the terrain
     * re-carves — so the ribbon, its road trimesh and the carve under it move together. Neither
     * the generation stamp nor the coverage stamp above can see this case: the generation is not
     * bumped on a move and the tile stays covered. A disc centred on a changed junction node always
     * touches the tile that owns its pad (pads belong to the tile holding the node centre).
     * Frame-spread like the stale pass: tiles are only re-enqueued, flushPendingQueue drains them.
     * @returns {number} tiles re-enqueued
     */
    invalidateRegions(regions) {
        if (!regions || !regions.length) return 0
        const S = CHUNK_SIZE
        let n = 0
        for (const key of [...this._tileMeshMap.keys()]) {
            const [cx, cz] = key.split(',').map(Number)
            const x0 = cx * S, z0 = cz * S
            for (const r of regions) {
                const px = Math.max(x0, Math.min(x0 + S, r.x)), pz = Math.max(z0, Math.min(z0 + S, r.z))
                if (Math.hypot(r.x - px, r.z - pz) > r.reach) continue
                this.ensureRoadTile(cx, cz, true)   // rebuild in place — no empty frame
                n++
                break
            }
        }
        return n
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

    /**
     * Tear the whole system down: every tile, plus the per-instance materials and the portal's two
     * masonry textures. main.js builds a fresh RoadMeshSystem on every reseed; without this each
     * reseed stranded four materials and two 256² textures on the GPU.
     */
    dispose() {
        this.clearAll()
        this._material.dispose()
        this._junctionMaterial?.dispose()
        this._tunnelMaterial?.dispose()
        if (this._portalMaterial) {
            this._portalMaterial.map?.dispose()
            this._portalMaterial.normalMap?.dispose()
            this._portalMaterial.dispose()
        }
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /**
     * Build all ribbon meshes for a single road tile.
     * Reads the road tile's segment array from road._tiles.get(key), computes the
     * design grade for each slice, sweeps a ribbon, and adds the mesh to the scene.
     *
     * Pure function of (tileX, tileZ, road._tiles) — deterministic (D-16).
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
        this._road._detectNodeJunctions()
        perfAdd('ribbon.sliceNetwork', performance.now() - _ptE)
        const segs = this._road._tiles.get(key)

        const meshes     = []
        const geometries = []

        // Per-section timing buckets for the ?hitch report (perf.js is a no-op otherwise). They
        // split frame.ribbon.flush so a tile-build hitch names its section: the PERF-26 A/B showed
        // a 48 ms frame with 19.4 ms in the flush and < 1.2 ms in sweepRibbon — the rest was here.
        // Accumulated per section and emitted once at the end, so the `continue` paths can't leak one.
        let _bLut = 0, _bSample = 0, _bTrim = 0, _bMesh = 0, _bTunnel = 0, _bPad = 0

        // NB: do NOT early-return when segs is empty. A junction NODE's tile can legitimately have zero
        // ribbon slices — the ribbons are trimmed back (roadJunctionCutback) from the node, so when the
        // node sits near a tile corner (e.g. seed-6 node 253,-131 is ~3 m from both edges of tile 3,-3),
        // every trimmed leg stub falls in the NEIGHBOUR tiles and this tile gets no slice. The old
        // early-return then skipped the junction-pad loop below → the pad was never built (bare-terrain
        // hole where three roads meet). Falling through builds the pad; an empty ribbon loop is a no-op.
        for (const seg of (segs || [])) {
            const { spline } = seg
            if (!spline) continue

            // Centreline samples at ~2 m: only their XZ is used — sweepRibbon takes every height
            // from the run profile, the same one the carve and physics read.
            // Split getLength from the sampling loop: getLength() is what BUILDS the Curve
            // arc-length LUT (getLengths, 200 divisions of getPoint) — getPointAt then only
            // binary-searches it. If the cost is LUT construction the fix is a different shape
            // (cache/reuse) than if it is the 256 getPointAt calls.
            const _ptLen = performance.now()
            const arcLen = spline.getLength ? spline.getLength() : 64
            _bLut += performance.now() - _ptLen
            const _ptSamp = performance.now()
            const N = Math.max(2, Math.min(256, Math.ceil(arcLen / 2) + 1))
            const points = []
            for (let _i = 0; _i < N; _i++) points.push(spline.getPointAt(_i / (N - 1)))
            _bSample += performance.now() - _ptSamp

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
            // RIBBON-PAD WELD (BUG-82 follow-up): where the pad's ring carries this leg's mouth chord
            // (j.mouth, road.js leg.weld) the ribbon is trimmed to the MOUTH instead and gets one extra
            // section exactly on it — the same _ribbonSection the pad copies onto its mouth verts. The two
            // meshes then share that edge: no 2.5 m overlap, no polygon-offset contest, no open ribbon end
            // to look into, and the skirts meet at the mouth corners.
            const _ptTrim = performance.now()
            let usePoints = points, useArcS0 = arcS0, useArcS1 = arcS1
            const jArcs = this._road._junctionCarveArcs ? this._road._junctionCarveArcs.get(runKey) : null
            if (jArcs && jArcs.length) {
                const cutback = this._road.junctionCutbackDist()
                const Np = points.length
                const cum = new Float32Array(Np)
                for (let _i = 1; _i < Np; _i++) cum[_i] = cum[_i - 1] + Math.hypot(points[_i].x - points[_i - 1].x, points[_i].z - points[_i - 1].z)
                const tot = cum[Np - 1] || 1
                const arcAt = (_i) => arcS0 + (arcS1 - arcS0) * (cum[_i] / tot)
                // BUG-59: a leg whose pavement overlaps a sibling's past the default cutback is
                // trimmed to ITS parting point (j.cutback) — the pad owns that ground.
                const trimOf = (aS) => { for (const j of jArcs) if (Math.abs(aS - j.arc) < (j.mouth ?? j.cutback ?? cutback)) return j; return null }
                let k0 = -1, k1 = -1
                for (let _i = 0; _i < Np; _i++) if (!trimOf(arcAt(_i))) { if (k0 < 0) k0 = _i; k1 = _i }
                if (k0 >= 0 && (k0 > 0 || k1 < Np - 1)) {
                    useArcS0  = arcAt(k0)
                    useArcS1  = arcAt(k1)
                    usePoints = points.slice(k0, k1 + 1)
                    // The weld section, on each end a welded junction trimmed. A kept sample closer than
                    // 0.3 m to the mouth is replaced by it rather than left as a sliver quad.
                    const mouthArc = (j, toward) => j && j.mouth !== undefined ? j.arc + Math.sign(toward - j.arc) * j.mouth : null
                    const ma = k0 > 0 ? mouthArc(trimOf(arcAt(k0 - 1)), useArcS0) : null
                    if (ma !== null) {
                        if (Math.abs(useArcS0 - ma) < 0.3 && usePoints.length > 1) usePoints.shift()
                        usePoints.unshift(this._road.runPointAt(runKey, ma)); useArcS0 = ma
                    }
                    const mb = k1 < Np - 1 ? mouthArc(trimOf(arcAt(k1 + 1)), useArcS1) : null
                    if (mb !== null) {
                        if (Math.abs(useArcS1 - mb) < 0.3 && usePoints.length > 1) usePoints.pop()
                        usePoints.push(this._road.runPointAt(runKey, mb)); useArcS1 = mb
                    }
                }
                if (k0 < 0 || usePoints.length < 2) { _bTrim += performance.now() - _ptTrim; continue }   // fully trimmed → the pad(s) cover this stub
            }

            _bTrim += performance.now() - _ptTrim

            const _ptS = performance.now()
            const geo  = this.sweepRibbon(usePoints, this._params, runKey, useArcS0, useArcS1)
            // FEAT-48: the ribbon's edge SKIRTS are near-vertical wall strips — colliding with
            // them let the chassis slab catch a 0.4 m wall at speed (the hairpin launch+yaw kick,
            // capture 1786773473453). Physics keeps the DRIVING SURFACE only; RoadPhysics strips
            // steep triangles from surface-tagged geometries. Tunnels/portals stay fully solid.
            geo.userData.colliderSurfaceOnly = true
            perfAdd('ribbon.sweepRibbon', performance.now() - _ptS)
            const _ptM = performance.now()   // Mesh ctor + scene.add (parent/matrix
            // bookkeeping, and the first place a fresh BufferGeometry is seen by the renderer graph)
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
            _bMesh += performance.now() - _ptM

            const _ptT = performance.now()
            // ── FEAT-40: tunnel bore lining + portal headwalls over this slice ──────────────
            // Spans live on the net entry (run-global arc, set by the assembly tunnel pass).
            // Each slice builds only its own overlap [arcS0,arcS1]∩[s0,s1] and each portal is
            // built by the ONE slice whose arc range contains it — streams with the tile like
            // everything else. (Untrimmed arcS0/arcS1: bores are ≥ endMargin from junctions.)
            const tSpans = this._road._network?.get(runKey)?.tunnelSpans
            if (tSpans) {
                const addTMesh = (g, mat) => {
                    if (!g) return
                    const m = new THREE.Mesh(g, mat)
                    m.receiveShadow = true
                    if (this._meshesVisible === false) m.visible = false
                    this._scene.add(m)
                    meshes.push(m)
                    geometries.push(g)
                }
                // Slices can be stored REVERSED (E→W: arcS0 > arcS1) — normalize before the
                // overlap/containment tests or bores in reversed slices silently get no tube
                // (the missing-pipe bug: whichever direction the slicer happened to run decided
                // whether a tunnel's lining existed).
                const sLo = Math.min(arcS0, arcS1), sHi = Math.max(arcS0, arcS1)
                for (const sp of tSpans) {
                    const a = Math.max(sp.s0, sLo), b = Math.min(sp.s1, sHi)
                    if (b - a > 0.5) addTMesh(this.buildTunnelTube(runKey, a, b, sp, this._params), this._getTunnelMaterial())
                    if (sp.s0 >= sLo && sp.s0 < sHi) addTMesh(this.buildPortalRing(runKey, sp.s0, -1, this._params), this._getPortalMaterial())
                    if (sp.s1 >= sLo && sp.s1 < sHi) addTMesh(this.buildPortalRing(runKey, sp.s1, +1, this._params), this._getPortalMaterial())
                }
            }
            _bTunnel += performance.now() - _ptT
        }

        // ── Junction footprints for nodes assigned to this tile ────────────────
        // Detect junctions in the network and build footprint meshes for any node
        // whose position falls inside this tile's CHUNK_SIZE × CHUNK_SIZE bounds.
        // (Open Q3 from RESEARCH: assign junction to tile containing node XZ position.)
        //
        // QUAL-10: the pad is a GRADED apron — every vertex rides the node's own surface field
        // (_nodeSurfaceTop for a ≥3-leg pad, sampleRoadTopY for a deg-2 connector strip), the same
        // field the collision carve reads, so mesh == collision.
        const _ptP = performance.now()   // whole pad block, INCLUDING the
        // full-map node iteration (a per-tile scan of every junction node in the network, run once
        // per built tile — a suspect in its own right, not just buildJunctionFootprint).
        if (this._params.roadJunctionFootprints) {
            const tileWorldX = tileX * CHUNK_SIZE
            const tileWorldZ = tileZ * CHUNK_SIZE
            const buildPad = (node) => {
                const nx = node.pos.x, nz = node.pos.z
                // Assign to tile if node falls inside this tile's bounds.
                if (nx >= tileWorldX && nx < tileWorldX + CHUNK_SIZE &&
                    nz >= tileWorldZ && nz < tileWorldZ + CHUNK_SIZE) {
                    const geo = this.buildJunctionFootprint(node, this._params)
                    if (geo) {
                        geo.userData.colliderSurfaceOnly = true   // FEAT-48: pads too — aprons can have steep rims
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
            // Pads come from NODE junctions — the real graph T/X/Y intersections (runs meeting at a
            // shared node). Mid-span crossings (_detectJunctions) never had a ring, so never a pad.
            for (const node of this._road._detectNodeJunctions().values()) buildPad(node)
        }
        _bPad += performance.now() - _ptP

        // emit the tile's section breakdown. Names must sort under the
        // frame.ribbon.flush parent in the hitch `top` list. Sub-buckets are NESTED (they are
        // inside frame.ribbon.flush) so perf.js's frame.* attributed sum does not double-count.
        if (_bLut    > 0) perfAdd('ribbon.lut',      _bLut)
        if (_bSample > 0) perfAdd('ribbon.samplePts', _bSample)
        if (_bTrim   > 0) perfAdd('ribbon.trim',     _bTrim)
        if (_bMesh   > 0) perfAdd('ribbon.meshAdd',  _bMesh)
        if (_bTunnel > 0) perfAdd('ribbon.tunnel',   _bTunnel)
        if (_bPad    > 0) perfAdd('ribbon.pads',     _bPad)

        // A rebuild in place (ensureRoadTile(…, true)): the previous meshes come down only now that
        // the new ones are in the scene. syncTile below replaces the key's colliders itself.
        const prev = this._tileMeshMap.get(key)
        if (prev) this._releaseEntry(prev)
        // D1 (plan 09-19): stamp the road generation this tile was built against so
        // syncToChunkRing can detect stale tiles and re-enqueue them on mismatch.
        this._tileMeshMap.set(key, {
            meshes, geometries,
            builtGeneration: this._road.roadGeneration(),
            builtCovered: this._roadCoversTile(tileX, tileZ),   // see the rebuild pass
        })
        this._physicsHook?.syncTile(key, geometries)   // FEAT-48: asphalt/pads/bores → engine trimeshes
    }

    // ── FEAT-40: tunnel bore lining + portal headwalls ────────────────────────
    // Reference look: short mountain cut tunnel — semicircular concrete half-tube bore (dark
    // interior, daylight visible at the far end), rough-stone headwall face at each portal,
    // raw hillside running over the top (the terrain skin is NOT carved over a bore span).

    /**
     * Concrete half-tube lining swept along [sA,sB] of a run (world-space geometry).
     * Cross-section: semicircular arch of tunnelBoreRadius springing at road level ±R, plus a
     * DIRT APRON from under the ribbon edge out to the wall base. The apron rides the exact
     * carve dirt surface (_carveDirtY formula: gradeY + crown + camber tilt − clearance) so it
     * meets the carved open cut flush at the mouths AND floors the bore interior — the terrain
     * mesh deliberately keeps the raw hill over a bore span (no carve), so without the apron
     * the ribbon floats over a void between its edge and the tube wall. Nudged 5 cm below the
     * carve dirt so it never z-fights the carved terrain inside the 4 m portal inset. Vertex
     * colors fake the bore's darkness: full brightness at the portals easing to ~25 % deep
     * inside, so the interior reads dark while headlights (real spotlights) still light it.
     * Frame per ring = runPointAt centre + runProfile tangent — the exact ribbon frame, so the
     * tube tracks the road through curves. Pure fn of the network + params (D-16).
     *
     * @returns {THREE.BufferGeometry|null}
     */
    buildTunnelTube(runKey, sA, sB, span, params) {
        const road = this._road
        if (!road.runPointAt || !road.runProfile) return null
        const R = params.tunnelBoreRadius ?? 8
        const SEG = 20                       // arch segments (θ 0..π)
        const halfWidth   = params.roadHalfWidth       ?? 5
        const crownH      = params.crownHeight          ?? 0.05
        const clearance   = params.roadClearanceMargin  ?? 0.25
        const APRON_IN    = Math.min(halfWidth - 0.8, R - 0.5)  // tucked under the ribbon edge
        const APRON_DROP  = 0.05             // m below carve dirt (kills mouth z-fight)
        const inner = Math.max(2, Math.ceil((sB - sA) / 3) + 1)
        // Proud mouth: at a true span end (portal), one extra ring extruded 1.5 m OUT along the end
        // tangent so the tube exits the shader-cut terrain hole and meets the masonry ring.
        const extA = Math.abs(sA - span.s0) < 1e-6, extB = Math.abs(sB - span.s1) < 1e-6
        const rings = inner + (extA ? 1 : 0) + (extB ? 1 : 0)
        const vpr = SEG + 5                  // apronR(2) + (SEG+1 arch verts) + apronL(2)

        const pos = new Float32Array(rings * vpr * 3)
        const col = new Float32Array(rings * vpr * 3)
        const uv  = new Float32Array(rings * vpr * 2)
        const prof = { gradeY: 0, tx: 1, tz: 0 }
        let vi = 0, ui = 0
        for (let r = 0; r < rings; r++) {
            const ir = Math.min(inner - 1, Math.max(0, r - (extA ? 1 : 0)))
            const s = sA + (sB - sA) * (ir / (inner - 1))
            const c = road.runPointAt(runKey, s)
            if (!c) return null
            road.runProfile(s, runKey, prof)
            // Extrusion rings reuse the end frame, pushed out along the tangent.
            const ext = (extA && r === 0) ? -1.5 : (extB && r === rings - 1) ? 1.5 : 0
            if (ext) { c.x += prof.tx * ext; c.z += prof.tz * ext }
            // rightDir chosen so a vertex at lateral L has signedLat = L (matches the carve frame).
            const rx = prof.tz, rz = -prof.tx
            // Brightness: 1 at the portals → 0.25 deep inside (25 m ramp, smoothstep).
            const dPortal = Math.min(s - span.s0, span.s1 - s)
            const t = Math.max(0, Math.min(1, dPortal / 25))
            const shade = 1 - 0.75 * (t * t * (3 - 2 * t))
            // Dirt-apron Y (relative to gradeY) — the _carveDirtY fold at lateral L, minus the drop.
            // Camber from camberProfile, the SAME source the ribbon and the carve read.
            const sinCam = Math.sin(road.camberProfile(s, runKey))
            const dirtH = (L) => crownProfile(L, halfWidth, crownH) + L * sinCam - clearance - APRON_DROP
            for (let k = 0; k < vpr; k++) {
                let lat, h
                if (k === 0)            { lat =  APRON_IN; h = dirtH(lat) }
                else if (k === 1)       { lat =  R;        h = dirtH(lat) }
                else if (k === vpr - 2) { lat = -R;        h = dirtH(lat) }
                else if (k === vpr - 1) { lat = -APRON_IN; h = dirtH(lat) }
                else {
                    const th = Math.PI * (k - 2) / SEG
                    lat = R * Math.cos(th); h = R * Math.sin(th)
                }
                pos[vi]     = c.x + rx * lat
                pos[vi + 1] = prof.gradeY + h
                pos[vi + 2] = c.z + rz * lat
                // Apron verts tint dirt-brown (vertex color × concrete base ≈ shoulder dirt).
                const apron = k < 2 || k > vpr - 3
                col[vi]     = shade * (apron ? 0.80 : 1)
                col[vi + 1] = shade * (apron ? 0.66 : 1)
                col[vi + 2] = shade * (apron ? 0.52 : 1)
                vi += 3
                uv[ui] = s * 0.08; uv[ui + 1] = k / (vpr - 1); ui += 2
            }
        }
        const idx = []
        for (let r = 0; r < rings - 1; r++) {
            for (let k = 0; k < vpr - 1; k++) {
                const a = r * vpr + k, b = a + vpr
                idx.push(a, b, a + 1, a + 1, b, b + 1)
            }
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        geo.setAttribute('color',    new THREE.BufferAttribute(col, 3))
        geo.setAttribute('uv',       new THREE.BufferAttribute(uv, 2))
        geo.setIndex(idx)
        geo.computeVertexNormals()
        return geo
    }

    /**
     * Masonry portal RING at run-arc `pArc` — no flat headwall (that read as a billboard slapped
     * on the hillside). Instead a proud collar around the tube mouth, per the reference: a short
     * extruded arch ring (outer band + front annulus + inner reveal), stone-textured. The terrain
     * skin is shader-cut around the mouth (terrain.js uTunnelPos/uTunnelAxis discard), and the
     * ring's outer radius overlaps that hole edge so the ragged cut hides behind it.
     * `outSign` = which way along the run is OUT of the hill (−1 at s0, +1 at s1).
     *
     * @returns {THREE.BufferGeometry|null}
     */
    buildPortalRing(runKey, pArc, outSign, params) {
        const road = this._road
        if (!road.runPointAt || !road.runProfile) return null
        const R    = params.tunnelBoreRadius ?? 8
        // ROUT covers the portal-neck width (carve necks the cut to ~R+2.5 at the mouth — road.js
        // PORTAL_TAPER_LEN) so the carved→raw stop at the portal line hides behind the collar.
        const RIN  = R + 0.05, ROUT = R + 2.6     // reveal hugs the tube; wide headwall collar
        const D0 = -0.8, D1 = 1.35                // extrusion: buried into the hill → proud of it
        const SEG = 20
        const c = road.runPointAt(runKey, pArc)
        if (!c) return null
        const prof = { gradeY: 0, tx: 1, tz: 0 }
        road.runProfile(pArc, runKey, prof)
        const rx = prof.tz, rz = -prof.tx
        const ox = prof.tx * outSign, oz = prof.tz * outSign

        // Three quad strips with duplicated verts (crisp edges): outer band (R_OUT, D0→D1),
        // front annulus (D1, R_OUT→R_IN), inner reveal (R_IN, D1→D0). Rows are [r, d, v] where v
        // is the CUMULATIVE cross-section distance — and u uses ONE shared reference radius for
        // every row (per-row θ·r sheared the courses diagonally across the strips).
        const RMID = (RIN + ROUT) / 2
        const rows = [
            [ROUT, D0, 0], [ROUT, D1, D1 - D0],
            [ROUT, D1, D1 - D0], [RIN, D1, (D1 - D0) + (ROUT - RIN)],
            [RIN, D1, (D1 - D0) + (ROUT - RIN)], [RIN, D0, 2 * (D1 - D0) + (ROUT - RIN)],
        ]
        const nTheta = SEG + 1
        const pos = new Float32Array(rows.length * nTheta * 3)
        const uv  = new Float32Array(rows.length * nTheta * 2)
        let vi = 0, ui = 0
        for (const [r, d, vRow] of rows) {
            for (let k = 0; k < nTheta; k++) {
                const th = Math.PI * k / SEG
                const lat = r * Math.cos(th), h = r * Math.sin(th)
                pos[vi]     = c.x + rx * lat + ox * d
                pos[vi + 1] = prof.gradeY + h
                pos[vi + 2] = c.z + rz * lat + oz * d
                vi += 3
                uv[ui] = th * RMID * 0.22; uv[ui + 1] = vRow * 0.22; ui += 2
            }
        }
        const idx = []
        for (let s = 0; s < rows.length; s += 2) {      // strip = row pair (s, s+1)
            for (let k = 0; k < SEG; k++) {
                const a = s * nTheta + k, b = (s + 1) * nTheta + k
                idx.push(a, b, a + 1, a + 1, b, b + 1)
            }
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        geo.setAttribute('uv',       new THREE.BufferAttribute(uv, 2))
        geo.setIndex(idx)
        geo.computeVertexNormals()
        return geo
    }

    // Bore lining: matte concrete, double-sided (seen from inside; outside is buried except at
    // the portal rim), vertex-colored for the interior darkness ramp.
    _getTunnelMaterial() {
        if (!this._tunnelMaterial) {
            this._tunnelMaterial = new THREE.MeshStandardMaterial({
                color: 0xaaa7a0, roughness: 0.95, metalness: 0,
                side: THREE.DoubleSide, vertexColors: true,
            })
        }
        return this._tunnelMaterial
    }

    // Portal ring: procedural running-bond masonry (stone blocks + recessed mortar joints).
    _getPortalMaterial() {
        if (!this._portalMaterial) {
            const tex = makeMasonryTextures(7130)
            this._portalMaterial = new THREE.MeshStandardMaterial({
                map: tex.map, normalMap: tex.normalMap,
                // Slight lift + a whisper of emissive: the ring usually sits in the cut's shade.
                color: 0xd6d0c2, emissive: 0x1c1b19, roughness: 1.0, metalness: 0,
                side: THREE.DoubleSide,
            })
        }
        return this._portalMaterial
    }

    // ── Junction footprint helpers ────────────────────────────────────────────

    /**
     * Junction pad material — a clone of the shared road material with a STRONGER polygonOffset than
     * the ribbon (which sits at roadPolygonOffset -1/-1). QUAL-10: the graded apron overlaps the ribbon
     * ends COPLANARLY (both sample the same asphalt-top surface); a more-negative offset lets the apron
     * win the depth test and replace the ribbon end seamlessly — no z-fight, no geometric lift/lip.
     */
    _getJunctionMaterial() {
        if (!this._junctionMaterial) {
            const m = this._material.clone()
            m.polygonOffsetFactor = -4
            m.polygonOffsetUnits  = -4
            // THREE.Material.copy() copies a fixed property list and does NOT carry onBeforeCompile,
            // so this clone was silently rendering with the STOCK Phong shader — no aMark plumbing at
            // all. That was invisible while every junction geometry wrote aMark = 0 (pads are
            // deliberately unmarked); it became visible the moment the deg-2 connector started
            // carrying the centreline across a kink (junction-flow stage 3) and simply never drew.
            // Re-attach the parent's hook; pads keep their all-zero aMark and stay unmarked.
            m.onBeforeCompile = this._material.onBeforeCompile
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
     * self-intersection check; on failure the node falls back to the convex-hull floor
     * (_junctionRingHull) — failure is graceful, never a spike, never a hole.
     *
     * Fill is NON-PLANAR: padFillDelaunay triangulates the ring in XZ (BUG-82 — even outline + hex
     * lattice, earClip + red-green only as the fallback; _buildPadGeometry), and every vertex rides
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
        // Per-vertex asphalt-TOP Y — the graded surface the ribbon mesh + collision carve ride,
        // plane fallback beyond the road footprint. Kept identical to the collision surface
        // (mesh == collision). PERF-25: the PAD ring rides the resolve-free _nodeSurfaceTop — the
        // same field _junctionPadCarve now carves — while the deg-2 swept ribbon keeps
        // sampleRoadTopY (its physics counterpart is the connector composition in _sampleCarveWorld,
        // which still rides the full resolved field).
        const sampleY = (x, z) => {
            const y = this._road.sampleRoadTopY ? this._road.sampleRoadTopY(x, z) : null
            return (y != null && isFinite(y) ? y : fallbackY(x, z)) + apronLift
        }
        const samplePadY = (x, z) => {
            const y = this._road._nodeSurfaceTop ? this._road._nodeSurfaceTop(node, x, z) : null
            return (y != null && isFinite(y) ? y : fallbackY(x, z)) + apronLift
        }

        // QUAL-16 rework: a degree-2 node is a road BENDING THROUGH, not a plaza. Instead of a
        // wedge pad (which reads as a blob and leaves triangulation/weld gaps on the outside of the
        // bend), sweep a full-width ribbon along the cheapest circular fillet joining the two mouth
        // cross-sections (the arc is cached on the node by road.js _buildDeg2ArcGeom) — so the kink
        // looks like any other curved road. Falls through to the cached pad ring below only if the
        // fillet is degenerate (near-collinear / mouths on the wrong side).
        if (node.legs.length === 2) {
            const g = this._buildDeg2Ribbon(node, params, sampleY)
            if (g) return g
        }

        // ── Boundary: the welded pad ring is now built + cached in road.js (_buildJunctionRing, by
        // _networkRev) so it is the SINGLE source shared by the collision carve (_junctionPadCarve) and
        // this mesh — mesh == collision by construction. The fallback ladder (exact weld → shrunk fillets
        // → legacy circle pad) + _ringSelfIntersects gate all live there now (road.js).
        const ring = node.ring
        if (!ring || ring.length < 3) return null

        // Mouth chords (weld / hull rungs place them exactly here) get no skirt — the ribbon end covers them.
        // Returns WHICH leg's chord a point sits on (−1: none): a through road's straight back side runs
        // from one mouth's corner to another's, and is not a mouth.
        const m = this._road._junctionMouths ? this._road._junctionMouths(node) : null
        const mouthOf = (p) => !m ? -1 : m.legs.findIndex(l => {
            const ux = p.x - l.cx, uz = p.z - l.cz
            return Math.abs(ux * l.dx + uz * l.dz) < 0.05 && Math.abs(ux * l.dz - uz * l.dx) <= m.halfWidth + 0.05
        })
        // RIBBON-PAD WELD: every pad vertex on a mouth chord takes the ribbon's own mouth-section vertex
        // (_ribbonSection at the leg's mouth arc — the section the trimmed ribbon ends on), XZ and Y. The
        // CROSS_SEGS-step mouth split already lands the pad verts on those stations; this makes them the
        // same numbers, so the seam is shared vertices. The section is the leg's own deck — the pad field's
        // mouth mask (road.js _padRibbonMask) snaps to the same deck, so the first row of pad triangles
        // bends by only the residual (potholes, a few cm on a tight curve).
        const sections = m ? m.legs.map(l => {
            const out = new Float64Array((CROSS_SEGS + 1) * 3)
            this._ribbonSection(l.cx, l.cz, l.mouthArc, l.runKey, 1, params, out)
            return out
        }) : null
        const snap = (v) => {
            const k = mouthOf(v)
            if (k < 0) return null
            const sec = sections[k]
            for (let j = 0; j <= CROSS_SEGS; j++) {
                if (Math.abs(sec[j * 3] - v.x) < 0.05 && Math.abs(sec[j * 3 + 2] - v.z) < 0.05) return { x: sec[j * 3], y: sec[j * 3 + 1], z: sec[j * 3 + 2] }
            }
            return null
        }
        return this._buildPadGeometry(ring, samplePadY, params, mouthOf, snap)
    }

    /**
     * QUAL-16: degree-2 kink as a swept curved ribbon (not a pad polygon).
     *
     * The two legs are one road bending through the node. Each mouth is the run's own cross-section
     * at cutback + halfWidth/2 (the exact-weld point the pad also uses, overlapping the trimmed
     * ribbon end). road.js (_pushDeg2Core) fits the connector centreline — the cheapest tangent
     * circle where one exists, else a cubic Hermite — and we sweep a full-width strip along it.
     * Vertex Y rides `sampleY` (the same asphalt-top field the ribbons + pads use → mesh ==
     * collision), so the connector is continuous with the two ribbons it welds to. Solid asphalt with
     * the lane markings CARRIED THROUGH (junction-flow stage 3 — a bend is not a plaza; ≥3-leg pads
     * stay unmarked), phase-locked to each leg's ribbon by road.js's markPhase.
     *
     * Returns a BufferGeometry, or null when road.js built no connector at all (degenerate 2-leg
     * input — caller falls back to the pad ladder). junction-flow: a node that DOES get a connector
     * has no node.ring at all, so the pad branch below can never double-draw over this strip and
     * _junctionPadCarve never excavates a plaza under it. Pure fn of node + params + network (D-16).
     */
    _buildDeg2Ribbon(node, params, sampleY) {
        // QUAL-16: the fillet arc geometry is computed ONCE in road.js (_buildDeg2ArcGeom, cached on the
        // node per _networkRev) so the mesh sweep here AND the terrain earthwork / collision
        // (_resolveRoadSurface projects onto node.deg2) follow the SAME arc — mesh == collision through
        // the bend, no scoop/facets. Null (degenerate/pinched fillet) → caller falls back to the pad ladder.
        const arc = node.deg2
        if (!arc || !arc.points || arc.points.length < 2) return null
        const halfWidth = arc.halfWidth
        // Longitudinal chord subdivision (mesh-only — arc.points, which the carve/physics
        // projection consumes, is untouched): splits the ~3 m rung chords into SUB pieces so the
        // strip tracks the curved connector-overlay grade field (the 1/(d²+1) leg blend curves
        // sharply where the footprint passes close to a leg) to ~1 cm along-arc. XZ stays on the
        // chords (sub-decimetre from the true arc); Y is re-sampled from the field per vertex,
        // which is what kills the chord sag that let dirt poke through the ribbon.
        const SUB = 4
        const center = []
        for (let i = 0; i < arc.points.length; i++) {
            if (i > 0) {
                const a = arc.points[i - 1], b = arc.points[i]
                for (let k = 1; k < SUB; k++) {
                    const f = k / SUB
                    center.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f })
                }
            }
            center.push(arc.points[i])
        }

        // ── Sweep a full-width strip. Per-vertex lateral = tangent rotated +90° (central differences). ──
        // COLS interior columns (not just the two edges): the connector asphalt-top field
        // (sampleRoadTopY now folds the QUAL-16 connector-overlay dom-blend grade) is CURVED both
        // along and across the bend; a single 10 m-wide linear chord dips up to ~0.3 m below it
        // mid-rung, dropping the drawn ribbon under the carved dirt (the z-fighting dirt interleave
        // at sharp kinks). 9 columns bound the chord sag to ~1 cm — safely inside clearanceMargin.
        const COLS = 9
        const V = center.length * COLS
        const positions = new Float32Array(V * 3)
        const colors    = new Float32Array(V * 3)
        const marks     = new Float32Array(V * 4)
        // junction-flow stage 3: the connector carries the lane markings across the kink. arcS comes
        // from road.js's markPhase — each half of the connector uses ITS leg's run-arc as an exact
        // linear function of the connector chord distance, so on the lead-ins (which ride on the
        // ribbon) the dash phase and the quality tier byte-match the ribbon underneath, and the one
        // irreconcilable phase jump sits at the bend apex where no ribbon draws. markEnable is a flat
        // 1: the ribbons no longer feather their markings at a connector node (see markFeather), so
        // there is nothing to cross-fade with — the stripe simply runs through.
        const mp = arc.markPhase
        const cum = new Float32Array(center.length)
        for (let i = 1; i < center.length; i++) {
            cum[i] = cum[i - 1] + Math.hypot(center[i].x - center[i - 1].x, center[i].z - center[i - 1].z)
        }
        for (let i = 0; i < center.length; i++) {
            const p = center[i]
            let arcS = 0, q = 0, onA = false
            if (mp) {
                onA = cum[i] <= mp.midCum
                arcS = onA ? mp.aArc + mp.aSig * (cum[i] - mp.aCum)
                           : mp.bArc + mp.bSig * (cum[i] - mp.bCum)
                q = roadQuality(arcS, onA ? mp.aKey : mp.bKey, this._worldSeed)
            }
            // junction-flow stage 4: on the LEAD-INS (the stretches that ride ON their leg's ribbon,
            // cum ≤ aCum / ≥ bCum) take the lateral frame from the RUN — runProfile's continuous
            // tangent, the exact frame sweepRibbon offsets the ribbon edge by — instead of the
            // connector polyline's chord direction. The lead-in POSITIONS already lie on the run
            // polyline the ribbon sweeps, but a chord lags the analytic tangent by up to half its
            // turn, and at halfWidth that threw the strip edge up to ~0.3 m off the ribbon edge it is
            // meant to be coincident with — the little asphalt flap on the outer edge of a bend
            // (seed 6, 1268.7/2719.4). Matching the frame makes the two edges the same curve. The
            // switch is C0: the connector CORE leaves each mouth tangent to that same run tangent.
            let tx, tz
            const onLead = mp && (cum[i] <= mp.aCum + 1e-6 || cum[i] >= mp.bCum - 1e-6)
            if (onLead) {
                const rp = this._road.runProfile(arcS, onA ? mp.aKey : mp.bKey)
                const sig = onA ? mp.aSig : mp.bSig
                tx = sig * rp.tx; tz = sig * rp.tz
            } else {
                const a = center[Math.max(0, i - 1)], b = center[Math.min(center.length - 1, i + 1)]
                tx = b.x - a.x; tz = b.z - a.z
            }
            const tl = Math.hypot(tx, tz) || 1
            tx /= tl; tz /= tl
            const lx = -tz, lz = tx                       // +90° → left side of travel
            for (let c = 0; c < COLS; c++) {
                const off = halfWidth * (1 - 2 * c / (COLS - 1))   // +halfWidth (left) → −halfWidth (right)
                const X = p.x + lx * off, Z = p.z + lz * off
                const vi = i * COLS + c
                positions[vi * 3] = X; positions[vi * 3 + 1] = sampleY(X, Z); positions[vi * 3 + 2] = Z
                colors[vi * 3] = 0.15; colors[vi * 3 + 1] = 0.15; colors[vi * 3 + 2] = 0.17
                // uLat: the sweep's `off` is measured to the LEFT, the ribbon's to the right — the
                // shader only ever reads |uLat|, so the strip and the ribbon agree either way.
                marks[vi * 4] = off; marks[vi * 4 + 1] = arcS; marks[vi * 4 + 2] = q
                marks[vi * 4 + 3] = mp ? 1 : 0
            }
        }
        const tris = []
        for (let i = 0; i < center.length - 1; i++) {
            for (let c = 0; c < COLS - 1; c++) {
                const l0 = i * COLS + c, r0 = l0 + 1
                const l1 = (i + 1) * COLS + c, r1 = l1 + 1
                tris.push(l0, r0, l1, r0, r1, l1)
            }
        }
        // Force UP-facing winding (same guard as the pad fill — flip if the strip came out CW).
        let area2 = 0
        for (let k = 0; k < tris.length; k += 3) {
            const a = tris[k], b = tris[k + 1], c = tris[k + 2]
            area2 += (positions[b * 3] - positions[a * 3]) * (positions[c * 3 + 2] - positions[a * 3 + 2])
                   - (positions[c * 3] - positions[a * 3]) * (positions[b * 3 + 2] - positions[a * 3 + 2])
        }
        if (area2 > 0) for (let k = 0; k < tris.length; k += 3) { const tmp = tris[k + 1]; tris[k + 1] = tris[k + 2]; tris[k + 2] = tmp }

        // Skirt both sides; the two end rungs are the mouths (an edge inside one row is a rung).
        return this._withJunctionSkirt(positions, colors, marks, tris, params,
            (a, b) => Math.floor(a / COLS) === Math.floor(b / COLS))
    }

    /**
     * Triangulate + lift a pad boundary ring (QUAL-11 non-planar fill). Topology is solved in XZ by
     * padFillDelaunay (BUG-82: an even outline + hex lattice at PAD_FILL_SPACING, Delaunay-connected —
     * no slivers, so computeVertexNormals follows the field). Mouth chords split into CROSS_SEGS
     * steps, which lands the pad's mouth vertices exactly on the ribbon end's cross-section verts.
     * If the Delaunay guard trips, the earClip + red-green fill below (_padFillEarClip) takes over.
     * Every vertex Y comes from sampleY (the asphalt-top surface → mesh == collision by
     * construction). Vertex colours = ribbon asphalt base; aMark all-zero → no stripes on the pad
     * (BUG-28 contract).
     *
     * @param {Array<{x:number,z:number}>} ring — simple XZ boundary (open)
     * @param {(x:number,z:number)=>number} sampleY
     * @param {object} params — RANGER_PARAMS (skirt depth/colour)
     * @param {(p:{x:number,z:number})=>number} mouthOf — leg index whose mouth chord p sits on, −1 if none
     * @param {(p:{x:number,z:number})=>({x:number,y:number,z:number}|null)} snap — the ribbon's own vertex
     *        for a mouth vert (the ribbon-pad weld), else null
     * @returns {THREE.BufferGeometry|null}
     */
    _buildPadGeometry(ring, sampleY, params, mouthOf, snap) {
        const n = ring.length
        // Both ends on the SAME leg's chord → a mouth edge (no skirt; split to the ribbon's cross-section).
        const onMouth = (p, q) => { const k = mouthOf(p); return k >= 0 && k === mouthOf(q) }
        const fill = padFillDelaunay(ring, PAD_FILL_SPACING, (i, L) =>
            onMouth(ring[i], ring[(i + 1) % n]) ? CROSS_SEGS : Math.ceil(L / PAD_FILL_SPACING))
            ?? this._padFillEarClip(ring)
        if (!fill) return null
        const { verts, tris } = fill
        const V = verts.length
        const positions = new Float32Array(V * 3)
        const colors    = new Float32Array(V * 3)
        for (let v = 0; v < V; v++) {
            const w = snap(verts[v])
            positions[v * 3    ] = w ? w.x : verts[v].x
            positions[v * 3 + 1] = w ? w.y : sampleY(verts[v].x, verts[v].z)
            positions[v * 3 + 2] = w ? w.z : verts[v].z
            colors[v * 3] = 0.15; colors[v * 3 + 1] = 0.15; colors[v * 3 + 2] = 0.17
        }
        // BUG-28: pads share the road shader (reads aMark). All-zero aMark (feather 0) → no stripes.
        return this._withJunctionSkirt(positions, colors, new Float32Array(V * 4), tris, params,
            (a, b) => onMouth(verts[a], verts[b]))
    }

    /**
     * Fallback pad fill (the pre-BUG-82 path, used when padFillDelaunay's outline guard trips):
     * earClip the (verified-simple) ring, force up-facing winding, then red-green midpoint
     * subdivision — any edge longer than PAD_FILL_MAX_EDGE splits, and the split decision is
     * PER-EDGE so neighbouring triangles always agree (crack-free). Makes slivers (BUG-82), but never
     * a hole.
     *
     * @param {Array<{x:number,z:number}>} ring — simple XZ boundary (open)
     * @returns {{verts:Array<{x:number,z:number}>, tris:number[]}|null}
     */
    _padFillEarClip(ring) {
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
        // PASS CAP 5, not 3 (junction-flow): earClip emits edges as long as the pad ring's diameter
        // (~30 m on a 4-way weld), and halving 30 m three times still leaves ~3.7 m — the old cap
        // RETIRED before reaching the 3 m target, and those unsplit triangles chorded up to 0.43 m
        // across the curved (crowned + banked) pad field. That chord IS the residual "car sinks into
        // the junction" once physics rides the exact vertex field (road.js on-PAD overlay): the wheel
        // is on the analytic surface, the eye is on the triangle. 5 passes reach the target for every
        // ring the ladder can produce; the loop still breaks the moment nothing splits, so a pad that
        // already converged costs exactly what it did.
        for (let pass = 0; pass < 5; pass++) {
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

        return { verts, tris }
    }
}
