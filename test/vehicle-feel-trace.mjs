// FEAT-48 — vehicle feel trace: the before/after acceptance surface for the engine migration.
//
// Runs a canned, fully deterministic maneuver suite through the REAL stepPhysics on a clean
// flat plane (contact model verbatim from drivetrain-climb.mjs / main.js) and records
// per-step state + summary metrics. Run once on the legacy hand-rolled integrator (baseline
// committed at test/baselines/vehicle-feel-legacy.json), once after the Box3D cutover, then:
//
//   node test/vehicle-feel-trace.mjs --out=/tmp/after.json
//   node test/vehicle-feel-trace.mjs --compare test/baselines/vehicle-feel-legacy.json /tmp/after.json
//
// Scenarios: drop-settle (suspension transient), launch (drivetrain + grip), brake-stop,
// step-steer at speed (yaw response / lateral grip), slam (body contact — the part the
// engine replaces outright). Divergence here is the REVIEW SURFACE, not noise (FEAT-48).
//
// Post-cutover this needs the engine: it detects `createVehicleChassis` on physics.js and
// builds a flat engine world + chassis when present; before the cutover it runs legacy.

import { writeFileSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import * as PHYS from '../src/physics.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const DT = 1 / 60
const { stepPhysics } = PHYS

function freshParams () {
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]
  return P
}

function eqOf (p) {
  const g = 9.81, strutComp = [0, 0, 0, 0], bodyYCorner = [0, 0, 0, 0]
  for (let i = 0; i < 4; i++) {
    const f = i < 2; const cm = p.mass * (f ? p.weightFront : p.weightRear) / 2 + p.wheelMass
    const kS = f ? p.suspensionStiffnessFront : p.suspensionStiffnessRear
    const LS = f ? p.suspensionRestLengthFront : p.suspensionRestLengthRear
    const spr = p.mass * (f ? p.weightFront : p.weightRear) / 2; strutComp[i] = spr * g / kS
    const tc = cm * g / p.tireStiffness; const hubY = p.wheelRadius - tc
    const bo = f ? (p.suspensionBodyOffsetFront || 0) : (p.suspensionBodyOffsetRear || 0)
    bodyYCorner[i] = hubY + (LS - strutComp[i]) + (p.cgHeight - p.wheelRadius) - bo
  }
  return { bodyY: (bodyYCorner[0] + bodyYCorner[1]) / 2, strutComp }
}

const queryContacts = (cx, cy, cz, r) => {
  const gd = 0 + r - cy
  return gd > 0
    ? [{ normal: new THREE.Vector3(0, 1, 0), depth: gd, contactPoint: new THREE.Vector3(cx, 0, cz) }]
    : []
}

function freshState (P, { y = null, vfwd = 0 } = {}) {
  const eq = eqOf(P)
  const vs = {
    position: new THREE.Vector3(0, y ?? eq.bodyY, 0), velocity: new THREE.Vector3(0, 0, -vfwd),
    quaternion: new THREE.Quaternion(), angularVelocity: new THREE.Vector3(),
    steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
    wheelSteerAngles: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    wheelOmega: [0, 0, 0, 0].map(() => vfwd / P.wheelRadius), slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: false,
    drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
  }
  return vs
}

// Engine context (post-cutover only). A flat 257×257 @ 4 m heightfield covers ±512 m.
async function makeEngineCtx (vs, P) {
  if (typeof PHYS.createVehicleChassis !== 'function') return null
  const { createPhysicsEngine } = await import('../src/physics-engine.js')
  const engine = await createPhysicsEngine()
  const N = 257, CELL = 4
  const flat = new Float32Array(N * N)   // y = 0 everywhere
  const ground = engine.createBody({ type: 'static', position: { x: -(N - 1) * CELL / 2, y: 0, z: -(N - 1) * CELL / 2 } })
  engine.addHeightfield(ground, flat, N, N, CELL, { friction: 0.8 })
  const chassis = PHYS.createVehicleChassis(engine, vs, P)
  return { engine, chassis }
}

async function runScenario (name, steps, drive, opts = {}) {
  const P = freshParams()
  const vs = freshState(P, opts)
  const ctx = await makeEngineCtx(vs, P)
  const trace = []
  for (let s = 1; s <= steps; s++) {
    drive(vs, s * DT, s)
    stepPhysics(vs, P, DT, queryContacts, ctx)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(vs.quaternion)
    const e = new THREE.Euler().setFromQuaternion(vs.quaternion, 'YXZ')
    trace.push([
      +(s * DT).toFixed(4), +vs.position.y.toFixed(5), +vs.velocity.dot(fwd).toFixed(5),
      +vs.angularVelocity.y.toFixed(5), +e.x.toFixed(5), +e.z.toFixed(5),
      +(vs.wheelDebug[0].fz + vs.wheelDebug[1].fz + vs.wheelDebug[2].fz + vs.wheelDebug[3].fz).toFixed(1),
      vs.drivetrain.activeGear,
    ])
  }
  ctx?.engine.dispose()
  return { name, cols: ['t', 'y', 'vfwd', 'yawRate', 'pitch', 'roll', 'totalFz', 'gear'], trace }
}

function summarize (sc) {
  const col = (i) => sc.trace.map(r => r[i])
  const y = col(1), v = col(2), yr = col(3)
  const last = sc.trace.length - 1
  return {
    name: sc.name,
    finalY: y[last], finalV: v[last], maxV: Math.max(...v), minY: Math.min(...y), maxY: Math.max(...y),
    maxYawRate: Math.max(...yr.map(Math.abs)),
    maxAbsPitch: Math.max(...col(4).map(Math.abs)), maxAbsRoll: Math.max(...col(5).map(Math.abs)),
    nan: sc.trace.some(r => r.some(x => !Number.isFinite(x))),
  }
}

async function main () {
  const scenarios = []
  // 1. drop-settle: start 0.25 m above equilibrium, no input — suspension transient + rest.
  scenarios.push(await runScenario('drop-settle', 360, (vs) => { vs.throttle = 0; vs.brake = 0 },
    { y: eqOf(freshParams()).bodyY + 0.25 }))
  // 2. launch: full throttle from rest, 12 s — drivetrain, grip, gear progression.
  scenarios.push(await runScenario('launch', 720, (vs) => { vs.throttle = 1; vs.brake = 0 }))
  // 3. brake-stop: enter at 25 m/s, full brake — straight-line stop, no yaw.
  scenarios.push(await runScenario('brake-stop', 360, (vs) => { vs.throttle = 0; vs.brake = 1 }, { vfwd: 25 }))
  // 4. step-steer: enter at 18 m/s, steer step 0.06 rad at t=0.5 s — yaw response / lateral grip.
  scenarios.push(await runScenario('step-steer', 480, (vs, t) => {
    vs.throttle = 0.35; vs.brake = 0
    const st = t < 0.5 ? 0 : 0.06
    vs.steerAngle = st; vs.wheelSteerAngles = [st, st, 0, 0]
  }, { vfwd: 18 }))
  // 5. slam: drop from 1.2 m above equilibrium — deep suspension hit + body-contact path.
  scenarios.push(await runScenario('slam', 360, (vs) => { vs.throttle = 0; vs.brake = 0 },
    { y: eqOf(freshParams()).bodyY + 1.2 }))

  const out = {
    recorded: process.env.TRACE_TAG || 'untagged',
    engine: typeof PHYS.createVehicleChassis === 'function' ? 'box3d' : 'legacy',
    summaries: scenarios.map(summarize),
    scenarios,
  }
  const outPath = (process.argv.find(a => a.startsWith('--out=')) || '').split('=')[1] || '/dev/stdout'
  writeFileSync(outPath, JSON.stringify(out))
  console.error(`[vehicle-feel-trace] ${out.engine} → ${outPath}`)
  for (const s of out.summaries) console.error(' ', JSON.stringify(s))
}

// --compare a.json b.json : per-scenario, per-column RMS + max deltas
if (process.argv.includes('--compare')) {
  const [fa, fb] = process.argv.slice(process.argv.indexOf('--compare') + 1)
  const A = JSON.parse(readFileSync(fa, 'utf8')), B = JSON.parse(readFileSync(fb, 'utf8'))
  for (const sa of A.scenarios) {
    const sb = B.scenarios.find(s => s.name === sa.name)
    if (!sb) { console.log(`${sa.name}: MISSING in B`); continue }
    console.log(`── ${sa.name} (${A.engine} vs ${B.engine}) ──`)
    for (let c = 1; c < sa.cols.length; c++) {
      const n = Math.min(sa.trace.length, sb.trace.length)
      let sum2 = 0, max = 0, maxT = 0
      for (let i = 0; i < n; i++) {
        const d = Math.abs(sa.trace[i][c] - sb.trace[i][c])
        sum2 += d * d
        if (d > max) { max = d; maxT = sa.trace[i][0] }
      }
      console.log(`  ${sa.cols[c].padEnd(8)} rms ${Math.sqrt(sum2 / n).toFixed(4)}  max ${max.toFixed(4)} @ t=${maxT}`)
    }
  }
} else {
  await main()
}
