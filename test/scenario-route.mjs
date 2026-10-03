// GATE (FEAT-62): scenarios — the run rules, the leaderboard, and the authored poses vs the real road.
//
// Two halves:
//   A. RULES (pure, fast). src/scenario.js + src/leaderboard.js on synthetic lines:
//      1. a line counts only when crossed FORWARDS, and only inside its half-width (judged at the
//         crossing point, not at either sample);
//      2. countdown holds, then GO starts the clock at zero; the clock runs on update(dt) only;
//      3. gates in any order; finishing with every gate is a valid time and lands on the board,
//         finishing with one missed is a time with no board entry;
//      4. restart is a clean sheet (gates, clock, result);
//      5. the board keeps fastest-first, caps its size, reports rank + new best, and drops junk a
//         store hands back (the save-file hook treats load() as untrusted).
//   B. WORLD (heavy). Every pose in data/scenarios.js — spawn, start, gates, finish — is re-checked
//      against the road the game builds for that seed with the CURRENT params: on the road
//      (debugSampleAt hit), within POSE_LAT_M of the centreline, and facing along it. The poses are
//      plain world coordinates; a router or param change that moves the road fails here instead of
//      leaving gates standing in a field. Fix by re-extracting the poses, never by loosening this.
import * as THREE from 'three'
import { crossedLine, ScenarioSystem, COUNTDOWN_S, GATE_SLACK_M } from '../src/scenario.js'
import { Leaderboard, memoryStore, STORE_PREFIX } from '../src/leaderboard.js'
import { SCENARIOS } from '../data/scenarios.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { RoadSystem } from '../src/road.js'
import { WaterSystem } from '../src/water.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

// ── A. rules ─────────────────────────────────────────────────────────────────────────────────────
// heading 0 → forward is −Z. A line at the origin, 5 m half-width.
const L = { x: 0, z: 0, fx: 0, fz: -1, halfW: 5 }
check('1 forward crossing counts', crossedLine(L, 0, 1, 0, -1))
check('1 backward crossing does not', !crossedLine(L, 0, -1, 0, 1))
check('1 outside the half-width does not', !crossedLine(L, 6, 1, 6, -1))
check('1 judged at the crossing point', crossedLine(L, 9, 1, 1, -1) && !crossedLine(L, 11, 1, 1, -1))
check('1 no crossing while short of the line', !crossedLine(L, 0, 3, 0, 1))

const def = {
    id: 'unit', name: 'unit', gateHalfWidth: 7,
    spawn: { x: 0, z: 10, heading: 0 }, start: { x: 0, z: 5, heading: 0 },
    gates: [{ x: 0, z: -20, heading: 0 }, { x: 0, z: -40, heading: 0 }],
    finish: { x: 0, z: -60, heading: 0 },
}
const car = { x: 0, z: 10 }
const board = new Leaderboard()
const sys = new ScenarioSystem({ getCar: () => car, leaderboard: board })
const DT = 1 / 60
const drive = (toZ, x = 0) => {   // straight line at 1 m per step, one fixed step each
    while (car.z > toZ) { car.z = Math.max(toZ, car.z - 1); car.x = x; sys.update(DT) }
}
sys.enter(def)
check('2 enter → countdown, held', sys.state === 'countdown' && sys.isHeld())
for (let i = 0; i < Math.round(COUNTDOWN_S * 60) - 1; i++) sys.update(DT)
check('2 still counting one step before GO', sys.state === 'countdown')
sys.update(DT); sys.update(DT)
check('2 GO → running, not held', sys.state === 'running' && !sys.isHeld())
drive(-30)
check('3 gate 1 passed, gate 2 not', sys.passed[0] && !sys.passed[1] && sys.gatesPassed() === 1)
drive(-61)
check('3 all gates → valid finish on the board', sys.state === 'done' && sys.result.valid && sys.result.rank === 1 && sys.result.newBest)
const t1 = sys.result.elapsed
// 70 one-metre steps from z = 10 to the finish at z = −60, ±1 for where float drift lands GO.
const steps = t1 / DT
check('2 clock is whole fixed steps of driving', Math.abs(steps - Math.round(steps)) < 1e-6 && steps >= 70 && steps <= 71, `elapsed ${t1} = ${steps} steps`)

car.x = 0; car.z = 10
sys.restart()
check('4 restart is a clean sheet', sys.state === 'countdown' && sys.gatesPassed() === 0 && sys.result === null && sys.elapsed === 0)
for (let i = 0; i < Math.round(COUNTDOWN_S * 60) + 1; i++) sys.update(DT)
drive(-30, 0)
drive(-50, def.gateHalfWidth + GATE_SLACK_M + 2)   // round gate 2 through the trees
drive(-61, 0)
check('3 missed gate → time, no board entry', sys.state === 'done' && !sys.result.valid && sys.result.missed === 1 && sys.result.rank === null)
check('3 missed run left the board alone', board.entries('unit').length === 1)
sys.exit()
check('exit → idle', sys.state === 'idle' && !sys.isActive())

const b2 = new Leaderboard({ size: 3 })
const r1 = b2.submit('s', 60), r2 = b2.submit('s', 50), r3 = b2.submit('s', 70), r4 = b2.submit('s', 80)
check('5 rank + new best', r1.rank === 1 && r1.newBest && r2.rank === 1 && r2.newBest && r3.rank === 3 && !r3.newBest)
check('5 capped, off the board → rank null', r4.rank === null && b2.entries('s').length === 3)
check('5 fastest first', b2.entries('s').map(e => e.elapsed).join() === '50,60,70')
const junkStore = memoryStore()
junkStore.save(STORE_PREFIX + 'j', [{ elapsed: 40, at: 'x' }, null, { elapsed: 'fast' }, { elapsed: -1 }, { elapsed: NaN }])
check('5 junk from the store is dropped', new Leaderboard({ store: junkStore }).entries('j').length === 1)

// ── B. world ─────────────────────────────────────────────────────────────────────────────────────
const POSE_LAT_M = 1.5    // m off the centreline
const POSE_DOT = 0.95     // |cos| between the pose heading and the road tangent (~18°)
for (const s of SCENARIOS) {
    const seed = parseWorldSeed(s.seed)
    const params = RANGER_PARAMS
    const { rawHeightWorld } = makeTerrainHeadless(seed, params, null)
    const water = new WaterSystem(seed, params, rawHeightWorld)
    const road = new RoadSystem(seed, params)
    road.setWaterNoGo((x, z) => water.isRoadNoGo(x, z), (x0, z0, x1, z1) => {
        const d = []
        for (const p of water.pondsNear(x0, z0, x1, z1)) d.push(p.floorX, p.floorZ, p.radius + p.skirt)
        return d
    })
    const poses = [['spawn', s.spawn], ['start', s.start], ...s.gates.map((g, i) => [`gate ${i + 1}`, g]), ['finish', s.finish]]
    for (const [label, p] of poses) {
        road.update(new THREE.Vector3(p.x, 0, p.z))
        const hit = road.debugSampleAt(p.x, p.z)
        const fx = -Math.sin(p.heading), fz = -Math.cos(p.heading)
        const tan = hit.hit ? road.runProfile(hit.arcS, hit.runKey) : null
        const dot = tan ? Math.abs(fx * tan.tx + fz * tan.tz) : 0
        check(`B ${s.id} ${label}: on the road, centred, aligned`,
            hit.hit === 1 && Math.abs(hit.lat) <= POSE_LAT_M && dot >= POSE_DOT,
            `hit ${hit.hit} lat ${hit.lat?.toFixed(2)} m |cos| ${dot.toFixed(3)}`)
    }
}

console.log(fails ? `\nscenario-route: ${fails} FAIL` : '\nscenario-route: all pass')
process.exit(fails ? 1 : 0)
