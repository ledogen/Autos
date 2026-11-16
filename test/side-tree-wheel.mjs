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
//   node test/side-tree-wheel.mjs --mph=5,10,15,20,30,40 [--armor=1]   prints the table (no gate)
//   node test/side-tree-wheel.mjs   the gate (test/gates.mjs): the tire meets a trunk at its real width; a 10 and a 15 mph
//   side hit meet the body first and leave the wheel and tire usable; a 40 mph one still lands on the left armor.

import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { stepPhysics, readRimStrikes, classifyImpactRegion } from '../src/physics.js'
import { computeStaticEquilibrium, getWheelPosition } from '../src/suspension.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { RUNNING } from '../src/ignition.js'
import { DamageModel, MPH, WHEEL_IDS, TIRE_IDS } from '../src/damage.js'
import { makeQueryContacts } from '../src/world-contacts.js'
import { sphereVsCapsule } from '../src/props/prop-collider.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const DT = 1 / 60
const TRUNK_R = 0.35, GAP = 0.25
const RL = 2   // the rear-left corner (GLOSSARY.md §Wheel Index)

export async function sideHit (mph, { seconds = 1.5, armor = 1 } = {}) {
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
  const props = { queryProps (cx, cy, cz, r, out) {
    const h = sphereVsCapsule(cx, cy, cz, r, ax, 0, az, ax, 8, az, TRUNK_R)
    if (h) {
      const t = r - h.depth
      out.push({ normal: new THREE.Vector3(h.nx, h.ny, h.nz), depth: h.depth,
        contactPoint: new THREE.Vector3(cx - h.nx * t, cy - h.ny * t, cz - h.nz * t) })
    }
    return out
  } }
  const qc = makeQueryContacts({ params: P, groundH: () => 0, groundN: () => ({ x: 0, y: 1, z: 0 }), props: () => props })
  let tireFeels = false   // a wheel's contact query handed the tire model the trunk (a sideways normal) this step
  const queryContacts = (...a) => { const hs = qc(...a); for (const h of hs) if (Math.abs(h.normal.x) > 0.5) tireFeels = true; return hs }
  const dm = new DamageModel({ params: P })
  dm.setAll(1)
  dm.condition.armorLeft = armor
  const first = { wheel: null, body: null }
  let peakJ = 0, peakRimRoad = 0, peakRim = 0, peakBump = 0, vAt = null, peakSquash = 0
  const landed = []
  for (let s = 0; s < seconds / DT; s++) {
    const vx = vs.velocity.x
    tireFeels = false
    stepPhysics(vs, P, DT, queryContacts, ctx)
    const hit = readRimStrikes(ctx.engine, ctx.chassis, vs.rimForce, DT, vs.rimHazard)
    peakRimRoad = Math.max(peakRimRoad, vs.rimForceRoad?.[RL] ?? 0)
    peakRim = Math.max(peakRim, vs.rimForce[RL])
    peakBump = Math.max(peakBump, vs.bumpForce?.[RL] ?? 0)
    // First touch, each: the tire model is handed the trunk / the engine reports a body contact. And how far the trunk
    // stood inside the RL tire's outboard sidewall plane (the real tire's squash).
    // Only while the trunk is square beside the hub: once the truck pivots off it the plane test means nothing.
    const hub = getWheelPosition(RL, vs, P)
    const squash = Math.abs(hub.z - az) < 0.15 ? ax + TRUNK_R - (hub.x - P.wheelWidth / 2) : 0
    peakSquash = Math.max(peakSquash, squash)
    const wheelSees = tireFeels
    if (wheelSees && first.wheel == null) { first.wheel = s; vAt ??= -vx / MPH }
    if (hit.impulse > 0 && first.body == null) { first.body = s; vAt ??= -vx / MPH }
    peakJ = Math.max(peakJ, hit.impulse)
    dm.step(vs, P, DT)
    const r = dm.feedContact(classifyImpactRegion(hit.point, hit.normal), hit.impulse, P.mass, DT, vs.velocity)
    if (r) landed.push(`${(r.v / MPH).toFixed(1)}${r.region[0]}`)
  }
  ctx.dispose()
  return {
    mph, vAt, firstTouch: first.wheel == null && first.body == null ? 'none'
      : first.body == null || (first.wheel != null && first.wheel < first.body) ? `wheel (${first.body == null ? 'no body' : `body +${first.body - first.wheel} st`})`
      : first.wheel === first.body ? 'both' : `body (wheel ${first.wheel == null ? 'never' : `+${first.wheel - first.body} st`})`,
    peakJ, peakSquash, peakRimRoad, peakRim, peakBump, landed,
    wheel: dm.get(WHEEL_IDS[RL]), tire: dm.get(TIRE_IDS[RL]), flat: dm.flat[RL], collapsed: dm.collapsed(RL),
    armor: dm.get('armorLeft'),
  }
}

async function table (speeds, armor) {
  console.log(`armor ${armor}`)
  console.log('mph | v@touch | first touch          | body J N·s | sidewall cm | rim road kN | rim core kN | bump kN | impacts     | wheel RL | tire RL     | armor L')
  for (const mph of speeds) {
    const r = await sideHit(mph, { armor })
    console.log(`${String(mph).padStart(3)} | ${(r.vAt ?? 0).toFixed(1).padStart(7)} | ${r.firstTouch.padEnd(20)} | ${r.peakJ.toFixed(0).padStart(10)} | ${(r.peakSquash * 100).toFixed(1).padStart(11)} | ${(r.peakRimRoad / 1e3).toFixed(1).padStart(11)} | ${(r.peakRim / 1e3).toFixed(1).padStart(11)} | ${(r.peakBump / 1e3).toFixed(1).padStart(7)} | ${r.landed.join(' ').padEnd(11)} | ${(r.wheel * 100).toFixed(0).padStart(5)} %${r.collapsed ? ' C' : '  '} | ${(r.tire * 100).toFixed(0).padStart(4)} %${r.flat ? ' flat' : '     '} | ${(r.armor * 100).toFixed(0).padStart(5)} %`)
  }
}

const argv = (k) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null }
if (argv('mph')) {
  await table(argv('mph').split(',').map(Number), Number(argv('armor') ?? 1))
} else {
  let fail = 0
  const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }
  console.log('§1 a wheel meets a trunk as the tire cylinder (world-contacts.js), not as a sphere of its radius')
  {
    const P = RANGER_PARAMS, R = P.wheelRadius, hw = P.wheelWidth / 2, A = { x: 1, y: 0, z: 0 }
    const at = (x, z) => makeQueryContacts({ params: P, groundH: () => -10, groundN: () => ({ x: 0, y: 1, z: 0 }), props: () => ({
      queryProps (cx, cy, cz, r, out) {
        const h = sphereVsCapsule(cx, cy, cz, r, x, -5, z, x, 5, z, TRUNK_R)
        if (h) out.push({ normal: new THREE.Vector3(h.nx, h.ny, h.nz), depth: h.depth, contactPoint: new THREE.Vector3() })
        return out
      } }) })(0, 0, 0, R, true, A)
    const beside = at(hw - 0.01 + TRUNK_R, 0), clear = at(hw + 0.01 + TRUNK_R, 0), ahead = at(0, -(R - 0.05 + TRUNK_R))
    ok(beside.length === 1 && Math.abs(beside[0].depth - 0.01) < 1e-6, `a trunk 1 cm inside the sidewall plane: 1 cm deep (${beside[0]?.depth.toFixed(4)} m; the sphere read ${(R - hw + 0.01).toFixed(3)})`)
    ok(clear.length === 0, 'a trunk 1 cm outboard of the sidewall: no contact (the sphere felt it 24 cm deep)')
    ok(ahead.length === 1 && Math.abs(ahead[0].depth - 0.05) < 1e-6, `a trunk on the tread: the sphere's depth, unchanged (${ahead[0]?.depth.toFixed(4)} m) — a tread strike still reaches the rim`)
  }
  console.log('§2 a 10 and a 15 mph side hit at the rear wheel: the body takes it, the wheel and tire stay usable')
  for (const mph of [10, 15]) {
    const r = await sideHit(mph)
    ok(r.firstTouch.startsWith('body'), `${mph} mph: first touch ${r.firstTouch} (was the wheel, 23 cm before the body could)`)
    ok(!r.flat && r.wheel >= 0.5 && !r.collapsed, `${mph} mph: wheel RL ${(r.wheel * 100).toFixed(0)} %, tire ${r.flat ? 'FLAT' : 'holding air'} (was pinch-flatted at 15)`)
  }
  console.log('§3 a 40 mph one still lands: priced on the left armor')
  {
    const r = await sideHit(40)
    ok(r.landed.length > 0 && r.armor < 1, `40 mph: impacts ${r.landed.join(' ')} mph, left armor ${(r.armor * 100).toFixed(0)} %`)
  }
  console.log(fail ? '\nFAIL — a side hit reaches the wheel before the body' : '\nPASS — a side hit on a tree meets the body; the tire is its real width')
  process.exit(fail)
}
