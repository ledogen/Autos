// test/stage2-crossing-agreement.mjs — QUAL-21 Stage 2 Phase 0: ENTRY CHECKPOINT (NOT a gate;
// rainy-day script). Measures whether the Stage 2 architecture's load-bearing bet holds BEFORE
// any pipeline work: can the cull ladder run on COARSE polylines and reach the same topology the
// fine-route cull reaches today?
//
//   (1) CROSSING AGREEMENT — build the pre-crossing-cull fine network (roadGraphCullCrossings
//       off, degree pass still applies), coarse-route every registered band edge forward with the
//       corridor block's coarse opts (cell 24, 12 hbins, palette below, emitPrimitives off), and
//       run _cullCandidatePairs over both polyline sets. Report fine crossings caught by coarse
//       (PROCEED BAR: ≥80%), coarse-only false positives, and the simulated crossing-pass DROP
//       agreement (each fine-only drop = a Phase 4 splice; each coarse-only drop = a wrongly-
//       early-culled edge — connectivity-guarded, so a missing road, not an island).
//   (2) COLD-BUILD BASELINE — 3× cold setRadius(1600)+update() at defaults (cull ON), scStats
//       injected: wall + searches + repairs. Phase 3 must not exceed this (should beat it).
//   (3) COARSE PALETTE — (1) is measured for radii [200,35] / [200,50] / [200] on both seeds;
//       then full fine builds with the heuristic-flood palette overridden compare topology +
//       character (curvature bands, straight share) so the gentle-curves-only floor is picked
//       by numbers, not taste.
//
// Both QUAL-21/22 toggles are ON throughout (Stage 2 is the flag-on world). Run:
//   node test/stage2-crossing-agreement.mjs
//
// Plan: .planning/handoffs/2026-07-25-qual21-stage2-plan.md (Phase 0).

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { arcPrimitiveConnect } from '../src/road-carve.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const P = { ...RANGER_PARAMS, roadNetworkMode: 'graph', roadStrokeRouting: true, roadGraphCostPrune: true }
const SEEDS = [6, 3]
const PALETTES = [[200, 35], [200, 50], [200]]
const CX = 4500, CZ = 600, R = 1600
const AGREEMENT_ONLY = process.argv.includes('--agreement-only')   // skip (2)/(3) re-measures

// Coarse VARIANTS for (1): the corridor block's recipe strips goalHeading (C0 legacy terminal is
// fine for a HEURISTIC-flood estimate) — but for the CULL consumer that reintroduces the exact
// overshoot-past-the-node wander goalBlend was built to kill in fine routes (near-node shallow
// crossings). gh:true keeps the spec's goalHeading (+goalBlend Dubins terminal) in the coarse
// route; measured first run: gh:false gave 26-37 false-pos crossings (16-22 wrongly-early-culled
// edges) — unusable for cull.
const VARIANTS = [
    { radii: [200, 35], gh: false },
    { radii: [200, 35], gh: true },
    { radii: [200, 50], gh: true },
    { radii: [200], gh: true },
]

// ── helpers ─────────────────────────────────────────────────────────────────────

// Coarse forward route for a registered edge — the EXACT corridor-block recipe (road-carve.js
// "PERF corridor two-pass": cell/stepLen 24, hbins 12, maxNodes 60k, no self-clear, no refit,
// C0 legacy terminal) minus the flood/tube wrapper: this is the polyline Phase 1 would cache
// per edge (like solo routes — spec opts, no sibling corridor discs).
function coarseRoute(r, cellA, cellB, { radii, gh }) {
    const spec = r._edgeRouteSpec(cellA, cellB)
    const o = Object.assign({}, spec.opts, {
        _coarsePass: true,
        cell: 24, stepLen: 24, hbins: 12,
        radii, maxNodes: 60000,
        emitPrimitives: false, selfClearDist: 0, refitShortcut: false, refitWindow: 0,
        corridorCoarse: undefined,
    }, gh ? {} : { goalHeading: undefined })
    return arcPrimitiveConnect(spec.ax, spec.az, spec.bx, spec.bz, (x, z) => r._coarseH(x, z), o)
}

// All seg×seg crossing POINTS of a candidate pair (the broad-phase _cullCandidatePairs already
// said "crosses somewhere"; this recovers where, for classification/filtering).
function crossPoints(A, B) {
    const out = []
    const pa = A.pts, pb = B.pts
    for (let i = 0; i < pa.length - 1; i++) {
        for (let j = 0; j < pb.length - 1; j++) {
            const x1 = pa[i].x, z1 = pa[i].z, x2 = pa[i + 1].x, z2 = pa[i + 1].z
            const x3 = pb[j].x, z3 = pb[j].z, x4 = pb[j + 1].x, z4 = pb[j + 1].z
            const d = (x2 - x1) * (z4 - z3) - (z2 - z1) * (x4 - x3)
            if (Math.abs(d) < 1e-12) continue
            const t = ((x3 - x1) * (z4 - z3) - (z3 - z1) * (x4 - x3)) / d
            const u = ((x3 - x1) * (z2 - z1) - (z3 - z1) * (x2 - x1)) / d
            if (t < 0 || t > 1 || u < 0 || u > 1) continue
            out.push({ x: x1 + t * (x2 - x1), z: z1 + t * (z2 - z1) })
        }
    }
    return out
}

// Min distance from any crossing point of the pair to the closest of the two edges' four
// endpoint nodes (context stat: near-node vs mid-span).
function crossDistToNode(r, A, B) {
    const nodes = [...A.cells, ...B.cells].map(c => r._nodePos(c))
    let best = Infinity
    for (const c of crossPoints(A, B))
        for (const n of nodes) best = Math.min(best, Math.hypot(c.x - n.x, c.z - n.z))
    return best
}

// SHARED-NODE EXEMPTION filter for the COARSE detection rule: a pair sharing a graph node keeps
// only crossings farther than E metres from every shared node (approaches converging into a
// common junction are expected geometry — the clearance pass's exemption, applied to crossings;
// on a 24 m lattice two legs of one node trivially wiggle across each other there). Pairs
// sharing no node are untouched. Returns the surviving pairs.
function exemptSharedNode(r, ring, pairs, E) {
    const out = []
    for (const p of pairs) {
        const A = ring.get(p.ka), B = ring.get(p.kb)
        const aK = A.cells.map(c => c.join(',')), bK = B.cells.map(c => c.join(','))
        const shared = A.cells.filter((c, i) => bK.includes(aK[i])).map(c => r._nodePos(c))
        if (!shared.length) { out.push(p); continue }
        const live = crossPoints(A, B).some(c => shared.every(n => Math.hypot(c.x - n.x, c.z - n.z) >= E))
        if (live) out.push(p)
    }
    return out
}

// Simulated crossing pass over a candidate-pair list — the _cullCrossingsPass decision rule
// (canonical pair order, static detour BFS, shorter-detour-first tie-break) with the detour
// graph = the band graph's post-degree-pass adjacency. Both polyline universes are judged by
// the SAME detour fn, so agreement compares only what the plan varies: the crossing GEOMETRY.
function simCrossingDrops(r, g, pairs) {
    const maxHops = r._params?.roadGraphCullMaxHops ?? 4
    const detour = (a, b) => {
        const q = [[a, 0]], seen = new Set([a])
        while (q.length) {
            const [u, d] = q.shift()
            if (d >= maxHops) continue
            for (const v of g.adj.get(u) || []) {
                if (u === a && v === b) continue
                if (v === b) return d + 1
                if (!seen.has(v)) { seen.add(v); q.push([v, d + 1]) }
            }
        }
        return -1
    }
    const dropped = new Set()
    for (const { ka, kb, aCells, bCells } of pairs) {
        if (dropped.has(ka) || dropped.has(kb)) continue
        const da = detour(g.key(aCells[0]), g.key(aCells[1])), db = detour(g.key(bCells[0]), g.key(bCells[1]))
        if (da >= 0 && db >= 0) dropped.add(da !== db ? (da < db ? ka : kb) : (ka < kb ? ka : kb))
        else if (da >= 0) dropped.add(ka)
        else if (db >= 0) dropped.add(kb)
    }
    return dropped
}

// Character stats from a network's registered polylines (feel-diff's CHARACTER layer, in-process):
// curvature-band share (length-weighted), straight-span share, total length, run count.
function characterOf(r) {
    let total = 0, straight200 = 0
    const bands = { sweep: 0, gentle: 0, medium: 0, hairpin: 0 }   // R>500 / 150-500 / 40-150 / <40
    const keys = new Set()
    for (const [k, e] of r._network) {
        if (!e.points || e.points.length < 3) continue
        keys.add(k)
        const pts = e.points
        let spanLen = 0
        for (let i = 1; i < pts.length - 1; i++) {
            const A = pts[i - 1], B = pts[i], C = pts[i + 1]
            const a = Math.hypot(C.x - B.x, C.z - B.z), b = Math.hypot(C.x - A.x, C.z - A.z), c = Math.hypot(B.x - A.x, B.z - A.z)
            const ds = (a + c) / 2
            total += ds
            const area = Math.abs((B.x - A.x) * (C.z - A.z) - (C.x - A.x) * (B.z - A.z)) / 2
            const R2 = area < 1e-6 ? Infinity : (a * b * c) / (4 * area)
            if (R2 > 2000) { spanLen += ds } else { if (spanLen > 200) straight200 += spanLen; spanLen = 0 }
            if (R2 > 500) bands.sweep += ds
            else if (R2 > 150) bands.gentle += ds
            else if (R2 > 40) bands.medium += ds
            else bands.hairpin += ds
        }
        if (spanLen > 200) straight200 += spanLen
    }
    return { keys, total, straight200, bands }
}
const charLine = (c) => {
    const p = (v) => (100 * v / Math.max(1, c.total)).toFixed(1)
    return `len ${(c.total / 1000).toFixed(1)}km · runs ${c.keys.size} · straights>200m ${p(c.straight200)}% · bands sweep ${p(c.bands.sweep)}% gentle ${p(c.bands.gentle)}% medium ${p(c.bands.medium)}% hairpin ${p(c.bands.hairpin)}%`
}

const pairKey = (p) => p.ka + '#' + p.kb

// ── (1)+(3a) crossing agreement, per seed × palette ─────────────────────────────

for (const seed of SEEDS) {
    console.log(`\n━━ (1) CROSSING AGREEMENT — seed ${seed} (pre-crossing-cull fine network) ━━`)
    let t0 = Date.now()
    const r = new RoadSystem(seed, { ...P, roadGraphCullCrossings: false })
    r.setRadius(R)
    r.update(new THREE.Vector3(CX, 0, CZ))
    console.log(`   fine build (cull OFF) ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    const g = r._proto.graph

    // Fine polyline universe: every registered band edge (post-degree-pass, pre-crossing-cull).
    const ringFine = new Map()
    for (const [key, e] of r._network) {
        if (!e.cellA || !e.cellB || !e.points || e.points.length < 2) continue
        ringFine.set(key, { cells: [e.cellA, e.cellB], pts: e.points })
    }
    const finePairs = r._cullCandidatePairs(ringFine)
    const fineSet = new Set(finePairs.map(pairKey))
    const fineDrops = simCrossingDrops(r, g, finePairs)
    console.log(`   band edges ${ringFine.size} · fine crossings ${finePairs.length} · fine sim-drops ${fineDrops.size}`)

    // Where do the FINE crossings sit relative to nodes, and do the pairs share one? (context
    // for the shared-node exemption: a fine crossing that would itself be exempted marks a real
    // drop the exempted coarse rule can never predict.)
    {
        const info = finePairs.map(p => {
            const A = ringFine.get(p.ka), B = ringFine.get(p.kb)
            const shared = A.cells.some(c => B.cells.some(c2 => c.join(',') === c2.join(',')))
            return `${crossDistToNode(r, A, B).toFixed(0)}m${shared ? '(shared)' : ''}`
        })
        if (info.length) console.log(`   fine crossing dist-to-node: ${info.join(' ')}`)
    }

    for (const V of VARIANTS) {
        // Coarse polyline universe: same edges, coarse-routed forward.
        const ringCoarse = new Map()
        let fails = 0, cMs = 0
        for (const [key, { cells }] of ringFine) {
            const tc = Date.now()
            const pts = coarseRoute(r, cells[0], cells[1], V)
            cMs += Date.now() - tc
            if (!pts || pts.length < 2) { fails++; continue }
            ringCoarse.set(key, { cells, pts })
        }
        const rawPairs = r._cullCandidatePairs(ringCoarse)
        console.log(`   [${V.radii}]${V.gh ? '+goalHeading' : ''}: coarse-route ${cMs}ms (${(cMs / Math.max(1, ringCoarse.size)).toFixed(1)}ms/edge, ${fails} failed) · raw coarse crossings ${rawPairs.length}`)
        for (const E of [0, 60, 100, 140]) {
            const coarsePairs = E ? exemptSharedNode(r, ringCoarse, rawPairs, E) : rawPairs
            const coarseSet = new Set(coarsePairs.map(pairKey))
            let caught = 0
            for (const k of fineSet) if (coarseSet.has(k)) caught++
            const falsePos = coarsePairs.length - caught

            const coarseDrops = simCrossingDrops(r, g, coarsePairs)
            let dropBoth = 0
            for (const k of fineDrops) if (coarseDrops.has(k)) dropBoth++
            const fineOnly = fineDrops.size - dropBoth           // missed culls → Phase 4 splices
            const coarseOnly = coarseDrops.size - dropBoth       // wrongly-early-culled edges
            const catchPct = 100 * caught / Math.max(1, fineSet.size)
            console.log(`      E=${String(E).padStart(3)}: CATCH ${caught}/${fineSet.size} (${catchPct.toFixed(0)}%)${catchPct >= 80 ? ' ✓' : ' ✗'} false-pos ${falsePos} · drops: both ${dropBoth} fine-only ${fineOnly} coarse-only ${coarseOnly}`)
        }
    }
}
if (AGREEMENT_ONLY) process.exit(0)

// ── (2) cold-build routing baseline (defaults, cull ON) ─────────────────────────

console.log(`\n━━ (2) COLD-BUILD BASELINE — seed 6, both toggles on, cull ON, 3× ━━`)
let rBase = null
for (let i = 0; i < 3; i++) {
    const STATS = {}
    const r = new RoadSystem(6, P)
    const orig = r._edgeRouteSpec.bind(r)
    r._edgeRouteSpec = (c1, c2) => { const s = orig(c1, c2); s.opts.scStats = STATS; return s }
    const t0 = Date.now()
    r.setRadius(R)
    r.update(new THREE.Vector3(CX, 0, CZ))
    const dt = (Date.now() - t0) / 1000
    const { edges = 0, searches = 0, repairs = 0, unclean = 0 } = STATS
    console.log(`   run ${i + 1}: ${dt.toFixed(1)}s · routes=${edges} searches=${searches} repairs=${repairs} unclean=${unclean}`)
    rBase = r
}
const charBase = characterOf(rBase)
console.log(`   baseline character: ${charLine(charBase)}`)

// ── (3b) fine-route quality per heuristic-flood palette (seed 6 full builds) ────
// The SECOND coarse consumer: the backward flood feeding the fine search's cost-to-go. A gentler
// coarse palette changes the heuristic field → possibly different fine routes. Topology diff +
// character deltas vs the [200,35] baseline (feel-diff verdict guidance: topology identical +
// character deltas < ~2pt = same feel).

console.log(`\n━━ (3) HEURISTIC-FLOOD PALETTE → FINE-ROUTE QUALITY — seed 6 full builds ━━`)
console.log(`   [200,35] (baseline): ${charLine(charBase)}`)
for (const radii of PALETTES.slice(1)) {
    const r = new RoadSystem(6, P)
    const orig = r._edgeRouteSpec.bind(r)
    r._edgeRouteSpec = (c1, c2) => {
        const s = orig(c1, c2)
        if (s.opts.corridorCoarse) s.opts.corridorCoarse = { ...s.opts.corridorCoarse, radii }
        return s
    }
    const t0 = Date.now()
    r.setRadius(R)
    r.update(new THREE.Vector3(CX, 0, CZ))
    const c = characterOf(r)
    let kept = 0
    for (const k of c.keys) if (charBase.keys.has(k)) kept++
    const added = c.keys.size - kept, removed = charBase.keys.size - kept
    console.log(`   [${radii}]: build ${((Date.now() - t0) / 1000).toFixed(1)}s · ${charLine(c)}`)
    console.log(`      topology vs baseline: kept ${kept} · added ${added} · removed ${removed} ${added || removed ? '⚠ TOPOLOGY CHANGED' : '✓ identical'}`)
}
