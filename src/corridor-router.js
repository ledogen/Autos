// src/corridor-router.js — FEAT-68 corridor router (v2), M0.
//
// Two-stage replacement for the arc-lattice router (v1):
//   Stage 1  corridorSearch()  — coarse, heading-free A* over the OCTAVE-TRUNCATED coarse field.
//                                Picks the lateral corridor (which valley / which side / which
//                                saddle). No radii, no geometry — a swath, not a road.
//   Stage 2  profileSolve()    — exact 1-D dynamic programming over the vertical alignment along
//                                the corridor. Full vocabulary as priced states: on-grade, cut,
//                                fill, bore, bridge. The profile this solver outputs IS the
//                                profile that ships — priced == built by construction.
//
// Purity contract (FEAT-68 item 7, measured to hold): everything here is a pure function of
// (terrain closures, anchor pair, endpoint heights, knobs). No sibling coupling, no window state,
// no module-scope mutable caches. Window invariance is structural, not defended.
//
// Seam: pure math. No engine types, no THREE — points are plain {x,y,z} / arrays, height fields
// arrive as closures. Importable by a Worker as a real module (no verbatim mirror — FEAT-68 fence).

import { Centerline, makePrimitive, primitivePose } from './centerline.js'

// ── Physical knobs (FEAT-68 item 8 — engineer-priced, money units per metre of plain road) ──────
// cRoadM is the numéraire: 1.0 = one metre of flat on-grade road. Everything else is priced
// relative to it, so the knobs read as "a metre of bore costs the same as N metres of road".
export const V2_COSTS = {
    cRoadM: 1.0,      // on-grade road, per m
    // Grade discomfort is the switchback dial: climbing H metres at grade g costs ≈ H·(1/g + wGrade·g)
    // per the length-vs-grade trade, minimized at g* = 1/√wGrade. 40 put g* at 16% — the solver just
    // took steep straights (owner 2026-08-18: "no switchbacks"). 120 puts g* ≈ 9%, forest-road grade,
    // so length (and the corridor's zigzags) win against sustained steepness.
    wGrade: 180,      // quadratic grade discomfort: cost/m factor = 1 + wGrade·g²
    cCutM: 0.15,      // cut, per m of length PER m of depth (linear haul term)
    // Quadratic cut term (owner 2026-08-18: "no visual difference in the mountaintop above a tunnel —
    // just carve a clean hole"): real cuttings go superlinear past ~8 m (rock walls, stabilization),
    // and without this the solver trenched to the 20 m class boundary before conceding a portal
    // (measured: ~60 m × 19 m exit trench on the canonical bore). Cut ≈ bore at ~9 m now, so portals
    // emerge at portal-bench depth and approach notches stay small.
    cCut2: 0.12,      // cut, per m of length per m² of depth
    cFillM: 0.12,     // fill, per m of length per m of height
    cBoreM: 12.0,     // bore, per m (owner 2026-08-18: "too happy to tunnel" — raised 8 → 12)
    cPortal: 250,     // fixed, per bore portal (also raised — kills pop-through mini-bores)
    // Bridges are DE-SCOPED from the vocabulary (owner 2026-08-18): real forest bridges are short,
    // same-elevation water crossings, not grade machines — and valley-spanning decks raise "why is
    // there no road down there". Machinery stays; flip bridgesOn to re-enable. The planned way back
    // is a post-router conversion of stream/water crossings only.
    bridgesOn: false,
    // Direction-change cost, per radian (the corridor is heading-free, so without this a ladder
    // of twenty micro-zigzags prices identically to two long traverses — the search has no reason
    // to prefer the buildable shape). This is v1's roadWTurn lesson as a PHYSICAL knob: curvature
    // costs money. Evaluated greedily against the parent step's direction (not part of the state
    // — exact turn accounting would 8× the state space for a tie-shaping term).
    cTurn: 45,
    cBridgeM: 20.0,   // bridge deck, per m (only read when bridgesOn)
    cAbutment: 100,   // fixed, per bridge end (only read when bridgesOn)
    cutMax: 20,       // m below ground where a cut becomes a bore — a 12–20 m trench is an open
                      // rock CUTTING (road grade cap, priced linearly per m of depth), not a
                      // tunnel; at 12 the bore's 18% grade cap rate-limited legitimate cliff
                      // descents through incidental deep-cut pockets (seed 67, 31.7%-mean drop)
    fillMax: 8,       // m above ground where a fill becomes a bridge
    onTol: 0.75,      // m — |deck − ground| within this counts as on-grade
    gMaxRoad: 0.24,   // hard vocabulary cap for surface states (sustained ceiling is 0.40)
    gMaxBore: 0.18,   // bores are gentler by construction (FEAT-40 lineage)
    // BUG-56 workstream C, owner ruling 2026-08-27: the profile ladder's CEILING rung is the strict
    // limit, and it is expressed RELATIVE to the cap — gMaxRoad + gradeTol — so it tracks the knob
    // instead of being a second free-floating number. 0.14 keeps the historical 38 % exactly. It is
    // deliberately lenient: a road solved at the ceiling is legal by fiat, because a grade failure
    // is cheaper than a connectivity violation. wGrade keeps its job as the routing preference that
    // holds AVERAGE grade pleasant; the ceiling is only the backstop that decides condemnation.
    gradeTol: 0.14,
}

// The corridor stage's octave depth. 4 == the full coarse field at default params: the 2.5D plan
// must see the wrinkles the profile will pay for. ONE constant shared by RoadSystem._v2Trunc and
// the route Worker's field rebuild — a literal in two places is exactly the drift the FEAT-68
// no-mirror fence exists to prevent.
export const V2_TRUNC_K = 4

// ── Octave-truncated coarse field (scope-fenced ADDITIVE read API — world byte-identical) ──────
/**
 * Same ridged-fBm loop as _coarseHeight()/coarseHeight() but stopped after K octaves.
 * K=2 keeps the 2000 m / 1000 m skeleton (225 of ~281 m total amplitude) — the scale where the
 * real passes and valleys live. NOT a new field: octave 0..K-1 of the shipping one, low-passed.
 * @param {Function} noiseCoarse createNoise2D closure (the road/terrain one)
 * @param {object} params RANGER_PARAMS (coarseAmplitude/coarseFreq/ridgeSharpness/coarseOctaves)
 * @param {number} K octaves to keep (1..coarseOctaves)
 * @returns {(x:number,z:number)=>number} height closure, raw metres (pre-amplitude)
 */
export function truncatedHeightField(noiseCoarse, params, K) {
    const { coarseAmplitude, coarseFreq, ridgeSharpness, coarseOctaves } = params
    const n = Math.max(1, Math.min(K, coarseOctaves))
    return (wx, wz) => {
        let h = 0, freq = coarseFreq, amp = coarseAmplitude
        for (let o = 0; o < n; o++) {
            const v = noiseCoarse(wx * freq, wz * freq)
            h += Math.pow(1.0 - Math.abs(v), ridgeSharpness) * amp
            freq *= 2.0
            amp *= 0.5
        }
        return h
    }
}

// ── Minimal binary min-heap (local to the corridor search) ─────────────────────────────────────
class Heap {
    constructor() { this.d = [] }
    push(item, pri) {
        const d = this.d
        d.push({ item, pri })
        let i = d.length - 1
        while (i > 0) { const p = (i - 1) >> 1; if (d[p].pri <= d[i].pri) break; [d[p], d[i]] = [d[i], d[p]]; i = p }
    }
    pop() {
        const d = this.d
        const top = d[0], last = d.pop()
        if (d.length) {
            d[0] = last
            let i = 0
            for (;;) {
                const l = 2 * i + 1, r = l + 1
                let m = i
                if (l < d.length && d[l].pri < d[m].pri) m = l
                if (r < d.length && d[r].pri < d[m].pri) m = r
                if (m === i) break
                ;[d[m], d[i]] = [d[i], d[m]]; i = m
            }
        }
        return top?.item
    }
    get size() { return this.d.length }
}

// ── Stage 1: the 2.5D corridor search ─────────────────────────────────────────────────────────
/**
 * Coarse A* whose state is (cell, DECK ELEVATION BIN) — the deck's height is part of the plan,
 * not a consequence of it (owner green-light 2026-08-19). This is the structural fix for the
 * no-switchbacks class, and it replaces three dead patches at once:
 *
 *  - Grade is a HARD per-step budget on the deck (|Δdeck| ≤ cap·ds), priced on the grade you
 *    CHOOSE — one-cell dithering to dodge steep ground samples gains nothing, so the old
 *    "zigzag noise vs switchback" ambiguity never forms.
 *  - The same cell at two heights is two different states, so switchback STACKS (the road
 *    crossing the same hillside repeatedly at different benches) are expressible — the plain XZ
 *    lattice forbade them outright (each cell visitable once).
 *  - Terrain enters as deck-vs-ground offset priced through the SAME classOf/stationRate
 *    vocabulary the profile uses (on-grade/cut/bore… per metre, portal charges on class change).
 *    The old structure-cap ("everything steeper than 30% costs the bore rate") and its
 *    cover-proxy patch both dissolve: the state knows whether the deck is under or over ground.
 *
 * Still heading-free — no v1 lattice disease. The exact 1-D profile DP downstream re-solves the
 * vertical on the final stations, so priced == built is untouched; the deck plan here is the
 * corridor's own honest cost model, not the shipped profile.
 *
 * opts.structureCap === false is the fail-safe ladder's conservative mode: BORE states are
 * illegal, so the plan must stay within cut/fill of the surface — the corridor then routes
 * around anything the structure vocabulary cannot buy through.
 *
 * opts.startDir / opts.goalDir (unit {x,z}) are FEAT-68 deg-2 approach-heading pins: the first
 * step out of the start state and the arriving step into a goal state must lie within a 60° cone
 * (dot ≥ 0.5 — admits exactly the two nearest lattice directions) of the pinned heading. The
 * cone additionally BINDS OVER A TERMINAL REGION (~2.5 cells): near a pinned end no step may
 * move against the pin (dot < 0) — a literal-last-step cone was measured satisfiable by
 * overshooting the goal and hooking back with a 150° jink on the final step (letter, not
 * spirit). A constrained search can return null; the CALLER retries without pins (connectivity
 * outranks joint tangency — a cheap extra ladder rung, road.js's job).
 *
 * @param {number} ax,az anchor A world XZ · @param {number} yA deck height pinned at A
 * @param {number} bx,bz anchor B world XZ · @param {number} yB deck height pinned at B
 * @param {(x:number,z:number)=>number} hTrunc octave-truncated field
 * @param {object} [opts] { cell=32, yBin=3, margin=max(800,chord), costs=V2_COSTS,
 *                          blockedDiscs (ponds, flat [x,z,r,...]), structureCap,
 *                          startDir, goalDir }
 * @returns {{path:{x:number,z:number,y:number}[], cost:number, expanded:number}|null}
 */
const TERM_R = 2.5   // cells — reach of a heading pin's no-backtracking terminal region
export function corridorSearch(ax, az, yA, bx, bz, yB, hTrunc, opts = {}) {
    const _unit = (d) => { if (!d) return null; const l = Math.hypot(d.x, d.z); return l > 1e-9 ? { x: d.x / l, z: d.z / l } : null }
    const sDir = _unit(opts.startDir), gDir = _unit(opts.goalDir)
    const C = opts.costs ?? V2_COSTS
    const cell = opts.cell ?? 32
    const yBin = opts.yBin ?? 3
    const chord = Math.hypot(bx - ax, bz - az)
    const margin = opts.margin ?? Math.max(800, chord)
    const x0 = Math.min(ax, bx) - margin, x1 = Math.max(ax, bx) + margin
    const z0 = Math.min(az, bz) - margin, z1 = Math.max(az, bz) + margin
    const W = Math.ceil((x1 - x0) / cell) + 1, Hn = Math.ceil((z1 - z0) / cell) + 1
    const idx = (cx, cz) => cz * W + cx
    const wx = cx => x0 + cx * cell, wz = cz => z0 + cz * cell

    // Terrain memo for this search only (pure per call — no cross-edge state).
    const hMemo = new Float64Array(W * Hn).fill(NaN)
    const hAt = (cx, cz) => {
        const i = idx(cx, cz)
        let v = hMemo[i]
        if (Number.isNaN(v)) { v = hTrunc(wx(cx), wz(cz)); hMemo[i] = v }
        return v
    }

    // Elevation range: a stride-2 terrain pre-scan bounds the deck lattice. The deck can never sit
    // above ground+fillMax (bridges de-scoped) and never usefully below the box floor minus the
    // cut band. The pre-scan fills the memo the search reuses.
    let tMin = Math.min(yA, yB), tMax = Math.max(yA, yB)
    for (let cz2 = 0; cz2 < Hn; cz2 += 2) for (let cx2 = 0; cx2 < W; cx2 += 2) {
        const h = hAt(cx2, cz2)
        if (h < tMin) tMin = h
        if (h > tMax) tMax = h
    }
    const yLo = tMin - C.cutMax - 3 * yBin
    const NY = Math.max(2, Math.min(220, Math.round((tMax + C.fillMax + yBin - yLo) / yBin) + 1))
    const yOf = b => yLo + b * yBin
    const bOf = y => Math.max(0, Math.min(NY - 1, Math.round((y - yLo) / yBin)))

    // Hard no-go cells (pond+skirt discs): 0 unknown, 1 open, 2 blocked — resolved lazily.
    const discs = opts.blockedDiscs
    const blockedArr = discs && discs.length ? new Uint8Array(W * Hn) : null
    const exempt2 = (2 * cell) * (2 * cell)
    const isBlocked = (cx2, cz2) => {
        if (!blockedArr) return false
        const i = idx(cx2, cz2)
        if (blockedArr[i]) return blockedArr[i] === 2
        const x = wx(cx2), z = wz(cz2)
        let b = 1
        const dax = x - ax, daz = z - az, dbx = x - bx, dbz = z - bz
        if (dax * dax + daz * daz > exempt2 && dbx * dbx + dbz * dbz > exempt2) {
            for (let d = 0; d < discs.length; d += 3) {
                const dx = x - discs[d], dz = z - discs[d + 1]
                if (dx * dx + dz * dz <= discs[d + 2] * discs[d + 2]) { b = 2; break }
            }
        }
        blockedArr[i] = b
        return b === 2
    }

    const noBore = opts.structureCap === false
    // Bore states live in the anchor elevation BAND: a bore must surface at portal height at both
    // ends, so decks far above/below the anchors are never usefully underground — without this
    // clamp every cell under a crest carries 50+ deep-bore bins the search dutifully explores.
    const boreLoB = Math.floor((Math.min(yA, yB) - 20 - yLo) / yBin)
    const boreHiB = Math.ceil((Math.max(yA, yB) + 40 - yLo) / yBin)
    const sx = Math.round((ax - x0) / cell), sz = Math.round((az - z0) / cell)
    const gx = Math.round((bx - x0) / cell), gz = Math.round((bz - z0) / cell)
    const goalCell = idx(gx, gz), goalB = bOf(yB)

    const SN = W * Hn * NY
    const gCost = new Float64Array(SN).fill(Infinity)
    const from = new Int32Array(SN).fill(-1)
    const open = new Heap()
    // Admissible heuristic: the continuous relaxation of "cover horizontal distance D while
    // buying |ΔY| = V of elevation" over the cost 1 + wGrade·g² per metre (every station rate is
    // ≥ cRoadM and turn/portal charges are ≥ 0, so this lower-bounds the true remainder).
    // Minimizing ∫(1+wG·g²)ds with path length L ≥ D and ∫|g|ds ≥ V gives
    //   L = D:        D + wG·V²/D      (gentle case — the climb fits in the crow-flight run)
    //   L = V·√wG:    2·V·√wG          (steep case — extra length must be bought)
    // Far tighter than max(D, V·2√wG) on climbing remainders — measured 72k → far fewer expansions.
    const RTWG = Math.sqrt(Math.max(1e-6, C.wGrade))
    const hEu = (cx, cz, yb) => {
        const D = Math.hypot(wx(cx) - bx, wz(cz) - bz)
        const V = Math.abs(yOf(yb) - yB)
        return (D >= V * RTWG ? D + C.wGrade * V * V / Math.max(1e-9, D) : 2 * V * RTWG) * C.cRoadM
    }

    // Weighted A* (ε = 1.15): the corridor is the COARSE stage — a bounded 15% cost inflation on
    // its plan buys a several-fold expansion cut, and the exact profile DP re-prices the final
    // line regardless (priced == built is downstream of this choice).
    const EPS_W = 1.15
    const startS = idx(sx, sz) * NY + bOf(yA)
    gCost[startS] = 0
    open.push(startS, EPS_W * hEu(sx, sz, bOf(yA)))
    const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    let expanded = 0
    let found = -1

    while (open.size) {
        const cur = open.pop()
        const curCell = (cur / NY) | 0
        const curB = cur - curCell * NY
        if (curCell === goalCell && Math.abs(curB - goalB) <= 1) { found = cur; break }
        const cz2 = (curCell / W) | 0, cx2 = curCell - cz2 * W
        const gc = gCost[cur]
        const parentCell = from[cur] >= 0 ? (from[cur] / NY) | 0 : -1
        let pdx = 0, pdz = 0
        if (parentCell >= 0) {
            const pz = (parentCell / W) | 0, px = parentCell - pz * W
            pdx = cx2 - px; pdz = cz2 - pz
            const pl = Math.hypot(pdx, pdz) || 1
            pdx /= pl; pdz /= pl
        }
        expanded++
        const y0 = yOf(curB)
        const cls0 = classOf(y0 - hAt(cx2, cz2), C)
        const bore0 = cls0 === CLS.BORE
        for (const [dx, dz] of NB) {
            const nx = cx2 + dx, nz = cz2 + dz
            if (nx < 0 || nz < 0 || nx >= W || nz >= Hn) continue
            if (idx(nx, nz) === parentCell) continue   // no A→B→A retrace: an "elevator" stack has
                                                       // zero lateral advance — unbuildable, and XZ
                                                       // simplification would annihilate its length
            if (isBlocked(nx, nz)) continue
            const dl = Math.hypot(dx, dz)
            // heading pins: first step out of the start state must lie in the strict cone, and
            // any step SOURCED within the start's terminal region may not move against the pin …
            if (sDir) {
                if (parentCell < 0 && dx * sDir.x + dz * sDir.z < (0.5 - 1e-9) * dl) continue
                if (dx * sDir.x + dz * sDir.z < -1e-9 &&
                    Math.hypot(wx(cx2) - ax, wz(cz2) - az) < TERM_R * cell) continue
            }
            // … mirrored at the goal: no step LANDING in the goal's terminal region may move
            // against the pin, and the arriving step must lie in the strict cone (checked per-bin
            // below — only arrivals within the goal's accept window |nb−goalB| ≤ 1 are "arrivals")
            if (gDir && dx * gDir.x + dz * gDir.z < -1e-9 &&
                Math.hypot(wx(nx) - bx, wz(nz) - bz) < TERM_R * cell) continue
            const gConeFail = gDir && idx(nx, nz) === goalCell &&
                dx * gDir.x + dz * gDir.z < (0.5 - 1e-9) * dl
            const ds = cell * dl
            const g1 = hAt(nx, nz)
            // deck may not rise above ground+fillMax (no bridges); no useful floor below the band
            const bTop = Math.min(NY - 1, Math.floor((g1 + C.fillMax - yLo) / yBin))
            const kMax = Math.round(C.gMaxRoad * ds / yBin)
            const ni0 = idx(nx, nz) * NY
            for (let nb = Math.max(0, curB - kMax); nb <= Math.min(bTop, curB + kMax); nb++) {
                if (gConeFail && Math.abs(nb - goalB) <= 1) continue   // off-cone goal arrival
                const y1 = yOf(nb)
                const d1 = y1 - g1
                const cls1 = classOf(d1, C)
                const bore1 = cls1 === CLS.BORE
                if (bore1 && (noBore || nb < boreLoB || nb > boreHiB)) continue
                const g = (y1 - y0) / ds
                const cap = (bore0 || bore1) ? C.gMaxBore : C.gMaxRoad
                if (Math.abs(g) > cap + yBin / (2 * ds) + 1e-9) continue
                let c = gc + ds * stationRate(d1, C) + ds * C.cRoadM * C.wGrade * g * g
                if (pdx !== 0 || pdz !== 0) {
                    const dl = Math.hypot(dx, dz)
                    const dot = (dx * pdx + dz * pdz) / dl
                    const crs = Math.abs(dx * pdz - dz * pdx) / dl
                    c += (C.cTurn ?? 0) * Math.atan2(crs, dot)
                }
                if (bore0 !== bore1) c += C.cPortal
                const ni = ni0 + nb
                if (c < gCost[ni]) {
                    gCost[ni] = c
                    from[ni] = cur
                    open.push(ni, c + EPS_W * hEu(nx, nz, nb))
                }
            }
        }
    }
    if (found < 0) return null

    const path = []
    for (let i = found; i !== -1; i = from[i]) {
        const ci = (i / NY) | 0
        const cz2 = (ci / W) | 0, cx2 = ci - cz2 * W
        path.push({ x: wx(cx2), z: wz(cz2), y: yOf(i - ci * NY) })
    }
    path.reverse()
    // Exact endpoints (the lattice snapped them): pin A and B, and ABSORB lattice vertices closer
    // than ~a cell to each anchor — the pin can land up to half a cell diagonal away from its
    // snapped cell, and a leftover vertex that close makes a short-leg kink no smoothing pass can
    // buy a real radius for (measured: the sub-8 m fillets all sat at run STARTs).
    // A heading-pinned end SKIPS its absorb: the constrained first/last step IS the joint tangent,
    // and absorbing it would eat exactly the geometry the cone paid for.
    path[0] = { x: ax, z: az, y: yA }
    path[path.length - 1] = { x: bx, z: bz, y: yB }
    if (!sDir) while (path.length > 2 && Math.hypot(path[1].x - ax, path[1].z - az) < cell * 1.6) path.splice(1, 1)
    if (!gDir) while (path.length > 2 && Math.hypot(path[path.length - 2].x - bx, path[path.length - 2].z - bz) < cell * 1.6) path.splice(path.length - 2, 1)
    return { path, cost: gCost[found], expanded }
}

// ── Station resampling ─────────────────────────────────────────────────────────────────────────
/**
 * Resample a corridor polyline at ~ds intervals and read the FULL-resolution ground under each
 * station. Ground here is the real field the carve will use — the profile prices real dirt.
 * @returns {{s:number[], x:number[], z:number[], ground:number[]}}
 */
export function resampleStations(path, hFull, ds = 10) {
    const s = [0]
    for (let i = 1; i < path.length; i++)
        s.push(s[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z))
    const L = s[path.length - 1]
    const n = Math.max(2, Math.round(L / ds))
    const out = { s: [], x: [], z: [], ground: [] }
    let seg = 1
    for (let i = 0; i <= n; i++) {
        const t = L * i / n
        while (seg < path.length - 1 && s[seg] < t) seg++
        const a = path[seg - 1], b = path[seg]
        const u = (t - s[seg - 1]) / Math.max(1e-9, s[seg] - s[seg - 1])
        const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u
        out.s.push(t); out.x.push(x); out.z.push(z); out.ground.push(hFull(x, z))
    }
    return out
}

// Profile state classes (derived from deck − ground, never stored independently).
export const CLS = { ON: 0, CUT: 1, FILL: 2, BORE: 3, BRIDGE: 4 }
export const CLS_NAME = ['on', 'cut', 'fill', 'bore', 'bridge']

function classOf(d, C) {
    if (Math.abs(d) <= C.onTol) return CLS.ON
    if (d < 0) return d < -C.cutMax ? CLS.BORE : CLS.CUT
    return d > C.fillMax ? CLS.BRIDGE : CLS.FILL
}

/** Per-metre station cost for a deck at offset d from ground (no grade/fixed terms). */
function stationRate(d, C) {
    switch (classOf(d, C)) {
        case CLS.ON: return C.cRoadM
        case CLS.CUT: return C.cRoadM + C.cCutM * (-d) + (C.cCut2 ?? 0) * d * d
        case CLS.FILL: return C.cRoadM + C.cFillM * d
        case CLS.BORE: return C.cBoreM
        case CLS.BRIDGE: return C.bridgesOn ? C.cBridgeM : Infinity
    }
}

// ── Stage 2: exact profile solve ───────────────────────────────────────────────────────────────
/**
 * 1-D dynamic programming over deck elevation along the stations. State = (station, quantized y).
 * Transition = one station step at grade g = Δy/Δs, allowed while g respects the class caps
 * (surface 35%, bore 18%). Costs: station rate (above) × ds + on-grade quadratic discomfort
 * + fixed portal/abutment charges when the derived class crosses into/out of bore/bridge.
 * Endpoints are PINNED to (yA, yB) — junction node heights as boundary conditions (FEAT-68
 * junction plan item 2: edges may never disagree at shared nodes).
 *
 * No vertical-curvature smoothing term: crest airtime is a FEATURE (character spec). If lattice
 * sawtooth shows up it gets handled in stage 3 (curve generation), never priced away here.
 *
 * @param {{s:number[],ground:number[]}} st stations from resampleStations
 * @param {number} yA deck height pinned at station 0
 * @param {number} yB deck height pinned at the last station
 * @param {object} [opts] { yStep=0.5, costs=V2_COSTS }
 * @returns {{y:number[], cls:number[], cost:number, segs:{cls:number,s0:number,s1:number,len:number}[]}|null}
 *          null = infeasible under the caps (mark-and-ship is the CALLER's job)
 */
// One transition step: cost of arriving at (ground g1, deck y1) from (g0, y0) over ds.
// Infinity when the grade cap of the classes involved is exceeded.
// Cap check carries a HALF-QUANTUM tolerance (yStep/2 of Δy): on a y-grid the legal grades
// come in yStep/ds increments, so a hard cap silently truncates to the next lower increment —
// measured on seed 20 edge -5,-1,0:-5,0,1, floor(0.35·9.993/0.5)=6 made the effective cap 30%
// and a feasible 28.5%-mean descent "infeasible". Tolerating cap + yStep/(2·ds) (≤2.5% grade
// at defaults) biases the error to a bounded overshoot instead of an unbounded undershoot.
// (BUG-55: factored out of profileSolve so profileSolveBundle prices with the identical rule.)
function makeStepCost(C, yStep) {
    return (y0, g0, y1, g1, ds) => {
        const g = (y1 - y0) / ds
        const cls0 = classOf(y0 - g0, C), cls1 = classOf(y1 - g1, C)
        // class-aware grade cap: any bore endpoint tightens the cap
        const cap = (cls0 === CLS.BORE || cls1 === CLS.BORE) ? C.gMaxBore : C.gMaxRoad
        if (Math.abs(g) > cap + yStep / (2 * ds) + 1e-9) return Infinity
        let c = ds * stationRate(y1 - g1, C) + ds * C.cRoadM * C.wGrade * g * g
        if ((cls0 === CLS.BORE) !== (cls1 === CLS.BORE)) c += C.cPortal
        if ((cls0 === CLS.BRIDGE) !== (cls1 === CLS.BRIDGE)) c += C.cAbutment
        return c
    }
}

export function profileSolve(st, yA, yB, opts = {}) {
    const C = opts.costs ?? V2_COSTS
    const yStep = opts.yStep ?? 0.5
    const n = st.s.length
    if (n < 2) return null

    let lo = Math.min(yA, yB), hi = Math.max(yA, yB)
    for (const g of st.ground) { if (g < lo) lo = g; if (g > hi) hi = g }
    if (opts.pins) for (const p of opts.pins) { if (p.y < lo) lo = p.y; if (p.y > hi) hi = p.y }
    lo -= C.cutMax + 8
    hi += C.fillMax + 8
    const ny = Math.max(2, Math.round((hi - lo) / yStep) + 1)
    const yOf = j => lo + j * yStep

    const stepCost = makeStepCost(C, yStep)

    // BUG-55: INTERIOR PINS — [{i, y}] forces station i (interior only) to the grid state nearest
    // y. This is how a bundled winner's trunk carries the fork decks the joint solve negotiated:
    // the DP still owns everything between the pins, so the trunk bends toward each fork exactly
    // as the negotiation priced it. A pin the caps cannot reach nulls the solve (the caller's
    // ladder handles it) — never silently ignored.
    const pinAt = new Map()
    if (opts.pins) for (const p of opts.pins) {
        const i = Math.max(1, Math.min(n - 2, p.i))
        pinAt.set(i, Math.max(0, Math.min(ny - 1, Math.round((p.y - lo) / yStep))))
    }
    const applyPin = (i, arr) => {
        const jPin = pinAt.get(i)
        if (jPin === undefined) return
        for (let j = 0; j < ny; j++) if (j !== jPin) arr[j] = Infinity
    }

    // ENDPOINTS ARE EXACT, not grid states: station 0 sits at yA and station n-1 at yB precisely
    // (junction node heights are a boundary CONDITION — a grid snap there would let two edges
    // disagree at a shared node by up to yStep/2, re-importing v1's node disease in miniature).
    // Interior stations 1..n-2 live on the y grid; the first and last transitions are computed
    // against the continuous endpoint values, so the DP's accumulated cost is the exact price of
    // the exact profile that ships. priced == built with no epsilon.
    if (n === 2) {
        const ds = st.s[1] - st.s[0]
        const c = stepCost(yA, st.ground[0], yB, st.ground[1], ds)
        if (c === Infinity) return null
        const y = [yA, yB]
        const cls = [classOf(yA - st.ground[0], C), classOf(yB - st.ground[1], C)]
        const segs = [{ cls: cls[0], s0: st.s[0], s1: st.s[0] }]
        if (cls[1] === cls[0]) segs[0].s1 = st.s[1]
        else segs.push({ cls: cls[1], s0: st.s[1], s1: st.s[1] })
        for (const sg of segs) sg.len = sg.s1 - sg.s0
        return { y, cls, cost: c, segs }
    }

    // cost[i][j] = cheapest cost to reach interior station i (1-based here) at elevation index j
    const cost = []
    const from = []
    {   // first step: exact yA → grid states of station 1
        const ds = st.s[1] - st.s[0]
        const kMax = Math.ceil(C.gMaxRoad * ds / yStep) + 1
        const c1 = new Float64Array(ny).fill(Infinity)
        const jNear = Math.round((yA - lo) / yStep)
        for (let j = Math.max(0, jNear - kMax); j <= Math.min(ny - 1, jNear + kMax); j++) {
            c1[j] = stepCost(yA, st.ground[0], yOf(j), st.ground[1], ds)
        }
        applyPin(1, c1)
        cost[1] = c1
        from[1] = null
    }
    for (let i = 2; i <= n - 2; i++) {
        const ds = st.s[i] - st.s[i - 1]
        const kMax = Math.ceil(C.gMaxRoad * ds / yStep)
        const ci = new Float64Array(ny).fill(Infinity)
        const fi = new Int32Array(ny).fill(-1)
        const prev = cost[i - 1]
        const g0 = st.ground[i - 1], g1 = st.ground[i]
        for (let j = 0; j < ny; j++) {
            const y1 = yOf(j)
            let best = Infinity, bestK = -1
            for (let k = Math.max(0, j - kMax); k <= Math.min(ny - 1, j + kMax); k++) {
                const p = prev[k]
                if (p === Infinity) continue
                const c = p + stepCost(yOf(k), g0, y1, g1, ds)
                if (c < best) { best = c; bestK = k }
            }
            ci[j] = best
            fi[j] = bestK
        }
        applyPin(i, ci)
        cost[i] = ci
        from[i] = fi
    }
    // last step: grid states of station n-2 → exact yB
    let total = Infinity, jEnd = -1
    {
        const ds = st.s[n - 1] - st.s[n - 2]
        const prev = cost[n - 2]
        const g0 = st.ground[n - 2], g1 = st.ground[n - 1]
        for (let k = 0; k < ny; k++) {
            const p = prev[k]
            if (p === Infinity) continue
            const c = p + stepCost(yOf(k), g0, yB, g1, ds)
            if (c < total) { total = c; jEnd = k }
        }
    }
    if (!Number.isFinite(total)) return null

    const y = new Array(n), cls = new Array(n)
    y[0] = yA; y[n - 1] = yB
    let j = jEnd
    for (let i = n - 2; i >= 1; i--) {
        y[i] = yOf(j)
        j = from[i] ? from[i][j] : j
    }
    for (let i = 0; i < n; i++) cls[i] = classOf(y[i] - st.ground[i], C)

    const segs = []
    for (let i = 0; i < n; i++) {
        const last = segs[segs.length - 1]
        if (last && last.cls === cls[i]) { last.s1 = st.s[i] }
        else segs.push({ cls: cls[i], s0: st.s[i], s1: st.s[i] })
    }
    for (const sg of segs) sg.len = sg.s1 - sg.s0
    return { y, cls, cost: total, segs }
}

/**
 * BUG-55: the JOINT bundle solve — negotiate fork deck heights across a winner's trunk and every
 * loser strand that forks off it, instead of letting the winner solve alone and dictate.
 *
 * Structure: the trunk DP runs exactly like profileSolve (exact pinned ends, interior y-grid).
 * Each BRANCH is a loser's outer strand, solved first from its own exact pinned end (its far
 * node) up to its fork, yielding "cheapest cost to arrive at the fork at each grid elevation".
 * That array is ADDED into the trunk's cost table at the fork station, so the trunk's own
 * minimisation weighs a bend toward a branch against its own grade cost — the fork elevation is
 * negotiated under the caps, priced by the identical stepCost the ordinary solve uses (a class
 * flip at the fork pays its cPortal through the same rule; no new vocabulary).
 *
 * One shared y-grid spans every strand, so a branch's arrival cost at grid j and the trunk's cost
 * at grid j describe the same elevation — the fold-in is exact. Endpoints of every strand stay
 * exact (yA/yB/yPin), so the y-spread-0.000 node contract is preserved by construction.
 *
 * The caller consumes the negotiated FORK HEIGHTS (plus the raw branch profiles, for the pad
 * arrival-grade guard); the shipped per-strand profiles are then re-solved through the ordinary
 * ladder with these heights as pins, inheriting dequantise/finish behaviour unchanged.
 *
 * @param {{s:number[],ground:number[],yA:number,yB:number}} trunk winner stations, node to node
 * @param {{s:number[],ground:number[],yPin:number,forkIdx:number}[]} branches loser strands —
 *        station 0 = the strand's own pinned far end, last station = the fork; forkIdx names the
 *        INTERIOR trunk station the strand attaches to
 * @param {object} [opts] { yStep=0.5, costs=V2_COSTS }
 * @returns {{forkY:number[], trunkY:number[], branchY:number[][], cost:number}|null}
 *          null = no joint profile exists under the caps (the caller's ladder handles it)
 */
export function profileSolveBundle(trunk, branches, opts = {}) {
    const C = opts.costs ?? V2_COSTS
    const yStep = opts.yStep ?? 0.5
    const n = trunk.s.length
    if (n < 4 || !branches.length) return null
    const { yA, yB } = trunk

    let lo = Math.min(yA, yB), hi = Math.max(yA, yB)
    for (const g of trunk.ground) { if (g < lo) lo = g; if (g > hi) hi = g }
    for (const b of branches) {
        if (b.yPin < lo) lo = b.yPin; if (b.yPin > hi) hi = b.yPin
        for (const g of b.ground) { if (g < lo) lo = g; if (g > hi) hi = g }
    }
    lo -= C.cutMax + 8
    hi += C.fillMax + 8
    const ny = Math.max(2, Math.round((hi - lo) / yStep) + 1)
    const yOf = j => lo + j * yStep
    const stepCost = makeStepCost(C, yStep)

    // ── branch forward passes: arr[j] = cheapest arrival at the fork at elevation yOf(j) ──
    const bs = []
    for (const b of branches) {
        const m = b.s.length
        if (m < 2) return null
        const forkIdx = Math.max(1, Math.min(n - 2, b.forkIdx))
        const arr = new Float64Array(ny).fill(Infinity)
        const arrFrom = new Int32Array(ny).fill(-1)
        if (m === 2) {
            const ds = b.s[1] - b.s[0]
            for (let j = 0; j < ny; j++) {
                arr[j] = stepCost(b.yPin, b.ground[0], yOf(j), b.ground[1], ds)
                arrFrom[j] = -2   // direct from the exact pin
            }
            bs.push({ b, forkIdx, arr, arrFrom, cost: null, from: null })
            continue
        }
        const cost = [], from = []
        {   // first step: exact yPin → grid states of station 1
            const ds = b.s[1] - b.s[0]
            const kMax = Math.ceil(C.gMaxRoad * ds / yStep) + 1
            const c1 = new Float64Array(ny).fill(Infinity)
            const jNear = Math.round((b.yPin - lo) / yStep)
            for (let j = Math.max(0, jNear - kMax); j <= Math.min(ny - 1, jNear + kMax); j++)
                c1[j] = stepCost(b.yPin, b.ground[0], yOf(j), b.ground[1], ds)
            cost[1] = c1
            from[1] = null
        }
        for (let i = 2; i <= m - 2; i++) {
            const ds = b.s[i] - b.s[i - 1]
            const kMax = Math.ceil(C.gMaxRoad * ds / yStep)
            const ci = new Float64Array(ny).fill(Infinity)
            const fi = new Int32Array(ny).fill(-1)
            const prev = cost[i - 1]
            const g0 = b.ground[i - 1], g1 = b.ground[i]
            for (let j = 0; j < ny; j++) {
                const y1 = yOf(j)
                let best = Infinity, bestK = -1
                for (let k = Math.max(0, j - kMax); k <= Math.min(ny - 1, j + kMax); k++) {
                    const p = prev[k]
                    if (p === Infinity) continue
                    const c = p + stepCost(yOf(k), g0, y1, g1, ds)
                    if (c < best) { best = c; bestK = k }
                }
                ci[j] = best
                fi[j] = bestK
            }
            cost[i] = ci
            from[i] = fi
        }
        {   // last step: grid states of station m-2 → grid states of the fork
            const ds = b.s[m - 1] - b.s[m - 2]
            const kMax = Math.ceil(C.gMaxRoad * ds / yStep)
            const prev = cost[m - 2]
            const g0 = b.ground[m - 2], g1 = b.ground[m - 1]
            for (let j = 0; j < ny; j++) {
                const y1 = yOf(j)
                let best = Infinity, bestK = -1
                for (let k = Math.max(0, j - kMax); k <= Math.min(ny - 1, j + kMax); k++) {
                    const p = prev[k]
                    if (p === Infinity) continue
                    const c = p + stepCost(yOf(k), g0, y1, g1, ds)
                    if (c < best) { best = c; bestK = k }
                }
                arr[j] = best
                arrFrom[j] = bestK
            }
        }
        bs.push({ b, forkIdx, arr, arrFrom, cost, from })
    }

    // ── trunk pass, with each branch's arrival cost folded in at its fork station ──
    const foldAt = (i, arr) => {
        for (const e of bs) if (e.forkIdx === i)
            for (let j = 0; j < ny; j++) arr[j] += e.arr[j]
    }
    const cost = [], from = []
    {
        const ds = trunk.s[1] - trunk.s[0]
        const kMax = Math.ceil(C.gMaxRoad * ds / yStep) + 1
        const c1 = new Float64Array(ny).fill(Infinity)
        const jNear = Math.round((yA - lo) / yStep)
        for (let j = Math.max(0, jNear - kMax); j <= Math.min(ny - 1, jNear + kMax); j++)
            c1[j] = stepCost(yA, trunk.ground[0], yOf(j), trunk.ground[1], ds)
        foldAt(1, c1)
        cost[1] = c1
        from[1] = null
    }
    for (let i = 2; i <= n - 2; i++) {
        const ds = trunk.s[i] - trunk.s[i - 1]
        const kMax = Math.ceil(C.gMaxRoad * ds / yStep)
        const ci = new Float64Array(ny).fill(Infinity)
        const fi = new Int32Array(ny).fill(-1)
        const prev = cost[i - 1]
        const g0 = trunk.ground[i - 1], g1 = trunk.ground[i]
        for (let j = 0; j < ny; j++) {
            const y1 = yOf(j)
            let best = Infinity, bestK = -1
            for (let k = Math.max(0, j - kMax); k <= Math.min(ny - 1, j + kMax); k++) {
                const p = prev[k]
                if (p === Infinity) continue
                const c = p + stepCost(yOf(k), g0, y1, g1, ds)
                if (c < best) { best = c; bestK = k }
            }
            ci[j] = best
            fi[j] = bestK
        }
        foldAt(i, ci)
        cost[i] = ci
        from[i] = fi
    }
    let total = Infinity, jEnd = -1
    {
        const ds = trunk.s[n - 1] - trunk.s[n - 2]
        const prev = cost[n - 2]
        const g0 = trunk.ground[n - 2], g1 = trunk.ground[n - 1]
        for (let k = 0; k < ny; k++) {
            const p = prev[k]
            if (p === Infinity) continue
            const c = p + stepCost(yOf(k), g0, yB, g1, ds)
            if (c < total) { total = c; jEnd = k }
        }
    }
    if (!Number.isFinite(total)) return null

    // ── backtrace: trunk first (recording the chosen grid state at every station), then each
    //    branch from its fork's chosen state down to its own exact pin ──
    const trunkY = new Array(n)
    const jAt = new Int32Array(n).fill(-1)
    trunkY[0] = yA; trunkY[n - 1] = yB
    let j = jEnd
    for (let i = n - 2; i >= 1; i--) {
        trunkY[i] = yOf(j)
        jAt[i] = j
        j = from[i] ? from[i][j] : j
    }
    const forkY = [], branchY = []
    for (const e of bs) {
        const m = e.b.s.length
        const jF = jAt[e.forkIdx]
        const y = new Array(m)
        y[m - 1] = yOf(jF)
        forkY.push(y[m - 1])
        let k = e.arrFrom[jF]
        if (k === -2) { y[0] = e.b.yPin; branchY.push(y); continue }
        for (let i = m - 2; i >= 1; i--) {
            y[i] = yOf(k)
            k = e.from && e.from[i] ? e.from[i][k] : k
        }
        y[0] = e.b.yPin
        branchY.push(y)
    }
    return { forkY, trunkY, branchY, cost: total }
}

/**
 * Price a FINISHED profile — the independent re-price that makes "priced == built" checkable, and
 * the shared cost model the dequantiser below re-prices with. Returns the same shape profileSolve
 * does, so a smoothed profile is indistinguishable from a solved one downstream.
 * @returns {{y:number[], cls:number[], cost:number, segs:object[]}|null} null = the array violates
 *          a grade cap (i.e. it is not a legal profile at all)
 */
export function priceProfile(st, y, C) {
    const n = st.s.length
    const cls = new Array(n)
    for (let i = 0; i < n; i++) cls[i] = classOf(y[i] - st.ground[i], C)
    let cost = 0
    for (let i = 1; i < n; i++) {
        const ds = st.s[i] - st.s[i - 1]
        if (!(ds > 1e-9)) continue
        const g = (y[i] - y[i - 1]) / ds
        const cap = (cls[i - 1] === CLS.BORE || cls[i] === CLS.BORE) ? C.gMaxBore : C.gMaxRoad
        if (Math.abs(g) > cap + 1e-9) return null
        const rate = stationRate(y[i] - st.ground[i], C)
        if (!Number.isFinite(rate)) return null
        cost += ds * rate + ds * C.cRoadM * C.wGrade * g * g
        if ((cls[i - 1] === CLS.BORE) !== (cls[i] === CLS.BORE)) cost += C.cPortal
        if ((cls[i - 1] === CLS.BRIDGE) !== (cls[i] === CLS.BRIDGE)) cost += C.cAbutment
    }
    const segs = []
    for (let i = 0; i < n; i++) {
        const last = segs[segs.length - 1]
        if (last && last.cls === cls[i]) last.s1 = st.s[i]
        else segs.push({ cls: cls[i], s0: st.s[i], s1: st.s[i] })
    }
    for (const sg of segs) sg.len = sg.s1 - sg.s0
    return { y, cls, cost, segs }
}

/**
 * VERTICAL DEQUANTISE (owner 2026-08-20: "the road changes slope rather abruptly… lots of tiny
 * microcrests and troughs that upset the suspension").
 *
 * The profile DP solves on an ELEVATION GRID, so the grades it can express come in quanta of
 * yStep/ds — 5% at the defaults (0.5 m over 10 m). A road that wants a steady −2.5% therefore ships
 * as a staircase alternating 0% and −5%, which is a train of micro-crests no real road has and the
 * suspension feels sharply. (Measured on seed 20: every station grade a multiple of 5%, 219 sample
 * steps jumping a full 5 percentage points.)
 *
 * The cure is a LOW-PASS on the interior stations, not a curvature term inside the DP. That is the
 * ticket's own instruction — crest airtime is a FEATURE, so vertical curvature is never priced away
 * — and it is why this is a window in METRES: a real crest spans many stations and a ~30 m window
 * leaves it untouched, while the quantisation ripple lives at exactly one station and dies.
 *
 * Three guarantees the callers depend on, in order of who would notice:
 *   1. ENDPOINTS NEVER MOVE. Junction node heights are a boundary condition, not a preference —
 *      moving one re-opens v1's node disease (y-spread at shared nodes).
 *   2. NO STATION CHANGES BORE/BRIDGE STATUS. on/cut/fill may interchange freely (they are one
 *      continuum and the re-price handles them), but a station may not sink into a bore or rise
 *      into a bridge — that would invent or destroy a span, portal charges and all.
 *   3. THE RESULT IS RE-PRICED, so priced == built still holds. It is a property of the SHIPPED
 *      array, and the shipped array is this one. If smoothing would break a grade cap the blend is
 *      bisected back toward the solved profile, which is always feasible — so this can soften the
 *      ripple or do nothing, but it can never ship an illegal road.
 *
 * @param {{s:number[],ground:number[]}} st stations
 * @param {object} prof the solved profile (from profileSolve)
 * @param {object} C the price list (reads vSmoothM, the window in metres; 0 = off)
 * @returns {object} a profile of the same shape — the input untouched when smoothing is off/unusable
 */
export function dequantizeProfile(st, prof, C) {
    const n = st.s.length
    if (n < 5) return prof
    // FIXED, and deliberately NOT the user's smoothing knob. This pass removes a SOLVER ARTIFACT —
    // the grade quantum of the elevation grid — so its size is set by the grid, not by taste. Three
    // binomial passes reach ≈1.2 stations of spread: enough to dissolve a one-station staircase
    // tread, far too little to touch anything the solver actually meant. (Measured: driving this
    // from the user knob made large settings WORSE, because heavy station smoothing then fought the
    // class clamps and the shipped-polyline rounding downstream.)
    const passes = 3
    const y0 = prof.y
    let y = y0.slice()
    const next = y0.slice()
    for (let p = 0; p < passes; p++) {
        for (let i = 1; i < n - 1; i++) next[i] = 0.25 * y[i - 1] + 0.5 * y[i] + 0.25 * y[i + 1]
        for (let i = 1; i < n - 1; i++) y[i] = next[i]
    }
    // Guarantee 2: clamp each interior station back inside its own bore/bridge status.
    const EPS = 1e-3
    for (let i = 1; i < n - 1; i++) {
        const g = st.ground[i]
        const wasBore = prof.cls[i] === CLS.BORE
        const wasBridge = prof.cls[i] === CLS.BRIDGE
        if (wasBore) y[i] = Math.min(y[i], g - C.cutMax - EPS)
        else y[i] = Math.max(y[i], g - C.cutMax + EPS)
        if (wasBridge) y[i] = Math.max(y[i], g + C.fillMax + EPS)
        else y[i] = Math.min(y[i], g + C.fillMax - EPS)
    }
    // Guarantee 3: keep the largest feasible blend toward the smoothed line. t = 0 (the solved
    // profile) is feasible by construction, so this always terminates with something legal.
    const blend = (t) => {
        const out = new Array(n)
        for (let i = 0; i < n; i++) out[i] = y0[i] + t * (y[i] - y0[i])
        return out
    }
    let best = priceProfile(st, blend(1), C)
    if (best) return best
    let lo = 0, hi = 1
    for (let it = 0; it < 12; it++) {
        const mid = (lo + hi) / 2
        const p = priceProfile(st, blend(mid), C)
        if (p) { best = p; lo = mid } else hi = mid
    }
    return best || prof
}

// ── Orchestration: routeEdgeV2 — the ONE route function (sync path AND Worker import it) ───────
/**
 * Feasibility pre-check: does a legal profile exist along this centerline? (~1–2 ms.)
 * Stations every ~10 m on the coarse field, endpoints pinned to the node heights.
 */
export function profileFeasible(cl, yA, yB, hCoarse, opts = {}) {
    const n = Math.max(2, Math.round(cl.length / 10))
    const st = { s: new Array(n + 1), ground: new Array(n + 1) }
    for (let i = 0; i <= n; i++) {
        const t = cl.length * i / n
        const p = cl.pointAt(t)
        st.s[i] = t
        st.ground[i] = hCoarse(p.x, p.z)
    }
    return profileSolve(st, yA, yB, opts) !== null
}

/**
 * Route one edge end to end: 2.5D corridor search → stage-3 curve → feasibility ladder. This is
 * THE route function — RoadSystem's synchronous path and the route Worker both import it, so
 * worker/sync parity is by construction (the FEAT-68 no-mirror fence).
 *
 * The fail-safe ladder (deterministic per spec — purity/window-invariance hold). Rung order
 * encodes the priorities: heading pins are the FIRST thing sacrificed (joint tangency is
 * cosmetic), the structure vocabulary the second (a conservative re-route prices hostile ground
 * at full quadratic cost so the corridor goes AROUND — for gullies/convex drops where no bore can
 * substitute and the default plan's profile is infeasible). First rung whose profile is feasible
 * ships; if none is, the rung-1 curve ships and the caller's registration marks it
 * (mark-and-ship — the network never disconnects).
 *
 * @param {object} spec { ax, az, yA, bx, bz, yB, margin, blockedDiscs, dirs } — dirs =
 *   {startDir?, goalDir?} unit {x,z}, the deg-2 canonical approach headings (or undefined)
 * @param {(x,z)=>number} hTrunc corridor field (truncatedHeightField at V2_TRUNC_K)
 * @param {(x,z)=>number} hCoarse full coarse field (feasibility prices the profile's ground)
 * @returns {{cl:Centerline, feasible:boolean, usedPin:boolean, pinRequested:boolean}}
 */
export function routeEdgeV2(spec, hTrunc, hCoarse) {
    // `costs` rides the spec so a Worker (a SEPARATE module instance with its own V2_COSTS) prices
    // exactly what the main thread does — without it, live knob edits would apply only to
    // synchronously-routed edges and the network would be priced two different ways.
    const { ax, az, yA, bx, bz, yB, margin, blockedDiscs, dirs, costs } = spec
    const attempt = (pin, extra) => {
        const c = corridorSearch(ax, az, yA, bx, bz, yB, hTrunc, {
            margin, blockedDiscs, costs,
            ...(pin ? { startDir: pin.startDir, goalDir: pin.goalDir } : {}),
            ...extra,
        })
        return c ? corridorCenterline(c.path,
            pin ? { keepStart: !!pin.startDir, keepEnd: !!pin.goalDir } : {}) : null
    }
    const pin = dirs && (dirs.startDir || dirs.goalDir) ? dirs : null
    const rungs = pin
        ? [[pin, {}], [null, {}], [pin, { structureCap: false }], [null, { structureCap: false }]]
        : [[null, {}], [null, { structureCap: false }]]
    let cl = null, first = null, usedPin = false
    for (const [p, extra] of rungs) {
        const c = attempt(p, extra)
        if (!c || !(c.length > 1e-6)) continue
        if (!first) first = c
        if (profileFeasible(c, yA, yB, hCoarse, { costs })) { cl = c; usedPin = !!p; break }
    }
    return {
        cl: cl ?? first ?? new Centerline([]),
        feasible: !!cl,
        usedPin: !!(cl && usedPin),
        pinRequested: !!pin,
    }
}

// ── Orchestration: one anchor pair, corridor → profile ─────────────────────────────────────────
/**
 * Route one anchor pair end to end. M0 shape: stage-3 curve generation is still the raw corridor
 * polyline — geometry smoothing lands with the first drivable checkpoint.
 * @param {object} a {x,z,y} anchor A (y = pinned node height)
 * @param {object} b {x,z,y} anchor B
 * @param {(x,z)=>number} hTrunc octave-truncated field (stage 1)
 * @param {(x,z)=>number} hFull full-resolution field (stage 2 prices real dirt)
 * @param {object} [opts] forwarded to both stages
 * @returns {{pts:{x,y,z}[], stations:object, profile:object, corridor:object}|null}
 */
export function corridorConnect(a, b, hTrunc, hFull, opts = {}) {
    const cor = corridorSearch(a.x, a.z, a.y, b.x, b.z, b.y, hTrunc, opts)
    if (!cor) return null
    const st = resampleStations(cor.path, hFull, opts.ds ?? 10)
    const prof = profileSolve(st, a.y, b.y, opts)
    if (!prof) return null
    const pts = st.s.map((_, i) => ({ x: st.x[i], y: prof.y[i], z: st.z[i] }))
    return { pts, stations: st, profile: prof, corridor: cor }
}
// ── Stage 3: curve generation ──────────────────────────────────────────────────────────────────
/**
 * Douglas–Peucker polyline simplification (iterative). The lattice A* buys slope with length at
 * ONE-CELL amplitude (stairstep zigzags — noise, not switchbacks); collapsing every deviation
 * under ~0.6 cells leaves genuine multi-cell switchbacks intact while giving Chaikin a clean
 * control polygon to smooth. Endpoints always survive.
 */
export function simplifyRDP(path, tol, opts = null) {
    if (path.length < 3) return path
    const keep = new Uint8Array(path.length)
    keep[0] = keep[path.length - 1] = 1
    // FEAT-68 heading pins: the first/last LEG is the joint tangent the corridor search was
    // constrained to. Force-keep the pinned vertex AND seed the recursion at it (a pre-marked
    // vertex that isn't also a recursion boundary would survive in the output but not constrain
    // the simplification around it).
    let a0 = 0, b0 = path.length - 1
    if (opts?.keepStart) { keep[1] = 1; a0 = 1 }
    if (opts?.keepEnd) { keep[path.length - 2] = 1; b0 = path.length - 2 }
    const stack = [[a0, b0]]
    const t2 = tol * tol
    while (stack.length) {
        const [a, b] = stack.pop()
        if (b - a < 2) continue
        const ax = path[a].x, az = path[a].z
        const vx = path[b].x - ax, vz = path[b].z - az
        const vv = vx * vx + vz * vz || 1
        let worst = -1, wd = t2
        for (let i = a + 1; i < b; i++) {
            const wx = path[i].x - ax, wz = path[i].z - az
            const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / vv))
            const dx = wx - t * vx, dz = wz - t * vz
            const d = dx * dx + dz * dz
            if (d > wd) { wd = d; worst = i }
        }
        if (worst >= 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]) }
    }
    const out = []
    for (let i = 0; i < path.length; i++) if (keep[i]) out.push(path[i])
    return out
}

/**
 * Open-curve Chaikin corner cutting (endpoints preserved). Two passes turn the 32 m lattice
 * polyline into ~8–16 m segments with per-vertex turns small enough for generous fillets.
 */
export function chaikin(path, iterations = 2) {
    let p = path
    for (let it = 0; it < iterations; it++) {
        if (p.length < 3) return p
        const out = [p[0]]
        for (let i = 0; i < p.length - 1; i++) {
            const a = p[i], b = p[i + 1]
            out.push({ x: 0.75 * a.x + 0.25 * b.x, z: 0.75 * a.z + 0.25 * b.z })
            out.push({ x: 0.25 * a.x + 0.75 * b.x, z: 0.25 * a.z + 0.75 * b.z })
        }
        out.push(p[p.length - 1])
        p = out
    }
    return p
}

/**
 * Control-polygon radius repair: iteratively remove any interior vertex whose corner cannot admit
 * a fillet of rFloor with CONSERVATIVE tangent budget (half of each adjacent leg — the fitter's
 * shared budget only ever grants more, so passing this check guarantees the fitted radius).
 * Removing a vertex hands its turn to the neighbors; the loop converges because every iteration
 * deletes a vertex. This is the hard geometric floor (BUG-12 fold class) enforced BEFORE fitting —
 * fillet clamps after the fact would break G1 or overrun legs.
 */
export function enforceMinRadius(path, rFloor = 8.5, rMax = 400, keep = null) {
    const P = path.slice()
    for (;;) {
        // FEAT-68 heading pins: vertex 1 / n−2 anchor the joint tangent, so they are EXEMPT from
        // repair — unless the fold floor itself demands action (a sub-floor kink is a fold, and
        // the fold floor outranks joint tangency). Two-tier scan: remove the worst unprotected
        // vertex first; when only a PROTECTED corner is below the floor, soften it by removing
        // its interior NEIGHBOR (merging the approach chord into the pinned vertex — measured:
        // removing the pinned vertex itself re-aimed a kept 23 m end leg into a 166° joint
        // spike). The pinned vertex goes only when no unprotected neighbor is left to give.
        let worst = -1, worstR = Infinity          // worst removable (unprotected)
        let worstP = -1, worstPR = Infinity        // worst protected (fold-floor override only)
        const isProt = (i) => keep && ((keep.keepStart && i === 1) || (keep.keepEnd && i === P.length - 2))
        for (let i = 1; i < P.length - 1; i++) {
            const a = P[i - 1], b = P[i], c = P[i + 1]
            const inL = Math.hypot(b.x - a.x, b.z - a.z), outL = Math.hypot(c.x - b.x, c.z - b.z)
            if (inL < 1e-9 || outL < 1e-9) { worst = i; worstR = 0; break }   // coincident: no direction to protect
            const dot = ((b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z)) / (inL * outL)
            const turn = Math.acos(Math.max(-1, Math.min(1, dot)))
            if (turn < 1e-4) continue
            const R = Math.min(rMax, 0.5 * Math.min(inL, outL) / Math.tan(turn / 2))
            if (isProt(i)) { if (R < worstPR) { worstPR = R; worstP = i } }
            else if (R < worstR) { worstR = R; worst = i }
        }
        if (P.length <= 2) return P
        if (worst >= 0 && worstR < rFloor) { P.splice(worst, 1); continue }
        if (worstP >= 0 && worstPR < rFloor) {
            const nb = worstP === 1 ? worstP + 1 : worstP - 1   // interior-side neighbor
            if (nb >= 1 && nb <= P.length - 2 && !isProt(nb)) P.splice(nb, 1)
            else P.splice(worstP, 1)
            continue
        }
        return P
    }
}

/**
 * Fit a polyline with LINE + ARC primitives (corner fillets): every interior corner is replaced
 * by a tangent circular arc anchored ON the incoming/outgoing segments, lines join the tangent
 * points. G1 by construction, real curvature for camber/min-radius consumers. Each primitive is
 * anchored analytically to the polyline (no chained pose drift). The v1 refit's κ box-filter can
 * upgrade this to clothoid (G2) later without changing the representation — same primitive type.
 * @param {{x,z}[]} path smoothed polyline
 * @param {number} rMin fillet radii clamp low end (kink guard, m)
 * @param {number} rMax fillet radii clamp high end (m)
 * @returns {Centerline}
 */
const LOSS_MAX = 18   // m — max planned length a single fillet may shortcut (see radius choice)
export function lineArcFit(path, rMin = 10, rMax = 400) {
    // dedupe near-coincident vertices first (exact-anchor pinning can create them)
    const P = []
    for (const q of path) {
        const last = P[P.length - 1]
        if (!last || Math.hypot(q.x - last.x, q.z - last.z) > 0.05) P.push(q)
    }
    if (P.length < 2) return new Centerline([])
    const prims = []
    // cursor: how far along the polyline the fitted chain has consumed, expressed as a point
    let cur = P[0]
    let usedT = 0   // tangent length the PREVIOUS corner consumed on the shared segment
    for (let i = 1; i < P.length - 1; i++) {
        const a = P[i - 1], b = P[i], c = P[i + 1]
        const inX = b.x - a.x, inZ = b.z - a.z, outX = c.x - b.x, outZ = c.z - b.z
        const inL = Math.hypot(inX, inZ), outL = Math.hypot(outX, outZ)
        const dInX = inX / inL, dInZ = inZ / inL, dOutX = outX / outL, dOutZ = outZ / outL
        const cross = dInX * dOutZ - dInZ * dOutX
        const dot = dInX * dOutX + dInZ * dOutZ
        const turn = Math.atan2(cross, dot)                    // signed corner angle
        if (Math.abs(turn) < 1e-4) { usedT = 0; continue }     // collinear: swallow into the line
        // Tangent offset t = R·tan(|turn|/2). Budget: the incoming segment minus what the previous
        // corner already consumed, and half the outgoing segment (reserved for the next corner).
        // Sharing the real remainder instead of a flat half doubles the radius a HAIRPIN can buy
        // when its neighbors are gentle — switchback apexes are exactly that shape.
        const tanHalf = Math.tan(Math.abs(turn) / 2)
        const tAvail = Math.min(inL - usedT - 0.05, 0.5 * outL)
        if (tAvail < 0.05) { usedT = 0; continue }   // no room left: straight through (repair pass prevents sharp cases)
        // Radius by LENGTH-LOSS BUDGET: a fillet shortcuts 2t − arc = R·(2·tan(φ/2) − φ) metres of
        // the polygon. The 2.5D plan PAID for that length (its grade budget lives on it), so a
        // corner may cut at most LOSS_MAX of it: sharp apexes get tight hairpin radii (R→rMin,
        // like a real switchback turn), gentle corners still sweep wide (their loss rate is ~0 —
        // measured: max-radius fitting ate 275 m of a 1287 m switchback descent and the profile
        // shipped 35% on the shortfall).
        const shortRate = 2 * tanHalf - Math.abs(turn)
        const lossR = shortRate > 1e-6 ? LOSS_MAX / shortRate : Infinity
        const R = Math.min(tAvail / tanHalf, rMax, Math.max(rMin, lossR))
        const t = R * tanHalf
        usedT = t
        const t1x = b.x - dInX * t, t1z = b.z - dInZ * t       // arc entry (on incoming segment)
        const thetaIn = Math.atan2(dInZ, dInX)
        // line from cursor to arc entry
        const lineLen = Math.hypot(t1x - cur.x, t1z - cur.z)
        if (lineLen > 0.005) prims.push(makePrimitive(cur.x, cur.z, Math.atan2(t1z - cur.z, t1x - cur.x), lineLen, 0))
        // the fillet arc
        const kappa = turn > 0 ? 1 / R : -1 / R
        const arcLen = R * Math.abs(turn)
        const arc = makePrimitive(t1x, t1z, thetaIn, arcLen, kappa)
        prims.push(arc)
        const end = primitivePose(arc, arcLen)
        cur = { x: end.x, z: end.z }
    }
    const last = P[P.length - 1]
    const lineLen = Math.hypot(last.x - cur.x, last.z - cur.z)
    if (lineLen > 0.005) prims.push(makePrimitive(cur.x, cur.z, Math.atan2(last.z - cur.z, last.x - cur.x), lineLen, 0))
    return new Centerline(prims)
}

/**
 * Corridor lattice path → drivable centerline: Chaikin, then line-arc fillets. Chaikin passes
 * ESCALATE (2 → 5) until every fillet clears rMin — each pass halves corner angles, roughly
 * doubling the achievable radius, so sharp lattice turns (up to 135°) converge in a pass or two.
 */
export function corridorCenterline(path, opts = {}) {
    // 2026-08-19 owner ruling: the grade-guarded smoothing is GONE. It defended the XZ search's
    // one-cell dither as if it were switchbacks, and dither smoothed into "a little wiggle", never
    // a cut across the face — a rule protecting a symptom. Real switchbacks come from the search
    // itself (see the ticket's 2.5D corridor discussion); smoothing goes back to being plain.
    const rMin = opts.rMin ?? 12, rMax = opts.rMax ?? 400
    // FEAT-68 heading pins: when the corridor search ran with a start/goal direction cone, stage 3
    // must not re-aim the constrained first/last step — RDP force-keeps it and the radius repair
    // exempts it (fold floor still wins). Chaikin and the fillet fitter preserve end tangents by
    // construction (their new points lie ON the end legs), so no guard is needed there.
    const keep = (opts.keepStart || opts.keepEnd)
        ? { keepStart: !!opts.keepStart, keepEnd: !!opts.keepEnd } : null
    // Escalate smoothing freedom until the fit clears rMin: more Chaikin passes first, then a
    // wider RDP tolerance (the corridor is a ~100 m swath — the centerline owns that freedom).
    // Keep the best fit seen so the escalation can never make things worse.
    let best = null, bestR = -Infinity
    for (const tol of [opts.rdpTol ?? 32, 44]) {
        const base = simplifyRDP(path, tol, keep)
        // Start at ZERO Chaikin passes: the 2.5D plan's polygon is already the road's shape
        // (traverses + reversals), and corner-cutting near-180° apexes destroys the length the
        // deck's grade budget paid for (measured 1563 → 1051 m). The fillet fitter rounds sparse
        // corners fine on its own; Chaikin remains as the radius-rescue escalation only.
        for (let passes = opts.chaikin ?? 0; passes <= 5; passes++) {
            const cl = lineArcFit(enforceMinRadius(chaikin(base, passes), 8.5, 400, keep), rMin, rMax)
            const r = cl.minRadius()
            if (r > bestR) { best = cl; bestR = r }
            if (r >= rMin) return cl
        }
    }
    return best
}
