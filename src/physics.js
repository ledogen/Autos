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
import { computeNormalForce, effectiveWheelRadius, getWheelPosition, mountLocal, stepSuspensionSubsteps, tireContactForce, TIRE_DAMP_ENGAGE, WHEEL_SOFT_BAND } from './suspension.js'
import { REV_THRESHOLD, stepDrivetrain } from './drivetrain.js'
import { camberLean, toeOffset } from './alignment.js'
import { GROUP_CHASSIS, GROUP_DEBRIS } from './physics-engine.js'

// Speed threshold for input routing (rule-based, no dead-zone oscillation) is drivetrain.js's
// REV_THRESHOLD. FEAT-23 removed FWD_THRESHOLD (the W-brake / drive-cut deadband); the drivetrain
// now supplies forward torque continuously through the torque converter, so there is no roll-back
// drive cutoff.

// Engine solver substeps per physics step (Step 3e explains why 8). Coupled to rim-strike damage:
// readRimStrikes divides an engine contact impulse by dt, so changing this rescales what the
// damage.js rimYieldMult/rimFullMult thresholds see (review-2 R-02).
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
 * @returns {number} Brake torque [N·m]. Positive = resists current wheel spin direction.
 */
function getBrakeTorque (wheelIndex, vehicleState, params) {
  const isRear  = wheelIndex === 2 || wheelIndex === 3
  const longVel = params._longitudinalVelocity || 0

  // FEAT-23: the old "W below FWD_THRESHOLD → brake" branch is gone. The torque-converter drivetrain
  // now delivers forward torque whenever the throttle is down (even while rolling backward), so it
  // arrests and reverses a hill roll-back itself — braking there would fight the drive torque and
  // re-create the drive/brake oscillation this feature fixes.

  // S above REV_THRESHOLD: brake all wheels to slow forward motion (front/rear-split service brake).
  // SM-3: worn pads deliver less torque. params._brakeScale{Front,Rear} is published by
  // src/damage.js; absent (headless gates, damage off) it reads as 1 and nothing changes.
  const brakeDmg = isRear ? (params._brakeScaleRear ?? 1) : (params._brakeScaleFront ?? 1)
  if (vehicleState.brake > 0 && longVel > REV_THRESHOLD) {
    const maxBt = isRear ? (params.maxBrakeTorqueRear ?? 800) : (params.maxBrakeTorqueFront ?? 1200)
    return vehicleState.brake * maxBt * brakeDmg
  }

  // Handbrake: rear wheels only, FULL clamping torque at all speeds. A handbrake is a fixed brake, so
  // it must apply full torque at low speed / rest — that is exactly when you park on a hill. The old
  // speed-ramp (scale = |v|/HB_RAMP below 0.3 m/s) faded the torque toward zero right where holding
  // matters, and the `|v| === 0 ? full` guard almost never fires in floating point, so a car creeping
  // on a slope sat in the weak zone and the rear wheels ROLLED instead of locking → it slid downhill on
  // grades far below the friction angle. Full torque locks the rears; the tire then holds (static) or
  // skids (kinetic) per the slope vs friction angle, which is the correct behaviour.
  if (vehicleState.handbrake && isRear) {
    return params.maxHandbrakeTorque * brakeDmg
  }

  return 0
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
// Body-frame breakpoints (origin = CG, forward = −Z) of hilux.glb pushed through the exact
// seating transform vehicle-model.js applies (targetLength 4.6 × bodyScale 1.065, shiftRear
// 0.318, shiftDown 0.21, planted at cgHeight; mirrors excluded from widths). Re-measure via
// Blender if the model or its VEHICLE_MODELS spec changes — and when a SECOND vehicle model
// lands, this profile should move into data/vehicle-models.js as per-model hull data (the
// QUAL-25 option-2 path) instead of growing switches here.
//
// The deck hull is a SOLID at rail height by default — hilux.glb's bed top is closed (reads as a
// tonneau cover), owner ruling 2026-08-15. A model with a real open bed carries a `bed` spec in
// data/vehicle-models.js and gets a hollow well instead (see createVehicleChassis) so cargo can
// ride in it; ranger.glb, the default truck, does (owner, 2026-09-29).
const CHASSIS_PROFILE = {
  noseZ: -2.13,        // front bumper face
  tailZ: 2.77,         // rear bumper face
  cowlZ: -0.72,        // windshield base
  roofFrontZ: -0.30,   // windshield top / roof leading edge
  roofRearZ: 0.60,     // roof trailing edge (rear window top)
  cabRearZ: 0.73,      // cab back panel → bed rail
  hoodNoseY: 0.30,     // hood height at the grille
  hoodCowlY: 0.54,     // hood height at the cowl
  roofY: 1.04,         // roof plane (the old single hull had 0.40 — rollovers rested on air)
  railY: 0.29,         // bed rail / tonneau deck top
  beltY: 0.18,         // beltline — top of the full-length lower slab (fenders/doors/bumpers)
  slabHalfW: 0.95,     // fenders/bumpers
  cabHalfW: 0.78,      // cab + roof (mirrors excluded)
  deckHalfW: 0.93,     // bed sides
}

/**
 * Fold the engine's WHEEL HARD CORE contact forces into `out`, per corner [N], taking the max
 * against whatever the soft path already put there.
 *
 * This is the rim-strike signal, and it is the engine's own answer rather than anything derived.
 * The QUAL-25 chassis carries a rigid sphere per wheel at `wheelRadius − WHEEL_SOFT_BAND`, riding
 * the strut-derived hub position and colliding with debris only. That geometry IS the model of a
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
 * @returns {{impulse:number, point:object|null, normal:object|null}} the chassis' hardest contact
 *   this step (engine.maxContactImpulse's result) — the same engine readout serves the collision-
 *   damage feed, so the caller does not ask twice.
 */
export function readRimStrikes (engine, chassis, out, dt) {
  const rims = _rimsFor(engine).get(chassis)
  const hit = engine.maxContactImpulse(chassis, rims ? _shapeImpulseScratch : null)
  if (!rims) return hit
  const inv = dt > 0 ? 1 / dt : 0
  // MAX, not assign: the soft path has already written any rim contact it detected against
  // terrain this step (suspension.js), and a wheel can be taking both at once.
  for (let i = 0; i < 4; i++) {
    const f = (_shapeImpulseScratch[rims[i].shapeIndex] || 0) * inv
    if (f > out[i]) out[i] = f
  }
  return hit
}
const _shapeImpulseScratch = new Float64Array(64)   // per-shape peak impulse; the chassis has ≤ 16 shapes

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
  const slabPart = (z0, z1, topY) => engine.addHull(chassis, [
    -P.slabHalfW, topY, z0, P.slabHalfW, topY, z0,
    -P.slabHalfW, topY, z1, P.slabHalfW, topY, z1,
    -slabBottomHalfW, undY, Math.max(z0, slabBottomNoseZ), slabBottomHalfW, undY, Math.max(z0, slabBottomNoseZ),
    -slabBottomHalfW, undY, Math.min(z1, slabBottomTailZ), slabBottomHalfW, undY, Math.min(z1, slabBottomTailZ),
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

  // 5. Wheel HARD CORES — spheres at the nominal hub positions that collide with DEBRIS ONLY
  // (never terrain/road — driving feel is untouched by construction). The tire itself stays the
  // analytic soft contact (suspension + Pacejka + reaction through qcPlus); these cores exist
  // because the wheel is otherwise not solid to the engine, so a rock bulldozed backward by the
  // slab chamfer could be shoved INTO the wheel arch and sit inside the tire (owner capture
  // 1786777538787: wheel visually through rock; measured −0.43 m interpenetration in the crawl
  // gate). Core radius = wheelRadius − WHEEL_SOFT_BAND: the outer band is honest tire squish
  // handled by the soft path; the core makes deeper overlap geometrically impossible and hands
  // the pinch impulse to the chassis like a real wheel would.
  // Rim placement TRACKS THE STRUT (owner, 2026-08-15 — they originally rode fixed on the
  // body at the MOUNT height, ~a strut-length above the real hub): created here at the mount,
  // re-seated every step by updateWheelRims() below to the strut-derived hub position, wheel
  // order FL/FR/RL/RR to match strutComp indexing.
  const rims = []
  // The hulls between the slab and the wheel cores are the ones that carry params.bodyRestitution.
  rims.bounceShapes = []
  // The bed well is NOT one of them: its restitution is pinned 0 with its own friction (FEAT-88),
  // so the Body Bounce slider never reaches it.
  for (let i = bounceFrom; i < engine.shapeCount(chassis); i++) {
    if (i < bedShapes[0] || i >= bedShapes[1]) rims.bounceShapes.push(i)
  }
  for (let c = 0; c < 4; c++) {
    const { x, y: mountY, z } = mountLocal(c, params), front = c < 2
    engine.addHull(chassis, wheelCorePoints(x, mountY, z, params), RIM_MATERIAL)
    rims.push({ shapeIndex: engine.shapeCount(chassis) - 1, x, z, mountY, front, lastY: mountY })
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
 */
export function syncChassisMass (engine, chassis, params) {
  engine.setMassData(chassis, params.mass,
    { x: params.inertiaPitch, y: params.inertiaYaw, z: params.inertiaRoll })
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

/** Re-seat the rim cores at the strut-derived hub positions (hubLocal = mount − strutLen·ŷ). */
function updateWheelRims (engine, chassis, vehicleState, params) {
  const rims = _rimsFor(engine).get(chassis)
  if (!rims || !vehicleState.strutComp) return
  for (let i = 0; i < 4; i++) {
    const r = rims[i]
    const L_S = r.front ? params.suspensionRestLengthFront : params.suspensionRestLengthRear
    const y = r.mountY - (L_S - (vehicleState.strutComp[i] ?? 0))
    // A hull cannot be mutated in place, so moving the core means rebuilding it — cheap, but not
    // free, and the strut moves by microns most steps. Rebuild only once the core has drifted far
    // enough for the difference to matter to a contact, which on a smooth road is almost never.
    if (Math.abs(y - r.lastY) < RIM_REBUILD_M) continue
    engine.replaceHullLocal(chassis, r.shapeIndex, wheelCorePoints(r.x, y, r.z, params), RIM_MATERIAL)
    r.lastY = y
  }
}

const RIM_REBUILD_M = 0.004   // m — below this the core has not moved enough to change a contact
const RIM_SIDES = 12          // dodecagon: within 3.5% of a true circle, 24 hull points
// updateBodyMass FALSE: the chassis mass is pinned by setMassData after construction, and these
// cores are rebuilt live as the strut moves — letting each rebuild re-derive mass from shape
// densities throws that pinned mass away (the truck stops settling on flat ground).
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
  //
  // depthRate: finite difference of the per-(body, wheel) depth across steps — the honest
  // d(depth)/dt the tire damper wants. Keyed per wheel as well as per body: two wheels on one body
  // (a dragged log) must each difference against their OWN last depth, or the shallower wheel's
  // damper reads the deeper one's baseline and pushes the wrong way. Continuous depth ⇒ well-behaved difference; on first touch
  // prev = 0 and depth ≈ closing·dt, so the rate lands at the true closing speed. Every query
  // within one step shares the previous step's baseline (suspension substeps cannot compound).
  const prevDepth = engineCtx._dynContactDepth ?? EMPTY_DEPTH_MAP
  const stepDepth = new Map()
  engineCtx._dynContactDepth = stepDepth
  // ONE analytic ground query per wheel per step. Step 1 (the tunnelling failsafe) asks it at each
  // wheel's start-of-step hub; the four suspension substeps and Step 3 then ask at hubs that have
  // moved by one step of strut travel — millimetres — and on an out-of-round tire with a radius a
  // few mm different. Those five re-asks each cost ~33 ground samples and came back with the same
  // surfaces, so they now re-read Step 1's contacts with each depth shifted for the hub move along
  // the contact normal and for the radius change: a plane, honest at this scale (a wheel that lifts
  // off reads depth ≤ 0 and drops the contact). Terrain and static props only — debris bodies MOVE
  // within a step, so the engine sphere test below still runs on every call (owner, 2026-10-02).
  // Measured before: ~75 % of the 1.9 ms physics step was these queries.
  //
  // A wheel that is AIRBORNE at the start of the step has an empty answer, and the query reports
  // only penetrating contacts — so a touchdown inside the step could not appear until the next
  // one (up to a step of extra sink, ~50 mm at a 3 m/s landing). Such a corner keeps asking the
  // real query every substep, so a landing is caught at the substep it happens, as before. Costs
  // nothing while the wheels are on the ground.
  const base = [null, null, null, null]   // per corner: { x, y, z, r, list } — Step 1's analytic answer
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
    if (!list) list = queryContacts(cx, cy, cz, r, footprint)
    const dyn = engine.contactSphere({ x: cx, y: cy, z: cz }, r, { collidesWith: GROUP_DEBRIS, dynamicOnly: true })
    for (let i = 0; i < dyn.length; i++) {
      const h = dyn[i]
      // Safety invariant, not a filter that should ever fire with exact manifolds: a body under
      // the wheel cannot push it DOWN (a rock overhead is the chassis' engine contact).
      if (h.normal.y < -0.1) continue
      const key = h.body * 4 + corner
      h.depthRate = (h.depth - (prevDepth.get(key) ?? 0)) / dt
      const seen = stepDepth.get(key)
      if (seen === undefined || h.depth > seen) stepDepth.set(key, h.depth)
      list.push(h)
    }
    return list
  }
  // (The 2026-08-15 within-step rock-proxy experiment — simultaneous substep-cadence coupling —
  // was REVERTED on owner feel; the one-step coupling lag returns force-on-rock via the engine
  // a frame late, which is the behaviour the owner signed off as right. See commit c03a727 and
  // its revert for the full mechanism if it is ever revisited.)

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
      const contacts = queryContacts(hub.x, hub.y, hub.z, params.wheelRadius, true)
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
  stepDrivetrain(vehicleState, params, dt, vForward)

  // ── Step 2.5: Suspension substep loop (Phase 4.1) ──────────────────────────────────────────
  // Integrates strutComp/strutCompVel at dt/N substeps. Writes:
  //   params._tireFz[i]         — strut-axis tire-spring Fz per corner (fed to Pacejka per D-06b)
  //   params._suspForceAccum[i] — averaged suspension force on body per corner (applied along body_up below)
  //   params._hubNormalXZ[i]    — X/Z residual contact normal force per corner (applied in Step 2.6 below)
  // Must run BEFORE Step 3 so Pacejka reads the post-substep tire Fz (D-08).
  stepSuspensionSubsteps(vehicleState, params, dt, qcPlus)

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
    // airborne. Pacejka contacts loop is skipped for airborne wheels. The omega integrator
    // (below, outside the contacts loop) still runs for airborne wheels so drive torque can
    // rev the wheel while airborne — lastFn=0 causes Newton to converge trivially with no road
    // reaction (this was already the behavior via the `if (lastFn <= 0) break` Newton guard).
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

    // Airborne skip (D-14): skip Pacejka contacts loop for this wheel.
    // Omega integrator below still runs (lastFn=0 causes Newton to converge with no road reaction).
    if (isAirborne) {
      // Update omega debug for airborne wheels (CR-03: all wheels log omega every step)
      if (vehicleState.wheelDebug) vehicleState.wheelDebug[i].omega = vehicleState.wheelOmega?.[i] || 0
      // Fall through to omega integrator below — do NOT `continue` past it
      // (but we still need to run the integrator, so restructure to skip only the contacts loop)
      // Use lastFn=0 to signal airborne to the omega Newton loop.
      const wheelInertia_a = params.wheelInertia || 1.22
      const driveTorque_a  = getDriveTorque(i, vehicleState, params)
      const brakeTorque_a  = getBrakeTorque(i, vehicleState, params)
      if (vehicleState.brakeTorque) vehicleState.brakeTorque[i] = brakeTorque_a
      if (vehicleState.slipVel)  vehicleState.slipVel[i]  = 0   // airborne: no contact, no abrasion
      if (vehicleState.tireFlat) vehicleState.tireFlat[i] = 0
      const omega0_a       = vehicleState.wheelOmega?.[i] ?? 0
      const spinSign_a     = omega0_a >= 0 ? 1 : -1
      const brakeSigned_a  = brakeTorque_a * spinSign_a
      // Airborne: no road reaction, direct Euler step (Newton trivially converges with Flong=0)
      const omegaNew_a = omega0_a + (dt / wheelInertia_a) * (driveTorque_a - brakeSigned_a)
      if (brakeTorque_a > 0 && Math.sign(omegaNew_a) !== spinSign_a) {
        vehicleState.wheelOmega[i] = 0
      } else {
        vehicleState.wheelOmega[i] = omegaNew_a
      }
      if (vehicleState.wheelDebug) vehicleState.wheelDebug[i].omega = vehicleState.wheelOmega[i]
      continue  // skip the full Pacejka contacts loop + Newton omega below
    }

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

    params._lateralVelocity      = hubVel.dot(wheelRight)
    params._longitudinalVelocity = hubVel.dot(wheelFwd)

    // Slip-velocity tire model with relaxation length (see tire.js header).
    // Per-tire state: vehicleState.slipLong[i], slipLat[i] — the "filtered" slip
    // displacements (m), evolved per-step via implicit Euler on ds/dt = v_slip − s·|v|/L.
    // makeVehicleState carries them; the lazy-init is for gates that hand-build a state.
    if (!vehicleState.slipLong) vehicleState.slipLong = [0, 0, 0, 0]
    if (!vehicleState.slipLat)  vehicleState.slipLat  = [0, 0, 0, 0]

    // BUG-20: numeric floor only (keeps the relaxation denominator well-conditioned near rest).
    // Was 3.0 m/s — that large floor forced the stored slip displacement to bleed toward zero
    // below ~3 m/s, so the carcass spring could not hold at rest (no static friction: a braked
    // car ran away downhill) and the tire felt slippery under ~11 km/h. The blow-up at rest that
    // the old floor guarded against is now bounded by the friction-circle break-away clamp on
    // |(sLong,sLat)| below (sBreak) — the physically correct limiter.
    const SLIP_EPSILON = 0.05

    // Per-step bookkeeping for the ω integrator (Newton-iterated implicit Euler below).
    // Zero / null when airborne so road reaction = 0.
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
    let ground = null
    let bestUp = -Infinity
    for (const c of contacts) {
      if (c.normal.y > bestUp) { bestUp = c.normal.y; ground = c }
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
      params._compression = ground.depth

      // FEAT-48: RELATIVE contact velocity. Against static ground (analytic terrain,
      // props — no .body) the support is at rest and this reduces exactly to the old
      // absolute-velocity formulation. Against a dynamic body (a rock rolling under
      // the wheel) slip is measured relative to the body's own contact-point velocity —
      // this one mechanism is what makes driving onto a moving rock launch the car and
      // kick the rock out, with no special cases.
      if (ground.body != null) {
        const groundVel = engine.getPointVelocity(ground.body, ground.contactPoint, _groundVelScratch)
        // Fully relative — the support's own velocity enters the slip UNCLAMPED (owner,
        // 2026-08-15: the last containment-era limiter deleted). Honest forces from honest
        // kinematics; the enveloping factor and exact manifolds bound the magnitudes.
        params._lateralVelocity      = (hubVel.x - groundVel.x) * wheelRight.x +
                                       (hubVel.y - groundVel.y) * wheelRight.y +
                                       (hubVel.z - groundVel.z) * wheelRight.z
        params._longitudinalVelocity = (hubVel.x - groundVel.x) * wheelFwd.x +
                                       (hubVel.y - groundVel.y) * wheelFwd.y +
                                       (hubVel.z - groundVel.z) * wheelFwd.z
      }

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
      const longVelCur = params._longitudinalVelocity || 0
      const latVelCur  = params._lateralVelocity      || 0
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
      const { Flong, Flat } = computeTireForces(sLongCur, sLatNew, Fn, params, muScale)

      // SM-3 honest wear signals for this wheel, published for src/damage.js to integrate.
      // slipVel is the RAW contact-patch sliding speed (not the relaxation-filtered displacement) —
      // abrasion is driven by how fast the rubber is actually sliding over the ground.
      if (vehicleState.slipVel)  vehicleState.slipVel[i]  = Math.hypot(omegaCur - longVelCur, latVelCur)
      if (vehicleState.tireFlat) vehicleState.tireFlat[i] = Math.abs(Flat)

      // Save state for Newton iteration in ω integrator (re-evaluates sLong and F at ω_new).
      lastFn         = Fn
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

      // FEAT-48: equal-and-opposite onto the dynamic support — the tire's friction force
      // AND its normal load press on the body under the wheel at the contact point.
      // (Static supports have no .body; the terrain doesn't need its reaction.)
      //
      // The normal reaction is the CONTACT-LOCAL spring–damper force — THE SAME FUNCTION the
      // suspension applied for this contact (tireContactForce: engagement, progressive carcass,
      // air spring and damper at this tire's rate), never the wheel's SUMMED Fz (road + rock when
      // straddling once over-flung the rock). Before 2026-10-02 this side re-implemented the law
      // without the carcass term or the flat-tire rate: 37 % short at 0.10 m of squash, ~20× too
      // hard on a flat.
      if (ground.body != null) {
        const rate = params._tireRateScale ? params._tireRateScale[i] : 1
        const FnContact = tireContactForce(ground.depth,
          (ground.depthRate ?? 0) * Math.min(1, ground.depth / TIRE_DAMP_ENGAGE), ground.sizeR, rate, params)
        engine.applyForce(ground.body, {
          x: -wheelForce.x - FnContact * ground.normal.x,
          y: -wheelForce.y - FnContact * ground.normal.y,
          z: -wheelForce.z - FnContact * ground.normal.z,
        }, ground.contactPoint)
      }

      // Write debug data for logger — evaluated once per wheel against the chosen support surface (BUG-38).
      // NOTE: `sa` field now stores SLIP VELOCITY magnitude (m/s) instead of slip angle (rad).
      // Field name kept for log format stability; semantics document in GLOSSARY.
      if (vehicleState.wheelDebug) {
        vehicleState.wheelDebug[i].fn    = Fn
        vehicleState.wheelDebug[i].fy    = Flat
        vehicleState.wheelDebug[i].sa    = Math.hypot(sLongCur, sLatNew)
        vehicleState.wheelDebug[i].c     = params._compression
        vehicleState.wheelDebug[i].vLong = omegaCur - longVelCur
        vehicleState.wheelDebug[i].vLat  = latVelCur
      }
    } else if (Fn > 0) {
      // Loaded during the substeps but no support under the post-substep hub: the wheel lifted off
      // inside this step (a crest, a take-off). Treat the patch as airborne for the wear signals —
      // the ω solve below already runs with lastFn = 0, i.e. the airborne branch's physics.
      if (vehicleState.slipVel)  vehicleState.slipVel[i]  = 0
      if (vehicleState.tireFlat) vehicleState.tireFlat[i] = 0
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
    // tolerance. Airborne: lastFn = 0 ⇒ tireForce returns zero ⇒ ω evolves under drive/brake.
    {
      const wheelInertia = params.wheelInertia || 1.22
      const driveTorque  = getDriveTorque(i, vehicleState, params)
      const brakeTorque  = getBrakeTorque(i, vehicleState, params)
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
        if (lastFn <= 0) break  // airborne: no road reaction; Newton trivially converged
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
      if (!(Math.abs(lastDelta) <= NEWTON_TOL) && lastFn > 0) {
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
      if (brakeTorque > 0 && Math.sign(omegaNew) !== spinSign) {
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
  updateWheelRims(engine, chassis, vehicleState, params)   // rims follow strut travel
  engine.applyForce(chassis, totalForce)
  engine.applyTorque(chassis, totalTorque)
  // 8 substeps (not the engine-default 4): the chassis carries the TUNED inertia, whose x-axis
  // value sits ~3× below the hull-natural tensor, and the soft-step solver converts some of a
  // flat bare-frame slam into rocking rebound when under-substepped. 8 halves that phantom
  // bounce (measured: e_eff 0.30 → 0.21 on a worst-case flat slam) and costs microseconds at
  // this body count. See test/body-contact-energy.mjs for the measured envelope.
  engine.step(dt, ENGINE_SUBSTEPS)

  // ── Step 3e: Pull the engine result back into the authoritative JS mirror ──
  engine.getTransform(chassis, vehicleState.position, vehicleState.quaternion)
  engine.getVelocity(chassis, vehicleState.velocity, vehicleState.angularVelocity)
  vehicleState.quaternion.normalize()
}

// Scratch for the dynamic-support ground velocity (avoids a per-contact alloc).
const _groundVelScratch = { x: 0, y: 0, z: 0 }
// Per-step scratch (stepPhysics only; nothing holds them past the step): body axes, the per-wheel
// steered frame, and the post-substep hubs.
const _forward = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3()
const _steerQ = new THREE.Quaternion(), _wheelFwd = new THREE.Vector3(), _wheelRight = new THREE.Vector3()
const _hubPost = [null, null, null, null]

const NEWTON_TOL = 0.5                      // rad/s — ω-solve residual above this = diverged, commit the rolling fixed point instead
const EMPTY_DEPTH_MAP = new Map()           // shared immutable-by-convention first-step default
