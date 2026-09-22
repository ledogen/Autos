// GATE (FEAT-36 gap 3): a stack of barrels settles, holds, and is REPRODUCIBLE.
//
// The throw slice could never test this: everything debris did was player-thrown one body at a
// time, so no pile ever existed and "sequential-impulse jitters on stacks" stayed an assumption.
// Two layers of three upright drums is the smallest honest pile — the upper layer's weight goes
// through the lower layer into the ground, so a solver that cannot hold a stack sinks or scatters
// it instead of settling it.
//
// Upright, not a side-lying pyramid: see STACK_QUAT in src/debris.js. The hex-packed pyramid was
// tried first and collapsed here every run, because cylinders on their sides roll out from under
// the load. That is real, so the layout changed rather than the assertion.
//
// Three things must be true:
//   (1) LAYOUT IS PURE — stackLayout is a deterministic function of its arguments, and the
//       geometry it emits really is close-packed (in-layer drums touch, layers sit squarely).
//   (2) THE STACK SETTLES AND HOLDS — the stack comes to rest instead of jittering or collapsing:
//       drums stay over their spawn footprint, the top layer stays on the bottom one, all sleep.
//   (3) IT IS DETERMINISTIC — the same stack in two fresh worlds settles to the SAME transforms.
//       This is the property the removed FEAT-36 world-fixture scope would have been built on, so
//       it is worth pinning before anything depends on it.
//
// Cylinders, not the GLB hull: the gate is pure-node and never fetches an asset, and it takes
// STACK_RADIUS / STACK_QUAT / stackLayout from src/debris.js so the geometry cannot drift from
// what the game spawns.
//
// Run: node test/debris-stack.mjs

import { createPhysicsEngine, GROUP_DEBRIS } from '../src/physics-engine.js'
import { stackLayout, STACK_RADIUS, STACK_HEIGHT, STACK_QUAT } from '../src/debris.js'

const DT = 1 / 60
const COUNT = 6
const DENSITY = 86            // ρ that lands 18 kg on the hull (see DEBRIS_TYPES)
let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }

// ── (1) layout purity + stacking geometry ────────────────────────────────────────────────────
console.log('layout — pure, and genuinely stackable:')
{
  const a = stackLayout(COUNT)
  const b = stackLayout(COUNT)
  ok(a.length === COUNT, `emits all ${COUNT} barrels (got ${a.length})`)
  ok(JSON.stringify(a) === JSON.stringify(b), 'same arguments ⇒ byte-identical layout (no Math.random, no time)')

  const ring = 2 * STACK_RADIUS / Math.sqrt(3)
  const lower = a.slice(0, 3), upper = a.slice(3)
  ok(lower.length === 3 && upper.length === 3,
    `two layers of three (got ${lower.length}+${upper.length})`)
  // Three mutually touching drums: every in-layer pair is exactly one diameter apart.
  let maxPairErr = 0
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      maxPairErr = Math.max(maxPairErr,
        Math.abs(Math.hypot(lower[i].x - lower[j].x, lower[i].z - lower[j].z) - 2 * STACK_RADIUS))
    }
  }
  ok(maxPairErr < 1e-12, `in-layer drums touch, none overlap (max pair error ${maxPairErr.toExponential(1)} m)`)
  const ringErr = Math.max(...lower.map(p => Math.abs(Math.hypot(p.x, p.z) - ring)))
  ok(ringErr < 1e-12, `the triangle sits on the 2R/√3 circumradius (error ${ringErr.toExponential(1)} m)`)
  const pitchErr = Math.max(...upper.map((p, i) => Math.abs((p.y - lower[i].y) - (STACK_HEIGHT + 0.01))))
  ok(pitchErr < 1e-12, `layers are one barrel height + gap apart (error ${pitchErr.toExponential(1)} m)`)
  const colErr = Math.max(...upper.map((p, i) => Math.hypot(p.x - lower[i].x, p.z - lower[i].z)))
  ok(colErr < 1e-12, `each upper drum is squarely ON the one below (max offset ${colErr.toExponential(1)} m)`)
  ok(a.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)), 'all finite')
  ok(a.every(p => p.y >= STACK_HEIGHT / 2 - 1e-12), 'nothing starts below ground (y ≥ half height)')
}

/**
 * Settle one stack in its own fresh world. Returns the final transforms, in spawn order.
 * Flat ground, no vehicle — this scenario is about barrels against barrels.
 */
async function settleStack (steps = 600) {
  const engine = await createPhysicsEngine()
  const N = 65, cell = 4, extent = 128
  const ground = engine.createBody({ type: 'static', position: { x: -extent, y: 0, z: -extent } })
  engine.addHeightfield(ground, new Float32Array(N * N), N, N, cell, { friction: 0.8 })

  const layout = stackLayout(COUNT)
  const bodies = layout.map(off => {
    const b = engine.createBody({
      type: 'dynamic',
      position: { x: off.x, y: off.y, z: off.z },
      quaternion: STACK_QUAT,
      userData: { kind: 'debris' },
    })
    // yOffset = −height/2 CENTRES the cylinder on the body origin: addCylinder anchors a shape
    // by its BASE, and the real spawn path's hull is bbox-centred (_extractHull), so without this
    // the gate would settle a differently-placed stack than the game does.
    engine.addCylinder(b, STACK_HEIGHT, STACK_RADIUS,
      { density: DENSITY, friction: 0.5, restitution: 0.3, group: GROUP_DEBRIS }, -STACK_HEIGHT / 2, 12)
    return b
  })

  const p = { x: 0, y: 0, z: 0 }, q = { x: 0, y: 0, z: 0, w: 1 }
  const v = { x: 0, y: 0, z: 0 }, w = { x: 0, y: 0, z: 0 }
  let anyNaN = false, peakSpeed = 0
  for (let s = 1; s <= steps; s++) {
    engine.step(DT)
    for (const b of bodies) {
      engine.getVelocity(b, v, w)
      const sp = Math.hypot(v.x, v.y, v.z)
      if (sp > peakSpeed) peakSpeed = sp
      if (!Number.isFinite(sp)) anyNaN = true
    }
  }

  const out = bodies.map(b => {
    engine.getTransform(b, p, q)
    engine.getVelocity(b, v, w)
    return {
      x: p.x, y: p.y, z: p.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w,
      speed: Math.hypot(v.x, v.y, v.z), spin: Math.hypot(w.x, w.y, w.z),
      awake: engine.isAwake(b),
    }
  })
  engine.dispose()
  return { layout, out, anyNaN, peakSpeed }
}

// ── (2) the stack settles and HOLDS ───────────────────────────────────────────────────────────
console.log('\nsettle — the stack holds instead of scattering:')
const A = await settleStack()
{
  const drift = A.out.map((r, i) => Math.hypot(r.x - A.layout[i].x, r.z - A.layout[i].z))
  const maxDrift = Math.max(...drift)
  const maxSpeed = Math.max(...A.out.map(r => r.speed))
  const maxSpin = Math.max(...A.out.map(r => r.spin))
  const upperY = Math.min(...A.out.slice(3).map(r => r.y))
  const lowerY = Math.max(...A.out.slice(0, 3).map(r => r.y))
  const awake = A.out.filter(r => r.awake).length
  console.log(`  peak |v| during settle ${A.peakSpeed.toFixed(3)} m/s; final max |v| ${maxSpeed.toFixed(4)}, ` +
    `max |ω| ${maxSpin.toFixed(4)}; max XZ drift ${maxDrift.toFixed(3)} m; upper layer y ${upperY.toFixed(3)} (lower ${lowerY.toFixed(3)}); awake ${awake}/${COUNT}`)

  ok(!A.anyNaN, 'no NaN in 10 s of stacked contact')
  ok(maxSpeed < 0.05, `every barrel is at rest (max |v| ${maxSpeed.toFixed(4)} < 0.05 m/s)`)
  ok(maxSpin < 0.10, `no residual jitter-spin (max |ω| ${maxSpin.toFixed(4)} < 0.10 rad/s)`)
  // A settling stack takes up its initial 1 cm gaps and nothing more. A full radius means a drum
  // slid out from under the one above — that is a collapse, not a settle.
  ok(maxDrift < STACK_RADIUS, `the stack held its footprint (max XZ drift ${maxDrift.toFixed(3)} m < ${STACK_RADIUS} — a collapse slides a drum a full radius)`)
  ok(upperY > lowerY + STACK_HEIGHT * 0.9,
    `the top layer is still ON the bottom one, not beside it (upper ${upperY.toFixed(3)} > lower ${lowerY.toFixed(3)} + ${(STACK_HEIGHT * 0.9).toFixed(3)})`)
  ok(awake === 0, `all ${COUNT} barrels went to sleep (awake ${awake}) — a jittering pile never sleeps`)
}

// ── (3) determinism — same stack, fresh world, same resting pile ──────────────────────────────
console.log('\ndeterminism — a second fresh world settles to the same pile:')
const B = await settleStack()
{
  let maxPosErr = 0, maxQuatErr = 0
  for (let i = 0; i < COUNT; i++) {
    const a = A.out[i], b = B.out[i]
    maxPosErr = Math.max(maxPosErr, Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z))
    maxQuatErr = Math.max(maxQuatErr,
      Math.abs(a.qx - b.qx), Math.abs(a.qy - b.qy), Math.abs(a.qz - b.qz), Math.abs(a.qw - b.qw))
  }
  console.log(`  max |Δposition| ${maxPosErr.toExponential(2)} m; max |Δquaternion| ${maxQuatErr.toExponential(2)}`)
  // Box3D is single-threaded and deterministic and the setup has no randomness, so the two runs
  // should agree to the bit. The tolerance is a floor against a future backend that reorders
  // floating-point accumulation, not licence for the pile to land somewhere else.
  ok(maxPosErr < 1e-9, `resting positions reproduce (max Δ ${maxPosErr.toExponential(2)} m < 1e-9)`)
  ok(maxQuatErr < 1e-9, `resting attitudes reproduce (max Δ ${maxQuatErr.toExponential(2)} < 1e-9)`)
}

console.log('\n' + '═'.repeat(56))
if (fail) { console.log('DEBRIS-STACK: FAIL'); process.exit(1) }
console.log('DEBRIS-STACK: PASS — barrels stack, settle, sleep, and reproduce ✓')
