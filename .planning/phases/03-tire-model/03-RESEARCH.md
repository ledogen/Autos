# Phase 3: Tire Model - Research

**Researched:** 2026-05-29
**Domain:** Pacejka Magic Formula, wheel angular velocity ODE, friction circle coupling, Canvas 2D HUD
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Full Pacejka for BOTH lateral AND longitudinal (not lateral-only).
- **D-02:** `vehicleState` gains `wheelOmega[4]` (rad/s). Integrated each physics step: `omega += (driveTorque - roadReactionTorque - brakeTorque) / wheelInertia * dt`. `vehicleState.wheelAngles[4]` (visual accumulation) continues unchanged.
- **D-03:** `getDriveTorque` signature unchanged.
- **D-04:** Slip ratio: `κ = (ω·r − v_x) / max(|ω·r|, |v_x|, ε)`. GLOSSARY.md gets entry.
- **D-05:** Friction circle: `F_total = sqrt(Flat² + Flong²)`; if `> μ·Fz`, scale both. Applied in `physics.js` after both tire functions return.
- **D-06:** Single B/C/D/E set for all 4 wheels.
- **D-07:** Lateral params `pacejkaB/C/D/E`, longitudinal `pacejkaBx/Cx/Dx/Ex` in `data/ranger.js`.
- **D-08:** Remove `corneringStiffness` and `lateralDampingCoeff` sliders; replace with Pacejka slider folders.
- **D-09:** Space = handbrake. Max brake torque to rear wheels only. No hard omega lock.
- **D-10:** `vehicleState.handbrake` boolean; `getBrakeTorque` helper respects it; `maxHandbrakeTorque` in `data/ranger.js`.
- **D-11:** Pacejka plot = standalone `<canvas>` element appended to `document.body`, shown/hidden with backtick.
- **D-12:** Plot: Flat vs slip angle ±0.3 rad, normalized Y, colored dots per front wheel (green/orange/red).
- **D-13:** `updatePacejkaCurve(vehicleState, params)` exported from `debug.js`, called from game loop.
- **D-14:** Front slip angle HUD: degrees, color-coded green (<5°) / orange (5–10°) / red (>10°), from `vehicleState.wheelDebug[0].sa`.
- **D-15:** Log fields: add `{fl/fr/rl/rr}_omega` to logger FIELDS. GLOSSARY.md gains κ, wheelOmega, Pacejka terms, handbrake.
- **D-16:** Debug sliders audit: remove `corneringStiffness`, `lateralDampingCoeff`. Add Pacejka sliders, `maxHandbrakeTorque`.

### Claude's Discretion
- Exact Pacejka starting values (tune for feel within published street-tire ranges)
- Wheel inertia value for omega integrator (estimate from wheel mass and radius)
- Canvas plot pixel dimensions and visual style
- Exact HUD layout for slip angle indicator (placement relative to existing speed readout)
- Epsilon value in slip ratio denominator

### Deferred Ideas (OUT OF SCOPE)
- Separate front/rear Pacejka coefficients (Phase 4+ when dynamic Fz is meaningful)
- Longitudinal Pacejka curve plot (rear slip ratio operating point)
- Engine rev simulation / gear ratios
- Tire temperature model
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| M3-01 | Real wheel angular velocity integrated per wheel (FL, FR, RL, RR) — omega_wheel [rad/s] | Omega integrator formula; wheel inertia estimate; stiff-ODE guard patterns |
| M3-02 | Longitudinal slip ratio computed from wheel angular velocity vs contact patch speed | Slip ratio formula with ε guard; rest-state NaN prevention |
| M3-03 | Pacejka Magic Formula lateral force: slip angle → Fy (C hard-clamped to [1.0, 1.99]) | Full formula; lateral coefficients; C-clamp rationale |
| M3-04 | Pacejka longitudinal force: slip ratio → Fx | Full formula; longitudinal coefficients; slip ratio saturation |
| M3-05 | Friction circle coupling (vector-normalized) | Pythagoras scaling pattern; placement in physics.js loop |
| M3-06 | Handbrake (Space) — rear axle high brake torque for drift initiation | `maxHandbrakeTorque` param; key binding pattern; how slip grows naturally |
| M3-07 | HUD shows front slip angle (color-coded: green <5°, orange 5–15°, red >15°) | DOM color update pattern; `wheelDebug[0].sa` source; rad-to-deg |
| M3-08 | HUD shows throttle/brake bar | DOM injection pattern; vehicleState.throttle/brake source |
| M3-09 | Live Pacejka curve plot in debug menu with operating point dot per front wheel | Canvas 2D API pattern; normalized axes; update strategy |
| M3-10 | Drifting and wheelspin feel natural — tunable via debug menu | Starting coefficient values; debug slider ranges; what to tune |
</phase_requirements>

---

## Summary

Phase 3 replaces the Phase 1 linear tire placeholders in `src/tire.js` with the Pacejka Magic Formula for both lateral (slip angle input) and longitudinal (slip ratio input) forces. It adds per-wheel angular velocity (`wheelOmega[4]`) to `vehicleState` and integrates it via a simple Euler step each physics tick. A friction circle in `physics.js` couples the two output forces with Pythagorean scaling. A Space-key handbrake applies maximum brake torque to rear wheels, allowing slip ratio to grow naturally until Pacejka saturates — this is what produces a controllable drift.

Two new visual elements ship: a standalone `<canvas>` overlay showing the Pacejka lateral force curve with live operating-point dots, and a front slip-angle HUD indicator with color-coded thresholds. Both are driven from `debug.js` and toggled with the existing backtick key.

The critical numerical concern is the omega integrator at low speed: explicit Euler becomes stiff when braking to a stop, potentially oscillating around zero. The established guard is a velocity threshold — below a combined speed epsilon, omega is clamped to `v_x / wheelRadius` (free-rolling) to prevent runaway oscillation without requiring an implicit solver.

**Primary recommendation:** Implement exactly as specified in CONTEXT.md. The formula, coupling, and sign conventions are all well-understood; the only discretion items are starting coefficient values and the omega epsilon guard value.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pacejka force computation | `src/tire.js` (pure math) | — | Locked signature; pure function; no imports |
| Omega integration | `src/physics.js` (per-wheel loop) | — | Needs drive torque, contact state, and Fz — all in physics.js Step 3 |
| Friction circle coupling | `src/physics.js` (post tire calls) | — | Requires both Flat and Flong; applied before force accumulation |
| Slip ratio computation | `src/physics.js` (caller) | — | Needs wheelOmega[i], contact patch velocity, wheelRadius |
| Handbrake key binding | `src/vehicle.js` (input handler) | — | All keyboard state lives here |
| Handbrake torque application | `src/physics.js` getDriveTorque/getBrakeTorque | — | Torque routing already there |
| Pacejka params storage | `data/ranger.js` | — | All vehicle constants live here |
| Pacejka curve canvas | `src/debug.js` | — | Debug panel owns all overlay visuals |
| Slip angle HUD | `src/main.js` game loop (DOM update) | `src/debug.js` (could be) | Pattern follows existing speed readout in main.js |
| Logger field additions | `src/logger.js` FIELDS array | — | Columnar log contract lives in logger.js |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Three.js | r184 | Math primitives (Vector3 for force accumulation) | Already imported; `THREE.Vector3` used for all force/torque work |
| Vanilla JS | ES2020 | Pacejka formula, omega ODE, canvas drawing | Project constraint — no external libs; everything hand-rolled |

### No New Dependencies
Phase 3 adds zero new imports. All new code is pure JS math in existing modules.

**No installation step required.**

---

## Architecture Patterns

### System Architecture Diagram

```
vehicleState.wheelOmega[i]  ← integrate each step
        |
        v
  [physics.js Step 3 per-wheel contact loop]
        |
        +-- params._longitudinalVelocity (contact patch speed)
        |
        v
  slipRatio = (omega*r - v_x) / max(|omega*r|, |v_x|, ε)   [M3-02]
  slipAngle = atan2(latVel, |longVel| + 0.01)               [existing]
        |
        v
  computeLateralForce(slipAngle, Fn, params)   → Flat       [src/tire.js M3-03]
  computeLongitudinalForce(slipRatio, Fn, params) → Flong   [src/tire.js M3-04]
        |
        v
  Friction circle: if sqrt(Flat²+Flong²) > μ·Fz             [M3-05]
    → scale both down proportionally
        |
        v
  totalForce.add(wheelFwd*Flong + wheelRight*Flat)           [existing accumulation]
        |
        v
  omega += (driveTorque - Flong*r - brakeTorque) / I * dt   [M3-01]
        |
        v
  vehicleState.wheelDebug[i].omega = wheelOmega[i]           [M3-01 logger]

[src/vehicle.js]
  Space key → vehicleState.handbrake = true/false

[game loop, render section - outside fixed accumulator]
  updatePacejkaCurve(vehicleState, params)   [debug.js M3-09]
  updateSlipAngleHUD(vehicleState)            [main.js M3-07]
  updateThrottleBrakeHUD(vehicleState)        [main.js M3-08]
```

### Recommended Project Structure
No new files. All changes are within existing modules:
```
src/
├── tire.js       ← replace computeLateralForce/computeLongitudinalForce bodies (M3-03, M3-04)
├── physics.js    ← add omega integrator, slip ratio, friction circle, handbrake torque (M3-01, M3-02, M3-05)
├── vehicle.js    ← add Space key + vehicleState.handbrake (M3-06)
├── debug.js      ← add Pacejka sliders, updatePacejkaCurve canvas (M3-09, D-08, D-16)
├── main.js       ← add wheelOmega[4] to vehicleState init, HUD elements, call updatePacejkaCurve (M3-07, M3-08)
└── logger.js     ← add {fl/fr/rl/rr}_omega to FIELDS (D-15)
data/
└── ranger.js     ← add Pacejka params + maxHandbrakeTorque (D-07, D-10)
docs/
└── GLOSSARY.md   ← add κ, wheelOmega, Pacejka B/C/D/E, handbrake (D-15)
index.html        ← add slip angle HUD span, throttle/brake HUD element
```

---

## Pattern 1: Pacejka Magic Formula (Both Axes)

**What:** The single formula used for both lateral and longitudinal tire forces. Input is slip angle (lateral) or slip ratio (longitudinal). Output is normalized force × Fz.

**Formula:**
```
F = D * sin(C * atan(B*x - E*(B*x - atan(B*x))))
```

Where `x` = slip angle (rad) for lateral, slip ratio (dimensionless) for longitudinal.

**M3-03 constraint:** C hard-clamped to `[1.0, 1.99]` before computation to prevent shape inversion at C≥2.

**Example — tire.js bodies (Phase 3 replacement):**
```javascript
// Source: Pacejka 1994 simplified formula — verified against x-engineer.org and edy.es/dev/docs
// [VERIFIED: x-engineer.org/tire-model-longitudinal-forces/]

export function computeLateralForce(slipAngle, Fz, params) {
  const B = params.pacejkaB
  const C = Math.max(1.0, Math.min(1.99, params.pacejkaC))  // M3-03: hard clamp
  const D = params.pacejkaD
  const E = params.pacejkaE
  const x = slipAngle
  return Fz * D * Math.sin(C * Math.atan(B * x - E * (B * x - Math.atan(B * x))))
}

export function computeLongitudinalForce(slipRatio, Fz, params) {
  const B = params.pacejkaBx
  const C = Math.max(1.0, Math.min(1.99, params.pacejkaCx))
  const D = params.pacejkaDx
  const E = params.pacejkaEx
  const x = slipRatio
  return Fz * D * Math.sin(C * Math.atan(B * x - E * (B * x - Math.atan(B * x))))
}
```

**Sign convention:** Lateral slip angle positive = contact patch velocity pointing wheel's left → `computeLateralForce` returns positive (rightward force). This is consistent with the existing GLOSSARY.md §Slip Angle and the existing `slipAngle = atan2(latVel, |longVel| + 0.01)` at physics.js:150. **The Phase 1 sign negation (`-params.corneringStiffness * slipAngle`) is REMOVED** — Pacejka naturally handles the sign from the input's sign. [VERIFIED: existing physics.js:151, existing tire.js:43]

**Fz scaling:** In Phase 3, Fz is still the flat-spring normal force from Phase 1 suspension. Phase 4 adds dynamic load transfer. The `Fz * D * ...` scaling means the peak force tracks normal load correctly even now. [ASSUMED — consequence of Phase 3 keeping flat-tire Fz]

---

## Pattern 2: Wheel Angular Velocity (Omega) Integrator

**What:** Per-wheel ODE integrated each physics step. `wheelOmega[i]` is the actual wheel spin rate in rad/s, separate from the visual `wheelAngles[i]`.

**Formula:**
```
roadReactionTorque = Flong * wheelRadius   // reaction torque from tire contact
omega_new = omega + (driveTorque - roadReactionTorque - brakeTorque) / wheelInertia * dt
```

**Where to place:** Inside the per-contact loop in physics.js Step 3, AFTER `computeLongitudinalForce` returns (so `Flong` is available), AFTER friction circle scaling.

**Wheel inertia estimate:**
```
I_wheel = 0.5 * mass_wheel * wheelRadius²
mass_wheel ≈ 18 kg (truck wheel + tire assembly, 245/75R16)
wheelRadius = 0.368 m
I_wheel = 0.5 * 18 * 0.368² ≈ 1.22 kg·m²
```
[ASSUMED — based on typical truck wheel+tire mass from published tire data; no verified source for the specific 245/75R16 assembly]

**Low-speed stiffness guard (critical):**

At `v_contact ≈ 0` and `omega ≈ 0`, the ODE becomes stiff — brake torque pushes omega negative, Pacejka pushes it back. Without a guard, explicit Euler oscillates. The established guard (verified in GameDev.net literature):

```javascript
const vehicleSpeed = Math.abs(params._longitudinalVelocity)
const wheelSurfaceSpeed = Math.abs(vehicleState.wheelOmega[i] * params.wheelRadius)
const combinedSpeed = vehicleSpeed + wheelSurfaceSpeed

if (combinedSpeed < OMEGA_EPSILON) {
  // At rest: force free-rolling to prevent integrator oscillation
  vehicleState.wheelOmega[i] = params._longitudinalVelocity / params.wheelRadius
} else {
  vehicleState.wheelOmega[i] += (driveTorque - roadReactionTorque - brakeTorque) / wheelInertia * dt
}
```

**Recommended OMEGA_EPSILON:** 0.5 m/s. This means "below 1.8 km/h combined speed, clamp to free-rolling". [ASSUMED — 0.5 is conservative; 0.1 is too tight for dt=1/60]

**Also required:** Add `vehicleState.wheelOmega = [0, 0, 0, 0]` to the vehicleState init in `main.js` and to the reset block.

---

## Pattern 3: Slip Ratio Computation

**Formula (D-04):**
```javascript
// [VERIFIED: CONTEXT.md D-04]
const omegaR = vehicleState.wheelOmega[i] * params.wheelRadius
const vx = params._longitudinalVelocity
const SLIP_EPSILON = 0.1  // m/s — prevents 0/0 at rest
const slipRatio = (omegaR - vx) / Math.max(Math.abs(omegaR), Math.abs(vx), SLIP_EPSILON)
```

**Properties:**
- Free-rolling: `omegaR ≈ vx` → κ ≈ 0
- Full wheelspin: `omegaR >> vx` → κ → 1
- Locked wheel braking: `omegaR = 0`, `vx > 0` → κ → -1 (denominator = |vx|)
- At rest both zero: clamped to 0 by epsilon denominator

**Epsilon recommendation:** 0.1 m/s (0.36 km/h). Comparable to the existing `+ 0.01` guard in slip angle computation. [ASSUMED — 0.01 is too small for float precision at rest; 0.1 matches CONTEXT.md suggestion]

**NaN guard:** The `Math.max(..., SLIP_EPSILON)` in the denominator guarantees the denominator is always ≥ 0.1. `atan` is defined everywhere. `sin` is defined everywhere. No additional NaN guards needed if SLIP_EPSILON > 0.

---

## Pattern 4: Friction Circle Coupling

**What:** After both `computeLateralForce` and `computeLongitudinalForce` return, check if their vector sum exceeds the friction budget and scale both down proportionally.

**Placement:** In physics.js Step 3 contact loop, immediately after both tire function calls and before `wheelForce` is constructed. [VERIFIED: CONTEXT.md D-05, specifics section]

```javascript
// Source: [CITED: wassimulator.com/blog/programming/programming_vehicles_in_games.html]
// Friction circle: vector normalize if over budget
const frictionBudget = (params.frictionCoeff || 0.9) * Fn
const combinedForce = Math.sqrt(Flat * Flat + Flong * Flong)
if (combinedForce > frictionBudget && combinedForce > 0) {
  const scale = frictionBudget / combinedForce
  Flat  *= scale
  Flong *= scale
}
```

**Note on Phase 1 friction cap:** Both tire functions currently clamp internally at `μ * Fz`. In Phase 3, remove the internal cap from both tire functions (Pacejka saturates naturally) and rely entirely on this per-contact friction circle. This avoids double-clamping. [ASSUMED — logical consequence of replacing the Phase 1 bodies]

---

## Pattern 5: Handbrake — Space Key

**vehicle.js additions:**
```javascript
// Key state addition:
const keys = { w: false, s: false, a: false, d: false, r: false, ' ': false }
// (Space key maps to ' ' in e.key)

// In updateVehicle:
vehicleState.handbrake = keys[' '] || false
```

**physics.js — getBrakeTorque helper (or inline in getDriveTorque):**
```javascript
// [VERIFIED: CONTEXT.md D-09, D-10]
function getBrakeTorque(wheelIndex, vehicleState, params) {
  const isRear = wheelIndex === 2 || wheelIndex === 3
  if (vehicleState.handbrake && isRear) {
    return params.maxHandbrakeTorque  // always positive (opposing wheel spin)
  }
  if (vehicleState.brake > 0) {
    return vehicleState.brake * params.maxBrakeTorque
  }
  return 0
}
```

**`maxHandbrakeTorque` starting value:** 2000 N·m. This is lower than `maxBrakeTorque` (3000 N·m) — the handbrake should produce meaningful slip but allow modulation. [ASSUMED — tuning recommendation; should be exposed as slider per D-16]

**Drift mechanism:** With handbrake applied, rear `brakeTorque` > `driveTorque`, so `omega` decelerates. Road reaction torque (`Flong * r`) also acts to decelerate omega (rolling friction direction). Omega drops, slip ratio goes negative (braking region), Pacejka computes a negative longitudinal force (braking) AND reduces available lateral budget via friction circle. The reduction in lateral budget means less cornering force — rear steps out. This is correct Pacejka drift behavior. [ASSUMED — mechanistic reasoning from Pacejka model; no separate source verification]

**Space key conflict check:** `keys` object in vehicle.js currently uses lowercase `.toLowerCase()` but `e.key` for Space is `' '` (a space character), NOT `'space'`. Need to handle registration correctly:
```javascript
document.addEventListener('keydown', e => {
  const k = e.key === ' ' ? ' ' : e.key.toLowerCase()
  if (k in keys) keys[k] = true
})
```
[VERIFIED: existing vehicle.js:15 — current pattern only lowercases; `' '.toLowerCase()` = `' '` so it works IF `' '` is in the keys object, which requires adding it]

---

## Pattern 6: Pacejka Curve Canvas Overlay

**What:** A standalone `<canvas>` appended to `document.body`, drawn each frame when debug panel is visible.

**Structure:**
```javascript
// In initDebug():
const plotCanvas = document.createElement('canvas')
plotCanvas.width = 300
plotCanvas.height = 200
plotCanvas.style.cssText = 'position:fixed;top:20px;right:320px;background:#111;border:1px solid #444;display:none'
document.body.appendChild(plotCanvas)
const plotCtx = plotCanvas.getContext('2d')

// Toggle visibility with gui panel:
document.addEventListener('keydown', e => {
  if (e.key === '`') {
    const hidden = gui.domElement.style.display === 'none'
    gui.domElement.style.display = hidden ? '' : 'none'
    plotCanvas.style.display = hidden ? '' : 'none'  // sync canvas with gui
  }
})
```

**updatePacejkaCurve() pattern:**
```javascript
export function updatePacejkaCurve(vehicleState, params) {
  if (plotCanvas.style.display === 'none') return  // skip when hidden
  const ctx = plotCtx
  const W = plotCanvas.width, H = plotCanvas.height
  ctx.clearRect(0, 0, W, H)

  // Draw curve: sample Flat over ±0.3 rad (D-12)
  const RANGE = 0.3
  const steps = 200
  ctx.strokeStyle = '#44ff88'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let s = 0; s <= steps; s++) {
    const sa = -RANGE + (2 * RANGE * s / steps)
    const B = params.pacejkaB, C = Math.max(1, Math.min(1.99, params.pacejkaC))
    const D = params.pacejkaD, E = params.pacejkaE
    // Normalized: divide by D so Y-axis = fraction of peak (D-12)
    const fNorm = Math.sin(C * Math.atan(B * sa - E * (B * sa - Math.atan(B * sa))))
    const px = (sa + RANGE) / (2 * RANGE) * W
    const py = H/2 - fNorm * (H/2 - 10)
    s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
  }
  ctx.stroke()

  // Operating point dots for FL (index 0) and FR (index 1)
  const dotColors = ['#00ff88', '#ff8800', '#ff2222']
  for (const i of [0, 1]) {
    const sa = vehicleState.wheelDebug[i]?.sa || 0
    const fNorm = computePacejkaNorm(sa, params)  // same formula inline
    const px = (sa + RANGE) / (2 * RANGE) * W
    const py = H/2 - fNorm * (H/2 - 10)
    const pct = Math.abs(fNorm) / 1.0  // normalized to peak = D coefficient units
    const color = pct < 0.5 ? dotColors[0] : pct < 0.8 ? dotColors[1] : dotColors[2]
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(px, py, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}
```

**Performance:** The curve is re-sampled 200 points every frame when visible. At 60fps this is 12,000 `atan` calls/second — well within browser capability. Only runs when visible (early-return guard). [ASSUMED — no benchmark; performance should be trivial vs physics cost]

---

## Pattern 7: HUD Additions

### Front Slip Angle Indicator (M3-07, D-14)

**Source:** `vehicleState.wheelDebug[0].sa` (FL wheel, written each physics step in physics.js)

```javascript
// In index.html — add to #hud div:
// SLIP: <span id="slipVal">0.0°</span>

// In main.js game loop, outside fixed accumulator (render section):
const slipDeg = (vehicleState.wheelDebug[0]?.sa || 0) * (180 / Math.PI)
const slipEl = document.getElementById('slipVal')
slipEl.textContent = slipDeg.toFixed(1) + '°'
// D-14 thresholds: green <5°, orange 5-10°, red >10°
slipEl.style.color = Math.abs(slipDeg) < 5 ? '#00ff88'
                   : Math.abs(slipDeg) < 10 ? '#ffaa00'
                   : '#ff2222'
```

**Note on M3-07 vs D-14 threshold discrepancy:** M3-07 (REQUIREMENTS.md) states "red >15°"; D-14 (CONTEXT.md) states "red >10°". CONTEXT.md decisions take precedence as the locked implementation choice. Use D-14 thresholds: green <5°, orange 5–10°, red >10°. [VERIFIED: CONTEXT.md D-14]

### Throttle/Brake Bar (M3-08)

```javascript
// In index.html — add below slip indicator:
// THR: <span id="thrVal">0</span>% BRK: <span id="brkVal">0</span>%

// In main.js game loop:
document.getElementById('thrVal').textContent = (vehicleState.throttle * 100).toFixed(0)
document.getElementById('brkVal').textContent = (vehicleState.brake * 100).toFixed(0)
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tire force saturation | Custom clamp function | Pacejka's own natural saturation | Pacejka peaks and falls off naturally; no clamp needed post-formula |
| Implicit ODE solver | Runge-Kutta 4 / backward Euler | Explicit Euler + speed threshold | RK4 adds 4× cost per step; the speed guard is equivalent at this fidelity |
| Wheel inertia physics | Detailed spoke/rim model | `I = 0.5 * m * r²` solid disk estimate | Full fidelity adds no gameplay value; a tunable `wheelInertia` param is better |
| Canvas graphing library | Chart.js etc. | Native Canvas 2D API | No bundler; zero-dependency constraint; 200-sample curve is trivial with `beginPath/lineTo` |

**Key insight:** Pacejka's value over linear models is the natural peak-then-falloff shape. The formula IS the saturation — no additional clamping needed at the tire level. Friction circle is the only cap needed.

---

## Pacejka Starting Coefficients

These are Claude's discretion (CONTEXT.md). Research-verified starting points:

### Lateral (street truck tire — dry tarmac)
[CITED: edy.es/dev/docs/pacejka-94-parameters-explained-a-comprehensive-guide/]

| Param | Recommended Start | Slider Range | Physical Meaning |
|-------|-------------------|--------------|-----------------|
| `pacejkaB` | 10.0 | 5 – 20 | Stiffness factor: initial slope of force curve. Higher = sharper onset of grip. |
| `pacejkaC` | 1.9 | 1.0 – 1.99 | Shape factor: C=1.9 gives lateral-style bell curve. Hard-clamped by M3-03. |
| `pacejkaD` | 1.0 | 0.5 – 2.0 | Peak factor: D*Fz = peak lateral force. 1.0 = friction coefficient of 1.0. |
| `pacejkaE` | 0.97 | -1.0 – 1.0 | Curvature: near 1.0 produces realistic post-peak falloff. Negative = sharper peak. |

### Longitudinal (same tire, dry tarmac)
[CITED: x-engineer.org/tire-model-longitudinal-forces/ and edy.es referenced table]

| Param | Recommended Start | Slider Range | Physical Meaning |
|-------|-------------------|--------------|-----------------|
| `pacejkaBx` | 10.0 | 5 – 20 | Longitudinal stiffness: higher onset for longitudinal vs lateral is common |
| `pacejkaCx` | 1.9 | 1.0 – 1.99 | Shape factor for longitudinal |
| `pacejkaDx` | 1.0 | 0.5 – 2.0 | Peak longitudinal friction factor |
| `pacejkaEx` | 0.97 | -1.0 – 1.0 | Longitudinal curvature |

**Why symmetric start values?** Starting symmetric keeps the friction circle circular. Tuning can differentiate lateral vs longitudinal feel once the basic drift is working. [ASSUMED — tuning convention, not a published rule]

**C coefficient range note:** C must stay in `[1.0, 1.99]`. At C=2.0 the formula has a mathematical discontinuity; at C<1.0 the output changes sign direction. The clamp in M3-03 enforces this automatically. [CITED: edy.es — formula analysis]

---

## Common Pitfalls

### Pitfall 1: Sign Direction of Lateral Pacejka Output
**What goes wrong:** Phase 1 `computeLateralForce` negates: `return -corneringStiffness * slipAngle`. If Phase 3 keeps that negation in addition to Pacejka's own sign handling, all lateral forces are reversed — car steers backward.
**Why it happens:** Phase 1 needed explicit negation because the linear formula has no sign memory. Pacejka's formula inherits the sign from the input `x`: positive slip angle → positive Flat → rightward force.
**How to avoid:** Remove the negation. The new body is `return Fz * D * sin(C * atan(...))` with `x = slipAngle`. Positive input → positive output → wheelRight direction in physics.js.
**Warning signs:** Car turns in the wrong direction; increasing cornering stiffness makes understeer worse instead of better.
[VERIFIED: existing tire.js:43 — current negation is explicit; physics.js:154 applies `wheelRight * Flat`]

### Pitfall 2: Omega Integrator Placed Before Tire Force Computation
**What goes wrong:** If omega is updated before `computeLongitudinalForce` runs, the road reaction torque used in the omega update doesn't match the Flong that will be applied this step. Causes energy accumulation at high slip.
**Why it happens:** Ordering confusion within the per-contact loop.
**How to avoid:** Omega integrator runs AFTER both tire functions return AND after friction circle scaling. The road reaction torque uses the final, scaled `Flong`.
**Warning signs:** Wheel omega diverges to infinity under throttle; friction circle doesn't prevent wheelspin.

### Pitfall 3: Slip Ratio Denominator is Zero at Rest
**What goes wrong:** At `v_x = 0` and `omega = 0`, `slipRatio = 0/0 = NaN`. NaN propagates through Pacejka, through friction circle, into totalForce. Vehicle position becomes NaN.
**Why it happens:** Both velocity components are truly zero at spawn.
**How to avoid:** `Math.max(Math.abs(omegaR), Math.abs(vx), SLIP_EPSILON)` with `SLIP_EPSILON = 0.1`. This caps the denominator at 0.1, giving `slipRatio = 0 / 0.1 = 0` at rest. Correct behavior.
**Warning signs:** Car disappears or position snaps to NaN immediately at spawn.

### Pitfall 4: Double Friction Cap
**What goes wrong:** Phase 1 tire functions clamp output at `μ * Fz` internally. If these internal clamps remain in Phase 3, then the friction circle in physics.js scales forces that are already capped — the friction circle never fires.
**Why it happens:** Phase 1 bodies had explicit `Math.max(-maxFlat, Math.min(maxFlat, raw))`.
**How to avoid:** Phase 3 tire function bodies have NO internal cap. The only cap is the friction circle in physics.js. Pacejka saturates naturally; the friction circle handles the combined budget.
**Warning signs:** Car can brake without losing cornering ability; no drift on full throttle + turn.

### Pitfall 5: C Coefficient at 2.0 Causes NaN
**What goes wrong:** At C=2.0, the `sin(π)` = 0 for all inputs — the formula collapses to zero. Slider-driven values can reach exactly 2.0.
**Why it happens:** M3-03 hard-clamp `[1.0, 1.99]` prevents this but only if the clamp is applied inside the computation, not just in the slider range.
**How to avoid:** Apply clamp inside both tire functions: `C = Math.max(1.0, Math.min(1.99, params.pacejkaC))`. Slider range can be set to `[1.0, 1.99]` as well; both safeguards are complementary.
**Warning signs:** All tire forces suddenly go to zero when C slider reaches 2.0.

### Pitfall 6: wheelOmega Not Reset on R Key
**What goes wrong:** R-key reset in main.js resets `wheelAngles` but not `wheelOmega`. Car spawns with spinning wheels, immediately develops full wheelspin.
**Why it happens:** `wheelOmega` is a new field and the reset block must be updated explicitly.
**How to avoid:** Add `vehicleState.wheelOmega = [0, 0, 0, 0]` to the reset block in main.js (line ~388). Also add to the initial vehicleState declaration (~line 43).
**Warning signs:** Car immediately performs a burnout after reset; can be hard to debug because wheelAngles resets correctly.

### Pitfall 7: Space Key Not Registered Correctly
**What goes wrong:** `e.key.toLowerCase()` on the Space key returns `' '` (space character). If the keys object uses `'space'` as the key name it will never fire.
**Why it happens:** `e.key` for Space is the single space character `' '`, unlike special keys like `'ArrowUp'`.
**How to avoid:** Add `' ': false` to the keys object and use `const k = e.key === ' ' ? ' ' : e.key.toLowerCase()` in the listener. [VERIFIED: existing vehicle.js:12,15 — current keys object and listener]

### Pitfall 8: Canvas Plot Position Obscures lil-gui
**What goes wrong:** `position: fixed; right: 0` overlaps the lil-gui panel which also anchors top-right.
**How to avoid:** Position the canvas to the left of the lil-gui panel. lil-gui is approximately 245px wide at default settings. `right: 320px` provides 75px clearance. [ASSUMED — lil-gui default width from inspection]

---

## Code Examples

### Omega Integration (physics.js)
```javascript
// [ASSUMED — derived from formula in CONTEXT.md D-02]
// Place inside per-contact loop AFTER computeLongitudinalForce and friction circle scaling

const wheelInertia = params.wheelInertia || 1.22  // kg·m² — fallback if not in params
const roadReactionTorque = Flong * params.wheelRadius
const brakeTorque = getBrakeTorque(i, vehicleState, params)
const driveTorque = getDriveTorque(i, vehicleState, params)

const vehicleSpd = Math.abs(params._longitudinalVelocity)
const wheelSurfaceSpd = Math.abs(vehicleState.wheelOmega[i] * params.wheelRadius)
if (vehicleSpd + wheelSurfaceSpd < 0.5) {
  // Low-speed guard: clamp to free-rolling to prevent Euler oscillation
  vehicleState.wheelOmega[i] = params._longitudinalVelocity / params.wheelRadius
} else {
  vehicleState.wheelOmega[i] +=
    (driveTorque - roadReactionTorque - brakeTorque) / wheelInertia * dt
}
// Write to wheelDebug for logger
vehicleState.wheelDebug[i].omega = vehicleState.wheelOmega[i]
```

### Logger FIELDS Extension (logger.js)
```javascript
// [VERIFIED: existing logger.js:27-38 — current FIELDS array]
// Add 4 new fields at end to preserve existing field order (D-07 — field order is contract)
const FIELDS = [
  // ... existing 33 fields unchanged ...
  'fl_omega', 'fr_omega', 'rl_omega', 'rr_omega',  // D-15
]
// captureFrame must also push the 4 omega values at matching positions
```

### Pacejka Params in ranger.js
```javascript
// [CITED: edy.es/dev/docs/pacejka-94-parameters-explained-a-comprehensive-guide/]
// Lateral tire (all 4 wheels — D-06)
pacejkaB:  10.0,   // stiffness factor
pacejkaC:  1.9,    // shape factor (hard-clamped [1.0,1.99] in tire.js — M3-03)
pacejkaD:  1.0,    // peak factor (peak force = D × Fz)
pacejkaE:  0.97,   // curvature factor

// Longitudinal tire (all 4 wheels — D-06)
pacejkaBx: 10.0,
pacejkaCx: 1.9,
pacejkaDx: 1.0,
pacejkaEx: 0.97,

// Wheel dynamics
wheelInertia:        1.22,   // kg·m² — 0.5 × 18kg × 0.368² (D-02)
maxHandbrakeTorque:  2000,   // N·m — rear-only handbrake (D-10)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Linear cornering stiffness (`Fy = k × α`) | Pacejka Magic Formula | Phase 3 | Natural saturation; drift possible |
| Drive force directly to Flong (`params._driveForce`) | Slip ratio → Flong via Pacejka | Phase 3 | Wheelspin, burnout behavior |
| All wheels free-rolling (`slipRatio = 0`) | Per-wheel omega integration | Phase 3 | Independent front/rear slip |
| No handbrake | Space = max rear brake torque | Phase 3 | Controllable drift initiation |

**Deprecated/outdated:**
- `corneringStiffness` param: replaced by `pacejkaB/C/D/E` — keep in `ranger.js` until after Phase 3 slider audit removes it
- `lateralDampingCoeff` param: already labeled `(unused)` — remove slider in Phase 3; keep param for safety until Phase 4
- `params._driveForce`: still computed in physics.js for now but no longer used by `computeLongitudinalForce` in Phase 3; can be removed in a future cleanup

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pacejka output sign from positive input is positive (rightward), consistent with removing Phase 1 negation | Pattern 1 / Pitfall 1 | Car steers in wrong direction — easy to spot and fix |
| A2 | OMEGA_EPSILON = 0.5 m/s is correct threshold for stiffness guard | Pattern 2 | Too high: slow-speed omega always clamped (no creep feel); too low: oscillation persists |
| A3 | Wheel+tire mass ≈ 18 kg for 245/75R16 giving I ≈ 1.22 kg·m² | Pattern 2 / ranger.js params | Wrong inertia changes wheelspin onset time; tunable via slider |
| A4 | SLIP_EPSILON = 0.1 m/s | Pattern 3 | Too small → NaN risk; too large → slip ratio wrong at walking speed |
| A5 | maxHandbrakeTorque = 2000 N·m as starting value | Pattern 5 | Too low: no drift; too high: instant 180; exposed as slider so tunable |
| A6 | Symmetric lateral/longitudinal starting coefficients (same B/C/D/E) | Pacejka Starting Coefficients | Reasonable start; real tires differ but delta is small for initial feel |
| A7 | Canvas at `right: 320px` doesn't overlap lil-gui | Pattern 6 / Pitfall 8 | Layout overlap — visual only, easy to fix |
| A8 | Friction circle should remove internal cap from both tire functions | Pattern 4 | If kept internal caps: friction circle never fires → no realistic combined slip behavior |
| A9 | REQUIREMENTS.md M3-07 threshold (red >15°) vs CONTEXT.md D-14 (red >10°) — use D-14 | Pattern 7 | Minor visual difference; thresholds are tunable |

---

## Open Questions

1. **wheelInertia as slider vs hardcoded?**
   - What we know: D-16 says add `maxHandbrakeTorque` slider; doesn't explicitly mention `wheelInertia`
   - What's unclear: Should `wheelInertia` be tunable? It affects wheelspin onset meaningfully.
   - Recommendation: Add it to ranger.js as a param with a slider. Low risk; high tuning value.

2. **M3-06 requirement says "reduces rear wheel Pacejka D" — CONTEXT.md D-09 says "max brake torque"**
   - What we know: REQUIREMENTS.md M3-06: "Handbrake (Space) reduces rear wheel Pacejka D for drift initiation." CONTEXT.md D-09: "max brake torque to rear wheels only, does NOT hard-lock omega."
   - What's unclear: Are these describing the same outcome? "Reduces Pacejka D" could mean the effective grip is reduced (which happens naturally via friction circle when brake torque reduces omega and builds slip). Or it could mean directly modifying the D parameter.
   - Recommendation: Implement CONTEXT.md D-09 (brake torque approach). The Pacejka model naturally reduces effective lateral output via friction circle coupling when longitudinal slip builds — this IS "effectively reducing D" without directly mutating the param. The REQUIREMENTS.md description is outcome-focused, not implementation-prescriptive. Planner should note this interpretation.

3. **Should `wheelOmega` be updated when wheel is airborne (Fn = 0)?**
   - What we know: The omega integrator is inside the per-contact loop (Fn > 0 guard). If wheel is airborne, loop body doesn't execute.
   - What's unclear: An airborne wheel in neutral should spin down via bearing friction; in throttle it would spin up unconstrained.
   - Recommendation: For Phase 3, let omega remain constant when airborne (no contact = no road reaction; drive torque = uncapped spinup). Add a small bearing drag term outside the contact loop: `omega *= (1 - bearingFriction * dt)`. This is a polish item — not required for M3-01 but prevents infinite spinup during airborne moments.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 3 is purely code changes within existing browser ES6 modules. No external tools, CLIs, databases, or services required beyond an HTTP server (already established in Phase 1/2).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None installed — browser-only project, no test runner |
| Config file | None — Wave 0 gap |
| Quick run command | Open `index.html` via HTTP server; observe visually |
| Full suite command | Same — no automated test suite exists |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| M3-01 | wheelOmega[i] changes when throttle applied from rest | manual-smoke | Console: `vehicleState.wheelOmega` while throttling | ❌ Wave 0 |
| M3-02 | slipRatio = 0 at free-rolling, ≈1 at full wheelspin | manual-smoke | Console: `vehicleState.wheelDebug[i]` | ❌ Wave 0 |
| M3-03 | Front wheels exhibit slip angle during cornering (HUD shows > 0°) | manual-smoke | Visual — HUD slip indicator | ❌ Wave 0 |
| M3-04 | Rear wheelspin under full throttle from standstill | manual-smoke | Visual — wheel RPM diverges in HUD | ❌ Wave 0 |
| M3-05 | Friction circle prevents total force exceeding μ·Fz | manual-smoke | Console: compare Flat²+Flong² vs (μ·Fn)² | ❌ Wave 0 |
| M3-06 | Space key initiates and sustains drift on rear axle | manual-smoke | Visual — oversteer develops, controllable | ❌ Wave 0 |
| M3-07 | Slip angle HUD changes color green→orange→red during cornering | manual-smoke | Visual | ❌ Wave 0 |
| M3-08 | THR/BRK readout responds to W/S keys | manual-smoke | Visual | ❌ Wave 0 |
| M3-09 | Pacejka curve plot visible, dot moves when cornering | manual-smoke | Visual — backtick open, corner car | ❌ Wave 0 |
| M3-10 | Changing B/C/D sliders produces different drift feel | manual-smoke | Open debug, change sliders, drive | ❌ Wave 0 |

**Note:** All Phase 3 tests are manual-smoke because this is a real-time physics simulation with no test harness. All success criteria from CONTEXT.md and ROADMAP.md are observational (success criteria 1-5). No automated unit tests are planned for Phase 3.

### Wave 0 Gaps
- None that block implementation — no new test infrastructure needed
- All validation is manual observation per the 5 success criteria in CONTEXT.md

---

## Security Domain

Phase 3 adds no new data ingestion, authentication, or network calls. All additions are pure JavaScript math, DOM updates, and Canvas drawing. Security posture is unchanged from Phase 2.

No ASVS categories are newly applicable in Phase 3.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 3 |
|-----------|------------------|
| No physics library | Pacejka formula is hand-rolled; omega ODE is hand-rolled |
| No bundler (webpack/Vite) | No npm installs; all code in ES6 modules |
| No Euler angles for body rotation | Phase 3 does not touch body orientation |
| Three.js r184 via importmap | Existing import in all modules — unchanged |
| No dat.GUI — use lil-gui | debug.js already uses lil-gui; Pacejka sliders follow same pattern |
| ES6 modules in `src/` | All new code in existing module files |
| `computeLateralForce` and `computeLongitudinalForce` signatures LOCKED | Only bodies change (confirmed in CONTEXT.md §code_context) |
| `getDriveTorque` signature unchanged | D-03 confirmed |
| Do NOT Object.freeze() RANGER_PARAMS | Already noted in ranger.js comment; Phase 3 adds new fields to live object |

---

## Sources

### Primary (HIGH confidence)
- [CONTEXT.md] `/Users/ledogen/CodeShit/CarGame/.planning/phases/03-tire-model/03-CONTEXT.md` — locked decisions D-01 through D-16
- [src/tire.js] — existing function signatures and Phase 1 bodies
- [src/physics.js] — force accumulation loop, getDriveTorque, contact loop structure
- [src/vehicle.js] — key input handler pattern
- [src/debug.js] — lil-gui pattern, backtick toggle
- [src/logger.js] — FIELDS array, captureFrame signature
- [data/ranger.js] — RANGER_PARAMS structure
- [docs/GLOSSARY.md] — sign conventions, coordinate system

### Secondary (MEDIUM confidence)
- [edy.es/dev/docs/pacejka-94-parameters-explained-a-comprehensive-guide/] — Pacejka coefficient table with dry/wet/snow/ice values; physical meanings of B/C/D/E
- [x-engineer.org/tire-model-longitudinal-forces/] — longitudinal Magic Formula, coefficient table, slip ratio definition
- [wassimulator.com/blog/programming/programming_vehicles_in_games.html] — friction circle coupling pattern; chase-target omega ODE variant

### Tertiary (LOW confidence)
- [gamedev.net forums — wheel dynamics discussions] — numerical stability warnings for explicit Euler omega; stiffness at low speed (corroborated by academic source below)
- [abcm.org.br/anais/diname/2007/PDF/DIN07-0149.pdf] — academic confirmation that explicit Euler becomes unstable near zero velocity; recommends implicit solver (we use speed guard instead)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing modules verified
- Architecture: HIGH — locked decisions in CONTEXT.md; existing code patterns confirmed
- Pacejka formula: HIGH — canonical formula verified across multiple sources
- Pacejka coefficient starting values: MEDIUM — published tables for dry tarmac; specific truck tire data not available
- Omega integrator: MEDIUM — formula is standard; epsilon values are ASSUMED
- Pitfalls: HIGH — most pitfalls verified from existing code (sign convention, reset block, key mapping)

**Research date:** 2026-05-29
**Valid until:** Stable — Pacejka formula is 30-year-old math; no expiry. Coefficient starting values may be adjusted during Phase 3 tuning.
