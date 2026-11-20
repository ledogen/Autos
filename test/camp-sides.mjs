// ── GATE: camping searches both sides of the road (FEAT-309, DEC-452) ──────────────────────────
//
// CampSystem.evaluate runs one siting ray out on EACH side of the road (_gradeSide) and keeps the
// better by sideBeats (flat beats not flat; then the higher vibe; neither flat, the flatter ground),
// a tie staying on the truck's own side. Per random seed (a fixed list, so the gate is reproducible):
// the real road network round the spawn, the analytic terrain with the road + stream carves, then
// truck spots on the shoulder at random road points, either side. At each spot:
//   1. never worse — wherever the truck's own side alone (the one-sided search this replaced) has a
//      flat site, evaluate has one too, scoring at least as much;
//   2. the better side — evaluate's site IS the better of the two rays (strict, tie → own side);
//   3. deterministic — a second evaluate from a cleared memo gives the same pad, to the bit.
// Reports: how often each search finds a site, how often two-sided finds one where one-sided found
// none, how often the site moves across the road, and ms per full grade (one ray vs both).
// Shade is off here (treesNear → 0: the tree scatter is not built headless); every other term is real.
//
//   node test/camp-sides.mjs [--seeds=32] [--spots=24]
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { CampSystem } from '../src/camp.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1]
const NSEED = Number(arg('seeds') ?? 32), NSPOT = Number(arg('spots') ?? 24)
const WARM_M = 700, SPOT_R = 450   // road built out to WARM_M; spots within SPOT_R of the spawn

function rng (s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const seedRnd = rng(0xC4A3)
const SEEDS = Array.from({ length: NSEED }, () => Math.floor(seedRnd() * 4294967295))

let fails = 0
const fail = (msg) => { fails++; if (fails <= 20) console.log(`  FAIL  ${msg}`) }
const tot = { spots: 0, one: 0, two: 0, gained: 0, crossed: 0, msOne: 0, msTwo: 0 }
const t0 = Date.now()

for (const seed of SEEDS) {
    const sp = spawnDecision(seed, P), C = { x: sp.x, z: sp.z }
    const road = new RoadSystem(seed, P)
    wirePondNoGo(road, seed, P)
    road.setRadius(WARM_M)
    road.update(new THREE.Vector3(C.x, 0, C.z))
    const { rawHeightWorld } = makeTerrainHeadless(seed, P, null)
    const water = new WaterSystem(seed, P, rawHeightWorld)
    const k = water.k, wreach = k.streamWidth * Math.max(k.widthFlatScale ?? 1, 1) + k.streamBankWidth, R = 512
    const terrain = makeTerrainHeadless(seed, P, road, {
        streamsNear: (x0, z0, x1, z1) => water.streamsInBBox(x0, z0, x1, z1),
        maxReach: () => wreach,
        sampleAt: (x, z, st, raw) => water.streamCarveSample(x, z, st ?? water.streamsInBBox(x - R, z - R, x + R, z + R), raw),
    })
    const camp = new CampSystem({ getSeed: () => seed, getParams: () => P, getRoad: () => road, getTerrain: () => terrain,
                                  getWater: () => water, treesNear: () => 0 })
    const g = road.networkGraph()
    const edges = g.edges.filter(([a]) => Math.hypot(g.pos(a).x - C.x, g.pos(a).z - C.z) < SPOT_R)
    if (!edges.length) { console.log(`  seed ${seed}: no road within ${SPOT_R} m of the spawn, skipped`); continue }
    const rnd = rng(seed ^ 0x309)
    const s = { spots: 0, one: 0, two: 0, gained: 0, crossed: 0 }
    for (let tries = 0; s.spots < NSPOT && tries < NSPOT * 20; tries++) {
        const [, , runKey] = edges[Math.floor(rnd() * edges.length)]
        const e = road._network.get(runKey), len = e?.polyCum?.[e.polyCum.length - 1]
        if (!(len > 40)) continue
        const pt = road.runPointAt(runKey, 20 + rnd() * (len - 40)); if (!pt) continue
        const tq = road.queryNearest(pt.x, pt.z, 5); if (!tq) continue
        const tl = Math.hypot(tq.tangent.x, tq.tangent.z) || 1, side = rnd() < 0.5 ? -1 : 1
        const lat = (P.roadHalfWidth ?? 5) + 1   // the truck on the shoulder
        const x = pt.x + (tq.tangent.z / tl) * side * lat, z = pt.z - (tq.tangent.x / tl) * side * lat
        const nr = camp.nearRoadInfo(x, z)
        if (!isFinite(nr.lateral)) continue
        s.spots++
        const PP = camp._P(), reach = camp.reachM()

        const own = camp._gradeSide(nr, PP, reach)
        const far = camp._gradeSide({ ...nr, side: -nr.side, nx: -nr.nx, nz: -nr.nz }, PP, reach)
        // Timed warm, both: the two rays above have filled the pond/stream memos either way.
        let t = performance.now()
        camp._gradeSide(nr, PP, reach)
        tot.msOne += performance.now() - t
        camp._eval = null
        t = performance.now()
        const ev = camp.evaluate(x, z)
        tot.msTwo += performance.now() - t
        camp._eval = null
        const ev2 = camp.evaluate(x, z)
        const at = `seed ${seed} at (${x.toFixed(1)}, ${z.toFixed(1)})`

        const found = ev.flat && !!ev.pad
        if (own.best) s.one++
        if (found) s.two++
        if (found && !own.best) s.gained++
        const across = ev.pad && (ev.pad.nx * nr.nx + ev.pad.nz * nr.nz) < 0
        if (found && across) s.crossed++

        // 1. never worse than the one-sided search
        if (own.best && !(found && ev.vibe >= own.best.vibe)) fail(`${at}: one-sided had ${own.best.vibe.toFixed(3)}, two-sided ${found ? ev.vibe.toFixed(3) : 'none'}`)
        // 2. the better side, tie on the truck's own side
        const farWins = far.best && (!own.best || far.best.vibe > own.best.vibe)
        const want = own.best || far.best ? (farWins ? far.best : own.best) : null
        if (want && !(found && ev.pad.x === want.x && ev.pad.z === want.z && ev.vibe === want.vibe)) fail(`${at}: site is not the better side's`)
        if (!want && found) fail(`${at}: a site where neither ray has one`)
        if (want && !across !== !farWins) fail(`${at}: across=${across} but far wins=${!!farWins}`)
        // 3. deterministic
        if (JSON.stringify(ev.pad) !== JSON.stringify(ev2.pad) || ev.vibe !== ev2.vibe) fail(`${at}: a second evaluate differs`)
    }
    for (const kk of Object.keys(s)) tot[kk] += s[kk]
    console.log(`  seed ${seed}: ${s.spots} spots · one-sided ${s.one} · two-sided ${s.two} · new ${s.gained} · across ${s.crossed}`)
}

const pc = (n) => `${(100 * n / Math.max(1, tot.spots)).toFixed(1)}%`
console.log(`\n${SEEDS.length} seeds, ${tot.spots} spots: a site one-sided ${tot.one} (${pc(tot.one)}), two-sided ${tot.two} (${pc(tot.two)}); `
    + `found where one-sided found none ${tot.gained} (${pc(tot.gained)}); site across the road ${tot.crossed} (${pc(tot.crossed)})`)
console.log(`ms per full grade (memo cleared): one ray ${(tot.msOne / tot.spots).toFixed(2)} · both sides ${(tot.msTwo / tot.spots).toFixed(2)}  [report-only]`)
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`)
if (tot.spots < 200) fail(`only ${tot.spots} spots sampled`)
if (tot.two < tot.one) fail('two-sided found fewer sites than one-sided')
console.log(fails ? `FAIL (${fails})` : 'PASS')
process.exit(fails ? 1 : 0)
