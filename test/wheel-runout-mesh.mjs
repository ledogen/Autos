/**
 * Gate: the out-of-round tire MESH agrees with the out-of-round CONTACT RADIUS.
 *
 * params.wheelRunout is modelled twice, on purpose:
 *   - suspension.js effectiveWheelRadius() — the radius the contact query uses, R + A·sin(phase + φc)
 *   - vehicle-model.js applyWheelRunout()  — tread vertices displaced by carcassRadialOffset(psi)
 *
 * If those two disagree in phase the tire visibly bulges somewhere other than where the truck is
 * hopping — and a 180° error reads as inverted (tire smallest exactly when the body is highest).
 * So this walks the REAL mesh transform chain numerically instead of trusting the derivation:
 *
 *   build frame (spin axis +X, vertex at psi = atan2(z, y))
 *     -> left-side assembly mirror, rotation.y = PI          : (y, z) -> (y, -z)
 *     -> wheel group spin about +X by -phase                 : psi -> psi - phase
 *     -> lowest point of the ring is the contact patch
 *
 * ...then compares the lowest point's ground clearance to effectiveWheelRadius() at the same phase.
 *
 * The two do not agree exactly, and should not: once the tire is out of round its lowest point is
 * no longer at carcass angle PI, so the mesh clears the ground by a shade MORE than the radius the
 * physics evaluates AT that angle. That gap is second order, ~(nA)²/2R, so the tolerance is (nA)²/R
 * and the sign of the gap is asserted too. Any phase or sign error would be ~2A — 20 to 50 mm, two
 * orders of magnitude above the tolerance.
 *
 * The last check pins the SHAPE: the carcass must have exactly RUNOUT_HARMONIC high spots per
 * revolution, at the stated peak-to-peak. Everything above would pass just as happily on the wrong
 * harmonic, since it only ever compares the mesh to the physics — and those two share n.
 */
import { carcassRadialOffset, effectiveWheelRadius, RUNOUT_HARMONIC } from '../src/suspension.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const R    = RANGER_PARAMS.wheelRadius
const N    = 20000            // ring samples; min-y search resolution
let fails  = 0

function contactClearance (corner, phase, runout) {
  // Tread ring in the build frame, displaced by the carcass offset, pushed through the chain.
  const left = (corner === 0 || corner === 2)
  let lowest = Infinity
  for (let k = 0; k < N; k++) {
    const psi = (k / N) * Math.PI * 2
    const r   = R + carcassRadialOffset(corner, psi, runout)
    let y = r * Math.cos(psi)
    let z = r * Math.sin(psi)
    if (left) z = -z                                   // assembly.rotation.y = PI
    const c = Math.cos(-phase), s = Math.sin(-phase)   // spinQ: about +X by -phase
    const yS = y * c - z * s
    if (yS < lowest) lowest = yS
  }
  return -lowest                                       // hub height above the contact patch
}

for (const runout of [0, 0.005, 0.020, 0.050]) {
  const params = { ...RANGER_PARAMS, wheelRunout: runout }
  for (let corner = 0; corner < 4; corner++) {
    for (let k = 0; k < 16; k++) {
      const phase = (k / 16) * Math.PI * 2
      const mesh    = contactClearance(corner, phase, runout)
      const physics = effectiveWheelRadius(corner, { wheelPhase: [phase, phase, phase, phase] }, params)
      const A   = 0.5 * runout * RUNOUT_HARMONIC
      const tol = (A * A) / R + 1e-6            // second-order contact-point offset + search noise
      const err = mesh - physics                // signed: the eccentric mesh must clear by MORE
      if (!(err >= -1e-9 && err <= tol)) {
        fails++
        console.log(`FAIL runout=${runout} corner=${corner} phase=${phase.toFixed(3)} ` +
                    `mesh=${mesh.toFixed(5)} physics=${physics.toFixed(5)} ` +
                    `err=${err.toExponential(2)} tol=${tol.toExponential(2)}`)
      }
    }
  }
}

// Shape check: the carcass must swing the full peak-to-peak, and cross zero exactly 2n times per
// revolution — n high spots and n low spots. n=1 is an eccentric (egg) tire, n=2 an oval one.
for (let corner = 0; corner < 4; corner++) {
  const M = 4096
  const swing = [...Array(M)].map((_, k) => carcassRadialOffset(corner, (k / M) * Math.PI * 2, 0.020))
  const pp = Math.max(...swing) - Math.min(...swing)
  if (Math.abs(pp - 0.020) > 1e-6) {
    fails++
    console.log(`FAIL corner=${corner} peak-to-peak carcass swing ${pp.toFixed(6)} m, expected 0.020 m`)
  }
  let crossings = 0
  for (let k = 0; k < M; k++) if (swing[k] < 0 !== swing[(k + 1) % M] < 0) crossings++
  if (crossings !== 2 * RUNOUT_HARMONIC) {
    fails++
    console.log(`FAIL corner=${corner} carcass has ${crossings / 2} high spots per revolution, ` +
                `expected RUNOUT_HARMONIC = ${RUNOUT_HARMONIC}`)
  }
}

console.log(fails === 0
  ? `PASS wheel-runout-mesh: harmonic ${RUNOUT_HARMONIC} (${RUNOUT_HARMONIC === 1 ? 'eccentric' : 'oval'}); ` +
    'tire mesh and contact radius agree in phase (4 runouts x 4 corners x 16 phases)'
  : `FAIL wheel-runout-mesh: ${fails} mismatches`)
process.exit(fails === 0 ? 0 : 1)
