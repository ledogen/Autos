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

## Fix implemented 2026-07-05 (branch fix/bug-20-static-friction, uncommitted — pending feel-test)

**The ticket's root cause was right but its evidence was bogus.** `steep-rest.mjs`'s `brake` arg is the
S key = REVERSE in this model (getDriveTorque applies -maxReverseTorque at low speed), not a park brake —
so the "41 m/s on 25°" runaway was the car held in reverse gear, not braking. The real park brake is
`vehicleState.handbrake` (rear-only). Under handbrake the car crept 0.2–0.75 m/s down 5–25° (the user's
"slowly slides downhill") — that is the true bug.

**Fix (physics.js, BUG-20 tags):**
- SLIP_EPSILON 3.0 → 0.05 (numeric floor only) so the carcass relaxation spring accumulates at rest.
- Replaced the lateral steady-state (sLatSS) anti-slosh clamp with a **friction-circle break-away clamp**:
  cap combined |(sLong,sLat)| ≤ `tireBreakawaySlip` (0.18 m, new ranger.js param ≈ Pacejka-peak slip;
  slider in debug.js). Mirrored in the ω Newton loop + ω=0 recompute. Gives honest static friction and
  replaces the floor's blow-up protection.
- steep-rest.mjs: added `park` (arg5=1 → handbrake) + corrected the misleading `brake` comment.

**Results:** handbrake creep 0.2–0.75 → ~0.002–0.04 m/s (holds 5–25°, slides smoothly at 30° — rear-only
is expected); lateral rest 0.28 → 0.01 (no BUG-03 slosh regression, no chatter); normal launch/driving
identical; penetration-failsafe + body-contact-energy gates PASS.

**Left OPEN** pending user in-browser feel-test (gridmap + sloped terrain). `tireBreakawaySlip` is the
grip/drift-feel knob to tune.

## Slosh RESOLVED via carcass re-parameterization (2026-07-05, no input-gating band-aid)

The handbrake slide-to-stop longitudinal slosh (twin of BUG-03) was the break-away spring ringing at
rest. Two damper approaches were built and REVERTED as band-aids (they gate on input conditions / mask
the symptom): a LuGre σ1 `F+=c·ds/dt` (numerically unstable, injects energy) and a handbrake-gated
`−c·v` settle damper. User rejected both — wanted the behavior to emerge from more accurate parameters.

Root insight: the steady-state grip curve depends only on the RATIO `L/vRef` (= Pacejka(κ·L/vRef)),
while the stored carcass displacement — and thus the slosh energy — scales with `L` alone. So shrink L
and vRef together (0.3/1.0 → 0.1/0.3333, ratio held at 0.3): identical grip, ~1/3 the carcass
displacement → slosh gone (user confirmed in-browser, "solved 99%"), force builds snappier. No damping,
no gating.

Two knock-on changes:
- **Break-away moved to Pacejka-ARGUMENT space** (`sBreak = tireBreakawaySlip · vRef`, physics.js x2).
  The friction limit is a fixed point on the grip curve (the peak, x≈0.18), not a fixed displacement;
  with the smaller vRef a fixed-displacement clamp sat deep in the unstable post-peak region and the
  steep-slope hold crept. Now it auto-scales with vRef and stays at the peak as the sliders retune.
- **GUI: coupled sliders** (debug.js). Removed the independent L / vRef sliders (moving one alone
  silently rescales grip). Added "Carcass Length / Slosh" (drives L, moves vRef with it → grip held,
  only sloshiness changes) + "Relax:VRef Ratio (grip)" (changes L/vRef at fixed L).

Residual tradeoff (now a tunable, not a bug): shorter L = stiffer carcass = less "catch range", so the
rear-only handbrake hold on 20–25° slopes loosens (creep ~0.04→~0.3 m/s at L=0.1 vs L=0.3). The slosh
slider exposes this directly — nudge it up for a tighter steep-hill hold at the cost of a little slosh.
A future stick-slip Coulomb model would remove the tradeoff entirely but is not needed now.
