# Phase 2: Scenario System + Debug Menu - Pattern Map

**Mapped:** 2026-05-28
**Files analyzed:** 4 (new/modified)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/debug.js` (modify) | utility / UI | request-response (lil-gui → params) | `src/debug.js` itself (extend, not replace) | exact |
| `src/logger.js` (new) | utility | event-driven (key toggle → tick capture → file download) | `src/vehicle.js` (key listener pattern) | role-partial |
| `src/main.js` (modify) | entry point | batch (fixed-timestep loop) | `src/main.js` itself (hook into existing loop) | exact |
| `data/ranger.js` (read-only reference) | config | — | — | reference only |

---

## Pattern Assignments

### `src/debug.js` — Extend existing file (modify)

**Analog:** `src/debug.js` (the file being modified)

**Existing imports pattern** (lines 1-7):
```javascript
import { GUI } from 'three/addons/libs/lil-gui.module.min.js'
```
No additional imports needed for Phase 2 slider additions. The `\` key listener will mirror the existing backtick listener pattern.

**Existing slider registration pattern** (lines 25-28):
```javascript
gui.add(params, 'lateralDampingCoeff', 500, 10000, 100).name('Lateral Damping (N/m·s)')
gui.add(params, 'rollingResistanceCoeff', 10, 1000, 10).name('Rolling Resistance (N/m·s)')
gui.add(params, 'tireStiffness', 50000, 400000, 5000).name('Tire Stiffness (N/m)')
gui.add(params, 'tireDamping', 500, 20000, 500).name('Tire Damping (N·s/m)')
```
Copy this exact pattern for each new slider (D-08). Arguments: `(params, fieldName, min, max, step)`.

**Existing key toggle pattern** (lines 31-36):
```javascript
document.addEventListener('keydown', e => {
  if (e.key === '`') {
    const hidden = gui.domElement.style.display === 'none'
    gui.domElement.style.display = hidden ? '' : 'none'
  }
})
```
Copy for `\` key logger toggle — replace `'`'` with `'\\'`, and call `logger.toggleRecording()` instead of toggling `gui.domElement`.

**Read-only label pattern** (no existing example — use lil-gui API):
```javascript
// lil-gui read-only label: add a dummy object with a string property, disable the controller
const hint = { hint: '\\ to record' }
gui.add(hint, 'hint').name('Logger').disable()
```

**Sliders to add per D-08** (copy `gui.add(params, ...)` pattern above for each):
- `mass` — suggested range 500–3000, step 10
- `corneringStiffness` — label "(Phase 2 placeholder — Phase 3: Pacejka B/C/D/E)"
- `frictionCoeff` — suggested range 0.1–1.5, step 0.05
- `maxDriveTorque` — suggested range 100–2000, step 50
- `maxBrakeTorque` — suggested range 500–6000, step 100
- `bodyContactStiffness` — suggested range 50000–500000, step 5000
- `bodyContactDamping` — suggested range 1000–20000, step 500
- `lateralDampingCoeff` — already present, add label "(unused)"

**Fixed, no sliders per D-09/D-10:** `rollingResistanceCoeff`, `steerRate`, `steerDecayRate`, all geometry fields, weight distribution, `inertiaRoll/Pitch/Yaw`.

---

### `src/logger.js` — New file

**Analog 1 (key listener pattern):** `src/vehicle.js` lines 12-16
```javascript
// Key listener registered at module load — no DOMContentLoaded needed (ES module parse order)
const keys = { w: false, s: false, a: false, d: false, r: false }
document.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (k in keys) keys[k] = true })
document.addEventListener('keyup',   e => { const k = e.key.toLowerCase(); if (k in keys) keys[k] = false })
```
For the logger, the `\` key is a toggle (not held), so use `keydown` only with a boolean flip, not the `keys` held-state object.

**Analog 2 (module-private mutable state):** `src/vehicle.js` lines 12-30 (SPAWN_STATE + module-private `keys`)
```javascript
// Module-private state — not exported; only the exported function touches it
const keys = { ... }
export const SPAWN_STATE = { ... }
export function updateVehicle (vehicleState, params, dt) { ... }
```
Copy this structure: module-private `_recording` flag + `_frames` array + `_fields` header constant. Export only `captureFrame(vehicleState, contactData)` and `toggleRecording()`.

**Core pattern for logger.js:**
```javascript
// Module-private state
let _recording = false
const _frames = []

// D-06: columnar format — one fields header, frames as arrays of scalars
const FIELDS = ['t', 'px','py','pz', 'vx','vy','vz',
                 'qx','qy','qz','qw', 'wx','wy','wz',
                 'steer','thr','brk',
                 'fl_fn','fl_fy','fl_sa','fl_c',
                 'fr_fn','fr_fy','fr_sa','fr_c',
                 'rl_fn','rl_fy','rl_sa','rl_c',
                 'rr_fn','rr_fy','rr_sa','rr_c']

export function toggleRecording () {
  if (_recording) {
    _recording = false
    _downloadLog()
    _frames.length = 0  // reset for next session
  } else {
    _recording = true
    _frames.length = 0
  }
}

export function captureFrame (simTime, vehicleState, contactData) {
  if (!_recording) return
  // push one array row per tick; contactData = array of 4 per-wheel objects
  _frames.push([
    simTime,
    vehicleState.position.x, vehicleState.position.y, vehicleState.position.z,
    vehicleState.velocity.x, vehicleState.velocity.y, vehicleState.velocity.z,
    vehicleState.quaternion.x, vehicleState.quaternion.y,
      vehicleState.quaternion.z, vehicleState.quaternion.w,
    vehicleState.angularVelocity.x, vehicleState.angularVelocity.y, vehicleState.angularVelocity.z,
    vehicleState.steerAngle, vehicleState.throttle, vehicleState.brake,
    // per-wheel: fn, fy, sa, compression — 0 if not in contact
    ...contactData.flatMap(w => [w.fn ?? 0, w.fy ?? 0, w.sa ?? 0, w.compression ?? 0])
  ])
}
```

**Download pattern** (no existing analog — use standard browser API):
```javascript
function _downloadLog () {
  const log = JSON.stringify({ fields: FIELDS, frames: _frames })
  const blob = new Blob([log], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `rangersim-log-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}
```

**Initial condition loader pattern** (file picker — no existing analog):
```javascript
export function openInitialCondition (vehicleState) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = e => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const ic = JSON.parse(ev.target.result)
        // Apply fields that exist in the IC file; ignore unknown keys
        if (ic.position)        vehicleState.position.set(ic.position.x, ic.position.y, ic.position.z)
        if (ic.velocity)        vehicleState.velocity.set(ic.velocity.x, ic.velocity.y, ic.velocity.z)
        if (ic.quaternion)      vehicleState.quaternion.set(ic.quaternion.x, ic.quaternion.y, ic.quaternion.z, ic.quaternion.w)
        if (ic.angularVelocity) vehicleState.angularVelocity.set(ic.angularVelocity.x, ic.angularVelocity.y, ic.angularVelocity.z)
      } catch (err) {
        console.error('[logger] Failed to parse IC file:', err)
      }
    }
    reader.readAsText(file)
  }
  input.click()
}
```

---

### `src/main.js` — Modify (hook logger into game loop)

**Analog:** `src/main.js` itself — hook into the existing fixed-timestep accumulator.

**Existing imports block** (lines 18-24) — add logger import at the end of this block:
```javascript
import * as THREE from 'three'
import Stats from 'three/addons/libs/stats.module.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { stepPhysics } from './physics.js'
import { updateVehicle, SPAWN_STATE } from './vehicle.js'
import { updateCamera } from './camera.js'
import { initDebug } from './debug.js'
// Add:
import { captureFrame } from './logger.js'
```

**Existing game loop inner step** (lines 363-382) — `captureFrame` call goes AFTER `stepPhysics`, inside the `while` block:
```javascript
while (accumulator >= FIXED_DT) {
  // ... existing updateVehicle / reset logic ...
  stepPhysics(vehicleState, RANGER_PARAMS, FIXED_DT, queryContacts)
  // ADD after stepPhysics:
  captureFrame(simTime, vehicleState, perWheelContactData)
  accumulator -= FIXED_DT
}
```
`simTime` is a running counter incremented by `FIXED_DT` each step. `perWheelContactData` is the per-wheel contact result array that `stepPhysics` already computes internally — this may require `stepPhysics` to return or expose contact results, or the logger can receive a subset of vehicleState fields instead (planner decides).

**Existing reset block pattern** (lines 368-379) — initial condition loader replaces the manual field assignments in the reset block. If loader sets vehicleState fields before loop starts, no change to the reset block is needed; the IC loader is a one-shot setup, not a per-tick operation.

---

### `data/ranger.js` — Reference only (no modification)

All slider-exposed fields already exist in `RANGER_PARAMS` (lines 10-72). No new fields are needed for Phase 2 slider additions. The object is passed by reference to `initDebug(RANGER_PARAMS)` (main.js line 346) — slider mutations write directly to the live object, which physics.js reads each step. This pattern is already established and requires no change.

---

## Shared Patterns

### Key Listener Registration
**Source:** `src/vehicle.js` lines 14-16
**Apply to:** `src/logger.js` (`\` toggle), `src/debug.js` (existing backtick pattern to copy for `\`)
```javascript
// Register at module load — ES module scripts run after parse, no DOMContentLoaded wrapper needed
document.addEventListener('keydown', e => { /* handle e.key */ })
```

### Module-Private State + Named Exports
**Source:** `src/vehicle.js` lines 12-31
**Apply to:** `src/logger.js`
```javascript
// Private mutable state at module scope
const _privateState = { ... }

// Public API: named exports only
export function doSomething (...) { /* mutates _privateState */ }
```

### Params Passed by Reference (Live Mutation)
**Source:** `src/debug.js` lines 18-38, `src/main.js` line 346
**Apply to:** All new sliders in `src/debug.js`
```javascript
// RANGER_PARAMS ref passed in — gui.add writes directly to same object physics.js reads
initDebug(RANGER_PARAMS)
// Inside initDebug:
gui.add(params, 'fieldName', min, max, step).name('Human Label')
```

### Error Handling in Async/IO Operations
**Source:** No existing analog — use try/catch in FileReader `onload` (see logger.js initial condition loader pattern above).
**Apply to:** `src/logger.js` `openInitialCondition` function.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/logger.js` (download) | utility | file-I/O | No existing file download or Blob URL pattern in codebase |
| `src/logger.js` (file picker) | utility | file-I/O | No existing `<input type="file">` pattern in codebase |

For these, use standard browser Web APIs: `Blob`, `URL.createObjectURL`, `document.createElement('a')` for download; `<input type="file">` with `FileReader` for IC loader. No library needed.

---

## Metadata

**Analog search scope:** `src/`, `data/`
**Files scanned:** 7 (`debug.js`, `main.js`, `physics.js`, `vehicle.js`, `camera.js`, `suspension.js`, `tire.js`) + `data/ranger.js`
**Pattern extraction date:** 2026-05-28
