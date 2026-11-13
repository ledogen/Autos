// test/kerb-graze.mjs — PERF-39 rainy-day measurement (NOT a gate): a 15 cm kerb met at a GRAZING angle at speed, under
// four tire-ground contact models, on the real stepPhysics + the real damage curves.
//
// The owner's report (2026-11-12): crossing the road-shoulder kerb nearly parallel at high speed pops tires far more often
// than before FEAT-70, and can spin or flip the truck. The question: does the contact model put more force through the
// bump stop (the puncture signal, damage.js _landBumpStop) or the rim (the rim-strike signal) than a real tire would?
//
// Models (each one returns the single {normal, depth, contactPoint} stepPhysics consumes):
//   legacy    the pre-FEAT-70 sphere stencil (git c9d8fe20^ main.js queryContacts): 4 rings × 8 + centre, the envelope
//             max of h + √(r² − d²), depth vertical, the surface normal at the winning sample
//   cyl a+b   src/tire-contact.js (FEAT-70) with `a` coarse samples and `b` golden-section steps (shipped: 9 + 10)
//   radial    the reference — a RADIAL-SPRING tire (the textbook enveloping model): the tread is a fan of radial springs,
//             each compressed where its spoke meets the ground; the resultant is the contact. Its depth is the flat-ground
//             deflection that gives the same force, its normal the resultant's direction, its point the force-weighted
//             centroid. So an edge loads several springs at once and its push is spread, as a carcass spreads it.
//             Flagged: no inter-radial shear and no sidewall bulge, so it still overstates a sharp edge somewhat.
//
//   node test/kerb-graze.mjs [--quick]

import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { createPhysicsEngine, GROUP_TERRAIN } from '../src/physics-engine.js'
import { stepPhysics, createVehicleChassis } from '../src/physics.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { RUNNING } from '../src/ignition.js'
import { tireContact, TIRE_CONTACT } from '../src/tire-contact.js'
import { DamageModel, DAMAGE_PARAMS as D } from '../src/damage.js'

const DT = 1 / 60, MPH = 0.44704, QUICK = process.argv.includes('--quick')
const H = 0.15   // the road-edge kerb, roadClearanceMargin

// ── the kerb: a straight step of height H whose line runs at `ang` to the truck's path (−z) ──────────────────────────
// u = signed distance across the kerb line, positive on the high side. dir +1 climbs onto it, −1 drops off it.
const kerb = (ang, dir, chamfer) => {
  const mx = -Math.cos(ang) * dir, mz = -Math.sin(ang) * dir
  const h = (x, z) => { const u = x * mx + z * mz; return chamfer > 0 ? H * Math.min(1, Math.max(0, u / chamfer + 0.5)) : (u >= 0 ? H : 0) }
  const up = { x: 0, y: 1, z: 0 }
  const n = (x, z) => {
    if (!(chamfer > 0)) return up
    const u = x * mx + z * mz; if (Math.abs(u) >= chamfer / 2) return up
    const g = H / chamfer, l = Math.hypot(g, 1); return { x: -g * mx / l, y: 1 / l, z: -g * mz / l }
  }
  return { h, n }
}

// ── contact models ───────────────────────────────────────────────────────────────────────────────────────────────────
const RINGS = [0.35, 0.6, 0.8, 0.95], DIRS = 8
function legacy (S, cx, cy, cz, r) {
  let bestH = S.h(cx, cz), bestTop = bestH + r, bx = cx, bz = cz
  for (const k of RINGS) {
    const d = k * r, lift = Math.sqrt(r * r - d * d)
    for (let o = 0; o < DIRS; o++) {
      const sx = cx + d * Math.cos(o * Math.PI / 4), sz = cz + d * Math.sin(o * Math.PI / 4), h = S.h(sx, sz)
      if (h + lift > bestTop) { bestTop = h + lift; bestH = h; bx = sx; bz = sz }
    }
  }
  const gd = bestTop - cy
  if (!(gd > 0)) return null
  const n = S.n(bx, bz)
  return { nx: n.x, ny: n.y, nz: n.z, depth: gd, px: bx, py: bestH, pz: bz }
}
const _cyl = {}
function cylinder (S, cx, cy, cz, r, w, A) { return tireContact(S.h, S.n, cx, cy, cz, r, w, A, _cyl) }

// Radial-spring tire. LINES across the width × SPOKES over the lower half; each spoke is marched to the ground.
const LINES = 5, SPOKES = 61
function spokeRho (h, ox, oy, oz, ex, ey, ez, r) {   // first ρ ∈ [0, r] where hub + ρe is at or below the ground, else r
  const below = (rho) => oy + rho * ey <= h(ox + rho * ex, oz + rho * ez)
  if (below(0)) return 0
  let prev = 0
  for (let rho = 0.01; rho <= r + 1e-9; rho += 0.01) {
    if (below(rho)) { let a = prev, b = rho; for (let i = 0; i < 10; i++) { const m = (a + b) / 2; if (below(m)) b = m; else a = m } return b }
    prev = rho
  }
  return r
}
function radialForce (h, cx, cy, cz, r, w, A) {   // resultant (per unit stiffness) and force-weighted point
  const dl = Math.hypot(A.x, A.z) || 1
  let Dx = 0, Dy = -1, Dz = 0; const da = Dy * A.y; Dx -= da * A.x; Dy -= da * A.y; Dz -= da * A.z   // down, ⟂ axle
  const Dl = Math.hypot(Dx, Dy, Dz) || 1; Dx /= Dl; Dy /= Dl; Dz /= Dl
  const Fx = A.y * Dz - A.z * Dy, Fy = A.z * Dx - A.x * Dz, Fz = A.x * Dy - A.y * Dx                    // rolling direction
  let fx = 0, fy = 0, fz = 0, sw = 0, px = 0, py = 0, pz = 0
  for (let l = 0; l < LINES; l++) {
    const o = -w / 2 + w * l / (LINES - 1), ox = cx + o * A.x, oy = cy + o * A.y, oz = cz + o * A.z
    for (let s = 0; s < SPOKES; s++) {
      const phi = -Math.PI / 2 + Math.PI * s / (SPOKES - 1), c = Math.cos(phi), sn = Math.sin(phi)
      const ex = c * Dx + sn * Fx, ey = c * Dy + sn * Fy, ez = c * Dz + sn * Fz
      const rho = spokeRho(h, ox, oy, oz, ex, ey, ez, r), d = r - rho
      if (d <= 0) continue
      fx -= d * ex; fy -= d * ey; fz -= d * ez; sw += d
      px += d * (ox + rho * ex); py += d * (oy + rho * ey); pz += d * (oz + rho * ez)
    }
  }
  void dl
  return { fx, fy, fz, sw, px, py, pz }
}
// Flat-ground calibration: |F|(d) for the same discretisation, inverted by table.
const R0 = RANGER_PARAMS.wheelRadius, W0 = RANGER_PARAMS.wheelWidth
const FLAT = []
for (let i = 0; i <= 400; i++) { const d = i * 0.0005; const f = radialForce(() => 0, 0, R0 - d, 0, R0, W0, { x: 1, y: 0, z: 0 }); FLAT.push([d, Math.hypot(f.fx, f.fy, f.fz)]) }
const depthFor = (F) => { for (let i = 1; i < FLAT.length; i++) if (FLAT[i][1] >= F) { const [d0, f0] = FLAT[i - 1], [d1, f1] = FLAT[i]; return d0 + (d1 - d0) * (F - f0) / (f1 - f0) } return FLAT.at(-1)[0] * F / FLAT.at(-1)[1] }
function radial (S, cx, cy, cz, r, w, A) {
  if (S.h(cx, cz) >= cy) return null   // buried hub: out of scope here
  const f = radialForce(S.h, cx, cy, cz, r, w, A), F = Math.hypot(f.fx, f.fy, f.fz)
  if (!(F > 0)) return null
  return { nx: f.fx / F, ny: f.fy / F, nz: f.fz / F, depth: depthFor(F), px: f.px / f.sw, py: f.py / f.sw, pz: f.pz / f.sw }
}

const MODELS = {
  legacy: { fn: legacy },
  'cyl 9+10': { fn: cylinder, coarse: 9, refine: 10 },
  'cyl 9+5': { fn: cylinder, coarse: 9, refine: 5 },
  'cyl 7+4': { fn: cylinder, coarse: 7, refine: 4 },
  'cyl vertN': { fn: (S, cx, cy, cz, r, w, A) => { const c = cylinder(S, cx, cy, cz, r, w, A); if (c) { const n = S.n(c.px, c.pz); c.nx = n.x; c.ny = n.y; c.nz = n.z } return c }, coarse: 9, refine: 10 },
  radial: { fn: radial },
}

// ── one run: the truck at `mph`, path along −z, crossing the kerb line at z = 0 ─────────────────────────────────────
async function run (model, S, mph, steps) {
  const M = MODELS[model]
  if (M.coarse) Object.assign(TIRE_CONTACT, { coarse: M.coarse, refine: M.refine })
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const engine = await createPhysicsEngine()
  const ground = engine.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 } })   // the chassis' floor (y = 0)
  engine.addBox(ground, { x: 3000, y: 5, z: 3000 }, { friction: 0.9, group: GROUP_TERRAIN })
  const vs = makeVehicleState(P, RUNNING), eq = computeStaticEquilibrium(P)
  const z0 = mph * MPH * 1.2   // ~1.2 s to the line
  vs.position.set(0, eq.bodyY + S.h(0, z0), z0)
  vs.strutComp = [...eq.strutComp]
  const chassis = createVehicleChassis(engine, vs, P, { bed: DEFAULT_VEHICLE_MODEL.bed })
  let samples = 0, queries = 0
  const Sc = { h: (x, z) => { samples++; return S.h(x, z) }, n: S.n }
  const qc = (cx, cy, cz, r, footprint, axle) => {
    const c = footprint && axle ? (queries++, M.fn(Sc, cx, cy, cz, r, P.wheelWidth, axle)) : (() => { const h = S.h(cx, cz), d = h + r - cy; return d > 0 ? { nx: 0, ny: 1, nz: 0, depth: d, px: cx, py: h, pz: cz } : null })()
    return c ? [{ normal: new THREE.Vector3(c.nx, c.ny, c.nz), depth: c.depth, contactPoint: new THREE.Vector3(c.px, c.py, c.pz) }] : []
  }
  const v0 = mph * MPH
  vs.velocity.set(0, 0, -v0); vs.wheelOmega = [0, 1, 2, 3].map(() => v0 / P.wheelRadius)
  const bump = [0, 0, 0, 0], rim = [0, 0, 0, 0]
  const fwd = new THREE.Vector3(), up = new THREE.Vector3()
  let rollMax = 0, flipped = false, yaw0 = null, yawMax = 0
  for (let i = 0; i < steps; i++) {
    const v = Math.hypot(vs.velocity.x, vs.velocity.z)
    vs.throttle = Math.min(1, Math.max(0, (v0 - v) * 0.6 + 0.25))
    stepPhysics(vs, P, DT, qc, { engine, chassis })
    for (let k = 0; k < 4; k++) { bump[k] = Math.max(bump[k], vs.bumpForce[k] || 0); rim[k] = Math.max(rim[k], vs.rimForceRoad?.[k] || 0) }
    fwd.set(0, 0, -1).applyQuaternion(vs.quaternion); up.set(0, 1, 0).applyQuaternion(vs.quaternion)
    const yaw = Math.atan2(-fwd.x, -fwd.z) * 180 / Math.PI; if (yaw0 === null) yaw0 = yaw
    yawMax = Math.max(yawMax, Math.abs(yaw - yaw0))
    rollMax = Math.max(rollMax, Math.acos(Math.min(1, up.y)) * 180 / Math.PI)
    if (up.y < 0) flipped = true
  }
  engine.dispose()
  return { bump, rim, yawMax, rollMax, flipped, perQuery: samples / Math.max(1, queries) }
}

// ── the sweep ────────────────────────────────────────────────────────────────────────────────────────────────────────
const dm = new DamageModel()
const popAt = { '45%': dm.punctureThreshold(0.45), '25%': dm.punctureThreshold(0.25), '10%': dm.punctureThreshold(0.10) }
const staticW = DamageModel.staticWheelLoad(RANGER_PARAMS), rimYield = D.rimYieldRoadMult * staticW
console.log(`15 cm kerb. Pop thresholds on the bump-stop peak: 45 % tire ${(popAt['45%'] / 1e3).toFixed(0)} kN · 25 % ${(popAt['25%'] / 1e3).toFixed(0)} kN · 10 % ${(popAt['10%'] / 1e3).toFixed(0)} kN (fresh > 50 %: never). Rim yield ${(rimYield / 1e3).toFixed(0)} kN.`)
console.log('cells: worst corner bump-stop peak kN [pops at 45/25/10 % tire] · worst rim kN · max yaw° · max roll° · height samples a query\n')
const ANGLES = QUICK ? [3, 8] : [2, 4, 8, 15, 30, 90], SPEEDS = QUICK ? [45] : [30, 45, 60]
const EDGES = QUICK ? [[0, 'sharp']] : [[0, 'sharp'], [0.05, '5 cm chamfer']]
const totals = {}
for (const [ch, edgeName] of EDGES) for (const dir of [1, -1]) for (const mph of SPEEDS) for (const deg of ANGLES) {
  const S = kerb(deg * Math.PI / 180, dir, ch)
  const steps = Math.round((2.4 + 3.2 / Math.max(0.05, Math.sin(deg * Math.PI / 180)) / (mph * MPH)) / DT)   // until all 4 corners are past
  const row = []
  for (const m of Object.keys(MODELS)) {
    const r = await run(m, S, mph, Math.min(steps, 900))
    const b = Math.max(...r.bump), pops = ['45%', '25%', '10%'].map(k => r.bump.filter(f => f >= popAt[k]).length)
    const t = totals[m] ??= { pops: [0, 0, 0], runs: 0, rimOver: 0, flips: 0, spq: 0 }
    pops.forEach((p, i) => t.pops[i] += p); t.runs++; t.rimOver += r.rim.filter(f => f > rimYield).length; t.flips += r.flipped; t.spq += r.perQuery
    row.push(`${m.padEnd(9)} ${(b / 1e3).toFixed(0).padStart(4)} [${pops.join('/')}] rim ${(Math.max(...r.rim) / 1e3).toFixed(0).padStart(3)} yaw ${r.yawMax.toFixed(0).padStart(3)} roll ${r.rollMax.toFixed(0).padStart(3)}${r.flipped ? ' FLIP' : ''} · ${r.perQuery.toFixed(0)}`)
  }
  console.log(`${edgeName.padEnd(12)} ${dir > 0 ? 'climb' : 'drop '} ${String(mph).padStart(2)} mph ${String(deg).padStart(2)}°`)
  for (const s of row) console.log('    ' + s)
}
console.log('\nTOTAL — corners popped over all runs (45 % / 25 % / 10 % tire) · rim strikes over yield · flips · height samples a query')
for (const [m, t] of Object.entries(totals)) console.log(`  ${m.padEnd(9)} ${t.pops.join(' / ').padEnd(12)} rim ${t.rimOver}  flips ${t.flips}  samples ${(t.spq / t.runs).toFixed(0)}`)
