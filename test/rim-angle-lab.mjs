// test/rim-angle-lab.mjs — RAINY-DAY LAB, not a gate. Does a stiffer tire protect the rim on
// angled hits? Drives the truck into a STATIC world rock (sphere, the prop-system contact shape,
// plus a matching engine static for the chassis) at a sweep of speeds, lateral offsets and approach
// yaws, at several tire rates, and reports the peak ROAD rim residual (vehicleState.rimForceRoad —
// the signal damage.js prices for every non-debris contact) and the wheel damage it banks.
//
//   node test/rim-angle-lab.mjs [--k=100000,200000] [--r=0.35]

import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { stepPhysics } from '../src/physics.js'
import { getWheelPosition } from '../src/suspension.js'
import { DamageModel } from '../src/damage.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'
import { GROUP_STATIC } from '../src/physics-engine.js'

const flag = (n, d) => { const a = process.argv.find(s => s.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d }
const KS = flag('k', '100000,150000,200000').split(',').map(Number)
const ROCK_R = Number(flag('r', 0.35))
const ROCK_Y = Number(flag('y', 0.10))        // centre height: mostly proud of the ground
const DT = 1 / 60

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

// 15°-style downhill into flat through a circular fillet of radius R. Profile coordinate s =
// distance along −Z (the truck's heading); the fillet starts DIP_SA metres down the slope.
const DIP_S0 = 2, DIP_SA = 30
function makeDip (deg, R) {
  const th = deg * Math.PI / 180, t = Math.tan(th)
  const T = R * Math.tan(th / 2)
  const sC = DIP_SA + T, yC = -t * sC                       // the corner the fillet rounds
  const P1 = { s: sC - T * Math.cos(th), y: yC + T * Math.sin(th) }
  const P2 = { s: sC + T, y: yC }
  const O = { s: P2.s, y: yC + R }
  const h = (s) => s <= P1.s ? -t * s : s >= P2.s ? yC : O.y - Math.sqrt(Math.max(0, R * R - (s - O.s) ** 2))
  // Sphere (centre s,y radius r) vs the profile: closest point on line / arc / line.
  const contact = (s, y, r) => {
    let best = null
    const consider = (qs, qy) => {
      const d = Math.hypot(s - qs, y - qy)
      if (!best || d < best.d) best = { d, qs, qy }
    }
    { const dx = Math.cos(th), dy = -Math.sin(th); const u = Math.min(s * dx + y * dy, (P1.s * dx + P1.y * dy)); consider(u * dx, u * dy) }
    { const a = Math.atan2(s - O.s, -(y - O.y)), aMax = th   // angle from straight-down, toward -s is negative
      const ac = Math.max(-aMax, Math.min(0, a)); consider(O.s + R * Math.sin(ac), O.y - R * Math.cos(ac)) }
    consider(Math.max(s, P2.s), yC)
    if (y < h(s)) return { depth: r + (h(s) - y), ns: 0, ny: 1, qs: s, qy: h(s) }   // centre below ground
    const depth = r - best.d
    if (depth <= 0 || best.d < 1e-9) return null
    return { depth, ns: (s - best.qs) / best.d, ny: (y - best.qy) / best.d, qs: best.qs, qy: best.qy }
  }
  return { h, contact, sMid: (P1.s + P2.s) / 2, P2s: P2.s }
}

async function run (k, mph, latOff, yawDeg, sc = {}) {
  const P = { ...RANGER_PARAMS, tireStiffness: k }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const eq = eqOf(P)
  const v = mph * 0.44704
  const yaw = yawDeg * Math.PI / 180
  const dip = sc.dip ? makeDip(sc.dip.deg, sc.dip.R) : null
  const pitch = dip ? -sc.dip.deg * Math.PI / 180 : 0
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch))
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q)
  const vs = {
    position: new THREE.Vector3(0, (dip ? dip.h(DIP_S0) + eq.bodyY / Math.cos(pitch) : eq.bodyY), dip ? -DIP_S0 : 0), velocity: fwd.clone().multiplyScalar(v),
    quaternion: q.clone(), angularVelocity: new THREE.Vector3(),
    steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
    wheelSteerAngles: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    wheelOmega: [0, 0, 0, 0].map(() => v / P.wheelRadius), slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: false,
    drivetrain: { engineRPM: 1500, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
    rimForce: [0, 0, 0, 0], rimForceRoad: [0, 0, 0, 0], bumpForce: [0, 0, 0, 0],
  }
  const ctx = await makeEngineCtx(vs, P, { groundFn: dip ? (x, z) => dip.h(-z) : () => 0, extent: 128, cell: dip ? 0.5 : 4 })
  // Put the rock 8 m ahead of the FL wheel along the heading, shifted `latOff` metres to the right
  // of the wheel centre-line (negative = inboard for FL ... sign is body-right).
  const hub0 = getWheelPosition(0, vs, P)
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q)
  const rc = dip
    ? new THREE.Vector3(hub0.x + latOff, dip.h(sc.rockS) + ROCK_Y, -sc.rockS)
    : new THREE.Vector3(hub0.x, ROCK_Y, hub0.z).addScaledVector(fwd, 8).addScaledVector(right, latOff)
  const hasRock = sc.rock !== false
  if (hasRock) {
    const rock = ctx.engine.createBody({ type: 'static', position: { x: rc.x, y: rc.y, z: rc.z } })
    ctx.engine.addSphere(rock, ROCK_R, { friction: 0.8, group: GROUP_STATIC })
  }
  const qc = (cx, cy, cz, r) => {
    const out = []
    if (dip) {
      const g = dip.contact(-cz, cy, r)
      if (g) out.push({ normal: new THREE.Vector3(0, g.ny, -g.ns), depth: g.depth, contactPoint: new THREE.Vector3(cx, g.qy, -g.qs) })
    } else {
      const gd = r - cy
      if (gd > 0) out.push({ normal: new THREE.Vector3(0, 1, 0), depth: gd, contactPoint: new THREE.Vector3(cx, 0, cz) })
    }
    if (!hasRock) return out
    const dx = cx - rc.x, dy = cy - rc.y, dz = cz - rc.z
    const d = Math.hypot(dx, dy, dz), depth = r + ROCK_R - d
    if (depth > 0 && d > 1e-6) {
      const n = new THREE.Vector3(dx / d, dy / d, dz / d)
      out.push({ normal: n, depth, contactPoint: new THREE.Vector3(cx - n.x * (r - depth), cy - n.y * (r - depth), cz - n.z * (r - depth)) })
    }
    return out
  }
  const dm = new DamageModel({ params: P })
  let peakRoad = 0, peakDepth = 0, peakAccel = 0, peakBump = 0
  let prevV = vs.velocity.clone()
  for (let s = 0; s < (dip ? 240 : 150); s++) {
    stepPhysics(vs, P, DT, qc, ctx)
    for (let i = 0; i < 4; i++) { peakRoad = Math.max(peakRoad, vs.rimForceRoad[i]); peakBump = Math.max(peakBump, Math.abs(vs.bumpForce[i])) }
    for (let i = 0; i < 4 && hasRock; i++) {
      const h = getWheelPosition(i, vs, P)
      const d = P.wheelRadius + ROCK_R - Math.hypot(h.x - rc.x, h.y - rc.y, h.z - rc.z)
      if (d > peakDepth) peakDepth = d
    }
    peakAccel = Math.max(peakAccel, vs.velocity.clone().sub(prevV).length() / DT / 9.81)
    prevV.copy(vs.velocity)
    dm.step(vs, P, DT)
  }
  ctx.dispose()
  const wheelLoss = ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR'].reduce((a, id) => a + (1 - dm.get(id)), 0)
  const springLoss = (1 - dm.get('springFront')) + (1 - dm.get('springRear'))
  return { peakRoad, peakDepth, peakAccel, wheelLoss, springLoss, peakBump }
}

const fmt = r => `${(r.peakRoad / 1000).toFixed(0).padStart(4)} ${(r.peakBump / 1000).toFixed(0).padStart(4)} ${(r.wheelLoss * 100).toFixed(1).padStart(5)}% ${(r.springLoss * 100).toFixed(1).padStart(5)}%   `
const hdr = 'per k: rim residual kN / bump-stop kN / wheel loss / spring loss'
const MODE = flag('mode', 'all')
if (MODE === 'all' || MODE === 'rock') {
  console.log(`\n── FLAT + ROCK (r=${ROCK_R} m, centre y=${ROCK_Y} m) — ${hdr}`)
  console.log('mph  lat  yaw | ' + KS.map(k => `k=${k / 1000}k`.padEnd(29)).join(''))
  for (const mph of [20, 35, 50, 70]) for (const lat of [0, 0.25]) for (const yaw of [0, 30]) {
    let line = `${String(mph).padStart(3)} ${lat.toFixed(2)}  ${String(yaw).padStart(3)} | `
    for (const k of KS) line += fmt(await run(k, mph, lat, yaw))
    console.log(line)
  }
}
if (MODE === 'all' || MODE === 'dip') {
  for (const withRock of [false, true]) {
    console.log(`\n── 15° DOWNHILL → FLAT, fillet radius R${withRock ? ', ROCK at the bottom of the fillet' : ''} — ${hdr}`)
    console.log('mph   R  ' + (withRock ? 'lat ' : '    ') + '| ' + KS.map(k => `k=${k / 1000}k`.padEnd(29)).join(''))
    for (const R of [4, 10]) for (const mph of [40, 55, 70]) for (const lat of (withRock ? [0, 0.25] : [0])) {
      const dipSpec = { deg: 15, R }
      const sBottom = makeDip(15, R).P2s
      let line = `${String(mph).padStart(3)} ${String(R).padStart(3)}  ${withRock ? lat.toFixed(2) : '    '}| `
      for (const k of KS) line += fmt(await run(k, mph, lat, 0, { dip: dipSpec, rock: withRock, rockS: sBottom }))
      const g = (mph * 0.44704) ** 2 / R / 9.81
      console.log(line + `  (v²/R ${g.toFixed(1)} g)`)
    }
  }
}
