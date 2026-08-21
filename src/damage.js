/**
 * src/damage.js — SM-3 component condition model.
 *
 * ONE framework, 26 per-component condition tracks in eight classes. Every track carries a
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
  headlightL: { label: 'Headlight L', cls: 'headlights', regions: ['front'], side: 'left'  },
  headlightR: { label: 'Headlight R', cls: 'headlights', regions: ['front'], side: 'right' },

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
  // springAtZero RAISED to 0.50 on 2026-08-20 (owner). At 0.25 the truck sat down on its bump stops
  // and stopped being drivable. A real spring never yields flat — it always keeps some elastic — so
  // half rate is both the playable floor and the honest one.
  springKnee: 0.30, springAtKnee: 0.90, springAtZero: 0.50,
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
  // FITTED by test/calibrate-wear.mjs. RE-ANCHORED 2026-08-20: the owner rejected the old rate as
  // roughly 100x too slow — a continuous one-wheel peel took 400 minutes to destroy a tire, and it
  // should take about five. Five minutes of peel IS the anchor now, and it is a much better one than
  // the old duty-cycle assumption because there is nothing in it to argue about. The peel measures
  // 26.8 insult/s against the real stepPhysics.
  //
  // What it implies, which is the part with economy consequences: ~3 h of HARD driving (25% of the
  // hour at the grip limit) destroys a tire, against ~266 h of gentle cruising. That spread is the
  // point — driving badly is what costs rubber.
  // DOUBLED again on 2026-08-20: five minutes of peel was a touch too quick in play, so ten.
  durTire:        16100,     // m of accumulated sliding to destroy a tire
  tireWCorner:    2.0e-4,    // N·s → m-equivalent. At 5 kN cornering that is 1 m/s of "slip".
  tireSlipFloor:  0.15,      // m/s — no-harm floor. Rolling slip is not abrasion.

  // Brakes: ∫(brake torque × time), summed over the axle pair.
  // FITTED likewise: 120 h of hard driving costs 20% of the FRONT pads (15% of the hour on the brakes
  // at 60% pedal → 234 N·m mean on the front axle). The rear axle shares this constant and therefore
  // reaches the same wear at ~347 h — fronts wearing roughly twice as fast is how brakes really
  // behave, so this is the model being honest rather than a calibration miss.
  //
  // 10x FASTER as of 2026-08-20 (owner): at the fitted rate pads would never wear out inside a run,
  // which makes them a component the player never thinks about. The fitted number stays the
  // provenance — this is that number, deliberately overridden by a factor of ten.
  durBrake:       5.05e7,    // N·m·s per axle to destroy the pads

  // Engine: f(rpm, torque, load) — deliberately VERY slow. Normalised so 1.0 = redline at full load.
  durEngine:      2.0e5,     // normalised load-seconds
  engineRPMExp:   2.0,       // rpm term exponent — revving hurts superlinearly

  // Springs: bump-stop EVENTS, priced on the PEAK force of each one.
  //
  // This used to integrate force x time above the floor, and that was the wrong SHAPE, not a wrong
  // coefficient (owner diagnosed it, 2026-08-20). A 40 mph ramp landing peaks at 21 kN — seven
  // times the floor — but the spike lasts about 15 ms, so a time integral barely saw it, and
  // hammering the stops was nearly free. What actually takes the set out of a spring is peak
  // STRESS, once: a spring that sees 20 kN for an instant is damaged, one that sees 4 kN all day
  // is not. So each bump-stop contact is now one event, priced on its peak, square-law.
  //
  //   damage = ((F_peak − floor) / (springBumpFullN − floor))^2, per corner, onto that axle's track
  //
  // Measured on the lab ramp: a 30 mph landing costs the front axle ~3% (about 32 landings), a
  // 40 mph landing ~6% (about 16). durSpring no longer applies to this track — the curve IS the
  // calibration — but the parts durability multiplier and the wear-speed slider still do.
  springForceFloor: 3000,    // N — below this, bump-stop contact costs nothing at all
  springBumpFullN:  85000,   // N — a single bump-stop hit this hard destroys the spring outright
  springBumpExp:    2,       // square law: peak stress, the same reason armor is square-law

  // Dampers: suspension displacement RATE above a no-harm floor.
  // Two changes on 2026-08-20 (owner: "basically no damper wear, make it more sensitive to wheel
  // velocity"). The FLOOR was the real culprit — at 0.35 m/s almost all ordinary ride motion was
  // free, so only crashes wore a damper at all, which is backwards: a damper's whole life is
  // ordinary ride motion. Lowered to 0.10 so normal travel counts, and the rate raised 10x on top.
  durDamper:      1.2e3,     // (m/s)·s per axle
  damperVelFloor: 0.10,      // m/s — only near-static motion is free now

  // ── Impacts ─────────────────────────────────────────────────────────────────────────────────────
  // Calibrated by the owner in mph (2026-08-19), but the MEASURED quantity is the contact manifold's
  // normal impulse in N·s — see impactSpeed() for why that distinction is the whole point.
  //
  // Each entry is (damage at 10 mph, damage at 60 mph) with NO armor in the way. Two points define a
  // power law, damage = d10·(v/10mph)^n with n = ln(d60/d10)/ln 6:
  //
  //     armor / headlight   0.10 → 1.00   n = 1.285
  //     radiator            0.05 → 0.50   n = 1.285
  //     engine              0.01 → 0.20   n = 1.672
  //
  // Worth knowing: n = 1 would be damage proportional to IMPULSE, n = 2 proportional to KINETIC
  // ENERGY. The ratified curve sits between them, so this is a fitted law, not either textbook one.
  //
  // ARMOR IS THE EXCEPTION and uses the other shape below (owner, 2026-08-20): the body panels were
  // about 4x too sensitive at low speed, so they get a FLOOR they must clear, saturate at 80 mph
  // rather than 60, and rise as the SQUARE of speed. Square-law is the honest choice for sheet metal
  // — a panel deforms by absorbing energy, and energy goes as v². It is why a parking-lot tap now
  // costs almost nothing while a real crash still writes the truck off.
  //
  //     20 mph  24% → 2%     30 mph  42% → 8%     45 mph  73% → 25%     60 mph  100% → 51%
  //
  // The components keep the two-point law: the owner judged them about right as they are.
  impactArmor:     { floorMph: 10, fullMph: 80, n: 2 },
  impactHeadlight: { d10: 0.10, d60: 1.00 },
  impactRadiator:  { d10: 0.05, d60: 0.50 },
  impactEngine:    { d10: 0.01, d60: 0.20 },
  // Not owner-specified — starting values, to be tuned by feel like the springs and dampers.
  // Wheels sit behind the armor and want a THRESHOLD (owner, 2026-08-20): a light knock should not
  // bend a rim at all, a real collision should. Floored square law, same shape as the armor curve.
  impactWheel:     { floorMph: 15, fullMph: 80, n: 2 },
  impactSpring:    { d10: 0.03, d60: 0.30 },
  impactDamper:    { d10: 0.03, d60: 0.30 },

  // Armor absorbs a fraction of what it stands in front of, proportional to its own condition.
  // Owner anchors: 90% absorbed at full health, 10% absorbed at 10% health. Straight proportionality
  // hits both (it gives 9% at 10% health), so the simple form IS the ratified curve.
  armorAbsorbAtFull: 0.90,

  // Alignment: nothing below 30 mph, full displacement at 80 mph. At full displacement a wheel picks
  // up ~2° of camber and ~0.5° of toe, randomly signed and randomly split between the two.
  alignMinMph:     30,
  alignMaxMph:     80,
  alignMaxCamberDeg: 2.0,
  alignMaxToeDeg:    0.5,
  // Bump-stop CROSSTALK (owner, 2026-08-20): hitting a bump really hard is what throws a real
  // truck's alignment out, so a hard enough bump-stop event bends the geometry of the corner that
  // took it — not just its spring. The floor is deliberately HIGH and well clear of the spring
  // track's: ordinary bottoming-out must never touch alignment, or every rough road would knock
  // the truck out of line. For scale, a 30 mph ramp landing peaks around 16 kN and does nothing
  // here; 40 mph peaks around 21 kN and bends it slightly.
  alignBumpFloorN: 18000,    // N — below this a bump-stop hit costs alignment nothing
  alignBumpFullN:  60000,    // N — a hit this hard is a full-severity bend
  alignBumpScale:  0.5,      // a bump bends less than a crash of the same severity does

  // Death: a hit at or above this equivalent speed is the fatal-crash fail state (SM-INV-1).
  //
  // NOTE (2026-08-20): this used to coincide with the armor curve topping out, so total armor loss
  // and death were the same impact. The re-anchor moved armor's write-off speed to 80 mph and left
  // death at 60, because the owner's tuning pass was about panel sensitivity and said nothing about
  // the fail state. They are now DIFFERENT speeds and that is UNRESOLVED, not settled — a single
  // survivable hit can no longer destroy a bumper outright; it takes an accumulation. Raise it.
  fatalMph:        60,
  fatalEnabled:    true,

  // ── Wheels ─────────────────────────────────────────────────────────────────────────────────
  // A bent wheel is out-of-round, and out-of-round is a REAL thing in the sim (params.wheelRunout,
  // src/suspension.js) rather than a handling penalty invented for damage. Ratified: 0.04 m
  // peak-to-peak at zero condition — a wheel so far gone the truck shakes itself apart at speed.
  wheelRunoutAtZero: 0.04,

  // ── What bends a rim ───────────────────────────────────────────────────────────────────────
  // Two events, no continuous wear: a crash hard enough to reach the wheel through the armor
  // (impactWheel above), and a RIM STRIKE — the tire bottoming out against a pothole edge or a
  // kerb until there is no rubber left between the road and the rim flange.
  //
  // The rim strike is thresholded on TIRE DEFLECTION, because that is the quantity physically
  // between the road and the wheel: the load path is road → carcass → RIM → strut, so the carcass
  // is what decides whether the flange ever touches down. Strut travel is DOWNSTREAM of the rim
  // (you can bottom the suspension smoothly on a long landing without a strike, and strike a rim on
  // a sharp edge without the strut running out of travel); strut acceleration is downstream again.
  //
  // WHY THE THRESHOLD IS A MULTIPLE OF STATIC DEFLECTION, and not the sidewall height.
  // The physically right anchor is the sidewall (wheelRadius − rimRadius = 165 mm): past that there
  // is no rubber left. But this sim's tire is a LINEAR spring with no bottoming — tireStiffness ×
  // depth, unbounded — so `depth` is an honest carcass deflection near static load and pure fiction
  // past it. Measured: a 4 m drop reports 361 mm of "deflection", more than twice the sidewall, with
  // the rim 200 mm underground. Thresholding on the real dimension therefore fires on drops that
  // should not scratch a wheel.
  //
  // A multiple of STATIC deflection (mass·g / 4 / tireStiffness ≈ 33 mm) is the ratio a linear
  // spring does represent honestly, and it tracks the tire spring and the vehicle mass if either is
  // retuned — which a fixed 165 mm would not. Calibrated against measured drops: 0.5 m does nothing,
  // 0.9 m costs about 1%, 1.5 m about 11%, 4 m writes the wheel off.
  //
  // If the tire model ever gets a progressive / bottoming rate, move this back to the sidewall —
  // that anchor is the better one the moment `depth` means what it says.
  wheelStrikeStaticMult:     6.6,   // x static deflection (≈220 mm): where the rim starts taking load
  wheelStrikeFullStaticMult: 4.2,   // x static deflection BEYOND that (≈140 mm): writes the wheel off
  wheelStrikeExp:            2,

  // ── Live tuning multipliers ────────────────────────────────────────────────────────────────
  // Per-class wear SPEED, 1 = the calibrated rate above. These exist so wear can be tuned by feel
  // from the debug panel during a drive — which is how every one of these rates has actually been
  // set — instead of through a code edit and a reload each time. They multiply the insult, so 2
  // means "wears twice as fast".
  //
  // They are a TUNING surface, not part of the model: anything that settles here should be folded
  // back into the dur* constant it scales and the multiplier returned to 1, so there is one number
  // per rate rather than two that have to be read together.
  wearScale: { tire: 1, brake: 1, spring: 1, damper: 1, wheel: 1, engine: 1 },

  // ── Contact → impact gating (feedContact) ──────────────────────────────────────────────────
  // A contact is not an impact. The engine reports a manifold every step a body is touching
  // anything, so a truck parked against a fence would be "hit" 250 times a second. Two guards:
  //
  // impactMinMph — the floor a contact must clear to be an impact at all. Resting on the ground is
  //   worth about 0.09 mph equivalent (one step of the truck's own weight), so 2 mph clears the
  //   noise by more than an order of magnitude while still catching a gentle nudge into a post.
  // impactHoldMax — how long one collision is allowed to keep building before it is banked and a
  //   fresh one is armed. A real crash peaks in tens of milliseconds; this only matters for a
  //   sustained scrape along a wall, which becomes a series of hits rather than one endless one.
  impactMinMph:    2,
  impactHoldMax:   0.25,
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

// ── Impacts ───────────────────────────────────────────────────────────────────────────────────────

export const MPH = 0.44704            // m/s per mph

/**
 * Equivalent impact speed, in m/s, for a measured contact impulse.
 *
 * The engine reports `totalNormalImpulse` off the contact manifold — N·s, the time integral of the
 * contact force. That is deliberately NOT the vehicle's Δv:
 *
 *   · a glancing clip off a mailbox at 60 mph transfers almost no impulse → almost no damage
 *   · a square hit into rock transfers the full m·v → full damage
 *
 * Pricing damage on impulse means the SEVERITY OF THE CONTACT drives it, which is the ratified
 * intent (owner, 2026-08-19). Δv enters only as the unit conversion below: for the reference square,
 * dead-stop collision, impulse = m·v, so `v_eq = J/m` reads as "the speed this hit would have shed
 * had it stopped the truck dead". That is what the mph calibration numbers are quoted against.
 *
 * @param {number} impulseNs - contact normal impulse [N·s].
 * @param {number} mass - vehicle mass [kg].
 * @returns {number} equivalent impact speed [m/s].
 */
export function impactSpeed (impulseNs, mass) {
  return mass > 0 ? Math.abs(impulseNs) / mass : 0
}

/**
 * Damage fraction for one impact. Two curve shapes, because the owner calibrated the two kinds of
 * part differently, and forcing them into one form would misrepresent one of them.
 *
 * **Two-point power law** — `{d10, d60}`, the damage an UNPROTECTED component takes at 10 and 60
 * mph. Those fix damage = d10·(v/10mph)^n with n = ln(d60/d10)/ln 6. This is the components: engine,
 * radiator, headlights, wheels, springs, dampers. There is no floor, because a small knock really
 * does cost a headlight a little.
 *
 * **Floored saturating law** — `{floorMph, fullMph, n}`, giving
 * ((v − floor)/(full − floor))^n, zero below the floor. This is the ARMOR (owner, 2026-08-20). Body
 * panels needed three things the power law could not give at once: nothing at all below a threshold,
 * a defined write-off speed, and a square-law rise so low-speed taps stay cheap while real crashes
 * stay expensive. A parking-lot nudge should cost a bumper nothing, and no two-point power law
 * anchored above zero can express "nothing".
 *
 * Returns 0..1, uncapped above 1 so the fatal check can see how far over it went; callers clamp.
 *
 * @param {number} v - equivalent impact speed [m/s], from impactSpeed().
 * @param {{d10:number,d60:number}|{floorMph:number,fullMph:number,n:number}} curve
 */
export function impactDamage (v, curve) {
  if (v <= 0) return 0
  if (curve.floorMph !== undefined) {
    const floor = curve.floorMph * MPH, full = curve.fullMph * MPH
    if (v <= floor) return 0
    return Math.pow((v - floor) / (full - floor), curve.n)
  }
  const v10 = 10 * MPH
  const n = Math.log(curve.d60 / curve.d10) / Math.log(6)
  return curve.d10 * Math.pow(v / v10, n)
}

/**
 * Fraction of an impact that armor at condition `c` lets THROUGH to what it protects.
 *
 * Ratified: 90% absorbed at full health, 10% absorbed at 10% health. Proportional absorption hits
 * both anchors, so absorbed = 0.9·c and passed = 1 − 0.9·c. Destroyed armor passes everything.
 */
export function armorPassThrough (c) {
  const p = 1 - DAMAGE_PARAMS.armorAbsorbAtFull * (c < 0 ? 0 : c > 1 ? 1 : c)
  return p < 0 ? 0 : p
}

/**
 * Deterministic PRNG (mulberry32) for the alignment scatter.
 *
 * Alignment damage is random by design, but the world is a determinism machine (INFRA-03) and gates
 * pin exact states. So the randomness is SEEDED and advances only when an impact actually lands —
 * same run, same drive, same crashes, same bent axle. This is FEAT-26's flag-gated-nondeterminism
 * pattern applied to damage.
 */
const clampAbs = (x, m) => (x >  m ? m : x < -m ? -m : x)

function mulberry32 (seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
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

    this._durabilityScale = {}     // track id → multiplier from fitted parts (1 = stock)

    // Alignment is not a multiplier like the other tracks — it is bent GEOMETRY. Per-wheel toe and
    // camber offsets in degrees, accumulated by impacts, consumed by the suspension geometry.
    this.toeOffsetDeg    = [0, 0, 0, 0]
    this.camberOffsetDeg = [0, 0, 0, 0]

    // Seeded so a run replays identically (INFRA-03). Advances only when an impact lands.
    this._rand = mulberry32(opts.seed ?? 0x5A17)

    // Set by applyImpact when a hit exceeds the fatal threshold; the run layer reads and clears it.
    this.fatalImpact = null

    // In-flight collision burst tracked by feedContact: { region, impulse, t }, or null.
    this._burst = null

    // Peak bump-stop force per corner while a stop is currently loaded; 0 when it is not.
    this._bumpPeak = [0, 0, 0, 0]

    // Peak tire deflection per corner while that tire is past the rim-strike point; 0 when it is not.
    this._strikePeak = [0, 0, 0, 0]

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
    const scale = DAMAGE_PARAMS.wearScale[TRACKS[id].cls] ?? 1
    if (scale <= 0) return
    this.condition[id] = Math.max(0, this.get(id) - insult * scale / this._dur(id, durability))
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
   * Feed one step's worth of raw contact readout and let the model decide whether that is an
   * impact worth landing. This is the entry point the game loop calls; `applyImpact` below is the
   * entry point an impact goes through once one has been recognised.
   *
   * A collision is a BURST, not an instant. The engine reports a manifold on every step the bodies
   * are touching, so the same crash arrives as a few dozen consecutive readings that rise to a peak
   * and fall away. Landing each of them separately would price one crash as dozens, and — worse —
   * would let a truck resting against a wall grind itself to scrap while parked. So this holds the
   * PEAK of the burst and banks it once, when contact drops back below the floor (or when the
   * burst has run longer than `impactHoldMax`, which turns a sustained scrape into repeated hits
   * rather than one that never ends).
   *
   * Peak, not sum: the ratified model prices a hit on how hard the contact was, and adding up the
   * impulses of one collision would price it on how long the truck stayed leaning on the thing it
   * had already hit.
   *
   * @param {'front'|'left'|'right'|'rear'|null} region - from classifyImpactRegion; null (a ground
   *   or roof contact, which no armor covers) closes any burst in progress and starts nothing.
   * @param {number} impulseNs - max contact normal impulse this step [N·s].
   * @param {number} mass - vehicle mass [kg].
   * @param {number} dt - physics step [s].
   * @returns {{region, v, passed, fatal}|null} the landed impact, or null on a step that banked none.
   */
  feedContact (region, impulseNs, mass, dt) {
    const P = DAMAGE_PARAMS
    const live = region != null && impactSpeed(impulseNs, mass) >= P.impactMinMph * MPH

    if (live) {
      if (!this._burst) this._burst = { region, impulse: impulseNs, t: 0 }
      else {
        this._burst.t += dt
        // The region travels with the peak: a truck that clips a post front-first and slews into it
        // sideways took its worst hit on whichever face was loaded hardest.
        if (impulseNs > this._burst.impulse) { this._burst.impulse = impulseNs; this._burst.region = region }
      }
      if (this._burst.t < P.impactHoldMax) return null
    }
    const b = this._burst
    if (!b) return null
    this._burst = null
    return { region: b.region, ...this.applyImpact(b.region, b.impulse, mass) }
  }

  /**
   * Land one impact on one armor region.
   *
   * The ONLY entry point for collision damage. Armor takes its own damage on the same curve, and
   * what reaches the components behind it is scaled by how intact that armor was BEFORE the hit —
   * so the bumper you already crushed is the reason the next tap kills the radiator.
   *
   * @param {'front'|'left'|'right'|'rear'} region - which armor piece took it.
   * @param {number} impulseNs - contact normal impulse [N·s], straight from the engine manifold.
   * @param {number} mass - vehicle mass [kg], for the impulse → equivalent-speed conversion.
   * @returns {{v: number, passed: number, fatal: boolean}} what the hit was worth, for logging.
   */
  applyImpact (region, impulseNs, mass) {
    const P = DAMAGE_PARAMS
    const v = impactSpeed(impulseNs, mass)
    if (v <= 0) return { v: 0, passed: 1, fatal: false }

    // Armor condition BEFORE this hit decides what gets through — a hit cannot protect itself.
    const armorId = ARMOR_REGIONS[region]
    const passed  = armorId ? armorPassThrough(this.get(armorId)) : 1

    if (armorId) this.wear(armorId, impactDamage(v, P.impactArmor), 1)

    const curveFor = {
      wheel: P.impactWheel, spring: P.impactSpring, damper: P.impactDamper,
      engine: P.impactEngine, radiator: P.impactRadiator, headlights: P.impactHeadlight,
    }
    for (const id of TRACK_IDS) {
      const t = TRACKS[id]
      if (t.cls === 'armor' || t.cls === 'alignment') continue
      if (!t.regions.includes(region)) continue
      const curve = curveFor[t.cls]
      if (!curve) continue
      // Headlights are per-side and a side impact only reaches its own: a left-side hit does not
      // break the right headlight. A FRONT hit reaches both.
      if (t.cls === 'headlights' && (region === 'left' || region === 'right') && t.side !== region) continue
      this.wear(id, impactDamage(v, curve) * passed, 1)
    }

    this._bendAlignment(region, v, passed)

    // Fatal-crash fail state (SM-INV-1). Armor does NOT save you from this — the deceleration is
    // what kills, and a bumper only decides what breaks on the truck.
    const fatal = P.fatalEnabled && v >= P.fatalMph * MPH
    if (fatal && !this.fatalImpact) this.fatalImpact = { region, v, mph: v / MPH }

    return { v, passed, fatal }
  }

  /**
   * Bend the alignment of the wheels in an impact region.
   *
   * Ratified shape: nothing at all below 30 mph, ramping to a full displacement at 80 mph of about
   * 2° camber and 0.5° toe. Signs and the split between the two are random, because a bent knuckle
   * is not a tidy quantity — but the RNG is seeded, so a given run bends the same way every replay.
   */
  _bendAlignment (region, v, passed) {
    const P = DAMAGE_PARAMS
    const vMin = P.alignMinMph * MPH, vMax = P.alignMaxMph * MPH
    if (v <= vMin) return
    const sev = Math.min(1, (v - vMin) / (vMax - vMin)) * passed
    if (sev <= 0) return

    for (const id of TRACK_IDS) {
      const t = TRACKS[id]
      if (t.cls !== 'alignment' || !t.regions.includes(region)) continue
      this._bendWheel(t.wheel, sev)
    }
  }

  /**
   * Bend ONE wheel's alignment by `sev` (0..1 of a full displacement). The single write path for
   * alignment geometry — impacts and bump-stop hits both come through here, so the randomness, the
   * clamping and the condition readout cannot drift apart between the two.
   */
  _bendWheel (wheel, sev) {
    const P = DAMAGE_PARAMS
    if (sev <= 0) return
    // Two independent draws in [-1, 1] — a hit can bend camber hard and toe barely, or both.
    const dCam = (this._rand() * 2 - 1) * sev * P.alignMaxCamberDeg
    const dToe = (this._rand() * 2 - 1) * sev * P.alignMaxToeDeg
    this.camberOffsetDeg[wheel] = clampAbs(this.camberOffsetDeg[wheel] + dCam, P.alignMaxCamberDeg)
    this.toeOffsetDeg[wheel]    = clampAbs(this.toeOffsetDeg[wheel]    + dToe, P.alignMaxToeDeg)
    // The condition track is a READOUT of how bent it is, so the damage GUI and the diagnostic
    // screen have one number per wheel like every other component.
    const bent = 0.5 * (Math.abs(this.camberOffsetDeg[wheel]) / P.alignMaxCamberDeg
                      + Math.abs(this.toeOffsetDeg[wheel])    / P.alignMaxToeDeg)
    this.set(['alignFL', 'alignFR', 'alignRL', 'alignRR'][wheel], 1 - bent)
  }

  /**
   * Land one completed RIM STRIKE on one corner: the tire bottomed out hard enough that the rim
   * flange took load. `excessM` is how far the deflection went past the sidewall fraction where
   * the rubber runs out — the only thing that decides how bad it was.
   */
  _landRimStrike (corner, excessM, staticDefl) {
    const P = DAMAGE_PARAMS
    if (excessM <= 0) return
    const full = P.wheelStrikeFullStaticMult * staticDefl
    const dmg = Math.pow(Math.min(1, excessM / full), P.wheelStrikeExp)
    this.wear(['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR'][corner], dmg, 1)
  }

  /**
   * Static tire deflection [m] — one corner's share of the vehicle's weight on the tire spring.
   * The scale the rim-strike thresholds are expressed in; see the note in DAMAGE_PARAMS for why
   * this, and not the sidewall height, is the honest ruler for a linear tire spring.
   */
  static staticTireDeflection (params) {
    const k = params.tireStiffness || 0
    return k > 0 ? (params.mass || 0) * 9.81 / 4 / k : 0
  }

  /**
   * Land one completed bump-stop event on one corner: the suspension bottomed out, and this is how
   * hard it hit. Wears that axle's spring on the peak-force curve, and — only if the hit was hard
   * enough to clear the much higher alignment floor — bends that corner's geometry too.
   *
   * @param {number} corner - 0-3 (FL, FR, RL, RR).
   * @param {number} peakN - peak bump-stop force during the event [N].
   */
  _landBumpStop (corner, peakN) {
    const P = DAMAGE_PARAMS
    if (peakN <= P.springForceFloor) return

    // Spring: square law between the no-harm floor and the one-hit-kills force.
    const t = (peakN - P.springForceFloor) / (P.springBumpFullN - P.springForceFloor)
    const dmg = Math.pow(Math.max(0, t), P.springBumpExp)
    const id = corner < 2 ? 'springFront' : 'springRear'
    // durability 1 = the insult IS the damage fraction, the same idiom applyImpact uses. There is
    // no durSpring any more: for an event-priced track the CURVE is the calibration. The parts
    // durability multiplier (SM-INV-10) and the wear-speed slider still apply inside wear().
    this.wear(id, dmg, 1)

    // Alignment crosstalk: only really hard bumps, per the owner's floor.
    if (peakN > P.alignBumpFloorN) {
      const sev = Math.min(1, (peakN - P.alignBumpFloorN) / (P.alignBumpFullN - P.alignBumpFloorN))
      this._bendWheel(corner, sev * P.alignBumpScale)
    }
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
    // Alignment is geometry, not a multiplier — published as the raw per-wheel offsets the
    // suspension applies on top of the static toe/camber. Slice 3 consumes these.
    params._toeOffsetDeg    = this.toeOffsetDeg
    params._camberOffsetDeg = this.camberOffsetDeg
    // Per-wheel out-of-round, in metres peak-to-peak. Added to the params.wheelRunout slider so
    // that slider stays usable on its own as a test tool with damage off.
    const ro = params._wheelRunout || (params._wheelRunout = [0, 0, 0, 0])
    for (let i = 0; i < 4; i++) ro[i] = this.wheelRunout(i, params)
  }

  /**
   * Out-of-round for one wheel, in metres peak-to-peak — the effective value physics should use.
   *
   * Linear in condition: a wheel at full health is perfectly round, one at zero carries the full
   * ratified 0.04 m. The manual `params.wheelRunout` slider adds on top so it keeps working as a
   * standalone test tool when damage is off.
   */
  wheelRunout (wheelIndex, params = this.params) {
    const c = this.get(['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR'][wheelIndex])
    return ((params && params.wheelRunout) || 0) + (1 - c) * DAMAGE_PARAMS.wheelRunoutAtZero
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

    // ── Wheels: RIM STRIKE events, per corner, on peak tire deflection ────────────────────────
    // The tire carcass is the only thing between the road and the rim, so its deflection is what
    // decides whether the flange ever touches down — not strut travel, which is downstream of the
    // wheel, and not strut acceleration, which is downstream of that. Peak-held and banked on
    // release, like every other event in this model.
    const deflect = vehicleState.tireDeflect
    if (deflect && params) {
      const staticDefl = DamageModel.staticTireDeflection(params)
      const trip = P.wheelStrikeStaticMult * staticDefl
      if (trip > 0) {
        if (!this._strikePeak) this._strikePeak = [0, 0, 0, 0]
        for (let i = 0; i < 4; i++) {
          const d = deflect[i] || 0
          if (d > trip) {
            if (d > this._strikePeak[i]) this._strikePeak[i] = d
            continue
          }
          if (this._strikePeak[i] > 0) {
            this._landRimStrike(i, this._strikePeak[i] - trip, staticDefl)
            this._strikePeak[i] = 0
          }
        }
      }
    }

    // ── Springs: bump-stop EVENTS, per corner, priced on the PEAK of each ─────────────────────
    // Hold the peak while the stop is loaded and bank it once the corner comes off it. Same shape
    // as feedContact for collisions, for the same reason: what matters is how hard the single
    // event was, not how long the truck stayed leaning on it. Ratified anchor unchanged — light
    // bump-stop contact is harmless, hard contact is not — but the floor is now the entry
    // condition for an event rather than a subtraction inside an integral.
    if (bumpF) {
      if (!this._bumpPeak) this._bumpPeak = [0, 0, 0, 0]
      for (let i = 0; i < 4; i++) {
        const f = Math.abs(bumpF[i] || 0)
        if (f > P.springForceFloor) {
          if (f > this._bumpPeak[i]) this._bumpPeak[i] = f
          continue                                  // still on the stop — keep watching
        }
        if (this._bumpPeak[i] > 0) {                // just came off it: bank the event
          this._landBumpStop(i, this._bumpPeak[i])
          this._bumpPeak[i] = 0
        }
      }
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

    // WHEELS have no continuous wear source, by design (owner, 2026-08-20): a wheel is bent by
    // being HIT, not worn out by driving. A strut-acceleration source was tried and deleted — it
    // measured 95,000 minutes to destroy a wheel, so it was not a mechanism, and strut acceleration
    // is a poor proxy for the one real non-collision case (a pothole or kerb strike) anyway. If
    // that case is ever wanted, the hook is _landBumpStop below, which is already peak-priced and
    // already bends alignment for exactly this reason — not a differenced velocity signal.

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
