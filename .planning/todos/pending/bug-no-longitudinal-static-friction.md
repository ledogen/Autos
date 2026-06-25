---
id: BUG-20
type: bug
status: open
opened: 2026-06-25
source: spawn-rubberband-investigation
severity: medium
capture: Logs/rangersim-capture-1782373729245.json
---

# BUG-20: No longitudinal static friction — a car can't rest (or brake-hold) facing down a slope

## Request

A parked/braked car should be able to REST on a steep slope (real cars do, up to the friction angle
≈ atan(μ)). Today it cannot when pointing up/down the fall line: it creeps then runs away.

## Symptom (headless, test/steep-rest.mjs, 2026-06-25)

- **Across** the slope (lateral tilt / camber): rests fine — settles to ~0.1–0.3 m/s on 10–25° with no
  chatter. (The lateral path has the BUG-03 anti-slosh slip clamps that store a holding displacement.)
- **Facing downhill, FULL BRAKE**: the car slides away — **41 m/s on 25°, 49 m/s on 35°, 52 m/s on 40°**
  — instead of holding. With μ=0.9 (friction angle ≈ 42°) a braked car should hold on anything below 42°.
- Free-rolling downhill it also runs away (that part is arguably correct — a car in neutral rolls).

## Root cause (slip-VELOCITY tire model, src/tire.js + physics.js)

The tire produces force ∝ slip velocity, so at zero slip velocity it produces ~zero force → there is no
true *static* friction. The relaxation slip-DISPLACEMENT (`slipLong`, the carcass spring) is what should
provide a standing hold at v≈0, but:
- the longitudinal path has **no equivalent of the lateral sLat steady-state clamps** (physics.js ~370–376),
  so it can't store/keep the holding displacement the way the lateral path does, and
- `SLIP_EPSILON = 3.0 m/s` (physics.js ~309) floors `vCon`, which makes `slipLong` DECAY even at rest,
  capping the stored holding force well below μ·Fn.

So longitudinally the car is never held statically; it accelerates until slip velocity is high enough to
build force, reaching a high terminal speed. This is the longitudinal twin of the (resolved, lateral)
BUG-03 tire slosh.

## Fix directions (when scheduled)

- Give the longitudinal slip-displacement a proper standing-hold at low |v| — mirror the lateral sLat
  steady-state clamp so `slipLong` stores up to the static-friction displacement and doesn't bleed off at
  rest, OR add an explicit stiction/Coulomb term that delivers μ·Fn opposing the down-slope pull when
  |v_long| is below a small threshold and a brake/parking torque is held.
- Revisit the 3.0 m/s `SLIP_EPSILON` floor on the longitudinal channel (it exists to stop sLat blowup at
  rest; the longitudinal hold needs a different treatment).
- Validate with test/steep-rest.mjs: braked car must HOLD (final speed ≈ 0) facing downhill for slopes
  below atan(μ), and slide smoothly (not chatter) above it.

## Acceptance

- A braked car rests (speed → ~0) facing down any slope below the friction angle atan(μ); above it, it
  slides smoothly without chatter. test/steep-rest.mjs braked-downhill case holds at ≤ atan(μ).
- No regression in the lateral rest behavior (BUG-03) or normal driving/launch feel.

## Notes

Found while investigating the spawn "rubber-band" (capture 1782373729245). NOT the cause of that
report — that was the over-steep bench-cut road geometry (separate road fix). Deferred by user
2026-06-25: "genuinely on my list to fix but not right now."
