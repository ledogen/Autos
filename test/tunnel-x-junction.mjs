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
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { REGION_WARM_RADIUS_M } from '../src/story.js'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

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
    }
}
console.log(fail ? `FAIL: ${fail}` : 'PASS')
process.exit(fail ? 1 : 0)
