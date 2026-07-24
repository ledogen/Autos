// test/stroke-spike.mjs — QUAL-21 Stage 0: read-only stroke spike (NOT a gate; rainy-day script).
//
// Measures, WITHOUT changing any routing, whether stroke routing's premise holds:
//   (1) How much would fold? — # strokes, length/edge-count distribution, # deg-2 pass-through
//       nodes folded (each one is a deg-2 connector instance deleted), # deg-≥3 junctions that
//       gain a continuous through-road (fillet ladder simplified), loops/capped splits.
//   (2) Is stroke formation WINDOW-INVARIANT? — form strokes from two stream centers, compare
//       every stroke whose nodes all lie in a shared interior box (the D-16 make-or-break).
//   (3) Self-clear repair BASELINE — route the network cold with scStats injected; the repair
//       re-search count is the documented cold-load floor Task B would attack (and the number
//       Stage 1 strokes may structurally cut).
//
// Run: node test/stroke-spike.mjs

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { formStrokes, throughPairsAt } from '../src/road-graph.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const P = { ...RANGER_PARAMS, roadNetworkMode: 'graph' }
const AMP = P.terrainAmplitude ?? 1

const build = (cx, cz) => { const r = new RoadSystem(6, P); r.setRadius(1600); r.update(new THREE.Vector3(cx, 0, cz)); return r }

// Form strokes over a RoadSystem's persisted band graph. Node h is amplitude-scaled coarse
// height (real metres) so the gradeJump test speaks m/m.
function strokesOf(r) {
    const g = r._proto.graph
    const nodes = new Map()
    const idOf = new Map()
    for (const [a, b] of g.edges) {
        for (const id of [a, b]) {
            const k = g.key(id)
            if (!nodes.has(k)) {
                const p = r._nodePos(id)
                nodes.set(k, { x: p.x, z: p.z, h: r._coarseH(p.x, p.z) * AMP })
                idOf.set(k, id)
            }
        }
    }
    const edges = g.edges.map(([a, b]) => [g.key(a), g.key(b)])
    return { g, nodes, edges, strokes: formStrokes(nodes, edges) }
}

console.log('━━ build A (center 4500,600) ━━')
let t0 = Date.now()
const A = build(4500, 600)
console.log(`   built in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
const SA = strokesOf(A)

// ── (1) fold statistics ─────────────────────────────────────────────────────────
{
    const { nodes, edges, strokes } = SA
    const deg = new Map()
    for (const [a, b] of edges) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1) }
    const degHist = new Map()
    for (const d of deg.values()) degHist.set(d, (degHist.get(d) || 0) + 1)

    let deg2Folded = 0, jxSimplified = 0
    const jxThrough = new Set()
    for (const s of strokes) for (let i = 1; i < s.nodes.length - 1; i++) {
        const d = deg.get(s.nodes[i])
        if (d === 2) deg2Folded++
        else if (d >= 3) jxThrough.add(s.nodes[i])
    }
    jxSimplified = jxThrough.size
    const deg2Total = degHist.get(2) || 0
    const jxTotal = [...deg.values()].filter(d => d >= 3).length

    const edgeCounts = strokes.map(s => s.nodes.length - 1).sort((a, b) => a - b)
    const lens = strokes.map(s => s.len).sort((a, b) => a - b)
    const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))]
    const loops = strokes.filter(s => s.loop).length

    console.log(`\n━━ (1) FOLD STATS (center A) ━━`)
    console.log(`   graph: ${nodes.size} nodes, ${edges.length} edges · degree hist: ${[...degHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d}:${n}`).join(' ')}`)
    console.log(`   strokes: ${strokes.length} (vs ${edges.length} independent edges today — ×${(edges.length / strokes.length).toFixed(2)} fold)`)
    console.log(`   edges/stroke: min ${edgeCounts[0]} · p50 ${pct(edgeCounts, 0.5)} · p90 ${pct(edgeCounts, 0.9)} · max ${edgeCounts[edgeCounts.length - 1]}`)
    console.log(`   stroke chord-len (m): p50 ${pct(lens, 0.5).toFixed(0)} · p90 ${pct(lens, 0.9).toFixed(0)} · max ${lens[lens.length - 1].toFixed(0)}`)
    console.log(`   deg-2 pass-throughs folded: ${deg2Folded}/${deg2Total} (${(100 * deg2Folded / Math.max(1, deg2Total)).toFixed(0)}% — each is a deleted connector instance)`)
    console.log(`   deg-≥3 junctions gaining a through-road: ${jxSimplified}/${jxTotal} (${(100 * jxSimplified / Math.max(1, jxTotal)).toFixed(0)}%)`)
    console.log(`   loop rings split: ${loops ? loops / 2 : 0} · single-edge strokes: ${edgeCounts.filter(n => n === 1).length}`)

    // UNFOLDED deg-2 nodes: every one is a stroke endpoint (maxLen split or graph-frontier cut).
    // These are the nodes where Stage 1 must prescribe a canonical shared terminal HEADING, or the
    // deg-2 kink (and its connector) would survive right there.
    const termCount = new Map()
    for (const s of strokes) for (const k of [s.nodes[0], s.nodes[s.nodes.length - 1]])
        termCount.set(k, (termCount.get(k) || 0) + 1)
    let splitK = 0
    for (const [k, d] of deg) if (d === 2 && (termCount.get(k) || 0) > 0) splitK++
    console.log(`   UNFOLDED deg-2 (stroke split/frontier — need prescribed heading in Stage 1): ${splitK}`)

    // Folded deg-2 bend-angle distribution — how sharp the bends one continuous curve must absorb.
    const bendAt = (kPrev, k, kNext) => {
        const A = nodes.get(kPrev), N = nodes.get(k), B = nodes.get(kNext)
        const ux = N.x - A.x, uz = N.z - A.z, vx = B.x - N.x, vz = B.z - N.z
        const lu = Math.hypot(ux, uz) || 1, lv = Math.hypot(vx, vz) || 1
        return Math.acos(Math.min(1, Math.max(-1, (ux * vx + uz * vz) / (lu * lv)))) * 180 / Math.PI
    }
    const bends = []
    for (const s of strokes) for (let i = 1; i < s.nodes.length - 1; i++)
        if (deg.get(s.nodes[i]) === 2) bends.push(bendAt(s.nodes[i - 1], s.nodes[i], s.nodes[i + 1]))
    bends.sort((a, b) => a - b)
    if (bends.length) console.log(`   folded deg-2 bend deg: p50 ${bends[Math.floor(bends.length / 2)].toFixed(0)} · max ${bends[bends.length - 1].toFixed(0)}`)
}

// ── (1b) threshold sensitivity sweep (formation only — no routing, instant) ─────
{
    const { nodes, edges } = SA
    const deg = new Map()
    for (const [a, b] of edges) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1) }
    const jxTotal = [...deg.values()].filter(d => d >= 3).length
    console.log(`\n━━ (1b) SENSITIVITY: fold ratio / deg-≥3 through % by (maxDevDeg, gradeJump, margin) ━━`)
    for (const margin of [12, 6]) {
        for (const gj of [0.08, 0.15]) {
            const row = []
            for (const dev of [40, 55, 70, 85]) {
                const ss = formStrokes(nodes, edges, { maxDevDeg: dev, gradeJump: gj, runnerUpMargin: margin })
                const jx = new Set()
                for (const s of ss) for (let i = 1; i < s.nodes.length - 1; i++) if (deg.get(s.nodes[i]) >= 3) jx.add(s.nodes[i])
                row.push(`dev≤${dev}: ×${(edges.length / ss.length).toFixed(2)} jx ${(100 * jx.size / jxTotal).toFixed(0)}%`)
            }
            console.log(`   margin ${margin}° gradeJump ${gj}:  ${row.join(' · ')}`)
        }
    }
}

// ── (2) two-window invariance ───────────────────────────────────────────────────
{
    console.log(`\n━━ build B (center 4756,600 — one cell east) ━━`)
    t0 = Date.now()
    const B = build(4756, 600)
    console.log(`   built in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    const SB = strokesOf(B)

    // Same shared interior box as graph-topology.mjs — safely inside both bands' margins.
    const box = { x0: 3800, x1: 5400, z0: -900, z1: 2100 }
    const inBox = (S, k) => { const n = S.nodes.get(k); return n.x >= box.x0 && n.x <= box.x1 && n.z >= box.z0 && n.z <= box.z1 }
    const sig = (s) => s.nodes.join('>')
    const collect = (S) => new Map(S.strokes.filter(s => s.nodes.every(k => inBox(S, k))).map(s => [sig(s), s]))
    const mA = collect(SA), mB = collect(SB)

    let matched = 0
    const onlyA = [], onlyB = []
    for (const k of mA.keys()) (mB.has(k) ? matched++ : onlyA.push(k))
    for (const k of mB.keys()) if (!mA.has(k)) onlyB.push(k)

    // PAIRING-level invariance — the denser, stronger check. A stroke IS its per-node pairing
    // decisions; comparing the paired-through relation at every shared-box node covers every
    // interior node (not just strokes that fit wholly in the box). pairing[n] = the sorted pair of
    // stroke-neighbours n passes through (interior), or per-leg terminal markers.
    const pairingOf = (S) => {
        const m = new Map()
        for (const k of S.nodes.keys()) if (inBox(S, k)) m.set(k, 'TERMINAL')   // default: never interior
        for (const s of S.strokes) {
            for (let i = 1; i < s.nodes.length - 1; i++) {
                const k = s.nodes[i]
                if (!m.has(k)) continue
                m.set(k, [s.nodes[i - 1], s.nodes[i + 1]].sort().join('~'))
            }
        }
        return m
    }
    const pA = pairingOf(SA), pB = pairingOf(SB)
    let pShared = 0, pMismatch = 0
    const mism = []
    for (const [k, v] of pA) {
        if (!pB.has(k)) continue
        pShared++
        if (pB.get(k) !== v) { pMismatch++; mism.push(`${k}: A(${v}) B(${pB.get(k)})`) }
    }

    console.log(`\n━━ (2) TWO-WINDOW INVARIANCE ━━`)
    console.log(`   whole strokes in shared box: A=${mA.size} B=${mB.size} · identical=${matched} · onlyA=${onlyA.length} · onlyB=${onlyB.length}`)
    console.log(`   pass-through pairings at shared-box nodes: shared=${pShared} mismatched=${pMismatch}`)
    if (onlyA.length || onlyB.length || pMismatch) {
        for (const k of onlyA.slice(0, 4)) console.log(`     A-only stroke: ${k}`)
        for (const k of onlyB.slice(0, 4)) console.log(`     B-only stroke: ${k}`)
        for (const m of mism.slice(0, 6)) console.log(`     pairing mismatch: ${m}`)
        console.log(`   ✗ INVARIANCE HOLE — investigate before Stage 1`)
    } else {
        console.log(`   ✓ stroke formation window-invariant (whole strokes + per-node pairings)`)
    }
}

// ── (3) self-clear repair baseline ──────────────────────────────────────────────
{
    console.log(`\n━━ (3) SELF-CLEAR REPAIR BASELINE (fresh cold build, scStats injected) ━━`)
    const STATS = {}
    const r3 = new RoadSystem(6, P)
    const orig = r3._edgeRouteSpec.bind(r3)
    r3._edgeRouteSpec = (c1, c2) => { const s = orig(c1, c2); s.opts.scStats = STATS; return s }
    t0 = Date.now()
    r3.setRadius(1600)
    r3.update(new THREE.Vector3(4500, 0, 600))
    const dt = (Date.now() - t0) / 1000
    const { edges = 0, searches = 0, repairs = 0, unclean = 0 } = STATS
    console.log(`   cold build ${dt.toFixed(1)}s · routes=${edges} searches=${searches} REPAIR re-searches=${repairs} (${(100 * repairs / Math.max(1, searches)).toFixed(0)}% of searches) · unclean-accepted=${unclean}`)
    console.log(`   (repairs is the Task B floor; Stage 1 strokes should push it toward 0)`)
}

// ── (4) QUAL-21 Stage 1 KINK CENSUS (flag ON) ───────────────────────────────────
// With roadStrokeRouting on, both edges at a through-paired node prescribe the same canonical
// heading — so the per-deg-2-node kink between the two REGISTERED runs (measured from routed
// points, not chords) should sit ≈100% under the 9° deg-2 connector admission
// (roadJunctionKinkDeg), i.e. the connector no-ops network-wide. Also reports the worst
// through-pair CHORD bend at deg-3/4 (the maximal-pairing risk metric — a pair the κ² router
// must absorb as one continuous curve) and the self-clear repair count vs the flag-off
// baseline in (3).
{
    console.log(`\n━━ (4) STAGE 1 KINK CENSUS (fresh cold build, roadStrokeRouting: true) ━━`)
    const STATS = {}
    const r4 = new RoadSystem(6, { ...P, roadStrokeRouting: true })
    const orig = r4._edgeRouteSpec.bind(r4)
    r4._edgeRouteSpec = (c1, c2) => { const s = orig(c1, c2); s.opts.scStats = STATS; return s }
    t0 = Date.now()
    r4.setRadius(1600)
    r4.update(new THREE.Vector3(4500, 0, 600))
    console.log(`   cold build ${((Date.now() - t0) / 1000).toFixed(1)}s`)

    const g = r4._proto.graph
    // Registered runs incident to each node key.
    const runsAt = new Map()
    for (const [, e] of r4._network) {
        if (!e.cellA || !e.cellB || !e.points || e.points.length < 2) continue
        for (const id of [e.cellA, e.cellB]) {
            const k = g.key(id)
            if (!runsAt.has(k)) runsAt.set(k, [])
            runsAt.get(k).push({ e, id })
        }
    }
    // Routed leave-heading of run e at its endpoint node id (from the sampled points).
    const leaveHeading = (e, id) => {
        const pts = e.points, P = r4._nodePos(id)
        const d0 = Math.hypot(pts[0].x - P.x, pts[0].z - P.z)
        const dN = Math.hypot(pts[pts.length - 1].x - P.x, pts[pts.length - 1].z - P.z)
        const [a, b] = d0 <= dN ? [pts[0], pts[1]] : [pts[pts.length - 1], pts[pts.length - 2]]
        return Math.atan2(b.z - a.z, b.x - a.x)
    }
    const KINK_ADMIT = 9   // deg — the deg-2 connector's roadJunctionKinkDeg admission
    const kinkBetween = (h1, h2) => {
        let d = Math.abs(h1 - h2) * 180 / Math.PI
        d = d % 360; if (d > 180) d = 360 - d
        return Math.abs(180 - d)   // 0 = the two legs leave in exactly opposite directions
    }
    // Two kink measures per deg-2 node:
    //   prescribed — from _edgeLeaveHeading (the route-spec terminal headings). 0 = the Stage 1
    //     mechanism landed (both legs through-paired with each other). >0 = the pairing MISSED the
    //     registered topology — in practice a leg the crossing/clearance cull removed after
    //     routing (those passes read routed geometry, so the pure pairing cannot see them).
    //   measured — from the routed points' first chord, which is exactly what the connector
    //     admission tests. Includes legitimate in-run curvature at the node (a hardR Dubins arc
    //     ending at the node reads as ~ds/(2R) ≈ 11° of chord deflection with zero actual
    //     tangent kink), so it overshoots prescribed at curvy endpoints.
    const kinks = [], kinksPresc = []
    let over = 0, prescMiss = 0
    for (const [k, runs] of runsAt) {
        if ((g.adj.get(k)?.size ?? 0) !== 2 || runs.length !== 2) continue
        const id = k.split(',').map(Number)
        const other = (x) => x.id === x.e.cellA ? x.e.cellB : x.e.cellA
        const kM = kinkBetween(leaveHeading(runs[0].e, runs[0].id), leaveHeading(runs[1].e, runs[1].id))
        const kP = kinkBetween(r4._edgeLeaveHeading(id, other(runs[0])), r4._edgeLeaveHeading(id, other(runs[1])))
        kinks.push(kM); kinksPresc.push(kP)
        if (kM >= KINK_ADMIT) over++
        if (kP > 0.5) prescMiss++
    }
    kinks.sort((a, b) => a - b); kinksPresc.sort((a, b) => a - b)
    const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : NaN
    console.log(`   deg-2 nodes measured: ${kinks.length}`)
    console.log(`   PRESCRIBED kink (mechanism): p50 ${pct(kinksPresc, 0.5).toFixed(2)}° · max ${kinksPresc.length ? kinksPresc[kinksPresc.length - 1].toFixed(2) : '—'}° · pairing-missed nodes: ${prescMiss}/${kinksPresc.length} (cull-created deg-2s)`)
    console.log(`   MEASURED first-chord kink (connector admission): p50 ${pct(kinks, 0.5).toFixed(2)}° · p90 ${pct(kinks, 0.9).toFixed(2)}° · max ${kinks.length ? kinks[kinks.length - 1].toFixed(2) : '—'}°`)
    console.log(`   under ${KINK_ADMIT}° admission: ${kinks.length - over}/${kinks.length} (${(100 * (kinks.length - over) / Math.max(1, kinks.length)).toFixed(1)}%)`)
    if (over) for (const kk of kinks.filter(x => x >= KINK_ADMIT).slice(-5)) console.log(`     over-admission kink: ${kk.toFixed(1)}°`)

    // STAGE 2 PREVIEW: worst through-pair chord bend at deg-3/4 under maximal pairing (computed
    // directly with throughPairsAt over the band adjacency — the SHIPPED Stage 1 override is
    // deg-2-only, so these pairs are what the Stage 2 junction rework would absorb).
    const AMP2 = P.terrainAmplitude ?? 1
    const bends = []
    for (const k of runsAt.keys()) {
        const nbrs = g.adj.get(k)
        if ((nbrs?.size ?? 0) < 3) continue
        const id = k.split(',').map(Number)
        const N = r4._nodePos(id)
        const node = { x: N.x, z: N.z, h: r4._coarseH(N.x, N.z) * AMP2 }
        const legs = [...nbrs].sort().map(nk2 => {
            const q = r4._nodePos(nk2.split(',').map(Number))
            return { key: nk2, x: q.x, z: q.z, h: r4._coarseH(q.x, q.z) * AMP2 }
        })
        for (const [a, b] of throughPairsAt(node, legs)) {
            const A = r4._nodePos(a.split(',').map(Number)), B = r4._nodePos(b.split(',').map(Number))
            const ux = N.x - A.x, uz = N.z - A.z, vx = B.x - N.x, vz = B.z - N.z
            const lu = Math.hypot(ux, uz) || 1, lv = Math.hypot(vx, vz) || 1
            bends.push(Math.acos(Math.min(1, Math.max(-1, (ux * vx + uz * vz) / (lu * lv)))) * 180 / Math.PI)
        }
    }
    bends.sort((a, b) => a - b)
    console.log(`   deg-≥3 through-pair chord bend (STAGE 2 preview, not routed): n=${bends.length} · p50 ${pct(bends, 0.5).toFixed(0)}° · p90 ${pct(bends, 0.9).toFixed(0)}° · max ${bends.length ? bends[bends.length - 1].toFixed(0) : '—'}°`)

    const { searches = 0, repairs = 0, unclean = 0 } = STATS
    console.log(`   self-clear: searches=${searches} REPAIR re-searches=${repairs} unclean-accepted=${unclean} (vs the flag-off baseline in (3))`)
}
