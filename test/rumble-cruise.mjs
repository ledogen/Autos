// GATE (BUG-206): cruising on a smooth road with no slip and no hit commands EXACTLY zero vibration; rumble is an event.
// The owner, Windows pad: "pretty much always a Rumble all the time when I'm driving down the road". The old road-texture
// source (mean |strut velocity|) read the body riding the road and the deck's facet kinks: 58 % of a 57 km/h drive buzzed.
//
// The real driver (src/pad-rumble.js stepPadRumble + flushPadRumble, with a fake pad that records every playEffect) and the
// real contact one-shots (contact-audio.js: bump stops, landings) behind the real physics, on the real world (world rig:
// road trimesh, terrain, props), the autopilot (src/autopilot.js, the bench's mode: centreline, a dead end jumps) on asphalt at 60 and 80 km/h. Every effect the pad
// gets while no kick is ringing, no tyre slides and the truck is on asphalt must be silent (0 / 0 or a reset). Then the
// events: a handbrake slide on flat ground, and a flat tyre, each command a non-zero effect.
import * as THREE from 'three'
let simMs = 0
globalThis.performance.now = () => simMs   // the driver's clocks (send rate, kick decay, staleness) on sim time
const sent = []
const pad = { vibrationActuator: { effects: ['dual-rumble'], playEffect: (t, p) => { sent.push({ t: simMs, s: p.strongMagnitude, w: p.weakMagnitude }); return Promise.resolve() }, reset: () => { sent.push({ t: simMs, s: 0, w: 0 }); return Promise.resolve() } } }
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true })
const { stepPhysics, readRimStrikes, classifyImpactRegion } = await import('../src/physics.js')
const { computeStaticEquilibrium } = await import('../src/suspension.js')
const { RANGER_PARAMS } = await import('../data/ranger.js')
const { DamageModel } = await import('../src/damage.js')
const { buildWorld } = await import('./lib/world-rig.mjs')
const { makeRoute, createAutopilot } = await import('../src/autopilot.js')
const { ackermann } = await import('./lib/physics-replay.mjs')
const { drive } = await import('./lib/flat-drive.mjs')
const { stepContactAudio } = await import('../src/contact-audio.js')
const R = await import('../src/pad-rumble.js')

const SEED = 2093184417   // a random seed (not the test seed): trunks, curves and crests near the origin
const DT = 1 / 60
let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }

const P = { ...RANGER_PARAMS }; P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]; P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
const eq = computeStaticEquilibrium(P)
const fresh = (x, y, z, h) => ({ position: new THREE.Vector3(x, y, z), velocity: new THREE.Vector3(), quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h), angularVelocity: new THREE.Vector3(),
  steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0, handbrake: false, wheelSteerAngles: [0, 0, 0, 0], wheelOmega: [0, 0, 0, 0], wheelPhase: [0, 0, 0, 0], slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
  slipVel: [0, 0, 0, 0], wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })), strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0],
  drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 }, rimForce: [0, 0, 0, 0], rimHazard: [0, 0, 0, 0] })
const vs = fresh(0, 0, 0, 0)
const w = await buildWorld(SEED, P, vs, { radius: 1200 })
const dmg = new DamageModel({ params: P }); dmg.setAll(1); dmg.publish(P)
// main.js _looseSurfaceFactorAt, the road branch (the world rig has no lab)
const looseAt = (x, z) => {
  const n = w.road.carveHint(x, z); if (!n || !n.point) return 1
  const lat = Math.hypot(x - n.point.x, z - n.point.z), hw = P.roadHalfWidth ?? 5, pv = P.dustPavedFactor ?? 0.1
  return lat <= hw - 1.5 ? pv : lat >= hw ? 1 : pv + (1 - pv) * (lat - hw + 1.5) / 1.5
}

for (const kmh of [60, 80]) {
  let s = SEED >>> 0; const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const route = makeRoute([...w.road._network.values()], rng, { x: 0, z: 0 }, { deadEnd: 'jump' })
  const ap = createAutopilot({ car: P, route, vMax: kmh / 3.6, keepRight: false, recover: false, inBore: (x, z) => { const n = w.road.queryNearest(x, z, 15); return !!n && !!w.road.tunnelSpanAt(n.runKey ?? '', n.arcS ?? 0, -20) } })
  const seat = (m) => { const r = ap.resume(m); Object.assign(vs, fresh(r.x, (w.road.sampleRoadTopY(r.x, r.z) ?? 0) + 0.9, r.z, r.heading)); w.stream(r.x, r.z) }
  seat(0)
  sent.length = 0
  const t0ms = simMs   // the sim clock never runs backwards between runs: the driver's send timer (sentAt) would stall the whole next run and hold a stale jolt peak
  let t = 0, quietSteps = 0, steps = 0, loud = null, vSum = 0
  const quiet = []   // [t0, t1) windows in which nothing should rumble
  while (t < 40) {
    const c = ap.step(vs, DT)
    if (c.trouble) seat(30)
    vs.throttle = vs.smoothThrottle = c.throttle; vs.brake = vs.smoothBrake = c.brake; vs.steerAngle = c.steer; vs.wheelSteerAngles = ackermann(c.steer, P)
    if (Math.floor(t * 2) !== Math.floor((t + DT) * 2)) w.stream(vs.position.x, vs.position.z)
    stepPhysics(vs, P, DT, w.queryContacts, w.ctx)
    const hit = readRimStrikes(w.engine, w.chassis, vs.rimForce, DT, vs.rimHazard)
    dmg.step(vs, P, DT)
    const landed = dmg.feedContact(classifyImpactRegion(hit.point, hit.normal), hit.impulse, P.mass, DT, vs.velocity)
    if (landed) R.padHit('impact', Math.min(1, landed.v / 20))
    if (vs.abs?.pulse) R.padHit('abs')
    stepContactAudio(vs, P._tireFz, DT)
    const loose = looseAt(vs.position.x, vs.position.z)
    R.stepPadRumble(vs, P, dmg.flat, loose, DT)
    t += DT; simMs = t0ms + t * 1000
    const n0 = sent.length
    R.flushPadRumble(true)
    if (t < 6) continue   // the seat's drop and the run-up
    steps++; vSum += Math.hypot(vs.velocity.x, vs.velocity.z)
    const kick = Object.values(R.kickLevels(simMs)).some(k => k > 1e-3), slide = Math.max(...vs.slipVel) > 2
    if (!kick && !slide && loose <= (P.dustPavedFactor ?? 0.1) + 1e-9) {
      quietSteps++
      for (const e of sent.slice(n0)) if ((e.s || e.w) && !loud) loud = { t: +t.toFixed(2), ...e }
    }
  }
  ok(quietSteps > 0.5 * steps, `${kmh} km/h: ${(100 * quietSteps / steps).toFixed(0)} % of ${steps} steps a smooth cruise on asphalt (mean ${(vSum / steps * 3.6).toFixed(0)} km/h)`)
  ok(!loud, `${kmh} km/h: every effect sent in a smooth cruise is silent${loud ? ` — got ${JSON.stringify(loud)}` : ''}`)
}
w.dispose?.()

// The events, on flat ground (test/lib/flat-drive.mjs): a handbrake slide, then a flat tyre. Each must command an effect.
const fire = async (name, opts, flat) => {
  sent.length = 0
  let t = 0
  await drive({ v0: 18, tMax: 3, ...opts, onStep: (v, Pp) => { R.stepPadRumble(v, Pp, flat, Pp.dustPavedFactor ?? 0.1, DT); t += DT; simMs += DT * 1000; R.flushPadRumble(true) } })
  const peak = sent.reduce((m, e) => Math.max(m, e.s, e.w), 0)
  ok(peak > 0.05, `${name}: the pad is told to rumble (peak ${peak.toFixed(2)})`)
}
await fire('handbrake slide at 65 km/h', { input: (t) => ({ throttle: 0, steer: t > 0.3 ? 0.25 : 0, handbrake: t > 0.3 }) }, [false, false, false, false])
await fire('a flat tyre rolling at 65 km/h', { input: () => ({ throttle: 0.3 }) }, [true, false, false, false])

console.log(fail ? '\nFAIL' : '\nPASS')
process.exit(fail)
