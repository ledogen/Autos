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
 * router uses when it valley-seeks (road.js _protoAnchorRaw).
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
    saddleMinDrop:    18,    // m — min total descent of a traced stream to keep it (rarity/prominence dial).
    streamMinLength:  120,   // m — drop shorter traces (trickles).
    streamStep:       8,     // m — gradient-descent step length.
    streamMaxLength:  1400,  // m — hard cap on a trace (bounds the stream query margin).
    streamMaxSteps:   4000,  // pure safety cap on descent iterations (length is the real bound;
                             // adaptive step-halving adds a few iters per settle).
    streamWidth:      3,     // m — channel bed HALF-width (flat bottom).
    streamDepth:      2.5,   // m — bed cut below surrounding terrain.
    streamBankWidth:  5,     // m — bank ramp width from bed lip up to grade (each side).
    streamWaterDepth: 0.6,   // m — water surface height above the bed (for the render ribbon).

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
    }

    // ── Terrain reads ─────────────────────────────────────────────────────────
    _height(x, z) { return this._h(x, z) }

    // Central-difference gradient of height (points UPHILL). eps = coarse-scale so
    // the fine ripple doesn't dominate the descent direction.
    _grad(x, z) {
        const e = this.k.gradEps
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
    _refineMin(sx, sz) { return this._greedyDescend(sx, sz) }

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
    traceFlow(sx, sz) {
        const { streamStep, streamMaxSteps, streamMaxLength } = this.k
        const STEP_MIN = 0.5
        const y0 = this._h(sx, sz)
        const pts = [{ x: sx, z: sz, y: y0, s: 0 }]
        let x = sx, z = sz, y = y0, length = 0, step = streamStep, stop = 'cap'

        for (let s = 0; s < streamMaxSteps; s++) {
            if (length >= streamMaxLength) { stop = 'cap'; break }
            const { gx, gz } = this._grad(x, z)
            const gm = Math.hypot(gx, gz)
            if (gm < 1e-4) { stop = 'flat'; break }        // flat → at a floor
            const nx = x - (gx / gm) * step
            const nz = z - (gz / gm) * step
            const ny = this._h(nx, nz)
            if (ny >= y) {                                 // overshoot: refine toward the min
                if (step > STEP_MIN) { step *= 0.5; continue }
                stop = 'min'; break                        // settled to STEP_MIN of the local minimum
            }
            length += step
            pts.push({ x: nx, z: nz, y: ny, s: length })
            x = nx; z = nz; y = ny
            step = Math.min(streamStep, step * 1.5)         // grow back toward the full stride
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

        const { saddleMinDrop, streamMinLength } = this.k
        const flow = this.traceFlow(saddle.x, saddle.z)
        if (flow.drop < saddleMinDrop || flow.length < streamMinLength) {
            this._streamCache.set(skey, null)
            return null
        }

        const stream = {
            kind: 'stream',
            points: flow.points,   // [{x,z,y,s}] centerline, source→mouth, DESCENDING y
            length: flow.length,
            drop: flow.drop,
            width: this.k.streamWidth,
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
                const pad = stream.width + stream.bankWidth
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

    // ── FEAT-18 stream channel carve (pure; staged for CARVE SYNC) ─────────────
    // Cross-section carve for the stream channel, in the SAME shape the road carve
    // uses (a blendW in [0,1] + a target bed Y). Flat bed of half-width `width`,
    // then a linear bank ramp of `bankWidth` back up to raw terrain. Signed distance
    // is the perpendicular distance to the nearest centerline segment; the bed Y
    // follows the centerline's descending profile (NOT a flat plane).
    //
    // This is deliberately NOT mirrored into WORKER_SOURCE yet — that mirror + the
    // CARVE SYNC test are part of the (later) wiring commit. Kept pure + testable
    // so the channel geometry can be validated headless first.
    streamCarveSample(x, z, streams) {
        const list = streams || this.streamsInBBox(x, z, x, z)
        let best = null   // { dist, bedY }
        for (const st of list) {
            const pts = st.points
            for (let i = 1; i < pts.length; i++) {
                const a = pts[i - 1], b = pts[i]
                const abx = b.x - a.x, abz = b.z - a.z
                const len2 = abx * abx + abz * abz
                if (len2 < 1e-9) continue
                let t = ((x - a.x) * abx + (z - a.z) * abz) / len2
                t = Math.max(0, Math.min(1, t))
                const px = a.x + abx * t, pz = a.z + abz * t
                const dist = Math.hypot(x - px, z - pz)
                if (best === null || dist < best.dist) {
                    const bedY = (a.y + (b.y - a.y) * t) - st.depth   // centerline Y minus channel depth
                    best = { dist, bedY, width: st.width, bankWidth: st.bankWidth }
                }
            }
        }
        if (best === null) return { blendW: 0, bedY: 0 }

        const { dist, bedY, width, bankWidth } = best
        if (dist <= width) return { blendW: 1, bedY }                 // flat bed
        if (dist >= width + bankWidth) return { blendW: 0, bedY: 0 }  // outside channel
        // Bank ramp: linear blend from bed (1) to terrain (0) across bankWidth.
        const t = (dist - width) / bankWidth
        return { blendW: 1 - t, bedY }
    }
}
