// GATE (BUG-232): a road never crosses itself in plan. The corridor lattice remembers no plan view, so it could
// route a helix whose upper pass sits 16-37 m over the lower one; the junction pass then read it as an at-grade X
// and FEAT-19's lift eased one pass onto the other — a 97-224 % ramp. routeEdgeV2 now rejects a self-crossing
// fitted line (next rung), and retries once with a no-go disc on the crossing when every rung loops.
// The five traced seeds, each built as the game builds the story region (spawn, warm radius, pond no-go):
//   1. no run's shipped polyline (e.points) crosses itself >= 30 m of arc apart, anywhere in the region;
//   2. at each traced site, every run passing within 60 m has its steepest 10 m (centred 10 m baseline on 5 m
//      samples of runProfile, as junction-recovery-grade) at or under the 38 % ceiling (main: 97-224 %).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { REGION_WARM_RADIUS_M } from '../src/story.js'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

const SITES = [   // seed, the main-branch crossing (x, z)
    ['567993018', 445.5, -2335.4], ['2283335151', -362.2, -106.9], ['661772743', -589.0, 26.5],
    ['400290281', 1397.5, 910.2], ['948023748', 644.4, 1038.2],
]
const SEP = 30, NEAR = 60, STEP = 5, CAP = 38

function selfCrossings(pts, cum) {
    const out = []
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], ex = b.x - a.x, ez = b.z - a.z
        for (let j = i + 2; j < pts.length - 1; j++) {
            const c = pts[j], d = pts[j + 1], fx = d.x - c.x, fz = d.z - c.z, den = ex * fz - ez * fx
            if (Math.abs(den) < 1e-10) continue
            const t = ((c.x - a.x) * fz - (c.z - a.z) * fx) / den, u = ((c.x - a.x) * ez - (c.z - a.z) * ex) / den
            if (t > 0 && t < 1 && u > 0 && u < 1 && cum[j] + u * (cum[j + 1] - cum[j]) - cum[i] - t * (cum[i + 1] - cum[i]) >= SEP)
                out.push({ x: a.x + t * ex, z: a.z + t * ez })
        }
    }
    return out
}
// steepest 10 m of a run among its samples within NEAR of (x, z), or null when it does not pass there
function steepestNear(road, key, x, z) {
    const e = road._network.get(key), L = e.polyCum.at(-1), o = e.arcOrigin ?? 0
    let j = 0, max = null
    const at = (s) => {
        while (j < e.points.length - 2 && e.polyCum[j + 1] < s) j++
        const t = Math.min(1, Math.max(0, (s - e.polyCum[j]) / ((e.polyCum[j + 1] - e.polyCum[j]) || 1)))
        return { x: e.points[j].x + (e.points[j + 1].x - e.points[j].x) * t, z: e.points[j].z + (e.points[j + 1].z - e.points[j].z) * t }
    }
    for (let s = STEP; s <= L - STEP; s += STEP) {
        const p = at(s); if (Math.hypot(p.x - x, p.z - z) > NEAR) continue
        const g = 100 * Math.abs(road.runProfile(s + STEP - o, key).gradeY - road.runProfile(s - STEP - o, key).gradeY) / (2 * STEP)
        max = Math.max(max ?? 0, g)
    }
    return max
}

let fail = 0
const ok = (c, msg) => { console.log(`[${c ? 'PASS' : 'FAIL'}] ${c ? '✓' : '✗'} ${msg}`); if (!c) fail++ }
for (const [s, x, z] of SITES) {
    const seed = parseWorldSeed(s), sp = spawnDecision(seed, P), road = new RoadSystem(seed, P)
    wirePondNoGo(road, seed, P); road.setRadius(REGION_WARM_RADIUS_M); road.update(new THREE.Vector3(sp.x, 0, sp.z))
    const hits = []
    let worst = 0, worstKey = '', near = 0
    for (const [key, e] of road._network) {
        if (!e.points || e.points.length < 2) continue
        for (const h of selfCrossings(e.points, e.polyCum)) hits.push(`${key} @ (${h.x.toFixed(0)}, ${h.z.toFixed(0)})`)
        const g = steepestNear(road, key, x, z)
        if (g != null) { near++; if (g > worst) { worst = g; worstKey = key } }
    }
    ok(hits.length === 0, `seed ${s}: ${road._network.size} runs, ${hits.length} self-crossings${hits.length ? ': ' + hits.slice(0, 3).join(', ') : ''}`)
    ok(worst <= CAP, `seed ${s} site (${x}, ${z}): ${near} runs within ${NEAR} m, steepest 10 m ${worst.toFixed(1)} % (${worstKey}; cap ${CAP} %)`)
}
console.log(fail ? `FAIL: ${fail}` : 'PASS')
process.exit(fail ? 1 : 0)
