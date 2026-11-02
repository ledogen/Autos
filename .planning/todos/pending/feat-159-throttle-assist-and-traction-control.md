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
