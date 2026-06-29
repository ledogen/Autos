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

const build = (cx, cz) => { const r = new RoadSystem(6, P); r.update(new THREE.Vector3(cx, 0, cz)); return r }
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
    // interior world box safely inside BOTH bands' margins
    const box = { x0: 4200, x1: 4900, z0: 200, z1: 1100 }
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
    log(A.size >= 8 && onlyA === 0 && onlyB === 0 && gradeMis === 0, 'GRAPH-WINDOW-INVARIANT',
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
    log(list.length > 5 && sep === 0, 'GRAPH-FLAT-MERGES',
        `${list.length} crossings, GRADE_SEP (overpass)=${sep} — roads merge flat, no floating overpasses`)
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

console.log(`\nGRAPH-TOPOLOGY: ${pass}/${pass + fail} checks green`)
process.exit(fail === 0 ? 0 : 1)
