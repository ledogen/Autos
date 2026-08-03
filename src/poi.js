// ── FEAT-46: Story-mode points of interest on lay-by pads ──────────────────────────────────
//
// POIs are the "walk up and get a job" interaction (FEAT-43 slice 1) — an orange placeholder cube
// standing on its own flattened pull-off beside the road, dispersed along the network.
//
// THE DETERMINISM RULE THIS MODULE EXISTS TO HONOUR (owner, 2026-07-28): POIs must not influence
// routing. The same seed opened in free roam and in story mode must produce identical centerlines,
// identical road surface and identical par — you just don't see the pads in free roam. So:
//   • Placement runs strictly DOWNSTREAM of routing. It reads the already-routed network
//     (networkGraph + edgeParData) and writes nothing back. Nothing here reaches routeCacheSig,
//     the abstract graph, the router cost model or the crossing cull.
//   • The pad carve (RoadSystem._poiPadCarve) is gated to zero authority inside the road's own
//     cross-section, so the ribbon the truck drives is bit-identical with or without a pad beside it.
//   • Free roam never calls build(), so it never sets a pad and pays nothing.
//
// Placement is keyed off the ABSTRACT GRAPH EDGE (the two site ids), never the streamed runKey:
// post-BUG-25 the window-bounded crossing cull can flip whole edges on a re-stream, so a
// runKey-derived roll would not be window-invariant. Site ids are `[cellX, cellZ, index]` triples —
// a pure function of (seed, params), stable from any stream centre.
//
// DESIGN.md "Where missions and POIs live" [RATIFIED 2026-07-20]: a POI is an arbitrary
// (edge, arcS) point, NEVER snapped to a graph node. Nodes are a routing artifact ~640 m apart and
// mostly junctions; a place is no likelier at a T than halfway down a road.

/** Tunables. Geometry + siting only — none of this may ever enter routeCacheSig. */
export const POI_PARAMS = {
    poiEdgeChance:    0.20,   // probability a qualifying graph edge carries a POI
    poiCandidates:    6,      // arcS candidates tried per carrying edge before giving up
    poiPadHalfLen:    7.0,    // m — half length of the lay-by, along the road
    poiPadHalfWid:    4.0,    // m — half width, across the road
    poiPadGap:        0.6,    // m — gap from the shoulder edge to the pad's near side
    // EARTHWORK CAP — the "flat open ground" test, and the most consequential number here.
    // Measured against the ROAD-CARVED surface, not raw terrain: raw would charge the pad for the
    // road's own cut/fill (median 10 m of it on seed 6 — the road can sit deep in a bench), which
    // is not the pad's scar and rejected essentially everything. Against the carved surface the
    // best-of-two-sides distribution on seed 6 runs p25 2.7 m / p50 3.5 m, so 3.0 admits roughly a
    // third of candidates — a couple of metres of bench, which is what a real forest-service
    // pullout looks like, and far short of a gouge.
    poiMaxCutFill:    3.0,    // m
    // Reject a lay-by hung off a superelevated sweeper (it reads wrong and drains into the road).
    // Seed-6 cross-slope runs p50 0.067 / p75 0.142, so 0.12 (≈7°) keeps the obviously-banked
    // corners out without rejecting the ordinary crowned straight.
    poiMaxCrossSlope: 0.12,
    poiEndClearM:     55,     // m — keep clear of both edge ends (junction pads live there)
    poiInteractR:     10,     // m — interaction radius: where the prompt shows AND where latching
                              // the parking brake opens the offer. ONE radius on purpose — a prompt
                              // visible further out than the trigger works would be a lie.
                              // Tightened from 18 (owner, 2026-08-02): 18 m armed the offer from
                              // the road itself, well short of the pad. 10 m is a little over the
                              // pad's own half-diagonal (√(7² + 4²) ≈ 8.1), so it means "parked on
                              // the lay-by" and nothing looser — the step toward the marker being a
                              // highlighted parking spot you actually pull into.
    poiCubeSize:      1.6,    // m — the placeholder marker cube's edge length
}

// Footprint sampling for the earthwork test: a 3 × 5 lattice over the pad, plus the centre.
const CUTFILL_NU = 5, CUTFILL_NV = 3

/**
 * FNV-1a over a string → uint32. Used only to seed the per-edge PRNG; any stable hash would do,
 * but it must stay stable, so do not "improve" it — the POI layout of every existing seed rides on it.
 *
 * EXPORTED and shared with src/camp.js (FEAT-45 camping zones), which keys its per-cell PRNG the
 * same way. Two layouts now ride on this function being byte-stable, not one.
 */
export function hash32 (str) {
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return h >>> 0
}

/**
 * mulberry32 — small, fast, well-distributed. Deterministic stream from one uint32 seed.
 * Exported alongside hash32 and shared with src/camp.js; same stability contract.
 */
export function mulberry32 (a) {
    return function () {
        a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const idKey = (id) => `${id[0]},${id[1]},${id[2]}`

/**
 * The POI layer. Owns placement, the pad records the road carve consumes, and the
 * nearest-POI query the interaction prompt reads. Holds no THREE and no worldgen of its own —
 * everything comes through the `deps` adapter, the same isolation discipline src/story.js uses.
 */
export class PoiSystem {
    /**
     * @param {object} deps
     *   getRoad()      — the play RoadSystem (a getter: main.js swaps instances on reseed)
     *   getWater()     — WaterSystem, for the on-water reject (may return null)
     *   getTerrain()   — TerrainSystem, for rawHeightWorld (the earthwork test)
     *   getSeed()      — numeric worldSeed
     *   getParams()    — the live params object (pad geometry knobs live alongside road params)
     */
    constructor (deps) {
        this._d = deps
        this._list = []
        this._built = null      // {x,z,r,seed} the current list was built for
    }

    /** Every placed POI. Read-only to callers. */
    list () { return this._list }

    /**
     * Place POIs across the routed network inside a circle, and hand the pads to the RoadSystem so
     * the terrain carve flattens them. Idempotent for the same (centre, radius, seed).
     *
     * Cost: one pass over the region's graph edges, a handful of terrain/water samples per
     * candidate. Runs ONCE at story-mode entry (behind the loading screen), never in the frame loop.
     */
    build (center, radius) {
        const road = this._d.getRoad()
        if (!road || !center) return this._list
        const seed = this._d.getSeed()
        if (this._built && this._built.seed === seed
            && this._built.r === radius
            && Math.hypot(this._built.x - center.x, this._built.z - center.z) < 1e-6) return this._list

        // CLEAR THE PREVIOUS BUILD'S PADS FIRST. _evaluate's junction reject reads padReachNodes(),
        // which lists POI pads alongside junction pads — so a REBUILD (a new seed, a re-anchored
        // region) would site against the pads of the region it is replacing and produce a different,
        // history-dependent layout. Within one build there is no self-interference: pads are handed
        // over once at the end. Determinism means the answer depends on (seed, params, network) and
        // nothing else, including what this system did a minute ago.
        road.setPoiPads(null)

        const g = road.networkGraph()
        const p = this._d.getParams()
        const P = { ...POI_PARAMS, ...p }

        // Deterministic edge ORDER: the network Map's insertion order is a streaming artifact, so
        // sort by the canonical edge key. Placement is per-edge independent, but sorting keeps the
        // ids stable, which the map icons and the mission anchor both key off.
        const canon = []
        for (const [a, b] of g.edges) {
            const ka = idKey(a), kb = idKey(b)
            canon.push(ka < kb ? { ka, kb, a, b } : { ka: kb, kb: ka, a: b, b: a })
        }
        canon.sort((u, v) => (u.ka === v.ka ? (u.kb < v.kb ? -1 : 1) : (u.ka < v.ka ? -1 : 1)))

        const out = []
        const seen = new Set()
        for (const e of canon) {
            const ek = `${e.ka}|${e.kb}`
            if (seen.has(ek)) continue      // networkGraph can list an edge twice (both run keys)
            seen.add(ek)
            const rnd = mulberry32(hash32(`poi:${seed}:${ek}`))
            if (rnd() >= P.poiEdgeChance) continue
            const poi = this._placeOnEdge(road, e, rnd, P)
            if (!poi) continue
            // THE REGION CLIP IS A POST-FILTER, NEVER A REJECT TEST. Applied inside candidate
            // selection it would make WHICH arc position wins depend on the region centre — and a
            // POI 400 m inside the wall then moved when the window moved. Window-invariance means
            // the edge decides where its POI goes; the region only decides whether it is kept.
            if (Math.hypot(poi.x - center.x, poi.z - center.z) > radius - poi.halfLen - 20) continue
            poi.index = out.length
            out.push(poi)
        }

        this._list = out
        this._built = { x: center.x, z: center.z, r: radius, seed }
        road.setPoiPads(out)
        return out
    }

    /** Drop every POI and release the pads (leaving story mode). */
    clear () {
        this._list = []
        this._built = null
        const road = this._d.getRoad()
        if (road) road.setPoiPads(null)
    }

    /**
     * The POI the player may interact with from (x,z), or null. Radius test only — the prompt is a
     * proximity affordance, not a trigger volume.
     */
    nearest (x, z, maxR = POI_PARAMS.poiInteractR) {
        let best = null, bestD = maxR
        for (const q of this._list) {
            const d = Math.hypot(q.x - x, q.z - z)
            if (d < bestD) { bestD = d; best = q }
        }
        return best
    }

    /**
     * Hard contact against the marker cubes, for the physics contact pipeline. Sphere vs a
     * world-axis-aligned box sitting on the pad — the cube is SOLID, because a marker you drive
     * through reads as scenery and this project's whole premise is that the physics is honest.
     * Returns the prop-collider convention ({nx,ny,nz,depth}, normal points OUT of the solid) so
     * main.js's queryContacts splice is identical to the prop one. THREE-free by design.
     */
    queryContact (cx, cy, cz, r) {
        const h = (this._d.getParams?.()?.poiCubeSize ?? POI_PARAMS.poiCubeSize) * 0.5
        for (const q of this._list) {
            const dx = cx - q.x, dz = cz - q.z
            if (dx > h + r || dx < -h - r || dz > h + r || dz < -h - r) continue
            const bcy = q.y + h                         // box centre: the cube stands ON the pad
            const dy = cy - bcy
            if (dy > h + r || dy < -h - r) continue
            // Closest point on the box to the query centre.
            const qx = dx < -h ? -h : dx > h ? h : dx
            const qy = dy < -h ? -h : dy > h ? h : dy
            const qz = dz < -h ? -h : dz > h ? h : dz
            let ex = dx - qx, ey = dy - qy, ez = dz - qz
            let d2 = ex * ex + ey * ey + ez * ez
            if (d2 >= r * r) continue
            if (d2 > 1e-12) {
                const d = Math.sqrt(d2)
                return { nx: ex / d, ny: ey / d, nz: ez / d, depth: r - d }
            }
            // Centre inside the box: push out along the axis with the least penetration.
            const px = h - Math.abs(dx), py = h - Math.abs(dy), pz = h - Math.abs(dz)
            if (px <= py && px <= pz) return { nx: Math.sign(dx) || 1, ny: 0, nz: 0, depth: px + r }
            if (py <= pz)             return { nx: 0, ny: Math.sign(dy) || 1, nz: 0, depth: py + r }
            return { nx: 0, ny: 0, nz: Math.sign(dz) || 1, depth: pz + r }
        }
        return null
    }

    // ── placement ───────────────────────────────────────────────────────────────────────────
    /**
     * Try `poiCandidates` arc positions on one edge and return the first that passes every reject
     * test, or null. Candidates are drawn from the edge's own PRNG so the result is a pure function
     * of (seed, edge) — the same edge yields the same POI (or the same nothing) from any window.
     */
    _placeOnEdge (road, e, rnd, P) {
        const ed = road.edgeParData(e.a, e.b)
        if (!ed || !ed.centerline) return null
        // QUAL-24: this edge may be a STRETCH of a longer run — a deg-2 chain merge swallowed it — so
        // its arc domain is [off, off+L] inside the registered run, not [0, len]. `s` below stays in
        // that run's GLOBAL arc domain, which is what the pad record, tunnelSpanAt and the mission
        // anchor all expect. An unmerged edge reports off=0 and L=len, so this is identity there.
        const off = ed.arcOffset ?? 0
        const L = ed.arcLength ?? ed.centerline.length
        const clear = P.poiEndClearM
        if (!(L > 2 * clear + 40)) return null      // too short to hold a pad clear of both ends

        const halfWidth     = P.roadHalfWidth     ?? 5
        const shoulderWidth = P.roadShoulderWidth ?? 2.5
        // Lateral offset from the CENTERLINE to the pad centre: past the shoulder, past the gap,
        // then half the pad. The pad's near edge therefore sits `poiPadGap` beyond the shoulder.
        const lat = halfWidth + shoulderWidth + P.poiPadGap + P.poiPadHalfWid

        for (let k = 0; k < P.poiCandidates; k++) {
            const s = off + clear + rnd() * (L - 2 * clear)
            // WHICH SIDE is decided by the ground, not by the hash: try both and take the one that
            // needs less earthwork. On a mountain road the two sides are wildly asymmetric — one is
            // a 1:1 cut bank, the other a 3:1 fill slope — so letting the terrain choose is both the
            // cheaper bench and the more believable siting. Emergent, not injected.
            let best = null
            for (const side of [1, -1]) {
                const cand = this._evaluate(road, ed, s, side, lat, P)
                if (cand && (!best || cand.cut < best.cut)) best = cand
            }
            if (best) return { id: `poi:${e.ka}|${e.kb}`, index: -1, aId: e.a, bId: e.b, s, runKey: ed.key, ...best }
        }
        return null
    }

    /**
     * The reject tests, in ascending cost order. Returns the pad record on acceptance, else null.
     *
     * ON water rejects; NEAR water does not (owner, 2026-07-28) — a waterside pullout is good, and
     * FEAT-45's camp scoring wants water proximity as a POSITIVE. The earthwork cap is how "flat
     * open ground bordering a road" is expressed: it bounds the visible scar directly, which is the
     * thing that actually looks wrong, rather than proxying it through an abstract slope threshold.
     */
    _evaluate (road, ed, s, side, lat, P) {
        const cl = ed.centerline
        const cp = cl.pointAt(s)
        const ct = cl.tangentAt(s)
        const tl = Math.hypot(ct.x, ct.z) || 1
        const tx = ct.x / tl, tz = ct.z / tl
        // Right-hand normal (matches the signedLat convention: positive = right of road heading).
        const nx = tz * side, nz = -tx * side

        const cx = cp.x + nx * lat, cz = cp.z + nz * lat

        // Every test below reads only the edge and its immediate surroundings — nothing about the
        // window or the region. That is what keeps placement window-invariant (the region clip is
        // a post-filter in build()).

        // 1. Inside a tunnel bore, or close enough to a portal that the pad would hang off the
        //    headwall. The bore owns its own earthwork (FEAT-40) and a pullout there is nonsense.
        if (road.tunnelSpanAt) {
            for (const ds of [-40, 0, 40]) {
                const sa = Math.min(cl.length, Math.max(0, s + ds))
                if (road.tunnelSpanAt(ed.key, sa)) return null
            }
        }

        // 2. Junction pads / connector fillets already own their ground — never stack on one.
        for (const nd of road.padReachNodes()) {
            if (Math.hypot(nd.x - cx, nd.z - cz) <= nd.reach) return null
        }

        // 3. The road's own surface at the shoulder edge on the pad side IS the pad's design top:
        //    carve the pad flush with the carved shoulder dirt and the lay-by is driveable-onto with
        //    no step. Null means the resolver found no road here — nothing to hang a pullout off.
        const edgeLat = P.roadHalfWidth + P.roadShoulderWidth
        const topY = road.sampleRoadTopY(cp.x + nx * edgeLat, cp.z + nz * edgeLat)
        if (topY == null || !isFinite(topY)) return null

        // 4. Cross-slope: a pullout on a superelevated corner reads wrong (and drains into the road).
        const yL = road.sampleRoadTopY(cp.x + tz * edgeLat, cp.z - tx * edgeLat)
        const yR = road.sampleRoadTopY(cp.x - tz * edgeLat, cp.z + tx * edgeLat)
        if (yL != null && yR != null && Math.abs(yL - yR) / (2 * edgeLat) > P.poiMaxCrossSlope) return null

        // 5. ON water — pond no-go (radius + skirt) or a stream channel under the footprint.
        const water = this._d.getWater?.()
        if (water) {
            for (const [px, pz] of this._footprint(cx, cz, tx, tz, nx, nz, P, 3, 2)) {
                if (water.isRoadNoGo(px, pz)) return null
                // NB: streamChannelAt ALWAYS returns a record — {inChannel:false,inBank:false,
                // stream:null} away from any stream — so it must be READ, not truth-tested.
                // Only inChannel rejects: the BANK is exactly the waterside pullout we want.
                if (water.streamChannelAt?.(px, pz)?.inChannel) return null
            }
        }

        // 6. EARTHWORK CAP — the "flat open ground" test, measured against the ROAD-CARVED surface
        //    (analyticHeight), not raw terrain. Raw would bill the pad for the ROAD's cut/fill,
        //    which is already-spent earthwork and not the pad's scar; on seed 6 that reads a median
        //    of 10 m and rejects everything. Falling back to raw only keeps a terrain stub honest.
        const terrain = this._d.getTerrain?.()
        const groundAt = terrain?.analyticHeight ? ((x, z) => terrain.analyticHeight(x, z))
            : terrain?.rawHeightWorld ? ((x, z) => terrain.rawHeightWorld(x, z)) : null
        let cut = 0
        if (groundAt) {
            for (const [px, pz] of this._footprint(cx, cz, tx, tz, nx, nz, P, CUTFILL_NU, CUTFILL_NV)) {
                const gy = groundAt(px, pz)
                if (!isFinite(gy)) return null
                const d = Math.abs(gy - topY)
                if (d > cut) cut = d
            }
            if (cut > P.poiMaxCutFill) return null
        }

        return {
            x: cx, z: cz, y: topY, cut,
            tx, tz, nx, nz, side,
            halfLen: P.poiPadHalfLen, halfWid: P.poiPadHalfWid,
            // The mission start point: ON the road at this arc position, facing along the edge.
            roadX: cp.x, roadZ: cp.z,
        }
    }

    /** Lattice of world points covering the pad footprint (inclusive of the rim). */
    * _footprint (cx, cz, tx, tz, nx, nz, P, nu, nv) {
        for (let i = 0; i <= nu; i++) {
            const u = (i / nu * 2 - 1) * P.poiPadHalfLen
            for (let j = 0; j <= nv; j++) {
                const v = (j / nv * 2 - 1) * P.poiPadHalfWid
                yield [cx + tx * u + nx * v, cz + tz * u + nz * v]
            }
        }
    }
}
