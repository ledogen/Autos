// test/crash-lab.mjs — BUG-168 instrument: the real truck into rigid things, and what the damage model makes of it.
// RAINY-DAY, not a gate (crash-fatal.mjs is the gate). Pure node, no browser.
//
// The game's fixed step, verbatim in order (main.js): stepPhysics → readRimStrikes → damage.feedContact(classifyImpactRegion
// (hit.point, hit.normal), hit.impulse, mass, dt, velocity). The truck is launched at speed (wheels rolling) on flat ground
// and coasts into one obstacle built the way the game builds it (terrain-physics.js, restitution 0, friction 0.8):
//   wall     a 6 m × 3 m × 1 m static hull — a POI yard solid / building face
//   building a 10 × 4 × 8 m static hull (a POI marker's collision box)
//   tree     a static capsule, r 0.35 m (a ~0.3 m trunk × trunkRadiusScale 1.15), 8 m tall
//   face     a terrain heightfield cliff at 70°, the wheels' analytic ground and the chassis' heightfield alike
// head-on, and glancing (path 30° to the face; the tree: struck on the bumper corner). For each: the burst's equivalent speed, the fatal threshold, fatalImpact.
//
//   node test/crash-lab.mjs [--mph=50,70,90,110] [--armor=1,0.3]

import * as THREE from 'three'
import { stepPhysics, readRimStrikes, classifyImpactRegion } from '../src/physics.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { DamageModel, fatalMph, MPH, ARMOR_REGIONS } from '../src/damage.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const DT = 1 / 60
const MAT = { friction: 0.8, restitution: 0 }   // terrain-physics.js PropPhysics / PoiPhysics
const FACE_Z = -14                               // the obstacle's near face, the truck's nose starts ~12 m short of it

const box = (eng, cx, cy, cz, hx, hy, hz, yaw = 0) => {
  const b = eng.createBody({ type: 'static', position: { x: cx, y: cy, z: cz },
    quaternion: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) } })
  const pts = []
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push(sx * hx, sy * hy, sz * hz)
  eng.addHull(b, pts, MAT)
}
// The terrain cliff: flat to FACE_Z, then up at 70° (capped at 15 m).
const TAN70 = Math.tan(70 * Math.PI / 180)
const cliff = (x, z) => Math.min(15, Math.max(0, (FACE_Z - z) * TAN70))
const flat = () => 0

export const TARGETS = {
  wall:     { ground: flat, build: (e, yaw) => box(e, 0, 1.5, FACE_Z - 0.5, 3, 1.5, 0.5, yaw) },
  building: { ground: flat, build: (e, yaw) => box(e, 0, 2, FACE_Z - 4, 5, 2, 4, yaw) },
  // A trunk is round, so its glancing case is an OFFSET hit instead: the trunk 0.75 m off the centreline, at the bumper's corner.
  tree:     { ground: flat, build: (e, yaw) => { const b = e.createBody({ type: 'static' }), x = yaw ? 0.75 : 0
    e.addCapsule(b, { x, y: 0, z: FACE_Z - 0.35 }, { x, y: 8, z: FACE_Z - 0.35 }, 0.35, MAT) } },
  face:     { ground: cliff, build: () => {} },
}

/**
 * One crash. `angleDeg` is the path's angle off the obstacle's normal (0 = head-on). The obstacle turns, the truck's path
 * stays −Z, so the ground and launch are the same every run. Returns every impact the model landed and the fatal record.
 */
export async function crash ({ target, mph, angleDeg = 0, armor = 1, seconds = 2.5 }) {
  const T = TARGETS[target]
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const eq = computeStaticEquilibrium(P)
  const v0 = mph * MPH
  const vs = {
    position: new THREE.Vector3(0, eq.bodyY, 0), velocity: new THREE.Vector3(0, 0, -v0),
    quaternion: new THREE.Quaternion(), angularVelocity: new THREE.Vector3(),
    steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0, handbrake: false,
    wheelSteerAngles: [0, 0, 0, 0], wheelOmega: [0, 1, 2, 3].map(() => v0 / P.wheelRadius), wheelPhase: [0, 0, 0, 0],
    slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0],
    drivetrain: { engineRPM: 750, gear: 0, shiftTimer: 0, activeGear: 0, SR: 0, TR: 2 },
    rimForce: [0, 0, 0, 0], rimHazard: [0, 0, 0, 0],
  }
  const g = T.ground
  // A flat-or-cliff ground: the cliff's normal is its gradient, so the wheels climb the face as they would in the game.
  const queryContacts = (cx, cy, cz, r) => {
    const h = g(cx, cz), gd = h + r - cy
    if (gd <= 0) return []
    const dz = (g(cx, cz + 0.01) - g(cx, cz - 0.01)) / 0.02
    return [{ normal: new THREE.Vector3(0, 1, -dz).normalize(), depth: gd, contactPoint: new THREE.Vector3(cx, h, cz) }]
  }
  const ctx = await makeEngineCtx(vs, P, { groundFn: g, extent: 64, cell: 0.5 })
  T.build(ctx.engine, angleDeg * Math.PI / 180)
  const dm = new DamageModel({ params: P })
  for (const id of Object.values(ARMOR_REGIONS)) dm.condition[id] = armor
  const landed = []
  let peakJ = 0, vMin = v0
  for (let s = 0; s < seconds / DT; s++) {
    stepPhysics(vs, P, DT, queryContacts, ctx)
    const hit = readRimStrikes(ctx.engine, ctx.chassis, vs.rimForce, DT, vs.rimHazard)
    const region = classifyImpactRegion(hit.point, hit.normal)
    if (hit.impulse > peakJ) peakJ = hit.impulse
    const r = dm.feedContact(region, hit.impulse, P.mass, DT, vs.velocity)
    if (r) landed.push({ t: +(s * DT).toFixed(3), region: r.region, mph: +(r.v / MPH).toFixed(1), fatal: r.fatal })
    vMin = Math.min(vMin, vs.velocity.length())
  }
  ctx.dispose()
  return { target, mph, angleDeg, armor, landed, fatal: dm.fatalImpact, peakJmph: peakJ / P.mass / MPH,
    vEnd: vs.velocity.length() / MPH, threshold: fatalMph(armor) }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d }
  const speeds = arg('mph', '50,70,90,110').split(',').map(Number)
  const armors = arg('armor', '1,0.3').split(',').map(Number)
  const targets = arg('target', 'wall,building,tree,face').split(',')
  const angles = arg('angle', '0,60').split(',').map(Number)
  console.log('target    angle armor  mph | landed impacts (mph, region)               | max v_eq  thr  fatal | v end | engine J/m')
  for (const target of targets) for (const angleDeg of angles) for (const armor of armors) for (const mph of speeds) {
    if (target === 'face' && angleDeg) continue   // the cliff is the ground; its glancing case is not built
    const r = await crash({ target, mph, angleDeg, armor })
    const max = Math.max(0, ...r.landed.map(l => l.mph))
    const list = r.landed.map(l => `${l.mph}${l.region[0]}`).join(' ').slice(0, 42).padEnd(42)
    console.log(`${target.padEnd(9)} ${String(angleDeg).padStart(4)}° ${armor.toFixed(1).padStart(4)} ${String(mph).padStart(4)} | ${list} | ${max.toFixed(1).padStart(6)} ${r.threshold.toFixed(0).padStart(4)}  ${r.fatal ? 'DEAD ' : 'alive'} | ${r.vEnd.toFixed(1).padStart(5)} | ${r.peakJmph.toFixed(1)}`)
  }
}
