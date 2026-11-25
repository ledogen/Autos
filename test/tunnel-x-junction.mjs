// GATE (BUG-259): a junction inside the hill. BUG-234's X junctions put four legs' bores on one node 60-113 m under the
// hill (seed 1960791808 at (617, −1724); seed 2280440363's pair at (19, −42) and (−52, 29), two roads crossing twice). The
// owner's ruling: "There should be no earthwork at the intersection. There should only be earthwork near the portals."
// Every underground junction (three or more legs, each leaving the node in a bore that is no mouth there) on the two seeds,
// built as the game builds the story region:
//   1. it is flagged underground (RoadSystem._undergroundNodes);
//   2. the terrain skin near the node is never cut into the chamber (under deck + R, where raw is higher): main cut it to 1.0 m over the deck, the leg's
//      camber laid on it and up through the other road's ribbon (175-211 points per X under deck + R). "Near" = within
//      20 m, or dMouth − 10 m where a portal is closer (dMouth the shortest bore from the node to a mouth): a portal's own
//      open cut is earthwork near a portal;
//   3. within 15 m of the node the skin is cut no deeper than the nearest real portal's funnel reaches: never under
//      min(raw, deck − 4 + BORE_NOTCH_SLOPE·(dMouth − 15)), 4 m for the deck's own fall over those 15 m (main: the funnel
//      climbed out of the node itself, 61-162 m of cut);
//   4. every leg's steepest 5 m within 60 m of the node is under the 38 % ceiling: the deck hold's recovery was pinned to
//      the bore floor and shipped by the ceiling pass at 48 % on a leg solved at 20 % (DEC-409's design maximum now);
//   5. the bore shade at the node is a tunnel's (< 0.5), not a portal's daylight (main 1.0);
//   6. MESH == PHYSICS on the pad: a probe in the chamber still rides the pad (analyticHeight with the probe's Y equals
//      sampleRoadTopY within 1 cm), and a probe above the apex reads the skin.
// Slice 2 (the owner: "the junction pads do bleed outside of the tunnels sometimes which Looks weird because the gravel
// texture on the shoulder disappears"):
//   7. the pad is the legs' own pavement: no point of its ring stands more than 0.1 m outside every leg's lane
//      (halfWidth from the centreline, the leg run on straight R past the node as its tube is), so the bore floor's
//      gravel shoulder (R − halfWidth = 3 m) runs on round the chamber. Main: fillets 1.5 m into the shoulder at
//      1960791808, the convex-hull pad 4.3 m past the WALL at 2280440363 (two roads crossing at 3°);
//   8. MESH == PHYSICS over the whole pad: on a 1 m grid inside the ring the collider (analyticHeight in the chamber) and
//      the drawn pad (_nodeSurfaceTop, what its vertices ride) agree within 1 cm.
// And ("the roof sections also dont miter perfectly"):
//   9. the linings meet on the miter: a leg with a partner (the leg leaving most nearly opposite, over 135°, computed
//      here) meets it on the plane bisecting the two, so from inside the chamber no ray's first lining belongs to a leg
//      whose plane it is past (by more than the 4 cm the miter overlaps). Main: every tube ran on R past the node, and
//      where that run-on crossed another tube's wall a strip of it stood proud, a thin line over the chamber (1960791808:
//      the lines of the owner's report). Rays: 400 over the upper hemisphere from 1.5 m over the node and 6 m out each leg.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { REGION_WARM_RADIUS_M } from '../src/story.js'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { RoadMeshSystem } from '../src/road-mesh.js'

// seed, underground X junctions it must have; SEEDS=a,b,… runs the same checks on other seeds (a census, nothing required)
const SEEDS = process.env.SEEDS ? process.env.SEEDS.split(',').map((s) => [s, 0]) : [['1960791808', 1], ['2280440363', 2]]
const R = P.tunnelBoreRadius ?? 8, FUNNEL = 1.2, CEIL = 0.38
let fail = 0
const ok = (c, msg) => { console.log(`[${c ? 'PASS' : 'FAIL'}] ${c ? '✓' : '✗'} ${msg}`); if (!c) fail++ }
for (const [s, wantX] of SEEDS) {
    const seed = parseWorldSeed(s), road = new RoadSystem(seed, P), C = spawnDecision(seed, P)
    wirePondNoGo(road, seed, P); road.setRadius(REGION_WARM_RADIUS_M); road.update(new THREE.Vector3(C.x, 0, C.z))
    const T = makeTerrainHeadless(seed, P, road)
    road._undergroundNodes()
    const nodes = [...road._detectNodeJunctions().values()].filter((n) => n.underground)
    ok(nodes.filter((n) => n.legs.length === 4).length >= wantX, `seed ${s}: ${nodes.length} underground junctions (${nodes.filter((n) => n.legs.length === 4).length} X, want ≥ ${wantX})`)
    for (const node of nodes) {
        const { x, z, y } = node.pos, tag = `seed ${s} (${x.toFixed(0)}, ${z.toFixed(0)}) deg ${node.legs.length}`
        const legs = node.legs.map((l) => {
            const e = road._network.get(l.runKey), L = e.polyCum.at(-1), atA = l.arc < 1e-6
            const sp = e.tunnelSpans.find((q) => atA ? q.s0 <= 1 : q.s1 >= L - 1)
            const far = atA ? sp.s1 : sp.s0, mouth = road.isMouth(l.runKey, far) && (atA ? far < L - 1 : far > 1)
            return { k: l.runKey, L, atA, bore: atA ? sp.s1 : L - sp.s0, mouth }
        })
        const dMouth = Math.min(...legs.filter((l) => l.mouth).map((l) => l.bore))
        let lo = Infinity, under = 0, worst = -Infinity
        const rCh = Math.max(0, Math.min(20, dMouth - 10))
        for (let dx = -20; dx <= 20; dx++) for (let dz = -20; dz <= 20; dz++) {
            const r2 = dx * dx + dz * dz
            if (r2 > 400) continue
            const sk = T.analyticHeight(x + dx, z + dz), raw = T.rawHeightWorld(x + dx, z + dz)
            if (r2 <= rCh * rCh) { lo = Math.min(lo, sk - y); if (sk < y + R && sk < raw - 0.05) under++ }
            if (r2 <= 225) worst = Math.max(worst, Math.min(raw, y - 4 + FUNNEL * (dMouth - 15)) - sk)
        }
        ok(under === 0, `${tag}: skin within ${rCh.toFixed(0)} m lowest ${lo.toFixed(1)} m over the deck, ${under} points cut into the chamber (under deck + ${R} and raw)`)
        ok(worst <= 0, `${tag}: skin within 15 m never under the nearest portal's funnel (portal ${dMouth.toFixed(0)} m out; worst ${worst.toFixed(2)} m under)`)
        let steep = 0, at = ''
        for (const l of legs) for (let d = 0; d < Math.min(60, l.L - 5); d++) {
            const a = l.atA ? d : l.L - d, b = l.atA ? d + 5 : l.L - d - 5
            const g = Math.abs(road.runProfile(b, l.k).gradeY - road.runProfile(a, l.k).gradeY) / 5
            if (g > steep) { steep = g; at = `${l.k} ${d} m out` }
        }
        ok(steep < CEIL, `${tag}: steepest 5 m within 60 m ${(100 * steep).toFixed(1)} % (${at}; ceiling ${100 * CEIL} %)`)
        const sh = road.boreShadeAt(x, y + 1, z)
        ok(sh < 0.5, `${tag}: bore shade at the node ${sh.toFixed(2)} (a tunnel's, < 0.5)`)
        const top = road.sampleRoadTopY(x + 2, z + 1), inBore = T.analyticHeight(x + 2, z + 1, undefined, y + 1)
        const sky = T.analyticHeight(x + 2, z + 1, undefined, y + R + 2)
        ok(Math.abs(inBore - top) < 0.01 && sky > y + R, `${tag}: pad probe rides the pad (${inBore.toFixed(3)} vs drawn ${top.toFixed(3)}), above the apex reads the skin (${(sky - y).toFixed(1)} m over the deck)`)
        // 7: ring vs the legs' lanes
        const HW = P.roadHalfWidth ?? 5, segD = (px, pz, a, b) => {
            const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / L2)) : 0
            return Math.hypot(px - a.x - dx * t, pz - a.z - dz * t)
        }
        const lanes = legs.map((l) => {
            const pts = []
            for (let d = 0; d <= 45; d += 1) pts.push(road.runPointAt(l.k, l.atA ? d : l.L - d))
            const ux = pts[0].x - pts[1].x, uz = pts[0].z - pts[1].z, ul = Math.hypot(ux, uz)
            pts.unshift({ x: pts[0].x + ux / ul * R, z: pts[0].z + uz / ul * R })
            return pts
        })
        let past = -Infinity
        const ring = node.ring ?? []
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i], b = ring[(i + 1) % ring.length], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25)
            for (let k = 0; k < n; k++) {
                const qx = a.x + (b.x - a.x) * k / n, qz = a.z + (b.z - a.z) * k / n
                let d = Infinity
                for (const pts of lanes) for (let j = 0; j < pts.length - 1; j++) d = Math.min(d, segD(qx, qz, pts[j], pts[j + 1]))
                past = Math.max(past, d - HW)
            }
        }
        ok(ring.length >= 3 && past <= 0.1, `${tag}: pad on the legs' pavement, worst ${past.toFixed(2)} m past a lane edge (${(past - R + HW).toFixed(2)} m past the wall; gravel shoulder ${(R - HW).toFixed(0)} m)`)
        // 8: collider vs drawn pad over the ring
        let pd = 0, pn = 0
        const r = node.ringMaxR ?? 0
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
            const qx = x + dx, qz = z + dz
            if (!(road._signedRingDist(ring, qx, qz) < -0.3)) continue
            const drawn = road._nodeSurfaceTop(node, qx, qz)
            if (drawn == null) continue
            pd = Math.max(pd, Math.abs(T.analyticHeight(qx, qz, undefined, drawn + 1) - drawn)); pn++
        }
        ok(pn > 50 && pd < 0.01, `${tag}: collider vs drawn pad over ${pn} points inside the ring, worst ${(100 * pd).toFixed(2)} cm`)
        // 9: the miter, seen from inside
        const rm = new RoadMeshSystem({ add() {}, remove() {} }, road, null, P, s), tris = []
        const u = legs.map((l) => { const f = road.runFrameAt(l.atA ? 0 : l.L, l.k), sg = l.atA ? 1 : -1, n = Math.hypot(f.tx, f.tz); return { x: f.tx * sg / n, z: f.tz * sg / n } })
        const opp = (i) => u.reduce((b, c, j) => (j !== i && (b < 0 || u[i].x * c.x + u[i].z * c.z < u[i].x * u[b].x + u[i].z * u[b].z) ? j : b), -1)
        const plane = u.map((a, i) => { const j = opp(i); if (j < 0 || opp(j) !== i || a.x * u[j].x + a.z * u[j].z > -Math.SQRT1_2) return null
            const nx = a.x - u[j].x, nz = a.z - u[j].z, n = Math.hypot(nx, nz); return { nx: nx / n, nz: nz / n } })
        legs.forEach((l, li) => {
            const e = road._network.get(l.k), sp0 = e.tunnelSpans.find((q) => l.atA ? q.s0 <= 1 : q.s1 >= l.L - 1)
            const sp = { ...sp0, s0: Math.max(0, sp0.s0), s1: Math.min(l.L, sp0.s1) }
            const t = rm.buildTunnelTube(l.k, l.atA ? sp.s0 : Math.max(sp.s0, sp.s1 - 30), l.atA ? Math.min(sp.s1, sp.s0 + 30) : sp.s1, sp, P)
            for (const [g, lining] of [[t?.tube, true], [t?.floor, false]]) {
                if (!g) continue
                const p = g.getAttribute('position').array, ix = g.index.array
                for (let i = 0; i < ix.length; i += 3) {
                    const v = [ix[i], ix[i + 1], ix[i + 2]].map((j) => [p[3 * j], p[3 * j + 1], p[3 * j + 2]])
                    if (v.every((q) => Math.hypot(q[0] - x, q[2] - z) > 18)) continue
                    tris.push({ li, lining, v })
                }
            }
        })
        const first = (o, d) => {
            let tb = Infinity, tr = null
            for (const T of tris) {
                const [a, b, c] = T.v, e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
                const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2]
                if (Math.abs(det) < 1e-12) continue
                const tv = [o[0] - a[0], o[1] - a[1], o[2] - a[2]], uu = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det
                if (uu < 0 || uu > 1) continue
                const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], vv = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det
                if (vv < 0 || uu + vv > 1) continue
                const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det
                if (tt > 0.01 && tt < tb) { tb = tt; tr = T }
            }
            return tr && { T: tr, p: [o[0] + d[0] * tb, o[1] + d[1] * tb, o[2] + d[2] * tb] }
        }
        const eyes = [[x, y + 1.5, z], ...legs.map((l) => { const a = l.atA ? 6 : l.L - 6, q = road.runPointAt(l.k, a); return [q.x, road.runProfile(a, l.k).gradeY + 1.5, q.z] })]
        let rays = 0, orphan = 0, worstPast = 0
        const NR = 400, GA = Math.PI * (3 - Math.sqrt(5))
        for (const o of eyes) for (let k = 0; k < NR; k++) {
            const dy = 1 - (k + 0.5) / NR, rr = Math.sqrt(1 - dy * dy), h = first(o, [Math.cos(GA * k) * rr, dy, Math.sin(GA * k) * rr])
            rays++
            const pl = h?.T.lining && plane[h.T.li]
            if (!pl) continue
            const sd = (h.p[0] - x) * pl.nx + (h.p[2] - z) * pl.nz
            if (sd < -0.05) { orphan++; worstPast = Math.max(worstPast, -sd) }
        }
        ok(orphan === 0, `${tag}: miter: ${orphan} of ${rays} rays from inside see a leg's lining past its miter plane (worst ${worstPast.toFixed(2)} m past; ${plane.filter(Boolean).length} legs paired)`)
    }
}
console.log(fail ? `FAIL: ${fail}` : 'PASS')
process.exit(fail ? 1 : 0)
