# Feature Landscape: RangerSim

**Domain:** Browser-based 6DOF car physics sandbox
**Researched:** 2026-05-10
**Confidence:** HIGH for table stakes / camera / input patterns (stable, well-documented domain); MEDIUM for procedural terrain browser patterns (more implementation-specific)

---

## Table Stakes

Features users expect from anything called a car physics game. Missing any of these and it doesn't feel like a game.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Speed readout (km/h or mph) | Every car game since the 80s. First thing players look for. | Low | Already in prototype: `speedVal`. Keep it. |
| Visible car mesh with wheel rotation | Without wheel spin, driving feels broken even if physics is correct. | Low | Prototype already does this. Spin angle tracked per-wheel. |
| Chase camera that follows the car | Default expectation. Players orient themselves spatially via this. | Low-Med | Spring-follow chase already in requirements. |
| Responsive controls (< 1 frame lag) | Sticky or lagged input is disqualifying. | Low | Accumulation steering already solves this. |
| The car can crash / roll over | Physics sandbox without rollover is just a racing game. | Med | Core requirement. Quaternion physics enables this. |
| The car stays on the ground (suspension) | Without suspension, the car clips through terrain or bounces unrealistically. | Med-High | Spring-damper already in requirements. |
| Some kind of pause or reset | Players will get stuck. Need a way out. | Low | Keyboard reset (R key convention) is universal. |
| Visual feedback when drifting / sliding | Tire smoke, or at minimum a HUD indicator. Physics without feedback feels invisible. | Med | Slip angle display in prototype (`slipInfo`). Smoke is optional but high impact. |
| Friction and grip that feel plausible | Sliding on ice when you expect grip, or no sliding at all, both feel broken. | High | Pacejka already specified. This is the core. |

---

## Camera Modes

Standard camera modes in car games, ordered by player expectation:

| Mode | Description | Expected? | Complexity | Notes |
|------|-------------|-----------|------------|-------|
| Spring-follow chase | Camera lags behind car with spring, sits above-behind. The default. | Yes — table stakes | Med | Already in requirements. Lag coefficient is key UX variable — too stiff = motion sick, too loose = disorienting. |
| Cockpit / first-person | Camera locked inside cabin, pitch/roll with body. | Yes — expected | Low-Med | Prototype does this with 'C' toggle. Cabin mesh hide/show on switch. Critical for judging rollover moments. |
| Hood cam | Camera on hood, car-forward but lower than cockpit. | Nice to have | Low | Same as cockpit but offset. Players use it to judge road surface. |
| Orbit / free camera | Mouse-drag to orbit around car, zoom with scroll. | Expected in sandbox | Med | Especially important for a sandbox — players want to inspect physics from arbitrary angles. Requires OrbitControls or custom impl. |
| Cinematic / replay | Scripted or auto-positioning camera for screenshots. | Differentiator | High | Out of scope for v1. |

**Recommendation:** Implement chase (default), cockpit (toggle on C), orbit (toggle on O or Tab). Three modes is sufficient for MVP. Hood cam can be added as a variant of cockpit with a different offset.

---

## HUD Elements

What players expect to see on screen:

| Element | Expectation Level | Complexity | Notes |
|---------|-------------------|------------|-------|
| Speed (km/h) | Table stakes | Low | In prototype. |
| Gear indicator | Standard in driving games, less critical in physics sandbox | Low | For a sandbox without a real gearbox model, just show a derived "gear" from speed ranges. Not urgent. |
| Slip angle (front or avg) | Differentiator — expected by technical users, invisible to casual | Low | In prototype (`slipInfo`). Keep it. Color-code: green < 5°, orange 5–15°, red > 15°. |
| Yaw rate (deg/s) | Debug-level, not standard HUD | Low | Better in debug menu than HUD. |
| Throttle / brake bar | Standard in sim racing. Helps players understand what inputs they're applying. | Low | Two thin bars at screen edge. Very cheap, high information value. |
| Steering angle indicator | Sim-racing standard. Shows how much lock is applied. | Low | Can be a simple arc indicator. |
| G-force meter | Differentiator — compelling in a physics sandbox | Low-Med | Lateral g is visually interesting during drifts. A simple X/Y meter (dot in circle) is standard. |
| Suspension travel indicators | Very much debug territory, not standard HUD | Med | Belongs in debug panel, not HUD. |
| Rollover warning | Novelty / sandbox-specific | Low | Flash "ROLLOVER" or play with camera when roll > 90°. |
| FPS / physics timestep | Dev-facing | Low | Bottom corner, visible only in debug mode. |

**Recommendation:** MVP HUD = speed + front slip angle + throttle/brake bar. Add g-force meter as soon as drift physics are working — it immediately communicates the "physics feel" to players.

---

## Input Handling

How browser car games handle keyboard (digital) input for analog feel:

### The Core Problem

A keyboard key is binary: on or off. Real steering is analog. Naive mapping (key pressed = full lock immediately) produces undriveable, twitchy behavior. Every serious browser car game solves this with one of two approaches:

**Approach A: Accumulated rate with asymmetric return (what the prototype uses)**
- Each frame, if key held: `steer += STEER_RATE_BUILD`
- Each frame, if key released: `steer -= STEER_RATE_RETURN` (faster)
- Clamp to `[-MAX_STEER, MAX_STEER]`
- Asymmetric rates (return faster than build) simulates self-centering
- Prototype values: build = 0.03 rad/frame, return = 0.12 rad/frame

This is the right approach. It is what Drift Hunters, CarX Drift Racing Web, and similar browser drift games use.

**Approach B: Speed-scaled steering limit**
- At high speed, max steering angle is reduced (simulates realistic high-speed behavior)
- Formula: `maxSteer = MAX_STEER * (lowSpeedLimit / (speed + lowSpeedLimit))`
- Prevents snap-spins at highway speeds
- Complements Approach A, not a replacement

**Approach C: Input filtering / exponential smoothing**
- Apply a low-pass filter to the steering value each frame
- `steer_display = alpha * steer_display + (1-alpha) * steer_raw`
- Useful for dampening visual jitter, less useful for actual physics feel

**Recommendation:** Keep Approach A from prototype. Add speed-scaled max steer (Approach B) — it significantly improves highway feel. Skip Approach C unless visual jitter becomes an issue.

### Standard Key Mapping

| Key | Action |
|-----|--------|
| W / Up | Throttle |
| S / Down | Brake / Reverse |
| A / Left | Steer left |
| D / Right | Steer right |
| Space | Handbrake |
| R | Reset / respawn |
| C | Camera mode toggle |
| ` (backtick) | Debug menu toggle |
| H | Toggle HUD |
| E | Engine on/off (optional) |

Space as handbrake is universal in browser drift games. It is also the primary drift initiation tool for RWD — must be implemented.

### Handbrake Implementation

The handbrake is a table-stakes feature for a drift-focused game. It locks or heavily reduces rear wheel grip:
- Set rear wheel longitudinal force to 0
- Reduce rear lateral Pacejka D parameter by ~80%
- Do NOT use a simple friction multiplier — it must respect the friction circle

---

## Debug and Tuning Tools

What physics-based games ship for developer/power-user tuning:

| Tool | Standard? | Complexity | Notes |
|------|-----------|------------|-------|
| HTML range sliders for physics constants | Yes — this is the dat.GUI equivalent without the dependency | Low | Prototype already has this for B, C, E, peak mu, HP, brake, spring, damping, ride height. Keep. |
| Live Pacejka curve plot | Differentiator — rare in browser games | Med | Prototype already has this. It's genuinely useful and visually compelling. Keep. |
| Live operating point on Pacejka curve | Differentiator | Low (given curve plot exists) | Red dot on curve showing current slip angle. In prototype. |
| Chassis roll / pitch readout | Standard in physics sims | Low | Add to debug panel. |
| Per-wheel normal force | Advanced debug | Low | Useful for weight transfer validation. |
| Per-wheel slip angle | Advanced debug | Low | More informative than just front slip. |
| Suspension travel per wheel | Advanced debug | Low | Shows which corners are loaded. |
| JSON scenario runner | Dev-facing | Med | In requirements. Scripted input → physics log. |
| Console logging toggle | Dev-facing | Low | `debug: true` flag in constants. |
| Physics stats overlay (fps, timestep drift) | Dev-facing | Low | Monitor if fixed timestep accumulator drifts. |
| Teleport / spawn position | QoL for testing | Low | Reset to origin (R) already standard. Spawn to specific coords useful for terrain testing. |

**Recommendation:** dat.GUI is not needed. The prototype's custom slider approach is lighter and fits the no-npm constraint. Keep it. Extend it with per-wheel data as physics matures.

---

## Physics Sandbox vs Racing Game: Player Expectations

This distinction matters for what features to build:

### Racing Game Expectations
- Track with lap times
- Opponents / leaderboard
- Penalty for going off-track
- Tuning locked to pre-race garage
- Win/loss state

### Physics Sandbox Expectations (what RangerSim is)
- No objective — explore the physics
- Reset / respawn without penalty
- Tuning available in real-time, while driving
- Observe the car behave naturally from the physics
- Environment serves as a prop, not a constraint
- Rollover and crashes are features, not failures
- The "game loop" is: drive → tune → drive differently → observe result

**Key implication:** The debug menu being accessible while driving (backtick toggle in prototype) is not a debug feature — it IS the core gameplay loop. It needs to be polished accordingly. Sliders should update physics parameters immediately with zero restart required.

---

## Procedural Terrain (Browser-Specific Patterns)

For the planned infinite terrain milestone:

### Noise Functions

| Approach | Complexity | Notes |
|----------|------------|-------|
| simplex-noise.js (CDN) | Low | Standard choice. ~3KB. Fast enough for CPU-side heightmap generation. |
| Layered octave noise (fractal Brownian motion) | Med | Standard for terrain. 4–6 octaves, each at 2x frequency and 0.5x amplitude. Produces natural-looking hills. |
| Domain warping | Med | Perlin's technique — warp the input coordinates by another noise field. Produces dramatic terrain with overhangs and cliffs. Less appropriate for a car physics game (flat-to-driveable ratio is key). |

**Recommendation:** Simplex noise with 3–4 octaves. Avoid domain warping — it creates terrain that cars can't navigate. Keep terrain's maximum grade < 35° for driveable physics.

### Chunk System

| Pattern | Complexity | Notes |
|---------|------------|-------|
| Fixed-size chunk grid, generate on demand | Med | Standard approach. 16x16 or 32x32 vertex chunks. Chunks within render radius are active, outside are disposed. |
| Ring-buffer chunk reuse | High | Recycle chunk meshes as player moves instead of creating new Three.js geometries. Required for performance at 60fps with physics active. |
| Web Worker heightmap generation | High | Move noise computation off main thread. Required for seamless generation without frame drops. |

**Recommendation:** Start with simple on-demand generation (acceptable for proof-of-concept). Plan the architecture for ring-buffer reuse from day one — retrofitting it is painful.

### LOD (Level of Detail)

| Pattern | Complexity | Notes |
|---------|------------|-------|
| Distance-based vertex density | Med | Closer chunks = higher vertex count. Far chunks = lower. Three.js LOD object handles this. |
| Physics LOD (only compute surface normals for nearby chunks) | Med | Far terrain doesn't need collision-level precision. Physics raycast only against nearby chunk. |
| Geometry clipmap | High | GPU-driven LOD. Probably overkill for this project scope. |

**Recommendation:** Distance-based vertex density for graphics. Physics collisions only against the 3x3 chunk grid around the car. The PROJECT.md requirement "surface normals accounted for in physics from day one" is critical here — the physics must be designed to query a terrain normal function, not hardcode flat ground.

---

## Differentiators

Features that make RangerSim interesting vs. generic browser car game:

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Real vehicle spec data (Ford Ranger) | Grounds the simulation. Players with knowledge of the car can validate feel. | Low | Already in requirements. |
| Live Pacejka curve with operating point | Visual physics education. Players learn what slip angle peak means by watching the dot move. | Low (already in prototype) | Keep and polish. |
| Rollover physics | Almost no browser car games simulate this correctly. It's the headline feature. | High | Core of the 6DOF investment. |
| Weight transfer visualization | Showing load on each corner as the car pitches/rolls is compelling and educational. | Med | Could be 4 squares in corners, size = load. |
| Tunable in real-time while driving | No restart required to feel parameter changes. Rare in physics games. | Low (architecture already supports it) | This IS the gameplay. |
| G-force meter during drift | Visually compelling feedback. Players instinctively understand it. | Low | Should ship with v1. |
| Scenario testing system | Unusual in a browser game. Makes the physics verifiable, not just "feels right". | Med | In requirements. |
| Swappable vehicle specs | Implicit feature of data-file vehicle definition. A Miata spec file vs a Ranger spec file tells a different physics story. | Low (architecture cost already paid) | |
| Procedural infinite terrain | No finite boundary. Rare in browser games. | High | Later milestone. |

---

## Anti-Features

Explicitly do not build these. Over-scoping is the primary failure mode for solo developers.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Lap timer / race mode | Wrong product. Turns a sandbox into a game that needs tracks, opponents, leaderboard. | Add cone obstacles for informal slalom. |
| Multiplayer | No server infrastructure, explicitly out of scope. The physics determinism is for scenario replay, not sync. | — |
| Damage model | Visual damage (deforming mesh) requires physics coupling that's extremely complex. Physics damage (reduced grip after crash) is simpler but changes the tuning loop. | Show a "damage" number if desired; don't deform mesh. |
| Audio engine integration | Engine sound + tire squeal is HIGH polish value but also high implementation cost in v1. | Accept silence for v1. Audio is additive, not foundational. |
| Mobile / touch controls | Different input paradigm. Touch requires virtual joysticks or tilt, neither of which works well for keyboard-tuned physics. | Explicitly desktop-only. |
| Custom vehicle import (3D model upload) | Feature creep. The vehicle spec is a data file, not a mesh. | Allow swapping spec files. Not meshes. |
| Photorealistic shading / PBR materials | High GPU cost, no gameplay value in a physics sandbox. | Dark grid aesthetic is a feature, not a limitation. |
| Minimap | No track, no boundary, no objective — a minimap shows nothing useful. | Compass heading in HUD is sufficient if needed. |
| Achievements / progression | Wrong product category. Sandbox players self-direct. | — |
| Physics engine swap (Rapier, Ammo.js) | Explicitly out of scope. Hand-rolled physics is required for tuning transparency and learning. | — |
| AI / NPC vehicles | Major complexity. No player-facing value in a physics sandbox. | Spawn static obstacles (cones) instead. |
| Weather / time of day | No gameplay coupling with the current physics model. Friction changes from "wet road" require tire model changes that need validation first. | — |

---

## Feature Dependencies

```
Quaternion 6DOF rotation
    → Rollover physics (requires correct 3D rotation)
    → Per-wheel suspension (forces must be applied in body frame)
    → Cockpit camera (must track body pitch/roll)

Per-wheel suspension
    → Weight transfer visualization
    → Correct normal force per tire (Pacejka input)
    → Procedural terrain integration (each wheel raycasts independently)

Pacejka tire model
    → Handbrake implementation (reduces Pacejka D on rear wheels)
    → Live curve plot (already coupled)
    → Drift physics (slip angle behavior IS the drift)

Procedural terrain
    → Surface normal query in physics (must be in from day one — PROJECT.md req)
    → Chunk system (required for infinite terrain)
    → LOD system (required for performance)

Debug menu (real-time tuning)
    → All physics constants exposed as mutable variables (already structured this way in prototype)
```

---

## MVP Feature Set Recommendation

Based on the project spec and domain research, this is "it feels like a real physics sandbox" with minimum scope:

**Must ship in v1:**
1. Quaternion 6DOF physics with spring-damper suspension per wheel
2. Pacejka lateral force + friction circle
3. Real wheel angular velocity (longitudinal slip, wheelspin)
4. Spring-follow chase camera + cockpit camera (C toggle)
5. HUD: speed + front slip angle + throttle/brake bar
6. Debug menu: Pacejka sliders + live curve plot + suspension sliders
7. Handbrake (Space) — essential for drift initiation on RWD
8. R key reset to spawn point
9. Speed-scaled steering limit (complement to accumulation steering)
10. Rollover-capable physics validated with ramp prop

**Defer to milestone 2:**
- Orbit camera (nice, not critical)
- G-force meter (additive polish)
- Per-wheel suspension travel display
- Weight transfer visualization

**Defer to milestone 3+:**
- Procedural terrain and chunk system
- Scenario testing system (can be built independently of terrain)

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Table stakes features | HIGH | Stable domain — browser car games have converged on these patterns. Prototype already validates several. |
| Camera modes | HIGH | Three.js camera patterns and car game conventions are well-documented in training data. |
| HUD elements | HIGH | Observed directly in prototype, cross-referenced with standard sim-racing patterns. |
| Input handling patterns | HIGH | Accumulation steering with asymmetric return is a well-known pattern. Prototype validates the specific constants. |
| Debug/tuning tools | HIGH | Prototype demonstrates the approach. No external validation needed. |
| Procedural terrain browser patterns | MEDIUM | General noise/chunk patterns are well-known; browser-specific performance limits at 60fps with active physics need phase-specific research when that milestone begins. |
| Physics sandbox vs racing player expectations | MEDIUM | Based on genre analysis (BeamNG, MX Offroad, browser WebGL demos). No direct user research. |

---

## Sources

- Prototype code (`/references/backup12alt.html`) — direct observation of working feature set
- PROJECT.md — explicit requirements and constraints
- Training knowledge: Drift Hunters, CarX browser editions, BeamNG.drive (desktop reference), browser WebGL car demos (itch.io), sim-racing HUD conventions (iRacing, Assetto Corsa reference)
- Pacejka Magic Formula: Bakker, Pacejka, Lidner (1987) — original paper establishes B, C, D, E parameter roles
- Three.js documentation (camera, LOD, geometry) — stable API, high confidence
