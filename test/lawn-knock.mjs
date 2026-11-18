// GATE (FEAT-251, owner 2026-11-17: "The only thing I want players to actually collide with is the fire pit …
// I'd rather it use the demolition system and spawn in a rigid body physics object when the player bumps into
// the lawn ornament. So it can have mass and hit the truck and tumble."):
//
//   §1 the pool — every 'lawnFurniture' model but the fire pit is knockable (no fixed collider, poi.js satSolid
//      null); the fire pit is the one solid. Each knockable's body, built by the REAL DebrisSystem from its
//      shipped GLB as main.js builds it, weighs its registry mass.
//   §2 the strike — the truck at 5 / 15 / 30 m/s into a SLEEPING chair and grill stood exactly as main.js
//      _updateOrnaments stands them (asleep at its standing pose, a centimetre clear, spawned long before the
//      truck arrives — so promotion is the engine waking a body that already exists: no overlapping spawn, no
//      impulse spike). It wakes on contact, is pushed (never passed through), leaves at a speed the momentum
//      bound allows, and the truck loses at most 1.25× the momentum bound 2·m·v/M in any one step (BUG-108's
//      rule). Damage is priced by the real DamageModel fed as main.js feeds it: a chair costs no armor at any
//      speed; the grill's cost at 30 m/s (and a 30 kg grill's) is REPORTED, not asserted.
//   §3 the fire pit — MESH == PHYSICS (its engine collider == the wheel-query solid at 4000 probes) and it
//      stops a truck at 5 m/s.
//   §4 the pool cap — the ornaments are PINNED like demolition targets: never reclaimed by DEBRIS_CAP, which
//      still holds the thrown bodies to 12.
//   §5 cost (REPORT ONLY — wall clock): physics step time with 0 / 10 / 30 awake ornaments.
//   §6 FEAT-268 (DEC-405, owner: "Barrels and crates at the farm should get this treatment as well … realistic but
//      randomized weights. Max crate weight should be 200 kilograms."): the farm's drums and crates are knockable,
//      the pallet stays solid; each load is deterministic per placement and inside its range (crates ≤ 200 kg); the
//      engine body carries poi.js knockMass's mass AND centre of mass; the demolition kinds are untouched. The hit
//      table (20 / 40 / 60 km/h × empty / median / full) holds the BUG-108 step rule; its costs are REPORTED.
//   §7 FEAT-268 the flamingo "launched pretty hard": the light props struck at 20–80 km/h across the bumper and
//      the wheel line leave at ≤ 3× the truck's speed (a flamingo pinched rigid under a tire took 197 kN and left
//      at 54× before its shell got a crush strength).
//
// Run: node test/lawn-knock.mjs

import fs from 'node:fs'
import * as THREE from 'three'

// model-service loads GLBs with GLTFLoader by relative URL. Headless there is no page to resolve it against,
// so hand the loader the shipped file itself as a data: URL (node's fetch reads those), and give it the one
// browser event class it constructs.
globalThis.ProgressEvent ??= class extends Event { constructor (t, o = {}) { super(t); Object.assign(this, o) } }
THREE.DefaultLoadingManager.setURLModifier(u => u.startsWith('data:') ? u
  : 'data:application/octet-stream;base64,' + fs.readFileSync(new URL('../' + u, import.meta.url)).toString('base64'))

const { PROP_MODELS, modelsTagged } = await import('../data/prop-models.js')
const { RANGER_PARAMS } = await import('../data/ranger.js')
const { createPhysicsEngine, GROUP_TERRAIN } = await import('../src/physics-engine.js')
const { stepPhysics, createVehicleChassis, readRimStrikes, classifyImpactRegion } = await import('../src/physics.js')
const { makeVehicleState } = await import('../src/vehicle-state.js')
const { computeStaticEquilibrium } = await import('../src/suspension.js')
const { RUNNING } = await import('../src/ignition.js')
const { DebrisSystem, DEBRIS_CAP } = await import('../src/debris.js')
const { DamageModel, TRACK_IDS } = await import('../src/damage.js')
const { PoiSystem, satSolid, knockMass } = await import('../src/poi.js')
const { TARGET_TYPES } = await import('../src/demolition.js')
const { DEBRIS_TYPES } = await import('../src/debris.js')
const { PoiPhysics } = await import('../src/terrain-physics.js')
const { makeQueryContacts } = await import('../src/world-contacts.js')
const { getWheelPosition } = await import('../src/suspension.js')

const DT = 1 / 60
let fails = 0
const check = (label, ok) => { console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}`); if (!ok) fails++ }

// The masses FEAT-251 specifies (data/prop-models.js carries each one's reasoning). A change is a decision.
const MASS = { flamingoUp: 0.3, flamingoDown: 0.3, campChair: 3.5, gnome: 10, beachBall: 0.35, bbqGrill: 15,
  propaneTank: 16.8, pottedPlant: 14 }

/** main.js's ornament spec for a registry key (the _buildPoiMeshes satellite loop). */
const ornamentSpec = (key) => { const k = PROP_MODELS[key].knockable
  return { model: key, massKg: k.massKg ?? k.emptyKg, friction: 0.6, restitution: k.restitution ?? 0.3, crushN: k.crushN } }
// FEAT-268: the farm's knockables (the yardClutter drums and crates) and the one that stays solid.
const FARM = ['drumClosed', 'drumOpen', 'drumCrushed', 'barrelPlastic', 'smallCrate', 'largeCrate']

/** A flat world: engine, 6 km ground slab, the real DebrisSystem, every lawn knockable loaded. */
async function world () {
  const engine = await createPhysicsEngine()
  const ground = engine.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 } })
  engine.addBox(ground, { x: 3000, y: 5, z: 3000 }, { friction: 0.9, group: GROUP_TERRAIN })
  const debris = new DebrisSystem(engine, new THREE.Scene())
  for (const key of [...Object.keys(MASS), ...FARM]) await debris.load(`ornament:${key}`, ornamentSpec(key))
  return { engine, debris }
}

/** Stand ornament `key` as main.js _updateOrnaments does: its body at the base pose + half its height, asleep. */
function stand (debris, engine, key, x, z, yaw = 0, massKg, fill = null) {
  // main.js: the model's base (ground + its lift) + (half.y − lift + 1 cm) — on flat ground at y 0, half.y + 1 cm.
  const kind = `ornament:${key}`, half = debris.halfExtents(kind)
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
  const still = { x: 0, y: 0, z: 0 }
  const body = debris.spawn(kind, { x, y: half.y + 0.01, z }, still,
    { spin: still, quaternion: { x: q.x, y: q.y, z: q.z, w: q.w }, pinned: true, ...(massKg ? { massKg } : {}) })
  const md = fill != null && knockMass({ key, x, z, variant: 0 }, half, fill)   // main.js _updateOrnaments (FEAT-268)
  if (md) engine.setMassData(body, md.massKg, md.inertia, md.center)
  engine.sleep(body)
  return body
}

/** A Ranger on the flat at `speed` heading −Z, its speed held; ctx for stepPhysics. */
function truck (engine, speed) {
  const P = structuredClone(RANGER_PARAMS)
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]; P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const vs = makeVehicleState(P, RUNNING), eq = computeStaticEquilibrium(P)
  vs.position.set(0, eq.bodyY, 0); vs.strutComp = [...eq.strutComp]
  vs.velocity.set(0, 0, -speed); vs.wheelOmega = [0, 1, 2, 3].map(() => speed / P.wheelRadius)
  const chassis = createVehicleChassis(engine, vs, P)
  return { P, vs, chassis, M: engine.getMass(chassis) }
}
const flat = (cx, cy, cz, r) => cy < r ? [{ normal: new THREE.Vector3(0, 1, 0), depth: r - cy, contactPoint: new THREE.Vector3(cx, 0, cz) }] : []
const fwd = new THREE.Vector3()
const fwdSpeed = (vs) => vs.velocity.dot(fwd.set(0, 0, -1).applyQuaternion(vs.quaternion))

/**
 * One strike: the truck held at `speed` into `key` standing 15 m ahead (null = the baseline run). Records the
 * truck's forward and vertical speed per step, the body's speed, and prices damage exactly as main.js's step does.
 */
async function strike (key, speed, massKg, { ox = 0, yaw = 0, fill = null } = {}) {
  const { engine, debris } = await world()
  const t = truck(engine, speed)
  const body = key ? stand(debris, engine, key, ox, -15, yaw, massKg, fill) : null
  const m = body != null ? engine.getMass(body) : 0
  const dmg = new DamageModel({ params: t.P })
  const v = [], vy = [], bv = [], lin = new THREE.Vector3(), ang = new THREE.Vector3(), p0 = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Quaternion()
  if (body != null) engine.getTransform(body, p0, q)
  let hit = -1, awakeAtSpawn = body != null && engine.isAwake(body)
  for (let s = 0; s < Math.round(60 * (16 / speed + 1.5)); s++) {
    const vNow = fwdSpeed(t.vs)
    t.vs.throttle = Math.max(0, Math.min(1, (speed - vNow) * 0.5)); t.vs.brake = Math.max(0, Math.min(1, (vNow - speed) * 0.5))
    debris.beforeStep(t.chassis, null)
    stepPhysics(t.vs, t.P, DT, flat, { engine, chassis: t.chassis })
    const h = readRimStrikes(engine, t.chassis, t.vs.rimForce, DT, t.vs.rimHazard)
    dmg.step(t.vs, t.P, DT)
    dmg.feedContact(classifyImpactRegion(h.point, h.normal), h.impulse, t.P.mass, DT, t.vs.velocity)
    v.push(fwdSpeed(t.vs)); vy.push(t.vs.velocity.y)
    if (body != null) { engine.getVelocity(body, lin, ang); bv.push(lin.clone()) }
    if (hit < 0 && body != null && engine.isAwake(body)) hit = s
  }
  if (body != null) engine.getTransform(body, p, q)
  const cond = Object.fromEntries(TRACK_IDS.map(id => [id, dmg.get(id)]))
  engine.dispose()
  return { v, vy, bv, hit, M: t.M, m, cond, moved: p.distanceTo(p0), pushedZ: p0.z - p.z, awakeAtSpawn }
}

// ── §1 the pool ───────────────────────────────────────────────────────────────────────────────────────
console.log('§1 the lawn furniture pool')
{
  const pool = modelsTagged('lawnFurniture')
  const sat = (key) => ({ key, x: 0, y: 0, z: 0, yaw: 0 })
  check(`the pool is the nine FEAT-71 lawn items (${pool.join(', ')})`, pool.length === 9 && pool.includes('firePit'))
  for (const key of pool) {
    if (key === 'firePit') check('firePit: not knockable, a fixed collider (satSolid)', !PROP_MODELS.firePit.knockable && satSolid(sat(key)) != null)
    else check(`${key}: knockable at ${MASS[key]} kg, no fixed collider`, PROP_MODELS[key].knockable?.massKg === MASS[key] && satSolid(sat(key)) == null)
  }
  const { engine, debris } = await world()
  const rows = []
  for (const key of Object.keys(MASS)) {
    const b = stand(debris, engine, key, 10 * rows.length, 50)
    const m = engine.getMass(b), h = debris.halfExtents(`ornament:${key}`)
    rows.push(`${key} ${m.toFixed(2)} kg (${(2 * h.x).toFixed(2)} × ${(2 * h.y).toFixed(2)} × ${(2 * h.z).toFixed(2)} m)`)
    check(`${key}: the engine body built from its GLB weighs ${m.toFixed(3)} kg (registry ${MASS[key]})`, Math.abs(m / MASS[key] - 1) < 0.01)
  }
  engine.dispose()
}

// ── §2 the strike ─────────────────────────────────────────────────────────────────────────────────────
console.log('\n§2 the truck into a sleeping chair / grill (speed held)')
console.log('    what            v m/s  woke  pushed m  launch m/s (×v)  truck Δv m/s  worst step / bound  body peak g  truck |Δvy| m/s  armor lost  worst part lost')
const report = []
for (const [key, mass] of [['campChair'], ['bbqGrill'], ['bbqGrill', 30]]) for (const speed of mass ? [30] : [5, 15, 30]) {
  const base = await strike(null, speed), r = await strike(key, speed, mass)
  const label = `${key}${mass ? ` @${mass} kg` : ''}`
  if (r.hit < 0) { check(`${label} at ${speed} m/s: the truck reached it`, false); continue }
  let worst = 0, lost = 0, dvy = 0, peakA = 0, launch = 0
  for (let s = Math.max(1, r.hit); s < Math.min(r.v.length, r.hit + 60); s++) {
    worst = Math.max(worst, (r.v[s - 1] - r.v[s]) - (base.v[s - 1] - base.v[s]))
    lost = Math.max(lost, base.v[s] - r.v[s])
    dvy = Math.max(dvy, Math.abs(r.vy[s] - base.vy[s]))
  }
  for (let s = Math.max(1, r.hit - 1); s < Math.min(r.bv.length, r.hit + 20); s++) {
    peakA = Math.max(peakA, r.bv[s].distanceTo(r.bv[s - 1]) / DT)
    launch = Math.max(launch, Math.hypot(r.bv[s].x, r.bv[s].z))
  }
  const bound = 2 * r.m * speed / r.M
  const armorLost = ['armorFront', 'armorLeft', 'armorRight', 'armorRear'].reduce((a, id) => a + (base.cond[id] - r.cond[id]), 0)
  const partLost = TRACK_IDS.reduce((a, id) => Math.max(a, base.cond[id] - r.cond[id]), 0)
  const worstPart = TRACK_IDS.reduce((a, id) => (base.cond[id] - r.cond[id] > base.cond[a] - r.cond[a] ? id : a), TRACK_IDS[0])
  report.push(`    ${label.padEnd(15)} ${String(speed).padStart(5)} ${String(r.hit).padStart(5)} ${r.pushedZ.toFixed(1).padStart(9)} ${launch.toFixed(1).padStart(10)} (${(launch / speed).toFixed(2)})`
    + `  ${lost.toFixed(3).padStart(12)}  ${worst.toFixed(3)} / ${bound.toFixed(3)}  ${(peakA / 9.81).toFixed(0).padStart(11)}  ${dvy.toFixed(3).padStart(15)}`
    + `  ${(100 * armorLost).toFixed(2).padStart(9)}%  ${(100 * partLost).toFixed(2)}% ${partLost > 5e-4 ? worstPart : ''}`)
  console.log(report.at(-1))
  if (mass) continue   // the 30 kg grill is a report row only
  check(`${label} at ${speed} m/s: asleep when stood, woken by the contact, pushed ahead (${r.pushedZ.toFixed(1)} m), not passed through`,
    !r.awakeAtSpawn && r.pushedZ > 1)
  check(`${label} at ${speed} m/s: worst one-step speed loss ${worst.toFixed(3)} ≤ 1.25 × the momentum bound ${bound.toFixed(3)}`, worst <= 1.25 * bound + 1e-3)
  check(`${label} at ${speed} m/s: launched at ${(launch / speed).toFixed(2)}× the truck's speed — between a plastic hit (1×, less the bumper's glancing share) and an elastic one (2×)`,
    launch > 0.7 * speed && launch < 2.1 * speed)
  check(`${label} at ${speed} m/s: no kick — the truck's vertical speed stays within 0.15 m/s of the baseline run (${dvy.toFixed(3)})`, dvy < 0.15)
  if (key === 'campChair') check(`campChair at ${speed} m/s costs the armor nothing (${(100 * armorLost).toFixed(3)}%)`, armorLost < 1e-6)
}

// ── §3 the fire pit ───────────────────────────────────────────────────────────────────────────────────
console.log('\n§3 the fire pit')
{
  const engine = await createPhysicsEngine()
  const ground = engine.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 } })
  engine.addBox(ground, { x: 3000, y: 5, z: 3000 }, { friction: 0.9, group: GROUP_TERRAIN })
  const pois = new PoiSystem({ getParams: () => ({}) })
  // In the left wheels' line. Dead centre the 1.26 m ring fits between the wheels and the 0.40 m ring passes under
  // the body collider (it has no axle or diff hanging below the frame), so a centred truck rolls over it.
  const P0 = structuredClone(RANGER_PARAMS), wx = getWheelPosition(0, makeVehicleState(P0, RUNNING), P0).x
  const pit = satSolid({ key: 'firePit', x: wx, y: 0, z: -12, yaw: 0.4 })
  new PoiPhysics(engine).sync([pit], 1.6)
  let seed = 251, probes = 0, hits = 0, mismatch = 0
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < 4000; i++) {
    const cx = wx + (rnd() - 0.5) * 3, cy = rnd() * 0.8 - 0.1, cz = -12 + (rnd() - 0.5) * 3, r = 0.05 + rnd() * 0.3
    const a = pois._boxesContact(pit, 0.8, cx, cy, cz, r)
    const e = engine.contactSphere({ x: cx, y: cy, z: cz }, r, { collidesWith: ~GROUP_TERRAIN })
    probes++; if (a) hits++
    const eDepth = e.length ? Math.max(...e.map(h => h.depth ?? 0)) : 0
    if (!!a !== e.length > 0 && Math.max(a?.depth ?? 0, eDepth) > 1e-3) mismatch++
  }
  check(`MESH == PHYSICS: the fire pit's engine collider == the wheel-query solid at ${probes} probes (${hits} hits, ${mismatch} mismatches)`, mismatch === 0 && hits > 200)
  // The wheels feel it through the game's own contact query (world-contacts.js, its pois() hook), the body and
  // the rim cores through the engine collider above.
  const qc = makeQueryContacts({ params: RANGER_PARAMS, groundH: () => 0, groundN: () => ({ x: 0, y: 1, z: 0 }),
    pois: () => ({ queryContact: (cx, cy, cz, r) => pois._boxesContact(pit, 0.8, cx, cy, cz, r) }) })
  const t = truck(engine, 5)
  let vMin = 5
  for (let s = 0; s < 240; s++) {
    t.vs.throttle = 0; t.vs.brake = 0
    stepPhysics(t.vs, t.P, DT, qc, { engine, chassis: t.chassis })
    vMin = Math.min(vMin, fwdSpeed(t.vs))
  }
  const frontZ = t.vs.position.z - RANGER_PARAMS.bodyLength / 2
  check(`a truck coasting in at 5 m/s is stopped by it: least forward speed ${vMin.toFixed(2)} m/s, the truck's nose at z ${frontZ.toFixed(2)} (pit centre −12)`, vMin < 1 && frontZ > -12)
  engine.dispose()
}

// ── §4 the pool cap ───────────────────────────────────────────────────────────────────────────────────
console.log('\n§4 the pool cap')
{
  const { engine, debris } = await world()
  const keys = Object.keys(MASS), orn = []
  for (let i = 0; i < 30; i++) orn.push(stand(debris, engine, keys[i % keys.length], (i % 6) * 3, 100 + Math.floor(i / 6) * 3))
  for (let i = 0; i < DEBRIS_CAP + 8; i++) debris.spawn('barrel', { x: -50, y: 1 + i, z: 0 }, { x: 0, y: 0, z: 0 })
  const live = debris._live
  check(`30 pinned ornaments + ${DEBRIS_CAP + 8} thrown barrels: all 30 ornaments live, the thrown capped at ${DEBRIS_CAP} (${live.filter(r => !r.pinned).length})`,
    orn.every(b => live.some(r => r.body === b)) && live.filter(r => !r.pinned).length === DEBRIS_CAP)
  engine.dispose()
}

// ── §5 cost (report only) ─────────────────────────────────────────────────────────────────────────────
console.log('\n§5 cost — the truck\'s physics step with N ornaments AWAKE (tumbling after a 1 m drop), median of 60 steps, report only')
for (const n of [0, 10, 30]) {
  const { engine, debris } = await world()
  const t = truck(engine, 0)
  const keys = Object.keys(MASS), bodies = []
  for (let i = 0; i < n; i++) {
    const b = stand(debris, engine, keys[i % keys.length], -6 + (i % 6) * 2.4, -10 - Math.floor(i / 6) * 2.4, i)
    const p = new THREE.Vector3(), q = new THREE.Quaternion(); engine.getTransform(b, p, q)
    engine.setTransform(b, { x: p.x, y: p.y + 1, z: p.z }, q); engine.wake(b); bodies.push(b)
  }
  const ms = []
  for (let s = 0; s < 60; s++) {
    const t0 = performance.now()
    debris.beforeStep(t.chassis, null)
    stepPhysics(t.vs, t.P, DT, flat, { engine, chassis: t.chassis })
    ms.push(performance.now() - t0)
  }
  ms.sort((a, b) => a - b)
  console.log(`    ${String(n).padStart(2)} awake (${bodies.filter(b => engine.isAwake(b)).length} still awake at the end): ${(ms[30] * 1000).toFixed(0)} µs/step median, ${(ms[57] * 1000).toFixed(0)} µs p95`)
  engine.dispose()
}

// ── §6 FEAT-268: the farm's drums and crates ─────────────────────────────────────────────────────────
console.log('\n§6 the farm\'s drums and crates (FEAT-268)')
{
  const sat = (key, x = 0, z = 0, variant = 0) => ({ key, x, y: 0, z, yaw: 0, variant })
  const clutter = modelsTagged('yardClutter')
  for (const key of FARM) check(`${key}: yard clutter, knockable over ${PROP_MODELS[key].knockable?.emptyKg}–${PROP_MODELS[key].knockable?.fullKg} kg, no fixed collider`,
    clutter.includes(key) && PROP_MODELS[key].knockable?.fullKg > PROP_MODELS[key].knockable.emptyKg && satSolid(sat(key)) == null)
  check('the pallet stays solid (not named by DEC-405)', clutter.includes('pallet') && satSolid(sat('pallet')) != null)
  check('every crate tops out at the owner\'s 200 kg', FARM.filter(k => /Crate/.test(k)).every(k => PROP_MODELS[k].knockable.fullKg <= 200))
  // Determinism and range over 2000 placements per kind (the fields dressYard derives from the seed).
  const { engine, debris } = await world()
  let rnd = 268, same = true, inRange = true
  const r01 = () => ((rnd = (rnd * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (const key of FARM) {
    const k = PROP_MODELS[key].knockable, half = debris.halfExtents(`ornament:${key}`), m = []
    for (let i = 0; i < 2000; i++) {
      const s = sat(key, (r01() - 0.5) * 4000, (r01() - 0.5) * 4000, Math.floor(r01() * 0x7fffffff))
      const a = knockMass(s, half), b = knockMass({ ...s }, half)
      same &&= a.massKg === b.massKg && a.center.y === b.center.y
      inRange &&= a.massKg >= k.emptyKg && a.massKg <= k.fullKg + 1e-9
      m.push(a.massKg)
    }
    m.sort((x, y) => x - y)
    const at = (p) => m[Math.floor(p * (m.length - 1))].toFixed(0)
    console.log(`    ${key.padEnd(14)} kg: min ${at(0)}  p25 ${at(0.25)}  median ${at(0.5)}  p75 ${at(0.75)}  p95 ${at(0.95)}  max ${at(1)}  (${(100 * m.filter(x => x > (k.emptyKg + k.fullKg) / 2).length / m.length).toFixed(0)} % past half full)`)
    const med = (m[999] - k.emptyKg) / (k.fullKg - k.emptyKg)
    check(`${key}: the median placement is ${(100 * med).toFixed(0)} % full (u³ draw: 12.5 %)`, Math.abs(med - 0.125) < 0.03)
  }
  check('a placement\'s load is the same on every call (no state, nothing saved)', same)
  check('every load lies in its row\'s range', inRange)
  // The engine body: a full drum stood as main.js stands it weighs knockMass's mass, with its centre of mass low.
  for (const [key, fill] of [['drumClosed', 0], ['drumClosed', 1], ['largeCrate', 0.125], ['largeCrate', 1]]) {
    const b = stand(debris, engine, key, 20 * fill, 60, 0, undefined, fill)
    const md = knockMass(sat(key, 20 * fill, 60), debris.halfExtents(`ornament:${key}`), fill)
    const com = engine.massProperties(b).com, p = new THREE.Vector3(), q = new THREE.Quaternion(); engine.getTransform(b, p, q)
    check(`${key} ${(100 * fill).toFixed(0)} % full: the engine body weighs ${engine.getMass(b).toFixed(1)} kg (knockMass ${md.massKg.toFixed(1)}), centre of mass ${(com.y - p.y).toFixed(3)} m from the box centre (${md.center.y.toFixed(3)})`,
      Math.abs(engine.getMass(b) / md.massKg - 1) < 1e-3 && Math.abs(com.y - p.y - md.center.y) < 1e-3)
  }
  engine.dispose()
  // Demolition's barrels and crates are their own kinds (src/demolition.js), untouched by the knockable rows.
  check('demolition targets unchanged: barrel = DEBRIS_TYPES.barrel (density 86), drumOpen 18 kg, smallCrate 18 kg',
    TARGET_TYPES.barrel.model === 'drumClosed' && TARGET_TYPES.barrel.massKg === undefined && DEBRIS_TYPES.barrel.density === 86
    && TARGET_TYPES.drumOpen.massKg === 18 && TARGET_TYPES.smallCrate.massKg === 18 && TARGET_TYPES.smallCrate.restitution === 0.1)

  console.log('    the hit (speed held): what           km/h  kg      truck Δv m/s  worst step / bound  launch ×v  armor lost  worst part lost')
  for (const key of ['drumClosed', 'barrelPlastic', 'smallCrate', 'largeCrate']) for (const fill of [0, 0.125, 1]) for (const kmh of [20, 40, 60]) {
    const speed = kmh / 3.6, base = await strike(null, speed), r = await strike(key, speed, undefined, { fill })
    if (r.hit < 0) { check(`${key} at ${kmh} km/h: the truck reached it`, false); continue }
    let worst = 0, lost = 0, launch = 0
    for (let s = Math.max(1, r.hit); s < Math.min(r.v.length, r.hit + 60); s++) {
      worst = Math.max(worst, (r.v[s - 1] - r.v[s]) - (base.v[s - 1] - base.v[s]))
      lost = Math.max(lost, base.v[s] - r.v[s])
    }
    for (let s = r.hit; s < Math.min(r.bv.length, r.hit + 20); s++) launch = Math.max(launch, Math.hypot(r.bv[s].x, r.bv[s].z))
    const bound = 2 * r.m * speed / r.M
    const armorLost = ['armorFront', 'armorLeft', 'armorRight', 'armorRear'].reduce((a, id) => a + (base.cond[id] - r.cond[id]), 0)
    const partLost = TRACK_IDS.reduce((a, id) => Math.max(a, base.cond[id] - r.cond[id]), 0)
    const worstPart = TRACK_IDS.reduce((a, id) => (base.cond[id] - r.cond[id] > base.cond[a] - r.cond[a] ? id : a), TRACK_IDS[0])
    console.log(`    ${(key + ' ' + ['empty', 'median', 'full'][[0, 0.125, 1].indexOf(fill)]).padEnd(29)} ${String(kmh).padStart(4)} ${r.m.toFixed(0).padStart(4)}  ${lost.toFixed(2).padStart(12)}  ${worst.toFixed(3)} / ${bound.toFixed(3)}  ${(launch / speed).toFixed(2).padStart(9)}  ${(100 * armorLost).toFixed(2).padStart(9)}%  ${(100 * partLost).toFixed(2)}% ${partLost > 5e-4 ? worstPart : ''}  pushed ${r.pushedZ.toFixed(1)} m`)
    // BUG-108's bound is a free strike's: a body the truck runs OVER (launched at < 0.5×: the light small crate tips
    // under the chamfer and a front wheel climbs it) loses the truck speed to the climb instead, so that row is reported.
    if (launch >= 0.5 * speed) check(`${key} ${r.m.toFixed(0)} kg at ${kmh} km/h: worst one-step speed loss ${worst.toFixed(3)} ≤ 1.25 × the momentum bound ${bound.toFixed(3)}`, worst <= 1.25 * bound + 1e-3)
  }
}

// ── §7 FEAT-268: the light props' launch ──────────────────────────────────────────────────────────────
console.log('\n§7 the light props\' launch, 20–80 km/h across the bumper and the wheel line (FEAT-268)')
for (const key of ['flamingoUp', 'flamingoDown', 'beachBall']) {
  let worst = 0, at = ''
  for (const kmh of [20, 40, 60, 80]) for (const ox of [0, 0.4, 0.6, 0.75, 0.9]) for (const yaw of [0, Math.PI / 2]) {
    const speed = kmh / 3.6, r = await strike(key, speed, undefined, { ox, yaw })
    for (let s = Math.max(0, r.hit); r.hit >= 0 && s < r.bv.length; s++) {
      const k = r.bv[s].length() / speed
      if (k > worst) { worst = k; at = `${kmh} km/h, ${ox} m off centre, ${yaw ? 'broadside' : 'end on'}` }
    }
  }
  check(`${key}: the fastest launch over 40 strikes is ${worst.toFixed(2)}× the truck's speed (${at}) — ≤ 3×`, worst <= 3)
}

console.log(fails ? `\n${fails} FAILED` : '\nall lawn-knock checks passed')
process.exit(fails ? 1 : 0)
