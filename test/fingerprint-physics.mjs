// test/fingerprint-physics.mjs — full-precision VEHICLE fingerprint, for proving a refactor leaves
// the physics output-identical (review-2, S-80). Rainy-day script, NOT a gate.
//
// 900 fixed 1/60 s steps of the real stepPhysics on bumpy synthetic ground (an analytic height
// function: the wheels ride it through queryContacts, the chassis through engine-ctx.mjs's
// heightfield of the same function) under a scripted drive: settle, launch, slalom, trail-brake,
// power-on turn, full brake. Run twice: round tires and out-of-round (params.wheelRunout 0.02 m).
//
// Every step the WHOLE vehicle state object is hashed into one running sha256 per run — position,
// quaternion, velocities, per-wheel load/slip/ω/phase/strut compression, drivetrain, everything
// stepPhysics keeps on it (JSON numbers round-trip doubles exactly). A checkpoint digest every 100
// steps localises the first divergence.
//
//   node test/fingerprint-physics.mjs --out=/path/a.json
//   node test/fingerprint-physics.mjs --out=/path/b.json --compare=/path/a.json   (exit 1 on mismatch)

import { createHash } from 'node:crypto'
import { writeFileSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import { stepPhysics } from '../src/physics.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1]
const OUT = arg('out'), CMP = arg('compare')
const DT = 1 / 60, STEPS = 900

// Bumps: ~0.2 m amplitude at 4–9 m wavelengths, plus a gentle cross-slope. Analytic gradient.
const ground = (x, z) => 0.12 * Math.sin(0.9 * x) * Math.cos(0.7 * z) + 0.06 * Math.sin(2.3 * x + 1.1 * z) + 0.02 * x
const groundNormal = (x, z) => {
  const dx = 0.108 * Math.cos(0.9 * x) * Math.cos(0.7 * z) + 0.138 * Math.cos(2.3 * x + 1.1 * z) + 0.02
  const dz = -0.084 * Math.sin(0.9 * x) * Math.sin(0.7 * z) + 0.066 * Math.cos(2.3 * x + 1.1 * z)
  return new THREE.Vector3(-dx, 1, -dz).normalize()
}
// Contact model verbatim from physics-replay.mjs, on the analytic ground.
const queryContacts = (cx, cy, cz, r) => {
  const h = ground(cx, cz), gd = h + r - cy
  return gd > 0 ? [{ normal: groundNormal(cx, cz), depth: gd, contactPoint: new THREE.Vector3(cx, h, cz) }] : []
}

// Scripted drive (t in s). Steer goes straight onto the front wheels, as vehicle-feel-trace does.
function drive (vs, t) {
  let thr = 0, brk = 0, st = 0
  if (t < 1) { /* settle */ } else if (t < 5) thr = 0.8
  else if (t < 8) { thr = 0.4; st = 0.15 * Math.sin(2 * Math.PI * (t - 5) / 1.5) }
  else if (t < 10) { brk = 0.6; st = 0.1 }
  else if (t < 12.5) { thr = 1; st = -0.2 }
  else brk = 1
  vs.throttle = vs.smoothThrottle = thr
  vs.brake = vs.smoothBrake = brk
  vs.steerAngle = st; vs.wheelSteerAngles = [st, st, 0, 0]
}

function freshState (P) {
  const eq = computeStaticEquilibrium(P)
  return {
    position: new THREE.Vector3(0, eq.bodyY + ground(0, 0) + 0.05, 0), velocity: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(), angularVelocity: new THREE.Vector3(),
    steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
    wheelSteerAngles: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    wheelOmega: [0, 0, 0, 0], wheelPhase: [0, 0, 0, 0], slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: false,
    drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
  }
}

const replacer = (k, v) => (typeof v === 'bigint' ? v.toString() : ArrayBuffer.isView(v) ? Array.from(v) : v)

async function run (name, runout) {
  const P = { ...RANGER_PARAMS, wheelRunout: runout }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const vs = freshState(P)
  const ctx = await makeEngineCtx(vs, P, { groundFn: ground, extent: 256, cell: 1 })
  const h = createHash('sha256'), checkpoints = []
  for (let s = 1; s <= STEPS; s++) {
    drive(vs, s * DT)
    stepPhysics(vs, P, DT, queryContacts, ctx)
    h.update(JSON.stringify(vs, replacer))
    if (s % 100 === 0) checkpoints.push(h.copy().digest('hex').slice(0, 16))
  }
  ctx.dispose()
  const p = vs.position, v = vs.velocity
  console.log(`${name.padEnd(14)} ${checkpoints[checkpoints.length - 1]}   end pos (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`
    + ` |v| ${v.length().toFixed(2)} m/s`)
  return checkpoints
}

const t0 = performance.now()
const result = { round: await run('round', 0), 'out-of-round': await run('out-of-round', 0.02) }
console.log(`total ${((performance.now() - t0) / 1000).toFixed(1)} s`)
if (OUT) { writeFileSync(OUT, JSON.stringify(result, null, 1)); console.log(`wrote ${OUT}`) }

if (CMP) {
  const ref = JSON.parse(readFileSync(CMP, 'utf8'))
  let bad = 0
  for (const name of Object.keys(result)) {
    const i = result[name].findIndex((c, k) => ref[name]?.[k] !== c)
    if (i >= 0) bad++
    console.log(`[${i < 0 ? 'PASS' : 'FAIL'}] ${name}${i < 0 ? '' : `  first differs by step ${(i + 1) * 100}`}`)
  }
  console.log(bad ? `\n${bad} RUN(S) DIFFER from ${CMP}` : `\nALL IDENTICAL to ${CMP}`)
  process.exit(bad ? 1 : 0)
}
