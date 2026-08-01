// ── FEAT-45: dispersed camping zones ───────────────────────────────────────────────────────
//
// A dispersed-camping ZONE is a permission, not a place: a big soft area of the map (BLM/forest-
// service style) inside which pulling off the road and sleeping is allowed. It carries no quality
// judgement at all — how good a given spot is comes from the LIVE grading in Phase D (flatness /
// view / shade / water), never from the zone. That split is deliberate and it is what makes SM-INV-12
// cheap to honour: with no suitability test at zone level, a zone is a pure function of
// (worldSeed, its macro cell, CAMP_PARAMS) and nothing else.
//
// THE WINDOW-INVARIANCE RULE (SM-INV-12, and the poi.js discipline restated): a zone's existence,
// centre and radius may depend ONLY on the seed and the macro cell it was rolled in. Never on the
// region centre, never on the streaming window, never on what this system did a minute ago. The
// region clip is applied as a POST-FILTER in build() — see the comment there — exactly as
// PoiSystem.build() clips its POIs, and for the same reason: a reject test folded into generation
// would let the region centre decide WHICH zones exist, and a zone 400 m inside the wall would
// move when the window moved.
//
// WHAT THE PLAYER SEES: never the disc. On the 2D map a zone renders only as a yellow casing along
// the roads that run through it (map2d._drawCampZones), and camping is tethered to within
// `campRoadEdgeM` of the road edge — the player is not meant to wander off-road hunting spots.
// So the disc is a road-corridor selector, not a blob of terrain, and its exact boundary is never
// drawn or driven into.
//
// Isolation discipline (the story.js / poi.js / day.js rule): no THREE, no worldgen imports.
// Everything arrives through the `deps` adapter main.js hands us.

import { hash32, mulberry32 } from './poi.js'

/**
 * Tunables. Zone siting + the road tether only — none of this may ever enter routeCacheSig
 * (that object re-keys every baked route bundle; a camp* key landing in it would re-bake the world
 * for a camping knob). Same reason POI_PARAMS and DAY_PARAMS stand apart.
 */
export const CAMP_PARAMS = {
    campCellM:      1024,   // m — macro cell; one zone roll per cell
    campZoneChance: 0.26,   // P(a cell carries a zone) — see THE COVERAGE ARITHMETIC below
    campMinRadiusM: 350,    // zone radius ~ U[min, max]; mean diameter ≈ 1 km (RATIFIED)
    campMaxRadiusM: 650,
    campRoadEdgeM:  40,     // m past the shoulder edge that dispersed camping is allowed (owner
                            // 2026-07-31: was 20 — the wider tether roughly doubles the siting
                            // ray's candidate ladder, so watch the re-grade cost if widened again)

    // ── The site (Phase D) ────────────────────────────────────────────────────────────────────
    campPadHalfM:    3,     // m — half-extent of the camp bench: a 6 m pad, RATIFIED
    campPadGapM:     0.6,   // m — gap from the shoulder edge to the pad's near side (poiPadGap's twin)
    campGradeAreaM:  6,     // m — the square the site is graded over (flatness)
    campShadeR:      10,    // m — tree-count reach for the shade score (owner, 2026-07-30: shade
                            // reads a wider ring than flatness — a pine 8 m off still shades the pad)
    campMaxUnevenM:  0.9,   // m — spread at/above which the flatness SCORE bottoms out at zero.
                            // (Was also the campable gate; split 2026-07-31 — see campGateUnevenM.
                            // 0.6 → 0.9 same day: the score curve was too strict — ordinary decent
                            // ground was reading as mediocre.)
    campGateUnevenM: 1.2,   // m — spread above which a site is NOT campable at all (owner,
                            // 2026-07-31: the shared 0.6 floor made even a crappy site too hard to
                            // find on hilly ground). Between the two, a site camps at zero flatness
                            // credit — extra flatness is still rewarded on the same curve.
    campShadeFullN:  5,     // trees inside the shade ring that earn FULL shade credit (owner: 5
                            // over the 10 m ring — 3 was tuned for the old 6 m reach)
    campWaterR:      30,    // m — how far out water still counts for anything
    campWaterBestM:  5,     // m — at or inside this, full water credit (camping ON the bank is best)
    campMomsRadiusM: 25,    // m — park-trigger radius at mom's house

    // ── The view (the field-of-vision scan — see skylineView) ─────────────────────────────────
    campViewR:        2000, // m — outer reach of the scan. "Extremely far away" has to mean km, not
                            // hundreds of metres, or a hillside 600 m off reads as a vista.
    campViewFarM:     1200, // m — distance at which terrain counts as fully far away. Terrain nearer
                            // than this scores in proportion, so 60 m of hillside is worth ~nothing.

    // THE SCAN SEES FURTHER THAN THE GAME DRAWS, DELIBERATELY AND FOR NOW (owner, 2026-08-01; see
    // FEAT-52). The scan samples rawHeightWorld, which is analytic and defined everywhere, so it
    // scores mountains that are never rendered: the terrain mesh ends at the chunk ring (~160 m on
    // Normal, ~288 m on Ultra), FogExp2 at 0.006 is 96% opaque by 300 m, and the camera far plane
    // clips at 1000 m. campViewFarM 1200 is therefore PAST the far plane. The far half of this
    // judgement is real terrain the player cannot yet see, and the score is knowingly ahead of the
    // renderer — FEAT-52 is what closes the gap. Do not "fix" it by shrinking the scan to the fog:
    // that reduces an epic view to "you can see 200 m", which is not the thing being scored.
    campViewNearM:    12,   // m — first sample. Nearer than this is the pad itself, not the view.
    campViewAz:       12,   // azimuths (every 30°)
    campViewSteps:    18,   // samples per azimuth, GEOMETRICALLY spaced near→far: occlusion is
                            // decided by near ground, so that is where the resolution belongs.
    campViewEyeM:     5,    // m — probe height (owner, 2026-08-01). NOT an eye height: nobody sits
                            // welded to the pad, and a handful of steps to the edge of the clearing
                            // is part of camping there. 5 m buys back roughly that much, in the one
                            // variable a single-point scan has to spend it in.
    campViewFovDeg:   20,   // ° — the field of vision judged, above and below level. Everything
                            // steeper than this down is the ground at your feet and everything
                            // steeper up is the sky or a wall you are not looking at.
    campViewShapeLo:  0.05, // the response curve on the raw far-fraction: at/below LO the view scores
    campViewShapeHi:  0.22, // 0, at/above HI it scores 1, smoothstepped between. LO is what makes a
                            // mediocre outlook worth nothing instead of a third of a segment; HI is
                            // what keeps a genuinely big view REACHABLE rather than asymptotic.
                            //
                            // BOTH ARE MEASURED, NOT CHOSEN, AND THE POPULATION THEY ARE MEASURED
                            // OVER IS THE WHOLE POINT (2026-08-01, seeds 1/6/42). Calibrated against
                            // the whole map the window is p50 0.125 / max 0.67 — and camping it is
                            // then nearly impossible to max, because FLAT GROUND AND BIG VIEWS ARE
                            // ANTICORRELATED: flat ground is valley floor. Over CAMPABLE ground only
                            // (spread ≤ campGateUnevenM, ~7% of the map) the same statistic runs
                            // p50 0.08 · p90 0.165 · best ~0.26–0.41. The score's job is to rank
                            // campsites against each other, so the campable population is the right
                            // denominator and these two are set on it. Re-measure over CAMPABLE
                            // ground before moving either.
}

// Vibe weights, RE-RATIFIED 2026-08-01 as the bar's FOUR segments: flatness 40%, view 15%, shade
// 20%, water 25%. (Was flat 50 / shade 30 / water 20 before the view segment landed.) They are the
// max widths of the stacked bar as well as the score weights, so the bar IS the score — a full
// flatness segment is visibly two fifths of the bar because flatness is two fifths of the judgement.
// Keep the four in the bar's left-to-right order; index.html and _renderVibeBar assume it.
export const VIBE_W = { flat: 0.4, view: 0.15, shade: 0.2, water: 0.25 }

// Grading lattice: 5×5 over the 6 m square (1.5 m spacing). Enough to catch a rock ledge or a ditch
// lip without turning a 10 Hz poll into a terrain-sampling loop.
const GRADE_N = 5

// ── THE SITING RAY (owner's post-drive pass, 2026-07-30) ──────────────────────────────────────
// Grading the ONE spot just off the shoulder made every camp land on the shoulder ("pretty, not
// vibey"), and on hilly ground it declared most of a zone uncampable because the single spot it
// looked at happened to be the road's own cut slope. So the site is now chosen by casting a ray
// straight out from the road edge on the driver's side and grading a ladder of candidates along it.
//
//   CAMP_RAY_STEP_M  spacing of the candidates (≈11 of them over the 20 m tether)
//   CAMP_RESAMPLE_M  how far the truck must move before the ladder is re-graded
//
// THE MEMO IS A DISTANCE, NOT A GRID. Quantizing the query position (snapping it to a lattice) would
// be the cheaper-looking memo and it is the project's standing footgun: worldgen queries must never
// be fed a rounded position (PERF-24/25's never-quantize-the-query lesson), because two truck
// positions 10 cm apart would then grade DIFFERENT ground and the score would pop as you crept. So
// the memo holds the exact position the ladder was graded at and re-grades once the truck has left a
// CAMP_RESAMPLE_M ball around it — same query, just less often. The road SIDE is part of the memo
// key too: crossing the centerline flips which way the ray points, and that is a different ladder.
const CAMP_RAY_STEP_M = 2
const CAMP_RESAMPLE_M = 1.5

// THE COVERAGE ARITHMETIC (target ≈ 20% of map area, owner-ratified).
//   cell area                = 1024²                       = 1.0486 km²
//   E[r²] for r ~ U[350,650] = (a² + ab + b²)/3             = 257 500 m²
//   E[zone area | rolled]    = π · E[r²]                    = 0.8090 km²
//   expected coverage        = chance · 0.8090 / 1.0486     = chance · 0.7715   (before overlap)
// So chance 0.26 gives ~20.1% expected, and discs that overlap each other or spill across cell
// borders pull the MEASURED figure a little under that (a Poisson-ish 1 − e^−0.20 ≈ 18%).
// MEASURED (20 k Monte-Carlo samples, 2026-07-30): 20.0% over seed 6's 2.5 km story region, and
// 17.8–19.5% as a global density across seeds 1/6/7/42 over a 60 km box. Acceptance band is
// [15%, 25%]; do not "tidy" this constant without re-measuring.

// Radius max (650 m) < cell (1024 m), so a disc whose centre sits in cell C can reach at most one
// cell beyond C in each direction. Every point query therefore only has to scan the 3×3 cell
// neighbourhood around the query's own cell. Keep this true if the radii are ever retuned.
const NEIGHBOR_CELLS = 1

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * How epic the outlook from (x,z) is, 0..1 — the raw view score, before VIBE_W.view scales it.
 *
 * THE DEFINITION (owner, 2026-08-01): a good view is one where the MAJORITY OF YOUR FIELD OF VISION
 * is looking at terrain that is extremely far away. Everything below follows from that sentence, and
 * it is worth being precise about what it replaced, because the two sound alike and are not.
 *
 * The first cut scored AZIMUTHAL openness — how many compass directions were unobstructed. That is
 * the wrong axis, and a flat plain is the proof: every direction is open and sees for kilometres, so
 * it scored well, while what you would actually be looking at is grass 40 m from your boots with the
 * whole distance crushed into a hairline at the horizon. Field of vision is ANGULAR, so the scan is
 * angular: each azimuth is marched outward, and each visible sample is credited with the SLICE OF
 * VERTICAL ANGLE it fills, weighted by how far away it is. Near ground subtends a great deal of
 * angle and is worth nothing; a distant range subtends little but is worth full marks. The score is
 * that angular average — literally "what fraction of what you are looking at is far away".
 *
 * Consequences worth knowing before retuning:
 *   · campViewFovDeg clips the band to ±20° of level. Below that is the ground at your feet, which
 *     no one counts as their view, and above it is sky or a wall you are not looking at. Without the
 *     clip a summit scores badly, because the mountainside beneath you fills half the frame.
 *   · SKY IS NOT PENALISED. The average is taken over the terrain-filled part of the band only.
 *     What ruins a view is near ground in your face, not the absence of anything — so a cliff edge
 *     with nothing but air in front reads as a view (and an azimuth with no terrain in band at all
 *     scores 1). What kills a direction is a hillside, which fills the band at close range.
 *   · The azimuths are a PLAIN MEAN. "Majority of your field of vision" is a majority claim, so a
 *     vista in one direction out of twelve should not carry the site. (The first cut weighted the
 *     best third and that is exactly what made it forgiving of mediocre spots.)
 *   · Visibility is the standard viewshed test — a sample counts only if nothing closer stands
 *     higher — so a near lip that hides the valley behind it costs you the valley.
 *
 * WHY AN ANALYTIC SCAN AND NOT A REAL RAYCAST. Casting rays at the streamed chunk meshes would
 * answer a different question every time the window moved — the score would depend on what happened
 * to be resident — and that is exactly the dependency SM-INV-12 forbids. This walks a HEIGHT
 * SAMPLER instead, so it is as pure as the sampler is: fed terrain.rawHeightWorld (pure noise, no
 * carve, no streaming) the answer is a function of (worldSeed, x, z) and nothing else.
 *
 * @param {(x:number,z:number)=>number} sampleH  height sampler, metres
 * @param {number} x
 * @param {number} z
 * @param {object} P  merged CAMP_PARAMS
 * @returns {number} 0..1
 */
export function skylineView (sampleH, x, z, P) {
    const R = Math.max(1, P.campViewR)
    const near = Math.max(1, Math.min(P.campViewNearM, R))
    const AZ = Math.max(1, P.campViewAz | 0)
    const STEPS = Math.max(2, P.campViewSteps | 0)
    const h0 = sampleH(x, z)
    if (!isFinite(h0)) return 0
    const eye = h0 + P.campViewEyeM
    const fov = P.campViewFovDeg * Math.PI / 180
    const farM = Math.max(1e-6, P.campViewFarM)
    const growth = Math.pow(R / near, 1 / (STEPS - 1))

    let sum = 0
    for (let a = 0; a < AZ; a++) {
        const ang = (a / AZ) * Math.PI * 2
        const dx = Math.cos(ang), dz = Math.sin(ang)
        let horizon = -Infinity   // running max ANGLE — the skyline this direction is stuck behind
        let prevA = -fov          // top of the band already accounted for; starts at the band floor
        let wSum = 0, fSum = 0    // angular weight, and that weight times farness
        let d = near
        for (let s = 0; s < STEPS; s++, d *= growth) {
            const hs = sampleH(x + dx * d, z + dz * d)
            if (!isFinite(hs)) break
            const aEl = Math.atan2(hs - eye, d)
            if (aEl <= horizon) continue          // hidden behind something closer
            horizon = aEl
            // This sample owns the band from the last skyline up to itself: that slice of the frame
            // is filled by terrain at distance d. Clipped to the judged band at both ends.
            const lo = Math.max(prevA, -fov)
            const hi = Math.min(aEl, fov)
            if (hi > lo) {
                const w = hi - lo
                wSum += w
                fSum += w * clamp01(d / farM)
            }
            if (aEl > prevA) prevA = aEl
            if (aEl >= fov) break                 // walled in: the rest of the band is behind this
        }
        // No terrain in the band at all ⇒ you are above everything in this direction. That is the
        // top of a cliff, not a bad view.
        sum += wSum > 1e-9 ? fSum / wSum : 1
    }

    // The response curve. Raw far-fractions bunch low (near ground is angularly enormous), so a
    // linear read would make every site a third of a segment and nothing would ever max out.
    const t = clamp01((sum / AZ - P.campViewShapeLo)
                      / Math.max(1e-6, P.campViewShapeHi - P.campViewShapeLo))
    return t * t * (3 - 2 * t)   // smoothstep
}

/**
 * The dispersed-camping layer: zone generation, the region-scoped zone list the map and the
 * in-world queries read, and the road-adjacency half of the Phase-D eligibility test.
 */
export class CampSystem {
    /**
     * @param {object} deps
     *   getRoad()    — the play RoadSystem (a getter: main.js swaps instances on reseed)
     *   getSeed()    — numeric worldSeed
     *   getParams()  — the live params object (road cross-section widths live there)
     *   getTerrain() — TerrainSystem: analyticHeight (the flatness grade) and rawHeightWorld
     *                  (the skyline scan behind the view score)                [Phase D]
     *   getWater()   — WaterSystem, for pondsInBBox / streamChannelAt           [Phase D]
     *   treesNear(x,z,r) → count — the deterministic scatter re-roll main.js owns [Phase D]
     */
    constructor (deps) {
        this._d = deps
        this._list = []
        this._built = null      // {x,z,r,seed} the current list was built for
        this._camps = []        // pads dug this run (see makeCampAt) — run state, not worldgen
        this._moms = null       // {x,z} mom's house, sited at the region centre by build()
        this._eval = null       // memoized grade (see evaluate)
        this._rev = 0           // bumped whenever a memoized grade must be thrown away
        this._ctrls = []
        this._read = null
    }

    /** Every zone in the built region, `{x, z, r}`. Read-only to callers. */
    zones () { return this._list }

    /**
     * Materialise the zone list for a region disc. Idempotent for the same (centre, radius, seed) —
     * the same discipline poiSystem.build() uses, so a re-entry into the same region is free.
     *
     * Cost: one roll per macro cell overlapping the region (a 2.5 km region is ~7×7 cells). No
     * terrain, no water, no network reads — zones are permission, not placement.
     */
    build (center, radius) {
        if (!center) return this._list
        const seed = this._d.getSeed()
        if (this._built && this._built.seed === seed
            && this._built.r === radius
            && Math.hypot(this._built.x - center.x, this._built.z - center.z) < 1e-6) return this._list

        const P = this._P()
        const S = P.campCellM
        const c0x = Math.floor((center.x - radius) / S), c1x = Math.floor((center.x + radius) / S)
        const c0z = Math.floor((center.z - radius) / S), c1z = Math.floor((center.z + radius) / S)

        const out = []
        for (let cx = c0x; cx <= c1x; cx++) {
            for (let cz = c0z; cz <= c1z; cz++) {
                const zone = this._cellZone(cx, cz, seed, P)
                if (!zone) continue
                // THE REGION CLIP IS A POST-FILTER, NEVER PART OF GENERATION. Membership is decided
                // by the zone's CENTRE, not by whether its disc grazes the wall: the centre is a
                // pure fn of (seed, cell), so two regions that both contain a centre agree on that
                // zone exactly — which is window-invariance (SM-INV-12). Testing disc overlap would
                // be window-invariant too, but the centre rule keeps the kept-set a clean function
                // of the cell grid and is what the gate asserts.
                if (Math.hypot(zone.x - center.x, zone.z - center.z) > radius) continue
                out.push(zone)
            }
        }

        this._list = out
        this._built = { x: center.x, z: center.z, r: radius, seed }
        // A new region is a new run's ground: last region's camps are gone, and mom's house is
        // re-sited at this region's centre (the story spawn — DESIGN decision 6).
        this._camps = []
        this._moms = { x: center.x, z: center.z }
        this._rev++
        return out
    }

    /** Drop the region's zones and everything hung off them (leaving story mode). */
    clear () {
        this._list = []
        this._built = null
        this._camps = []
        this._moms = null
        this._eval = null
        this._rev++
    }

    /**
     * The zone containing (x,z), or null. Scans the built region list — the region IS the play
     * surface (the wall is hard), so there is no lazy out-of-region cell fallback to want.
     * A few dozen discs at 10 Hz; a spatial index would be ceremony.
     */
    zoneAt (x, z) {
        for (const q of this._list) {
            const dx = q.x - x, dz = q.z - z
            if (dx * dx + dz * dz <= q.r * q.r) return q
        }
        return null
    }

    /**
     * Road adjacency at (x,z) — the half of Phase D's camping eligibility that is about geometry
     * rather than permission, built here because the map's zone rendering needs the same notion of
     * "this ground belongs to the road corridor".
     *
     *   lateral   — XZ distance to the nearest road centerline, or Infinity beyond the search radius
     *   onSurface — true when the point is on the PAVED surface itself
     *   surfaceY  — the road-top Y under the point (null off the graded footprint); Phase D's pad
     *               wants it, and it is already paid for by the resolve above
     *
     * Phase D's rule will be: zoneAt(x,z) && lateral <= tetherM() && !onSurface — in a zone,
     * within the tether, but off the pavement.
     *
     * Uses RoadSystem.queryNearest — the same nearest-centerline machinery gps.js/mission.js/the
     * map's teleport snap read — with the search radius clamped to the tether, so the tile-block
     * scan stays tiny. Intended cadence is the ~10 Hz prompt poll, never per physics step —
     * measured ~44 µs/call on seed 6's streamed network (≈0.4 ms per second of play at 10 Hz).
     *
     * ON `onSurface` — DELIBERATELY NOT `sampleRoadTopY(x,z) != null`. That sampler is the graded
     * APRON sampler (QUAL-10): it extrapolates the road-top plane laterally well past the asphalt,
     * and measured on seed 6 it returns a finite Y for essentially every point out to ~35 m from
     * the centerline — i.e. for the whole 27.5 m camping tether. Using it as the pavement test
     * would make "off the road" unsatisfiable and no site would ever be campable. The honest test
     * is the cross-section geometry the ribbon is built from: paved ⇔ a road resolves here AND the
     * point is inside roadHalfWidth.
     */
    nearRoadInfo (x, z) {
        const road = this._d.getRoad()
        if (!road || typeof road.queryNearest !== 'function') {
            return { lateral: Infinity, onSurface: false, surfaceY: null }
        }
        // A hair of slack past the tether so a caller comparing `lateral <= tether` sees a real
        // number right at the boundary instead of Infinity.
        const nr = road.queryNearest(x, z, this.tetherM() + 1)
        if (!nr || !nr.point) return { lateral: Infinity, onSurface: false, surfaceY: null }
        const lateral = Math.hypot(nr.point.x - x, nr.point.z - z)
        const surfaceY = road.sampleRoadTopY ? road.sampleRoadTopY(x, z) : null

        // Phase D: the pad also needs the road FRAME here — the tangent, and which side of it we are
        // standing on — so the bench can be built square to the road on the player's own side. Same
        // convention poi.js sites its lay-bys with: right-hand normal (tz, −tx), side ∈ {+1, −1}.
        const t = nr.tangent
        const tl = t ? (Math.hypot(t.x, t.z) || 1) : 1
        const tx = t ? t.x / tl : 1, tz = t ? t.z / tl : 0
        const side = ((x - nr.point.x) * tz - (z - nr.point.z) * tx) < 0 ? -1 : 1

        return {
            lateral,
            onSurface: lateral <= this._k('roadHalfWidth', 5),
            surfaceY: surfaceY != null && isFinite(surfaceY) ? surfaceY : null,
            roadX: nr.point.x, roadZ: nr.point.z,
            tx, tz, side,
            nx: tz * side, nz: -tx * side,   // unit normal pointing FROM the road TOWARD the query
        }
    }

    /** The tether distance Phase D compares `lateral` against. Exposed so callers don't re-derive it. */
    tetherM () {
        return this._k('roadHalfWidth', 5) + this._k('roadShoulderWidth', 2.5)
             + this._k('campRoadEdgeM', CAMP_PARAMS.campRoadEdgeM)
    }

    // ── The site: grading, the vibe score, camps and mom's house (Phase D) ───────────────────
    //
    // WHERE THE SITE IS. Not where the truck is, and — since the 2026-07-30 pass — not the single
    // spot beside it either. The truck may legitimately sit on the shoulder, that is what shoulders
    // are for, but a bench dug there would be half in the road; and a bench dug one pad-width off it
    // is still ON the shoulder as far as the player's eye is concerned. So the site is chosen along
    // a RAY cast from the road edge outward to the tether on the driver's own side: the near end of
    // that ray is the old single candidate (nearest centerline point, out along the right-hand
    // normal by shoulder + gap + half the pad, exactly the way poi.js sites a lay-by), and the far
    // end is the last spot dispersed camping is still permitted at. The BEST flat candidate on that
    // ladder is the site — so "not flat" now means the whole ray is unusable, not that the shoulder
    // verge happened to be.
    //
    // Grading and pad still describe the same ground, which is the whole point: the score has to be
    // a promise about what gets built, and now also about WHERE.

    /**
     * Grade the campsite the player would make from (x,z). The one function behind the prompt, the
     * vibe bar, the world marker and the pad.
     *
     * @returns {{
     *   inZone:boolean, lateral:number, withinTether:boolean, hasRoad:boolean, side:number,
     *   spread:number, flat:boolean, flatScore:number, viewScore:number, shadeScore:number,
     *   waterScore:number,
     *   trees:number, waterDist:number, waterFound:boolean, vibe:number, cands:number,
     *   pad:{x,z,y,tx,tz,nx,nz,halfLen,halfWid}|null
     * }}
     *
     * Cadence: the ~10 Hz prompt poll. The ladder is graded only when the truck has left the
     * CAMP_RESAMPLE_M ball it was last graded in (or crossed the centerline); on a memo hit the four
     * CHEAP fields — zone membership, road lateral, tether, has-road — are refreshed anyway, so the
     * prompt's gating stays live at 10 Hz while only the expensive judgement is held still.
     */
    evaluate (x, z) {
        const P = this._P()
        const zone = this.zoneAt(x, z)
        const nr = this.nearRoadInfo(x, z)
        const tether = this.tetherM()

        const m = this._eval
        if (m && m.rev === this._rev && m.side === nr.side
            && Math.hypot(m.qx - x, m.qz - z) < CAMP_RESAMPLE_M) {
            // NB: qx/qz are NOT advanced here. They anchor the ball the ladder was graded in — creep
            // the anchor along with the truck and it would never re-grade at all.
            m.inZone = !!zone
            m.lateral = nr.lateral
            m.withinTether = nr.lateral <= tether
            m.hasRoad = isFinite(nr.lateral)
            return m
        }

        const out = {
            rev: this._rev, qx: x, qz: z, side: nr.side,
            inZone: !!zone, lateral: nr.lateral, withinTether: nr.lateral <= tether,
            hasRoad: isFinite(nr.lateral),
            spread: Infinity, flat: false, flatScore: 0, viewScore: 0, shadeScore: 0, waterScore: 0,
            trees: 0, waterDist: Infinity, waterFound: false, vibe: 0, cands: 0, pad: null,
        }
        this._eval = out
        if (!out.hasRoad) return out   // nothing to hang a bench off — grading has no spot to grade

        // The ray: from the road edge (the near candidate, pad snug against the shoulder gap) out to
        // the tether limit, one candidate every CAMP_RAY_STEP_M.
        const lat0 = this._k('roadHalfWidth', 5) + this._k('roadShoulderWidth', 2.5)
                   + P.campPadGapM + P.campPadHalfM
        const reach = Math.max(0, P.campRoadEdgeM)
        const steps = Math.max(1, Math.round(reach / CAMP_RAY_STEP_M))

        // TWO PASSES, ON PURPOSE. Flatness is the gate and only flat candidates can win, so the
        // expensive half — shade (a chunked scatter walk) and water (~40 stream probes) — runs on the
        // survivors only. Then the survivors are taken FLATTEST FIRST and bounded: view + shade +
        // water can add at most VIBE_W.view + VIBE_W.shade + VIBE_W.water, so once a candidate's
        // flatness alone cannot reach the best score already found, neither can any flatter-scoring
        // candidate behind it, and the pass stops. That is what keeps an 11-rung ladder from costing
        // 11 water searches on the open flat ground where every rung passes the gate.
        const AMENITY_MAX = VIBE_W.view + VIBE_W.shade + VIBE_W.water
        const flats = []
        let flattest = null
        for (let i = 0; i <= steps; i++) {
            const t = i / steps
            const lat = lat0 + t * reach
            const c = this._gradeFlat(nr.roadX + nr.nx * lat, nr.roadZ + nr.nz * lat, nr, P, t)
            if (!c) continue                       // off the terrain: not a site
            out.cands++
            if (!flattest || c.spread < flattest.spread) flattest = c
            if (c.flat) flats.push(c)
        }
        // ONE STREAM SCAN PER RAY END, SHARED BY EVERY CANDIDATE (owner, 2026-07-31). Stream probing
        // was the amenity pass's dominant cost (~40 streamChannelAt per candidate); now two fixed
        // scans — at the road edge and at the tether limit — collect hit POINTS, and each candidate
        // just measures distance to them. Two ends rather than one so the far half of a wide tether
        // can still see water beyond the near scan's reach.
        const waterPts = []
        this._streamScan(nr.roadX + nr.nx * lat0, nr.roadZ + nr.nz * lat0, P, waterPts)
        this._streamScan(nr.roadX + nr.nx * (lat0 + reach), nr.roadZ + nr.nz * (lat0 + reach), P, waterPts)

        // THE VIEW IS SCANNED PER RAY END, NOT PER CANDIDATE — the _streamScan trick, for the same
        // reason. A 600 m skyline does not meaningfully change over the 40 m the ladder spans, but it
        // DOES change enough at a rim edge to be worth more than one reading, so both ends are
        // scanned and each candidate lerps between them by its position along the ray.
        //
        // MEASURED (2026-08-01, seeds 1/6/42): 44–55 µs per scan on real terrain noise, so ~100 µs
        // for the pair — against a re-grade that already spends ~44 µs in queryNearest alone and
        // ~275 analyticHeight calls (each strictly dearer than rawHeightWorld: road resolve + water
        // carve on top of the same noise) in the ladder. Paid only when the truck has left the
        // CAMP_RESAMPLE_M ball, i.e. ≲1 ms per second of creeping about looking for a site.
        //
        // The same sweep says the score SPREADS ACROSS CAMPABLE GROUND, which is the population that
        // matters: median 0.06–0.13, p90 0.63–0.90, ~20% of flat sites over 0.5 and 4–9% maxing out,
        // on every seed. Harsh at the bottom and genuinely reachable at the top, which is the
        // shape asked for — a segment that pinned near one value would be 15% of the bar doing
        // nothing. See campViewShapeLo/Hi for why the population is flat ground and not the map.
        const viewEnds = [
            this._viewAt(nr.roadX + nr.nx * lat0, nr.roadZ + nr.nz * lat0, P),
            this._viewAt(nr.roadX + nr.nx * (lat0 + reach), nr.roadZ + nr.nz * (lat0 + reach), P),
        ]

        flats.sort((a, b) => b.flatScore - a.flatScore)
        let best = null
        for (const c of flats) {
            if (best && c.flatScore + AMENITY_MAX <= best.vibe) break
            this._gradeAmenity(c, P, waterPts, viewEnds)
            if (!best || c.vibe > best.vibe) best = c
        }

        // No flat candidate anywhere on the ray ⇒ "not flat" — and the record reports the flattest
        // spot found, so the debug spread read-out still describes real ground rather than Infinity.
        const pick = best || flattest
        if (!pick) return out
        if (!best) this._gradeAmenity(pick, P, waterPts, viewEnds)

        out.spread = pick.spread
        out.flat = pick.flat
        out.flatScore = pick.flatScore
        out.viewScore = pick.viewScore
        out.trees = pick.trees
        out.shadeScore = pick.shadeScore
        out.waterDist = pick.waterDist
        out.waterFound = pick.waterFound
        out.waterScore = pick.waterScore
        out.vibe = pick.vibe

        // The pad record — the POI pad shape verbatim, because it rides the POI pad carve.
        // y = the chosen spot's own ground level (its lattice mean): a camp bench is flattened to
        // the ground it sits on, not to the road, since it is metres off the shoulder.
        out.pad = {
            x: pick.x, z: pick.z, y: pick.y,
            tx: nr.tx, tz: nr.tz, nx: nr.nx, nz: nr.nz,
            halfLen: P.campPadHalfM, halfWid: P.campPadHalfM,
        }
        return out
    }

    /**
     * Flatness half of one candidate at (cx,cz), or null when the lattice leaves the terrain.
     *
     * Graded against analyticHeight — the CARVED surface, the same reading poi.js's earthwork cap
     * uses. Raw terrain would bill the site for the road's own cut/fill bench, which is already-spent
     * earthwork and not the campsite's ground.
     */
    _gradeFlat (cx, cz, nr, P, t = 0) {
        const terrain = this._d.getTerrain?.()
        const h = terrain?.analyticHeight ? ((px, pz) => terrain.analyticHeight(px, pz)) : null
        let lo = Infinity, hi = -Infinity, sum = 0, n = 0
        if (h) {
            const half = P.campPadHalfM
            for (let i = 0; i < GRADE_N; i++) {
                const u = (i / (GRADE_N - 1) * 2 - 1) * half
                for (let j = 0; j < GRADE_N; j++) {
                    const v = (j / (GRADE_N - 1) * 2 - 1) * half
                    const gy = h(cx + nr.tx * u + nr.nx * v, cz + nr.tz * u + nr.nz * v)
                    if (!isFinite(gy)) return null
                    if (gy < lo) lo = gy
                    if (gy > hi) hi = gy
                    sum += gy; n++
                }
            }
        } else { lo = hi = 0; sum = 0; n = 1 }
        const spread = hi - lo
        return {
            // t = where this rung sits along the siting ray, 0 at the road edge and 1 at the tether
            // limit. Only the view uses it (the two end scans are lerped by it).
            x: cx, z: cz, y: sum / n, spread, t,
            flat: spread <= P.campGateUnevenM,
            flatScore: VIBE_W.flat * clamp01(1 - spread / Math.max(1e-6, P.campMaxUnevenM)),
            viewScore: 0,
            trees: 0, shadeScore: 0, waterDist: Infinity, waterFound: false, waterScore: 0,
            vibe: 0,
        }
    }

    /**
     * The raw view score at one point, 0..1 — skylineView driven by the CARVE-FREE terrain sampler.
     *
     * rawHeightWorld, not analyticHeight, and for two reasons. It is pure noise, so the score stays a
     * function of (worldSeed, x, z) and cannot drift with the streaming window (SM-INV-12); and it is
     * the honest reading anyway — a skyline 600 m out is the shape of the land, not the cut the road
     * took through it. It is also the cheaper call by some way: no road resolve, no water carve.
     */
    _viewAt (x, z, P) {
        const terrain = this._d.getTerrain?.()
        if (!terrain?.rawHeightWorld) return 0
        return skylineView((px, pz) => terrain.rawHeightWorld(px, pz), x, z, P)
    }

    /** View + shade + water for a candidate that has already passed _gradeFlat. Mutates `c` in place. */
    _gradeAmenity (c, P, waterPts, viewEnds) {
        // ── view (up to 0.15) — lerped between the two per-ray-end skyline scans ──────────────
        const v0 = viewEnds?.[0] ?? 0, v1 = viewEnds?.[1] ?? 0
        c.viewScore = VIBE_W.view * clamp01(v0 + (v1 - v0) * clamp01(c.t ?? 0))

        // ── shade (up to 0.2) — tree quantity inside the grading area ─────────────────────────
        c.trees = this._d.treesNear?.(c.x, c.z, P.campShadeR) ?? 0
        c.shadeScore = VIBE_W.shade * clamp01(c.trees / Math.max(1, P.campShadeFullN))

        // ── water (up to 0.25) — how close the nearest water is ───────────────────────────────
        c.waterDist = this._waterDistance(c.x, c.z, P, waterPts)
        c.waterFound = c.waterDist <= P.campWaterR
        c.waterScore = VIBE_W.water * clamp01(
            (P.campWaterR - c.waterDist) / Math.max(1e-6, P.campWaterR - P.campWaterBestM))

        c.vibe = c.flatScore + c.viewScore + c.shadeScore + c.waterScore
        return c
    }

    /**
     * Distance from (x,z) to the nearest water within campWaterR, or Infinity.
     *
     * Ponds are exact (centre + radius). Streams are SAMPLED on rings, because streamChannelAt
     * answers "is this point in a channel?", not "how far is the channel?" — so the finest ring that
     * reports a channel is the distance, to within the ring spacing. Good enough for a 0.2-weight
     * score, and it keeps the cost at a few dozen walks.
     *
     * NB: streamChannelAt ALWAYS returns a record ({inChannel:false,inBank:false,stream:null} away
     * from any stream) — it must be READ, never truth-tested.
     */
    /**
     * Ring/spoke stream scan around one point, pushing every probe position that lands in a stream
     * channel or bank into `pts`. No early exit: 40 probes flat, and hits in EVERY direction are
     * kept — a candidate 30 m along the ray wants the hit on its own side, not just the first one
     * this scan happened to meet. NB streamChannelAt always returns a record; read it, never
     * truth-test it.
     */
    _streamScan (x, z, P, pts) {
        const water = this._d.getWater?.()
        if (!water?.streamChannelAt) return
        const c = water.streamChannelAt(x, z)
        if (c && (c.inChannel || c.inBank)) pts.push({ x, z })
        const R = P.campWaterR, RINGS = 5, SPOKES = 8
        for (let i = 1; i <= RINGS; i++) {
            const r = (i / RINGS) * R
            for (let k = 0; k < SPOKES; k++) {
                const a = (k / SPOKES) * Math.PI * 2
                const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r
                const s = water.streamChannelAt(px, pz)
                if (s && (s.inChannel || s.inBank)) pts.push({ x: px, z: pz })
            }
        }
    }

    /**
     * Nearest water from (x,z): exact pond distance (pondsInBBox is memoized and cheap), one
     * self-probe for standing in a stream, and the shared per-ray stream points from _streamScan —
     * the per-candidate ring scan this replaces was the amenity pass's dominant cost.
     */
    _waterDistance (x, z, P, waterPts) {
        const water = this._d.getWater?.()
        if (!water) return Infinity
        const R = P.campWaterR
        let best = Infinity

        if (water.pondsInBBox) {
            for (const p of water.pondsInBBox(x - R, z - R, x + R, z + R)) {
                const d = Math.hypot(p.floorX - x, p.floorZ - z) - p.radius
                if (d < best) best = Math.max(0, d)
            }
        }
        const c = water.streamChannelAt?.(x, z)
        if (c && (c.inChannel || c.inBank)) return 0
        if (waterPts) for (const p of waterPts) {
            const d = Math.hypot(p.x - x, p.z - z)
            if (d < best) best = d
        }
        return best
    }

    /** Camp pads dug this run. Handed to RoadSystem.setCampPads by main.js — same records. */
    camps () { return this._camps }

    /**
     * Record a camp at a graded pad. Returns the full pad list for setCampPads.
     * The bench lasts exactly as long as the camp: breaking camp un-digs it (removeCamp). The
     * original reading kept old benches as permanent earthwork, but the owner reversed it
     * (2026-07-30): a leftover pad is perfectly flat ground, so re-camping your own old bench
     * gamed the flatness score.
     */
    makeCampAt (pad) {
        if (!pad) return this._camps
        this._camps.push(pad)
        this._rev++          // the ground just changed under every memoized grade
        return this._camps
    }

    /**
     * Break camp: drop the pad so the ground reverts to the seed's own shape. Returns the remaining
     * pad list for setCampPads — the caller re-bakes the covering chunks, same as digging.
     */
    removeCamp (pad) {
        const i = this._camps.indexOf(pad)
        if (i >= 0) { this._camps.splice(i, 1); this._rev++ }
        return this._camps
    }

    /** Mom's house — {x,z} at the region centre — or null outside a live story region. */
    momsHouse () { return this._moms }

    /** Is (x,z) close enough to mom's house to knock? */
    atMoms (x, z) {
        const m = this._moms
        if (!m) return false
        const r = this._k('campMomsRadiusM', CAMP_PARAMS.campMomsRadiusM)
        return Math.hypot(m.x - x, m.z - z) <= r
    }

    // ── generation ──────────────────────────────────────────────────────────────────────────
    /**
     * One param lookup, live-override first. Deliberately NOT `{...CAMP_PARAMS, ...getParams()}` —
     * that spread copies the whole of RANGER_PARAMS and cost 100+ µs per nearRoadInfo call when it
     * sat in the query path (measured). The spread form survives only in the cold generation path.
     */
    _k (key, dflt) {
        const v = this._d.getParams?.()?.[key]
        return v === undefined ? dflt : v
    }

    _P () { return { ...CAMP_PARAMS, ...(this._d.getParams?.() || {}) } }

    /**
     * The one zone roll for macro cell (cx,cz), or null. PURE f(seed, cell, params) — this is the
     * whole of SM-INV-12 for camping. The draw order (chance → centre x → centre z → radius) is
     * part of the layout of every seed: do not reorder it.
     *
     * The centre lands anywhere in the cell and the disc may spill across cell borders; that is
     * what breaks up the grid, and it is why queries scan a 3×3 neighbourhood (NEIGHBOR_CELLS).
     */
    _cellZone (cx, cz, seed, P) {
        const rnd = mulberry32(hash32(`camp:${seed}:${cx},${cz}`))
        if (rnd() >= P.campZoneChance) return null
        const S = P.campCellM
        const x = (cx + rnd()) * S
        const z = (cz + rnd()) * S
        const r = P.campMinRadiusM + rnd() * (P.campMaxRadiusM - P.campMinRadiusM)
        return { x, z, r }
    }

    /**
     * Self-contained debug folder (the SkySystem.addGui / DaySystem.addGui pattern — attaches to the
     * existing panel, no edit to debug.js). Hidden in story mode by the existing setDebugLockout.
     * Read-outs refresh from the caller's GUI tick via syncGui().
     *
     * @param {object} [acts] optional buttons main.js owns: {openCamp} jumps straight to the camp
     *   dialogue at the truck (skips the 30-min chore) so the sleep flow can be exercised anywhere.
     */
    addGui (gui, acts = {}) {
        if (!gui) return null
        const f = gui.addFolder('Story · Camp (FEAT-45)')
        const read = { zone: '—', lateral: '—', spread: '—', trees: '0', water: '—', vibe: '—' }
        this._ctrls = [
            f.add(read, 'zone').name('in zone').disable(),
            f.add(read, 'lateral').name('road lateral').disable(),
            f.add(read, 'spread').name('spread (m)').disable(),
            f.add(read, 'trees').name('trees ≤6 m').disable(),
            f.add(read, 'water').name('water (m)').disable(),
            f.add(read, 'vibe').name('vibe').disable(),
        ]
        this._read = read

        f.add(CAMP_PARAMS, 'campMaxUnevenM', 0.1, 3, 0.05).name('flat score zero (m)')
        f.add(CAMP_PARAMS, 'campGateUnevenM', 0.1, 3, 0.05).name('campable floor (m)')
        f.add(CAMP_PARAMS, 'campShadeFullN', 1, 12, 1).name('trees for full shade')
        f.add(CAMP_PARAMS, 'campWaterR', 5, 120, 5).name('water reach (m)')
        f.add(CAMP_PARAMS, 'campWaterBestM', 1, 30, 1).name('water full credit (m)')
        f.add(CAMP_PARAMS, 'campRoadEdgeM', 5, 80, 1).name('road tether (m)')
        f.add(CAMP_PARAMS, 'campGradeAreaM', 3, 20, 1).name('grade area (m)')
        f.add(CAMP_PARAMS, 'campShadeR', 3, 30, 1).name('shade reach (m)')
        f.add(CAMP_PARAMS, 'campPadHalfM', 1, 8, 0.5).name('pad half (m)')
        f.add(CAMP_PARAMS, 'campPadGapM', 0, 3, 0.1).name('pad gap (m)')
        f.add(CAMP_PARAMS, 'campMomsRadiusM', 5, 100, 5).name("mom's radius (m)")
        // The zone GENERATOR knobs (campCellM / campZoneChance / radius range) are deliberately not
        // sliders: zones are laid out once at region entry, so a live tweak would silently lie until
        // the next re-entry — and the camp-zones gate pins the density they produce.
        if (acts.openCamp) f.add({ go: acts.openCamp }, 'go').name('skip to camp dialogue')
        return f
    }

    /** Refresh the debug read-outs against the truck's current grade. Safe before addGui(). */
    syncGui (x, z) {
        if (!this._read) return
        const g = this.evaluate(x, z)
        const r = this._read
        r.zone = g.inZone ? 'yes' : 'no'
        r.lateral = isFinite(g.lateral) ? g.lateral.toFixed(1) : '—'
        r.spread = isFinite(g.spread) ? g.spread.toFixed(2) : '—'
        r.trees = String(g.trees)
        r.water = isFinite(g.waterDist) ? g.waterDist.toFixed(1) : '—'
        r.vibe = g.vibe.toFixed(2)
        for (const c of this._ctrls) c.updateDisplay()
    }

    /**
     * Zone at (x,z) computed straight from the cell grid, ignoring the built region list. Used by
     * offline verification (coverage sampling / window-invariance) — gameplay goes through zoneAt.
     * Scans the 3×3 neighbourhood, which is sufficient because campMaxRadiusM < campCellM.
     */
    zoneAtRaw (x, z) {
        const P = this._P()
        if (P.campMaxRadiusM > P.campCellM) throw new Error('camp: radius exceeds cell — 3x3 scan unsound')
        const seed = this._d.getSeed()
        const S = P.campCellM
        const bx = Math.floor(x / S), bz = Math.floor(z / S)
        for (let cx = bx - NEIGHBOR_CELLS; cx <= bx + NEIGHBOR_CELLS; cx++) {
            for (let cz = bz - NEIGHBOR_CELLS; cz <= bz + NEIGHBOR_CELLS; cz++) {
                const q = this._cellZone(cx, cz, seed, P)
                if (!q) continue
                const dx = q.x - x, dz = q.z - z
                if (dx * dx + dz * dz <= q.r * q.r) return q
            }
        }
        return null
    }
}
