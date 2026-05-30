# Phase 3: Tire Model - Pattern Map

**Mapped:** 2026-05-29
**Files analyzed:** 8 (src/tire.js, src/physics.js, src/vehicle.js, src/debug.js, src/logger.js, src/main.js, data/ranger.js, docs/GLOSSARY.md)
**Analogs found:** 8 / 8 — all files are existing files being modified, not new files

---

## File Classification

| Modified File | Role | Data Flow | Closest Analog (within file) | Match Quality |
|---------------|------|-----------|-------------------------------|---------------|
| `src/tire.js` | utility (pure math) | transform | Existing function bodies (lines 34-48, 66-73) | exact — body replacement only |
| `src/physics.js` | integrator | event-driven / batch | Existing per-wheel contact loop (lines 92-166) | exact — extend in-place |
| `src/vehicle.js` | input handler | event-driven | Existing keys object + updateVehicle (lines 12-16, 48-52) | exact — add one key, one field |
| `src/debug.js` | debug UI | request-response | Existing lil-gui folder pattern (lines 25-58) | exact — add folders + canvas |
| `src/logger.js` | logger | batch | Existing FIELDS + captureFrame (lines 27-108) | exact — append fields |
| `src/main.js` | entry/loop | event-driven | Existing vehicleState init + reset block + render section (lines 43-54, 380-395, 411-418) | exact — add fields + HUD |
| `data/ranger.js` | config | — | Existing RANGER_PARAMS sections (lines 10-72) | exact — add params |
| `docs/GLOSSARY.md` | docs | — | Existing "Deferred to Phase 3" table (lines 218-234) | exact — move deferred items to definitions |

---

## Pattern Assignments

### `src/tire.js` — replace function bodies only

**Analog:** Own existing bodies (lines 34-48 and 66-73); signatures are locked (D-05, D-06 from Phase 1).

**Existing body to REMOVE — `computeLateralForce` (lines 39-47):**
```javascript
// Phase 1 body — everything below this comment is replaced:
const latVel  = params._lateralVelocity  || 0
const longVel = params._longitudinalVelocity || 0
if (Math.sqrt(latVel * latVel + longVel * longVel) < 0.2) return 0
const raw = -params.corneringStiffness * slipAngle
const maxFlat = (params.frictionCoeff || 0.9) * Fz
return Math.max(-maxFlat, Math.min(maxFlat, raw))
```

**Existing body to REMOVE — `computeLongitudinalForce` (lines 68-72):**
```javascript
// Phase 1 body — everything below this comment is replaced:
const rollingDrag = -params.rollingResistanceCoeff * (params._longitudinalVelocity || 0)
const raw = rollingDrag + (params._driveForce || 0)
const maxFlong = (params.frictionCoeff || 0.9) * Fz
return Math.max(-maxFlong, Math.min(maxFlong, raw))
```

**Replacement pattern — Pacejka Magic Formula:**
```javascript
// Phase 3 body — computeLateralForce
const B = params.pacejkaB
const C = Math.max(1.0, Math.min(1.99, params.pacejkaC))  // M3-03: hard clamp — C=2 collapses formula
const D = params.pacejkaD
const E = params.pacejkaE
const x = slipAngle
return Fz * D * Math.sin(C * Math.atan(B * x - E * (B * x - Math.atan(B * x))))
// NOTE: NO negation. Pacejka sign follows x sign — positive slipAngle → positive Flat.
// Removing the Phase 1 '-' is intentional. (Pitfall 1 in RESEARCH.md)

// Phase 3 body — computeLongitudinalForce
const B = params.pacejkaBx
const C = Math.max(1.0, Math.min(1.99, params.pacejkaCx))
const D = params.pacejkaDx
const E = params.pacejkaEx
const x = slipRatio
return Fz * D * Math.sin(C * Math.atan(B * x - E * (B * x - Math.atan(B * x))))
// NO internal friction cap. Friction circle in physics.js is the only cap. (Pitfall 4)
```

**Header comment pattern (lines 1-15):** Update Phase reference; keep `// Do NOT import Three.js — this module is pure math.` rule unchanged.

---

### `src/physics.js` — extend the per-wheel contact loop

**Analog:** Own existing contact loop, lines 92-166.

**Existing params augmentation block to extend (lines 119-123):**
```javascript
params._lateralVelocity      = hubVel.dot(wheelRight)
params._longitudinalVelocity = hubVel.dot(wheelFwd)

const driveForce = getDriveTorque(i, vehicleState, params) / params.wheelRadius
params._driveForce = driveForce
```
Phase 3 adds slip ratio computation here, after `params._longitudinalVelocity` is set but before the contacts loop. The `params._driveForce` line remains for rolling resistance use; Phase 3 also needs raw `driveTorque` (not force) for the omega integrator, so compute both.

**Existing tire call site (lines 150-155):**
```javascript
const slipAngle = Math.atan2(latVel, longVelAbs + 0.01)
const Flat  = computeLateralForce(slipAngle, Fn, params)
const Flong = computeLongitudinalForce(0, Fn, params)          // ← Phase 3: replace 0 with slipRatio
const wheelForce = wheelFwd.clone().multiplyScalar(Flong)
wheelForce.addScaledVector(wheelRight, Flat)
totalForce.add(wheelForce)
```

**Pattern: slip ratio computation — INSERT before the contacts loop (after line 123):**
```javascript
// Phase 3: per-wheel slip ratio (D-04)
const SLIP_EPSILON = 0.1   // m/s — prevents 0/0 at rest (Pitfall 3 in RESEARCH.md)
const omegaR = (vehicleState.wheelOmega?.[i] ?? 0) * params.wheelRadius
const vx     = params._longitudinalVelocity
const slipRatio = (omegaR - vx) / Math.max(Math.abs(omegaR), Math.abs(vx), SLIP_EPSILON)
```

**Pattern: friction circle — INSERT after both tire calls, before wheelForce construction:**
```javascript
// Phase 3: friction circle coupling (D-05) — scale if over budget
const frictionBudget = (params.frictionCoeff || 0.9) * Fn
const combinedForce  = Math.sqrt(Flat * Flat + Flong * Flong)
if (combinedForce > frictionBudget && combinedForce > 0) {
  const scale = frictionBudget / combinedForce
  Flat  *= scale
  Flong *= scale
}
```

**Pattern: omega integrator — INSERT after friction circle, before wheelForce construction:**
```javascript
// Phase 3: wheel angular velocity ODE (D-02)
// AFTER friction circle so roadReactionTorque uses the final scaled Flong (Pitfall 2 in RESEARCH.md)
const OMEGA_EPSILON  = 0.5   // m/s — low-speed stiffness guard
const wheelInertia   = params.wheelInertia || 1.22   // kg·m²
const driveTorque    = getDriveTorque(i, vehicleState, params)
const brakeTorque    = getBrakeTorque(i, vehicleState, params)
const roadReactionTorque = Flong * params.wheelRadius

const vehicleSpd     = Math.abs(params._longitudinalVelocity)
const wheelSurfaceSpd = Math.abs((vehicleState.wheelOmega?.[i] ?? 0) * params.wheelRadius)
if (vehicleSpd + wheelSurfaceSpd < OMEGA_EPSILON) {
  vehicleState.wheelOmega[i] = params._longitudinalVelocity / params.wheelRadius
} else {
  vehicleState.wheelOmega[i] =
    (vehicleState.wheelOmega?.[i] ?? 0) +
    (driveTorque - roadReactionTorque - brakeTorque) / wheelInertia * dt
}
// Write omega to wheelDebug for logger (D-15)
if (vehicleState.wheelDebug) {
  vehicleState.wheelDebug[i].omega = vehicleState.wheelOmega[i]
}
```

**Pattern: new `getBrakeTorque` helper — ADD as module-private function, following `getDriveTorque` style (lines 38-51):**
```javascript
// Same signature shape as getDriveTorque; module-private (not exported)
function getBrakeTorque (wheelIndex, vehicleState, params) {
  const isRear = wheelIndex === 2 || wheelIndex === 3
  if (vehicleState.handbrake && isRear) {
    return params.maxHandbrakeTorque   // rear-only handbrake (D-09, D-10)
  }
  if (vehicleState.brake > 0) {
    return vehicleState.brake * params.maxBrakeTorque
  }
  return 0
}
```

**Existing wheelDebug write block (lines 159-164) — ADD omega field:**
```javascript
if (vehicleState.wheelDebug) {
  vehicleState.wheelDebug[i].fn  = Fn
  vehicleState.wheelDebug[i].fy  = Flat
  vehicleState.wheelDebug[i].sa  = Math.atan2(params._lateralVelocity, Math.abs(params._longitudinalVelocity || 1e-6))
  vehicleState.wheelDebug[i].c   = params._compression
  // Phase 3 addition:
  vehicleState.wheelDebug[i].omega = vehicleState.wheelOmega[i]  // written again after integrator; last contact wins
}
```

**Zero-init pattern for wheelDebug (line 95) — ADD omega field:**
```javascript
vehicleState.wheelDebug[i] = { fn: 0, fy: 0, sa: 0, c: 0, omega: 0 }
```

---

### `src/vehicle.js` — add Space key + handbrake field

**Existing keys object (line 12):**
```javascript
const keys = { w: false, s: false, a: false, d: false, r: false }
```
Phase 3 pattern: add `' ': false` (space character key, D-09).

**Existing key listeners (lines 15-16):**
```javascript
document.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (k in keys) keys[k] = true })
document.addEventListener('keyup',   e => { const k = e.key.toLowerCase(); if (k in keys) keys[k] = false })
```
Phase 3 pattern: `.toLowerCase()` on `' '` returns `' '` which already matches, so listener bodies need only a guard for the space character to work. The RESEARCH.md recommends:
```javascript
document.addEventListener('keydown', e => {
  const k = e.key === ' ' ? ' ' : e.key.toLowerCase()
  if (k in keys) keys[k] = true
})
document.addEventListener('keyup', e => {
  const k = e.key === ' ' ? ' ' : e.key.toLowerCase()
  if (k in keys) keys[k] = false
})
```

**Existing throttle/brake block (lines 49-51) — APPEND handbrake:**
```javascript
vehicleState.throttle = keys.w ? 1 : 0
vehicleState.brake    = keys.s ? 1 : 0
// Phase 3: handbrake (D-09, D-10)
vehicleState.handbrake = keys[' '] || false
```

**Existing SPAWN_STATE (lines 23-31) — ADD handbrake:**
```javascript
export const SPAWN_STATE = {
  // ... existing fields ...
  handbrake: false,   // Phase 3
}
```

---

### `src/debug.js` — remove old sliders, add Pacejka folders + canvas overlay

**Existing GUI init pattern (lines 26-27):**
```javascript
const gui = new GUI({ title: 'RangerSim Debug' })
gui.domElement.style.display = 'none'
```
Pattern unchanged.

**Existing slider pattern (lines 36-43):**
```javascript
gui.add(params, 'mass', 500, 3000, 10).name('Mass (kg)')
gui.add(params, 'frictionCoeff', 0.1, 1.5, 0.05).name('Friction Coeff')
```
Phase 3 follows this exact pattern for new Pacejka sliders.

**Sliders to REMOVE (D-08, D-16):**
- Line 31: `gui.add(params, 'lateralDampingCoeff', ...)` — remove entirely
- Line 43: `gui.add(params, 'corneringStiffness', ...)` — remove entirely

**Pattern: lil-gui folder (for grouped Pacejka sliders):**
lil-gui supports `gui.addFolder(name)` which returns a folder object accepting the same `.add()` calls. No existing folder in debug.js — this is a new pattern. Example:
```javascript
const lateralFolder = gui.addFolder('Lateral Tire (Pacejka)')
lateralFolder.add(params, 'pacejkaB',  5,   20,   0.5).name('B — Stiffness')
lateralFolder.add(params, 'pacejkaC',  1.0, 1.99, 0.01).name('C — Shape [1.0–1.99]')
lateralFolder.add(params, 'pacejkaD',  0.5, 2.0,  0.05).name('D — Peak Factor')
lateralFolder.add(params, 'pacejkaE', -1.0, 1.0,  0.05).name('E — Curvature')
const longFolder = gui.addFolder('Longitudinal Tire (Pacejka)')
longFolder.add(params, 'pacejkaBx',  5,   20,   0.5).name('Bx — Stiffness')
longFolder.add(params, 'pacejkaCx',  1.0, 1.99, 0.01).name('Cx — Shape [1.0–1.99]')
longFolder.add(params, 'pacejkaDx',  0.5, 2.0,  0.05).name('Dx — Peak Factor')
longFolder.add(params, 'pacejkaEx', -1.0, 1.0,  0.05).name('Ex — Curvature')
// D-16: maxHandbrakeTorque slider
gui.add(params, 'maxHandbrakeTorque', 500, 5000, 100).name('Handbrake Torque (N·m)')
```

**Pattern: backtick toggle (lines 50-55) — EXTEND to sync canvas visibility:**
```javascript
document.addEventListener('keydown', e => {
  if (e.key === '`') {
    const hidden = gui.domElement.style.display === 'none'
    gui.domElement.style.display = hidden ? '' : 'none'
    plotCanvas.style.display = hidden ? '' : 'none'  // sync Pacejka canvas (D-11)
  }
})
```

**Pattern: Pacejka canvas creation — ADD inside `initDebug` before the backtick listener:**
```javascript
// D-11: standalone canvas for Pacejka lateral force curve
const plotCanvas = document.createElement('canvas')
plotCanvas.width  = 300
plotCanvas.height = 200
plotCanvas.style.cssText = 'position:fixed;top:20px;right:320px;background:#111;border:1px solid #444;display:none'
document.body.appendChild(plotCanvas)
const plotCtx = plotCanvas.getContext('2d')
```

**Pattern: `updatePacejkaCurve` export — ADD after `initDebug`:**
```javascript
export function updatePacejkaCurve (vehicleState, params) {
  if (plotCanvas.style.display === 'none') return  // skip when hidden (performance guard)
  const ctx = plotCtx
  const W = plotCanvas.width, H = plotCanvas.height
  ctx.clearRect(0, 0, W, H)

  // Curve: Flat/D (normalized) vs slip angle ±0.3 rad (D-12)
  const RANGE = 0.3
  const steps = 200
  const B = params.pacejkaB
  const C = Math.max(1.0, Math.min(1.99, params.pacejkaC))
  const D = params.pacejkaD
  const E = params.pacejkaE
  ctx.strokeStyle = '#44ff88'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let s = 0; s <= steps; s++) {
    const sa    = -RANGE + (2 * RANGE * s / steps)
    const fNorm = Math.sin(C * Math.atan(B * sa - E * (B * sa - Math.atan(B * sa))))
    const px    = (sa + RANGE) / (2 * RANGE) * W
    const py    = H / 2 - fNorm * (H / 2 - 10)
    s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
  }
  ctx.stroke()

  // Operating point dots — FL (index 0) and FR (index 1) only (D-12)
  for (const i of [0, 1]) {
    const sa    = vehicleState.wheelDebug?.[i]?.sa || 0
    const fNorm = Math.sin(C * Math.atan(B * sa - E * (B * sa - Math.atan(B * sa))))
    const px    = (sa + RANGE) / (2 * RANGE) * W
    const py    = H / 2 - fNorm * (H / 2 - 10)
    const pct   = Math.abs(fNorm)
    const color = pct < 0.5 ? '#00ff88' : pct < 0.8 ? '#ffaa00' : '#ff2222'
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(px, py, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}
```

**Return value:** `initDebug` currently returns `gui` (line 57). Keep that return; `updatePacejkaCurve` is a separate named export, not returned.

---

### `src/logger.js` — append 4 omega fields

**Existing FIELDS array (lines 27-38) — ADD 4 entries at end (D-15):**
```javascript
// Existing last line of FIELDS:
'rr_fn', 'rr_fy', 'rr_sa', 'rr_c',
// Phase 3 additions — append only, never reorder (D-07 contract):
'fl_omega', 'fr_omega', 'rl_omega', 'rr_omega',
```

**Existing `captureFrame` push array (lines 97-108) — ADD 4 omega values at end:**
```javascript
_frames.push([
  // ... existing 33 values unchanged ...
  rr.fn ?? 0, rr.fy ?? 0, rr.sa ?? 0, rr.c ?? 0,
  // Phase 3 additions — positions 33-36:
  fl.omega ?? 0, fr.omega ?? 0, rl.omega ?? 0, rr.omega ?? 0,
])
```

**Header comment (lines 13-17):** Update field count from 33 to 37 and add `{fl/fr/rl/rr}_omega` to the field list.

---

### `src/main.js` — vehicleState init, reset block, HUD elements, updatePacejkaCurve call

**Existing import line (line 24) — ADD `updatePacejkaCurve`:**
```javascript
import { initDebug, updatePacejkaCurve } from './debug.js'
```

**Existing vehicleState declaration (lines 43-54) — ADD two new fields:**
```javascript
const vehicleState = {
  // ... existing fields unchanged ...
  wheelDebug: [ {fn:0,fy:0,sa:0,c:0}, ... ],
  // Phase 3 additions:
  wheelOmega:  [0, 0, 0, 0],    // [rad/s] per-wheel angular velocity (D-02)
  handbrake:   false,           // boolean; set by vehicle.js Space key (D-09)
}
```

**Existing reset block (lines 379-390) — ADD wheelOmega reset (Pitfall 6 in RESEARCH.md):**
```javascript
vehicleState.wheelAngles     = [0, 0, 0, 0]
vehicleState.wheelSteerAngles = [0, 0, 0, 0]
vehicleState.wheelDebug      = [ {fn:0,fy:0,sa:0,c:0}, ... ]
// Phase 3 additions:
vehicleState.wheelOmega      = [0, 0, 0, 0]
vehicleState.handbrake       = false
```

**Existing speed HUD pattern (lines 411-413) — ADD slip angle + throttle/brake HUD after it:**
```javascript
// Existing:
const speedKmh = vehicleState.velocity.length() * 3.6
document.getElementById('speedVal').textContent = speedKmh.toFixed(1)

// Phase 3 additions (D-14, M3-07, M3-08):
const slipDeg = (vehicleState.wheelDebug?.[0]?.sa || 0) * (180 / Math.PI)
const slipEl  = document.getElementById('slipVal')
if (slipEl) {
  slipEl.textContent = slipDeg.toFixed(1) + '°'
  slipEl.style.color = Math.abs(slipDeg) < 5 ? '#00ff88'
                     : Math.abs(slipDeg) < 10 ? '#ffaa00'
                     : '#ff2222'
}
document.getElementById('thrVal')?.textContent = (vehicleState.throttle * 100).toFixed(0)
document.getElementById('brkVal')?.textContent = (vehicleState.brake    * 100).toFixed(0)

// Pacejka curve canvas update — called every render frame, outside fixed accumulator (D-13)
updatePacejkaCurve(vehicleState, RANGER_PARAMS)
```

---

### `data/ranger.js` — add Pacejka params and wheel dynamics

**Existing drivetrain section (lines 33-39) — ADD `maxHandbrakeTorque` after `maxReverseTorque`:**
```javascript
maxReverseTorque: 800,   // existing
// Phase 3 addition (D-10):
maxHandbrakeTorque: 2000, // N·m — rear-only handbrake; exposed as slider (D-16)
```

**Existing friction placeholders section (lines 48-56) — ADD Pacejka + wheelInertia as a new named section after the existing block:**
```javascript
// ── Phase 3 Pacejka Tire Model (D-07) ────────────────────────────────────
// Lateral coefficients (all 4 wheels — D-06). Hard-clamped at C=[1.0,1.99] in tire.js.
pacejkaB:  10.0,   // stiffness factor — initial slope of force curve
pacejkaC:   1.9,   // shape factor — C<2 required; hard-clamped in computeLateralForce
pacejkaD:   1.0,   // peak factor — peak force = D × Fz (D=1.0 → μ=1.0 dry tarmac)
pacejkaE:  0.97,   // curvature — near 1.0 produces realistic post-peak falloff

// Longitudinal coefficients (all 4 wheels — D-06)
pacejkaBx: 10.0,
pacejkaCx:  1.9,
pacejkaDx:  1.0,
pacejkaEx: 0.97,

// Wheel angular dynamics (D-02)
// I = 0.5 × mass_wheel × r²; mass_wheel ≈ 18 kg (245/75R16 truck tire+wheel assembly)
// → I = 0.5 × 18 × 0.368² ≈ 1.22 kg·m²
wheelInertia: 1.22,  // kg·m² — exposed as optional slider (Open Question 1 in RESEARCH.md)
```

**Section comment style to follow (line 33):**
```javascript
// ── Section Name ──────────────────────────────────────────────────────────
```

---

### `index.html` — add HUD span elements

**Existing HUD div (line 36):**
```html
<div id="hud">SPEED: <span id="speedVal">0.0</span> km/h</div>
```

**Phase 3 pattern — ADD slip angle + throttle/brake lines inside `#hud`:**
```html
<div id="hud">
  SPEED: <span id="speedVal">0.0</span> km/h<br>
  SLIP: <span id="slipVal">0.0°</span><br>
  THR: <span id="thrVal">0</span>% &nbsp; BRK: <span id="brkVal">0</span>%
</div>
```

**Style:** `#hud` CSS already sets `color: #00ff88` as default; `slipVal` overrides via `.style.color` from main.js. No CSS change needed.

---

### `docs/GLOSSARY.md` — promote deferred terms to full definitions

**Existing "Deferred to Phase 3" table (lines 218-234):** Remove entries for Pacejka B/C/D/E, friction circle, longitudinal slip ratio, and wheel angular velocity from the deferred table and add them as full definitions in the Term Definitions section (following the existing `### Heading` + bullet-point style of lines 104-157).

**Pattern to follow (existing Term Definition block, lines 104-115):**
```markdown
### Slip Angle

The angle between the wheel's **heading direction** and the **contact patch velocity vector**.

- **Unit:** radians
- **Sign:** Positive = velocity pointing left of heading (counter-clockwise viewed from above)
- **Phase 3** will use slip angle as the input to the Pacejka Magic Formula lateral force calculation
```

**New terms to add (matching this style):**
- `### Longitudinal Slip Ratio (κ)` — formula D-04, unit dimensionless, range [-1, 1]
- `### Wheel Angular Velocity (ω_wheel / wheelOmega)` — unit rad/s, separate from body angularVelocity
- `### Pacejka B Coefficient (Stiffness Factor)` — shapes initial slope
- `### Pacejka C Coefficient (Shape Factor)` — controls curve shape; hard-clamped [1.0, 1.99]
- `### Pacejka D Coefficient (Peak Factor)` — D × Fz = peak force; equivalent to friction coefficient
- `### Pacejka E Coefficient (Curvature Factor)` — post-peak falloff; near 1.0 = gradual falloff
- `### Friction Circle` — combined Flat/Flong budget; Pythagorean scaling when over μ·Fz
- `### Handbrake` — Space key; rear-only maximum brake torque; produces slip naturally via Pacejka

**Also add to Frame Logger Fields section:** `{fl/fr/rl/rr}_omega` entry matching the `{fl/fr/rl/rr}_fn` style (lines 204-206).

---

## Shared Patterns

### `params._*` augmentation pattern
**Source:** `src/physics.js` lines 119-123
**Apply to:** Phase 3 slip ratio computation — follows the same convention of augmenting `params` with computed-per-step values before passing to tire functions.
```javascript
params._lateralVelocity      = hubVel.dot(wheelRight)
params._longitudinalVelocity = hubVel.dot(wheelFwd)
// Phase 3 adds computed slipRatio inline; does NOT store as params._slipRatio
// (slip ratio is computed directly from params._longitudinalVelocity and wheelOmega)
```

### wheelDebug write pattern
**Source:** `src/physics.js` lines 159-164
**Apply to:** Phase 3 omega field addition — follows exact same conditional write pattern.
```javascript
if (vehicleState.wheelDebug) {
  vehicleState.wheelDebug[i].fn = Fn
  // ... existing fields ...
  // Phase 3: add .omega = vehicleState.wheelOmega[i]
}
```

### DOM HUD update pattern
**Source:** `src/main.js` lines 411-413
**Apply to:** slip angle HUD and throttle/brake HUD — same pattern: read from vehicleState, compute display value, set `textContent` and optional `style.color`.
```javascript
const speedKmh = vehicleState.velocity.length() * 3.6
document.getElementById('speedVal').textContent = speedKmh.toFixed(1)
```

### lil-gui slider registration pattern
**Source:** `src/debug.js` lines 36-43
**Apply to:** All Pacejka sliders and maxHandbrakeTorque slider.
```javascript
gui.add(params, 'fieldName', min, max, step).name('Human Label')
// Mutation is live — RANGER_PARAMS is passed by reference (D-10)
```

### FIELDS append pattern (logger contract)
**Source:** `src/logger.js` lines 27-38, comment on line 26: "exact order is part of the public log contract; do not reorder"
**Apply to:** All 4 omega fields — append only, never reorder or insert in middle.

### Section comment style (ranger.js)
**Source:** `data/ranger.js` lines 12, 22, 33, 41, 48, 57, 63, 69
**Apply to:** New Pacejka section header.
```javascript
// ── Section Name ──────────────────────────────────────────────────────────
```

---

## No Analog Found

None — every file being modified is an existing file. All Phase 3 changes extend existing patterns.

---

## Critical Ordering Constraints (for planner)

These are sequencing requirements within `src/physics.js` Step 3, not file-order requirements:

1. Compute `params._longitudinalVelocity` (already line 120)
2. Compute `slipRatio` from `wheelOmega[i]` and `params._longitudinalVelocity`
3. Call `computeLateralForce(slipAngle, Fn, params)` → `Flat`
4. Call `computeLongitudinalForce(slipRatio, Fn, params)` → `Flong`
5. Apply friction circle (mutates `Flat`, `Flong`)
6. Run omega integrator (uses final scaled `Flong` for road reaction torque) — **Pitfall 2**
7. Construct `wheelForce` and accumulate into `totalForce`

Violating step 6's placement causes energy accumulation under high slip (RESEARCH.md Pitfall 2).

---

## Metadata

**Analog search scope:** All 8 files listed; entire codebase scanned
**Files scanned:** 8 source files + index.html
**Pattern extraction date:** 2026-05-29
