---
id: FEAT-159
type: feature
status: open
severity: minor
opened: 2026-11-02
source: owner, 2026-11-02 (orchestrator inbox) — "throttle assist - at low speeds prevents excessive wheelspin
  that wears tires and doesnt contribute to accelerating the vehicle ... throttle assist should do what a skilled
  human would do (modulate throttle to accelerate without spinning), not what traction control does. the player
  should still be able to spin tires in a drift with this on, handbrake u turn, etc. / traction control -
  automotive style traction control. use braking to keep tires from spinning at different rates. this should be
  trying to eliminate oversteer and would be for the more cautious and casual players to keep them in control."
relates: FEAT-39 (driver assists — this splits its assist #1 in two), FEAT-125 / FEAT-41 (settings page,
  Casual/Classic presets), FEAT-57 (cut: ABS/TC are settings, never parts), src/drivetrain.js `st.wheelspin`,
  src/tire.js slip ratio + wear, src/vehicle.js input ramps
---
lane: B

# FEAT-159: Throttle assist + traction control (two assists, two jobs)

## What

Two separate settings-page assists. They replace FEAT-39's single "throttle assistant (TCS)" item.

1. **Throttle assist — the skilled foot.** At low speed it trims the throttle so the driven tires sit near
   peak longitudinal grip instead of spinning past it. Goal: launch hard without lighting the tires up, and
   stop the keyboard's full-throttle reverse from frying them. It is an input shaper only — it never brakes a
   wheel. It must get out of the way when the player means to spin: a drift, a handbrake U-turn, a burnout
   on purpose.
2. **Traction control — the automotive system.** Brakes an individual driven wheel to keep the two driven
   wheels at the same speed (the open diff's one-wheel-spin case), and cuts engine torque to kill
   power-oversteer. For cautious and casual players. It is allowed to stop a drift — that is its job.

## Why now

On the keyboard, reverse is full throttle. The rears spin up at max speed and wear quickly. A tire that is
already worn has less grip, and the open diff sends the spin to it, so the worn tire gets worse fastest.

## Notes for the plan

- Signals already exist: `st.wheelspin` in drivetrain.js (driven surface speed minus a front-wheel /
  CG ground reference), per-wheel slip ratio in tire.js. The drivetrain comment already names a
  "fuller traction-control pass" as this consumer.
- Throttle assist: target slip ratio near the Pacejka peak, active below a speed ceiling; bypass on
  handbrake, on a large steer + yaw-rate signature (drift), and on a deliberate re-press (owner to pick
  the gesture in the plan). Honest physics (SM-INV-2): the assist only changes what the driver commands.
- Traction control: per-wheel brake torque on the faster driven wheel (a "brake-based LSD"), plus a
  torque cut on rear slip angle / yaw-rate excess. ABS-style modulation, not an on/off clamp.
- Test matrix the owner asked for: open diff and LSD; flat, off-camber, one wheel on gravel/grass;
  one tire worn; forward and reverse; keyboard and pad.

## Acceptance

- [ ] Throttle assist ON, keyboard full-throttle launch and reverse: driven slip ratio held near peak,
      0–30 mph time no worse than the best manual modulation, tire wear per launch measurably lower (number
      in the ticket).
- [ ] Throttle assist ON still allows a power drift, a handbrake U-turn and a deliberate burnout.
- [ ] Traction control ON: open-diff one-wheel spin on split grip is braked down; a power-oversteer
      entry is caught without a spin.
- [ ] Both are separate toggles on the settings page, set by the Casual/Classic presets (owner picks the
      defaults); described, never scored.
- [ ] Headless gate covering both (launch slip, split-grip spin, drift still possible with throttle assist).
- [ ] FEAT-39's assist #1 points here.

## Plan — approved by the owner 2026-11-02 (Lane B)

### Context

The owner's 11-02 ask. On the keyboard, both W and reverse (S) are all-or-nothing, so the rear tires light up and wear fast. The open diff sends the spin to the weaker tire, so the worn tire gets worse fastest. That calls for two separate assists with two separate jobs:

- **Throttle assist** is a skilled foot. It trims the throttle so the driven tires sit just under peak grip. It never brakes a wheel. It must step aside for a drift, a handbrake U-turn or a deliberate burnout.
- **Traction control (TC)** is the automotive system. It brakes the faster driven wheel, which acts as a brake-based limited-slip diff. It also cuts engine torque to stop power-oversteer. Stopping a drift is its job.

**What the tire model says (measured from tire.js and ranger.js).** This Pacejka crests at a slip ratio of about 45 % (slip ratio = (wheel surface speed − ground speed) / wheel surface speed). The break-away clamp (`tireBreakawaySlip` 0.18) holds the tire at that crest.

That means a spinning tire still pulls at about 100 % of peak, the same finding `abs-stop.mjs` made for a locked tire. So the throttle assist will not make launches faster. What it buys:

- **Tread.** Wear ∝ slip speed − 0.15 m/s (damage.js).
- **Rear lateral grip.** At full spin, the slip vector points almost entirely forward, so the tire has nothing left sideways.

The "0–30 time no worse than the best manual modulation" acceptance line is therefore a floor to hold, not a gain to chase.

### Design — one pure module, the ABS pattern

**New file `src/traction.js`** has the same shape as `src/abs.js`. It is pure: no DOM, no engine types, no Three.js.

- `makeTraction()` returns `{ cap: 1, p: [0,0,0,0], … }`.
- `stepTraction(t, pedal, vehicleState, vForward, up, params, dt)` is stepped by `stepPhysics` right before `stepDrivetrain`, beside `stepAbs`. That gives one physics step of sensor lag (16.7 ms), like the ABS.

The module sees only what a real controller sees:

- four wheel-speed sensors (the start-of-step wheel ω);
- a yaw-rate gyro (`angularVelocity · up`);
- the steering angle, the handbrake and the drive pedal.

The reference ground speed is the mean of the undriven front wheels, the classic rear-wheel-drive TC sensor.

**The two outputs:**

- `t.cap ∈ [0,1]` is the most pedal the engine is allowed: `min(throttle-assist cap, TC cap)`.
  - `stepDrivetrain` applies it where it picks the pedal: `pedal = min(driver pedal, cap)`.
  - The manual gearbox's `thr` line gets the same treatment.
  - Because that line already chooses W (forward) or S (the reverse pedal), forward and reverse are both covered.
- `t.p[2], t.p[3]` are the TC brake pressures on the rear wheels, as fractions of line pressure, the same unit as `abs.p`.
  - In `getBrakeTorque`: `service = max(service, p × maxBrakeTorqueRear × brakeDmg)`.
  - This applies in either direction of travel. Real brakes do the work, so the pads wear honestly.

A small exported helper, `drivePedal(vehicleState, params, vForward)`, moves into `drivetrain.js` so that the reverse rule (S drives reverse below walking pace) exists once. `stepDrivetrain` and `stepTraction` both call it.

### Throttle assist (the skilled foot)

- **Signal:** the faster rear wheel's slip ratio σ = (|ω|r − vRef) / max(|ω|r, vRef, 1 m/s).
  - With TC also on, it judges the slower rear instead, so TC's brake gets to fix the one-wheel spin.
  - The 1 m/s floor makes a launch from rest controllable. At rest, any wheel rotation already drives the tire's slip state to the clamp, which is peak force.
- **Target:** σ* = 0.30 [DEFAULT]. That gives 98 % of peak force at two-thirds of the crest's slip speed, the same point the ABS dump sits at.
- **Control, the ABS valve logic mirrored:**
  - Slip over target: the cap drops in proportion to the excess, and the cap where it spun is remembered.
  - Back under target: the cap restores fast to 80 % of that remembered value, then creeps up.
  - This hovers just under spin. A wheel spins up within one step at full torque, so a fast cut with a slow re-apply is what keeps it stable.
- **Steps aside (cap ramps back to 1, not snapping) when any of these holds:**
  1. The handbrake is held: U-turns.
  2. Sideslip |β| > 10° at > 3 m/s [DEFAULT]. The truck is sideways, so the player is drifting. A gripping limit corner sits at β of about 3–6°, which the gate checks.
  3. Above 15 m/s, about 34 mph (owner-approved 11-02). "At low speeds" is the owner's word.
- **No hidden gesture** (owner 11-02: "no double press. that's cheesy"). A deliberate burnout means turning the assist off on the settings page.

### Traction control (the automotive system)

- **Brake-based LSD (limited-slip diff):** when the faster rear wheel turns more than about 1 m/s faster than the slower one [DEFAULT], its brake pressure builds in proportion to the excess. Otherwise it vents. Finite build and vent rates make it modulate rather than clamp, like the ABS.
- **Torque cut:**
  - **Trigger (a), both rears spinning:** the slower rear's σ > 0.15 [DEFAULT].
  - **Trigger (b), oversteer, the ESC test:** `sign(r)·(r − r_ref) > margin`, where r is the yaw rate and `r_ref = vx·tan δ / wheelbase` is the kinematic yaw rate of the steering angle δ.
    - This catches both "rotating more than the wheel asks" and "rotating against the countersteer".
    - With no understeer term, the reference expects more yaw than the truck makes, so a gripping corner never trips it.
  - **Response:** the TC cap drops fast and restores slowly.
- TC never steps aside for a drift or the handbrake. It stands down while the service brake is on, because ABS owns the brakes then.

### Wiring

| File | Change |
|---|---|
| `src/traction.js` | new, about 120 lines with its header |
| `src/physics.js` | call `stepTraction` before `stepDrivetrain`; add the `max(service, tc)` term in `getBrakeTorque` |
| `src/drivetrain.js` | export `drivePedal`; `min(pedal, cap)` in the automatic and the manual |
| `src/vehicle-state.js` | `traction: makeTraction()` beside `abs` |
| `data/ranger.js` | `throttleAssist: false`, `tractionControl: false` (the honest baseline every gate assumes) + about 8 tuning params with comments |
| `src/settings.js` | `throttleAssist: true`, `tractionControl: false`: the player's defaults, applied at boot by main.js `_LIVE` like `abs` |
| `src/main.js`, `index.html` | two settings-page rows: "throttle assist", "traction control" |
| `src/debug.js` | a "Traction" folder beside "ABS": both toggles + σ*, the drift β and the TC split |
| `test/traction.mjs` + `test/gates.mjs` | the gate below |
| `.planning/research/LAYOUT.md`, the ticket | file map line; plan + measured table |

With both toggles off, `stepTraction` writes cap 1 and p 0 and changes nothing. So `fingerprint-physics` stays identical and so does every existing gate, including the FEAT-158 / BUG-99 rock census, which builds through `makeVehicleState`.

### Owner calls — answered 11-02

1. **Burnout gesture:** none. "No double press. that's cheesy." A burnout means the assist is off.
2. **Defaults and presets:** APPROVED. Throttle assist ON, TC OFF. Presets don't touch assists: they are player settings, not world knobs.
3. **Speed ceiling** of 15 m/s, about 34 mph: APPROVED.



### Verification

- **New gate `test/traction.mjs`:** real `stepPhysics` on flat ground, built like `abs-stop.mjs`. Off vs on, asserting:
  1. **Keyboard-ramp launch to 30 mph:** mean driven σ held in 0.15–0.45. Rear tread slide (∫ max(0, slipVel − 0.15) dt, damage.js's own wear formula) at most half of assist-off [number set from measurement]. Time ≤ 1.03 × the best fixed-pedal time with the assist off (sweep 0.3–1.0).
  2. **Full-S reverse from rest:** slide at most half of off.
  3. **Assist on, power drift:** from a steady corner, floored, β reaches > 25° as with it off. A gripping limit corner never trips the 10° bypass.
  4. **Assist on, handbrake U-turn:** heading change within 10 % of off.
  5. **Assist off, full throttle at rest:** rear slip > 10 m/s, a burnout.
  6. **TC, split grip** (one rear at 0.35 μ via `_tireMuScale`), open diff: the wheel-speed gap is braked down and 0–10 m/s is faster than off.
  7. **TC, power-oversteer entry:** off spins, on holds β < 15°. The dry-asphalt power-oversteer case gets measured first; if a 3.0 V6 can't do it on dry, the scenario runs at μ 0.5.
  8. **Both off:** cap 1 and p 0 every step.
- **The owner's matrix:** the same script with `--matrix` prints the ticket's table: open/LSD × flat/off-camber/split × worn rear × forward/reverse × keyboard ramp/pad step (launch time, tread slide, peak wheel-speed gap). It goes into the ticket's work log.
- `node test/fingerprint-physics.mjs --compare` against main must be identical. Then run the affected gates (`npm test`) and the browser smoke (`npm run test:all -- --browser`), since main.js and index.html change.
- **In-game on :3282:** keyboard W and S launches with each toggle, a drift and a handbrake U-turn.
- **Commits:** a `wip(159):` commit at each green step, the new lane rule. Copy this plan into the ticket first, because plan files get overwritten.
