/**
 * src/physics.js — Vehicle physics step for AUTOS (FEAT-48: engine-backed).
 *
 * The rigid-body core is the physics ENGINE behind the adapter seam
 * (physics-engine.js): the chassis is an engine dynamic body; integration
 * (position, quaternion, full-tensor inertia with gyroscopic terms) and every
 * body↔terrain / body↔prop / body↔debris contact are solved by the engine.
 * The hand-rolled 6DOF integrator and the BUG-27 sequential-impulse body solver
 * were removed in the cutover — their failure-mode lore lives in the FEAT-48
 * landing commit message and the constants below.
 *
 * What stays OURS — the entire point of the project (see the FEAT-48 warning:
 * never adopt an engine vehicle/wheel abstraction):
 *   - suspension.js spring/damper struts, stepped against the ANALYTIC terrain
 *     surface via queryContacts (higher fidelity than any baked collider);
 *   - tire.js combined-slip Pacejka, fed per-wheel slip velocities;
 *   - the drivetrain chain and the ω Newton integrator.
 * Their net force+torque is applied to the engine body each step; the engine
 * integrates and hands the transform back into vehicleState (the authoritative
 * JS mirror every other system reads).
 *
 * Translation layer (FEAT-48 "the one substantive change"): wheel contact
 * queries are the analytic queryContacts PLUS an engine sphere-overlap for
 * DYNAMIC bodies (debris under the wheel). When the wheel's support surface is
 * a dynamic body, slip and compression velocities are computed RELATIVE to that
 * body's contact-point velocity, and the tire's normal+friction force is
 * applied back to it equal-and-opposite — drive onto a rock and the suspension
 * compresses, the truck lifts, the rock squirts out.
 *
 * Exports:
 *   stepPhysics(vehicleState, params, dt, queryContacts, engineCtx)
 *     — engineCtx = { engine: PhysicsEngine, chassis: bodyHandle } (required)
 *   createVehicleChassis(engine, vehicleState, params, {bed}) — build the chassis body
 *   readRimStrikes / classifyImpactRegion — the damage model's contact readout
 *   setBodyRestitution / syncChassisMass — debug-panel edits that must reach the engine body
 *   getDriveTorque(wheelIndex, vehicleState, params)
 *
 * Conventions: see docs/GLOSSARY.md
 * Forbidden: body rotation must always use THREE.Quaternion, never bodyMesh.rotation
 */

import * as THREE from 'three'
import { computeTireForces } from './tire.js'
import { computeNormalForce, effectiveWheelRadius, getWheelPosition, mountLocal, stepSuspensionSubsteps, SUSPENSION_SUBSTEPS, WHEEL_SOFT_BAND } from './suspension.js'
import { REV_THRESHOLD, autoReverse, stepDrivetrain } from './drivetrain.js'
import { stepFuel } from './fuel.js'
import { stepAbs } from './abs.js'
import { stepTraction } from './traction.js'
import { camberLean, toeOffset } from './alignment.js'
import { GROUP_CHASSIS, GROUP_DEBRIS } from './physics-engine.js'

// Speed threshold for input routing (rule-based, no dead-zone oscillation) is drivetrain.js's
// REV_THRESHOLD. FEAT-23 removed FWD_THRESHOLD (the W-brake / drive-cut deadband); the drivetrain
// now supplies forward torque continuously through the torque converter, so there is no roll-back
// drive cutoff.

// Engine solver substeps per physics step (Step 3e explains why 8). Rim-strike damage reads the
// engine's whole-step contact impulse (review-2 R-02), which measured the same at 4 and 8 substeps
// for a resting contact — so changing this no longer rescales the damage.js rim thresholds, but
// re-check them with a sustained core contact if it ever moves.
const ENGINE_SUBSTEPS = 8

/**
 * Read the per-wheel drive torque computed once per step by stepDrivetrain (FEAT-23).
 * The engine → torque-converter → automatic-gearbox → final-drive chain (drivetrain.js) runs once
 * before the per-wheel loop and writes params._driveTorque[4]; this is just the accessor so the
 * ω integrator (grounded + airborne branches) reads a consistent value for every wheel.
 *
 * @param {number} wheelIndex - 0-3 per GLOSSARY.md §Wheel Index (0=FL, 1=FR, 2=RL, 3=RR).
 * @param {object} vehicleState - unused (kept for signature stability with getBrakeTorque).
 * @param {object} params - RANGER_PARAMS; reads params._driveTorque (set by stepDrivetrain).
 * @returns {number} Torque [N·m]. Positive = drive forward, negative = reverse.
 */
export function getDriveTorque (wheelIndex, vehicleState, params) {
  const dt = params._driveTorque
  return dt ? (dt[wheelIndex] || 0) : 0
}

/**
 * Compute resistive brake torque for a single wheel (always >= 0, subtracted in integrator).
 * Handles W-braking when going backward fast, S-braking when going forward, and handbrake.
 * Module-private — not exported.
 *
 * @param {number} wheelIndex - 0-3 per GLOSSARY.md §Wheel Index.
 * @param {object} vehicleState - Full vehicleState; uses .throttle, .brake, .handbrake.
 * @param {object} params - RANGER_PARAMS; uses .maxBrakeTorqueFront/.maxBrakeTorqueRear, .maxHandbrakeTorque.
 * @param {number} longVel - THIS wheel's hub speed along its own forward axis [m/s] (relative to a
 *   dynamic support when grounded on one). Decides S = brake (above REV_THRESHOLD) vs reverse.
 * @returns {number} Brake torque [N·m]. Positive = resists current wheel spin direction.
 */
function getBrakeTorque (wheelIndex, vehicleState, params, longVel) {
  const isRear  = wheelIndex === 2 || wheelIndex === 3

  // FEAT-23: the old "W below FWD_THRESHOLD → brake" branch is gone. The torque-converter drivetrain
  // now delivers forward torque whenever the throttle is down (even while rolling backward), so it
  // arrests and reverses a hill roll-back itself — braking there would fight the drive torque and
  // re-create the drive/brake oscillation this feature fixes.

  // S above REV_THRESHOLD: brake all wheels to slow forward motion (front/rear-split service brake).
  // SM-3: worn pads deliver less torque. params._brakeScale{Front,Rear} is published by
  // src/damage.js; absent (headless gates, damage off) it reads as 1 and nothing changes.
  const brakeDmg = isRear ? (params._brakeScaleRear ?? 1) : (params._brakeScaleFront ?? 1)
  // FEAT-126: in a MANUAL, S is always just the brake — reverse is a gear (R), not the pedal.
  // ABS (src/abs.js) owns the line pressure at each wheel when present: the pedal, less whatever the
  // controller has vented. Without vehicleState.abs (headless gates) the pedal goes straight through.
  const maxBt = isRear ? (params.maxBrakeTorqueRear ?? 800) : (params.maxBrakeTorqueFront ?? 1200)
  let service = 0
  if (vehicleState.brake > 0 && (longVel > REV_THRESHOLD || params.transmissionType === 'manual')) {
    service = (vehicleState.abs ? vehicleState.abs.p[wheelIndex] : vehicleState.brake) * maxBt * brakeDmg
  }
  // FEAT-159: traction control's brake on the faster rear (src/traction.js) — real line pressure, in
  // either direction of travel, so it wears the pads like any braking; the stronger clamp wins.
  const tcP = vehicleState.traction?.p[wheelIndex]
  if (tcP) service = Math.max(service, tcP * maxBt * brakeDmg)

  // Handbrake: rear wheels only, FULL clamping torque at all speeds. A handbrake is a fixed brake, so
  // it must apply full torque at low speed / rest — that is exactly when you park on a hill. The old
  // speed-ramp (scale = |v|/HB_RAMP below 0.3 m/s) faded the torque toward zero right where holding
  // matters, and the `|v| === 0 ? full` guard almost never fires in floating point, so a car creeping
  // on a slope sat in the weak zone and the rear wheels ROLLED instead of locking → it slid downhill on
  // grades far below the friction angle. Full torque locks the rears; the tire then holds (static) or
  // skids (kinetic) per the slope vs friction angle, which is the correct behaviour.
  // The handbrake is mechanical — it bypasses the ABS valves — so it holds even while ABS vents the
  // rear cylinders under the pedal: the stronger of the two clamps wins.
  if (vehicleState.handbrake && isRear) {
    return Math.max(service, params.maxHandbrakeTorque * brakeDmg)
  }

  return service
}

// Body (frame/bumper/undercarriage) contact restitution — DEFAULT for params.bodyRestitution.
// BUG-27 lore (kept because the failure mode recurs as an engine-tuning question): restitution
// must be a bias off the PRE-solve approach velocity, never re-derived per solver pass, or it
// compounds. The engine's solver does this correctly; e is applied as the chassis shape's
// restitution material (terrain restitution is 0 and engines combine by max, so the pair
// restitution IS this value).
const BODY_RESTITUTION_DEFAULT = 0.21   // slight rebound on hard slams; 0 = fully-plastic thud
// Restitution applies only to genuine IMPACTS. Below this approach speed there is no bounce, so
// resting/settling contact stays dead-stopped (the BUG-27-era REST_VEL_THRESHOLD, 1.0 m/s — now the
// engine's world-level restitutionThreshold, set in physics-engine.js's world defaults).
// BUG-27b: body contact is SLIPPERY — a bumper grazing the shoulder must SLIDE, not catch and stop
// the truck dead. Under the engine this is a friction MATERIAL on the chassis shape. Engines
// combine pair friction by geometric mean (√(μa·μb)), and terrain colliders carry μ=0.8
// (terrain-physics.js), so the shape value is chosen to land the PAIR at the tuned BUG-27b 0.1:
// √(0.0125 · 0.8) = 0.1.
const BODY_FRICTION_MU  = 0.1            // the tuned pair friction (BUG-27b)
// BUG-89: below this sliding speed a tire SIDEWALL's Coulomb friction turns viscous (Step 2.6), so a
// truck at rest on its side holds instead of chattering. m/s.
const SIDEWALL_V_REG    = 0.1
const TERRAIN_FRICTION_REF = 0.8         // must match terrain-physics.js TERRAIN_FRICTION
const CHASSIS_SHAPE_MU  = BODY_FRICTION_MU * BODY_FRICTION_MU / TERRAIN_FRICTION_REF   // ≈ 0.0125
// FEAT-88: the open BED gets its own material. On the body material above, a firewood bundle
// (μ 0.8) met the floor at a pair μ of √(0.8 · 0.0125) = 0.10 — measured sliding on a 6° side slope
// — and the walls bounced loads at the body's restitution. Owner, 2026-10-05: "still very slidey,
// like 0.15". Same geometric-mean inversion as the chassis value, referenced to the bundle's 0.8
// (src/debris.js): √(0.8 · 0.028) = 0.15. A rock (0.7) lands at 0.14, a drum (0.5) at 0.12. Dead,
// not bouncy: wood and steel do not rebound off a bed wall.
const BED_CARGO_MU      = 0.15           // the pair friction a bundle sees on the bed (owner)
const CARGO_FRICTION_REF = 0.8           // must match src/debris.js bundle friction
const BED_SHAPE_MU      = BED_CARGO_MU * BED_CARGO_MU / CARGO_FRICTION_REF        // ≈ 0.028

// ── QUAL-25: chassis collider profile — measured off the ACTUAL vehicle model ──────────────
// Body-frame breakpoints (origin = CG, forward = −Z) of ranger.glb, the default truck, pushed
// through the exact seating transform vehicle-model.js applies (targetLength 4.705 × bodyScale
// 1.0 = scale 1.000, shiftRear 0.299, shiftDown −0.045, planted at cgHeight — so body y = model
// y − 0.651; mirrors and the roof antenna excluded). Measured 2026-10-15 (review-2 R-05) by
// loading the GLB headlessly through that transform; the numbers agree with the generator's own
// constants in assets/models/src/ranger.py (Y_COWL, Y_CAB_REAR, Z_ROOF + Z_ROOF_CROWN, Z_RAIL,
// Z_HIP, W_FLANK, W_BELT; the hood heights are CLIP_ST's). Until then this profile was hilux.glb's: 8 cm past the drawn front
// bumper, 12 cm past the rear, and a roof 7 cm too high. Re-measure if the model or its
// VEHICLE_MODELS spec changes — and when a SECOND vehicle model lands, this profile should move
// into data/vehicle-models.js as per-model hull data (the QUAL-25 option-2 path) instead of
// growing switches here.
//
// The deck hull is a SOLID at rail height when the model has no open bed (a closed bed top reads
// as a tonneau cover, owner ruling 2026-08-15). A model with a real open bed carries a `bed` spec
// in data/vehicle-models.js and gets a hollow well instead (see createVehicleChassis) so cargo can
// ride in it; ranger.glb does (owner, 2026-09-29).
const CHASSIS_PROFILE = {
  noseZ: -2.053,       // front bumper face (the chrome blade)
  bumperLowY: -0.06,   // the blade's bottom edge (ranger.py Z_BUMP0: 0.49 m above the ground at ride height)
  tailZ: 2.651,        // rear bumper face
  cowlZ: -0.689,       // windshield base
  roofFrontZ: -0.17,   // roof leading edge (windshield top)
  roofRearZ: 0.45,     // roof trailing edge (rear window top)
  cabRearZ: 0.525,     // cab back panel → bed rail
  hoodNoseY: 0.36,     // hood height at the grille
  hoodCowlY: 0.52,     // hood height at the cowl
  roofY: 0.97,         // roof crown (the old single hull had 0.40 — rollovers rested on air)
  railY: 0.49,         // bed rail top
  beltY: 0.21,         // top of the full-length lower slab: the hip, where the flank is widest
  slabHalfW: 0.85,     // fenders/bumpers/tail lamps — the widest body point
  cabHalfW: 0.78,      // cab at the beltline (mirrors excluded)
  deckHalfW: 0.845,    // bed sides
}

/**
 * FEAT-138: the two roll angles [deg from upright] where the CG stands over the pivot edge — past
 * them gravity finishes the roll. Wheels ↔ side pivots on the tire's outer edge at the ground; side ↔
 * roof on the cab roof's edge. Stock Ranger: 56.8° and 141.2°.
 */
export function rollBalance (params) {
  const deg = 180 / Math.PI
  return {
    wheelsDeg: Math.atan2(params.trackFront / 2 + (params.wheelWidth || 0.25) / 2, params.cgHeight) * deg,
    roofDeg: 180 - Math.atan2(CHASSIS_PROFILE.cabHalfW, CHASSIS_PROFILE.roofY) * deg,
  }
}

/**
 * Fold the engine's WHEEL HARD CORE contact forces into `out`, per corner [N], taking the max
 * against whatever the soft path already put there.
 *
 * This is the rim-strike signal, and it is the engine's own answer rather than anything derived.
 * Each wheel carries a rigid core at `wheelRadius − WHEEL_SOFT_BAND` — its own 18 kg body (BUG-99),
 * riding the strut-derived hub position and colliding with debris only. That geometry IS the model of a
 * tire: the outer 0.15 m band is rubber, handled by our analytic soft path, and the core is the
 * rim. So "the rubber ran out and the rim is taking the load" needs no threshold and no proxy —
 * it is exactly the condition that the engine reports a contact on a core, and Box3D solves that
 * contact properly: real impulse exchange, the rock kicked away with the momentum it took out of
 * the wheel, no penalty spring of ours in the loop.
 *
 * Note the enveloping factor is what decides whether a core is ever reached, and it points the
 * right way round: a big boulder envelops little, so the tire resists it and rides over with the
 * core untouched; a small hard rock envelops a lot, so the carcass wraps it and the hub sinks
 * until the core meets it. Which is the ranking a rim wants.
 *
 * @param {object} engine - physics engine (adapter).
 * @param {*} chassis - chassis body handle.
 * @param {Array<number>} out - length-4 scratch, written FL/FR/RL/RR.
 * @param {number} dt - physics step [s]; the engine reports an impulse, a yield criterion wants force.
 * @param {Array<number>} [outHazard] - length-4, ASSIGNED: the same core force counting only HAZARD
 *   debris (FEAT-93 — a rock the tire can split on, whatever its condition). Only the engine can see
 *   a hazard, so unlike `out` there is nothing from the soft path to max against.
 * @returns {{impulse:number, point:object|null, normal:object|null}} the chassis' hardest contact
 *   this step (engine.maxContactImpulse's result) — the same engine readout serves the collision-
 *   damage feed, so the caller does not ask twice.
 */
export function readRimStrikes (engine, chassis, out, dt, outHazard = null) {
  const hit = engine.maxContactImpulse(chassis)
  const rims = _rimsFor(engine).get(chassis)
  if (!rims) return hit
  const inv = dt > 0 ? 1 / dt : 0
  // MAX, not assign: the soft path has already written any rim contact it detected against
  // terrain this step (suspension.js), and a wheel can be taking both at once.
  for (let i = 0; i < 4; i++) {
    engine.maxContactImpulse(rims[i].core, _coreImpulse, outHazard ? _coreHazard : null)
    const f = _coreImpulse[0] * inv
    if (f > out[i]) out[i] = f
    if (outHazard) outHazard[i] = _coreHazard[0] * inv
  }
  return hit
}
const _coreImpulse = new Float64Array(1)   // a core body's peak contact impulse (it has one shape)
const _coreHazard  = new Float64Array(1)   // the same, hazard debris only (FEAT-93)

/**
 * Which armor region a contact landed on: 'front' | 'left' | 'right' | 'rear', or null for a hit
 * that no armor covers.
 *
 * Takes the body-local point AND body-local normal from `engine.maxContactImpulse()`, and uses each
 * for what it is actually good at:
 *
 *   · The NORMAL says which FACE was struck. Nosing into a rock pushes back along the body's z
 *     axis; scraping a wall pushes along x; landing from a jump pushes along y. That last one is
 *     the reason the normal is consulted at all — a vertical push is the ground, and the truck has
 *     no floor or roof armor, so it is not an impact this model prices. It is suspension work.
 *   · The POINT says which END or SIDE of that face. The normal's SIGN is unusable — it flips with
 *     whichever shape the engine happened to label A — so only its magnitudes pick the axis, and
 *     the position supplies the direction.
 *
 * The z test is taken about the mid-point between the bumpers rather than the CG, because the CG
 * sits well forward of body center on a pickup and would push the front/rear split into the cab.
 * Both axes are normalised by their own half-extent so "closest face" is measured in body
 * proportions, not metres — otherwise the long axis would win almost every time.
 *
 * @param {{x,y,z}} localPoint - contact point in body frame.
 * @param {{x,y,z}} localNormal - contact normal in body frame (sign-agnostic).
 * @returns {'front'|'left'|'right'|'rear'|null}
 */
export function classifyImpactRegion (localPoint, localNormal) {
  if (!localPoint || !localNormal) return null
  const ax = Math.abs(localNormal.x), ay = Math.abs(localNormal.y), az = Math.abs(localNormal.z)
  if (ay >= ax && ay >= az) return null            // ground beneath / roof above — not armor
  const P = CHASSIS_PROFILE
  if (az >= ax) {
    const midZ = 0.5 * (P.noseZ + P.tailZ)
    return localPoint.z < midZ ? 'front' : 'rear'  // forward = −z
  }
  return localPoint.x < 0 ? 'left' : 'right'       // right = +x
}

/**
 * Create the vehicle chassis body in the engine world (FEAT-48 Phase 2, QUAL-25 compound).
 *
 * Four convex hulls tracing the visible body volume (engine hulls are convex-only, so the
 * silhouette is decomposed): full-length lower SLAB (frame, bumpers, fenders — undercarriage
 * plane unchanged from the probe era), HOOD wedge rising to the cowl, CAB with the raked
 * windshield up to the real roof, and the tonneau-height bed DECK. Body origin = CG
 * (vehicleState.position), so mass data centers at the local origin. Overlapping hulls are
 * fine — they are one rigid body; overlap just guarantees no seam gaps.
 *
 * Mass + rotational inertia are OVERRIDDEN with the tuned params values — the driving feel is
 * calibration, not collider geometry (a compound's shape-derived tensor never applies).
 */
/**
 * @param {object} [opts]
 * @param {object|null} [opts.bed] - an OPEN bed well (floor, four walls, wheelhouse boxes) built to
 *   the given body-local dimensions, replacing the solid tonneau deck of shape 4. Null by default
 *   (the solid deck). The world truck and FEAT-41's menu stage both pass the model's
 *   VEHICLE_MODELS `bed` spec, so rocks dropped INTO the bed stay there — against the closed deck
 *   they land on the lid at rail height and roll straight off. Fields (all metres, body frame, forward = -Z):
 *   floorY, railY, wheelhouseY, innerHalfW, outerHalfW, wheelhouseHalfW, frontZ, tailZ, gateZ,
 *   archZ0, archZ1. The caller owns the numbers because they belong to a specific .glb.
 */
export function createVehicleChassis (engine, vehicleState, params, { bed = null } = {}) {
  const P = CHASSIS_PROFILE
  const undY = params.wheelRadius - params.cgHeight        // undercarriage bottom (unchanged)

  const chassis = engine.createBody({
    type: 'dynamic',
    position: vehicleState.position,
    quaternion: vehicleState.quaternion,
    canSleep: false,               // the player's body — never let the engine idle it out
    bullet: true,                  // continuous collision: no tunnelling through thin debris at speed
    userData: { kind: 'vehicle' },
  })
  const mat = {
    friction: CHASSIS_SHAPE_MU,
    restitution: params.bodyRestitution ?? BODY_RESTITUTION_DEFAULT,
    density: 1,                    // placeholder — overridden by setMassData below
    group: GROUP_CHASSIS,
  }
  // A z–y profile polygon extruded to ±halfW → flat hull point list.
  const extrude = (profile, halfW) => {
    const pts = []
    for (const x of [-halfW, halfW]) for (const [z, y] of profile) pts.push(x, y, z)
    return pts
  }
  // 1. Lower slab: nose to tail, undercarriage to beltline — CHAMFERED (capture 1786773473453).
  // A sharp box corner at undercarriage depth dug into rising ground/road at full suspension
  // compression and turned a graze into a one-frame wall strike (launch + yaw kick). The bottom
  // face is pulled in like a real truck's approach/departure angles (~40°) and side sills, so a
  // bottoming-out contact is always a glancing plane, never a corner catch. The bottom PLANE
  // stays at the honest undercarriage height — flat scrapes are unchanged.
  // Slab restitution is pinned to 0 regardless of params.bodyRestitution: an undercarriage
  // scrape must be fully plastic (real frames yield, they don't bounce); the cab/roof/deck
  // below keep the tunable rebound for genuine body slams and rollovers.
  const slabBottomHalfW = 0.80
  const slabBottomNoseZ = P.noseZ + 0.43   // approach chamfer
  const slabBottomTailZ = P.tailZ - 0.37   // departure chamfer
  const BED_T = 0.06   // open-bed wall/floor thickness, taken inward from each face (shape 4)
  // Top face at `topY` from z0 to z1; bottom face follows the chamfered footprint, clipped to [z0, z1].
  // BUG-108: at the nose the face is the drawn bumper's vertical blade down to its bottom edge, and the
  // approach chamfer starts below it. One 48° ramp from the bumper top to the undercarriage met a 45 cm
  // crate near its foot and pressed it into the road: it wedged and the truck climbed it, 0.98 m/s lost in
  // one step at 40 mph (2× the momentum bound). Against the blade it is pushed (test/strike-hitch.mjs).
  // Approach angle, the tire-tangent ramp to the hull: 52° → 37° (a real Ranger is 25–30°).
  const slabPart = (z0, z1, topY) => engine.addHull(chassis, [
    -P.slabHalfW, topY, z0, P.slabHalfW, topY, z0,
    -P.slabHalfW, topY, z1, P.slabHalfW, topY, z1,
    -slabBottomHalfW, undY, Math.max(z0, slabBottomNoseZ), slabBottomHalfW, undY, Math.max(z0, slabBottomNoseZ),
    -slabBottomHalfW, undY, Math.min(z1, slabBottomTailZ), slabBottomHalfW, undY, Math.min(z1, slabBottomTailZ),
    ...(z0 === P.noseZ ? [-P.slabHalfW, P.bumperLowY, z0, P.slabHalfW, P.bumperLowY, z0] : []),
  ], { ...mat, restitution: 0 })
  const bounceFrom = bed ? 2 : 1   // shapes before this index are the slab (restitution pinned 0)
  const bedShapes = [0, 0]         // [from, to) of the bed-well slabs — their own dead material (FEAT-88)
  if (bed) {
    // An open bed's floor sits BELOW the beltline, so a full-length slab to beltY would fill the
    // well and cargo would rest on its top face instead of on the bed floor (measured: 13 cm proud
    // on the ranger). Split at the bed's front wall: full height ahead of it, and under the bed
    // stop at the floor pan's underside so the two hulls meet with no ledge.
    const splitZ = bed.frontZ - BED_T
    slabPart(P.noseZ, splitZ, P.beltY)
    slabPart(splitZ, P.tailZ, bed.floorY - BED_T)
  } else {
    slabPart(P.noseZ, P.tailZ, P.beltY)
  }
  // 2. Hood wedge: grille up to the cowl.
  engine.addHull(chassis, extrude([
    [P.noseZ, 0.02], [P.noseZ, P.hoodNoseY], [P.cowlZ, P.hoodCowlY], [P.cowlZ, 0.02],
  ], P.slabHalfW * 0.95), mat)
  // 3. Cab: cowl → raked windshield → roof → back panel down to the rail. With an open bed the
  //    back panel is held at the bed's front wall, or the cab hull would stand inside the well.
  const cabRearZ = bed ? Math.min(P.cabRearZ, bed.frontZ - BED_T) : P.cabRearZ
  engine.addHull(chassis, extrude([
    [P.cowlZ, 0.14], [P.cowlZ, P.hoodCowlY], [P.roofFrontZ, P.roofY],
    [P.roofRearZ, P.roofY], [cabRearZ, P.railY], [cabRearZ, 0.14],
  ], P.cabHalfW), mat)
  // 4. Bed deck: cab back to the tail at rail height — SOLID (tonneau, see header note),
  //    unless the caller supplied an open-bed spec, in which case the same region is built as a
  //    WELL — floor, four walls and the two wheelhouse boxes — so something dropped from above
  //    lands on the bed FLOOR and is held by the rails.
  if (bed) {
    const T = BED_T
    // Axis-aligned box as an 8-point hull. Cheaper to read than extrude() here because the bed
    // pieces are boxes in three different orientations, not one z–y profile swept across the width.
    const bedMat = { ...mat, friction: BED_SHAPE_MU, restitution: 0 }
    const slab = (x0, x1, y0, y1, z0, z1) => engine.addHull(chassis, [
      x0, y0, z0, x1, y0, z0, x0, y1, z0, x1, y1, z0,
      x0, y0, z1, x1, y0, z1, x0, y1, z1, x1, y1, z1,
    ], bedMat)
    bedShapes[0] = engine.shapeCount(chassis)
    const { floorY, railY, wheelhouseY, innerHalfW: wi, outerHalfW: wo,
            wheelhouseHalfW: ww, frontZ, tailZ, gateZ, archZ0, archZ1 } = bed
    slab(-wo, wo, floorY - T, floorY, frontZ, tailZ)          // floor pan
    slab(-wo, wo, floorY, railY, frontZ - T, frontZ)          // front wall (cab back panel)
    slab(-wo, wo, floorY, railY, tailZ, gateZ)                // tailgate (its own slab, as authored)
    slab(-wo, -wi, floorY, railY, frontZ, tailZ)              // left bedside
    slab(wi, wo, floorY, railY, frontZ, tailZ)                // right bedside
    slab(-wi, -ww, floorY, wheelhouseY, archZ0, archZ1)       // left wheelhouse
    slab(ww, wi, floorY, wheelhouseY, archZ0, archZ1)         // right wheelhouse
    bedShapes[1] = engine.shapeCount(chassis)
  } else {
    engine.addHull(chassis, extrude([
      [P.cabRearZ, 0.14], [P.cabRearZ, P.railY], [P.tailZ, P.railY], [P.tailZ, 0.14],
    ], P.deckHalfW), mat)
  }

  // 5. Wheel HARD CORES — one per wheel, the RIM: a disk at `wheelRadius − WHEEL_SOFT_BAND` that
  // collides with DEBRIS ONLY (never terrain/road — driving feel is untouched by construction).
  // The tire itself stays the analytic soft contact (suspension + Pacejka + the Step 0.5 debris
  // coupling); the cores exist because the wheel is otherwise not solid to the engine, so a rock
  // bulldozed backward by the slab chamfer could be shoved INTO the wheel arch and sit inside the
  // tire (owner capture 1786777538787: −0.43 m interpenetration in the crawl gate).
  // Each core is its OWN body of the wheel's unsprung mass (params.wheelMass) (BUG-99, owner
  // 2026-10-29). Until then the cores were hulls on the chassis, so a rock pinched against a rim was
  // answered by the whole truck — rigidly, at the hub, with a lever arm to the CG — and that impulse
  // flipped it. A real wheel answers along its strut with its own ~18 kg on its spring, and across
  // the strut through its arms, i.e. with the truck. So: the core is seated on its hub every step
  // (seatWheelCores), touches debris only, and after the step what debris did to it is split —
  // along the strut into strutCompVel (our spring and stops hand it on), across it onto the
  // chassis at the hub (readWheelCores). The core is FREE during the engine step, not jointed: a
  // prismatic joint was tried and measured — at the engine's default stiffness it went unstable
  // against the per-step re-seat (body-contact-energy: 3 MJ out of a 0.1 MJ slam), and it moved
  // the wheels' 72 kg off the body, which changes ride and handling (owner: road feel stays). The
  // cost, within one engine step only: a rock pushing a rim SIDEWAYS meets 18 kg, not the truck; the
  // core is back at truck speed the next step, so a wedged rock is shoved over a few steps instead
  // of one, and the truck takes every newton of it. With no rock on a core, nothing here acts.
  const rims = []
  // The hulls between the slab and the wheel cores are the ones that carry params.bodyRestitution.
  rims.bounceShapes = []
  // The bed well is NOT one of them: its restitution is pinned 0 with its own friction (FEAT-88),
  // so the Body Bounce slider never reaches it.
  for (let i = bounceFrom; i < engine.shapeCount(chassis); i++) {
    if (i < bedShapes[0] || i >= bedShapes[1]) rims.bounceShapes.push(i)
  }
  const q = vehicleState.quaternion
  for (let c = 0; c < 4; c++) {
    const { x, y: mountY, z } = mountLocal(c, params), front = c < 2
    const hub = getWheelPosition(c, vehicleState, params)
    const core = engine.createBody({ type: 'dynamic', position: hub, quaternion: q, gravityScale: 0,
      canSleep: false, userData: { kind: 'wheelCore', corner: c } })
    engine.addHull(core, wheelCorePoints(0, 0, 0, params), RIM_MATERIAL)
    engine.setMassData(core, params.wheelMass, wheelCoreInertia(params))
    rims.push({ core, x, z, mountY, front })
  }

  // INERTIA AXES — PHYSICALLY CORRECT MAPPING (owner-approved fix, 2026-08-15). Body frame,
  // forward = −Z: ROLL is rotation about the LONGITUDINAL (z) axis, PITCH about the LATERAL (x)
  // axis. The legacy world-frame integrator applied inertiaRoll to world-x and inertiaPitch to
  // world-z — i.e. the tuned values (which carry correct real-Ranger magnitudes: roll ~678,
  // pitch ~2699) landed on swapped axes, and traded places with heading. The cutover first
  // replicated that swap for drives-the-same fidelity; this assigns them to the axes the
  // real truck owns: quick honest roll (rollovers!), stately dive/squat.
  syncChassisMass(engine, chassis, params)
  _rimsFor(engine).set(chassis, rims)
  return chassis
}

/**
 * Push params.mass and the three tuned inertias onto the chassis body. The engine keeps its own
 * copy, so a live edit of those params (the Mass slider, a vehicle preset) reaches the dynamics
 * only through this call — without it the truck kept the mass it was created with.
 * FEAT-122: `params.stowedKg` (the inventory's kit, absent = 0) adds its mass at the CG. Inertia and
 * the centre stay put — light kit barely moves them, and every force here acts about the origin as CG.
 */
export function syncChassisMass (engine, chassis, params) {
  engine.setMassData(chassis, params.mass + (params.stowedKg || 0),
    { x: params.inertiaPitch, y: params.inertiaYaw, z: params.inertiaRoll })
}

/** A wheel core's own inertia: a disk of params.wheelMass spinning about body x. */
function wheelCoreInertia (params) {
  const mu = params.wheelMass, R = params.wheelRadius - WHEEL_SOFT_BAND, w = params.wheelWidth || 0.25
  const across = mu * (R * R / 4 + w * w / 12)
  return { x: mu * R * R / 2, y: across, z: across }
}

/**
 * Live-set the body rebound (the "Body Bounce" debug slider) on the hulls that carry it — hood,
 * cab and bed. The undercarriage slab and the wheel cores are pinned to 0 at creation and stay so.
 */
export function setBodyRestitution (engine, chassis, restitution) {
  const rims = _rimsFor(engine).get(chassis)
  if (rims) engine.setMaterial(chassis, { restitution }, rims.bounceShapes)
}

// engine → (chassis handle → rim tracking metadata). Module-scoped: gates create their own chassis.
// KEYED BY ENGINE, not by the bare handle (FEAT-41). Body handles are per-world integers starting
// at 1, so the menu stage's second PhysicsEngine hands out handle 1 for ITS chassis too — a flat
// Map would have the two trucks overwrite each other's rim metadata and re-seat the wrong cores.
const _rimsByEngine = new WeakMap()
function _rimsFor (engine) {
  let m = _rimsByEngine.get(engine)
  if (!m) { m = new Map(); _rimsByEngine.set(engine, m) }
  return m
}

/**
 * Before the engine step: put each wheel core on its hub (the strut-derived position, the chassis'
 * orientation) moving as the hub moves — the chassis' point velocity plus the strut's own rate.
 * What a rock then does to a core during the step is the engine's to solve.
 */
function seatWheelCores (engine, chassis, vehicleState, params) {
  const rims = _rimsFor(engine).get(chassis)
  if (!rims || !vehicleState.strutComp) return
  const up = _coreUp.set(0, 1, 0).applyQuaternion(vehicleState.quaternion)
  const v = vehicleState.velocity, w = vehicleState.angularVelocity
  for (let i = 0; i < 4; i++) {
    const r = rims[i]
    const hub = getWheelPosition(i, vehicleState, params)
    const rx = hub.x - vehicleState.position.x, ry = hub.y - vehicleState.position.y, rz = hub.z - vehicleState.position.z
    const sv = vehicleState.strutCompVel?.[i] ?? 0
    _coreV.set(v.x + w.y * rz - w.z * ry + sv * up.x, v.y + w.z * rx - w.x * rz + sv * up.y, v.z + w.x * ry - w.y * rx + sv * up.z)
    engine.setTransform(r.core, hub, vehicleState.quaternion)
    engine.setVelocity(r.core, _coreV, w)
  }
}

/**
 * After the engine step: the impulse debris put into each core is what the rock did to that wheel.
 * Along the strut it lands on the wheel's own mass (÷ wheelMass into the strut rate — our spring
 * and stops hand it to the truck); across the strut the arms carry it, so it goes to the chassis
 * at the hub. Read as the contact impulse itself: with no rock touching a core this is exactly
 * zero, and the step is untouched.
 */
function readWheelCores (engine, chassis, vehicleState, params) {
  const rims = _rimsFor(engine).get(chassis)
  if (!rims || !vehicleState.strutCompVel) return
  engine.getTransform(chassis, _coreP, _coreQ)
  const up = _coreUp.set(0, 1, 0).applyQuaternion(_coreQ)
  for (let i = 0; i < 4; i++) {
    const J = engine.contactImpulseOn(rims[i].core, _coreV, GROUP_DEBRIS)
    if (J.x === 0 && J.y === 0 && J.z === 0) continue
    const along = J.x * up.x + J.y * up.y + J.z * up.z
    vehicleState.strutCompVel[i] += along / params.wheelMass
    engine.getTransform(rims[i].core, _coreHub, _coreQ2)
    engine.applyImpulse(chassis, { x: J.x - along * up.x, y: J.y - along * up.y, z: J.z - along * up.z }, _coreHub)
  }
}
const _coreV = new THREE.Vector3(), _coreUp = new THREE.Vector3(), _coreP = new THREE.Vector3(), _coreHub = new THREE.Vector3()
const _coreQ = new THREE.Quaternion(), _coreQ2 = new THREE.Quaternion()

const RIM_SIDES = 12          // dodecagon: within 3.5% of a true circle, 24 hull points
// updateBodyMass FALSE: each core's mass is pinned by setMassData (params.wheelMass).
const RIM_MATERIAL = { friction: 0.5, restitution: 0, group: GROUP_CHASSIS, collidesWith: GROUP_DEBRIS, updateBodyMass: false }

/**
 * Hull points for one wheel HARD CORE — a DISK, not a sphere.
 *
 * The core is the rim, so it should be shaped like one: a regular prism about the spin axis (body
 * X), radius `wheelRadius − WHEEL_SOFT_BAND`, as wide as the tire. A sphere of the same radius was
 * wrong in both directions at once — 0.44 m across where the tire is 0.25 m, so it pinched rocks
 * well outboard and inboard of the tread, and it met the ground at a POINT where a wheel meets it
 * along a line. Neither error is small at rock scale.
 *
 * @param {number} cx,cy,cz - core centre in body-local space (the hub).
 * @returns {Array<number>} flat [x,y,z,…] hull points.
 */
function wheelCorePoints (cx, cy, cz, params) {
  const R = params.wheelRadius - WHEEL_SOFT_BAND
  const halfW = (params.wheelWidth || 0.25) / 2
  const pts = []
  for (let k = 0; k < RIM_SIDES; k++) {
    const a = (k + 0.5) * 2 * Math.PI / RIM_SIDES   // +0.5 so a FLAT faces down, not a vertex
    const y = cy + R * Math.cos(a), z = cz + R * Math.sin(a)
    pts.push(cx - halfW, y, z, cx + halfW, y, z)
  }
  return pts
}

/**
 * Advance vehicle physics state by one fixed timestep.
 *
 * @param {object} vehicleState - Mutable vehicleState (mutated in-place).
 * @param {object} params - RANGER_PARAMS (may be augmented with debug-slider values).
 * @param {number} dt - Fixed timestep in seconds.
 * @param {function} queryContacts - (cx,cy,cz,r,footprint) → Array<{normal,depth,contactPoint}>.
 *   Caller (main.js) implements this against all analytic solid geometry (terrain, props, walls).
 *   Must be a pure function of its arguments within one step — it is asked ONCE per wheel per
 *   step (Step 1) and the answer is reused for the substeps (see qcPlus).
 * @param {{engine: object, chassis: *}} engineCtx - the physics engine and the chassis body handle.
 * @returns {void}
 */
export function stepPhysics (vehicleState, params, dt, queryContacts, engineCtx) {
  if (!engineCtx) throw new Error('stepPhysics: engineCtx {engine, chassis} is required (FEAT-48)')
  const { engine, chassis } = engineCtx
  // ── Step 0: Rotation helper ────────────────────────────────────────────────
  // Built once per (params, vehicleState) pair, not per step. It reads .quaternion at CALL time, so
  // it stays right between steps too (main.js asks getWheelPosition outside the step).
  if (params._rotateVectorOf !== vehicleState) {
    params._rotateVectorOf = vehicleState
    params._rotateVector = (v) => new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(vehicleState.quaternion)
  }

  // ── Step 0.5: Wheel contact source = analytic terrain ∪ engine DYNAMIC bodies ──
  // The analytic queryContacts stays the terrain/prop/wall source for wheels (it is
  // continuous-resolution — better than any baked collider). The engine overlap adds
  // debris under the wheel, filtered to GROUP_DEBRIS so engine terrain/props can never
  // double-count a surface the analytic query already reports. Engine hits carry .body,
  // which is what triggers the relative-velocity path in Step 3.
  //
  // Debris contacts come from the engine's EXACT narrow-phase pair tests (contactSphere):
  // penetration depth is continuous through any overlap and the normal never degenerates, so
  // the tire's own spring–damper law resolves the hit with no caps, clamps, or speed terms —
  // hit hard → the damper sees a high closing rate → high force; roll on slowly → low force.
  // (The 2026-08-15 band-aid lineage — hard depth cap, growth rate limit, speed-scaled
  // allowance, damper-relief suppression — existed to paper over a DISCONTINUOUS depth probe
  // and a damper fed strut velocity instead of the contact's closing rate. Owner called it,
  // correctly: fix the measurement, not the physics.)

  // ONE analytic ground query per wheel per step. Step 1 (the tunnelling failsafe) asks it at each
  // wheel's start-of-step hub; the four suspension substeps and Step 3 then ask at hubs that have
  // moved by one step of strut travel — millimetres — and on an out-of-round tire with a radius a
  // few mm different. Those five re-asks each cost ~33 ground samples and came back with the same
  // surfaces, so they now re-read Step 1's contacts with each depth shifted for the hub move along
  // the contact normal and for the radius change: a plane, honest at this scale (a wheel that lifts
  // off reads depth ≤ 0 and drops the contact). Terrain and static props only — the engine sphere
  // test below still runs on every call (owner, 2026-10-02). Not because debris moves within the
  // step (the engine steps once, after all of these, and _bodyXf serves one pose per step) but
  // because a debris contact is a hull or sphere, not a plane, so a depth shift cannot stand in
  // for re-asking it.
  // Measured before: ~75 % of the 1.9 ms physics step was these queries.
  //
  // A wheel that is AIRBORNE at the start of the step has an empty answer, and the query reports
  // only penetrating contacts — so a touchdown inside the step could not appear until the next
  // one (up to a step of extra sink, ~50 mm at a 3 m/s landing). Such a corner keeps asking the
  // real query every substep, so a landing is caught at the substep it happens, as before. Costs
  // nothing while the wheels are on the ground.
  const base = [null, null, null, null]   // per corner: { x, y, z, r, list } — Step 1's analytic answer

  // BUG-99 WITHIN-STEP DEBRIS COUPLING — Newton's third law, at the suspension's own cadence.
  // The engine moves a rock only once per step, after this step's four suspension substeps have
  // pushed on it. Three things went wrong with that before:
  //   · The rock was handed the tire's push only when it was the wheel's SUPPORT (Step 3). A tire
  //     still on the road running into a rock's face put up to 80 kN into the truck and NOTHING
  //     into the rock, so the rock stayed planted, the wheel's hard core pinched it, and the pinch
  //     flipped the truck (owner play-test: 4 times in 5 above 30 mph); when the wheel finally
  //     climbed on, the force stored all that while landed on the rock in one step — the yeet.
  //   · Given that push for a whole 1/60 s at once, a light rock overshoots the tire.
  //   · The contact was found a step LATE: only once the engine step had already driven the wheel
  //     into the rock (10 cm per step at 6 m/s), with no force acting while it did. The spring
  //     energy of an overlap that appeared at once launched the rock, v ≈ d·√(k/m).
  // So, per step, each debris body near a wheel gets a PROXY — its mass and engine velocity — and
  // its contact is followed THROUGH the step instead of read at its start:
  //   · LOOK-AHEAD: the query sphere is grown by one step of the hub's travel, so a rock the wheel
  //     will reach during this step is seen now, at its true (negative) gap.
  //   · The overlap at substep time t is gap + u·t + (the proxy's yield)·n, where u is the hub's
  //     closing speed on the rock's normal relative to the rock's own motion. The contact starts
  //     at the instant the surfaces meet — continuous collision detection for the soft tire.
  //   · Every substep's tire force on the body (c.onForce, from the suspension's own contact pass)
  //     accelerates the proxy at once, and the summed impulse goes to the engine once, before it
  //     steps. The rock gets exactly what the hub felt, while it is being pushed.
  //   · The proxy is a rigid body: a push changes its velocity AND spin (the engine's mass and
  //     inertia), so the contact point yields as the rock really would, turning as well as sliding.
  //   · It cannot move INTO the ground it was lying on (the engine's own contacts with static
  //     bodies, as impulses at those points): a rock on the road pivots on it, a rock in the air
  //     is free, and the ground still takes its share through the engine. No speed rule decides.
  // Each push goes to the engine at its own contact point, so the rock's real spin matches the
  // proxy's. Small-angle within the step (a step turns a rock a few degrees). The hub's look-ahead uses the
  // chassis' rigid motion; its strut motion is already in the hub position each substep asks at.
  // (Revives the 2026-08-15 proxy, c03a727, reverted on feel before the hard cores existed; that
  // one read the start-of-step overlap and held "resting" rocks with a speed rule.)
  const proxies = new Map()           // body → proxy, this step only
  const queries = _queryCount.fill(0) // qcPlus calls per corner this step: substep k asks at t = (k−1)·sdt
  const sdt = dt / SUSPENSION_SUBSTEPS
  const proxyFor = (h) => {
    let p = proxies.get(h.body)
    if (!p) {
      const { com, invI } = engine.massProperties(h.body)
      const support = engine.staticSupports(h.body)
      const v0 = { x: 0, y: 0, z: 0 }, w0 = { x: 0, y: 0, z: 0 }
      engine.getVelocity(h.body, v0, w0)
      p = { m: engine.getMass(h.body), com, invI, support, v0, w0,   // the engine's velocity and spin at the step's start
        jn: new Float64Array(support.length), jt: new Float64Array(3 * support.length),   // proxyGround's per-point sums
        sr: new Float64Array(4 * support.length), sdt,   // and each support's carried offset + lift rate
        dv: { x: 0, y: 0, z: 0 }, dw: { x: 0, y: 0, z: 0 },   // velocity / spin change this step
        D: { x: 0, y: 0, z: 0 }, Th: { x: 0, y: 0, z: 0 },    // and their integrals (small angles)
        pushes: [] }                                         // [impulse, point] for the engine
      proxies.set(h.body, p)
    }
    return p
  }
  const qcPlus = (cx, cy, cz, r, footprint, corner) => {
    let list = null
    const b = corner !== undefined ? base[corner] : null
    if (b && footprint && b.list.length) {
      const dx = cx - b.x, dy = cy - b.y, dz = cz - b.z, dr = r - b.r
      list = []
      for (const c of b.list) {
        const d = c.depth + dr - (dx * c.normal.x + dy * c.normal.y + dz * c.normal.z)
        if (d > 0) list.push({ normal: c.normal, depth: d, contactPoint: c.contactPoint })
      }
    }
    if (!list) list = queryContacts(cx, cy, cz, r, footprint, corner !== undefined ? _axle[corner] : undefined)
    // Look-ahead (see above): grow the sphere by one step of the hub's rigid travel.
    const vs = vehicleState, w = vs.angularVelocity
    const rx = cx - vs.position.x, ry = cy - vs.position.y, rz = cz - vs.position.z
    const hvx = vs.velocity.x + w.y * rz - w.z * ry
    const hvy = vs.velocity.y + w.z * rx - w.x * rz
    const hvz = vs.velocity.z + w.x * ry - w.y * rx
    const ahead = Math.hypot(hvx, hvy, hvz) * dt
    const t = corner !== undefined ? Math.min(queries[corner]++, SUSPENSION_SUBSTEPS - 1) * sdt : 0
    const dyn = engine.contactSphere({ x: cx, y: cy, z: cz }, r + ahead, { collidesWith: GROUP_DEBRIS, dynamicOnly: true })
    for (let i = 0; i < dyn.length; i++) {
      const h = dyn[i]
      // Safety invariant, not a filter that should ever fire with exact manifolds: a body under
      // the wheel cannot push it DOWN (a rock overhead is the chassis' engine contact).
      if (h.normal.y < -0.1) continue
      const p = proxyFor(h)
      const rx = h.contactPoint.x - p.com.x, ry = h.contactPoint.y - p.com.y, rz = h.contactPoint.z - p.com.z
      // The body's velocity at the contact: the engine's, plus what this step's pushes have added
      // there (spin included — a push high on a rock mostly turns it).
      const sv = engine.getPointVelocity(h.body, h.contactPoint, { x: 0, y: 0, z: 0 })
      const u = -((hvx - sv.x) * h.normal.x + (hvy - sv.y) * h.normal.y + (hvz - sv.z) * h.normal.z)
      // gap + closing·t + the contact point's yield · n (negative while it separates along −n)
      const yx = p.D.x + p.Th.y * rz - p.Th.z * ry, yy = p.D.y + p.Th.z * rx - p.Th.x * rz, yz = p.D.z + p.Th.x * ry - p.Th.y * rx
      h.depth = h.depth - ahead + u * t + (yx * h.normal.x + yy * h.normal.y + yz * h.normal.z)
      if (h.depth <= 0) continue
      sv.x += p.dv.x + p.dw.y * rz - p.dw.z * ry
      sv.y += p.dv.y + p.dw.z * rx - p.dw.x * rz
      sv.z += p.dv.z + p.dw.x * ry - p.dw.y * rx
      h.surfaceVel = sv
      h.hazard = !!engine.getUserData(h.body)?.hazard
      h.yield = proxyYield(p, rx, ry, rz, -h.normal.x, -h.normal.y, -h.normal.z)   // FEAT-158: the normal force is implicit in it (stepSuspensionSubsteps)
      h.onForce = (Fn, dts, hub) => {
        // The tire pushes the body along −n with Fn for one substep, at the contact point.
        const j = { x: -h.normal.x * Fn * dts, y: -h.normal.y * Fn * dts, z: -h.normal.z * Fn * dts }
        p.pushes.push(j, h.contactPoint)
        proxyImpulse(p, j.x, j.y, j.z, rx, ry, rz)
        proxyGround(p)
        const g = rockGrip(p, h, rx, ry, rz, Fn, dts, hub, corner)
        rockLoad[corner] += Fn * (h.normal.x * _up.x + h.normal.y * _up.y + h.normal.z * _up.z) * dts / dt
        p.D.x += p.dv.x * dts; p.D.y += p.dv.y * dts; p.D.z += p.dv.z * dts
        p.Th.x += p.dw.x * dts; p.Th.y += p.dw.y * dts; p.Th.z += p.dw.z * dts
        return g
      }
      list.push(h)
    }
    return list
  }
  // FEAT-158 GRIP ON A ROCK — Coulomb friction between the tire and every rock it is pressed
  // against (a face or the top it is riding on), solved per substep at velocity level with the
  // normal push it rides on. The tire's one Pacejka patch (BUG-38) sat on the most-upward contact,
  // so a face pressing the tire took normal force only and the tire shoved rocks it should climb
  // (owner: "the truck hardly ever climbs over them"); that patch now rides the road only (Step 3).
  // Why this shape, measured on the parked attempt (wip/bug99-rock-grip): a second Pacejka patch
  // stepped once per 1/60 s builds its grip over the relaxation length (≈0.16 s at a crawl) while
  // the normal push acts every substep, so the rock was rolled away before any grip existed; and
  // once saturated it handed a pivoting 9 kg rock (≈1.4 kg at its face) 60 N·s a step — 2 mph into
  // 22 m/s. Here the impulse is the one that stops the slide of the tire surface over the rock,
  // against BOTH sides' compliance (the rock's with its ground holding it — proxyYield — and the
  // wheel's spin), capped by the cone μ·Fn·dt: implicit, so it can stop a slide but never reverse
  // it, at any mass. The rock gets it at the contact (its ground's share via proxyGround, so a
  // rock pressed into the road grips the road too); the wheel's spin gets its torque (rockSpin,
  // folded into ω after the substeps); the hub gets the force back (returned to the suspension:
  // the strut-axis part through the hub, the rest to the body, as a normal force is split).
  const rockSpin = _rockSpin.fill(0)
  const rockLoad = _rockLoad.fill(0)   // N — the strut-axis load rocks carried, step mean (Step 3 takes it off the road patch)
  const rockGrip = (p, h, rx, ry, rz, Fn, dts, hub, i) => {
    const vs = vehicleState, n = h.normal
    // The wheel's spin axis: ω·â with â = −(steered right), so a wheel rolling forward turns its
    // contact patch backward (the Step 3 frame; camber ignored — a few degrees on a lever of 0.37 m).
    const steer = (i < 2 ? (vs.wheelSteerAngles ? vs.wheelSteerAngles[i] : vs.steerAngle) : 0) + toeOffset(i, params)
    const a = _gripAx.copy(_right).applyAxisAngle(_up, steer).negate()
    const om = (vs.wheelOmega?.[i] ?? 0) + rockSpin[i]
    const cx = h.contactPoint.x - hub.x, cy = h.contactPoint.y - hub.y, cz = h.contactPoint.z - hub.z
    // Slide of the tire surface over the rock, in the contact's tangent plane.
    const rv = proxyPointVel(p, rx, ry, rz, _gripV)
    let sx = hub.vx + om * (a.y * cz - a.z * cy) - rv.x
    let sy = hub.vy + om * (a.z * cx - a.x * cz) - rv.y
    let sz = hub.vz + om * (a.x * cy - a.y * cx) - rv.z
    const sn = sx * n.x + sy * n.y + sz * n.z
    sx -= sn * n.x; sy -= sn * n.y; sz -= sn * n.z
    const slide = Math.hypot(sx, sy, sz)
    if (slide < 1e-6) return null
    const tx = sx / slide, ty = sy / slide, tz = sz / slide
    const I = (params.wheelInertia || 1.22) + (i >= 2 ? (params._drivenInertia ?? 0) : 0)   // FEAT-126, as the ω solve
    const lever = a.x * (cy * tz - cz * ty) + a.y * (cz * tx - cx * tz) + a.z * (cx * ty - cy * tx)   // â·(r × t)
    const mu = (params.frictionCoeff ?? 1) * (params.pacejkaD ?? 1) * (params._tireMuScale?.[i] ?? 1)
    const J = Math.min(slide / (proxyYield(p, rx, ry, rz, tx, ty, tz) + lever * lever / I), mu * Fn * dts)
    if (!(J > 0)) return null
    const jx = J * tx, jy = J * ty, jz = J * tz
    p.pushes.push({ x: jx, y: jy, z: jz }, h.contactPoint)
    proxyImpulse(p, jx, jy, jz, rx, ry, rz)
    proxyGround(p)
    rockSpin[i] -= J * lever / I
    return _gripF.set(-jx / dts, -jy / dts, -jz / dts)
  }
  // ── Step 1: Catastrophic penetration failsafe ──────────────────────────────
  // Fires ONLY for genuine tunnelling. Uses queryContacts to detect terrain-aware severe penetration
  // instead of a flat y=0 half-space check (Phase 6 fix: TERR-FIX-01).
  // Old code: embed = wheelRadius - hub.y assumed flat ground at y=0 — always fired on terrain.
  //
  // BUG-24: the trigger stopped being a flat 0.3 m. 0.3 m sat BELOW the wheel radius (0.368 m), so a
  // deeply-compressed-but-normal contact would fire it: e.g. a wheel crossing the intended ~0.25 m
  // road-over-shoulder step has contact depth ~0.25 m + ~0.06 m loaded tire deflection ≈ 0.31 m > 0.3,
  // yet its hub center is still ~0.06 m ABOVE ground — a resolvable contact the suspension (Step 2.5)
  // handles via tire→strut→body force. That threshold preempted the force chain and hard-teleported the
  // body (position write + vy=0) → the observed "teleport instead of a natural bump".
  //
  // The trigger is now `depth > 2·wheelRadius` — the hub CENTER a full wheel radius BELOW the surface,
  // i.e. the whole wheel swallowed. `depth > wheelRadius` (hub center merely AT the surface) still fired
  // on hits the solvers recover from on their own; the teleport is a last-resort escape hatch for a true
  // tunnel (driven through a wall), and everything short of that belongs to the tire spring and the
  // engine's own chassis contacts, which push penetration out over several steps instead of snapping.
  //
  // Only the TERRAIN contact can reach this line: its depth is a half-space measure (terrainH + r − cy)
  // that grows without bound as the hub sinks. Mesh/prop contacts compute depth = r − dist, capped at r,
  // so they never trip the failsafe at any threshold ≥ r.
  {
    let maxEmbed = 0
    for (let i = 0; i < 4; i++) {
      const hub      = getWheelPosition(i, vehicleState, params)
      // FEAT-70: the wheel's spin axle — the body's right axis steered (steer + static toe) about its
      // up — for the ground query's tire cylinder (src/tire-contact.js). Camber is left out (a few mm
      // at the tread's edge lines). Fixed for the step: qcPlus hands the same axle to every substep.
      const steer    = (i < 2 ? (vehicleState.wheelSteerAngles ? vehicleState.wheelSteerAngles[i] : vehicleState.steerAngle) : 0) + toeOffset(i, params)
      _axle[i].set(1, 0, 0).applyAxisAngle(_bodyY, steer).applyQuaternion(vehicleState.quaternion)
      const contacts = queryContacts(hub.x, hub.y, hub.z, params.wheelRadius, true, _axle[i])
      base[i] = { x: hub.x, y: hub.y, z: hub.z, r: params.wheelRadius, list: contacts }
      for (const { depth } of contacts) {
        if (depth > maxEmbed) maxEmbed = depth
      }
    }
    // Lifting by maxEmbed puts the hub back at terrainH + wheelRadius — the wheel resting ON the surface.
    if (maxEmbed > 2 * params.wheelRadius) {
      vehicleState.position.y += maxEmbed
      vehicleState.velocity.y  = 0
      base.fill(null)   // the hubs moved — Step 1's answers no longer describe them
    }
  }

  // ── Step 1.5: Push authoritative state into the engine body ────────────────
  // vehicleState is the single source of truth every other system (and every
  // external mutation — teleport, spawn reseat, lab staging, the Step 1 failsafe
  // above) writes to. Pushing it into the engine at the top of every step makes
  // those hard-sets Just Work with no dirty-flag plumbing; the engine step below
  // then advances from exactly this state and Step 3e pulls the result back.
  engine.setTransform(chassis, vehicleState.position, vehicleState.quaternion)
  engine.setVelocity(chassis, vehicleState.velocity, vehicleState.angularVelocity)

  // ── Step 2: Body-space axes (module scratch — valid for this step only) ────
  const forward = _forward.set(0, 0, -1).applyQuaternion(vehicleState.quaternion)
  const right   = _right.set(1, 0, 0).applyQuaternion(vehicleState.quaternion)
  const up      = _up.set(0, 1, 0).applyQuaternion(vehicleState.quaternion)

  // ── Step 2.1: Drivetrain (FEAT-23) ─────────────────────────────────────────
  // Engine → torque converter → automatic gearbox → final drive, stepped ONCE per physics step from
  // the start-of-step rear-axle ω (consistent with the operator-splitting the ω integrator already
  // uses). Writes params._driveTorque[4]; getDriveTorque (grounded + airborne branches) reads it.
  // vForward is the CG longitudinal speed (velocity · forward), which decides forward-vs-reverse.
  const vForward = vehicleState.velocity.x * forward.x +
                   vehicleState.velocity.y * forward.y +
                   vehicleState.velocity.z * forward.z
  // FEAT-159: the traction assists (src/traction.js) trim the drive pedal — t.cap, which stepDrivetrain
  // reads — and brake a spinning rear (t.p, getBrakeTorque), from the start-of-step sensors: one loop of
  // lag, like ABS. The drive pedal is W, or S while the automatic is in reverse.
  if (vehicleState.traction) {
    const drive = params.transmissionType !== 'manual' && autoReverse(vehicleState, vForward) ? vehicleState.brake : (vehicleState.throttle || 0)
    const v = vehicleState.velocity, w = vehicleState.angularVelocity
    stepTraction(vehicleState.traction, drive, vehicleState, vForward, v.x * right.x + v.y * right.y + v.z * right.z,
      w.x * up.x + w.y * up.y + w.z * up.z, params, dt)
  }
  stepDrivetrain(vehicleState, params, dt, vForward)
  stepFuel(vehicleState, params, dt)   // FEAT-50: burns off the pedal + rpm the drivetrain just used
  // ABS samples the wheel speeds as they stand at the start of the step — one loop of sensor lag.
  if (vehicleState.abs) stepAbs(vehicleState.abs, vehicleState.brake || 0, vehicleState.wheelOmega, vehicleState.velocity, forward, params, dt)

  // ── Step 2.5: Suspension substep loop (Phase 4.1) ──────────────────────────────────────────
  // Integrates strutComp/strutCompVel at dt/N substeps. Writes:
  //   params._tireFz[i]         — strut-axis tire-spring Fz per corner (fed to Pacejka per D-06b)
  //   params._suspForceAccum[i] — averaged suspension force on body per corner (applied along body_up below)
  //   params._hubNormalXZ[i]    — X/Z residual contact normal force per corner (applied in Step 2.6 below)
  // Must run BEFORE Step 3 so Pacejka reads the post-substep tire Fz (D-08).
  stepSuspensionSubsteps(vehicleState, params, dt, qcPlus)
  for (let i = 0; i < 4; i++) if (rockSpin[i]) vehicleState.wheelOmega[i] += rockSpin[i]   // FEAT-158: what rock faces did to the spin

  // ── Step 2.6: Apply XZ contact normal forces to body (Phase 4.1 D-06a) ─────────────────────
  // _hubNormalXZ[i] is the X/Z residual of tire contact normal force — the component of contact
  // normal that is NOT along the strut axis. On flat ground (body upright) this is exactly (0,0,0).
  // On a slope, this residual pushes the body horizontally, causing the car to slide downhill.
  // Applied AFTER substep loop but BEFORE the Pacejka Step 3 loop.
  //
  // Phase 4.1 D-06 architecture:
  //   - Strut-axis component of contact normal → spring pathway (_suspForceAccum) → body via Step 3
  //   - X/Z residual → _hubNormalXZ → direct body force + torque here
  //   On flat ground: _hubNormalXZ[i] = (0,0,0) exactly — legacy m4-02/04/05/06 assertions unaffected.
  //
  // NOTE: torque arm uses hub world position as approximation for contact patch (D-06a resolution).
  // The ~0.37 m offset along the contact normal (hub to actual contact patch) contributes a small
  // torque-arm error acceptable for body forces; a future phase may add _hubContactPoint accumulator
  // for higher accuracy.
  //
  // Gravity is the ENGINE's (world gravity acts on the chassis body) — starting the Step 3
  // accumulators at zero instead of −mg is the cutover's one-source rule.
  const totalForce  = new THREE.Vector3()
  const totalTorque = new THREE.Vector3()
  let totalGroundFn = 0  // accumulated normal force across all wheel contacts; gates rolling resistance
  // Post-substep hub per wheel: Step 2.6 and Step 3 both need it and nothing between them moves
  // the body or the struts, so whichever asks first computes it.
  const hubPost = _hubPost.fill(null)
  if (params._hubNormalXZ) {
    for (let i = 0; i < 4; i++) {
      const xz = params._hubNormalXZ[i]
      if (!xz || (xz.x === 0 && xz.y === 0 && xz.z === 0)) continue
      // Hub world position for torque arm (approximation per D-06a); torque = rHub × F_xz.
      const hub_i  = hubPost[i] = getWheelPosition(i, vehicleState, params)
      const rHubX  = hub_i.x - vehicleState.position.x
      const rHubY  = hub_i.y - vehicleState.position.y
      const rHubZ  = hub_i.z - vehicleState.position.z
      totalForce.x  += xz.x
      totalForce.y  += xz.y
      totalForce.z  += xz.z
      totalTorque.x += rHubY * xz.z - rHubZ * xz.y
      totalTorque.y += rHubZ * xz.x - rHubX * xz.z
      totalTorque.z += rHubX * xz.y - rHubY * xz.x
      // BUG-89: a tire with NO strut load is touching with its sidewall — the truck on its side or
      // roof. Step 3 reads it as airborne (no Pacejka), so this whole contact load used to be
      // frictionless: on its side the down-side tires carried ~60 % of the weight and the truck skated
      // (15 m/s → 245 m). Rubber scrubs: Coulomb μN against the hub's sliding, μ the tire's own.
      // Regularised below SIDEWALL_V_REG so it holds at rest instead of chattering. A loaded strut
      // (any upright truck, slopes included) never takes this branch — Pacejka owns that tire.
      // ponytail: the support is taken as static; a sidewall on a moving rock scrubs against the world.
      if ((params._tireFz[i] || 0) <= 0) {
        const N = Math.hypot(xz.x, xz.y, xz.z), nx = xz.x / N, ny = xz.y / N, nz = xz.z / N
        const w = vehicleState.angularVelocity, v = vehicleState.velocity
        let vx = v.x + w.y * rHubZ - w.z * rHubY
        let vy = v.y + w.z * rHubX - w.x * rHubZ
        let vz = v.z + w.x * rHubY - w.y * rHubX
        const vn = vx * nx + vy * ny + vz * nz
        vx -= vn * nx; vy -= vn * ny; vz -= vn * nz
        const k = -(params.frictionCoeff ?? 1) * (params._tireMuScale?.[i] ?? 1) * N
                / Math.max(Math.hypot(vx, vy, vz), SIDEWALL_V_REG)
        const fx = vx * k, fy = vy * k, fz = vz * k
        totalForce.x += fx; totalForce.y += fy; totalForce.z += fz
        totalTorque.x += rHubY * fz - rHubZ * fy
        totalTorque.y += rHubZ * fx - rHubX * fz
        totalTorque.z += rHubX * fy - rHubY * fx
      }
    }
  }

  // ── Step 3: Per-wheel force accumulation ──────────────────────────────────
  // BUG-20: friction-circle break-away limit on the stored slip (in Pacejka-ARGUMENT space × vRef,
  // so it auto-scales with tireSlipVelRef). Shared by the force block and the ω integrator.
  const sBreak = (params.tireBreakawaySlip || 0.18) * (params.tireSlipVelRef || 1.0)
  for (let i = 0; i < 4; i++) {
    // Phase 4: write per-wheel fz from substep result FIRST (D-12), then airborne check (D-14).
    // Zero wheelDebug for this wheel before contacts — ensures no stale values when wheel is off-ground.
    // The fz field is written from _tireFz (computed by stepSuspensionSubsteps above). Reset IN
    // PLACE, every field including the grounded-only vLong/vLat, in one fixed key order.
    if (vehicleState.wheelDebug) {
      const d = vehicleState.wheelDebug[i] ?? (vehicleState.wheelDebug[i] = {})
      d.fn = 0; d.fy = 0; d.sa = 0; d.c = 0; d.omega = 0
      d.fz = params._tireFz[i] || 0
      d.strutComp = vehicleState.strutComp?.[i] ?? 0
      d.vLong = 0; d.vLat = 0
    }

    // Phase 4: airborne check (D-14). If tire-spring force is zero or negative, this wheel is
    // airborne: no contacts, no Pacejka — stepAirborneWheel revs it on drive/brake alone.
    const isAirborne = (params._tireFz[i] || 0) <= 0

    // Phase 4: compute rMount (rotated body mount point offset) for suspension body force torque.
    // The same mount stepSuspensionSubsteps and getWheelPosition use (BUG-05: mountLocal).
    const rMount = params._rotateVector(mountLocal(i, params))

    // Phase 4.1: apply suspension spring force to body along strut axis (body_up direction).
    // Replaces the Phase 4 world-Y force vector — on a pitched body, the strut axis is NOT world-Y.
    // Applied regardless of airborne state: suspension spring still acts on body even when wheel lifts.
    // (When airborne, suspForce may be small/negative but damping still contributes, per D-15.)
    const suspBodyForce = up.clone().multiplyScalar(params._suspForceAccum[i])
    totalForce.add(suspBodyForce)
    totalTorque.add(new THREE.Vector3().crossVectors(rMount, suspBodyForce))

    // Hub world position (sphere center for contact queries)
    const hub  = hubPost[i] ?? getWheelPosition(i, vehicleState, params)
    const rHub = new THREE.Vector3(
      hub.x - vehicleState.position.x,
      hub.y - vehicleState.position.y,
      hub.z - vehicleState.position.z
    )

    // Hub velocity — used for tire slip angles
    const hubVel = vehicleState.velocity.clone().add(
      new THREE.Vector3().crossVectors(vehicleState.angularVelocity, rHub)
    )

    // Wheel-frame axes (steered for front wheels)
    const steerInput = (i < 2 && vehicleState.wheelSteerAngles)
      ? vehicleState.wheelSteerAngles[i]
      : (i < 2 ? vehicleState.steerAngle : 0)
    // Static toe rides on top of the steer angle (rear wheels get it too, from toeRear).
    const steer = steerInput + toeOffset(i, params)
    const steerQ     = _steerQ.setFromAxisAngle(up, steer)
    const wheelFwd   = _wheelFwd.copy(forward).applyQuaternion(steerQ)
    const wheelRight = _wheelRight.copy(right).applyQuaternion(steerQ)
    // Static camber tilts the whole wheel about its own forward axis, so the lateral (axle)
    // axis tilts with it. Grip then has a small vertical component — the jacking force real
    // cambered wheels generate. Body roll is already in `right`/`up` (body axes), so the lean
    // this builds is the wheel's attitude relative to the WORLD, not just to the chassis.
    const lean = camberLean(i, params)
    if (lean !== 0) wheelRight.applyAxisAngle(wheelFwd, lean)

    // Hub velocity in the wheel frame. Grounded on a dynamic body, these become RELATIVE to it
    // (below); airborne, longVel is what decides the S-key brake-vs-reverse split (R-08).
    let latVel  = hubVel.dot(wheelRight)
    let longVel = hubVel.dot(wheelFwd)

    // Airborne skip (D-14): no contacts, no Pacejka, no Newton — the wheel's ω and slip state are
    // stepped on their own and the loop moves on.
    if (isAirborne) {
      stepAirborneWheel(i, vehicleState, params, dt, longVel)
      continue
    }

    // Slip-velocity tire model with relaxation length (see tire.js header).
    // Per-tire state: vehicleState.slipLong[i], slipLat[i] — the "filtered" slip
    // displacements (m), evolved per-step via implicit Euler on ds/dt = v_slip − s·|v|/L.
    // makeVehicleState carries them; the lazy-init is for gates that hand-build a state.
    if (!vehicleState.slipLong) vehicleState.slipLong = [0, 0, 0, 0]
    if (!vehicleState.slipLat)  vehicleState.slipLat  = [0, 0, 0, 0]

    // Per-step bookkeeping for the ω integrator (Newton-iterated implicit Euler below), set by the
    // grounded block — a wheel without a support never reaches the integrator.
    let lastFn          = 0
    let lastSLongPrev   = 0   // sLong_old at this step's start (for Newton re-eval of s)
    let lastSLatNew     = 0   // sLat already committed (lateral doesn't iterate with ω)
    let lastLongVelCur  = 0
    let lastRelaxDen    = 1

    // Query every surface this wheel sphere overlaps (footprint=true: tire-envelope ground sampling).
    // qcPlus = analytic terrain/props/walls ∪ engine dynamic debris (FEAT-48 translation layer).
    // Same out-of-round radius the suspension contact query uses (params.wheelRunout) — the
    // Pacejka patch has to sit on the same tire surface the vertical spring is loading.
    const contacts = qcPlus(hub.x, hub.y, hub.z, effectiveWheelRadius(i, vehicleState, params), true, i)

    // BUG-38: the Pacejka tire is a per-WHEEL model with ONE slip state, so its friction must be
    // evaluated ONCE per wheel — NOT once per contact. Pick the support surface (normal most aligned
    // with world-up) as the tire patch. Wall / prop / ramp contacts already contributed their push-out
    // via _hubNormalXZ (stepSuspensionSubsteps) and must NOT each re-apply Pacejka grip — doing so
    // double-counted lateral + longitudinal force whenever a wheel straddled ground + a hard obstacle.
    // Fn (_tireFz[i]) is the SUMMED strut-axis load and is already ground-dominated: a wall's near-
    // horizontal normal projects ≈0 onto the strut axis, so it adds ~nothing to the tire's vertical load.
    // FEAT-158: never a ROCK — every debris contact grips the tire in the substeps instead
    // (rockGrip, Step 0.5), so this patch rides on the road and terrain only. Stepped once per
    // 1/60 s, on a rock it was frictionless through the substeps that rolled the rock out from under
    // the tire, then explicit on a body as light as a kilogram at the contact.
    let ground = null
    let bestUp = -Infinity
    for (const c of contacts) {
      if (c.body == null && c.normal.y > bestUp) { bestUp = c.normal.y; ground = c }
    }

    // Phase 4: Fn for Pacejka comes from params._tireFz[i] (computed by stepSuspensionSubsteps, per
    // D-03); computeNormalForce reads it back. Body normal force is applied via
    // suspBodyForce above, NOT here. totalGroundFn (rolling-resistance gating) is accrued once per wheel.
    const Fn = computeNormalForce(i, vehicleState, params)
    if (ground && Fn > 0) {
      totalGroundFn += Fn

      const rContact = new THREE.Vector3(
        ground.contactPoint.x - vehicleState.position.x,
        ground.contactPoint.y - vehicleState.position.y,
        ground.contactPoint.z - vehicleState.position.z
      )

      // Phase 4.1 NOTE (D-06): do NOT add Fn*normal to totalForce here.
      // The strut-axis component of the contact normal flows through _suspForceAccum (spring pathway),
      // applied above via suspBodyForce = up * _suspForceAccum[i] along body_up.
      // The X/Z residual (off-axis component) flows through _hubNormalXZ, applied in Step 2.6 above.
      // This clean split ensures: on flat ground _hubNormalXZ[i] = (0,0,0) exactly →
      // existing m4-02/04/05/06 assertions remain unaffected by the Phase 4.1 changes.

      // Tire forces — slip-velocity Pacejka with relaxation length per tire.
      // The relaxation length L models tire carcass viscoelastic dynamics: the carcass
      // takes a characteristic distance L of vehicle travel to build up to its target
      // force. Implicit Euler on  ds/dt = v_slip − s·|v|/L  is unconditionally stable
      // and reduces effective stiffness dF/dω to the point where Newton-iterated implicit
      // Euler on the ω integrator (below) converges in 1-3 iterations at 60Hz.
      //
      // sLat is finalized here (depends on body lateral velocity, not on ω_new).
      // sLong is computed here at the current ω (for body-force application this step) but
      // re-evaluated and re-committed inside the ω Newton loop using the converged ω_new
      // — this is operator splitting: body force lags ω by one step, acceptable trade for
      // a clean Newton on ω alone.
      const longVelCur = longVel || 0
      const latVelCur  = latVel  || 0
      const omegaCur   = (vehicleState.wheelOmega?.[i] ?? 0) * params.wheelRadius
      const vCon       = Math.max(Math.abs(omegaCur), Math.abs(longVelCur), SLIP_EPSILON)
      const L          = params.tireRelaxationLength || 0.3
      const relaxDen   = 1 + dt * vCon / L
      const sLongPrev  = vehicleState.slipLong[i]
      let   sLatNew    = (vehicleState.slipLat[i] + dt * latVelCur) / relaxDen
      let   sLongCur   = (sLongPrev + dt * (omegaCur - longVelCur)) / relaxDen
      // BUG-20 friction-circle break-away clamp. The carcass stores deflection up to the static-
      // friction limit, then it slides. This gives honest static friction — the relaxation spring holds
      // up to ≈μ·Fn at rest so the car rests on any slope below atan(μ) — and bounds the stored
      // deflection so it can't blow up at low speed (the job the old 3.0 m/s SLIP_EPSILON floor did).
      // Clamping the COMBINED magnitude is the friction circle: longitudinal and lateral grip trade
      // against one shared limit. Replaces the old lateral steady-state (sLatSS) anti-slosh clamp.
      // The limit is expressed in Pacejka-ARGUMENT space (x = s/vRef ≈ slip-curve position), so
      // tireBreakawaySlip pins the break-away to a fixed point on the grip curve (≈ the peak) and the
      // actual displacement limit auto-scales with vRef. That keeps the break-away AT the peak as the
      // L/vRef "sloshiness" pair is retuned — otherwise a smaller vRef would push the clamp past the
      // peak into the unstable post-peak region and the static hold would creep on steep slopes.
      const sMag   = Math.hypot(sLongCur, sLatNew)
      if (sMag > sBreak) { const k = sBreak / sMag; sLongCur *= k; sLatNew *= k }
      vehicleState.slipLat[i] = sLatNew

      // SM-3 per-tire friction: params._tireMuScale[i] is published by src/damage.js (tire wear),
      // and is the same hook FEAT-38's per-surface μ will multiply into. Absent → 1, no change.
      const muScale = params._tireMuScale?.[i] ?? 1
      // FEAT-158: the road patch carries the road's load — what a rock carried is that rock's
      // (rockGrip, Step 0.5), so a tire climbing a rock is not held at road speed by a full wheel
      // load the road no longer has. No rock, exactly Fn.
      const FnRoad = Math.max(0, Fn - rockLoad[i])
      const { Flong, Flat } = computeTireForces(sLongCur, sLatNew, FnRoad, params, muScale)

      // SM-3 honest wear signals for this wheel, published for src/damage.js to integrate.
      // slipVel is the RAW contact-patch sliding speed (not the relaxation-filtered displacement) —
      // abrasion is driven by how fast the rubber is actually sliding over the ground.
      if (vehicleState.slipVel)  vehicleState.slipVel[i]  = Math.hypot(omegaCur - longVelCur, latVelCur)
      if (vehicleState.tireFlat) vehicleState.tireFlat[i] = Math.abs(Flat)

      // Save state for Newton iteration in ω integrator (re-evaluates sLong and F at ω_new).
      lastFn         = FnRoad
      lastSLongPrev  = sLongPrev
      lastSLatNew    = sLatNew
      lastLongVelCur = longVelCur
      lastRelaxDen   = relaxDen
      // REVERTED 2026-08-15 (owner): ω responds to RELATIVE slip on debris again — the
      // road-frame anchor was a containment measure from the discontinuous-depth era, when
      // force spikes launched rocks and the implicit solve chased them to 60–80 rad/s. With
      // exact manifolds the spikes are gone — honest wheel response, and the slip itself is
      // unclamped (see the groundVel note above).

      const wheelForce = wheelFwd.clone().multiplyScalar(Flong)
      // WR-02: lateral grip opposes lateral hub velocity (resists the slide), so positive Flat
      // from computeTireForces(positive slipVy) must be applied along -wheelRight.
      wheelForce.addScaledVector(wheelRight, -Flat)
      // Camber thrust: a leaning tire steers itself toward the lean, at roughly a tenth of its
      // cornering stiffness (camberThrustCoeff is that stiffness as a multiple of Fn per radian).
      // Straight-line it cancels left against right; in a corner the loaded outside wheel wins,
      // which is why negative camber pays off only once weight has transferred.
      if (lean !== 0) {
        wheelForce.addScaledVector(wheelRight, (params.camberThrustCoeff || 0) * Fn * lean)
      }
      totalForce.add(wheelForce)
      totalTorque.add(new THREE.Vector3().crossVectors(rContact, wheelForce))

      // Write debug data for logger — evaluated once per wheel against the chosen support surface (BUG-38).
      // NOTE: `sa` field now stores SLIP VELOCITY magnitude (m/s) instead of slip angle (rad).
      // Field name kept for log format stability; semantics document in GLOSSARY.
      if (vehicleState.wheelDebug) {
        vehicleState.wheelDebug[i].fn    = Fn
        vehicleState.wheelDebug[i].fy    = Flat
        vehicleState.wheelDebug[i].sa    = Math.hypot(sLongCur, sLatNew)
        vehicleState.wheelDebug[i].c     = ground.depth
        vehicleState.wheelDebug[i].vLong = omegaCur - longVelCur
        vehicleState.wheelDebug[i].vLat  = latVelCur
      }
    } else {
      // Loaded during the substeps but no support under the post-substep hub: the wheel lifted off
      // inside this step (a crest, a take-off). It is airborne for the rest of the step — ω on
      // drive/brake alone, slip relaxing, wear signals zero (review-2 R-03: this used to fall into
      // the Newton solve with no load, which froze ω and stored a phantom dt·ω·r slip).
      stepAirborneWheel(i, vehicleState, params, dt, longVel)
      continue
    }

    // Omega integrator — Newton-iterated implicit Euler. Runs once per wheel per step,
    // OUTSIDE the contacts loop (CR-03). Re-evaluates sLong(ω) and F_long(sLong) at each
    // Newton iteration so the iteration captures Pacejka saturation past peak — critical
    // for clean launch from rest, where a single linearized step would overshoot.
    //
    // The implicit equation we're solving for ω_new:
    //   ω_new = ω + dt/I · (T_drive − F_long(sLong_new(ω_new))·r − T_brake_signed)
    // where sLong_new(ω) = (sLong_old + dt·(ω·r − v_long)) / (1 + dt·|v_contact|/L)
    //
    // Newton converges in 1-3 iterations at 60Hz; the loop caps at 4 with a tight residual
    // tolerance. Only a grounded wheel (lastFn > 0) gets here; airborne ones took stepAirborneWheel.
    {
      // FEAT-126: a manual with its clutch LOCKED drags the engine's inertia through the gearbox —
      // published per rear wheel by stepManual (Je·(gear·final)²/2, ~17 kg·m² each in 1st vs the wheel's
      // own 1.22). Absent/0 for the automatic, whose converter decouples the engine.
      const wheelInertia = (params.wheelInertia || 1.22) + (i >= 2 ? (params._drivenInertia ?? 0) : 0)
      const driveTorque  = getDriveTorque(i, vehicleState, params)
      const brakeTorque  = getBrakeTorque(i, vehicleState, params, lastLongVelCur)
      if (vehicleState.brakeTorque) vehicleState.brakeTorque[i] = brakeTorque
      const dsdo         = dt * params.wheelRadius / lastRelaxDen  // ∂sLong_new/∂ω_new
      const omega0       = vehicleState.wheelOmega?.[i] ?? 0
      const spinSign     = omega0 >= 0 ? 1 : -1
      const brakeSigned  = brakeTorque * spinSign

      // BUG-20: friction-circle limit, the same sBreak as the force block. Lateral leg is fixed here
      // (lastSLatNew), so the longitudinal leg gets the remaining room on the circle.
      const sLongMax  = Math.sqrt(Math.max(0, sBreak * sBreak - lastSLatNew * lastSLatNew))
      let omegaNew = omega0
      let sLongFinal = lastSLongPrev
      let lastDelta = 0
      for (let iter = 0; iter < 4; iter++) {
        const omegaR    = omegaNew * params.wheelRadius
        let   sLongIter = (lastSLongPrev + dt * (omegaR - lastLongVelCur)) / lastRelaxDen
        if (sLongIter >  sLongMax) sLongIter =  sLongMax
        if (sLongIter < -sLongMax) sLongIter = -sLongMax
        sLongFinal = sLongIter
        const { Flong, dFmagDs } = computeTireForces(sLongIter, lastSLatNew, lastFn, params, params._tireMuScale?.[i] ?? 1)
        const g  = omegaNew - omega0 - dt / wheelInertia * (driveTorque - Flong * params.wheelRadius - brakeSigned)
        // g'(ω) = 1 + dt·r/I · dF/dω,  with dF/dω = dFmagDs · dsdo
        const gp = 1 + dt * params.wheelRadius * dFmagDs * dsdo / wheelInertia
        const delta = g / gp
        omegaNew -= delta
        lastDelta = delta
        if (Math.abs(delta) < 1e-4) break
      }
      // CONVERGENCE SAFEGUARD (2026-08-15, capture 1786777538787): under a heavily loaded
      // near-stationary wheel the 4-iteration Newton can leave a LARGE residual (post-peak
      // Pacejka slope flips g′ and the iteration overshoots) — the committed ω then swung
      // −20…−60 rad/s frame to frame ("low-speed tire slosh" family, newly excited by debris).
      // A first attempt at an explicit-Euler fallback formed its own two-frame limit cycle
      // (±10 → ±25, growing) — explicit stepping is UNSTABLE at this contact stiffness by
      // construction. When Newton fails, commit the PHYSICAL fixed point instead: a gripping,
      // heavily loaded wheel rolls — ω anchors to the contact's longitudinal velocity plus the
      // one-step torque nudge. Bounded, cycle-free, and the next frame retries Newton from a
      // consistent state. Converged solves (normal driving, 1–3 iterations) are untouched.
      // Written as !(≤) so a NaN residual (gp exactly 0 → ±Infinity → NaN) also takes the fallback.
      if (!(Math.abs(lastDelta) <= NEWTON_TOL)) {
        omegaNew = lastLongVelCur / params.wheelRadius +
          dt / wheelInertia * (driveTorque - brakeSigned)
        sLongFinal = Math.max(-sLongMax, Math.min(sLongMax,
          (lastSLongPrev + dt * (omegaNew * params.wheelRadius - lastLongVelCur)) / lastRelaxDen))
      }
      // Clamp: braking cannot reverse spin direction (brake stops the wheel, doesn't push through zero).
      // Must happen BEFORE committing sLong — if omega is clamped to 0 the Newton loop may have
      // diverged to a large unphysical omegaNew (wrong sign), so sLongFinal would be based on that
      // wrong omega. Re-evaluate sLong at the ACTUAL committed omega (0 when clamped) so the
      // slip state stays consistent with the wheel speed. Inconsistent sLong would generate a force
      // in the wrong direction on the next step (accelerating backward instead of braking).
      // FEAT-162: a collapsed wheel's hub can't turn — the folded rim jams it and reacts any torque, so
      // the corner slides at ω = 0 like a locked brake (its sliding grip is damage.js wheelCollapseMu).
      if (params._wheelCollapseR?.[i] || (brakeTorque > 0 && Math.sign(omegaNew) !== spinSign)) {
        vehicleState.wheelOmega[i] = 0
        // Recompute sLong at omega=0 so slip state matches actual wheel speed.
        sLongFinal = (lastSLongPrev + dt * (0 - lastLongVelCur)) / lastRelaxDen
        if (sLongFinal >  sLongMax) sLongFinal =  sLongMax
        if (sLongFinal < -sLongMax) sLongFinal = -sLongMax
      } else {
        vehicleState.wheelOmega[i] = omegaNew
      }

      // Commit sLong after clamp so the stored value is consistent with the actual committed omega.
      vehicleState.slipLong[i] = sLongFinal
    }

    // Update omega debug field — airborne wheels still log their evolving omega (CR-03)
    if (vehicleState.wheelDebug) {
      vehicleState.wheelDebug[i].omega = vehicleState.wheelOmega[i]
    }
  }

  // ── Step 3-runout: integrate the tire spin phase ──
  // wheelPhase is THE wheel spin angle: it sets the out-of-round contact radius here AND rotates
  // the wheel MESH in vehicle-model.js, whose tire carcass has the same runout baked in. Those two
  // must share ONE integrator or the visible high spot drifts out of phase with the hop you feel.
  // Integrated at the FIXED physics step and wrapped to [0, 2π) so it stays exact after long
  // drives; the mesh rotation is 2π-periodic, so the wrap is invisible.
  {
    if (!vehicleState.wheelPhase) vehicleState.wheelPhase = [0, 0, 0, 0]
    const TWO_PI = Math.PI * 2
    for (let i = 0; i < 4; i++) {
      const ph = vehicleState.wheelPhase[i] + (vehicleState.wheelOmega?.[i] ?? 0) * dt
      vehicleState.wheelPhase[i] = ph - TWO_PI * Math.floor(ph / TWO_PI)
    }
  }

  // ── Step 3a: Rolling resistance — horizontal velocity-aligned drag scaled by ground load ──
  // Standard tire model: F_drag = -Cr · Σ Fn · v̂_horizontal. Vertical (Fn) carries the load,
  // so scaling by Σ Fn means the drag vanishes when airborne and matches static weight on flat ground.
  // 0.05 m/s deadband prevents creep oscillation at standstill.
  {
    const Cr = params.rollingResistanceCoeff || 0
    if (Cr > 0 && totalGroundFn > 0) {
      const vx = vehicleState.velocity.x
      const vz = vehicleState.velocity.z
      const vHoriz = Math.sqrt(vx * vx + vz * vz)
      if (vHoriz > 0.05) {
        const dragMag = Cr * totalGroundFn
        totalForce.x -= dragMag * vx / vHoriz
        totalForce.z -= dragMag * vz / vHoriz
      }
    }
  }

  // ── Step 3a-aero: Quadratic aerodynamic drag (FEAT-23) ─────────────────────
  // F_aero = -½·ρ·(Cd·A)·|v|·v on the horizontal velocity. Without it the geared drivetrain would
  // keep accelerating to an unrealistic top speed (rolling resistance alone is near-constant); this
  // is what settles top-gear cruise at a believable terminal speed. Applies in air too (body drag).
  // aeroDragArea is the lumped Cd·A [m²]; 0 disables. ρ ≈ 1.225 kg/m³ (sea-level air) folded into ½ρ.
  {
    const CdA = params.aeroDragArea || 0
    if (CdA > 0) {
      const HALF_RHO = 0.6125   // ½ · 1.225 kg/m³
      const vx = vehicleState.velocity.x
      const vz = vehicleState.velocity.z
      const vHoriz = Math.sqrt(vx * vx + vz * vz)
      if (vHoriz > 0.1) {
        const dragMag = HALF_RHO * CdA * vHoriz * vHoriz
        totalForce.x -= dragMag * vx / vHoriz
        totalForce.z -= dragMag * vz / vHoriz
      }
    }
  }

  // ── Step 3b: Hand the accumulated forces to the engine and step the world ──
  // FEAT-48 cutover: the semi-implicit Euler velocity integration, the BUG-27
  // accumulated-impulse body-contact solver, and the Step 4/5 position+quaternion
  // integration are all the ENGINE's job now (with full-tensor world-frame
  // inertia and gyroscopic terms the old world-diagonal integrator lacked).
  // totalForce/totalTorque are about the CG — the body origin — so center
  // application is exact. The engine also advances every debris body here:
  // ONE world step per physics tick, chassis↔debris↔terrain solved together.
  seatWheelCores(engine, chassis, vehicleState, params)   // the rims ride the hubs (BUG-99)
  // BUG-99: what the tire pushed into each debris body this step, as one impulse (see Step 0.5).
  for (const [body, p] of proxies) {
    for (let k = 0; k < p.pushes.length; k += 2) engine.applyImpulse(body, p.pushes[k], p.pushes[k + 1])
  }
  engine.applyForce(chassis, totalForce)
  const jt = vehicleState.jackTorque   // FEAT-138: the hi-lift's roll heave (src/hilift.js), null when idle
  if (jt) { totalTorque.x += jt.x; totalTorque.y += jt.y; totalTorque.z += jt.z }
  engine.applyTorque(chassis, totalTorque)
  // 8 substeps (not the engine-default 4): the chassis carries the TUNED inertia, whose x-axis
  // value sits ~3× below the hull-natural tensor, and the soft-step solver converts some of a
  // flat bare-frame slam into rocking rebound when under-substepped. 8 halves that phantom
  // bounce (measured: e_eff 0.30 → 0.21 on a worst-case flat slam) and costs microseconds at
  // this body count. See test/body-contact-energy.mjs for the measured envelope.
  engine.step(dt, ENGINE_SUBSTEPS)
  readWheelCores(engine, chassis, vehicleState, params)   // what rocks did to the rims (BUG-99)

  // ── Step 3e: Pull the engine result back into the authoritative JS mirror ──
  engine.getTransform(chassis, vehicleState.position, vehicleState.quaternion)
  engine.getVelocity(chassis, vehicleState.velocity, vehicleState.angularVelocity)
  vehicleState.quaternion.normalize()
}

/**
 * ω and slip for a wheel with no road reaction this step: off the ground at the start of the step
 * (_tireFz ≤ 0, D-14), or loaded during the substeps but with no support under the post-substep hub
 * (it lifted off inside the step — review-2 R-03). Drive and brake act on the bare wheel inertia —
 * an explicit Euler step, since there is no contact stiffness to go unstable on. The stored carcass
 * deflection relaxes with no slip input: the grounded relaxation update with the contact velocity
 * taken out, rolling at the wheel's own speed — so a take-off does not land on its old deflection.
 */
function stepAirborneWheel (i, vehicleState, params, dt, longVel) {
  const wheelInertia = (params.wheelInertia || 1.22) + (i >= 2 ? (params._drivenInertia ?? 0) : 0)   // FEAT-126, see the grounded solve
  const driveTorque  = getDriveTorque(i, vehicleState, params)
  const brakeTorque  = getBrakeTorque(i, vehicleState, params, longVel)
  if (vehicleState.brakeTorque) vehicleState.brakeTorque[i] = brakeTorque
  if (vehicleState.slipVel)  vehicleState.slipVel[i]  = 0   // airborne: no contact, no abrasion
  if (vehicleState.tireFlat) vehicleState.tireFlat[i] = 0
  const omega0      = vehicleState.wheelOmega?.[i] ?? 0
  const spinSign    = omega0 >= 0 ? 1 : -1
  const brakeSigned = brakeTorque * spinSign
  const omegaNew    = omega0 + (dt / wheelInertia) * (driveTorque - brakeSigned)
  // Braking cannot reverse spin direction: the brake stops the wheel, it does not push through zero.
  // FEAT-162: a collapsed wheel's hub can't turn, in the air as on the ground.
  vehicleState.wheelOmega[i] = params._wheelCollapseR?.[i] || (brakeTorque > 0 && Math.sign(omegaNew) !== spinSign) ? 0 : omegaNew
  if (vehicleState.slipLong && vehicleState.slipLat) {
    const vCon = Math.max(Math.abs(omega0 * params.wheelRadius), SLIP_EPSILON)
    const relaxDen = 1 + dt * vCon / (params.tireRelaxationLength || 0.3)
    vehicleState.slipLong[i] /= relaxDen
    vehicleState.slipLat[i]  /= relaxDen
  }
  // CR-03: every wheel logs its ω every step, airborne ones included.
  if (vehicleState.wheelDebug) vehicleState.wheelDebug[i].omega = vehicleState.wheelOmega[i]
}

// BUG-20: numeric floor only (keeps the relaxation denominator well-conditioned near rest).
// Was 3.0 m/s — that large floor forced the stored slip displacement to bleed toward zero
// below ~3 m/s, so the carcass spring could not hold at rest (no static friction: a braked
// car ran away downhill) and the tire felt slippery under ~11 km/h. The blow-up at rest that
// the old floor guarded against is now bounded by the friction-circle break-away clamp on
// |(sLong,sLat)| (sBreak) — the physically correct limiter.
const SLIP_EPSILON = 0.05

// Per-step scratch (stepPhysics only; nothing holds them past the step): body axes, the per-wheel
// steered frame, and the post-substep hubs.
const _forward = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3()
const _steerQ = new THREE.Quaternion(), _wheelFwd = new THREE.Vector3(), _wheelRight = new THREE.Vector3()
const _axle = [0, 1, 2, 3].map(() => new THREE.Vector3()), _bodyY = new THREE.Vector3(0, 1, 0)   // FEAT-70: the wheels' spin axles (Step 1)
const _hubPost = [null, null, null, null]

const NEWTON_TOL = 0.5                      // rad/s — ω-solve residual above this = diverged, commit the rolling fixed point instead
const _queryCount = [0, 0, 0, 0]           // qcPlus calls per corner, reset each step (BUG-99)
const _rockSpin = [0, 0, 0, 0]             // rad/s — rock-face grip's change to each wheel's spin this step (FEAT-158)
const _rockLoad = [0, 0, 0, 0]             // N — strut-axis load rocks carried this step (FEAT-158)
const _gripAx = new THREE.Vector3(), _gripF = new THREE.Vector3(), _gripV = { x: 0, y: 0, z: 0 }   // rockGrip scratch

/** BUG-99 rock proxy: an impulse j at offset r from the centre of mass changes velocity by j/m and
 *  spin by I⁻¹(r × j). */
function proxyImpulse (p, jx, jy, jz, rx, ry, rz) {
  p.dv.x += jx / p.m; p.dv.y += jy / p.m; p.dv.z += jz / p.m
  const tx = ry * jz - rz * jy, ty = rz * jx - rx * jz, tz = rx * jy - ry * jx, I = p.invI
  p.dw.x += I[0] * tx + I[1] * ty + I[2] * tz
  p.dw.y += I[3] * tx + I[4] * ty + I[5] * tz
  p.dw.z += I[6] * tx + I[7] * ty + I[8] * tz
}

/** 1/m + (r × d)·I⁻¹(r × d): how hard it is to change the velocity of point r along d. */
function proxyInvMass (p, rx, ry, rz, dx, dy, dz) {
  const cx = ry * dz - rz * dy, cy = rz * dx - rx * dz, cz = rx * dy - ry * dx, I = p.invI
  return 1 / p.m + cx * (I[0] * cx + I[1] * cy + I[2] * cz) + cy * (I[3] * cx + I[4] * cy + I[5] * cz) +
    cz * (I[6] * cx + I[7] * cy + I[8] * cz)
}

/**
 * BUG-99 rock proxy: the ground it lies on — at each support point, no velocity change INTO the
 * ground, and Coulomb friction against sliding along it (|jt| ≤ μ·jn, the engine's mixed μ), as
 * impulses AT that point, so a base on the road makes a rock pushed high pivot instead of sinking
 * and a rock pressed into the road grips it instead of skating. Two passes of projected
 * Gauss–Seidel (accumulated sums per point, clamped) on the point's WHOLE velocity — the engine's
 * at the step's start plus this step's change (FEAT-158: solved on the change alone, a rock already
 * sliding under a 6 kN press kept sliding, because the engine's friction knows only its weight).
 * Each point's total goes to the ENGINE with the tire's pushes (2026-10-31): handed only the tire's
 * half, a 9 kg rock sandwiched under a 150 kN tire left the step at 280 m/s INTO the road, and the
 * engine's soft contact let it sink and then spat it out at 47 m/s (the --nopop census: a flip at
 * 25 mph, rocks to 282 m/s — hidden until pinch energy stopped popping those tires). The ground's
 * reaction is real; given both halves, the engine and the proxy step the same rock.
 * The FRICTION is owed to the same fix (2026-11-01): once the engine no longer sees the rock driven
 * into the road, its own friction holds only the rock's weight (μ·m·g), so a rock under a 10 kN tire
 * skated away as if weightless. Friction here was tried on 10-29 and rejected because it predicted
 * a pin the engine never got; now the engine gets it.
 */
function proxyGround (p, push = true) {
  const S = p.support, jn = p.jn, jt = p.jt, v = _pgV, R = p.sr, T = p.Th, D = p.D
  jn.fill(0); jt.fill(0)
  // Each support where the rock has carried it this step (small angle), and how far it has lifted
  // off the ground along n: a lifted point holds nothing until it would touch down within the substep.
  for (let k = 0; k < S.length; k++) {
    const s = S[k], o = 4 * k
    const dx = T.y * s.rz - T.z * s.ry, dy = T.z * s.rx - T.x * s.rz, dz = T.x * s.ry - T.y * s.rx
    R[o] = s.rx + dx; R[o + 1] = s.ry + dy; R[o + 2] = s.rz + dz
    R[o + 3] = Math.max(0, (D.x + dx) * s.nx + (D.y + dy) * s.ny + (D.z + dz) * s.nz) / p.sdt
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < S.length; k++) {
      const s = S[k], q = 4 * k, rx = R[q], ry = R[q + 1], rz = R[q + 2]
      proxyPointVel(p, rx, ry, rz, v)
      const vn = v.x * s.nx + v.y * s.ny + v.z * s.nz
      // Projected Gauss–Seidel: the point's accumulated push, clamped ≥ 0, may SHRINK when a later
      // point has already done its work — otherwise the sweep over-corrects and lifts the rock.
      const jNew = Math.max(0, jn[k] - (vn + R[q + 3]) / proxyInvMass(p, rx, ry, rz, s.nx, s.ny, s.nz))
      const d = jNew - jn[k]
      if (d !== 0) {
        jn[k] = jNew
        proxyImpulse(p, d * s.nx, d * s.ny, d * s.nz, rx, ry, rz)
        proxyPointVel(p, rx, ry, rz, v)
      }
      const cap = s.mu * jn[k]
      if (!(cap > 0)) continue
      const vn2 = v.x * s.nx + v.y * s.ny + v.z * s.nz
      const tx = v.x - vn2 * s.nx, ty = v.y - vn2 * s.ny, tz = v.z - vn2 * s.nz
      const vt = Math.hypot(tx, ty, tz)
      if (vt < 1e-9) continue
      // The impulse that stops the slide, added to this point's sum, the sum clamped to the cone.
      const m = vt / proxyInvMass(p, rx, ry, rz, tx / vt, ty / vt, tz / vt)
      const o = 3 * k
      let ax = jt[o] - tx / vt * m, ay = jt[o + 1] - ty / vt * m, az = jt[o + 2] - tz / vt * m
      const am = Math.hypot(ax, ay, az)
      if (am > cap) { ax *= cap / am; ay *= cap / am; az *= cap / am }
      proxyImpulse(p, ax - jt[o], ay - jt[o + 1], az - jt[o + 2], rx, ry, rz)
      jt[o] = ax; jt[o + 1] = ay; jt[o + 2] = az
    }
  }
  if (!push) return
  for (let k = 0; k < S.length; k++) {
    const s = S[k], o = 3 * k, q = 4 * k
    if (jn[k] <= 0 && !jt[o] && !jt[o + 1] && !jt[o + 2]) continue
    p.pushes.push({ x: jn[k] * s.nx + jt[o], y: jn[k] * s.ny + jt[o + 1], z: jn[k] * s.nz + jt[o + 2] },
      { x: p.com.x + R[q], y: p.com.y + R[q + 1], z: p.com.z + R[q + 2] })
  }
}
const _pgV = { x: 0, y: 0, z: 0 }

/** The velocity of the proxy's point at offset r: the engine's at the step's start plus this step's change. */
function proxyPointVel (p, rx, ry, rz, out) {
  const wx = p.w0.x + p.dw.x, wy = p.w0.y + p.dw.y, wz = p.w0.z + p.dw.z
  out.x = p.v0.x + p.dv.x + wy * rz - wz * ry
  out.y = p.v0.y + p.dv.y + wz * rx - wx * rz
  out.z = p.v0.z + p.dv.z + wx * ry - wy * rx
  return out
}

/**
 * FEAT-158: the rock's COMPLIANCE at a point — the velocity change along d at offset r per unit
 * impulse along d there, with the ground it lies on holding it (proxyGround: normal + friction).
 * proxyInvMass is the same number for a FREE rock; a rock held at its base pivots instead, and its
 * compliance high on its face is several times the free one (a 9 kg rock reads ≈1.4 kg there).
 * Probed from rest (homogeneous in the impulse, so a unit probe serves any size); state restored.
 */
function proxyYield (p, rx, ry, rz, dx, dy, dz) {
  const dv = p.dv, dw = p.dw, v0 = p.v0, w0 = p.w0
  p.dv = _pyV; p.dw = _pyW; p.v0 = p.w0 = _pyZ
  _pyV.x = _pyV.y = _pyV.z = _pyW.x = _pyW.y = _pyW.z = 0
  proxyImpulse(p, dx, dy, dz, rx, ry, rz)
  proxyGround(p, false)
  const v = proxyPointVel(p, rx, ry, rz, _pgV)
  p.dv = dv; p.dw = dw; p.v0 = v0; p.w0 = w0
  return v.x * dx + v.y * dy + v.z * dz
}
const _pyV = { x: 0, y: 0, z: 0 }, _pyW = { x: 0, y: 0, z: 0 }, _pyZ = Object.freeze({ x: 0, y: 0, z: 0 })
