# JSCar — Project Summary

## What this is
A browser-based 3D car physics game built in a single `index.html` using Three.js (r128).

## Files
- `index.html` — the game (working file)
- `backup10.html` — latest stable backup (suspension + sliders)
- `backup9.html` — pre-slider suspension
- `backup8.html` — first working suspension
- `backup7.html` — pre-suspension (cones, yaw damping, friction circle)
- `backupfriccircle.html` — stable backup with friction circle, quadratic drag
- `backup4.html` — backup before friction circle was added
- `tire_curve.html` — interactive Pacejka curve plotter (hover to read values)

## Tech stack
- Three.js r128 (loaded from cdnjs CDN)
- Vanilla JS, no build system
- All physics in SI units (metres, seconds, Newtons, kg)

---

## Car model
Based loosely on a Volvo 240:
- **Wheelbase:** 2.64m (CG to front axle: 1.19m, CG to rear axle: 1.45m)
- **Track width:** 1.42m (half-track 0.71m, wheels at lx=±0.71)
- **Total mass:** 1200 kg (body: 1080 kg, wheels: 4 × 30 kg)
- **Yaw inertia:** 1800 kg·m²
- **Pitch inertia:** 2500 kg·m²
- **Roll inertia:** 2000 kg·m²
- **Layout:** RWD (rear wheels driven, front steerable)

## Wheel model
- `CylinderGeometry(0.312, 0.312, 0.205, 16)` rotated 90° on Z
- Physics radius: 0.312m
- Tyre section width: 205mm
- Wheel mass: 30 kg each
- Wheel spin (visual only): `wheelSpinAngle += (vLong * DT) / WHEEL_RADIUS`
- Wheels are scene-level objects (not children of carGroup) — they don't inherit body pitch/roll, only receive it visually

## Steering
- **Ackermann geometry** — each front wheel gets its own angle based on turn radius
  - `R = L / tan(steerAngle)` — turn radius to centreline
  - Inner: `atan(L / (R - t))`, Outer: `atan(L / (R + t))`
- **Max steer:** 0.6 rad (~34°)
- **Steer rate:** exponential smoothing — 0.03 build-up, 0.12 snap-back to centre

---

## Physics model

### Per-wheel force calculation (4 wheels each frame)
1. Compute wheel contact patch velocity: `v_wheel = v_car + yawRate × r`
2. Project into wheel-local frame to get `wLong` and `wLat`
3. Compute slip angle: `alpha = atan2(wLat, |wLong|)`
4. Compute lateral force via Pacejka Magic Formula (scaled by normal force from suspension)
5. Compute longitudinal force (drive/brake)
6. Apply friction circle constraint (smooth coupling)
7. Convert wheel-frame forces to world frame
8. Accumulate force and torque on car body
9. Compute pitch/roll torques from tire forces at contact patch height

### Pacejka Magic Formula (lateral only)
```
F(α) = -D · sin(C · atan(B·α - E·(B·α - atan(B·α))))
```
Current parameters (all adjustable via debug sliders):
- `TIRE_PEAK_MU = 0.9` — peak friction coefficient
- `TIRE_B = 10.0` — stiffness factor (controls initial slope)
- `TIRE_C = 1.5` — shape factor ← must stay < 2.0 to prevent zero crossing
- `TIRE_E = 0.5` — curvature factor (controls post-peak drop)
- `D = TIRE_PEAK_MU × normalForce` per tyre (normal force comes from suspension)
- **C < 2.0 is a hard constraint** — above this the curve crosses zero at extreme slip angles

### Friction circle (smooth coupling)
Lateral force takes priority, longitudinal is constrained to remaining budget, then lateral gets a smooth penalty based on longitudinal usage:
```
Fy_clamped = clamp(Fy, -tirePeakForce, tirePeakForce)
longBudget = sqrt(tirePeakForce² - Fy_clamped²)
Flong = clamp(Flong, -longBudget, longBudget)
longUsage = |Flong| / longBudget          // 0 to 1
lateralPenalty = 1.0 - (longUsage × 0.4)  // up to 40% reduction
Fy_coupled = Fy_clamped × lateralPenalty
```
This avoids the instability that hard proportional scaling causes (sudden lateral discontinuities → feedback oscillation → lag).

### Longitudinal forces
- **Drive force:** derived from HP setting: `DRIVE_FORCE = HP × 745.7 / 30` (default 160 HP ≈ 3977 N), split across rear two wheels
- **Braking:** `BRAKE_FORCE = 8000 N` total, split across all 4 wheels (2000 N each), applied when S pressed while moving forward
- **Reverse:** half drive force when moving slower than 1.34 m/s (~3 mph)

### Drag
- **Quadratic drag:** `F_drag = AIR_DRAG × v²` where `AIR_DRAG = 1.8 N·s²/m²`
- **Top speed:** `sqrt(DRIVE_FORCE / AIR_DRAG)` ≈ 47 m/s ≈ 170 km/h

### Suspension system
Full spring-damper suspension with per-wheel vertical dynamics:

**Architecture:**
- Each wheel is a separate body with its own y position and velocity (wheelY, wheelVy)
- Body has vertical dynamics (y, vy), pitch, and roll as independent DOFs
- Springs connect body corners (at mount height above CG) to wheel centers
- Ground collision constrains wheels to stay above ground level
- Normal force at each tire comes from suspension, not static weight distribution
- Load transfer is solved implicitly by suspension geometry

**Per-wheel spring-damper (each frame):**
```
cornerY_body = y + RIDE_HEIGHT + cornerForward[i] × sin(pitch) - cornerRight[i] × sin(roll)
currentSpringLength = cornerY_body - wheelY[i]
compression = SPRING_LENGTH - currentSpringLength
springForce = SPRING_STIFFNESS × compression
damperForce = -SPRING_DAMPING × (cornerVy_body - wheelVy[i])
suspForce = springForce + damperForce
```

**Ground contact:**
```
if wheelY[i] <= WHEEL_RADIUS:
  wheelY[i] = WHEEL_RADIUS
  groundNormalForce = WHEEL_MASS × g + suspForce  (clamped >= 0)
```

**Body integration:**
```
vy += (-BODY_MASS × g + totalSuspForceOnBody) / BODY_MASS × DT
pitchRate += (pitchTorqueFromSusp + pitchTorqueFromTires) / PITCH_INERTIA × DT
rollRate += (rollTorqueFromSusp + rollTorqueFromTires) / ROLL_INERTIA × DT
```

**Tire force pitch/roll torques:**
Tire forces originate at the contact patch (ground level). The moment arm from CG to contact patch creates pitch/roll:
```
heightOffset = (wheelY[i] - WHEEL_RADIUS) - y  // contact patch to body CG
Fx_car = fxW × sin(theta) + fzW × cos(theta)   // world to car frame (forward)
Fz_car = fxW × cos(theta) - fzW × sin(theta)   // world to car frame (lateral)
pitchTorque += heightOffset × Fz_car
rollTorque -= heightOffset × Fx_car
```

**Default parameters (adjustable via debug sliders):**
- `SPRING_LENGTH = WHEEL_RADIUS` (0.312m) — unloaded spring length
- `SPRING_STIFFNESS = 21000 N/m`
- `SPRING_DAMPING = 1000 N·s/m`
- `RIDE_HEIGHT = 0.3m` — upper mount height above body CG (higher = body sits lower)

### Yaw damping
- Speed-dependent: lerp 0.3 → 1.0 over 0–5 kph
- Low-pass filter on omega below 5 kph (10% old, 90% new)

### Integration
- `vx += (Fx / MASS) * DT`
- `omega += (Mz / INERTIA) * DT`
- `theta += omega * DT`
- `pos += vel * DT`
- Body vertical, pitch, roll integrated separately from suspension forces
- Fixed timestep: DT = 1/60

---

## Debug menu (backtick key)
- Tire curve plot (Pacejka visualization)
- Sliders: B, C, E, Peak μ, HP, Brake force, Spring stiffness, Damping, Ride Height
- Cones toggle checkbox

---

## Planned features / roadmap

### Drive modes (input modulation, no physics changes)
Three selectable drive modes that scale tractive force and steering responsiveness:
- **Cruise** (60% power, 50% steering rate) — gentle, forgiving handling
- **Boogey** (80% power, 75% steering rate) — balanced sporty driving
- **Step on it** (100% power, 100% steering rate) — full performance

Implementation: scale `DRIVE_FORCE` and steering rate multipliers based on mode selection (HUD button or keypress).

### Procedural terrain (noise-based infinite world)
Generate an infinite driveable world using Perlin/Simplex noise for heightmap-based terrain:
- Noise function maps world position (x, z) → height (y) for natural-looking rolling terrain
- Chunk-based loading: generate terrain in ~100m sections around player, load/unload as needed
- Dual mesh generation: visual mesh (Three.js) + collision mesh (physics) must match exactly
- Smooth chunk seeding for repeatable world (same position = same terrain across sessions)
- LOD optimization: distant chunks use coarser geometry for performance
- Car physics on slopes: extend normal force calculation to handle non-flat ground and surface normals

Technical considerations:
- Mesh generation is CPU-intensive; may need to offload to Web Workers
- Chunk boundary seams must be avoided (careful with edge vertex interpolation)
- Physics collision mesh must be triangle-exact match to visual mesh
- Will require adding collision mesh support to physics engine

---

## Known issues / open work
- **No wheel spin simulation** — wheel visual spin is based on car speed, not actual wheel angular velocity. No traction loss from wheelspin.
- **Binary keyboard input** — W/S/A/D give full input immediately. Could add analog gamepad support.
- **Flat world** — single ground plane with no terrain features. See roadmap for procedural terrain plans.
- **Wheel meshes inherit pitch/roll visually only** — wheels copy body pitch/roll for appearance but their physics Y positions are independent.

---

## Keeper decisions (don't revert these)
- World scale is 1:1 SI — no fudge multiplier on position integration
- Ackermann geometry is correct for current L and t values
- Wheel spin rate matches ground speed: `angle = distance / radius`
- `C < 2.0` to prevent Magic Formula zero crossing
- Wheel cylinder rotated 90° on Z, spins on X axis
- Friction circle uses smooth coupling (lateral priority + penalty), NOT hard proportional scaling (which causes lag/oscillation)
- Damper force sign is negative (opposes relative velocity, not amplifies it)
- Wheels are scene-level objects decoupled from body pitch/roll
- Suspension mount height (RIDE_HEIGHT) controls how low the body sits — higher mount = lower body
- Tire pitch/roll torques use contact patch height (ground level), not wheel center
