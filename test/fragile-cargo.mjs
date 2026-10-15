// GATE: FEAT-97 fragile — a strapped load scored on the shocks it feels.
//
// The load rides welded in the bed (FEAT-96). Each step the strap's force on it ÷ its mass, plus
// gravity, is the g it feels (src/fragile.js feltG); a burst above its floor is one event, priced
// square-law on its peak. What must hold:
//   1. the data joins up — every fragile thing names a load, a tolerance with floor < break, a sound,
//      and a shipper that posts fragile; the furniture tag is on the five pieces (FEAT-116);
//   2. the pay: base × health + the whole tip pool × the tip share — all of it at 100 %, none at
//      50 % (owner, 2026-10-15); the letter reads condition alone; a burst prices once;
//   3. the calibration table (the ticket's, on the freight-strap rig): paved driving costs nothing,
//      washboard costs glassware clearly and sturdy pieces little, a 1 m crest landing destroys
//      glassware and costs sturdy pieces most of it, a rollover destroys everything;
//   4. the felt g at rest is ~0 (gravity is removed, not counted), and the same run twice gives the
//      same health (SM-INV-12).

import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { THINGS, SOURCES } from '../data/offers.js'
import { FREIGHT } from '../data/freight.js'
import { BUILT_FAMILIES } from '../src/offer-board.js'
import { createPhysicsEngine, GROUP_TERRAIN, GROUP_DEBRIS } from '../src/physics-engine.js'
import { stepPhysics, createVehicleChassis } from '../src/physics.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { RUNNING } from '../src/ignition.js'
import { strapPose } from '../src/debris.js'
import { splitFragilePayout, splitPayout, haulPointsFor } from '../src/economy.js'
import { fragileGrade } from '../src/par.js'
import { makeFragile, feltG, shockCost } from '../src/fragile.js'

const DT = 1 / 60
const BED = DEFAULT_VEHICLE_MODEL.bed
let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }

// ── 1. the data ──────────────────────────────────────────────────────────────────────────────
console.log('data:')
const fragile = THINGS.filter(t => t.family === 'fragile')
ok(BUILT_FAMILIES.has('fragile'), 'fragile is a built family')
ok(fragile.length > 0 && fragile.every(t => FREIGHT[t.load]), `every fragile thing (${fragile.length}) names a load in data/freight.js`)
ok(fragile.every(t => t.shockFloorG >= 1 && t.breakG > t.shockFloorG && ['glass', 'thud', 'piano'].includes(t.sound)),
  'every fragile thing has a floor ≥ 1 g (free fall is free), a break above it, and a sound')
ok(fragile.every(t => t.pools.length > 0 && t.pools.every(k => SOURCES[k]?.families.includes('fragile'))),
  'every fragile thing has a shipper, and each shipper posts fragile')
const furn = ['diningChairs', 'diningTable', 'mirror', 'wardrobe', 'uprightPiano']
ok(furn.every(id => THINGS.find(t => t.id === id)?.furniture) && THINGS.filter(t => t.furniture).length === furn.length,
  `the furniture tag is on exactly the five pieces (${furn.join(', ')})`)

// ── 2. pay, letter, events ───────────────────────────────────────────────────────────────────
console.log('pay:')
const full = splitPayout(180, 0, 1), base = full.base, pool = full.tip
const at = (h) => splitFragilePayout(180, h, 1)
ok(JSON.stringify(at(1)) === JSON.stringify(full), `100 % pays base + the whole tip pool ($${full.total})`)
ok(at(0.75).base === base * 0.75 && Math.abs(at(0.75).tip - pool / 2) < 0.006, `75 % pays ¾ base + half the tip ($${at(0.75).total})`)
ok(at(0.5).tip === 0 && at(0.5).base === base / 2 && at(0.3).tip === 0, '50 % and below tip nothing; base is still × condition')
ok(at(0).total === 0, 'destroyed pays $0')
ok([0, 0.33, 0.61, 0.9, 1].every(h => { const p = at(h); return Math.round(p.base * 100) + Math.round(p.tip * 100) === Math.round(p.total * 100) }),
  'base + tip === total, to the cent')
ok(fragileGrade(0.95) === 'S' && fragileGrade(0.85) === 'A' && fragileGrade(0.8) === 'B' && fragileGrade(0.72) === 'C' && fragileGrade(0.6) === 'D',
  'the letter reads condition: 95 % S · 85 % A · 80 % B · 72 % C · 60 % D')
ok(haulPointsFor(0.9) === 1 && haulPointsFor(0.5) === 0.5 && haulPointsFor(0.2) === 0, 'good deeds follow condition (haul bands)')

console.log('events:')
const tier = { shockFloorG: 1, breakG: 3 }
const burst = makeFragile(tier), evs = []
for (const g of [0.2, 1.5, 2.0, 1.8, 0.9, 0.2]) { const e = burst.step(g); if (e) evs.push(e) }
ok(evs.length === 1 && Math.abs(evs[0].peakG - 2) < 1e-9 && Math.abs(burst.health - (1 - shockCost(2, 1, 3))) < 1e-12,
  `a burst above the floor is ONE event priced on its peak (cost ${(evs[0]?.cost * 100).toFixed(0)} %)`)
const calm = makeFragile(tier)
for (let i = 0; i < 600; i++) calm.step(0.95 * Math.abs(Math.sin(i)))
ok(calm.health === 1, 'chatter below the floor is free')
const smash = makeFragile(tier); smash.step(3.2); smash.step(0)
ok(smash.health === 0 && smash.step(5) === null, 'one hit at break destroys it, and health never goes below 0 or back up')

// ── 3–4. physics: the calibration table ──────────────────────────────────────────────────────
console.log('physics:')
// The light vase stands for glassware: mass is real, and 240 kg of panes damps the bed so much that
// the same washboard reaches it at ~1.06 g against the vase's ~1.34 (logged as `panes`, not asserted).
const TIERS = {
  glassware: THINGS.find(t => t.id === 'ornateVase'),
  panes: THINGS.find(t => t.id === 'glassPanes'),
  delicate: THINGS.find(t => t.id === 'framedArtwork'),
  sturdy: THINGS.find(t => t.id === 'uprightPiano'),
}
// One scenario, one tier: the truck on a flat ground box (the chassis's crash surface) with the
// wheels on an analytic road; a load of the tier's real mass welded at strapPose.
async function run (thing, { amp = 0, speed = 0, drop = 0, roll = 0, steer = 0, steps = 300 }) {
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const engine = await createPhysicsEngine()
  const ground = engine.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 } })
  engine.addBox(ground, { x: 3000, y: 5, z: 3000 }, { friction: 0.9, group: GROUP_TERRAIN })
  const vs = makeVehicleState(P, RUNNING), eq = computeStaticEquilibrium(P)
  vs.position.set(0, eq.bodyY + drop, 1000)
  vs.strutComp = [...eq.strutComp]
  if (roll) vs.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll)
  const chassis = createVehicleChassis(engine, vs, P, { bed: BED })
  const gy = (x, z) => amp * (Math.sin(z * 1.7) + 0.7 * Math.sin(z * 0.53 + x * 0.9))
  const road = (cx, cy, cz, r) => {
    const d = gy(cx, cz) + r - cy
    return d > 0 ? [{ normal: new THREE.Vector3(0, 1, 0), depth: d, contactPoint: new THREE.Vector3(cx, gy(cx, cz), cz) }] : []
  }
  const kg = thing.massKg[0], L = { x: 0.3, y: 0.3, z: 0.3 }, lp = strapPose(BED, L)
  const p = new THREE.Vector3(lp.x, lp.y, lp.z).applyQuaternion(vs.quaternion).add(vs.position)
  const b = engine.createBody({ type: 'dynamic', position: p, quaternion: vs.quaternion })
  engine.addBox(b, L, { density: kg / (8 * L.x * L.y * L.z), group: GROUP_DEBRIS })
  const joint = engine.createWeldJoint(chassis, b, p)
  vs.velocity.set(0, 0, -speed)
  vs.wheelOmega = [0, 1, 2, 3].map(() => speed / P.wheelRadius)
  const load = makeFragile(thing), f = { x: 0, y: 0, z: 0 }
  let peak = 0, g = 0
  for (let i = 0; i < steps; i++) {
    vs.throttle = speed ? 0.3 : 0
    if (steer) { const a = steer * Math.sin(i * DT * 2 * Math.PI / 3); vs.wheelSteerAngles = [a, a, 0, 0] }
    stepPhysics(vs, P, DT, road, { engine, chassis })
    g = feltG(engine.jointForce(joint, f), kg)
    peak = Math.max(peak, g)
    load.step(g)
  }
  engine.dispose()
  return { health: load.health, peak, last: g }
}
const pct = (h) => `${(h * 100).toFixed(0)} %`
const SCEN = {
  rest:     { steps: 120 },
  paved:    { speed: 20, steer: 0.08 },             // 45 mph slalom, ~0.6 g lateral
  washboard: { speed: 15, amp: 0.04 },              // ±4 cm at 34 mph
  crest:    { speed: 15, drop: 1 },                 // a 1 m crest landing
  rollover: { speed: 10, drop: 1, roll: 1.4 },      // tipped onto its side from 1 m
}
const res = {}
for (const [tk, thing] of Object.entries(TIERS)) {
  res[tk] = {}
  for (const [sk, sc] of Object.entries(SCEN)) res[tk][sk] = await run(thing, sc)
  console.log(`    ${tk.padEnd(9)} ` + Object.entries(res[tk]).map(([sk, r]) => `${sk} ${pct(r.health)} (${r.peak.toFixed(2)} g)`).join(' · '))
}
const all = Object.values(res)
ok(all.every(r => r.rest.last < 0.01 && r.rest.health === 1), `settled at rest the load feels ~0 g (${res.glassware.rest.last.toFixed(4)}) — gravity is removed, and the spawn settle costs nothing`)
ok(all.every(r => r.paved.health === 1), 'paved driving at pace costs nothing, any tier')
ok(res.glassware.washboard.health < 0.95, `5 s of washboard costs glassware clearly (${pct(res.glassware.washboard.health)} left)`)
ok(res.sturdy.washboard.health > 0.95, `washboard costs a sturdy piece little (${pct(res.sturdy.washboard.health)})`)
ok(res.glassware.crest.health === 0, 'a 1 m crest landing destroys glassware')
ok(res.sturdy.crest.health > 0 && res.sturdy.crest.health < 0.6, `a 1 m crest landing costs a sturdy piece most of it (${pct(res.sturdy.crest.health)})`)
ok(all.every(r => r.rollover.health === 0), 'a rollover destroys every tier')
const again = await run(TIERS.glassware, SCEN.washboard)
ok(again.health === res.glassware.washboard.health, 'same run, same health (SM-INV-12)')

console.log(fail ? '\nFRAGILE-CARGO: FAIL' : '\nFRAGILE-CARGO: all checks passed')
process.exit(fail)
