---
id: BUG-160
type: bug
status: open
severity: major
opened: 2026-11-12
source: owner, 2026-11-11 inbox, marked "top priority right now" — "A front right wheel gave out after maybe a meter of air and landing down on the front I didn't even hear the tire pop So that's pretty interesting I think we should double check when a wheel fails versus where the tire fails A wheel with a tire on it should be quite resilient It's only after the puncture that it should be relatively fragile"
relates: [BUG-140, FEAT-193]
---
lane: B

# A wheel fails on a ~1 m landing with the tire still inflated

## What

A front-right wheel failed after roughly 1 m of air, landing nose-down. No tire pop was heard first.
The owner's rule: **an inflated tire protects the wheel.** A wheel with air in its tire should be quite
resilient. Only after the puncture, running on the rim, should the wheel be relatively fragile.

To find out: the order of the two failure checks in `src/damage.js` (does wheel damage see the same impact
load as the tire, with no cushion from the inflated carcass?), the thresholds for each, and whether the tire
did pop silently (a missing sound is a second bug). Reproduce headless: a 1 m drop, nose-down, on a healthy
tire and wheel.

## Acceptance

- [x] Headless: the drop height / impact load at which (a) an inflated tire pops, (b) the wheel under an inflated
  tire fails, (c) the wheel under a flat tire fails. Report the three numbers before and after.
- [x] With an inflated tire the wheel survives every landing the tire survives, and by a clear margin beyond it.
- [x] A flat-tire wheel is fragile (today's behaviour or the owner's number).
- [x] If the tire did pop without a sound, the pop is audible. (It did not pop: see Cause.)
- [x] Physics fingerprint re-pinned only if the step changed; damage gates green. (The step did not change.)

## The 1 m landing, reproduced headless

Rig: the real `stepPhysics`, the game's contact (`world-contacts` → the FEAT-70 tire cylinder), the damage
model stepped in the game's order (`stepPhysics` → `readRimStrikes` → `damage.step` → `feedContact`). Fresh wheel,
fresh tire. Script: `wip/bug-160/drop-rig.mjs` (git-invisible) on feature/machine.

Cases: 1 m flat; nose-down 10 / 20 / 30° at 0 / 15 / 25 m/s; nose-down onto a 10–20° upslope at 15–25 m/s;
rolled 10–20° onto the right front; landing across a 15 cm kerb at 13–27 m/s and 15–90°; landing the right front on a
hazard rock (scale 0.5–1.5). Worst road rim load 37 kN (the kerb), worst rock core load 3 kN, no armour impact.
**No case takes anything off a fresh wheel**, on today's main or on the build the owner drove.

## Cause

The owner's note is stamped 2026-11-11 09:51 UTC. BUG-158's fix (the road rim yield 46 → 80 kN) landed that day
at 18:19 UTC, so the owner drove the 46 kN build. BUG-158's "one failed from airtime" is most likely this same
landing. Even on that build a 1 m landing cannot bend a fresh wheel (the road rim load stays under 46 kN). So the
wheel was almost certainly already worn. The jalopy starts wheels at 70–100 %, and on that build a 15 cm kerb at
45 mph and 30° took 22 % per strike (BUG-158).

The rule the owner states was broken by design, though, and still is on main:

- **A fresh tire could never pop on a landing.** The bump-stop puncture curve only applies below 50 % tire
  condition (`punctureCond`). So every road rim strike went straight to the wheel, and a 7–10 m drop bent the wheel
  and then wrote it off while the tire still held air.
- **On rocks the rim yielded before the tire split.** The rim yield on the wheel core is about 85 kN. The hazard
  pop is about 100 kN.
- **The tire did not pop silently.** Every pop path (bump stop, hazard rock, pinch energy, debug button) queues on
  `popped`, and `main.js` plays the bang for it on the same step. The owner heard no pop because there was none:
  the wheel failed on its own.

## Resolution

`src/damage.js`: an inflated tire takes a rim strike first.

- `rimPinchRoadMult` 24 × static wheel load (about 80 kN, the 7 m drop). A road rim strike this hard
  pinch-flats an inflated tire at any condition, with the bang. This is the old onset of wheel damage, so what used
  to start bending the rim now pops the tire instead.
- `rimInflatedMult` 2. While the tire holds air, both rim yields are doubled: road about 160 kN, rock about 170 kN,
  now above the 100 kN hazard pop. The overload scales are unchanged.
- A strike is priced on the state it struck in. The pinch that pops the tire is still priced as an inflated
  strike, because the air leaves after the hit, not during it.

Both numbers are on the debug panel (Damage → "Rim pinch pops tire", "Wheel yield under air"). The damage HUD's
floors note names them.

### The three thresholds, flat drops, fresh wheel (front corner)

| | before (main) | after |
|---|---|---|
| (a) inflated tire pops: fresh | never (> 14 m) | 7–7.5 m (80 kN) |
| (a) worn 50 / 25 / 10 % | 3.3 / 3.0 / 1.65 m (bump-stop curve) | unchanged |
| (b) wheel under air: first loss | about 7 m (80 kN) | about 8.2 m (160 kN) |
| (b) 8 / 9 / 10 m | 13 / 53 / 100 % | 0 / 10 / 42 % (the tire pops first) |
| (b) written off | 10 m | about 14 m |
| (c) wheel under a flat: first loss | 3 m (82 kN) | unchanged |
| (c) 4 / 5 / 7 m | 2 / 5 / 13 % | unchanged |

The owner's build (46 kN yield) for comparison: (b) first loss about 5.6 m, and 6 / 7 / 8 m cost 2 / 7 / 26 %.

The order, swept on the gate: no road strike from 1 to 400 kN bends a wheel whose tire it did not pop. The first
wheel loss (161 kN) is 2× the pop (81 kN).

A finding, not changed: through a flat the rim load levels off at 130–170 kN, so above about 9 m a flat-tire wheel
loses less than an inflated one (10 m: 18 % flat against 42 % under air). That is the existing road-residual
measurement. It only matters for drops no player survives.

### Kerbs (BUG-158's loads, on the new rule)

- 15 cm kerb, 10–30 mph at any angle (≤ 9 kN): nothing, as before.
- 45 mph straight on (79 kN): nothing. This is 1 kN under the pop, so it sits right on the edge.
- 45 mph at 45° (215 kN): the tire pops and the wheel loses 17 % (it was 65 %).

### Gates

`test/damage-rim-strike.mjs`. §1 and §4 pin the yield mechanics through a flat, because the yields are the
flat-tire yields now. §2 pins the inflated anchors (7 and 8 m: 0 %, 10 m: 42 %) and the BUG-158 loads through a
flat. A new §6 pins the order: a fresh tire pops at the pinch with the bang queued, every wheel loss comes after a
pop with at least a 1.5× margin, a mid-range strike leaves the wheel whole under air and bends it under a flat, and a
hazard-pop rock strike leaves an inflated wheel whole. 20/20 affected gates green.

### Owner calls (defaults chosen, all tunable)

- `rimPinchRoadMult` 24 (a fresh tire pops on a 7 m drop and on a 45 mph kerb strike at 30°+). Lower it if tires
  should pop sooner. 45 mph straight onto a 15 cm kerb sits 1 kN under it.
- `rimInflatedMult` 2. A wheel under air now first bends at about 8.2 m, takes 42 % from 10 m, and is written off
  only at about 14 m. BUG-158 had "10 m writes it off". 1.5 would give a first loss at about 7.7 m and about 70 %
  at 10 m.
- The flat-tire wheel stays at today's numbers (first loss at a 3 m drop).
