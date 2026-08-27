// src/world-validate.js — IS THIS WORLD PLAYABLE AT ALL?
//
// BUG-56 workstream D + workstream C's run-start reroll. The owner's third bar, 2026-08-27:
//
//     "settings exist under which NO seed can start a story run" — so prove a playable, fully
//     connected area is generatable, and run that proof whenever terrain or router settings change.
//
// ONE routine, TWO triggers, and that is deliberate — the handoff's rule is that the gate and the
// game must not drift apart:
//
//   test/play-area.mjs   5 FIXED seeds, run on settings changes (heavy: test:all / desktop only).
//   story run start      the player's own seed, once at new-game, over all nine tiles, before day 1.
//                        A failure advances the seed DETERMINISTICALLY and tries again. It is a
//                        run-START decision, never a region-entry one (owner ruling 2026-08-27):
//                        the world is one seed across nine tiles, so a mid-run region that turned
//                        out broken would leave the player standing in a world that cannot be
//                        rerolled. A one-time "generating world" wait at new-game is accepted.
//
// THE PLAY AREA, owner-specified 2026-08-27: a 3x3 grid of SQUARE tiles 4000 m on a side. Nine
// regions, 12 km x 12 km, 144 km2, one tile per story region and roughly equal area each.
//
// WHAT IS ASSERTED (and what is only reported):
//
//   components === 1   GATING, and the headline. A split is an unshippable world: the player can
//                      be given a mission on the far side of a gap no road crosses.
//   condemned === 0    GATING. A condemned edge is one where the profile ladder failed at every
//                      rung INCLUDING the grade-hard re-route (see road.js workstream C), so it
//                      ships draped over raw terrain with no grade bound — the 108 % class.
//   unpinned === 0     GATING. A run that ends away from the node it shares costs that node the
//                      leg AND its junction pad (BUG-56 B2).
//   grade histogram    REPORT ONLY. The ceiling (gMaxRoad + gradeTol) is legal by fiat — a grade
//   ceiling rungs      failure is cheaper than a connectivity violation — so these keep the
//                      24-38 % population visible without failing on it.
//
// The caller owns STREAMING: the gate streams synchronously, the game pumps its warm loop behind a
// loading screen. Only the CHECKS live here, because only the checks must be identical.

export const STORY_TILE_M = 4000    // m — one story region, square
export const STORY_GRID   = 3       // 3x3 tiles => 12 km x 12 km, 144 km2

/** The play area's half-extent in metres — the radius a caller must stream to cover the square. */
export const playAreaHalfExtent = () => STORY_TILE_M * STORY_GRID / 2

/** The disc radius that contains the whole square (its circumradius). */
export const playAreaStreamRadius = () => playAreaHalfExtent() * Math.SQRT2

/**
 * Validate a streamed RoadSystem over the nine-tile play area centred on `centre`.
 * Pure read: touches no world state, mutates nothing, allocates its own report.
 *
 * @param {object} road   a streamed RoadSystem (the caller has already covered the area)
 * @param {{x:number,z:number}} centre  the play area's centre in world XZ
 * @param {object} [params] RANGER_PARAMS, for the grade ceiling and the node-pin radius
 * @returns {{ok:boolean, components:number, condemned:string[], unpinned:object[],
 *             runs:number, km:number, grade:object, tiles:object[]}}
 */
export function validatePlayArea(road, centre, params = {}) {
    const half = playAreaHalfExtent()
    const inArea = (p) => Math.abs(p.x - centre.x) <= half && Math.abs(p.z - centre.z) <= half

    // ── the runs that are actually in the play area ───────────────────────────────────────────
    const runs = []
    for (const [k, e] of road._network) {
        if (!e.cellA || !e.cellB || !(e.points?.length > 1)) continue
        if (!e.points.some(inArea)) continue
        runs.push([k, e])
    }

    // ── 1. CONNECTIVITY, the headline ────────────────────────────────────────────────────────
    // Components over the graph NODES the in-area runs join. A run that leaves the square and comes
    // back still connects its two nodes, so the area's connectivity is the graph's, not a clip.
    const parent = new Map()
    const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a) } return a }
    const add = (a) => { if (!parent.has(a)) parent.set(a, a) }
    for (const [, e] of runs) { add(e.cellA.join(',')); add(e.cellB.join(',')) }
    for (const [, e] of runs) {
        const ra = find(e.cellA.join(',')), rb = find(e.cellB.join(','))
        if (ra !== rb) parent.set(ra, rb)
    }
    const roots = new Set()
    for (const a of parent.keys()) roots.add(find(a))
    const components = roots.size

    // ── 2. CONDEMNED EDGES (workstream C) ────────────────────────────────────────────────────
    const condemned = runs.filter(([, e]) => e.condemned).map(([k]) => k)

    // ── 3. NODE PIN (B2) ─────────────────────────────────────────────────────────────────────
    const EPS = Math.max(2, (params.roadHalfWidth ?? 5) * 0.75)
    const ends = new Map()
    for (const [k, e] of runs) {
        const put = (id, p) => {
            const key = id.join(',')
            if (!ends.has(key)) ends.set(key, [])
            ends.get(key).push({ k, x: p.x, z: p.z })
        }
        put(e.cellA, e.points[0])
        put(e.cellB, e.points[e.points.length - 1])
    }
    const unpinned = []
    for (const [id, legs] of ends) {
        if (legs.length < 2) continue
        let spread = 0
        for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++)
            spread = Math.max(spread, Math.hypot(legs[i].x - legs[j].x, legs[i].z - legs[j].z))
        if (spread > EPS) unpinned.push({ node: id, spread })
    }

    // ── 4. GRADE, reported not gated ─────────────────────────────────────────────────────────
    const STEP = 4, HALF = 10
    const g = { n: 0, over20: 0, over24: 0, over30: 0, worst: 0, km: 0 }
    for (const [, e] of runs) {
        const cum = e.polyCum, pts = e.points, L = cum[cum.length - 1]
        g.km += L / 1000
        const yAt = (s) => {
            if (s <= 0) return pts[0].y
            if (s >= L) return pts[pts.length - 1].y
            let lo = 0, hi = cum.length - 1
            while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m }
            const u = (s - cum[lo]) / Math.max(1e-9, cum[lo + 1] - cum[lo])
            return pts[lo].y + (pts[lo + 1].y - pts[lo].y) * u
        }
        for (let s = 0; s <= L; s += STEP) {
            const a = Math.max(0, s - HALF), b = Math.min(L, s + HALF)
            if (b - a < 1e-6) continue
            const gr = Math.abs(yAt(b) - yAt(a)) / (b - a)
            g.n++
            if (gr > 0.20) g.over20++
            if (gr > 0.24) g.over24++
            if (gr > 0.30) g.over30++
            if (gr > g.worst) g.worst = gr
        }
    }
    const rung = road._v2Rung || [0, 0, 0, 0]

    // ── per-tile road presence: a region with no road in it is a region with no missions ──────
    const tiles = []
    for (let tz = 0; tz < STORY_GRID; tz++) for (let tx = 0; tx < STORY_GRID; tx++) {
        const cx = centre.x + (tx - (STORY_GRID - 1) / 2) * STORY_TILE_M
        const cz = centre.z + (tz - (STORY_GRID - 1) / 2) * STORY_TILE_M
        const h = STORY_TILE_M / 2
        let km = 0
        for (const [, e] of runs) {
            const cum = e.polyCum
            for (let i = 1; i < e.points.length; i++) {
                const p = e.points[i]
                if (Math.abs(p.x - cx) <= h && Math.abs(p.z - cz) <= h) km += (cum[i] - cum[i - 1]) / 1000
            }
        }
        tiles.push({ tx, tz, cx, cz, km })
    }

    return {
        ok: components === 1 && condemned.length === 0 && unpinned.length === 0,
        components, condemned, unpinned,
        runs: runs.length, km: g.km,
        grade: { over20: g.over20 / Math.max(1, g.n), over24: g.over24 / Math.max(1, g.n),
                 over30: g.over30 / Math.max(1, g.n), worst: g.worst,
                 rungCap: rung[0], rungFine: rung[1], rungRelief: rung[2], rungCeiling: rung[3],
                 reroutes: road._v2Reroutes || 0 },
        tiles,
    }
}
