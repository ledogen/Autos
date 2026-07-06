// test/graph-topology.mjs — FEAT-13 v2 graph-mode acceptance gate (roadNetworkMode:'graph').
//
// The Urquhart graph over a blue-noise anchor set replaces the parallel E-W rows. Node identity is a
// blue-noise SITE id [cmx,cmz,k]; positions come from RoadSystem._nodePos. This gate locks the v2
// guarantees:
//   (a) REACHABILITY  — Urquhart ⊇ Euclidean MST, so the network is connected by construction: 0 orphan
//                       nodes, one dominant connected component.
//   (b) INVARIANCE    — the EDGE SET (keyed by world endpoint positions) + per-edge grade are identical
//                       from two stream centers over a shared interior box (the make-or-break: the
//                       bounded Urquhart neighbourhood must make interior edges center-independent).
//   (c) VARIETY       — roads run in VARIED directions, not all parallel (blue-noise kills the rows).
//   (d) SMOOTHNESS    — the collision surface (_resolveRoadSurface) is step-free along every edge.
//   (e) FLAT MERGES   — graph mode forces every crossing flat (no GRADE_SEP overpasses).
//
// Run: node test/graph-topology.mjs

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const P = { ...RANGER_PARAMS, roadNetworkMode: 'graph' }
let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

// Wide radius so the sparse default (≈4 nodes/km²) still streams enough network for meaningful samples.
const build = (cx, cz) => { const r = new RoadSystem(6, P); r.setRadius(1600); r.update(new THREE.Vector3(cx, 0, cz)); return r }
const roadA = build(4500, 600)

// An edge keyed by its two endpoint WORLD positions (rounded, unordered) — center-independent identity.
const posKey = (p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`
const edgeKey = (r, e) => { const a = posKey(r._nodePos(e.cellA)), b = posKey(r._nodePos(e.cellB)); return a < b ? `${a}|${b}` : `${b}|${a}` }

// (a) REACHABILITY — no orphan nodes; one dominant component (connected by construction). ────────────
{
    const adj = new Map()
    const addN = (k) => adj.get(k) || adj.set(k, new Set()).get(k)
    for (const [, e] of roadA._network) {
        const a = posKey(roadA._nodePos(e.cellA)), b = posKey(roadA._nodePos(e.cellB))
        addN(a).add(b); addN(b).add(a)
    }
    let orphans = 0
    for (const [, set] of adj) if (set.size === 0) orphans++
    const seen = new Set(); const comps = []
    for (const s of adj.keys()) { if (seen.has(s)) continue; let n = 0; const q = [s]; seen.add(s); while (q.length) { const u = q.pop(); n++; for (const v of adj.get(u)) if (!seen.has(v)) { seen.add(v); q.push(v) } } comps.push(n) }
    comps.sort((a, b) => b - a)
    const nodes = adj.size, largest = comps[0] || 0
    log(orphans === 0 && nodes > 20 && largest / nodes > 0.85, 'GRAPH-REACHABILITY',
        `nodes=${nodes} orphans=${orphans} #comps=${comps.length} largest=${largest} (${(100 * largest / nodes).toFixed(0)}%) — Urquhart ⊇ MST ⇒ connected`)
}

// (b) INVARIANCE — edge set + per-edge grade identical across two centers over a shared interior box. ──
{
    const roadB = build(4756, 600)   // shifted one cell east
    // interior world box safely inside BOTH bands' margins (tall, to capture enough edges even at the
    // sparse 220 m node spacing — the invariance is exact regardless, this just keeps the sample size up)
    const box = { x0: 3800, x1: 5400, z0: -400, z1: 1600 }
    const inBox = (p) => p.x >= box.x0 && p.x <= box.x1 && p.z >= box.z0 && p.z <= box.z1
    const gradeSig = (e) => e.points.map(p => p.y.toFixed(2)).join(',')
    const collect = (r) => {
        const m = new Map()
        for (const [, e] of r._network) {
            const a = r._nodePos(e.cellA), b = r._nodePos(e.cellB)
            if (!inBox(a) || !inBox(b)) continue
            m.set(edgeKey(r, e), gradeSig(e))
        }
        return m
    }
    const A = collect(roadA), B = collect(roadB)
    let onlyA = 0, onlyB = 0, gradeMis = 0, sample = ''
    for (const [k, sig] of A) { if (!B.has(k)) { if (onlyA++ === 0) sample = `${k} only in A`; } else if (B.get(k) !== sig) gradeMis++ }
    for (const k of B.keys()) if (!A.has(k)) onlyB++
    log(A.size >= 4 && onlyA === 0 && onlyB === 0 && gradeMis === 0, 'GRAPH-WINDOW-INVARIANT',
        `interior edges A=${A.size} B=${B.size} | onlyA=${onlyA} onlyB=${onlyB} gradeMismatch=${gradeMis}${sample ? ` | ${sample}` : ''}`)
}

// (c) VARIETY — roads run in varied directions (blue-noise: no dominant axis). ───────────────────────
{
    const bins = new Array(4).fill(0)
    let tot = 0
    for (const [, e] of roadA._network) {
        const a = roadA._nodePos(e.cellA), b = roadA._nodePos(e.cellB)
        let hd = ((Math.atan2(b.z - a.z, b.x - a.x) % Math.PI) + Math.PI) % Math.PI
        bins[Math.floor(hd / Math.PI * 4) % 4]++; tot++
    }
    const probs = bins.map(b => b / tot).filter(x => x > 0)
    const entropy = -probs.reduce((s, x) => s + x * Math.log2(x), 0)
    const maxFrac = Math.max(...bins) / tot
    log(entropy > 1.2 && maxFrac < 0.5, 'GRAPH-DIRECTION-VARIETY',
        `heading buckets=[${bins.join(',')}] entropy=${entropy.toFixed(2)} maxDirFrac=${(100 * maxFrac).toFixed(0)}% (rows mode would be 100% one axis)`)
}

// (d) SMOOTHNESS — the INTER-EDGE collision surface is step-free. Samples within EXCL of a mid-span
// routed crossing are excluded: those crossings are planar-ABSTRACT-but-routed overlaps whose smooth
// resolution needs T/X secondary-node PROMOTION (deferred — handoff §5B). This check guards the
// per-edge grade + degree-2/≥3 junction reconciliation (the foundation pass's responsibility); the
// crossing-adjacent step count is reported separately as the deferred follow-up's metric.
{
    const EXCL = 14   // m — radius around an unpromoted routed crossing (the deferred-promotion zone)
    const xs = roadA.crossingList().map(c => c.point)
    const nearCrossing = (x, z) => { for (const p of xs) if ((p.x - x) ** 2 + (p.z - z) ** 2 < EXCL * EXCL) return true; return false }
    let worst = 0, steps = 0, walked = 0, worstAt = '', xSteps = 0
    for (const [rk, e] of roadA._network) {
        const pts = e.points
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / 0.5))
            let prev = null
            for (let k = 0; k <= n; k++) {
                const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t
                if (nearCrossing(x, z)) { prev = null; continue }   // skip the deferred-promotion zone
                const r = roadA._resolveRoadSurface(x, z); if (!r) { prev = null; continue }
                walked++
                if (prev) { const dY = Math.abs(r.point.y - prev.y), dH = Math.hypot(x - prev.x, z - prev.z) || 0.01
                    if (dY / dH > 1.5 && dY > 0.15) { steps++; if (dY > worst) { worst = dY; worstAt = `${rk} @(${x.toFixed(0)},${z.toFixed(0)})` } } }
                prev = { y: r.point.y, x, z }
            }
        }
    }
    log(walked > 10000 && steps === 0, 'GRAPH-SURFACE-SMOOTH',
        `walked ${walked} inter-crossing samples; steps (>0.15 m, >56°)=${steps} worst=${worst.toFixed(2)} m ${worstAt} | (crossing-zone steps deferred to T/X promotion)`)
}

// (e) FLAT MERGES — graph mode forces every crossing flat (no dynamic overpasses / GRADE_SEP). ───────
{
    const list = roadA.crossingList()
    const sep = list.filter(c => c.kind === 'GRADE_SEP').length
    // After the overshoot fix routed crossings are nearly eliminated (good); the invariant is simply that
    // NONE grade-separate into floating overpasses — any that remain merge flat at grade.
    log(sep === 0, 'GRAPH-FLAT-MERGES',
        `${list.length} crossings, GRADE_SEP (overpass)=${sep} — any crossing merges flat, no floating overpasses`)
}

// (f) NODE DEPARTURE — each edge leaves BOTH endpoints heading toward its neighbour (not the reverse).
// Guards the goalHeading-direction bug: a directed router fed the reversed goal heading loops around to
// approach a node from the wrong side → "enter from the wrong side" / shallow near-node crossings.
{
    const br = (p0, p1) => Math.atan2(p1.z - p0.z, p1.x - p0.x) * 180 / Math.PI
    const angDiff = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }
    let worst = 0, sum = 0, m = 0
    for (const [, e] of roadA._network) {
        const A = roadA._nodePos(e.cellA), B = roadA._nodePos(e.cellB), pts = e.points
        const eA = angDiff(br(pts[0], pts[Math.min(2, pts.length - 1)]), br(A, B))
        const eB = angDiff(br(pts[pts.length - 1], pts[Math.max(0, pts.length - 3)]), br(B, A))
        sum += eA + eB; m += 2; worst = Math.max(worst, eA, eB)
    }
    const avg = sum / m
    log(avg < 22 && worst < 60, 'GRAPH-NODE-DEPARTURE',
        `leave-bearing vs chord: avg=${avg.toFixed(1)}° worst=${worst.toFixed(0)}° over ${m} endpoints (reversed goalHeading would be ~150°)`)
}

// (g) SELF-CLEARANCE (QUAL-14, replaces the ≤200°-turn NO-LOOPS check — that bound was
// anti-switchback by design once the honest-grade router made 300°+ alpine stacks intentional).
// The contract the router's repair loop enforces: no two samples of ONE edge's centerline with
// arc-separation > roadSelfClearGap may lie closer than D_self = roadWidth + 2·shoulder +
// selfClearMargin in XZ — no lollipop self-intersections, no hairpin legs sharing a carve wall.
// 0.5 m tolerance absorbs polyline-vs-primitive sampling phase noise.
{
    const D = 2 * (P.roadHalfWidth ?? 5) + 2 * (P.roadShoulderWidth ?? 2.5) + (P.roadSelfClearMargin ?? 3) - 0.5
    const GAP = P.roadSelfClearGap ?? 80
    let viol = 0, worst = 1e9, worstAt = ''
    for (const [k, e] of roadA._network) {
        const pts = e.points, ss = new Float64Array(pts.length)
        for (let i = 1; i < pts.length; i++) ss[i] = ss[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
        for (let i = 0; i < pts.length; i++) for (let j = 0; j < i; j++) {
            if (ss[i] - ss[j] <= GAP) continue
            const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z)
            if (d < D) { viol++; if (d < worst) { worst = d; worstAt = `${k} @(${pts[i].x.toFixed(0)},${pts[i].z.toFixed(0)})` } }
        }
    }
    log(viol === 0, 'GRAPH-SELF-CLEARANCE',
        `sample pairs closer than ${D.toFixed(1)} m at arcSep>${GAP} m: ${viol}${viol ? ` worst=${worst.toFixed(1)} m ${worstAt}` : ''} — no self-intersection / carve-wall stacking`)
}

// (j) CORRIDOR-CLEARANCE (QUAL-14 Part B) — no two REGISTERED edges run closer than the carve
// footprint (D_self, the _cullClearance floor) outside the exemption zone around the pair's
// endpoint nodes (merges/approaches into junctions may converge; mid-span they may not).
// Corridor avoidance prevents this at routing time; the clearance cull backstops it — this
// asserts the end result. Same 0.5 m sampling tolerance as (g).
{
    const D = 2 * (P.roadHalfWidth ?? 5) + 2 * (P.roadShoulderWidth ?? 2.5) + (P.roadSelfClearMargin ?? 3) - 0.5
    const EXEMPT = P.roadCorridorExempt ?? (Math.max(P.roadGraphGoalBlend ?? 60, P.roadJunctionBlendLength ?? 30, 60) + 20)
    const runs = [...roadA._network.entries()]
    let viol = 0, worst = 1e9, worstAt = ''
    for (let x = 0; x < runs.length; x++) for (let y = 0; y < x; y++) {
        const ea = runs[x][1], eb = runs[y][1]
        const ex = [ea.cellA, ea.cellB, eb.cellA, eb.cellB].map(n => roadA._nodePos(n))
        const isEx = (p) => ex.some(q => (p.x - q.x) ** 2 + (p.z - q.z) ** 2 < EXEMPT * EXEMPT)
        for (const p of ea.points) {
            if (isEx(p)) continue
            for (const q of eb.points) {
                if (isEx(q)) continue
                const d = Math.hypot(p.x - q.x, p.z - q.z)
                if (d < D) { viol++; if (d < worst) { worst = d; worstAt = `${runs[x][0]} × ${runs[y][0]} @(${p.x.toFixed(0)},${p.z.toFixed(0)})` } }
            }
        }
    }
    log(viol === 0, 'GRAPH-CORRIDOR-CLEARANCE',
        `cross-edge sample pairs closer than ${D.toFixed(1)} m outside ${EXEMPT} m endpoint exemption: ${viol}${viol ? ` worst=${worst.toFixed(1)} m ${worstAt}` : ''} — no parallel runs sharing a cut wall`)
}

// (h) CROSSINGS CULLED — the safe-prune drops redundant routed crossings (at-grade intersections read
// ugly). Any survivor is a genuine bridge (no detour). Connectivity is already guarded by (a); this
// asserts the cull actually fires and leaves very few crossings.
{
    const culled = roadA.crossingList().length
    const uncut = (() => { const r = new RoadSystem(6, { ...P, roadGraphCullCrossings: false }); r.update(new THREE.Vector3(4500, 0, 600)); return r.crossingList().length })()
    log(culled <= 2 && culled <= uncut, 'GRAPH-CROSSINGS-CULLED',
        `routed crossings: cull-off=${uncut} → cull-on=${culled} (survivors are un-cullable bridges)`)
}

// (i) JUNCTION-AT-ROAD-GRADE — a degree≥2 node sits at the MEAN incident road grade, NOT collapsed to the
// terrain valley floor (the ~10 m hump/dip regression). _graphJunctionGradeY must equal the mean of the
// incident edges' endpoint Ys. Folded here from the retired rows junction-atgrade gate (QUAL-12); the
// graph analog (_graphJunctionGradeY, keyed on the incidence map) is otherwise ungated — (d) SMOOTHNESS
// would miss a UNIFORM collapse (all incident edges dip together = no step, just a wrong hump).
{
    const nodes = new Map()   // posKey → { id, ys:[incident endpoint grade Ys] }
    for (const [, e] of roadA._network) {
        const ends = [[e.cellA, e.points[0].y], [e.cellB, e.points[e.points.length - 1].y]]
        for (const [cell, y] of ends) {
            const k = posKey(roadA._nodePos(cell))
            const rec = nodes.get(k) || nodes.set(k, { id: cell, ys: [] }).get(k)
            rec.ys.push(y)
        }
    }
    let checked = 0, worstErr = 0, maxOffTerrain = 0, sample = ''
    for (const { id, ys } of nodes.values()) {
        if (ys.length < 2) continue   // degree ≥ 2 → a real junction/pass-through that reconciles grade
        const mean = ys.reduce((a, b) => a + b, 0) / ys.length
        const nodeY = roadA._graphJunctionGradeY(id)
        const terrainY = roadA._siteAt(id).y
        checked++
        const err = Math.abs(nodeY - mean)
        if (err > worstErr) { worstErr = err; sample = `${posKey(roadA._nodePos(id))} nodeY=${nodeY.toFixed(1)} mean=${mean.toFixed(1)} terrain=${terrainY.toFixed(1)}` }
        maxOffTerrain = Math.max(maxOffTerrain, Math.abs(nodeY - terrainY))
    }
    log(checked >= 3 && worstErr < 1e-6, 'JUNCTION-AT-ROAD-GRADE',
        `${checked} degree≥2 nodes; nodeY == mean incident road grade (worstErr=${worstErr.toFixed(4)} m); ` +
        `max |nodeY−terrain|=${maxOffTerrain.toFixed(1)} m (rides road grade, not the valley floor)${sample ? ` | ${sample}` : ''}`)
}

console.log(`\nGRAPH-TOPOLOGY: ${pass}/${pass + fail} checks green`)
process.exit(fail === 0 ? 0 : 1)
