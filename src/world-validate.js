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
//   test/play-area.mjs   5 FIXED seeds over a 3x3 grid of 4000 m tiles, run on settings changes
//                        (heavy: test:all / desktop only). This is the DEV bar.
//   story mode entry     the player's own seed over the region it actually builds, once, behind
//                        the entry loading screen. This is the PLAYER bar.
//
// **THE RE-ROLL IS GONE (owner ruling 2026-08-27, superseding the earlier one).** The original plan
// was to advance the seed deterministically until a world validated, which needed story mode to
// adopt a nine-tile play area first. The owner replaced it with something much cheaper while story
// mode is still being decided: FAIL SAFE AND SAY SO.
//
//     "This seed is not routable with the current router parameters and terrain generation
//      parameters" — a disclaimer, and a prompt to type a different seed.
//
// So nothing rerolls, nothing needs the 3x3 world, and the architecture stays as small as story
// mode currently is. If connectivity later turns out to be a real problem with tuned parameters,
// the reroll is still the answer and this routine is still what it would call.
//
// TWO BARS, and they differ on purpose — this is the one thing to get right when editing here:
//
//   `playable`  components === 1 && no condemned edge.  THE PLAYER BAR. "Is this world broken?"
//   `ok`        playable && no node-pin violation.      THE DEV BAR. Adds our OWN geometry
//               regressions, which are a bug in the code and not a property of the seed. Blocking
//               a player on one would be blaming them for our defect, so the game does not.
//
// The MEASUREMENTS never differ — that is what stops the gate and the game drifting apart. Only the
// policy over them does.
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

export const STORY_TILE_M = 4000    // m — one tile of the play-area GATE's grid, square
export const STORY_GRID   = 3       // 3x3 tiles => 12 km x 12 km, 144 km2

/** The play-area grid's half-extent in metres — the radius a caller must stream to cover it. */
export const playAreaHalfExtent = () => STORY_TILE_M * STORY_GRID / 2

/** The disc radius that contains the whole square (its circumradius). */
export const playAreaStreamRadius = () => playAreaHalfExtent() * Math.SQRT2

/** The GATE's area: the owner-specified 3x3 grid of 4000 m tiles. */
export const gridArea = () => ({ kind: 'grid', tile: STORY_TILE_M, grid: STORY_GRID })

/** The GAME's area: whatever disc story mode actually built. */
export const discArea = (radius) => ({ kind: 'disc', radius })

/**
 * Validate a streamed RoadSystem over `area` centred on `centre`.
 * Pure read: touches no world state, mutates nothing, allocates its own report.
 *
 * @param {object} road   a streamed RoadSystem (the caller has already covered the area)
 * @param {{x:number,z:number}} centre  the area's centre in world XZ
 * @param {object} area   gridArea() for the gate, discArea(r) for the game
 * @param {object} [params] RANGER_PARAMS, for the node-pin radius
 * @returns {{playable:boolean, ok:boolean, components:number, condemned:string[],
 *             unpinned:object[], runs:number, km:number, grade:object, tiles:object[]}}
 */
export function validateArea(road, centre, area, params = {}) {
    const isDisc = area?.kind === 'disc'
    const half = isDisc ? 0 : (area.tile * area.grid) / 2
    const r2 = isDisc ? area.radius * area.radius : 0
    const inArea = isDisc
        ? (p) => (p.x - centre.x) ** 2 + (p.z - centre.z) ** 2 <= r2
        : (p) => Math.abs(p.x - centre.x) <= half && Math.abs(p.z - centre.z) <= half

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
    for (let tz = 0; !isDisc && tz < area.grid; tz++) for (let tx = 0; tx < area.grid; tx++) {
        const cx = centre.x + (tx - (area.grid - 1) / 2) * area.tile
        const cz = centre.z + (tz - (area.grid - 1) / 2) * area.tile
        const h = area.tile / 2
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

    // THE PLAYER BAR vs THE DEV BAR — see the header. `playable` is what story mode's disclaimer
    // reads: the world is severed, or an edge exists that nothing could give a profile to. `ok`
    // adds node-pin, which is OUR bug rather than the seed's and must never block a player.
    const playable = components === 1 && condemned.length === 0
    return {
        playable,
        ok: playable && unpinned.length === 0,
        components, condemned, unpinned,
        runs: runs.length, km: g.km,
        grade: { over20: g.over20 / Math.max(1, g.n), over24: g.over24 / Math.max(1, g.n),
                 over30: g.over30 / Math.max(1, g.n), worst: g.worst,
                 rungCap: rung[0], rungFine: rung[1], rungRelief: rung[2], rungCeiling: rung[3],
                 reroutes: road._v2Reroutes || 0 },
        tiles,
    }
}

/** Back-compat shim for the gate: the 3x3 grid area. */
export function validatePlayArea(road, centre, params = {}) {
    return validateArea(road, centre, gridArea(), params)
}

/**
 * The one-line reason a seed is not playable, for the entry disclaimer. Null when it is.
 * Deliberately plain: the player typed a seed, not a bug report.
 */
export function unplayableReason(report) {
    if (!report) return 'the region could not be built'
    if (report.components > 1)
        return `the road network breaks into ${report.components} separate pieces — parts of the region cannot be driven to`
    if (report.condemned.length)
        return `${report.condemned.length} road${report.condemned.length === 1 ? '' : 's'} could not be given a drivable profile on this terrain`
    return null
}
