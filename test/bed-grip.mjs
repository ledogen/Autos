// GATE: FEAT-231 — the rubber bed mat and the bedliner grip loose cargo on the bed floor.
//
// Owner, 2026-10-22: the mat raises cargo-to-floor friction to μ 0.30 ("stops sliding, not bouncing"), the bedliner
// to μ 0.60. The bare bed is FEAT-88's 0.15. All three are the pair μ a firewood bundle (friction 0.8) sees, set on the
// floor pan by src/physics.js setBedGrip through the engine's geometric-mean mixing.
//
// The manoeuvre: a flat 11 kg block of bundle friction (0.8) on the real chassis' bed floor, the truck held still,
// and a lateral acceleration ramped up slowly (applied to the block as m·a: the bed's frame accelerating the other
// way). The block breaks loose at a = μ·g. A flat block so it slides before it tips (half-width / height = 4).
// Gravity is applied to the block by hand too (world gravity 0) so the held chassis is not falling away under it.
//
// Checks: each case breaks loose within ±0.03 g of its μ (the ramp's detection lag is ~0.02 g); the data and the
// inventory pick the best one owned; no item = the bare value (the bare truck is untouched).
//
// Run: node test/bed-grip.mjs

import { RANGER_PARAMS } from '../data/ranger.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { ITEMS } from '../data/items.js'
import { createPhysicsEngine, GROUP_DEBRIS } from '../src/physics-engine.js'
import { createVehicleChassis, setBedGrip } from '../src/physics.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { RUNNING } from '../src/ignition.js'
import { InventorySystem } from '../src/inventory.js'

const DT = 1 / 60, G = 9.81, KG = 11, HALF = { x: 0.2, y: 0.05, z: 0.2 }
const RAMP = 0.2          // m/s² per s
const SLIP = 0.01         // m of slide = broken loose
const BED = DEFAULT_VEHICLE_MODEL.bed
let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }

/** The lateral acceleration [g] at which the block slides on the bed floor at this pair μ (null = bare). */
async function breakLoose (pairMu) {
  const engine = await createPhysicsEngine({ gravity: { x: 0, y: 0, z: 0 } })
  const P = { ...RANGER_PARAMS }
  const vs = makeVehicleState(P, RUNNING)
  vs.position.set(0, 1, 0)
  const chassis = createVehicleChassis(engine, vs, P, { bed: BED })
  setBedGrip(engine, chassis, pairMu)
  const pos = { x: 0, y: 1, z: 0 }, quat = { x: 0, y: 0, z: 0, w: 1 }, zero = { x: 0, y: 0, z: 0 }
  const z = (BED.frontZ + BED.archZ0) / 2
  const block = engine.createBody({ type: 'dynamic', position: { x: 0, y: 1 + BED.floorY + HALF.y + 0.002, z } })
  engine.addBox(block, HALF, { friction: 0.8, restitution: 0, group: GROUP_DEBRIS,
    density: KG / (8 * HALF.x * HALF.y * HALF.z) })
  const p = { x: 0, y: 0, z: 0 }, q = { x: 0, y: 0, z: 0, w: 1 }
  const step = (a) => {
    engine.setTransform(chassis, pos, quat); engine.setVelocity(chassis, zero, zero)
    engine.applyForce(block, { x: KG * a, y: -KG * G, z: 0 })
    engine.step(DT)
  }
  for (let i = 0; i < 60; i++) step(0)               // settle
  engine.getTransform(block, p, q)
  const x0 = p.x
  for (let i = 1; i < 60 * 60; i++) {
    const a = RAMP * i * DT
    step(a)
    engine.getTransform(block, p, q)
    if (p.x - x0 > SLIP) { engine.dispose(); return a / G }
  }
  engine.dispose()
  return Infinity
}

console.log('FEAT-231 bed grip: lateral acceleration at which an 11 kg bundle-friction block breaks loose')
const cases = [['bare bed', null, 0.15], ['rubber mat', ITEMS.rubberBedMat.bedMu, 0.30], ['bedliner', ITEMS.bedliner.bedMu, 0.60]]
for (const [name, mu, want] of cases) {
  const g = await breakLoose(mu)
  ok(Math.abs(g - want) <= 0.03, `${name}: breaks loose at ${g.toFixed(3)} g (μ ${want})`)
}

const inv = new InventorySystem({ slotCap: () => 20, onMassChange: () => {}, onChange: () => {} })
ok(inv.bedMu() === null, 'nothing owned: bare bed (null)')
inv.grant('rubberBedMat'); ok(inv.bedMu() === 0.30, `mat owned: ${inv.bedMu()}`)
inv.grant('bedliner');     ok(inv.bedMu() === 0.60, `mat and liner owned: the liner wins (${inv.bedMu()})`)

// FEAT-231 / DEC-352: the look follows owns(): the mat alone, then the liner over it (both owned is valid), gone when dropped.
const inv2 = new InventorySystem({ slotCap: () => 20, onMassChange: () => {}, onChange: () => {} })
ok(!inv2.owns('rubberBedMat') && !inv2.owns('bedliner'), 'nothing owned: neither look')
inv2.grant('bedliner'); ok(inv2.owns('bedliner') && !inv2.owns('rubberBedMat'), 'liner bought first: owned, mat not')
inv2.grant('rubberBedMat'); ok(inv2.owns('bedliner') && inv2.owns('rubberBedMat'), 'the mat can still be bought with the liner fitted')
inv2.drop(inv2.list().findIndex(r => r.id === 'bedliner')); ok(!inv2.owns('bedliner') && inv2.bedMu() === 0.30, 'dropping the liner un-fits it (the mat grip returns)')

console.log(fail ? 'FAIL' : 'PASS')
process.exit(fail)
