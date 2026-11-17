// RAINY-DAY (BUG-179, DEC-366): list every CHAINED FORK the merge plan builds — a run that both loses a fork to one
// road and wins a fork of another at the same junction (B forks off A, C forks off B). Not a gate.
//
//   node test/chained-forks.mjs <seed,seed,…> [--r=3000] [--json=<out.json>] [--node=<site key>]
//
// Per chain: the node, each link (who forks off whom, the fork's distance from the node, whether the T was built),
// the worst ground step across any run-to-run seam within the chain's box (winner flip bisected to 1 mm, then a 5 cm
// move across it, as test/leg-overlap-census.mjs measures), and per leg of the node and of each fork: its minimum
// centreline radius and its grade (mean and steepest 10 m) over its first 80 m.
import * as THREE from 'three'
import { writeFileSync } from 'node:fs'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const args = process.argv.slice(2), opt = (k, d) => (args.find(a => a.startsWith(`--${k}=`)) ?? `=${d}`).split('=')[1]
const SEEDS = (args.find(a => !a.startsWith('--')) ?? '').split(',').filter(Boolean)
if (!SEEDS.length) { console.error('usage: node test/chained-forks.mjs <seed,seed,…> (there is no default seed)'); process.exit(2) }
const R = +opt('r', 3000), JSON_OUT = opt('json', ''), NODE = opt('node', '')   // --node: report this node even unchained (the before picture)

// record the FINAL node plans (not the legacy fallback, not the pass-1 forecast) as the build computes them
const plans = new Map()
const orig = RoadSystem.prototype._v2NodeMergesOn
RoadSystem.prototype._v2NodeMergesOn = function (g, drop, nk, legacy, memo, mk, dead, nbrs0, pass1) {
    const out = orig.call(this, g, drop, nk, legacy, memo, mk, dead, nbrs0, pass1)
    if (!legacy && !pass1) plans.set(nk, { out, g })
    return out
}

// and every T promotion's outcome: side run + its winner → built or declined
const promos = new Map()
const origP = RoadSystem.prototype._v2PromoteOne
RoadSystem.prototype._v2PromoteOne = function (g, drop, pr, pieces) {
    const ok = origP.call(this, g, drop, pr, pieces)
    if (!pr.spec.midSpan) promos.set(pr.sideKey.slice(2).split(':').sort().join('|') + '>' + ck(g, pr.spec.winner), !!ok)
    return ok
}

const ck = (g, sp) => { const a = g.key(sp[0]), b = g.key(sp[1]); return a < b ? a + '|' + b : b + '|' + a }
const runOf = (k) => k.split('|').join(':')

function legStats (road, key, atNode) {
    const e = road._network.get(key); if (!e?.polyCum) return null
    const L = e.polyCum.at(-1), atStart = Math.hypot(e.points[0].x - atNode.x, e.points[0].z - atNode.z) < Math.hypot(e.points.at(-1).x - atNode.x, e.points.at(-1).z - atNode.z)
    const out = (d) => (atStart ? d : L - d), D = Math.min(80, L)
    let minR = Infinity
    for (let i = 1; i < e.points.length - 1; i++) {
        const c = out(e.polyCum[i]); if (c < 0 || c > D) continue
        const a = e.points[i - 1], b = e.points[i], q = e.points[i + 1]
        const t1 = Math.atan2(b.z - a.z, b.x - a.x), t2 = Math.atan2(q.z - b.z, q.x - b.x)
        let dth = Math.abs(t2 - t1); if (dth > Math.PI) dth = 2 * Math.PI - dth
        const ds = (e.polyCum[i + 1] - e.polyCum[i - 1]) / 2
        if (dth > 1e-6) minR = Math.min(minR, ds / dth)
    }
    const y = (d) => road.runProfile(out(d) - (e.arcOrigin ?? 0), key).gradeY
    let steep = 0
    for (let d = 0; d + 10 <= D; d += 2) steep = Math.max(steep, Math.abs(y(d + 10) - y(d)) / 10)
    return { key, L, minR, mean: (y(D) - y(0)) / D, steep }
}

function seamStep (road, H, x0, x1, z0, z1) {
    let worst = { step: 0, x: 0, z: 0 }
    const rk = (x, z) => road._resolveRoadSurface(x, z)?.runKey ?? null
    const probe = (ax, az, bx, bz) => {
        const w0 = rk(ax, az), w1 = rk(bx, bz)
        if (w0 === w1 || w0 === null || w1 === null) return
        let t0 = 0, t1 = 1
        while ((t1 - t0) > 1e-3) { const tm = (t0 + t1) / 2; if (rk(ax + tm * (bx - ax), az + tm * (bz - az)) === w0) t0 = tm; else t1 = tm }
        const tm = (t0 + t1) / 2, dx = (bx - ax), dz = (bz - az), n = Math.hypot(dx, dz), u = 0.025 / n
        const step = Math.abs(H(ax + (tm + u) * dx, az + (tm + u) * dz) - H(ax + (tm - u) * dx, az + (tm - u) * dz))
        if (step > worst.step) worst = { step, x: ax + tm * dx, z: az + tm * dz }
    }
    for (let x = x0; x < x1; x += 1) for (let z = z0; z < z1; z += 1) { probe(x, z, x + 1, z); probe(x, z, x, z + 1) }
    return worst
}

const all = []
for (const S of SEEDS) {
    plans.clear(); promos.clear()
    const t0 = Date.now(), ws = parseWorldSeed(S), road = new RoadSystem(ws, P)
    wirePondNoGo(road, ws, P); road.setRadius(R + 300); road.update(new THREE.Vector3(0, 0, 0))
    const terrain = makeTerrainHeadless(ws, P, road), H = (x, z) => terrain.analyticHeight(x, z)
    const promoted = [...road._promoted.values()]
    const tAt = (pt) => { let b = null; for (const p of promoted) { const d = Math.hypot(p.pos.x - pt.x, p.pos.z - pt.z); if (!b || d < b.d) b = { d, p } } return b && b.d < 25 ? b.p : null }
    let n = 0
    for (const [nk, { out, g }] of plans) {
        const winners = new Map()   // winner ck → [loser ck, spec]
        for (const [l, sp] of out) { const w = ck(g, sp.winner); if (!winners.has(w)) winners.set(w, []); winners.get(w).push([l, sp]) }
        const mids = [...out.keys()].filter((l) => winners.has(l))
        if (!mids.length && nk !== NODE) continue
        const node = road._nodePos(nk.split(',').map(Number)); if (!node || Math.hypot(node.x, node.z) > R) continue
        const links = [], forks = []
        for (const B of mids) {
            const sB = out.get(B), A = ck(g, sB.winner)
            for (const [l, sp] of [[B, sB], ...winners.get(B)]) {
                const W = l === B ? A : B, f = sp.variants[0].forkPt, built = promos.get(l + '>' + W), T = built ? tAt(f) : null, fk = T ? { x: T.pos.x, z: T.pos.z } : f
                links.push({ side: runOf(l), trunk: runOf(W), out: Math.hypot(fk.x - node.x, fk.z - node.z), fork: fk, built: !!built })
                if (T) forks.push(T)
            }
        }
        const reach = Math.min(150, Math.max(40, ...links.map((k) => k.out)) + 40)
        const step = seamStep(road, H, node.x - reach, node.x + reach, node.z - reach, node.z + reach)
        const legs = []
        for (const [at, k] of [[node, nk], ...forks.map((T) => [T.pos, [...road._promoted].find(([, r]) => r === T)[0]])])
            for (const key of road._proto.nodeInc.get(k) ?? []) { const s = legStats(road, key, at); if (s) legs.push({ at: k, ...s }) }
        const rec = { seed: S, node: nk, x: node.x, z: node.z, links, step, legs }
        all.push(rec); n++
        console.log(`seed ${S} node ${nk} (${node.x.toFixed(0)}, ${node.z.toFixed(0)}): seam step ${step.step.toFixed(2)} m @ (${step.x.toFixed(0)}, ${step.z.toFixed(0)})`)
        for (const k of links) console.log(`    ${k.side} forks off ${k.trunk} at ${k.out.toFixed(0)} m${k.built ? '' : '  (T NOT BUILT)'} (${k.fork.x.toFixed(0)}, ${k.fork.z.toFixed(0)})`)
        for (const s of legs) console.log(`    leg ${s.key} from ${s.at}: minR ${s.minR === Infinity ? '∞' : s.minR.toFixed(0)} m, grade ${(100 * s.mean).toFixed(1)} % mean, ${(100 * s.steep).toFixed(1)} % steepest`)
    }
    console.log(`seed ${S}: ${n} chained-fork junctions within ${R} m · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(all, null, 1))
console.log(`CHAINS: ${all.length} over ${SEEDS.length} seeds`)
