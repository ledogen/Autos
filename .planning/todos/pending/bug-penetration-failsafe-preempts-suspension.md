---
id: BUG-24
type: bug
status: open
opened: 2026-06-28
severity: high
source: user-observation (shoulder stress-test) + capture analysis
capture: logs/rangersim-capture-1782632966689.json   # kind:event, seed 6, 292 frames, t 102.5–107.3
related: BUG-15 (intended 0.25 m road-over-shoulder step is the trigger, but is working as designed)
---

# BUG-24: Catastrophic-penetration failsafe preempts the suspension → body teleports up instead of being pushed by tire force

## Observed

Driving repeatedly over the road shoulder edge (stress-testing tire/suspension/collision), the body
**occasionally teleports straight up** instead of the wheel pushing the suspension and the suspension
pushing the body. The expected behaviour: wheel collides with the (intended) 0.25 m road-over-shoulder
step → tire spring compresses → strut compresses → body rises naturally. Instead the chassis snaps up and
the vertical velocity dies, then it falls back.

## Root cause (CONFIRMED from `logs/rangersim-capture-1782632966689.json`)

It is an **ordering + threshold bug in the catastrophic-penetration failsafe**, NOT a surface defect.
The 0.25 m road-over-shoulder step is **intended** (the eb108e7 dropoff — the road sits ~0.25 m above the
carved shoulder, by design).

**Execution order inside `stepPhysics` (`src/physics.js`):**
1. **Step 1 — failsafe** (`physics.js:115-131`): for each wheel hub, `queryContacts(hub, wheelRadius)`;
   if `maxEmbed > 0.3` → `vehicleState.position.y += maxEmbed; vehicleState.velocity.y = 0`.
2. **Step 2.5 — suspension substeps** (`physics.js:145` → `suspension.js:329-388`): the *natural chain* —
   `tireFn = tireStiffness·depth (+ tireDamping·vel)` → drives the strut ODE → `_suspForceAccum` pushes
   the body up along the strut axis.

The failsafe runs **first**, so on the single frame the wheel crosses the step it preempts the suspension
entirely.

**Why it fires on a resolvable contact (the threshold is below the wheel radius):**
- `wheelRadius = 0.368 m`, failsafe threshold `= 0.3 m`.
- Crossing the edge, the hub contact depth instantly becomes `0.25 (intended step) + ~0.06 (loaded tire
  standing deflection) ≈ 0.31 m` → exceeds 0.3 → fires.
- But at depth 0.307 the hub **center is still 0.061 m ABOVE ground** (`wheelRadius − depth`). The wheel
  has NOT tunnelled — it is a deeply-compressed tire in **normal contact**, exactly what the suspension
  resolves. Genuine tunnelling (the failsafe's actual purpose) is `depth > wheelRadius` (hub center
  submerged). The threshold (0.3) sitting below the radius (0.368) is the defect.

**Evidence (from the capture, off-thread analysis):**
- Integration is exact every frame (`py[i+1] = py[i] + vy·dt`, residual 0.000 m) EXCEPT two frames —
  **f112 (t=104.333)** and **f237 (t=106.417)** — where `py` jumps **+0.30 m in one tick that velocity
  did not predict** and `vy` flips positive→~−0.1. Post-step `maxEmbed > 0.3` occurs at exactly 2 frames
  (f111, f236) → the failsafe fires twice, nowhere else.
- The snap magnitude is **~0.30 m both times == the trigger threshold** (`maxEmbed ≈ 0.31`, just over).
  At the snap, 3 of 4 wheel normal forces drop to 0 N — the body is lifted off its tires.
- It is the **loaded, straddling OUTER wheel** (FR, `fr_fn ≈ 6000 N`; CG lat ≈ 4.8–5.0 m, just inside
  `halfWidth`=5). Hub barely moves at the boundary (`ΔhubY = +0.005 m`); the embed jump is the resolved
  ground under the FR hub stepping up the intended ~0.25 m as the wheel crosses the edge.
- **The natural chain demonstrably works** — it's only preempted, not broken. In the frames *after* each
  teleport the failsafe overshoots (lifts body the full 0.31 m, other wheels `fn=0`), then the suspension
  takes over normally: `fr_fn` rebuilds `2012→3770→4614→5273 N` over f112–f115 and `vy` goes
  `−0.11→−0.24→−0.35→−0.45` as the body settles back under spring force. The only misbehaving frame is the
  one the failsafe hijacked.
- (Ruled out: the Baumgarte body-sphere corrector at `physics.js:576-582` would need ~1.2 m sphere
  penetration to move 0.30 m and never zeroes velocity.)

## Fix directions (planning)

The failsafe should fire only on **genuine tunnelling**, never on resolvable deep contact:
1. **Gate on `depth > wheelRadius`** (hub center actually below the surface) rather than a flat 0.3 m —
   the physically meaningful line between "compressed tire" and "wheel inside the ground". A loaded wheel
   on the intended 0.25 m step (depth ~0.31 < 0.368) then falls through to the normal suspension path;
   true tunnelling (depth > 0.368) still gets rescued.
2. **And/or run the failsafe AFTER the suspension substeps**, so it only catches penetration the force
   chain could not resolve in a step (defence in depth).
3. Raising the bare threshold alone is fragile (it just moves the misfire point) — prefer the
   radius-relative test.

Whatever the fix: a wheel crossing the intended shoulder step must resolve through tire→strut→body force
(a bounded bump), never a position write. If a rescue is genuinely needed (true tunnel), prefer a bounded,
velocity-preserving correction over `position.y += maxEmbed; velocity.y = 0`.

## Acceptance

- Driving over the shoulder edge produces a natural suspension bump (tire force → strut → body), no
  vertical position teleport and no all-wheel contact loss from a position snap.
- The catastrophic-penetration failsafe still rescues genuine tunnelling (e.g. a wheel driven through a
  wall/steep face so the hub center is below the surface).
- Headless: replaying `logs/rangersim-capture-1782632966689.json` no longer shows a `>threshold` failsafe
  fire at f111/f236 (the contact resolves through the suspension); add a gate that asserts no
  position-vs-velocity integration discontinuity (`|Δp − v·dt| < ε`) while a wheel is in normal contact.

## Fix landed 2026-06-28 (headless green — pending in-browser confirm)

`src/physics.js` Step 1: trigger changed from a flat `maxEmbed > 0.3` to **`maxEmbed > params.wheelRadius`**
(the hub center is below the surface = genuine tunnelling). A deep-but-resolvable contact
(`0.3 < depth < wheelRadius`, e.g. the intended shoulder step + loaded tire deflection) now falls through
to the suspension substeps (Step 2.5), which resolve it via tire→strut→body force — no position teleport.
The rescue action for a true tunnel (`position.y += maxEmbed; velocity.y = 0`) is unchanged. One-line
change; failsafe still runs at Step 1 (kept simple — moving it after the substeps was not needed).

New gate `test/penetration-failsafe.mjs` (registered in `run-all.mjs`): drives real `stepPhysics` with a
controllable flat-surface mock and asserts (A) a step landing in the critical window `(0.3, wheelRadius)`
produces NO per-frame position write (`|Δpy − vy·dt| < 0.05` over 40 frames) and the body climbs via
suspension force, and (B) a true tunnel (`depth > wheelRadius`) STILL triggers the rescue snap. Verified
the gate is a real guard: with the old `0.3` threshold scenario A fails (0.337 m teleport caught), with
the fix it passes. **All 19 gates green.**

REMAINING: in-browser confirm — drive over the shoulder edge (the original stress-test) and verify the
crossing now feels like a suspension bump, not an up-snap. (Re-capture if any teleport recurs.)

## Notes / relationships

- **BUG-15** (carve↔shoulder discontinuity): the 0.25 m step that triggers this is BUG-15's *intended*
  dropoff (eb108e7), working as designed — this is a separate physics-ordering bug, not a surface defect.
- **Harness caveat:** `node test/replay.mjs` on this capture FAILS its terrain self-check (headless
  `analyticHeight` is 0.96 m off the recorded `rd_gh`), so the analysis above used the **recorded**
  telemetry (`px..pz`, `*_sc`, `*_gh`) reconstructed against `getWheelPosition`, not the headless terrain
  model. `terrain-headless.mjs` appears to have drifted from the live carve (eb108e7
  `carveHalfWidth`/`roadClearanceMargin`); worth repairing so the replay path covers this capture.
- The failsafe is tagged TERR-FIX-01 (Phase 6) and was written for flat-ground tunnelling; the
  wheel-radius-relative reframing is the durable fix.
