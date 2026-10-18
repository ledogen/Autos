/**
 * src/vehicle-state.js — the canonical vehicleState shape (one definition, many trucks).
 *
 * This literal used to live inline in main.js, where it was fine while there was exactly one truck
 * in the process. FEAT-41's menu stage puts a SECOND one in its own physics world, and a copied
 * literal would silently drift the moment a field is added to one and not the other — the failure
 * mode being a `?? 0` default quietly standing in for a real signal.
 *
 * Nothing here is engine-aware: this is plain state, mutated in place by vehicle.js (input) and
 * physics.js (dynamics), read by the HUD/logger/damage model. See GLOSSARY.md for units and the
 * wheel-index convention (0=FL, 1=FR, 2=RL, 3=RR).
 */

import * as THREE from 'three'
import { makeIgnitionState } from './ignition.js'
import { makeFuelState } from './fuel.js'
import { computeStaticEquilibrium } from './suspension.js'

/**
 * A fresh vehicleState, pre-settled at static equilibrium for `params`.
 *
 * Phase 4.1: position.y and strutComp[] come from computeStaticEquilibrium so the car spawns
 * settled with no visible drop. (The menu stage deliberately overrides position.y afterwards —
 * dropping the truck is the whole point of that scene.)
 *
 * @param {object} params - RANGER_PARAMS (or a vehicle preset of the same shape).
 * @param {number} [ignitionKey] - initial key position; defaults to makeIgnitionState()'s own
 *   default (RUNNING, the free-roam spawn). Story mode passes OFF.
 */
export function makeVehicleState (params, ignitionKey = undefined) {
  const eq = computeStaticEquilibrium(params)
  return {
    position:        new THREE.Vector3(0, eq.bodyY, 0),
    velocity:        new THREE.Vector3(),
    quaternion:      new THREE.Quaternion(),       // identity — car points down -Z
    angularVelocity: new THREE.Vector3(),
    steerAngle:      0,                             // rad scalar, see GLOSSARY.md §Sign Conventions
    throttle:        0,
    brake:           0,
    smoothThrottle:  0,                             // FEAT-01: ramped throttle accumulator; read+written by updateVehicle
    smoothBrake:     0,                             // FEAT-01: ramped brake accumulator; read+written by updateVehicle
    wheelSteerAngles: [0, 0, 0, 0],               // Per-wheel Ackermann steer angles [rad]; set by updateVehicle each step; read by stepPhysics for lateral force decomposition.
    // Phase 4.1 strut state (D-01): strut compression and velocity per corner.
    // Initialized to static equilibrium — strutComp ≈ 0.111 m at current params.
    strutComp:    [...eq.strutComp],       // m   — strut compression per corner (0=FL,1=FR,2=RL,3=RR)
    strutCompVel: [0, 0, 0, 0],            // m/s — strut compression velocity per corner (D-01)
    wheelDebug:      [ {fn:0,fy:0,sa:0,c:0,omega:0,fz:0}, {fn:0,fy:0,sa:0,c:0,omega:0,fz:0}, {fn:0,fy:0,sa:0,c:0,omega:0,fz:0}, {fn:0,fy:0,sa:0,c:0,omega:0,fz:0} ],  // per-wheel debug data written by stepPhysics; read by logger; fz=tire spring force (D-12)
    wheelOmega:      [0, 0, 0, 0],                   // per-wheel angular velocity [rad/s]; integrated by physics.js omega integrator
    slipLong:        [0, 0, 0, 0],                   // m — relaxation-filtered longitudinal slip displacement per tire (tire.js header)
    slipLat:         [0, 0, 0, 0],                   // m — same, lateral
    // ── SM-3 damage signals: honest per-corner quantities the physics already computes, published
    // here so src/damage.js can integrate wear without importing anything from the physics stack.
    slipVel:         [0, 0, 0, 0],                   // m/s — raw contact-patch sliding speed (tire wear, dominant term)
    tireFlat:        [0, 0, 0, 0],                   // N   — cornering force magnitude (tire wear, minor term)
    bumpForce:       [0, 0, 0, 0],                   // N   — peak bump-stop force this step (spring wear)
    rimForceRoad:    [0, 0, 0, 0],                   // N   — rim load from ROAD/terrain: the squashed-carcass load past full compression (a different measurement from rimForce — see suspension.js)
    rimForce:        [0, 0, 0, 0],                   // N   — engine contact FORCE on each WHEEL HARD CORE (QUAL-25). Non-zero only when the rim itself is hit — rim damage
    brakeTorque:     [0, 0, 0, 0],                   // N·m — applied brake torque (brake wear)
    wheelPhase:      [0, 0, 0, 0],                   // per-wheel spin phase [rad], fixed-step; feeds the out-of-round radius (params.wheelRunout)
    drivetrain:      { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1 },  // FEAT-23 engine/converter/gearbox state; stepped by stepDrivetrain, read by HUD/logger
    ignition:        makeIgnitionState(ignitionKey),    // FEAT-33 key state (OFF/CRANKING/RUNNING); stepped by updateVehicle, read by stepDrivetrain + the cluster. Free roam spawns RUNNING.
    fuel:            makeFuelState(params),             // FEAT-50 tank { gal, floorGal, dry }; drained by stepFuel (fuel.js), filled at pumps (fuel-stop.js). Story start sets fuelStartFrac.
    engineHealth:    1,                                 // FEAT-33 seam for the SM-3 wear model: 1 = fresh engine (quarter-second catch), 0 = beater (ignitionCatchTimeWorn). Written every step by the damage model's engine track (damage.js).
    handbrake:       false,                            // Space key handbrake state; written by updateVehicle, read by getBrakeTorque
    parked:          true,                              // spawn/teleport hold (feature/teleport): handbrake held until first driver input
    submerged:       false,                            // FEAT-22: CG below a water surface (set per-frame from WaterSystem.submergedAt)
    submergedDepth:  0,                                // FEAT-22: m below the water surface (0 when dry)
  }
}
