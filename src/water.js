/**
 * src/water.js — Deterministic water-placement foundation (FEAT-22) + pond (FEAT-17)
 *                and stream (FEAT-18) generation.
 *
 * STATUS: generation core only. NOT yet wired into main.js, terrain.js WORKER_SOURCE,
 * the road router, or physics. See .planning/todos/pending/feat-water-*.md.
 *
 * ── The enabling fact (why this is tractable) ────────────────────────────────
 * Terrain height is a PURE analytic function of (seed, x, z, params) with no chunk
 * lookup (terrain.js analyticHeight / rawHeightWorld). So water detection is NOT
 * limited to loaded chunks: any algorithm over a BOUNDED region is computable
 * anywhere and is window-invariant by construction — the same discipline the road
 * router uses when it valley-seeks (road.js _anchorSites).
 *
 * This module reads the terrain ONLY through an injected `heightFn(wx, wz)` — the
 * raw, amplitude-applied, carve-free height sampler:
 *   - in-game:   TerrainSystem.rawHeightWorld  (terrain.js)
 *   - headless:  makeTerrainHeadless(...).rawHeightWorld  (test/lib/terrain-headless.mjs)
 * Water detection runs on RAW terrain (not road-carved): ponds/streams are native
 * terrain features and must not shift when a road is graded nearby.
 *
 * ── Window-invariance discipline (NON-NEGOTIABLE) ────────────────────────────
 * Every basin, saddle, and flow decision is a pure function of a BOUNDED
 * neighborhood keyed to a macro-cell — NEVER an unbounded flood over the loaded
 * window. Concretely:
 *   - Critical points (minima, saddles) are found on a GLOBAL, origin-aligned
 *     detection lattice (WATER_GRID spacing). A lattice point's classification is
 *     a pure function of its 3×3 height stencil — independent of any window.
 *   - A critical point is OWNED by the macro-cell (WATER_CELL) that contains it.
 *     A per-cell scan therefore partitions the global lattice exactly once, so the
 *     union of per-cell results == a global scan (no double counting, no gaps).
 *   - A pond is a pure function of its basin floor; a stream is a pure function of
 *     its source saddle. Region queries enumerate owning cells (expanded by the
 *     feature's spatial reach), compute each source once, cache it, and filter by
 *     the query bbox. Identical from any stream center or draw distance.
 *
 * WORKER-SAFE: only imports src/seed.js (pure math). No THREE, no DOM. Mesh/shader
 * construction and the CARVE SYNC mirror live in the (later) wiring layer, not here.
 */

import { seedFor, mulberry32 } from './seed.js'

// ── Lattice / macro-cell geometry ────────────────────────────────────────────
// WATER_GRID: spacing of the global critical-point detection lattice. 32 m is
//   sub-coarse-feature (coarse wavelength ~2 km) and comfortably above the fine
//   layer (0.5 m amplitude @ 20 m) so the fine ripple never fabricates a basin.
// WATER_CELL: macro-cell that OWNS features. Must be an integer multiple of
//   WATER_GRID so each lattice point falls in exactly one cell (16 lattice pts/axis).
export const WATER_GRID = 32
export const WATER_CELL = 512
const LATTICE_PER_CELL = WATER_CELL / WATER_GRID   // 16 — integer by construction

// ── Default knobs (USER-OWNED set; override via params.water) ─────────────────
// Kept here as the single source of truth; data/ranger.js documents the same set.
export const WATER_DEFAULTS = {
    // — Basin / pond (FEAT-17) —
    minBasinDepth:    12,    // m — rim-above-floor closure depth to qualify a basin as a pond.
                             //     THIS IS THE RARITY DIAL: higher = fewer, deeper ponds (no dice roll).
    pondMaxRadius:    50,    // m — footprint cap (~100 m diameter). Ponds, not lakes.
    pondSearchRadius: 64,    // m — rim ray-cast reach (≥ pondMaxRadius). Basin is "open" beyond this.
    pondRimSamples:   24,    // rays cast outward to find the rim (lowest ring peak = spill proxy).
    pondFreeboard:    1.5,   // m — Plan-B fill: waterLevel = rimHeight − freeboard (never overflows).
    pondSkirtWidth:   10,    // m — shoreline buffer excluded from road gen + handed to scatter (FEAT-06).
    pondMinFloorGap:  WATER_GRID,  // m — merge minima closer than this (keep the lowest) to dedup ripple.

    // — Saddle / stream (FEAT-18) —
    saddleMinDrop:    22,    // m — min total descent of a traced stream to keep it (rarity/prominence dial).
    streamMinLength:  160,   // m — drop shorter traces (trickles).
    streamKeepFraction: 0.55,// FEAT-24 spawn-rate dial: deterministic per-saddle thinning (seed-hashed,
                             // window-invariant). Unlike saddleMinDrop, does NOT bias against the
                             // low-drop meadow streams the meander work exists for.
    streamStep:       8,     // m — gradient-descent step length.
    streamMaxLength:  1400,  // m — hard cap on a trace (bounds the stream query margin).
    streamMaxSteps:   4000,  // pure safety cap on descent iterations (length is the real bound;
                             // adaptive step-halving adds a few iters per settle).
    streamWidth:      3,     // m — channel bed HALF-width (flat bottom) baseline; per-point width
                             //     scales this by slope (widthFlatScale/widthSteepScale below).
    streamDepth:      2.5,   // m — bed cut below surrounding terrain.
    streamBankWidth:  5,     // m — bank ramp width from bed lip up to grade (each side).
    streamWaterDepth: 0.6,   // m — water surface height above the bed (for the render ribbon).

    // — Meander / width character (FEAT-24: Kennedy-Meadows meadow streams) —
    // On low-slope ground the trace's heading deviates from the down-valley drift by a
    // limit-cycle oscillation (a discrete curvature-instability model of real meandering)
    // whose PHASE is driven by the fine terrain gradient — deterministic, window-invariant,
    // and different in every meadow. See traceFlow for the full mechanism.
    meanderSlopeRef:  0.10,  // slope below which the meander takes hold (meadow threshold).
    meanderStrength:  1.2,   // 0..2 — master windiness dial (scales the deviation amplitude).
    meanderWavelength: 60,   // m — arc wavelength of the meander oscillation (bend spacing).
    meanderAmplitude: 1.35,  // rad — limit-cycle deviation amplitude (≈77°) at full meadow factor.
    meanderForce:     0.001, // rad/m² — fine-terrain phase coupling: nudges the oscillator so each
                             //     meadow's bend phasing is set by the local terrain (deterministic,
                             //     window-invariant, no two meadows meander alike). Keep SMALL — the
                             //     limit cycle owns the amplitude, terrain only steers the phase.
    meanderFineEps:   3,     // m — fine-gradient sample offset (must be << gradEps to see the ripple).
    climbTolerance:   0.6,   // m — max micro-bump a step may climb (water flows OVER hummocks; the
                             //     running-min bed profile incises them). ≈ fine ripple amplitude.
    stallSteps:       40,    // accepted steps without a new low ⇒ settled (stop). Generous — a
                             //     0.05% meadow grade legitimately sets no 1 mm low for many steps.
    // Per-point channel half-width from local coarse slope: wide+lazy on flats, narrow chute steep.
    widthFlatScale:   2.6,   // × streamWidth at zero slope.
    widthSteepScale:  0.65,  // × streamWidth at/above widthSlopeRef slope.
    widthSlopeRef:    0.10,  // slope at which width reaches the steep end.
    widthSmooth:      0.25,  // EMA blend per point along the trace (kills width flicker).
    maxTurnPerMeter:  0.18,  // rad/m — momentum: the trace can't turn tighter than ~5.6 m radius.
                             //     Prevents fine-gradient scribble loops on flats AND rounds the
                             //     meanders into natural bends (water can't turn on a dime).

    // — Sampling —
    gradEps:          WATER_GRID / 2,  // m — central-difference offset for ∇height (16 m: smooth, coarse-scale).
    descendSteps:     40,    // refine steps for a minimum (bounded).
}

// ── Small pure helpers ────────────────────────────────────────────────────────
const cellOf = (w) => Math.floor(w / WATER_CELL)
const cellKey = (cx, cz) => `${cx},${cz}`
const q = (v) => Math.round(v * 1e3) / 1e3   // 1 mm quantize for stable dedup keys

// Segment A(a0→a1) × segment B(b0→b1) intersection. Returns { x, z, tA, tB } (t =
// param along each segment) or null. Used by streamRoadCrossings for bridge sites.
function segIntersect(a0x, a0z, a1x, a1z, b0x, b0z, b1x, b1z) {
    const rX = a1x - a0x, rZ = a1z - a0z
    const sX = b1x - b0x, sZ = b1z - b0z
    const denom = rX * sZ - rZ * sX
    if (Math.abs(denom) < 1e-12) return null            // parallel / degenerate
    const qpX = b0x - a0x, qpZ = b0z - a0z
    const tA = (qpX * sZ - qpZ * sX) / denom
    const tB = (qpX * rZ - qpZ * rX) / denom
    if (tA < 0 || tA > 1 || tB < 0 || tB > 1) return null
    return { x: a0x + rX * tA, z: a0z + rZ * tA, tA, tB }
}

/**
 * WaterSystem — deterministic ponds + streams over an injected raw-height sampler.
 *
 * @param {number}   seed     — uint32 worldSeed.
 * @param {object}   params   — RANGER_PARAMS (reads params.water overrides if present).
 * @param {function} heightFn — (wx, wz) => raw amplitude-applied terrain height (carve-free).
 */
export class WaterSystem {
    constructor(seed, params, heightFn) {
        if (typeof heightFn !== 'function') {
            throw new Error('WaterSystem requires a heightFn(wx, wz) raw-height sampler')
        }
        this._seed = seed >>> 0
        this._params = params
        this._h = heightFn
        this.k = { ...WATER_DEFAULTS, ...(params && params.water ? params.water : {}) }

        // Caches (all keyed to deterministic sources → safe to persist for the world's life).
        this._cellCache = new Map()   // "cx,cz" -> { minima:[], saddles:[] } (raw critical points)
        this._pondCache = new Map()   // floorKey -> pond | null
        this._streamCache = new Map() // saddleKey -> stream | null
        this._refineCache = new Map() // "qx,qz" -> refined basin floor {x,z,y} (memoizes the descent)
    }

    // ── Terrain reads ─────────────────────────────────────────────────────────
    _height(x, z) { return this._h(x, z) }

    // Central-difference gradient of height (points UPHILL). Default eps = coarse-scale so
    // the fine ripple doesn't dominate the descent direction; FEAT-24 passes a small eps to
    // deliberately SENSE the ripple when meandering across low-slope ground.
    _grad(x, z, eps) {
        const e = eps ?? this.k.gradEps
        const hL = this._h(x - e, z), hR = this._h(x + e, z)
        const hD = this._h(x, z - e), hU = this._h(x, z + e)
        return { gx: (hR - hL) / (2 * e), gz: (hU - hD) / (2 * e) }
    }

    // ── Critical-point detection (FEAT-22 §1, §3) ─────────────────────────────
    // Per-cell scan of the global lattice. A lattice point (i,j) sits at world
    // (i*GRID, j*GRID) and is OWNED by the cell containing it. Iterating the
    // LATTICE_PER_CELL×LATTICE_PER_CELL block whose points fall in (cx,cz) visits
    // every global lattice point exactly once across all cells → window-invariant.
    _cellData(cx, cz) {
        const key = cellKey(cx, cz)
        const hit = this._cellCache.get(key)
        if (hit) return hit

        const G = WATER_GRID
        const i0 = cx * LATTICE_PER_CELL, j0 = cz * LATTICE_PER_CELL
        const minima = [], saddles = []

        // One extra ring is sampled for the 3×3 stencil but only points whose OWN
        // index is inside this cell are emitted (ownership = exact-once partition).
        for (let dj = 0; dj < LATTICE_PER_CELL; dj++) {
            for (let di = 0; di < LATTICE_PER_CELL; di++) {
                const i = i0 + di, j = j0 + dj
                const x = i * G, z = j * G
                const c  = this._h(x, z)
                const hL = this._h(x - G, z), hR = this._h(x + G, z)
                const hD = this._h(x, z - G), hU = this._h(x, z + G)

                // Local minimum on the 4-neighborhood (strict). Diagonal check adds
                // little at coarse scale and costs 4 samples; 4-neighbor is enough.
                if (c < hL && c < hR && c < hD && c < hU) {
                    minima.push({ x, z, y: c })
                    continue   // a strict min cannot also be a saddle
                }

                // Saddle: strict local MAX along one lattice axis AND strict local
                // MIN along the perpendicular axis (discrete mixed-sign / Hessian
                // det<0). Localizes to a single lattice point (unlike a raw det<0
                // region test), so it is window-invariant and de-duplicated for free.
                const maxX_minZ = (c > hL && c > hR && c < hD && c < hU)
                const minX_maxZ = (c < hL && c < hR && c > hD && c > hU)
                if (maxX_minZ || minX_maxZ) {
                    saddles.push({ x, z, y: c })
                }
            }
        }

        const data = { minima, saddles }
        this._cellCache.set(key, data)
        return data
    }

    // Greedy raw-height descent operator (8-direction, fixed 16 m step, bounded).
    // THE canonical "walk to the basin floor" step used by BOTH pond detection
    // (_refineMin) and the stream trace tail — so a stream mouth lands on the exact
    // same minimum a pond is keyed to (streams meet ponds). `onPoint`, if given, is
    // called with each descending point (the stream trace collects the path).
    _greedyDescend(sx, sz, onPoint) {
        let x = sx, z = sz, h = this._h(x, z)
        const step = WATER_GRID / 2
        for (let s = 0; s < this.k.descendSteps; s++) {
            let bx = x, bz = z, bh = h
            for (let a = 0; a < 8; a++) {
                const ang = a / 8 * Math.PI * 2
                const nx = x + Math.cos(ang) * step, nz = z + Math.sin(ang) * step
                const nh = this._h(nx, nz)
                if (nh < bh) { bh = nh; bx = nx; bz = nz }
            }
            if (bh >= h) break
            x = bx; z = bz; h = bh
            if (onPoint) onPoint(x, z, h)
        }
        return { x, z, y: h }
    }

    // Refine a coarse lattice minimum onto the true local floor. Pure fn of the start.
    // PERF: memoized by quantized start — pondsInBBox re-iterates the SAME cached cell
    // minima on every call (the router queries pond discs per edge → thousands of calls),
    // and the descent ran on every _pondForBasin BEFORE its floor-key cache check. Keyed
    // on a deterministic source over the world's fixed height field → safe for the world's
    // life, like the other caches. Callers must not mutate the returned floor object.
    _refineMin(sx, sz) {
        const key = `${q(sx)},${q(sz)}`
        const hit = this._refineCache.get(key)
        if (hit) return hit
        const floor = this._greedyDescend(sx, sz)
        this._refineCache.set(key, floor)
        return floor
    }

    // ── Public: raw critical points over a bbox ───────────────────────────────
    _cellsForBBox(minX, minZ, maxX, maxZ, marginCells) {
        const c0x = cellOf(minX) - marginCells, c1x = cellOf(maxX) + marginCells
        const c0z = cellOf(minZ) - marginCells, c1z = cellOf(maxZ) + marginCells
        const cells = []
        for (let cz = c0z; cz <= c1z; cz++)
            for (let cx = c0x; cx <= c1x; cx++)
                cells.push([cx, cz])
        return cells
    }

    basinsInBBox(minX, minZ, maxX, maxZ) {
        const out = []
        for (const [cx, cz] of this._cellsForBBox(minX, minZ, maxX, maxZ, 1)) {
            for (const m of this._cellData(cx, cz).minima) {
                if (m.x >= minX && m.x <= maxX && m.z >= minZ && m.z <= maxZ) out.push(m)
            }
        }
        return out
    }

    saddlesInBBox(minX, minZ, maxX, maxZ) {
        const out = []
        for (const [cx, cz] of this._cellsForBBox(minX, minZ, maxX, maxZ, 1)) {
            for (const s of this._cellData(cx, cz).saddles) {
                if (s.x >= minX && s.x <= maxX && s.z >= minZ && s.z <= maxZ) out.push(s)
            }
        }
        return out
    }

    // ── FEAT-17: ponds (Plan-B rim fill) ──────────────────────────────────────
    // A basin qualifies as a pond iff a bounded ring cast finds a rim strictly
    // above the floor by ≥ minBasinDepth in EVERY direction within pondSearchRadius
    // (a closed basin). waterLevel is set a fixed freeboard below the LOWEST rim
    // peak (the spill proxy) so the pond never overflows — Plan B, trivially
    // window-invariant, no true watershed flood.
    _pondForBasin(rawMin) {
        // Refine to the true floor, then key by the floor so any lattice seed that
        // descends to the same basin produces the SAME pond (dedup).
        const floor = this._refineMin(rawMin.x, rawMin.z)
        const fkey = `${q(floor.x)},${q(floor.z)}`
        const cached = this._pondCache.get(fkey)
        if (cached !== undefined) return cached

        const { pondRimSamples, pondSearchRadius, minBasinDepth, pondMaxRadius, pondFreeboard } = this.k
        const rayStep = WATER_GRID / 2
        let rimHeight = Infinity   // lowest ring peak = spill proxy
        let closed = true

        for (let r = 0; r < pondRimSamples; r++) {
            const ang = r / pondRimSamples * Math.PI * 2
            const dx = Math.cos(ang), dz = Math.sin(ang)
            // Walk outward; the ray's PEAK height before it would escape is its rim.
            let peak = -Infinity
            let rose = false
            for (let d = rayStep; d <= pondSearchRadius; d += rayStep) {
                const hh = this._h(floor.x + dx * d, floor.z + dz * d)
                if (hh > peak) peak = hh
                if (hh - floor.y >= minBasinDepth) { rose = true; break }
            }
            if (!rose) { closed = false; break }   // basin open in this direction → not a pond
            if (peak < rimHeight) rimHeight = peak
        }

        if (!closed || !isFinite(rimHeight)) {
            this._pondCache.set(fkey, null)
            return null
        }

        const waterLevel = rimHeight - pondFreeboard
        // Effective radius: the smaller of the cap and the contour reach implied by
        // the rim distance. Cap at pondMaxRadius (ponds, not lakes).
        const radius = Math.min(pondMaxRadius, pondSearchRadius)
        const pond = {
            kind: 'pond',
            floorX: floor.x, floorZ: floor.z, floorY: floor.y,
            waterLevel,
            radius,
            rimHeight,
            skirt: this.k.pondSkirtWidth,
            key: fkey,
        }
        this._pondCache.set(fkey, pond)
        return pond
    }

    // Ponds whose footprint (radius+skirt) intersects the bbox. Ponds are local
    // (≤ pondSearchRadius) so a 1-cell margin covers any pond overlapping the bbox.
    pondsInBBox(minX, minZ, maxX, maxZ) {
        const reach = this.k.pondMaxRadius + this.k.pondSkirtWidth
        const marginCells = Math.ceil(reach / WATER_CELL) + 1
        const seen = new Set()
        const out = []
        for (const [cx, cz] of this._cellsForBBox(minX, minZ, maxX, maxZ, marginCells)) {
            for (const m of this._cellData(cx, cz).minima) {
                const pond = this._pondForBasin(m)
                if (!pond || seen.has(pond.key)) continue
                seen.add(pond.key)
                const rr = pond.radius + pond.skirt
                if (pond.floorX + rr < minX || pond.floorX - rr > maxX) continue
                if (pond.floorZ + rr < minZ || pond.floorZ - rr > maxZ) continue
                out.push(pond)
            }
        }
        return out
    }

    // ── FEAT-22 §2: flow trace (shared primitive) ─────────────────────────────
    // Gradient descent −∇height from ANY source point until a local minimum (a
    // basin), the length cap, or flat ground. ALWAYS terminates at a minimum —
    // that is a property of gradient descent, which is exactly why "streams end at
    // ponds" needs no confluence logic. Pure function of the source point, so the
    // whole polyline is window-invariant whenever the source is.
    //
    // Returns { points:[{x,z,y,s}] source→mouth (DESCENDING y, s=cumulative arc),
    //           length, drop, end:{x,z,y}, stop:'min'|'flat'|'cap' }. The FEAT-22
    // primitive the stream feature (FEAT-18) gates on; callers wanting the raw flow
    // line use it directly (e.g. debug viz, future erosion).
    //
    // ADAPTIVE STEP: a fixed −∇ step overshoots the basin floor (the next step turns
    // uphill one full stride before the true minimum), leaving the mouth on a slope.
    // When a step would climb, we HALVE it and retry — converging onto the actual
    // local minimum (to STEP_MIN) so the trace genuinely SETTLES at the basin (the
    // "streams end at ponds for free" property, discretized). Still pure in (sx,sz).
    //
    // FEAT-24 MEANDER: on low COARSE slope the descent direction blends toward the
    // FINE-scale gradient (meanderFineEps senses the ripple layer the 16 m eps smooths
    // away), so meadow traces thread between hummocks — windiness emerges from the
    // terrain field itself.
    //
    // FEAT-24 POCKET FILL: real meadow streams don't stop at every 0.5 m ripple pocket —
    // water fills the pocket and overflows toward the meadow's outlet. Discretized:
    //   DRIFT    — a persistent down-valley direction: the coarse gradient, falling back
    //              to a valley-scale gradient (4 × gradEps) when the coarse one vanishes
    //              mid-meadow. Always defined until the true basin floor.
    //   MEANDER  — the heading deviates from the drift by φ, a damped harmonic
    //              oscillator in arc length (wavelength meanderWavelength) FORCED by the
    //              fine terrain gradient. Real meandering is a curvature oscillation
    //              around the drainage line — raw noise-following random-walks into
    //              scribble knots, an oscillator alternates like the real thing. The
    //              terrain forcing sets each bend's phase/amplitude, so the shape is
    //              still a pure, window-invariant function of (source, terrain).
    //   ACCEPT   — meadow mode (high meadow factor) accepts every step: the heading
    //              always descends the smoothed field by construction. On slopes, a step
    //              may CLIMB the raw field by ≤ climbTolerance while the trace stays
    //              within 2 × climbTolerance of its lowest point so far (water flows
    //              over a hummock but never walks uphill unbounded).
    //   SETTLE   — in a real basin every direction climbs beyond the bound →
    //              halve → the trace settles exactly like before ("streams end at
    //              ponds"); an orbit guard settles shallow closed flats.
    // The bed profile is made monotone downstream (_streamForSaddle) so the channel
    // incises the crested hummocks and water never runs uphill.
    traceFlow(sx, sz) {
        const { streamStep, streamMaxSteps, streamMaxLength,
                meanderSlopeRef, meanderStrength, meanderWavelength, meanderAmplitude,
                meanderForce, meanderFineEps,
                climbTolerance, stallSteps, maxTurnPerMeter, gradEps } = this.k
        const STEP_MIN = 0.5
        const VALLEY_EPS = gradEps * 4       // m — outlet-seeking gradient scale for broad flats
        const OMEGA = 2 * Math.PI / meanderWavelength   // rad/m — oscillator frequency
        const PHI_MAX = 1.5                  // rad (~86°) — hard deviation cap (safety)
        const y0 = this._h(sx, sz)
        const pts = [{ x: sx, z: sz, y: y0, s: 0 }]
        let x = sx, z = sz, y = y0, length = 0, step = streamStep, stop = 'cap'
        let minY = y0, stall = 0, lowIdx = 0  // lowIdx: last point that set a new low (tail trim)
        let pdx = 0, pdz = 0                  // previous flow direction (0,0 = no momentum yet)
        let phi = 0, dphi = 0                 // meander oscillator state (deviation angle, rad)

        let fEma = 0                          // smoothed meadow factor (the 16 m gradient is
                                              // ~half ripple noise — raw f flickers 0→0.7→0
                                              // step to step and would reset the meander)

        for (let s = 0; s < streamMaxSteps; s++) {
            if (length >= streamMaxLength) { stop = 'cap'; break }
            // DRIFT: the 16 m gradient on slopes; near-flat, the VALLEY-scale gradient —
            // stable down-valley grade, immune to the ripple that dominates 16 m sampling
            // on meadow floors. The meadow factor is judged on the valley slope and
            // EMA-smoothed so the oscillator sees a steady regime, not per-step flicker.
            let { gx, gz } = this._grad(x, z)
            let gm = Math.hypot(gx, gz)
            let fRaw = 0
            if (gm < 0.15) {                               // possibly meadow — check smooth scale
                const vg = this._grad(x, z, VALLEY_EPS)
                const vgm = Math.hypot(vg.gx, vg.gz)
                if (vgm > 1e-4) {
                    gx = vg.gx; gz = vg.gz; gm = vgm       // valley drift
                    fRaw = Math.max(0, Math.min(1, 1 - vgm / meanderSlopeRef))
                }
            }
            if (gm < 1e-4) { stop = 'flat'; break }       // no drainage signal at ANY scale
            fEma += 0.25 * (fRaw - fEma)
            const f = fEma
            const ddx = -gx / gm, ddz = -gz / gm          // drift unit (down-valley)
            let dx = ddx, dz = ddz
            if (f > 0.02) {
                // Van der Pol limit cycle in the deviation angle: self-oscillates at
                // amplitude A regardless of forcing (a noise-pumped linear oscillator is
                // either mush or railed — the limit cycle makes amplitude a real dial).
                // The weak fine-terrain force only sets/breaks the PHASE.
                const fg = this._grad(x, z, meanderFineEps)
                const fgm = Math.hypot(fg.gx, fg.gz)
                const force = fgm > 1e-9
                    ? meanderForce * (ddx * (-fg.gz / fgm) - ddz * (-fg.gx / fgm))
                    : 0
                const A = meanderAmplitude
                const MU = 0.8                             // limit-cycle stiffness (fixed)
                // Seed the cycle if starting from rest (dphi would stay 0 forever at e=0).
                if (phi === 0 && dphi === 0) dphi = force >= 0 ? OMEGA * A * 0.1 : -OMEGA * A * 0.1
                // Substepped semi-implicit Euler: at streamStep=8 m a full-stride update
                // aliases the cycle (≈10 samples/wavelength → chaos). 2 m substeps are
                // pure arithmetic (the terrain force is held for the stride) — cheap.
                const nSub = Math.max(1, Math.ceil(step / 2))
                const h = step / nSub
                for (let k = 0; k < nSub; k++) {
                    const e = (phi * phi + (dphi / OMEGA) * (dphi / OMEGA)) / (A * A)  // energy/A²
                    dphi += (-OMEGA * OMEGA * phi + MU * OMEGA * (1 - e) * dphi + force) * h
                    phi += dphi * h
                }
                if (phi > PHI_MAX) { phi = PHI_MAX; if (dphi > 0) dphi = 0 }
                else if (phi < -PHI_MAX) { phi = -PHI_MAX; if (dphi < 0) dphi = 0 }
                // Heading = drift rotated by the (strength- and meadow-scaled) deviation.
                // sqrt(f): moderate slopes attenuate the swing gently; f alone crushes it.
                const a = phi * Math.sqrt(f) * Math.min(2, meanderStrength)
                const ca = Math.cos(a), sa = Math.sin(a)
                dx = ddx * ca - ddz * sa
                dz = ddx * sa + ddz * ca
            }
            // (No hard oscillator reset on steep ground: fEma → 0 silences the output; a
            // hard reset on transient steep samples was chopping the cycle to nothing.)
            // FEAT-24 momentum: clamp the turn rate against the previous flow direction.
            // Water can't reverse on a dime — this kills fine-gradient scribble loops on
            // flats and rounds every meander to a ≥ 1/maxTurnPerMeter bend radius.
            // Allowance uses the FULL stride (not the halved step) so rejection retries
            // keep their turning freedom — a shrinking clamp deadlocks the trace facing
            // uphill at a meadow entry.
            // NEAR-REVERSALS pass unclamped: the drift field flips ~180° when the trace
            // overshoots a basin floor — clamping that flip makes the trace ORBIT the
            // attractor (mouth curls). Unclamped, the flip triggers step-halving and the
            // trace settles on the floor exactly like the pre-clamp behaviour.
            if (pdx !== 0 || pdz !== 0) {
                const maxA = maxTurnPerMeter * streamStep
                const ang = Math.atan2(pdx * dz - pdz * dx, pdx * dx + pdz * dz)
                if (Math.abs(ang) > maxA && Math.abs(ang) < 2.4) {
                    const a = Math.sign(ang) * maxA
                    const ca = Math.cos(a), sa = Math.sin(a)
                    dx = pdx * ca - pdz * sa
                    dz = pdx * sa + pdz * ca
                }
            }
            const nx = x + dx * step
            const nz = z + dz * step
            const ny = this._h(nx, nz)
            // Accept:
            //  MEADOW MODE (f > 0.5): unconditional. The drift is the smoothed valley
            //  gradient and the heading never deviates past ~69°, so every step descends
            //  the smoothed field BY CONSTRUCTION — raw-descent gating cannot cross a
            //  flat whose ripple exceeds its grade, and the monotone bed + streamDepth
            //  carve incise the ripple honestly. Mode exits (fEma decays) on real slopes.
            //  RAW MODE: descend, or a bounded climb near the running low (hummocks);
            //  the climb allowance is revoked once the trace starts stalling.
            const meadow = f > 0.5
            const ok = meadow || ny < y ||
                       (stall < stallSteps / 2 &&
                        ny - y <= climbTolerance && ny <= minY + 2 * climbTolerance)
            if (!ok) {
                if (step > STEP_MIN) { step *= 0.5; continue }
                stop = 'min'; break                        // settled to STEP_MIN of the local minimum
            }
            length += step
            pts.push({ x: nx, z: nz, y: ny, s: length })
            x = nx; z = nz; y = ny; pdx = dx; pdz = dz
            // Stall guard (raw mode): many accepted steps with no meaningful new low =
            // wandering a closed flat. In meadow mode smoothed descent is structural, so
            // every point counts as progress (and is never trimmed as mouth-curl)…
            if (ny < minY - 1e-3) { minY = ny; stall = 0; lowIdx = pts.length - 1 }
            else if (meadow) { stall = 0; lowIdx = pts.length - 1 }
            else if (++stall >= stallSteps) { stop = 'min'; break }
            // …EXCEPT when the drift attractor is a closed shallow basin: h-smooth keeps
            // "descending" around a ring and the trace ORBITS to the length cap. Orbit
            // check: over the last ~24 steps the net displacement of a meander is well
            // over a third of its arc; an orbit's is not. Trim the orbit window and settle.
            if (meadow && pts.length > 25) {
                const tail = pts[pts.length - 1], back = pts[pts.length - 25]
                const chord = Math.hypot(tail.x - back.x, tail.z - back.z)
                if (chord < (tail.s - back.s) * 0.35) {
                    pts.length = Math.max(1, pts.length - 24)
                    const last = pts[pts.length - 1]
                    x = last.x; z = last.z; y = last.y; length = last.s
                    lowIdx = Math.min(lowIdx, pts.length - 1)
                    stop = 'min'; break
                }
            }
            // Meadow bends are ~60 m — sample them at half stride or they alias/smooth away.
            step = Math.min(meadow ? streamStep * 0.5 : streamStep, step * 1.5)
        }
        // FEAT-24: drop the trailing non-descending arc (the settle phase can wander a few
        // steps inside the climb band before the guards fire — without this trim it reads
        // as a curl at the stream mouth). The greedy tail below re-finds the true floor.
        if (stop === 'min' && lowIdx < pts.length - 1) {
            pts.length = lowIdx + 1
            const last = pts[lowIdx]
            x = last.x; z = last.z; y = last.y; length = last.s
        }

        // TAIL: the smoothed −∇ field flattens to ~0 on a broad valley floor and stalls
        // short of the raw basin minimum. Finish with the SAME greedy raw descent pond
        // detection uses so the mouth lands EXACTLY on the basin floor a pond is keyed to
        // (streams terminate at ponds — the coupling the whole system is built on).
        if (length < streamMaxLength) {
            const floor = this._greedyDescend(x, z, (px, pz, ph) => {
                length += Math.hypot(px - x, pz - z)
                pts.push({ x: px, z: pz, y: ph, s: length })
                x = px; z = pz; y = ph
            })
            x = floor.x; z = floor.z; y = floor.y
            if (stop === 'cap') stop = 'min'
        }
        return { points: pts, length, drop: y0 - y, end: { x, z, y }, stop }
    }

    // ── FEAT-18: streams (saddle-sourced flow trace + channel metadata) ───────
    // A stream is a flow trace from a saddle, kept only if it descends ≥
    // saddleMinDrop over ≥ streamMinLength (prominence = the stream rarity dial).
    _streamForSaddle(saddle) {
        const skey = `${q(saddle.x)},${q(saddle.z)}`
        const cached = this._streamCache.get(skey)
        if (cached !== undefined) return cached

        const { saddleMinDrop, streamMinLength, streamKeepFraction } = this.k
        // FEAT-24 spawn-rate dial: deterministic per-saddle thinning. Saddle coords are
        // lattice-aligned ints → a stable hash; rolled BEFORE tracing (cheap reject).
        if (streamKeepFraction < 1) {
            const roll = mulberry32(seedFor(this._seed, 'streamKeep', saddle.x, saddle.z))()
            if (roll >= streamKeepFraction) {
                this._streamCache.set(skey, null)
                return null
            }
        }
        const flow = this.traceFlow(saddle.x, saddle.z)
        if (flow.drop < saddleMinDrop || flow.length < streamMinLength) {
            this._streamCache.set(skey, null)
            return null
        }

        // FEAT-24: light XZ smoothing (two 3-point passes, endpoints pinned) — rounds
        // step-quantization jaggies and settle-phase kinks into watercourse curves.
        // Points are owned by this record (traceFlow allocates fresh objects), so
        // in-place mutation is safe. Arc s is left as-built (a few cm of drift from
        // smoothing is irrelevant to its consumers).
        const pts = flow.points
        for (let pass = 0; pass < 2; pass++) {
            let px = pts[0].x, pz = pts[0].z
            for (let i = 1; i < pts.length - 1; i++) {
                const cx = pts[i].x, cz = pts[i].z
                pts[i].x = (px + 2 * cx + pts[i + 1].x) / 4
                pts[i].z = (pz + 2 * cz + pts[i + 1].z) / 4
                px = cx; pz = cz
            }
        }
        // The tolerant trace may crest micro-hummocks — make the BED profile monotone
        // non-increasing (running min) so water never runs uphill; the channel INCISES
        // hummocks (streamDepth ≫ ripple amplitude).
        for (let i = 1; i < pts.length; i++) {
            if (pts[i].y > pts[i - 1].y) pts[i].y = pts[i - 1].y
        }

        // FEAT-24: per-point channel HALF-width from the local coarse slope — wide, lazy
        // meadow channels; narrow chutes on steep ground. EMA along the trace kills flicker.
        const { streamWidth, widthFlatScale, widthSteepScale, widthSlopeRef, widthSmooth } = this.k
        let w = null, maxWidth = 0
        for (const p of pts) {
            const g = this._grad(p.x, p.z)
            const t = Math.min(1, Math.hypot(g.gx, g.gz) / widthSlopeRef)
            const target = streamWidth * (widthFlatScale + (widthSteepScale - widthFlatScale) * t)
            w = (w === null) ? target : w + (target - w) * widthSmooth
            p.w = w
            if (w > maxWidth) maxWidth = w
        }

        const stream = {
            kind: 'stream',
            points: pts,           // [{x,z,y,s,w}] centerline, source→mouth, monotone DESCENDING y
            length: flow.length,
            drop: flow.drop,
            width: this.k.streamWidth,   // baseline half-width (legacy consumers / fallback)
            maxWidth,                    // FEAT-24: widest per-point half-width (pad/bbox bound)
            depth: this.k.streamDepth,
            bankWidth: this.k.streamBankWidth,
            waterDepth: this.k.streamWaterDepth,
            key: skey,
        }
        this._streamCache.set(skey, stream)
        return stream
    }

    // Streams whose centerline intersects the bbox. A stream can run up to
    // streamMaxLength from its source saddle, so the saddle-cell margin must cover
    // that reach (otherwise a stream sourced far outside the window but flowing
    // through it would be missed → window variance).
    streamsInBBox(minX, minZ, maxX, maxZ) {
        const marginCells = Math.ceil(this.k.streamMaxLength / WATER_CELL) + 1
        const seen = new Set()
        const out = []
        for (const [cx, cz] of this._cellsForBBox(minX, minZ, maxX, maxZ, marginCells)) {
            for (const sd of this._cellData(cx, cz).saddles) {
                const stream = this._streamForSaddle(sd)
                if (!stream || seen.has(stream.key)) continue
                seen.add(stream.key)
                // Keep if any centerline point (padded by channel width) is in bbox.
                const pad = (stream.maxWidth ?? stream.width) + stream.bankWidth
                let hits = false
                for (const p of stream.points) {
                    if (p.x >= minX - pad && p.x <= maxX + pad &&
                        p.z >= minZ - pad && p.z <= maxZ + pad) { hits = true; break }
                }
                if (hits) out.push(stream)
            }
        }
        return out
    }

    // ── Query API (consumed later by router / physics / render) ───────────────

    // Pond containing (x,z) within its water radius, or null. For submerged/render.
    pondAt(x, z) {
        for (const pond of this.pondsInBBox(x, z, x, z)) {
            if (Math.hypot(x - pond.floorX, z - pond.floorZ) <= pond.radius) return pond
        }
        return null
    }

    // Road no-go: inside a pond's radius + skirt. The router treats this as a hard
    // exclusion (ponds are routed AROUND — FEAT-17). Streams are NOT no-go (bridged).
    isRoadNoGo(x, z) {
        for (const pond of this.pondsInBBox(x, z, x, z)) {
            const rr = pond.radius + pond.skirt
            if (Math.hypot(x - pond.floorX, z - pond.floorZ) <= rr) return true
        }
        return false
    }

    // Water surface Y at (x,z): the pond plane if inside a pond and terrain is below
    // it, else -Infinity. (Stream ribbon Y handled by the render layer along the
    // centerline; a point-query for streams is added when physics needs it.)
    waterSurfaceY(x, z) {
        const pond = this.pondAt(x, z)
        if (pond && this._h(x, z) < pond.waterLevel) return pond.waterLevel
        return -Infinity
    }

    // FEAT-22 §4 submerged hook: depth of a CG point below the local water surface,
    // or 0 if dry/above. Caller sets vehicleState.submerged = (depth > 0).
    submergedDepth(x, z, cgWorldY) {
        const wy = this.waterSurfaceY(x, z)
        return (wy > -Infinity && cgWorldY < wy) ? (wy - cgWorldY) : 0
    }

    // Coordinated FEAT-22 hook shape (2026-07-01 handoff): CG world position →
    // { submerged, depth }. v1 SETS the flag only; buoyancy/hydrolock consume it later.
    // CG world Y = vehicleState.position.y + cgHeight (main.js wires this in 3 places —
    // see project_vehiclestate_three_places).
    submergedAt(cgX, cgWorldY, cgZ) {
        const depth = this.submergedDepth(cgX, cgZ, cgWorldY)
        return { submerged: depth > 0, depth }
    }

    // FEAT-17 skirt sampler for FEAT-06 scatter: signed shoreline band membership.
    // Returns { inWater, inSkirt, pond } — scatter prefers `inSkirt` ground (vegetated
    // shoreline) and excludes `inWater`. Same injected-sampler shape as the prop
    // system's roadBlocked sampler, so main.js can hand it straight to the scatterer.
    pondSkirtAt(x, z) {
        for (const pond of this.pondsInBBox(x, z, x, z)) {
            const d = Math.hypot(x - pond.floorX, z - pond.floorZ)
            if (d <= pond.radius) return { inWater: true, inSkirt: false, pond }
            if (d <= pond.radius + pond.skirt) return { inWater: false, inSkirt: true, pond }
        }
        return { inWater: false, inSkirt: false, pond: null }
    }

    // ── Coordinated public API (2026-07-01 handoff naming) ────────────────────
    // Thin aliases so consumers (router route-around, scatter, streams-side bridge
    // detection) speak the documented contract. bbox = (minX, minZ, maxX, maxZ).
    basinsNear(minX, minZ, maxX, maxZ)  { return this.basinsInBBox(minX, minZ, maxX, maxZ) }
    saddlesNear(minX, minZ, maxX, maxZ) { return this.saddlesInBBox(minX, minZ, maxX, maxZ) }
    pondsNear(minX, minZ, maxX, maxZ)   { return this.pondsInBBox(minX, minZ, maxX, maxZ) }
    streamsNear(minX, minZ, maxX, maxZ) { return this.streamsInBBox(minX, minZ, maxX, maxZ) }

    // ── FEAT-18: road×stream crossings → bridge sites (pure) ──────────────────
    // The bridge-detection generation code, decoupled from road.js: the streams
    // worker passes the routed road centerlines in; we return every road-segment ×
    // stream-segment intersection as a bridge site (deck at road grade, channel bed
    // continuous underneath). Window-invariant given window-invariant inputs.
    //
    // @param roadPolylines — [[{x,z}|{x,z,y}, ...], ...] routed road centerlines.
    // @param bbox          — optional {x0,z0,x1,z1} limiting which streams to test.
    // @returns [{ x, z, deckY, bedY, stream, roadIndex, segIndex }]
    streamRoadCrossings(roadPolylines, bbox) {
        const b = bbox || { x0: -Infinity, z0: -Infinity, x1: Infinity, z1: Infinity }
        const streams = this.streamsInBBox(b.x0, b.z0, b.x1, b.z1)
        const out = []
        for (let ri = 0; ri < roadPolylines.length; ri++) {
            const road = roadPolylines[ri]
            for (let si = 1; si < road.length; si++) {
                const r0 = road[si - 1], r1 = road[si]
                for (const st of streams) {
                    const pts = st.points
                    for (let k = 1; k < pts.length; k++) {
                        const hit = segIntersect(r0.x, r0.z, r1.x, r1.z, pts[k - 1].x, pts[k - 1].z, pts[k].x, pts[k].z)
                        if (!hit) continue
                        // Deck Y from the road segment (grade) if provided, else stream bank top.
                        const deckY = (r0.y !== undefined && r1.y !== undefined)
                            ? r0.y + (r1.y - r0.y) * hit.tA
                            : (pts[k - 1].y + (pts[k].y - pts[k - 1].y) * hit.tB)
                        const bedY = (pts[k - 1].y + (pts[k].y - pts[k - 1].y) * hit.tB) - st.depth
                        out.push({ x: hit.x, z: hit.z, deckY, bedY, stream: st, roadIndex: ri, segIndex: si })
                    }
                }
            }
        }
        return out
    }

    // ── FEAT-18 stream channel carve (pure; applied MAIN-THREAD only) ──────────
    // Cross-section carve for the stream channel, in the SAME shape the road carve
    // uses (a blendW in [0,1] + a target bed Y). Flat bed of half-width `width`,
    // then a linear bank ramp of `bankWidth` back up to raw terrain. Signed distance
    // is the perpendicular distance to the nearest centerline segment; the bed Y
    // follows the centerline's descending profile (NOT a flat plane).
    //
    // NOT mirrored into WORKER_SOURCE — the terrain Worker returns RAW heights and
    // every carve blend (road AND stream) is applied on the main thread (see
    // terrain.js "carve never enters the worker"), so a Worker copy would be dead
    // code. terrain.js consumes this via the injected setWaterCarve hook (main.js
    // wires it; water.js stays a leaf). HOT PATH: called per physics contact sample
    // via analyticHeight — the per-stream bbox reject below keeps the common
    // (nowhere-near-water) case at a few float compares per stream.
    //
    // MULTI-STREAM SEAMS: where two channels overlap (parallel traces into the same
    // basin), "nearest centerline wins" would step the bed at the Voronoi seam
    // between them (same defect class as the carve invisible-cliff bug). Instead
    // each stream's cross-section is composed against `raw` and the DEEPEST result
    // (minimum height) wins — a min of continuous surfaces is continuous, so the
    // union of channels is seam-free. `raw` (world-space terrain at x,z) is passed
    // by the terrain paths that already have it; falls back to this WaterSystem's
    // own heightFn when omitted (legacy callers).
    streamCarveSample(x, z, streams, raw) {
        const list = streams || this.streamsInBBox(x, z, x, z)
        let rawH
        let best = null   // { h, blendW, bedY } — minimum composed height across streams
        for (const st of list) {
            const pad = (st.maxWidth ?? st.width) + st.bankWidth
            // Lazy cached centerline bbox (window-invariant: pure fn of the cached record).
            let bb = st._bb
            if (!bb) {
                bb = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity }
                for (const p of st.points) {
                    if (p.x < bb.x0) bb.x0 = p.x; if (p.x > bb.x1) bb.x1 = p.x
                    if (p.z < bb.z0) bb.z0 = p.z; if (p.z > bb.z1) bb.z1 = p.z
                }
                st._bb = bb
            }
            if (x < bb.x0 - pad || x > bb.x1 + pad || z < bb.z0 - pad || z > bb.z1 + pad) continue
            // This stream's nearest-segment cross-section. FEAT-24: the half-width is
            // interpolated per-point (w) along the nearest segment, not a constant.
            const pts = st.points
            let d2min = Infinity, bedY = 0, wAt = st.width
            for (let i = 1; i < pts.length; i++) {
                const a = pts[i - 1], b = pts[i]
                const abx = b.x - a.x, abz = b.z - a.z
                const len2 = abx * abx + abz * abz
                if (len2 < 1e-9) continue
                let t = ((x - a.x) * abx + (z - a.z) * abz) / len2
                t = Math.max(0, Math.min(1, t))
                const px = a.x + abx * t, pz = a.z + abz * t
                const d2 = (x - px) * (x - px) + (z - pz) * (z - pz)
                if (d2 < d2min) {
                    d2min = d2
                    bedY = (a.y + (b.y - a.y) * t) - st.depth
                    wAt = (a.w !== undefined && b.w !== undefined) ? a.w + (b.w - a.w) * t : st.width
                }
            }
            if (d2min === Infinity) continue
            const dist = Math.sqrt(d2min)
            if (dist >= wAt + st.bankWidth) continue
            const sw = dist <= wAt ? 1 : 1 - (dist - wAt) / st.bankWidth
            if (rawH === undefined) rawH = (raw !== undefined) ? raw : this._h(x, z)
            const h = rawH + sw * (bedY - rawH)
            if (best === null || h < best.h) best = { h, blendW: sw, bedY }
        }
        if (best === null) return { blendW: 0, bedY: 0 }
        return { blendW: best.blendW, bedY: best.bedY }
    }
}
