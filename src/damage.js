/**
 * src/damage.js — SM-3 component condition model.
 *
 * ONE framework, 25 per-component condition tracks in eight classes. Every track carries a
 * condition in [0, 1] (1 = new, 0 = destroyed), integrates an HONEST physics signal the sim already
 * produces, and expresses its effect as a multiplier the physics stack reads. Per-run state only
 * (SM-INV-8) — nothing here persists across runs. Time + intensity, never distance (SM-INV-5).
 *
 * The spec is `.planning/story-mode/MILESTONES.md` § SM-3, ratified by the owner 2026-08-19; it
 * supersedes DESIGN.md "Damage, wear & repair" where the two differ.
 *
 * ── The seam (why this module imports nothing from the physics stack) ────────────────────────────
 *
 *   READS   vehicleState.*  — the per-corner honest signals physics.js/suspension.js publish
 *                             (slipVel, tireFlat, bumpForce, strutCompVel, brakeTorque, drivetrain)
 *   WRITES  params._*Scale  — effect multipliers, in the same `params._` scratch convention the
 *                             physics stack already uses for _tireFz / _driveTorque / _hubNormalXZ
 *
 * So physics.js, tire.js and suspension.js never import damage.js, and damage.js never imports
 * them. The physics stack reads plain numbers off `params` and does not know a damage model exists.
 * That keeps the FEAT-48 seam table intact and means damage can be disabled by simply not stepping
 * this module (the multipliers stay at their neutral 1.0).
 *
 * ── Durability ──────────────────────────────────────────────────────────────────────────────────
 *
 * Components do NOT share a damage scale. Expressed here as DAMAGE PER INSULT: every track's
 * condition is 0..1, and each insult costs `insult / durability`. A heavy-duty spring is a spring
 * with a bigger `durability` number — it takes longer to sag, and it is *described* that way, never
 * scored (SM-INV-10). One mechanism, used the same way by every track.
 */

// ── Track registry ────────────────────────────────────────────────────────────────────────────────
// id → { label, cls, region }. `region` names which armor piece protects it (null = unprotected);
// it is consumed by the impact/armor pass in slice 2, and declared here so the registry is the one
// place the component list lives.

export const TRACKS = {
  // Armor — the impact budget standing in front of everything else in its region. Armor itself is
  // unprotected: it IS the protection.
  armorFront:  { label: 'Front Bumper', cls: 'armor', regions: [] },
  armorLeft:   { label: 'Left Side',    cls: 'armor', regions: [] },
  armorRight:  { label: 'Right Side',   cls: 'armor', regions: [] },
  armorRear:   { label: 'Rear Bumper',  cls: 'armor', regions: [] },

  // Tires — four independent corners (0=FL, 1=FR, 2=RL, 3=RR per GLOSSARY.md §Wheel Index).
  // NOT armor-protected: the ratified list puts WHEELS behind the bumpers, not tires. A tire is
  // worn by driving and punctured by what it rolls over, never saved by a bumper.
  tireFL: { label: 'Tire FL', cls: 'tire', regions: [], wheel: 0 },
  tireFR: { label: 'Tire FR', cls: 'tire', regions: [], wheel: 1 },
  tireRL: { label: 'Tire RL', cls: 'tire', regions: [], wheel: 2 },
  tireRR: { label: 'Tire RR', cls: 'tire', regions: [], wheel: 3 },

  // Wheels — separate class, separate criteria, separate effect (out-of-round). Slice 2.
  wheelFL: { label: 'Wheel FL', cls: 'wheel', regions: ['front', 'left'],  wheel: 0 },
  wheelFR: { label: 'Wheel FR', cls: 'wheel', regions: ['front', 'right'], wheel: 1 },
  wheelRL: { label: 'Wheel RL', cls: 'wheel', regions: ['rear',  'left'],  wheel: 2 },
  wheelRR: { label: 'Wheel RR', cls: 'wheel', regions: ['rear',  'right'], wheel: 3 },

  // Suspension — front/rear pairs. Left and right are DELIBERATELY not separable: the player should
  // never be asked to manage eight independent corners. A side impact therefore reaches BOTH pairs,
  // which is why 'left'/'right' appear on all four.
  springFront: { label: 'Front Springs', cls: 'spring', regions: ['front', 'left', 'right'] },
  springRear:  { label: 'Rear Springs',  cls: 'spring', regions: ['left', 'right'] },
  damperFront: { label: 'Front Dampers', cls: 'damper', regions: ['front', 'left', 'right'] },
  damperRear:  { label: 'Rear Dampers',  cls: 'damper', regions: ['left', 'right'] },

  // Brakes — front/rear pairs, same reason. Impacts NEVER damage brakes, so no regions.
  brakeFront: { label: 'Front Brakes', cls: 'brake', regions: [] },
  brakeRear:  { label: 'Rear Brakes',  cls: 'brake', regions: [] },

  // Powertrain + front-end. All three sit behind the front bumper and nothing else.
  engine:     { label: 'Engine',     cls: 'engine',     regions: ['front'] },
  radiator:   { label: 'Radiator',   cls: 'radiator',   regions: ['front'] },
  headlights: { label: 'Headlights', cls: 'headlights', regions: ['front'] },

  // Alignment — PER WHEEL, because toe and camber are per-wheel geometry and the ratified effect is
  // "random toe and camber applied to the affected wheels". Front bumper covers the front pair, rear
  // bumper the rear pair, each side its own two. Effect wiring is slice 3 (needs the toe/camber
  // geometry from feature/out-of-round).
  alignFL: { label: 'Alignment FL', cls: 'alignment', regions: ['front', 'left'],  wheel: 0 },
  alignFR: { label: 'Alignment FR', cls: 'alignment', regions: ['front', 'right'], wheel: 1 },
  alignRL: { label: 'Alignment RL', cls: 'alignment', regions: ['rear',  'left'],  wheel: 2 },
  alignRR: { label: 'Alignment RR', cls: 'alignment', regions: ['rear',  'right'], wheel: 3 },
}

/** Armor piece → the tracks it stands in front of. Derived, so the registry stays the one source. */
export const ARMOR_REGIONS = { front: 'armorFront', left: 'armorLeft', right: 'armorRight', rear: 'armorRear' }

export const TRACK_IDS = Object.keys(TRACKS)

// ── Tunables ──────────────────────────────────────────────────────────────────────────────────────
// Every number here is a [DEFAULT] pending a driven calibration pass — the shapes are ratified, the
// rates are not. Exported so the debug panel can bind sliders straight onto them.

export const DAMAGE_PARAMS = {
  // Wear enabled at all. When false, `step()` holds every track at NOMINAL_CONDITION (see below) —
  // it does NOT freeze components where they are (owner, 2026-08-19).
  enabled: true,

  // The condition a used vehicle sits at in this game. Damage-disabled locks here.
  nominalCondition: 0.75,

  // ── Effect curves ───────────────────────────────────────────────────────────────────────────────
  // "Most of the reduction in the last 30% of health" — a two-segment line with a knee. Above the
  // knee the component is nearly as good as new; below it, it falls off a cliff. `kneeResponse()`.
  springKnee: 0.30, springAtKnee: 0.90, springAtZero: 0.25,
  damperKnee: 0.30, damperAtKnee: 0.90, damperAtZero: 0.25,
  brakeKnee:  0.30, brakeAtKnee:  0.90, brakeAtZero:  0.25,
  // Engine is the one curve the owner specified exactly: 100→20% costs 10% of torque, 20→0% costs
  // another 50%.
  engineKnee: 0.20, engineAtKnee: 0.90, engineAtZero: 0.40,
  // Tires: condition scales the friction coefficient directly. Linear from new to bald is fine —
  // a half-worn tire really is meaningfully worse, unlike a half-worn spring.
  tireMuAtZero:      0.55,   // paved:  μ multiplier at 0% condition
  tireMuAtZeroDirt:  0.35,   // dirt:   worse, per the ratified rule (loose surface, no tread bite)

  // ── Wear rates (insult per unit → condition) ────────────────────────────────────────────────────
  // Each `dur*` is a DURABILITY in the integrated units of that track's signal. Condition falls by
  // insult/durability, so a bigger number = a tougher part. Upgrades raise these.

  // Tires: slip velocity × time DOMINATES; cornering force × time is a minor contribution.
  //   insult = slipVel[m/s]·dt  +  wCorner · |Flat|[N]·dt
  durTire:        4000,      // m of accumulated sliding to destroy a tire
  tireWCorner:    2.0e-4,    // N·s → m-equivalent. At 5 kN cornering that is 1 m/s of "slip".
  tireSlipFloor:  0.15,      // m/s — no-harm floor. Rolling slip is not abrasion.

  // Brakes: ∫(brake torque × time), summed over the axle pair.
  durBrake:       3.0e6,     // N·m·s per axle to destroy the pads

  // Engine: f(rpm, torque, load) — deliberately VERY slow. Normalised so 1.0 = redline at full load.
  durEngine:      2.0e5,     // normalised load-seconds
  engineRPMExp:   2.0,       // rpm term exponent — revving hurts superlinearly

  // Springs: bump-stop force above a no-harm floor (ratified: light contact is harmless).
  durSpring:      3.0e6,     // N·s per axle
  springForceFloor: 3000,    // N — below this, bump-stop contact costs nothing

  // Dampers: high suspension displacement RATE above a no-harm floor.
  durDamper:      1.2e4,     // (m/s)·s per axle
  damperVelFloor: 0.35,      // m/s — normal ride motion is free
}

// ── Curves ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Two-segment "cliff at the end" response.
 *
 * Above `knee` the multiplier falls gently from 1 to `atKnee`; below it, steeply from `atKnee` to
 * `atZero`. This is the ratified shape for springs, dampers, brakes and the engine — a part that is
 * 60% worn should still mostly work, and a part that is 90% worn should not.
 *
 * @param {number} c - condition in [0, 1].
 * @param {number} knee - condition at which the cliff starts (e.g. 0.30).
 * @param {number} atKnee - multiplier at the knee (e.g. 0.90).
 * @param {number} atZero - multiplier at zero condition (e.g. 0.25).
 * @returns {number} effect multiplier.
 */
export function kneeResponse (c, knee, atKnee, atZero) {
  const x = c < 0 ? 0 : c > 1 ? 1 : c
  if (x >= knee) {
    // 1.0 at c=1 → atKnee at c=knee
    const t = (1 - x) / (1 - knee)
    return 1 + (atKnee - 1) * t
  }
  // atKnee at c=knee → atZero at c=0
  const t = (knee - x) / knee
  return atKnee + (atZero - atKnee) * t
}

// ── The model ─────────────────────────────────────────────────────────────────────────────────────

export class DamageModel {
  /**
   * @param {object} [opts]
   * @param {object} [opts.params] - RANGER_PARAMS. The effect multipliers are written onto this
   *   object every step, in the `params._` scratch convention. Physics reads them; nothing else.
   * @param {number} [opts.initial] - starting condition for every track (default 1 = new truck).
   *   The jalopy generator replaces this with a seeded roll later in SM-3.
   */
  constructor (opts = {}) {
    this.params = opts.params || null
    /** @type {Record<string, number>} condition per track id, [0, 1]. */
    this.condition = {}
    const c0 = opts.initial ?? 1
    for (const id of TRACK_IDS) this.condition[id] = c0

    // Per-axle wear accumulators, so a partially-integrated insult is never lost between steps.
    this._durabilityScale = {}     // track id → multiplier from fitted parts (1 = stock)
  }

  /** Condition of one track, [0, 1]. */
  get (id) { return this.condition[id] ?? 1 }

  /** Set one track's condition directly (debug poke, jalopy roll, repair). Clamped to [0, 1]. */
  set (id, v) {
    if (!(id in this.condition)) return
    this.condition[id] = v < 0 ? 0 : v > 1 ? 1 : v
  }

  /** Nudge one track by a delta (the debug −25/−5/+5/+25 buttons). */
  adjust (id, delta) { this.set(id, this.get(id) + delta) }

  /** Set every track at once (damage-disable lock, new run). */
  setAll (v) { for (const id of TRACK_IDS) this.set(id, v) }

  /**
   * Durability multiplier for a track — the parts lever (SM-INV-10). A heavy-duty spring sets this
   * above 1 and simply takes longer to sag; nothing else in the model changes.
   */
  setDurability (id, scale) { this._durabilityScale[id] = scale }
  _dur (id, base) { return base * (this._durabilityScale[id] ?? 1) }

  /**
   * Apply an insult to one track. `insult` is in that track's integrated signal units; `durability`
   * is how many of those units it takes to go from new to destroyed.
   */
  wear (id, insult, durability) {
    if (insult <= 0) return
    this.condition[id] = Math.max(0, this.get(id) - insult / this._dur(id, durability))
  }

  // ── Effect multipliers (what the physics stack reads) ───────────────────────────────────────────

  /** Per-tire friction multiplier. `dirt` selects the harsher loose-surface falloff. */
  tireMuScale (wheelIndex, dirt = false) {
    const id = ['tireFL', 'tireFR', 'tireRL', 'tireRR'][wheelIndex]
    const atZero = dirt ? DAMAGE_PARAMS.tireMuAtZeroDirt : DAMAGE_PARAMS.tireMuAtZero
    const c = this.get(id)
    return atZero + (1 - atZero) * c
  }

  brakeScale (rear) {
    const P = DAMAGE_PARAMS
    return kneeResponse(this.get(rear ? 'brakeRear' : 'brakeFront'), P.brakeKnee, P.brakeAtKnee, P.brakeAtZero)
  }

  springScale (rear) {
    const P = DAMAGE_PARAMS
    return kneeResponse(this.get(rear ? 'springRear' : 'springFront'), P.springKnee, P.springAtKnee, P.springAtZero)
  }

  damperScale (rear) {
    const P = DAMAGE_PARAMS
    return kneeResponse(this.get(rear ? 'damperRear' : 'damperFront'), P.damperKnee, P.damperAtKnee, P.damperAtZero)
  }

  engineScale () {
    const P = DAMAGE_PARAMS
    return kneeResponse(this.get('engine'), P.engineKnee, P.engineAtKnee, P.engineAtZero)
  }

  /**
   * Publish every effect multiplier onto `params._*`. Called at the end of step(), and once at
   * construction time, so the physics stack always sees a defined value.
   */
  publish (params = this.params) {
    if (!params) return
    const mu = params._tireMuScale || (params._tireMuScale = [1, 1, 1, 1])
    for (let i = 0; i < 4; i++) mu[i] = this.tireMuScale(i)
    params._brakeScaleFront  = this.brakeScale(false)
    params._brakeScaleRear   = this.brakeScale(true)
    params._springScaleFront = this.springScale(false)
    params._springScaleRear  = this.springScale(true)
    params._damperScaleFront = this.damperScale(false)
    params._damperScaleRear  = this.damperScale(true)
    params._engineDamageScale = this.engineScale()
  }

  /**
   * Integrate one physics step of wear.
   *
   * Reads ONLY published vehicleState signals — see the seam note at the top of this file. Every
   * signal is the honest one the sim already computes; none of them is a proxy invented for damage.
   *
   * @param {object} vehicleState - the live vehicle state.
   * @param {object} params - RANGER_PARAMS (effect multipliers are written back onto it).
   * @param {number} dt - fixed physics timestep [s].
   */
  step (vehicleState, params, dt) {
    const P = DAMAGE_PARAMS

    // Damage disabled: hold everything at the nominal used-truck condition. Deliberately NOT a
    // freeze — a debug session should always start from the same known state (owner, 2026-08-19).
    if (!P.enabled) {
      this.setAll(P.nominalCondition)
      this.publish(params)
      return
    }

    const slipVel  = vehicleState.slipVel
    const tireFlat = vehicleState.tireFlat
    const bumpF    = vehicleState.bumpForce
    const brakeT   = vehicleState.brakeTorque
    const strutVel = vehicleState.strutCompVel

    // ── Tires: slip velocity × time (dominant) + cornering force × time (minor) ────────────────
    if (slipVel) {
      const ids = ['tireFL', 'tireFR', 'tireRL', 'tireRR']
      for (let i = 0; i < 4; i++) {
        const v = Math.max(0, (slipVel[i] || 0) - P.tireSlipFloor)
        const f = Math.abs(tireFlat?.[i] || 0)
        if (v <= 0 && f <= 0) continue
        this.wear(ids[i], (v + P.tireWCorner * f) * dt, P.durTire)
      }
    }

    // ── Brakes: ∫(brake torque × time), per axle pair ──────────────────────────────────────────
    if (brakeT) {
      const front = Math.abs(brakeT[0] || 0) + Math.abs(brakeT[1] || 0)
      const rear  = Math.abs(brakeT[2] || 0) + Math.abs(brakeT[3] || 0)
      this.wear('brakeFront', front * dt, P.durBrake)
      this.wear('brakeRear',  rear  * dt, P.durBrake)
    }

    // ── Springs: bump-stop force above the no-harm floor, per axle pair ────────────────────────
    // Ratified anchor: light bump-stop contact is harmless, hard contact is not. The floor IS that
    // rule — it is not a tuning fudge.
    if (bumpF) {
      const fF = Math.max(0, Math.abs(bumpF[0] || 0) - P.springForceFloor)
                + Math.max(0, Math.abs(bumpF[1] || 0) - P.springForceFloor)
      const fR = Math.max(0, Math.abs(bumpF[2] || 0) - P.springForceFloor)
                + Math.max(0, Math.abs(bumpF[3] || 0) - P.springForceFloor)
      this.wear('springFront', fF * dt, P.durSpring)
      this.wear('springRear',  fR * dt, P.durSpring)
    }

    // ── Dampers: suspension displacement rate above the no-harm floor, per axle pair ───────────
    // OPEN RISK (owner, 2026-08-19): this may not have the fidelity to decide honestly when a
    // damper should take damage. strutCompVel is the real strut velocity the suspension ODE
    // integrates, so it is the honest signal — but it is a 4-substep explicit-Euler quantity and
    // may be too noisy. If the washboard test says so, that is a finding to report, not to paper
    // over with a proxy.
    if (strutVel) {
      const vF = Math.max(0, Math.abs(strutVel[0] || 0) - P.damperVelFloor)
                + Math.max(0, Math.abs(strutVel[1] || 0) - P.damperVelFloor)
      const vR = Math.max(0, Math.abs(strutVel[2] || 0) - P.damperVelFloor)
                + Math.max(0, Math.abs(strutVel[3] || 0) - P.damperVelFloor)
      this.wear('damperFront', vF * dt, P.durDamper)
      this.wear('damperRear',  vR * dt, P.durDamper)
    }

    // ── Engine: f(rpm, torque, load), very slow ────────────────────────────────────────────────
    const dtr = vehicleState.drivetrain
    if (dtr) {
      const idle    = params.engineIdleRPM || 750
      const redline = params.engineRedlineRPM || 5500
      const rpmN    = Math.max(0, ((dtr.engineRPM || idle) - idle) / (redline - idle))
      const loadN   = Math.max(0, Math.min(1, vehicleState.throttle || 0))
      const insult  = Math.pow(rpmN, P.engineRPMExp) * loadN
      if (insult > 0) this.wear('engine', insult * dt, P.durEngine)
    }

    this.publish(params)
  }
}
