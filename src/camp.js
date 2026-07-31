// ── FEAT-45: dispersed camping zones ───────────────────────────────────────────────────────
//
// A dispersed-camping ZONE is a permission, not a place: a big soft area of the map (BLM/forest-
// service style) inside which pulling off the road and sleeping is allowed. It carries no quality
// judgement at all — how good a given spot is comes from the LIVE grading in Phase D (flatness /
// shade / water), never from the zone. That split is deliberate and it is what makes SM-INV-12
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
    campMaxUnevenM:  0.6,   // m — spread at/above which the flatness SCORE bottoms out at zero.
                            // (Was also the campable gate; split 2026-07-31 — see campGateUnevenM.)
    campGateUnevenM: 1.2,   // m — spread above which a site is NOT campable at all (owner,
                            // 2026-07-31: the shared 0.6 floor made even a crappy site too hard to
                            // find on hilly ground). Between the two, a site camps at zero flatness
                            // credit — extra flatness is still rewarded on the same curve.
    campShadeFullN:  5,     // trees inside the shade ring that earn FULL shade credit (owner: 5
                            // over the 10 m ring — 3 was tuned for the old 6 m reach)
    campWaterR:      30,    // m — how far out water still counts for anything
    campWaterBestM:  5,     // m — at or inside this, full water credit (camping ON the bank is best)
    campMomsRadiusM: 25,    // m — park-trigger radius at mom's house
}

// Vibe weights, RATIFIED as the bar's three segments: flatness 50%, shade 30%, water 20%. They are
// the max widths of the stacked bar as well as the score weights, so the bar IS the score — a full
// flatness segment is visibly half the bar because flatness is half the judgement.
export const VIBE_W = { flat: 0.5, shade: 0.3, water: 0.2 }

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
 * The dispersed-camping layer: zone generation, the region-scoped zone list the map and the
 * in-world queries read, and the road-adjacency half of the Phase-D eligibility test.
 */
export class CampSystem {
    /**
     * @param {object} deps
     *   getRoad()    — the play RoadSystem (a getter: main.js swaps instances on reseed)
     *   getSeed()    — numeric worldSeed
     *   getParams()  — the live params object (road cross-section widths live there)
     *   getTerrain() — TerrainSystem, for analyticHeight (the flatness grade)   [Phase D]
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
     *   spread:number, flat:boolean, flatScore:number, shadeScore:number, waterScore:number,
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
            spread: Infinity, flat: false, flatScore: 0, shadeScore: 0, waterScore: 0,
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
        // survivors only. Then the survivors are taken FLATTEST FIRST and bounded: shade + water can
        // add at most VIBE_W.shade + VIBE_W.water, so once a candidate's flatness alone cannot reach
        // the best score already found, neither can any flatter-scoring candidate behind it, and the
        // pass stops. That is what keeps an 11-rung ladder from costing 11 water searches on the open
        // flat ground where every rung passes the gate.
        const AMENITY_MAX = VIBE_W.shade + VIBE_W.water
        const flats = []
        let flattest = null
        for (let i = 0; i <= steps; i++) {
            const lat = lat0 + (i / steps) * reach
            const c = this._gradeFlat(nr.roadX + nr.nx * lat, nr.roadZ + nr.nz * lat, nr, P)
            if (!c) continue                       // off the terrain: not a site
            out.cands++
            if (!flattest || c.spread < flattest.spread) flattest = c
            if (c.flat) flats.push(c)
        }
        flats.sort((a, b) => b.flatScore - a.flatScore)
        let best = null
        for (const c of flats) {
            if (best && c.flatScore + AMENITY_MAX <= best.vibe) break
            this._gradeAmenity(c, P)
            if (!best || c.vibe > best.vibe) best = c
        }

        // No flat candidate anywhere on the ray ⇒ "not flat" — and the record reports the flattest
        // spot found, so the debug spread read-out still describes real ground rather than Infinity.
        const pick = best || flattest
        if (!pick) return out
        if (!best) this._gradeAmenity(pick, P)

        out.spread = pick.spread
        out.flat = pick.flat
        out.flatScore = pick.flatScore
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
    _gradeFlat (cx, cz, nr, P) {
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
            x: cx, z: cz, y: sum / n, spread,
            flat: spread <= P.campGateUnevenM,
            flatScore: VIBE_W.flat * clamp01(1 - spread / Math.max(1e-6, P.campMaxUnevenM)),
            trees: 0, shadeScore: 0, waterDist: Infinity, waterFound: false, waterScore: 0,
            vibe: 0,
        }
    }

    /** Shade + water for a candidate that has already passed _gradeFlat. Mutates `c` in place. */
    _gradeAmenity (c, P) {
        // ── shade (up to 0.3) — tree quantity inside the grading area ─────────────────────────
        c.trees = this._d.treesNear?.(c.x, c.z, P.campShadeR) ?? 0
        c.shadeScore = VIBE_W.shade * clamp01(c.trees / Math.max(1, P.campShadeFullN))

        // ── water (up to 0.2) — how close the nearest water is ────────────────────────────────
        c.waterDist = this._waterDistance(c.x, c.z, P)
        c.waterFound = c.waterDist <= P.campWaterR
        c.waterScore = VIBE_W.water * clamp01(
            (P.campWaterR - c.waterDist) / Math.max(1e-6, P.campWaterR - P.campWaterBestM))

        c.vibe = c.flatScore + c.shadeScore + c.waterScore
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
    _waterDistance (x, z, P) {
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
        if (water.streamChannelAt) {
            const c = water.streamChannelAt(x, z)
            if (c && (c.inChannel || c.inBank)) return 0
            const RINGS = 5, SPOKES = 8
            for (let i = 1; i <= RINGS && best > (i / RINGS) * R; i++) {
                const r = (i / RINGS) * R
                for (let k = 0; k < SPOKES; k++) {
                    const a = (k / SPOKES) * Math.PI * 2
                    const s = water.streamChannelAt(x + Math.cos(a) * r, z + Math.sin(a) * r)
                    if (s && (s.inChannel || s.inBank)) { best = Math.min(best, r); break }
                }
            }
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
