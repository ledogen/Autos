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

// ── QUAL-21 stroke formation ─────────────────────────────────────────────────────
// Decompose the Urquhart edge set into STROKES: maximal chains of edges a road naturally
// continues along, later routed as ONE continuous curvature-bounded curve (Stage 1) and split
// back into per-edge runs. PURE function of (node table, edge list, opts) — bearings and grades
// come from SITE positions + coarse heights, never routed geometry or the streaming window, so
// the same interior chain forms the same stroke from any stream center (the D-16 make-or-break;
// see .planning/research/STROKE-ROUTING-DESIGN.md §3).
//
// Pairing rules (user-approved 2026-07-23):
//  - deg-2 node: ALWAYS pass through — a single curvature-bounded curve absorbs any bend angle
//    (κ² prices it), and this is what lets the deg-2 connector subsystem be deleted outright.
//  - deg-≥3 node: at most ONE through-pair — the straightest qualifying leg pair, where
//    qualifying means (a) deviation from straight ≤ maxDevDeg, (b) grade continuity
//    |slopeIn − slopeOut| ≤ gradeJump (a road doesn't "continue through" into a leg that dives),
//    and (c) it beats every CONFLICTING qualifying pair by runnerUpMargin (an ambiguous
//    symmetric Y stays a junction of three T-ing branches rather than an arbitrary through-road).
//  - Chains longer than maxLen (XZ chord sum) split at canonical interior nodes; closed loops
//    (pure deg-2 rings — Urquhart has cycles) split at the lexicographically-lowest node and at
//    the node nearest half the ring length, so every stroke is an open, boundedly-long, routable
//    curve. All tie-breaks are lexicographic on node keys → deterministic + window-invariant.
//
//   nodes: Map<key, {x, z, h}>   — h in METRES (amplitude-scaled coarse height at the site)
//   edges: Array<[keyA, keyB]>   — undirected, deduped (the Urquhart edge list)
//   → Array<{ nodes: [key...], len: number, loop: boolean }>  (stroke node chains, in order)
export function formStrokes(nodes, edges, opts = {}) {
    const maxDevDeg     = opts.maxDevDeg     ?? 40    // through-pair: max deviation from straight
    const gradeJump     = opts.gradeJump     ?? 0.08  // through-pair: max |slopeIn − slopeOut| (m/m)
    const runnerUpMargin = opts.runnerUpMargin ?? 12  // deg: best pair must beat conflicting rival by this
    const maxLen        = opts.maxLen        ?? 1500  // m: cap on stroke XZ chord length before canonical split

    // Adjacency: node key → sorted list of neighbour keys (sorted for deterministic iteration).
    const adj = new Map()
    const addA = (a, b) => { (adj.get(a) ?? adj.set(a, []).get(a)).push(b) }
    for (const [a, b] of edges) { addA(a, b); addA(b, a) }
    for (const l of adj.values()) l.sort()

    const chord = (a, b) => {
        const A = nodes.get(a), B = nodes.get(b)
        return Math.hypot(A.x - B.x, A.z - B.z)
    }

    // Per-node leg pairing: pairAt maps `${nodeKey}|${nbrKey}` → the paired-through neighbour key.
    const pairAt = new Map()
    for (const [k, nbrs] of adj) {
        if (nbrs.length === 2) {                       // deg-2: always continue
            pairAt.set(`${k}|${nbrs[0]}`, nbrs[1])
            pairAt.set(`${k}|${nbrs[1]}`, nbrs[0])
            continue
        }
        if (nbrs.length < 3) continue                  // deg-1 terminal: no pairing
        // deg-≥3: score every leg pair; keep the single best qualifying pair if unambiguous.
        const N = nodes.get(k)
        const legs = nbrs.map(nk => {
            const P = nodes.get(nk), dx = P.x - N.x, dz = P.z - N.z
            const L = Math.hypot(dx, dz) || 1
            return { nk, ux: dx / L, uz: dz / L, slope: (P.h - N.h) / L }
        })
        const cand = []
        for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) {
            const a = legs[i], b = legs[j]
            // deviation from straight: angle between -a and b directions
            const dot = -(a.ux * b.ux + a.uz * b.uz)
            const dev = Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI
            // continuing a→node→b: slope in along a = −a.slope, slope out along b = b.slope
            const sJump = Math.abs(a.slope + b.slope)
            if (dev <= maxDevDeg && sJump <= gradeJump) cand.push({ i, j, dev })
        }
        if (!cand.length) continue
        cand.sort((p, q) => (p.dev - q.dev) || (legs[p.i].nk < legs[q.i].nk ? -1 : 1) || (legs[p.j].nk < legs[q.j].nk ? -1 : 1))
        const best = cand[0]
        // Ambiguity veto: a CONFLICTING qualifying pair (shares a leg) within runnerUpMargin means
        // there is no clear through-road here — leave all legs as branches.
        const rival = cand.find(p => p !== best && (p.i === best.i || p.j === best.j || p.i === best.j || p.j === best.i))
        if (rival && rival.dev - best.dev < runnerUpMargin) continue
        const ka = legs[best.i].nk, kb = legs[best.j].nk
        pairAt.set(`${k}|${ka}`, kb)
        pairAt.set(`${k}|${kb}`, ka)
    }

    // Walk chains. A directed half-edge (from,to) is consumed once; chains start at every
    // unpaired leg end (terminals + junction branches), then leftover edges are pure loops.
    const used = new Set()                             // consumed undirected edges "a|b" (a<b)
    const eKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`
    const strokes = []
    const walk = (from, to) => {
        const chain = [from, to]
        used.add(eKey(from, to))
        let prev = from, cur = to
        for (;;) {
            const nxt = pairAt.get(`${cur}|${prev}`)
            if (nxt === undefined || used.has(eKey(cur, nxt))) break
            used.add(eKey(cur, nxt))
            chain.push(nxt)
            prev = cur; cur = nxt
        }
        return chain
    }
    // Terminal-anchored chains, in deterministic order.
    const starts = []
    for (const [k, nbrs] of adj) for (const nk of nbrs) if (!pairAt.has(`${k}|${nk}`)) starts.push([k, nk])
    starts.sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : p[1] < q[1] ? -1 : 1))
    for (const [k, nk] of starts) {
        if (used.has(eKey(k, nk))) continue
        strokes.push({ nodes: walk(k, nk), loop: false })
    }
    // Pure loops: remaining unconsumed edges form deg-2 rings. Split at the lowest node, then at
    // the node nearest half the ring length (both canonical), yielding two open strokes.
    const loopEdges = edges.filter(([a, b]) => !used.has(eKey(a, b)))
    if (loopEdges.length) {
        const seen = new Set()
        for (const [a0] of loopEdges) {
            if (seen.has(a0)) continue
            // trace the ring from its lowest node
            let lo = a0
            { let prev = null, cur = a0
              do { const nbrs = adj.get(cur); const nxt = nbrs[0] === prev ? nbrs[1] : nbrs[0]; prev = cur; cur = nxt; if (cur < lo) lo = cur } while (cur !== a0) }
            const ring = [lo]
            { let prev = null, cur = lo
              for (;;) { const nbrs = adj.get(cur); const nxt = (nbrs[0] === prev ? nbrs[1] : nbrs[0]); if (nxt === lo) break; ring.push(nxt); prev = cur; cur = nxt } }
            ring.forEach(k => seen.add(k))
            for (let i = 0; i < ring.length; i++) used.add(eKey(ring[i], ring[(i + 1) % ring.length]))
            let total = 0
            const cum = ring.map((k, i) => { const t = total; total += chord(k, ring[(i + 1) % ring.length]); return t })
            let cut = 1, bd = Infinity
            for (let i = 1; i < ring.length; i++) {
                const d = Math.abs(cum[i] - total / 2)
                if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && ring[i] < ring[cut])) { bd = d; cut = i }
            }
            strokes.push({ nodes: [...ring.slice(0, cut + 1)], loop: true })
            strokes.push({ nodes: [...ring.slice(cut), ring[0]], loop: true })
        }
    }
    // Canonical orientation + maxLen split.
    const out = []
    for (const s of strokes) {
        let ch = s.nodes
        if (ch[ch.length - 1] < ch[0]) ch = [...ch].reverse()
        let seg = [ch[0]], segLen = 0
        for (let i = 1; i < ch.length; i++) {
            const d = chord(ch[i - 1], ch[i])
            if (segLen + d > maxLen && seg.length > 1) {
                out.push({ nodes: seg, len: segLen, loop: s.loop })
                seg = [ch[i - 1]]; segLen = 0
            }
            seg.push(ch[i]); segLen += d
        }
        if (seg.length > 1) out.push({ nodes: seg, len: segLen, loop: s.loop })
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
