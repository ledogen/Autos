---
id: FEAT-135
type: feature
status: done
severity: minor
opened: 2026-10-21
relates: FEAT-41 (settings page), FEAT-125 (pad — rumble), BUG-92 (rumble not felt), FEAT-126 (clutch assist — same assist pattern)
---

# FEAT-135: Anti-lock brakes (driver assist, on by default)

## Request

Owner, 2026-10-21: add ABS as a driver assist, on by default. "I would rather it mimic a real life
anti-lock brake system than be the theoretical ideal system": sample wheel speeds at a realistic
rate, use simple logic to pick a target speed, and pulse the brakes to hold it.
Rulings: **4-channel** (one sensor + valve per wheel), feedback = **controller rumble** only.

## Built

`src/abs.js`, a pure module stepped once per physics step by `stepPhysics`. It outputs a per-wheel
line pressure `abs.p[i]` ≤ pedal, which `getBrakeTorque` uses in place of the pedal.

- **Sensors:** four wheel speeds (|ω|·r) plus a longitudinal accelerometer (specific force, so it
  over-reads braking downhill — kept). Both are read at the start of the step: one loop of lag.
- **Reference speed:** the fastest wheel, falling no faster than the measured decel + 1 m/s²
  (capped at 1.2 g). A wheel-only reference with a fixed slope failed in testing. On loose ground
  all four wheels slide together, the reference followed them down, rear lock-up went undetected
  and the truck spun. 4x4 and modern systems carry the decel sensor for exactly this reason.
- **Valve per wheel** (simplified Bosch phases):
  - **dump** while slip > 0.3 and the wheel is still slowing;
  - **hold** while it's recovering, or decelerating > 1.6 g;
  - **build:** straight from the pedal until the first dump; after that, a fast build back to 80% of
    the last lock pressure, then 3/s steps.
- ABS stands down below 8 km/h, so the wheels lock in the last metre. The handbrake bypasses it: rear
  torque = max(service, handbrake).
- Settings row "anti-lock brakes" (on by default). Debug sliders under Drivetrain & Brakes → ABS.
- Pad rumble on each fresh dump (the pedal kick-back), in the left trigger where the pad supports
  `trigger-rumble`.
- Gate `test/abs-stop.mjs`. Headless states without `vehicleState.abs` brake exactly as before.

## Findings for the owner

- **The tire model crests at 40–50% slip** (s = slip × tireRelaxationLength). A road tire crests at
  10–15%. A locked tire keeps about 97% of peak force; a real one on asphalt keeps about 70–80%.
  So no ABS can out-stop locked wheels here, and ABS buys steering at some cost in distance:
  - dry μ 0.8: 44.4 m with ABS vs 43.8 m (the brakes can't lock the wheels on dry anyway);
  - loose μ 0.35: 86.6 m vs 79.7 m;
  - steered stop on loose ground: turns 16° vs 1.4° with locked fronts.
  `absSlipDump` was calibrated to this tire (0.3, just under the crest). A post-peak falloff in the
  tire model would be a separate tuning question.
- At the old 1300/450 N·m the brakes couldn't lock the fronts on dry, so ABS never engaged there.
  Owner 2026-10-21: both raised 10% (1430/495). Dry, full pedal now locks the fronts for 2.25 s
  without ABS (41.3 m); with ABS: 44.0 m, about 7 dumps per second per front channel.

## Acceptance

- [x] Gate green; cdp-smoke green.
- [x] Owner play-test 2026-10-21: "Feels great". The rumble is not felt → BUG-92.

## Resolution
Merged 2026-10-21 with the brakes +10% (1430/495 N·m). The owner signed off on feel. The silent rumble moved to BUG-92.
