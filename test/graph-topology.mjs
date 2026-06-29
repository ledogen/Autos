// test/graph-topology.mjs — FEAT-13 graph-mode acceptance gate (roadNetworkMode:'graph').
//
// The per-anchor directional graph replaces the parallel E-W rows. This gate locks its four guarantees:
//   (a) REACHABILITY  — no orphan anchors (every in-band cell has ≥1 incident edge), and the network
//                       forms large connected components (connected-leaning, not a dust of singletons).
//   (b) INVARIANCE    — the edge set + per-edge grade are identical from two stream centers (D-16; the
//                       graph is a pure fn of (seed, cell, params) → no popping when streaming).
//   (c) VARIETY       — roads run in VARIED directions, not all parallel (the whole point): both lattice
//                       axes are well represented (the rows generator would be 100% one axis).
//   (d) SMOOTHNESS    — the collision surface (_resolveRoadSurface) is step-free along every edge, so
//                       per-edge grading + the degree-2/≥3 junction reconciliation don't tear the road.
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

// (a) REACHABILITY — no orphan cells; large components. ──────────────────────────────────────────
{
    let orphans = 0, cells = 0
    for (let mx = 12; mx <= 24; mx++) for (let mz = -2; mz <= 6; mz++) { cells++; if (roadA._graphAnchorDegree(mx, mz) < 1) orphans++ }
    // component analysis over the registered network (graph keys "g:c1:c2")
    const adj = new Map()
    const add = (a, b) => { (adj.get(a) || adj.set(a, new Set()).get(a)).add(b) }
    for (const [, e] of roadA._network) { const a = e.cellA + '', b = e.cellB + ''; add(a, b); add(b, a) }
    const seen = new Set(); const comps = []
    for (const s of adj.keys()) { if (seen.has(s)) continue; let n = 0; const q = [s]; seen.add(s); while (q.length) { const u = q.pop(); n++; for (const v of adj.get(u)) if (!seen.has(v)) { seen.add(v); q.push(v) } } comps.push(n) }
    comps.sort((a, b) => b - a)
    const nodes = adj.size, largest = comps[0] || 0
    log(orphans === 0 && largest / nodes > 0.4, 'GRAPH-REACHABILITY',
        `${cells} core cells, orphans=${orphans}; nodes=${nodes} #comps=${comps.length} largest=${largest} (${(100 * largest / nodes).toFixed(0)}%)`)
}

// (b) INVARIANCE — edge set + per-edge grade identical across two centers (common region). ──────────
{
    const roadB = build(4756, 600)
    const inReg = (c) => c[0] >= 15 && c[0] <= 20 && c[1] >= 1 && c[1] <= 4   // safely interior of BOTH bands
    const edgeReg = (e) => inReg(e.cellA) && inReg(e.cellB)
    const gradeSig = (e) => e.points.map(p => p.y.toFixed(3)).join(',')
    const A = new Map(), B = new Map()
    for (const [k, e] of roadA._network) if (edgeReg(e)) A.set(k, gradeSig(e))
    for (const [k, e] of roadB._network) if (edgeReg(e)) B.set(k, gradeSig(e))
    let onlyA = 0, onlyB = 0, gradeMis = 0, sample = ''
    for (const [k, sig] of A) { if (!B.has(k)) { if (onlyA++ === 0) sample = `${k} only in A`; } else if (B.get(k) !== sig) gradeMis++ }
    for (const k of B.keys()) if (!A.has(k)) onlyB++
    log(A.size >= 5 && onlyA === 0 && onlyB === 0 && gradeMis === 0, 'GRAPH-WINDOW-INVARIANT',
        `region edges A=${A.size} B=${B.size} | onlyA=${onlyA} onlyB=${onlyB} gradeMismatch=${gradeMis}${sample ? ` | ${sample}` : ''}`)
}

// (c) VARIETY — roads run in varied directions (both lattice axes well represented). ────────────────
{
    const bins = new Array(4).fill(0)   // heading bucket mod 180° into 4
    let tot = 0
    for (const [, e] of roadA._network) {
        const a = roadA._protoAnchor(e.cellA[0], e.cellA[1]), b = roadA._protoAnchor(e.cellB[0], e.cellB[1])
        let hd = ((Math.atan2(b.z - a.z, b.x - a.x) % Math.PI) + Math.PI) % Math.PI
        bins[Math.floor(hd / Math.PI * 4) % 4]++; tot++
    }
    const probs = bins.map(b => b / tot).filter(x => x > 0)
    const entropy = -probs.reduce((s, x) => s + x * Math.log2(x), 0)   // 0 = all one direction; >1 = varied
    const maxFrac = Math.max(...bins) / tot
    log(entropy > 0.8 && maxFrac < 0.75, 'GRAPH-DIRECTION-VARIETY',
        `heading buckets=[${bins.join(',')}] entropy=${entropy.toFixed(2)} maxDirFrac=${(100 * maxFrac).toFixed(0)}% (rows mode would be 100% one axis)`)
}

// (d) SMOOTHNESS — collision surface is step-free along every edge. ─────────────────────────────────
{
    let worst = 0, steps = 0, walked = 0, worstAt = ''
    for (const [rk, e] of roadA._network) {
        const pts = e.points
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / 0.5))
            let prev = null
            for (let k = 0; k <= n; k++) {
                const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t
                const r = roadA._resolveRoadSurface(x, z); if (!r) { prev = null; continue }
                walked++
                if (prev) { const dY = Math.abs(r.point.y - prev.y), dH = Math.hypot(x - prev.x, z - prev.z) || 0.01
                    if (dY / dH > 1.5 && dY > 0.15) { steps++; if (dY > worst) { worst = dY; worstAt = `${rk} @(${x.toFixed(0)},${z.toFixed(0)})` } } }
                prev = { y: r.point.y, x, z }
            }
        }
    }
    log(walked > 10000 && steps === 0, 'GRAPH-SURFACE-SMOOTH',
        `walked ${walked} samples; collision-only steps (>0.15 m, >56°)=${steps} worst=${worst.toFixed(2)} m ${worstAt}`)
}

// (e) FLAT MERGES — graph mode forces every crossing flat (no dynamic overpasses / GRADE_SEP). ───────
{
    const list = roadA.crossingList()
    const sep = list.filter(c => c.kind === 'GRADE_SEP').length
    log(list.length > 10 && sep === 0, 'GRAPH-FLAT-MERGES',
        `${list.length} crossings, GRADE_SEP (overpass)=${sep} — roads merge flat, no floating overpasses`)
}

console.log(`\nGRAPH-TOPOLOGY: ${pass}/${pass + fail} checks green`)
process.exit(fail === 0 ? 0 : 1)
