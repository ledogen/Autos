/**
 * src/road-graph.js — FEAT-13 v2 graph primitives (pure, hand-rolled, no deps).
 *
 * The road network v2 is an URQUHART graph over a blue-noise anchor set: Delaunay
 * minus each triangle's longest edge. Urquhart is the density middle ground —
 *   MST ⊆ RNG ⊆ URQUHART ⊆ GABRIEL ⊆ DELAUNAY
 * — sparse enough to read as a network (not a dense mesh) but with cycles for route
 * choice, and connected-by-construction (Urquhart ⊇ Euclidean MST spans every site).
 *
 * Both functions are PURE (no THREE, no DOM, no globals) and operate on a flat point
 * list, so road.js can build them over a bounded band+margin neighbourhood and they
 * stay window-invariant: for points in general position the Delaunay triangulation is
 * unique, so the same point SET yields the same triangles regardless of insertion
 * order or which stream center collected it. (Insertion is sorted for a deterministic
 * tie-break in the rare cocircular case.)
 *
 * Points are passed as an array of [x, y] number pairs; triangles/edges are returned
 * as integer index triples/pairs into that array. The caller keeps a parallel array
 * of site ids.
 */

// Bowyer-Watson incremental Delaunay triangulation.
//   pts: Array<[x, y]>  →  Array<[i, j, k]> (vertex-index triangles, CCW).
// A super-triangle large enough to contain all points seeds the mesh; each point is
// inserted by deleting every triangle whose circumcircle contains it and re-fanning
// the resulting cavity. Triangles touching a super-triangle vertex are dropped at the
// end. O(n^1.5)-ish for blue-noise input (each insert touches O(1) local triangles).
export function delaunay(pts) {
    const n = pts.length
    if (n < 3) return []

    // Deterministic insertion order (x then y) so cocircular degeneracies resolve the
    // same way every build → window-invariant even off general position.
    const order = Array.from({ length: n }, (_, i) => i)
    order.sort((a, b) => (pts[a][0] - pts[b][0]) || (pts[a][1] - pts[b][1]))

    // Super-triangle: vertices n, n+1, n+2 in an extended coord array.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of pts) {
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
    }
    const dx = maxX - minX || 1, dy = maxY - minY || 1
    const dmax = Math.max(dx, dy)
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2
    const C = [...pts.map(p => [p[0], p[1]]),
        [midX - 20 * dmax, midY - dmax],
        [midX, midY + 20 * dmax],
        [midX + 20 * dmax, midY - dmax]]
    const st0 = n, st1 = n + 1, st2 = n + 2

    // Triangles as [i,j,k] index triples, kept CCW (so inCircle's sign is consistent).
    let tris = [ccw(C, st0, st1, st2)]

    for (const pi of order) {
        const px = C[pi][0], py = C[pi][1]
        // Find triangles whose circumcircle contains the new point ("bad"), and collect
        // the boundary polygon of the cavity (edges not shared by two bad triangles).
        const keep = []
        const edges = []   // flat [a0,b0, a1,b1, ...]
        for (const t of tris) {
            if (inCircle(C, t[0], t[1], t[2], px, py)) {
                pushEdge(edges, t[0], t[1])
                pushEdge(edges, t[1], t[2])
                pushEdge(edges, t[2], t[0])
            } else {
                keep.push(t)
            }
        }
        // Boundary edges appear exactly once; shared (interior) edges cancel.
        for (let e = 0; e < edges.length; e += 2) {
            const a = edges[e], b = edges[e + 1]
            if (a === -1) continue
            keep.push(ccw(C, a, b, pi))
        }
        tris = keep
    }

    // Drop triangles incident to the super-triangle.
    const out = []
    for (const t of tris) {
        if (t[0] >= n || t[1] >= n || t[2] >= n) continue
        out.push(t)
    }
    return out
}

// Urquhart edge set: every Delaunay edge EXCEPT the longest edge of each triangle.
//   pts, tris (from delaunay)  →  Array<[i, j]> with i < j, deduped.
// A Delaunay edge survives iff it is NOT the longest edge of ANY triangle that owns it
// (so an edge shared by two triangles is removed only when longest in both is moot —
// it's removed if it is the longest of either; we keep it unless it is longest in a
// triangle and that triangle votes it out). Standard Urquhart: remove the longest edge
// of each triangle from the Delaunay edge set.
export function urquhartEdges(pts, tris) {
    const removed = new Set()
    const all = new Set()
    const key = (a, b) => a < b ? a * 0x4000000 + b : b * 0x4000000 + a   // i<j packed
    for (const [i, j, k] of tris) {
        const dij = d2(pts, i, j), djk = d2(pts, j, k), dki = d2(pts, k, i)
        all.add(key(i, j)); all.add(key(j, k)); all.add(key(k, i))
        // Longest edge of this triangle → removed.
        let lk
        if (dij >= djk && dij >= dki) lk = key(i, j)
        else if (djk >= dij && djk >= dki) lk = key(j, k)
        else lk = key(k, i)
        removed.add(lk)
    }
    const out = []
    for (const k of all) {
        if (removed.has(k)) continue
        out.push([Math.floor(k / 0x4000000), k % 0x4000000])
    }
    return out
}

// ── helpers ──────────────────────────────────────────────────────────────────────
function d2(pts, i, j) { const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1]; return dx * dx + dy * dy }

// Orient (a,b,c) counter-clockwise.
function ccw(C, a, b, c) {
    const cross = (C[b][0] - C[a][0]) * (C[c][1] - C[a][1]) - (C[b][1] - C[a][1]) * (C[c][0] - C[a][0])
    return cross < 0 ? [a, c, b] : [a, b, c]
}

// True iff point (px,py) lies strictly inside the circumcircle of CCW triangle (a,b,c).
// Determinant form (Guibas-Stolfi); positive for a CCW triangle ⇒ inside.
function inCircle(C, a, b, c, px, py) {
    const ax = C[a][0] - px, ay = C[a][1] - py
    const bx = C[b][0] - px, by = C[b][1] - py
    const cx = C[c][0] - px, cy = C[c][1] - py
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy
    const det = (ax * (by * c2 - b2 * cy)
               - ay * (bx * c2 - b2 * cx)
               + a2 * (bx * cy - by * cx))
    return det > 0
}

// Accumulate an undirected edge into a flat list, cancelling it if its reverse is
// already present (shared interior edge of two bad triangles → not on the cavity hull).
function pushEdge(edges, a, b) {
    for (let e = 0; e < edges.length; e += 2) {
        if ((edges[e] === a && edges[e + 1] === b) || (edges[e] === b && edges[e + 1] === a)) {
            edges[e] = -1; edges[e + 1] = -1
            return
        }
    }
    edges.push(a, b)
}
