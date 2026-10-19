/**
 * src/damage.js — SM-3 component condition model.
 *
 * ONE framework, 27 per-component condition tracks in eleven classes. Every track carries a
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

// Deterministic PRNG for the alignment scatter. Alignment damage is random by design, but the world
// is a determinism machine (INFRA-03) and gates pin exact states. So the randomness is SEEDED and
// advances only when an impact actually lands — same run, same drive, same crashes, same bent axle.
// This is FEAT-26's flag-gated-nondeterminism pattern applied to damage. (seed.js is pure maths, so
// the "imports nothing from the physics stack" seam below still holds.)
import { mulberry32 } from './seed.js'
import { DAY_PARAMS } from './day.js'

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
  // The air filter is a CONSUMABLE, not a component — cheap to replace, and the one track the
  // player has to watch. It clogs ONLY from the air the engine breathes.
  //
  // `regions: []` is what keeps impacts off it, and that is deliberate rather than incidental
  // (owner, 2026-08-23): a filter sits behind the grille but a crash does not clog it, and letting
  // collisions touch it would put a consumable on the armor's damage path where it does not belong.
  // The impact loop skips a track whose regions do not include the hit region, so an empty list can
  // never be reached — and there is no impact curve for the `filter` class either, so it is guarded
  // twice. Pinned in test/damage-filter-puncture.mjs.
  airFilter:  { label: 'Air Filter', cls: 'filter',     regions: [] },
  radiator:   { label: 'Radiator',   cls: 'radiator',   regions: ['front'] },
  headlightL: { label: 'Headlight L', cls: 'headlights', regions: ['front'], side: 'left'  },
  headlightR: { label: 'Headlight R', cls: 'headlights', regions: ['front'], side: 'right' },

  // Alignment — PER WHEEL, because toe and camber are per-wheel geometry and the ratified effect is
  // "random toe and camber applied to the affected wheels". Front bumper covers the front pair, rear
  // bumper the rear pair, each side its own two. alignment.js turns the offsets into steer and
  // lean (BUG-79).
  alignFL: { label: 'Alignment FL', cls: 'alignment', regions: ['front', 'left'],  wheel: 0 },
  alignFR: { label: 'Alignment FR', cls: 'alignment', regions: ['front', 'right'], wheel: 1 },
  alignRL: { label: 'Alignment RL', cls: 'alignment', regions: ['rear',  'left'],  wheel: 2 },
  alignRR: { label: 'Alignment RR', cls: 'alignment', regions: ['rear',  'right'], wheel: 3 },
}

/** Armor piece → the tracks it stands in front of. Derived, so the registry stays the one source. */
export const ARMOR_REGIONS = { front: 'armorFront', left: 'armorLeft', right: 'armorRight', rear: 'armorRear' }

export const TRACK_IDS = Object.keys(TRACKS)
// Per-corner track ids, indexed 0=FL 1=FR 2=RL 3=RR (GLOSSARY.md §Wheel Index).
const TIRE_IDS  = ['tireFL', 'tireFR', 'tireRL', 'tireRR']
const WHEEL_IDS = ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR']

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
  // Grip is FLAT-THEN-CLIFF, not linear: mu = atZero + (1 − atZero)·(1 − (1 − c)^tireMuExp).
  //
  // Linear was wrong in a way the owner named precisely — a real tire at 50% tread grips very nearly
  // like a new one, and only lets go once it is genuinely down to the wear bars. Linear charged 22%
  // of the grip for that first half of the tread, which is both unrealistic and bad play: it made
  // fresh rubber feel mandatory rather than valuable. At exponent 4 a half-worn tire keeps 97% of
  // its grip and the loss arrives where it should:
  //
  //     100%  1.00      75%  1.00      50%  0.97      25%  0.86      10%  0.71      0%  0.55
  //
  // The 0% anchor is untouched — a bald tire is still a bald tire, it just takes longer to get there.
  tireMuExp:         4,
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
  // 1.5x FASTER on 2026-10-03 (owner): ten minutes of peel became ~6.7 — 16100 / 1.5.
  durTire:        10700,     // m of accumulated sliding to destroy a tire
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
  // Units are now WATT-SECONDS (joules) per axle, not N·m·s: the track integrates friction POWER
  // since 2026-08-21, so the constant was re-fitted by calibrate-wear.mjs against the same duty
  // cycle and the same owner rate (120 h of hard driving costs 20% of the FRONT pads, 10x faster
  // than the original fit so pads actually wear out inside a run).
  durBrake:       2.31e9,    // J per axle to destroy the pads

  // Engine: f(rpm, torque, load). Normalised so 1.0 = redline at full load.
  // 10x FASTER as of 2026-08-23 (owner: "soooooooo slow"). At the fitted rate an engine outlasted
  // several runs and was a component the player never thought about — the same reason the brakes
  // were sped up. Hard driving now costs an engine in about eleven hours rather than a hundred and
  // ten, and a blocked air filter multiplies that by up to twenty on top.
  durEngine:      2.0e4,     // normalised load-seconds
  engineRPMExp:   2.0,       // rpm term exponent — revving hurts superlinearly

  // ── Engine temperature (FEAT-51, owner 2026-10-16) ─────────────────────────────────────────────
  // No coolant level and no boil-off: radiator CONDITION is the cooling capacity, directly. Heat in is
  // the drivetrain's fuelPowerW; the hardware numbers (rated capacity, thermal mass) are vehicle params
  // in data/ranger.js. The gauge reads tempThermostatC at mid, ±10 °C at the C and H marks.
  tempAmbientC:     25,
  tempThermostatC: 100,    // opens over ±2 °C around this, so a healthy truck sits at ~98-101 °C
  tempHoldC:       109,    // where both owner anchors settle (0% radiator at idle, 50% at full load)
  tempHotC:        110,    // overheat: engine damage and power loss start here
  tempMaxC:        130,    // the engine is seizing by here; the integration clamps
  tempOffTau:     3600,    // GAME s — engine off, no pump or fan: soaks back toward ambient. At the
                           //   60x clock that is a 60 s real-time constant (~4 game-hours to cold)
  overheatDerate: 0.03,    // torque lost per °C over tempHotC (knock retard), recovers as it cools
  overheatDerateFloor: 0.5,
  // 0.1% of engine per second per °C over: a minute at 115 °C costs 30%. The engine track at 0% IS
  // the blown head gasket (owner 2026-10-16) — it already never catches, so there is no second meter.
  durOverheat:    1000,    // °C·s to destroy an engine

  // ── Air filter (DESIGN.md's track, ratified into SM-3 on 2026-08-23) ────────────────────────
  // It clogs on the AIR THE ENGINE BREATHES, which is the same rpm x load quantity the engine wear
  // already integrates — airflow is what carries the dust in. That makes it emergent from a signal
  // the sim already produces rather than a timer, and it means the driving that wears the engine is
  // the driving that blinds its filter.
  //
  // Owner rate: about 30 real-world minutes of HARD driving before it needs replacing. "Hard" here
  // is the same duty cycle the tire and brake fits use — sustained high rpm under load, which reads
  // about 0.5 on this normalised insult — so 1800 s x 0.5 = 900.
  //
  // The EFFECT is the whole point and it is deliberately a cliff, not a slope: nothing measurable
  // until 20%, then engine wear multiplies hard. A filter is cheap and the warning is loud; letting
  // it bottom out silently is what kills the engine, and that asymmetry is the mechanic.
  durFilter:        900,     // normalised load-seconds to a fully blocked filter
  filterKnee:       0.20,    // below this the filter starts choking the engine
  filterEngineMult: 20,      // engine wear multiplier at a COMPLETELY blocked filter
  // FEAT-38 hook: dust exposure should multiply the clog rate on dirt roads. Not wired — the
  // per-surface plumbing does not exist yet — so the filter currently clogs at one rate everywhere.
  filterDustMult:   1,

  // Springs: bump-stop EVENTS, priced on the PEAK force of each one.
  //
  // This used to integrate force x time above the floor, and that was the wrong SHAPE, not a wrong
  // coefficient (owner diagnosed it, 2026-08-20). A 40 mph ramp landing peaks at 21 kN — seven
  // times the floor — but the spike lasts about 15 ms, so a time integral barely saw it, and
  // hammering the stops was nearly free. What actually takes the set out of a spring is peak
  // STRESS, once: a spring that sees 20 kN for an instant is damaged, one that sees 4 kN all day
  // is not. So each bump-stop contact is now one event, priced on its peak.
  //
  //   damage = refDmg · ((F_peak − floor) / (refN − floor))^exp, per corner, onto that axle's track
  //   (floor and refN are per-axle — see springForceFloorFront / springBumpRefNFront below)
  //
  // SATURATING CURVE, exp 0.6 (owner, 2026-10-12, capture 1791793263302). It was square-law, and
  // the square-law was the wrong shape for the SECOND time: a 3.5 g road sag that put 31.5 kN
  // through the front-left stop at 26 m/s cost the front springs 0.2% — the owner's call was "a bump
  // of that severity should cause 3%" — while the 2026-09-14 ruling that a 2 m landing must NOT
  // write the front off in seven stayed binding. No curve that keeps steepening can hold both: the
  // square law buys a cheap 2 m drop by making everything below it free. A sub-linear law is the
  // physical shape anyway — the coil never sees more than full-bump stress, the stop takes the rest,
  // so what a harder slam adds is the shock through the mount, not more set in the spring.
  //
  // The anchors (owner): this capture's hit 3% per corner; a 2 m drop about 7% per landing; a 10 m
  // drop about 30% per landing. Forces measured headless on flat ground, per front corner (the lab's
  // nose-first 2 m drop reads 75.6 kN, the level drop 80.8; both are quoted):
  //
  //     capture      31.5 kN   3.0%  per corner  (the ruling)
  //      1 m drop    23.0 kN   2.1%
  //      2 m drop    75.6 kN   6.1%  (level 80.8 kN: 6.4%) → ~12% per landing, ~8 landings
  //      3 m drop   136.9 kN   9.1%
  //     10 m drop   294.1 kN  14.9%  → ~30% per landing
  //
  // Two drops still write the front off in ~8 landings rather than the owner's ~14: the three
  // anchors are not on one power law, and the capture (the explicit ruling) and the 10 m drop
  // (the "blow out a spring" end) are the ones held exactly.
  //
  // durSpring no longer applies to this track — the curve IS the calibration — but the parts
  // durability multiplier and the wear-speed slider still do.
  //
  // No-harm floor, PER AXLE. The front takes noticeably more bump-stop force than the rear on any
  // landing — the truck lands nose-first and the front carries more static load — so a single floor
  // meant the front wore faster on every ordinary bump. The front's floor is the honest knob for
  // that: a statement about which hits are harmless, not a fudge on the rate (owner 2026-08-23
  // 3 -> 5 kN; 2026-09-14 5 -> 12 kN, "everything under 12 kN is free").
  // Rear 3 -> 6 kN with the curve change: a sub-linear law is STEEP just above its floor (0.6 kN
  // over a 3 kN floor was 0.4%), so a light rear touch — common, the rear rides lower — would have
  // been the dominant rear wear. Still under the front's, which is the nose-first story above.
  springForceFloorFront: 12000, // N
  springForceFloorRear:  6000,  // N
  // The reference hit: the bump-stop peak that costs ONE corner springBumpRefDmg. Per axle, and a
  // statement about the BUMP STOPS, not about the springs being tougher at one end: the front
  // jounce bumper is a long progressive elastomer that soaks up a landing before the coil sees peak
  // stress; the rear pack bottoms onto a short snubber that hands the load straight to the leaves.
  // So the same 3% genuinely costs the rear less force. Rear set so its 2 m-drop corner (46 kN
  // level) stays ~0.8× the front's 2 m-drop corner, the ratio the 2026-09-21 "rear 20% less"
  // ruling left it at: 5.4% vs 6.4%.
  springBumpRefNFront: 31500,  // N — the capture's front-left slam
  springBumpRefNRear:  21000,  // N
  // 2026-10-15 (owner, after driving the re-anchor): "springs are taking a little too much damage
  // but the damage threshold is about right" — floors stay, the reference cost drops 3% -> 2.2%.
  springBumpRefDmg:    0.022,  // one corner's loss at refN — "a bump of that severity should cause 3%", eased
  springBumpExp:       0.6,    // sub-linear: saturates, see above

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
  // Floor 15 -> 20 mph and write-off 80 -> 90 mph on 2026-10-03 (owner: wheels bent a little too
  // easily, both the threshold and the severity). Eased back to 18 / 85 on 2026-10-09 (owner:
  // suspension taking hits it should, wheels coming out untouched — a little more sensitive).
  impactWheel:     { floorMph: 18, fullMph: 85, n: 2 },
  // Springs are PER AXLE here too (owner, 2026-09-14), and the reason is EXPOSURE, not fragility —
  // the same kind of correction the bump-stop floor got. Look at what reaches each track: springFront
  // is listed against three armor regions (front, left, right), springRear against two (left, right),
  // and in play the front is simply the end a truck hits things with. One shared curve therefore wore
  // the front out several times faster from identical driving. The front's scale is cut to a third;
  // the exponent is untouched, so only the height of the curve moves, not its shape.
  // Rear scaled by 0.8 on 2026-09-21, same owner ask, same 20%. BOTH points scale together, so the
  // exponent is bit-identical (ln(0.24/0.024) == ln(0.30/0.03)) — the curve's height moves, its
  // shape does not, exactly as with the front.
  impactSpringFront: { d10: 0.01,  d60: 0.10 },
  impactSpringRear:  { d10: 0.024, d60: 0.24 },
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
  // RESCALED 2026-08-22 with the progressive tire carcass. These were set when a hard landing put
  // 15-21 kN into the stops; the stiff carcass transmits ~5x that, so an 18 kN floor turned every
  // ordinary landing into an alignment event and a single 3 m drop bent a corner by 1.04° of a 2°
  // cap. The intent has not changed — only REALLY hard bumps — so the numbers move with the forces
  // they are measured against: a 1 m drop (23 kN) does nothing, a 2 m drop (76 kN) bends a corner
  // by under a tenth of a degree.
  alignBumpFloorN: 60000,    // N — below this a bump-stop hit costs alignment nothing
  alignBumpFullN: 250000,    // N — a hit this hard is a full-severity bend
  alignBumpScale:  0.5,      // a bump bends less than a crash of the same severity does


  // Death: a hit at or above the fatal equivalent speed is the fatal-crash fail state (SM-INV-1).
  //
  // The threshold SCALES WITH THE HIT PANEL'S ARMOR CONDITION (owner, 2026-10-12): ~60 mph into a
  // bare panel, ~100 mph into full armor, linear in the condition read BEFORE the hit lands (a hit
  // cannot protect itself, same rule as pass-through). Each landed hit lowers the panel, so the next
  // ceiling drops with it. Supersedes the 2026-08-23 single number (80, pinned to the armor curve's
  // saturation so death and total armor loss were one impact) — armor now buys survivability, which
  // is what the owner wants it to be worth. A hit with no armor region (ground/roof) uses the bare
  // figure.
  fatalMphBare:    60,
  fatalMphFull:    100,
  fatalEnabled:    true,

  // ── Headlights ─────────────────────────────────────────────────────────────────────────────
  // Above this a lamp burns steady. Below it the lamp is a loose connection: it cuts out when the
  // body is jolted, more often the further it has degraded (vehicle-model.js turns the published
  // amount and the body's jolt into dropouts). At exactly zero it is dead: see headlightDimFloor.
  headlightFlickerCond: 0.50,
  // A worn lamp also dims: brightness falls linearly from 1 at full condition toward this floor as
  // condition approaches zero, flickering at its worst. At 0% the lamp is DEAD — fully off, lens and
  // beam (owner, 2026-10-15, reversing the same day's "a broken lamp still burns at the floor").
  headlightDimFloor:    0.40,

  // ── Wheels ─────────────────────────────────────────────────────────────────────────────────
  // A bent wheel is out-of-round, and out-of-round is a REAL thing in the sim (params.wheelRunout,
  // src/suspension.js) rather than a handling penalty invented for damage. Ratified: 0.04 m
  // peak-to-peak at zero condition — a wheel so far gone the truck shakes itself apart at speed.
  wheelRunoutAtZero: 0.04,

  // ── What bends a rim ───────────────────────────────────────────────────────────────────────
  // Two events, no continuous wear: a crash reaching the wheel through the armor (impactWheel
  // above), and a RIM STRIKE — the wheel's rigid core taking a load hard enough to bend it.
  //
  // The model is PLASTIC DEFORMATION PAST YIELD, which is what actually bends a steel wheel
  // (owner, 2026-08-21). Three consequences, all of them the point:
  //   · the quantity is FORCE through the contact, read from the engine's per-step normal impulse
  //     over dt — not an impulse total, which measures how long something was leaned on rather
  //     than how hard it was hit, and let a 1 mph crawl out-read a 92 mph strike;
  //   · below yield NOTHING happens, however long the load is held. A wheel parked against a kerb
  //     is not slowly bending;
  //   · above yield the damage is the overload, not the total load, because only the excess goes
  //     into permanent set.
  //
  // Yield is quoted as a multiple of STATIC WHEEL LOAD, so it reads as "this wheel took N times what
  // it normally carries" and tracks vehicle mass.
  //
  // PROVISIONAL, and the multiplier CANNOT be derived from steel properties — that would be a
  // category error. The force here is a RESIDUAL: what got past the tire once the carcass had taken
  // its share. Its absolute scale is set by how much the soft path absorbed, not by the stress in
  // the rim. So the number has to come from driving. Measured after the contact-model fix, running
  // over a 34 cm rock reads 0.3-5.1 kN across 11-61 mph, so this sits just under the worst of those:
  // nothing at ordinary speeds, and only the hardest hits mark a wheel. That matches the owner's
  // read that a straight-on rock or kerb at 20 mph should leave the rim fine.
  // 2026-10-03 (owner: rims bent a little too easily — threshold AND severity): every yield up
  // ~1/3 for debris and ~10% for road, every write-off scale up ~1/4. The road yield is held under
  // the 2 m drop's 86 kN so that drop still marks the rim (now ~1.4% instead of ~3%).
  // 2026-10-09 (owner: hard hits wear the suspension but leave the wheels untouched — a little more
  // sensitive): road yield 20 -> 16 so mid-height landings that only just bottom the tire count,
  // road write-off 100 -> 90 (2 m drop ~1.4% -> ~3.6%), debris yield 2.0 -> 1.75, write-off 40 -> 35.
  // 2026-10-15 (owner: "wheels are too difficult to damage and don't take enough damage" — both
  // the threshold and the severity): road write-off 90 -> 60, debris write-off 35 -> 25; the
  // yields went 16 -> 12 / 1.75 -> 1.4 and were then split back to 14 / 1.6 (owner, same day).
  // 2 m drop ~3.6% -> ~9% per corner.
  // 2026-10-15 review-2 R-02: the DEBRIS force now reads the engine's whole-step impulse
  // (totalNormalImpulse) instead of the last substep's. For a SUSTAINED contact that reads 16x
  // higher at 8 substeps (measured 15.4-16.6x on a wheel core parked on a beam; 16.05x on a resting
  // cube), so both debris multipliers went x16 (1.6 -> 25.6, 25 -> 400) and every sustained contact
  // prices exactly as before. What is NEW is the one-step hit: the old reading was 0.00 on the step
  // a hit lands, so a sharp strike that lasted one step was never seen. It now is — deliberately.
  // The 0.3-5.1 kN rock figures above are in the OLD reading (x16 = 5-82 kN in this one).
  rimYieldMult:   25.6,  // x static wheel load (≈85 kN): DEBRIS core contacts — below this it springs back
  // ROAD contacts are a different measurement (see suspension.js): the load past full carcass
  // compression, not what a rigid pinch exchanges.
  //
  // Calibrated against the owner's stated target (2026-08-22) — a 1 m drop should damage the
  // SPRINGS only, and a 2 m drop should damage the springs AND fully compress the tire onto the
  // rim. Measured with test/collision-drop-lab.mjs, the rim load past full compression is:
  //
  //     0.5 m  0 kN      1.0 m  0 kN      2.0 m  86.2 kN      3.0 m  87.5 kN
  //
  // The tire genuinely does not bottom below 2 m, so "lesser drops damage springs only" falls out
  // of the geometry rather than being thresholded in. Yield sits under the 2 m figure and the
  // overload scale puts a 2 m landing at about a tenth of a wheel.
  rimYieldRoadMult: 14,   // x static wheel load (≈46 kN): ROAD/terrain contacts
  rimFullRoadMult:  60,   // x static wheel load (≈200 kN) of OVERLOAD writes the wheel off
  rimFullMult:    400,    // x static wheel load (≈1.3 MN) of OVERLOAD writes the wheel off (DEBRIS; see R-02 note)
  rimStrikeExp:   1.5,    // between linear and square — plastic work rises faster than the overload

  // Fraction of its own peak a loaded event must FALL TO before it is banked. Waiting for the load
  // to release outright loses the event whenever the truck ends up resting on whatever it hit —
  // measured in-game, a 37 kN rock strike banked as 0.29% because the truck stopped against the
  // rock and the contact never let go. Banking on decay instead catches the spike as soon as it has
  // passed, while a steady resting load never decays and so is never banked twice.
  eventDecayFrac:   0.5,

  // ── Punctures (owner, 2026-08-23) ──────────────────────────────────────────────────────────
  // A tire pops when a bump-stop hit finds it already worn. The signal is the SAME peak bump-stop
  // force the spring track reads, because it is the same event — the suspension slamming through
  // its travel is what pinches a carcass against the rim hard enough to split it.
  //
  // Fresh rubber does not pop at all: above `punctureCond` there is no threshold to exceed. Below
  // it, the force needed falls as the tire wears, which is DESIGN.md's wear→fragility curve made of
  // one honest quantity instead of a probability roll. Three anchors, linear between each pair:
  //
  //     50% tire → 84 kN        25% tire → 72 kN        10% tire and below → 30 kN
  //
  // KNEE AT 25% (owner, 2026-09-30): "low vulnerability from 50% and below, then really start
  // ramping the sensitivity below 25%." Between 50% and 25% the threshold barely moves, so a
  // half-worn tire is punctureable but only by a genuinely big hit; below 25% it falls ~5× as
  // steeply per point of wear.
  //
  // Deterministic rather than random on purpose: the same drive over the same rock pops the same
  // tire every replay (INFRA-03), and a player who knows their tires are down can read the risk.
  punctureCond:    0.50,     // condition above which a tire cannot be punctured at all
  // Raised 20% on 2026-08-23 (owner): a player should not be surprised by a puncture at 50% on a
  // sizeable pothole. The 10% anchor is unchanged — a nearly-bald tire is meant to be fragile.
  punctureAtHalf:  84000,    // N — bump-stop force that pops a 50% tire
  punctureKneeC:   0.25,     // condition where the threshold stops drifting and starts falling fast
  punctureAtKnee:  72000,    // N — bump-stop force that pops a 25% tire
  punctureFloorC:  0.10,     // at and below this condition the threshold stops falling
  punctureAtFloor: 30000,    // N — bump-stop force that pops a 10%-or-worse tire
  // A flat is not a hole in the ground: the air is gone, so the carcass carries almost nothing at
  // small deflection, but it still stacks up against the rim as it squashes. Scaling the LINEAR
  // rate to a few percent gives exactly that, while a literal zero would mean no normal force at
  // all and the wheel would sink through the road.
  tireFlatRate:    0.05,     // x stock tire spring rate when flat
  tireFlatMu:      0.70,     // x grip when flat — the owner's 30% loss

  // ── Live tuning multipliers ────────────────────────────────────────────────────────────────
  // Per-class wear SPEED, 1 = the calibrated rate above. These exist so wear can be tuned by feel
  // from the debug panel during a drive — which is how every one of these rates has actually been
  // set — instead of through a code edit and a reload each time. They multiply the insult, so 2
  // means "wears twice as fast".
  //
  // They are a TUNING surface, not part of the model: anything that settles here should be folded
  // back into the dur* constant it scales and the multiplier returned to 1, so there is one number
  // per rate rather than two that have to be read together.
  wearScale: { tire: 1, brake: 1, spring: 1, damper: 1, wheel: 1, engine: 1, filter: 1 },

  // ── Contact → impact gating (feedContact) ──────────────────────────────────────────────────
  // A contact is not an impact. The engine reports a manifold every step a body is touching
  // anything, so a truck parked against a fence would be "hit" 60 times a second. Two guards:
  //
  // impactMinMph — the floor a contact must clear to be an impact at all. Resting on the ground is
  //   worth about 0.09 mph equivalent (one step of the truck's own weight), so 2 mph clears the
  //   noise by more than an order of magnitude while still catching a gentle nudge into a post.
  impactMinMph:    2,
  // A step only counts toward a collision's impulse while the contact FORCE is above this. The
  // engine's per-step impulses are summed across a burst to get the collision's true impulse, and
  // without a floor a truck leaning on what it hit would keep adding to it forever.
  // How long one collision is allowed to keep accumulating before it is banked. SHORT on purpose:
  // the engine's impulse total climbs for as long as the bodies touch, so a long window lets the
  // post-crash settle join the crash. 60 ms covers the spike and excludes the lean (4 steps at 60 Hz).
  impactHoldMaxCrash: 0.06,
  // How long a burst survives with no contact reported before it is treated as over. The engine's
  // manifold flickers through a collision, so this must be longer than a dropped step. At 60 Hz a
  // step is 16.7 ms, so 0.02 survives exactly ONE quiet step; a second one ends the burst.
  impactGapS:      0.02,
  // How many steps of velocity history a burst reaches back through for its pre-impact speed.
  // 10 steps is 167 ms at 60 Hz — comfortably before the impulse crosses the trigger. Ordinary
  // driving in that window is not quite negligible: 0.5 g of braking over 167 ms is 0.8 m/s
  // (1.8 mph), which lands in the priced Δv.
  impactPreSteps:  10,
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

const clampAbs = (x, m) => (x >  m ? m : x < -m ? -m : x)

// ── The model ─────────────────────────────────────────────────────────────────────────────────────

/** Brake friction POWER on one wheel [W]: torque × wheel speed (see the brake-wear note in step). */
function brakePower (brakeT, omega, i) { return Math.abs(brakeT[i] || 0) * Math.abs(omega?.[i] || 0) }

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

    /** @type {boolean[]} which tires are flat. A puncture is a STATE, not a condition value —
     *  a flat 80% tire is still 80% of a tire, it just has no air in it. */
    this.flat = [false, false, false, false]
    /** Corners punctured since the last drainPops(), for the one-shot bang. */
    this.popped = []
    /** FEAT-112: the highest tire condition the puncture curve may read — 1 (no cap) on an empty or
     *  lawful bed; the game sets it from the load each step (src/load-verdict.js tireCondCap). */
    this.tireCondCap = 1

    /** Engine temperature [°C], FEAT-51. Run state like condition; starts cold. */
    this.engineTempC = DAMAGE_PARAMS.tempAmbientC

    // Peak rim-core contact FORCE per corner while a strike is in progress; 0 otherwise.
    this._strikePeak = [0, 0, 0, 0]
    // Whether that peak came off the analytic ground (road residual) rather than a debris body.
    this._strikeRoad = [false, false, false, false]

  }

  /**
   * Drop every in-flight event: the collision burst and the velocity history it reaches back
   * into, and the held bump-stop / rim-strike peaks. Called on EVERY reseat (R, teleport, reseed,
   * story seat): the truck jumped, so nothing measured before the jump is part of a hit. Without
   * it a burst live at the reseat banked Δv = |0 − v_before| on the next step — a phantom
   * full-speed impact that in story mode could set fatalImpact.
   */
  resetTransients () {
    this._burst = null
    this._velRing = null
    this._bumpPeak.fill(0)
    this._strikePeak.fill(0)
    this._strikeRoad.fill(false)
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

  /**
   * Set every track at once (damage-disable lock, new run, free-roam respawn). Full condition also
   * puts the air back in the tires and straightens the wheels: a puncture and a bend are STATE
   * rather than condition values, so restoring conditions alone would leave a flat tire flat and a
   * bent wheel pulling — which makes the debug panel's "Restore All" quietly untrue.
   */
  setAll (v) {
    for (const id of TRACK_IDS) this.set(id, v)
    if (v >= 1) {
      for (let i = 0; i < 4; i++) this.flat[i] = false
      // Full condition also straightens the wheels: the alignment TRACKS are only a readout of the
      // two offset arrays, and those are what alignment.js steers by (BUG-79). Without this a free-
      // roam respawn reported "Alignment 100 %" and kept pulling (owner, 2026-10-04).
      this.toeOffsetDeg.fill(0)
      this.camberOffsetDeg.fill(0)
    }
  }

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
    const id = TIRE_IDS[wheelIndex]
    const atZero = dirt ? DAMAGE_PARAMS.tireMuAtZeroDirt : DAMAGE_PARAMS.tireMuAtZero
    const c = this.get(id)
    const shaped = 1 - Math.pow(1 - Math.max(0, Math.min(1, c)), DAMAGE_PARAMS.tireMuExp)
    const worn = atZero + (1 - atZero) * shaped
    return this.flat[wheelIndex] ? worn * DAMAGE_PARAMS.tireFlatMu : worn
  }

  /**
   * Bump-stop force that would puncture a tire at condition `c`, in newtons — Infinity for rubber
   * healthy enough that no bump can pop it. Piecewise linear through the three anchors (floor, knee,
   * half), flat below the floor condition.
   */
  punctureThreshold (c) {
    const P = DAMAGE_PARAMS
    if (c > P.punctureCond) return Infinity
    if (c <= P.punctureFloorC) return P.punctureAtFloor
    if (c <= P.punctureKneeC) {
      const t = (c - P.punctureFloorC) / (P.punctureKneeC - P.punctureFloorC)
      return P.punctureAtFloor + t * (P.punctureAtKnee - P.punctureAtFloor)
    }
    const t = (c - P.punctureKneeC) / (P.punctureCond - P.punctureKneeC)
    return P.punctureAtKnee + t * (P.punctureAtHalf - P.punctureAtKnee)
  }

  /** Fit a fresh tire: full condition and the air back in it. */
  replaceTire (wheelIndex) {
    this.set(TIRE_IDS[wheelIndex], 1)
    this.flat[wheelIndex] = false
  }

  /** Corners that have popped since the last call, so the game layer can bang once per puncture. */
  drainPops () {
    if (!this.popped.length) return null
    const out = this.popped.slice()
    this.popped.length = 0
    return out
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

  /**
   * How much faster the engine wears for the state of its air filter. 1 above the knee, climbing to
   * `filterEngineMult` at a completely blocked filter, squared so the damage is back-loaded.
   */
  filterEngineMultiplier () {
    const P = DAMAGE_PARAMS
    const c = this.get('airFilter')
    if (c >= P.filterKnee) return 1
    const t = (P.filterKnee - c) / P.filterKnee     // 0 at the knee → 1 at fully blocked
    return 1 + (P.filterEngineMult - 1) * t * t
  }

  engineScale () {
    const P = DAMAGE_PARAMS
    return kneeResponse(this.get('engine'), P.engineKnee, P.engineAtKnee, P.engineAtZero)
  }

  /** Temporary torque multiplier from running hot — 1 at or below tempHotC. Not condition. */
  overheatScale () {
    const P = DAMAGE_PARAMS
    const over = this.engineTempC - P.tempHotC
    return over > 0 ? Math.max(P.overheatDerateFloor, 1 - P.overheatDerate * over) : 1
  }

  /** Gauge needle, 0 = C (thermostat − 10 °C) … 0.5 = thermostat … 1 = H (tempHotC). Unclamped. */
  tempGaugeFrac () {
    const P = DAMAGE_PARAMS
    return 0.5 + 0.5 * (this.engineTempC - P.tempThermostatC) / (P.tempHotC - P.tempThermostatC)
  }

  /**
   * Heat the radiator carries away at engine temperature T [W], through a thermostat that opens over
   * ±2 °C. Capacity is linear in radiator condition through two owner anchors, both settling at
   * tempHoldC: a 0% radiator carries the idle burn (radiatorDeadFrac of rated), a 50% one carries
   * full rated power.
   */
  coolingW (T, params) {
    const P = DAMAGE_PARAMS
    const rated = params.radiatorRatedW ?? 117000, dead = params.radiatorDeadFrac ?? 0.06
    const capW  = rated * (dead + (1 - dead) * 2 * this.get('radiator'))
    const open  = Math.max(0, Math.min(1, (T - P.tempThermostatC + 2) / 4))
    return open * capW * (T - P.tempAmbientC) / (P.tempHoldC - P.tempAmbientC)
  }

  /**
   * Integrate engine temperature one step (FEAT-51). Heat in = fuel power, heat out = coolingW.
   * Runs even with damage disabled — temperature is state, not wear.
   *
   * TWO CLOCKS (owner, 2026-10-16). Warming up and cooling off are scenery, so they run on GAME time
   * (the 60x day clock: 15 s of idling is 15 minutes, plenty to come up to temperature). Overheating
   * is the consequence, so it runs on REAL time and slowly enough to react to. Below the thermostat
   * the light engineWarmMass applies (honest: a closed thermostat cuts the radiator and its coolant
   * out of the loop); at and above it the heavy engineThermalMass, which is a leniency knob, ~3x a
   * real block, not physics.
   */
  _stepTemp (vehicleState, params, dt) {
    const P = DAMAGE_PARAMS
    const clock = 86400 / DAY_PARAMS.dayLengthSec   // game seconds per real second
    const heatW = vehicleState.drivetrain?.fuelPowerW ?? 0
    let T = this.engineTempC
    if (heatW > 0) {
      const M = T < P.tempThermostatC ? (params.engineWarmMass ?? 70000) / clock : (params.engineThermalMass ?? 500000)
      T += (heatW - this.coolingW(T, params)) * dt / M
    } else {
      T -= (T - P.tempAmbientC) * dt * clock / P.tempOffTau
    }
    this.engineTempC = Math.min(P.tempMaxC, T)
    vehicleState.engineTempC = this.engineTempC   // FEAT-120: the cold-fast-idle seam (drivetrain.js idleTargetRPM)
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
   * burst has run longer than `impactHoldMaxCrash`, which turns a sustained scrape into repeated hits
   * rather than one that never ends).
   *
   * Peak, not sum: the ratified model prices a hit on how hard the contact was, and adding up the
   * impulses of one collision would price it on how long the truck stayed leaning on the thing it
   * had already hit.
   *
   * @param {'front'|'left'|'right'|'rear'|null} region - from classifyImpactRegion; null (a ground
   *   or roof contact, which no armor covers) closes any burst in progress and starts nothing.
   * @param {number} impulseNs - the engine's accumulated contact normal impulse [N·s]. Detects that
   *   a collision is happening; the SEVERITY comes from `vel` (see the note at the bank).
   * @param {{x,y,z}} [vel] - the vehicle's velocity this step. The burst's Δv is what prices the hit.
   * @param {number} mass - vehicle mass [kg].
   * @param {number} dt - physics step [s].
   * @returns {{region, v, passed, fatal}|null} the landed impact, or null on a step that banked none.
   */
  feedContact (region, impulseNs, mass, dt, vel) {
    const P = DAMAGE_PARAMS
    // `impulseNs` is the engine's totalNormalImpulse on the hardest manifold point: the whole
    // step's impulse, summed over its substeps. The other field, normalImpulse, is only the LAST
    // substep's share and reads zero on the step a hit lands — switching to it silently killed
    // every collision (owner: a 70 mph tree strike did nothing at all). So: the step total,
    // peak-held across the burst.
    //
    // It does not accumulate from step to step (measured — see maxContactImpulse), but a truck
    // that comes to rest against the tree it hit goes on reporting a contact every step. The burst
    // window is what keeps the settle out of the crash: a real crash peaks in tens of
    // milliseconds, so the window is short.
    // Rolling history of recent velocity. A burst cannot use the velocity of the step it STARTS on:
    // the engine's accumulated impulse only crosses the trigger a step or two into the hit, by which
    // time most of the deceleration has already happened, and Δv measured from there is ~nothing
    // (a 34 mph crash priced at 0.4 mph). So the burst reaches BACK for the velocity from before
    // the contact began.
    if (vel) {
      const ring = this._velRing ?? (this._velRing = [])
      // Full ring: recycle the entry that falls off the back instead of allocating one per step.
      const e = ring.length >= P.impactPreSteps ? ring.shift() : {}
      e.x = vel.x; e.y = vel.y; e.z = vel.z
      ring.push(e)
    }
    const live = region != null && impactSpeed(impulseNs, mass) >= P.impactMinMph * MPH

    if (live) {
      if (!this._burst) {
        const r0 = this._velRing?.[0]   // COPIED: ring entries are recycled as the ring advances
        this._burst = { region, impulse: impulseNs, t: 0, gap: 0, v0: r0 ? { x: r0.x, y: r0.y, z: r0.z } : null }
      }
      else {
        this._burst.t += dt
        this._burst.gap = 0
        // The region travels with the peak: a truck that clips a post front-first and slews into it
        // sideways took its worst hit on whichever face was loaded hardest.
        if (impulseNs > this._burst.impulse) { this._burst.impulse = impulseNs; this._burst.region = region }
      }
      if (this._burst.t < P.impactHoldMaxCrash) return null
    } else if (this._burst) {
      // A collision does NOT report a contact on every single step — the engine's manifold comes
      // and goes as the pair separates and re-touches through the hit. Banking on the first quiet
      // step measured Δv over one single step and priced a 34 mph crash at 0.4 mph, i.e. nothing at
      // all. So a burst survives a short gap; only a real separation ends it.
      this._burst.t += dt
      this._burst.gap += dt
      if (this._burst.gap < P.impactGapS && this._burst.t < P.impactHoldMaxCrash) return null
    }
    const b = this._burst
    if (!b) return null
    this._burst = null
    // Price on the truck's OWN Δv across the burst, not on the engine's accumulated contact impulse.
    //
    // The two should agree — J = m·Δv is the definition — and on a clean flat-on wall strike they
    // do, within the rebound. They come apart on a messy one: a solver's accumulated normal impulse
    // on a manifold point includes the impulses it spends pushing penetration back out, which move
    // no net momentum. Measured against the owner's captures, that read a 60 mph tree strike as 104
    // and a 30 as 65 — a little over 2x the truck's real Δv both times.
    //
    // Δv keeps everything the ratified impulse model was chosen for. The point of pricing on
    // impulse rather than speed was that a glancing clip at 60 mph should cost almost nothing while
    // a square hit costs everything — and Δv expresses exactly that, because a glance barely
    // deflects the truck. It is the same quantity, measured off the body instead of off the solver.
    const j = (b.v0 && vel) ? mass * Math.hypot(vel.x - b.v0.x, vel.y - b.v0.y, vel.z - b.v0.z)
                            : b.impulse
    return { region: b.region, ...this.applyImpact(b.region, j, mass) }
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
    const armorBefore = armorId ? this.get(armorId) : 0
    const passed  = armorId ? armorPassThrough(armorBefore) : 1

    if (armorId) this.wear(armorId, impactDamage(v, P.impactArmor), 1)

    const curveFor = {
      wheel: P.impactWheel, damper: P.impactDamper,
      engine: P.impactEngine, radiator: P.impactRadiator, headlights: P.impactHeadlight,
    }
    // The spring curves are per AXLE, so they are keyed by track id rather than by class — the two
    // spring tracks share a class but not a curve (see impactSpringFront).
    const curveById = { springFront: P.impactSpringFront, springRear: P.impactSpringRear }
    for (const id of TRACK_IDS) {
      const t = TRACKS[id]
      if (t.cls === 'armor' || t.cls === 'alignment') continue
      if (!t.regions.includes(region)) continue
      const curve = curveById[id] ?? curveFor[t.cls]
      if (!curve) continue
      // Headlights are per-side and a side impact only reaches its own: a left-side hit does not
      // break the right headlight. A FRONT hit reaches both.
      if (t.cls === 'headlights' && (region === 'left' || region === 'right') && t.side !== region) continue
      this.wear(id, impactDamage(v, curve) * passed, 1)
    }

    this._bendAlignment(region, v, passed)

    // Fatal-crash fail state (SM-INV-1). The panel's armor condition BEFORE the hit sets the ceiling:
    // bare → fatalMphBare, full → fatalMphFull, linear between (owner 2026-10-12).
    const fatalMph = P.fatalMphBare + (P.fatalMphFull - P.fatalMphBare) * armorBefore
    const fatal = P.fatalEnabled && v >= fatalMph * MPH
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
   * flange took load. `forceN` is the strike's PEAK rim force; `road` picks which source's yield
   * and overload scale price it (the road residual or a debris pinch on the wheel core).
   */
  _landRimStrike (corner, forceN, staticLoad, road) {
    const P = DAMAGE_PARAMS
    // Each source carries its OWN yield and overload scale, because they are different
    // measurements: `road` is the squashed-carcass load past full compression, `debris` is what a
    // rigid pinch exchanges with the core, and the two differ by more than an order of magnitude.
    const yieldN = (road ? P.rimYieldRoadMult : P.rimYieldMult) * staticLoad
    const fullN  = (road ? P.rimFullRoadMult  : P.rimFullMult)  * staticLoad
    const overload = forceN - yieldN
    if (overload <= 0) return                       // elastic: the rim springs back, nothing kept
    const dmg = Math.pow(Math.min(1, overload / fullN), P.rimStrikeExp)
    this.wear(WHEEL_IDS[corner], dmg, 1)
  }

  /** Static wheel load [N] — one corner's share of the vehicle's weight. The yield scale. */
  static staticWheelLoad (params) { return (params.mass || 0) * 9.81 / 4 }

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
    const front  = corner < 2
    const floorN = front ? P.springForceFloorFront : P.springForceFloorRear
    if (peakN <= floorN) return

    // Spring: saturating power law from the no-harm floor through the reference hit. BOTH ends of
    // the curve are per-axle — see springBumpRefNFront for why the front's reference force is higher.
    const refN = front ? P.springBumpRefNFront : P.springBumpRefNRear
    const t = (peakN - floorN) / (refN - floorN)
    const dmg = Math.min(1, P.springBumpRefDmg * Math.pow(Math.max(0, t), P.springBumpExp))
    const id = front ? 'springFront' : 'springRear'
    // durability 1 = the insult IS the damage fraction, the same idiom applyImpact uses. There is
    // no durSpring any more: for an event-priced track the CURVE is the calibration. The parts
    // durability multiplier (SM-INV-10) and the wear-speed slider still apply inside wear().
    this.wear(id, dmg, 1)

    // PUNCTURE: the same event, read against the tire rather than the spring. FEAT-112: an overloaded
    // bed caps the condition the curve reads (tireCondCap, set by the game from the load's mass) — a
    // worn tire stays as worn as it is, the load only matters when it is worse than the wear.
    const tireId = TIRE_IDS[corner]
    if (!this.flat[corner] && peakN >= this.punctureThreshold(Math.min(this.get(tireId), this.tireCondCap))) {
      this.flat[corner] = true
      this.popped.push(corner)         // drained by the game layer for the bang
    }

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
    params._engineDamageScale = this.engineScale() * this.overheatScale()
    // Alignment is geometry, not a multiplier — published as the raw per-wheel offsets the
    // suspension applies on top of the static toe/camber. alignment.js consumes these (BUG-79).
    params._toeOffsetDeg    = this.toeOffsetDeg
    params._camberOffsetDeg = this.camberOffsetDeg
    // Flat tires: the carcass rate collapses and grip drops. Published as a RATE multiplier so the
    // suspension needs no notion of "flat" at all — it just reads a softer tire.
    const fr = params._tireRateScale || (params._tireRateScale = [1, 1, 1, 1])
    for (let i = 0; i < 4; i++) fr[i] = this.flat[i] ? DAMAGE_PARAMS.tireFlatRate : 1
    // Per-wheel out-of-round, in metres peak-to-peak. Added to the params.wheelRunout slider so
    // that slider stays usable on its own as a test tool with damage off.
    const ro = params._wheelRunout || (params._wheelRunout = [0, 0, 0, 0])
    for (let i = 0; i < 4; i++) ro[i] = this.wheelRunout(i, params)
    // Headlight flicker, left then right: 0 = steady, 1 = worst. Visual only; physics never reads it.
    const hf = params._headlightFlicker || (params._headlightFlicker = [0, 0])
    hf[0] = this.headlightFlicker('headlightL')
    hf[1] = this.headlightFlicker('headlightR')
    // Hood steam, 0..1: visual only (src/smoke.js). Visible the moment the engine is over the mark,
    // full at +10 °C — the player has to SEE that they are hurting the truck, not read it off a gauge.
    const over = this.engineTempC - DAMAGE_PARAMS.tempHotC
    params._hoodSteam = over > 0 ? Math.min(1, 0.3 + 0.07 * over) : 0
    const hb = params._headlightBrightness || (params._headlightBrightness = [1, 1])
    hb[0] = this.headlightBrightness('headlightL')
    hb[1] = this.headlightBrightness('headlightR')
  }

  /** One lamp's brightness multiplier: linear from 1 at full condition toward headlightDimFloor; 0 at 0% (dead). */
  headlightBrightness (id) {
    const lo = DAMAGE_PARAMS.headlightDimFloor, c = this.get(id)
    return c <= 0 ? 0 : lo + (1 - lo) * Math.min(1, c)
  }

  /**
   * How badly one lamp flickers: 0 at or above headlightFlickerCond, rising linearly to 1 at zero
   * condition. Linear, so a lamp just under the threshold drops out only rarely.
   */
  headlightFlicker (id) {
    const cond = DAMAGE_PARAMS.headlightFlickerCond, c = this.get(id)
    return c >= cond ? 0 : c <= 0 ? 1 : 1 - c / cond
  }

  /**
   * Out-of-round for one wheel, in metres peak-to-peak — the effective value physics should use.
   *
   * Linear in condition: a wheel at full health is perfectly round, one at zero carries the full
   * ratified 0.04 m. The manual `params.wheelRunout` slider adds on top so it keeps working as a
   * standalone test tool when damage is off.
   */
  wheelRunout (wheelIndex, params = this.params) {
    const c = this.get(WHEEL_IDS[wheelIndex])
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
    this._stepTemp(vehicleState, params, dt)

    // Damage disabled: hold everything at the nominal used-truck condition. Deliberately NOT a
    // freeze — a debug session should always start from the same known state (owner, 2026-08-19).
    if (!P.enabled) {
      this.setAll(P.nominalCondition)
      vehicleState.engineHealth = this.get('engine')   // the FEAT-33 crank-time seam follows the lock
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
      for (let i = 0; i < 4; i++) {
        const v = Math.max(0, (slipVel[i] || 0) - P.tireSlipFloor)
        const f = Math.abs(tireFlat?.[i] || 0)
        if (v <= 0 && f <= 0) continue
        this.wear(TIRE_IDS[i], (v + P.tireWCorner * f) * dt, P.durTire)
      }
    }

    // ── Brakes: ∫(friction POWER × time) = the energy the pads actually dissipate ─────────────
    // Torque x time was wrong and the owner caught it: it wore the rear pads while the truck just
    // sat on a hill with the brakes holding it. A stationary pad dissipates nothing — no sliding,
    // no heat, no material removed — so the honest quantity is torque x SLIDING SPEED, i.e. the
    // power going into the disc. That is zero at a standstill by construction, which is a better
    // answer than a speed floor: it needs no threshold and it also gets the middle right, where a
    // gentle crawl-speed drag costs far less than the same torque at 60 mph.
    if (brakeT) {
      const omega = vehicleState.wheelOmega
      this.wear('brakeFront', (brakePower(brakeT, omega, 0) + brakePower(brakeT, omega, 1)) * dt, P.durBrake)
      this.wear('brakeRear',  (brakePower(brakeT, omega, 2) + brakePower(brakeT, omega, 3)) * dt, P.durBrake)
    }

    // ── Wheels: RIM STRIKE events, per corner, on peak tire deflection ────────────────────────
    // Engine contact FORCE on the wheel's rigid core. Peak-held and banked on decay like every
    // other event, but the criterion is yield: only the peak matters, and only if it exceeded it.
    const rimF = vehicleState.rimForce
    if (rimF && params) {
      const staticW = DamageModel.staticWheelLoad(params)
      const road = vehicleState.rimForceRoad
      const yieldN = P.rimYieldMult * staticW
      const yieldRoad = P.rimYieldRoadMult * staticW
      for (let i = 0; i < 4; i++) {
        // Two sources. Compare them as MULTIPLES OF THEIR OWN YIELD — the only way to ask "which is
        // further past the point where it starts bending" when the two are different measurements —
        // then carry the winner in its own units so it is priced on its own scale.
        const nDebris = (rimF[i] || 0) / yieldN
        const nRoad   = road ? (road[i] || 0) / yieldRoad : 0
        const isRoad  = nRoad > nDebris
        const f = isRoad ? (road[i] || 0) : (rimF[i] || 0)
        if (f > this._strikePeak[i]) this._strikeRoad[i] = isRoad
        const peak = this._strikePeak[i]
        if (f > peak) { this._strikePeak[i] = f; continue }
        // Release is judged in the PEAK's own measurement. When a road strike lets go, the road
        // residual drops to 0 and the "winner" flips to the debris reading; judged on the debris
        // yield, which sits ABOVE the road one since R-02 (85 vs 46 kN), a 46-85 kN road strike
        // was dropped without ever being banked.
        const peakRoad = this._strikeRoad[i]
        const fPeak    = peakRoad ? (road[i] || 0) : (rimF[i] || 0)
        const tripPeak = peakRoad ? yieldRoad : yieldN
        if (peak > tripPeak && (fPeak <= tripPeak || fPeak < peak * P.eventDecayFrac)) {
          this._landRimStrike(i, peak, staticW, peakRoad)
          this._strikePeak[i] = 0
        } else if (fPeak <= tripPeak) {
          this._strikePeak[i] = 0
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
      for (let i = 0; i < 4; i++) {
        const f = Math.abs(bumpF[i] || 0)
        const peak = this._bumpPeak[i]
        if (f > peak) { this._bumpPeak[i] = f; continue }            // still building
        // Banked on decay as well as release, for the same reason as the rim strike: a truck that
        // settles onto its stops and stays there would otherwise never bank the landing that put
        // it there. A steady resting load does not decay, so it is never banked twice.
        const floorN = i < 2 ? P.springForceFloorFront : P.springForceFloorRear
        if (peak > floorN && (f <= floorN || f < peak * P.eventDecayFrac)) {
          this._landBumpStop(i, peak)
          this._bumpPeak[i] = 0
        } else if (f <= floorN) {
          this._bumpPeak[i] = 0
        }
      }
    }

    // ── Dampers: suspension displacement rate above the no-harm floor, per axle pair ───────────
    // OPEN RISK (owner, 2026-08-19): this may not have the fidelity to decide honestly when a
    // damper should take damage. strutCompVel is the real strut velocity the suspension ODE
    // integrates, so it is the honest signal — but it comes out of 4 substeps with the strut spring
    // and damper integrated explicitly (only the tire damper and bump stop are implicit), and may
    // be too noisy. If the washboard test says so, that is a finding to report, not to paper
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
      if (insult > 0) {
        // A choked filter starves the engine and accelerates its wear — the multiplier is 1 down to
        // the knee and then climbs to filterEngineMult at zero, squared so the last stretch is the
        // punishing one. This is the ONLY coupling between two tracks in the model, and it is
        // deliberate: the filter has no effect of its own, it makes something else worse.
        this.wear('engine', insult * this.filterEngineMultiplier() * dt, P.durEngine)
        this.wear('airFilter', insult * P.filterDustMult * dt, P.durFilter)
      }
    }

    // Overheat: the honest temp signal wears the engine, severity-weighted (degrees over × time).
    if (this.engineTempC > P.tempHotC) this.wear('engine', (this.engineTempC - P.tempHotC) * dt, P.durOverheat)

    // FEAT-33 seam (owner ruling 2026-09-04): the engine track IS the crank-time input. ignition.js
    // interpolates catch time ignitionCatchTime → ignitionCatchTimeWorn (0.25 s → 2 s) on this,
    // and at exactly 0 the engine never catches.
    vehicleState.engineHealth = this.get('engine')

    this.publish(params)
  }
}
