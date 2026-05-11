# RangerSim — Research Summary

**Synthesized:** 2026-05-10
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md
**Overall confidence:** HIGH

---

## Stack Recommendation

| Layer | Choice | Version | Notes |
|-------|--------|---------|-------|
| Rendering | Three.js | r184 (0.184.0) | ES module build via CDN importmap — required pattern since r147 |
| Debug UI | lil-gui | bundled in three/addons | `three/addons/libs/lil-gui.module.min.js` — no extra CDN needed |
| FPS monitor | stats.js | bundled in three/addons | `three/addons/libs/stats.module.js` — wire in from day one |
| Physics | hand-rolled | — | No Cannon.js/Rapier — required for per-wheel Pacejka + load transfer access |
| Hosting | GitHub Pages | — | No build step; importmap + ES modules work natively |
| Local dev | `python3 -m http.server` or `npx serve` | — | ES modules require HTTP, not file:// |

**importmap (use exactly):**
```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/"
  }
}
</script>
```

**Do not use:** dat.GUI (dead since 2020), Web Workers (no rAF in workers, GitHub Pages blocks SharedArrayBuffer), global `<script>` Three.js tag (pre-r147 pattern), Euler angles for body rotation.

---

## Feature Landscape

### Table Stakes (must ship or it doesn't feel like a game)
- Speed readout (km/h), slip angle HUD, throttle/brake bar
- Visible wheel rotation (per-wheel angular velocity in physics)
- Spring-follow chase camera + cockpit toggle (C key)
- Handbrake (Space) — essential for RWD drift initiation; must reduce rear Pacejka D, not just friction scale
- R key reset to spawn
- Speed-scaled steering limit (reduces max lock at high speed — big feel improvement, trivial cost)
- Physics that allow rollover

### Differentiators (what makes this interesting)
- Live Pacejka curve with real-time operating point dot (already in prototype — keep and polish)
- Rollover physics that actually work (no browser car game does this well)
- Real-time parameter tuning while driving (debug menu IS the gameplay loop, not a dev afterthought)
- Swappable vehicle specs (Ranger as default, data-file driven — architecture cost already paid)
- Scenario testing / JSON log system (unusual in browser games)
- G-force meter (cheap to add, visually compelling during drifts)

### Anti-features (explicitly do not build)
- Race mode / lap timer, multiplayer, damage model, audio (v1), mobile touch controls, 3D model upload, minimap, AI/NPC vehicles, photorealistic shading

### MVP HUD
Speed + front slip angle (color-coded) + throttle/brake bars. Add G-force meter immediately after drift physics are validated.

---

## Architecture Guidance

### Module Structure (strict one-way dependency chain)

```
index.html
  └── src/main.js          ← RAF loop, input, camera, scene, scenario runner
        ├── src/vehicle.js ← assembly: 4 wheels, body, drivetrain, Ackermann
        │     ├── src/tire.js         ← Pacejka + friction circle (pure functions, no state)
        │     ├── src/suspension.js   ← spring-damper, wheel vertical state
        │     └── src/drivetrain.js   ← torque delivery (flat now, engine/trans/diff later)
        └── src/physics.js ← 6DOF integrator, quaternion rotation, Newton-Euler
data/ranger.js             ← Ford Ranger spec (no imports — pure data)
docs/GLOSSARY.md           ← sign conventions, term definitions
```

No module imports from downstream. This eliminates all circular dependency risk.

### Physics Pipeline (each fixed timestep — ORDER IS MANDATORY)

```
1. Input sampling          → steering delta, throttle fraction, brake boolean, handbrake boolean
2. Steering geometry       → Ackermann per-wheel steer angle [rad]
3. Suspension forces       → spring + damper → suspForce [N] per wheel; wheel vertical integration
4. Normal force resolution → ground contact → Fz [N] per wheel (clamped >= 0; skip tire if Fz=0)
5. Tire forces             → Pacejka Fy + Fx [N] per wheel; friction circle coupling
6. Force/torque accumulate → net body force + torque from 4 tires + drag
7. Rigid body integration  → Newton-Euler: update linearMomentum, angularMomentum, quaternion
8. Wheel angular velocity  → drivetrain torque − longitudinal tire force × radius → omega_wheel
9. Constraints             → ground penetration correction, wheel lift-off zeroing
```

Order matters: suspension must run before tires because Pacejka D-factor = peakMu × Fz (dynamic normal force from suspension).

### Key Interface Contracts

**tire.js** — pure functions, no state:
```javascript
lateralForce(alpha, Fz, params)   // → Fy [N]
longitudinalForce(kappa, Fz, params) // → Fx [N]
frictionCircle(Fy_raw, Fx_raw, Fz, peakMu) // → { Fx, Fy } (vector-normalized, not sequential priority)
slipAngle(contactVelocity, wheelForward) // → alpha [rad]
```

**suspension.js** — accepts terrain params from day one (flat ground passes `terrainHeight=0`):
```javascript
suspensionStep(ws, cornerY, cornerVy, terrainHeight, params, dt)
  // → { suspForce, normalForce }
cornerWorldState(bodyState, localOffset, bodyAngularVelocity)
  // → { worldPos, worldVel }
```

**drivetrain.js** — extensible interface (flat torque now, engine curve later):
```javascript
getDriveTorque(wheelIndex, vehicleState, params)
  // → torque [N·m] — returns constant for phase 1; hooks in engine model later
```

**vehicle.js** — assembly layer:
```javascript
vehicleStep(vs, bodyState, input, terrain, spec, dt)
  // terrain: (x, z) => { height, normal: THREE.Vector3 }  ← flat ground stub from day one
  // → { netForce, netTorque, debugData }
```

### Rigid Body State (physics.js)
```javascript
{
  position:        THREE.Vector3,   // world [m]
  linearMomentum:  THREE.Vector3,   // kg·m/s (velocity = momentum / mass)
  quaternion:      THREE.Quaternion, // world orientation — normalize every step
  angularMomentum: THREE.Vector3,   // kg·m²/s
}
```

### Coordinate System (repeat in every module header)
```
// Three.js Y-up world space: +Y=up, +X=right, -Z=car forward at heading 0
// forward = (0,0,-1).applyQuaternion(q), right = (1,0,0).applyQuaternion(q)
// Sign conventions: see docs/GLOSSARY.md
```

---

## Top Pitfalls

| # | Pitfall | Phase | Prevention |
|---|---------|-------|-----------|
| 1 | **Euler gimbal lock** — confirmed prototype failure. Breaks at 90° roll/pitch. | physics.js | Quaternion only. Never store orientation as scalars. |
| 2 | **Suspension geometry linearization** — `sin(pitch) + sin(roll)` approximation wrong at high angles | suspension.js | Use `mountOffset.applyQuaternion(bodyQ)` — exact for any orientation. |
| 3 | **Contact patch frame mismatch** — omega in body frame, r in world frame → wrong cross product | tire/vehicle interface | Transform omega to world frame before cross product. Document frame on every vector. |
| 4 | **Pacejka C >= 2.0** — curve crosses zero, produces reverse force, feedback oscillation | tire.js | Hard clamp C to [1.0, 1.99] at parameter ingestion. Add math comment explaining why. |
| 5 | **Stiff spring blowup** — explicit Euler unstable when k·dt²/m > 2 | suspension.js | Ranger at 21000 N/m → ratio 0.19 (safe). Clamp slider max to k_max = m/(dt²) = 108,000 N/m. |
| 6 | **Negative normal force to tire** — lifted wheel produces reversed tire forces | suspension.js | Clamp Fz >= 0 before tire call; skip tire entirely when Fz = 0. |
| 7 | **Object allocation in physics hot path** — GC pressure causes frame spikes | all physics modules | Pre-allocate result buffers at module scope. No `new` objects inside physicsStep. |

---

## Cross-Cutting Themes

**1. The prototype is the reference, not the starting point.**
backup12.html has correct patterns (accumulator loop, Ackermann geometry, Pacejka formula, friction circle priority scheme) that should be transcribed rather than re-derived. Its failures (Euler angles, linearized suspension, static Fz) are all structural and are fixed by the quaternion 6DOF architecture.

**2. Every failure mode concentrates in Phase 1.**
All 7 critical pitfalls above must be addressed in the physics core before any UI, camera, or debug work. Validating physics isolation (tire unit test, suspension drop test, body conservation test) before assembly is the correct build order.

**3. The debug menu is not optional or decorative.**
For a physics sandbox, real-time parameter tuning while driving IS the gameplay loop. It should be polished and always-accessible, not a dev afterthought hidden behind a key.

**4. Surface normal support is an architectural commitment, not a feature.**
The `terrain: (x, z) => { height, normal }` function signature in `vehicleStep` costs nothing now and avoids a painful refactor when infinite terrain arrives. Flat ground passes `height=0, normal=(0,1,0)`.

**5. Drivetrain extensibility is an interface commitment.**
`getDriveTorque(wheelIndex, vehicleState, params)` returning a constant in phase 1 but accepting engine/transmission state later — the interface must not require breaking changes when the full drivetrain model is added.

---

## Roadmap Implications

The user's proposed 6-milestone structure is sound with two refinements:

| Milestone | User's Proposal | Refinement |
|-----------|----------------|------------|
| 1 | 3D world, steering, no suspension | Add: quaternion 6DOF rigid body from day one. Validate physics isolation before render. |
| 2 | Debugger / log generator | Combine: debug menu is trivial (lil-gui already bundled) — do both in one milestone |
| 3 | Tire friction vs slip curve | Unchanged. Pacejka + wheel angular velocity + handbrake. |
| 4 | Debug menu | Moved to milestone 2 (see above) — opens a milestone for rollover validation ramp |
| 5 | Suspension | Unchanged. Spring-damper, load transfer, weight transfer visualization. |
| 6 | Rollover validation ramp | Unchanged. Static wedge prop, rollover scenario tests. |

**Terrain milestone** (post-milestone 6): Needs its own research phase before implementation. Chunk ring-buffer + Web Worker heightmap + physics normal integration is a non-trivial integration question specific to browser 60fps constraints.

**Suggested phases for roadmap agent:**
1. Core physics engine (6DOF body, flat tire placeholder, input, basic render)
2. Scenario system + debug menu (JSON log runner, lil-gui sliders, HUD)
3. Tire model (Pacejka, wheel angular velocity, handbrake, friction circle)
4. Suspension (spring-damper, dynamic Fz, weight transfer)
5. Validation props + polish (rollover ramp, camera modes, g-force meter)
6. Procedural terrain (research phase required first)
