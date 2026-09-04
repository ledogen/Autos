# HANDOFF 2026-08-19 — SM-3 damage model, slice 1 → slice 2

**Worktree:** `/Users/ledogen/CodeShit/CarGame-damage` · **branch** `feature/damage` · **dev server**
`http://localhost:3686` (`npm run dev -- --port 3686 --strictPort`).

**Do all work in that worktree.** It branched off the *local* main tip `17970b8`, not `origin/main`
(which was four commits stale). It needs `ln -s ../CarGame/node_modules node_modules` before
`npm run dev` will find Vite; that symlink is in the local exclude list, not `.gitignore`.

**Read first:** `.planning/story-mode/MILESTONES.md` § SM-3. It was rewritten on 2026-08-19 from the
owner's ratification and is the spec — it **supersedes DESIGN.md "Damage, wear & repair"** wherever
they differ. Then `src/damage.js`, which is the whole model in one file.

---

## The four rulings that shape everything

1. **Alignment gets REAL static toe/camber geometry**, not damage-only offsets. The handling
   baseline of every vehicle shifts and every physics gate rebaselines — accepted knowingly, because
   a truck that never had alignment cannot lose it. **The owner is building that geometry on the
   `feature/out-of-round` worktree. Port it. Do not invent a second one.**
2. **FEAT-51 (coolant temp) is folded into SM-3.** The radiator's only damage source is impact and
   its only effect is temperature, so the thermal model is part of the radiator track, not a
   dependency to wait on.
3. **Death is in scope** — both SM-INV-1 fail states, the fatal-crash impact and the unrecoverable
   breakdown.
4. **Three slices**, each merged and *driven by the owner* before the next starts.

---

## Where the work stands

### Slice 1 — DONE and committed (`5239f8f`, `9bbcee1`)

**`src/damage.js`** — 26 tracks in eight classes: 4 armor · 4 tires · 4 wheels · 4 suspension
(springs and dampers, front/rear pairs) · 2 brakes · engine · radiator · 2 headlights (L/R) ·
4 per-wheel alignment.

**The seam is the thing to preserve.** `damage.js` imports nothing from the physics stack. It READS
honest per-corner signals published on `vehicleState`, and WRITES effect multipliers onto `params._*`
in the same scratch convention physics already uses for `_tireFz` / `_driveTorque`. `physics.js`,
`tire.js` and `suspension.js` never import it and do not know it exists — they read plain numbers
that default to `1`, so headless gates and damage-off both produce the exact stock truck with no
branch anywhere. **Keep it that way.** New effects go through `publish()`, new signals go through
`vehicleState`.

| Published signal | Written by | Feeds |
|---|---|---|
| `slipVel[i]` | `physics.js` | tire wear (dominant term) — the RAW contact-patch sliding speed, deliberately not the relaxation-filtered slip |
| `tireFlat[i]` | `physics.js` | tire wear (minor term) |
| `bumpForce[i]` | `suspension.js` | spring wear — peak across substeps, reset at the top of `stepSuspensionSubsteps` |
| `brakeTorque[i]` | `physics.js` | brake wear |
| `strutCompVel[i]`, `drivetrain` | pre-existing | damper wear, engine wear |

| Effect multiplier | Read by |
|---|---|
| `_tireMuScale[i]` | `tire.js` (via the new optional `muScale` arg — the same hook FEAT-38's per-surface μ will use) |
| `_brakeScaleFront/Rear` | `physics.js` `getBrakeTorque` |
| `_springScaleFront/Rear`, `_damperScaleFront/Rear` | `suspension.js` |
| `_engineDamageScale` | `drivetrain.js` |
| `_toeOffsetDeg`, `_camberOffsetDeg` | nothing yet — slice 3 |

**Impacts are fully built and gated but NOT CONNECTED.** `applyImpact(region, impulseNs, mass)` is
the single entry point and works; nothing calls it yet.

**Debug panel** (Vehicle → Damage): enabled checkbox (restores/degrades everything to 75% and locks —
*not* a freeze), component picker, −25/−5/+5/+25 buttons, live condition readout.

**Gates:** `test/tire-mu-wiring.mjs` and `test/damage-impacts.mjs`, both registered in `test/gates.mjs`,
both green. `test/calibrate-wear.mjs` is a rainy-day script, not a gate.

### Slice 1 — NOT done

- **Behavioural gates for the wear tracks**: springs (big dip, bump stops properly engaged), dampers
  (washboard at speed), brakes (brake-drag). None written.
- **The damper fidelity question is unanswered.** The owner flagged the risk up front: we may not
  have enough fidelity in the wheel-rate signal to honestly decide when a damper takes damage.
  `strutCompVel` is the real strut velocity the suspension ODE integrates, so it *is* the honest
  signal, but it is a 4-substep explicit-Euler quantity and may be too noisy. **If the washboard test
  says so, report it as a finding. Do not substitute a proxy** — that is a standing instruction
  (`feedback_emergent_over_injected`).
- **Spring / damper / wheel rates are unset.** The owner explicitly has no conversion from game feel
  to bump-stop force or wheel rate, so these are chosen starting values awaiting a drive. Do not
  invent a calibration for them; get the owner behind the wheel.

---

## Slice 2 — what to build next

**1. Contact point → armor region.** The adapter reports impulse magnitude but not location:
`physics-engine.js` `maxContactImpulse()` returns only the max `totalNormalImpulse` (its comment
already says the SM-3 wear model subscribes here). Extend it to return the contact **point** as well.
That edit belongs inside `physics-engine.js` — it is the ONE module allowed to touch engine types
(FEAT-48 seam rule, grep-enforced). Then map the point into body frame and classify it front / left /
right / rear, and call `applyImpact()`.

The chassis is a QUAL-25 compound: four hulls plus four rim spheres. Body forward is **−z** (front
wheels sit at negative z). Impacts on the rim spheres are wheel strikes and probably want the
adjacent region, but that is a judgement call worth raising rather than assuming.

**2. Port the out-of-round work** from `feature/out-of-round` (uncommitted there as of 2026-08-19 —
check with the owner before assuming it is final). It is a clean ~67-line change: `params.wheelRunout`
modulates the contact-query radius once per revolution via a new fixed-step `vehicleState.wheelPhase`,
touching `data/ranger.js`, `src/suspension.js` (`effectiveWheelRadius`), `src/physics.js`,
`src/vehicle.js`, `src/main.js`, `src/debug.js`. Make `wheelRunout` **per-wheel**, driven by wheel
condition, capped at the ratified **0.04 m peak-to-peak** at zero condition.

**3. Wheel damage sources** — high suspension accelerations (same family as the damper signal) plus
impact through the armor.

---

## Slice 3 — after that

- **Thermal / FEAT-51**: cooling rate as f(radiator condition), heat from rpm and load, 30 °C cold
  start → 90 °C warmed, boil-off at 104 °C, engine damage above 105 °C, stock radiator insufficient
  at all rpm below ~50% condition. Drive the shipped FEAT-49 gauge needle from it.
- **Headlights**: flicker below 50% condition, permanently dark at 0%. The owner wants the flicker
  driven by vehicle **g-force** if it reads well — g-force is not computed today but is trivial from
  `vehicleState.velocity`. Headlight state lives in `src/vehicle-model.js` (`headlightMode`,
  `applyHeadlights`, `HEAD_TUNE`).
- **Alignment**: port the toe/camber geometry from `feature/out-of-round`, then consume
  `_toeOffsetDeg` / `_camberOffsetDeg` on top of the static values. Expect every physics gate to
  rebaseline; that is expected, not a regression.
- **Damage GUI**: top-down schematic of the truck, green at full health → red at zero, gradient
  between. The owner has a reference image available on request — **ask for it.**
- **Death**: fatal-crash threshold (already detected — `DamageModel.fatalImpact` is set and waiting
  for a consumer) and the unrecoverable-breakdown run-end.

---

## Things that cost time to learn — do not rediscover them

- **`vehicleState.brake` is the S key**, not a brake pedal. It is the service brake only when rolling
  forward (see `getBrakeTorque`'s `REV_THRESHOLD` guard); pointed the other way it drives in reverse.
  Cost an hour in the wiring gate.
- **Per-corner probes must be read within ~2 physics steps.** By 8 steps, load transfer has coupled
  all four corners and swamps the per-corner signal you are trying to isolate.
- **New `vehicleState` fields go in THREE places** — `SPAWN_STATE` in `src/vehicle.js`, the
  `vehicleState` literal in `src/main.js`, and `_reseatTruckAtSpawnInner()` in `src/main.js`.
- **Impacts are priced on IMPULSE, not Δv.** `v_eq = J / mass` is a unit conversion, not a velocity
  measurement. If someone "simplifies" this to read Δv off the body, the glancing-blow behaviour the
  owner asked for is gone.
- **The impact exponents are fitted, not physical.** n = 1.285 sits between impulse-proportional
  (n = 1) and energy-proportional (n = 2). Do not "correct" it to either.
- **`durTire` and `durBrake` are fitted by `test/calibrate-wear.mjs`, not hand-set.** They encode a
  stated duty cycle (25% of the hour at the grip limit, 15% on the brakes at 60% pedal). Re-run the
  script after any change to the tire model or brake torques; do not edit the constants.
- **Alignment randomness is seeded** (mulberry32 in `damage.js`) so a run replays identically —
  INFRA-03 determinism, FEAT-26's flag-gated-nondeterminism pattern. Do not reach for `Math.random()`.

---

## Owner-facing debt

- **DESIGN.md still needs its amendment.** `.planning/story-mode/DESIGN.md` § "Damage, wear & repair"
  disagrees with the ratified SM-3 in three places: suspension is one track there and two here;
  armor, headlights, alignment and wheels do not exist there at all. DESIGN.md is the design of
  record and outranks MILESTONES, so this must be reconciled rather than left. Precedent for how:
  `.planning/story-mode/design-amendments-2026-08-17.md`. **This was deliberately not done
  unilaterally — raise it with the owner** (`feedback_ask_on_conflicts`).
- **No ticket exists for this work.** SM-3 is being built straight off the milestone. If the tracker
  should carry it, that is the owner's call.
- **Two sanity numbers the owner may want to revisit:** 320 h of relentlessly hard driving (a full
  20-day run, every waking hour) leaves tires at 9% and brakes at 47%. Real play is not all-hard, so
  a tire set will comfortably outlast a run unless the player drives badly. That may be too
  forgiving — it is a design call, not a bug.
- **The brake constant is fitted to the FRONT axle.** The rears share it and reach the same wear at
  ~347 h, because 1300 vs 450 N·m means the fronts work about three times harder. Honest, but worth
  confirming the owner's "120 hours" meant the fronts.
