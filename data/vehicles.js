/**
 * Vehicle presets. Each entry is a complete RANGER_PARAMS-compatible object.
 * Spread from ranger.js at import time (before physics mutates internal _state keys),
 * then override per-vehicle. Switching vehicles copies all non-underscore keys into
 * the live params reference via the debug panel dropdown.
 */
import { RANGER_PARAMS } from './ranger.js'

export const VEHICLES = {

  'Ranger': { ...RANGER_PARAMS },

  '240sx': {
    ...RANGER_PARAMS,

    // ── Geometry ────────────────────────────────────────────────────────────
    wheelbase:    2.474,
    trackFront:   1.46,
    trackRear:    1.46,
    cgHeight:     0.50,
    wheelRadius:  0.320,   // 205/55R16
    bodyLength:   4.44,
    bodyWidth:    1.61,    // track(1.46) + tireWidth(0.20) - 0.05 margin
    bodyHeight:   1.28,

    // ── Mass & Inertia ───────────────────────────────────────────────────────
    mass:         1190,
    inertiaRoll:  (1 / 12) * 1190 * (1.61 ** 2 + 1.28 ** 2),
    inertiaPitch: (1 / 12) * 1190 * (4.44 ** 2 + 1.28 ** 2),
    inertiaYaw:   (1 / 12) * 1190 * (4.44 ** 2 + 1.61 ** 2),

    // ── Drivetrain ───────────────────────────────────────────────────────────
    maxDriveTorque:      700,
    maxBrakeTorque:     1700,
    maxReverseTorque:    700,
    maxHandbrakeTorque: 5000,   // stronger for drift initiation

    // ── Wheels ───────────────────────────────────────────────────────────────
    wheelMass:    14,
    wheelInertia: 0.90,   // 0.5 × 14 × 0.320²  ≈ 0.72; rounded up for assembly

    // ── Tire ─────────────────────────────────────────────────────────────────
    tireStiffness: 180000,
    tireDamping:    1500,
    frictionCoeff:  0.95,
    rollingResistanceCoeff: 0.015,

    // ── Pacejka ──────────────────────────────────────────────────────────────
    pacejkaB: 11.0,
    pacejkaC:  1.9,
    pacejkaD:  1.0,
    pacejkaE:  0.97,
    tireRelaxationLength: 0.25,
    tireSlipVelRef:        1.0,
    tireStiffnessLong:     1.0,
    tireStiffnessLat:      1.0,

    // ── Steering ─────────────────────────────────────────────────────────────
    maxSteerAngle:  0.65,   // ~37° — more lock for initiating drifts
    steerRate:      1.5,
    steerDecayRate: 2.5,
    speedSteerRef:  18,

    // ── Weight Distribution ──────────────────────────────────────────────────
    weightFront: 0.53,
    weightRear:  0.47,

    // ── Suspension ───────────────────────────────────────────────────────────
    suspensionStiffnessFront: 45000,
    suspensionStiffnessRear:  40000,
    suspensionDampingFront:    3000,
    suspensionDampingRear:     3000,
    suspensionRestLengthFront: 0.18,
    suspensionRestLengthRear:  0.20,
    suspensionTravelFront:     0.20,
    suspensionTravelRear:      0.22,
    suspensionBodyOffsetFront: 0.0,
    suspensionBodyOffsetRear:  0.0,
    bumpStopStiffness:        330000,

    // ── ARB — stiff front, open rear for oversteer character ─────────────────
    arbStiffnessFront: 8000,
    arbStiffnessRear:     0,
  },

}
