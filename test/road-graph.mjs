// test/road-graph.mjs — FEAT-13 v2 geometry primitive gate (src/road-graph.js).
//
// The Urquhart-over-Delaunay graph is the backbone of road network v2, so its two pure
// primitives get a standalone unit gate (no RoadSystem, no THREE — just the math):
//   (a) DELAUNAY-EMPTY-CIRCLE — every triangle's circumcircle is empty (the defining
//                               property; a valid Delaunay triangulation).
//   (b) URQUHART-SPANS        — Urquhart ⊇ Euclidean MST, so the graph is connected by
//                               construction (no orphans) — the reachability guarantee.
//   (c) DETERMINISM           — same point SET in any input order ⇒ identical edge set
//                               (window-invariance depends on this).
//
// Run: node test/road-graph.mjs

import { delaunay, urquhartEdges } from '../src/road-graph.js'

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

// Deterministic pseudo-random blue-ish point cloud (mulberry32).
function cloud(seed, n, span) {
    let s = seed >>> 0
    const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
    const pts = []
    for (let i = 0; i < n; i++) pts.push([rnd() * span, rnd() * span])
    return pts
}

const pts = cloud(12345, 60, 1000)

// (a) DELAUNAY-EMPTY-CIRCLE — no point lies strictly inside any triangle's circumcircle.
{
    const tris = delaunay(pts)
    let violations = 0, worst = 0
    for (const [a, b, c] of tris) {
        // circumcenter of (a,b,c)
        const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1], cx = pts[c][0], cy = pts[c][1]
        const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
        if (Math.abs(d) < 1e-9) continue
        const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
        const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
        const r2 = (ax - ux) * (ax - ux) + (ay - uy) * (ay - uy)
        for (let p = 0; p < pts.length; p++) {
            if (p === a || p === b || p === c) continue
            const dd = (pts[p][0] - ux) * (pts[p][0] - ux) + (pts[p][1] - uy) * (pts[p][1] - uy)
            if (dd < r2 - 1e-6) { violations++; worst = Math.max(worst, Math.sqrt(r2) - Math.sqrt(dd)) }
        }
    }
    log(tris.length > 80 && violations === 0, 'DELAUNAY-EMPTY-CIRCLE',
        `${tris.length} triangles; circumcircle violations=${violations} worst=${worst.toFixed(3)}`)
}

// (b) URQUHART-SPANS — every Euclidean-MST edge is present in the Urquhart graph.
{
    const tris = delaunay(pts)
    const edges = urquhartEdges(pts, tris)
    const eset = new Set(edges.map(([i, j]) => i < j ? `${i},${j}` : `${j},${i}`))
    // Euclidean MST via Prim over the FULL point set (n small).
    const n = pts.length
    const inT = new Array(n).fill(false)
    const best = new Array(n).fill(Infinity), from = new Array(n).fill(-1)
    best[0] = 0
    const mst = []
    for (let it = 0; it < n; it++) {
        let u = -1
        for (let v = 0; v < n; v++) if (!inT[v] && (u === -1 || best[v] < best[u])) u = v
        inT[u] = true
        if (from[u] !== -1) mst.push(u < from[u] ? `${u},${from[u]}` : `${from[u]},${u}`)
        for (let v = 0; v < n; v++) if (!inT[v]) {
            const d = (pts[u][0] - pts[v][0]) ** 2 + (pts[u][1] - pts[v][1]) ** 2
            if (d < best[v]) { best[v] = d; from[v] = u }
        }
    }
    let missing = 0
    for (const e of mst) if (!eset.has(e)) missing++
    log(missing === 0 && edges.length >= mst.length, 'URQUHART-SPANS-MST',
        `urquhart edges=${edges.length} mst edges=${mst.length} missing-from-urquhart=${missing} (Urquhart ⊇ MST ⇒ connected)`)
}

// (c) DETERMINISM — shuffling the input order yields the identical edge set.
{
    const tris0 = delaunay(pts)
    const e0 = new Set(urquhartEdges(pts, tris0).map(([i, j]) => `${pts[i][0].toFixed(3)},${pts[i][1].toFixed(3)}|${pts[j][0].toFixed(3)},${pts[j][1].toFixed(3)}`))
    // shuffle a copy (and remap to compare by coordinate, not index)
    const perm = pts.map((p, i) => i).sort(() => Math.random() - 0.5)
    const shuf = perm.map(i => pts[i])
    const tris1 = delaunay(shuf)
    const e1 = new Set(urquhartEdges(shuf, tris1).map(([i, j]) => `${shuf[i][0].toFixed(3)},${shuf[i][1].toFixed(3)}|${shuf[j][0].toFixed(3)},${shuf[j][1].toFixed(3)}`))
    // edges are coordinate-keyed but unordered within a pair; canonicalize
    const canon = (s) => new Set([...s].map(k => { const [a, b] = k.split('|'); return a < b ? `${a}|${b}` : `${b}|${a}` }))
    const ca = canon(e0), cb = canon(e1)
    let diff = 0
    for (const k of ca) if (!cb.has(k)) diff++
    for (const k of cb) if (!ca.has(k)) diff++
    log(ca.size > 50 && diff === 0, 'DETERMINISM-ORDER-INVARIANT',
        `edges=${ca.size}; symmetric difference across input order=${diff}`)
}

console.log(`\nROAD-GRAPH: ${pass}/${pass + fail} checks green`)
process.exit(fail === 0 ? 0 : 1)
