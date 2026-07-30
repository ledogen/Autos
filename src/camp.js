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
    campRoadEdgeM:  20,     // m past the shoulder edge that dispersed camping is allowed
}

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

/**
 * The dispersed-camping layer: zone generation, the region-scoped zone list the map and the
 * in-world queries read, and the road-adjacency half of the Phase-D eligibility test.
 */
export class CampSystem {
    /**
     * @param {object} deps
     *   getRoad()   — the play RoadSystem (a getter: main.js swaps instances on reseed)
     *   getSeed()   — numeric worldSeed
     *   getParams() — the live params object (road cross-section widths live there)
     */
    constructor (deps) {
        this._d = deps
        this._list = []
        this._built = null      // {x,z,r,seed} the current list was built for
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
        return out
    }

    /** Drop the region's zones (leaving story mode). */
    clear () {
        this._list = []
        this._built = null
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
        return {
            lateral,
            onSurface: lateral <= this._k('roadHalfWidth', 5),
            surfaceY: surfaceY != null && isFinite(surfaceY) ? surfaceY : null,
        }
    }

    /** The tether distance Phase D compares `lateral` against. Exposed so callers don't re-derive it. */
    tetherM () {
        return this._k('roadHalfWidth', 5) + this._k('roadShoulderWidth', 2.5)
             + this._k('campRoadEdgeM', CAMP_PARAMS.campRoadEdgeM)
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
