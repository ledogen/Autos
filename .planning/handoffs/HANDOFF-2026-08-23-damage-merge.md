# HANDOFF 2026-08-23 — SM-3 damage model, READY TO MERGE

**Worktree:** `/Users/ledogen/CodeShit/CarGame-damage` · **branch** `feature/damage` · **dev server**
`http://localhost:3686`. 37 commits ahead of main, 46 files, ~4.8k insertions.

**Gate status: `npm run test:all` green, 61/61**, last full run 2026-08-23. The owner has driven
every wear track and signed each one off; the remaining work is listed under "Not built" and none of
it blocks the merge.

Supersedes `HANDOFF-2026-08-19-damage-slice2.md`.

---

## What this is

The SM-3 component damage model, complete except for the deferrals below. **Twenty-seven tracks in
nine classes**, each integrating an honest signal the sim already produces, all of it outside the
physics hot loop and behind a seam.

**The seam is the thing to preserve.** `src/damage.js` imports nothing from the physics stack. It
READS signals published on `vehicleState` and WRITES effect multipliers onto `params._*`, in the
same scratch convention physics already uses. `physics.js`, `tire.js` and `suspension.js` never
import it and do not know it exists — they read plain numbers that default to 1, so headless gates
and damage-off produce the exact stock truck with no branch anywhere. **Keep it that way.** New
effects go through `publish()`, new signals through `vehicleState`.

| Class | Damaged by | Effect |
|---|---|---|
| Armor ×4 | impact | absorbs what reaches everything behind it; absorbs less as it degrades |
| Tires ×4 | slip velocity (dominant) + cornering force. **Puncture** on bump-stop force vs wear | grip falls; a FLAT drops grip 30% and lets the load through to the rim |
| Wheels ×4 | rim contact past a YIELD force, from road or debris; plus impact | radial runout — out of round, ≤ 0.04 m p-p, oval (2nd harmonic) |
| Springs F/R | bump-stop PEAK force per event | rate falls to a floor of 50% of stock, never zero |
| Dampers F/R | strut velocity above a floor | damping falls |
| Brakes F/R | ∫(torque × wheel speed) — friction ENERGY | max torque falls |
| Engine | rpm×load, ×20 on a blocked filter, + front impact | torque falls |
| Air filter | the air the engine breathes | nothing above 20%, then engine wear multiplies |
| Radiator | impact only | **no effect yet — see Deferred** |
| Headlights L/R | front impact | **no effect yet — see Not built** |
| Alignment ×4 | impact + really hard bump-stop hits | real toe/camber offsets, bounded |

**Tools.** `V` opens the damage readout (condition + wear rates + raw signals + impact log; free
while hidden). Debug panel has per-class wear-speed sliders and a "Fit 4 New Tires" button.
`test/collision-drop-lab.mjs` drives the lab and prints the whole chain per drop height and the
modelled impact against the truck's real Δv. `test/lab-wear-drive.mjs` does the rumble lane and drops.

---

## Deferred by the owner, 2026-08-23

- **Radiator / thermal (FEAT-51).** The radiator track takes impact damage and publishes nothing.
  The whole thermal model — cooling as f(condition), heat from rpm and load, 30 °C cold start,
  boil-off at 104 °C, engine damage above 105 °C, the FEAT-49 gauge needle — is unbuilt.
- **Tire repair.** Punctures work; there is no way to fix one in a run. `DamageModel.replaceTire(i)`
  exists and the debug panel can fit four, but the roadside change DESIGN.md describes needs a spare
  in inventory, and inventory does not exist. **A flat is currently permanent in a real run.**

## Not built (slice 3 remainder)

- **Headlight flicker** — the tracks take damage and nothing consumes them. `headlightMode` /
  `applyHeadlights` / `HEAD_TUNE` in `src/vehicle-model.js`. The owner wants the flicker driven by
  vehicle **g-force** if it reads well; g-force is not computed but is trivial from `velocity`.
- **Alignment offsets are published and unconsumed.** `params._toeOffsetDeg` / `_camberOffsetDeg`
  are written every step; `physics.js` already calls `toeOffset()` and `camberLean()` for the STATIC
  geometry, so this is adding the damage offset on top at those two call sites.
- **The damage GUI.** Ratified as a top-down schematic of the truck, green→red. The V readout is the
  diagnostic stand-in and its CONDITION pane is what the schematic replaces. **The owner has a
  reference image — ask for it.**
- **Death.** `DamageModel.fatalImpact` is set and has no consumer. Threshold is 80 mph of Δv, the
  same speed armor writes off. The unrecoverable-breakdown run-end is also unbuilt.

## Open design questions — the owner's to answer

Both are recorded in DESIGN.md's open-questions list (item 8):

1. **Is the air filter's diagnostic-screen role still true?** DESIGN.md calls the filter warning the
   screen's headline job. The filter now exists, but the screen does not.
2. **The head-gasket overheat integral** is still an unratified proposal, and lands with the thermal
   model whenever that is picked up.

---

## Things that cost time to learn — do not rediscover them

**About the engine's contact data**

- **`pt.normalImpulse` reads ZERO** in the buffer `getBodyContactData` fills. Only
  `totalNormalImpulse` is populated. Switching to it silently killed every collision in the game.
- **`totalNormalImpulse` ACCUMULATES for as long as the bodies touch**, and is not net momentum
  transfer — it includes what the solver spends pushing penetration out. It read a 60 mph strike as
  104. Impact severity comes from the vehicle's own Δv now; the impulse only detects that a
  collision is happening.
- **A collision does not report a contact on every step.** The manifold comes and goes. Banking a
  burst on the first quiet step cut a 34 mph crash to a 4 ms window and priced it at 0.4 mph.
- **The burst must reach BACK for its pre-impact velocity.** The impulse crosses the trigger a step
  or two into the hit, by which time the deceleration has happened.
- **`b3ShapeDef.updateBodyMass` defaults TRUE.** Adding a shape re-derives body mass from shape
  densities, discarding a mass pinned with `setMassData`. It reads as the truck no longer settling.
- **Hulls cannot be moved** — only spheres and capsules have setters. The wheel cores are rebuilt in
  place (`replaceHullLocal`) when they drift 4 mm.

**About the wear model**

- **Impacts are priced on Δv, and that IS the ratified impulse model**, measured off the body rather
  than the solver. A glance barely deflects the truck, so the glancing-blow behaviour is intact.
- **Event tracks bank on DECAY, not release** — a wheel resting on what it hit never releases.
- **The tire spring is progressive** (`1/(1 − (d/sidewall)²)`, clamped 8.6×). It is what stops the
  rim reaching the road on every landing. Clamping matters: at the asymptote it shoved the body 5 cm
  in one frame and tripped the penetration failsafe.
- **Stiffening the tire moves EVERY force downstream of it.** It multiplied bump-stop forces ~5×,
  which silently destroyed the springs, and then the alignment crosstalk. Each threshold calibrated
  against the old forces had to be **re-measured, not reasoned about**. `collision-drop-lab.mjs`
  exists to make that chain visible in one table.
- **Road and debris rim loads are different measurements** an order of magnitude apart. They are
  published separately and carry their own yields.
- **`durTire` / `durBrake` are fitted by `test/calibrate-wear.mjs`**, anchored on a measured
  one-wheel peel and a duty cycle. Re-run it after tire or brake changes; do not hand-edit.
- **Alignment randomness is seeded** (mulberry32). Punctures are deterministic for the same reason.

**About the harness**

- **`window.__tp` and `window.__vehicleState` need `?prof=1`.** Without it `__tp` is undefined and
  the call fails SILENTLY — three measurement runs were made against the flat strip while I believed
  they were on the rumble lane.
- **A hook with a fixed arity is a filter, not a passthrough.** The instrument's `feedContact` wrapper
  dropped the 5th argument and reported collisions healthy while they were dead in the game. Forward
  with `(...a)`.
- **Sample at the physics step, not on a timer.** A 16 ms `setInterval` aliases the ~9 Hz rumble and
  reads strut peaks 10× low.

---

## Docs state

- **`MILESTONES.md` § SM-3 now describes the build**, per the owner's "current implementation is
  source of truth" (2026-08-23). Five damage sources were corrected there rather than in code.
- **DESIGN.md is reconciled.** `design-amendments-2026-08-23-sm3.md` is the provenance record; the
  decisions are folded into DESIGN.md inline, and DESIGN.md wins on conflict.
- **`FEAT-70`** filed: solve the wheel's disc contact instead of sampling for it. The footprint
  stencil is a discrete approximation and a sharp edge still shows fine stepping.
- **There is still NO tracker ticket for SM-3 itself** — it was built straight off the milestone. If
  the tracker should carry it, that is the owner's call.

## Merging

Nothing exotic. `feature/damage` branched off local main and carries the `feature/out-of-round` work
(oval runout + static toe/camber) as cherry-picks, so that branch has no unique commits left worth
keeping — `b0e6cb5` there is the same content as `b77dfc6` here.

Expect **no gate rebaseline**: the static alignment values are mild enough that all 61 gates pass
unchanged, which was checked when they landed and again at 2026-08-23.
