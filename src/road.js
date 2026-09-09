/**
 * src/road.js — RoadSystem for AUTOS v1.1
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
import { crownProfile, potholeNoise, signedCurvature, DEEP_BANK_TOE_EXTRA } from './road-carve.js'
import { truncatedHeightField, routeEdgeV2, profileSolve, profileSolveBundle, dequantizeProfile, CLS, V2_COSTS, V2_TRUNC_K, clearReq } from './corridor-router.js'   // FEAT-68: router v2 · BUG-55: bundle solve
import { centerlineFromDescriptors, CenterlineCurve, Centerline, reversePrimitives } from './centerline.js'
import { delaunay, urquhartEdges } from './road-graph.js'

// FEAT-13 v2: total order on site ids [cmx,cmz,k] — the Poisson-disk priority tie-break.
function idLess(a, b) { return a[0] !== b[0] ? a[0] < b[0] : (a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2]) }

// QUAL-10: shared no-influence result for _junctionCarve (allocation-free hot-path default).
const _ZERO_JC = { frac: 0, widen: 0 }
// Inter-leg CREASE fix ("ruled surface" grade blend): near a ≥2-leg node the RULED inter-leg blend
// (_carveDirtY) reaches (roadJunctionCarveRadius × this) as an ARC distance along the winning leg. The
// Voronoi step between two legs GROWS with radius, so the blend must reach well past the crown/camber-ease
// + widen core (R) — set to fully cover the observed crease (≥ r≈28 on the seed-6 trident). Deliberately a
// hardcoded const, NOT a road* param — every ^road key re-routes the whole world when it changes,
// and this is carve-time only (zero routing effect), so it has no business forcing that.
// (Same rationale as KINK_MAX in road-mesh.js.)
const BLEND_REACH_MULT = 10.0
// Ruled inter-leg blend (_carveDirtY): BARYCENTRIC weights w_i = taper_i · ∏_{j≠i} soft(gap_j), where
// gap = distance to the leg's nearest centerline point − halfWidth. This is the LINEAR ruled
// interpolation between the legs (constant-slope banked gore, no local steepening — an exp/inverse-distance
// weight concentrates the whole grade change at the Voronoi crossover, a steep lateral step; inverse-distance
// also spikes at each asphalt edge).
// RULE_SOFT (junction-flow stage 3) is the SMOOTH-CLAMP radius that replaced the old `max(0,gap) + RULE_EPS`.
// The hard clamp FROZE a leg's weight the moment the query entered that leg's asphalt, so the whole inter-leg
// grade handover was squeezed into the thin annulus where BOTH gaps are still positive — at the seed-6 3-way
// (-341,2430) that was a 1.33 m rise across 1.25 m (>45°) bracketed by two hard C1 knees (one at each leg's
// asphalt edge). That crease is what read as "tearing" on the pad: vertex normals break across it, and since
// stage 2 the pad's physics rides the same field. soft(g) = ½(g + √(g² + RULE_SOFT²)) is a smooth positive
// clamp: ≈ g when g ≫ RULE_SOFT, RULE_SOFT/2 at the asphalt edge, and decaying (not frozen) to ~0 on the
// centreline — so the weight ratio keeps evolving INSIDE the asphalt and the handover spreads over ~5 m
// instead of 1.25 m, with no knee anywhere. It is also STRICTLY purer on a clean ribbon than the old floor
// (a sibling's weight now decays as the query moves onto a leg instead of resting at RULE_EPS), so ribbons
// sit closer to their own cross-section, not further. Sized ≈ ¼ road width: small enough that a leg still
// dominates its own asphalt, large enough to span the throat overlap.
// RULE_LEG_REACH is the in-range cutoff (a leg past it is a separate road); RULE_TAPER eases a leg's weight to
// 0 over the last metres before that cutoff so it can't POP in (barycentric weight doesn't decay with its own
// distance, so the cutoff needs an explicit smooth taper).
const RULE_SOFT = 1.2
const RULE_SOFT2 = RULE_SOFT * RULE_SOFT
const RULE_TAPER = 4.0
const RULE_LEG_REACH = 14.0
// Arc half-window (m) for the near-node leg projection: confine each leg's nearest-foot search to this much
// of the leg either side of its node endpoint, so a curving/looping leg can't contribute a far-branch grade
// (bimodal foot → torn surface). Comfortably covers the pad + gore radius; beyond it a leg has left the node.
const RULE_NODE_WINDOW = 40.0
// Max plausible road grade (rise/run) a leg can climb away from its node — used to reject wrong-branch
// projected grades (a leg looping back, or an unrelated road crossing at a very different height within the
// window). Generous vs the router's real grade cap so it never rejects a genuine leg.
const MAX_LEG_SLOPE = 0.30
// Radial fade (m from node centre) of the junction blend: full inside JN_FADE_IN, gone by JN_FADE_OUT. The
// plaza/gore is a local feature; past FADE_OUT the legs have diverged into separate roads and must NOT be
// blended (that raised gore steps where two unrelated roads cross far from the node). FADE_IN covers the
// pad + near gore; FADE_OUT is set past the trident's slow-diverging crease (~r24) but short of where legs
// become distinct roads (~r40+).
// JUNCTION DECK HOLD (owner ruling 2026-09-07, junction-stitch's last 66): a leg leaving a node RIDES
// THE JUNCTION PLANE until its pavement has parted from every sibling leg's pavement, and only then
// recovers its own grade. Two ribbons that still overlap the same ground must be at the same height
// — the pad plane — or the drawn asphalt is a lip (median 1.3 m at 12 m out, measured on the
// shipped series). JN_HOLD_MARGIN: edge-to-edge daylight (m) that counts as "parted" — a touch is
// not a part. JN_HOLD_MAX_PLANE: the furthest a hold onto a site node's PAD PLANE may reach — the
// plane is the pad's model of the ground, and 60 m out it was 7 m off a leg that hugs a 13 %
// trunk (seed 7 (-1663,1613), measured); a pair still overlapping past 30 m is a merge shape,
// not a junction gore, and the leg is better off on its own line. JN_HOLD_MAX_SURFACE: the
// reach when the target is a promoted T's TRUNK SURFACE, which is the sibling itself and stays
// right as long as the two share ground. Both feed _junctionHoldReach; the fade below is the
// CARVE's inter-leg blend and is a separate reach.
const JN_HOLD_MARGIN = 1.0
const JN_HOLD_MAX_PLANE = 30.0
const JN_HOLD_MAX_SURFACE = 60.0
const JN_FADE_IN = 22.0
const JN_FADE_OUT = 34.0
// Junction-pad ring geometry (moved from road-mesh.js so the CARVE path is the single source of the
// welded pad boundary — the mesh now reads road.js's cached node.ring). Not road* params (no route-sig
// effect). STRAIGHT_GAP: angular gap (rad, ~155°) past which a consecutive-leg corner is a through
// road's back side. LEGACY_PAD_FLARE: mouth flare (× halfWidth) for the circle-pad fallback ring.
const STRAIGHT_GAP = 2.7
const LEGACY_PAD_FLARE = 1.6

// BUG-56 workstream C: the RE-ROUTE ladder — how much harder each rung prices grade than the
// ordinary route. wGrade sets the grade the search WANTS (g* = 1/sqrt(wGrade)); ×2 moves it from
// 7.5 % to 5.3 %, ×6 to 3.1 %. A LADDER, not one number, and the first rung that solves wins: a
// harder price buys a longer, gentler corridor, and a longer corridor is one that wanders further
// from the line the graph asked for. Measured 2026-08-27 — jumping straight to ×6 on seed 6
// g:8,1,0:9,1,0 fixed the grade (106 % -> 32 %) and put the new line 1.3 m from its sibling for
// 158 samples, which is graph-topology's corridor-clearance red. Take the gentlest deviation that
// works. Not a cap change: gMaxRoad is untouched, per the owner's ruling that tightening it trades
// away connectivity.
const HARD_GRADE_RUNGS = [2, 3, 6]
// (THROAT_* and _throatSweep — the narrow-gore OUTWARD sweep that paved a Y-throat until its ribbon
// inner edges were a road width apart — were deleted 2026-09-07. Pad reach is now a property of the
// legs themselves: each leg's cutback runs out to where its pavement has PARTED from every sibling's
// (_legPartingReach, the same walk the deck hold uses), so the mouth chords never overlap, the exact
// weld no longer self-intersects at a narrow throat, and the gore is paved exactly to the parting
// point — the owner's ruling for BUG-59, over "a road width apart" and over the 13.5 m floor.)
// PAD_RIM_HOLD: full-depth carve band OUTSIDE the pad ring (m) — ≥ the terrain-grid cell diagonal
// (1 m grid → 1.42 m) so no terrain triangle straddling the ring boundary can interpolate above the
// pad asphalt (see _junctionPadCarve). Hardcoded: geometry only, no route-cache-signature effect.
const PAD_RIM_HOLD = 1.6
// PAD_DIRT_EXTRA: extra dirt depth (m, beyond roadClearanceMargin) under the pad + rim-hold band —
// keeps the 1 m-grid terrain triangles below the asphalt where the ruled plaza surface bends inside
// one cell (linear dirt interpolation rides the bend's convex hull and would poke through a bare
// clearanceMargin=0.15). PERF-25: this used to be paired with a 5-point neighbourhood-MIN of the top
// field (PAD_TOP_MIN_R) that dynamically ducked the dirt under free-resolve creases; the pad surface
// is now the resolve-free, position-continuous _nodeSurfaceTop, which has no free-resolve crease
// class, so the fixed margin is the whole armor. Physics is unaffected: inside the ring the truck
// rides the asphalt top (padTopY overlay in _sampleCarveWorld), not this dirt. Hardcoded (no
// route-cache-signature effect).
const PAD_DIRT_EXTRA = 0.15
// PAD_DUCK_CAP: max the pad may LOWER dirt below the leg cross-section's own design (m). The pad's
// crease-duck free-resolves the top field, which carries pre-existing multi-metre tears at a couple of
// degenerate steep nodes; uncapped, those tears leak into an otherwise-smooth pinned cross-section
// (shoulder-lateral-continuity's plaza tolerance is 0.70 m). The two CONSUMERS of the duck need
// different caps — that's why there are two constants (the pad rim is a sanctioned mesh↔physics
// difference region, same class as the on-ribbon decal overlay):
//   - MESH dirt (terrain _buildCarveTable → _mergeCarve default): must get fully UNDER the creased
//     asphalt or the tan interp slivers poke through the pad (the rim earthwork fix). Pre-camber-rework
//     creases measured ≤ ~0.45 (old cap 0.55 was enough), but the saturating-camber model
//     (camberFromCurvature) banks sweeper leg mouths harder — legitimate creases now reach ~1.05 m at
//     the seed-6 trident rim. 1.2 admits every measured camber-era crease with margin while still
//     clamping the multi-metre degenerate-node tear leak.
//   - PHYSICS (_sampleCarveWorld passes PAD_DUCK_CAP_PHYS): a pinned/hinted resolve's cross-section is
//     SMOOTH by design (BUG-15), and the duck's reference field (free-sampled topMin) JUMPS at crease/
//     tear lines — any duck deeper than ~0.55 puts that jump into the pinned cross-section as a single
//     step > the 0.70 plaza tolerance. 0.55 keeps every pinned step under it; the wheel consequence is
//     only that in tiny crease∩rim-hold dirt patches physics rides ≤ ~0.65 above the drawn dirt
//     (momentary, at pad rims — the same accepted trade as the decal overlay riding above the trough).
const PAD_DUCK_CAP = 1.2
const PAD_DUCK_CAP_PHYS = 0.55
// QUAL-16 (junction-flow) DEG2_HERMITE_TENSION: cubic-Hermite tangent magnitude, × the mouth-to-mouth
// gap, for the deg-2 connector's rung-2 fallback (_buildDeg2ArcGeom). 1.0 (tangents as long as the
// chord) is the standard chord-length parameterisation: it reproduces a gentle arc to within a few cm
// over the ~20–25 m gaps a connector spans, and degrades gracefully into an S (laterally offset mouths)
// or a U (near-antiparallel legs) — the two shapes the single tangent circle cannot express at all.
// Hardcoded, NOT a road* param (carve-time geometry only, no route-cache-signature effect).
const DEG2_HERMITE_TENSION = 1.0
// DEG2_SHARP_* (junction-flow stage 3): a SHARP deg-2 kink read as a fat blob, not a bend. The
// tangent-circle fillet takes the largest radius that fits between the two mouths, and with the
// mouths pinned at cutback + halfWidth/2 a ~93° kink leaves only R = 7.9 against a 5 m half-width
// (seed-6 1900.7,831.0) — an inner edge radius of 2.9 m, i.e. a swept lobe rather than a road bend.
// A real road spreads a sharp bend over MORE length, so pull both mouths further back along their
// legs as the kink sharpens: t and r (mouth→intersection distances) grow ~1:1 with the pullback, so
// the tangent length Lt and hence R grow with them. Ramped in over DEG2_SHARP_IN..DEG2_SHARP_FULL so
// gentle kinks — and every existing seed-6 connector below 60° — are untouched; the existing
// min(…, len·0.45) mouth cap clamps it on short legs, which degrade gracefully to their old, tighter
// fillet. Hardcoded, NOT road* params (carve-time geometry only, no route-cache-signature effect).
const DEG2_SHARP_IN = 60 * Math.PI / 180
const DEG2_SHARP_FULL = 100 * Math.PI / 180
const DEG2_SHARP_PULLBACK = 8.0
// XS_SOFT (junction-flow stage 5): the softening radius (m) in the deg-2 connector's cross-section
// blend weight 1/(gap² + XS_SOFT²), gap = the query's distance to that leg's asphalt EDGE
// (_connectorDesignAt). Over a lead-in gap ≡ 0 across the full road width, so that leg's weight is
// 1/XS_SOFT² while its sibling — a road-width away at the mouth — is ~100× smaller: the connector's
// cross-section there IS that ribbon's, to the millimetre. Deliberately sharper than the
// centreline-distance weight it replaced: a grade may safely average across the throat (both legs are
// welded to one node Y there), but banking must not — averaging it is exactly the flat strip this stage
// removes — and the weld to each ribbon has to be exact, not approximate.
const XS_SOFT2 = 0.5 * 0.5
// XS_OFF_FADE (BUG-40): the distance (m) over which a deg-2 connector leg's weight fades to zero once
// the query lies PAST that leg's own terminus (_projectOntoRun overDist). Off its end a leg has no
// grade to report — runProfile CLAMPS to the endpoint sample, i.e. a fictitious horizontal extension of
// that leg out over its sibling. On an ordinary elbow that fiction is harmless: the sibling is a road-
// width away so its 1/(gap²+XS_SOFT²) weight is ~1%. On a TIGHT kink the two legs' asphalt overlaps, the
// sibling's gap-to-edge is 0 on the leg you are actually driving on, and the fiction lands at HALF
// weight — measured 0.43 m of lift 4.7 m short of the seed-6 41,619 node, a +42% grade spike against a
// +13% approach that launches the truck (~5.7 g of surface curvature at 20 m/s). Fading on the
// CONTINUOUS overDist (not the offEnd boolean) keeps the design surface C0/C1: at its own mouth a leg
// has overDist 0 ⇒ weight 1 ⇒ the weld to that ribbon is exact and unchanged.
const XS_OFF_FADE = 4.0
// Reusable sinks for the connector design-surface path (carve hot path — no per-query allocation).
const _CD_A = { grade: 0, gap: 0, xs: 0, off: 0 }
const _CD_B = { grade: 0, gap: 0, xs: 0, off: 0 }
const _CD_OUT = { grade: 0, lateral: 0 }
const _CD_RP = { gradeY: 0, camberRad: 0, tx: 1, tz: 0 }
// FEAT-46 POI_ROAD_FEATHER: band (m) OUTSIDE the ribbon+shoulder across which a POI lay-by pad's
// authority ramps 0 → 1 (see _poiPadCarve). This is not a look tunable — it is the mechanism that
// makes the ratified "POIs never influence routing determinism" rule structural: a pad has exactly
// zero authority at and inside the shoulder edge, so it can never move the ribbon, its shoulder or
// its camber, and the same seed drives identically in free roam and story mode. Gated by the
// resolved lateral distance, so it holds for every pad position without per-pad tuning.
const POI_ROAD_FEATHER = 2.0
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
 * XZ 2-D segment intersection test. Returns the crossing point + parametric positions
 * {x, z, t, u} (t along segment A, u along segment B — both ∈ (0,1)) or null if
 * the segments are parallel, collinear, or only touch at an endpoint.
 * Open-interval test (t, u ∈ (1e-6, 1−1e-6)) means shared endpoints are NOT
 * counted as crossings — the caller's self-crossing removal / junction detection
 * logic handles endpoint touching cases separately.
 *
 * Pure function of its inputs — no allocations, no side effects.
 * Module scope so the crossing classifier (_detectJunctions) can reuse it to find inter-run
 * (and self-run) crossings across this._network without duplicating the math; t/u let the caller
 * interpolate each strand's Y and arc position at the crossing.
 *
 * @param {number} ax — segment A start X
 * @param {number} az — segment A start Z
 * @param {number} bx — segment A end X
 * @param {number} bz — segment A end Z
 * @param {number} cx — segment B start X
 * @param {number} cz — segment B start Z
 * @param {number} dx — segment B end X
 * @param {number} dz — segment B end Z
 * @returns {{x:number, z:number, t:number, u:number}|null}
 */
function _segCrossParam(ax, az, bx, bz, cx, cz, dx, dz) {
    const ex = bx - ax, ez = bz - az
    const fx = dx - cx, fz = dz - cz
    const denom = ex * fz - ez * fx
    if (Math.abs(denom) < 1e-10) return null  // parallel/collinear
    const t = ((cx - ax) * fz - (cz - az) * fx) / denom
    const u = ((cx - ax) * ez - (cz - az) * ex) / denom
    if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) {
        return { x: ax + t * ex, z: az + t * ez, t, u }
    }
    return null
}

/**
 * BUG-53 merge machinery: nearest point on a sampled polyline in XZ, with its cumulative arc.
 * Used to place a merge's fork ABREAST on both runs and to measure the conflict separation.
 * `lo`/`hi` bound the search to an arc window — without one, a run that loops back can answer a
 * fork lookup with a point from the wrong end of itself.
 * @returns {{d: number, cum: number, y: number}}
 */
function _nearestOnPolyXZ(px, pz, pts, polyCum, lo = -Infinity, hi = Infinity) {
    let d = Infinity, cum = 0, y = 0, tx = 1, tz = 0, fx = px, fz = pz
    for (let i = 1; i < pts.length; i++) {
        if (polyCum[i] < lo || polyCum[i - 1] > hi) continue   // outside the searched arc window
        const a = pts[i - 1], b = pts[i]
        // triangle inequality: no point of this segment can beat `d` if its start is further away
        // than d plus the segment's own length. Cheap, and it skips most of a long run.
        if (Math.hypot(px - a.x, pz - a.z) - (polyCum[i] - polyCum[i - 1]) > d) continue
        const ex = b.x - a.x, ez = b.z - a.z
        const l2 = ex * ex + ez * ez
        const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((px - a.x) * ex + (pz - a.z) * ez) / l2)) : 0
        const qx = a.x + t * ex, qz = a.z + t * ez
        const dd = Math.hypot(px - qx, pz - qz)
        if (dd < d) {
            d = dd; cum = polyCum[i - 1] + t * (polyCum[i] - polyCum[i - 1]); y = a.y + t * (b.y - a.y)
            // tx/tz — the unit XZ tangent of the winning segment, in the polyline's own direction.
            // Callers that copy a RUN-FRAME quantity across two runs (camber, BUG-56 B4) need it to
            // tell whether the two runs walk this ground the same way round.
            const l = Math.sqrt(l2) || 1
            tx = ex / l; tz = ez / l
            fx = qx; fz = qz
        }
    }
    return { d, cum, y, tx, tz, fx, fz }
}

/**
 * BUG-53 merge machinery: the VERTEX a splice will actually sit next to. `after` false asks for the
 * last vertex on the node side of `cut` (what a ceded head ends on); `after` true asks for the first
 * vertex past it (what the loser's own geometry resumes at). Mirrors the assembly's SPLICE_EPS rule
 * exactly, so a tangent welded here matches the segment that gets built.
 */
function _spliceNeighbourDir(S, cut, dir, count = 1) {
    const pts = S.pts, pc = S.polyCum
    const out = []
    if (dir > 0) { for (let i = 0; i < pts.length && out.length < count; i++) if (pc[i] > cut + SPLICE_EPS) out.push(pts[i]) }
    else { for (let i = pts.length - 1; i >= 0 && out.length < count; i--) if (pc[i] < cut - SPLICE_EPS) out.push(pts[i]) }
    return out.length ? out : null   // nearest-to-the-cut FIRST
}

function _spliceNeighbour(S, cut, nodeAtStart, after, count = 1) {
    const pts = S.pts, pc = S.polyCum
    const wantHigh = nodeAtStart ? after : !after
    const out = []
    if (wantHigh) { for (let i = 0; i < pts.length && out.length < count; i++) if (pc[i] > cut + SPLICE_EPS) out.push(pts[i]) }
    else { for (let i = pts.length - 1; i >= 0 && out.length < count; i--) if (pc[i] < cut - SPLICE_EPS) out.push(pts[i]) }
    return out.length ? out : null   // nearest-to-the-cut FIRST
}

/** BUG-53 merge machinery: unit XZ vector, with a safe zero-length fallback. */
function _unitXZ(x, z) {
    const l = Math.hypot(x, z) || 1
    return { x: x / l, z: z / l }
}

/**
 * BUG-56 B0: convex hull of XZ points, monotone chain, CCW, no repeated endpoint. A hull is simple
 * by construction, which is the whole point of it here — it is the one pad boundary that cannot
 * self-intersect, so it can be the floor under a ladder whose every other rung is allowed to fail.
 */
function _convexHullXZ(pts) {
    if (pts.length < 3) return null
    const P = pts.slice().sort((a, b) => (a.x - b.x) || (a.z - b.z))
    const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)
    const half = (src) => {
        const h = []
        for (const p of src) {
            while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 1e-9) h.pop()
            h.push(p)
        }
        h.pop()
        return h
    }
    const hull = [...half(P), ...half(P.slice().reverse())]
    return hull.length >= 3 ? hull : null
}

/** BUG-53 merge machinery: sample a polyline at a cumulative arc (clamped at both ends). */
function _polyAtCum(pts, polyCum, cum) {
    const n = polyCum.length
    if (cum <= polyCum[0]) return { x: pts[0].x, y: pts[0].y, z: pts[0].z }
    if (cum >= polyCum[n - 1]) return { x: pts[n - 1].x, y: pts[n - 1].y, z: pts[n - 1].z }
    let lo = 0, hi = n - 1
    while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (polyCum[mid] <= cum) lo = mid; else hi = mid }
    const span = polyCum[lo + 1] - polyCum[lo] || 1
    const t = (cum - polyCum[lo]) / span
    return { x: pts[lo].x + (pts[lo + 1].x - pts[lo].x) * t,
             y: pts[lo].y + (pts[lo + 1].y - pts[lo].y) * t,
             z: pts[lo].z + (pts[lo + 1].z - pts[lo].z) * t }
}

/**
 * BUG-53 merge machinery: unit XZ tangent at a cumulative arc, oriented AWAY FROM THE NODE
 * (`fwd` false flips it, for a run spelled with its node at the far end).
 */
function _polyTangentAtCum(pts, polyCum, cum, fwd) {
    const a = _polyAtCum(pts, polyCum, cum - 4), b = _polyAtCum(pts, polyCum, cum + 4)
    const ex = b.x - a.x, ez = b.z - a.z
    const l = Math.hypot(ex, ez) || 1
    const s = fwd ? 1 : -1
    return { x: s * ex / l, z: s * ez / l }
}

/**
 * BUG-55 pair census: min XZ distance between two segments (0 when they properly cross). Used to
 * test node-to-node CHORDS for candidate conflict partnership — cheap, and a pure function of the
 * site positions, so the candidate set is identical from every window.
 */
function _segSegDistXZ(a, b, c, d) {
    const d1x = b.x - a.x, d1z = b.z - a.z, d2x = d.x - c.x, d2z = d.z - c.z
    const den = d1x * d2z - d1z * d2x
    if (Math.abs(den) > 1e-12) {
        const t = ((c.x - a.x) * d2z - (c.z - a.z) * d2x) / den
        const u = ((c.x - a.x) * d1z - (c.z - a.z) * d1x) / den
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0
    }
    const pt = (px, pz, sx, sz, ex, ez) => {
        const vx = ex - sx, vz = ez - sz
        const l2 = vx * vx + vz * vz
        const tt = l2 > 1e-12 ? Math.max(0, Math.min(1, ((px - sx) * vx + (pz - sz) * vz) / l2)) : 0
        return Math.hypot(px - (sx + tt * vx), pz - (sz + tt * vz))
    }
    return Math.min(pt(a.x, a.z, c.x, c.z, d.x, d.z), pt(b.x, b.z, c.x, c.z, d.x, d.z),
                    pt(c.x, c.z, a.x, a.z, b.x, b.z), pt(d.x, d.z, a.x, a.z, b.x, b.z))
}

// FEAT-76: the trunk's longitudinal grade VECTOR at vertex i — dy/ds carried on the XZ tangent.
// The promoted node's pad plane is this, exactly: a plane through a point on a built road, tilted
// the way that road is already tilted.
function _trunkGradeAt(T, i) {
    const n = T.points.length - 1
    const j0 = Math.max(0, i - 2), j1 = Math.min(n, i + 2)
    const ds = T.polyCum[j1] - T.polyCum[j0]
    const m = ds > 1e-6 ? (T.points[j1].y - T.points[j0].y) / ds : 0
    const tx = T.points[j1].x - T.points[j0].x, tz = T.points[j1].z - T.points[j0].z
    const tl = Math.hypot(tx, tz) || 1
    return { gx: m * tx / tl, gz: m * tz / tl }
}

// FEAT-76: the polyline VERTEX index nearest an arc position. A T is split at a real vertex, never
// between two, so the promoted node names a point that exists in the geometry — the id, the pad
// plane, the junction cluster and both trunk halves then agree exactly instead of to within a lerp.
function _nearestVertexAtCum(polyCum, cum) {
    const n = polyCum.length
    let lo = 0, hi = n - 1
    while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (polyCum[m] <= cum) lo = m; else hi = m }
    return (cum - polyCum[lo] <= polyCum[hi] - cum) ? lo : hi
}

/** BUG-53/55 merge machinery: polyCum → clArc, the paired-table interpolation. */
function _clArcOfCum(S, cum) {
    const pc = S.polyCum, ca = S.clArc, n = pc.length
    let lo = 0, hi = n - 1
    while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (pc[mid] <= cum) lo = mid; else hi = mid }
    const span = pc[lo + 1] - pc[lo] || 1
    return ca[lo] + (ca[lo + 1] - ca[lo]) * (cum - pc[lo]) / span
}

/**
 * BUG-53/55: a WINNER bore near the fork blocks the merge (the taper band would fight the
 * portal); bores deeper inside the adopted stretch are fine — the tunnel is simply shared, the
 * winner provides tube + collider, and the loser is excluded from resolve there. The LOSER's own
 * bores need no guard at all: a ceded strand is replaced wholesale (its bore vanishes with it)
 * and the outer re-solve makes fresh spans.
 */
function _winnerBoreAtFork(S, nodeAtStart, cutCum) {
    if (!S.spans) return false
    const cutCl = _clArcOfCum(S, cutCum)
    const a = nodeAtStart ? cutCl - 30 : cutCl
    const b = nodeAtStart ? cutCl : cutCl + 30
    return S.spans.some((sp2) => sp2.s1 > a && sp2.s0 < b)
}

/**
 * BUG-55: the conflict walk, anchored on the INTERVAL rather than a node. WHERE do P and Q stay
 * one road? Every maximal interval in which P's samples sit within PROX of Q's polyline, each
 * already extended across its FLARES (a stretch where they swing apart and come back — one road
 * with a bulge, not two roads going different places). Intervals are in P's arc, measured from
 * P's start when `fromStart`, else from its end — the node-anchored planner passes its
 * node-at-start flag so interval [0] starts at the shared node exactly as before; the pair census
 * walks disjoint pairs with `fromStart` true. `onFlare` fires when a flare exceeds the bound
 * (genuinely two roads) so the planner's skip-and-count telemetry stays attached.
 */
// FEAT-77: `near(pa, hit)` is the CONFLICT PREDICATE (RoadSystem._v2Near) — the old fixed PROX
// became a function of the two samples' heights and the earthwork between them. FLARE stays a
// plain distance: it bounds how far the pair may swing apart inside a gap, not whether they touch.
function _conflictIntervalsXZ(PS, fromStart, QS, near, GAPM, FLARE, onFlare) {
    const n = PS.pts.length
    const idx = (k) => (fromStart ? k : n - 1 - k)
    const arcAt = (k) => (fromStart ? PS.polyCum[idx(k)] : PS.L - PS.polyCum[idx(k)])
    let lastD = Infinity
    const nearAt = (k) => {
        const pa = PS.pts[idx(k)]
        const h = _nearestOnPolyXZ(pa.x, pa.z, QS.pts, QS.polyCum)
        lastD = h.d
        return near(pa, h, arcAt(k))
    }
    const out = []
    let k = 0
    while (k < n) {
        while (k < n && !nearAt(k)) k++
        if (k >= n) break
        const s0 = arcAt(k)
        let end = arcAt(k)
        while (k < n && nearAt(k)) { end = arcAt(k); k++ }
        for (;;) {
            let j = k, flare = 0, apart = true
            while (j < n && (apart = !nearAt(j)) && arcAt(j) - end <= GAPM) { flare = Math.max(flare, lastD); j++ }
            if (j >= n || apart) break                  // parted for good
            if (flare > FLARE) { if (onFlare) onFlare(); break } // genuinely two roads
            while (j < n && nearAt(j)) { end = arcAt(j); j++ }
            k = j
        }
        out.push({ s0, s1: end })
    }
    return out
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

// ── Curvature → camber (saturating superelevation model) ─────────────────────
/**
 * Road banking angle as a SATURATING function of curvature, replacing the old linear
 * `camberStrength·κ` (which grew unboundedly with curvature and had to be hard-clamped, so a
 * single gain over-banked hairpins the moment gentle curves got any bank at all).
 *
 *   camber(κ) = maxRad · |κ| / (|κ| + κ_half)      (sign carried from κ)
 *
 * Properties (this is the "fundamental change", not a variable-rate patch):
 *   • Straight (κ→0):        camber → 0, linear with gain maxRad/κ_half.
 *   • Knee (|κ| = κ_half):   camber = maxRad/2  — κ_half = 1/kneeRadius sets where half-bank lands.
 *   • Tight (|κ|→∞):         camber → maxRad (asymptote) — hairpins PLATEAU, never exceed maxRad,
 *                            so no separate clamp is needed (the function is self-bounding).
 *   • Effective gain camber/κ = maxRad/(|κ|+κ_half) DECREASES with curvature → more bank per unit
 *     curvature on sweepers/long curves, less on hairpins (the requested feel).
 *
 * Defaults maxAngle 20° + kneeRadius 60 m fit ~4/10/15 effective strength at hairpin/50 m/long.
 * SHARED by _computeCamberArrays (ribbon/carve) and _buildRunProfile (physics) so the two stay
 * byte-identical (restream-invariance / mesh==physics).
 *
 * @param {number} kappa   — signed curvature (1/m)
 * @param {number} maxRad  — asymptotic max bank (radians)
 * @param {number} kHalf   — half-saturation curvature (1/m) = 1/kneeRadius
 * @returns {number} banking angle (radians), |result| < maxRad
 */
function camberFromCurvature(kappa, maxRad, kHalf) {
    const a = Math.abs(kappa)
    const mag = maxRad * a / (a + kHalf)
    return kappa < 0 ? -mag : mag
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

/**
 * Which router built the roads this build drives on. Stamped into every calibration run export
 * (`rangersim-run-export/2`, mission.js/paper-route.js) for the same reason `par_ref` carries
 * PAR_SLACK: a drive recorded on different ROADS is a drive against a different standard, and a
 * corpus that cannot tell the two apart lets a future refit silently mix them.
 *
 * That is not hypothetical — it is BUG-41 Stage 2. PAR_REF was fitted 2026-08-16 against human
 * drives on v1 roads; router v2 took over the whole network 2026-08-18 (`7cff01d`) with measurably
 * different geometry (QUAL-28: 10.4% vs 5.2% of length in >200 m straights, 17 switchbacks against
 * 52). Par's dominant dial is corner speed, and v2 changed the corners — so the v1 corpus in `runs/`
 * and a v2 corpus must never be fitted together. Bump this whenever the router's OUTPUT geometry
 * changes enough that old drives stop describing the roads being priced.
 */
export const ROAD_ROUTER_VERSION = 'v2'

// ── PROTOTYPE constants (valley-following streaming trunk — spike) ─────────────
// Non-destructive experimental routing for the Phase-8 redesign. Endless roads as a
// deterministic chain of valley-anchor connections, streamed around the view like terrain.
const PROTO_ANCHOR_SPACING = 256   // m between macro-grid anchors
const PROTO_REGEN_MOVE     = 96    // m — re-stream the trunk once the view center moves this far
const PROTO_SAMPLE_DS      = 4     // m — centerline → polyline sampling spacing (profile/slice/query density)
// BUG-53 merge machinery: minimum spacing at a splice seam. A boundary vertex a centimetre from
// the spliced point leaves a stub segment between two full ones, and the ribbon's centripetal
// Catmull-Rom overshoots that into a corner far tighter than the control polyline shows. The planner
// (which welds the taper's tangents to the real neighbouring vertices) and the registration (which
// drops vertices this close to a splice) MUST use the same value, or the weld is anchored to a
// vertex the assembly then discards.
const SPLICE_EPS = PROTO_SAMPLE_DS * 0.5

// BUG-57 rung (owner re-scope 2026-08-25, session 2): "keep the connection, trim the mess." The
// merge ladder gains TANGLE-ONLY relaxations, gated on this test: a pair whose two pure routes
// PROPERLY CROSS beyond the 30 m shared-node throat is a tangle, not a hairpin (the owner's own
// ruling on the (j) stacks: "tangled messes, not really hairpins"), so for those pairs — and
// only those — the >135° angle guard is waived, the fork may slide outward past the crossings,
// and the taper may abandon the loser's own wiggly course for a DIRECT SPAN. Non-crossing pairs
// take the identical ladder they always did (byte-identical worlds outside tangles).
// The direct-span ladder is long on purpose: a waived 153° fork needs its turn spread over a
// couple hundred metres to clear the 6 m ribbon-fold floor (153° over 240 m ≈ R 90 m).
const DIRECT_SPAN_LADDER = [60, 90, 130, 180, 240, 320]
// Strict proper crossings between two pure samples (open interval — the census convention:
// coincident merged chains touch at shared vertices, an inclusive test counts every touch).
// Pure fn of the two samples; `throat` excludes crossings within 30 m of the shared node.
function _pairProperCrossingsXZ(SA, aNodeAtStart, SB, bNodeAtStart, throat) {
    const out = []
    const pa = SA.pts, ca = SA.polyCum, pb = SB.pts, cb = SB.polyCum
    for (let i = 1; i < pa.length; i++) {
        const ax = pa[i - 1].x, az = pa[i - 1].z, bx = pa[i].x, bz = pa[i].z
        const lox = Math.min(ax, bx), hix = Math.max(ax, bx)
        const loz = Math.min(az, bz), hiz = Math.max(az, bz)
        const rx = bx - ax, rz = bz - az
        for (let j = 1; j < pb.length; j++) {
            const cx = pb[j - 1].x, cz = pb[j - 1].z, dx = pb[j].x, dz = pb[j].z
            if (Math.max(cx, dx) < lox || Math.min(cx, dx) > hix
                || Math.max(cz, dz) < loz || Math.min(cz, dz) > hiz) continue
            const sx = dx - cx, sz = dz - cz
            const den = rx * sz - rz * sx
            if (Math.abs(den) < 1e-12) continue
            const t = ((cx - ax) * sz - (cz - az) * sx) / den
            const u = ((cx - ax) * rz - (cz - az) * rx) / den
            if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) continue
            const sA = ca[i - 1] + t * (ca[i] - ca[i - 1])
            const sB = cb[j - 1] + u * (cb[j] - cb[j - 1])
            if (throat) {
                const dA = aNodeAtStart ? sA : SA.L - sA
                const dB = bNodeAtStart ? sB : SB.L - sB
                if (Math.min(dA, dB) < 30) continue
            }
            out.push({ sA, sB })
        }
    }
    return out
}

// Corner-facet fix: _resolveRoadSurface refines the WINNING run's frame onto its exact primitive
// centerline (the same curve the ribbon samples) instead of the 4 m polyline, which faceted the dirt
// and staircased collision on sharp corners. W = ±window around the polyline foot; DS = coarse scan
// pitch inside it (Centerline.nearest then does one projection refine). Single-minimum at radius ≥ 12 m.
const ANALYTIC_REFINE_WINDOW = 6   // m
const ANALYTIC_REFINE_DS     = 1.0 // m
// PERF-25: spatial-cell candidate cache for _resolveRoadSurface. The resolver's cost is dominated by
// _projectOntoRun walking the FULL polyline of every run in the 3×3 tile block (hundreds of segments)
// for every physics sample — on a junction pad that is 6 resolves per wheel query (centre + the pad's
// 5-point neighbourhood-MIN), and mm suspension jitter defeats any result memo (PERF-24's exact-key
// memo only collapses EXACT repeats). Fix: cache, per RESOLVE_CELL-sized cell, the candidate runs and
// the SEGMENT-INDEX WINDOWS that can possibly matter for any query in the cell, then evaluate the
// exact projection at (wx,wz) restricted to those windows. The QUERY is never quantized (the PERF-24
// hard rule) — the cell key only selects which precomputed windows to scan; the maths at (wx,wz) is
// bit-identical to the full scan whenever a candidate is accepted (proof at _resolveCellCands).
const RESOLVE_CELL       = 8    // m — cell size; must divide CHUNK_SIZE so a cell never straddles blocks
// Acceptance-radius safety factor: every candidate _resolveRoadSurface can ACCEPT lies within
// ~1.14 × footHW of the query (interior feet have dist == |lat| ≤ footHW; vertex-clamped feet on a
// smooth polyline (PROTO_SAMPLE_DS 4 m at min radius ≥ 8 → per-vertex turn ≤ ~29°) satisfy
// lat ≥ dist·cos 29°; run-END clamps are offEnd-gated at endHW < footHW; rival vertex clamps are
// rejected by its own along<2 m gate). 1.2 covers the bound with margin.
const RESOLVE_ACC_SAFETY = 1.2
const RESOLVE_CELL_CAP   = 384  // cells kept before the map is cleared (bounded, like carveHint)
// FEAT-40 self-overlap crease blend: a winding run that passes ITSELF within the resolver
// footprint (switchback wrapping a spur) makes the nearest-pass projection FLIP arcs at the
// equidistant line — with tunnel-era deep earthwork (15–25 m cuts/fills) that flip is a 25 m
// surface cliff the terrain grid renders as accordion pleats. The resolver therefore also
// projects the winning run EXCLUDING ±RIVAL_ARC_SEP around the winning arc; when that far pass
// lands within CROSS_BLEND_BAND of the winner's lateral distance, the two cross-sections are
// cross-faded (off-ribbon only) so the seam is a bank, not a teleport.
const RIVAL_ARC_SEP    = 40   // m — min arc separation for a projection to count as a distinct pass
const CROSS_BLEND_BAND = 12   // m — lateral-distance band over which the two passes cross-fade
// FEAT-40 bore notch: inside a bore span the terrain SKIN (Y-less / above-apex probes) is not
// simply raw — near each mouth the open cut's cross-section continues with its floor RISING at
// this V:H slope per metre into the span, capped at raw. The mouth face is therefore a graded
// funnel (renders clean on the height grid) instead of a footprint-wide vertical stop face at
// the portal line, and the surface is C0 straight through the portal. The below-crown part of
// the funnel sits inside the shader discard capsule; the collar hides the fringe.
const BORE_NOTCH_SLOPE = 1.2  // V:H — mouth-funnel floor rise per metre into the bore
// QUAL-24 dangling run end: arc-length (m) over which a run's carve footprint EXTRA (the FEAT-40
// deep-bank toe) feathers away as it approaches a terminus that is a graph LEAF (degree-1 site — a
// road that genuinely stops, not a junction and not an end whose neighbour merely hasn't streamed).
// Beyond the terminus the cross-section also folds RADIALLY (see _carveCrossSection), so a dead end
// reads as a modest gravel turnaround with an ordinary embankment nose instead of the full-width
// 18 m plateau + vertical stop face the un-folded, lat-only cross-section left there.
const LEAF_END_TAPER = 30     // m
const PROTO_SNAP_CAP       = PROTO_ANCHOR_SPACING * 0.45  // m — max anchor gradient-descent displacement (keeps anchors in their lane → fewer parallel/duplicate roads)
const PROTO_PARAM_DEBOUNCE = 160   // ms — coalesce slider drags before re-routing

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


// ── Off-thread route pre-warm tuning (PERF-03 Workstream A) ───────────────────
const PREWARM_MARGIN    = 2   // extra macro-cols/rows beyond the streamer band to route AHEAD of need

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
// ── FEAT-76: PROMOTED node identity ────────────────────────────────────────────────────────────
// A promoted node is the point where a side road departs an existing trunk — the T that replaces
// the old wye. It is NOT a blue-noise site, so it has no site id; it needs a synthetic one that
// four modules outside the road system (mission.js, map2d.js, paper-route.js, world-validate.js)
// can carry as an opaque triple.
//
// The id is the millimetre-quantised world XZ with k = -1:
//   · it CANNOT collide with a real site id, structurally — every real candidate index is >= 0.
//     This does not depend on the quantisation being lucky.
//   · it survives the `${a},${b},${c}` / .split(',').map(Number) round trip those modules use, and
//     contains no ':' so the four places that split a run key on ':' are unaffected.
//   · it is window-invariant because the point it names is a VERTEX of the trunk's registered
//     polyline, which is bit-identical in every window (same route, same profile solve, same
//     inputs), AND because WHICH vertex is chosen is decided at plan time on the pure samples
//     (_v2PromotableProbe, BUG-61) — the assembly applies that choice, it never re-ranks. The
//     quantisation is belt-and-braces, not the guarantee.
const PROMOTED_K = -1
const _promotedId = (x, z) => [Math.round(x * 1000), Math.round(z * 1000), PROMOTED_K]
const _isPromotedId = (id) => !!id && id.length === 3 && id[2] === PROMOTED_K

// Samplers over a graded edge polyline: arc s → position / routed design Y.
// `arc` is ANY monotone per-point arc array — the caller picks the domain. edgeParData passes
// `clArc` (the routed centerline arc, exact inverse of the sampling in _assembleGraphEdges) for a
// plain run and `polyCum` (the driven chord-sum arc) for a merged one; see the BUG-41 invariant
// there. Used by edgeParData → par oracle (FEAT-29).
// BUG-53: points-backed stand-in for a trimmed run's centerline — .pointAt(s)/.length over the
// REGISTERED (spliced) polyline, in whichever domain _gradeSampler is given.
function _pointSampler(points, arc) {
    const n = arc.length
    return {
        length: arc[n - 1],
        pointAt(s) {
            if (s <= arc[0]) return { x: points[0].x, z: points[0].z }
            if (s >= arc[n - 1]) return { x: points[n - 1].x, z: points[n - 1].z }
            let lo = 0, hi = n - 1
            while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arc[mid] <= s) lo = mid; else hi = mid }
            const span = arc[hi] - arc[lo]
            const t = span > 1e-9 ? (s - arc[lo]) / span : 0
            return { x: points[lo].x + (points[hi].x - points[lo].x) * t, z: points[lo].z + (points[hi].z - points[lo].z) * t }
        },
        tangentAt(s) {
            const a = this.pointAt(Math.max(arc[0], s - 2))
            const b = this.pointAt(Math.min(arc[n - 1], s + 2))
            const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz)
            return l > 1e-9 ? { x: dx / l, z: dz / l } : { x: 1, z: 0 }
        },
        curvatureAt(s) {
            const h = 3
            const t0 = this.tangentAt(Math.max(arc[0] + h, s - h))
            const t1 = this.tangentAt(Math.min(arc[n - 1] - h, s + h))
            const cross = t0.x * t1.z - t0.z * t1.x
            const dot = Math.max(-1, Math.min(1, t0.x * t1.x + t0.z * t1.z))
            return Math.atan2(cross, dot) / (2 * h)
        },
    }
}

function _gradeSampler(points, arc) {
    const n = arc.length
    return (s) => {
        if (n === 0) return 0
        if (s <= arc[0]) return points[0].y
        if (s >= arc[n - 1]) return points[n - 1].y
        let lo = 0, hi = n - 1
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arc[mid] <= s) lo = mid; else hi = mid }
        const span = arc[hi] - arc[lo]
        const t = span > 1e-9 ? (s - arc[lo]) / span : 0
        return points[lo].y + (points[hi].y - points[lo].y) * t
    }
}

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
        // FEAT-76: the T-promotion tables, rebuilt by every _assembleGraphEdges.
        //   _promoted     nodeKey -> { id, pos, gx, gz }   (a departure node on a trunk; which leg
        //                 is the through road is derived from the built tangents, see _v2PromotedRole)
        //   _promotedAway 'nodeKey|nbrKey'                           (edges that no longer START there)
        this._promoted           = new Map()
        this._promotedAway       = new Set()
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
        this._v2TruncF   = null   // FEAT-68: octave-truncated corridor field re-derives from the new noise
    }

    /** FEAT-68: memoized octave-truncated coarse field (K=3) — the corridor stage's terrain. */
    _v2Trunc() {
        if (!this._v2TruncF) this._v2TruncF = truncatedHeightField(this._noiseCoarse, this._params, V2_TRUNC_K)   // shared with the route Worker's rebuild — see corridor-router.js
        return this._v2TruncF
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
                    }
                }
            }
        }

        return { pts, sampleArcS, sampleRunKeys, sampleCamberSign }
    }

    /**
     * QUAL-16: connector-arc centreline points near a chunk, in the SAME flat stride-5 layout
     * ([x, y=grade, z, 0, 0]) as collectChunkSplinePoints. The terrain carve (_buildCarveTable) appends
     * these to its run-sample probe so its per-vertex distance SKIP doesn't drop a connector's OUTER
     * flank (a bend-outside toe vertex is far from every RUN sample, so without this the mesh leaves the
     * connector's fill/cut bench uncarved → a wall at the asphalt edge, while physics — which has no skip
     * — carves it, breaking mesh == collision). Pure fn of the streamed network (window-invariant).
     */
    collectConnectorSamples(centerX, centerZ, radiusM) {
        if (this._nodeJunctionsRev !== this._networkRev) this._detectNodeJunctions()
        if (!this._deg2ArcTiles || !this._deg2ArcTiles.size) return []
        const out = []
        const r2 = radiusM * radiusM
        const seen = new Set()
        const blk = Math.ceil(radiusM / CHUNK_SIZE)
        const qTileX = Math.floor(centerX / CHUNK_SIZE), qTileZ = Math.floor(centerZ / CHUNK_SIZE)
        for (let dx = -blk; dx <= blk; dx++) for (let dz = -blk; dz <= blk; dz++) {
            const list = this._deg2ArcTiles.get(`${qTileX + dx},${qTileZ + dz}`)
            if (!list) continue
            for (const arc of list) {
                if (seen.has(arc)) continue
                seen.add(arc)
                for (let i = 0; i < arc.points.length; i++) {
                    const px = arc.points[i].x, pz = arc.points[i].z
                    const ex = px - centerX, ez = pz - centerZ
                    if (ex * ex + ez * ez > r2) continue
                    out.push(px, arc.grades[i], pz, 0, 0)   // stride 5: [x, y, z, tx, tz]
                }
            }
        }
        return out
    }

    /**
     * Clear cached road data and remove any debug lines from the scene.
     * Clears the valley-trunk network and proto caches (the per-tile caches are gone).
     */
    invalidateCache() {
        // ── PERF-30: stale-until-replaced (param change) ─────────────────────────
        // With a network Worker wired and a warm network up, DEFER the destructive half of the
        // invalidation: keep the network/tiles/viz/generation/rev exactly as they are — the world
        // the player is driving stays coherent (rev-keyed caches still match the geometry they
        // were computed from) — and clear only the route-derivation caches (_invalidateProto: the
        // epoch bump discards in-flight replies, and sites/graph/cls re-derive under the new
        // params). adoptNetwork() then performs the WHOLE swap atomically: new network, rev bump,
        // and the _generation bump (regen:true) that signals ribbon + carve to rebuild.
        // Transient caveat, accepted: until the reply lands, an UNCACHED query against the stale
        // network re-derives sites/degrees under the new params (rev-cached answers — profiles,
        // pad planes — are unaffected, and a slider drag rarely moves the window mid-flight).
        if (this._networkDispatch && this._network && this._network.size > 0) {
            this._invalidateProto()
            const c = this._networkCenter
            this._networkDispatch({ x: c ? c.x : 0, z: c ? c.z : 0, radius: this._proto.radius, reason: 'params' })
            return
        }
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
        // PERF-30: the per-frame path may DEFER a real rebuild to the network Worker
        // (stale-until-replaced); every other caller (ensureTile, spawn resolve) builds
        // synchronously because it needs the answer now.
        this._streamNetwork(center, true)
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
        // Clip the viz to the streamed radius: a graph edge with one in-band endpoint is carried in
        // FULL out to its far node (up to ~1.4 km at a 320 m stream), but terrain chunks + the ribbon
        // mesh only render the chunk ring (~the stream radius). Drawing the whole edge leaves centerline
        // segments hanging in the sky past the rendered world (the "floating centerlines"). Split each
        // slice into runs of points within `radius` of the stream center so only on-terrain spans draw.
        const cen = this._networkCenter
        const R = this._proto.radius || 0
        const inR = (p) => !cen || R <= 0 || ((p.x - cen.x) ** 2 + (p.z - cen.z) ** 2) <= R * R
        const emit = (run) => {
            if (run.length < 2) return
            for (const p of run) p.y += 0.5   // routed spline Y + 0.5 m lift (continuous truth)
            const line = _buildDebugLine2(run, 0x00e5ff)
            line.visible = this._debugVisible
            this._scene.add(line)
            this._debugLines.push(line)
        }
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
                // Break the polyline at the clip boundary → emit only the in-radius runs.
                let run = []
                for (const p of seg) {
                    if (inR(p)) { run.push(p) }
                    else if (run.length) { emit(run); run = [] }
                }
                emit(run)
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
        // FEAT-68: the D-09 cost-weight block (_proto.params: wDist/wAlt/wGrade/wOver/wTurn/
        // maxGrade/minTurnRadius) and its per-re-stream _refreshParams() copy are GONE with the
        // arc-lattice router that priced with them. v2's prices live in RANGER_PARAMS.roadV2 and
        // reach the router (main thread AND Worker) through the route spec — nothing to refresh.
        this._proto = {
            paramDirtyAt: 0,
            radius:   640,                                   // m — streamed road radius (set from terrain stream radius)
            anchors:  new Map(),                             // "mx,mz" → THREE.Vector3 (raw valley-snapped, pre-merge)
            mergedAnchors: new Map(),                        // "mx,mz" → THREE.Vector3 (FEAT-10 merged graph node)
            sites:    new Map(),                             // FEAT-13 v2: "cmx,cmz" → blue-noise candidate sites
            aliveSites: new Map(),                           // FEAT-13 v2: "cmx,cmz" → Poisson-disk-accepted sites
            graph:    null,                                  // FEAT-13 v2: current band Urquhart {sig, edges, adj, key}
            nodeInc:  new Map(),                             // FEAT-13 v2: site-key → [runKey,…] incident registered edges
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

        // Crossing classifier cache (P9 plan 04 — SURF-07; reworked into the FEAT-07/08/11/13 classifier).
        // key nodeKey "<round(x)>,<round(z)>" → { pos: THREE.Vector3, legs: [{runKey, segIdx, dir}],
        //   nodeY: number, simpleMerge: bool, kind, dY, angle, under, over, records: [...] }
        // Pure function of this._network — deterministic + window-invariant by transitivity (D-16).
        // Cleared on re-stream (same site as this._tiles.clear()).
        this._junctions = new Map()
        // PERF: memo key for _detectJunctions, keyed by _networkRev like every other cache in this
        // file (_hintCache / _cellCands / _nodeJunctionsRev / _degreeDropsMemo). -1 = never computed.
        // Replaced an identity guard whose extra `_junctions.size > 0` clause silently defeated the
        // whole memo in graph mode (where zero crossings is the CORRECT answer) — see _detectJunctions.
        this._junctionsRev = -1
        this._crossingList = []      // flat per-crossing classified records (rebuilt with _junctions)
        // FEAT-07 Step 2: per-run index of AT_GRADE mid-span crossings to flatten toward {arc, nodeY}.
        this._crossingsByRun = new Map()   // runKey → [{ arc, nodeY, slope }] (rebuilt with _junctions)

        // FEAT-46: story-mode POI lay-by pads, pushed in by src/poi.js AFTER routing (setPoiPads).
        // null in free roam and in every headless gate ⇒ _poiPadCarve returns immediately and the
        // carve is bit-identical to a build without POIs. This is the seam that keeps the ratified
        // "POIs never influence routing determinism" rule true rather than merely intended.
        this._poiPads = null
        // FEAT-45: camp pads, pushed in by main.js when the player makes camp. Same record shape and
        // the SAME carve — _padsAll is the merged list every pad consumer reads, so there is exactly
        // one pad mechanism and a camp bench is a lay-by that happens to have been dug at runtime.
        this._campPads = null
        this._padsAll = null

        // ── Off-thread route pre-warming (PERF-03 Workstream A) ──────────────────
        // warmBandComplete() asks a Worker to route the connections the streamer will soon need and
        // posts the resulting primitives back; ingestRoutedConnections() drops them into _proto.cls. The
        // synchronous _streamNetwork then finds cache HITS instead of paying the 12–21 ms arc search
        // on a macro-cell crossing — the routing hitch moves off the main thread. If no dispatcher is
        // set (headless gates, or before wiring) routing stays fully synchronous: identical behaviour,
        // so the invariance/restream gates are untouched. _routeEpoch tags each dispatch so a reply
        // from before a re-route (cls cleared) is discarded as stale.
        this._routeDispatch  = null        // (jobs, epoch) => post to Worker; set via setRouteDispatcher
        this._networkDispatch = null       // PERF-30: ({x,z,radius,reason}) => network Worker build; set via setNetworkDispatcher
        this._pendingRoutes  = new Set()   // cls keys requested from the Worker, awaiting a reply
        this._routeEpoch     = 0           // bumped on every _invalidateProto (param/route change)
        this.warmPlanDemand  = false       // PERF-31 W2: opt-in — warmBandComplete also warms the plan layer's route demand (worker pre-warm only; see _warmPlanJobs)
        this._urqMemo        = new Map()   // PERF-26: sig -> graph for the persist=false builds
    }

    // (08-07) The proto-only viz API (setProtoEnabled / setProtoParam / setProtoRadius / updateProto)
    // is retired — there is ONE viz now, toggled by setDebugVisible + driven by update()/buildDebugLines.
    // Live edits arrive by debug sliders mutating this._params in place; the next re-stream reads
    // them straight off it (v2 keeps no derived copy of the weights).
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
     * Does the STREAMED network actually reach (x, z)?
     *
     * The carve and the ribbon read the network; when it does not cover a point, "no road here" and
     * "the road has not arrived yet" are indistinguishable to them. That ambiguity is the whole of
     * the teleport bug: jump to a spot the current window does not cover, terrain streams in and
     * carves flat (correctly, against what it can see), then the positional build lands — and a
     * 'move' adopt does NOT bump _generation (by design: window-invariant geometry must not
     * re-carve in-range tiles on every frame of driving), so nothing ever reconciles those chunks.
     * They stayed raw until evicted. terrain.js pairs this with builtRoadGeneration so a chunk
     * carved OUTSIDE coverage is re-carved once coverage arrives, without re-carving everything.
     */
    networkCoversXZ(x, z) {
        const c = this._proto.lastCenter, r = this._proto.radius
        if (!c || !(r > 0)) return false
        const dx = x - c.x, dz = z - c.z
        return dx * dx + dz * dz <= r * r
    }

    /**
     * Wire the carve-free raw-height sampler used by sampleDesignGradeAt (CR-01, plan 09-08).
     * Must be rawHeightWorld — NOT analyticHeight (which re-introduces carve and would recurse).
     * Called from main.js after terrainSystem is constructed.
     * @param {Function} fn — (wx, wz) => number  carve-free raw terrain height (metres)
     */
    setRawHeightSampler(fn) { this._rawHeightSampler = fn }

    _invalidateProto() {
        this._proto.anchors.clear()
        this._proto.mergedAnchors.clear()   // FEAT-10: merged nodes derive from raw anchors + params
        this._proto.sites.clear()           // FEAT-13 v2: sites + Urquhart graph derive from seed + params
        this._proto.aliveSites.clear()
        this._proto.graph = null
        this._urqMemo.clear()   // PERF-26: the persist=false memo derives from the same sites+params
        this._proto.nodeInc.clear()
        // Param changes affect routing results → drop the per-connection centerline cache
        // (a pure fn of params, so the next miss recomputes the new value).
        if (this._proto.cls) this._proto.cls.clear()
        // Off-thread routing (PERF-03 WS-A): the cleared cache must be re-warmable, and any Worker
        // reply still in flight was routed against the OLD params → bump the epoch so it's discarded
        // as stale, and clear pending so the new params' connections get re-dispatched.
        this._routeEpoch++
        this._pendingRoutes.clear()
    }

    // ── Off-thread route pre-warming API (PERF-03 Workstream A) ──────────────────
    /**
     * Wire the Worker route dispatcher. `fn(jobs, epoch)` posts _v2EdgeSpec jobs to the route
     * Worker pool (src/road-worker.js), which runs the SAME routeEdgeV2 the synchronous path
     * calls and replies via ingestRoutedConnections().
     * Until set, routing is fully synchronous (headless gates never set it → unchanged behaviour).
     */
    setRouteDispatcher(fn) { this._routeDispatch = fn }

    /**
     * PERF-31 W2.2 — begin a pre-warmed build (network-worker use only; never call this on a
     * main-thread instance). The rebuild's rev bump and CR-02 memo bounds move HERE, to the
     * START of the warm→build pair: the rev still advances exactly once per real rebuild (so a
     * moved window's warm never reads the previous window's frozen delete set — the closed-set
     * rule stays rev-scoped), the bounds run before the warm fills the caches (so the build
     * cannot evict its own pre-warm), and the rebuild itself then SKIPS both via _prewarmCarry,
     * carrying the warm's rev-keyed pass-1 plan memos (delete verdicts, conflict pairs, samples
     * — pure fns of the cached routes) into the build instead of re-deriving them (measured:
     * the settle re-derivation ate nearly the whole off-thread routing win). Call once per
     * build request, BEFORE the first warmBandComplete pump; consumed by the next rebuild.
     */
    beginPrewarmedBuild() {
        this._networkRev++
        if (this._proto.anchors.size > 4000) { this._proto.anchors.clear(); this._proto.mergedAnchors.clear() }
        if (this._proto.cls && this._proto.cls.size > 1500) this._proto.cls.clear()
        this._prewarmCarry = true
    }

    /**
     * PERF-30: wire the network-Worker dispatcher. `fn({x, z, radius, reason})` asks the network
     * Worker (src/road-network-client.js) for a full off-thread build; the reply comes back
     * through adoptNetwork(). reason: 'move' = window change (stale-until-replaced), 'params' =
     * deferred invalidateCache (the swap bumps _generation). Until set, streaming is fully
     * synchronous (headless gates never set it → unchanged behaviour).
     */
    setNetworkDispatcher(fn) { this._networkDispatch = fn }

    /** Current route epoch — dispatch tags carry it so stale (pre-re-route) replies are dropped. */
    routeEpoch() { return this._routeEpoch }

    /**
     * FEAT-17: pond route-around injection. Roads route AROUND ponds (streams are bridged instead).
     * Kept decoupled — main.js hands the water queries in; road.js never imports water.js. Both parts
     * of the exclusion ride this one call:
     *   Part B (anchor filter): noGoFn(x,z)→bool — anchor SITES inside a pond+skirt disc are dropped
     *     from the alive set (_aliveSitesIn), keeping graph nodes/junctions out of the water.
     *   Part A (arc exclusion, the actual guarantee): discsFn(minX,minZ,maxX,maxZ)→flat [cx,cz,r,...]
     *     — pond+skirt discs attached to every route SPEC as pure DATA (opts.pondDiscs), so the
     *     Worker pre-warm and the synchronous fallback route with the SAME exclusion and the cache
     *     stays byte-identical. The corridor search hard-blocks lattice cells inside a disc.
     * Both fns must be pure fns of (seed, coords, params) — window-invariance rides on it (the
     * WaterSystem is; see test/water-invariance.mjs). Invalidates the proto caches: the network
     * derives from the anchor set + route specs, so changing the filter changes the network.
     * Unset (headless gates) → behaviour byte-unchanged.
     */
    setWaterNoGo(noGoFn, discsFn) {
        this._waterNoGo = noGoFn
        this._pondDiscsInBBox = discsFn
        this._invalidateProto()
    }

    /**
     * Macro-column band half-width (cells each side of the center column), SCALED to the active road
     * radius so the registered network always covers the carved disc at every draw-distance preset.
     * See the ROAD_BAND_MARGIN block: ceil(R / spacing) covers the disc, +margin absorbs a west-anchored
     * run's east-reach + anchor snap so no visible run is dropped (Mechanism B fix). Used by BOTH
     * warmBandComplete (pre-warm) and _streamNetwork (register) so they stay consistent.
     */
    _bandHalfWidth() {
        return Math.ceil(this._proto.radius / PROTO_ANCHOR_SPACING) + ROAD_BAND_MARGIN
    }

    /**
     * Warm-scan core (FEAT-68 v2 rewrite): collect ≤ `cap` dispatchable route jobs for `edges`.
     * A v2 route is a PURE fn of (terrain, anchor pair, node heights, deg-2 pins) — no sibling
     * deps, no solo routes, no corridor discs — so a job is just the edge's _v2EdgeSpec and the
     * scan is a cache walk. The QUAL-14 dependency machinery (solo pre-warms, disc readiness,
     * solo-reuse adoption) died with it. Jobs are CANONICAL spellings only (id-ordered, the same
     * rule as _edgeCenterline); the reverse spelling derives from the cached forward on demand.
     *
     * `g`/`drop` are the caller's window graph + degree-drop set — needed to derive each edge's
     * deg-2 heading pins exactly as registration will (_v2EdgeDirs is window-invariant, so warm
     * windows and the streaming band agree). A cached DIRLESS entry for an edge that carries pins
     * is NOT cache-complete (the _edgeCenterline guard would re-route it synchronously) — the
     * scan re-dispatches it and the reply overwrites.
     *
     * Returns { jobs, deferred } — deferred means not yet cache-complete (replies still in flight):
     * callers rescan until false.
     *
     * QUAL-27: the per-call JOB and EVAL budgets (and their rotating resume cursor) are gone with
     * warmRoutes, the movement pre-warm they throttled. Every surviving caller — the network
     * Worker's own pre-warm, the plan-layer demand scan — wants the WHOLE list in one pass and
     * always passed Infinity for both.
     */
    _warmScan(g, drop, edges) {
        const jobs = []
        let deferred = false
        for (let i = 0; i < edges.length; i++) {
            let [c1, c2] = edges[i]
            if ((c1[0] - c2[0] || c1[1] - c2[1] || c1[2] - c2[2]) > 0) [c1, c2] = [c2, c1]   // canonical spelling
            const dirs = this._v2EdgeDirs(g, drop, g.key(c1), g.key(c2))
            const key = this._edgeClsKey(c1, c2) + this._v2DirsNS(dirs)   // R4: pin-fingerprinted
            if (this._pendingRoutes.has(key)) { deferred = true; continue }
            const cached = this._proto.cls?.get(key)
            if (cached && (!dirs || cached._v2Dirs)) continue   // cache-complete (mirrors the _edgeCenterline guard)
            const spec = this._v2EdgeSpec(c1, c2, dirs)
            this._pendingRoutes.add(key)
            jobs.push(spec)
        }
        return { jobs, deferred }
    }

    // ── Story mode: mission geometry (FEAT-29 par oracle support) ───────────────
    /**
     * The graph the world ACTUALLY BUILT — the registered post-cull network, not the raw Urquhart
     * edge set.
     *
     * This distinction is load-bearing and cost a real bug. `_streamNetwork` runs
     * `_assembleGraphEdges` (registers every Urquhart edge) and THEN `_cullNetwork` (drops
     * crossings, clearance violations, excess degree). The roads that exist in the world are
     * Urquhart MINUS the cull. A planner that reads `_buildUrquhart` directly — as missionGraph
     * originally did — routes over edges the world deletes, and draws confident blue lines across
     * empty hillsides.
     *
     * Reading `_network` instead means the planner can only ever propose roads that were actually
     * built, and `edgeParData` returns their REGISTERED centerlines (identical to the ones the
     * ribbon and carve use) rather than re-routing them without their neighbours' context.
     *
     * @returns {{ edges: Array<[id,id,string]>, adj: Map<string,Set<string>>, key: (id)=>string,
     *             pos: (id)=>THREE.Vector3, idOf: Map<string,any> }}
     */
    networkGraph() {
        const key = (id) => `${id[0]},${id[1]},${id[2]}`
        const edges = [], adj = new Map(), idOf = new Map()
        // QUAL-24: report the ABSTRACT edges, not the runs. A deg-2 chain merge regroups GEOMETRY —
        // it must not change topology. Collapsing a 3-edge chain to one edge here silently cut the
        // world's edge count by a third, and everything that decides per-edge went with it: POI siting
        // rolls once per edge, so POIs visibly vanished. Emit each merged run's MEMBER edges instead,
        // each still pointing at the merged run that now carries its geometry (edgeParData hands back
        // the matching arc-span view).
        const emit = (a, b, runKey) => {
            const ka = key(a), kb = key(b)
            idOf.set(ka, a); idOf.set(kb, b)
            if (!adj.has(ka)) adj.set(ka, new Set())
            if (!adj.has(kb)) adj.set(kb, new Set())
            adj.get(ka).add(kb); adj.get(kb).add(ka)
            edges.push([a, b, runKey])
        }
        for (const [runKey, e] of this._network) {
            if (!e.cellA || !e.cellB) continue
            emit(e.cellA, e.cellB, runKey)
        }
        return { edges, adj, key, idOf, pos: (id) => this._nodePos(id) }
    }

    /**
     * Routed geometry for one graph edge, in the form the par oracle consumes:
     * `{ centerline, gradeAt(s), key }`. Reuses the registered network entry when the edge is
     * streamed; otherwise routes it (cached in _proto.cls) and grades a fresh sample — the same
     * five lines _assembleGraphEdges uses, so par is computed on the SAME curve the carve builds.
     *
     * A cache miss routes synchronously (routeEdgeV2, tens of ms). Mission-offer time only —
     * never the frame loop (FEAT-29 acceptance).
     */
    edgeParData(c1, c2) {
        const kf = (id) => `${id[0]},${id[1]},${id[2]}`
        const key = `g:${kf(c1)}:${kf(c2)}`
        const alt = `g:${kf(c2)}:${kf(c1)}`
        // Return the REGISTERED key, not the one the caller happened to build. An edge is stored
        // under whichever endpoint order _assembleGraphEdges saw first, so `g:A:B` and `g:B:A` name
        // the same road — but road-quality HASHES the runKey, so handing back the reversed spelling
        // yields a different surface-quality series for the same stretch of tarmac.
        // BUG-53: a MERGED run's primitive centerline is a stale record wherever its points left it
        // (the ceded strand follows the winner; the taper band blends off it) — hand consumers a
        // points-backed sampler instead, so GPS/mission lines follow the road that actually exists.
        // The shim covers the consumed surface: .pointAt(s) and .length
        // (mission.js/gps.js/poi.js/paper-route.js).
        //
        // BUG-41: that shim originally kept the PRE-MERGE centerline arc (`clArc`) so existing `s`
        // values would keep their meaning. That was the defect. A merged run's points follow the
        // winner's course, so its clArc is no longer the arc of the road underneath them — measured
        // on seed 6, 10 of 52 runs off by 2.10% (p50) to 6.80% (33.3 m), which made par price a road
        // SHORTER than the one driven, and par is the FEAT-53 payout denominator. Worse, the
        // handed out spoke two arc domains at once — poi.js's ceded-road rejection compared them
        // directly with a ±20 m tolerance against a ≤33 m error.
        //
        // INVARIANT: what this returns speaks ONE arc domain throughout, and it is the run's DRIVEN
        // arc — the same domain as runProfile().gradeY, the carve, the ribbon, the physics and every
        // span record. For a merged run that is polyCum. For a plain run the analytic centerline IS
        // that road (its length matches clArc's end exactly, and polyCum — the chord sum of its own
        // samples — agrees to 0.040% worst case), so it is kept: its curvatureAt is exact, and par
        // integrates curvature as its dominant term. Do not "unify" that to a sampler; the ±3 m
        // finite difference would smear curvature on every plain run to buy 0.04%.
        const clOf = (hit) => hit.offCurveSpans ? _pointSampler(hit.points, hit.polyCum) : hit.centerline
        const arcOf = (hit) => hit.offCurveSpans ? hit.polyCum : hit.clArc
        const par = (k, hit) => {
            // runProfile indexes arcPos from -(arcOrigin), so a non-zero origin would shift the
            // driven arc out from under the sampler and silently restore the bug. Measured 0 on
            // every run; fail loudly rather than assume it stays that way.
            if (hit.arcOrigin) throw new Error(`BUG-41: run ${k} has arcOrigin ${hit.arcOrigin}; edgeParData assumes 0`)
            return { key: k, centerline: clOf(hit), gradeAt: _gradeSampler(hit.points, arcOf(hit)) }
        }
        if (this._network.has(key)) return par(key, this._network.get(key))
        if (this._network.has(alt)) return par(alt, this._network.get(alt))
        // (QUAL-24 chain-span view removed with the merge — runs are 1:1 with edges.)
        // Dirless on purpose: this fallback only touches never-registered edges (no settled
        // adjacency to derive deg-2 heading pins from). If the edge later registers, the
        // _edgeCenterline cache guard re-routes it heading-ful and overwrites.
        const cl = this._edgeCenterline(c1, c2)
        if (!cl || cl.length < 1e-6) return null
        const n = Math.max(1, Math.ceil(cl.length / PROTO_SAMPLE_DS))
        const pts = new Array(n + 1)
        const clArc = new Float64Array(n + 1)
        for (let i = 0; i <= n; i++) {
            const s = cl.length * i / n
            clArc[i] = s
            const p = cl.pointAt(s)
            pts[i] = new THREE.Vector3(p.x, this._coarseH(p.x, p.z), p.z)
        }
        this._v2GradePts(pts, clArc)   // FEAT-68: par prices the same profile the carve builds
        return { key, centerline: cl, gradeAt: _gradeSampler(pts, clArc) }
    }

    /**
     * Pre-route this instance's whole registered band OFF-THREAD, and report when nothing is left.
     *
     * Routing is ~99% of the cost of a cold stream (measured: 19.5 s cold at 2200 m radius vs
     * 0.21 s once the per-connection route cache is populated). So a large read-only network — the
     * story-mode mission planner — becomes essentially free to build IF its routes are warmed in
     * advance on the road Worker.
     *
     * @returns {boolean} true once every connection in the band is cached (nothing dispatched, no
     *   replies outstanding, no deferred dependencies) — callers pump until it returns true.
     */
    warmBandComplete(center) {
        if (!this._routeDispatch) return true        // no worker (headless/tests): nothing to warm
        const R = this._proto.radius
        const cmx = Math.floor(center.x / PROTO_ANCHOR_SPACING)
        const HW = this._bandHalfWidth()
        const mx0 = cmx - HW - PREWARM_MARGIN, mx1 = cmx + HW + PREWARM_MARGIN
        const mz0 = Math.floor((center.z - R) / PROTO_ANCHOR_SPACING) - PREWARM_MARGIN
        const mz1 = Math.ceil((center.z + R) / PROTO_ANCHOR_SPACING) + PREWARM_MARGIN
        const g = this._buildUrquhart(mx0, mx1, mz0, mz1, false)
        // Only the edges that will actually REGISTER — same in-band filter _assembleGraphEdges
        // applies. The raw band+margin Urquhart set is ~5x larger (260 vs 50 edges at a 1400 m
        // radius), and warming all of it routes roads no mission can ever use. _warmScan still
        // pulls in whatever SOLO dependencies these need, including ones outside the band.
        const wx0 = mx0 * PROTO_ANCHOR_SPACING, wx1 = (mx1 + 1) * PROTO_ANCHOR_SPACING
        const wz0 = mz0 * PROTO_ANCHOR_SPACING, wz1 = (mz1 + 1) * PROTO_ANCHOR_SPACING
        const inBand = (c) => { const p = this._nodePos(c); return p.x >= wx0 && p.x < wx1 && p.z >= wz0 && p.z < wz1 }
        // QUAL-21 Stage 2: skip degree-capped edges (settled spec-time — never registered/routed).
        const { drop } = this._degreeDrops(mx0, mx1, mz0, mz1)
        const edges = g.edges.filter(([c1, c2]) => !drop.has(g.key(c1) + '|' + g.key(c2)) && (inBand(c1) || inBand(c2)))
        const { jobs, deferred } = this._warmScan(g, drop, edges)
        if (jobs.length > 0) this._routeDispatch(jobs, this._routeEpoch)
        if (jobs.length > 0 || deferred) return false
        // PERF-31 W2 (pin parity): the registered band is cached — now warm the PLAN layer's
        // demand (settle 1-ring incident edges, then census discovery partners) so the build
        // thread routes ~nothing. Multi-round by construction: partners need the settle edges'
        // routes to exist, so each pump advances one wave and the caller keeps pumping.
        // OPT-IN (warmPlanDemand): the wave-3 settle derivation is a single ~4.6 s synchronous
        // bite (measured, 1400 m window) — fine inside the network worker's pre-warm where it
        // replaces the build's own settle cost, a freeze anywhere a main-thread caller pumps
        // this (mission warm, map2d). Main-thread callers keep the wave-1-only behaviour.
        if (!this.warmPlanDemand) return true
        const p = this._warmPlanJobs(center)
        if (p.jobs.length > 0) this._routeDispatch(p.jobs, this._routeEpoch)
        return p.jobs.length === 0 && !p.deferred
    }

    /**
     * PERF-31 W2 (pin parity): enumerate the PLAN layer's route demand beyond the registered
     * band, with the same pins the build will derive, so warmBandComplete can pre-route it
     * off-thread. Two waves, mirrored from the build:
     *   1. the settle set — _v2SettleDeletions's selection verbatim: post-drop edges incident
     *      to any endpoint node of an in-band edge (the 1-ring whose deletions can flip an
     *      in-band pin);
     *   2. census partners — _v2ConflictPairs's discovery bound verbatim: wide-graph edges
     *      whose chord comes within censusChordM(+stride slack) of a settle edge's route,
     *      pin-derived through the SAME graph the census will sample them with (band graph
     *      when the edge is spelled there, the degree-drop wide graph otherwise).
     * Wave 2 needs wave 1's routes in cache, so a pump that dispatches wave-1 jobs stops
     * there and the next pump discovers partners against the cached routes.
     * Read-only on plan state: routes nothing itself, never calls _v2DeleteFor — it only
     * derives job specs via the shared _warmScan/_v2EdgeDirs machinery. The graphs/bounds are
     * the BUILD's own (no prewarm margin), so cache keys match what _assembleGraphEdges and
     * its plan passes will demand.
     */
    _warmPlanJobs(center) {
        const R = this._proto.radius
        const cmx = Math.floor(center.x / PROTO_ANCHOR_SPACING)
        const HW = this._bandHalfWidth()
        const mx0 = cmx - HW, mx1 = cmx + HW
        const mz0 = Math.floor((center.z - R) / PROTO_ANCHOR_SPACING)
        const mz1 = Math.ceil((center.z + R) / PROTO_ANCHOR_SPACING)
        const g = this._buildUrquhart(mx0, mx1, mz0, mz1, false)
        const { drop, wide } = this._degreeDrops(mx0, mx1, mz0, mz1)
        const wx0 = mx0 * PROTO_ANCHOR_SPACING, wx1 = (mx1 + 1) * PROTO_ANCHOR_SPACING
        const wz0 = mz0 * PROTO_ANCHOR_SPACING, wz1 = (mz1 + 1) * PROTO_ANCHOR_SPACING
        const inBand = (c) => { const p = this._nodePos(c); return p.x >= wx0 && p.x < wx1 && p.z >= wz0 && p.z < wz1 }
        const _mband = this._params?.roadMergeBand ?? 24, _mband2 = _mband * _mband
        // Wave 1 — the settle set (selection mirrors _v2SettleDeletions).
        const coreNodes = new Set()
        for (const [c1, c2] of g.edges) {
            if (drop.has(g.key(c1) + '|' + g.key(c2))) continue
            if (!inBand(c1) && !inBand(c2)) continue
            coreNodes.add(g.key(c1)); coreNodes.add(g.key(c2))
        }
        const settleEdges = []
        for (const [c1, c2] of g.edges) {
            if (drop.has(g.key(c1) + '|' + g.key(c2))) continue
            if (!coreNodes.has(g.key(c1)) && !coreNodes.has(g.key(c2))) continue
            const A = this._nodePos(c1), B = this._nodePos(c2)
            { const ex = A.x - B.x, ez = A.z - B.z; if (ex * ex + ez * ez <= _mband2) continue }
            settleEdges.push([c1, c2])
        }
        const s1 = this._warmScan(g, drop, settleEdges)
        if (s1.jobs.length || s1.deferred) return s1
        // Wave 2 — census discovery partners against the (now cached) settle routes.
        const CHORD = (this._v2Costs().censusChordM ?? 300)
        const spell = this._v2EdgeSpellings(g)
        const seen = new Set()
        for (const [c1, c2] of settleEdges) {
            const kA = g.key(c1), kB = g.key(c2)
            seen.add(kA < kB ? kA + '|' + kB : kB + '|' + kA)   // settle edges are already warmed
        }
        const partnersG = [], partnersW = []
        for (const [c1, c2] of settleEdges) {
            // The census samples `own` at PROTO_SAMPLE_DS and strides 8 — reproduce that walk on
            // the cached centerline (pure cache hit after wave 1; XZ only, no height needed).
            const cl = this._edgeCenterline(c1, c2, this._v2EdgeDirs(g, drop, g.key(c1), g.key(c2)))
            if (!cl || cl.length < 1e-6) continue
            const n = Math.max(1, Math.ceil(cl.length / PROTO_SAMPLE_DS))
            const own = []
            for (let i = 0; i <= n; i += 8) own.push(cl.pointAt(cl.length * i / n))
            let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity
            for (const p of own) {
                if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x
                if (p.z < minz) minz = p.z; if (p.z > maxz) maxz = p.z
            }
            for (const [q1, q2] of wide.edges) {
                const qA = wide.key(q1), qB = wide.key(q2)
                const qck = qA < qB ? qA + '|' + qB : qB + '|' + qA
                if (seen.has(qck)) continue
                if (drop.has(qA + '|' + qB)) continue
                const A2 = this._nodePos(q1), B2 = this._nodePos(q2)
                { const ex = A2.x - B2.x, ez = A2.z - B2.z; if (ex * ex + ez * ez <= _mband2) continue }
                if (Math.max(A2.x, B2.x) < minx - CHORD || Math.min(A2.x, B2.x) > maxx + CHORD
                    || Math.max(A2.z, B2.z) < minz - CHORD || Math.min(A2.z, B2.z) > maxz + CHORD) continue
                const cnx = Math.min(A2.x, B2.x) - CHORD, cxx = Math.max(A2.x, B2.x) + CHORD
                const cnz = Math.min(A2.z, B2.z) - CHORD, cxz = Math.max(A2.z, B2.z) + CHORD
                let dDisc = Infinity
                for (const p of own) {
                    if (p.x < cnx || p.x > cxx || p.z < cnz || p.z > cxz) continue
                    const dd = _segSegDistXZ(p, p, A2, B2)
                    if (dd < dDisc) { dDisc = dd; if (dDisc <= 0) break }
                }
                if (dDisc > CHORD + 16) continue
                seen.add(qck)
                const spQ = spell.get(qck)
                if (spQ) partnersG.push(spQ)
                else partnersW.push([q1, q2])
            }
        }
        const s2g = this._warmScan(g, drop, partnersG)
        const s2w = this._warmScan(wide, drop, partnersW)
        if (s2g.jobs.length || s2w.jobs.length || s2g.deferred || s2w.deferred)
            return { jobs: [...s2g.jobs, ...s2w.jobs], deferred: s2g.deferred || s2w.deferred }
        // Wave 3 — the settle pass's PASS-2 pins. Run the same _v2SettleDeletions the build will
        // run (a pure fn of pass-1 routes, which are all cached now — its _v2DeleteFor calls are
        // memo/cache walks, and the odd 2-ring sample it still needs routes synchronously here
        // and lands in cache). This is enumeration ONLY from the build's perspective:
        // _streamNetwork bumps _networkRev before _assembleGraphEdges, so every rev-keyed
        // verdict/frozen set minted here dies at the bump and the build re-derives its own from
        // the same cached routes. If any node's pin CLASS flipped, rescan everything —
        // _v2EdgeDirs now reads the frozen sets and yields the flipped (built-degree) keys the
        // plan's pass 2 will demand; _warmScan skips all the unflipped (already cached) keys.
        if (this._v2SettleDeletions(g, drop, wide, mx0, mx1, mz0, mz1)) {
            const s3 = this._warmScan(g, drop, settleEdges)
            const s3g = this._warmScan(g, drop, partnersG)
            const s3w = this._warmScan(wide, drop, partnersW)
            return { jobs: [...s3.jobs, ...s3g.jobs, ...s3w.jobs],
                     deferred: s3.deferred || s3g.deferred || s3w.deferred }
        }
        return { jobs: [], deferred: false }
    }

    /**
     * QUAL-14 perf: export the route cache as plain primitive-descriptor entries (structured-
     * clonable) for main.js's in-session cache, so returning to a seed visited earlier this
     * session is instant. Centerlines rebuild losslessly from their descriptors, so this is the
     * whole cache state.
     */
    exportRouteCache() {
        // Third tuple element = the FEAT-68 _v2Dirs tag (dirs-aware routing) — without it every
        // imported entry would read as dirless and registration would re-route the whole cache.
        // (clsSolo died with the QUAL-14 dependency machinery — v2 has no solo routes.)
        const dump = (m) => m ? [...m.entries()].map(([k, cl]) => [k, cl.primitives, cl._v2Dirs ? 1 : 0]) : []
        return { cls: dump(this._proto.cls) }
    }

    /** QUAL-14 perf: import a persisted route cache (fills only missing keys — live entries win). */
    importRouteCache(data) {
        if (!data) return
        if (!this._proto.cls) this._proto.cls = new Map()
        for (const [k, prims, v2dirs] of data.cls || []) {
            if (!this._proto.cls.has(k) && prims && prims.length) {
                const cl = centerlineFromDescriptors(prims)
                if (v2dirs) cl._v2Dirs = true
                this._proto.cls.set(k, cl)
            }
        }
    }

    /**
     * Consume Worker-routed connections: drop each {key, prims, v2Dirs, pinFallback} into
     * _proto.cls (the memoization the synchronous router would otherwise fill). Stale replies
     * (epoch != current — a re-route happened since dispatch) are discarded wholesale. Pure cache
     * population: the network/slices/queries are untouched until the next natural _streamNetwork,
     * which then finds these as cache hits. A live entry wins over a reply UNLESS the reply
     * upgrades a dirless entry to heading-ful (the _edgeCenterline cache-poisoning guard's rule).
     * prims:null = the worker raced ahead of 'init' — the key re-warms on a later scan.
     */
    ingestRoutedConnections(results, epoch) {
        if (epoch !== this._routeEpoch) return   // routed against stale params — discard
        if (!this._proto.cls) this._proto.cls = new Map()
        for (const r of results) {
            this._pendingRoutes.delete(r.key)
            if (!r.prims) continue
            const have = this._proto.cls.get(r.key)
            if (have && (have._v2Dirs || !r.v2Dirs)) continue
            const cl = centerlineFromDescriptors(r.prims)
            if (r.v2Dirs) cl._v2Dirs = true
            if (r.pinFallback) {
                this._v2DirFallbacks = (this._v2DirFallbacks || 0) + 1
                ;(this._v2DirFallbackKeys ||= []).push(r.key)
            }
            this._proto.cls.set(r.key, cl)
        }
    }


    // ── PERF-30: network export/adopt (the network-worker protocol) ─────────────────────────────
    /**
     * Serialize the REGISTERED network — everything a second RoadSystem needs to answer surface/
     * slice/junction queries as if it had built the network itself — as structured-clonable data.
     * Runs carry their exact primitive centerline as descriptors (the importRouteCache convention:
     * centerlines rebuild losslessly via centerlineFromDescriptors). Planner state that post-build
     * consumers read rides along: the R4 frozen delete set (_graphDegreeOf / pads / leaf tapers
     * classify by BUILT degree), the band graph (so the adopter never re-runs Delaunay), the
     * condemned keys (story reads the mark at run start), and the census tallies.
     * Typed arrays are COPIES — postMessage transfer must not detach the live entries.
     */
    exportNetwork() {
        const runs = []
        for (const [key, e] of this._network) {
            const n = e.points.length
            const pts = new Float64Array(n * 3)
            for (let i = 0; i < n; i++) {
                pts[i * 3] = e.points[i].x; pts[i * 3 + 1] = e.points[i].y; pts[i * 3 + 2] = e.points[i].z
            }
            runs.push({
                key, cellA: e.cellA, cellB: e.cellB, arcOrigin: e.arcOrigin ?? 0,
                pts,
                polyCum: Float64Array.from(e.polyCum),
                clArc: Float64Array.from(e.clArc),
                prims: e.centerline ? e.centerline.primitives : null,
                v2Dirs: !!(e.centerline && e.centerline._v2Dirs),
                dirsSpec: e.centerline?._v2DirsSpec ?? null,
                tunnelSpans: e.tunnelSpans ?? null,
                offCurveSpans: e.offCurveSpans ?? null,
                rerouted: !!e.rerouted, condemned: !!e.condemned,
            })
        }
        // Band box parsed back out of the sig (mz0:mz1:mx0:mx1:gen) — the adopter re-composes the
        // sig with its OWN _generation so its _streamNetwork short-circuits on the adopted window.
        let band = null
        if (this._lastBandSig) {
            const [mz0, mz1, mx0, mx1] = this._lastBandSig.split(':').map(Number)
            band = { mz0, mz1, mx0, mx1 }
        }
        const delF = this._v2DelFrozen?.rev === this._networkRev ? this._v2DelFrozen : null
        const g = this._proto.graph
        // The degree pass deletes dropped pairs from g.adj but leaves g.edges raw (see
        // _assembleGraphEdges) — export both, or the adopter resurrects every dropped edge when it
        // rebuilds adj (measured: a dropped pair came back as a phantom degree-3 junction).
        let dropped = null
        if (g) {
            dropped = []
            for (const [a, b] of g.edges) {
                if (!g.adj.get(g.key(a))?.has(g.key(b))) dropped.push([g.key(a), g.key(b)])
            }
        }
        return {
            center: this._networkCenter ? { x: this._networkCenter.x, z: this._networkCenter.z } : null,
            radius: this._proto.radius,
            band,
            runs,
            graph: g ? { sig: g.sig, edges: g.edges, dropped } : null,
            delFrozen: delF ? [...delF.del] : [],
            delFlip: delF ? [...delF.flip] : [],
            // FEAT-76: the promoted-T tables. The adopter cannot re-derive these — they are a
            // product of the build, not of the coordinates — and without them _graphDegreeOf reads
            // the raw graph, so a node the T turned into a two-leg bend comes back as a phantom
            // three-way junction (measured: degree 3 vs 4 at [-3,1,1], network-worker-parity red).
            promoted: [...this._promoted].map(([k, r]) => [k, {
                id: r.id, x: r.pos.x, y: r.pos.y, z: r.pos.z, gx: r.gx, gz: r.gz,
            }]),
            promotedAway: [...this._promotedAway],
            condemnedKeys: this._v2CondemnedKeys ? [...this._v2CondemnedKeys] : [],
            tallies: {
                merges: this._v2Merges || 0, shoves: this._v2Shoves || 0,
                reroutes: this._v2Reroutes || 0, infeasible: this._v2Infeasible || 0,
                condemned: this._v2Condemned || 0, dirFallbacks: this._v2DirFallbacks || 0,
            },
        }
    }

    /**
     * Adopt a network built elsewhere (the PERF-30 network worker — or exportNetwork() of any
     * other instance). Replaces this instance's registered network ATOMICALLY within this call:
     * fills _network, restores the planner state consumers read (frozen deletes, band graph,
     * condemned marks), and performs the SAME post-rebuild bookkeeping _streamNetwork does — rev
     * bump (every rev-keyed cache invalidates in the same swap), slice reset, junction re-detect.
     * After adopting, _streamNetwork with the same (center, radius, params) short-circuits at the
     * band-sig guard, so play keeps driving this network until the next real window change.
     */
    adoptNetwork(data, opts = null) {
        // regen:true = this build replaced the network's SHAPE (param change), not just its window —
        // bump the single invalidation counter so ribbon tiles + carve chunks rebuild against the
        // new geometry (the half of invalidateCache() that was deferred to this swap). A positional
        // adopt must NOT bump it (D1: window-invariant geometry — rebuilding in-range tiles is
        // pure waste and flickers).
        if (opts && opts.regen) this._generation++
        this._networkCenter = data.center ? new THREE.Vector3(data.center.x, 0, data.center.z) : null
        this._proto.lastCenter = this._networkCenter ? this._networkCenter.clone() : null
        this._proto.dirty = false
        if (data.radius > 0) this._proto.radius = data.radius
        this._lastBandSig = data.band
            ? `${data.band.mz0}:${data.band.mz1}:${data.band.mx0}:${data.band.mx1}:${this._generation}`
            : null
        this._networkRev++   // one swap: every rev-keyed cache (profiles, camber, adjacency, leaf flags) invalidates together
        this._network.clear()
        this._slicedFrom = null
        if (this._tiles) this._tiles.clear()
        if (this._tileObjects) this._tileObjects.clear()
        if (this._junctions) this._junctions.clear()
        this._junctionsRev = -1
        this._designGradeCache = new WeakMap()
        for (const r of data.runs) {
            const n = r.pts.length / 3
            const points = new Array(n)
            for (let i = 0; i < n; i++) points[i] = new THREE.Vector3(r.pts[i * 3], r.pts[i * 3 + 1], r.pts[i * 3 + 2])
            let cl = null
            if (r.prims && r.prims.length) {
                cl = centerlineFromDescriptors(r.prims)
                if (r.v2Dirs) cl._v2Dirs = true
                if (r.dirsSpec) cl._v2DirsSpec = r.dirsSpec
            }
            const entry = {
                points, arcOrigin: r.arcOrigin, centerline: cl,
                polyCum: Float64Array.from(r.polyCum), clArc: Float64Array.from(r.clArc),
                cellA: r.cellA, cellB: r.cellB, tunnelSpans: r.tunnelSpans || null,
            }
            // Optional fields mirror the registration sites: absent on a plain run, present on a
            // merged/shoved one — consumers distinguish by presence.
            if (r.offCurveSpans) entry.offCurveSpans = r.offCurveSpans
            if (r.rerouted) entry.rerouted = true
            if (r.condemned) entry.condemned = true
            this._network.set(r.key, entry)
        }
        // R4 frozen deletes at THIS instance's new rev — _graphDegreeOf subtracts them, so pads,
        // leaf tapers and pins classify by the built network exactly as the builder did.
        this._v2DelFrozen = { rev: this._networkRev, del: new Set(data.delFrozen || []), flip: new Set(data.delFlip || []) }
        // FEAT-76: the promoted-T tables ride across with the runs (see exportNetwork).
        this._promoted = new Map((data.promoted || []).map(([k, r]) => [k, {
            id: r.id, pos: new THREE.Vector3(r.x, r.y, r.z), gx: r.gx, gz: r.gz,
        }]))
        this._promotedAway = new Set(data.promotedAway || [])
        this._v2CondemnedKeys = data.condemnedKeys ? [...data.condemnedKeys] : []
        if (data.tallies) {
            this._v2Merges = data.tallies.merges; this._v2Shoves = data.tallies.shoves
            this._v2Reroutes = data.tallies.reroutes; this._v2Infeasible = data.tallies.infeasible
            this._v2Condemned = data.tallies.condemned; this._v2DirFallbacks = data.tallies.dirFallbacks
        }
        // Adopt the builder's band graph (pure data: same sites, same Urquhart — byte-identical to
        // what _buildUrquhart would derive here) so _graphDegreeOf never sees a null graph, which
        // silently reads as degree 2 everywhere (no pads, no leaf tapers).
        if (data.graph) {
            const key = (id) => `${id[0]},${id[1]},${id[2]}`
            const adj = new Map()
            for (const [a, b] of data.graph.edges) {
                const ka = key(a), kb = key(b)
                if (!adj.has(ka)) adj.set(ka, new Set())
                if (!adj.has(kb)) adj.set(kb, new Set())
                adj.get(ka).add(kb); adj.get(kb).add(ka)
            }
            // Re-apply the degree-pass drops the builder applied to ITS adj (edges stays raw on
            // both sides — that asymmetry is _assembleGraphEdges' own convention).
            for (const [ka, kb] of data.graph.dropped || []) {
                adj.get(ka)?.delete(kb); adj.get(kb)?.delete(ka)
            }
            this._proto.graph = { sig: data.graph.sig, edges: data.graph.edges, adj, key }
        }
        // Node incidence (site-key → [runKey,…]) — _graphNodeStrands/_graphJunctionGradeY read it
        // for the pad plane, and only _assembleGraphEdges fills it. Registration pushed each run to
        // both endpoints in edge order == network insertion order, which the export preserved — so
        // this walk reproduces the arrays byte-for-byte (strand ORDER feeds a float least-squares).
        this._proto.nodeInc.clear()
        const incKey = (id) => `${id[0]},${id[1]},${id[2]}`
        for (const [runKey, e] of this._network) {
            for (const id of [e.cellA, e.cellB]) {
                if (!id) continue
                const k = incKey(id)
                let a = this._proto.nodeInc.get(k)
                if (!a) { a = []; this._proto.nodeInc.set(k, a) }
                a.push(runKey)
            }
        }
        // Same eager ordering as _streamNetwork: the crossing classifier is populated before any
        // run profile is built (the AT_GRADE mid-span flatten reads it), then slices.
        this._detectJunctions()
        this._sliceNetwork()
        return this._network
    }

    // FEAT-13: the terminal heading the routed edge `at → toward` leaves the anchor `at` with (and the
    // ribbon-weld target there) = the EDGE's OWN direction toward its neighbour, so edges meeting at a
    // junction DIVERGE toward their neighbours (a shared per-cell heading made them all leave parallel and
    // overlap — the near-parallel-graze step bug). A straight pass-through still gets ~G1 for free (the two
    // opposite edges' headings are collinear); corners/junctions bend/diverge. Pure / window-invariant.
    _edgeTerminalHeading(at, toward) {
        const a = this._nodePos(at), b = this._nodePos(toward)
        return Math.atan2(b.z - a.z, b.x - a.x)
    }

    // ── FEAT-13 v2 graph topology — Urquhart graph over a blue-noise anchor set ──────────────────────
    // The lattice (one grid anchor per cell + spanning-forest neighbour edges) is replaced by:
    //   (1) BLUE-NOISE anchor SITES — multiple seeded candidates per macro-cell, Poisson-disk thinned, so
    //       there are no parallel rows (a grid forces parallelism into ANY edge rule — handoff §4/§5A);
    //   (2) URQUHART edges (Delaunay minus each triangle's longest edge, src/road-graph.js) over a bounded
    //       band+margin neighbourhood — sparse, varied-angle, CONNECTED by construction (Urquhart ⊇ MST),
    //       and window-invariant (the Delaunay of a fixed point set is unique; the margin makes interior
    //       edges independent of the stream center — verified by test/graph-topology.mjs).
    // A node id is a SITE id `[cmx, cmz, k]` (macro-cell + candidate index). _nodePos resolves it to a
    // world position; everything downstream (_v2EdgeSpec, headings, junction blend) reads through it.

    // The seeded candidate sites for macro-cell (cmx,cmz): roadSiteCandidates points jittered across the
    // whole cell, each optionally valley-snapped (a bounded gradient-descent so sites still favour valley
    // floors). Pure fn of (seed, cell) → window-invariant. Cached per cell.
    _anchorSites(cmx, cmz) {
        const ckey = `${cmx},${cmz}`
        const cached = this._proto.sites.get(ckey)
        if (cached) return cached
        const S = this._params?.roadSiteSpacing ?? PROTO_ANCHOR_SPACING
        const C = Math.max(1, Math.round(this._params?.roadSiteCandidates ?? 2))
        const snap = this._params?.roadSiteValleySnap ?? true
        const snapCap = S * 0.45
        const rng = mulberry32(seedFor(this._worldSeed, 'roadsite', cmx, cmz))
        const out = []
        for (let k = 0; k < C; k++) {
            let wx = (cmx + rng()) * S, wz = (cmz + rng()) * S
            let h = this._coarseH(wx, wz)
            if (snap) {
                const ox = wx, oz = wz
                for (let s = 0; s < 48; s++) {
                    let bx = wx, bz = wz, bh = h
                    for (let a = 0; a < 8; a++) {
                        const ang = a / 8 * Math.PI * 2
                        const nx = wx + Math.cos(ang) * 8, nz = wz + Math.sin(ang) * 8
                        const nh = this._coarseH(nx, nz)
                        if (nh < bh) { bh = nh; bx = nx; bz = nz }
                    }
                    if (bh >= h) break
                    if (Math.hypot(bx - ox, bz - oz) > snapCap) break
                    wx = bx; wz = bz; h = bh
                }
            }
            out.push({ id: [cmx, cmz, k], pos: new THREE.Vector3(wx, h, wz), pri: seedFor(this._worldSeed, 'roadsitePri', cmx, cmz * 131 + k) })
        }
        this._proto.sites.set(ckey, out)
        return out
    }

    // Poisson-disk acceptance: a site is ALIVE iff no STRICTLY higher-priority accepted site lies within
    // roadSiteMinDist. Acceptance reads only higher-priority sites in the bounded ±W-cell window covering
    // minDist (each a pure fn) → window-invariant, order-independent (min-priority over a fixed set).
    _siteAlive(site) {
        if (site._alive !== undefined) return site._alive   // memoized (DAG over strict priority → cycle-free)
        const minD = this._params?.roadSiteMinDist ?? 90
        if (minD <= 0) return (site._alive = true)
        const S = this._params?.roadSiteSpacing ?? PROTO_ANCHOR_SPACING
        const W = Math.max(1, Math.ceil(minD / S) + 1)
        const minD2 = minD * minD
        const [cmx, cmz] = site.id
        site._alive = true   // optimistic; a closer higher-priority site below flips it (never re-entered)
        for (let dz = -W; dz <= W; dz++) {
            for (let dx = -W; dx <= W; dx++) {
                for (const other of this._anchorSites(cmx + dx, cmz + dz)) {
                    if (other === site) continue
                    // strictly higher priority (lower pri value; tie-break by id for total order)
                    const hp = other.pri < site.pri || (other.pri === site.pri && idLess(other.id, site.id))
                    if (!hp) continue
                    if (!this._siteAlive(other)) continue   // a rejected site cannot suppress us
                    const ex = other.pos.x - site.pos.x, ez = other.pos.z - site.pos.z
                    if (ex * ex + ez * ez < minD2) return (site._alive = false)
                }
            }
        }
        return (site._alive = true)
    }

    // The alive sites in macro-cell (cmx,cmz) (post Poisson-disk thinning). Cached per cell.
    // FEAT-17: sites inside a pond+skirt no-go disc are dropped AFTER Poisson acceptance (a drowned
    // site still suppresses its neighbours — keeps acceptance independent of whether water is wired).
    // setWaterNoGo cleared this cache, so the filter applies from the first post-injection query.
    _aliveSitesIn(cmx, cmz) {
        const ckey = `${cmx},${cmz}`
        const cached = this._proto.aliveSites.get(ckey)
        if (cached) return cached
        const out = this._anchorSites(cmx, cmz).filter(s =>
            this._siteAlive(s) && !(this._waterNoGo && this._waterNoGo(s.pos.x, s.pos.z)))
        this._proto.aliveSites.set(ckey, out)
        return out
    }

    // World position for a site id [cmx,cmz,k]. FEAT-76: a PROMOTED id (k = -1) is not a site — it
    // names a point on a trunk run, and its position (deck height included) comes from the
    // promotion table this rev's assembly built. The fallback is only reached for an id that
    // outlived its network (a stale capture), and reads terrain rather than throwing.
    _siteAt(id) {
        if (_isPromotedId(id)) {
            const rec = this._promoted?.get(`${id[0]},${id[1]},${id[2]}`)
            if (rec) return rec.pos
            const px = id[0] / 1000, pz = id[1] / 1000
            return new THREE.Vector3(px, this._coarseH(px, pz), pz)
        }
        for (const s of this._anchorSites(id[0], id[1])) if (s.id[2] === id[2]) return s.pos
        return this._coarseAnchorFallback(id)
    }
    _coarseAnchorFallback(id) {   // defensive — a non-existent candidate index
        const S = this._params?.roadSiteSpacing ?? PROTO_ANCHOR_SPACING
        const x = (id[0] + 0.5) * S, z = (id[1] + 0.5) * S
        return new THREE.Vector3(x, this._coarseH(x, z), z)
    }

    // Generalised node-position lookup: rows id [mx,mz] → merged grid anchor; graph site id [cmx,cmz,k]
    // → blue-noise site. The single seam between the two topologies — every graph helper reads here.
    _nodePos(id) { return this._siteAt(id) }

    // Build (or reuse) the Urquhart graph over the band [mx0,mx1]×[mz0,mz1] padded by roadGraphMargin
    // cells. Returns { edges:[[idA,idB]...], adj:Map(key→Set(key)), key(id) }. Interior edges are
    // window-invariant; the margin must be wide enough that adding farther sites can't change them
    // (graph-topology.mjs asserts this across two centers). Cached on the padded-band signature.
    // persist=true caches into this._proto.graph (the junction-degree source — used by the streaming
    // assemble path). The warm scans pass persist=false: they only need the edge LIST for route jobs and
    // run on their own band, so they must NOT clobber the streaming graph (degree would go stale on a
    // rebuild-skip). Window-invariance makes both bands agree on shared interior edges either way.
    // `cacheable=false` lets a single-use window READ the memo without WRITING it (PERF-26: the
    // QUAL-14 per-edge dep windows produced ~113 distinct sigs per scan and wiped the 6-entry memo
    // 16 times over, evicting the warm-band and cull graphs _degreeDrops depends on; that caller
    // is gone with the dependency machinery, but the knob is harmless and the lesson stands).
    _buildUrquhart(mx0, mx1, mz0, mz1, persist = true, marginOverride = null, cacheable = true) {
        const M = marginOverride != null ? Math.max(1, Math.round(marginOverride)) : Math.max(1, Math.round(this._params?.roadGraphMargin ?? 3))
        // FEAT-13: the SITE grid is decoupled from the 256 m macro-grid. The band [mx0,mx1] is in
        // macro-cells; convert to the band's WORLD extent, then iterate SITE cells at roadSiteSpacing
        // scale that cover it (+margin). When roadSiteSpacing == PROTO_ANCHOR_SPACING this is the identity
        // (site cell == macro cell), so existing behaviour is byte-unchanged; raising it makes the anchor
        // field genuinely sparser (fewer cells → fewer nodes), which the 256 m grid could not.
        const S = this._params?.roadSiteSpacing ?? PROTO_ANCHOR_SPACING
        const wx0 = mx0 * PROTO_ANCHOR_SPACING, wx1 = (mx1 + 1) * PROTO_ANCHOR_SPACING
        const wz0 = mz0 * PROTO_ANCHOR_SPACING, wz1 = (mz1 + 1) * PROTO_ANCHOR_SPACING
        const scx0 = Math.floor(wx0 / S) - M, scx1 = Math.floor((wx1 - 1e-6) / S) + M
        const scz0 = Math.floor(wz0 / S) - M, scz1 = Math.floor((wz1 - 1e-6) / S) + M
        const sig = `${S}:${scx0},${scx1},${scz0},${scz1}`
        if (persist && this._proto.graph && this._proto.graph.sig === sig) return this._proto.graph
        // PERF-26: the persist=false path was the ONLY one without a memo, and it is the hot one —
        // the warm scans re-derive the graph per call while `sig` is quantised to roadSiteSpacing
        // (256 m by default), so most calls rebuilt a byte-identical graph: delaunay() +
        // urquhartEdges() over the whole band+margin, 30–91 ms at 4× CPU, and (in the era when the
        // movement pre-warm ran on the main thread) the single largest streaming hitch.
        // `sig` already captures site spacing and the margin-expanded cell box, so it is a complete
        // key; _invalidateProto clears the memo on the same signal that nulls _proto.graph.
        // Safe to share the object: the persist=true path has always returned one shared _proto.graph
        // across calls, so callers already treat the result as immutable (verified: no call site
        // mutates .edges/.adj).
        if (!persist) {
            const hit = this._urqMemo.get(sig)
            if (hit) return hit
        }
        const key = (id) => `${id[0]},${id[1]},${id[2]}`
        const ids = [], pts = []
        for (let cz = scz0; cz <= scz1; cz++)
            for (let cx = scx0; cx <= scx1; cx++)
                for (const s of this._aliveSitesIn(cx, cz)) { ids.push(s.id); pts.push([s.pos.x, s.pos.z]) }
        const adj = new Map()
        const edges = []
        if (pts.length >= 3) {
            const tris = delaunay(pts)
            for (const [i, j] of urquhartEdges(pts, tris)) {
                const a = ids[i], b = ids[j], ka = key(a), kb = key(b)
                if (!adj.has(ka)) adj.set(ka, new Set())
                if (!adj.has(kb)) adj.set(kb, new Set())
                adj.get(ka).add(kb); adj.get(kb).add(ka)
                edges.push([a, b])
            }
        }
        const g = { sig, edges, adj, key }
        if (persist) this._proto.graph = g
        else if (cacheable) {
            // Bounded: warm / stream / spawn / map windows alternate between a handful of sigs, the
            // same reason _degreeDrops keeps ~6. Drop the whole map rather than tracking LRU age —
            // a rebuild is correct, just slower, so the failure mode of eviction is only perf.
            if (this._urqMemo.size > 6) this._urqMemo.clear()
            this._urqMemo.set(sig, g)
        }
        return g
    }

    // Graph-mode degree of a site (incident Urquhart-edge count over the current band graph) — drives
    // junction classification: degree ≥ 3 = junction (flatten + camber→0 + pad); 2 = continuing path.
    // R4 (2026-09-01): the degree is the BUILT degree — crossing-rung deletions (_v2Deleted, frozen
    // per rev by _v2SettleDeletions) subtract, because a deleted edge never registers a run. Before
    // R4 a node that LOST an edge to the delete rung still classified (and padded, and flattened
    // camber) as its graph degree — the seed-6 node 4,1,1 three-way-plaza-on-two-roads defect.
    _graphDegreeOf(id) {
        const g = this._proto.graph
        if (!g) return 2
        const nk = g.key(id)
        // FEAT-76: a promoted node is not in the Urquhart graph at all — its degree is what
        // REGISTERED there (trunk in, trunk out, side road out = 3 by construction).
        if (_isPromotedId(id)) return this._proto.nodeInc.get(nk)?.length ?? 3
        const nbrs = g.adj.get(nk)
        if (!nbrs) return 0
        const delF = this._v2DelFrozen?.rev === this._networkRev ? this._v2DelFrozen.del : null
        // FEAT-76: subtract edges that were PROMOTED AWAY from this node — the side road of a T no
        // longer starts here, it starts out on the trunk. Same shape as the R4 frozen delete set
        // above, and for the same reason: _graphDegreeOf is a CONSUMER of the settled plan (pads,
        // camber flattening, leaf tapers), never an input to routing, so subtracting here cannot
        // reach back into the departure pins. Without it a node that is now a two-leg bend would
        // still fit a three-way pad plane and flatten its camber. Directed on purpose: the edge is
        // gone from THIS end only — its far end still has the road arriving.
        const promAway = this._promotedAway
        if ((!delF || !delF.size) && (!promAway || !promAway.size)) return nbrs.size
        let n = 0
        for (const o of nbrs) {
            if (delF && delF.has(nk + '|' + o)) continue
            if (promAway && promAway.has(nk + '|' + o)) continue
            n++
        }
        return n
    }

    // FEAT-68 (2026-08-19): the crossing + clearance culls are DELETED, with their one-ring
    // universe, candidate-pair scan, and XZ-polyline plumbing (inventory item 9, evidence-forced).
    // They existed to police v1's wander; measured on v2 across 10 seeds they deleted 11-21 GOOD
    // edges per seed (connectivity 95.7%->54.1% mean largest-component share) while the thing they
    // guard against — real crossings between non-adjacent runs — occurred ZERO times. With them
    // gone: 10/10 seeds fully connected. The rare legitimate geography-funnel overlap is the
    // crossing classifier's business, not a cull's. (BUG-25 and its radius-invariance gate retire
    // with this — the machinery they debugged no longer exists.)

    // PERF-worldgen degree pass (user connectivity preference): at any node whose graph degree
    // exceeds roadGraphMaxDegree, drop incident edges LONGEST CHORD FIRST (the long diagonal is
    // the redundant triangle hypotenuse — the shorter legs already connect it), each drop allowed
    // only if the edge's endpoints keep a bounded-hop detour — connectivity always wins. 0 = off.
    //
    // QUAL-21 Stage 2: this is the SINGLE canonical implementation of the degree decisions —
    // returned as a drop-pair-key Set (both orders) over a wide graph. It is PURE TOPOLOGY (chords
    // + candidate-excluded BFS — no routed geometry), so it runs at SPEC TIME: _assembleGraphEdges
    // applies the drops BEFORE routing (doomed edges are never routed — was: route then cull),
    // the warm paths skip them, and _cullNetwork's ring excludes them. This replaced the Stage-1 _degreeCulledNbrsAt SIMULATION (a
    // hand-mirrored copy under a DEGREE SIM SYNC rule — a drift hazard with no reason to exist).
    //
    // WINDOW-INVARIANCE (two failed designs taught this — both caught by the cull-radius gate as
    // phantom map roads, the BUG-25 class):
    //   v1 decided over the stream window's one-ring → boundary nodes saw window-dependent
    //      candidate sets.
    //   v2 decided over the wide graph but updated degrees SEQUENTIALLY → each drop changed
    //      the next node's decision, an influence chain of unbounded reach that no margin
    //      absorbs (the QUAL-14 percolation trap).
    // v3 (this) is ORDER-FREE, every term a bounded-radius pure fn of the graph:
    //   Phase 1 — CANDIDATES: at every node with degree > maxDeg, its (degree − maxDeg)
    //     longest incident edges are candidates (pure local rule, 1-hop information).
    //   Phase 2 — SAFETY: a candidate actually drops iff its endpoints reconnect within
    //     hopCap hops in (graph − ALL candidates). The subtracted set is itself
    //     window-invariant, so the check is too; and every dropped edge keeps a detour that
    //     uses NO dropped edge ⇒ connectivity of the survivors is guaranteed outright.
    // Every consumer window then merely APPLIES each decision to the edges it can see.
    _degreeDropSet(dg) {
        const drops = new Set()
        const maxDeg = this._params?.roadGraphMaxDegree ?? 0
        if (!maxDeg) return drops
        // Tight detour cap: only an edge whose endpoints reconnect within THIS many hops is
        // "redundant enough" to lose to the degree cap. Low = only near-triangle diagonals (some
        // 4-ways survive — the user wants fewer, not none); higher = progressively more
        // aggressive thinning.
        const hopCap = this._params?.roadGraphDegreeDetourHops ?? 4
        const pairK = (a, b) => a + '|' + b
        const dgAdj = new Map()
        const incAll = new Map()   // nodeKey → [{other, chord}]
        const addAdj = (a, b) => { (dgAdj.get(a) || dgAdj.set(a, new Set()).get(a)).add(b) }
        for (const [a, b] of dg.edges) {
            const ka = dg.key(a), kb = dg.key(b)
            const pa = this._nodePos(a), pb = this._nodePos(b)
            const chord = Math.hypot(pb.x - pa.x, pb.z - pa.z)
            addAdj(ka, kb); addAdj(kb, ka)
            ;(incAll.get(ka) || incAll.set(ka, []).get(ka)).push({ other: kb, chord })
            ;(incAll.get(kb) || incAll.set(kb, []).get(kb)).push({ other: ka, chord })
        }
        // Phase 1: candidate pairs (canonicalized), no mutation anywhere.
        const candSet = new Set()
        const candList = []   // [{ka, kb}] canonical lo/hi, deterministic order
        for (const nk of [...dgAdj.keys()].sort()) {
            const excess = dgAdj.get(nk).size - maxDeg
            if (excess <= 0) continue
            const cands = incAll.get(nk)
                .sort((x, y) => (y.chord - x.chord) || (pairK(nk, x.other) < pairK(nk, y.other) ? -1 : 1))
                .slice(0, excess)
            for (const c of cands) {
                const lo = nk < c.other ? nk : c.other, hi = nk < c.other ? c.other : nk
                if (candSet.has(pairK(lo, hi))) continue
                candSet.add(pairK(lo, hi)); candSet.add(pairK(hi, lo))
                candList.push({ ka: nk, kb: c.other, lo, hi })
            }
        }
        if (!candList.length) return drops
        // Phase 2: BFS in (graph − candidates); drop each candidate whose endpoints reconnect.
        const detourSafe = (a, b) => {
            const q = [[a, 0]], seen = new Set([a])
            while (q.length) {
                const [u, d] = q.shift()
                if (d >= hopCap) continue
                for (const v of dgAdj.get(u) || []) {
                    if (candSet.has(pairK(u, v))) continue   // no candidate edge may serve as detour
                    if (v === b) return true
                    if (!seen.has(v)) { seen.add(v); q.push([v, d + 1]) }
                }
            }
            return false
        }
        candList.sort((x, y) => (pairK(x.lo, x.hi) < pairK(y.lo, y.hi) ? -1 : 1))
        for (const c of candList) {
            if (!detourSafe(c.ka, c.kb)) continue   // load-bearing → survives the cap
            drops.add(pairK(c.lo, c.hi)); drops.add(pairK(c.hi, c.lo))
        }
        return drops
    }

    // Memoized degree decisions for a stream/warm window, as { drop }. Keyed by (window,
    // _networkRev) — warm scans repeat the same window between move thresholds.
    //
    // PERF-26: the margin is roadGraphMargin + degreeDetourHops + 1, because _degreeDropSet's
    // Phase-2 BFS reaches at most roadGraphDegreeDetourHops (4) — that box already contains the
    // detour neighbourhood of every in-window candidate, which is the whole window-invariance
    // argument; a wider box cannot change an in-window decision, only cost more.
    //
    // BUG-55: the entry also carries that same wide graph as `wide` — the pair census scans its
    // chords against each registering edge's ROUTE for conflict partners that share no node
    // (shape E). A discoverable partner's chord lies within censusChordM of a route that stays
    // near the band, comfortably inside this box. One build, two readers; the census inherits
    // the identical invariance argument.
    _degreeDrops(mx0, mx1, mz0, mz1) {
        const sig = `${mx0}:${mx1}:${mz0}:${mz1}`
        if (!this._degreeDropsMemo || this._degreeDropsMemo.rev !== this._networkRev)
            this._degreeDropsMemo = { rev: this._networkRev, map: new Map() }
        const memo = this._degreeDropsMemo.map
        const hit = memo.get(sig)
        if (hit) return hit
        const gMargin = this._params?.roadGraphMargin ?? 3
        const dropMargin = gMargin + (this._params?.roadGraphDegreeDetourHops ?? 4) + 1
        const wide = this._buildUrquhart(mx0, mx1, mz0, mz1, false, dropMargin)
        const entry = { drop: this._degreeDropSet(wide), wide }
        if (memo.size > 6) memo.clear()   // warm/stream/spawn windows alternate — keep a handful
        memo.set(sig, entry)
        return entry
    }

    // (QUAL-22 lived here: _protoEdgeCost + _chordCost, a coarse-height chord integral used as the
    // Urquhart pruning weight so the graph dropped each triangle's most-EXPENSIVE edge instead of
    // its longest. Implemented, measured, and deleted un-shipped — see the closed ticket.)

    // (Road Overhaul Phase C: _protoConnect / _protoSimplify / _removeLoops / _removeSelfCrossings
    // deleted; the routed primitive centerline is now the SOLE representation. _streamNetwork samples it
    // into the run polyline (Y = coarse height), so the separate point-mode search + collinear-simplify +
    // loop/self-crossing cleanup are all gone. _segCrossParam stays (module scope, _detectJunctions).)

    // FEAT-13: route SPEC for a node-id edge c1→c2 (canonical 'g' cache key). Node ids are blue-noise
    // site ids [cmx,cmz,k]; the key joins their components so it is unique.
    _edgeClsKey(c1, c2) {
        const a = this._nodePos(c1), b = this._nodePos(c2)
        return `g${c1.join('_')}>${c2.join('_')}:${a.x.toFixed(0)},${a.z.toFixed(0)}>${b.x.toFixed(0)},${b.z.toFixed(0)}`
    }

    // FEAT-68 (v2): route an edge — corridor search on the octave-truncated field, then stage-3
    // curve generation (RDP → Chaikin → line-arc fillets). Pure fn of (terrain, anchor pair,
    // deg-2 approach headings); the cache is memoization only, never coupling. Terminal headings
    // at JUNCTIONS, corridor discs, solo-reuse and the self-clearance wrapper are all gone with
    // the wander.
    //
    // `dirs` = {startDir?, goalDir?} unit {x,z} — deg-2 canonical approach headings (registration
    // passes them; they are a pure fn of the settled post-drop adjacency, so every window derives
    // the identical pins and cache entries stay window-invariant).
    _edgeCenterline(c1, c2, dirs, hardGrade) {
        if (!this._proto.cls) this._proto.cls = new Map()
        // BUG-56 C: each grade-hard re-route rung is a SEPARATE geometry for the same edge, so each
        // gets its own cache namespace — a rung must never be handed back to an ordinary request,
        // an ordinary route must never be handed back to a re-route, and two rungs must not collide.
        const key = this._edgeClsKey(c1, c2) + (hardGrade ? `#g${hardGrade}` : '') + this._v2DirsNS(dirs)
        const cached = this._proto.cls.get(key)
        // CACHE-POISONING GUARD: entries are tagged `_v2Dirs` when routed by a dirs-aware caller.
        // A dirless caller (edgeParData's standalone fallback — it only touches never-registered
        // edges, where no settled adjacency exists to derive pins from) can route an edge FIRST;
        // if registration later requests the same edge WITH dirs it must re-route and overwrite —
        // registered geometry always ships heading-ful, or window invariance breaks (which curve
        // an edge got would depend on who asked first). Dirless requests accept any cached entry:
        // the dirs are deterministic per edge, so a dirful entry IS that edge's one true geometry.
        if (cached && (!dirs || cached._v2Dirs)) return cached
        // FEAT-68: routes are direction-CANONICAL. The search (A*, RDP, Chaikin) is not
        // direction-symmetric, and which spelling a window asks for depends on local site order —
        // v1's "routing is directional" gotcha, measured again here as 36 m of AB-vs-BA drift
        // (story-poi pad positions). Route the id-ordered direction once; the other spelling is
        // its EXACT reverse (reversePrimitives), so both are one pure geometry.
        const canon = (c1[0] - c2[0] || c1[1] - c2[1] || c1[2] - c2[2]) <= 0
        if (!canon) {
            // reversed traversal: leave B along −goalDir, arrive at A along −startDir. Sibling
            // bearings SWAP ends unnegated — they are node-local bearings toward the node's other
            // neighbours, not directions of travel. PERF-31 W1: dropping them here minted a
            // sib-less forward key per reversed request (a guaranteed cache miss beside the warm
            // scan's sib-ful entry — 39 of the 214 demanded keys, a full extra routeEdgeV2 each).
            const neg = (d) => d ? { x: -d.x, z: -d.z } : undefined
            const flip = dirs ? { startDir: neg(dirs.goalDir), goalDir: neg(dirs.startDir) } : undefined
            if (flip && dirs.occupied) flip.occupied = dirs.occupied   // FEAT-77: the lines are symmetric
            if (flip && dirs._built) flip._built = true
            if (flip && dirs.sibGoal) flip.sibStart = dirs.sibGoal
            if (flip && dirs.sibStart) flip.sibGoal = dirs.sibStart
            const fwd = this._edgeCenterline(c2, c1, flip, hardGrade)
            const cl = new Centerline(reversePrimitives(fwd.primitives))
            if (fwd._v2Dirs) cl._v2Dirs = true
            cl._v2DirsSpec = dirs
            this._proto.cls.set(key, cl)
            this._pendingRoutes.delete(key)
            return cl
        }
        // routeEdgeV2 is THE route function — the route Worker imports the same one, so the
        // pre-warmed cache entry and this synchronous fallback are byte-identical by construction
        // (the FEAT-68 no-mirror fence; test/road-worker-parity.mjs pins the field derivation).
        const spec = this._v2EdgeSpec(c1, c2, dirs, hardGrade)
        const res = routeEdgeV2(spec, this._v2Trunc(), (x, z) => this._coarseH(x, z))
        const cl = res.cl
        cl._v2DirsSpec = dirs   // BUG-56 C: the re-route rung needs the pins this edge was routed with
        if (res.pinRequested && res.feasible && !res.usedPin) {
            this._v2DirFallbacks = (this._v2DirFallbacks || 0) + 1
            ;(this._v2DirFallbackKeys ||= []).push(key)
        }
        if (dirs) cl._v2Dirs = true   // tag = "a dirs-aware caller routed this" (even if pins fell back)
        this._proto.cls.set(key, cl)
        this._pendingRoutes.delete(key)
        return cl
    }

    /**
     * FEAT-68: the v2 route-job spec for an edge — the ONE place it is built, shared by the
     * synchronous path (_edgeCenterline) and the Worker pre-warm (_warmScan), so both routes are
     * computed from identical inputs. Structured-clonable throughout (plain numbers/arrays).
     * The 2.5D corridor plans the DECK pinned at the same node heights the profile pins to;
     * pond+skirt no-go discs (FEAT-17) are fetched over the corridor's own (wide) search box.
     */
    _v2EdgeSpec(c1, c2, dirs, hardGrade) {
        const A = this._nodePos(c1), B = this._nodePos(c2)
        const margin = Math.max(800, Math.hypot(B.x - A.x, B.z - A.z))
        const blockedDiscs = this._pondDiscsInBBox ? this._pondDiscsInBBox(
            Math.min(A.x, B.x) - margin, Math.min(A.z, B.z) - margin,
            Math.max(A.x, B.x) + margin, Math.max(A.z, B.z) + margin) : undefined
        return {
            key: this._edgeClsKey(c1, c2) + (hardGrade ? `#g${hardGrade}` : '') + this._v2DirsNS(dirs),   // its own cache namespace (BUG-56 C / R4)
            ax: A.x, az: A.z, yA: this._v2NodeHeight(A.x, A.z),
            bx: B.x, bz: B.z, yB: this._v2NodeHeight(B.x, B.z),
            margin, blockedDiscs, dirs,
            // BUG-56 C — the RE-ROUTE price list. gMaxRoad is UNCHANGED: the owner ruled out
            // tightening the cap, because that trades connectivity for grade and connectivity wins.
            // What changes is wGrade, the length-vs-grade dial (cost/m = 1 + wGrade·g², minimised at
            // g* = 1/sqrt(wGrade)). At 180 the search wants 7.5 %; at 180·HARD_GRADE_MULT it wants
            // ~3 %, so it BUYS LENGTH to go round the pitch it could not solve over. Same search,
            // same field, one number moved — still a pure function of (endpoints, seed, params).
            costs: hardGrade ? { ...this._v2Costs(), wGrade: (this._v2Costs().wGrade ?? 180) * hardGrade }
                             : this._v2Costs(),   // ride the spec so Worker-routed edges price identically (own module instance)
        }
    }

    /**
     * FEAT-68: the live v2 price list. RANGER_PARAMS.roadV2 is the real one (debug sliders mutate
     * it in place, exactly like every other road knob); V2_COSTS is the module default, used only
     * by headless callers that construct a RoadSystem without it. Read fresh each time — never
     * cached — so a slider edit takes effect on the next route with no invalidation of its own.
     */
    _v2Costs() { return this._params?.roadV2 ?? V2_COSTS }

    /**
     * FEAT-77 — HOW FAR APART TWO ROADS MUST BE HERE (owner rulings 2026-09-07/08). Two adjacent
     * roads keep `clearEdgeM` of daylight between their pavement edges, AND neither road's
     * earthwork may reach the other. "Reach the other" is the physical case, not any overlap of
     * aprons (owner 2026-09-08 — two fills merging build one bank and no wall):
     *
     *   (i)  the UPPER road is on fill, and its embankment surface, falling at roadFillSlope from
     *        its shoulder, would still be ABOVE the lower road's deck where the lower road's
     *        shoulder edge sits — the lower road's bed is cut into the upper's bank: a wall.
     *   (ii) the LOWER road is in cut, and its cut face, rising at roadCutSlope from its
     *        shoulder, would still be BELOW the upper road's deck under the upper's shoulder edge —
     *        the upper road sits over the lower's excavation: undermined.
     *
     * Each case needs `edgeU + edgeL + slope·Δy` of centre separation (edge = carveHalfWidth +
     * shoulder), but an apron only reaches carveHalfWidth + roadMaxEmbankmentToe from its own
     * centre — the carve caps it there — so past cap + edge the other road is out of reach and the
     * case cannot arise. Hence, per case, req = min(edgeU + edgeL + slope·Δy, cap + edge), and
     *
     *     centre separation >= max(2·halfWidth + clearEdgeM, req_i, req_ii)
     *
     * 22 m floor, 28.5 m at most (18 + 10.5). The owner's photo site — the upper road on 2.7 m of
     * fill, 27.6 m from the lower one — still fails; two hillside legs both on fill 30 m apart with
     * 10 m of height between them pass, because the upper's bank ends 1.5 m short of the lower's
     * shoulder. Deck-to-deck height alone (65 m at the photo) was rejected: the ground between
     * carries most of it, and the cap is why a hillside road's theoretical toe never ships either.
     *
     * `pa` is a sample on one route (deck in `.y`), `hit` the nearest point on the other
     * (_nearestOnPolyXZ: d, y, fx, fz). Ground is _coarseH — the field the profile solved against —
     * so this is a pure function of the two pure samples and the params: window-invariant like the
     * PROX it replaces, and identical on every thread.
     */
    _v2ClearReq(pa, hit) { return clearReq(pa, hit, (x, z) => this._coarseH(x, z), this._v2ClearPrm()) }

    /** The rule's parameters, as corridor-router.clearReq takes them — one derivation, read fresh. */
    _v2ClearPrm() {
        const p = this._params || {}
        const HW = p.roadHalfWidth ?? 5
        const chw = Math.min(HW + (p.roadCarveExtraWidth ?? 3.0), p.roadMinTurnRadius ?? 12)
        return { HW, floor: 2 * HW + (this._v2Costs().clearEdgeM ?? 12), edge: chw + (p.roadShoulderWidth ?? 2.5),
                 cap: chw + (p.roadMaxEmbankmentToe ?? 10), fill: p.roadFillSlope ?? 3.0, cut: p.roadCutSlope ?? 1.0 }
    }

    /**
     * How far ABREAST of the trunk a T's side road may sit at its fork. The departure band
     * translates the side's own line onto P by that offset over LB = sqrt(2·g0·RB) ≤ 90 m, so
     * the geometric limit is generous; what bounded it before (mergeProxM · 1.6 = 28.8 m) was a
     * wye-era number, and under FEAT-77 a fork is often pushed past it by the clearance rule and
     * the sibling stagger (seed 6 node 4,1,1: the second side road's only legal forks sit 34 m
     * off the trunk). A 34 m shift over a 60 m band is a 30° departure — an ordinary T.
     */
    _v2ForkAbreastMax() { return Math.max((this._v2Costs().mergeProxM ?? 18) * 1.6, this._v2ClearMax() + 12) }

    /** The largest _v2ClearReq can return — a capped apron reaching the other road's shoulder. */
    _v2ClearMax() {
        const p = this._params || {}
        const HW = p.roadHalfWidth ?? 5
        const chw = Math.min(HW + (p.roadCarveExtraWidth ?? 3.0), p.roadMinTurnRadius ?? 12)
        return Math.max(2 * HW + (this._v2Costs().clearEdgeM ?? 12), chw + (p.roadMaxEmbankmentToe ?? 10) + chw + (p.roadShoulderWidth ?? 2.5))
    }

    /**
     * The conflict predicate the walkers take: are these two samples inside the rule? `s` is the
     * walk's arc from its start; `throat(s)` says whether that arc is inside a shared node's throat
     * (clearThroatM), where the rule is not owed and the old proximity (mergeProxM) still decides.
     */
    _v2Near(throat = null) {
        const PROX = this._v2Costs().mergeProxM ?? 18
        return (pa, hit, s) => hit.d <= (throat && s !== undefined && throat(s) ? PROX : this._v2ClearReq(pa, hit))
    }

    /**
     * The predicate for run (c1→c2, length L) walked from its START against a partner whose graph
     * nodes are `qKeys`: the throat is the first/last clearThroatM metres wherever the two share
     * that end's node. A disjoint partner shares neither and gets the rule end to end.
     */
    _v2NearVs(g, c1, c2, L, qKeys) {
        const T = this._v2Costs().clearThroatM ?? 30
        const sA = qKeys.includes(g.key(c1)), sB = qKeys.includes(g.key(c2))
        if (!sA && !sB) return this._v2Near()
        return this._v2Near((s) => (sA && s < T) || (sB && s > L - T))
    }

    // R4 (2026-09-01): the PLAN REV. The plan layer (samples, conflict pairs, merge/shove/ceded/
    // disjoint/bundle/census/view memos) is versioned by this tag rather than _networkRev, so the
    // assembly can run it TWICE per re-stream when the crossing rung's deletions flip a node's
    // pin class: pass 1 (tag == _networkRev) plans on graph-degree pins and decides the delete
    // set; pass 2 (tag == _networkRev + 0.5) re-plans on BUILT-degree pins with the delete
    // verdicts FROZEN (_v2DeleteMemo stays on _networkRev). Deletions are the one verdict judged
    // on layer-0 — that is what breaks the pins→routes→crossings→degree→pins cycle.
    _planRev() {
        const t = this._v2PlanTag
        return t && t.rev === this._networkRev ? t.tag : this._networkRev
    }

    // R4: EVERY dirful route is cache-keyed on the pins themselves (a pure fn of (edge, pins)).
    // Two failures forced this, both measured by world-determinism's 10.16 m spawn move:
    //   1. a bare '#b' suffix let one window's built pins answer another window's request;
    //   2. the settle pass routes MARGIN edges (never registered in this window) whose pins come
    //      from the band graph's fringe-truncated adjacency — cached under the plain key, they
    //      poisoned the window that later registers the edge with its interior (correct) pins.
    //      The old cache guard's "a dirful entry IS the edge's one true geometry" assumption only
    //      ever held for in-band edges, and pre-R4 only those were dirful-routed.
    // Sibling bearings ride the key too — they steer demoted rungs, so they are route content.
    _v2DirsNS(dirs) {
        if (!dirs) return ''
        const f = (d) => d ? `${d.x.toFixed(5)},${d.z.toFixed(5)}` : 'x'
        const fs = (a) => a ? a.map((d) => `${d.x.toFixed(3)},${d.z.toFixed(3)}`).join('|') : 'x'
        // FEAT-77: an occupied set is content-keyed (FNV-1a over the lines at centimetres), like R4's
        // `#b` namespace — the same winners give the same key in every window and on every thread.
        let o = ''
        if (dirs.occupied) {
            let hsh = 0x811c9dc5
            for (const ln of dirs.occupied.lines) for (let i = 0; i < ln.length; i++) { hsh ^= Math.round(ln[i] * 100) & 0xffffffff; hsh = Math.imul(hsh, 0x01000193) >>> 0 }
            o = `#o${dirs.occupied.lines.length}:${hsh.toString(16)}`
        }
        return `#p${f(dirs.startDir)};${f(dirs.goalDir)};${fs(dirs.sibStart)};${fs(dirs.sibGoal)}${o}`
    }

    // FEAT-68 deg-2 canonical approach headings: a pass-through node is a POINT ON a longer
    // corridor, not a route boundary — its two incident edges should meet tangentially. The
    // through-direction at a deg-2 node of the SETTLED post-drop adjacency is the
    // neighbor-to-neighbor chord (neighbors sorted lexicographically for determinism). Pure fn of
    // the settled adjacency — every window derives identical pins, so the route cache stays
    // window-invariant. Junctions (deg ≠ 2) get no pin: naive meets are checkpoint-sanctioned,
    // junction geometry is its own deferred pass. `drop` filters degree-capped pairs when the
    // caller's graph has not had them deleted from adj (warm windows); on the streaming graph the
    // deletions are already applied and the filter is a no-op — same result either way.
    _v2NodeThrough(g, drop, nk) {
        const nbrs = g.adj.get(nk)
        if (!nbrs) return null
        let ks = [...nbrs]
        if (drop) ks = ks.filter((o) => !drop.has(nk + '|' + o))
        // R4: pins read the BUILT degree — an edge the crossing rung deleted is not a road, and
        // the node it leaves behind pins as what remains. The frozen set is per-rev, minted by
        // _v2SettleDeletions AFTER plan pass 1, so pass 1 itself is graph-degree by construction.
        const delF = this._v2DelFrozen?.rev === this._networkRev ? this._v2DelFrozen.del : null
        if (delF && delF.size) ks = ks.filter((o) => !delF.has(nk + '|' + o))
        if (ks.length !== 2) return null
        ks.sort()
        const p1 = this._nodePos(ks[0].split(',').map(Number))
        const p2 = this._nodePos(ks[1].split(',').map(Number))
        const dx = p2.x - p1.x, dz = p2.z - p1.z, l = Math.hypot(dx, dz)
        return l > 1e-9 ? { x: dx / l, z: dz / l, toward: ks[1] } : null
    }

    // Signing is by NEIGHBOR IDENTITY, not by the edge's own chord: through runs k1→k2, so an
    // edge leaving toward k2 pins +through, toward k1 pins −through; an arrival continues toward
    // the OTHER neighbor. (Chord-dot signing was measured wrong at acute elbows — a node sitting
    // behind one neighbor along the chord got pins that REVERSE travel through the node, a
    // sanctioned cusp. Identity signing keeps travel consistent through every joint.)
    //
    // BUG-53: JUNCTION ends (settled degree >= 3) get a CHORD pin — each leg must depart its node
    // toward its own far node (60° cone + the terminal-region rule, same machinery as deg-2).
    // Unpinned junction legs all pick the same best exit out of the node, which is the measured
    // generator of the node-sharing overlap/crossing class: two runs collinear out of one node,
    // sharing earthworks for 100-500 m (the owner's "huge tear", seed 6 node -7,2,0: 244 m at
    // 0.1 m separation). The chord is a pure fn of the two endpoint positions, so the pin is
    // window-invariant wherever the degree class is (same settled-adjacency argument as the deg-2
    // through pins), and the feasibility ladder still demotes any pin the terrain refuses.
    // Leaf ends (degree 1) stay unpinned — there is nothing to separate.
    /**
     * FEAT-77 SECOND PASS. Every route consumer reaches the router through this one seam, so the
     * pass-2 input rides here: the base dirs (pins + sibling bearings, pure graph data) plus, for
     * an edge the clearance walk names a LOSER, the winners' pass-1 lines as `occupied`. The
     * router prices metres inside those lines' clearance (corridor-router.js, wClear), so the
     * loser buys length or grade to go round — the owner's "make the secondary edge aware of the
     * primary and give it a berth" (2026-09-08). A pair the T machinery can resolve (inside
     * mergeProxM somewhere) is left to it; the second pass takes the pairs "too distant to
     * combine" — inside the rule but never inside the merge distance.
     *
     * Invariance: pass-1 routes are pure per edge; the partner set is the node's incidence plus
     * the census's chord bound; the loser is the longer pass-1 route (tie: larger key); the
     * cache key carries a content hash of the lines (_v2DirsNS). No ordering, no cycles: a loser
     * is routed against WINNERS' PASS-1 lines only, never against another loser's pass-2 line.
     */
    _v2EdgeDirs(g, drop, kA, kB) {
        const base = this._v2EdgeDirsBase(g, drop, kA, kB)
        const occ = this._v2ClearanceFor(g, drop, kA, kB)
        if (!occ) return base
        return { ...(base || {}), occupied: occ }
    }

    _v2EdgeDirsBase(g, drop, kA, kB) {
        const s = this._v2NodeThrough(g, drop, kA), t = this._v2NodeThrough(g, drop, kB)
        const delF = this._v2DelFrozen?.rev === this._networkRev ? this._v2DelFrozen : null
        const degOf = (nk) => {
            const nbrs = g.adj.get(nk)
            if (!nbrs) return 0
            let n = 0
            for (const o of nbrs) {
                if (drop && drop.has(nk + '|' + o)) continue
                if (delF && delF.del.size && delF.del.has(nk + '|' + o)) continue   // R4: built degree
                n++
            }
            return n
        }
        let chord
        const chordDir = () => {
            if (chord === undefined) {
                const pa = this._nodePos(kA.split(',').map(Number))
                const pb = this._nodePos(kB.split(',').map(Number))
                const dx = pb.x - pa.x, dz = pb.z - pa.z, l = Math.hypot(dx, dz)
                chord = l > 1e-9 ? { x: dx / l, z: dz / l } : null
            }
            return chord ?? undefined
        }
        const neg = (d) => ({ x: -d.x, z: -d.z })
        const startDir = s ? (s.toward === kB ? { x: s.x, z: s.z } : neg(s))
            : (degOf(kA) >= 3 ? chordDir() : undefined)
        const goalDir = t ? (t.toward === kA ? neg(t) : { x: t.x, z: t.z })
            : (degOf(kB) >= 3 ? chordDir() : undefined)
        if (!startDir && !goalDir) return undefined
        const dirs = { startDir, goalDir }
        // R5: sibling bearings at each end — the chords from the node toward its OTHER settled
        // neighbours (pure graph data, the same window-invariance class as the pins; A1 proved
        // pricing the sibling's whole corridor by chord proxy does NOT work, so this carries only
        // the departure bearings and routeEdgeV2 prices only the exit). Sorted for determinism.
        const sibsOf = (nk, exclude) => {
            const nbrs = g.adj.get(nk)
            if (!nbrs || nbrs.size < 2) return undefined
            const pn = this._nodePos(nk.split(',').map(Number))
            const out = []
            for (const o of [...nbrs].sort()) {
                if (o === exclude) continue
                if (drop && drop.has(nk + '|' + o)) continue
                if (delF && delF.del.size && delF.del.has(nk + '|' + o)) continue
                const po = this._nodePos(o.split(',').map(Number))
                const dx = po.x - pn.x, dz = po.z - pn.z, l = Math.hypot(dx, dz)
                if (l > 1e-9) out.push({ x: dx / l, z: dz / l })
                if (out.length >= 4) break
            }
            return out.length ? out : undefined
        }
        const sibStart = sibsOf(kA, kB), sibGoal = sibsOf(kB, kA)
        if (sibStart) dirs.sibStart = sibStart
        if (sibGoal) dirs.sibGoal = sibGoal
        // R4: an edge whose endpoint's pin CLASS flipped when the delete set settled routes in its
        // own cache namespace ('#b') — its pins differ from the layer-0 pins the warm path derives,
        // and the two geometries must never collide on one cache key.
        if (delF && (delF.flip.has(kA) || delF.flip.has(kB))) dirs._built = true
        return dirs
    }

    // ── BUG-53: fork-at-last-crossing trims (owner-ruled 2026-08-21) ──────────────────────────
    // Two runs sharing a node that CROSS mid-span are the same corridor drawn twice. The fix, at
    // the POLYLINE level: the loser adopts the winner's polyline VERBATIM from the shared node out
    // to the farthest crossing (one pavement, a Y-fork at the crossing, both terminal strands
    // kept), its outer profile re-solves pinned to the winner's height at the fork, and the ceded
    // interval is suppressed in the slicer + surface resolve. Crossings evaporate; the graph, the
    // site ids and connectivity are untouched. Full design: the FEAT-68 ticket ("The trim,
    // re-ruled and designed at the POLYLINE level").

    // The runKey spelling _assembleGraphEdges will register an edge under (the g.edges tuple
    // order). Profiles are not perfectly direction-symmetric (DP tie-breaks), so the trim must
    // sample the winner in its REGISTERED spelling or the copied heights could drift sub-quantum.
    _v2EdgeSpellings(g) {
        if (!this._v2SpellMemo) this._v2SpellMemo = new WeakMap()
        let m = this._v2SpellMemo.get(g)
        if (m) return m
        m = new Map()
        for (const [c1, c2] of g.edges) {
            const a = g.key(c1), b = g.key(c2)
            m.set(a < b ? a + '|' + b : b + '|' + a, [c1, c2])
        }
        this._v2SpellMemo.set(g, m)
        return m
    }

    // Pure sampled + profiled view of an edge's PRE-TRIM route, in a given spelling — exactly the
    // arrays _registerRun would build for it. Memoization only (pure fn of terrain + edge + prices).
    // FEAT-77: the PASS-1 sample — the edge routed on its base dirs alone. What the clearance walk
    // compares; never handed to a consumer (they take _v2RunSample, which is pass 2 for a loser).
    _v2RunSample1(g, drop, c1, c2) {
        const key = `g:${g.key(c1)}:${g.key(c2)}`
        if (!this._v2Sample1Memo || this._v2Sample1Memo.rev !== this._planRev())
            this._v2Sample1Memo = { rev: this._planRev(), map: new Map() }
        const memo = this._v2Sample1Memo.map
        const hit = memo.get(key)
        if (hit !== undefined) return hit
        const out = this._v2SampleCenterline(this._edgeCenterline(c1, c2, this._v2EdgeDirsBase(g, drop, g.key(c1), g.key(c2))))
        if (memo.size > 500) memo.clear()
        memo.set(key, out)
        return out
    }

    _v2SampleCenterline(cl) {
        if (!cl || !(cl.length > 1e-6)) return null
        const n = Math.max(1, Math.ceil(cl.length / PROTO_SAMPLE_DS))
        const pts = new Array(n + 1)
        const clArc = new Float64Array(n + 1)
        for (let i = 0; i <= n; i++) {
            const sArc = cl.length * i / n
            clArc[i] = sArc
            const pp = cl.pointAt(sArc)
            pts[i] = new THREE.Vector3(pp.x, this._coarseH(pp.x, pp.z), pp.z)
        }
        const spans = this._v2GradePts(pts, clArc)
        const polyCum = new Float64Array(n + 1)
        for (let i = 1; i <= n; i++) polyCum[i] = polyCum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
        return { pts, clArc, polyCum, spans, L: polyCum[n] }
    }

    /**
     * FEAT-77 SECOND PASS — is edge (kA,kB) a LOSER, and against whom? Walks its pass-1 sample
     * against every partner's pass-1 sample (node-sharing partners from the graph, plus the
     * census's chord bound), outside the shared-node throat and outside bores. A pair is this
     * pass's business only where it is inside the rule yet NEVER inside mergeProxM — inside the
     * merge distance the T machinery owns it. Returns the router's occupancy payload or null.
     */
    _v2ClearanceFor(g, drop, kA, kB) {
        if (!this._v2ClearMemo || this._v2ClearMemo.rev !== this._planRev())
            this._v2ClearMemo = { rev: this._planRev(), map: new Map() }
        const memo = this._v2ClearMemo.map
        const ck = kA < kB ? kA + '|' + kB : kB + '|' + kA
        if (memo.has(ck)) return memo.get(ck)
        memo.set(ck, null)   // bars re-entry while computing
        const c1 = kA.split(',').map(Number), c2 = kB.split(',').map(Number)
        const S = this._v2RunSample1(g, drop, c1, c2)
        if (!S) return null
        const C = this._v2Costs()
        const PROX = C.mergeProxM ?? 18, THROAT = C.clearThroatM ?? 30, CHORD = C.censusChordM ?? 300
        const delF = this._v2DelFrozen?.rev === this._networkRev ? this._v2DelFrozen.del : null
        const dropped = (a, b) => (drop && drop.has(a + '|' + b)) || (delF && delF.size && delF.has(a + '|' + b))
        // partners: node-sharing first, then chords the pass-1 line passes within CHORD of
        const partners = new Map()
        for (const [nk, other] of [[kA, kB], [kB, kA]]) for (const o of (g.adj.get(nk) || [])) {
            if (o === other || dropped(nk, o)) continue
            const pk = nk < o ? nk + '|' + o : o + '|' + nk
            if (pk !== ck) partners.set(pk, [nk.split(',').map(Number), o.split(',').map(Number)])
        }
        let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity
        for (const p of S.pts) { if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x; if (p.z < minz) minz = p.z; if (p.z > maxz) maxz = p.z }
        for (const [q1, q2] of g.edges) {
            const a = g.key(q1), b = g.key(q2)
            if (a === kA || a === kB || b === kA || b === kB || dropped(a, b)) continue
            const pk = a < b ? a + '|' + b : b + '|' + a
            if (partners.has(pk)) continue
            const A = this._nodePos(q1), B = this._nodePos(q2)
            if (Math.max(A.x, B.x) + CHORD < minx || Math.min(A.x, B.x) - CHORD > maxx || Math.max(A.z, B.z) + CHORD < minz || Math.min(A.z, B.z) - CHORD > maxz) continue
            let d = Infinity
            for (let i = 0; i < S.pts.length && d > CHORD; i += 4) d = Math.min(d, _segSegDistXZ(S.pts[i], S.pts[i], A, B))
            if (d <= CHORD) partners.set(pk, [q1, q2])
        }
        const lines = [], exempt = []
        for (const [pk, [q1, q2]] of partners) {
            const Q = this._v2RunSample1(g, drop, q1, q2)
            if (!Q) continue
            const qA = g.key(q1), qB = g.key(q2)
            const shA = qA === kA || qB === kA, shB = qA === kB || qB === kB
            let violates = false, merges = false
            for (let i = 0; i < S.pts.length; i++) {
                const s = S.polyCum[i]
                if ((shA && s < THROAT) || (shB && s > S.L - THROAT)) continue
                if ((S.spans || []).some((sp) => s >= sp.s0 - 80 && s <= sp.s1 + 80)) continue
                const h = _nearestOnPolyXZ(S.pts[i].x, S.pts[i].z, Q.pts, Q.polyCum)
                if (!h || h.d > 60) continue
                if (h.d < PROX) { merges = true; break }
                if (h.d < this._v2ClearReq(S.pts[i], h)) violates = true
            }
            if (merges || !violates) continue
            // the LOSER re-routes: the longer pass-1 route, tie broken by the larger key
            const loserIsMe = S.L > Q.L + 1e-6 || (Math.abs(S.L - Q.L) <= 1e-6 && ck > pk)
            if (!loserIsMe) continue
            const flat = new Float64Array(Q.pts.length * 3)
            for (let i = 0; i < Q.pts.length; i++) { flat[3 * i] = Q.pts[i].x; flat[3 * i + 1] = Q.pts[i].y; flat[3 * i + 2] = Q.pts[i].z }
            lines.push(flat)
            for (const nk of [kA, kB]) if (nk === qA || nk === qB) { const p = this._nodePos(nk.split(',').map(Number)); exempt.push(p.x, p.z) }
        }
        if (!lines.length) return null
        const out = { lines, exempt, exemptM: THROAT, prm: this._v2ClearPrm() }
        memo.set(ck, out)
        return out
    }

    _v2RunSample(g, drop, c1, c2) {
        const key = `g:${g.key(c1)}:${g.key(c2)}`
        if (!this._v2SampleMemo || this._v2SampleMemo.rev !== this._planRev())
            this._v2SampleMemo = { rev: this._planRev(), map: new Map() }
        const memo = this._v2SampleMemo.map
        const hit = memo.get(key)
        if (hit !== undefined) return hit
        // FEAT-77: pass 2 by construction — _v2EdgeDirs carries the loser's occupied lines.
        const out = this._v2SampleCenterline(this._edgeCenterline(c1, c2, this._v2EdgeDirs(g, drop, g.key(c1), g.key(c2))))
        if (memo.size > 500) memo.clear()
        memo.set(key, out)
        return out
    }

    // Per-NODE merge plans: Map<loserCanonKey, spec>. A pure fn of the node's post-degree-drop
    // incident edges and their pure routes — the identical 1-ring the heading pins derive, so every
    // window computes the same plans (the BUG-25 invariance argument). Deterministic per-node role
    // resolution: pairs sorted, first-come role sets — a run that loses at N is never a winner at
    // N, one merge per run per node. One winner may serve SEVERAL losers: a junction whose legs all
    // leave together is a shared throat that forks twice (the owner's 1668/7534 capture, three legs
    // at one node).
    //
    // BUG-53 phase 2 (owner ruling 2026-08-22): the anchor is PROXIMITY, not a crossing. Two runs
    // CONFLICT while their centres are within mergeProxM — the shared-earthworks distance — and the
    // merge runs from the node out to the far end of the last conflict. A crossing is automatically
    // a conflict (the polylines meet there, so separation is ~0 at the samples either side), which
    // is why this one predicate replaces the crossing-anchored rule instead of sitting beside it:
    // pure-parallel pairs, crossings inside an overlap, and bow-apart-then-cross are all the same
    // shape to it. Crossings survive in the code for ONE job — licensing a merge to bridge a gap in
    // the conflict, which is what collapses a bow (capture 1044/7423). Mere proximity never bridges.
    // FEAT-77: `legacy` plans the node under the OLD fixed proximity (mergeProxM) instead of the
    // clearance rule. _v2MergeFor asks for it only when a pair's rule-based plan has no buildable
    // T: the owner's ruling is that a T main had must not be lost to the wider rule ("wherever
    // main resolved the pair with a T … omit the wider rule in these cases", 2026-09-08), and the
    // pair is then counted `promote-legacy` so the gate can still see the residue.
    _v2NodeMerges(g, drop, nk, legacy = false) {
        if (!this._v2MergeMemo || this._v2MergeMemo.rev !== this._planRev())
            this._v2MergeMemo = { rev: this._planRev(), map: new Map() }
        const memo = this._v2MergeMemo.map
        const mk = legacy ? nk + '#L' : nk
        const hit = memo.get(mk)
        if (hit !== undefined) return hit
        const C = this._v2Costs()
        const PROX = C.mergeProxM ?? 18   // m — centre separation that counts as one shared road
        const GAPM = C.mergeGapM ?? 200    // m — longest flare the merge may bridge, along the run
        const FLARE = C.mergeFlareM ?? 60  // m — widest the pair may swing apart inside a merge
        // m — the shortest shared throat worth merging. WAS 30, "pad-dressing territory" — but a pad
        // reaches 10 m by rule and 13.5 m as built (BUG-59), so 13-30 m was owned by NEITHER the pad
        // nor a merge, and every one of junction-stitch's 80 violations sat in that hole (10-28 m
        // from the node, median 12). Lowered so the two regimes meet. Below ~20 it gets worse again
        // (measured: 30 -> 80 sites, 20 -> 75, 14 -> 77) — a throat shorter than this cannot host a
        // departure band at all, so admitting it only produces declines.
        const MINREG = 20
        const MAXFRAC = 0.85 // sanity only — cross-node conflicts are checked PRECISELY at apply
                             // time (_v2MergeFor: the winner's own loser-region must not overlap the
                             // adopted strand). The old blanket 0.5 rejected the owner's captured
                             // braid, whose weave legitimately spans ~55% of each run. (Measured
                             // 2026-08-22: raising this to 0.95 changes no seed — it is not what
                             // bounds the remaining conflicts.)
        const FORKWIN = 80   // m — arc window for locating the fork abreast on the loser
        const MINSPAN = 60   // m — a mid-span strand shorter than this is not worth two forks
        const MIDSPAN_ON = C.mergeMidSpan !== false
        // BUG-56 B5 — the floor for the band's DENSE radius (buildTaper measures the swept curve,
        // not the control polyline) is the ROAD'S OWN CONTRACT, roadMinTurnRadius, not a separate
        // smaller number. It used to be 6: enough to clear the 5.5 m ribbon FOLD limit (BUG-12,
        // gated by road-minradius) and the shipped network's tightest measured corner of 5.70 m,
        // and the note here argued that anything higher held a band to a standard the roads it
        // joins do not meet. The 2026-08-27 census says otherwise, and it is the reason the owner
        // opened this ticket: the MEDIAN taper band is tighter than the FIRST PERCENTILE of open
        // road — median band radius 23.3 m against open road's 1st pct 24.8 m and median 308 m —
        // with 38 of 70 bands under 25 m and 4 outright under roadMinTurnRadius, tightest 12.8 m.
        // "A road coming in perpendicular and then last second turning to be parallel" IS a 13-23 m
        // radius turn in a network that otherwise never goes below 25. A band is road; it may not
        // be tighter than road.
        //
        // But it is a LADDER, not a hard swap, and that was measured too. A gentler band is a LONGER
        // band, a longer band runs alongside the through road further, and a band that clears no
        // rung LOSES ITS MERGE — at which point the two roads run parallel unsanctioned, which is
        // what graph-topology's corridor-clearance check exists to catch. Swapping the floor outright
        // cost 3 merges and turned one of them into 50 sample pairs at 1.3 m separation. So: take the
        // gentlest band at or above the road's own radius, and only if NOTHING clears it fall back to
        // RFLOOR_MIN — the ribbon FOLD limit (5.5 m, BUG-12, gated by road-minradius) plus margin,
        // which is a safety floor rather than a quality one and is never relaxed.
        // Band lengths tried, shortest first: a gentle fork settles at 40 m, a wide one needs the
        // upper rungs to swing the whole turn at road radius.
        const out = new Map()
        const nbrsRaw = g.adj.get(nk)
        const nbrs = nbrsRaw ? [...nbrsRaw].filter((o) => !drop || !drop.has(nk + '|' + o)).sort() : []
        if (nbrs.length < 2) { memo.set(mk, out); return out }
        const spell = this._v2EdgeSpellings(g)
        const inc = []
        for (const o of nbrs) {
            const ck = nk < o ? nk + '|' + o : o + '|' + nk
            const sp = spell.get(ck)
            if (!sp) continue
            const S = this._v2RunSample(g, drop, sp[0], sp[1])
            if (!S || S.L < 2 * MINREG) continue
            inc.push({ ck, sp, S, nodeAtStart: g.key(sp[0]) === nk })
        }
        const clArcAt = _clArcOfCum
        // arc measured FROM this node (runs are spelled either way round; the merge always starts
        // at the node, so every interval below is in node-arc, converted back at the end)
        const fromNode = (R, cum) => (R.nodeAtStart ? cum : R.S.L - cum)
        const toRunArc = (R, f) => (R.nodeAtStart ? f : R.S.L - f)
        // The conflict walk: WHERE do P and Q stay one road? Returns every maximal interval in
        // which they are within PROX, in node-arc, each already extended across its FLARES — a
        // stretch where they swing apart and come back.
        //
        // The flare bound is what makes one predicate cover several shapes. A pair that bulges out
        // and closes again is ONE road with a bulge, not two roads going different places, and
        // several of the owner's captures are exactly that (flares of 35, 44 and 49 m, one of them
        // crossing itself inside the flare). A crossing needs no case of its own — the polylines
        // MEET there, so its samples are already in conflict; that is why the crossing search this
        // replaced is gone entirely.
        //
        // Interval [0] always starts at the shared node (separation is 0 there). Later intervals are
        // MID-SPAN: the legs parted at the node, went their own way, and came back together further
        // out — the owner's seed-6 marks at (-1710,1760) and (-1091,2792), where a 82–121 m flare
        // sits between the node and 170–195 m of dead-parallel road.
        // Just the node-anchored interval's far end, walked lazily — most pairs at a junction part
        // company within a few samples, so this never touches the rest of the run.
        // FEAT-77: "within PROX" is now the height-aware conflict predicate (_v2ClearReq), with the
        // old proximity kept inside the shared node's throat (every walk here starts at the node).
        const THROAT = C.clearThroatM ?? 30
        const near = legacy ? (pa, h) => h.d <= PROX : this._v2Near((s) => s < THROAT)
        const firstInterval = (P, Q) => {
            const n = P.S.pts.length
            const idx = (k) => (P.nodeAtStart ? k : n - 1 - k)
            const arcAt = (k) => fromNode(P, P.S.polyCum[idx(k)])
            let lastD = Infinity
            const nearAt = (k) => { const pa = P.S.pts[idx(k)]; const h = _nearestOnPolyXZ(pa.x, pa.z, Q.S.pts, Q.S.polyCum); lastD = h.d; return near(pa, h, arcAt(k)) }
            let k = 0, end = 0
            while (k < n && nearAt(k)) { end = arcAt(k); k++ }
            if (!k) return 0
            for (;;) {
                let j = k, flare = 0, apart = true
                while (j < n && (apart = !nearAt(j)) && arcAt(j) - end <= GAPM) { flare = Math.max(flare, lastD); j++ }
                if (j >= n || apart || flare > FLARE) break
                while (j < n && nearAt(j)) { end = arcAt(j); j++ }
                k = j
            }
            return end
        }
        // Coarse gate before paying for a full-run walk. Nearly every pair of legs at a junction
        // parts immediately and never comes back, and scanning both runs end to end for all of them
        // tripled the network build. Sample every STRIDE-th vertex beyond the node interval: a
        // sample within PROX of the partner is at most STRIDE/2 vertices from a coarse one, so a
        // coarse hit within PROX + that distance cannot be missed.
        const MIDSTRIDE = 8
        // COARSE on both sides — every MIDSTRIDE-th vertex of each run, compared point to point.
        // A sample within PROX of the partner's line is at most MIDSTRIDE/2 vertices from a coarse
        // one on each side, so a true conflict always shows up as a coarse pair within
        // PROX + MIDSTRIDE·ds. Conservative, and it still rejects the ordinary case (two legs that
        // leave a junction and never meet again) in ~1k cheap comparisons instead of ~8k
        // point-to-polyline ones. Without this gate the full-run walk ran for nearly every pair and
        // tripled the network build.
        const coarseOf = (R) => {
            if (R.S._coarse) return R.S._coarse
            const out = []
            for (let i = 0; i < R.S.pts.length; i += MIDSTRIDE) out.push(R.S.pts[i])
            R.S._coarse = out
            return out
        }
        const maybeMidSpan = (P, Q, nodeEnd) => {
            const lim = this._v2ClearMax() + MIDSTRIDE * PROTO_SAMPLE_DS   // FEAT-77: the widest the rule can reach
            const lim2 = lim * lim
            const cq = coarseOf(Q), n = P.S.pts.length
            for (let k = 0; k < n; k += MIDSTRIDE) {
                const i = P.nodeAtStart ? k : n - 1 - k
                if (fromNode(P, P.S.polyCum[i]) < nodeEnd + MINSPAN) continue
                const px = P.S.pts[i].x, pz = P.S.pts[i].z
                for (let j = 0; j < cq.length; j++) {
                    const dx = px - cq[j].x, dz = pz - cq[j].z
                    if (dx * dx + dz * dz <= lim2) return true
                }
            }
            return false
        }
        // BUG-55: the walk itself lives at module scope (_conflictIntervalsXZ) so the pair census
        // can run it on DISJOINT pairs too; anchored here at this node, exactly as before.
        const conflictIntervals = (P, Q) =>
            _conflictIntervalsXZ(P.S, P.nodeAtStart, Q.S, near, GAPM, FLARE, () => this._v2MergeSkipped('flare'))

        // The fork machinery — buildTaper and midSpanPair — lives as methods now
        // (_v2BuildTaper/_v2MidSpanPair) so the BUG-55 disjoint planner reuses the IDENTICAL
        // taper construction and guards; ctx carries this planner's constants and report tag.
        const ctx = { PROX, GAPM, FLARE, MINREG, MINSPAN, tag: `@${nk}` }
        const pairs = []
        for (let i = 0; i < inc.length; i++) for (let j = i + 1; j < inc.length; j++) {
            const A = inc[i], B = inc[j]
            // The node-anchored answer needs only the FIRST interval, and that is a prefix of the
            // run — so walk it lazily and stop. Only when there is no node merge to make do we pay
            // for the whole run (below), which is what a mid-span candidate needs.
            const fA = firstInterval(A, B), fB = firstInterval(B, A)
            // Under MINREG there is nothing to merge THAT STARTS AT THIS NODE — which is every pair
            // of legs at every junction, so it is not counted. Note what it does NOT cover: a pair
            // that parts at the node, goes its own way, and conflicts again deep mid-span. Merging
            // that needs a band tapered at BOTH ends rather than node-exact at one; the overlap
            // census is what reports those, and they are the next piece of this work.
            if (fA < MINREG || fB < MINREG) {
                // Nothing to merge STARTING AT THIS NODE — which is every ordinary junction, so it
                // is not reported. But the legs may still come back together further out: the
                // owner's seed-6 marks part at the node, swing 82–121 m apart, and only then run
                // 170–195 m dead parallel. That is a MID-SPAN merge, forked at both ends.
                // BUG-55: the coarse gate runs even with the feature off, so a declined candidate
                // is COUNTED — capture-classify can then answer "why didn't this pair merge" with
                // a named reason instead of silence.
                if (!maybeMidSpan(A, B, fA)) continue
                if (!MIDSPAN_ON) { this._v2MergeSkipped('midspanOff', `${A.ck} x ${B.ck} @${nk}`); continue }
                const mid = this._v2MidSpanPair(ctx, A, B, conflictIntervals(A, B))
                if (mid) pairs.push(mid)
                continue
            }
            if (fA > MAXFRAC * A.S.L || fB > MAXFRAC * B.S.L) { this._v2MergeSkipped('frac', `${A.ck} x ${B.ck} @${nk}`); continue }
            // The SPINE survives: the longer run owns the shared pavement and the shorter legs join
            // it, which is how a real junction is built — and it is what makes a bundle of three or
            // more legs resolve to ONE winner, because a total order on length has a single maximum.
            // (The shipped rule picked the shorter node→fork strand. With a proximity anchor the two
            // strands end at the same place, so that rule degenerated into a lexicographic coin
            // flip, and at the owner's three-leg junction it made the through-road a loser — which
            // then barred it from serving the third leg at all.)
            const aWins = A.S.L > B.S.L || (A.S.L === B.S.L && A.ck < B.ck)
            const W = aWins ? A : B, L2 = aWins ? B : A
            const fW = aWins ? fA : fB, fLw = aWins ? fB : fA
            // R6 (owner, 2026-08-31): a merge that would overwrite a PINNED approach is a
            // preference, not a hard rule — at seed 21 node 1,0,2 all three legs routed with their
            // pins and the merge still replaced one leg's pinned approach with its sibling's
            // geometry (the 86°-apart pairing over the 160° through axis). Decline where it is
            // SAFE: the pair's routes never properly cross (a shipped crossing is delete-rung bait
            // — B3's hard rule split seed 7) and the overlap is bounded. Count where it is not.
            // "Did the leg keep its pin" is read off the GEOMETRY (first-leg direction vs the pin
            // cone), never off route metadata — a cache-rehydrated route must answer identically.
            const pinHeld = (R) => {
                const dirs2 = this._v2EdgeDirs(g, drop, g.key(R.sp[0]), g.key(R.sp[1]))
                const pin = dirs2 && (R.nodeAtStart ? dirs2.startDir
                    : (dirs2.goalDir ? { x: -dirs2.goalDir.x, z: -dirs2.goalDir.z } : null))
                if (!pin) return false
                const nP = R.S.pts.length
                const i0 = R.nodeAtStart ? 0 : nP - 1, i1 = R.nodeAtStart ? 1 : nP - 2
                const dx = R.S.pts[i1].x - R.S.pts[i0].x, dz = R.S.pts[i1].z - R.S.pts[i0].z
                const l = Math.hypot(dx, dz) || 1
                return (dx * pin.x + dz * pin.z) / l >= 0.5
            }
            const xingsEarly = _pairProperCrossingsXZ(A.S, A.nodeAtStart, B.S, B.nodeAtStart, true)
            if (pinHeld(L2)) {
                // R8 refined "safe" as one road width beyond the pad. FEAT-77 (owner, 2026-09-07)
                // supersedes it: the floor R6 declines at is THE CLEARANCE RULE (_v2ClearReq) —
                // neither road's earthwork may reach the other. A pair that kept 16 m over 28 m
                // used to be legal two roads and kept its pin; it is now a conflict, and declining
                // the merge for it left it unresolved (measured the moment the predicate widened:
                // declines 7 → 182, and the clearance residue was made of exactly those pairs).
                // `minSep` is the worst SLACK against the rule, and a decline needs it non-negative.
                let minSep = Infinity
                {
                    const nP = L2.S.pts.length
                    for (let k2 = 0; k2 < nP; k2++) {
                        const i2 = L2.nodeAtStart ? k2 : nP - 1 - k2
                        const arc2 = fromNode(L2, L2.S.polyCum[i2])
                        if (arc2 < 15) continue
                        if (arc2 > fLw) break
                        const h2 = _nearestOnPolyXZ(L2.S.pts[i2].x, L2.S.pts[i2].z, W.S.pts, W.S.polyCum)
                        const slack = h2.d - this._v2ClearReq(L2.S.pts[i2], h2)
                        if (slack < minSep) minSep = slack
                    }
                }
                // The 80 m bound is graph-topology corridor-clearance's own endpoint exemption:
                // a declined pair at 10–18 m of separation is legal R8 ground, but past 80 m from
                // the node it would trip the 17.5 m parallel-runs floor — so a LONG hug merges
                // (counted) even off a pinned approach. Seed 21's 175 m pair is the counted case.
                // (History: R6 at 2·halfWidth and R8 at exactly 10 m contradicted each other, the
                // owner ruled R8 wins and then dropped the 2·HW + 4 fix on the numbers. FEAT-77's
                // rule settles it from above — it is stricter than both — so that record is closed.)
                if (!xingsEarly.length && minSep >= 0 && fLw <= (C.mergePinDeclineMaxM ?? 80)) {
                    this._v2MergeSkipped('pin-decline', `${L2.ck} keeps its pinned approach @${nk} (R6 — overlap ${fLw.toFixed(0)} m, clear of the rule by ${minSep.toFixed(1)} m, no crossings)`)
                    continue
                }
                this._v2MergeSkipped('pin-overwrite', `${L2.ck} @${nk} (R6 counted — ${xingsEarly.length ? 'tangled' : `inside the rule by ${(-minSep).toFixed(1)} m over ${fLw.toFixed(0)} m`})`)
            }
            // VARIANTS: the full merge first, then progressively shorter ones. Only a solved profile
            // can say whether the loser's remaining road still grades from the winner's DECK at the
            // fork, and when it cannot, sharing LESS of the pavement is a real answer — better than
            // abandoning the merge and leaving two roads carving the same dirt. The assembly walks
            // this list and takes the first that builds. It is a pure function of the node's 1-ring,
            // so every window offers the same list and picks the same entry.
            //
            // Guards are reported only for the FULL merge: a shorter variant failing one of them is
            // the ladder working, not a defect going unfixed.
            const variants = []
            // BUG-57 rung (owner re-scope, session 2): "keep the connection, trim the mess". A
            // pair whose routes PROPERLY CROSS beyond the throat is a TANGLE — for those, and
            // only those, the ladder relaxes: the >135° guard is waived (the crossing is the
            // measured proof this is a mess, not a wanted hairpin), the fork may slide OUTWARD
            // past the crossings (extra frac rungs below), direct-span bands are allowed, and
            // only variants whose ceded extent SPANS every crossing are kept — a merge that
            // leaves a crossing outside its built extent resolves nothing (the crossing rung
            // would still fire and the connection would die anyway).
            const xingsAB = xingsEarly
            const tangled = xingsAB.length > 0
            let maxCrossL = 0
            for (const x of xingsAB) maxCrossL = Math.max(maxCrossL, fromNode(L2, aWins ? x.sB : x.sA))
            const tryFrac = (frac, report) => {
                const fWf = fW * frac
                if (fWf < MINREG) return
                const wCutF = toRunArc(W, fWf)
                const wPtF = _polyAtCum(W.S.pts, W.S.polyCum, wCutF)
                // The loser's own arc ABREAST of the fork — NOT its own walk result: the band must
                // start beside the winner or it would begin skewed. Windowed on the loser's own
                // divergence, because a run that loops back can otherwise answer with a point from
                // the wrong end of itself.
                const lo = toRunArc(L2, Math.max(0, fLw * frac - FORKWIN))
                const hi = toRunArc(L2, Math.min(L2.S.L, fLw * frac + FORKWIN))
                const nearF = _nearestOnPolyXZ(wPtF.x, wPtF.z, L2.S.pts, L2.S.polyCum, Math.min(lo, hi), Math.max(lo, hi))
                const lCutF = nearF.cum, fLf = fromNode(L2, lCutF)
                if (fLf < MINREG) { if (report) this._v2MergeSkipped('short', `${L2.ck} x ${W.ck} @${nk} fork at ${fLf.toFixed(0)}m`); return }
                if (fLf > MAXFRAC * L2.S.L) { if (report) this._v2MergeSkipped('frac', `${L2.ck} x ${W.ck} @${nk}`); return }
                const tW = _polyTangentAtCum(W.S.pts, W.S.polyCum, wCutF, W.nodeAtStart)
                const tL = _polyTangentAtCum(L2.S.pts, L2.S.polyCum, lCutF, L2.nodeAtStart)
                const th = Math.acos(Math.max(-1, Math.min(1, tW.x * tL.x + tW.z * tL.z)))
                // A fork may be WIDE — a leg leaving at 100° is a T, and building it as one is the
                // point. What no band can express is a leg DOUBLING BACK: past 135° the loser would
                // U-turn off the winner, which is a switchback, not a fork, and merging one would
                // delete a hairpin. WAIVED for a tangled pair — its crossing already proves the
                // shape is not a hairpin worth keeping, and the direct-span rungs can spread the
                // wide turn over enough band to clear the fold floor.
                if (th > Math.PI * 0.75 && !tangled) {
                    if (report) {
                        this._v2MergeSkipped('angle', `${L2.ck} x ${W.ck} @${nk} ${(th * 180 / Math.PI).toFixed(0)}deg`)
                    }
                    return
                }
                if (_winnerBoreAtFork(W.S, W.nodeAtStart, wCutF)) { if (report) this._v2MergeSkipped('bore', `${L2.ck} x ${W.ck} @${nk}`); return }
                // QUAL-30: NO BAND IS SIZED HERE any more, and the ladder that sized one is gone.
                // A T's departure is built and judged at promotion time — _v2BuildDeparture walks
                // its own radius ladder, _v2DepartureAccepts rules on the result — so the plan
                // layer's whole job is to name WHERE the fork could go. One variant per fraction.
                const ownLeft = L2.nodeAtStart ? L2.S.L - lCutF : lCutF
                if (ownLeft < MINREG) return                  // no road left past the fork to carry on along
                // The extent that must span the mess is the fork PLUS the departure blend, the same
                // reach _v2CededExtents sanctions — not the bare fork. Testing the bare fork was
                // measured to reject forks the wye's band join had cleared, and the pairs it dropped
                // ran unsanctioned instead: 66 sample pairs under 9.5 m, worst 0.7 m
                // (graph-topology GRAPH-CORRIDOR-CLEARANCE red at seed 6 (4060,2268)).
                const LBmax = Math.max(20, Math.min(Math.sqrt(2 * PROX * 4 * (this._params?.roadMinTurnRadius ?? 12)), 90))
                if (tangled && fLf + LBmax < maxCrossL + 10) return
                variants.push({ wCut: wCutF, lCut: lCutF, forkPt: { x: wPtF.x, z: wPtF.z }, region: fLf })
            }
            for (const frac of [1, 0.75, 0.5]) tryFrac(frac, frac === 1)
            // OUTWARD rungs — "skip the points up to past the mess, connect further out".
            // BUG-57 introduced these for TANGLED pairs, targeted past the farthest crossing.
            // BUG-56 (owner addition 2026-08-26) generalises the same technique to GRADE: with the
            // departure hold in force a leg must ride the through deck until it is laterally clear,
            // and where the fork lands on a steep stretch it can no longer both hold that deck and
            // make its climb — the strand solve declines. Looking further out gives it a fork where
            // it has room. Appended AFTER the standard ladder in every case, so an ordinary cession
            // still wins wherever it builds: these rungs are reached only when the shorter ones
            // failed to assemble.
            if (fLw > 1e-6 && fW > 1e-6) {
                const cap = MAXFRAC * Math.min(W.S.L / fW, L2.S.L / fLw)
                const want = tangled ? (maxCrossL + 40) / fLw : 1.25
                const outward = [...new Set([want, want * 1.3, 1.5, 2].map((f) => Math.min(f, cap)))]
                    .filter((f) => f > 1.01).sort((x, y) => x - y)
                for (const frac of outward) tryFrac(frac, false)
            }
            if (!variants.length) continue
            pairs.push({ W, L: L2, variants, region: variants[0].region, sortKey: L2.ck + '>' + W.ck })
        }
        // worst first, so a role conflict costs the SMALLER merge (deterministic: length, then key)
        pairs.sort((a, b) => (b.region - a.region) || (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
        // Role sets. A winner may appear in several pairs (one throat, many forks); what is barred
        // is a run being both, or ceding twice, at this node.
        const winners = new Set(), losers = new Set()
        for (const pr of pairs) {
            if (losers.has(pr.W.ck) || winners.has(pr.L.ck) || losers.has(pr.L.ck)) { this._v2MergeSkipped('role', `${pr.L.ck} would cede to ${pr.W.ck} @${nk} (${pr.region.toFixed(0)} m)`); continue }
            winners.add(pr.W.ck); losers.add(pr.L.ck)
            out.set(pr.L.ck, {
                legacy,
                winner: pr.W.sp, winnerNodeAtStart: pr.W.nodeAtStart,
                loserNodeAtStart: pr.L.nodeAtStart, midSpan: !!pr.midSpan,
                variants: pr.variants, region: pr.region,
            })
        }
        memo.set(mk, out)
        return out
    }

    // A MID-SPAN merge: the two legs part at the node, go their own way, and later run
    // together. The loser cedes only that middle stretch and forks at BOTH ends, so its own
    // road either side of the shared strand survives — which is the point. Deleting the whole
    // leg back to the node instead would erase a real alternative line (one of the owner's
    // marks bulges 121 m with a 25 m deck difference through the bulge: that is a road, not a
    // wobble).
    _v2MidSpanPair(ctx, A, B, ivA) {
            // the longest interval that is NOT the node-anchored one, present on both sides
            // (BUG-55: a DISJOINT pair has no node-anchored interval — ctx.allIntervals starts at 0)
            let best = null
            for (let i = ctx.allIntervals ? 0 : 1; i < ivA.length; i++) {
                const len = ivA[i].s1 - ivA[i].s0
                if (len < ctx.MINSPAN) continue
                if (!best || len > best.len) best = { len, iv: ivA[i] }
            }
            if (!best) return null
            // BUG-55: a disjoint pair's winner is fixed by DISCOVERABILITY (ctx.winnerCk), not
            // the spine — the winner must be findable from the loser's route in every window.
            const aWins = ctx.winnerCk ? A.ck === ctx.winnerCk
                : (A.S.L > B.S.L || (A.S.L === B.S.L && A.ck < B.ck))
            const W = aWins ? A : B, L2 = aWins ? B : A
            // BUG-57 rung: a crossing-carrying mid-span pair may use direct-span bands too (the
            // throat applies only when the pair shares a node — the disjoint planner sets
            // allIntervals and has none).
            const tangled = _pairProperCrossingsXZ(A.S, A.nodeAtStart, B.S, B.nodeAtStart,
                                                   !ctx.allIntervals).length > 0
            const endPt = (f) => _polyAtCum(A.S.pts, A.S.polyCum, A.nodeAtStart ? f : A.S.L - f)
            const variants = []
            // Shrink the shared strand from either end when a fork will not build. The fork lands
            // where the two courses are already parting, so pulling it back a little puts it where
            // they are still nearly parallel and the taper is gentle. Full strand first; guards are
            // reported only for that one, since a shrunk attempt failing is the ladder working.
            // Shrink combos, widest strand first. More than a couple matter: the fork PINS the
            // loser to the winner's deck, and where that deck sits relative to the loser's own
            // profile varies along the strand — one of the owner's pairs is 14.5 m apart vertically
            // at its worst and only grades from a fork placed where the two decks are close.
            for (const [shIn, shOut] of [[0, 0], [0, 0.2], [0.2, 0], [0, 0.4], [0.4, 0], [0.2, 0.2],
                                         [0, 0.55], [0.55, 0], [0.3, 0.3]]) {
                const report = shIn === 0 && shOut === 0
                const f0 = best.iv.s0 + shIn * best.len, f1 = best.iv.s1 - shOut * best.len
                if (f1 - f0 < ctx.MINSPAN) continue
                const p0 = endPt(f0), p1 = endPt(f1)
                const onL0 = _nearestOnPolyXZ(p0.x, p0.z, L2.S.pts, L2.S.polyCum)
                const onL1 = _nearestOnPolyXZ(p1.x, p1.z, L2.S.pts, L2.S.polyCum)
                const onW0 = _nearestOnPolyXZ(p0.x, p0.z, W.S.pts, W.S.polyCum)
                const onW1 = _nearestOnPolyXZ(p1.x, p1.z, W.S.pts, W.S.polyCum)
                if (Math.abs(onL1.cum - onL0.cum) < ctx.MINSPAN || Math.abs(onW1.cum - onW0.cum) < ctx.MINSPAN) continue
                const lDir = onL1.cum > onL0.cum ? 1 : -1
                const wDir = onW1.cum > onW0.cum ? 1 : -1
                const headRoom = lDir > 0 ? onL0.cum : L2.S.L - onL0.cum
                const tailRoom = lDir > 0 ? L2.S.L - onL1.cum : onL1.cum
                if (headRoom < ctx.MINREG || tailRoom < ctx.MINREG) { if (report) this._v2MergeSkipped('room', `${L2.ck} x ${W.ck} ${ctx.tag} mid-span`); continue }
                if (_winnerBoreAtFork(W.S, wDir > 0, onW0.cum) || _winnerBoreAtFork(W.S, wDir < 0, onW1.cum)) {
                    if (report) this._v2MergeSkipped('bore', `${L2.ck} x ${W.ck} ${ctx.tag} mid-span`); continue
                }
                // Two forks. INNER: the loser arrives onto the winner, so its band runs BACK toward
                // its own head (-lDir) and the strand lies ahead on the winner (+wDir). OUTER: mirror.
                // QUAL-30: two forks, no bands — same reason as the node-anchored ladder above. The
                // head/tail room this used to re-check off the band joins was already checked off
                // onL0/onL1 a few lines up, so it is not re-stated here.
                variants.push({ midSpan: true, lDir, wDir,
                                wIn: onW0.cum, wOut: onW1.cum, lIn: onL0.cum, lOut: onL1.cum,
                                region: f1 - f0 })
                if (variants.length >= 6) break
            }
            if (!variants.length) return null
            return { W, L: L2, variants, region: best.len, midSpan: true, sortKey: L2.ck + '>' + W.ck }
    }

    // ── BUG-55 phase 4: DISJOINT pairs (shape E) ──────────────────────────────────────────────
    // Two runs that share NO node yet carve the same dirt — invisible to per-node planning. The
    // resolution is a MID-SPAN merge (both-ends taper) through the identical extracted machinery.
    //
    // Discovery is per registering edge, from its own route against the wide graph's chords
    // (censusChordM — the route-vs-chord result from phase 1). ROLES ARE FIXED BY
    // DISCOVERABILITY, not the spine: the winner must satisfy dist(winner.chord, loser.route)
    // <= censusChordM, so EVERY window that registers the loser finds the same winner and derives
    // the identical plan, while windows registering only the winner need no plan at all — the
    // winner is never modified. When both directions qualify, the spine (longer run) wins among
    // the eligible. The winner must further be PLAIN: present in the stream graph (registered
    // spelling known), not a node-merge loser, and heading no bundle — its registered profile is
    // then exactly its pure sample, and the loser's verbatim copy cannot drift. Candidates
    // failing that decline 'winner', counted.
    //
    // Known coverage bound, stated plainly: "winner present in the stream graph" is a window-
    // extent test. The geometry keeps it stable (the winner's chord sits within censusChordM of
    // the loser's route, far inside the margin-3 box for every window that registers the loser),
    // and the invariance gates + census measure it; if a frontier case ever appears, the answer
    // is a wider roadGraphMargin, not a looser rule.
    _v2DisjointFor(g, drop, wide, c1, c2) {
        const kA = g.key(c1), kB = g.key(c2)
        const ck = kA < kB ? kA + '|' + kB : kB + '|' + kA
        if (!this._v2DisjointMemo || this._v2DisjointMemo.rev !== this._planRev())
            this._v2DisjointMemo = { rev: this._planRev(), map: new Map() }
        const memo = this._v2DisjointMemo.map
        if (memo.has(ck)) return memo.get(ck)
        const fail = (v) => { memo.set(ck, v); return v }
        const C = this._v2Costs()
        if (C.mergeMidSpan === false) return fail(null)   // a disjoint resolution IS a mid-span merge
        // one merge machinery per run: a node-merge loser or winner keeps that role
        if (this._v2MergeFor(g, drop, c1, c2)) return fail(null)
        for (const nk of [kA, kB]) {
            for (const [, spec] of this._v2NodeMerges(g, drop, nk)) {
                const sA = g.key(spec.winner[0]), sB = g.key(spec.winner[1])
                if ((sA < sB ? sA + '|' + sB : sB + '|' + sA) === ck) return fail(null)
            }
        }
        const own = this._v2RunSample(g, drop, c1, c2)
        const PROX = C.mergeProxM ?? 18, GAPM = C.mergeGapM ?? 200, FLARE = C.mergeFlareM ?? 60
        const CHORD = C.censusChordM ?? 300
        const MINREG = 30, MINSPAN = 60                                   // BUG-56 B5: two floors,
        if (!own || own.L < 2 * MINREG) return fail(null)
        let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity
        for (const p of own.pts) {
            if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x
            if (p.z < minz) minz = p.z; if (p.z > maxz) maxz = p.z
        }
        const spell = this._v2EdgeSpellings(g)
        const _mband = this._params?.roadMergeBand ?? 24, _mband2 = _mband * _mband
        const chordToRoute = (A2, B2, pts) => {
            const cnx = Math.min(A2.x, B2.x) - CHORD, cxx = Math.max(A2.x, B2.x) + CHORD
            const cnz = Math.min(A2.z, B2.z) - CHORD, cxz = Math.max(A2.z, B2.z) + CHORD
            let d = Infinity
            for (const p of pts) {
                if (p.x < cnx || p.x > cxx || p.z < cnz || p.z > cxz) continue
                const dd = _segSegDistXZ(p, p, A2, B2)
                if (dd < d) { d = dd; if (d <= 0) break }
            }
            return d
        }
        let bestSpec = null, bestRegion = -1, bestKey = ''
        for (const [q1, q2] of wide.edges) {
            const qA = wide.key(q1), qB = wide.key(q2)
            if (qA === kA || qA === kB || qB === kA || qB === kB) continue   // per-node planner's business
            if (drop.has(qA + '|' + qB)) continue
            const qck = qA < qB ? qA + '|' + qB : qB + '|' + qA
            const A2 = this._nodePos(q1), B2 = this._nodePos(q2)
            { const ex = A2.x - B2.x, ez = A2.z - B2.z; if (ex * ex + ez * ez <= _mband2) continue }
            if (Math.max(A2.x, B2.x) < minx - CHORD || Math.min(A2.x, B2.x) > maxx + CHORD
                || Math.max(A2.z, B2.z) < minz - CHORD || Math.min(A2.z, B2.z) > maxz + CHORD) continue
            if (chordToRoute(A2, B2, own.pts) > CHORD) continue
            const spQ = spell.get(qck)
            const SQ = this._v2RunSample(spQ ? g : wide, drop, ...(spQ ?? [q1, q2]))
            if (!SQ || SQ.L < 2 * MINREG) continue
            // the coarse both-sides gate before a full walk (as the planner and census use)
            const lim = this._v2ClearMax() + 8 * PROTO_SAMPLE_DS   // FEAT-77: the widest the rule can reach
            const lim2 = lim * lim
            let near = false
            for (let ip = 0; ip < own.pts.length && !near; ip += 8) {
                const px = own.pts[ip].x, pz = own.pts[ip].z
                for (let iq = 0; iq < SQ.pts.length; iq += 8) {
                    const dx = px - SQ.pts[iq].x, dz = pz - SQ.pts[iq].z
                    if (dx * dx + dz * dz <= lim2) { near = true; break }
                }
            }
            if (!near) continue
            const ivs = _conflictIntervalsXZ(own, true, SQ, this._v2NearVs(g, c1, c2, own.L, (spQ ?? [q1, q2]).map((c) => (spQ ? g : wide).key(c))), GAPM, FLARE, null)
            if (!ivs.length) continue
            // roles: the partner is always discoverable from OUR route (that is how it was
            // found); we are an eligible winner only if OUR chord sits near ITS route
            const ownDisc = chordToRoute(
                { x: own.pts[0].x, z: own.pts[0].z },
                { x: own.pts[own.pts.length - 1].x, z: own.pts[own.pts.length - 1].z },
                SQ.pts) <= CHORD
            const weWin = ownDisc && (own.L > SQ.L || (own.L === SQ.L && ck < qck))
            if (weWin) continue   // we are untouched; the loser plans this pair from its side
            // the winner must be PLAIN (see header): in-graph and holding no node-merge role.
            // (QUAL-30: the "no bundle" clause went with _v2BundleSolve — there are no bundles.)
            if (!spQ || this._v2MergeFor(g, drop, spQ[0], spQ[1])) {
                this._v2MergeSkipped('winner', `${ck} x ${qck} disjoint`)
                continue
            }
            const ctx = { PROX, GAPM, FLARE, MINREG, MINSPAN,
                          tag: 'disjoint', allIntervals: true, winnerCk: qck }
            const mid = this._v2MidSpanPair(ctx, { ck, S: own, nodeAtStart: true },
                                                 { ck: qck, S: SQ, nodeAtStart: true }, ivs)
            if (!mid) continue
            if (mid.region > bestRegion || (mid.region === bestRegion && qck < bestKey)) {
                bestSpec = { winner: spQ, midSpan: true, variants: mid.variants,
                             region: mid.region, disjoint: true }
                bestRegion = mid.region
                bestKey = qck
            }
        }
        if (bestSpec) this._v2DisjointMerges = (this._v2DisjointMerges || 0) + 1
        return fail(bestSpec ? [bestSpec] : null)
    }

    // ── Conflict-pair enumeration for the crossing rung (BUG-55 phase 5, re-scoped BUG-57) ────
    // Every wide-graph partner whose route properly CROSSES this edge's route — node-sharing
    // partners included (unlike _v2DisjointFor's discovery, which leaves those to the per-node
    // planner: the rung answers for node-anchored tangles too). GEOMETRY ONLY — no planner
    // lookups — so a pair reads the same from every window (the census's invariance argument;
    // censusChordM is the same accepted discovery bound). Sanction and roles are the consumers'
    // business (_v2DeleteFor, _v2ShoveFor).
    _v2ConflictPairs(g, drop, wide, c1, c2) {
        const kA = wide.key(c1), kB = wide.key(c2)
        const ck = kA < kB ? kA + '|' + kB : kB + '|' + kA
        if (!this._v2ConflictMemo || this._v2ConflictMemo.rev !== this._planRev())
            this._v2ConflictMemo = { rev: this._planRev(), map: new Map() }
        const memo = this._v2ConflictMemo.map
        if (memo.has(ck)) return memo.get(ck)
        const fin = (v) => { memo.set(ck, v); return v }
        const C = this._v2Costs()
        const GAPM = C.mergeGapM ?? 200, FLARE = C.mergeFlareM ?? 60
        const CHORD = C.censusChordM ?? 300
        const spell = this._v2EdgeSpellings(g)
        const spOwn = spell.get(ck)
        const own = this._v2RunSample(spOwn ? g : wide, drop, ...(spOwn ?? [c1, c2]))
        if (!own || own.L < 60) return fin([])
        let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity
        for (const p of own.pts) {
            if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x
            if (p.z < minz) minz = p.z; if (p.z > maxz) maxz = p.z
        }
        const _mband = this._params?.roadMergeBand ?? 24, _mband2 = _mband * _mband
        const out = []
        for (const [q1, q2] of wide.edges) {
            const qA = wide.key(q1), qB = wide.key(q2)
            const qck = qA < qB ? qA + '|' + qB : qB + '|' + qA
            if (qck === ck) continue
            if (drop.has(qA + '|' + qB)) continue
            const A2 = this._nodePos(q1), B2 = this._nodePos(q2)
            { const ex = A2.x - B2.x, ez = A2.z - B2.z; if (ex * ex + ez * ez <= _mband2) continue }
            if (Math.max(A2.x, B2.x) < minx - CHORD || Math.min(A2.x, B2.x) > maxx + CHORD
                || Math.max(A2.z, B2.z) < minz - CHORD || Math.min(A2.z, B2.z) > maxz + CHORD) continue
            const cnx = Math.min(A2.x, B2.x) - CHORD, cxx = Math.max(A2.x, B2.x) + CHORD
            const cnz = Math.min(A2.z, B2.z) - CHORD, cxz = Math.max(A2.z, B2.z) + CHORD
            // Stride-8 walk (32 m steps) against a 300 m threshold with the stride's error bound
            // as slack: a real conflict needs routes within mergeProxM (18 m), so nothing real
            // can slip a 300+16 m discovery net. Deterministic, ~8× cheaper than full-stride —
            // this scan runs per registering edge and was the delete rung's measured cost.
            let dDisc = Infinity
            for (let ip = 0; ip < own.pts.length; ip += 8) {
                const p = own.pts[ip]
                if (p.x < cnx || p.x > cxx || p.z < cnz || p.z > cxz) continue
                const dd = _segSegDistXZ(p, p, A2, B2)
                if (dd < dDisc) { dDisc = dd; if (dDisc <= 0) break }
            }
            if (dDisc > CHORD + 16) continue
            const spQ = spell.get(qck)
            const SQ = this._v2RunSample(spQ ? g : wide, drop, ...(spQ ?? [q1, q2]))
            if (!SQ || SQ.L < 60) continue
            const lim = this._v2ClearMax() + 8 * PROTO_SAMPLE_DS, lim2 = lim * lim   // FEAT-77
            let near = false
            for (let ip = 0; ip < own.pts.length && !near; ip += 8) {
                const px = own.pts[ip].x, pz = own.pts[ip].z
                for (let iq = 0; iq < SQ.pts.length; iq += 8) {
                    const dx = px - SQ.pts[iq].x, dz = pz - SQ.pts[iq].z
                    if (dx * dx + dz * dz <= lim2) { near = true; break }
                }
            }
            if (!near) continue
            const ivs0 = _conflictIntervalsXZ(own, true, SQ, this._v2NearVs(g, c1, c2, own.L, (spQ ?? [q1, q2]).map((c) => (spQ ? g : wide).key(c))), GAPM, FLARE, null)
            if (!ivs0.length) continue
            // BUG-57: PROPER CROSSINGS between the two pure routes — the crossing invariant's
            // raw material (owner ruling 2026-08-25: mid-span crossings are always defects; the
            // longer member of an unsanctioned-crossing pair dies). Strict open-interval
            // seg×seg test (the census's convention: coincident merged chains touch at shared
            // vertices, and an inclusive test would count every touch). GEOMETRY ONLY here —
            // plan sanction is _v2DeleteFor's business, so this stays a pure fn of the two
            // routes. The scan is bounded to the conflict intervals: a proper crossing has
            // separation 0 there, so it always lies inside a raw ≤PROX interval.
            const shared = [kA, kB].filter((k) => k === qA || k === qB)
            const ownStartKey = wide.key((spOwn ?? [c1, c2])[0])
            const crossings = []
            for (let ip = 1; ip < own.pts.length; ip++) {
                const sMid = 0.5 * (own.polyCum[ip - 1] + own.polyCum[ip])
                if (!ivs0.some((iv) => sMid >= iv.s0 - 8 && sMid <= iv.s1 + 8)) continue
                const ax = own.pts[ip - 1].x, az = own.pts[ip - 1].z
                const bx = own.pts[ip].x, bz = own.pts[ip].z
                const lox = Math.min(ax, bx), hix = Math.max(ax, bx)
                const loz = Math.min(az, bz), hiz = Math.max(az, bz)
                const rx = bx - ax, rz = bz - az
                for (let iq = 1; iq < SQ.pts.length; iq++) {
                    const cx2 = SQ.pts[iq - 1].x, cz2 = SQ.pts[iq - 1].z
                    const dx2 = SQ.pts[iq].x, dz2 = SQ.pts[iq].z
                    if (Math.max(cx2, dx2) < lox || Math.min(cx2, dx2) > hix
                        || Math.max(cz2, dz2) < loz || Math.min(cz2, dz2) > hiz) continue
                    const sx = dx2 - cx2, sz = dz2 - cz2
                    const den = rx * sz - rz * sx
                    if (Math.abs(den) < 1e-12) continue
                    const t = ((cx2 - ax) * sz - (cz2 - az) * sx) / den
                    const u = ((cx2 - ax) * rz - (cz2 - az) * rx) / den
                    if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) continue
                    const sOwn = own.polyCum[ip - 1] + t * (own.polyCum[ip] - own.polyCum[ip - 1])
                    const sQ = SQ.polyCum[iq - 1] + u * (SQ.polyCum[iq] - SQ.polyCum[iq - 1])
                    // 30 m shared-node THROAT (the trim bound below): two legs of one junction
                    // crossing inside the throat is the node planner's geometry, not a defect.
                    let throat = false
                    for (const sk of shared) {
                        const dOwn = sk === ownStartKey ? sOwn : own.L - sOwn
                        const dQ = sk === qA ? sQ : SQ.L - sQ
                        if (Math.min(dOwn, dQ) < 30) { throat = true; break }
                    }
                    if (throat) continue
                    crossings.push({ sOwn, sQ, x: ax + t * rx, z: az + t * rz })
                }
            }
            // Ruling-3 cleanup: the tear grades (nearLen/minSep/maxDy against the census
            // thresholds) fed the retired BFS vetting — the rung's consumers are crossing-
            // driven, so only crossing-bearing pairs are emitted now.
            if (!crossings.length) continue
            out.push({ qck, spQ: spQ ?? [q1, q2], inG: !!spQ, shared, crossings,
                       longer: own.L > SQ.L || (own.L === SQ.L && ck < qck) })
        }
        return fin(out)
    }

    // ── BUG-57: the CROSSING RUNG (owner ruling 2026-08-25 — the crossing invariant) ─────────
    // "If two legs cross on the way from one node to another, get rid of one of those legs so no
    // crossings are left." After the merge ladder, an edge DIES iff some conflict pair has an
    // UNSANCTIONED proper crossing and the edge is the pair's LONGER member (tie → lexicographic).
    // UNCONDITIONALLY — no tear grade, no substantiality floor, no detour vetting, no cluster
    // coordination. The defective-intersection set is infinite in a procedural world; threshold
    // detectors can never enumerate it, so the invariant replaces them (this superseded the
    // BUG-55 tear rung + nest resolver after a measured parity battery — every shipped deletion
    // re-derived with the identical victim across the seed battery).
    //
    // UNSANCTIONED = outside planned merge geometry (_v2CrossSanction: the pair's own merge
    // plans — end-anchored, mid-span, and the three-way both-ceding-to-one-spine shape) and
    // outside the 30 m shared-node throat (excluded at detection, _v2ConflictPairs). Nodes are
    // the ONLY intersections (ruling A, 2026-08-25): every surviving mid-span crossing is a
    // defect, so nothing here asks whether the crossing is "flat enough to keep" — the T/X
    // promotion concept is retired.
    //
    // CONNECTIVITY IS VALIDATED, NOT GUARDED: the verdict is a pure per-pair function of the two
    // pre-registration routes plus their merge plans — window-invariant with no graph context —
    // and a gate asserts component counts unchanged across the seed battery (measured: parity
    // battery 2026-08-25, no window changed its count). A seed that ever trips the gate falls
    // back to different seed gen (the owner's square-peg rule) rather than a per-deletion guard.
    //
    // The settled adjacency (g.adj) is deliberately NOT edited: registration-derived state
    // (pads, inc, surface) follows the surviving legs per-window as usual, while pins and
    // degrees keep reading the full graph identically everywhere — consistently stale beats
    // inconsistently fresh (a margin window cannot know what a distant band decided).
    //
    // The sanction: everywhere this run's PURE geometry will NOT SHIP, on the run's own pure arc,
    // unioned over its applied node-merge specs (or its disjoint spec when it has no node-merge
    // role; the real assembly consults them in that same order). This is the census's
    // offCurveSpans sanction moved to the plan layer, with two deliberate differences:
    //   · QUAL-30: read off the SPEC, not dry-assembled. A T promotion deletes the side road from
    //     its node to the fork outright, so the extent is that arc and the fork is already in the
    //     spec — where the wye needed a dry registration to find out where its band ended. The old
    //     concern the dry run addressed (a doomed or narrower-than-planned merge must not shield a
    //     crossing the shipped world keeps) is answered upstream instead: _v2MergeFor now drops any
    //     spec _v2PromotableFor cannot build, so a spec that survives to here WILL ship.
    //   · ANY winner, not just the pair partner: inside a sanctioned extent the registered geometry
    //     is the winner's pavement, so a crossing there is re-attributed to the winner's own
    //     conflict pairs — which see the identical pavement as the winner's pure route.
    // Reads only memoized-pure planner state (plan-layer bundles, never a delete verdict), so
    // _v2DeleteFor stays acyclic. Known residue, deterministic and censused: the dead-winner
    // rule can void a plan at assembly after this layer sanctioned by it — the crossing then
    // ships for this rev and the census reports it (same residue class BUG-55 accepted).
    _v2CededExtents(g, drop, wide, c1, c2) {
        const kA = g.key(c1), kB = g.key(c2)
        const ck = kA < kB ? kA + '|' + kB : kB + '|' + kA
        if (!this._v2ExtentMemo || this._v2ExtentMemo.rev !== this._planRev())
            this._v2ExtentMemo = { rev: this._planRev(), map: new Map() }
        const memo = this._v2ExtentMemo.map
        if (memo.has(ck)) return memo.get(ck)
        const fin = (v) => { memo.set(ck, v); return v }
        const out = []
        const S = this._v2RunSample(g, drop, c1, c2)
        if (!S) return fin(out)
        const push = (a, b) => { if (b > a) out.push([Math.max(0, a), Math.min(S.L, b)]) }
        // QUAL-30: the sanctioned extent is read STRAIGHT OFF THE SPEC now, not dry-assembled.
        //
        // It used to mean "the stretch this run cedes to another, plus its taper band", and the only
        // way to know where the band ended was to build one — hence two dry registrations per pair,
        // the last live callers of _v2RegisterMerged and _v2RegisterMidSpan. Under the T promotion
        // the answer is both simpler and sharper: the side road DOES NOT EXIST from its node to the
        // fork, so the sanctioned stretch is exactly that arc, and the fork arc is already in the
        // spec as `lCut` (`lIn`/`lOut` for a mid-span pair). No band, nothing to assemble.
        // The extent is the loser's own arc that will NOT SHIP AS PURE GEOMETRY: the stretch the
        // promotion deletes (its node to the fork) plus the departure blend past the fork, whose
        // points leave the primitive exactly as a taper band's did. Computed PURELY — from the
        // spec's fork arc and the widest blend any rung can choose — because the alternative is to
        // run the promotion probe from here, and that probe swaps this._network while _v2ShoveFor
        // and _v2PairCensus call this DURING assembly. Conservative by construction: the widest
        // rung bounds every narrower one, so nothing bent goes unsanctioned.
        const Rmin4 = 4 * (this._params?.roadMinTurnRadius ?? 12)
        const extent = (sp) => {
            const v = sp.variants[0]
            if (!v) return
            // widest blend a rung can pick, from the fork gap bound (mergeProxM) — see the header
            const LB = Math.max(20, Math.min(Math.sqrt(2 * (this._v2Costs().mergeProxM ?? 18) * Rmin4), 90))
            if (sp.midSpan) push(Math.min(v.lIn, v.lOut) - LB, Math.max(v.lIn, v.lOut) + LB)
            else if (sp.loserNodeAtStart) push(0, v.lCut + LB)
            else push(v.lCut - LB, S.L)
        }
        const mf = this._v2MergeFor(g, drop, c1, c2)
        if (mf) for (const sp of mf) extent(sp)
        else {
            const dj = this._v2DisjointFor(g, drop, wide, c1, c2)
            if (dj) extent(dj[0])
        }
        return fin(out)
    }

    // BUG-57 rung (owner re-scope, session 2): the SHOVE — the nick-cross resolution. Two legs
    // that properly cross only BRIEFLY (poke across and come back: the run sits on the SAME side
    // of its partner on both sides of the contact) are neither mergeable — the shared course is
    // under the mid-span vocabulary's 60 m strand minimum — nor redundant: each is a distinct
    // connection the owner wants kept. The resolution is "keep both, deflect one clear": the
    // LONGER member (the standing order-free victim vocabulary) registers with a local lateral
    // deflection away from the partner, sized so the pair's separation stays >= shoveClearM over
    // the contact (above the census's 9 m tear floor), smooth-ramped over SHOVE_RAMP, and
    // measured against the same fold floor as every band. Pure fn of the two pure routes, so it
    // is window-invariant; ONE MACHINERY PER RUN stays strict (any merge/disjoint/bundle role
    // forbids a shove); every decline falls through to the delete rung, counted.
    // A leg that ENDS UP on the other side (odd contact — a genuine transit) cannot be shoved
    // clear and declines: that is delete-rung business.
    _v2ShoveFor(g, drop, wide, c1, c2) {
        const kA = g.key(c1), kB = g.key(c2)
        const ck = kA < kB ? kA + '|' + kB : kB + '|' + kA
        if (!this._v2ShoveMemo || this._v2ShoveMemo.rev !== this._planRev())
            this._v2ShoveMemo = { rev: this._planRev(), map: new Map() }
        const memo = this._v2ShoveMemo.map
        if (memo.has(ck)) return memo.get(ck)
        const fin = (v) => { memo.set(ck, v); return v }
        // one machinery per run: any merge-family role keeps its resolution
        if (this._v2MergeFor(g, drop, c1, c2)) return fin(null)
        if (this._v2DisjointFor(g, drop, wide, c1, c2)) return fin(null)
        const pairs = this._v2ConflictPairs(g, drop, wide, c1, c2)
        if (!pairs.length) return fin(null)
        const own = this._v2RunSample(g, drop, c1, c2)
        if (!own) return fin(null)
        const C = this._v2Costs()
        const CLEAR = C.shoveClearM ?? 12   // m — post-shove separation floor (census tear floor is 9)
        const RAMP = 40, RFLOOR = 6, DCAP = 30
        const inSpans = (spans, sv) => spans.some(([s0, s1]) => sv >= s0 - 1 && sv <= s1 + 1)
        const sancOwn = this._v2CededExtents(g, drop, wide, c1, c2)
        const nS = own.pts.length
        // candidate pairs: unsanctioned crossings where we are the LONGER member — or the
        // SHORTER, when the longer member's own plan cannot clear the pair (bend-locked:
        // deflecting into its own elbow breaks the fold floor; the straighter partner deflects
        // instead). One level only — ShoveFor(longer) never consults the shorter — so the
        // fallback is acyclic and both-shove is impossible.
        const cands = []
        for (const t of pairs) {
            if (!t.crossings?.length) continue
            const sancQ = t.inG ? this._v2CededExtents(g, drop, wide, t.spQ[0], t.spQ[1]) : []
            const un = t.crossings.filter((x) => !inSpans(sancOwn, x.sOwn) && !inSpans(sancQ, x.sQ))
            if (!un.length) continue
            if (!t.longer) {
                if (!t.inG) continue
                const other = this._v2ShoveFor(g, drop, wide, t.spQ[0], t.spQ[1])
                if (other?.pairs.has(ck)) continue   // the longer side handles it
            }
            cands.push({ t, un })
        }
        if (!cands.length) return fin(null)
        // The RAMP ladder: a longer run-in halves the curvature the deflection itself adds
        // (lateral d over arc L costs ~2d/(L/2)² of curvature), so a shove that folds at 40 m
        // can clear the floor at 70 or 100 — the same trade every band ladder makes.
        for (const RAMPL of [RAMP, 70, 100]) {
        const disp = new Float64Array(2 * nS)
        const cleared = new Set()
        const idxSpans = []
        for (const { t, un } of cands) {
            const SQ = this._v2RunSample(t.inG ? g : wide, drop, ...t.spQ)
            if (!SQ) continue
            // per-sample separation + side vs the partner, windowed around the crossings
            let aLo = Infinity, aHi = -Infinity
            for (const x of un) { aLo = Math.min(aLo, x.sOwn); aHi = Math.max(aHi, x.sOwn) }
            let iLo = 0, iHi = nS - 1
            while (iLo < nS - 1 && own.polyCum[iLo + 1] < aLo - 200) iLo++
            while (iHi > 0 && own.polyCum[iHi - 1] > aHi + 200) iHi--
            const sep = new Float64Array(nS).fill(Infinity), sideS = new Int8Array(nS)
            // FEAT-77: the floor each sample must clear — the height-aware rule outside a shared
            // node's throat, never below shoveClearM
            const nearQ = this._v2NearVs(g, c1, c2, own.L, t.spQ.map((c) => (t.inG ? g : wide).key(c)))
            const need = new Float64Array(nS).fill(CLEAR)
            const tqx = new Float64Array(nS), tqz = new Float64Array(nS)
            for (let i = iLo; i <= iHi; i++) {
                const qn = _nearestOnPolyXZ(own.pts[i].x, own.pts[i].z, SQ.pts, SQ.polyCum)
                const foot = _polyAtCum(SQ.pts, SQ.polyCum, qn.cum)
                const tq = _polyTangentAtCum(SQ.pts, SQ.polyCum, qn.cum, true)
                sep[i] = qn.d
                need[i] = Math.max(CLEAR, nearQ(own.pts[i], qn, own.polyCum[i]) ? this._v2ClearReq(own.pts[i], qn) : CLEAR)
                tqx[i] = tq.x; tqz[i] = tq.z
                const cr = tq.x * (own.pts[i].z - foot.z) - tq.z * (own.pts[i].x - foot.x)
                sideS[i] = cr >= 0 ? 1 : -1
            }
            // contact regions: maximal index runs with sep < CLEAR that contain an unsanctioned
            // crossing, merged when overlapping
            const regions = []
            for (const x of un) {
                let i = iLo
                while (i < iHi && own.polyCum[i + 1] < x.sOwn) i++
                let r0 = i, r1 = Math.min(i + 1, iHi)
                while (r0 > iLo && sep[r0 - 1] < need[r0 - 1]) r0--
                while (r1 < iHi && sep[r1 + 1] < need[r1 + 1]) r1++
                const prev = regions.find((r) => r0 <= r[1] + 1 && r1 >= r[0] - 1)
                if (prev) { prev[0] = Math.min(prev[0], r0); prev[1] = Math.max(prev[1], r1) }
                else regions.push([r0, r1])
            }
            let ok = true
            for (const [r0, r1] of regions) {
                const sLo = sideS[Math.max(iLo, r0 - 1)], sHi = sideS[Math.min(iHi, r1 + 1)]
                if (sLo !== sHi) {   // genuine transit — the leg ENDS UP on the other side
                    this._v2MergeSkipped('shove', `${ck} x ${t.qck}: transit — ends on the other side`)
                    ok = false; break
                }
            }
            if (!ok) continue
            for (const [r0, r1] of regions) {
                const S = sideS[Math.max(iLo, r0 - 1)]
                // deficit inside the region, spread outward under a smoothstep envelope so the
                // deflection ramps in/out over RAMP without kinking the line
                const padI = Math.ceil(RAMPL / PROTO_SAMPLE_DS) + 2
                for (let i = Math.max(iLo, r0 - padI); i <= Math.min(iHi, r1 + padI); i++) {
                    let want = 0
                    for (let j = r0; j <= r1; j++) {
                        const signedS = sideS[j] === S ? sep[j] : -sep[j]
                        const dj = need[j] + 4 - signedS   // +4: headroom the smoothing passes consume
                        if (dj <= 0) continue
                        const u = Math.max(0, 1 - Math.abs(own.polyCum[i] - own.polyCum[j]) / RAMPL)
                        want = Math.max(want, dj * u * u * (3 - 2 * u))
                    }
                    if (want <= 0) continue
                    const dx = S * -tqz[i] * want, dz = S * tqx[i] * want
                    if (dx * dx + dz * dz > disp[2 * i] * disp[2 * i] + disp[2 * i + 1] * disp[2 * i + 1]) {
                        disp[2 * i] = dx; disp[2 * i + 1] = dz
                    }
                }
                idxSpans.push([Math.max(0, r0 - padI - 4), Math.min(nS - 1, r1 + padI + 4),
                               t.inG ? `g:${g.key(t.spQ[0])}:${g.key(t.spQ[1])}` : `g:${wide.key(t.spQ[0])}:${wide.key(t.spQ[1])}`])
            }
            cleared.add(t.qck)
        }
        if (!cleared.size) return fin(null)
        // Smooth the deflection field: the per-pair max-envelope is only C0 (kinks where the
        // argmax switches) and the partner-normal direction jitters near the crossing — a few
        // box passes turn both into a gentle vector ramp before the fold floor judges it.
        for (let pass = 0; pass < 4; pass++) {
            const prev = Float64Array.from(disp)
            for (let i = 1; i < nS - 1; i++) {
                disp[2 * i] = 0.25 * prev[2 * (i - 1)] + 0.5 * prev[2 * i] + 0.25 * prev[2 * (i + 1)]
                disp[2 * i + 1] = 0.25 * prev[2 * (i - 1) + 1] + 0.5 * prev[2 * i + 1] + 0.25 * prev[2 * (i + 1) + 1]
            }
        }
        // BUG-56 B2 — A SHOVE MUST NOT UNPIN A NODE. The field above is built over
        // [r0 - padI, r1 + padI] under a smoothstep envelope in ARC, but nothing forces it to zero
        // at i = 0 / i = nS-1. When a contact region reaches a run END the endpoint therefore takes
        // the full deficit and walks off its junction: measured 2026-08-27 at seed 6 (-870, 2468),
        // node -2,3,1, where g:-3,3,2:-2,3,1 ends 17.3 m sideways and 1.60 m up from the node it is
        // supposed to share — a road stopping in a field. It passed every existing check (17.3 < DCAP)
        // and it also cost the node its pad: cluster membership is endpoint proximity within
        // EPS2 = (halfWidth*0.75)^2 ~= 3.75 m, so a 17.3 m endpoint drops the node from 3 legs to 2
        // and _buildJunctionRing returns null. Taper the field to zero at both ends over
        // min(RAMPL, distance-to-end) — the same smoothstep, applied in the one place the envelope
        // never reached. Applied AFTER the box passes so the pin is exact, and BEFORE the fold
        // floor / DCAP / re-crossing tests so they judge the tapered field: a shove that can no
        // longer clear falls to the next RAMPL rung and finally declines, which is a path that
        // already exists and is already counted.
        {
            const L = own.polyCum[nS - 1]
            for (let i = 0; i < nS; i++) {
                const dEnd = Math.min(own.polyCum[i], L - own.polyCum[i])
                if (dEnd >= RAMPL) continue
                const u = Math.max(0, dEnd / RAMPL)
                const w = u * u * (3 - 2 * u)
                disp[2 * i] *= w; disp[2 * i + 1] *= w
            }
        }
        let maxD = 0
        for (let i = 0; i < nS; i++) maxD = Math.max(maxD, Math.hypot(disp[2 * i], disp[2 * i + 1]))
        if (maxD > DCAP) { this._v2MergeSkipped('shove', `${ck}: deflection ${maxD.toFixed(0)} m > ${DCAP}`); return fin(null) }
        const pts2 = own.pts.map((p, i) => ({ x: p.x + disp[2 * i], z: p.z + disp[2 * i + 1] }))
        // fold floor over the deflected stretches (the same circumradius rule as every band);
        // a fold at this ramp falls through to the next RAMP rung
        let folded = false
        for (const [i0, i1] of idxSpans) {
            for (let i = Math.max(1, i0); i <= Math.min(nS - 2, i1) && !folded; i++) {
                const a = pts2[i - 1], b = pts2[i], c = pts2[i + 1]
                const la = Math.hypot(c.x - b.x, c.z - b.z), lb = Math.hypot(a.x - c.x, a.z - c.z)
                const lc = Math.hypot(b.x - a.x, b.z - a.z)
                const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x))
                if (area2 < 1e-9) continue
                if ((la * lb * lc) / (2 * area2) < RFLOOR) folded = true
            }
            if (folded) break
        }
        if (folded) {
            if (RAMPL === 100) { this._v2MergeSkipped('shove', `${ck}: deflected R < ${RFLOOR} m at every ramp`); return fin(null) }
            continue
        }
        // the shove must actually clear every pair it claims (open-interval crossing re-test)
        const polyCum2 = new Float64Array(nS)
        for (let i = 1; i < nS; i++) polyCum2[i] = polyCum2[i - 1] + Math.hypot(pts2[i].x - pts2[i - 1].x, pts2[i].z - pts2[i - 1].z)
        const S2 = { pts: pts2, polyCum: polyCum2, L: polyCum2[nS - 1] }
        let recross = false
        for (const t of pairs) {
            if (!cleared.has(t.qck)) continue
            const SQ = this._v2RunSample(t.inG ? g : wide, drop, ...t.spQ)
            const sk = t.shared[0]
            const aStart = sk !== undefined && sk === wide.key(c1)
            const bStart = sk !== undefined && sk === wide.key(t.spQ[0])
            if (_pairProperCrossingsXZ(S2, aStart, SQ, bStart, !!sk).length) { recross = true; break }
        }
        if (recross) {
            if (RAMPL === 100) { this._v2MergeSkipped('shove', `${ck}: still crosses after deflection`); return fin(null) }
            continue
        }
        return fin({ pairs: cleared, pts: pts2, idxSpans })
        }
        return fin(null)
    }

    _v2DeleteFor(g, drop, wide, c1, c2) {
        const kA = wide.key(c1), kB = wide.key(c2)
        const ck = kA < kB ? kA + '|' + kB : kB + '|' + kA
        if (!this._v2DeleteMemo || this._v2DeleteMemo.rev !== this._networkRev) {
            this._v2DeleteMemo = { rev: this._networkRev, map: new Map() }
            this._v2Deleted = new Map()
        }
        const memo = this._v2DeleteMemo.map
        if (memo.has(ck)) return memo.get(ck)
        // R4: after the settle pass the delete set is CLOSED for this rev — a pass-2 (built-pin)
        // caller must never mint a verdict from re-planned geometry, or built degree would change
        // under the pins that were derived from it. An unseen pair is alive, full stop.
        if (this._v2DelFrozen?.rev === this._networkRev) return null
        const fin = (v) => { memo.set(ck, v); return v }
        const pairs = this._v2ConflictPairs(g, drop, wide, c1, c2)
        if (!pairs.length) return fin(null)
        const inSpans = (spans, s) => spans.some(([s0, s1]) => s >= s0 - 1 && s <= s1 + 1)
        const spellG = this._v2EdgeSpellings(g)
        // BUG-57 rung (session 2): a pair the run's own SHOVE plan clears is resolved — the run
        // registers deflected past the crossing instead of losing a member (only the longer
        // member ever shoves, so only the own-side plan can matter here).
        const spOwn0 = spellG.get(ck)
        const shoveOwn = this._v2ShoveFor(g, drop, wide, ...(spOwn0 ?? [c1, c2]))
        const hitPairs = [], pts = []
        for (const t of pairs) {
            // Victim = the LONGER member, full stop (tie → lexicographic; cull ONE leg of a
            // tangle, never both — the shorter member survives this pair by construction, so
            // per-pair verdicts are order-free and no victim chain can form).
            if (!t.longer || !t.crossings?.length) continue
            if (shoveOwn?.pairs.has(t.qck)) continue
            // ...or the SHORTER partner's plan clears it (the bend-locked fallback)
            if (t.inG && this._v2ShoveFor(g, drop, wide, t.spQ[0], t.spQ[1])?.pairs.has(ck)) continue
            // arcs align: crossings were measured on the registration-spelled samples, and the
            // extents are computed in that same spelling (a wide-only partner's window registers
            // it itself — no partner-side sanction here, exactly the old nomination's bound).
            const spOwn = spellG.get(ck)
            const sancOwn = this._v2CededExtents(g, drop, wide, ...(spOwn ?? [c1, c2]))
            const sancQ = t.inG ? this._v2CededExtents(g, drop, wide, t.spQ[0], t.spQ[1]) : []
            const un = t.crossings.filter((x) => !inSpans(sancOwn, x.sOwn) && !inSpans(sancQ, x.sQ))
            if (!un.length) continue
            hitPairs.push(t.qck)
            for (const x of un) pts.push({ x: x.x, z: x.z })
        }
        if (!hitPairs.length) return fin(null)
        const rec = { ck, key: `g:${g.key(c1)}:${g.key(c2)}`, pairs: hitPairs,
                      crossings: pts.length, at: pts,
                      pts: this._v2RunSample(g, drop, c1, c2)?.pts ?? null }
        this._v2Deleted.set(ck, rec)
        return fin(rec)
    }

    // Guard telemetry: every merge guard SKIPS AND COUNTS, never forces. Read by
    // test/capture-classify.mjs to answer "the owner's capture did not merge — which guard?".
    // The detail list names the pair as well as the reason (capped — this is a report, not a log).
    _v2MergeSkipped(reason, pair) {
        this._v2MergeSkip = this._v2MergeSkip || {}
        this._v2MergeSkip[reason] = (this._v2MergeSkip[reason] || 0) + 1
        if (!pair) return
        this._v2MergeSkipWhy = this._v2MergeSkipWhy || []
        if (this._v2MergeSkipWhy.length < 64) this._v2MergeSkipWhy.push(`${reason}: ${pair}`)
    }

    // The merge spec(s) for an edge about to register — up to ONE PER END, both applied when
    // their ceded regions (taper bands included) are disjoint (a run can braid with different
    // partners at both its nodes: the owner's seed-6 capture). Overlapping regions keep the longer
    // one. Each spec is DROPPED when its winner has a loser-plan of its own whose ceded interval
    // overlaps the adopted strand — the adopted vertices must be the winner's REGISTERED (pure)
    // geometry. Raw per-node lookups only (plans never depend on other plans): order-free,
    // cycle-free.
    _v2MergeFor(g, drop, c1, c2) {
        const kA = g.key(c1), kB = g.key(c2)
        const ck = kA < kB ? kA + '|' + kB : kB + '|' + kA
        const winnerOk = (spec) => {
            const wkA = g.key(spec.winner[0]), wkB = g.key(spec.winner[1])
            const wck = wkA < wkB ? wkA + '|' + wkB : wkB + '|' + wkA
            const wRaw = this._v2NodeMerges(g, drop, wkA).get(wck) || this._v2NodeMerges(g, drop, wkB).get(wck)
            if (!wRaw) return true
            const wS = this._v2RunSample(g, drop, spec.winner[0], spec.winner[1])
            if (!wS) return false
            const wCut0 = spec.variants[0].wCut, lCut0 = wRaw.variants[0].lCut
            const adopt = spec.winnerNodeAtStart ? [0, wCut0] : [wCut0, wS.L]
            const wOwn = wRaw.loserNodeAtStart ? [0, lCut0] : [lCut0, wS.L]
            return !(adopt[1] > wOwn[0] + 1 && wOwn[1] > adopt[0] + 1)
        }
        let sA = this._v2NodeMerges(g, drop, kA).get(ck)
        let sB = this._v2NodeMerges(g, drop, kB).get(ck)
        // A MID-SPAN merge cedes a stretch in the middle of the run, so it cannot be combined with
        // an end merge on the same run — the assembly would have to splice three ceded regions and
        // solve four strands. Take the longer one alone.
        // FEAT-76: a spec the promotion cannot build is not a plan — drop it here so the crossing
        // rungs below stop standing down for a resolution that never arrives.
        // FEAT-77: a rule-based plan with no buildable T falls back to the node's plan under the
        // old proximity (owner 2026-09-08) — a T main had is kept, and the pair is counted.
        const promotable = (sp, k) => {
            if (!sp) return null
            if (this._v2PromotableFor(g, drop, sp, c1, c2)) return sp
            const l = k && !sp.legacy ? this._v2NodeMerges(g, drop, k, true).get(ck) : null
            if (l && (l.midSpan || winnerOk(l)) && this._v2PromotableFor(g, drop, l, c1, c2)) {
                this._v2MergeSkipped('promote-legacy', `${ck} has no T under the rule — kept the 18 m one`)
                return l
            }
            this._v2MergeSkipped('promote-infeasible', `${ck} has no T`)
            return null
        }
        if (sA?.midSpan || sB?.midSpan) {
            const both = [[sA, kA], [sB, kB]].filter(([sp]) => sp).map(([sp, k]) => promotable(sp, k)).filter(Boolean)
            if (!both.length) return null
            return [both.reduce((x, y) => (y.region > x.region ? y : x))]
        }
        if (sA && !winnerOk(sA)) { this._v2MergeSkipped('winner'); sA = null }
        if (sB && !winnerOk(sB)) { this._v2MergeSkipped('winner'); sB = null }
        sA = promotable(sA, kA); sB = promotable(sB, kB)
        if (sA && sB) {
            const st = sA.loserNodeAtStart ? sA : (sB.loserNodeAtStart ? sB : null)
            const en = !sB.loserNodeAtStart ? sB : (!sA.loserNodeAtStart ? sA : null)
            // the two ends' TAPER BANDS must clear each other too, not just the ceded strands —
            // the middle re-solve needs real own geometry between them
            // QUAL-30: the two ends' FORKS must clear each other (was: their taper bands) — the
            // loser needs real own road between them either way.
            if (st && en && st !== en &&
                st.variants[0].lCut + 30 < en.variants[0].lCut) return [st, en]
            this._v2MergeSkipped('bothEnds')
            return [sA.region >= sB.region ? sA : sB]
        }
        const one = sA || sB
        return one ? [one] : null
    }

    /**
     * FEAT-76: CAN THIS PAIR ACTUALLY BE A T? — asked at PLAN time, on the pure samples.
     *
     * The crossing rungs (_v2ShoveFor, _v2DeleteFor, _v2DisjointFor) all stand down when a merge is
     * planned, on the reasoning that the merge is going to resolve the conflict. That reasoning was
     * sound while a merge always assembled SOMETHING — the band ladder had a rung for nearly every
     * shape. A T is stricter: it has no hold and no ceded strand, so a pair whose two roads run a
     * road width apart at five metres of height difference (seed 67, g:-3,-1,1:-3,0,1, two roads on
     * one hillside) has nowhere to put a junction. If the plan still claims that pair, the rungs
     * stand down for a resolution that never arrives and the crossing ships — measured, that was
     * road-connectivity's seed-67 red.
     *
     * So the plan layer asks the assembly layer's own question, using the assembly layer's own code
     * on the pre-registration samples (the `dry` pattern _v2RegisterMerged used for the same reason).
     * No second implementation to drift: identical candidate generation, identical departure build,
     * identical acceptance. Memoized per plan rev — one answer per pair per build.
     *
     * BUG-61: the answer also CARRIES THE FORK (`{ extents, fork }`): which trunk vertex and
     * which band radius won the ranking. _v2PromoteOne applies that record rather than ranking
     * again on the registered network, because the registered network is what varies with the
     * window (trunk pieces, promotion order) and the id IS the vertex. `true` still means
     * "could not judge — leave the plan alone", `false` means no T can be built.
     */
    _v2PromotableFor(g, drop, spec, c1, c2) {
        if (!this._v2PromoMemo || this._v2PromoMemo.rev !== this._planRev())
            this._v2PromoMemo = { rev: this._planRev(), map: new Map() }
        const kA = g.key(c1), kB = g.key(c2)
        const mk = `${kA}|${kB}|${spec.midSpan ? 'm' : 'n'}${spec.legacy ? 'L' : ''}|${spec.region.toFixed(1)}`
        const hit = this._v2PromoMemo.map.get(mk)
        if (hit !== undefined) return hit
        this._v2PromoMemo.map.set(mk, true)   // optimistic: bars re-entry, never observed as an answer
        const out = this._v2PromotableProbe(g, drop, spec, c1, c2)
        this._v2PromoMemo.map.set(mk, out)
        return out
    }

    // QUAL-30: the arc ranges on (c1,c2)'s OWN pure geometry that a promotion will remove or bend —
    // the sanction _v2CededExtents needs, taken from the rung the probe actually accepted. Empty
    // when the pair does not promote (nothing is sanctioned) or when the probe could not judge.
    _v2PromoteExtents(g, drop, spec, c1, c2) {
        const r = this._v2PromotableFor(g, drop, spec, c1, c2)
        return r && r.extents ? r.extents : []
    }

    _v2PromotableProbe(g, drop, spec, c1, c2) {
        const sample = (a, b) => {
            const S = this._v2RunSample(g, drop, a, b)
            if (!S) return null
            const cl = this._edgeCenterline(a, b, this._v2EdgeDirs(g, drop, g.key(a), g.key(b)))
            if (!cl || !cl.slice) return null
            return { points: S.pts, polyCum: S.polyCum, clArc: S.clArc, centerline: cl, cellA: a, cellB: b }
        }
        const side = sample(c1, c2), T = sample(spec.winner[0], spec.winner[1])
        if (!side || !T) return true          // cannot judge — leave the plan alone
        const MINREG = 30
        const Rmin = this._params?.roadMinTurnRadius ?? 12
        const sideL = side.polyCum[side.polyCum.length - 1]
        const tL = T.polyCum[T.polyCum.length - 1]
        const wk0 = `g:${g.key(spec.winner[0])}:${g.key(spec.winner[1])}`
        const wCells = [g.key(spec.winner[0]), g.key(spec.winner[1])]
        const sA = g.key(side.cellA), sB = g.key(side.cellB)
        const nKey = wCells.includes(sA) ? sA : (wCells.includes(sB) ? sB : null)
        const ends = spec.midSpan
            ? (spec.variants[0] ? [{ lArc: spec.variants[0].lIn, nAtStart: spec.variants[0].lDir < 0 },
                                   { lArc: spec.variants[0].lOut, nAtStart: spec.variants[0].lDir > 0 }] : [])
            : (nKey ? [{ nAtStart: sA === nKey }] : [])
        if (!ends.length) return true
        const probe = { sideKey: `g:${sA}:${sB}`, spec }
        const extents = []
        let fork = null
        // FEAT-77: SIBLING LOSERS SHARE THE TRUNK. When one winner serves several losers at this
        // node (a shared throat that forks twice — the owner's 1668/7534 capture, and seed 6's
        // 4,1,1 where two side roads leave alongside one trunk), each fork needs MINREG of trunk to
        // itself, and the assembly declines the second when it lands on a piece with no trunk left
        // ("no trunk left past the fork on this piece"). The probe is per pair, so the stagger is
        // made here from the node's own merge plans: losers of the same winner in canonical order,
        // and every EARLIER loser's decided fork is ground this one may not fork within MINREG of.
        // Pure: the order is the canonical key order, the earlier forks come from this same memoized
        // probe, and nothing feeds back — acyclic by the ordering.
        const taken = []
        if (!spec.midSpan && nKey) {
            const own = sA < sB ? `${sA}|${sB}` : `${sB}|${sA}`
            const wA = g.key(spec.winner[0]), wB = g.key(spec.winner[1])
            for (const [ck, sp] of this._v2NodeMerges(g, drop, nKey)) {
                if (ck >= own || sp.midSpan) continue
                const a = g.key(sp.winner[0]), b = g.key(sp.winner[1])
                if (!((a === wA && b === wB) || (a === wB && b === wA))) continue
                const [q1, q2] = ck.split('|').map((k) => k.split(',').map(Number))
                const r = this._v2PromotableFor(g, drop, sp, q1, q2)
                if (r && r.fork) { const h = _nearestOnPolyXZ(r.fork.x, r.fork.z, T.points, T.polyCum); if (h) taken.push(h.cum) }
            }
        }
        const net = this._network
        this._network = new Map([[wk0, T], [probe.sideKey, side]])
        try {
            // BUG-61: THE FORK IS DECIDED HERE, ONCE, AND THE ASSEMBLY APPLIES IT. FEAT-76's fixpoint
            // memo proved the node id window-invariant for a fork read off the plan layer's own
            // answer; the build then let the assembly RE-RANK forks over the registered network,
            // whose trunk pieces and promotion order vary with the window, and the same T landed
            // 4 m apart in two windows — a different id, a different run key, a road that
            // evaporates for anything holding the old key (mission-network's drop point). So the
            // ranking below is the assembly's own ranking, run on the PURE samples (full edges,
            // no pieces, no earlier promotions in sight): every window computes the identical
            // (fork vertex, band radius), and _v2PromoteOne only has to find that vertex on
            // whatever piece of the trunk it lives on. The order is the assembly's: candidates by
            // deck agreement, the band ladder gentlest first, the first (fork, rung) that CLEARS
            // wins, else the best score ships (owner ruling 2026-09-07 — a T always beats no T).
            const PROX = this._v2Costs().mergeProxM ?? 18
            const ladder = [4 * Rmin, 3 * Rmin, 2 * Rmin, Rmin]
            for (const en of ends) {
                const nAtStart = en.nAtStart
                const cands = spec.midSpan
                    ? [{ wCut: null, lArc: en.lArc }]
                    : this._v2ForkCandidates(g, probe, side, nAtStart, sideL, wk0, wCells)
                let chosen = null, best = null
                for (const c of cands) {
                    let iL, P, iP
                    if (spec.midSpan) {
                        const wArc = en === ends[0] ? spec.variants[0].wIn : spec.variants[0].wOut
                        if (wArc < MINREG || wArc > tL - MINREG) continue
                        iP = _nearestVertexAtCum(T.polyCum, wArc)
                        P = T.points[iP]
                        iL = _nearestVertexAtCum(side.polyCum, c.lArc)
                    } else {
                        const h = _nearestOnPolyXZ(c.forkPt.x, c.forkPt.z, T.points, T.polyCum)
                        if (!h || h.d > 4) continue
                        iP = _nearestVertexAtCum(T.polyCum, h.cum)
                        // Road must be left on BOTH sides of the fork to carry on along. Nothing
                        // more: the owner has ruled that a T beside another junction is legitimate
                        // road ("many roads have spontaneous spurs") — BUG-61.
                        if (T.polyCum[iP] < MINREG || tL - T.polyCum[iP] < MINREG) continue
                        if (taken.some((a) => Math.abs(a - T.polyCum[iP]) < MINREG)) continue   // FEAT-77 stagger
                        P = T.points[iP]
                        // Where the side road's OWN line resumes: its point abreast of P, windowed to
                        // the half of the run that leaves the shared node so a run that loops back
                        // cannot answer with a point from its far end.
                        const lo = nAtStart ? 0 : sideL * 0.15, hi = nAtStart ? sideL * 0.85 : sideL
                        const lh = _nearestOnPolyXZ(P.x, P.z, side.points, side.polyCum, lo, hi)
                        if (!lh || lh.d > this._v2ForkAbreastMax()) continue
                        iL = _nearestVertexAtCum(side.polyCum, lh.cum)
                    }
                    const kept = nAtStart ? sideL - side.polyCum[iL] : side.polyCum[iL]
                    if (kept < MINREG) continue
                    const grade = _trunkGradeAt(T, iP)
                    let cleared = false
                    for (const RB of ladder) {
                        const b = this._v2BuildDeparture(side, iL, nAtStart, P, RB)
                        if (!b) continue
                        const why = this._v2DepartureAccepts(b, T, P, grade)
                        const pick = { P, iL, RB, b, why }
                        if (!why) { chosen = pick; cleared = true; break }
                        if (!best || b._score < best.b._score) best = pick
                    }
                    if (cleared) break
                }
                if (!chosen) chosen = best
                if (!chosen) return false
                // QUAL-30: record what this promotion will do to the loser's PURE arc, so
                // _v2CededExtents can read the sanction off the winning rung instead of
                // dry-assembling a merge to find out. Two parts, and both must be in it: the
                // stretch that will NOT SHIP (node to fork), and the departure BLEND past the
                // fork, whose points leave the primitive exactly as a taper band's did.
                // Sanctioning only the first was measured to under-sanction and fire extra
                // shoves — seeds 6/7/11 all moved.
                const lc = side.polyCum[chosen.iL]
                extents.push(nAtStart ? [lc - chosen.b.LB, sideL] : [0, lc + chosen.b.LB])
                // The decision the assembly applies: the fork VERTEX (world XZ — the registered
                // trunk carries the identical vertex) and the band radius that won. A mid-span
                // pair's two forks are already pure (spec.variants wIn/wOut), so it records none.
                if (!spec.midSpan) fork = { x: chosen.P.x, z: chosen.P.z, RB: chosen.RB, why: chosen.why }
            }
        } finally { this._network = net }
        return { extents, fork }
    }

    // ── BUG-55: the pair census ────────────────────────────────────────────────────────────────
    // WHICH pairs of edges conflict, over the whole window — including pairs that share NO node
    // (shape E), which per-node planning cannot see at all.
    //
    // Discovery is ROUTE-vs-CHORD, and the direction matters. Chord-to-chord was measured dead:
    // blue-noise site spacing keeps disjoint chords >= 407 m apart, while routes wander up to
    // 657 m off their chords and land 0.3 m from each other (the seed-6 (3328,-27) tear). What a
    // registering edge CAN afford is a scan of its own routed polyline against every wide-graph
    // chord: a partner whose own wander stays under censusChordM shows up there, and only then
    // does that partner pay for a route. Measured 0-4 fresh partner routes per window at 300 m.
    //
    // Window invariance: "partner chord within T of MY route" is a pure function of one pure
    // route and one pure chord — no window extent anywhere — and the partner chords come from
    // the same margin-8 graph the degree pass builds, whose box contains every chord within
    // reach (see _degreeDrops). A pair BOTH of whose members wander beyond the bound is blind to
    // the census in every window equally: a counted coverage limit, not a tear risk (the offline
    // overlap-census O(n²) sweep and graph-topology SURFACE-SMOOTH stay the safety net).
    //
    // Phase 1 (this): disjoint pairs are MEASURED and counted, not resolved — the numbers feed
    // overlap-census and capture-classify so the class is visible before the resolution ladder
    // (merge → delete-with-detour → report) lands on it. Node-sharing pairs keep planning
    // through _v2NodeMerges exactly as before.
    _v2PairCensus(mx0, mx1, mz0, mz1, g, drop, wide) {
        const sig = `${mx0}:${mx1}:${mz0}:${mz1}`
        if (!this._v2CensusMemo || this._v2CensusMemo.rev !== this._planRev())
            this._v2CensusMemo = { rev: this._planRev(), map: new Map() }
        const memo = this._v2CensusMemo.map
        const hit = memo.get(sig)
        if (hit) { this._v2Census = hit; return hit }
        const C = this._v2Costs()
        const CHORD = C.censusChordM ?? 300
        const isNear = this._v2Near()   // FEAT-77: the conflict predicate, in place of a fixed PROX
        const GAPM = C.mergeGapM ?? 200
        const FLARE = C.mergeFlareM ?? 60
        const out = { regEdges: 0, wideChords: 0, candPairs: 0, walked: 0, routedFresh: 0, disjoint: [] }
        const wx0 = mx0 * PROTO_ANCHOR_SPACING, wx1 = (mx1 + 1) * PROTO_ANCHOR_SPACING
        const wz0 = mz0 * PROTO_ANCHOR_SPACING, wz1 = (mz1 + 1) * PROTO_ANCHOR_SPACING
        const inBand = (p) => p.x >= wx0 && p.x < wx1 && p.z >= wz0 && p.z < wz1
        const _mband = this._params?.roadMergeBand ?? 24, _mband2 = _mband * _mband
        const spellG = this._v2EdgeSpellings(g)
        // routedFresh counts PARTNER samples that were memo misses at walk time — the census's
        // own marginal routing cost. The registration-set samples in step 1 are NOT counted: the
        // node planner walks those same edges regardless, the census just meets them first.
        const sampleOf = (gg, sp, countFresh) => {
            const key = `g:${gg.key(sp[0])}:${gg.key(sp[1])}`
            if (countFresh && (!this._v2SampleMemo || this._v2SampleMemo.rev !== this._planRev()
                || !this._v2SampleMemo.map.has(key))) out.routedFresh++
            return this._v2RunSample(gg, drop, sp[0], sp[1])
        }
        // 1. the registration set, sampled exactly as it will register (memo shared with the
        //    node planner, which walks these same edges anyway)
        const reg = []
        for (const [c1, c2] of g.edges) {
            const kA = g.key(c1), kB = g.key(c2)
            if (drop.has(kA + '|' + kB)) continue
            const A = this._nodePos(c1), B = this._nodePos(c2)
            if (!inBand(A) && !inBand(B)) continue
            { const ex = A.x - B.x, ez = A.z - B.z; if (ex * ex + ez * ez <= _mband2) continue }
            const S = sampleOf(g, [c1, c2], false)   // registration spelling = g.edges tuple order
            if (!S || S.L < 60) continue
            let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity
            for (const p of S.pts) {
                if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x
                if (p.z < minz) minz = p.z; if (p.z > maxz) maxz = p.z
            }
            reg.push({ kA, kB, ck: kA < kB ? kA + '|' + kB : kB + '|' + kA, S,
                       minx, maxx, minz, maxz })
        }
        out.regEdges = reg.length
        // 2. every wide-graph chord that could be a partner
        const chords = []
        for (const [c1, c2] of wide.edges) {
            const kA = wide.key(c1), kB = wide.key(c2)
            if (drop.has(kA + '|' + kB)) continue
            const A = this._nodePos(c1), B = this._nodePos(c2)
            { const ex = A.x - B.x, ez = A.z - B.z; if (ex * ex + ez * ez <= _mband2) continue }
            chords.push({ c1, c2, kA, kB, ck: kA < kB ? kA + '|' + kB : kB + '|' + kA, A, B })
        }
        out.wideChords = chords.length
        // 3. discovery: partner chords within CHORD of a registered route (box pre-culls)
        const cand = new Map()   // canonical pair key → {P (reg entry), Q (chord entry), discD}
        for (const P of reg) {
            for (const c of chords) {
                if (c.kA === P.kA || c.kA === P.kB || c.kB === P.kA || c.kB === P.kB) continue // planner's business
                if (c.ck === P.ck) continue
                const cnx = Math.min(c.A.x, c.B.x) - CHORD, cxx = Math.max(c.A.x, c.B.x) + CHORD
                const cnz = Math.min(c.A.z, c.B.z) - CHORD, cxz = Math.max(c.A.z, c.B.z) + CHORD
                if (cxx < P.minx || cnx > P.maxx || cxz < P.minz || cnz > P.maxz) continue
                let d = Infinity
                for (const p of P.S.pts) {
                    if (p.x < cnx || p.x > cxx || p.z < cnz || p.z > cxz) continue
                    const dd = _segSegDistXZ(p, p, c.A, c.B)
                    if (dd < d) { d = dd; if (d <= 0) break }
                }
                if (d > CHORD) continue
                const pk = P.ck < c.ck ? P.ck + '#' + c.ck : c.ck + '#' + P.ck
                const prev = cand.get(pk)
                if (!prev || d < prev.discD) cand.set(pk, { P, Q: c, discD: d })
            }
        }
        out.candPairs = cand.size
        // 4. walk each candidate pair (partner sampled in its registered spelling when the
        //    stream graph knows it; a wide-only partner's complete 1-ring gives it the same pins
        //    any window would derive)
        for (const { P, Q, discD } of cand.values()) {
            const spQ = spellG.get(Q.ck)
            const SQ = sampleOf(spQ ? g : wide, spQ ?? [Q.c1, Q.c2], true)
            if (!SQ || SQ.L < 60) continue
            const SP = P.S
            // the same coarse both-sides gate the mid-span planner uses, before paying for a
            // full point-to-polyline walk
            const lim = this._v2ClearMax() + 8 * PROTO_SAMPLE_DS   // FEAT-77: the widest the rule can reach
            const lim2 = lim * lim
            let near = false
            for (let ip = 0; ip < SP.pts.length && !near; ip += 8) {
                const px = SP.pts[ip].x, pz = SP.pts[ip].z
                for (let iq = 0; iq < SQ.pts.length; iq += 8) {
                    const dx = px - SQ.pts[iq].x, dz = pz - SQ.pts[iq].z
                    if (dx * dx + dz * dz <= lim2) { near = true; break }
                }
            }
            if (!near) continue
            out.walked++
            const ivs = _conflictIntervalsXZ(SP, true, SQ, isNear, GAPM, FLARE, null)
            if (!ivs.length) continue
            let nearLen = 0, minSep = Infinity, maxDy = 0
            for (const iv of ivs) nearLen += iv.s1 - iv.s0
            for (let ip = 0; ip < SP.pts.length; ip++) {
                const s = SP.polyCum[ip]
                if (!ivs.some((iv) => s >= iv.s0 - 1 && s <= iv.s1 + 1)) continue
                const q = _nearestOnPolyXZ(SP.pts[ip].x, SP.pts[ip].z, SQ.pts, SQ.polyCum)
                if (!isNear(SP.pts[ip], q)) continue   // FEAT-77: the same rule that drew the interval
                if (q.d < minSep) minSep = q.d
                const dy = Math.abs(SP.pts[ip].y - q.y)
                if (dy > maxDy) maxDy = dy
            }
            if (nearLen < 20) continue   // grazing contact, not a shared-pavement stretch
            out.disjoint.push({ a: `g:${P.kA}:${P.kB}`, b: `g:${Q.kA}:${Q.kB}`,
                                nearLen, minSep, maxDy, discD, tear: minSep < 9 || maxDy > 3 })
        }
        if (memo.size > 6) memo.clear()
        memo.set(sig, out)
        this._v2Census = out
        return out
    }

    /**
     * BUG-55 phase 4: stamp each disjoint census entry with whether the REGISTERED network
     * resolved it. The census walks PURE samples before registration, so it cannot know — a
     * merged pair still shows its raw conflict there, and without this flag the instruments
     * cannot tell "left over" from "unseen". Resolved means a merge extent between the pair is
     * in the network: either run's offCurveSpans naming the other, or both naming the same
     * third run (bundled onto one spine — the same three-way sanction capture-classify uses).
     * Read-time only — instruments call it AFTER the window has streamed; it never feeds
     * planning. (Phase 5: a pair resolved by DELETION gets stamped from _v2Deleted here too.)
     */
    _v2CensusStampResolved() {
        const cs = this._v2Census
        if (!cs) return cs
        const flip = (gk) => 'g:' + gk.slice(2).split(':').reverse().join(':')
        const runOf = (gk) => this._network.get(gk) ?? this._network.get(flip(gk))
        const names = (sp, gk) => sp.owner === gk || sp.owner === flip(gk)
        const delCk = (gk) => { const [a, b] = gk.slice(2).split(':'); return a < b ? a + '|' + b : b + '|' + a }
        for (const d of cs.disjoint) {
            const offA = runOf(d.a)?.offCurveSpans || [], offB = runOf(d.b)?.offCurveSpans || []
            d.resolved = (offA.some((sp) => names(sp, d.b))
                || offB.some((sp) => names(sp, d.a))
                || offA.some((sp) => offB.some((o) => o.owner === sp.owner))) ? 'merged'
                : (this._v2Deleted?.has(delCk(d.a)) || this._v2Deleted?.has(delCk(d.b))) ? 'deleted' : false
        }
        return cs
    }

    _v2CamAtArc(cam, sArc) {
        const a = cam.arcPos, c = cam.camberRad, n = a.length
        if (sArc <= a[0]) return c[0]
        if (sArc >= a[n - 1]) return c[n - 1]
        let lo = 0, hi = n - 1
        while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (a[m] <= sArc) lo = m; else hi = m }
        const span = a[hi] - a[lo] || 1
        return c[lo] + (c[hi] - c[lo]) * (sArc - a[lo]) / span
    }

    // Smooth a polyline's Y in place (shared by the rows row-polyline and the graph per-edge polyline).
    // Off-earthwork: legacy ±designGradeWindow terrain-following smoothing. Earthwork: (1) wide-smooth raw
    // → the gentle bridged/cut design line; (2) a legacy-window-smooth terrain reference; (3) SOFT-clamp the
    // design toward ±deviationCap of that SMOOTH reference — clamping against raw would let the design follow
    // raw bumps where the cap bites, putting near-vertical steps into the collision surface (road-smoothness).
    //
    // The clamp is a tanh saturation, NOT a hard min/max. A hard clamp injects a C1 (slope) discontinuity at
    // the exact arc where the design first crosses ±cap: the profile snaps from the flat design line onto the
    // terrain-tracking `ref±cap` line, a felt "bump" the router never priced (the router chose the gentle
    // design; the cap yanks it back). tanh approaches ±cap asymptotically instead, so the profile bends into
    // the terrain-following region smoothly. Bounded by ±cap (never floats past it), near-identity for
    // |dev|≪cap so unclamped roads are unchanged, and window-invariant (pointwise fn of two box means). D-16.
    // FEAT-68: _gradeEdgeInPlace (v1 design-grade smoothing: wide-smooth + tanh deviation clamp)
    // and _tunnelPassOpts (FEAT-40's taut-string tunnel DETECTION pass) are DELETED. Both were
    // already unreachable: _v2GradePts solves the exact profile instead, and a bore is no longer
    // something found after the fact — it is a priced state the router chose. Their knobs
    // (roadEarthworkWindow / roadWDeviation / roadDeviationCap / tunnelMinDepth / MinLen / MaxLen /
    // PortalDepth / MaxGrade / tunnelsEnabled) went with them and none survives in data/ranger.js;
    // tunnelBoreRadius does, because bore GEOMETRY — mesh, collider, containment test — is still real.

    /**
     * FEAT-68 (v2) day-two node-height rule: a node pinned to terrain ON A CONVEX EDGE is
     * unreachable with bridges de-scoped — measured on seed 11: ground fell 24 m in the first
     * 30 m while the deck, pinned high and limited to 35% with an 8 m fill window, could not
     * follow (v1 encoded the same lesson as "node Y rides road grade, not the valley floor").
     * The pin is now the terrain NEIGHBORHOOD: the node may sit up to gMaxRoad·R below its own
     * spot height when a ring sample says the ground falls away — a small cut bench at the
     * junction (pads land there later anyway). Pure fn of (terrain, x, z) → every incident edge
     * computes the identical height from any window; node agreement and invariance survive.
     */
    _v2NodeHeight(x, z) {
        const R = 22, N = 12
        let h = this._coarseH(x, z)
        const allow = 0.35 * R
        for (let i = 0; i < N; i++) {
            const a = 2 * Math.PI * i / N
            const hr = this._coarseH(x + R * Math.cos(a), z + R * Math.sin(a)) + allow
            if (hr < h) h = hr
        }
        return h
    }

    /**
     * FEAT-68 (v2): solve the vertical profile for a sampled run IN PLACE — priced == built.
     * Stations every ~10 m over the run's arc (profile detail below that is noise), ground from
     * the world-fixed coarse sampler, ENDPOINTS PINNED to terrain height at the run's ends (the
     * day-one junction node height rule — two runs sharing a node agree by construction). The
     * solved y lerps onto the 4 m samples. Returns FEAT-40-shaped spans [{s0,s1}] covering bore
     * and (crude for now) bridge stretches, or null. On an infeasible solve (a cost-model bug by
     * definition — the vocabulary can always buy its way through) the run keeps terrain-following
     * y as the mark-and-ship fallback and _v2Infeasible counts it.
     */
    _v2GradePts(pts, clArc, opts = {}) {
        const n = pts.length
        const L = clArc[n - 1]
        if (!(L > 1e-6) || n < 2) return null
        const nSt = Math.max(2, Math.round(L / 10))
        const st = { s: new Array(nSt + 1), ground: new Array(nSt + 1) }
        let j = 1
        for (let i = 0; i <= nSt; i++) {
            const t = L * i / nSt
            while (j < n - 1 && clArc[j] < t) j++
            const u = (t - clArc[j - 1]) / Math.max(1e-9, clArc[j] - clArc[j - 1])
            const x = pts[j - 1].x + (pts[j].x - pts[j - 1].x) * u
            const z = pts[j - 1].z + (pts[j].z - pts[j - 1].z) * u
            st.s[i] = t
            st.ground[i] = this._coarseH(x, z)
        }
        // BUG-53 trim: a spliced run's outer segment re-solves with its inner end pinned to the
        // WINNER's solved height at the fork, so the two branches leave from the same real deck.
        const yA = opts.yA ?? this._v2NodeHeight(pts[0].x, pts[0].z)
        const yB = opts.yB ?? this._v2NodeHeight(pts[n - 1].x, pts[n - 1].z)
        const C = this._v2Costs()
        // BUG-55: interior pins — a bundled winner's trunk carries the fork decks the joint solve
        // negotiated. opts.pins = [{s, y}] in the station arc domain; snapped to the nearest
        // interior station (the strand re-pins to the FINAL winner deck afterwards, so the snap
        // never opens a seam).
        const pins = opts.pins ? opts.pins.map((p) => {
            let i = 1
            for (let k2 = 2; k2 <= nSt - 1; k2++) if (Math.abs(st.s[k2] - p.s) < Math.abs(st.s[i] - p.s)) i = k2
            return { i, y: p.y }
        }) : undefined
        this._v2Rung = this._v2Rung || [0, 0, 0, 0]
        let prof = profileSolve(st, yA, yB, { costs: C, pins })
        if (prof) this._v2Rung[0]++
        // Rung 1 (quantization pinch): thin-margin descents die at yStep 0.5 (grade quanta 5%) but
        // solve at 0.25 — the measured M0 failure class. Only failures pay the finer, slower solve.
        if (!prof) { prof = profileSolve(st, yA, yB, { yStep: 0.25, costs: C, pins }); if (prof) this._v2Rung[1]++ }
        // Rung 3: grant a SMALL relief above the vocabulary cap — the cap is a design comfort, the
        // gMaxRoad + gradeTol ceiling is the contract, and a road shipped here is steep but legal.
        //
        // The relief is RELATIVE to the live cap and never exceeds the ceiling. It used to be the
        // literal 0.38 (as the ceiling itself was until BUG-56 C), which silently overrode the
        // setting: with Max Road Grade dialled to 20%, the
        // handful of edges that could not solve at 20% shipped at 38% — nearly double the request —
        // which is exactly why the knob "seemed to have very little influence" (owner 2026-08-20).
        // Measured at cap 0.20 on seed 20: 54 edges solved at the cap, 2 fell here and produced the
        // 38% maximum. Honouring the cap instead means those 2 edges may MARK, which is the designed
        // answer — a mark says the terrain cannot meet the request, which is true information.
        const ceiling = C.gMaxRoad + (C.gradeTol ?? 0.14)
        const reliefCap = Math.min(ceiling, C.gMaxRoad + 0.03)
        if (!prof) { prof = profileSolve(st, yA, yB, { yStep: 0.25, costs: { ...C, gMaxRoad: reliefCap }, pins }); if (prof) this._v2Rung[2]++ }
        // Rung 4 (the CEILING rung): if even the relieved cap fails, ship the steepest road the
        // CONTRACT allows rather than fall through to the terrain-follow. Condemnation is for "no
        // legal road exists here", not for "your design cap was ambitious" — and the drape below is
        // a genuinely bad road (measured: a marked run at a 20% cap terrain-follows to 106%, where
        // a solved 38% road existed the whole time). BUG-56 C: the ceiling is gMaxRoad + gradeTol,
        // so it tracks the knob; it is the STRICT limit, and past it workstream C re-routes.
        if (!prof && reliefCap < ceiling) { prof = profileSolve(st, yA, yB, { yStep: 0.25, costs: { ...C, gMaxRoad: ceiling }, pins }); if (prof) this._v2Rung[3]++ }
        if (!prof) {
            // Mark-and-ship fallback: terrain-follow y, but BLEND the ends onto the shared node
            // heights over 60 m so a marked run still meets its solved neighbors (node agreement
            // is by construction everywhere else; a mark must not re-open v1's node disease).
            this._v2Infeasible = (this._v2Infeasible || 0) + 1
            const W = Math.min(60, L / 3)
            for (let i = 0; i < n; i++) {
                const dA = Math.max(0, 1 - clArc[i] / W)
                const dB = Math.max(0, 1 - (L - clArc[i]) / W)
                pts[i].y += dA * (yA - this._coarseH(pts[0].x, pts[0].z))
                          + dB * (yB - this._coarseH(pts[n - 1].x, pts[n - 1].z))
            }
            return null
        }
        // Vertical dequantise: the DP's elevation grid makes grade come in 5% quanta, so a gentle
        // steady grade would ship as a 0%/±5% staircase — micro-crests the suspension feels. This
        // low-passes them out, pins the endpoints, preserves every span, and re-prices.
        prof = dequantizeProfile(st, prof, C)
        let k = 1
        for (let i = 0; i < n; i++) {
            const t = clArc[i]
            while (k < nSt && st.s[k] < t) k++
            const u = (t - st.s[k - 1]) / Math.max(1e-9, st.s[k] - st.s[k - 1])
            pts[i].y = prof.y[k - 1] + (prof.y[k] - prof.y[k - 1]) * u
        }
        // ROUND THE STATION CORNERS. The solved profile is defined at ~10 m stations and lerped onto
        // the 4 m polyline, so grade is CONSTANT within a station and changes instantaneously at each
        // one — a corner every 10 m. Even with a perfectly smooth station-grade series that reads as
        // a periodic tick through the suspension (infinite vertical curvature at each corner, however
        // small the grade step). A short low-pass over the shipped samples turns each corner into a
        // vertical curve. Endpoints stay pinned (node heights are a boundary condition) and the
        // window is deliberately ~2 stations: long enough to round a corner, far too short to touch
        // a real crest, which spans many stations. Bounded ±0.5·yStep, so it can never move the deck
        // across a class boundary and invent or destroy a span.
        const wSm = this._params?.roadV2?.vSmoothM ?? 0
        if (wSm > 0 && n > 4) {
            const last = n - 1
            const dsPoly = L / last
            const passes = Math.max(1, Math.min(24, Math.round(2 * Math.pow(Math.min(wSm, 2.5 * (L / nSt)) / (2 * dsPoly), 2))))
            const y0 = new Float64Array(n)
            for (let i = 0; i < n; i++) y0[i] = pts[i].y
            const cur = Float64Array.from(y0), nxt = Float64Array.from(y0)
            for (let p2 = 0; p2 < passes; p2++) {
                for (let i = 1; i < last; i++) nxt[i] = 0.25 * cur[i - 1] + 0.5 * cur[i] + 0.25 * cur[i + 1]
                for (let i = 1; i < last; i++) cur[i] = nxt[i]
            }
            const BOUND = 0.25   // m — half the DP's coarse y quantum
            for (let i = 1; i < last; i++) {
                pts[i].y = y0[i] + Math.max(-BOUND, Math.min(BOUND, cur[i] - y0[i]))
            }
        }
        const spans = []
        for (const sg of prof.segs) {
            if (sg.cls === CLS.BORE && sg.len >= 12) spans.push({ s0: sg.s0, s1: sg.s1 })
        }
        return spans.length ? spans : null
    }


    // FEAT-40: remove bore coverage around AT_GRADE crossings (see call site in _streamNetwork).
    // Window-invariant: pure function of _network tunnelSpans (per-edge) + _crossingsByRun (RUNKEY-
    // SET-INVARIANT within loaded tiles). Splits spans around each crossing ± the junction blend
    // reach; sub-spans shorter than 12 m are dropped (a bore that short reads as noise).
    _clipTunnelSpansAtCrossings() {
        if (!this._crossingsByRun || !this._network) return
        const R = (this._params?.roadJunctionBlendLength ?? 30) + 10
        for (const [runKey, xs] of this._crossingsByRun) {
            const e = this._network.get(runKey)
            if (!e || !e.tunnelSpans) continue
            let spans = e.tunnelSpans
            for (const x of xs) {
                const out = []
                for (const s of spans) {
                    if (x.arc - R >= s.s1 || x.arc + R <= s.s0) { out.push(s); continue }
                    if (x.arc - R - s.s0 >= 12) out.push({ s0: s.s0, s1: x.arc - R })
                    if (s.s1 - (x.arc + R) >= 12) out.push({ s0: x.arc + R, s1: s.s1 })
                }
                spans = out
            }
            e.tunnelSpans = spans.length ? spans : null
        }
    }

    // FEAT-13 v2 graph mode: build the Urquhart network into this._network over the band
    // [mx0,mx1]×[mz0,mz1]. _buildUrquhart computes the edge set over band+margin so every undirected edge
    // is emitted identically from any stream center (window-invariant). Each edge with ≥1 in-band endpoint
    // is routed via _edgeCenterline, sampled, graded STANDALONE (the junction reconciliation in
    // _applyJunctionBlend ties shared nodes together), and registered with cellA/cellB = site ids. An
    // incidence map (site-key → runKeys) is built for the junction-grade reconciliation. runKey =
    // "g:<idA>:<idB>" (canonical, from _buildUrquhart's id order).
    // ── R4: the SETTLE pass ──────────────────────────────────────────────────────────────────
    // Evaluate the delete rung for every non-dropped, non-degenerate edge of the band graph (not
    // just the in-band registration set: a node's built degree needs a verdict for EVERY incident
    // edge, or pins would depend on which window asked — the BUG-25 variance class). Then freeze:
    //   del  — every deleted pair as 'kA|kB' both orders (g.key spellings, same as adj)
    //   flip — nodes whose PIN CLASS changed (2 = through pin, 3+ = chord pin, else none);
    //          only these force plan pass 2, and only their edges take the '#b' route namespace.
    // Returns whether any node flipped. Pure fn of (graph, drop, terrain) → window-invariant to
    // the same degree the delete rung itself is.
    _v2SettleDeletions(g, drop, wide, mx0, mx1, mz0, mz1) {
        const _mband = this._params?.roadMergeBand ?? 24, _mband2 = _mband * _mband
        // PERF (2026-09-01): settle ONLY the verdicts this window can consume — the in-band edges
        // registration will delete-check anyway, plus every edge incident to one of their endpoint
        // nodes (a margin edge's deletion changes that node's BUILT degree, hence the in-band
        // edge's pin). Settling the whole band graph routed 298 edges where registration needs
        // ~104 and owned 7.7 s of a 9.3 s build. Verdicts are pure fns of pass-1 routes, so any
        // window that consumes a node's pins evaluates the identical incident set — the same
        // 1-ring invariance argument the pins themselves ride on.
        const wx0 = mx0 * PROTO_ANCHOR_SPACING, wx1 = (mx1 + 1) * PROTO_ANCHOR_SPACING
        const wz0 = mz0 * PROTO_ANCHOR_SPACING, wz1 = (mz1 + 1) * PROTO_ANCHOR_SPACING
        const inBand = (c) => { const p = this._nodePos(c); return p.x >= wx0 && p.x < wx1 && p.z >= wz0 && p.z < wz1 }
        const coreNodes = new Set()
        for (const [c1, c2] of g.edges) {
            if (drop.has(g.key(c1) + '|' + g.key(c2))) continue
            if (!inBand(c1) && !inBand(c2)) continue
            coreNodes.add(g.key(c1)); coreNodes.add(g.key(c2))
        }
        for (const [c1, c2] of g.edges) {
            if (drop.has(g.key(c1) + '|' + g.key(c2))) continue
            if (!coreNodes.has(g.key(c1)) && !coreNodes.has(g.key(c2))) continue
            const A = this._nodePos(c1), B = this._nodePos(c2)
            { const ex = A.x - B.x, ez = A.z - B.z; if (ex * ex + ez * ez <= _mband2) continue }
            this._v2DeleteFor(g, drop, wide, c1, c2)
        }
        const del = new Set()
        for (const rec of (this._v2Deleted?.values() ?? [])) {
            const [, kA, kB] = rec.key.split(':')
            del.add(kA + '|' + kB); del.add(kB + '|' + kA)
        }
        const flip = new Set()
        const pinClass = (d) => (d === 2 ? 2 : d >= 3 ? 3 : 0)
        const touched = new Set()
        for (const pr of del) touched.add(pr.split('|')[0])
        for (const nk of touched) {
            const nbrs = g.adj.get(nk)
            if (!nbrs) continue
            let d0 = 0, d1 = 0
            for (const o of nbrs) {
                if (drop.has(nk + '|' + o)) continue
                d0++
                if (!del.has(nk + '|' + o)) d1++
            }
            if (pinClass(d0) !== pinClass(d1)) flip.add(nk)
        }
        this._v2DelFrozen = { rev: this._networkRev, del, flip }
        return flip.size > 0
    }

    // ── FEAT-76: WYE → T PROMOTION ─────────────────────────────────────────────────────────────
    // Two roads that share a corridor part company at a fork. The wye built that fork as a
    // one-sided taper band: the side road ceded its first stretch to the through road, then peeled
    // off through a band whose start tangent was FORCED to the through road's heading. That forcing
    // is what made it a wye — smooth as a fork in one direction of travel, an ambiguous merge in the
    // other — and it is what made the bands tight (median corner 23.3 m against open road's 1st
    // percentile of 24.8 m).
    //
    // A T is symmetric. It drives the same from all three approaches, it needs no band, no gore and
    // no ownership bookkeeping, and it is a shape the junction pad machinery already builds because
    // it is just a degree-3 node. So: SPLIT the trunk at the fork point P, start the side road AT P
    // on its OWN heading, and let the pad dress the corner.
    //
    //   BEFORE (wye)                          AFTER (T)
    //     N ==================\___ B            N =========P=========== A
    //       ==================                            \___ B
    //
    // THE ROUTING DOES NOT CHANGE. This runs in the ASSEMBLY layer, after every route is settled:
    // `g`, `g.adj`, the drop set, the frozen deletes and every departure pin are byte-identical to
    // what they were before this ticket. `A–P` and `P–A` are exact SLICES of the trunk's registered
    // geometry (Centerline.slice cuts constant-curvature primitives exactly, so a slice is still
    // ordinary road with an ordinary analytic centerline), and the side road keeps the geometry it
    // already had past the fork. Nothing re-solves that could feed back into a pin, so the
    // pins → routes → degree → pins cycle never closes. (Full argument:
    // .planning/research/T-PROMOTION-FIXPOINT.md.)
    //
    // What DOES re-solve is the side road's own vertical profile, because its start is now pinned to
    // the trunk's deck at P instead of to a node height at N. That is one run's profile, downstream
    // of everything, and it cannot move a road in plan.
    _v2PromoteTs(g, drop, promos) {
        this._promoteStats = { done: 0, declined: 0 }
        if (!promos || !promos.length) return
        // A run key can be replaced (the side road re-keys onto P) or split in two (a trunk with a
        // fork on it), and a trunk can carry more than one fork — so every lookup goes through the
        // live-pieces table rather than the key the plan layer named.
        const pieces = new Map()
        for (const pr of promos) {
            const ok = this._v2PromoteOne(g, drop, pr, pieces)
            if (ok) this._promoteStats.done++
            else this._promoteStats.declined++
        }
    }

    _v2PromoteOne(g, drop, pr, pieces) {
        const decline = (why) => { this._v2MergeSkipped('promote', `${pr.sideKey} ${why}`); return false }
        if (pr.spec.midSpan) return this._v2PromoteMidSpan(g, pr, pieces)
        const MINREG = 30
        const C = this._v2Costs()
        const PROX = C.mergeProxM ?? 18
        const wCells = [g.key(pr.spec.winner[0]), g.key(pr.spec.winner[1])]
        // The side run, and the shared node: the one id both the side edge and the winner touch.
        //
        // BUG-61: the side road may already be in PIECES — another T used it as ITS trunk and
        // split it — and whether that third road is in the window at all is a band question. So
        // declining a split side run ("side run already promoted") made this T's existence
        // window-dependent: mission-network's drop point sat between two Ts in the mission band
        // and beside one in the play band, because the play band also held the road that split
        // the side run first. The end that meets the shared node is still this promotion's run
        // whatever happened further along it: take the piece that touches the trunk. No piece
        // touching it means this END was already promoted, which is the one honest decline.
        let sideKey = null, side = null, nKey = null
        for (const k of (pieces.get(pr.sideKey) || [pr.sideKey])) {
            const e = this._network.get(k)
            if (!e || !e.points || e.points.length < 4 || !e.centerline?.slice) continue
            const a = g.key(e.cellA), b = g.key(e.cellB)
            const n = wCells.includes(a) ? a : (wCells.includes(b) ? b : null)
            if (!n) continue
            sideKey = k; side = e; nKey = n; break
        }
        if (!side) return decline('no side piece meets the trunk')
        const nAtStart = g.key(side.cellA) === nKey
        const sideL = side.polyCum[side.polyCum.length - 1]
        const wk0 = `g:${wCells[0]}:${wCells[1]}`
        const Rmin = this._params?.roadMinTurnRadius ?? 12
        const ladder = [4 * Rmin, 3 * Rmin, 2 * Rmin, Rmin]
        // The far end of the side run: a site node (ordinary pin) or, on a split piece, another T's
        // vertex — whose deck the departure must land on (see _v2BuildDeparture).
        const farCell = nAtStart ? side.cellB : side.cellA
        const farY = _isPromotedId(farCell) ? this._promoted.get(g.key(farCell))?.pos.y : undefined
        // Everything a commit needs, for a fork at world XZ (fx,fz): the live trunk piece under it,
        // the trunk VERTEX P (the split is exact and the synthetic id names a point that EXISTS in
        // the geometry rather than one interpolated onto it), and the side road's own vertex abreast
        // of P. null, with a reason, when the fork cannot be built on the pieces as they stand.
        const ctxAt = (fx, fz) => {
            let T = null, tKey = null, tHit = null
            for (const k of (pieces.get(wk0) || [wk0])) {
                const e = this._network.get(k)
                if (!e || !e.points || e.points.length < 4 || !e.centerline?.slice) continue
                const h = _nearestOnPolyXZ(fx, fz, e.points, e.polyCum)
                if (h && (!tHit || h.d < tHit.d)) { T = e; tKey = k; tHit = h }
            }
            if (!T || tHit.d > 4) return { why: 'the trunk rerouted out from under the plan' }
            const iP = _nearestVertexAtCum(T.polyCum, tHit.cum)
            const tL = T.polyCum[T.polyCum.length - 1]
            // Road must be left on BOTH sides of the fork. That is the whole spacing rule: the owner
            // ruled that a T beside another junction is legitimate road (BUG-61) — the 45 m guard
            // that once sat here only hid the id instability this ticket fixed.
            if (T.polyCum[iP] < MINREG || tL - T.polyCum[iP] < MINREG) return { why: 'no trunk left past the fork on this piece' }
            const P = T.points[iP]
            const pid = _promotedId(P.x, P.z), pKey = g.key(pid)
            if (this._promoted.has(pKey)) return { why: 'two forks on one vertex' }
            const lo = nAtStart ? 0 : sideL * 0.15, hi = nAtStart ? sideL * 0.85 : sideL
            const lHit = _nearestOnPolyXZ(P.x, P.z, side.points, side.polyCum, lo, hi)
            if (!lHit || lHit.d > this._v2ForkAbreastMax()) return { why: 'side road is not abreast of the fork' }
            const iL = _nearestVertexAtCum(side.polyCum, lHit.cum)
            const fromNode = nAtStart ? side.polyCum[iL] : sideL - side.polyCum[iL]
            if (fromNode < MINREG || sideL - fromNode < MINREG) return { why: 'no side road left past the fork' }
            const grade = _trunkGradeAt(T, iP)
            return { T, tKey, wk0, iP, P, pid, pKey, iL, side, sideKey, nAtStart, nKey, grade }
        }
        const ship = (c, built, why) => {
            // NOTHING CLEARED — SO SHIP THE BEST ONE ANYWAY. Owner ruling 2026-09-07: "the wye
            // geometry is generally a bad thing to have, we would prefer them to be Ts."
            //
            // This is not indulgence, it is what the measurement says. Declining a promotion does
            // NOT remove the deck step the test is objecting to — the two roads still run a road
            // width apart with the same profiles. It removes the JUNCTION and leaves the step. And
            // it is worse than that: promoting PINS the side road's start to the trunk's deck at P,
            // and that constraint is what was holding the two decks together. Measured over the
            // seven junctions this used to decline, the worst nearby deck step went the wrong way
            // in five of them — 5.04 m -> 13.20 m at seed 11 (-1754,-280), 2.81 -> 4.70 at seed 7
            // (-221,885) — because a declined side road solves its profile freely from its own node.
            //
            // So the test keeps its job, which is choosing the best fork and rung, and loses the one
            // it should never have had: refusing the whole junction on a defect that gets worse
            // without it. The residual is counted, not hidden, and it is junction-stitch's subject.
            if (why) this._v2MergeSkipped('promote-residual', `${pr.sideKey} shipped as the best available T — ${why}`)
            this._v2CommitPromotion(g, pieces, pr, { ...c, built })
            return true
        }
        // ── BUG-61: APPLY THE PLAN'S FORK. The probe already ran this very ranking on the pure
        // samples and recorded the vertex and rung that won; every window recorded the same one.
        // The registered polyline is that sample (same centerline, same solve — _registerRun and
        // _v2RunSample are the one sampler), so the vertex is here to be found on whichever piece
        // of the trunk carries it. Ranking again here is exactly what the ticket forbids.
        // Looked up by the GRAPH edge the plan judged (pr.sideKey spells its two graph nodes), not by
        // the piece's cells: a split side run's near cell is another T's vertex, which is no graph
        // edge, and the probe would answer "cannot judge" — sending the promotion to the registered
        // ranking, whose fork is exactly the window-dependent one BUG-61 removed (seed 6 (3069,994):
        // it landed 44 m from the node and left the next side road no trunk to fork on).
        const [sk0, sk1] = pr.sideKey.slice(2).split(':').map((k) => k.split(',').map(Number))
        const plan = this._v2PromotableFor(g, drop, pr.spec, sk0, sk1)
        const fork = plan && plan.fork ? plan.fork : null
        if (fork) {
            const c = ctxAt(fork.x, fork.z)
            if (c.T && Math.hypot(c.P.x - fork.x, c.P.z - fork.z) < 0.5) {
                // The planned rung first; the rest of the ladder only if this piece will not take it.
                const r0 = Math.max(0, ladder.indexOf(fork.RB))
                for (let r = r0; r < ladder.length; r++) {
                    const built = this._v2BuildDeparture(side, c.iL, nAtStart, c.P, ladder[r], farY)
                    if (!built) continue
                    return ship(c, built, this._v2DepartureAccepts(built, c.T, c.P, c.grade))
                }
            }
            // A rerouted trunk or side road (BUG-56 C's never-drape rung re-plans the corridor)
            // carries a different polyline from the sample the plan judged, so the vertex is not
            // there. Rare, counted, and the reroute verdict is itself per-edge pure — so the
            // ranking below is still the same in every window that built the same reroute.
            this._v2MergeSkipped('promote-replan', `${pr.sideKey} ${c.T ? 'plan fork is not a vertex of the registered trunk' : c.why}`)
        }
        // ── Registered-geometry ranking: the fallback for a rerouted pair (and a plan with no
        // fork record). Same order as the probe: deck agreement, ladder gentlest first, first
        // clear wins, else best score.
        const vs = this._v2ForkCandidates(g, pr, side, nAtStart, sideL, wk0, wCells)
        if (!vs.length) return decline('no node-anchored variant')
        let best = null
        for (const v of vs) {
            const c = ctxAt(v.forkPt.x, v.forkPt.z)
            if (!c.T) continue
            for (const RB of ladder) {
                const built = this._v2BuildDeparture(side, c.iL, nAtStart, c.P, Math.max(RB, Rmin), farY)
                if (!built) continue
                const why = this._v2DepartureAccepts(built, c.T, c.P, c.grade)
                if (!why) return ship(c, built, null)
                if (!best || built._score < best.score) best = { score: built._score, c, built, why }
            }
        }
        if (best) return ship(best.c, best.built, best.why)
        return decline('no variant promoted')
    }

    /**
     * A MID-SPAN pair — two roads that part at their shared node, go their own way, and come back
     * together further out — promotes to TWO Ts, and the road between them is the through road.
     *
     *   BEFORE (mid-span wye)              AFTER (two Ts)
     *     ----\________/----                 ----\        /----
     *     ================                   ======P1====P2======
     *
     * The side road is CUT: it exists up to P1, does not exist over the shared middle (that ground
     * is one road, the trunk), and resumes at P2. Both its original endpoints survive, so nothing
     * is added to _promotedAway and no node loses a leg — connectivity is untouched, and the two
     * halves reach each other along the trunk, which is what the geometry was already saying.
     *
     * Mechanically it is the node-anchored graft applied twice with no new machinery: one call each
     * for the piece before P1 and the piece after P2. Both must build and both must pass, or
     * neither is applied — half a mid-span promotion would leave the middle overlapping, which is
     * the defect this is meant to remove.
     */
    _v2PromoteMidSpan(g, pr, pieces) {
        const decline = (why) => { this._v2MergeSkipped('promote', `${pr.sideKey} mid-span ${why}`); return false }
        const MINREG = 30
        const sideKeys = pieces.get(pr.sideKey) || [pr.sideKey]
        if (sideKeys.length !== 1) return decline('side run already promoted')
        const sideKey = sideKeys[0]
        const side = this._network.get(sideKey)
        if (!side || !side.points || side.points.length < 6 || !side.centerline?.slice) return decline('no side run')
        const wCells = [g.key(pr.spec.winner[0]), g.key(pr.spec.winner[1])]
        const wk0 = `g:${wCells[0]}:${wCells[1]}`
        const Rmin = this._params?.roadMinTurnRadius ?? 12
        for (const v of pr.spec.variants) {
            if (!v.midSpan) continue
            // The two ends, each treated exactly as a node-anchored graft: the piece at lIn keeps
            // the side of the run the loser arrives from, the piece at lOut keeps the side it
            // leaves on. lDir says which way round the loser walks the shared middle.
            const ends = [
                { wArc: v.wIn,  lArc: v.lIn,  nAtStart: v.lDir < 0 },
                { wArc: v.wOut, lArc: v.lOut, nAtStart: v.lDir > 0 },
            ]
            const plans = []
            let ok = true
            for (const en of ends) {
                // Which trunk piece carries this end (the first end's commit may already have split it).
                const wp = this._v2TrunkPieceAt(pieces, wk0, en.wArc, plans)
                if (!wp) { ok = false; break }
                const { T, tKey } = wp
                const iP = _nearestVertexAtCum(T.polyCum, wp.cum)
                const tLen = T.polyCum[T.polyCum.length - 1]
                if (T.polyCum[iP] < MINREG || tLen - T.polyCum[iP] < MINREG) { ok = false; break }
                const P = T.points[iP]
                const pid = _promotedId(P.x, P.z), pKey = g.key(pid)
                if (this._promoted.has(pKey) || plans.some((q) => q.pKey === pKey)) { ok = false; break }
                const iL = _nearestVertexAtCum(side.polyCum, en.lArc)
                const kept = en.nAtStart ? side.polyCum[side.polyCum.length - 1] - side.polyCum[iL] : side.polyCum[iL]
                if (kept < MINREG) { ok = false; break }
                const grade = _trunkGradeAt(T, iP)
                // Same ruling as the node-anchored path: the tests rank, they do not veto.
                let built = null, bestB = null, bestWhy = null
                for (const RB of [4 * Rmin, 3 * Rmin, 2 * Rmin, Rmin]) {
                    const b = this._v2BuildDeparture(side, iL, en.nAtStart, P, RB)
                    if (!b) continue
                    const why = this._v2DepartureAccepts(b, T, P, grade)
                    if (!why) { built = b; break }
                    if (!bestB || b._score < bestB._score) { bestB = b; bestWhy = why }
                }
                if (!built && bestB) {
                    this._v2MergeSkipped('promote-residual', `${pr.sideKey} mid-span shipped as the best available T — ${bestWhy}`)
                    built = bestB
                }
                if (!built) { ok = false; break }
                plans.push({ T, tKey, wk0, iP, P, pid, pKey, side, sideKey, nAtStart: en.nAtStart, nKey: null, built, grade })
            }
            if (!ok || plans.length !== 2) continue
            // ONE commit for both ends. They were planned against the same snapshot of the trunk,
            // so committing them one after the other would slice the FULL trunk twice and leave two
            // overlapping copies of every piece (measured on seed 67: five runs where three belong,
            // two of them lying on top of each other, which is what road-connectivity read as a
            // crossing). Cut once, at both arcs, into three.
            if (plans[0].tKey !== plans[1].tKey) { this._v2MergeSkipped('promote', `${pr.sideKey} mid-span ends landed on different trunk pieces`); continue }
            if (Math.abs(plans[0].T.polyCum[plans[0].iP] - plans[1].T.polyCum[plans[1].iP]) < MINREG) continue
            this._v2CommitMidSpan(g, pieces, pr, plans)
            return true
        }
        return decline('no variant promoted')
    }

    // The live trunk piece covering a plan-layer arc on the original winner run, plus that arc
    // re-expressed in the piece's own domain. `staged` carries commits not yet applied within this
    // pair, so the second end of a mid-span sees the first end's split.
    _v2TrunkPieceAt(pieces, wk0, wArc, staged) {
        const T0 = this._network.get(wk0)
        let q = null
        if (T0) q = _polyAtCum(T0.points, T0.polyCum, wArc)
        else {
            for (const st of staged) { const h = _polyAtCum(st.T.points, st.T.polyCum, wArc); if (h) { q = h; break } }
        }
        if (!q) return null
        let best = null
        for (const k of (pieces.get(wk0) || [wk0])) {
            const e = this._network.get(k)
            if (!e || !e.points || e.points.length < 4 || !e.centerline?.slice) continue
            const h = _nearestOnPolyXZ(q.x, q.z, e.points, e.polyCum)
            if (h && (!best || h.d < best.d)) best = { T: e, tKey: k, cum: h.cum, d: h.d }
        }
        return best && best.d <= 4 ? best : null
    }

    /**
     * WHERE TO PUT THE T — and this is the one placement rule a wye never needed.
     *
     * A wye did not have to care where along the shared stretch it forked: the loser rode the
     * winner's DECK up to the fork (the departure hold), so the two heights agreed there by
     * construction, wherever "there" was. A T has no hold. Its side road leaves P at the through
     * road's deck and is on its own profile immediately, so if P sits where the through road runs
     * five metres above the line the side road wants, the leg has to claw that back in the first
     * few tens of metres — which is a 30 % departure, and B6 rightly condemns it.
     *
     * So: PUT THE JUNCTION WHERE THE TWO ROADS CAN ACTUALLY MEET. Scan the legal fork window (from
     * MINREG out to the furthest arc the merge ladder itself was willing to fork at — the plan
     * layer still decides how much ground the pair shares, this only chooses a point inside it) and
     * rank by |through-road deck − side-road's own deck abreast of it|. Cheap: two polyline lookups
     * per candidate, no profile solve, so only the handful that survive the ranking pay for one.
     *
     * Window-invariant ONLY when run on the plan's PURE samples (_v2PromotableProbe, BUG-61): there
     * the two polylines are full edges with no earlier promotion in sight, and the total order
     * (deck error, then arc) breaks ties identically in every window. On the registered network the
     * trunk may already be a piece, and the answer moves with the window — that path is now the
     * rerouted-pair fallback in _v2PromoteOne, nothing more.
     */
    _v2ForkCandidates(g, pr, side, nAtStart, sideL, wk0, wCells) {
        const MINREG = 30
        const spec = pr.spec
        const T0 = this._network.get(wk0)
        const cand = []
        const push = (arc, forkPt) => cand.push({ wCut: arc, forkPt })
        // The plan's own rungs stay in the list — they are where the merge ladder wanted to fork,
        // and where the deck happens to agree they are still the best answer.
        const seen = new Set()
        for (const v of spec.variants) {
            if (v.midSpan || !v.forkPt) continue
            const k = v.wCut.toFixed(2)
            if (seen.has(k)) continue
            seen.add(k); push(v.wCut, v.forkPt); cand[cand.length - 1].fromPlan = true
        }
        if (!T0 || !T0.points || !cand.length) return cand
        const tL = T0.polyCum[T0.polyCum.length - 1]
        const wAtStart = !!spec.winnerNodeAtStart
        const fromNode = (a) => (wAtStart ? a : tL - a)
        let wMax = 0
        for (const c of cand) wMax = Math.max(wMax, fromNode(c.wCut))
        for (let a = MINREG; a <= Math.min(wMax, tL - MINREG); a += 8) {
            const arc = fromNode(a)
            if (arc < MINREG || arc > tL - MINREG) continue
            const q = _polyAtCum(T0.points, T0.polyCum, arc)
            const k = arc.toFixed(2)
            if (seen.has(k)) continue
            seen.add(k); push(arc, { x: q.x, z: q.z })
        }
        // THE PARTING POINT, added explicitly rather than hoped for. Everything above is bounded by
        // where the MERGE ladder was willing to fork, which is where the pair stops being within
        // mergeProxM (18 m) — a wye's question, because a wye owned the ground up to its fork. A T
        // owns nothing: it needs the place past which the two roads never come back inside one road
        // width, and on a pair that parts slowly that is further out than any rung the ladder
        // proposed. Walk the side road out from its node, find the last arc that is still too close,
        // and offer the trunk abreast of it (and a little past) as candidates.
        {
            // FEAT-77: "too close" is the clearance rule, not one road width — the parting point
            // is the last sample still inside the earthwork the rule protects. A legacy spec (the
            // fallback that keeps main's T) keeps the old one-road-width bar throughout.
            const nearT = spec.legacy ? (pa, h) => h.d <= 2 * (this._params?.roadHalfWidth ?? 5) + 2 : this._v2Near()
            const nSide = side.points.length
            let lastClose = -1
            for (let i = 0; i < nSide; i++) {
                const q = _nearestOnPolyXZ(side.points[i].x, side.points[i].z, T0.points, T0.polyCum)
                if (q && nearT(side.points[i], q)) lastClose = i
            }
            if (lastClose >= 0) {
                const base = _nearestOnPolyXZ(side.points[lastClose].x, side.points[lastClose].z, T0.points, T0.polyCum)
                for (const extra of [0, 20, 45]) {
                    const arc = Math.min(tL - MINREG, Math.max(MINREG, base.cum + (wAtStart ? extra : -extra)))
                    const k = arc.toFixed(2)
                    if (seen.has(k)) continue
                    const q = _polyAtCum(T0.points, T0.polyCum, arc)
                    seen.add(k); push(arc, { x: q.x, z: q.z })
                }
            }
        }
        // Rank by how far apart the two decks are where they would meet — and first, THROW OUT ANY
        // FORK THAT DOES NOT ACTUALLY END THE SHARING.
        //
        // This is the trap the deck ranking walks into on its own. Put P halfway along a 400 m
        // shared stretch and the arithmetic is delighted — the decks agree there — but the side
        // road now EXISTS over the remaining 200 m of shared ground, running inside the through
        // road's corridor with a deck of its own. That is the defect the ticket removes, rebuilt by
        // accident, and it is what left seed 67 with three real crossings (road-connectivity red).
        // A fork is only a fork if the road past it is clear of the road it left: require the side
        // road's own line, beyond the departure band, to stay more than one road width plus the
        // seam window away from the trunk. Two polyline walks, no profile solve — this runs before
        // anything expensive.
        // FEAT-77: "clear of the road it left" is the owner's earthwork rule (_v2ClearReq), not one
        // road width plus a seam window — 46 of the battery's 52 clearance violators were T sides
        // whose fork had been accepted at that old 12 m bar.
        const near = spec.legacy ? (pa, h) => h.d <= 2 * (this._params?.roadHalfWidth ?? 5) + 2 : this._v2Near()
        const lo = nAtStart ? 0 : sideL * 0.15, hi = nAtStart ? sideL * 0.85 : sideL
        for (const c of cand) {
            const h = _nearestOnPolyXZ(c.forkPt.x, c.forkPt.z, side.points, side.polyCum, lo, hi)
            const t = _nearestOnPolyXZ(c.forkPt.x, c.forkPt.z, T0.points, T0.polyCum)
            c.dY = (h && t) ? Math.abs(t.y - h.y) : Infinity
            c.gap = h ? h.d : Infinity
            c.clears = false
            if (!h) continue
            // the longest band this fork could use, so the check starts past every rung
            const LBmax = Math.sqrt(2 * Math.max(c.gap, 0.5) * 4 * (this._params?.roadMinTurnRadius ?? 12))
            // INSIDE the band the departure is the side's own line translated toward P by
            // gap·(1−u)², u = arc from the fork over the band. A side whose own line comes BACK
            // toward the trunk within the band (a fork at a local bulge of a hug) gets translated
            // straight through it: measured as a 7.9 m lip 18 m from the fork at seed 6 node 4,1,1
            // (FEAT-77). So the band's own lateral, own(i) − gap·(1−u)², must keep the fork's side
            // of the trunk with a metre to spare, all the way along the longest band. Beyond the
            // band, the rule.
            let clears = true, sideSign = 0
            for (let i = 0; i < side.points.length && clears; i++) {
                const d = nAtStart ? side.polyCum[i] - h.cum : h.cum - side.polyCum[i]
                if (d < 0) continue
                const q = _nearestOnPolyXZ(side.points[i].x, side.points[i].z, T0.points, T0.polyCum)
                if (!q) continue
                if (d <= LBmax) {
                    const lat = (side.points[i].x - q.fx) * q.tz - (side.points[i].z - q.fz) * q.tx
                    const sg = Math.sign(lat)
                    if (d < 1e-6 || !sideSign) { if (sg !== 0) sideSign = sg; continue }
                    const u = Math.min(1, d / Math.max(1e-6, LBmax))
                    if (lat * sideSign - c.gap * (1 - u) * (1 - u) < 1) clears = false
                    continue
                }
                if (near(side.points[i], q)) clears = false
            }
            c.clears = clears
        }
        const ok = cand.filter((c) => c.clears && c.gap < this._v2ForkAbreastMax() && Number.isFinite(c.dY))
                       .sort((a, b) => (a.dY - b.dY) || (a.wCut - b.wCut))
        // Best deck agreement first, then whatever the merge ladder itself proposed that the cut
        // dropped — a plan rung that survives every acceptance test is still a valid T even if its
        // decks are not the closest pair on the run, and truncating them out cost promotions.
        const out = ok.slice(0, 10)
        for (const c of ok.slice(10)) if (c.fromPlan) out.push(c)
        return out
    }

    /**
     * The side road's departure geometry: its OWN routed line from the fork onward, translated onto
     * P by an offset that decays to nothing.
     *
     * This is the taper's one good idea kept and its one bad idea dropped. The good idea: work in
     * the side road's own frame — the fork is a <= 18 m offset decaying over tens of metres, which
     * is a gentle shift, where a free curve from P to a point downstream is badly conditioned
     * exactly at the fork (its start curvature goes as the angle between start tangent and chord).
     * The bad idea, now gone: forcing the start tangent to the TRUNK's heading.
     *
     * THE DECAY IS w(u) = (1-u)^2, AND THE SHAPE OF IT IS THE WHOLE TICKET.
     *   w(0) = 1        the departure starts exactly on P
     *   w'(0) = -2      it leaves at atan(2*g0/LB) OFF the through road — an ANGLE, at the node
     *   w(1) = w'(1) = 0  it joins its own routed line tangentially, no crease
     *   w'' = const     the turn is spread evenly over the band, not piled up in the middle
     *
     * A smoothstep (w'(0) = 0) was tried first and is exactly the wrong curve: it leaves P PARALLEL
     * to the through road and only bends away later, which is a wye drawn a different way — it hugs
     * the trunk for tens of metres and every one of seed 6's forks failed the deck-seam test on it.
     * Putting the angle AT P instead is what makes the corner the junction pad's business, which is
     * where a T's corner belongs, and it leaves the band itself gentle.
     *
     * Band length is sized from the curvature the offset induces: |k| = 2*g0/LB^2, so LB =
     * sqrt(2*g0*R) buys a chosen radius. R is set well above roadMinTurnRadius on purpose — a band
     * is road and may not be tighter than road (BUG-56 B5).
     */
    _v2BuildDeparture(side, iL, nAtStart, P, RB, farY) {
        const i0 = nAtStart ? iL : 0
        const i1 = nAtStart ? side.points.length - 1 : iL
        if (i1 - i0 < 3) return null
        const cumL = side.polyCum[iL]
        const ownLen = Math.abs(side.polyCum[i1] - side.polyCum[i0])
        const dx0 = P.x - side.points[iL].x, dz0 = P.z - side.points[iL].z
        const g0 = Math.hypot(dx0, dz0)
        const LB = Math.max(20, Math.min(Math.sqrt(2 * Math.max(g0, 0.5) * RB), 90, ownLen * 0.6))
        const n = i1 - i0 + 1
        const pts = new Array(n)
        const clArc = new Float64Array(n)
        const cl0 = side.clArc[i0]
        let jLo = n - 1, jHi = 0                    // output indices the offset actually touches
        for (let i = i0; i <= i1; i++) {
            const u = Math.min(1, Math.abs(side.polyCum[i] - cumL) / LB)
            const w = (1 - u) * (1 - u)                // see the header — the angle belongs AT the node
            const q = side.points[i]
            pts[i - i0] = new THREE.Vector3(q.x + dx0 * w, q.y, q.z + dz0 * w)
            clArc[i - i0] = side.clArc[i] - cl0
            if (u < 1) { jLo = Math.min(jLo, i - i0); jHi = Math.max(jHi, i - i0) }
        }
        // Land the P end EXACTLY on the trunk vertex — the id, the pad plane and the junction
        // cluster all name that point, and a millimetre of drift here is a millimetre of gap.
        const pIdx = nAtStart ? 0 : n - 1
        pts[pIdx].set(P.x, P.y, P.z)
        const polyCum = new Float64Array(n)
        for (let i = 1; i < n; i++) polyCum[i] = polyCum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
        // The blend is the one stretch whose points have left the primitive centerline; declare it
        // so the analytic refine and the par sampler stay on the polyline there (the same
        // convention _v2RegisterShoved uses for a deflected run — this is why offCurveSpans stays
        // even though the wye's ceded and departure spans are gone).
        const offCurveSpans = [{
            s0: Math.max(0, polyCum[Math.max(0, jLo)] - 2),
            s1: Math.min(polyCum[n - 1], polyCum[Math.min(n - 1, jHi)] + 2),
        }]
        // The profile re-solves with the P end pinned to the TRUNK'S DECK — the two roads leave the
        // same real surface. The far end keeps the ordinary node-height pin, unless the caller
        // names one: a side road that was split as another T's trunk (BUG-61) is promoted on its
        // PIECE, whose far end is that other T — a deck, not a site, and _v2NodeHeight would put
        // it 6 m off (graph-topology's SURFACE-SMOOTH caught exactly that step).
        const inf0 = this._v2Infeasible || 0
        const ends = nAtStart ? { yA: P.y } : { yB: P.y }
        if (farY !== undefined) { if (nAtStart) ends.yB = farY; else ends.yA = farY }
        const tunnelSpans = this._v2GradePts(pts, clArc, ends)
        if ((this._v2Infeasible || 0) > inf0) { this._v2Infeasible = inf0; return null }   // draped — try the next fork
        const centerline = side.centerline.slice(cl0, side.clArc[i1])
        return { pts, clArc, polyCum, centerline, tunnelSpans, offCurveSpans, nAtStart, LB, g0 }
    }

    /**
     * The two acceptance tests BUG-56 bought with real defects, ported off the band ladder they
     * used to live on. A T departure still needs both; it just does not need them expressed as a
     * rung of a taper.
     */
    _v2DepartureAccepts(built, T, P, grade) {
        const { pts, polyCum, nAtStart } = built
        const n = pts.length
        // Both tests run on the departure AS IT WILL SHIP, which means after the ordinary junction
        // grade reconciliation: the side road leaves P at the trunk's deck, on the trunk's slope,
        // and recovers its own solved profile over roadJunctionBlendLength via _applyJunctionBlend's
        // smoothstep. Testing the raw solve instead would condemn every T for a wall the pad
        // dresses — measured, it rejected all 11 of seed 6's. THIS is why a T needs no departure
        // hold: the fork is a NODE, so the reconciliation that ties any two legs together applies.
        const Rj = this._params?.roadJunctionBlendLength ?? 30
        const dOf = (i) => Math.abs(polyCum[i] - polyCum[nAtStart ? 0 : n - 1])
        const iEnd = nAtStart ? 1 : n - 2
        const wx = pts[iEnd].x - pts[nAtStart ? 0 : n - 1].x, wz = pts[iEnd].z - pts[nAtStart ? 0 : n - 1].z
        const wl = Math.hypot(wx, wz) || 1
        const slopeAway = grade.gx * wx / wl + grade.gz * wz / wl
        const yb = new Float64Array(n)
        for (let i = 0; i < n; i++) {
            const d = dOf(i)
            yb[i] = pts[i].y
            if (d < Rj) {
                const t = 1 - d / Rj, f = t * t * (3 - 2 * t)
                yb[i] += (P.y + slopeAway * d - pts[i].y) * f
            }
        }
        // Both tests start OUTSIDE the junction pad. Inside it there is no ribbon to judge: the pad
        // plane is the surface, and the pad's own rules govern it (roadJunctionPadMaxGrade for the
        // plane, roadJunctionBlendMaxGrade for the arrival ramp) — the ticket's "mergePadArrivalMax
        // is the pad-side equivalent already in place for ordinary junctions". Measured without this
        // exclusion, 7 of seed 6's 10 forks were condemned for deck gaps 4-10 m from the node, which
        // is paved plaza, not a wall between two ribbons.
        // R3 (owner, 2026-08-31): A PAD REACHES 10 m AT MOST — "the ruled bar, not the built reach".
        // FEAT-76 used roadJunctionCutback + roadHalfWidth = 15 m here, which is exactly the
        // "instrument margin" R3 tightened away, so the departure was being judged from 5 m further
        // out than the ruling allows. Measured 2026-09-07: 31 of the 34 junction-stitch violations
        // that sit at a promoted T fall in that 10-15 m ring — they were real, and this test was
        // looking past them.
        const padR = 10
        // ── B6: the departure grade — the steepest 12 m the driver actually meets leaving the T.
        //
        // The CAP is the road's own grade, not a fixed number, and that is a change from how the
        // wye ran this test. There, a fixed gMaxRoad was right: the hold spent the leg's climbing
        // room riding the through road's deck and the freed solve then clawed the height back, so
        // any steepness at the fork was an artefact of the merge and gMaxRoad was the standard it
        // had failed. A T has no hold — its departure grade is simply the grade of the road there.
        // Measured at seed 6 (3455,1758), g:5,1,0:5,2,2 already ships 25 % somewhere along its own
        // length; condemning its T for a 25 % departure condemns the terrain, not the junction, and
        // it cost that pair its merge and left two roads 7.7 m apart (graph-topology red).
        //
        // So the rule is: A T MAY NOT PUT A HUMP IN A ROAD. Cap at the worst 12 m this same run meets
        // away from the junction, plus the grade a junction arrival ramp is already allowed to add
        // anywhere else in the network (roadJunctionBlendMaxGrade — this is that same allowance,
        // not a new number); floored at gMaxRoad so a gentle road still gets a gentle departure, and
        // hard-stopped at the network's own ceiling. The ceiling is not the load-bearing half:
        // _v2GradePts already refuses to drape, so a candidate that cannot solve legally is declined
        // before it reaches here. What this test adds is "and it must match the road it joins".
        const Cst = this._v2Costs()
        const ceiling = (Cst.gMaxRoad ?? 0.24) + (Cst.gradeTol ?? 0.14)
        const inBand = (i) => dOf(i) >= padR && dOf(i) <= built.LB + padR
        const i0 = nAtStart ? 0 : Math.max(0, n - 1 - Math.ceil((built.LB + padR) / PROTO_SAMPLE_DS))
        const i1 = nAtStart ? Math.min(n - 1, Math.ceil((built.LB + padR) / PROTO_SAMPLE_DS)) : n - 1
        const worst12 = (from, to, band) => {
            let w = 0
            for (let i = from; i <= to; i++) {
                if (band !== inBand(i)) continue
                let j = i
                while (j < to && polyCum[j] - polyCum[i] < 12) j++
                const ds = polyCum[j] - polyCum[i]
                if (ds > 1e-6) w = Math.max(w, Math.abs(yb[j] - yb[i]) / ds)
            }
            return w
        }
        const worst = worst12(i0, i1, true)
        const own = worst12(0, n - 1, false)
        const ramp = this._params?.roadJunctionBlendMaxGrade ?? 0.12
        const depCap = Math.min(ceiling, Math.max(Cst.gMaxRoad ?? 0.24, own + ramp))
        built._gradeOver = Math.max(0, worst - depCap)
        const gradeWhy = worst > depCap
            ? `departure grade ${(100 * worst).toFixed(0)}% > cap ${(100 * depCap).toFixed(0)}% (the run's own worst 12 m is ${(100 * own).toFixed(0)}%)`
            : null
        // ── B3: the seam — two decks may not diverge faster than the ground between them can slope.
        // Only where the pavements TOUCH; past a couple of metres of daylight the ground between
        // them is ordinary embankment and the ordinary carve builds it.
        const TOLW = 0.15, FILLV = 1 / (this._params?.roadFillSlope ?? 3), SEAM_WINDOW = 2
        const HWs = this._params?.roadHalfWidth ?? 5
        const NEARW = this._v2Costs().mergeProxM ?? 18
        const cam = this._computeCamberArrays(T.points, 0, 0)
        let seamOver = 0, seamWhy = null
        for (let i = i0; i <= i1; i++) {
            if (!inBand(i)) continue
            const q = _nearestOnPolyXZ(pts[i].x, pts[i].z, T.points, T.polyCum)
            if (!q || q.d >= NEARW) continue
            const sep = Math.max(0, q.d - 2 * HWs)
            if (sep > SEAM_WINDOW) continue
            const latQ = (pts[i].x - q.fx) * q.tz - (pts[i].z - q.fz) * q.tx
            const gap = Math.abs(yb[i] - (q.y + latQ * Math.sin(this._v2CamAtArc(cam, q.cum))))
            const allow = TOLW + FILLV * sep
            void 0
            if (gap - allow > seamOver) {
                seamOver = gap - allow
                seamWhy = `departure deck gap ${gap.toFixed(2)} m at ${sep.toFixed(1)} m of edge separation, ${dOf(i).toFixed(0)} m out from the T (allowed ${allow.toFixed(2)})`
            }
        }
        built._seamOver = seamOver
        // The SCORE is what ranks candidates when none of them clears. Deck step in metres dominates;
        // grade excess is weighted to be comparable (a 1 % overshoot ~ 10 cm of step).
        built._score = seamOver + built._gradeOver * 10
        return gradeWhy || seamWhy
    }

    // Apply the promotion: split the trunk at P into two ordinary runs, replace the side run with
    // its departure, and register P as a node the rest of the system can see.
    _v2CommitPromotion(g, pieces, pr, c) {
        const { T, tKey, wk0, iP, P, pid, pKey, side, sideKey, nAtStart, nKey, built } = c
        if (!this._network.has(tKey)) { this._v2MergeSkipped('promote', `${pr.sideKey} trunk piece ${tKey} went stale`); return }
        const tL = T.polyCum.length - 1
        const kA = g.key(T.cellA), kB = g.key(T.cellB)
        const aKey = `g:${kA}:${pKey}`, bKey = `g:${pKey}:${kB}`
        this._network.delete(tKey)
        this._network.set(aKey, this._v2SliceRun(T, 0, iP, T.cellA, pid))
        this._network.set(bKey, this._v2SliceRun(T, iP, tL, pid, T.cellB))
        // The side road: same run, new start. Its key names P instead of the shared node.
        const farKey = nAtStart ? g.key(side.cellB) : g.key(side.cellA)
        const newSideKey = nAtStart ? `g:${pKey}:${farKey}` : `g:${farKey}:${pKey}`
        this._network.delete(sideKey)   // mid-span: harmless on the second half, the entry is captured
        this._network.set(newSideKey, {
            points: built.pts, arcOrigin: 0, centerline: built.centerline,
            polyCum: built.polyCum, clArc: built.clArc,
            cellA: nAtStart ? pid : side.cellA, cellB: nAtStart ? side.cellB : pid,
            tunnelSpans: built.tunnelSpans, offCurveSpans: built.offCurveSpans,
            condemned: side.condemned, rerouted: side.rerouted,
        })
        // The pad plane at P rides the trunk's own longitudinal grade, so the through road keeps its
        // slope straight through the junction instead of being levelled onto a plaza. Which leg is
        // the through road is NOT recorded here — _v2PromotedRole derives it from the built tangents,
        // because a later promotion can split one of these runs again and a stored key would rot.
        this._promoted.set(pKey, {
            id: pid, pos: new THREE.Vector3(P.x, P.y, P.z),
            gx: c.grade.gx, gz: c.grade.gz,
        })
        // The side edge no longer STARTS at the shared node — directed, because its far end still
        // has the road arriving. _graphDegreeOf subtracts these so a node that is now a two-leg
        // bend stops being treated as a three-way junction.
        // A mid-span cut takes no leg off any node — both original endpoints survive on the two
        // halves — so only a node-anchored promotion has an edge to subtract.
        // Keyed on the GRAPH edge this side road was planned as — pr.sideKey spells its two graph
        // nodes — because _graphDegreeOf walks graph neighbours, and the piece's own far cell may
        // be a promoted vertex when the side road was split as another T's trunk (BUG-61).
        if (nKey) { const ends = pr.sideKey.slice(2).split(':'); this._promotedAway.add(nKey + '|' + (ends[0] === nKey ? ends[1] : ends[0])) }
        // The pieces table: this piece is replaced by its departure; any OTHER piece of the same
        // side road (a split, or a mid-span's other half) stays listed.
        pieces.set(pr.sideKey, [...(pieces.get(pr.sideKey) || []).filter((k) => k !== sideKey), newSideKey])
        pieces.set(wk0, [...(pieces.get(wk0) || [wk0]).filter((k) => k !== tKey), aKey, bKey])
    }

    // Both ends of a mid-span promotion, applied together: the trunk is cut at BOTH departure
    // points into three ordinary runs, and the side road becomes its two surviving halves. Doing
    // this as two independent commits is wrong — see the caller.
    _v2CommitMidSpan(g, pieces, pr, plans) {
        const ps = plans.slice().sort((a, b) => a.iP - b.iP)
        const T = ps[0].T, tKey = ps[0].tKey
        const tEnd = T.polyCum.length - 1
        const kA = g.key(T.cellA), kB = g.key(T.cellB)
        const k1 = ps[0].pKey, k2 = ps[1].pKey
        this._network.delete(tKey)
        const cuts = [
            [`g:${kA}:${k1}`, 0, ps[0].iP, T.cellA, ps[0].pid],
            [`g:${k1}:${k2}`, ps[0].iP, ps[1].iP, ps[0].pid, ps[1].pid],
            [`g:${k2}:${kB}`, ps[1].iP, tEnd, ps[1].pid, T.cellB],
        ]
        for (const [key, i0, i1, cA, cB] of cuts) this._network.set(key, this._v2SliceRun(T, i0, i1, cA, cB))
        pieces.set(ps[0].wk0, [...(pieces.get(ps[0].wk0) || [tKey]).filter((k) => k !== tKey), ...cuts.map((c) => c[0])])
        const side = ps[0].side
        this._network.delete(ps[0].sideKey)
        const halves = []
        for (const c of ps) {
            const farKey = c.nAtStart ? g.key(side.cellB) : g.key(side.cellA)
            const key = c.nAtStart ? `g:${c.pKey}:${farKey}` : `g:${farKey}:${c.pKey}`
            this._network.set(key, {
                points: c.built.pts, arcOrigin: 0, centerline: c.built.centerline,
                polyCum: c.built.polyCum, clArc: c.built.clArc,
                cellA: c.nAtStart ? c.pid : side.cellA, cellB: c.nAtStart ? side.cellB : c.pid,
                tunnelSpans: c.built.tunnelSpans, offCurveSpans: c.built.offCurveSpans,
                condemned: side.condemned, rerouted: side.rerouted,
            })
            halves.push(key)
            this._promoted.set(c.pKey, {
                id: c.pid, pos: new THREE.Vector3(c.P.x, c.P.y, c.P.z),
                gx: c.grade.gx, gz: c.grade.gz,
            })
        }
        pieces.set(pr.sideKey, halves)
    }

    // One half of a split trunk, as an ORDINARY run: exact sub-centerline (constant-curvature
    // primitives cut exactly), the same vertices, arc tables re-based to start at zero. Nothing is
    // re-routed and nothing is re-graded — the through road does not move.
    _v2SliceRun(T, i0, i1, cellA, cellB) {
        const n = i1 - i0 + 1
        const pts = new Array(n)
        const clArc = new Float64Array(n)
        const polyCum = new Float64Array(n)
        const c0 = T.clArc[i0], p0 = T.polyCum[i0]
        for (let i = 0; i < n; i++) {
            pts[i] = T.points[i0 + i].clone()
            clArc[i] = T.clArc[i0 + i] - c0
            polyCum[i] = T.polyCum[i0 + i] - p0
        }
        const clip = (spans, off, lim) => spans
            ? spans.map((s) => ({ s0: Math.max(0, s.s0 - off), s1: Math.min(lim, s.s1 - off) }))
                   .filter((s) => s.s1 - s.s0 > 1e-6)
            : undefined
        const out = {
            points: pts, arcOrigin: 0,
            centerline: T.centerline.slice(c0, T.clArc[i1]),
            polyCum, clArc, cellA, cellB,
            tunnelSpans: clip(T.tunnelSpans, c0, clArc[n - 1]),
        }
        const off = clip(T.offCurveSpans, p0, polyCum[n - 1])
        if (off && off.length) out.offCurveSpans = off
        if (T.condemned) out.condemned = true
        if (T.rerouted) out.rerouted = true
        return out
    }

    _assembleGraphEdges(mx0, mx1, mz0, mz1) {
        const _mband = this._params?.roadMergeBand ?? 24, _mband2 = _mband * _mband
        // in-band test is by WORLD extent now (site ids live on a different grid than the macro band).
        const wx0 = mx0 * PROTO_ANCHOR_SPACING, wx1 = (mx1 + 1) * PROTO_ANCHOR_SPACING
        const wz0 = mz0 * PROTO_ANCHOR_SPACING, wz1 = (mz1 + 1) * PROTO_ANCHOR_SPACING
        const inBand = (c) => { const p = this._nodePos(c); return p.x >= wx0 && p.x < wx1 && p.z >= wz0 && p.z < wz1 }
        const g = this._buildUrquhart(mx0, mx1, mz0, mz1)
        // QUAL-21 Stage 2: the degree pass is pure topology, so its drops apply HERE — before any
        // routing — instead of inside _cullNetwork after every edge already paid its route search.
        // Doomed edges never register AND never route; g.adj is updated for every dropped pair the
        // streaming graph can see (junction degrees agree with what wide windows build — the old
        // pass's unregistered-edge branch). _cullNetwork's ring + the warm paths apply the same
        // memoized decisions, and _nodeThroughPairs pairs over this settled adjacency.
        const { drop, wide } = this._degreeDrops(mx0, mx1, mz0, mz1)
        for (const [c1, c2] of g.edges) {
            if (drop.has(g.key(c1) + '|' + g.key(c2))) {
                g.adj.get(g.key(c1))?.delete(g.key(c2)); g.adj.get(g.key(c2))?.delete(g.key(c1))
            }
        }
        // R4: settle the crossing-rung delete set FIRST (plan pass 1, graph-degree pins). If any
        // deletion flips a node's pin class, everything re-plans on built-degree pins (pass 2:
        // _planRev bumps, plan memos lazily invalidate, delete verdicts stay frozen).
        this._v2PlanTag = null
        if (this._v2SettleDeletions(g, drop, wide, mx0, mx1, mz0, mz1))
            this._v2PlanTag = { rev: this._networkRev, tag: this._networkRev + 0.5 }
        // BUG-55: the pair census, on the settled adjacency (dirs sampled here must match what
        // registration builds). Phase 1: measures + counts the disjoint class; resolution follows.
        this._v2PairCensus(mx0, mx1, mz0, mz1, g, drop, wide)
        this._proto.nodeInc.clear()
        this._promoted = new Map()
        this._promotedAway = new Set()
        this._promotedRoleMemo = null
        const addInc = (idKey, runKey) => { const a = this._proto.nodeInc.get(idKey) || this._proto.nodeInc.set(idKey, []).get(idKey); a.push(runKey) }
        const promos = []
        for (const [c1, c2] of g.edges) {
            if (drop.has(g.key(c1) + '|' + g.key(c2))) continue   // degree-capped: settled spec-time, never routed
            if (!inBand(c1) && !inBand(c2)) continue   // fully-margin edge: not registered (frontier, like rows pad)
            const A = this._nodePos(c1), B = this._nodePos(c2)
            { const ex = A.x - B.x, ez = A.z - B.z; if (ex * ex + ez * ez <= _mband2) continue }   // degenerate (coincident) edge
            // BUG-55 phase 5: the delete rung — a tear-grade pair past the merge ladder loses
            // its longer member when its endpoints reconnect without leaning on any other
            // possible victim (_v2DeleteFor). A deleted edge never builds a centerline and never
            // registers; g.adj stays untouched (see the method header for why).
            if (this._v2DeleteFor(g, drop, wide, c1, c2)) continue
            const key = `g:${g.key(c1)}:${g.key(c2)}`
            const cl = this._edgeCenterline(c1, c2, this._v2EdgeDirs(g, drop, g.key(c1), g.key(c2)))
            if (!cl || cl.length < 1e-6) continue
            // BUG-53: conflicting pairs MERGE — the loser adopts the winner's course node→fork,
            // then tapers back onto its own. BUG-55: a winner registers through its bundle when
            // one negotiated, and an edge with no node-merge role checks the DISJOINT planner
            // (shape E) before registering plain.
            // BUG-55: a spec whose WINNER is deleted never applies — the loser registers on
            // its own line (the conflict died with the winner). Window-invariant: the winner's
            // verdict is winner-local, so every window drops the identical specs; acyclic:
            // _v2DeleteFor never consults other edges' delete verdicts.
            const alive = (spec) => !this._v2DeleteFor(g, drop, wide, spec.winner[0], spec.winner[1])
            const merge = (this._v2MergeFor(g, drop, c1, c2) || []).filter(alive)
            if (merge.length) {
                // FEAT-76: the side road registers PLAIN, full length, on its OWN line — no ceded
                // strand, no taper band. _v2PromoteTs (after this loop, once every route is
                // registered) trims it back to the fork and re-keys it onto a node ON the trunk.
                this._registerRun(key, cl, c1, c2)
                for (const spec of merge) promos.push({ sideKey: key, spec })
            }
            else {
                // QUAL-30: a DISJOINT pair (BUG-55 shape E — two runs sharing no node yet carving
                // the same dirt) resolves through the SAME T promotion as everything else. Its spec
                // is already the mid-span shape _v2PromoteMidSpan consumes, and that path never
                // reads a shared node — it works off spec.winner and the variants' wIn/wOut/lIn/lOut
                // alone — so a disjoint pair promotes to two Ts with no machinery of its own. This
                // is what retires _v2RegisterMidSpan, and with it _v2RegisterMerged.
                const dj = (this._v2DisjointFor(g, drop, wide, c1, c2) || []).filter(alive)
                if (dj.length) {
                    this._registerRun(key, cl, c1, c2)
                    promos.push({ sideKey: key, spec: dj[0] })
                }
                else {
                    // BUG-57 rung: a nick-crossed run with no merge-family role registers SHOVED —
                    // deflected clear of its crossing partners (_v2ShoveFor; plan-layer pure).
                    const shove = this._v2ShoveFor(g, drop, wide, c1, c2)
                    if (shove) this._v2RegisterShoved(key, cl, c1, c2, shove, g, drop)
                    else this._registerRun(key, cl, c1, c2)
                }
            }
        }
        // FEAT-76: promote every planned wye to a T. Assembly-layer only — see _v2PromoteTs.
        this._v2PromoteTs(g, drop, promos)
        // Node incidence is derived from the REGISTERED network, AFTER promotion: a T changes both
        // the run keys along its trunk and which node the side road starts from, and every consumer
        // of nodeInc (pad planes, strands, leaf tapers) has to see the roads that exist.
        for (const [runKey, e] of this._network) {
            if (!e.cellA || !e.cellB) continue
            addInc(g.key(e.cellA), runKey); addInc(g.key(e.cellB), runKey)
        }
    }

    /**
     * Sample a centerline into a network run: polyline at PROTO_SAMPLE_DS, design-graded, tunnel-passed,
     * with the arc tables the queries read. Factored out of _assembleGraphEdges so the QUAL-24 deg-2
     * chain merge can register a MERGED centerline through exactly the same path — a merged run must be
     * built the same way an ordinary one is, or it would not be ordinary road.
     */
    _registerRun(key, cl, cellA, cellB) {
        const sample = (curve) => {
            const n = Math.max(1, Math.ceil(curve.length / PROTO_SAMPLE_DS))
            const pts = new Array(n + 1)
            const clArc = new Float64Array(n + 1)
            for (let i = 0; i <= n; i++) {
                const s = curve.length * i / n
                clArc[i] = s
                const p = curve.pointAt(s)
                pts[i] = new THREE.Vector3(p.x, this._coarseH(p.x, p.z), p.z)
            }
            return { n, pts, clArc }
        }
        let { n, pts, clArc } = sample(cl)
        // FEAT-68 (v2): exact profile solve replaces design-grading + the FEAT-40 tunnel pass.
        // Bore stretches come back as FEAT-40-shaped spans (carve-skip + lining + collider through
        // the existing machinery). QUAL-27: bridges are gone from the vocabulary entirely.
        // QUAL-30: the BUG-55 bundled-winner branch is gone with _v2BundleSolve. A bundle existed
        // to bend a winner's profile so the fork DECKS its losers pinned to would agree — and under
        // the T there are no fork decks: the side road pins to the trunk's existing deck at P and
        // the trunk is not asked to move for it. Keeping the bundle would have gone on bending
        // through roads for forks that no longer exist, against FEAT-76's own ruling.
        let tunnelSpans, rerouted = false, condemned = false
        {
            const inf0 = this._v2Infeasible || 0
            tunnelSpans = this._v2GradePts(pts, clArc)
            if ((this._v2Infeasible || 0) > inf0) {
                // ── BUG-56 WORKSTREAM C — NEVER DRAPE ────────────────────────────────────────
                // The ladder above failed at every rung including the ceiling, so _v2GradePts fell
                // back to raw terrain height with 60 m end blends and NO grade bound whatsoever.
                // That drape is where every headline grade number came from: measured 2026-08-27,
                // four edges across the battery reached this line and one of them (g:8,1,0:9,1,0 on
                // seed 6) climbs 62 m in 85 m of arc — 108 %, in a world whose worst SOLVED road is
                // 38 %. Nothing was designed there and nobody checked the result.
                //
                // The failure is the CORRIDOR, not the cap: the profile solver was handed a plan
                // view that forces more climb than any legal profile can absorb. So re-plan it —
                // same search, same field, wGrade priced hard so the corridor buys length instead
                // of pitch — and solve on the new line through the ordinary ladder.
                for (const mult of HARD_GRADE_RUNGS) {
                    const alt = this._edgeCenterline(cellA, cellB, cl._v2DirsSpec, mult)
                    if (!alt || !(alt.length > 1e-6)) continue
                    const s2 = sample(alt)
                    const inf1 = this._v2Infeasible || 0
                    const ts2 = this._v2GradePts(s2.pts, s2.clArc)
                    if ((this._v2Infeasible || 0) > inf1) { this._v2Infeasible = inf1; continue }
                    cl = alt; n = s2.n; pts = s2.pts; clArc = s2.clArc; tunnelSpans = ts2
                    rerouted = true
                    this._v2Reroutes = (this._v2Reroutes || 0) + 1
                    break
                }
                this._v2Infeasible = inf0 + (rerouted ? 0 : 1)   // one tick per EDGE, not per try
                if (!rerouted) {
                    // CONDEMNED — not deleted. A drape is evidence the edge was LOAD-BEARING (owner,
                    // 2026-08-27): it only drapes because nothing solved on that corridor, so cutting
                    // it is an improvement only if something else still connects the two nodes. The
                    // run therefore SHIPS, drape and all, carrying a mark. Story mode reads that mark
                    // at run start and advances the seed; free roam keeps the road and the mark, so
                    // the bad stretch is counted and surfaced rather than silently normal.
                    condemned = true
                    this._v2Condemned = (this._v2Condemned || 0) + 1
                    ;(this._v2CondemnedKeys ||= []).push(key)
                }
            }
        }
        const polyCum = new Float64Array(n + 1)
        for (let i = 1; i <= n; i++) polyCum[i] = polyCum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
        const entry = { points: pts, arcOrigin: 0, centerline: cl, polyCum, clArc, cellA, cellB, tunnelSpans }
        if (rerouted) entry.rerouted = true
        if (condemned) entry.condemned = true
        this._network.set(key, entry)
        return pts
    }

    // BUG-57 rung: register a SHOVED run — the pure sample with _v2ShoveFor's lateral deflection
    // applied, profiled through the ordinary ladder. offCurveSpans mark the deflected stretches
    // (points off the primitive centerline: the ribbon sweeps from points and the analytic
    // refine stays off them — the taper-band convention), each owned by the partner it clears,
    // so the censuses and the (j) clearance gate read the residual proximity as intended.
    _v2RegisterShoved(key, cl, cellA, cellB, plan, g, drop) {
        const n = Math.max(1, Math.ceil(cl.length / PROTO_SAMPLE_DS))
        if (plan.pts.length !== n + 1) { this._registerRun(key, cl, cellA, cellB); return }
        const pts = new Array(n + 1)
        const clArc = new Float64Array(n + 1)
        for (let i = 0; i <= n; i++) {
            clArc[i] = cl.length * i / n
            pts[i] = new THREE.Vector3(plan.pts[i].x, this._coarseH(plan.pts[i].x, plan.pts[i].z), plan.pts[i].z)
        }
        // BUG-56 C: a shove whose deflected line cannot be profiled declines to the plain path, which
        // owns the never-drape ladder (re-route, then condemn). Deflecting is a preference; shipping
        // a run nobody graded is not an option, and re-routing a shoved line is meaningless anyway —
        // the deflection is defined against a corridor the re-route would replace.
        const inf0 = this._v2Infeasible || 0
        const tunnelSpans = this._v2GradePts(pts, clArc)
        if ((this._v2Infeasible || 0) > inf0) {
            this._v2Infeasible = inf0
            this._v2MergeSkipped('shove', `${key}: deflected profile infeasible`)
            this._registerRun(key, cl, cellA, cellB)
            return
        }
        const polyCum = new Float64Array(n + 1)
        for (let i = 1; i <= n; i++) polyCum[i] = polyCum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
        const offCurveSpans = plan.idxSpans.map(([i0, i1, owner]) => ({ s0: polyCum[i0], s1: polyCum[i1], owner }))
        this._network.set(key, { points: pts, arcOrigin: 0, centerline: cl, polyCum, clArc, cellA, cellB,
                                 tunnelSpans, offCurveSpans })
        this._v2Shoves = (this._v2Shoves || 0) + 1
    }

    // FEAT-68 (2026-08-19): the QUAL-24 deg-2 chain-merge machinery (_mergeDeg2Chains,
    // _deg2Chains, _mergeChainCenterline, the chainEdgeSpans/chainMembers views) is DELETED.
    // Its load-bearing half — grade agreement at deg-2 joints — is by construction now (every
    // edge pins its ends to _v2NodeHeight); its geometric half — tangent joints — is now the
    // router's own job (canonical approach headings at deg-2 nodes, computed from the settled
    // degree-capped adjacency and enforced as first/last-step direction constraints in the 2.5D
    // corridor search). Runs stay 1:1 with graph edges, which every consumer already assumes.

    // ── Canonical network builder (D-08) ────────────────────────────────────────
    /**
     * Build the canonical valley-trunk network around `center` into this._network — the
     * single source of truth for slicing (08-06), viz (08-07), and queries. Pure data:
     * allocates NO scene lines and applies NO visual y-lift (those are render-only, 08-07);
     * the network y is the raw routed height.
     *
     * Pipeline (FEAT-13 v2): over the streamed macro-cell window, each URQUHART edge between two
     * blue-noise site ids is ONE run keyed "g:<idA>:<idB>" — a pure function of the site pair,
     * band-independent → window-invariant by construction (no COVER overlap split, no loop-removal, no
     * owner-ratio origin). Each edge is graded standalone; shared nodes are reconciled by the junction
     * blend. Each run is stored as this._network["g:<idA>:<idB>"] = { points, arcOrigin:0, centerline,
     * polyCum, clArc, cellA, cellB }, where `centerline` is the edge's exact curvature-bounded primitive
     * curve the ribbon samples and cellA/cellB are its two site ids.
     *
     * Lazy streaming: honors PROTO_REGEN_MOVE move-threshold, the dirty flag, and
     * PROTO_PARAM_DEBOUNCE slider-settle gating. On a real re-stream this._network is cleared
     * and rebuilt; the cache is bounded for endless play. Pure function of
     * (worldSeed, center, params) → identical inputs yield identical polylines.
     *
     * @param {THREE.Vector3} center — stream center (same as terrain stream center)
     * @returns {Map<string, {points: THREE.Vector3[]}>} this._network (also stored on the instance)
     */
    _streamNetwork(center, allowDefer = false) {
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

        // ── PERF-30: stale-until-replaced ────────────────────────────────────────
        // A real rebuild is about to start. On the per-frame path with a network Worker wired and
        // a warm network to keep serving, hand the build to the Worker instead and return the OLD
        // network untouched — geometry, slices, profiles and rev-keyed caches all stay coherent
        // with each other while the replacement builds off-thread; adoptNetwork() swaps atomically
        // when the reply lands (the map's warm-restream pattern, promoted to play). The client
        // dedupes repeat dispatches while one is in flight. A COLD network (size 0) still builds
        // synchronously: nothing coherent exists to keep serving, and the cold flows (spawn
        // resolve, story entry) run behind the loading screen via the client's awaited build.
        if (allowDefer && this._networkDispatch && this._network.size > 0) {
            this._networkDispatch({ x: center.x, z: center.z, radius: this._proto.radius, reason: 'move' })
            return this._network
        }

        this._networkCenter = center.clone()
        this._proto.lastCenter = center.clone()
        this._proto.dirty = false
        this._lastBandSig = bandSig
        // PERF-31 W2.2: a rebuild the caller just PRE-WARMED for exactly this window (the
        // network worker's serialized warm→build) already took its rev bump and CR-02 bounds at
        // beginPrewarmedBuild() — skip both here so the warm's rev-keyed pass-1 plan memos and
        // route cache carry into this build instead of being re-derived/evicted.
        if (this._prewarmCarry) this._prewarmCarry = false
        else {
            this._networkRev++   // real rebuild → invalidate per-run profile/adjacency caches (lazy)
            // Refresh live D-09 weights from this._params (debug sliders mutate it in place) so this
            // re-stream uses the current slider values — deterministic re-route (D-03).
            // Bound the proto caches BEFORE building (CR-02). anchors/cls are pure functions of
            // coords, so a cache miss recomputes the identical value — evicting them is always benign.
            // Doing it pre-build (rather than post-build) makes the result independent of WHEN the
            // size threshold trips, preserving the module's purity contract (a network is a pure
            // function of seed+center+params, caches are memoization only).
            if (this._proto.anchors.size > 4000) { this._proto.anchors.clear(); this._proto.mergedAnchors.clear() }
            if (this._proto.cls && this._proto.cls.size > 1500) this._proto.cls.clear()
        }
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
        this._junctionsRev = -1

        // Per-run profile caches (runProfile/camberProfile) and the run-adjacency cache are keyed by
        // this._networkRev (bumped just above), so this real rebuild lazily invalidates them — no eager
        // clear needed (replaces the old BUG-14 clear-on-restream band-aid). With owner-anchored arc
        // origins (D-16 Phase 2) the arcS↔gradeY domain is window-invariant, so the only thing a real
        // rebuild changes is run EXTENT at the frontier; the rev bump re-derives those lazily.
        this._designGradeCache = new WeakMap()

        // ── Graph edge assembly (FEAT-13 v2) ─────────────────────────────────────
        // Build the URQUHART network into this._network: each undirected edge is routed once (canonical
        // key), sampled, graded STANDALONE, and registered with cellA/cellB = blue-noise site ids.
        // Window-invariant BY CONSTRUCTION — the Delaunay of a fixed point set is unique and the
        // band+margin neighbourhood makes interior edges center-independent (no COVER split, no owner-
        // ratio threshold, no loop/self-crossing removal). Each run carries its edge's EXACT primitive
        // centerline (radius ≥ hardR by construction) so the ribbon/carve sample it directly (the BUG-12
        // fold fix), never a Catmull-Rom re-fit. Consumers read cellA/cellB, never a parsed runKey.
        this._assembleGraphEdges(mx0, mx1, mz0, mz1)

        // FEAT-07 Step 2: run the crossing classifier now (bounded + cached) so _crossingsByRun is
        // populated BEFORE any run profile is built — the AT_GRADE mid-span flatten in _buildRunProfile/
        // _buildCamberProfile reads that index. Once per real re-stream; lazy callers (mesh footprints,
        // crossingList()) then hit the identity-guard cache. Within rendered/loaded tiles both crossing
        // strands are always fully in-band (region runsets are identical across centers — the
        // RUNKEY-SET-INVARIANT guarantee), so the flatten is window-invariant where it is consumed; a
        // frontier crossing's short ramp (roadJunctionBlendLength) never reaches loaded geometry.
        this._detectJunctions()
        // FEAT-13 + QUAL-14 Part B: safe-prune redundant crossing strands (at-grade intersections read as
        // ugly; the graph is planar-abstract so a routed cross = a redundant excursion) and residual
        // sub-footprint hugs corridor avoidance couldn't prevent. Connectivity-preserving (bounded detour
        // test) + window-invariant (BUG-25: both passes decide over the one-ring candidate universe —
        // see _cullNetwork). Re-detect on the culled network so _crossingsByRun / the flatten reflect
        // the survivors.
        // (Degree-cap drops are applied inside _assembleGraphEdges — spec-time, pre-routing.
        // The routed-geometry culls are DELETED — see the FEAT-68 tombstone at the old site.)

        // QUAL-24: splice degree-2 chains into single runs. AFTER the cull on purpose — deg-2 sites are
        // largely cull-CREATED (a 3-way node whose third strand was pruned), and the cull, the crossing
        // classifier, the map and POI placement all reason about a run as a graph EDGE. Merging earlier
        // changed that unit under them. Re-detect: the merge deletes and re-registers runs, so any
        // crossing index cached at this rev now names runKeys that no longer exist.
        {
            const wx0 = mx0 * PROTO_ANCHOR_SPACING, wx1 = (mx1 + 1) * PROTO_ANCHOR_SPACING
            const wz0 = mz0 * PROTO_ANCHOR_SPACING, wz1 = (mz1 + 1) * PROTO_ANCHOR_SPACING
            const inBand = (c) => { const p = this._nodePos(c); return p.x >= wx0 && p.x < wx1 && p.z >= wz0 && p.z < wz1 }
            // (FEAT-68: deg-2 chain merge DELETED — see the tombstone at the old methods.)
        }

        // FEAT-40: crossings are only known now — a bore span may not contain an AT_GRADE crossing
        // (every crossing reconciles both strands to one Y with no ΔY gate, which would ramp a
        // surface road 30 m down into a bore). Clip bores clear of each crossing; the road there
        // reverts to an open cut and the normal junction reconciliation applies. The chord profile
        // itself stays — only the bore treatment (carve-skip/physics split/tube mesh) is withdrawn.
        this._clipTunnelSpansAtCrossings()

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

            // QUAL-30: the ceded-hole slicer is gone with cededSpans. A wye's loser carried the
            // winner's vertices verbatim over the ceded interval, so slicing it shipped a duplicate
            // ribbon that z-fought the winner's — hence a list of kept ranges rather than one
            // window. The T promotion removes the loser's geometry there outright, so every
            // registered run is a single unbroken window again.
            const keep = [[0, points.length - 1]]

            // Walk the polyline, cutting at every x/z integer-multiple-of-S boundary crossing.
            // `current` accumulates the active sub-polyline; on a cut we push the boundary point to
            // BOTH the closing sub-polyline and the new one (shared C0 point).
            for (const [i0, i1] of keep) {
                if (i1 - i0 < 1) continue
                let current = [points[i0].clone()]
                // BUG-10 camber continuity: track cumulative XZ run arc-length so each slice records
                // the run-arc at its endpoints. XZ metric matches _buildCamberProfile's arcPos.
                // Without this, arcSOffset defaulted to 0 and camber sawtoothed back to the run start
                // at every tile seam.
                let runArcAtA = (entry.polyCum ? entry.polyCum[i0] : 0) - arcOrigin   // run-arc at points[i-1]
                let sliceStartArc = runArcAtA    // run-arc at current[0] (owner-origined)
                const flush = (sliceEndArc) => {
                    if (current.length >= 2) this._assignSlice(current, runKey, runWeight, sliceStartArc, sliceEndArc)
                    // start the next sub-polyline at the same boundary point we just closed on
                }
                for (let i = i0 + 1; i <= i1; i++) {
                    const a = points[i - 1], b = points[i]
                    const segLen = Math.hypot(b.x - a.x, b.z - a.z)  // XZ segment length (matches camber arcPos)
                    // Collect all boundary crossings along segment a→b, ordered by parametric t∈(0,1).
                    const crossings = []
                    this._collectCrossings(a.x, b.x, S, (t) => crossings.push(t))
                    this._collectCrossings(a.z, b.z, S, (t) => crossings.push(t))
                    crossings.sort((p2, q) => p2 - q)
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
                flush(runArcAtA)  // trailing slice of this range
            }
        }

        this._slicedFrom = this._network
        return this._tiles
    }

    // ── Crossing classifier (FEAT-07/11/13 foundation) ────────────────────────────
    /**
     * Find every inter-run AND self-run XZ crossing in this._network and CLASSIFY each by crossing
     * angle. This is the spine the at-grade pad (FEAT-07), tunnel (FEAT-11) and N-S graph (FEAT-13)
     * steps consume. Every crossing merges FLAT (at grade) — dynamic overpasses were descoped: roads
     * in the woods meet at grade, never float one over another.
     *
     * BROAD PHASE (Design D — kills the old O(runs²×seg²) rescan that cost a 296 ms Ultra stall):
     * bucket every run's segments into CHUNK_SIZE world tiles, then run the narrow-phase seg×seg test
     * ONLY on pairs sharing a bucket. Near-linear in segment count. Run once per build (identity guard).
     *
     * Two outputs, both rebuilt together:
     *   - this._junctions — Map nodeKey "<round x>,<round z>" → { pos, legs, nodeY, simpleMerge, kind,
     *       angle, records } (legs/pos/nodeY/simpleMerge preserved for the road-mesh footprint consumer;
     *       the rest is the classification for later steps).
     *   - this._crossingList — flat per-crossing records (see _recordCrossing); the canonical classifier
     *       output, read via crossingList().
     *
     * CLASSIFICATION (pure fn of the crossing + params):
     *   NEAR_PARALLEL  angle < roadCrossAngleMin  — glancing/duplicate graze, not a junction (box merge).
     *   AT_GRADE       otherwise                  — flatten both strands to one shared pad.
     *
     * Pure function of this._network — deterministic + window-invariant by transitivity (D-16). The
     * SET of crossings over a fixed interior region is identical across stream centers because the runs
     * covering that region are themselves window-invariant (the RUNKEY-SET-INVARIANT guarantee asserted
     * by invariance.mjs); frontier runs differ between centers, so callers compare within a common
     * region (as invariance.mjs / the classifier gate do).
     *
     * @returns {Map<string, object>} this._junctions
     */
    _detectJunctions() {
        // Revision guard: re-detecting the same network is a no-op (this._crossingList stays valid too).
        //
        // PERF (FEAT-43): this guard USED to be `_junctionsFrom === _network && _junctions.size > 0`.
        // The size clause made the memo unreachable in graph mode, where an EMPTY crossing set is the
        // correct and universal answer (QUAL-12: the graph is the sole topology, so mid-span crossings
        // are culled and `_junctions` is legitimately empty). "Empty" was indistinguishable from
        // "not computed", so every caller re-ran the full O(runs × segs) broad+narrow phase.
        // RoadMeshSystem._buildRoadTile calls this on EVERY ribbon tile build, so the cost landed as a
        // per-tile hitch that scales with network size: measured 22 ms/call at the 320 m play radius and
        // 91 ms/call at story mode's 2800 m region radius (node; the browser saw ~4 ms vs ~42 ms per
        // ribbon tile). Keying on _networkRev — the same key every other cache here uses — makes it a
        // real memo: computed once per network revision, in BOTH modes.
        if (this._junctionsRev === this._networkRev) {
            return this._junctions
        }

        this._junctions.clear()
        this._crossingList = []
        this._crossingsByRun = new Map()

        const p = this._params || {}
        const angleMin = p.roadCrossAngleMin ?? 12

        // ── Broad phase: bucket every run segment into the CHUNK_SIZE tiles its AABB touches. ──
        // Each seg record carries what the narrow phase + classifier need: world endpoints, endpoint Ys,
        // run-local XZ arc (via polyCum), and parsed (mz,mx) for the deterministic over/under order.
        const buckets = new Map()   // "tx,tz" → seg[]
        for (const [runKey, entry] of this._network) {
            const pts = entry.points
            if (!pts || pts.length < 2) continue
            const polyCum = entry.polyCum
            // (mx,mz) = the run's start CELL (netEntry.cellA) — the per-run identity for the deterministic
            // over/under order (FEAT-13: works for rows + graph; no runKey parsing).
            const mx = entry.cellA ? entry.cellA[0] : NaN, mz = entry.cellA ? entry.cellA[1] : NaN
            for (let i = 0; i < pts.length - 1; i++) {
                const x0 = pts[i].x, z0 = pts[i].z, x1 = pts[i + 1].x, z1 = pts[i + 1].z
                const seg = {
                    runKey, mz, mx, segIdx: i,
                    x0, z0, x1, z1, y0: pts[i].y, y1: pts[i + 1].y,
                    a0: polyCum ? polyCum[i] : i, a1: polyCum ? polyCum[i + 1] : i + 1,
                }
                const txLo = Math.floor(Math.min(x0, x1) / CHUNK_SIZE), txHi = Math.floor(Math.max(x0, x1) / CHUNK_SIZE)
                const tzLo = Math.floor(Math.min(z0, z1) / CHUNK_SIZE), tzHi = Math.floor(Math.max(z0, z1) / CHUNK_SIZE)
                for (let tx = txLo; tx <= txHi; tx++) {
                    for (let tz = tzLo; tz <= tzHi; tz++) {
                        const k = `${tx},${tz}`
                        let arr = buckets.get(k); if (!arr) { arr = []; buckets.set(k, arr) }
                        arr.push(seg)
                    }
                }
            }
        }

        // ── Narrow phase: seg×seg only within a shared bucket; dedup pairs (a seg spans ≥1 bucket). ──
        const seenPairs = new Set()
        for (const arr of buckets.values()) {
            for (let i = 0; i < arr.length - 1; i++) {
                const A = arr[i]
                for (let j = i + 1; j < arr.length; j++) {
                    const B = arr[j]
                    // Skip adjacent segments of the SAME run (they share an endpoint, not a real crossing).
                    if (A.runKey === B.runKey && Math.abs(A.segIdx - B.segIdx) <= 1) continue
                    // Canonical (S before T) so the same pair found via two buckets is tested once.
                    const aFirst = A.runKey < B.runKey || (A.runKey === B.runKey && A.segIdx < B.segIdx)
                    const S = aFirst ? A : B, T = aFirst ? B : A
                    const pk = `${S.runKey}#${S.segIdx}|${T.runKey}#${T.segIdx}`
                    if (seenPairs.has(pk)) continue
                    seenPairs.add(pk)
                    const ix = _segCrossParam(S.x0, S.z0, S.x1, S.z1, T.x0, T.z0, T.x1, T.z1)
                    if (!ix) continue
                    // Two legs of ONE node crossing inside that node's hold reach are the junction's
                    // own throat, not a mid-span crossing. The deck hold (_applyJunctionBlend) owns
                    // that ground; the AT_GRADE flatten this would register runs AFTER the hold,
                    // eases the leg toward a straight line through the crossing and kills the
                    // banking the hold just set — measured 2026-09-07 as the last roll residue in
                    // junction-stitch: seed 7 (-573,-428) (a side road wiggling across its trunk
                    // 35 m out), seed 6 (-890,2486) (two legs crossing 10 m out).
                    if (S.runKey !== T.runKey && this._legsOfOneNode(S, T, ix)) continue
                    this._recordCrossing(S, T, ix, angleMin)
                }
            }
        }

        // ── Post-process nodes for the road-mesh footprint consumer + the AT_GRADE flatten index. ──
        for (const node of this._junctions.values()) {
            if (node.legs.length > 4) node.simpleMerge = true   // 3+ roads meeting → box (T-09-07)
            // Sort legs CCW by bearing so fillet arcs connect adjacent legs in winding order.
            node.legs.sort((a, b) => Math.atan2(a.dir.x, a.dir.z) - Math.atan2(b.dir.x, b.dir.z))
            // Finalise nodeY = mean grade Y of every strand at the node (the pad + the flatten use it).
            if (node._yCount > 0) { node.nodeY = node._ySum / node._yCount; node.pos.y = node.nodeY }
            // FEAT-19: reconcile the strands of a node so they MEET at the crossing (no step) WITHOUT
            // flattening the through road's slope. Per crossing record, _addCrossingPair leaves the
            // THROUGH/crossbar strand on its grade and eases only the JOINING/upright strand onto the
            // through surface (height + local slope). EVERY crossing merges at grade (overpasses descoped),
            // so every node reconciles — including near-parallel grazes (which otherwise leave a collision
            // step where two overlapping strands sit at different Ys).
            for (const r of node.records) this._addCrossingPair(r)
        }

        this._junctionsRev = this._networkRev
        return this._junctions
    }

    // FEAT-19: classify a crossing record's two strands as THROUGH (interior arc, well away from its own
    // endpoints — the crossbar) vs JOINING (terminating near an endpoint — the upright), then register a
    // grade-LINE flatten for the JOINING strand only. The through strand keeps its gradeY untouched, so the
    // crossing follows the through road's slope instead of collapsing to a level pad. T-junction = one
    // through + one joining; X/4-way = both interior → the steeper is the dominant "through" surface and
    // the other matches it locally (can't preserve both unless they agree). Deterministic (interior test,
    // then steeper |slope|, then lower runKey) → window-invariant. The joining strand eases toward the
    // through strand's CONTACT Y so both still agree at the crossing (C0, no invisible step).
    _addCrossingPair(r) {
        const Rj = this._params?.roadJunctionBlendLength ?? 30
        const lenA = this._network.get(r.runA)?.polyCum?.at(-1) ?? 0
        const lenB = this._network.get(r.runB)?.polyCum?.at(-1) ?? 0
        const throughA = Math.min(r.arcA, lenA - r.arcA) >= Rj
        const throughB = Math.min(r.arcB, lenB - r.arcB) >= Rj
        let aDom
        if (throughA !== throughB) aDom = throughA   // T-junction: the interior (crossbar) strand dominates
        else {                                       // both interior (X) or both terminating: steeper wins
            const sa = Math.abs(r.mA), sb = Math.abs(r.mB)
            aDom = sa > sb || (sa === sb && r.runA <= r.runB)
        }
        if (aDom) {
            // A is through: ease B onto A's surface. slope = A's grade vector (mA·tA) projected onto B's
            // tangent → B lands tangent to the through surface at the contact (matches grade + local slope).
            const slope = r.mA * (r.tAx * r.tBx + r.tAz * r.tBz)
            this._addCrossingByRun(r.runB, r.arcB, r.yA, slope)
        } else {
            const slope = r.mB * (r.tBx * r.tAx + r.tBz * r.tAz)
            this._addCrossingByRun(r.runA, r.arcA, r.yB, slope)
        }
    }

    // Do runs S and T share an endpoint node, with this crossing within JN_HOLD_MAX_SURFACE of it
    // along either run? Pure fn of the two registered runs. See the call site.
    _legsOfOneNode(S, T, ix) {
        const eS = this._network.get(S.runKey), eT = this._network.get(T.runKey)
        if (!eS || !eT || !eS.cellA || !eT.cellA) return false
        const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
        let shared = null
        for (const c of [eS.cellA, eS.cellB]) if (same(c, eT.cellA) || same(c, eT.cellB)) { shared = c; break }
        if (!shared) return false
        const arcS = S.a0 + (S.a1 - S.a0) * ix.t, arcT = T.a0 + (T.a1 - T.a0) * ix.u
        const LS = eS.polyCum[eS.polyCum.length - 1], LT = eT.polyCum[eT.polyCum.length - 1]
        const dS = same(eS.cellA, shared) ? arcS : LS - arcS
        const dT = same(eT.cellA, shared) ? arcT : LT - arcT
        return Math.min(dS, dT) <= JN_HOLD_MAX_SURFACE
    }

    _addCrossingByRun(runKey, arc, nodeY, slope = 0) {
        let arr = this._crossingsByRun.get(runKey)
        if (!arr) { arr = []; this._crossingsByRun.set(runKey, arr) }
        arr.push({ arc, nodeY, slope })   // FEAT-19: nodeY = through-surface CONTACT Y; slope = dGradeY/dArc
    }

    /**
     * Classify one seg×seg crossing and fold it into this._crossingList + the node Map.
     * S/T are seg records (S canonical-first); ix is _segCrossParam's {x,z,t,u}. Pure fn of inputs.
     */
    _recordCrossing(S, T, ix, angleMin) {
        const yA = S.y0 + (S.y1 - S.y0) * ix.t
        const yB = T.y0 + (T.y1 - T.y0) * ix.u
        const arcA = S.a0 + (S.a1 - S.a0) * ix.t
        const arcB = T.a0 + (T.a1 - T.a0) * ix.u

        // Acute angle between the two segment directions.
        const v1x = S.x1 - S.x0, v1z = S.z1 - S.z0, v2x = T.x1 - T.x0, v2z = T.z1 - T.z0
        const l1 = Math.hypot(v1x, v1z) || 1, l2 = Math.hypot(v2x, v2z) || 1
        const dot = Math.abs((v1x * v2x + v1z * v2z) / (l1 * l2))
        const angle = Math.acos(Math.min(1, dot)) * (180 / Math.PI)

        const selfCrossing = S.runKey === T.runKey
        // Overpasses descoped: every crossing merges at grade. Angle only picks the pad style —
        // a shallow graze is a rectangular box merge, a real crossing gets a filleted pad.
        const kind = angle < angleMin ? 'NEAR_PARALLEL' : 'AT_GRADE'

        // FEAT-19: per-strand grade LINE at the crossing — unit XZ tangent (increasing-arc) + longitudinal
        // slope (dGradeY/dArc). The AT_GRADE flatten eases the JOINING strand toward the THROUGH strand's
        // surface (height + slope) instead of a flat scalar, so the through road keeps its grade (no level
        // pad). tA/mA describe strand S (runA), tB/mB strand T (runB). Pure fn of the seg endpoints.
        const tAx = v1x / l1, tAz = v1z / l1, tBx = v2x / l2, tBz = v2z / l2
        const mA = (S.a1 - S.a0) > 1e-9 ? (S.y1 - S.y0) / (S.a1 - S.a0) : 0
        const mB = (T.a1 - T.a0) > 1e-9 ? (T.y1 - T.y0) / (T.a1 - T.a0) : 0

        const posY = (yA + yB) * 0.5
        const record = {
            point: { x: ix.x, y: posY, z: ix.z },
            runA: S.runKey, segA: S.segIdx, arcA, yA, tAx, tAz, mA,
            runB: T.runKey, segB: T.segIdx, arcB, yB, tBx, tBz, mB,
            angle, selfCrossing, kind,
        }
        this._crossingList.push(record)

        // ── Aggregate into the node Map (road-mesh consumer reads pos/legs/nodeY/simpleMerge). ──
        const nodeKey = `${Math.round(ix.x)},${Math.round(ix.z)}`
        let node = this._junctions.get(nodeKey)
        if (!node) {
            node = {
                pos: new THREE.Vector3(ix.x, posY, ix.z), legs: [], nodeY: posY, simpleMerge: false,
                kind, angle, records: [], _ySum: 0, _yCount: 0,
            }
            this._junctions.set(nodeKey, node)
        }
        // nodeY = average grade Y of ALL strands meeting at this node (not just the first pair) — the mean
        // ROAD height, so a multi-road junction doesn't tip toward whichever crossing was found first.
        node._ySum += yA + yB; node._yCount += 2
        node.records.push(record)
        // A real crossing (AT_GRADE) upgrades the node off a near-parallel graze (box → filleted pad).
        if (kind === 'AT_GRADE' && node.kind === 'NEAR_PARALLEL') { node.kind = kind; node.angle = angle }

        // Legs: each strand contributes two, one each way from the crossing (dir = unit toward endpoint).
        const addLeg = (runKey, segIdx, toX, toZ) => {
            const dx = toX - ix.x, dz = toZ - ix.z
            const len = Math.hypot(dx, dz) || 1
            node.legs.push({ runKey, segIdx, dir: { x: dx / len, z: dz / len } })
        }
        addLeg(S.runKey, S.segIdx,     S.x1, S.z1)
        addLeg(S.runKey, S.segIdx + 1, S.x0, S.z0)
        addLeg(T.runKey, T.segIdx,     T.x1, T.z1)
        addLeg(T.runKey, T.segIdx + 1, T.x0, T.z0)
        if (kind === 'NEAR_PARALLEL') node.simpleMerge = true   // near-parallel → rectangular box (no fillet)
    }

    /**
     * The classifier's canonical output: a flat array of per-crossing classified records (rebuilt with
     * _detectJunctions). See _recordCrossing for the record shape. Pure fn of this._network.
     * @returns {Array<object>}
     */
    crossingList() {
        this._detectJunctions()
        return this._crossingList
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
     * @param {number} [avoidCum=-1] — FEAT-40 rival pass: when ≥ 0, candidates whose chord-cum lies
     *   within ±avoidSep of this value are SKIPPED, so the projection finds the run's next-nearest
     *   DISTINCT pass (self-overlap switchbacks). −1 = normal global-nearest behavior.
     * @param {number} [avoidSep=0]
     * @returns {{ fx,fz, tx,tz, arcS, signedLat, d2 } | null}
     */
    _projectOntoRun(netEntry, wx, wz, avoidCum = -1, avoidSep = 0) {
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
            const cumT = cum + t * segLen
            cum += segLen
            if (avoidCum >= 0 && Math.abs(cumT - avoidCum) < avoidSep) continue
            const fx = ax + t * ex, fz = az + t * ez
            const ddx = wx - fx, ddz = wz - fz
            const d2 = ddx * ddx + ddz * ddz
            if (d2 < bestD2) {
                bestD2 = d2; bestFx = fx; bestFz = fz
                bestTx = ex / segLen; bestTz = ez / segLen
                bestCum = cumT
                bestI = i; bestTclamp = t
            }
        }
        if (bestD2 === Infinity) return null
        // Terminus overshoot: nearest foot is the run's very first/last vertex AND the query lies
        // longitudinally BEYOND that end (not beside the ribbon). Such a point is off the end of THIS
        // run — its continuation run (junction neighbour) owns the surface there — so reject it rather
        // than carve a bogus endpoint height (the 40 m "topmost" artifact came from accepting these).
        const beforeD = -((wx - pts[0].x) * bestTx + (wz - pts[0].z) * bestTz)
        const afterD  =  ((wx - pts[N - 1].x) * bestTx + (wz - pts[N - 1].z) * bestTz)
        const overBefore = bestI === 0 && bestTclamp === 0 && beforeD > 0
        const overAfter  = bestI === N - 2 && bestTclamp === 1 && afterD > 0
        // overDist (BUG-40): the CONTINUOUS twin of offEnd — how far past this run's own terminus the
        // query lies, longitudinally, in metres (0 when the foot is a genuine in-extent foot). offEnd is
        // a boolean, and any consumer that has to fade a leg out smoothly (the deg-2 connector blend)
        // needs the distance, not the flag: switching on the flag injects exactly the C0 crease this
        // file spends _carveDirtY fighting. Free — both projections are already computed above.
        const overDist = overBefore ? beforeD : overAfter ? afterD : 0
        // sCL: centerline TRUE-arc at the projected foot — the window center for _resolveRoadSurface's
        // analytic refine. clArc[i] is the exact arc-length at polyline vertex i (see _assembleGraphEdges);
        // interpolate by the winning segment's clamped fraction. Falls back to chord-cum (≈ true-arc on
        // straights) if a run predates the analytic centerline (clArc absent).
        const clArc = netEntry.clArc
        let sCL = bestCum
        if (clArc && bestI + 1 < clArc.length) {
            sCL = clArc[bestI] + (clArc[bestI + 1] - clArc[bestI]) * bestTclamp
        }
        return {
            fx: bestFx, fz: bestFz, tx: bestTx, tz: bestTz,
            arcS: bestCum - arcOrigin,
            // signedLat sign convention matches _sampleCarveWorld: (query − foot) cross tangent.
            signedLat: (wx - bestFx) * bestTz - (wz - bestFz) * bestTx,
            d2: bestD2,
            offEnd: overBefore || overAfter,
            overDist,
            sCL
        }
    }

    /**
     * PERF-25: windowed twin of _projectOntoRun — identical per-segment maths, but only the cached
     * segment-index ranges of one cell candidate are scanned, and any result farther than the cell's
     * proof gate (√gate2) is dropped. Whenever this returns non-null the result is BIT-IDENTICAL to
     * the full _projectOntoRun (same argmin: see the proof at _resolveCellCands); a null means the
     * full scan's result would have been rejected by every acceptance gate downstream.
     * `cand` = { pts, ranges:[i0,i1,...], cum0:[cumAt(i0)...] } from _resolveCellCands.
     */
    _projectOntoRunRanges(netEntry, cand, wx, wz, avoidCum, avoidSep, gate2) {
        const pts = netEntry.points
        const N = pts ? pts.length : 0
        if (N < 2 || pts !== cand.pts) return this._projectOntoRun(netEntry, wx, wz, avoidCum, avoidSep) // stale guard
        const arcOrigin = netEntry.arcOrigin ?? 0
        let bestD2 = Infinity, bestFx = 0, bestFz = 0, bestTx = 1, bestTz = 0, bestCum = 0
        let bestI = 0, bestTclamp = 0
        // Flat segment table [ax,az,ex,ez,segLen,cumStart]×n — same coordinates, same sqrt, same
        // running-sum cum values as the full scan (built by one walk in _resolveCellCands), so every
        // arithmetic result below is bit-identical to _projectOntoRun's.
        const seg = cand.seg, segIdx = cand.segIdx, nSeg = segIdx.length
        for (let k = 0; k < nSeg; k++) {
            const o = k * 6
            const ax = seg[o], az = seg[o + 1], ex = seg[o + 2], ez = seg[o + 3]
            const segLen = seg[o + 4], cum = seg[o + 5]
            const segLen2 = ex * ex + ez * ez
            let t = segLen2 > 1e-12 ? ((wx - ax) * ex + (wz - az) * ez) / segLen2 : 0
            if (t < 0) t = 0; else if (t > 1) t = 1
            const cumT = cum + t * segLen
            if (avoidCum >= 0 && Math.abs(cumT - avoidCum) < avoidSep) continue
            const fx = ax + t * ex, fz = az + t * ez
            const ddx = wx - fx, ddz = wz - fz
            const d2 = ddx * ddx + ddz * ddz
            if (d2 < bestD2) {
                bestD2 = d2; bestFx = fx; bestFz = fz
                bestTx = ex / segLen; bestTz = ez / segLen
                bestCum = cumT
                bestI = segIdx[k]; bestTclamp = t
            }
        }
        if (bestD2 === Infinity || bestD2 > gate2) return null
        const beforeD = -((wx - pts[0].x) * bestTx + (wz - pts[0].z) * bestTz)
        const afterD  =  ((wx - pts[N - 1].x) * bestTx + (wz - pts[N - 1].z) * bestTz)
        const overBefore = bestI === 0 && bestTclamp === 0 && beforeD > 0
        const overAfter  = bestI === N - 2 && bestTclamp === 1 && afterD > 0
        const overDist = overBefore ? beforeD : overAfter ? afterD : 0   // see _projectOntoRun
        const clArc = netEntry.clArc
        let sCL = bestCum
        if (clArc && bestI + 1 < clArc.length) {
            sCL = clArc[bestI] + (clArc[bestI + 1] - clArc[bestI]) * bestTclamp
        }
        return {
            fx: bestFx, fz: bestFz, tx: bestTx, tz: bestTz,
            arcS: bestCum - arcOrigin,
            signedLat: (wx - bestFx) * bestTz - (wz - bestFz) * bestTx,
            d2: bestD2,
            offEnd: overBefore || overAfter,
            overDist,
            sCL
        }
    }

    /**
     * PERF-25: per-cell resolver candidates — the expensive intermediate of _resolveRoadSurface,
     * cached per (RESOLVE_CELL cell, _networkRev, footHW) and evaluated EXACTLY at each query.
     * For the cell containing (wx,wz), scan the same 3×3 tile block the full resolver scans (same
     * first-seen run order, so tie-breaks are preserved) and record, per run, the contiguous
     * segment-index ranges within rInc of the cell centre plus the chord-cum at each range start.
     *
     * BIT-IDENTITY PROOF (why windowed == full for every ACCEPTED candidate): let gate =
     * RESOLVE_ACC_SAFETY·footHW + 1 and rInc = gate + cellDiag/2. Every segment NOT in a window is
     * > rInc from the cell centre, hence > gate from any query in the cell. (1) If the windowed
     * best foot has d ≤ gate, the full scan's argmin (d ≤ windowed d ≤ gate) is inside a window, so
     * both scans see it → identical result, including tie order (ascending i over a superset member).
     * (2) If the windowed best has d > gate (or no window exists), the full argmin either equals it
     * or is excluded (d > gate either way) — and no candidate with d > gate is ever accepted
     * downstream (see RESOLVE_ACC_SAFETY), so dropping the run changes nothing. The offEnd flags,
     * sCL, and rival avoid-skip all ride the identical argmin. Queries with excludeKeys (FEAT-40
     * bore retries) bypass the cache and take the full scan.
     */
    _resolveCellCands(wx, wz, footHW) {
        const gate = RESOLVE_ACC_SAFETY * footHW + 1
        let cache = this._cellCands
        if (!cache || cache.rev !== this._networkRev || cache.gate !== gate) {
            cache = this._cellCands = { rev: this._networkRev, gate, map: new Map() }
        }
        const cellX = Math.floor(wx / RESOLVE_CELL), cellZ = Math.floor(wz / RESOLVE_CELL)
        const key = `${cellX},${cellZ}`
        let cell = cache.map.get(key)
        if (cell !== undefined) return cell
        const cx = (cellX + 0.5) * RESOLVE_CELL, cz = (cellZ + 0.5) * RESOLVE_CELL
        const rInc = gate + RESOLVE_CELL * Math.SQRT1_2   // + half the cell diagonal
        const rInc2 = rInc * rInc
        const qtx = Math.floor(wx / CHUNK_SIZE), qtz = Math.floor(wz / CHUNK_SIZE)
        const seen = new Set()
        const list = []
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const segs = this._tiles.get(`${qtx + dx},${qtz + dz}`)
                if (!segs) continue
                for (const s of segs) {
                    const runKey = s.runKey ?? ''
                    if (seen.has(runKey)) continue
                    seen.add(runKey)
                    const netEntry = this._network.get(runKey)
                    const pts = netEntry?.points
                    if (!pts || pts.length < 2) continue
                    // One full walk per run per cell (amortized over every query the cell serves):
                    // emit a flat table [ax,az,ex,ez,segLen,cumStart] per in-range segment (+ its global
                    // index for offEnd/sCL). segLen/cumStart come from the SAME sqrt + running sum the
                    // full scan computes, so windowed projections reproduce its floats exactly.
                    const flat = [], idx = []
                    let cum = 0
                    for (let i = 0; i < pts.length - 1; i++) {
                        const ax = pts[i].x, az = pts[i].z
                        const ex = pts[i + 1].x - ax, ez = pts[i + 1].z - az
                        const segLen2 = ex * ex + ez * ez
                        const segLen = Math.sqrt(segLen2) || 1e-8
                        let t = segLen2 > 1e-12 ? ((cx - ax) * ex + (cz - az) * ez) / segLen2 : 0
                        if (t < 0) t = 0; else if (t > 1) t = 1
                        const ddx = cx - (ax + t * ex), ddz = cz - (az + t * ez)
                        if (ddx * ddx + ddz * ddz <= rInc2) {
                            flat.push(ax, az, ex, ez, segLen, cum)
                            idx.push(i)
                        }
                        cum += segLen
                    }
                    if (idx.length) list.push({ runKey, pts, seg: Float64Array.from(flat), segIdx: Int32Array.from(idx) })
                }
            }
        }
        cell = list.length ? { list, gate2: gate * gate, byKey: new Map(list.map(c => [c.runKey, c])) } : null
        if (cache.map.size >= RESOLVE_CELL_CAP) cache.map.clear()
        cache.map.set(key, cell)
        return cell
    }

    /**
     * Nearest foot on a run's centerline polyline RESTRICTED to the arc window near a node endpoint
     * (`nodeArc` = 0 or the run length, in the polyCum domain; `win` metres each side). Used by the ruled
     * inter-leg blend (_carveDirtY): a full-run projection picks the globally nearest foot, which on a leg
     * that curves or loops back can JUMP a metre (bimodal minimum) or land hundreds of metres along the run
     * — sampling the leg's grade there tears the blended surface.
     *
     * The window ALONE cannot make the foot continuous: a leg can curve AROUND the gore inside 40 m
     * (min turn radius 8), holding TWO genuine distance-minima at once (seed-6 (132,−744): feet at
     * 0 m and 39.8 m along, grades 5.7 m apart, both limbs really are the adjacent road). An argmin
     * that picks ONE of them flips discontinuously as the query crosses the equidistance locus — a
     * >1 m lateral step in the blended gore (the MAX_LEG_SLOPE guard is too loose to catch a
     * plausibly-graded second limb). So this returns EVERY distance-local-minimum foot in the window
     * (deduped within 4 m of arc), and the caller blends each as its own pseudo-leg: with all limbs
     * contributing simultaneously there is no switch — each foot, gap, and grade varies continuously
     * with the query. Returns an array of { d2, arcS } (ordered along the leg) | null.
     */
    _projectLegNearNode(netEntry, wx, wz, nodeArc, win, legWin) {
        const pts = netEntry.points
        const N = pts ? pts.length : 0
        if (N < 2) return null
        const arcOrigin = netEntry.arcOrigin ?? 0
        // PERF-25: the in-window segment range [i0,i1] and the chord-cum at i0 depend only on
        // (netEntry, nodeArc, win) — the caller caches them per node leg (_legProjWin) so the march
        // below starts at the window instead of walking the whole run polyline to find it. Identical
        // segment sequence → identical local-minimum bookkeeping → identical feet.
        let i0 = 0, iEnd = N - 2, cum = 0
        if (legWin && legWin.pts === pts) {
            if (legWin.i0 > legWin.i1) return null
            i0 = legWin.i0; iEnd = legWin.i1; cum = legWin.cum0
        }
        const lo = nodeArc - win, hi = nodeArc + win
        // March the window's segments in order, tracking each segment's nearest foot; a foot is kept
        // when it is a local minimum of the per-segment distance sequence (plateau-tolerant ≤). The
        // final in-window foot is kept when the sequence was still descending (window-edge minimum —
        // the limb continues beyond, but its nearest in-window point is a legitimate candidate whose
        // position and grade vary continuously with the query).
        let out = null
        let prevD2 = Infinity, prevPrevD2 = Infinity, prevCum = 0, prevI = 0, prevT = 0
        // Each kept foot also records its segment index + clamped fraction (i, t) so callers that
        // need the foot POSITION/tangent (the pad's _nodeSurfaceTop base pick) can reconstruct them
        // exactly without re-projecting. Existing consumers read only { d2, arcS }.
        const keep = (d2, cumT, ki, kt) => {
            if (!out) out = []
            const last = out[out.length - 1]
            if (last && cumT - (last.arcS + arcOrigin) < 4) {
                if (d2 < last.d2) { last.d2 = d2; last.arcS = cumT - arcOrigin; last.i = ki; last.t = kt }
            }
            else out.push({ d2, arcS: cumT - arcOrigin, i: ki, t: kt })
        }
        for (let i = i0; i <= iEnd; i++) {
            const ax = pts[i].x, az = pts[i].z
            const ex = pts[i + 1].x - ax, ez = pts[i + 1].z - az
            const segLen2 = ex * ex + ez * ez
            const segLen = Math.sqrt(segLen2) || 1e-8
            if (cum + segLen >= lo && cum <= hi) {           // segment overlaps the node-arc window
                let t = segLen2 > 1e-12 ? ((wx - ax) * ex + (wz - az) * ez) / segLen2 : 0
                if (t < 0) t = 0; else if (t > 1) t = 1
                const fx = ax + t * ex, fz = az + t * ez
                const ddx = wx - fx, ddz = wz - fz
                const d2 = ddx * ddx + ddz * ddz
                if (prevD2 !== Infinity && prevD2 <= prevPrevD2 && prevD2 <= d2) keep(prevD2, prevCum, prevI, prevT)
                prevPrevD2 = prevD2; prevD2 = d2; prevCum = cum + t * segLen; prevI = i; prevT = t
            }
            cum += segLen
        }
        if (prevD2 !== Infinity && prevD2 <= prevPrevD2) keep(prevD2, prevCum, prevI, prevT)
        return out
    }

    // PERF-25: per-leg single-slot projection memo — one _sampleCarveWorld query evaluates the ruled
    // blend for the leg cross-section AND the pad surface at the SAME exact (wx,wz); the second call
    // reuses the first's feet. Exact-key (no quantization); leg records live per _networkRev.
    _projectLegMemo(netEntry, leg, wx, wz) {
        const m = leg._lpq
        if (m && m.wx === wx && m.wz === wz && m.pts === netEntry.points) return m.prs
        const prs = this._projectLegNearNode(netEntry, wx, wz, leg.arc, RULE_NODE_WINDOW,
                                             this._legProjWin(netEntry, leg, RULE_NODE_WINDOW))
        leg._lpq = { wx, wz, pts: netEntry.points, prs }
        return prs
    }

    // PERF-25: build (and cache on the leg record) the _projectLegNearNode segment window for one
    // node leg — the contiguous run of segment indices overlapping [nodeArc−win, nodeArc+win] plus
    // the chord-cum at the first one. Leg records are rebuilt with _detectNodeJunctions per
    // _networkRev; the pts identity check catches a re-streamed network entry at the same rev.
    _legProjWin(netEntry, leg, win) {
        let w = leg._plw
        const pts = netEntry.points
        if (w && w.pts === pts) return w
        const N = pts ? pts.length : 0
        const lo = leg.arc - win, hi = leg.arc + win
        let i0 = -1, i1 = -2, cum0 = 0, cum = 0
        for (let i = 0; i < N - 1; i++) {
            const ex = pts[i + 1].x - pts[i].x, ez = pts[i + 1].z - pts[i].z
            const segLen = Math.sqrt(ex * ex + ez * ez) || 1e-8
            if (cum + segLen >= lo && cum <= hi) {
                if (i0 < 0) { i0 = i; cum0 = cum }
                i1 = i
            } else if (i0 >= 0) break   // window is one contiguous arc interval
            cum += segLen
        }
        w = { pts, i0: i0 < 0 ? 1 : i0, i1, cum0 }
        leg._plw = w
        return w
    }

    /**
     * QUAL-16: continuous nearest-point projection of (wx,wz) onto a deg-2 kink CONNECTOR arc's
     * centreline polyline (arc.points / arc.polyCum, built in _buildDeg2ArcGeom). Same math as
     * _projectOntoRun but on the cached connector centreline (no run arcOrigin — arc.polyCum starts
     * at 0). Rejects longitudinal overshoot past either anchor (there the continuation run owns the
     * surface, so the arc must not claim it). Returns { fx,fz,tx,tz,arcS,signedLat,d2 } or null.
     */
    _projectOntoDeg2Arc(arc, wx, wz) {
        const pts = arc.points, cum = arc.polyCum, N = pts.length
        if (N < 2) return null
        let bestD2 = Infinity, bestFx = 0, bestFz = 0, bestTx = 1, bestTz = 0, bestCum = 0
        let bestI = 0, bestT = 0
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
                bestCum = cum[i] + t * segLen
                bestI = i; bestT = t
            }
        }
        const overBefore = bestI === 0 && bestT === 0 &&
            ((wx - pts[0].x) * bestTx + (wz - pts[0].z) * bestTz) < 0
        const overAfter  = bestI === N - 2 && bestT === 1 &&
            ((wx - pts[N - 1].x) * bestTx + (wz - pts[N - 1].z) * bestTz) > 0
        if (overBefore || overAfter) return null
        return {
            fx: bestFx, fz: bestFz, tx: bestTx, tz: bestTz,
            arcS: bestCum,
            signedLat: (wx - bestFx) * bestTz - (wz - bestFz) * bestTx,
            d2: bestD2,
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
    // excludeKeys (FEAT-40, optional Set<runKey>): candidates to skip — _sampleCarveWorld retries
    // without a bored run when the probe is above its apex, so the next-nearest SURFACE run (e.g. a
    // parallel corridor within the 18 m footprint) can own the point instead of a bore 30 m below.
    _resolveRoadSurface(wx, wz, excludeKeys = null) {
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
        // FEAT-40: the interior footprint must reach the deep-bank toe (base cap + extension) or
        // the outer half of a deep cut wall resolves "no road" and the mesh/physics bank truncates
        // to raw mid-slope. The BUG-21 offEnd apex-sliver gate deliberately stays at the BASE
        // footprint (endHW): widening the radial fallback would resurrect the "run merely ending
        // ~40 m off the query" teleport artifact it exists to reject.
        const endHW  = Math.min(halfWidth + carveExtraWidth, minRadius) + maxEmbankmentToe
        const footHW = endHW + DEEP_BANK_TOE_EXTRA

        const qtx = Math.floor(wx / CHUNK_SIZE)
        const qtz = Math.floor(wz / CHUNK_SIZE)
        const seen = new Set()
        // Select the NEAREST footprint-interior run by true lateral distance (queryNearest's interior
        // policy), but via the continuous polyline projection so arcS/signedLat don't lurch at curves.
        // (Height-based "topmost" selection was tried and rejected — it teleported the surface onto
        // wrong-height runs that merely pass nearby.) Where genuinely overlapping runs at different
        // heights remain, this leaves at most a localized crease, not the old sampled-spline cliff.
        let bestLat = Infinity, bestPr = null, bestRunKey = ''
        // FEAT-40: second-best interior RUN — cross-run twin of the self-overlap rival. Where two
        // edges' carve footprints overlap at different heights, ownership flips at the equidistant
        // line; _carveCrossSectionBlended cross-fades toward this rival so the flip isn't a cliff.
        let secondLat = Infinity, secondPr = null, secondRunKey = ''
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
        const consider = (runKey, pr) => {
            // QUAL-30: the ceded-ownership exclusion is gone with cededSpans. A wye's loser had
            // the winner's course verbatim over its ceded stretch, so both runs' points competed
            // for surface ownership on the same ground and the loser had to stand down. A promoted
            // T's side road does not exist there, so there is nothing to arbitrate.
            const latDist = Math.abs(pr.signedLat)
            if (pr.offEnd) {   // BUG-21 apex-sliver candidate (radial gate, weakest priority)
                // BUG-57: the gate widened endHW → footHW as part of the polar-cap continuation
                // (see below) — the extra ring only ever carries bank-toe weights, so the ~40 m
                // teleport artifact the old tight gate rejected stays rejected (W(footHW) ≈ 0).
                if (pr.d2 <= footHW * footHW && pr.d2 < bestEndD2) { bestEndD2 = pr.d2; bestEndPr = pr; bestEndRunKey = runKey }
                return
            }
            if (latDist > footHW) return
            if (latDist < bestLat) {
                secondLat = bestLat; secondPr = bestPr; secondRunKey = bestRunKey
                bestLat = latDist; bestPr = pr; bestRunKey = runKey
            } else if (latDist < secondLat) {
                secondLat = latDist; secondPr = pr; secondRunKey = runKey
            }
        }
        // PERF-25: cell-candidate fast path — same runs, same order, windowed projection (bit-identical
        // for every accepted candidate; see _resolveCellCands proof). FEAT-40 bore retries (excludeKeys)
        // take the full scan: they are rare and the exclusion set would poison a shared cache entry.
        const cands = excludeKeys ? undefined : this._resolveCellCands(wx, wz, footHW)
        if (cands !== undefined) {
            if (!cands) return null   // no run within reach of this cell — full scan finds nothing too
            for (const c of cands.list) {
                const netEntry = this._network.get(c.runKey)
                if (!netEntry) continue
                const pr = this._projectOntoRunRanges(netEntry, c, wx, wz, -1, 0, cands.gate2)
                if (pr) consider(c.runKey, pr)
            }
        } else {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const segs = this._tiles.get(`${qtx + dx},${qtz + dz}`)
                    if (!segs) continue
                    for (const s of segs) {
                        const runKey = s.runKey ?? ''
                        if (seen.has(runKey)) continue
                        seen.add(runKey)
                        if (excludeKeys && excludeKeys.has(runKey)) continue
                        const netEntry = this._network.get(runKey)
                        if (!netEntry) continue
                        const pr = this._projectOntoRun(netEntry, wx, wz)
                        if (pr) consider(runKey, pr)
                    }
                }
            }
        }
        // BUG-21: fill the apex sliver — and BUG-57: continue it as a POLAR CAP. The fallback
        // used to be a binary accept/reject at an endHW radial gate, which was invisible while
        // every junction wedge had a sibling leg's interior footprint over it — but the crossing
        // rung can delete the leg whose corridor covered the wedge (a 3-leg junction degrading to
        // a sharp 2-leg corner), and then the gate boundary ships as a wall: full deck at 17.9 m,
        // raw at 18.2 m (measured 87 m second-difference in a deep cut, carve-mesh-smoothness
        // red). Instead, the terminus now acts as a point around which the run's lateral
        // cross-section ROTATES: consumers price the wedge at an effective lateral of
        // max(perpendicular lat, radial distance to the terminus) — continuous with the interior
        // bank across the end-ray (both sides read the same ~18 m lateral there) and falling to
        // the ordinary toe (W → 0) by footHW. Applied in _carveCrossSectionBlended so mesh ==
        // physics inherit it from one place.
        let endRadial
        if (!bestPr && bestEndPr) {
            bestPr = bestEndPr; bestRunKey = bestEndRunKey
            endRadial = Math.sqrt(bestEndD2)
        }
        if (!bestPr) return null

        // Default to the polyline frame (the apex-sliver offEnd fallback and any run lacking a centerline
        // stay on it). fx/fz/tx/tz/arcS come straight from the selected _projectOntoRun result.
        let fx = bestPr.fx, fz = bestPr.fz, tx = bestPr.tx, tz = bestPr.tz, arcS = bestPr.arcS

        // ── Analytic frame refinement (corner-facet fix) ─────────────────────────────────────────
        // The polyline projection gives a piecewise-constant tangent that jumps ~19° per 4 m chord on
        // radius-12 corners, faceting the dirt and staircasing collision. Refine the WINNER only onto its
        // exact primitive centerline (the SAME curve the visual ribbon samples) so the frame is smooth and
        // the dirt/asphalt seam stops tearing. Both carve consumers (terrain _buildCarveTable, physics
        // _sampleCarveWorld) rebuild signedLat/arcSEff from point+tangent, so they inherit the fix for free.
        // NOT applied to the offEnd apex-sliver candidate: its arcS is intentionally clamped to the run end
        // to stay C0 with the sibling arm at the shared anchor (BUG-21) — leave it on the polyline frame.
        const ce = this._network.get(bestRunKey)
        let bestCeded = false
        if (ce && ce.offCurveSpans) {
            // BUG-53 merge: ceded strand OR taper band — either way the points left the primitive
            // centerline, so refining onto it would pull the frame off the carve.
            const aB = bestPr.arcS + (ce.arcOrigin ?? 0)
            bestCeded = ce.offCurveSpans.some((csp) => aB >= csp.s0 - 0.5 && aB <= csp.s1 + 0.5)
        }
        if (!bestCeded && !bestPr.offEnd && ce && ce.centerline && ce.centerline.length > 1e-6 && ce.clArc && ce.polyCum) {
            const hit = ce.centerline.nearest(wx, wz, ANALYTIC_REFINE_DS,
                                              bestPr.sCL - ANALYTIC_REFINE_WINDOW,
                                              bestPr.sCL + ANALYTIC_REFINE_WINDOW)
            if (hit) {
                fx = hit.x; fz = hit.z
                tx = hit.tangent.x; tz = hit.tangent.z
                // Remap analytic TRUE-arc → polyline chord-arc (the runProfile/camberProfile domain), then
                // origin-shift. clArc↔polyCum are the paired per-run arrays; _interpArcTable is the same
                // helper the ribbon uses in the opposite direction (chord→true).
                const arcOrigin = ce.arcOrigin ?? 0
                arcS = _interpArcTable(ce.clArc, ce.polyCum, hit.s) - arcOrigin
            }
        }

        // FEAT-40 rival pass: the nearest DISTINCT competing carve field — either the winning
        // run's own next-nearest pass (arc ≥ RIVAL_ARC_SEP away; self-overlap switchback) or the
        // second-best RUN (overlapping corridors). _carveCrossSectionBlended cross-fades toward
        // it near the equidistant line so an ownership flip isn't a surface teleport. offEnd
        // passes and passes beyond the interior footprint don't count.
        let rival = null
        if (ce && !bestPr.offEnd) {
            // PERF-25: the rival pass rides the same cell windows (accepted rivals need d ≤ footHW,
            // covered by the same proof; its own along<2 m gate rejects window-edge vertex clamps).
            const cc = cands ? cands.byKey.get(bestRunKey) : null
            const pr2 = cc
                ? this._projectOntoRunRanges(ce, cc, wx, wz, bestPr.arcS + (ce.arcOrigin ?? 0), RIVAL_ARC_SEP, cands.gate2)
                : this._projectOntoRun(ce, wx, wz, bestPr.arcS + (ce.arcOrigin ?? 0), RIVAL_ARC_SEP)
            if (pr2 && !pr2.offEnd) {
                // Gate on true RADIAL distance, and reject clamped projections (the avoid window
                // cuts the polyline mid-approach; a clamped vertex has a tiny perpendicular
                // signedLat but a large along-offset — using it would fake a nearby deep pass).
                const d2 = pr2.d2, latP = pr2.signedLat
                if (d2 - latP * latP < 4 && d2 <= footHW * footHW) {
                    rival = { runKey: bestRunKey, arcS: pr2.arcS, signedLat: latP, lat: Math.sqrt(d2) }
                }
            }
        }
        if (secondPr && (!rival || secondLat < rival.lat)) {
            rival = { runKey: secondRunKey, arcS: secondPr.arcS, signedLat: secondPr.signedLat, lat: secondLat }
        }

        // camberSign = 1: the projection uses the run's own canonical polyline direction (arcS increases
        // along it), so run-frame camber maps to the world frame directly (no E→W slice reversal here).
        return {
            point:      new THREE.Vector3(fx, this.runProfile(arcS, bestRunKey).gradeY, fz),
            tangent:    new THREE.Vector3(tx, 0, tz),
            runKey:     bestRunKey,
            arcS:       arcS,
            camberSign: 1,
            rival,
            endRadial,   // BUG-57: set only on an apex-sliver fallback hit — the polar-cap radius
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
            // Cap raised with the per-sample hint (main.js queryContacts): the footprint stencil
            // asks for nine distinct cells per wheel per query, so 128 thrashed and lost the reuse
            // the memo exists for.
            if (m.size > 1024) m.clear()
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
    _sampleCarveWorld(wx, wz, rawAmp, nrHint, queryY) {
        const p             = this._params
        const halfWidth     = p.roadHalfWidth     ?? 5
        const clearanceMargin = p.roadClearanceMargin ?? 0.25

        // Continuous-projection road resolver replaces queryNearest in the carve path —
        // see _resolveRoadSurface. nrHint (from carveHint) is already a _resolveRoadSurface result.
        // NB (QUAL-16 × FEAT-40 × junction pad): nr may be null on the open-side pad rim or the
        // bend-outside void (outside every run footprint) — the deg-2 connector overlay AND the
        // junction-pad carve below still cover those points, so do NOT early-return on a null nr.
        let nr = (nrHint !== undefined) ? nrHint : this._resolveRoadSurface(wx, wz)

        // FEAT-40 bore ownership: a run in a bore span only owns probes BELOW its apex (a wheel in
        // the tube). Anything else — a probe on the hill overhead, or a Y-less caller (mesh carve
        // table, props, camera; their undefined comparison is false) — falls through to the next-
        // nearest SURFACE run (parallel corridors sit within the 18 m resolver footprint), or to raw
        // terrain if no other run claims the point. Without the retry, walking a surface road beside
        // a bore snapped the carve to "raw hill" mid-shoulder (a 7 m collision step, road-smoothness).
        let _excl = null
        while (nr) {
            const adx = wx - nr.point.x, adz = wz - nr.point.z
            const aArc = (nr.arcS ?? 0) + adx * nr.tangent.x + adz * nr.tangent.z
            if (!this.tunnelSpanAt(nr.runKey ?? '', aArc)) break
            const topY = this.runProfile(aArc, nr.runKey).gradeY + (p.tunnelBoreRadius ?? 8)
            if (queryY < topY) break                     // in the bore: this run owns the probe
            // FEAT-40: skin probe over a bore — mouth-funnel notch (no decal/pothole overlay:
            // this is the cutting face over the tube, not a drivable deck).
            const aLat = adx * nr.tangent.z - adz * nr.tangent.x
            const notch = this._boreNotchCS(nr.runKey ?? '', nr.camberSign ?? 1, aArc, aLat, rawAmp)
            if (notch) return notch
            ;(_excl ??= new Set()).add(nr.runKey ?? '')
            if (_excl.size > 3) { nr = null; break }     // stacked-bore backstop
            nr = this._resolveRoadSurface(wx, wz, _excl)
        }

        // ── QUAL-07: leg-corridor carve (the shared cross-section) — null when nr is null or beyond toe ──
        let cs = null, latDist = Infinity, arcSEff = 0, runKey = ''
        if (nr) {
            const dx = wx - nr.point.x
            const dz = wz - nr.point.z
            const tx = nr.tangent.x, tz = nr.tangent.z
            // Per-point arc via projection onto the run tangent (recovers the offset's true along-run arc
            // for a cache hit → correct longitudinal grade in analyticNormal's finite differences).
            arcSEff = (nr.arcS ?? 0) + dx * tx + dz * tz
            // Signed lateral distance (positive = right of road heading).
            const signedLat = dx * tz - dz * tx
            latDist = Math.abs(signedLat)
            runKey  = nr.runKey ?? ''
            // FEAT-40: rival blend (_carveCrossSectionBlended) so self-overlap / bore seams match the mesh;
            // wx,wz forwarded through to _carveDirtY so the QUAL-10 pad-plane inter-leg RULED blend still
            // fires near a ≥2-leg node. Returns the DIRT-trough surface (clearance subtracted) + shoulder
            // blend, or null beyond the fill/cut toe — the connector + pad overlays below still get a turn.
            cs = this._carveCrossSectionBlended(nr, signedLat, arcSEff, rawAmp, queryY, wx, wz)
        }

        // QUAL-16: compose the deg-2 kink CONNECTOR's own FULL run-style cross-section (flat core →
        // smoothstep shoulder → fill/cut toe, _connectorCarve) over the run surface. Coverage = max
        // (blendW), so the connector corridor is never LESS carved than the connector standing alone — no
        // scoop / poke-through. The connector grade DOMINATES its own core (co.blendW≈1) so the swept
        // corridor gets one flat graded bench instead of the cliff-y run-vs-run Voronoi surface + junction
        // step the two straight legs leave at a sharp kink (the walls at the asphalt edge); it feathers
        // (co.blendW→0) back to the run grade at the connector toe, C0. Off a connector co is null → run
        // surface unchanged. Both inputs continuous → no dithering.
        const co = this._connectorCarve(wx, wz, rawAmp)
        if (co) {
            // Connector grade is the design target across its WHOLE footprint (flat core + smoothstep
            // shoulder + toe); blendW = max(run, connector) feathers it to raw at the toe. This replaces
            // the cliff-y run-vs-run Voronoi surface + junction step at the sharp kink with one smooth
            // graded bench, all the way from the asphalt edge out to the connector toe (co.gradeY follows
            // the legs' grades so it matches the ribbons at the weld). Run surface unchanged off connectors.
            const domGrade = cs ? co.gradeY * co.dom + cs.gradeY * (1 - co.dom) : co.gradeY
            cs = { blendW: Math.max(cs ? cs.blendW : 0, co.blendW), gradeY: domGrade }
            // On-ribbon decal (clearance) edge: where a run overlaps the connector, keep the RUN's edge
            // (latDist = run lat) rather than min(run,connector). The connector centreline is inset from
            // the run near the node, so min() would move the decal dropoff to run-lat ~5.6 — a ~0.15 m
            // step in the "flat" band the shoulder-lateral gate tolerances tightly, offset from the real
            // road edge. Only where there is NO run (the bend-outside void) does the connector's own edge
            // (co.lat) govern its decal.
            if (!nr) { latDist = co.lat; arcSEff = co.arcS; runKey = '' }
        }

        // FEAT-46: the POI lay-by bench, composed the same way as the connector above (dominance +
        // feather), NOT via _mergeCarve — see _poiPadCarve for why the pad must dominate its own
        // footprint. `latDist` gates it to zero inside the ribbon + shoulder, so this line cannot
        // change the road surface; with no pads set (free roam, every gate) it is a null check.
        const pq = this._poiPadCarve(wx, wz, rawAmp, latDist)
        if (pq) {
            cs = {
                blendW: Math.max(cs ? cs.blendW : 0, pq.blendW),
                gradeY: cs ? pq.gradeY * pq.dom + cs.gradeY * (1 - pq.dom) : pq.gradeY,
            }
        }

        // Junction-pad carve (first-class pad footprint, incl. the back-arc bulb) composed with the leg
        // + connector carve — never LESS coverage than any alone, and smooth where they overlap (all ride
        // the pad plane near the node). This is what covers the open-side rim the corridors miss.
        // PERF-24/25: the pad surface is the resolve-free _nodeSurfaceTop (one ruled-blend evaluation,
        // feet shared with the leg cross-section above via the per-leg memo) — no extra resolves at all.
        const cs2 = this._mergeCarve(cs, this._junctionPadCarve(wx, wz, rawAmp), PAD_DUCK_CAP_PHYS)
        if (!cs2) return null   // beyond the fill/cut toe of all three — unaffected terrain

        // ── Physics-only asphalt overlay (the one intentional mesh↔collision difference) ──
        // The terrain mesh draws the dirt trough everywhere; ON the drawn asphalt (junction pad or
        // ribbon) the truck instead rides the asphalt on top of it. Both branches below therefore
        // reproduce the height of the ASPHALT GEOMETRY at this point — that is the whole contract
        // (QUAL-07 mesh == collision); the merged dirt `cs2.gradeY` is the surface only where no
        // asphalt is drawn.
        let gradeY = cs2.gradeY
        if (cs2.padTopY != null) {
            // ── On-PAD (inside the junction ring) ── road-mesh.js buildJunctionFootprint puts every
            // pad vertex at `_nodeSurfaceTop(node,x,z) + apronLift`, which is exactly padTopY. So the
            // wheel rides padTopY, full stop — the whole ring interior, ribbon or open sector alike
            // (the pad polygon is what is DRAWN there: the ribbons are trimmed back at the cutback).
            // One field over the whole interior also means no seam at lat == halfWidth.
            //
            // JUNCTION-FLOW: this replaces (a) `cs.gradeY + clearanceMargin` — one LEG's pinned
            // cross-section extended across the plaza, which under the saturating-camber model rides
            // up to ~1 m off the drawn pad near the rim — and (b) the PAD_EDGE_FEATHER band that used
            // to fade that excess out over the last 1.6 m inside the ring (and, in fading, dropped
            // physics up to 0.44 m BELOW the pad triangles the truck was visibly standing on). With
            // the overlay pinned to the mesh's own field there is no excess to feather: the only step
            // left at the ring exit is the drawn asphalt→dirt dropoff (clearance + PAD_DIRT_EXTRA
            // ≈ 0.30 m), the same intended edge dropoff as a ribbon shoulder (BUG-15), and the MESH
            // has that identical step there. No potholes either: potholes are an on-ribbon-only
            // physics-side micro-noise (D-03) and the pad geometry is smooth.
            gradeY = cs2.padTopY
        } else if (nr && latDist < halfWidth && this._leafEndDist(runKey, arcSEff) >= 0) {
            // ── On-RIBBON ── ride the asphalt decal: the LEG cross-section's own design top
            // (cs.gradeY + clearanceMargin) — the same field the ribbon mesh vertices ride
            // (sampleRoadTopY) — plus the SURF-06 pothole micro-noise (D-03, physics-only).
            // JUNCTION-FLOW: this used to add clearanceMargin to the MERGED dirt cs2.gradeY, which
            // near a pad carries the pad's own duck (PAD_DIRT_EXTRA + crease duck) — so inside the
            // ring and out through the rim-hold band the wheel rode ~0.15 m BELOW the drawn asphalt.
            // The duck is a MESH-DIRT armor (keep tan interp slivers under the asphalt); it must not
            // move the decal. Off pads cs2.gradeY == cs.gradeY, so this is a no-op there.
            // QUAL-24: not PAST a graph-leaf terminus (_leafEndDist < 0) — the ribbon mesh stops at
            // the run's last vertex, so there is no asphalt to ride out on the dangling-end cap.
            // Without the gate physics floated clearanceMargin above the drawn dirt for the whole
            // cap (lat ≈ 0 straight off the end), the one place mesh == collision was breaking there.
            gradeY = (cs ? cs.gradeY : cs2.gradeY) + clearanceMargin
            if (p.potholeEnabled) {
                const rq = roadQuality(arcSEff, runKey, this._worldSeed)
                gradeY += potholeNoise(wx, wz, rq, p)
            }
        }

        return { blendW: cs2.blendW, gradeY }
    }

    // FEAT-40: the bore span containing run-arc `arcS` on `runKey`, or null. Spans are per-edge,
    // few (usually 0–2), and window-invariant (set by applyTunnelPassInPlace at assembly).
    // `inset` (m, optional) shrinks the span from both ends — the terrain-mesh carve table passes
    // ~4 so the open cut continues INTO the bore mouth and the ragged carved→raw vertex boundary
    // lands inside the tube (hidden by the lining + headwall) instead of spiking at the portal.
    tunnelSpanAt(runKey, arcS, inset = 0) {
        const spans = this._network?.get(runKey)?.tunnelSpans
        if (!spans) return null
        for (let i = 0; i < spans.length; i++) {
            const s = spans[i]
            if (arcS >= s.s0 + inset && arcS <= s.s1 - inset) return s
        }
        return null
    }

    // BUG-37: bore WALL contact — the carve heightfield above (_sampleCarveWorld) only resolves the
    // bore FLOOR (bore-ownership rule); the curved half-tube sides (buildTunnelTube, road-mesh.js)
    // have no matching collision, so a wheel drove straight through the concrete. This is a half-
    // cylinder containment test (radius tunnelBoreRadius, axis at gradeY along the run centerline,
    // upper half only) returning the same {normal,depth,contactPoint} shape queryContacts/propSystem
    // already push into the wheel/body contact solver — reuse, not a new collision capability.
    // (lat,h) uses the SAME rightDir (tz,-tx) buildTunnelTube uses for its wall-ring vertices
    // (road-mesh.js), so the test runs in the mesh's own cross-section frame (mesh == collision).
    queryTunnelWallContact(wx, wy, wz, r = 0, nrHint) {
        const nr = nrHint ?? this.carveHint(wx, wz)
        if (!nr) return null
        const dx = wx - nr.point.x, dz = wz - nr.point.z
        const tx = nr.tangent.x,    tz = nr.tangent.z
        const aArc   = (nr.arcS ?? 0) + dx * tx + dz * tz   // same decomposition as _sampleCarveWorld
        const lat    = dx * tz - dz * tx                     // signedLat, no extra call
        const runKey = nr.runKey ?? ''
        if (!this.tunnelSpanAt(runKey, aArc)) return null     // not inside a bore span
        const R = this._params.tunnelBoreRadius ?? 8
        const gradeY = this.runProfile(aArc, runKey).gradeY   // floor Y at this arc
        const h = wy - gradeY                                  // height above the springline
        // FULL cylinder, not just the upper arch: camber tilts the physics FLOOR (_carveDirtY's
        // tiltY = signedLat*sin(camberAngle)) but NOT the rendered arch (buildTunnelTube's h=R·sin(θ)
        // ignores camberRad) — so on the low side of a banked bore the drivable surface, and the wheel
        // riding it, legitimately sits at h<0 right where the wall is. A hard h<0 cutoff killed the
        // wall contact exactly there (BUG-37 follow-up). Symmetric |h|>R+r still excludes raw hillside
        // overhead (30+ m up) without excluding the below-springline band; a wheel never sits deep
        // enough below grade (h≈-R) for the lower half to false-fire on ordinary ground contact — at
        // lat≈0 (floor centre) rho≈|h| stays well under R regardless of sign, so only the region near
        // the wall (|lat|≈R) actually triggers.
        if (Math.abs(h) > R + r) return null
        const rho = Math.hypot(lat, h)
        const depth = rho + r - R
        if (depth <= 1e-9) return null
        const invRho = rho > 1e-9 ? 1 / rho : 0
        const nLat = -lat * invRho, nH = -h * invRho           // inward unit normal in the (lat,h) plane
        const normal = new THREE.Vector3(nLat * tz, nH, -nLat * tx)  // right=(tz,0,-tx), up=(0,1,0)
        const t = r - depth
        return {
            normal, depth,
            contactPoint: new THREE.Vector3(wx - normal.x * t, wy - normal.y * t, wz - normal.z * t)
        }
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
    _carveDirtY(signedLat, arcSEff, runKey, camberSign, wx, wz) {
        const p = this._params
        const halfWidth     = p.roadHalfWidth      ?? 5
        const crownHeight   = p.crownHeight         ?? 0.05
        const clearanceMargin = p.roadClearanceMargin ?? 0.25
        let crownY = crownProfile(signedLat, halfWidth, crownHeight)
        const camberAngle = camberSign * this.camberProfile(arcSEff, runKey)
        let tiltY = signedLat * Math.sin(camberAngle)
        // QUAL-10: ease crown+camber to FLAT through a junction — a crossing is a flat plaza, and the
        // crown/camber extrapolated across the widened junction carve core (below) would dome/tilt.
        const jc = this._junctionCarve(runKey, arcSEff)
        if (jc.frac > 0) { const k = 1 - jc.frac; crownY *= k; tiltY *= k }
        let gradeY = this.runProfile(arcSEff, runKey).gradeY
        // Inter-leg CREASE fix — the "ruled surface" grade blend. Each ≥2-leg node's runs leave the shared
        // node INDEPENDENTLY, so _resolveRoadSurface hard-switching to the nearest leg leaves a STEP at the
        // Voronoi boundary between two legs (their grades diverge — up to ~4.5 m at r=24 on the seed-6 sloped
        // trident). Replace the hard switch with a ruled surface: blend EVERY nearby leg's centerline grade,
        // weighted by an EXPONENTIAL falloff of the point's GAP to that leg's asphalt (gap = distance to the
        // leg's nearest centerline point − halfWidth, clamped ≥0). exp(−gap/scale) is smooth EVERYWHERE — in
        // particular it has NO cliff at the asphalt edge (an inverse-distance 1/(gap+ε) collapses ~10× over
        // 0.25 m there and pops siblings in → a lateral shoulder step the shoulder-continuity gate catches);
        // and it decays a far leg to ~0 by itself, so a separate road (or a far bimodal branch of a looping
        // leg) never perturbs the surface. The blend is a PURE FUNCTION OF POSITION — it does NOT privilege
        // the "winning" leg — so it hands off CONTINUOUSLY across the Voronoi boundary (a winning-privileged
        // variant SNAPPED to the dominant leg, re-introducing the crease). On a real ribbon (one leg within
        // ~halfWidth) that leg's gap→0 gives weight 1 while siblings are exp-suppressed, so the ribbon stays
        // put; in the throat near the node (trimmed-back ribbons overlap) it averages toward the shared node
        // grade = the flat plaza. Shared fn ⇒ mesh (pad + apron via sampleRoadTopY / _carveCrossSection) and
        // physics agree. Window-invariant. Needs (wx,wz).
        if (jc.node && wx !== undefined) {
            // Collect each in-range leg's soft-clamped gap-to-asphalt, grade, and reach-taper, then blend by
            // BARYCENTRIC weights w_i = taper_i · ∏_{j≠i} soft(gap_j). This is the LINEAR ruled
            // interpolation between the legs (for two legs w_A = gap_B, w_B = gap_A ⇒ blend rides the straight
            // line between the two ribbon edges), so the gore is a CONSTANT-slope banked ramp — no local
            // steepening. That is what lets it span the whole plaza out to r≈24: an exp/inverse-distance weight
            // CONCENTRATES the entire grade change at the Voronoi crossover (a steep local lateral step) even
            // when the average ruled slope is gentle; the linear ramp spreads it evenly (≈ Δgrade / gore-width).
            // It also has NO 1/gap edge spike — as a point moves ONTO a leg's asphalt soft(gap_i) decays toward
            // 0, so every OTHER weight (which carries that factor) decays with it and w_i alone survives ⇒ that
            // leg's grade, smoothly (the ribbon never moves). Pure function of position, and now C1 as well as
            // C0 (RULE_SOFT) ⇒ continuous across every Voronoi switch with no crease at the asphalt edges.
            const nodeLegs = jc.node.legs
            const gaps = [], grades = [], tapers = []
            for (const leg of nodeLegs) {
                const ne = this._network.get(leg.runKey)
                if (!ne) continue
                // Project onto the leg's NEAR-NODE arc window only. EVERY distance-local-minimum limb is
                // returned and blended as its own pseudo-leg (see _projectLegNearNode: a curving leg can
                // hold two genuine minima at once, and picking one by argmin tears the gore at the flip).
                const prs = this._projectLegMemo(ne, leg, wx, wz)
                if (!prs) continue
                // The branch nearest the RESOLVED arc of the query's own run rides the already-computed
                // gradeY (the resolved cross-section's grade — keeps the pinned/hinted surface exact);
                // every other branch samples the profile at its own foot.
                let ownIdx = -1
                if (leg.runKey === runKey) {
                    let bestDa = Infinity
                    for (let bi = 0; bi < prs.length; bi++) {
                        const da = Math.abs(prs[bi].arcS - arcSEff)
                        if (da < bestDa) { bestDa = da; ownIdx = bi }
                    }
                }
                for (let bi = 0; bi < prs.length; bi++) {
                    const pr = prs[bi]
                    const gap = Math.sqrt(pr.d2) - halfWidth
                    if (gap >= RULE_LEG_REACH) continue                  // out of range: not a co-leg here
                    const legGrade = bi === ownIdx ? gradeY : this.runProfile(pr.arcS, leg.runKey).gradeY
                    // Plausibility guard: every leg leaves the node welded at nodeY with a bounded road
                    // grade, so at arc distance `along` its grade must lie within nodeY ± MAX_LEG_SLOPE·
                    // along. A projected grade outside that is a WRONG-BRANCH artifact (an unrelated road
                    // crossing at a very different height within the window) — blending it would raise a
                    // tall ramp between two roads that merely pass near. Reject it. (Uses the node's own
                    // grade → window-invariant.)
                    const along = Math.abs(pr.arcS - leg.arc)
                    if (Math.abs(legGrade - jc.node.nodeY) > MAX_LEG_SLOPE * along + halfWidth) continue
                    // RULE_SOFT smooth clamp — see the const's note: a hard max(0,gap) froze the weight at
                    // the asphalt edge and squeezed the whole inter-leg handover into the throat annulus.
                    gaps.push(0.5 * (gap + Math.sqrt(gap * gap + RULE_SOFT2))); grades.push(legGrade)
                    // Smooth in-range taper (1 → 0 across the last RULE_TAPER m before the cutoff).
                    // Barycentric weight does NOT decay with a leg's OWN distance, so without this a leg
                    // crossing RULE_LEG_REACH would POP in with a non-trivial weight (a lateral shoulder
                    // step). The taper eases its weight to 0 at the cutoff so it fades in/out; at its own
                    // asphalt (gap 0) the taper is 1.
                    const tu = Math.min(1, Math.max(0, (RULE_LEG_REACH - gap) / RULE_TAPER))
                    tapers.push(tu * tu * (3 - 2 * tu))
                }
            }
            let wSum = 0, gSum = 0, wMax = 0
            for (let i = 0; i < gaps.length; i++) {
                let w = tapers[i]
                for (let j = 0; j < gaps.length; j++) if (j !== i) w *= gaps[j]   // taper_i · ∏_{j≠i} gap_j
                wSum += w; if (w > wMax) wMax = w
                gSum += w * grades[i]
            }
            // Apply the ruled blend (NO single/blend crossfade — that leaked a partial crease wherever the
            // "winning" single flipped at a Voronoi switch). On a CLEAN open ribbon (only one leg in range) wSum
            // reduces to that leg's weight ⇒ its grade exactly, so the driving ribbon never moves. It bends
            // toward the shared grade only where a sibling is genuinely close (the plaza approach).
            if (wSum > 0) {
                // RADIAL fade of the junction influence, centred on the node. The blend is found via the
                // winning run's ARC distance (generous, so the gate never switches the blend off mid-carve),
                // but arc ≠ radial on a curving leg, so without this a leg that has diverged into a SEPARATE
                // road 40 m out would still be blended (a 0.5 m gore step where two unrelated roads' grades
                // cross). Fade to the pure single-leg surface between FADE_IN and FADE_OUT so the plaza/gore
                // influence is confined to the actual intersection; beyond it the ribbon is its ordinary self.
                // fade → single is safe here (unlike a lateral crossfade) because by FADE_OUT the legs have
                // diverged past co-dominance, so blendGrade ≈ single already — no crease is re-exposed.
                const radial = Math.hypot(wx - jc.node.pos.x, wz - jc.node.pos.z)
                const fu = Math.min(1, Math.max(0, (radial - JN_FADE_IN) / (JN_FADE_OUT - JN_FADE_IN)))
                const fade = 1 - fu * fu * (3 - 2 * fu)                   // 1 at the node → 0 past FADE_OUT
                gradeY += fade * (gSum / wSum - gradeY)
                // Ease the single-ribbon CROSS-SLOPE (crown + camber tilt) to flat by blend PURITY (the
                // dominant leg's weight share) IN the faded junction region: on a clean ribbon/shoulder
                // purity ≈ 1 (or fade 0) ⇒ crown/camber untouched = the ordinary cross-section; where legs
                // are co-dominant near the node they ease to the flat ruled plaza, killing the camber FLIP
                // at the Voronoi boundary. The remap max(0, 2·pur − 1) is what makes the kill COMPLETE: raw
                // purity only reaches 1/2 at a two-leg crease, and multiplying the tilt by 1/2 still leaks
                // half the flip — pre-camber-rework tilts were small enough (≤ ~0.5 m) to hide that, but the
                // saturating-camber model banks sweeper legs to ~±1.5 m of edge tilt, and half a flip is a
                // >1 m lateral step at every gore crease (shoulder gate plaza tol 0.70). Remapped, purity 1
                // (own asphalt: every sibling weight carries this leg's gap→0 factor) still gives exactly the
                // ordinary cross-section, while ≤ 1/2 (two or more co-dominant legs) is fully flat — the
                // crease line carries NO cross-slope jump at all. Both purity and fade are position-continuous.
                const pur = wMax / wSum
                const k = 1 - fade * (1 - Math.max(0, 2 * pur - 1))
                crownY *= k; tiltY *= k
            }
        }
        return gradeY + crownY + tiltY - clearanceMargin
    }

    // ── QUAL-10: junction carve influence ────────────────────────────────────────────────────
    /**
     * Junction carve influence for a point at run-arc `arcSEff` on `runKey`. Near an AT_GRADE crossing
     * (FEAT-19's _crossingsByRun) the carve holds the road grade FLAT out to a WIDENED core (`widen`)
     * so the terrain is dug/filled to the junction pad instead of clipping through it, and the
     * cross-section eases crown/camber to flat (`frac`) so a crown isn't extrapolated across that wide
     * core. `frac` = 1 at the node, 0 at radius R along the run. Two crossing runs each widen their own
     * band → the union covers the pad disc. Pure fn of the network (window-invariant); 0 if no crossings.
     */
    _junctionCarve(runKey, arcSEff) {
        // Node junctions (graph T/X + rows cross-anchors) carry the pad locations as per-run ENDPOINT arcs.
        if (this._nodeJunctionsRev !== this._networkRev) this._detectNodeJunctions()
        const arcs = this._junctionCarveArcs && this._junctionCarveArcs.get(runKey)
        if (!arcs || arcs.length === 0) return _ZERO_JC
        // R read FRESH from params (NOT baked into the _networkRev-cached arc list) so the carve-radius
        // slider takes effect on a surface rebuild without a full re-route.
        const R = this._params.roadJunctionCarveRadius ?? (this._params.roadHalfWidth ?? 5) * 2.5
        if (R <= 0) return _ZERO_JC
        // Blend reach: the ruled inter-leg blend (_carveDirtY) that kills the Voronoi crease must reach much
        // FURTHER than the crown/camber-ease + widen core (R), because the step grows with radius. Tracks R
        // via a multiplier so it scales with junction size; live-tunable (not baked in the arc list).
        const Rb = R * BLEND_REACH_MULT
        let minAlong = Infinity, near = null
        for (let i = 0; i < arcs.length; i++) {
            const along = Math.abs(arcSEff - arcs[i].arc)
            if (along < minAlong) { minAlong = along; near = arcs[i] }
        }
        if (!near || minAlong >= Rb) return _ZERO_JC
        const frac = minAlong < R ? 1 - minAlong / R : 0        // crown/camber ease + widen (core reach R)
        // node ref lets _carveDirtY enumerate the sibling legs for the ruled inter-leg grade blend. The blend
        // WEIGHT is per-leg LATERAL (gap to each leg's asphalt), not this arc distance — a lateral weight is
        // symmetric for both legs at their shared Voronoi boundary and so welds exactly to each ribbon, which
        // an arc-distance weight (different arc-along per leg) can't.
        return { frac, widen: frac * R, node: near.node }
    }

    // QUAL-10: how far the swept ribbons are cut back from a junction node (metres) to clear room for the
    // radiused intersection pad. ONE source shared by the ribbon trim (RoadMeshSystem._buildRoadTile) and
    // the pad mouth distance (buildJunctionFootprint) so the pad meets the trimmed ribbon end exactly.
    junctionCutbackDist() {
        return this._params.roadJunctionCutback ?? 10
    }

    // ── QUAL-10: NODE junctions (the actual graph T/X/Y intersections) ─────────────────────────
    /**
     * Where ≥3 streamed runs meet at a shared ANCHOR — the real intersections of the shipped graph
     * network. Unlike _detectJunctions (mid-span CROSSINGS, which are culled/absent in graph mode) these
     * are found by clustering streamed run ENDPOINTS (the run-join seal welds them to one point), so it
     * needs no abstract-graph incidence and is a pure fn of the streamed network. Also builds
     * _junctionCarveArcs (runKey → {endpoint arc, radius}) so the terrain carve (_junctionCarve) flattens
     * and widens the plaza at these nodes. Cached by _networkRev.
     *
     * Records match buildJunctionFootprint's shape: { pos, nodeY, legs:[{runKey,dir}], kind, simpleMerge }.
     * @returns {Map<string, object>} nodeKey → node record
     */
    _detectNodeJunctions() {
        if (this._nodeJunctionsRev === this._networkRev && this._nodeJunctions) return this._nodeJunctions
        const halfWidth = this._params.roadHalfWidth ?? 5
        const EPS2 = Math.pow(Math.max(2, halfWidth * 0.75), 2)

        // Cluster every streamed run's two ENDPOINTS; each leg carries an OUTWARD unit dir + its
        // endpoint arc (QUAL-11: buildJunctionFootprint welds the pad mouth to the ribbon's real
        // end cross-section at leg.arc ± cutback, so legs must know WHICH endpoint the node owns).
        const clusters = []   // { x, z, ys:[], legs:[{runKey,dir,arc}] }
        const addEnd = (x, z, y, dir, runKey, arc) => {
            for (const c of clusters) {
                const dx = c.x - x, dz = c.z - z
                if (dx * dx + dz * dz < EPS2) { c.ys.push(y); c.legs.push({ runKey, dir, arc }); return }
            }
            clusters.push({ x, z, ys: [y], legs: [{ runKey, dir, arc }] })
        }
        for (const [runKey, e] of this._network) {
            const pts = e.points
            if (!pts || pts.length < 2) continue
            const cum = e.polyCum
            const len = cum ? cum[cum.length - 1] : 0
            const a0 = pts[0], b0 = pts[1]
            const d0 = Math.hypot(b0.x - a0.x, b0.z - a0.z) || 1
            addEnd(a0.x, a0.z, a0.y, { x: (b0.x - a0.x) / d0, z: (b0.z - a0.z) / d0 }, runKey, 0)
            const n = pts.length, an = pts[n - 1], bn = pts[n - 2]
            const dn = Math.hypot(bn.x - an.x, bn.z - an.z) || 1
            addEnd(an.x, an.z, an.y, { x: (bn.x - an.x) / dn, z: (bn.z - an.z) / dn }, runKey, len)
        }

        const nodes = new Map()
        const carveArcs = new Map()
        const deg2ArcTiles = new Map()   // QUAL-16: tileKey → [connector arc] for _resolveRoadSurface
        // QUAL-16: a 2-leg cluster is a road continuing through the node — but each graph edge is
        // routed INDEPENDENTLY, so nothing makes the two arrival tangents anti-parallel. Above
        // roadJunctionKinkDeg the centerline heading KINK reads as a corner (wedge notch + abrupt
        // camber slew), so admit those as mini-junctions: same cutback + carve machinery, n = 2.
        // Straight pass-throughs stay untouched ribbons (no pad spam along every road). The mesh
        // connector for n = 2 is a swept fillet ARC (_buildDeg2Ribbon), not a pad — so sharp kinks
        // are fine (they just curve tighter, no hairpin crescent). NO upper kink cap (QUAL-21
        // follow-up, 2026-07-25): a 120° KINK_MAX used to skip the cluster entirely on the theory
        // that the fitted arc pinches there — but skipping built NOTHING (no fillet, no pad, no
        // camber flatten): a naked >120° elbow with a multi-metre plaza-rim step and a full camber
        // flip. Cost-pruned topology (QUAL-22) makes such elbows common (valley confluences whose
        // third leg the crossing cull removed — user captures 1784910746309/1784910841316). Admit
        // every kinked 2-leg cluster; _buildDeg2ArcGeom builds a connector for essentially all of them
        // (tangent circle, else Hermite — see _pushDeg2Core), so the deg-3 pad ladder is now a last
        // resort for degenerate 2-leg input only.
        const kinkMin = (this._params.roadJunctionKinkDeg ?? 0) * Math.PI / 180
        // QUAL-21 Phase 5b-1 DECISION (2026-07-25): the admission KEEPS the first-chord proxy.
        // A true-analytic-tangent admission was implemented and measured — it fails BOTH ways:
        //  · it drops the connector at G1 S-joints / cull-created corridor welds whose bench was
        //    covering a real camber/grade SEAM (0.875 m knife-edge at seed-6 (-888,-488) lat 10);
        //  · it newly admits connectors at true-kink nodes the chord read as smooth, whose bench
        //    then FLATTENS a legitimately banked sweeper (same node, same step size).
        // The chord kink ≈ heading kink + curvature/camber activity inside the first chord — an
        // accidental but empirically better-calibrated "does a bench help here" detector than pure
        // heading. The two census over-admissions (11.2°/13.5° first-chord, true kink ≈ 0) are
        // cosmetic paved corners, accepted. Connector DELETION is off the table regardless: 6/12
        // census deg-2 nodes are cull-created with real kinks (up to 89.5°) that need the bench.
        for (const c of clusters) {
            if (c.legs.length < 2) continue
            if (c.legs.length === 2) {
                if (kinkMin <= 0) continue   // slider 0 = deg-2 pads off
                const [A, B] = c.legs
                const dot = Math.max(-1, Math.min(1, A.dir.x * B.dir.x + A.dir.z * B.dir.z))
                const kink = Math.PI - Math.acos(dot)   // away-heading kink: 0 = perfectly continuous
                if (kink <= kinkMin) continue
            }
            // QUAL-13: sloped pad — resolve the cluster's graph node id via any leg's netEntry
            // (endpoint arc 0 → cellA, else cellB) and ride its pad PLANE. nodeY/pos.y become the
            // plane at the cluster centre so the pad-mesh fallback + carve agree with the blended
            // approaches instead of the flat endpoint mean. plane = null keeps the flat behavior
            // (deg-2 kink nodes / degenerate strands).
            let plane = null
            if (this._proto?.graph) {
                for (const a of c.legs) {
                    const e = this._network.get(a.runKey)
                    if (!e || !e.cellA || !e.cellB) continue
                    const id = a.arc < 1e-6 ? e.cellA : e.cellB
                    if (this._graphDegreeOf(id) >= 3) { plane = this._junctionPadPlane(id); if (plane) break }
                }
            }
            const nodeY = plane
                ? this._padPlaneY(plane, c.x, c.z)
                : c.ys.reduce((s, v) => s + v, 0) / c.ys.length
            const legs = c.legs.slice().sort((p, q) => Math.atan2(p.dir.x, p.dir.z) - Math.atan2(q.dir.x, q.dir.z))
            const node = {
                pos: new THREE.Vector3(c.x, nodeY, c.z), nodeY, plane, legs, kind: 'AT_GRADE', simpleMerge: legs.length > 4,
            }
            // QUAL-16: build the deg-2 connector fillet arc ONCE here (cached per _networkRev). The mesh
            // (_buildDeg2Ribbon) reads node.deg2.points/halfWidth to sweep the strip, and _resolveRoadSurface
            // projects onto it so the terrain earthwork + collision follow the same arc → no scoop on sharp
            // bends. null (degenerate 2-leg input only, now that _pushDeg2Core has a Hermite rung) → mesh
            // falls back to the pad ladder, no carve candidate.
            if (legs.length === 2) {
                const arc = this._buildDeg2ArcGeom(node)
                if (arc) {
                    node.deg2 = arc
                    // junction-flow: the connector's own reach from the node centre, for padReachNodes().
                    // A connector node has no ring (see below) but still OWNS its ground — src/poi.js must
                    // not stack a lay-by on a bend fillet, and the terrain skip guard must not cull its rim.
                    let ar = 0
                    for (const pt of arc.points) {
                        const r = Math.hypot(pt.x - c.x, pt.z - c.z); if (r > ar) ar = r
                    }
                    node.deg2MaxR = ar
                    const seenTiles = new Set()
                    for (const pt of arc.points) {
                        const key = `${Math.floor(pt.x / CHUNK_SIZE)},${Math.floor(pt.z / CHUNK_SIZE)}`
                        if (seenTiles.has(key)) continue
                        seenTiles.add(key)
                        let arr = deg2ArcTiles.get(key); if (!arr) { arr = []; deg2ArcTiles.set(key, arr) }
                        arr.push(arc)
                    }
                }
            }
            // Build + cache the welded pad-boundary RING here (single source of truth): the terrain carve
            // (_junctionPadCarve) reads it to guarantee the whole pad footprint is a first-class carve
            // region, and the mesh (buildJunctionFootprint) reads the SAME ring so mesh == collision. Cached
            // by _networkRev with the rest of _nodeJunctions. ringMaxR = pad reach for the carve quick-reject.
            //
            // QUAL-16 (junction-flow): a deg-2 node that GOT a connector arc has NO pad — the mesh draws the
            // swept ribbon (_buildDeg2Ribbon) and never reaches the ring branch — so giving it one is pure
            // harm: _junctionPadCarve would still excavate the full ~14 m welded footprint (incl. the ~268°
            // back-gap bulb a 2-leg weld produces) at full depth, leaving a bare graded disc with only a
            // ribbon threaded through it (seed-6 1268.7,2719.4 / 1900.7,831.0 — 11–17 m of cut/fill under
            // 57–66% un-paved ring interior). The connector owns its own earthwork end to end
            // (_connectorCarve + collectConnectorSamples, which feeds the terrain skip guard), and the leg
            // ribbons are cut back only as far as the connector's own mouths — no naked gap. ring = null
            // makes every consumer (pad carve, padReachNodes, the mesh's ring branch) skip the node.
            // BUG-59 (owner ruling 2026-09-07: pave the gore to where the pavements part). Each leg of
            // a real (≥3-leg) junction is cut back to the FURTHER of the default cutback and the
            // arc at which its pavement has parted from every sibling's — the same walk the deck
            // hold uses (_legPartingReach), so the pad ends exactly where the profiles let go of the
            // plane. Mouths then never overlap, the exact weld stops self-intersecting at narrow
            // throats (which is what put 47 of 70 junctions on the 13.5 m circle-pad floor), and
            // the ring's reach becomes a property of the junction's own geometry. The ribbon mesh
            // and the marking feather read leg.cutback off the carve-arc record below.
            if (!node.deg2 && c.legs.length >= 3) {
                const cut0 = this.junctionCutbackDist()
                const reach = JN_HOLD_MAX_PLANE + 2 * halfWidth + JN_HOLD_MARGIN
                for (const a of c.legs) {
                    const e = this._network.get(a.runKey)
                    if (!e || !e.polyCum) { a.cutback = cut0; continue }
                    const sibs = []
                    for (const b of c.legs) {
                        if (b === a) continue
                        const sb = this._network.get(b.runKey)
                        if (!sb || !sb.points || !sb.polyCum) continue
                        const L = sb.polyCum[sb.polyCum.length - 1], bAtStart = b.arc < 1e-6
                        sibs.push({ pts: sb.points, cum: sb.polyCum, lo: bAtStart ? 0 : Math.max(0, L - reach), hi: bAtStart ? Math.min(L, reach) : L })
                    }
                    a.cutback = Math.max(cut0, this._legPartingReach(e, a.arc < 1e-6, sibs, JN_HOLD_MAX_PLANE))
                }
            }
            node.ring = node.deg2 ? null : this._buildJunctionRing(node)
            if (node.ring) {
                let mr = 0
                for (const rp of node.ring) { const r = Math.hypot(rp.x - c.x, rp.z - c.z); if (r > mr) mr = r }
                node.ringMaxR = mr
            }
            nodes.set(`${Math.round(c.x)},${Math.round(c.z)}`, node)
            for (const a of c.legs) {
                let arr = carveArcs.get(a.runKey); if (!arr) { arr = []; carveArcs.set(a.runKey, arr) }
                // node ref rides along so _carveDirtY can enumerate the SIBLING legs and blend their grades
                // by lateral proximity (the ruled inter-leg surface that kills the Voronoi crease). The node
                // carries pos + legs + plane; the open-rim fallback still reads node.plane in _junctionPadCarve.
                arr.push({ arc: a.arc, node, cutback: a.cutback })
            }
        }
        this._nodeJunctions = nodes
        this._junctionCarveArcs = carveArcs
        this._deg2ArcTiles = deg2ArcTiles
        this._nodeJunctionsRev = this._networkRev
        return nodes
    }

    // ── Junction pad boundary + carve (single source of truth, shared by mesh + collision) ──────
    /**
     * Assemble the welded pad-boundary RING for a node via the fallback ladder (exact weld →
     * shrunk fillets → legacy circle pad), verifying each rung with _ringSelfIntersects. Moved here
     * from RoadMeshSystem.buildJunctionFootprint so the CARVE path owns the ring; the mesh reads the
     * cached node.ring. Returns an open XZ boundary polygon or null.
     */
    _buildJunctionRing(node) {
        if (!node.legs || node.legs.length < 2) return null
        // The half-fillet weld rung is GONE (owner, 2026-08-27). Censused across the battery it
        // fired 0 times in 176 real junctions: every weld that self-intersects at full fillet also
        // self-intersects at half, because the cause is two mouth CHORDS overlapping and shrinking
        // the corner fillets does not move a mouth. Ladder is weld -> circle -> hull.
        let ring = this._junctionRingWeld(node)
        if (ring && this._ringSelfIntersects(ring)) ring = null
        if (!ring) ring = this._junctionRingLegacy(node)
        // BUG-56 B0 — THE FLOOR. Before this rung the ladder could end in nothing, and did at 27 of
        // 176 real (>=3-leg) junctions across the battery — 15 %, measured 2026-08-27. Every one of
        // them failed the same way: the exact weld SELF-INTERSECTS at both fillet scales because two
        // of the legs leave the node on the same bearing (20 of the 27 are separated by under half a
        // degree — the slowly-diverging Y this whole ticket is about), so their mouth chords overlap
        // and the boundary crosses itself. The legacy circle pad then folds those two legs into one
        // direction (it merges anything inside ~20 deg), which leaves TWO distinct mouths, and a
        // 2-mouth circle pad emits only two distinct corner points, so it returns null as well.
        // ring = null makes EVERY consumer skip the node — pad carve, padReachNodes, the mesh's pad
        // branch — while the legs stay cut back, so what shipped was a naked gap where the
        // intersection should be. A crude pad beats that, always.
        if ((!ring || ring.length < 3) && node.legs.length >= 3) ring = this._junctionRingHull(node)
        return (ring && ring.length >= 3) ? ring : null
    }

    /**
     * THE LAST RUNG (BUG-56 B0): the convex hull of every leg mouth, seeded with a half-width disc
     * at the node. Crude on purpose — it has no fillets, no throat sweep and no back-arc bulb, so a
     * junction that lands here is paved as one flat convex plaza rather than a shaped intersection.
     * What it buys is that it CANNOT FAIL: a hull is simple by construction, so _ringSelfIntersects
     * has nothing to reject, and the disc guarantees at least three distinct points and that the
     * node itself is interior even when every leg leaves on the same side.
     *
     * Landing here is a SYMPTOM, not a resolution — the legs that force it are the same
     * shallow-departure forks B4/B5/B6 are about, and as those land the population here should
     * shrink. test/pad-census.mjs prints the count so it stays visible instead of quietly becoming
     * the normal way a junction gets built.
     */
    _junctionRingHull(node) {
        const m = this._junctionMouths(node)
        if (!m) return null
        const { legs, halfWidth } = m
        const nx = node.pos.x, nz = node.pos.z
        const pts = []
        for (const l of legs) {
            pts.push({ x: l.cx - l.dz * halfWidth, z: l.cz + l.dx * halfWidth })
            pts.push({ x: l.cx + l.dz * halfWidth, z: l.cz - l.dx * halfWidth })
        }
        const D = 12
        for (let i = 0; i < D; i++) {
            const a = 2 * Math.PI * i / D
            pts.push({ x: nx + Math.cos(a) * halfWidth, z: nz + Math.sin(a) * halfWidth })
        }
        return _convexHullXZ(pts)
    }

    /**
     * QUAL-11 exact-weld pad boundary — each leg's mouth is its own run cross-section chord welded to
     * the trimmed ribbon end; corners between consecutive mouths round the throat; a wide back gap gets
     * a node-centred bulb (open sector) or a straight chord (through road). Pure fn of node + streamed
     * network (window-invariant, D-16). (Formerly RoadMeshSystem._junctionRingWeld.)
     */
    /**
     * The node's LEG MOUTHS: each leg's real cross-section centre and outward unit direction at the
     * cut-back, bearing-sorted. ONE definition shared by every rung of the ring ladder, so a
     * fallback pad is anchored to exactly the pavement the exact weld would have welded to. Returns
     * null when any leg's geometry is unusable — the whole ladder then declines together, which is
     * the honest outcome (there is nothing to build a pad against).
     */
    _junctionMouths(node) {
        const road = this
        const params = this._params
        if (!road.runPointAt || !road.runProfile || !road._network) return null
        const halfWidth = params.roadHalfWidth ?? 5
        const nx = node.pos.x, nz = node.pos.z
        const cutback = road.junctionCutbackDist ? road.junctionCutbackDist() : halfWidth * 2
        const T = cutback + halfWidth * 0.5

        const legs = []
        for (const leg of node.legs) {
            if (leg.arc === undefined || !leg.runKey) return null
            const e = road._network.get(leg.runKey)
            const cum = e?.polyCum
            const len = cum ? cum[cum.length - 1] : 0
            if (!(len > 1e-3)) return null
            const s = leg.arc < 1e-6 ? 1 : -1                       // +arc direction away from node?
            // BUG-59: the mouth sits at THIS leg's cutback — the default, or further out where the
            // leg's pavement is still overlapping a sibling's (leg.cutback, _detectNodeJunctions).
            const Tl = (leg.cutback ?? cutback) + halfWidth * 0.5
            const mouthArc = leg.arc + s * Math.min(Tl, len * 0.45)  // short node↔node run: pull the mouth in
            const c = road.runPointAt(leg.runKey, mouthArc)
            if (!c) return null
            const prof = road.runProfile(mouthArc, leg.runKey)
            let dx = prof.tx * s, dz = prof.tz * s                  // outward unit dir (away from node)
            const dl = Math.hypot(dx, dz)
            if (dl < 1e-6) return null
            dx /= dl; dz /= dl
            legs.push({ cx: c.x, cz: c.z, dx, dz, bear: Math.atan2(c.x - nx, c.z - nz), runKey: leg.runKey, mouthArc, s, len })
        }
        legs.sort((a, b) => a.bear - b.bear)
        return { legs, T, halfWidth }
    }

    _junctionRingWeld(node) {
        const params = this._params
        const nx = node.pos.x, nz = node.pos.z
        const m = this._junctionMouths(node)
        if (!m) return null
        const { legs, T, halfWidth } = m
        const n = legs.length
        // NOTE: the old "pitchfork guard" (reject when Σleg-dirs / n > 0.55) was removed — it rejected
        // valid one-sided tridents whose weld is a clean, non-self-intersecting pad (seed-6 node 253,-131).
        // The real correctness gate is _ringSelfIntersects() in _buildJunctionRing.

        const edgePt = (l, side) => ({ x: l.cx + (-l.dz) * side * halfWidth, z: l.cz + (l.dx) * side * halfWidth })
        const filletR = params.roadFilletRadius ?? 5
        const ring = []
        for (let i = 0; i < n; i++) {
            const A = legs[i], B = legs[(i + 1) % n]
            // Mouth chord of A: arriving-corner edge (+1) → departing-corner edge (−1) — the exact weld.
            ring.push(edgePt(A, 1))
            const eA = edgePt(A, -1)
            ring.push(eA)
            const eB = edgePt(B, 1)
            let gap = B.bear - A.bear
            while (gap <= 0) gap += 2 * Math.PI
            if (gap > STRAIGHT_GAP && n >= 3) {
                // Wide back gap: through-road back (anti-parallel legs) keeps a straight chord; an OPEN
                // sector gets a node-centred bulb through the roadless gap so the whole throat is tiled.
                if (A.dx * B.dx + A.dz * B.dz < -0.85) continue   // through-road back: straight chord
                for (const p of this._nodeBackArc(nx, nz, eA, eB, A.bear + gap / 2)) ring.push(p)
                continue
            }
            // A narrow Y-throat needs no special rung any more (BUG-59): its two mouths sit past the
            // point where the ribbons parted (per-leg cutback, _detectNodeJunctions), so the facing
            // mouth edges are already clear of each other and the ordinary crotch fillet below
            // closes the gore at the parting point.
            // Deg-2 kink corners: keep the legacy farther-from-node pick, but with a DIRECTION-CORRECT
            // node arc — _nodeBackArc sweeps through THIS corner's own angular sector (midBear), where
            // the old short-way _nodeCornerArc ran a reflex corner's arc through the OPPOSITE (crotch)
            // sector and left a hairpin apex unpaved (seed-7 709,-256, ~13 m hole). A kink's convex
            // side needs the outward arc (a straight-chord join cuts the bend's sagitta out of the
            // pavement); its concave side keeps the corner join. n≥3 never lands here with a reflex
            // gap (STRAIGHT_GAP < π), so this stays a deg-2-only rule.
            if (n === 2) {
                const corner = this._cornerJoin(eA, A, eB, B, filletR, T)
                const arc = this._nodeBackArc(nx, nz, eA, eB, A.bear + gap / 2)
                const minR = (pts) => pts.reduce((m, p) => Math.min(m, Math.hypot(p.x - nx, p.z - nz)), Infinity)
                for (const p of (minR(corner) < minR(arc) - 1e-3 ? arc : corner)) ring.push(p)
                continue
            }
            // Road-side crotch: INTERIOR fillet — tuck the pad boundary concavely into the crotch,
            // tangent to both ribbon edges (a real curb return). The old node-centred OUTWARD-arc
            // override made every corner bulge; the "exposed flat throat" it guarded against is covered
            // by the pad fill itself (mouths sit past the parting point, BUG-59). Prefer the TRUE-edge
            // walk (_cornerEdgeFillet): on curved legs the straight edge-LINE intersection _cornerJoin
            // uses lands wrong (or misses) and un-tucks the corner; the walk follows the real ribbon
            // edges to the real crotch apex. _ringSelfIntersects remains the gate.
            const ce = this._cornerEdgeFillet(A, B, halfWidth, filletR, T)
            if (ce) { for (const p of ce) ring.push(p); continue }
            for (const p of this._cornerJoin(eA, A, eB, B, filletR, T)) ring.push(p)
        }
        // Drop consecutive duplicates (incl. the wrap seam).
        const out = []
        for (const p of ring) {
            const q = out[out.length - 1]
            if (!q || Math.hypot(p.x - q.x, p.z - q.z) > 0.05) out.push(p)
        }
        while (out.length >= 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].z - out[out.length - 1].z) <= 0.05) out.pop()
        return out.length >= 3 ? out : null
    }

    /**
     * Corner points joining leg A's departing ribbon-edge line to leg B's arriving edge line: a true
     * tangent-arc fillet where the edge lines intersect node-side, else a tangent-matched cubic Hermite.
     * (Formerly RoadMeshSystem._cornerJoin — pure geometry.)
     */
    _cornerJoin(eA, A, eB, B, filletR, T) {
        const qx = eA.x - eB.x, qz = eA.z - eB.z
        const det = B.dx * A.dz - A.dx * B.dz
        if (Math.abs(det) > 1e-4) {
            const t = (B.dx * qz - B.dz * qx) / det
            const u = (A.dx * qz - A.dz * qx) / det
            const tMax = T * 3.5
            if (t > 0.5 && u > 0.5 && t < tMax && u < tMax) {
                const C = { x: eA.x - A.dx * t, z: eA.z - A.dz * t }
                const cosPhi = Math.max(-1, Math.min(1, A.dx * B.dx + A.dz * B.dz))
                const phi = Math.acos(cosPhi)
                if (phi > 0.06 && phi < Math.PI - 0.06) {
                    const tanHalf = Math.tan(phi / 2)
                    const r = Math.min(filletR, Math.min(t, u) * tanHalf * 0.95)
                    if (r < 0.15) return [C]
                    const L = r / tanHalf
                    const TA = { x: C.x + A.dx * L, z: C.z + A.dz * L }
                    const TB = { x: C.x + B.dx * L, z: C.z + B.dz * L }
                    let bx = A.dx + B.dx, bz = A.dz + B.dz
                    const bl = Math.hypot(bx, bz) || 1
                    const h = r / Math.sin(phi / 2)
                    const O = { x: C.x + (bx / bl) * h, z: C.z + (bz / bl) * h }
                    const a0 = Math.atan2(TA.x - O.x, TA.z - O.z)
                    let dAng = Math.atan2(TB.x - O.x, TB.z - O.z) - a0
                    while (dAng > Math.PI) dAng -= 2 * Math.PI
                    while (dAng < -Math.PI) dAng += 2 * Math.PI
                    const steps = Math.max(2, Math.min(16, Math.ceil(Math.abs(dAng) * r / 1.2)))
                    const arc = [TA]
                    for (let k = 1; k < steps; k++) {
                        const ang = a0 + dAng * (k / steps)
                        arc.push({ x: O.x + Math.sin(ang) * r, z: O.z + Math.cos(ang) * r })
                    }
                    arc.push(TB)
                    return arc
                }
            }
        }
        const dist = Math.hypot(eB.x - eA.x, eB.z - eA.z)
        if (dist < 0.05) return []
        const m0x = -A.dx * dist, m0z = -A.dz * dist
        const m1x = B.dx * dist,  m1z = B.dz * dist
        const K = Math.max(4, Math.min(16, Math.ceil(dist / 1.5)))
        const pts = []
        for (let k = 1; k < K; k++) {
            const tt = k / K, t2 = tt * tt, t3 = t2 * tt
            const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + tt, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2
            pts.push({
                x: h00 * eA.x + h10 * m0x + h01 * eB.x + h11 * m1x,
                z: h00 * eA.z + h10 * m0z + h01 * eB.z + h11 * m1z,
            })
        }
        return pts
    }

    /**
     * Interior corner via TRUE ribbon edges: walk leg A's departing edge (side −1) and leg B's
     * arriving edge (side +1) from the node out to their mouths along the real curved centerlines
     * (runPointAt/runProfile — the mouth frame family, walked inbound of the mouths), find
     * the OUTERMOST crossing of the two edge polylines (the real crotch apex), and join with a small
     * tangent fillet built from the crossing's LOCAL edge directions. Straight edge-LINE intersection
     * (_cornerJoin) gets this wrong on curved legs — three of four corners at seed-6 (939,−1410)
     * missed their fillet window and fell to the fat Hermite, leaving the pad bulged. Returns ring
     * points strictly between eA and eB (mouth edge points, pushed by the caller): down A's true edge
     * → fillet → back up B's true edge. null when the edges never cross inside the walk (diverging
     * gore — caller falls back to _cornerJoin). Pure fn of the streamed network (D-16).
     */
    _cornerEdgeFillet(A, B, halfWidth, filletR, T) {
        const STEP = 1.0
        const walkIn = (l, side) => {
            const a0 = l.s > 0 ? 0 : l.len            // node-end arc of this leg
            const extMax = Math.abs(l.mouthArc - a0)  // mouth sits at ext = extMax
            if (!(extMax > STEP)) return null
            const pts = []
            for (let ext = 0; ; ext += STEP) {
                const e = Math.min(ext, extMax)
                const a = a0 + l.s * e
                const c = this.runPointAt(l.runKey, a)
                if (!c) return null
                const prof = this.runProfile(a, l.runKey)
                let dx = prof.tx * l.s, dz = prof.tz * l.s
                const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl
                pts.push({ x: c.x + (-dz) * side * halfWidth, z: c.z + dx * side * halfWidth, ext: e, dx, dz })
                if (e >= extMax) break
            }
            return pts.length >= 2 ? pts : null
        }
        const pA = walkIn(A, -1), pB = walkIn(B, +1)
        if (!pA || !pB) return null
        // Outermost polyline crossing (max combined ext = nearest the mouths) — the crotch apex.
        let best = null
        for (let i = 0; i < pA.length - 1; i++) for (let j = 0; j < pB.length - 1; j++) {
            const ax = pA[i].x, az = pA[i].z, bx = pA[i + 1].x, bz = pA[i + 1].z
            const cx = pB[j].x, cz = pB[j].z, dx = pB[j + 1].x, dz = pB[j + 1].z
            const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx)
            if (Math.abs(den) < 1e-9) continue
            const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den
            const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den
            if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) continue
            const extA = pA[i].ext + t * (pA[i + 1].ext - pA[i].ext)
            const extB = pB[j].ext + u * (pB[j + 1].ext - pB[j].ext)
            if (!best || extA + extB > best.extA + best.extB) best = { extA, extB, x: ax + t * (bx - ax), z: az + t * (bz - az) }
        }
        if (!best) return null
        const extMaxA = pA[pA.length - 1].ext, extMaxB = pB[pB.length - 1].ext
        // Hand the fillet off to the straight-line builder a few metres up each edge from the apex,
        // using the LOCAL sample positions/tangents there (the edges are locally straight over ≤6 m).
        const hand = Math.min(6, (extMaxA - best.extA) * 0.8, (extMaxB - best.extB) * 0.8)
        if (hand < 0.5) return [{ x: best.x, z: best.z }]   // apex at the mouths: sharp corner point
        let ia = pA.length - 1; while (ia > 0 && pA[ia - 1].ext >= best.extA + hand) ia--
        let ib = pB.length - 1; while (ib > 0 && pB[ib - 1].ext >= best.extB + hand) ib--
        const hA = pA[ia], hB = pB[ib]
        const corner = this._cornerJoin(hA, hA, hB, hB, filletR, T)
        const out = []
        for (let i = pA.length - 2; i >= ia; i--) out.push(pA[i])   // down A's edge (mouth pt = eA, already pushed)
        for (const p of corner) out.push(p)
        for (let j = ib; j <= pB.length - 2; j++) out.push(pB[j])   // back up B's edge (eB pushed next)
        return out
    }

    /** Node-centred OUTWARD arc across an OPEN back sector (LONG way through the roadless gap). Detours
     *  the boundary around the node so the whole throat is tiled (one-sided trident). (Formerly _nodeBackArc.) */
    _nodeBackArc(nx, nz, eA, eB, midBear) {
        const rA = Math.hypot(eA.x - nx, eA.z - nz), rB = Math.hypot(eB.x - nx, eB.z - nz)
        const r = (rA + rB) * 0.5
        const bA = Math.atan2(eA.x - nx, eA.z - nz)
        const bB = Math.atan2(eB.x - nx, eB.z - nz)
        const norm = (a) => { while (a < 0) a += 2 * Math.PI; while (a >= 2 * Math.PI) a -= 2 * Math.PI; return a }
        const dPos = norm(bB - bA)
        const dB = (norm(midBear - bA) < dPos) ? dPos : dPos - 2 * Math.PI
        const steps = Math.max(2, Math.min(20, Math.ceil(Math.abs(dB) * r / 1.2)))
        const pts = []
        for (let s = 1; s < steps; s++) { const bear = bA + dB * (s / steps); pts.push({ x: nx + Math.sin(bear) * r, z: nz + Math.cos(bear) * r }) }
        return pts
    }

    /** XZ self-intersection test for an assembled pad boundary. (Formerly _ringSelfIntersects.) */
    _ringSelfIntersects(ring) {
        const m = ring.length
        const cross = (ax, az, bx, bz) => ax * bz - az * bx
        for (let i = 0; i < m; i++) {
            const a = ring[i], b = ring[(i + 1) % m]
            for (let j = i + 2; j < m; j++) {
                if (i === 0 && j === m - 1) continue
                const c = ring[j], d = ring[(j + 1) % m]
                const d1 = cross(b.x - a.x, b.z - a.z, c.x - a.x, c.z - a.z)
                const d2 = cross(b.x - a.x, b.z - a.z, d.x - a.x, d.z - a.z)
                const d3 = cross(d.x - c.x, d.z - c.z, a.x - c.x, a.z - c.z)
                const d4 = cross(d.x - c.x, d.z - c.z, b.x - c.x, b.z - c.z)
                if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return true
            }
        }
        return false
    }

    /** QUAL-10 circle-pad boundary — the fallback ladder's last rung. (Formerly _junctionRingLegacy.) */
    _junctionRingLegacy(node) {
        const params = this._params
        const halfWidth = params.roadHalfWidth ?? 5
        const nx = node.pos.x
        const nz = node.pos.z

        const legs = []
        for (const leg of node.legs) {
            let m = null
            for (const e of legs) { if (e.dir.x * leg.dir.x + e.dir.z * leg.dir.z > 0.94) { m = e; break } }
            if (m) { m.dir.x += leg.dir.x; m.dir.z += leg.dir.z; const L = Math.hypot(m.dir.x, m.dir.z) || 1; m.dir.x /= L; m.dir.z /= L }
            else legs.push({ dir: { x: leg.dir.x, z: leg.dir.z } })
        }
        legs.sort((a, b) => Math.atan2(a.dir.x, a.dir.z) - Math.atan2(b.dir.x, b.dir.z))
        const n = legs.length
        if (n < 2) return null
        let sx = 0, sz = 0
        for (const l of legs) { sx += l.dir.x; sz += l.dir.z }
        if (Math.hypot(sx, sz) / n > 0.55) return null

        const cutback = this.junctionCutbackDist ? this.junctionCutbackDist() : halfWidth * 2
        // BUG-59: the fallback disc reaches at least as far as the furthest leg's parting point.
        const T = Math.max(cutback, ...node.legs.map((l) => l.cutback ?? cutback)) + halfWidth * 0.5
        let minHalf = Math.PI / 2
        for (let i = 0; i < n; i++) {
            const a = legs[i].dir, b = legs[(i + 1) % n].dir
            const dot = Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z))
            minHalf = Math.min(minHalf, Math.acos(dot) * 0.5)
        }
        const flareCap = Math.max(halfWidth, T * Math.sin(minHalf) * 0.9)
        const flareHW = Math.min(halfWidth * LEGACY_PAD_FLARE, flareCap)
        const legEdge = (leg, side) => {
            const d = leg.dir
            return { x: nx + d.x * T + (-d.z) * side * flareHW, z: nz + d.z * T + (d.x) * side * flareHW }
        }
        const faceSide = (leg, other) =>
            ((-leg.dir.z) * other.dir.x + (leg.dir.x) * other.dir.z) >= 0 ? 1 : -1

        const ARC_SAMPLES = 5
        const poly = []
        for (let i = 0; i < n; i++) {
            const legA = legs[i]
            const legB = legs[(i + 1) % n]
            const legP = legs[(i - 1 + n) % n]
            poly.push(legEdge(legA, faceSide(legA, legP)))
            const eA = legEdge(legA, faceSide(legA, legB))
            poly.push(eA)
            const eB = legEdge(legB, faceSide(legB, legA))
            let gap = Math.atan2(legB.dir.x, legB.dir.z) - Math.atan2(legA.dir.x, legA.dir.z)
            while (gap < 0) gap += 2 * Math.PI
            while (gap > 2 * Math.PI) gap -= 2 * Math.PI
            const wide = Math.min(gap, 2 * Math.PI - gap) > STRAIGHT_GAP
            if (!wide) {
                const rA = Math.hypot(eA.x - nx, eA.z - nz), rB = Math.hypot(eB.x - nx, eB.z - nz)
                const r = (rA + rB) * 0.5
                const bA = Math.atan2(eA.x - nx, eA.z - nz)
                let dB = Math.atan2(eB.x - nx, eB.z - nz) - bA
                while (dB >  Math.PI) dB -= 2 * Math.PI
                while (dB < -Math.PI) dB += 2 * Math.PI
                for (let s = 1; s < ARC_SAMPLES; s++) {
                    const bear = bA + dB * (s / ARC_SAMPLES)
                    poly.push({ x: nx + Math.sin(bear) * r, z: nz + Math.cos(bear) * r })
                }
            }
        }
        if (poly.length < 3) return null
        const ring0 = []
        for (const p of poly) {
            const q = ring0[ring0.length - 1]
            if (!q || Math.hypot(p.x - q.x, p.z - q.z) > 0.05) ring0.push(p)
        }
        while (ring0.length >= 2 && Math.hypot(ring0[0].x - ring0[ring0.length - 1].x, ring0[0].z - ring0[ring0.length - 1].z) <= 0.05) ring0.pop()
        return ring0.length >= 3 ? ring0 : null
    }

    /**
     * Signed XZ distance from an open boundary ring to (x,z): NEGATIVE inside, POSITIVE outside (= min
     * distance to any boundary edge, incl. the implicit closing edge). Even-odd point-in-polygon for the
     * sign; per-segment closest-point for the magnitude.
     */
    _signedRingDist(ring, x, z) {
        const n = ring.length
        let inside = false, minD2 = Infinity
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = ring[i].x, zi = ring[i].z, xj = ring[j].x, zj = ring[j].z
            if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside
            const dx = xj - xi, dz = zj - zi
            const l2 = dx * dx + dz * dz || 1
            let t = ((x - xi) * dx + (z - zi) * dz) / l2
            t = t < 0 ? 0 : t > 1 ? 1 : t
            const px = xi + t * dx, pz = zi + t * dz
            const d2 = (x - px) * (x - px) + (z - pz) * (z - pz)
            if (d2 < minD2) minD2 = d2
        }
        const d = Math.sqrt(minD2)
        return inside ? -d : d
    }

    /**
     * Junction PAD carve at world (wx,wz): makes the entire welded pad footprint (node.ring, incl. the
     * back-arc bulb) a first-class carve region so mesh == collision everywhere on the pad — not just
     * along the leg corridors. It only EXTENDS COVERAGE; the design SURFACE it carves to is the SAME
     * graded apron the pad MESH rides — sampleRoadTopY − clearance (= _carveDirtY, the FEAT-19-graded,
     * plane-blended surface), falling back to the fitted pad plane only where no run resolves (the far
     * open-side rim). So where the leg carve already covers, pad designY == leg designY (no seam, no
     * mesh/physics step on climbing/descending legs); where the leg carve returned null (beyond its toe
     * or outside every run footprint — the open sector), pad supplies full coverage. INSIDE the ring
     * blendW = 1; OUTSIDE it ramps designY → raw over shoulder + fill/cut toe (the SAME run params
     * _carveCrossSection uses), driven by distance outside the ring. DIRT convention (clearance
     * subtracted), composed with the leg carve by _mergeCarve. Returns {blendW,gradeY}|null (raw terrain).
     */
    _junctionPadCarve(wx, wz, rawAmp) {
        if (this._nodeJunctionsRev !== this._networkRev) this._detectNodeJunctions()
        const nodes = this._nodeJunctions
        if (!nodes || nodes.size === 0) return null
        const p = this._params
        const shoulderWidth = p.roadShoulderWidth   ?? 2.5
        const fillSlope     = p.roadFillSlope        ?? 3.0
        const cutSlope      = p.roadCutSlope         ?? 1.0
        const maxToe        = p.roadMaxEmbankmentToe ?? 10
        const clearanceMargin = p.roadClearanceMargin ?? 0.25
        const reachCap = PAD_RIM_HOLD + shoulderWidth + maxToe

        // Pick the ring this point is most inside (or nearest outside) among nearby nodes.
        let best = null, bestSd = Infinity
        for (const node of nodes.values()) {
            if (!node.ring) continue
            const cd = Math.hypot(wx - node.pos.x, wz - node.pos.z)
            if (cd > (node.ringMaxR ?? 0) + reachCap + 1) continue
            const sd = this._signedRingDist(node.ring, wx, wz)
            if (sd < bestSd) { bestSd = sd; best = node }
        }
        if (!best) return null

        // Design surface = the resolve-FREE node surface (_nodeSurfaceTop): the SAME ruled inter-leg
        // blend the leg cross-sections ride (_carveDirtY), but based on the node's OWN nearest leg
        // branch instead of a free _resolveRoadSurface — a pure, position-continuous function of the
        // node record. PERF-25: this replaced the 5-point neighbourhood-MIN of sampleRoadTopY (5 full
        // resolves + 5 blends per physics sample, unmemoizable under mm suspension jitter). The min's
        // crease duck armored against free-resolve tears (adjacent samples resolving to different,
        // possibly UNRELATED runs); with the base pinned to the node's own legs that tear source is
        // gone, and the fixed PAD_DIRT_EXTRA margin (feathered with the rim ramp) keeps the dirt under
        // the asphalt across a terrain cell. Fall back to the fitted pad plane where no leg is in
        // range (degenerate strands). Mesh (_buildCarveTable) evaluates the same function ⇒
        // mesh == collision unchanged as an invariant.
        const planeTop = best.plane ? this._padPlaneY(best.plane, wx, wz) : best.nodeY
        const ns = this._nodeSurfaceTop(best, wx, wz)
        const topC = (ns != null && isFinite(ns)) ? ns : planeTop
        // RIM HOLD: keep full pad depth (blendW=1) out to PAD_RIM_HOLD beyond the ring, not just inside
        // it. The terrain grid is 1 m; without the hold, a vertex just OUTSIDE the ring already rides
        // partway up the cut bank, and the triangle it shares with an inside vertex interpolates ABOVE
        // the pad surface up to a cell-diagonal (~1.4 m) INSIDE the ring. Holding full depth for ≥ one
        // cell diagonal guarantees every triangle touching the pad interior has ALL its vertices at the
        // deepened design dirt, so the fill/cut feather starts one cell out. padTopY (inside the ring
        // only) is the asphalt surface physics rides — see the pad overlay in _sampleCarveWorld.
        // padTopY carries the apron lift so it is byte-identical to the pad MESH vertex height
        // (road-mesh.js samplePadY = _nodeSurfaceTop + roadJunctionApronLift); the design DIRT below
        // deliberately does not (a lifted apron just gets more clearance under it). Lift is 0 by
        // default, so this is a no-op unless the user raises the slider.
        const padTopY = bestSd <= 0 ? topC + (p.roadJunctionApronLift ?? 0) : null
        if (bestSd <= PAD_RIM_HOLD) return { blendW: 1.0, gradeY: topC - clearanceMargin - PAD_DIRT_EXTRA, padTopY, padSd: bestSd }

        // Outside the hold band: ramp designY → raw over shoulder + fill/cut toe, mirroring
        // _carveCrossSection (which ramps beyond carveHalfWidth). `over` = distance past the hold.
        const designY = topC - clearanceMargin
        const over = bestSd - PAD_RIM_HOLD
        const fillReach = shoulderWidth + Math.max(0, designY - rawAmp) * fillSlope
        const cutReach  = shoulderWidth + Math.max(0, rawAmp - designY) * cutSlope
        const beyondToe = Math.min(Math.max(fillReach, cutReach), maxToe)
        if (over >= beyondToe) return null
        const ramp = Math.max(shoulderWidth, beyondToe)
        const u = Math.min(1, over / ramp)
        // Feather PAD_DIRT_EXTRA away with the same smoothstep so the dirt is continuous at the hold
        // boundary (full depth there) and the toe still lands exactly on raw terrain.
        const w = 1.0 - u * u * (3.0 - 2.0 * u)
        return { blendW: w, gradeY: designY - PAD_DIRT_EXTRA * w, padTopY: null }
    }

    /**
     * PERF-25: the node's asphalt-top surface at (wx,wz), resolve-free. Projects the query onto the
     * node's OWN legs (cached windows + the per-leg single-slot memo — a _sampleCarveWorld query
     * shares feet with the leg cross-section's ruled blend), picks the nearest branch as the base
     * cross-section, and evaluates the SAME _carveDirtY ruled blend the ribbons ride — no
     * _resolveRoadSurface. Where the nearest branch coincides with what a free resolve would pick
     * (everywhere except the old degenerate-node tear lines) this equals the old sampleRoadTopY within
     * float noise; at the tear lines it is the CONTINUOUS leg-based value instead of the jumping
     * free-resolve one. Returns asphalt top (clearance included) or null when no leg branch is in
     * range (caller falls back to the pad plane).
     *
     * The nearest-branch pick only sets the crown/camber fold's frame (signedLat, arcS, runKey); the
     * GRADE comes from _carveDirtY's ruled blend, which enumerates every leg and is a pure function of
     * position. So the branch switch is not itself a crease source — the pad's 1.3 m knee was in the
     * ruled blend's gap clamp (see RULE_SOFT), and with that smoothed the switch measures as no seam
     * at all (a runner-up cross-section blend on top of it moved the pad field by < 1 mm at every
     * seed-6 site, so it is deliberately NOT paid for here).
     */
    _nodeSurfaceTop(node, wx, wz) {
        const legs = node.legs
        if (!legs || !this._network) return null
        let bestD2 = Infinity, bestPr = null, bestLeg = null, bestNe = null
        for (const leg of legs) {
            const ne = this._network.get(leg.runKey)
            if (!ne) continue
            const prs = this._projectLegMemo(ne, leg, wx, wz)
            if (!prs) continue
            for (let bi = 0; bi < prs.length; bi++) {
                if (prs[bi].d2 < bestD2) { bestD2 = prs[bi].d2; bestPr = prs[bi]; bestLeg = leg; bestNe = ne }
            }
        }
        const clearanceMargin = this._params.roadClearanceMargin ?? 0.25
        let runTop = null
        if (bestPr) {
            // Reconstruct the winning foot's frame from its recorded (segment, fraction) — the exact
            // values the projection computed, no re-walk.
            const pts = bestNe.points
            const i = Math.min(bestPr.i, pts.length - 2)
            const ax = pts[i].x, az = pts[i].z
            const ex = pts[i + 1].x - ax, ez = pts[i + 1].z - az
            const segLen = Math.hypot(ex, ez) || 1e-8
            const tx = ex / segLen, tz = ez / segLen
            const fx = ax + bestPr.t * ex, fz = az + bestPr.t * ez
            const signedLat = (wx - fx) * tz - (wz - fz) * tx
            runTop = this._carveDirtY(signedLat, bestPr.arcS, bestLeg.runKey, 1, wx, wz) + clearanceMargin
        }
        // QUAL-16 deg-2 elbows: compose the kink CONNECTOR overlay exactly as sampleRoadTopY does —
        // the connector's flat graded bench DOMINATES its own core and feathers to the leg field at
        // its toe. Without this the elbow pad carved to the raw 2-leg ruled blend, metres off the
        // bench on steep kinks (measured 4.1 m at seed-6 683,-417). Cheap: no resolve involved.
        const co = this._connectorCarve(wx, wz, this._coarseH(wx, wz) * (this._params.terrainAmplitude ?? 1))
        if (co) {
            const coTop = co.gradeY + clearanceMargin
            const w = runTop != null ? co.blendW * co.dom : 1
            return runTop != null ? coTop * w + runTop * (1 - w) : coTop
        }
        return runTop
    }

    /**
     * Compose the leg-corridor carve `a` (_carveCrossSection) with the junction-pad carve `b`
     * (_junctionPadCarve), both DIRT-convention {blendW,gradeY}|null. The pad only EXTENDS COVERAGE: when
     * the leg carve is present, keep ITS gradeY — that cross-section is C0 laterally (BUG-15) and pinned
     * to the resolved run, so the pad (which does its own, possibly different, resolve) must NOT override
     * it or it tears the shoulder (shoulder-lateral-continuity). Take the MAX blendW so the pad fills the
     * carved core over the WHOLE footprint (never LESS coverage than either alone). The pad supplies
     * gradeY ONLY where the leg carve is absent (nr null / beyond the leg toe — the open-side rim), which
     * is exactly the surface the pad MESH rides there (sampleRoadTopY / plane), so mesh == collision.
     */
    _mergeCarve(a, b, duckCap = PAD_DUCK_CAP) {
        if (!a) return b || null
        if (!b) return a
        // Where the pad is at FULL depth (inside ring + rim hold, blendW 1) take the LOWER dirt: the
        // pad's crease-ducking design (topMin − clearance − PAD_DIRT_EXTRA) must not be overridden by
        // the leg's shallower cross-section or the tan slivers return. min(a,b) is continuous (both
        // fields are), never RAISES dirt, and only applies under/beside the asphalt pad; everywhere the
        // pad ramp is partial the leg gradeY still wins (its cross-section is C0 laterally, BUG-15).
        // PAD_DUCK_CAP bounds how far b (a free resolve) may drag a pinned cross-section down, so the
        // top field's pre-existing degenerate-node tears can't tear an otherwise-smooth shoulder; and
        // the duck FADES with b's own blendW (1 on the pad + rim hold, smoothstepping to 0 at the pad
        // toe) so there is no step where the full-depth band ends — the duck is C0 everywhere.
        const low = Math.max(Math.min(a.gradeY, b.gradeY), a.gradeY - duckCap)
        const gradeY = a.gradeY + (low - a.gradeY) * b.blendW
        return { blendW: Math.max(a.blendW, b.blendW), gradeY, padTopY: b.padTopY ?? null }
    }

    /**
     * PAD reach nodes for the terrain carve-table skip guard: {x,z,reach}. A vertex within `reach`
     * of one of these may be pad-carved even if it's beyond the nearest road SAMPLE (a junction's
     * open-side rim, or a POI lay-by, has no ribbon nearby), so the sample-distance skip must not
     * cull it. Two sources, both listed here so terrain.js has one thing to ask for:
     *   • junction pads (QUAL-10) — reach = ringMaxR + shoulder + maxToe, cached with _nodeJunctions.
     *   • QUAL-16 deg-2 CONNECTORS (junction-flow) — reach = deg2MaxR + the same apron. These nodes
     *     have no ring (the connector replaced the pad), but they still own their ground for both
     *     consumers: src/poi.js must not stack a lay-by on a bend fillet, and the terrain skip guard
     *     must not cull the connector's outer rim.
     *   • FEAT-46 POI lay-by pads — reach = the stadium's own half-diagonal + the same apron.
     * Also the reject list src/poi.js sites against: a POI never stacks on a junction's ground.
     */
    padReachNodes() {
        if (this._nodeJunctionsRev !== this._networkRev) this._detectNodeJunctions()
        const out = []
        const p = this._params
        const extra = PAD_RIM_HOLD + (p.roadShoulderWidth ?? 2.5) + (p.roadMaxEmbankmentToe ?? 10)
        if (this._nodeJunctions) for (const n of this._nodeJunctions.values()) {
            if (n.ring) out.push({ x: n.pos.x, z: n.pos.z, reach: (n.ringMaxR ?? 0) + extra })
            else if (n.deg2) out.push({ x: n.pos.x, z: n.pos.z, reach: (n.deg2MaxR ?? 0) + extra })
        }
        if (this._padsAll) for (const q of this._padsAll) {
            out.push({ x: q.x, z: q.z, reach: Math.hypot(q.halfLen, q.halfWid) + extra })
        }
        return out
    }

    /**
     * FEAT-46: hand the story layer's POI lay-by pads to the carve. Pass null/empty to release them.
     *
     * Called ONCE per story-mode entry, after the region is routed and frozen — never during
     * routing, and never in free roam. Bumping _networkRev is deliberately NOT done here: pads do
     * not change the network, and the junction/route caches keyed by that rev must not be dropped.
     * What DOES need invalidating is the physics carve hint memo, whose entries were sampled
     * before the pads existed.
     *
     * @param {Array<{x,z,y,tx,tz,halfLen,halfWid}>|null} pads
     */
    setPoiPads(pads) {
        this._poiPads = (pads && pads.length) ? pads : null
        this._syncPads()
    }

    /**
     * FEAT-45: hand the story layer's CAMP pads to the same carve. Identical record shape to a POI
     * pad ({x,z,y,tx,tz,halfLen,halfWid}); the only difference is when they arrive — a camp bench is
     * dug mid-run, when the player makes camp, so the caller must re-bake the covering chunks after
     * calling this (main.js does it behind the make-camp fade). Held separately from the POI pads
     * only so poi.js's `setPoiPads(null)` rebuild-clear cannot take a camp with it.
     */
    setCampPads(pads) {
        this._campPads = (pads && pads.length) ? pads : null
        this._syncPads()
    }

    /**
     * Rebuild the merged pad list every consumer reads (_poiPadCarve, poiPadBlocked, padReachNodes).
     * Bumping _networkRev is deliberately NOT done here: pads do not change the network, and the
     * junction/route caches keyed by that rev must not be dropped. What DOES need invalidating is the
     * physics carve hint memo, whose entries were sampled before the pads existed.
     */
    _syncPads() {
        const all = [...(this._poiPads || []), ...(this._campPads || [])]
        this._padsAll = all.length ? all : null
        this._hintCache = null
    }

    /**
     * FEAT-46: is (wx,wz) on (or within `keepOut` of) a POI lay-by pad? The prop scatter treats a
     * pad exactly like the road — a tree growing out of the pullout blocks the only thing a pullout
     * is for, and the bench is graded ground, not forest floor. Same stadium test the carve uses.
     * Always false in free roam (no pads set), so the scatter is unchanged there.
     */
    poiPadBlocked(wx, wz, keepOut = 0) {
        const pads = this._padsAll
        if (!pads) return false
        for (const q of pads) {
            const dx = wx - q.x, dz = wz - q.z
            const rough = q.halfLen + keepOut
            if (dx > rough || dx < -rough || dz > rough || dz < -rough) continue
            const a = Math.max(0, q.halfLen - q.halfWid)
            let t = dx * q.tx + dz * q.tz
            t = t < -a ? -a : t > a ? a : t
            const px = dx - q.tx * t, pz = dz - q.tz * t
            if (Math.hypot(px, pz) - q.halfWid <= keepOut) return true
        }
        return false
    }

    /**
     * FEAT-46: the POI lay-by carve at world (wx,wz) — a flat graded bench beside the road, the
     * pull-off an orange marker cube stands on. Same shape as _junctionPadCarve (full depth inside
     * the footprint + PAD_RIM_HOLD, then the shared shoulder + fill/cut ramp to the toe) with three
     * deliberate differences:
     *
     *  1. THE FOOTPRINT IS A STADIUM, not a ring — a pullout is longer than it is wide, and it is
     *     aligned to the road tangent. Signed distance = dist-to-segment − halfWid.
     *  2. THE DESIGN SURFACE IS FLAT at pad.y − clearanceMargin, where pad.y is the road's asphalt
     *     top sampled AT THE SHOULDER EDGE on the pad's side (src/poi.js). So the bench is flush
     *     with the carved shoulder dirt exactly where they meet: you drive onto it, no curb. There
     *     is no asphalt mesh over a dirt pullout, so it emits NO padTopY — physics rides the same
     *     carved dirt the mesh draws, and mesh == collision holds with nothing extra to keep in sync.
     *  3. IT IS GATED OUT OF THE ROAD'S OWN CROSS-SECTION by `latDist` (distance to the resolved
     *     run). Authority is zero at the shoulder edge and ramps to full ROAD_FEATHER metres beyond,
     *     which is what makes the ratified guarantee — "the same seed drives identically in free roam
     *     and story mode" — true BY CONSTRUCTION rather than by tuning. A pad can never move the
     *     ribbon, its shoulder, or its camber.
     *
     * Returned `dom` is the composition weight (see the call sites): the bench DOMINATES its own
     * footprint and feathers back to the leg cross-section at its rim. It cannot use _mergeCarve —
     * that gives the leg priority everywhere it reaches, which on a fill embankment is the whole
     * pad, and the bench would silently do nothing.
     *
     * FEAT-45: camp benches ride this exact function (they are just pads in `_padsAll`), which is
     * why "making camp never moves the road" needs no separate proof — difference (3) covers them.
     *
     * @returns {{blendW:number, gradeY:number, dom:number}|null} DIRT convention, null = untouched.
     */
    _poiPadCarve(wx, wz, rawAmp, latDist) {
        const pads = this._padsAll
        if (!pads) return null
        const p = this._params
        const halfWidth       = p.roadHalfWidth       ?? 5
        const shoulderWidth   = p.roadShoulderWidth   ?? 2.5
        const fillSlope       = p.roadFillSlope       ?? 3.0
        const cutSlope        = p.roadCutSlope        ?? 1.0
        const maxToe          = p.roadMaxEmbankmentToe ?? 10
        const clearanceMargin = p.roadClearanceMargin ?? 0.25

        // Road gate: no authority at all inside the ribbon + shoulder, full authority ROAD_FEATHER
        // beyond it. smoothstep so the handoff is C1, not just C0.
        const gateLat = halfWidth + shoulderWidth
        if (latDist <= gateLat) return null
        const gu = Math.min(1, (latDist - gateLat) / POI_ROAD_FEATHER)
        const gate = gu * gu * (3 - 2 * gu)

        const reachCap = PAD_RIM_HOLD + shoulderWidth + maxToe
        let best = null, bestSd = Infinity
        for (const q of pads) {
            const dx = wx - q.x, dz = wz - q.z
            const rough = q.halfLen + reachCap + 1
            if (dx > rough || dx < -rough || dz > rough || dz < -rough) continue
            // Stadium: project onto the pad's spine (the segment ± (halfLen − halfWid) along the
            // tangent), then subtract the half width. Degenerate halfLen ≤ halfWid → a disc.
            const a = Math.max(0, q.halfLen - q.halfWid)
            let t = dx * q.tx + dz * q.tz
            t = t < -a ? -a : t > a ? a : t
            const px = dx - q.tx * t, pz = dz - q.tz * t
            const sd = Math.hypot(px, pz) - q.halfWid
            if (sd < bestSd) { bestSd = sd; best = q }
        }
        if (!best || bestSd > reachCap) return null

        const designY = best.y - clearanceMargin

        // Full depth inside the footprint and for PAD_RIM_HOLD beyond it — the same one-cell-diagonal
        // hold _junctionPadCarve documents: without it a vertex just outside the footprint already
        // rides the bank, and its shared triangle interpolates above the bench INSIDE the pad.
        if (bestSd <= PAD_RIM_HOLD) return { blendW: 1.0, gradeY: designY, dom: gate }

        // Outside the hold: ramp designY → raw over shoulder + fill/cut toe, mirroring
        // _carveCrossSection and _junctionPadCarve so a pad toe looks like every other toe.
        const over = bestSd - PAD_RIM_HOLD
        const fillReach = shoulderWidth + Math.max(0, designY - rawAmp) * fillSlope
        const cutReach  = shoulderWidth + Math.max(0, rawAmp - designY) * cutSlope
        const beyondToe = Math.min(Math.max(fillReach, cutReach), maxToe)
        if (over >= beyondToe) return null
        const ramp = Math.max(shoulderWidth, beyondToe)
        const u = Math.min(1, over / ramp)
        const w = 1.0 - u * u * (3.0 - 2.0 * u)
        return { blendW: w, gradeY: designY, dom: gate * w }
    }

    // ── QUAL-16: deg-2 kink connector fillet arc geometry ──────────────────────────────────────
    /**
     * Join a deg-2 node's two mouth cross-sections with a driveable connector and return the swept
     * CENTRELINE (densified ≤ 3 m) plus the data the carve/mesh need. Formerly lived inside
     * road-mesh.js `_buildDeg2Ribbon`; moved here so it is computed ONCE (cached on the node per
     * _networkRev) and shared by the mesh (sweep) AND _resolveRoadSurface (earthwork/collision), so
     * mesh == collision through the bend. The centreline rides ON each real ribbon from its anchor
     * point to its mouth (the lead-ins), so the connector's grade interp is C0 with the ribbons it
     * welds to. Pure fn of node + params + streamed network (window-invariant, D-16).
     *
     * Returns { points:[{x,z}], polyCum:Float64Array, grades:Float64Array, halfWidth, netKeys,
     * totalLen, key } or null. Null is now essentially unreachable for a well-formed 2-leg node —
     * see _pushDeg2Core's rung 2 — and only the caller's pad-ladder fallback consumes it.
     */
    _buildDeg2ArcGeom(node) {
        if (!node.legs || node.legs.length !== 2 || !this._network) return null
        const halfWidth = this._params.roadHalfWidth ?? 5
        const cutback = this.junctionCutbackDist()
        const T = cutback + halfWidth * 0.5

        // One leg's mouth record, `extra` metres further back along the leg than the nominal
        // cutback + halfWidth/2 (DEG2_SHARP_PULLBACK). Both the mouth and its lead-in anchor move
        // together so the anchor stays outboard of the mouth; len·0.45 caps both on a short leg.
        const mouthAt = (leg, extra) => {
            if (leg.arc === undefined || !leg.runKey) return null
            const e = this._network.get(leg.runKey)
            const cum = e?.polyCum
            const len = cum ? cum[cum.length - 1] : 0
            if (!(len > 1e-3)) return null
            const s = leg.arc < 1e-6 ? 1 : -1
            const mouthArc = leg.arc + s * Math.min(T + extra, len * 0.45)
            const c = this.runPointAt(leg.runKey, mouthArc)
            if (!c) return null
            const prof = this.runProfile(mouthArc, leg.runKey)
            let ox = prof.tx * s, oz = prof.tz * s
            const ol = Math.hypot(ox, oz)
            if (ol < 1e-6) return null
            const anchorArc = leg.arc + s * Math.min(cutback + halfWidth * 2 + extra, len * 0.45)
            return { runKey: leg.runKey, cx: c.x, cz: c.z, ox: ox / ol, oz: oz / ol, mouthArc, anchorArc, s }
        }

        let mouth = []
        for (const leg of node.legs) {
            const m = mouthAt(leg, 0)
            if (!m) return null
            mouth.push(m)
        }
        // Sharp-kink pullback: measure the kink from the nominal mouth tangents (the same delta the
        // fillet fits to), then rebuild both mouths further back so the fillet radius grows and the
        // bend spreads over more road instead of lobing out sideways. Two passes, once per node per
        // _networkRev — the result is cached on the node.
        {
            const dot = -(mouth[0].ox * mouth[1].ox + mouth[0].oz * mouth[1].oz)
            const delta = Math.acos(Math.max(-1, Math.min(1, dot)))
            const u = (delta - DEG2_SHARP_IN) / (DEG2_SHARP_FULL - DEG2_SHARP_IN)
            if (u > 0) {
                const k = u >= 1 ? 1 : u * u * (3 - 2 * u)
                const pulled = []
                for (const leg of node.legs) {
                    const m = mouthAt(leg, DEG2_SHARP_PULLBACK * k)
                    if (!m) return null
                    pulled.push(m)
                }
                mouth = pulled
            }
        }
        const [A, B] = mouth

        const SEG = 3
        const center = []
        const pushStraight = (x0, z0, x1, z1, includeStart) => {
            const d = Math.hypot(x1 - x0, z1 - z0)
            const n = Math.max(1, Math.ceil(d / SEG))
            for (let k = includeStart ? 0 : 1; k <= n; k++) {
                const f = k / n
                center.push({ x: x0 + (x1 - x0) * f, z: z0 + (z1 - z0) * f })
            }
        }
        const pushRun = (runKey, from, to, includeStart) => {
            const d = Math.abs(to - from)
            const n = Math.max(1, Math.ceil(d / SEG))
            for (let k = includeStart ? 0 : 1; k <= n; k++) {
                const p = this.runPointAt(runKey, from + (to - from) * (k / n))
                if (p) center.push({ x: p.x, z: p.z })
            }
        }
        pushRun(A.runKey, A.anchorArc, A.mouthArc, true)   // anchorA → cA, on the ribbon
        const iMouthA = center.length - 1
        if (!this._pushDeg2Core(center, A, B, halfWidth, SEG, pushStraight)) return null
        const iMouthB = center.length - 1
        pushRun(B.runKey, B.mouthArc, B.anchorArc, false)  // cB → anchorB, on the ribbon
        if (center.length < 2) return null

        const polyCum = new Float64Array(center.length)
        for (let i = 1; i < center.length; i++) {
            polyCum[i] = polyCum[i - 1] + Math.hypot(center[i].x - center[i - 1].x, center[i].z - center[i - 1].z)
        }

        // Per-vertex grade = distance-weighted blend of the TWO legs' run grades sampled at that centreline
        // vertex (project onto each run → runProfile grade, weight 1/(d²+1)). The connector carve rides this,
        // so at the connector↔ribbon boundary the height matches the runs (both → nodeY at the node, where
        // the legs are welded). This is the CENTRELINE grade only — the connector's crown and camber ride
        // on top of it laterally (junction-flow stage 5, _connectorDesignAt); `grades` itself feeds only
        // collectConnectorSamples' centreline probe, where camber is zero and crown is the 5 cm peak.
        const netA = this._network.get(A.runKey), netB = this._network.get(B.runKey)
        const grades = new Float64Array(center.length)
        for (let i = 0; i < center.length; i++) {
            const prA = netA ? this._projectOntoRun(netA, center[i].x, center[i].z) : null
            const prB = netB ? this._projectOntoRun(netB, center[i].x, center[i].z) : null
            const gA = prA ? this.runProfile(prA.arcS, A.runKey).gradeY : null
            const gB = prB ? this.runProfile(prB.arcS, B.runKey).gradeY : null
            if (gA != null && gB != null) {
                const wA = 1 / (prA.d2 + 1), wB = 1 / (prB.d2 + 1)
                grades[i] = (gA * wA + gB * wB) / (wA + wB)
            } else grades[i] = gA != null ? gA : (gB != null ? gB : node.nodeY)
        }
        // junction-flow stage 3 — LANE-MARKING PHASE across the connector. Both lead-ins ride ON their
        // run's centreline, so the run-global arc there is an exact linear function of the connector's
        // own chord distance: arcS = mouthArc + σ·(c − cMouth), σ = the sign of the arc as travel
        // proceeds along the connector. Handing each half of the connector its OWN leg's function makes
        // the connector's dash phase byte-match the ribbon it overlaps on BOTH lead-ins (coincident,
        // identical stripes — no ghosting, nothing for the z-fight to reveal). The two functions cannot
        // be reconciled (unrelated runs, and their σ can even differ in sign), so the unavoidable single
        // phase jump is parked at the connector's MIDPOINT — the apex of the bend, where no ribbon
        // draws and it costs one smeared dash instead of a 20 m marking hole.
        const markPhase = {
            aArc: A.mouthArc, aSig: Math.sign(A.mouthArc - A.anchorArc) || 1, aCum: polyCum[iMouthA], aKey: A.runKey,
            bArc: B.mouthArc, bSig: Math.sign(B.anchorArc - B.mouthArc) || 1, bCum: polyCum[iMouthB], bKey: B.runKey,
            midCum: 0.5 * (polyCum[iMouthA] + polyCum[iMouthB]),
        }
        return {
            points: center,
            polyCum,
            grades,
            halfWidth,
            markPhase,
            netKeys: [A.runKey, B.runKey],   // the two legs — _connectorCarve blends their grades in WORLD space
            totalLen: polyCum[center.length - 1],
            key: `@deg2:${node.pos.x.toFixed(1)},${node.pos.z.toFixed(1)}`,
        }
    }

    /**
     * QUAL-16: the deg-2 connector CORE — the centreline from mouth A's cross-section point to mouth
     * B's, appended to `center` (cA is already the last point pushed by the caller's lead-in; cB is
     * the last point this pushes). Two rungs:
     *
     *   1. The cheapest tangent CIRCLE: the largest radius that still fits between the two mouths,
     *      i.e. the gentlest, most driveable curve. What QUAL-16 originally shipped.
     *   2. (junction-flow) A cubic HERMITE sweep between the mouths, leg directions as tangents,
     *      when rung 1 is degenerate. The tangent circle needs the two mouth centrelines to actually
     *      INTERSECT ahead of both mouths; laterally offset mouths put the intersection BEHIND one of
     *      them (t ≤ 0.5), which the old code treated as "no connector" — so a gentle 23° kink whose
     *      mouths are offset near-S (seed-6 -586.7,560.5, t = −2.1) fell through to the pad ladder and
     *      built a 14.5 m dirt PLAZA on what is visually a straight road. The Hermite has no such
     *      requirement: it degrades into an S for offset mouths and a U for near-antiparallel legs
     *      (the >120° cull-created elbows), neither of which a single circle can express.
     *
     * So rung 2 is deliberately near-unconditional — it guards only truly degenerate input (coincident
     * mouths, non-finite output). A slightly tight connector is always better than a bare graded disc.
     * Both rungs sample at the same SEG spacing and emit into the same array, so every consumer
     * (_buildDeg2Ribbon, _connectorCarve, _projectOntoDeg2Arc, _deg2ArcTiles, _connectorDesignAt) is
     * blind to which rung ran. Pure fn of the mouth records (window-invariant, D-16).
     *
     * @returns {boolean} true if a core was appended.
     */
    _pushDeg2Core(center, A, B, halfWidth, SEG, pushStraight) {
        const uAx = -A.ox, uAz = -A.oz   // travel direction INTO the node at mouth A
        const uBx =  B.ox, uBz =  B.oz   // travel direction OUT of the node at mouth B
        const qx = B.cx - A.cx, qz = B.cz - A.cz
        const gap = Math.hypot(qx, qz)
        if (!(gap > 1e-3)) return false

        // ── Rung 1: tangent circle ──────────────────────────────────────────────────────────────
        const det = uAx * uBz - uAz * uBx
        if (Math.abs(det) >= 1e-4) {
            const t = (qx * uBz - qz * uBx) / det
            const r = (uAx * qz - uAz * qx) / det
            const cosD = Math.max(-1, Math.min(1, uAx * uBx + uAz * uBz))
            const delta = Math.acos(cosD)
            const tanH = Math.tan(delta / 2)
            const Lt = Math.min(t, r) - halfWidth * 0.5
            const R = Lt / tanH
            let bx = -uAx + uBx, bz = -uAz + uBz
            const bl = Math.hypot(bx, bz)
            // R < halfWidth = the inside edge would pinch; tanH < 1e-4 = no turn to fillet. Both now
            // fall THROUGH to the Hermite instead of failing the whole connector.
            if (t > 0.5 && r > 0.5 && tanH >= 1e-4 && Lt >= 0.5 && R >= halfWidth && bl >= 1e-6) {
                const Ix = A.cx + uAx * t, Iz = A.cz + uAz * t
                const PAx = Ix - uAx * Lt, PAz = Iz - uAz * Lt
                const PBx = Ix + uBx * Lt, PBz = Iz + uBz * Lt
                bx /= bl; bz /= bl
                const h = R / Math.cos(delta / 2)
                const Ox = Ix + bx * h, Oz = Iz + bz * h
                const a0 = Math.atan2(PAx - Ox, PAz - Oz)
                const a1 = Math.atan2(PBx - Ox, PBz - Oz)
                let dAng = a1 - a0
                while (dAng >  Math.PI) dAng -= 2 * Math.PI
                while (dAng < -Math.PI) dAng += 2 * Math.PI
                pushStraight(A.cx, A.cz, PAx, PAz, false)   // cA → PA (short entry into the fillet)
                const arcSteps = Math.max(2, Math.ceil(Math.abs(dAng) * R / SEG))
                for (let k = 1; k <= arcSteps; k++) {
                    const ang = a0 + dAng * (k / arcSteps)
                    center.push({ x: Ox + Math.sin(ang) * R, z: Oz + Math.cos(ang) * R })
                }
                pushStraight(PBx, PBz, B.cx, B.cz, false)   // PB → cB
                return true
            }
        }

        // ── Rung 2: cubic Hermite cA → cB ───────────────────────────────────────────────────────
        const mag = gap * DEG2_HERMITE_TENSION
        const m0x = uAx * mag, m0z = uAz * mag
        const m1x = uBx * mag, m1z = uBz * mag
        const at = (u) => {
            const u2 = u * u, u3 = u2 * u
            const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u
            const h01 = -2 * u3 + 3 * u2,    h11 = u3 - u2
            return { x: h00 * A.cx + h10 * m0x + h01 * B.cx + h11 * m1x,
                     z: h00 * A.cz + h10 * m0z + h01 * B.cz + h11 * m1z }
        }
        // Coarse length pass first, so the emitted spacing matches rung 1's SEG (a Hermite in u is not
        // arc-length uniform; uniform-in-u sampling at the right COUNT is close enough for a ≤ 3 m rung).
        let est = 0, prev = { x: A.cx, z: A.cz }
        for (let k = 1; k <= 16; k++) { const p = at(k / 16); est += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p }
        if (!isFinite(est) || est < 1e-3) return false
        const n = Math.max(2, Math.ceil(est / SEG))
        for (let k = 1; k <= n; k++) {
            const p = at(k / n)
            if (!isFinite(p.x) || !isFinite(p.z)) return false
            center.push(p)
        }
        return true
    }

    /**
     * QUAL-16: smooth run grade at a WORLD point on `runKey` — the same ANALYTIC-centerline refinement
     * _resolveRoadSurface uses. The raw polyline projection (_projectOntoRun) snaps its foot between
     * segments for a point far off a CURVED run, jumping arcS ~2 m (→ a grade step); refining onto the
     * exact primitive centreline removes that. Writes into the caller's `out` (allocation-free hot path)
     * and returns it, or null:
     *   grade — the run's centreline grade here
     *   xs    — the run's OWN lateral fold here (crown + camber tilt, junction-flow stage 5)
     *   gap   — distance to that run's asphalt EDGE (the blend weight _connectorDesignAt uses)
     * Pure fn of the streamed network.
     */
    _runGradeAt(runKey, wx, wz, out) {
        const ce = this._network.get(runKey)
        if (!ce) return null
        const pr = this._projectOntoRun(ce, wx, wz)
        if (!pr) return null
        let arcS = pr.arcS
        // BUG-53: over a ceded strand or a taper band the run's own centerline is a stale record
        // (the points follow the winner, or blend off it) — keep the polyline arc rather than
        // refine onto the wrong curve.
        let inCeded = false
        if (ce.offCurveSpans) {
            const aC = pr.arcS + (ce.arcOrigin ?? 0)
            for (const csp of ce.offCurveSpans) if (aC >= csp.s0 - 0.5 && aC <= csp.s1 + 0.5) { inCeded = true; break }
        }
        if (!inCeded && ce.centerline && ce.centerline.length > 1e-6 && ce.clArc && ce.polyCum) {
            // FINE DS (0.25 m vs _resolveRoadSurface's 1.0 m) + a wide window: the connector grade is
            // sampled up to ~15 m OFF a leg (the footprint), where (a) the polyline foot (pr.sCL, the
            // window centre) snaps ~2 m between segments on a curved leg — a wide window still brackets the
            // true nearest — and (b) a coarse DS quantises the analytic arcS to ~1 m, stepping the grade
            // ~0.18 m per snap (the residual shoulder-lateral step). Fine DS keeps the leg grade smooth.
            const hit = ce.centerline.nearest(wx, wz, 0.25, pr.sCL - 20, pr.sCL + 20)
            if (hit) arcS = _interpArcTable(ce.clArc, ce.polyCum, hit.s) - (ce.arcOrigin ?? 0)
        }
        const p = this._params
        const halfWidth = p.roadHalfWidth ?? 5
        out.grade = this.runProfile(arcS, runKey, _CD_RP).gradeY
        // junction-flow stage 5: the leg's OWN lateral fold here — the same crown + camber tilt
        // _carveDirtY and sweepRibbon apply to the ribbon, in the run's canonical frame (this projection
        // uses the run's own direction, so camberSign is +1). pr.signedLat is the perpendicular offset
        // from the foot, i.e. exactly the ribbon's uLat at this point, and it stays signed relative to
        // this run — so a leg the connector traverses backwards still reproduces its tilt correctly.
        //
        // BUG-40: the camber lever arm is BOUNDED at the carve footprint edge. Unbounded, this term is a
        // banked plane extrapolated to infinity, and at a saturated bank (camberMaxAngleDeg 20 on a
        // sub-knee radius) every extra metre of |signedLat| adds ~0.34 m of height — 0.60 m of phantom
        // lift measured at 5 m off the sibling leg on the seed-6 41,619 elbow. Beyond XS_LAT_CAP the
        // fold is held flat: that is past the shoulder AND past carveHalfWidth, so the ribbon, the
        // shoulder plane and the connector weld are all bit-unchanged (only the far toe, which ramps to
        // raw terrain anyway, ever sees the cap). Bounding here and not in _carveDirtY is deliberate —
        // _carveDirtY's fold IS the road's own cross-section (BUG-15 needs it continuous across the whole
        // footprint); this one is a SIBLING's cross-section imported over a road it does not own.
        const latCap = halfWidth + (p.roadCarveExtraWidth ?? 3.0)
        const latB = Math.max(-latCap, Math.min(latCap, pr.signedLat))
        out.xs = crownProfile(pr.signedLat, halfWidth, p.crownHeight ?? 0.05)
               + latB * Math.sin(this.camberProfile(arcS, runKey))
        out.gap = Math.max(0, Math.sqrt(pr.d2) - halfWidth)
        out.off = pr.overDist ?? 0
        return out
    }

    /**
     * QUAL-16 + junction-flow stage 5: the deg-2 connector's DESIGN SURFACE at a world point — the two
     * legs' cross-sections blended, written into `out` as { grade, lateral } (asphalt grade before
     * clearance, plus the lateral crown/camber fold) or null off both legs.
     *
     * The connector is a BEND, not a flat plaza: it carries the whole cross-section — grade, crown and
     * superelevation. A deg-2 node is NOT flatCamber (only ≥3-way nodes ease their banking to zero,
     * _runEndpointJunctions), so both legs arrive at their mouths fully banked; a laterally FLAT
     * connector met them with a cross-slope STEP — a visible plane break at each mouth and a cross-slope
     * jolt through the wheels (1.20 m of edge-to-edge disagreement measured at the seed-6 -586,562 elbow,
     * where the leg banks 12.5°). So blend BOTH parts of each leg's cross-section: its centreline grade
     * and its own lateral fold (crown + camber, _runGradeAt.xs).
     *
     * ONE weight for both: 1/(gap² + XS_SOFT²) on the distance to that leg's ASPHALT EDGE, not its
     * centreline. Over a lead-in — which rides ON its run — that leg's gap is 0 for the full road width,
     * so it wins outright and the connector's cross-section IS that ribbon's (measured residual 5 mm on a
     * straight lead-in). That is what makes the strip and the ribbon it overlaps COINCIDENT rather than
     * crossing, which also removes the depth-crossover tonal patch at the mouth; the centreline-distance
     * weight it replaces still bled ~0.19 m of the sibling leg's grade in at the mouth. Through the bend
     * the two cross-sections hand over smoothly, and in the throat (both gaps → 0) it averages toward the
     * shared node surface, as before. Weighting on gap also suppresses a wrong-branch foot harder than
     * the old 1/(d²+1) did: worst field discontinuity across every seed-6 connector footprint fell from
     * 3.93 m to 1.92 m per 0.1 m.
     *
     * Evaluated in WORLD space (not from the connector's own arc-length) so it is CONTINUOUS across a
     * tight kink where the fillet centreline curves back within the footprint width: projecting onto the
     * connector's arc-length flips to the far limb and jumps (17 m of arcS measured INSIDE the asphalt at
     * the seed-6 -1138,667 elbow). Each leg grade is the ANALYTIC-refined run grade (_runGradeAt), so it
     * doesn't step where the polyline foot snaps far off a curved leg.
     *
     * Note the fold is read per LEG, in that leg's frame — nothing here uses the connector's own
     * signedLat/tangent, which are per-chord and jump at every centreline vertex and across the fillet's
     * medial axis (an earlier connector-frame formulation tore by 1.5–2.9 m inside the asphalt at the
     * seed-6 -396,-341 and 1900,833 elbows). Deliberately no extra curvature-driven bank of the
     * connector's own either: the legs' camber is already curvature-driven and they curve toward the
     * node, so the bend banks INTO the turn on its own, and any addition would have to vanish at both
     * mouths to keep the weld exact — buying wobble, not banking.
     * Pure fn of the streamed network (window-invariant, D-16). Allocation-free.
     */
    _connectorDesignAt(arc, wx, wz, out) {
        const a = this._runGradeAt(arc.netKeys[0], wx, wz, _CD_A)
        const b = this._runGradeAt(arc.netKeys[1], wx, wz, _CD_B)
        if (!a || !b) {
            const o = a || b
            if (!o) return null
            out.grade = o.grade; out.lateral = o.xs
            return out
        }
        // BUG-40: fade a leg out over XS_OFF_FADE m past its own terminus — see the const. Smoothstep so
        // both the weight and its derivative are continuous; if BOTH legs are off-end (the throat of a
        // sharp fillet, where the corner is cut past both mouths) the tapers collapse together and the
        // ratio is undefined, so fall back to the untapered weights — there both grades are the same
        // clamped node height anyway, which is exactly the plaza value that throat should carry.
        const fade = (d) => { const u = Math.min(1, Math.max(0, d / XS_OFF_FADE)); return 1 - u * u * (3 - 2 * u) }
        let wA = 1 / (a.gap * a.gap + XS_SOFT2), wB = 1 / (b.gap * b.gap + XS_SOFT2)
        const tA = wA * fade(a.off), tB = wB * fade(b.off)
        if (tA + tB > 1e-9) { wA = tA; wB = tB }
        const wS = wA + wB
        out.grade = (a.grade * wA + b.grade * wB) / wS
        out.lateral = (a.xs * wA + b.xs * wB) / wS
        return out
    }

    /**
     * QUAL-16: the deg-2 kink CONNECTOR's own carve cross-section at (wx,wz) — used ONLY as a fallback
     * where the run scan leaves the connector footprint uncarved (the void on a sharp bend, off both
     * straight corridors and beyond their toes → the mesh connector floats over raw terrain / terrain
     * pokes through the asphalt). A full ROAD cross-section — run-following centreline grade plus crown
     * and the leg-to-leg camber handover (_connectorDesignAt) — with the standard
     * fill/cut toe ramp to raw, so it is C0 with the surrounding terrain (both → raw where the toes meet)
     * and with the ribbons (whole cross-section → that leg's near each mouth). Returns { blendW, gradeY }
     * (DIRT, clearance already folded out) or null (no connector near, off its footprint, or beyond the
     * toe). Window-invariant.
     *
     * QUAL-24 — THIS IS A FRONTIER FALLBACK, NOT THE PRIMARY PATH. A deg-2 site is a continuing path,
     * and _mergeDeg2Chains now splices its runs into ONE run so the join is ordinary road with one
     * profile; connectors are not built there. What remains is the streaming FRONTIER, where a site's
     * degree is not known-complete (its incident edges are not all registered) so `through()` declines
     * to merge and a deg-2 node still forms. Those sit at the band edge, hundreds of metres past the
     * ~160 m draw distance — reachable, never seen. Kept deliberately (owner call 2026-08-03): the
     * alternative is routing past the band to settle a post-cull degree, which trades cold-load time
     * (PERF-03/27) and a dependency on BUG-25's open watch for code that costs one Map-size check.
     * Full reasoning in .planning/todos/completed/qual-24-deg2-chain-merge.md.
     */
    _connectorCarve(wx, wz, rawAmp) {
        if (!this._deg2ArcTiles || !this._deg2ArcTiles.size) return null
        const p = this._params
        const halfWidth     = p.roadHalfWidth      ?? 5
        const shoulderWidth = p.roadShoulderWidth   ?? 2.5
        const clearanceMargin = p.roadClearanceMargin ?? 0.25
        const carveExtraWidth = p.roadCarveExtraWidth ?? 3.0
        const minRadius       = p.roadMinTurnRadius   ?? 12
        const carveHalfWidth  = Math.min(halfWidth + carveExtraWidth, minRadius)
        const maxEmbankmentToe = p.roadMaxEmbankmentToe ?? 10
        const qtx = Math.floor(wx / CHUNK_SIZE), qtz = Math.floor(wz / CHUNK_SIZE)
        // Nearest connector arc in the 3×3 block.
        let bestArc = null, bestPr = null, bestLat = Infinity
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
            const list = this._deg2ArcTiles.get(`${qtx + dx},${qtz + dz}`)
            if (!list) continue
            for (const arc of list) {
                const pr = this._projectOntoDeg2Arc(arc, wx, wz)
                if (!pr) continue
                const lat = Math.abs(pr.signedLat)
                if (lat < bestLat) { bestLat = lat; bestArc = arc; bestPr = pr }
            }
        }
        if (!bestArc) return null
        const cd = this._connectorDesignAt(bestArc, wx, wz, _CD_OUT)
        if (cd == null) return null
        const designY = cd.grade - clearanceMargin
        const fillSlope = p.roadFillSlope ?? 3.0, cutSlope = p.roadCutSlope ?? 1.0
        const fillToe = halfWidth + shoulderWidth + Math.max(0, designY - rawAmp) * fillSlope
        const cutToe  = halfWidth + shoulderWidth + Math.max(0, rawAmp - designY) * cutSlope
        const toeExt  = Math.min(Math.max(fillToe, cutToe), carveHalfWidth + maxEmbankmentToe)
        if (bestLat > toeExt) return null
        // blendW: 1 across the flat core (carveHalfWidth), then the SAME smoothstep shoulder→toe falloff
        // _carveCrossSection uses (QUAL-06/07) — ramp = max(shoulderWidth, toeExt−carveHalfWidth), C1 at
        // both ends. So the connector flanks get an ordinary graded road cut/fill bench (no wall/sawtooth
        // at the asphalt edge), identical in shape to a run's embankment.
        const ramp = Math.max(shoulderWidth, toeExt - carveHalfWidth)
        let blendW
        if (bestLat < carveHalfWidth) blendW = 1.0
        else { const u = Math.min(1, (bestLat - carveHalfWidth) / ramp); blendW = 1.0 - u * u * (3.0 - 2.0 * u) }
        // Longitudinal end-feather `dom`: the connector rides ONTO each leg over its ribbon-ride ends, so
        // near arc-length 0 / totalLen the connector grade should hand back to the RUN grade rather than
        // hard-cut to null at the anchor (where a run grazing the connector's end saw a step, co(flat) vs
        // run(crowned)). dom = 1 in the interior, smoothstep to 0 within END_FEATHER m of either end.
        const END_FEATHER = 6
        const endDist = Math.min(bestPr.arcS, bestArc.totalLen - bestPr.arcS)
        let dom = 1.0
        if (endDist < END_FEATHER) { const u = Math.max(0, endDist) / END_FEATHER; dom = u * u * (3.0 - 2.0 * u) }
        // junction-flow stage 5: fold in the LATERAL cross-section (crown + camber, _connectorDesignAt).
        // Added to the design surface ONLY — the toe reach above still comes off the centreline grade, so
        // the connector's earthwork FOOTPRINT is bit-for-bit what it was. Every consumer of gradeY (the
        // physics carve, the terrain mesh, sampleRoadTopY — and through it _buildDeg2Ribbon's vertex Y)
        // folds it identically, so mesh == collision through the bend by construction.
        return { blendW, gradeY: designY + cd.lateral, lat: bestLat, arcS: bestPr.arcS, dom }
    }

    // ── QUAL-11: run centerline XZ at a run-global arc ─────────────────────────────────────────
    /**
     * World XZ of a run's centerline at run-global arc `arcS` — the same cumulative-XZ polyline
     * metric the ribbon trim (_buildRoadTile) and runProfile use. buildJunctionFootprint samples
     * this to place each pad mouth ON the run so the mouth cross-section coincides with the swept
     * ribbon (exact weld — no flare needed to hide the seam). Pure fn of the streamed network
     * (window-invariant, D-16). Returns null for an unknown/degenerate run; arcS is clamped.
     *
     * @param {string} runKey
     * @param {number} arcS — run-global arc (m)
     * @returns {{x:number,z:number}|null}
     */
    runPointAt(runKey, arcS) {
        const e = this._network.get(runKey)
        const pts = e?.points, cum = e?.polyCum
        if (!pts || pts.length < 2 || !cum) return null
        const n = pts.length
        const s = Math.max(0, Math.min(cum[n - 1], arcS))
        let lo = 0, hi = n - 1
        while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid }
        const span = cum[lo + 1] - cum[lo] || 1
        const t = (s - cum[lo]) / span
        const a = pts[lo], b = pts[lo + 1]
        return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
    }

    // ── QUAL-10: asphalt-TOP surface sampler (junction apron) ─────────────────────────────────
    /**
     * The road's asphalt-TOP Y at any world XZ near the network — the surface the ribbon MESH and the
     * truck both ride (= _carveDirtY + clearanceMargin, i.e. run grade + crown + camber, extrapolated
     * laterally past halfWidth, folding FEAT-19's junction grade line). QUAL-10's junction apron samples
     * this per-vertex so the pad rides the SAME graded surface as the ribbons it overlaps → one
     * continuous surface + merged normals instead of a flat nodeY pad. Unlike _sampleCarveWorld this
     * adds clearance EVERYWHERE (the whole apron is asphalt, not dirt) and omits pothole micro-noise
     * (the apron stays clean/smooth). Pure fn of the network (window-invariant). Returns null beyond the
     * road footprint (caller falls back to nodeY).
     */
    sampleRoadTopY(wx, wz) {
        const nr = this._resolveRoadSurface(wx, wz)
        const clearanceMargin = this._params.roadClearanceMargin ?? 0.25
        let runTop = null
        if (nr) {
            const dx = wx - nr.point.x, dz = wz - nr.point.z
            const arcSEff   = (nr.arcS ?? 0) + dx * nr.tangent.x + dz * nr.tangent.z
            const signedLat = dx * nr.tangent.z - dz * nr.tangent.x
            // wx,wz forwarded so _carveDirtY's QUAL-10 pad-plane inter-leg ruled blend fires (the apron
            // rides the SAME ruled junction surface as the physics carve).
            runTop = this._carveDirtY(signedLat, arcSEff, nr.runKey ?? '', nr.camberSign ?? 1, wx, wz) + clearanceMargin
        }
        // QUAL-16: compose the deg-2 kink CONNECTOR overlay — the SAME dom-blended design grade the
        // carve (_sampleCarveWorld / terrain _buildCarveTable) rides — so the connector ribbon mesh
        // (_buildDeg2Ribbon samples this per vertex) sits exactly clearanceMargin above the carved
        // dirt through the bend. Without this the ribbon rode the run-Voronoi field while the dirt
        // rode the connector blend; where the two legs' grades differ across a sharp kink the dirt
        // rose above the drawn asphalt (the z-fighting dirt interleave at the 87° kink). Weight =
        // blendW·dom: under the asphalt blendW = 1 so this IS the physics composition (mesh ==
        // collision); it feathers C1 to the run/raw field at the connector toe and ends.
        const co = this._connectorCarve(wx, wz, this._coarseH(wx, wz) * (this._params.terrainAmplitude ?? 1))
        if (co) {
            const coTop = co.gradeY + clearanceMargin
            const w = runTop != null ? co.blendW * co.dom : 1
            return runTop != null ? coTop * w + runTop * (1 - w) : coTop
        }
        return runTop
    }

    // ── QUAL-24: graph-LEAF terminus distance (the dangling-run-end cap) ─────────────────────
    /**
     * Signed arc distance from `arcSEff` to the nearer terminus of `runKey` that is a graph LEAF —
     * POSITIVE inside the run, NEGATIVE beyond the terminus, +Infinity when neither end is a leaf.
     *
     * "Leaf" is decided from GRAPH TOPOLOGY (`_graphDegreeOf(cellA/cellB) === 1`), never from the
     * streamed network or the window: a run is registered as a WHOLE graph edge, so its endpoints
     * are always graph sites, but at a degree-≥2 site the continuation edge may simply not have
     * streamed yet. Keying the cap on the streamed leg count would therefore change the surface when
     * the same area re-streams at a different radius (restream-invariance). The Urquhart band graph
     * is window-invariant in its interior (roadGraphMargin), and a run end sits at most one edge
     * length outside the stream band — deep inside that margin. Junction-owned ends (degree ≥ 2) are
     * cut back and covered by pads/connectors and are deliberately left alone, so the BUG-21
     * apex-sliver fallback and every pad/connector overlay are untouched by this.
     *
     * Memoised on the netEntry, stamped with _networkRev (the same signal every other per-run cache
     * in this file uses) — the carve path calls this per vertex/probe.
     */
    _leafEndDist(runKey, arcSEff) {
        const e = this._network ? this._network.get(runKey) : null
        if (!e) return Infinity
        if (e._leafRev !== this._networkRev) {
            e._leafRev = this._networkRev
            e._leafA = !!(e.cellA && this._graphDegreeOf(e.cellA) === 1)
            e._leafB = !!(e.cellB && this._graphDegreeOf(e.cellB) === 1)
        }
        if (!e._leafA && !e._leafB) return Infinity
        const cum = e.polyCum
        const o = e.arcOrigin ?? 0
        let d = Infinity
        if (e._leafA) d = arcSEff - (-o)                                  // arc at the run's first vertex
        if (e._leafB) {
            const d1 = (cum ? cum[cum.length - 1] : 0) - o - arcSEff      // arc at the run's last vertex
            if (d1 < d) d = d1
        }
        return d
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
    _carveCrossSection(signedLat, arcSEff, runKey, camberSign, rawAmp, wx, wz, floorY = -Infinity) {
        const p             = this._params
        const halfWidth     = p.roadHalfWidth      ?? 5
        const shoulderWidth = p.roadShoulderWidth   ?? 2.5
        // BUG-15 (fill): hold the full road grade out to carveHalfWidth (= halfWidth + carveExtraWidth,
        // capped at minRadius) so the raised fill embankment / cut bench has a flat core wider than the
        // ribbon, then ramp to raw over the variable toe. Same extent the mesh carve uses.
        const carveExtraWidth = p.roadCarveExtraWidth ?? 3.0
        const minRadius       = p.roadMinTurnRadius   ?? 12
        // QUAL-10: near a junction, WIDEN the flat road-level core so terrain is carved to the pad disc
        // (union of the crossing runs' widened bands) instead of leaving the fillet corners at embankment
        // height where they clip through the pad. _carveDirtY has already eased crown/camber to flat here.
        const jc = this._junctionCarve(runKey, arcSEff)
        const carveHalfWidth  = Math.min(halfWidth + carveExtraWidth, minRadius) + jc.widen

        const latDist = Math.abs(signedLat)

        // QUAL-24 (dangling run end): a run that STOPS — its terminus is a graph leaf, so no
        // neighbour run, pad or connector owns the ground past it — used to be capped by a lat-ONLY
        // cross-section. Straight off the end signedLat ≈ 0, so blendW stayed 1 and the full road
        // grade was held out to the resolver's radial acceptance (endHW ≈ 18 m) and then stopped
        // dead: an 18 m plateau ringed by a vertical face (6.03 m in ONE 0.25 m sample at the seed-6
        // dead end (2699.9, 1628.0) — a fortress mound burying the stream below it, shadow and all;
        // 13.4 m at a deeper one). Fold the section RADIALLY instead:
        // past the terminus the toe test and the shoulder→toe smoothstep run on hypot(lat, over)
        // rather than lat, so the surface rolls off in EVERY direction at the ordinary fill/cut
        // slope. rad is C1 across the terminus plane (∂rad/∂over = over/rad → 0 as over → 0), and
        // both carve consumers (physics _sampleCarveWorld, terrain _buildCarveTable) share this fn,
        // so the drawn embankment and the collision surface taper identically (QUAL-07).
        const dLeaf = this._leafEndDist(runKey, arcSEff)
        const over  = dLeaf < 0 ? -dLeaf : 0
        const radDist = over > 0 ? Math.hypot(latDist, over) : latDist
        // Longitudinal feather of the footprint EXTRA over the final LEAF_END_TAPER metres: the
        // FEAT-40 deep-bank toe is what lets a toe reach past the resolver's off-end acceptance
        // radius, which would leave a residual step exactly where the cap ends. Faded to 0 at the
        // terminus the capped toe becomes carveHalfWidth + maxEmbankmentToe == endHW, so blendW
        // reaches 0 inside the resolved region and the nose feathers to raw with nothing left over.
        let leafTaper = 1
        if (dLeaf < LEAF_END_TAPER) {
            const u = Math.max(0, dLeaf) / LEAF_END_TAPER
            leafTaper = u * u * (3.0 - 2.0 * u)
        }

        // Dirt surface (run grade + crown/camber − clearance). D3: a higher overlapping arm raises it.
        let designY = this._carveDirtY(signedLat, arcSEff, runKey, camberSign, wx, wz)
        if (floorY > designY) designY = floorY

        // Fill/cut toe + blend (FEAT-10): the embankment ramps at its SLOPE over the variable toe so a
        // tall fill descends gently to terrain instead of dropping its height over a fixed shoulder.
        // FEAT-10 cap: apron ≤ carveHalfWidth + roadMaxEmbankmentToe (no shard-fighting at tight turns).
        const fillSlope = p.roadFillSlope ?? 3.0
        const cutSlope  = p.roadCutSlope  ?? 1.0
        const maxEmbankmentToe = p.roadMaxEmbankmentToe ?? 10
        // Anchor the toe at carveHalfWidth (the ACTUAL flat-core edge, which _junctionCarve WIDENS near a
        // node by jc.widen) + shoulderWidth — NOT the bare halfWidth. Otherwise, where the junction widen
        // pushes carveHalfWidth past a shallow fill/cut toe, `toeExt < carveHalfWidth`: the core (blendW=1
        // out to carveHalfWidth) extends beyond toeExt, so `latDist > toeExt → null` clips it and the flat
        // plaza butts STRAIGHT onto raw terrain — a near-vertical embankment wall around the pad (the truck
        // flips / falls through it). Anchoring here guarantees the smoothstep ramp band always exists beyond
        // the widened core, so the bank descends at its slope. Shared fn ⇒ mesh + physics stay in agreement.
        const fillToe = carveHalfWidth + shoulderWidth + Math.max(0, designY - rawAmp) * fillSlope
        const cutToe  = carveHalfWidth + shoulderWidth + Math.max(0, rawAmp - designY) * cutSlope
        // FEAT-40: DEEP_BANK_TOE_EXTRA lets tunnel-scale cuts (15–25 m) keep their design slope
        // instead of compressing into a near-vertical staircased face at the base cap. Shallow
        // banks never reach the base cap, so this only widens genuinely deep walls. Must stay
        // ≤ the _resolveRoadSurface interior footprint (same constant folded there).
        const toeExt  = Math.min(Math.max(fillToe, cutToe), carveHalfWidth + maxEmbankmentToe + DEEP_BANK_TOE_EXTRA * leafTaper)
        if (radDist > toeExt) return null   // beyond the fill/cut toe — unaffected terrain

        const ramp = Math.max(shoulderWidth, toeExt - carveHalfWidth)
        let blendW
        if (radDist < carveHalfWidth) {
            blendW = 1.0
        } else {
            // QUAL-06/QUAL-07: SMOOTHSTEP shoulder falloff (was linear). u = 0 at the carve-core edge,
            // 1 at the toe; blendW = 1 − smoothstep(u) = 1 − u²(3−2u) has ZERO slope at BOTH ends, so
            // the bank has no hard crease at the top-of-bank (core edge) and feathers to terrain at the
            // toe — killing the staircase/crease the linear ramp left on coarse-grid steep banks. The
            // mesh and physics share this fn, so both get the C1 bank identically (agreement preserved).
            const u = Math.min(1, (radDist - carveHalfWidth) / ramp)
            blendW = 1.0 - u * u * (3.0 - 2.0 * u)
        }

        return { blendW, gradeY: designY }
    }

    // ── FEAT-40: mouth-funnel notch over a bore span ─────────────────────────────────────────
    /**
     * The terrain-SKIN surface over a bore span for Y-less / above-apex probes: the open cut's
     * own cross-section with its floor LIFTED by dIn·BORE_NOTCH_SLOPE (dIn = arc distance into
     * the span from the nearer portal), capped at raw. C0 with the approach trough at the portal
     * line (lift 0), and it self-retires mid-bore (lifted floor ≥ raw ⇒ returns null ⇒ the raw
     * hill stays overhead). The below-crown part of the funnel is inside the mouth's shader
     * discard capsule, so what renders is a graded V-cutting funneling into the arch — replacing
     * the old footprint-wide vertical stop face at the portal line that staircased on the grid.
     * Shared by physics (_sampleCarveWorld) and the mesh (_buildCarveTable): mesh == collision.
     *
     * @returns {{ blendW:number, gradeY:number } | null}  null = raw hill / not applicable
     */
    _boreNotchCS(runKey, camberSign, aArc, signedLat, rawAmp) {
        const sp = this.tunnelSpanAt(runKey, aArc)
        if (!sp) return null
        const dIn = Math.min(aArc - sp.s0, sp.s1 - aArc)
        const cs = this._carveCrossSection(signedLat, aArc, runKey, camberSign, rawAmp)
        if (!cs) return null
        const liftedY = cs.gradeY + dIn * BORE_NOTCH_SLOPE
        if (liftedY >= rawAmp) return null
        return { blendW: cs.blendW, gradeY: liftedY }
    }

    // ── FEAT-40: cross-section with self-overlap rival blend ─────────────────────────────────
    /**
     * _carveCrossSection, cross-faded toward the winning run's rival pass (nr.rival, set by
     * _resolveRoadSurface) near the equidistant line between two passes of a self-overlapping
     * run. Without this, the nearest-pass flip is a surface TELEPORT — up to 25 m where the
     * tunnel pass dug deep earthwork — that the terrain grid renders as accordion pleats.
     *
     * mix = 0.5 at the equidistant line, easing to 0 once the rival is CROSS_BLEND_BAND farther
     * away; additionally faded to 0 at the winner's ribbon edge (the road deck itself is never
     * blended — a wheel on the ribbon must ride exactly its run's surface). A rival pass inside
     * a bore span contributes RAW unless the probe is below its apex (same bore-ownership rule
     * as the resolver's exclusion loop). Blending the SURFACES (not the raw cs fields) keeps the
     * caller identity h = raw + blendW·(gradeY − raw) exact. Shared by physics
     * (_sampleCarveWorld) and the terrain mesh (_buildCarveTable) so mesh == collision holds.
     *
     * @returns {{ blendW:number, gradeY:number } | null}
     */
    _carveCrossSectionBlended(nr, signedLat, arcSEff, rawAmp, queryY, wx, wz) {
        // BUG-57: polar-cap continuation on an apex-sliver fallback hit — the junction wedge is
        // priced at the run's cross-section for lat' = max(|perpendicular lat|, radius from the
        // terminus), rotating the bank around the run end. Continuous with the interior footprint
        // across the end-ray, ordinary toe by footHW. Shared by physics (_sampleCarveWorld) and
        // the mesh (_buildCarveTable): mesh == collision holds.
        let latEff = signedLat
        if (nr.endRadial !== undefined && nr.endRadial > Math.abs(signedLat))
            latEff = (signedLat < 0 ? -1 : 1) * nr.endRadial
        const cs = this._carveCrossSection(latEff, arcSEff, nr.runKey ?? '', nr.camberSign ?? 1, rawAmp, wx, wz)
        const rv = nr.rival
        if (!rv) return cs
        const halfWidth = this._params.roadHalfWidth ?? 5
        const latDist = Math.abs(signedLat)
        // Fade in over 1.5 m past the ribbon edge (C0 with the unblended on-ribbon surface).
        const fadeU = Math.max(0, Math.min(1, (latDist - halfWidth) / 1.5))
        if (fadeU <= 0) return cs
        const u = Math.max(0, Math.min(1, (rv.lat - latDist) / CROSS_BLEND_BAND))
        const mix = 0.5 * (1 - u * u * (3 - 2 * u)) * (fadeU * fadeU * (3 - 2 * fadeU))
        if (mix <= 1e-4) return cs
        // Rival surface under the bore-ownership rule.
        let csR = null
        const inBore = this.tunnelSpanAt(rv.runKey, rv.arcS)
        if (!inBore || (queryY !== undefined &&
                        queryY < this.runProfile(rv.arcS, rv.runKey).gradeY + (this._params.tunnelBoreRadius ?? 8))) {
            csR = this._carveCrossSection(rv.signedLat, rv.arcS, rv.runKey, 1, rawAmp, wx, wz)
        }
        const wB = cs ? cs.blendW : 0, wR = csR ? csR.blendW : 0
        const hB = cs  ? rawAmp + wB * (cs.gradeY  - rawAmp) : rawAmp
        const hR = csR ? rawAmp + wR * (csR.gradeY - rawAmp) : rawAmp
        const w = wB + (wR - wB) * mix
        if (!(w > 1e-4)) return null
        const h = hB + (hR - hB) * mix
        return { blendW: w, gradeY: rawAmp + (h - rawAmp) / w }
    }

    // ── Phase 9: Design grade smoothing (D-06) ────────────────────────────────────
    // NOTE: since FEAT-68 there is NO longitudinal grade SMOOTHER at all — _v2GradePts solves the
    // exact profile (priced == built) onto the canonical run polyline that BOTH consumers read
    // (physics via _buildRunProfile.gradeY, ribbon via _buildRoadTile slicing). Smoothing a solved
    // profile would break priced == built, and crest airtime is a FEATURE (character spec).
    // The per-spline _smoothDesignGrade below is a BYPASSED legacy path (reachable only via the
    // dead sampleDesignGradeAt → test harness) — a deletion candidate, not a live smoother.
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
     * Call this whenever surface-param sliders (crownHeight, terrainAmplitude) change via
     * debouncedRoadSurfaceRebuild — the spline objects persist across rebuilds, so the WeakMap
     * would otherwise return stale pre-change profiles (CR-04 stale-cache fix).
     */
    invalidateDesignGradeCache() {
        this._designGradeCache = new WeakMap()
    }

    /**
     * Invalidate the per-run profile caches (runProfile/camberProfile/adjacency/junction), which
     * bake camber (camberMaxAngleDeg/camberKneeRadiusM/roadCamberRate) into camberRad. These key off
     * _networkRev, which normally bumps only on a re-route or real re-stream — NOT on a surface-param
     * slider change. So bumping
     * it here (without touching _generation — topology is unchanged) forces the next profile query
     * to lazily rebuild camber against the new params. Without this the Camber Strength / Camber Rate
     * sliders recompute carve tables + clear ribbon tiles but re-read the OLD cached camber → no-op.
     */
    invalidateProfileCaches() {
        this._networkRev++
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
     *   2. At each sample i, compute raw camber = camberFromCurvature(κ_i) — the saturating
     *      superelevation model (see that helper); κ_i = signedCurvature(T_{i-1}, T_i, ds_i).
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
     * curvature (camberArcWindow m — spacing-invariant, the BUG-12 camber fix) → camberFromCurvature
     * (saturating superelevation) → forward slew-rate march from `seed`. Shared by _buildCamberProfile
     * (the profile the carve/ribbon read) AND
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
        const maxCamberRad    = (p.camberMaxAngleDeg ?? 20) * (Math.PI / 180)   // asymptotic max bank
        const kHalf           = 1 / (p.camberKneeRadiusM ?? 60)                 // half-bank curvature
        const slewRateRadPerM = (p.roadCamberRate ?? 1.5) * (Math.PI / 180)
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

        // Windowed curvature → saturating camber → forward slew-rate march, seeded at sample 0.
        const camberRad = new Array(N)
        camberRad[0] = seed
        let prev = seed
        for (let i = 1; i < N; i++) {
            const s = arcPos[i]
            const sA = Math.max(arc0, s - windowM / 2)
            const sB = Math.min(totalArc, s + windowM / 2)
            const tA = tangentAtArcS(sA), tB = tangentAtArcS(sB)
            const kappa = signedCurvature(tA.tx, tA.tz, tB.tx, tB.tz, sB - sA)
            const raw = camberFromCurvature(kappa, maxCamberRad, kHalf)
            const maxDelta = slewRateRadPerM * (arcPos[i] - arcPos[i - 1])
            const delta = raw - prev
            if      (delta >  maxDelta) prev = prev + maxDelta
            else if (delta < -maxDelta) prev = prev - maxDelta
            else                        prev = raw
            camberRad[i] = prev
        }
        return { arcPos, camberRad }
    }

    // ── FEAT-10/13 junction surface: flatten grade + camber at graph junction nodes ─────────────
    // A graph node where ≥2 edges meet is a real intersection. Each run is graded/banked independently,
    // so the runs arrive at different Ys / banking there → an invisible collision step (road-smoothness)
    // + a banking jolt. Near such a node we ease this run's camber → 0 and its grade → nodeY (the mean
    // incident road grade, _graphJunctionGradeY) so ALL edges AGREE at the node — one flat, continuous,
    // navigable pad. Canonical (pure fn of the incidence map) → window-invariant.

    // Per-run endpoint junction info: the two endpoint node ids come from netEntry.cellA/cellB (FEAT-13 —
    // no runKey parsing). nodeY = the shared junction Y both runs ease toward — the AVERAGE incident road
    // grade (not terrain). FEAT-19: each endpoint also carries `slopeAway` (dGradeY per metre moving AWAY
    // from the node along THIS run) so the blend eases toward a grade LINE (nodeY + slopeAway·d), keeping
    // the through road's slope/inclination through the node instead of collapsing it to a level pad.
    _runEndpointJunctions(runKey) {
        const NONE = { is: false, y: 0, flatCamber: false, slopeAway: 0 }
        const e = this._network?.get(runKey)
        if (!e || !e.cellA || !e.cellB || !e.points || e.points.length < 2) return { jStart: NONE, jEnd: NONE }
        // `is` = needs grade reconciliation (ease toward the shared mean for C0); `flatCamber` = also kill
        // camber + read as a full intersection. Degree ≥ 2 joins reconcile grade (per-edge grading leaves a
        // small step otherwise), but only degree ≥ 3 are true junctions that flatten camber — a degree-2
        // pass-through keeps its banking/flow. (id = a blue-noise site id [cmx,cmz,k].)
        // `thisStrand` = this run's away-from-node tangent at the endpoint; slopeAway projects the node's
        // dominant grade VECTOR onto it (FEAT-19) — the through axis's slope, carried into this run.
        const nodeInfo = (id, thisStrand, isStart) => {
            // FEAT-76: at a promoted T the through road needs NO reconciliation — the two halves are
            // slices of one polyline and already agree at P to the last bit, and easing them toward
            // a line would be the one thing this ticket forbids (moving the trunk). The side road
            // does reconcile, onto the pad plane, which here IS the trunk's own surface: it leaves P
            // at the trunk's deck and on the trunk's slope, then recovers its own profile over
            // roadJunctionBlendLength. That is the whole departure treatment — a T needs no hold.
            if (_isPromotedId(id)) {
                const prom = this._promoted?.get(this._proto.graph.key(id))
                if (!prom) return NONE
                if (this._v2PromotedRole(id, runKey) !== 'side') return NONE
                return { is: true, flatCamber: true, y: prom.pos.y,
                         slopeAway: thisStrand ? prom.gx * thisStrand.wx + prom.gz * thisStrand.wz : 0,
                         plane: { cx: prom.pos.x, cz: prom.pos.z, y0: prom.pos.y, gx: prom.gx, gz: prom.gz },
                         surface: this._promotedTrunkSurface(id),
                         hold: this._junctionHoldReach(runKey, e, isStart, id, JN_HOLD_MAX_SURFACE) }
            }
            const d = this._graphDegreeOf(id)
            const is = d >= 2
            let flatCamber = d >= 3
            // QUAL-21 follow-up (2026-07-25): an admitted deg-2 ELBOW — kink beyond the old 120°
            // fillet ceiling, where the connector takes the PAD-LADDER fallback instead of a swept
            // fillet — must ALSO kill camber: the fillet used to carry banking across the bend, but
            // a flat pad meeting two ribbons banked ±15° the opposite way is a full camber flip at
            // the rim (user captures 1784910746309/1784910841316, cost-pruned valley confluences).
            // Gentle kinks (≤120°) keep their banking — the fillet arc sweeps it, bit-identical to
            // the old behaviour. Pure fn of the registered endpoint tangents (window-invariant).
            if (d === 2) {
                const strands = this._graphNodeStrands(id)
                if (strands && strands.length === 2) {
                    const dot = strands[0].wx * strands[1].wx + strands[0].wz * strands[1].wz
                    const kink = Math.PI - Math.acos(Math.max(-1, Math.min(1, dot)))
                    if (kink > 120 * Math.PI / 180) flatCamber = true
                }
            }
            let y = this._graphJunctionGradeY(id)
            let slopeAway = 0
            // QUAL-13: a true ≥3-way junction eases onto its sloped PAD PLANE — y = plane at the
            // node, slopeAway = plane grade along this strand — so every leg lands tangent to ONE
            // shared tilted plaza. Degree-2 pass-throughs keep the FEAT-19 through-axis line.
            const plane = flatCamber ? this._junctionPadPlane(id) : null
            if (plane && thisStrand) {
                y = plane.y0
                slopeAway = plane.gx * thisStrand.wx + plane.gz * thisStrand.wz
            } else if (is && thisStrand) {
                const strands = this._graphNodeStrands(id)
                if (strands) { const G = this._junctionGradeVector(strands); slopeAway = G.gx * thisStrand.wx + G.gz * thisStrand.wz }
            }
            // The plane is handed on so the hold can evaluate it AT each sample's XZ: two legs held on
            // one plane then agree wherever their ribbons overlap, which a per-leg grade LINE (arc
            // distance × slope along the leg's own departure) only approximates on a curving leg.
            return { is, flatCamber, y, slopeAway, plane: plane || null, hold: is ? this._junctionHoldReach(runKey, e, isStart, id, JN_HOLD_MAX_PLANE) : 0 }
        }
        return { jStart: nodeInfo(e.cellA, this._strandAtEnd(e.points, true), true), jEnd: nodeInfo(e.cellB, this._strandAtEnd(e.points, false), false) }
    }

    /**
     * The THROUGH ROAD'S BUILT SURFACE at a promoted T, as a height field over XZ — what the side
     * road is held to. A plane through P with the trunk's grade was measured insufficient: the
     * trunk is BANKED there (its own camber, untouched by the promotion — the through legs get no
     * blend at all), and a side road banked to the grade plane alone still met the trunk's edge
     * 0.4–2.5 m off across the overlap (junction-stitch's last twelve rows, 2026-09-07, every one
     * at a T with the trunk cambered 5–15°). So sample the trunk itself: project onto the nearer
     * through piece, take its shipped deck plus its camber tilt at that lateral — the same
     * arithmetic the ribbon sweep and _carveDirtY use — and the two ribbons share one surface
     * wherever they share ground. Reads the through pieces' profiles, which never read the side's
     * (nodeInfo returns NONE for a through leg), so there is no cycle. null when the roles are not
     * known yet (fewer than three legs registered at P).
     */
    _promotedTrunkSurface(id) {
        const strands = this._graphNodeStrands(id)
        const through = strands.filter((st) => this._v2PromotedRole(id, st.key) === 'through')
                               .map((st) => this._network.get(st.key)).filter((e) => e && e.points && e.polyCum)
        if (through.length < 2) return null
        return (x, z) => {
            let best = null, bestE = null
            for (const e of through) {
                const h = _nearestOnPolyXZ(x, z, e.points, e.polyCum)
                if (h && (!best || h.d < best.d)) { best = h; bestE = e }
            }
            if (!best) return null
            const arc = best.cum - (bestE.arcOrigin ?? 0)
            const key = [...this._network.entries()].find(([, v]) => v === bestE)?.[0]
            const lat = (x - best.fx) * best.tz - (z - best.fz) * best.tx
            return this.runProfile(arc, key).gradeY + lat * Math.sin(this.camberProfile(arc, key))
        }
    }

    /**
     * THE DECK HOLD REACH — how far out from node `id` this run's pavement still overlaps a sibling
     * leg's pavement (owner ruling 2026-09-07). Walk this run's own polyline out from the node and
     * find the LAST sample within `maxReach` at which any other run incident to the node passes
     * closer than one road width plus JN_HOLD_MARGIN, centre to centre. Up to that arc the two
     * ribbons share ground and the junction plane owns both; past it they are two roads.
     *
     * 0 when no sibling comes that close (an open crossroads), which leaves the blend exactly as it
     * was. Pure function of the registered polylines incident to the node — window-invariant over
     * the domain where the node's runs are streamed, like everything else the node blend reads.
     * Cheap: a few dozen point-to-polyline lookups per run end, once per profile build.
     */
    _junctionHoldReach(runKey, e, atStart, id, maxReach) {
        const g = this._proto.graph
        if (!g) return 0
        const nk = g.key(id)
        const inc = this._proto.nodeInc.get(nk)
        if (!inc || inc.length < 2) return 0
        const HW = this._params?.roadHalfWidth ?? 5
        const reach = maxReach + 2 * HW + JN_HOLD_MARGIN
        const sibs = []
        for (const k of inc) {
            if (k === runKey) continue
            const s = this._network.get(k)
            if (!s || !s.points || s.points.length < 2 || !s.polyCum) continue
            const L = s.polyCum[s.polyCum.length - 1]
            const sAtStart = g.key(s.cellA) === nk
            sibs.push({ pts: s.points, cum: s.polyCum, lo: sAtStart ? 0 : Math.max(0, L - reach), hi: sAtStart ? Math.min(L, reach) : L })
        }
        return this._legPartingReach(e, atStart, sibs, maxReach)
    }

    /**
     * The parting walk itself: along run `e` from its `atStart` end, the LAST arc within `maxReach`
     * at which any of `sibs` (registered polylines, each with the arc window to search) passes
     * closer than one road width plus JN_HOLD_MARGIN, centre to centre. 0 if none ever does. Shared
     * by the deck hold (_junctionHoldReach, siblings from the graph incidence) and the pad's per-leg
     * cutback (_detectNodeJunctions, siblings from the endpoint cluster) so the pad ends exactly
     * where the profiles let go of the plane. Pure fn of its inputs.
     */
    _legPartingReach(e, atStart, sibs, maxReach) {
        if (!sibs.length) return 0
        const HW = this._params?.roadHalfWidth ?? 5
        const CLEAR = 2 * HW + JN_HOLD_MARGIN
        const pts = e.points, n = pts.length
        let hold = 0, arc = 0
        for (let i = 0; i < n; i++) {
            const idx = atStart ? i : n - 1 - i
            if (i > 0) {
                const q = pts[atStart ? idx - 1 : idx + 1]
                arc += Math.hypot(pts[idx].x - q.x, pts[idx].z - q.z)
                if (arc > maxReach) break
            }
            const p = pts[idx]
            for (const sb of sibs) {
                const h = _nearestOnPolyXZ(p.x, p.z, sb.pts, sb.cum, sb.lo, sb.hi)
                if (h && h.d < CLEAR) { hold = arc; break }
            }
        }
        return hold
    }

    // FEAT-19: one run END at a node → unit XZ tangent pointing AWAY from the node + the longitudinal grade
    // slope (dGradeY/m) moving away. isStart picks the start endpoint (cellA, points[0]) vs the end
    // (cellB, last point). Returns null for a degenerate zero-length terminal segment. Pure fn of points.
    _strandAtEnd(pts, isStart) {
        const N = pts.length
        const p0 = isStart ? pts[0] : pts[N - 1]          // the node endpoint
        const p1 = isStart ? pts[1] : pts[N - 2]          // the next interior point (away from node)
        const dx = p1.x - p0.x, dz = p1.z - p0.z
        const len = Math.hypot(dx, dz)
        if (len < 1e-6) return null
        return { wx: dx / len, wz: dz / len, mAway: (p1.y - p0.y) / len }
    }

    // FEAT-19: incident strands at a GRAPH node (away-tangent + away-slope per registered incident edge).
    /**
     * FEAT-76: at a promoted T, WHICH LEG IS THE THROUGH ROAD?
     *
     * Derived from the built tangents, never from a stored run key. The commit knows which runs it
     * made, but a later promotion can split one of them again (a trunk that carries two forks, a
     * side road that becomes someone else's trunk) and then a stored key names a run that no longer
     * exists — at which point the junction blend stops recognising the departing leg and ships a
     * step at the node. The geometry cannot go stale: the two legs whose away-tangents are most
     * nearly anti-parallel ARE the through road, which is the same thing a driver sees.
     *
     * Returns 'through' | 'side' | null (not a promoted node, or not yet three legs).
     */
    _v2PromotedRole(id, runKey) {
        if (!_isPromotedId(id)) return null
        const nk = this._proto.graph.key(id)
        if (!this._promotedRoleMemo || this._promotedRoleMemo.rev !== this._networkRev)
            this._promotedRoleMemo = { rev: this._networkRev, map: new Map() }
        let roles = this._promotedRoleMemo.map.get(nk)
        if (!roles) {
            roles = new Map()
            const strands = this._graphNodeStrands(id)
            if (strands.length >= 3) {
                let bi = 0, bj = 1, bDot = Infinity
                for (let i = 0; i < strands.length; i++) for (let j = i + 1; j < strands.length; j++) {
                    const d = strands[i].wx * strands[j].wx + strands[i].wz * strands[j].wz
                    if (d < bDot) { bDot = d; bi = i; bj = j }
                }
                for (let i = 0; i < strands.length; i++) roles.set(strands[i].key, (i === bi || i === bj) ? 'through' : 'side')
            }
            this._promotedRoleMemo.map.set(nk, roles)
        }
        return roles.get(runKey) || null
    }

    _graphNodeStrands(id) {
        const g = this._proto.graph
        const inc = g ? this._proto.nodeInc.get(g.key(id)) : null
        if (!inc || !inc.length) return []
        const kid = g.key(id)
        const out = []
        for (const runKey of inc) {
            const e = this._network?.get(runKey)
            if (!e || !e.points || e.points.length < 2) continue
            const s = this._strandAtEnd(e.points, g.key(e.cellA) === kid)
            if (s) { s.key = runKey; out.push(s) }
        }
        return out
    }

    // FEAT-19: the dominant grade VECTOR at a junction node (world XZ, dGradeY per horizontal metre). The
    // node's THROUGH axis = the most anti-collinear pair of incident strands (a T-junction's crossbar
    // arms, or a degree-2 pass-through's two arms); the steeper of that pair (tie-break lower runKey)
    // defines the surface every strand is reconciled to. Projecting this vector onto each strand's tangent
    // (slopeAway) gives a grade LINE that keeps the through slope and lets the joining roads match it,
    // instead of easing everything to a flat scalar (the level-pad bug). Pure fn of the incident strands
    // → window-invariant over the domain where the node's edges are all streamed (same as the mean-Y).
    _junctionGradeVector(strands) {
        if (!strands || strands.length < 2) return { gx: 0, gz: 0 }
        let bi = 0, bj = 1, minDot = Infinity
        for (let i = 0; i < strands.length; i++) {
            for (let j = i + 1; j < strands.length; j++) {
                const d = strands[i].wx * strands[j].wx + strands[i].wz * strands[j].wz
                if (d < minDot) { minDot = d; bi = i; bj = j }
            }
        }
        const a = strands[bi], b = strands[bj]
        const dom = (Math.abs(a.mAway) > Math.abs(b.mAway) || (Math.abs(a.mAway) === Math.abs(b.mAway) && a.key <= b.key)) ? a : b
        return { gx: dom.mAway * dom.wx, gz: dom.mAway * dom.wz }
    }

    // FEAT-13 v2 graph-mode junction Y: the AVERAGE endpoint grade-Y of every registered run incident to
    // this site (via the _assembleGraphEdges incidence map) — the mean ROAD height, so easing toward it
    // doesn't collapse the junction to the terrain valley floor even when all incident roads bridge the
    // valley on a fill (the ~10 m hump/dip regression). Falls back to the site terrain Y if no incident run.
    _graphJunctionGradeY(id) {
        const g = this._proto.graph
        const inc = g ? this._proto.nodeInc.get(g.key(id)) : null
        if (!inc || !inc.length) return this._siteAt(id).y
        let sum = 0, n = 0
        for (const runKey of inc) {
            const e = this._network?.get(runKey)
            if (!e || !e.points || e.points.length < 2) continue
            // endpoint matching this node: cellA → points[0], cellB → last
            if (g.key(e.cellA) === g.key(id)) { sum += e.points[0].y; n++ }
            else if (g.key(e.cellB) === g.key(id)) { sum += e.points[e.points.length - 1].y; n++ }
        }
        return n > 0 ? sum / n : this._siteAt(id).y
    }

    // ── QUAL-13: sloped junction pad plane ──────────────────────────────────────────────────
    /**
     * The pad PLANE for a ≥3-way graph junction: { cx, cz, y0, gx, gz } with
     * padY(x,z) = y0 + gx·(x−cx) + gz·(z−cz). Replaces the flat nodeY = mean(end Ys) disc that
     * dug huge uphill cut walls wherever a junction sits on a hillside (the pad held the DOWNHILL
     * mean while the uphill terrain towered over it).
     *
     * Grade vector: least-squares fit of the incident strands' arrival slopes — solve
     * min Σ (G·dir_i − mAway_i)² over the node's strands, so the pad tilts the way the roads
     * already climb (emergent from the graded network, not injected). Clamped to
     * roadJunctionPadMaxGrade so the plaza stays drivable. Collinear/degenerate strand sets fall
     * back to the FEAT-19 through-axis vector.
     *
     * Elevation: mean approach Y (the old nodeY), then biased toward the L1-best fit of the raw
     * coarse terrain over the pad disc (median of plane-residuals at a fixed ring pattern),
     * capped at ±roadJunctionPadTerrainBias. All Ys live in the pre-amplitude routed/points
     * space (network point Ys ARE _coarseH values — same field the router prices).
     *
     * Pure fn of the streamed incident runs + coarse noise + params → deterministic and
     * window-invariant over the domain where the node's edges are streamed (same guarantee as
     * _graphJunctionGradeY). Cached per node key, rev-guarded like the profile caches.
     * @param {Array} id — graph site id [cmx,cmz,k]
     * @returns {{cx:number,cz:number,y0:number,gx:number,gz:number}|null} null → caller keeps
     *   the flat/through-axis behavior
     */
    _junctionPadPlane(id) {
        const g = this._proto.graph
        if (!g) return null
        const key = g.key(id)
        if (!this._padPlaneCache) this._padPlaneCache = new Map()
        const hit = this._padPlaneCache.get(key)
        if (hit && hit.rev === this._networkRev) return hit.plane
        const plane = this._computePadPlane(id)
        this._padPlaneCache.set(key, { rev: this._networkRev, plane })
        return plane
    }

    _computePadPlane(id) {
        const p = this._params || {}
        const maxG = p.roadJunctionPadMaxGrade ?? 0.07
        const strands = this._graphNodeStrands(id)
        if (!strands || strands.length < 2) return null
        // FEAT-76: a PROMOTED node's plane is NAILED to the trunk — y0 is the trunk's own deck at
        // the departure point and the grade vector is the trunk's own longitudinal grade there.
        // No least-squares fit over the three strands, and above all no terrain bias: an ordinary
        // site node has no deck of its own and is right to be pulled toward the ground, but this
        // node IS a point on a road that is already built. Letting the bias move it (up to
        // roadJunctionPadTerrainBias, 3 m) would put a step in the middle of a previously smooth
        // through road — the one thing this ticket's ruling forbids. There is no freedom here.
        // roadJunctionPadMaxGrade is NOT applied here. It exists so a plaza fitted through several
        // legs' arrival slopes cannot come out as a cliff; this plane is not fitted, it IS the
        // through road's own surface, and that road already grades inside the network's contract.
        // Clamping it would tilt the pad away from the trunk and put the step back.
        const prom = _isPromotedId(id) ? this._promoted?.get(this._proto.graph.key(id)) : null
        if (prom) return { cx: prom.pos.x, cz: prom.pos.z, y0: prom.pos.y, gx: prom.gx, gz: prom.gz }
        const site = this._siteAt(id)
        const cx = site.x, cz = site.z
        // Least-squares grade vector from arrival slopes (2×2 normal equations).
        let sxx = 0, sxz = 0, szz = 0, bx = 0, bz = 0
        for (const s of strands) {
            sxx += s.wx * s.wx; sxz += s.wx * s.wz; szz += s.wz * s.wz
            bx  += s.wx * s.mAway; bz += s.wz * s.mAway
        }
        let gx, gz
        const det = sxx * szz - sxz * sxz
        if (det > 1e-4) {
            gx = (szz * bx - sxz * bz) / det
            gz = (sxx * bz - sxz * bx) / det
        } else {
            const G = this._junctionGradeVector(strands)   // near-collinear legs: through-axis
            gx = G.gx; gz = G.gz
        }
        const mag = Math.hypot(gx, gz)
        if (maxG <= 0) { gx = 0; gz = 0 }
        else if (mag > maxG) { const k = maxG / mag; gx *= k; gz *= k }

        let y0 = this._graphJunctionGradeY(id)
        const biasCap = p.roadJunctionPadTerrainBias ?? 3.0
        if (biasCap > 0) {
            // Median plane-residual of raw coarse terrain over the pad disc: centre + two fixed
            // 8-point rings at R/2 and R (R = the pad's physical extent — cutback + halfWidth).
            const R = (p.roadJunctionCutback ?? 10) + (p.roadHalfWidth ?? 5)
            const res = [this._coarseH(cx, cz)]
            for (const r of [R * 0.5, R]) {
                for (let a = 0; a < 8; a++) {
                    const ang = a / 8 * Math.PI * 2
                    const dx = Math.cos(ang) * r, dz = Math.sin(ang) * r
                    res.push(this._coarseH(cx + dx, cz + dz) - (gx * dx + gz * dz))
                }
            }
            res.sort((a, b) => a - b)
            const median = res[(res.length - 1) >> 1]
            y0 += Math.max(-biasCap, Math.min(biasCap, median - y0))
        }
        return { cx, cz, y0, gx, gz }
    }

    // QUAL-13: evaluate a pad plane at world XZ (shared by the blend, _detectNodeJunctions and the
    // pad-mesh fallback so every consumer reads ONE surface).
    _padPlaneY(plane, x, z) {
        return plane.y0 + plane.gx * (x - plane.cx) + plane.gz * (z - plane.cz)
    }

    // Mutate gradeY (→ a grade LINE) and/or camberRad (→0) in place within roadJunctionBlendLength of a
    // junction endpoint, via a smoothstep ramp. Pass null for whichever array isn't being flattened.
    // FEAT-19: the grade target is the LINE `endpoint.y + slopeAway·d` (d = distance from the node along
    // this run), NOT the flat scalar `endpoint.y`. d ≥ 0 at both ends and slopeAway is the through-axis
    // slope moving AWAY from the node, so the through road holds its grade across the node (no level pad)
    // while both runs still meet at endpoint.y AT the node (d = 0) → C0 step-free. Camber is unchanged
    // (still → 0 only at flatCamber ≥3-way nodes): inclination handling stays as-is.
    _applyJunctionBlend(runKey, arcPos, gradeY, camberRad, pts) {
        const ej = this._runEndpointJunctions(runKey)
        if (!ej.jStart.is && !ej.jEnd.is) return
        const Rj = this._params?.roadJunctionBlendLength ?? 30
        if (Rj <= 0) return
        const N = arcPos.length, aStart = arcPos[0], aEnd = arcPos[N - 1]
        const ss = (t) => t * t * (3 - 2 * t)
        const havePts = !!pts && pts.length === N
        // The height this run is reconciled TO at sample i, `d` metres out from endpoint j: the pad
        // PLANE at the sample's own XZ when the node has one (a ≥3-way junction, or a promoted T's
        // side road — the plane there IS the trunk's surface), else FEAT-19's grade line.
        const target = (j, i, d) => {
            if (havePts && j.surface) { const y = j.surface(pts[i].x, pts[i].z); if (y != null) return y }
            return (j.plane && havePts) ? this._padPlaneY(j.plane, pts[i].x, pts[i].z) : j.y + j.slopeAway * d
        }
        // DECK HOLD (owner ruling 2026-09-07): the leg rides the plane out to `hold` — where its
        // pavement has parted from every sibling's (_junctionHoldReach) — and only then eases back
        // to its own solved profile. Capped so both ends of a short run never fight across the middle.
        const reachCap = Math.max(Rj, (aEnd - aStart) * 0.45)
        const hS = Math.min(ej.jStart.hold || 0, (aEnd - aStart) * 0.45)
        const hE = Math.min(ej.jEnd.hold || 0, (aEnd - aStart) * 0.45)
        // QUAL-13: adaptive GRADE reach past the hold. When the plane sits far above/below this
        // run's own profile where the hold lets go, easing the full ΔY over the fixed 30 m
        // manufactures a 60–130 % grade spike at the mouth (the road-character "max grade pinned
        // at junction blends" artifact). Stretch the recovery so the correction grade itself stays
        // ≤ roadJunctionBlendMaxGrade. Camber keeps the fixed Rj reach (banking should still
        // recover near the pad).
        const maxBG = this._params?.roadJunctionBlendMaxGrade ?? 0.12
        const gradeReach = (j, hold, fromStart) => {
            if (!j.is || !gradeY || maxBG <= 0) return Rj
            // the run's own profile at the first sample past the hold, against the plane there
            let i = fromStart ? 0 : N - 1
            while (fromStart ? (i < N - 1 && arcPos[i] - aStart < hold) : (i > 0 && aEnd - arcPos[i] < hold)) i += fromStart ? 1 : -1
            const d = fromStart ? arcPos[i] - aStart : aEnd - arcPos[i]
            return Math.min(Math.max(Rj, reachCap - hold), Math.max(Rj, Math.abs(target(j, i, d) - gradeY[i]) / maxBG))
        }
        const RgS = gradeReach(ej.jStart, hS, true)
        const RgE = gradeReach(ej.jEnd, hE, false)
        // weight at `d` metres out: 1 inside the hold, smoothstep down over `reach` past it
        const w = (d, hold, reach) => d <= hold ? 1 : (d < hold + reach ? ss(1 - (d - hold) / reach) : 0)
        // THE ROLL HALF of normal matching (owner, BUG-56: "camber gives the roll, grade gives the
        // pitch — both, or the car is thrown"). A leg held on a sloping plane with a FLAT
        // cross-section has its edges off that plane by halfWidth × the plane's cross-slope, and
        // two such legs 45° apart on a 7 % plane still disagreed by 0.67 m where their edges
        // touched (seed 6 (-892,-499), measured after the grade hold alone). So inside the hold
        // the banking is not killed but SET: the plane's cross-slope in this run's own frame —
        // +lateral is (tz, -tx) and tilt rises toward +lateral for +camber, the convention
        // _carveDirtY and the ribbon sweep both read. No plane (a degree-2 pass-through) keeps
        // the old kill-to-flat.
        const HWc = this._params?.roadHalfWidth ?? 5
        const planeCam = (j, i) => {
            if (!j.plane || !havePts) return 0
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)]
            const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1
            const tx = dx / l, tz = dz / l
            if (j.surface) {
                // the trunk's built surface: its cross-slope across THIS run, read AT THE RIBBON
                // EDGES (±halfWidth). Read 1 m either side it was a tangent, and the trunk's
                // banking changes along its arc, so this run's edges — which land on the trunk
                // up to halfWidth·sin(angle) apart along it — sat 0.2–0.3 m off (junction-stitch
                // 2026-09-07). Fitting through the edges puts the edges ON the trunk, which is
                // where two ribbons meet.
                const x = pts[i].x, z = pts[i].z
                const yp = j.surface(x + HWc * tz, z - HWc * tx), ym = j.surface(x - HWc * tz, z + HWc * tx)
                if (yp != null && ym != null) return Math.atan((yp - ym) / (2 * HWc))
            }
            return Math.atan(j.plane.gx * tz - j.plane.gz * tx)
        }
        for (let i = 0; i < N; i++) {
            // fG = grade-reconcile weight (any junction endpoint); fC = camber weight (only a
            // flatCamber endpoint, i.e. a true ≥3-way intersection — a degree-2 graph pass-through keeps
            // its banking while still reconciling grade to C0).
            let fG = 0, ny = 0, fC = 0, nc = 0
            if (ej.jStart.is) {
                const d = arcPos[i] - aStart
                const fs = w(d, hS, RgS)
                if (fs > fG) { fG = fs; ny = target(ej.jStart, i, d) }
                if (ej.jStart.flatCamber) { const fc = w(d, hS, Rj); if (fc > fC) { fC = fc; nc = planeCam(ej.jStart, i) } }
            }
            if (ej.jEnd.is) {
                const d = aEnd - arcPos[i]
                const fs = w(d, hE, RgE)
                if (fs > fG) { fG = fs; ny = target(ej.jEnd, i, d) }
                if (ej.jEnd.flatCamber) { const fc = w(d, hE, Rj); if (fc > fC) { fC = fc; nc = planeCam(ej.jEnd, i) } }
            }
            if (gradeY && fG > 0)    gradeY[i] += (ny - gradeY[i]) * fG
            if (camberRad && fC > 0) camberRad[i] += (nc - camberRad[i]) * fC
        }
    }

    // FEAT-07 Step 2 + FEAT-19: reconcile this run toward each AT_GRADE MID-SPAN crossing within
    // roadJunctionBlendLength of the crossing arc — the same smoothstep ramp as _applyJunctionBlend, but
    // anchored at an interior arcS (a graph mid-span crossing) instead of a shared anchor endpoint. This
    // is the JOINING/upright side only (the through/crossbar strand registered no crossing entry, so it
    // keeps its grade). FEAT-19: the ease target is a grade LINE x.nodeY + x.slope·(s − x.arc) — the
    // through strand's surface (CONTACT Y + local slope) — NOT a flat scalar. At the crossing (s = x.arc)
    // the target = the through CONTACT Y, so both strands still meet at one elevation → no invisible step
    // (the FEAT-07 "mess" fix); away from it the joining road follows the through slope instead of going
    // flat. The ribbon, the carve, and physics all read this gradeY (mesh == collision, QUAL-07). Pure fn
    // of _crossingsByRun (itself a pure fn of the network) → window-invariant. No-op for runs with none.
    _applyMidspanJunctionBlend(runKey, arcPos, gradeY, camberRad) {
        const xs = this._crossingsByRun?.get(runKey)
        if (!xs || xs.length === 0) return
        const Rj = this._params?.roadJunctionBlendLength ?? 30
        if (Rj <= 0) return
        const N = arcPos.length
        const aStart = arcPos[0], aEnd = arcPos[N - 1]
        const ss = (t) => t * t * (3 - 2 * t)
        for (let i = 0; i < N; i++) {
            let f = 0, ny = 0
            for (const x of xs) {
                const d = Math.abs(arcPos[i] - x.arc)
                if (d < Rj) { const fs = ss(1 - d / Rj); if (fs > f) { f = fs; ny = x.nodeY + x.slope * (arcPos[i] - x.arc) } }
            }
            if (f <= 0) continue
            // Endpoint taper: a mid-span crossing's ramp must NOT alter gradeY/camber at the run's own
            // endpoints — that is the shared-anchor blend's territory, and the continuing neighbour run
            // keeps its anchor value there. Forcing this run's end toward a crossing nodeY breaks C0
            // (a collision-only step, road-smoothness) and the cross-run camber seed (camber-continuity).
            // Zero the influence within Rj of each end so endpoints stay = the graded anchor value.
            let g = 1
            const dS = arcPos[i] - aStart; if (dS < Rj) g = Math.min(g, ss(dS / Rj))
            const dE = aEnd - arcPos[i];   if (dE < Rj) g = Math.min(g, ss(dE / Rj))
            f *= g
            if (f <= 0) continue
            if (camberRad) camberRad[i] *= (1 - f)
            if (gradeY)    gradeY[i] += (ny - gradeY[i]) * f
        }
    }

    _buildCamberProfile(runKey) {
        const netEntry = this._network?.get(runKey)
        if (!netEntry || !netEntry.points || netEntry.points.length < 2) return null
        // BUG-19: build via the shared canonical routine, seeded from the predecessor's end (P4/BUG-10).
        // _runEndCamber uses the SAME routine, so the seed equals the predecessor profile's real end.
        const prof = this._computeCamberArrays(netEntry.points, netEntry.arcOrigin, this._runStartCamber(runKey))
        // BUG-56 B4 first, junction blend second: a ≥3-way node is a flat plaza and outranks a fork's
        // bank, so the node's camber-kill must be the last word where the two reaches overlap.
        this._applyJunctionBlend(runKey, prof.arcPos, null, prof.camberRad, netEntry.points)   // FEAT-10: camber→0 at shared-anchor junctions
        this._applyMidspanJunctionBlend(runKey, prof.arcPos, null, prof.camberRad)   // FEAT-07 Step 2: camber→0 at AT_GRADE crossings
        return prof
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
        const maxCamberRad    = (p.camberMaxAngleDeg ?? 20) * (Math.PI / 180)   // asymptotic max bank
        const kHalf           = 1 / (p.camberKneeRadiusM ?? 60)                 // half-bank curvature
        const slewRateRadPerM = (p.roadCamberRate ?? 1.5) * (Math.PI / 180)

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
            rawCamber[i] = camberFromCurvature(kappa, maxCamberRad, kHalf)
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

        // FEAT-10: seal the ribbon across run joins. The ribbon cross-section frame is runProfile.tx/tz;
        // at a run's endpoints the LOCAL last-segment direction kinks vs the neighbour run, so the two
        // runs' ±halfWidth edge vertices don't meet → an outside-of-bend wedge (terrain shows through),
        // even though the centerline is continuous. Every run touching a node targets that node's edge
        // heading (_edgeTerminalHeading toward the neighbour), so blending each run's endpoint
        // tangent toward it over roadJoinWeldLength makes adjacent endpoint cross-sections COINCIDE → the
        // edges line up → the join seals. Not an average/weld: it's the shared node tangent both runs
        // already agree on. (Guarded against a reverse-stored run by the forward-dot check.)
        {
            const Rw = p.roadJoinWeldLength ?? 6
            if (Rw > 0 && netEntry.cellA && netEntry.cellB) {
                const hS = this._edgeTerminalHeading(netEntry.cellA, netEntry.cellB)
                const hE = this._edgeTerminalHeading(netEntry.cellB, netEntry.cellA)
                let sx = Math.cos(hS), sz = Math.sin(hS), ex = Math.cos(hE), ez = Math.sin(hE)
                const fwdS = tx[0] * sx + tz[0] * sz >= 0, fwdE = tx[N - 1] * ex + tz[N - 1] * ez >= 0
                const aS = arcPos[0], aE = arcPos[N - 1]
                for (let i = 0; i < N; i++) {
                    let bx = tx[i], bz = tz[i]
                    const dS = arcPos[i] - aS
                    if (fwdS && dS < Rw) { const t = 1 - dS / Rw, f = t * t * (3 - 2 * t); bx += (sx - bx) * f; bz += (sz - bz) * f }
                    const dE = aE - arcPos[i]
                    if (fwdE && dE < Rw) { const t = 1 - dE / Rw, f = t * t * (3 - 2 * t); bx += (ex - bx) * f; bz += (ez - bz) * f }
                    const L = Math.hypot(bx, bz) || 1e-8
                    tx[i] = bx / L; tz[i] = bz / L
                }
            }
        }

        // FEAT-10: flatten grade → nodeY and camber → 0 near merged junction endpoints so crossing
        // runs agree at the node (no invisible collision step, no banking jolt). Same blend as
        // _buildCamberProfile → the ribbon (camberProfile) and the run profile stay in sync at junctions.
        this._applyJunctionBlend(runKey, arcPos, gradeY, camberRad, pts)
        // FEAT-07 Step 2: same flatten at AT_GRADE mid-span crossings (both strands → one shared node Y).
        this._applyMidspanJunctionBlend(runKey, arcPos, gradeY, camberRad)

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
        // BUG-53: over a ceded strand the run's primitive centerline is a stale record (the points
        // follow the winner's course), and over a TAPER BAND the points are a blend that was never
        // on any centerline. Both must sweep from the points (Catmull-Rom fallback) or the ribbon
        // follows the old line off the carve — a fringe-served ceded slice, and every taper.
        let cededHere = false
        if (entry && entry.offCurveSpans) {
            const ao = entry.arcOrigin ?? 0
            const lo = Math.min(arcSHead, arcSTail) + ao, hi = Math.max(arcSHead, arcSTail) + ao
            cededHere = entry.offCurveSpans.some((csp) => hi > csp.s0 + 1e-6 && lo < csp.s1 - 1e-6)
        }
        let spline
        if (!cededHere && entry && entry.centerline && entry.centerline.length > 1e-6 && entry.polyCum) {
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
