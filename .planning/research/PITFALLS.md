# Domain Pitfalls: Browser-Based 6DOF Car Physics

**Domain:** Hand-rolled vehicle physics simulation in JavaScript/Three.js
**Researched:** 2026-05-10
**Sources:** Prototype code analysis (backup12.html), vehicle dynamics first principles, FSAE-level physics knowledge, known prototype failure modes

---

## Critical Pitfalls

Mistakes that cause rewrites, physics breakdown, or unfixable behavioral bugs.

---

### Pitfall 1: Euler Angle Gimbal Lock (CONFIRMED — already hit this)

**What goes wrong:** When representing body orientation as three separate scalar angles (yaw/pitch/roll) and composing them as Euler angles, there exists a degenerate configuration at 90° pitch where two axes become coplanar. The car can no longer roll — it yaws instead. Rotation integration also accumulates error non-linearly past ~60° tilt.

**Why it happens:** The prototype used `carGroup.rotation.y = theta`, `.x = pitch`, `.z = roll` with `rotation.order = 'YXZ'`. At 90° pitch, the X and Z axes collapse into one. Three.js `Euler` objects expose this directly — it is not a Three.js bug, it is fundamental to the representation.

**Consequences:** Physics breakdown at extreme angles. Rollover simulation becomes impossible. Attempting to fix it by reordering Euler axes just moves the singularity to a different angle; it cannot be eliminated without changing representation.

**Prevention:** Use `THREE.Quaternion` for body orientation from day one. Represent angular velocity as a 3D vector in world space. Update quaternion each step via:
```
q_new = q + 0.5 * dt * [0, omega_x, omega_y, omega_z] * q
```
Then normalize. Never decompose back to Euler for physics calculations — only decompose for rendering if absolutely required.

**Warning signs:**
- Car can roll to ~60-70° but then starts spinning in yaw instead of continuing to roll
- `carGroup.rotation.order = 'YXZ'` anywhere near physics integration
- Pitch or roll exceeding ~80° causes sudden heading changes

**Phase/module:** `physics.js` — must be correct at initialization. This is not fixable by patching later.

---

### Pitfall 2: Pacejka C Parameter Crossing Zero

**What goes wrong:** The Pacejka shape factor `C` controls the "width" of the curve. When `C >= 2.0`, `sin(C * atan(...))` passes through zero at high slip angles, meaning the tire produces *no lateral force* (or inverts sign) at extreme slip. The car gains grip with more slip, which is physically impossible and causes oscillatory instability.

**Why it happens:** The formula is `F(α) = D * sin(C * atan(B*α - E*(B*α - atan(B*α))))`. The argument to `sin` can reach `C * π/2`. When `C >= 2`, this exceeds `π`, and `sin` returns negative — the curve crosses zero and produces reverse force at extreme angles.

**Consequences:** At high slip angles the tire "locks in" a feedback loop. The car oscillates between extreme slip angles with growing amplitude. Looks like a resonance bug or a sign error — the actual cause is the parameter constraint.

**Prevention:**
- Hard-clamp `C` to `[1.0, 1.99]` in any slider or parameter loader. Do not allow `C = 2.0` even.
- The prototype correctly enforced `C < 2.0` — document this constraint explicitly in `tire.js` as a code comment with the mathematical explanation.
- Recommended for a truck tire: `C = 1.5` (lateral), `B = 10`, `E = 0.5`.

**Warning signs:**
- Oscillating slip angle that grows instead of damping
- Car "grips up" again at very high slip angles (physically wrong)
- Debug slider for `C` moved above 1.9 in testing

**Phase/module:** `tire.js` — enforce constraint at parameter ingestion, not just at slider level.

---

### Pitfall 3: Quaternion Normalization Drift

**What goes wrong:** Quaternion multiplication is not perfectly numerically stable. After thousands of integration steps, floating-point accumulation causes the quaternion's magnitude to drift from 1.0. A non-unit quaternion applies scaling to the mesh and corrupts angular velocity calculations. The body appears to shrink or grow, and rotation rates become wrong.

**Why it happens:** Each integration step: `q = q + 0.5 * dt * omega_quat * q`. The addition is approximate; `|q|` grows or shrinks by O(dt²) per step. Over 60 steps/second this is ~3600 tiny errors per second.

**Consequences:** Subtle at first — visual "breathing" of car size, then incorrect roll/pitch angles, eventually NaN if magnitude reaches zero (divide-by-zero in normalization).

**Prevention:**
- Normalize quaternion every physics step: `q.normalize()`. Three.js `Quaternion.normalize()` is available.
- Cost is negligible (4 divides per step).
- Add a debug assertion: if `Math.abs(q.length() - 1.0) > 0.01`, log a warning — this indicates a bug upstream of normalization.

**Warning signs:**
- Car mesh slowly changes apparent size over long sessions
- Physics behaves differently after 5+ minutes of play vs first minute
- `q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z` measurably != 1.0

**Phase/module:** `physics.js` — add normalize call at end of every integration step, before forces are computed next frame.

---

### Pitfall 4: Stiff Spring Numerical Instability (Explicit Euler Blowup)

**What goes wrong:** Spring-damper systems integrated with explicit Euler become numerically unstable when `k * dt² / m > 2`. With `SPRING_STIFFNESS = 21000 N/m`, `WHEEL_MASS = 30 kg`, `dt = 1/60`:

```
k * dt² / m = 21000 * (1/3600) / 30 = 0.194
```

This is stable (threshold is 2.0), but just barely. If stiffness is raised to explore stiffer setups (50,000+ N/m) or if dt is variable (frame-rate dependent loop), the system blows up — wheel positions diverge to ±infinity within seconds.

**Why it happens:** Explicit Euler sees the spring force at the start of the step and applies it for the full `dt`. If the force is large relative to mass and dt is large, the overshoot exceeds the restoring force in the opposite direction, and oscillation amplitude grows geometrically.

**Consequences:** Wheels launch to ±infinity. Physics NaNs immediately follow. Browser tab may freeze or crash. Looks like a "random crash" because it only triggers when a specific parameter combination is hit.

**Prevention:**
- Keep the stability criterion check: `k * dt² / m < 1.0` (comfortable margin, not the theoretical 2.0 limit).
- For the Ranger with `k=21000, m=30, dt=1/60`: ratio = 0.19. Safe.
- If higher stiffness is needed, switch to semi-implicit Euler (velocity updated before position) or add sub-stepping for the suspension loop only.
- Clamp slider max stiffness in the debug menu to the safe range — compute the limit dynamically: `k_max = 1.0 * m / (dt * dt) = 108,000 N/m`.
- In `suspension.js`, add a comment with the stability formula and the Ranger's operating margin.

**Warning signs:**
- Wheel position values suddenly jump to large numbers (>100m from origin)
- Physics crashes only after changing stiffness slider, not at startup
- `wheelY[i]` becomes NaN or Infinity

**Phase/module:** `suspension.js` — enforce parameter bounds at init and in slider callbacks.

---

### Pitfall 5: Contact Patch Velocity Sign Error (Slip Angle Gets Inverted)

**What goes wrong:** The contact patch velocity calculation `v_contact = v_CG + omega × r` requires the correct cross product direction. In the prototype's 2D approximation:

```javascript
const wcX = vx + omega * wheel.rz;  // correct: +omega * rz for X component
const wcZ = vz - omega * wheel.rx;  // correct: -omega * rx for Z component
```

A sign error here produces a contact patch velocity that is the mirror image of the actual velocity. Slip angles will be inverted — left turns produce right-pushing tire forces, and the car understeers catastrophically or spins in reverse.

In 3D quaternion physics the cross product is `omega_vec.cross(r_vec)`. If `omega_vec` and `r_vec` are in different frames (one body-local, one world), the cross product is wrong by a rotation.

**Why it happens:** The 3D version requires `r` (wheel offset from CG) to be in world frame, and `omega` to also be in world frame. If angular velocity is stored in body frame and not transformed before the cross product, the contact patch velocity is correct only when the car is unrotated (yaw = 0, pitch = 0, roll = 0).

**Consequences:** Steering feels inverted. Drifting goes the wrong direction. The bug is often masked at small angles (cross product error is small when car is near-upright) and only becomes obvious at roll angles >30°.

**Prevention:**
- In `tire.js`, document the frame of every vector: `omega_world` (rad/s in world frame), `r_world` (wheel offset in world frame).
- Always transform `omega` from body frame to world frame before computing contact patch: `omega_world = q.apply(omega_body)`.
- Unit test: stationary car, yaw rate = 1 rad/s, front-left wheel. Contact patch velocity should point exactly laterally (car-right). Verify direction before connecting to tire forces.

**Warning signs:**
- Car turns right when steering left at high speed
- Slip angles appear correct at low speed but invert direction at high roll angles
- Physics is fine when car is flat but breaks when tilted

**Phase/module:** `tire.js` and `physics.js` interface — add a frame-of-reference comment block before every cross product.

---

### Pitfall 6: Ackermann Sign Error at Lock and Near-Zero Steering

**What goes wrong:** The Ackermann formula divides by `tan(steerAngle)`. Near `steerAngle = 0`, `tan(steerAngle) → 0` and `R = L / tan(steerAngle) → infinity`. This is mathematically correct (straight line has infinite radius) but causes division-by-zero or NaN in subsequent calculations.

At negative steer angles, the inner/outer wheel assignment flips. A common error: computing `R = L / tan(steerAngle)` then using `R - t` and `R + t` without tracking sign, so the "inner" wheel becomes the outer one.

**From the prototype:**
```javascript
function getAckermannAngles(steerAngle) {
  if (Math.abs(steerAngle) < 0.001) return { left: 0, right: 0 };
  const R = L / Math.tan(steerAngle);
  const deltaL = Math.atan(L / (R - t));
  const deltaR = Math.atan(L / (R + t));
  return steerAngle > 0
    ? { left: deltaL, right: deltaR }
    : { left: deltaR, right: deltaL };
}
```

This is correct but fragile. At near-zero steer, the deadzone (0.001 rad) prevents division by zero. But there is a discontinuity: for `|steerAngle| = 0.001` the function jumps from exact zero to the Ackermann result. This is acceptable but should be documented.

**More dangerous case:** At very large steer angles (~MAX_STEER), `R - t` can become negative if `R < t`. For the Ranger: `L = 2.85m`, `t = 0.73m`. At `steerAngle = MAX_STEER = 0.6 rad`: `R = 2.85 / tan(0.6) = 2.85 / 0.684 = 4.17m`. `R - t = 3.44m` — safe. But if `MAX_STEER` is increased to ~1.0 rad (`tan(1.0) = 1.557`): `R = 1.83m`, `R - t = 1.10m` — still safe. For `steerAngle` approaching `atan(L/t) = atan(2.85/0.73) = 1.32 rad`, `R → t`, meaning the inner wheel would need to pivot in place (zero turning radius) — `deltaL = atan(L/0) = π/2`. Beyond this: `R < t`, and the formula returns a negative argument to `atan`, producing a negative angle (wheel pointing backward). This is physically meaningless.

**Prevention:**
- Clamp `MAX_STEER` such that `R_min > t * 1.5` (safety margin). For the Ranger: `steerAngle_max = atan(L / (t * 1.5)) = atan(2.85 / 1.095) = atan(2.60) ≈ 1.20 rad`. Use a lower practical max (0.6–0.7 rad is realistic for a truck with power steering lock).
- Add assertion in `getAckermannAngles`: `if (R < t * 1.1) log warning`.
- Implement the geometric constraint check at vehicle spec load time, not just at runtime.

**Warning signs:**
- Front wheels visually cross or point backward at full lock
- Steering feels normal at moderate angles but becomes erratic at full lock
- `atan` returns values > 90° for inner wheel

**Phase/module:** `vehicle.js` (spec validation on load) and `steering.js` / `tire.js`.

---

## Moderate Pitfalls

---

### Pitfall 7: Fixed Timestep Spiral of Death

**What goes wrong:** The "spiral of death" is when physics simulation falls behind real time. Each frame, the simulation accumulates `dt_real - dt_physics` of unpaid time. If a GC pause or heavy render takes 50ms when `dt = 16ms`, the next frame must run 3+ physics steps. If those 3 steps take >16ms, the next frame owes 4 steps, and so on. The browser tab becomes unresponsive.

**From the prototype (correct prevention already applied):**
```javascript
acc += Math.min((now - lastTime) / 1000, 0.1);  // cap accumulator at 100ms
```

The `Math.min(..., 0.1)` cap is the prevention. Without it, a 500ms tab-switch pause would require 30 physics steps to catch up, causing a visible freeze.

**Why it matters more in browser:** JavaScript GC is non-deterministic. A GC pause of 50-200ms is common on complex pages. Browser tabs can be backgrounded and suspended. `requestAnimationFrame` is throttled to 1fps when tab is hidden.

**Prevention:**
- Always cap the physics accumulator: `acc = Math.min(acc + elapsed, MAX_CATCHUP)` where `MAX_CATCHUP = 0.1` (6 steps at 60Hz) is a reasonable limit.
- The cap value trades off determinism vs responsiveness: larger cap = more deterministic but longer freezes; smaller cap = smoother but simulation runs slow in real time after a pause.
- Log a warning if more than 3 consecutive catchup steps occur — this indicates performance headroom is insufficient.

**Warning signs:**
- Game freezes for 1-2 seconds after switching tabs and returning
- Physics runs in apparent slow-motion after a browser GC event
- `performance.now()` gap between frames occasionally > 500ms in logs

**Phase/module:** `main.js` animation loop.

---

### Pitfall 8: Object Allocation in the Physics Hot Path (GC Pressure)

**What goes wrong:** Creating JavaScript objects (including arrays) inside `physicsStep()` causes heap allocation on every physics tick. At 60Hz this is 60 allocations/second minimum; each can be larger if nested objects are created. The GC must collect these, and when it does, it pauses the JS thread. The pause is non-deterministic (can be 5ms or 200ms) and kills framerate.

**Common offenders in physics code:**
- `return { fxW, fzW, Mz, alpha }` inside `computeWheelForces` — creates a new object every call (4x per frame = 240 objects/second)
- `const wheels = [...]` constructed every frame with 4 new objects
- `{ rx, rz, steer, driven }` wheel descriptors created inline
- `THREE.Vector3` temporaries created for cross products

**Prevention:**
- Pre-allocate all result objects at module scope, reuse them. Instead of `return { fxW, fzW }`, write into a persistent output buffer: `WHEEL_FORCE_BUF[i].fxW = ...`.
- Pre-allocate the wheel descriptor array once, update properties in place each frame.
- For Three.js math, maintain a pool of `THREE.Vector3` and `THREE.Quaternion` scratch objects; call `.set()` to reuse rather than `new`.
- Use `Float64Array` or `Float32Array` for numeric state (wheel positions, velocities) — typed arrays avoid object overhead and are cache-friendly.
- In the hot path, never use `Object.assign`, spread (`...`), or array destructuring — these allocate.

**Warning signs:**
- Chrome DevTools Memory profiler shows steady allocation rate during physics loop
- GC "major" events visible in Performance timeline during gameplay
- Frame time spikes correlate with allocation pressure, not render complexity

**Phase/module:** `tire.js`, `suspension.js`, `physics.js` — apply at initial write, not as a post-hoc optimization.

---

### Pitfall 9: Suspension Geometry Breakdown at High Roll/Pitch

**What goes wrong:** The prototype computes body corner height as:
```javascript
const cornerY_body = y + RIDE_HEIGHT + cornerForward[i] * Math.sin(pitch) - cornerRight[i] * Math.sin(roll);
```

This is a first-order linearization: it assumes pitch and roll are independent and small. At `pitch = 90°`, `sin(pitch) = 1` and the formula gives a plausible number, but the actual body corner positions require a full rotation matrix or quaternion rotation of the local mount offset into world space.

At combined high roll + high pitch (say 45° each), the linearized formula's error becomes significant. The computed corner height is wrong, which means spring compression is wrong, which means normal forces are wrong. The car can appear to float above ground on one side while physically penetrating on the other.

**The correct approach:** Transform the local mount offset `(lx, ly, lz)` by the body quaternion to get its world-space position, then take the Y component as the corner height. This is exact for any orientation.

```javascript
// Correct (quaternion-based):
const mountLocal = new THREE.Vector3(lx, ly, lz);
mountLocal.applyQuaternion(bodyQuaternion);
const cornerY_body = bodyPosition.y + mountLocal.y;
```

**Consequences:** Incorrect normal forces at high angles. Rollover physics feels "floaty" — the car rolls but doesn't settle because corner forces are wrong. Contact patch jumps discontinuously near 90°.

**Warning signs:**
- Wheels appear to penetrate ground on one side during roll
- Normal force on one wheel spikes to very high value during high-angle maneuvers
- Car oscillates or bounces after rollover instead of settling

**Phase/module:** `suspension.js` — must use quaternion rotation from day one, not the linearized approximation.

---

### Pitfall 10: Wheel-Body Decoupling (Visual/Physics Mismatch)

**What goes wrong:** The prototype explicitly notes "Wheels are scene-level objects decoupled from body pitch/roll — they don't inherit body rotation, only receive it visually." This caused wheels to appear in the right place visually but have physics state (wheelY) that did not account for body tilt. At 45° roll, a wheel that should be lifted is still computed as if the body is flat.

**In 6DOF:** Wheel attachment points are body-local offsets. Their world positions are computed by rotating those offsets by the body quaternion. If wheel physics state (spring length, contact detection) is computed from world-space wheel positions derived from quaternion rotation, and rendering uses the same computation, there is no mismatch. The prototype's decoupling was a symptom of the Euler-based architecture — it cannot occur if wheels are always computed as `body_position + q.rotate(local_offset)`.

**Prevention:**
- In the new architecture, wheels have no independent orientation state. They are defined as local offsets from body CG. All world positions are computed from those offsets + body quaternion each physics step.
- There is no separate "visual" update vs "physics" update — the same quaternion rotation produces both.
- Each wheel module stores: local offset (constant), spring compression (scalar), angular velocity (scalar for spin). World position is always derived, never stored as primary state.

**Warning signs:**
- Wheel meshes visually clip through ground while physics says they are in contact
- Wheel visual positions diverge from physics positions at high angles
- Need for a "visual update" function separate from "physics update"

**Phase/module:** `vehicle.js` architecture — establish this contract at system design, not after wheels are implemented.

---

### Pitfall 11: Normal Force Sign at Low-Speed and Wheel Lift

**What goes wrong:** When a wheel lifts off the ground (suspension extends past natural length), the spring pulls rather than pushes. This is physically correct for a suspension with a jounce bump stop, but for a simple spring the computed `suspForce` goes negative (extension). If this negative force is passed as `normalForce` to the tire model, the tire tries to produce negative grip — which is nonsensical and can cause sign reversal in all tire forces.

**From the prototype:**
```javascript
groundNormalForce = WHEEL_MASS * GRAVITY + suspForce;
if (groundNormalForce < 0) groundNormalForce = 0; // wheel lifting off
```

The clamp is the prevention. Without it: a lifting wheel produces a small negative suspForce (spring in tension), yielding a small negative normal force, yielding a small negative `tirePeakForce`, yielding reversed tire forces — the lifted wheel pushes the car sideways in the wrong direction.

**Prevention:**
- Always clamp normal force to zero before passing to tire model: `Fn = Math.max(0, suspForce + wheelWeight)`.
- When `Fn = 0`, skip tire force computation entirely (not just clamp it) — small efficiency gain and avoids any edge cases in Magic Formula at `D = 0`.
- Add a boolean `inContact[i]` flag that gates tire force accumulation.

**Warning signs:**
- Car produces unexpected lateral forces when wheels are clearly airborne
- Rolling over causes sudden force spike from a lifted wheel
- Normal force debug display shows negative values

**Phase/module:** `suspension.js` and `tire.js` interface.

---

### Pitfall 12: Rollover Feels Wrong — CG Height Error

**What goes wrong:** The effective CG height governs when rollover occurs. For a lateral acceleration `a_y`, rollover happens when `a_y > g * (track/2) / CG_height`. For the Ranger: `CG_height ≈ 0.55m`, `track/2 = 0.73m`. Rollover threshold: `a_y = 9.81 * 0.73 / 0.55 = 13.0 m/s² ≈ 1.33g`. This is physically correct for a Ranger.

If CG height is set too low (common mistake: using body mesh center instead of actual vehicle CG), the rollover threshold is too high and the car never tips. If CG height is too high, it tips at low speeds unrealistically.

**Additional error:** The moment arm for roll torque from lateral tire forces is `CG_height + WHEEL_RADIUS` (force applies at ground, moment arm is full height from ground to CG). Many implementations use just `CG_height` (moment arm from wheel center to CG), which is shorter and underestimates roll tendency by `WHEEL_RADIUS / total_arm`.

**Prevention:**
- Use the real value: Ranger CG height from ground ≈ 0.55m. This is from suspension jounce position, not static ride height.
- Document in `vehicle.js` what the CG height represents: height above ground plane, not above any other reference.
- Roll torque calculation: moment arm = `body_CG_height_above_ground` (which varies with suspension travel). In 6DOF, this comes naturally from the cross product of force position and force direction — but verify the force application point is at the contact patch (ground level), not at wheel center or suspension mount.

**Warning signs:**
- Car rolls over easily on flat ground at moderate speeds (CG too high)
- Car can be driven on two wheels indefinitely with no rollover (CG too low)
- Roll behavior changes dramatically when spring stiffness is adjusted (suggests moment arm is coupled to spring geometry)

**Phase/module:** `vehicle.js` (spec definition) and `physics.js` torque accumulation.

---

## Minor Pitfalls

---

### Pitfall 13: Friction Circle Instability with Hard Proportional Scaling

**What goes wrong:** A common friction circle implementation scales *both* lateral and longitudinal forces proportionally when the combined force vector exceeds the friction circle:

```javascript
// Dangerous pattern:
const totalForce = Math.sqrt(Fx*Fx + Fy*Fy);
if (totalForce > maxForce) {
  Fx *= maxForce / totalForce;
  Fy *= maxForce / totalForce;
}
```

This causes sudden lateral force discontinuities when longitudinal force changes abruptly (throttle application, braking onset). The discontinuity creates a feedback oscillation: reduced lateral force → car yaws → slip angle changes → lateral force recalculates → new discontinuity. The oscillation grows until the car spins or the simulation diverges.

**Prevention:** Use the lateral-priority + penalty approach from the prototype: compute lateral force first (unconstrained), clamp longitudinal to the remaining budget, then apply a smooth penalty to lateral based on longitudinal usage fraction. This preserves lateral force continuity and damps oscillation naturally.

**Warning signs:** Car oscillates at the grip limit — rapid left-right yaw oscillation that grows in amplitude. Throttle application at grip limit causes sudden spin.

**Phase/module:** `tire.js` friction circle coupling.

---

### Pitfall 14: Longitudinal Slip Model Without Wheel Angular Velocity

**What goes wrong:** Using drive force directly (as the prototype does) without modeling wheel angular velocity means: no wheelspin, no burnouts, no traction loss from excessive throttle, and no ABS-style behavior under braking. This is acceptable for a first iteration but must be designed around — do not compute longitudinal force as `if (driven) F = driveForce` in the architecture, because retrofitting wheel angular velocity requires changing the fundamental per-wheel state.

**Prevention:**
- From day one, each wheel has: `omega_wheel` (angular velocity, rad/s), `inertia` (I_wheel, kg·m²).
- Longitudinal slip ratio: `kappa = (r * omega_wheel - v_long) / max(|v_long|, epsilon)`.
- Drive torque applied to `omega_wheel`, reaction torque transfers to body.
- Even if simplified at first, the *variable* and *integration step* must exist in the architecture so the tire model can reference it.

**Warning signs:** Drive force that doesn't depend on wheel spin state. No wheelspin under hard acceleration. Braking that is speed-independent.

**Phase/module:** `vehicle.js` wheel state definition, `tire.js` slip ratio calculation.

---

### Pitfall 15: Render Interpolation Missing (Physics Steps Visible as Judder)

**What goes wrong:** Running physics at exactly 60Hz and rendering also at 60Hz should be smooth. But if the render frame and physics step are not synchronized — which is the normal case with a fixed-step accumulator — the rendered position can be anywhere between the previous physics position and the current one. Without interpolation, the car appears to "stutter" at a frequency of `|f_render - f_physics|` Hz.

**Prevention:**
- Compute interpolation alpha: `alpha = acc / dt` (how far between last step and next step).
- Render position: `render_pos = lerp(prev_pos, curr_pos, alpha)`.
- Requires storing `prev_pos` and `prev_quat` each physics step.
- Same for quaternion: `render_quat = prev_quat.slerp(curr_quat, alpha)`.

**Warning signs:** Subtle jitter visible at low speeds where position changes per step are small but the render doesn't land exactly on a physics position. Most noticeable in cockpit view.

**Phase/module:** `main.js` render loop and `physics.js` state export.

---

### Pitfall 16: Signed Slip Angle Convention Mismatch

**What goes wrong:** SAE convention defines slip angle `α` as positive when the tire points left of the velocity vector (right-hand system). Some implementations define it with opposite sign. The Pacejka formula produces lateral force with a specific sign relative to `α`. If the sign convention between slip angle calculation and force sign is mismatched, the car turns the wrong way.

**From the prototype:**
```javascript
const alpha = Math.atan2(wLat, Math.abs(wLong));
let Fy = -tirePeakForce * Math.sin(TIRE_C * Math.atan(x - TIRE_E * (x - Math.atan(x))));
```

The `-` before `tirePeakForce` is the convention choice. The force opposes the lateral velocity. This is correct: positive `wLat` (drifting right) produces negative `Fy` (force pointing left, restoring). Any change to either the slip angle sign or the Fy sign without changing the other breaks the car.

**Prevention:**
- Write the sign convention explicitly in `tire.js` header: which direction is positive `alpha`, which direction is positive `Fy`.
- Add a unit test: velocity pointing in +X direction, car heading pointing in +Z direction (90° slip). `alpha` should be consistent with the convention. `Fy` should point in +Z direction (restoring toward velocity vector).

**Warning signs:** Car steers correctly at small angles but the lateral force overpowers rather than corrects at large angles. Spiral spin-out at any steering input.

**Phase/module:** `tire.js` — document convention in the module header comment block.

---

## Phase-Specific Warnings

| Phase / Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Core physics initialization | Euler angles surviving in any variable | Search for `rotation.x = pitch` or `rotation.z = roll` anywhere — should be zero occurrences |
| Quaternion integration | Normalization drift | Add `q.normalize()` as the last line of every integration function |
| Tire model — lateral | C > 1.99 in any parameter path | Enforce at parameter ingestion, not UI level |
| Tire model — friction circle | Hard proportional scaling | Use lateral-priority + penalty pattern from prototype |
| Suspension — spring | Stiffness slider without bounds check | Compute k_max from stability criterion and enforce it |
| Suspension — geometry | Linearized sin(pitch) approximation | Use `applyQuaternion()` on mount offset instead |
| Suspension — normal force | Negative Fn reaching tire model | Clamp at zero before tire force call |
| Ackermann steering | Near-zero and lock edge cases | Deadzone guard + max steer geometry check at load |
| Wheel spin (longitudinal) | Missing omega_wheel state | Include wheel angular velocity in state from day one even if simplified |
| Physics loop | No accumulator cap | Add `Math.min(acc, MAX_CATCHUP)` before the while loop |
| Hot path allocation | Objects created inside physicsStep | Pre-allocate all result buffers at module scope |
| Rollover validation | Wrong CG height reference | Document: CG height = distance from ground plane, not from body origin |
| High-angle combined rotation | Separate pitch + roll addition | Use quaternion rotation of mount offset — no sin/cos approximations |

---

## Sources

All findings derive from:
- Direct analysis of the prototype (backup12.html) — confirmed failure modes and working patterns
- Vehicle dynamics first principles (SAE tire convention, Pacejka 1987/1994, rigid body mechanics)
- FSAE-level suspension and tire knowledge from project context
- Numerical methods for stiff ODEs (explicit Euler stability criteria)
- Known Three.js Euler/Quaternion behavior (documented in THREE.Euler constructor notes)

Confidence: HIGH for pitfalls directly observed in prototype code. HIGH for pitfalls with mathematical derivations (stability criterion, Ackermann geometry limit). MEDIUM for GC pressure and render interpolation (general JS runtime knowledge, not prototype-specific).
