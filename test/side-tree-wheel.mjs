// test/side-tree-wheel.mjs — BUG-185: the truck sliding sideways into a tree at its rear wheel.
//
// The owner (2026-11-16): a 10–20 mph side hit on a tree at the rear wheel destroyed it. This stages that hit through the
// GAME's step, in the game's order (main.js): stepPhysics with the game's wheel contact (src/world-contacts.js, props
// answered the way PropSystem.queryProps answers a trunk: src/props/prop-collider.js sphereVsCapsule) → readRimStrikes
// → damage.step → damage.feedContact. The trunk is in the engine too, as terrain-physics.js PropPhysics builds it
// (static capsule, friction 0.8, restitution 0), so the body meets the same tree the wheel does. Open-bed chassis, as
// the world truck is built. The truck slides square to its left (−x), level, wheels straight and not rolling; the
// trunk (r 0.35 m: a 0.30 m trunk × trunkRadiusScale 1.15) stands with its axis on the rear axle line, its surface
// GAP m outboard of the body's widest point, so the lateral speed at contact is close to the launch speed.
//
//   node test/side-tree-wheel.mjs [--mph=5,10,15,20,30,40]   prints the table
//   As a gate (test/gates.mjs): 10 and 15 mph leave the struck wheel usable (≥ 50 %, not collapsed); 40 mph does not.

import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { stepPhysics, readRimStrikes, classifyImpactRegion } from '../src/physics.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { RUNNING } from '../src/ignition.js'
import { DamageModel, MPH, WHEEL_IDS, TIRE_IDS } from '../src/damage.js'
import { makeQueryContacts } from '../src/world-contacts.js'
import { sphereVsCapsule } from '../src/props/prop-collider.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const DT = 1 / 60
const TRUNK_R = 0.35, GAP = 0.25
const RL = 2   // the rear-left corner (GLOSSARY.md §Wheel Index)

export async function sideHit (mph, { seconds = 1.5 } = {}) {
  const P = structuredClone(RANGER_PARAMS)
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const vs = makeVehicleState(P, RUNNING)
  const eq = computeStaticEquilibrium(P)
  vs.position.set(0, eq.bodyY, 0)
  vs.strutComp = [...eq.strutComp]
  vs.velocity.set(-mph * MPH, 0, 0)
  const ctx = await makeEngineCtx(vs, P, { groundFn: () => 0, extent: 16, cell: 0.5, bed: DEFAULT_VEHICLE_MODEL.bed })
  // The trunk: axis on the rear axle line (body z = wheelbase × weightFront), surface GAP outboard of the 0.85 m flank.
  const ax = -(0.85 + GAP + TRUNK_R), az = P.wheelbase * P.weightFront
  ctx.engine.addCapsule(ctx.engine.createBody({ type: 'static' }), { x: ax, y: 0, z: az }, { x: ax, y: 8, z: az }, TRUNK_R,
    { friction: 0.8, restitution: 0 })
  let rlTouch = false
  const props = { queryProps (cx, cy, cz, r, out) {
    const h = sphereVsCapsule(cx, cy, cz, r, ax, 0, az, ax, 8, az, TRUNK_R)
    if (h) {
      const t = r - h.depth
      out.push({ normal: new THREE.Vector3(h.nx, h.ny, h.nz), depth: h.depth,
        contactPoint: new THREE.Vector3(cx - h.nx * t, cy - h.ny * t, cz - h.nz * t) })
    }
    return out
  } }
  const queryContacts = makeQueryContacts({ params: P, groundH: () => 0, groundN: () => ({ x: 0, y: 1, z: 0 }), props: () => props })
  const dm = new DamageModel({ params: P })
  dm.setAll(1)
  const first = { wheel: null, body: null }
  let peakJ = 0, peakRimRoad = 0, peakRim = 0, peakBump = 0, vAt = null
  const landed = []
  for (let s = 0; s < seconds / DT; s++) {
    const vx = vs.velocity.x
    stepPhysics(vs, P, DT, queryContacts, ctx)
    const hit = readRimStrikes(ctx.engine, ctx.chassis, vs.rimForce, DT, vs.rimHazard)
    peakRimRoad = Math.max(peakRimRoad, vs.rimForceRoad?.[RL] ?? 0)
    peakRim = Math.max(peakRim, vs.rimForce[RL])
    peakBump = Math.max(peakBump, vs.bumpForce?.[RL] ?? 0)
    // First touch, each: the wheel's analytic query sees the trunk / the engine reports a body contact.
    const wheelSees = props.queryProps(vs.position.x - 0.715, vs.position.y - 0.18, vs.position.z + az, P.wheelRadius, []).length > 0
    if (wheelSees && first.wheel == null) { first.wheel = s; vAt ??= -vx / MPH }
    if (hit.impulse > 0 && first.body == null) { first.body = s; vAt ??= -vx / MPH }
    peakJ = Math.max(peakJ, hit.impulse)
    dm.step(vs, P, DT)
    const r = dm.feedContact(classifyImpactRegion(hit.point, hit.normal), hit.impulse, P.mass, DT, vs.velocity)
    if (r) landed.push(`${(r.v / MPH).toFixed(1)}${r.region[0]}`)
  }
  ctx.dispose()
  void rlTouch
  return {
    mph, vAt, firstTouch: first.wheel == null && first.body == null ? 'none'
      : first.body == null || (first.wheel != null && first.wheel < first.body) ? `wheel (${first.body == null ? 'no body' : `body +${first.body - first.wheel} st`})`
      : first.wheel === first.body ? 'both' : `body (wheel ${first.wheel == null ? 'never' : `+${first.wheel - first.body} st`})`,
    peakJ, peakRimRoad, peakRim, peakBump, landed,
    wheel: dm.get(WHEEL_IDS[RL]), tire: dm.get(TIRE_IDS[RL]), flat: dm.flat[RL], collapsed: dm.collapsed(RL),
    armor: dm.get('armorLeft'),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.find(s => s.startsWith('--mph='))
  const speeds = (a ? a.slice(6) : '5,10,15,20,30,40').split(',').map(Number)
  console.log('mph | v@touch | first touch          | body J N·s | rim road kN | rim core kN | bump kN | impacts     | wheel RL | tire RL     | armor L')
  for (const mph of speeds) {
    const r = await sideHit(mph)
    console.log(`${String(mph).padStart(3)} | ${(r.vAt ?? 0).toFixed(1).padStart(7)} | ${r.firstTouch.padEnd(20)} | ${r.peakJ.toFixed(0).padStart(10)} | ${(r.peakRimRoad / 1e3).toFixed(1).padStart(11)} | ${(r.peakRim / 1e3).toFixed(1).padStart(11)} | ${(r.peakBump / 1e3).toFixed(1).padStart(7)} | ${r.landed.join(' ').padEnd(11)} | ${(r.wheel * 100).toFixed(0).padStart(5)} %${r.collapsed ? ' C' : '  '} | ${(r.tire * 100).toFixed(0).padStart(4)} %${r.flat ? ' flat' : '     '} | ${(r.armor * 100).toFixed(0).padStart(5)} %`)
  }
}
