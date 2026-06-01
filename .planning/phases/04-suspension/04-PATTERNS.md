# Phase 4: Suspension - Pattern Map

**Mapped:** 2026-05-31
**Files analyzed:** 8 (6 modifications, 1 new constant, 4 new scenarios)
**Analogs found:** 8 / 8 (all in-tree)

All files in Phase 4 are MODIFICATIONS to existing files (plus new JSON scenario data). No new source modules are introduced — research and CONTEXT.md explicitly mandate inlining new math in `src/suspension.js` rather than spawning `src/arb.js` etc. (see RESEARCH §"Don't Hand-Roll" and §Architecture Patterns alternatives table).

## File Classification

| File | Status | Role | Data Flow | Closest Analog | Match Quality |
|------|--------|------|-----------|----------------|---------------|
| `src/suspension.js` | MODIFY | pure-math module (physics submodule) | transform (state→forces) | `src/suspension.js` itself (replace bodies of `computeNormalForce`); secondary: `src/tire.js` (pure-math, returns force) | exact (self) |
| `src/physics.js` | MODIFY | integrator / orchestrator | request-response per step + substep loop | `src/physics.js` itself (existing Newton substep for ω in Step 3) | exact (self) |
| `src/vehicle.js` | MODIFY | state init / input | state-mutator | `src/vehicle.js` itself (SPAWN_STATE + `wheelAngles[]` init pattern) | exact (self) |
| `data/ranger.js` | MODIFY | params / config | static data | `data/ranger.js` itself (tire/Pacejka param blocks) | exact (self) |
| `src/debug.js` | MODIFY | UI controller (lil-gui) | DOM event-driven | `src/debug.js` `initDebug` (Phase 3 Tire folder pattern) | exact (self) |
| `src/logger.js` | MODIFY | data sink (columnar log) | append-on-tick | `src/logger.js` itself (Phase 3 `*_omega` field append) | exact (self) |
| `src/main.js` | MODIFY | entry / mesh sync | render-loop | `src/main.js` `syncMeshesToState` + `wheelLocalOffsets` | exact (self) |
| `scenarios/m4-*.json` | NEW | test data | static IC | `scenarios/straight-60kph.json` | exact |
| `docs/GLOSSARY.md` | MODIFY | docs | markdown | (existing GLOSSARY structure; not read but referenced in CONTEXT D-13) | partial |

---

## Pattern Assignments

### `src/suspension.js` — quarter-car body replacement + new substep export

**Analog (primary):** `src/suspension.js` lines 39-49 (existing `computeNormalForce` body)
**Analog (secondary):** `src/tire.js` (pure-math, no Three.js import)

**Pure-math contract** (suspension.js lines 7-10):
```js
// Do NOT import Three.js directly — caller passes a rotation helper via params._rotateVector
// to keep this module pure math and testable outside the browser (no CDN Three.js available
// in Node test contexts).
```
**Apply to:** new `stepSuspensionSubsteps(vehicleState, params, dt, queryContacts)` export — no `import THREE`; consume `params._rotateVector`.

**Underscore-param convention for transient per-step state** (suspension.js lines 46-47):
```js
const compression    = params._compression          || 0
const compressionVel = params._compressionVelocity  || 0
return Math.max(0, params.tireStiffness * compression + params.tireDamping * compressionVel)
```
**Apply to:** new transient outputs `params._tireFz[i]` and `params._suspForceAccum[i]` written by the substep and read by `physics.js`. `Math.max(0, …)` clamp pattern carries to D-15 no-tension and D-14 airborne clamps.

**Rotation-helper-with-fallback pattern** (suspension.js lines 117-123):
```js
if (typeof params._rotateVector === 'function') {
  rotated = params._rotateVector(local)
} else {
  // Fallback for identity quaternion (unit tests without Three.js rotation).
  rotated = { x: localX, y: localY, z: localZ }
}
```
**Apply to:** body mount-point world-position computation inside the substep (mountWorld = position + _rotateVector(localOffset)).

**Per-corner index dispatch** (suspension.js lines 97-105):
```js
const isFront = corner === 0 || corner === 1
const isLeft  = corner === 0 || corner === 2
const localX = isLeft ? -(isFront ? params.trackFront : params.trackRear)/2
                      :  (isFront ? params.trackFront : params.trackRear)/2
```
**Apply to:** front/rear param selection (`suspensionStiffnessFront` vs `…Rear`, ARB pair indexing 0↔1 front and 2↔3 rear).

**JSDoc style and signature-lock callout** (suspension.js lines 23-38): preserve `/** @param … @returns … */` and the "signature unchanged" callout block for any new export.

---

### `src/physics.js` — substep loop call + Pacejka Fz rewire + body-force apply

**Analog:** `src/physics.js` lines 106-308 (existing `stepPhysics`)

**Step ordering / section-comment convention** (physics.js lines 107, 110, 125, 130, 316, 334, 357, 361):
```js
// ── Step 0: Rotation helper ────────────────────────────────────────────────
// ── Step 1: Catastrophic penetration failsafe ──────────────────────────────
// ── Step 2: Body-space axes ────────────────────────────────────────────────
// ── Step 3: Per-wheel force accumulation ──────────────────────────────────
// ── Step 3a: Rolling resistance ──
// ── Step 3b: Body contact points ──
// ── Step 4: Integrate linear velocity and position ──
// ── Step 5: Integrate angular velocity and quaternion orientation ──
```
**Apply to:** insert new "Step 2.5: Suspension substep loop" (or "Step 3-pre") with identical decorated comment header before the Step 3 contacts loop.

**Rotation-helper injection** (physics.js line 108):
```js
params._rotateVector = (v) => new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(vehicleState.quaternion)
```
**Apply to:** already set at Step 0; substep call site simply relies on it (no duplication).

**Newton substep / inner-iteration pattern** (physics.js lines 271-308 — the existing ω-Newton block):
```js
{
  const wheelInertia = params.wheelInertia || 1.22
  ...
  let omegaNew = omega0
  for (let iter = 0; iter < 4; iter++) {
    ...
  }
}
```
**Apply to:** new suspension substep block — wrap in `{ … }` scope, fixed iteration count `const N = 2`, declared `const sdt = dt / N`, mutate `vehicleState.hubY[i]` / `hubVy[i]` in place. Pattern parallel to RESEARCH §Pattern 2 pseudocode.

**Vector accumulation into totalForce/totalTorque with rContact pattern** (physics.js lines 184-201):
```js
const rContact = new THREE.Vector3(
  contactPoint.x - vehicleState.position.x,
  contactPoint.y - vehicleState.position.y,
  contactPoint.z - vehicleState.position.z
)
…
totalForce.addScaledVector(normal, Fn)
totalTorque.add(new THREE.Vector3().crossVectors(rContact, normal.clone().multiplyScalar(Fn)))
```
**Apply to:** applying `params._suspForceAccum[i]` as a `(0, F, 0)` world-vertical body force at the rotated mount point each outer step. Use the existing `new THREE.Vector3().crossVectors(rMount, bodyForceVec)` for body torque.

**Airborne / Fn≤0 skip pattern** (physics.js lines 196-198):
```js
const Fn = computeNormalForce(i, vehicleState, params)
if (Fn <= 0) continue
totalGroundFn += Fn
```
**Apply to:** D-14 airborne check — `if (params._tireFz[i] <= 0) { wheelDebug[i].fz = 0; continue }`. Same `continue` skip-tire-forces pattern.

**Per-wheel wheelDebug zero-then-write** (physics.js lines 136-139, 252-257, 311-313):
```js
if (vehicleState.wheelDebug) {
  vehicleState.wheelDebug[i] = { fn: 0, fy: 0, sa: 0, c: 0, omega: 0 }
}
…
vehicleState.wheelDebug[i].fn = Fn
…
vehicleState.wheelDebug[i].omega = vehicleState.wheelOmega[i]
```
**Apply to:** add new field `fz` (D-12) — initialize to 0 in the zero block at top of per-wheel loop, write actual tire spring force after substep.

**Lazy-init guard for new vehicleState arrays** (physics.js lines 169-170):
```js
if (!vehicleState.slipLong) vehicleState.slipLong = [0, 0, 0, 0]
if (!vehicleState.slipLat)  vehicleState.slipLat  = [0, 0, 0, 0]
```
**Apply to:** `hubY[]`/`hubVy[]` should be eager-initialized in vehicle.js (per RESEARCH Pitfall 4 — eager not lazy) but a paranoid `if (!vehicleState.hubY) initializeHubState(...)` guard at top of stepPhysics is acceptable.

---

### `src/vehicle.js` — SPAWN_STATE additions + reset path

**Analog:** `src/vehicle.js` lines 23-32 (SPAWN_STATE) + `main.js` lines 498-515 (reset path)

**Plain-scalar SPAWN_STATE pattern** (vehicle.js lines 23-32):
```js
export const SPAWN_STATE = {
  positionX: 0, positionY: 0, positionZ: 0,
  velocityX: 0, velocityY: 0, velocityZ: 0,
  quatX: 0, quatY: 0, quatZ: 0, quatW: 1,        // identity quaternion
  ...
  wheelAngles: [0, 0, 0, 0],
  wheelSteerAngles: [0, 0, 0, 0],
  handbrake: false
}
```
**Apply to:** add `hubY: [0, 0, 0, 0]` and `hubVy: [0, 0, 0, 0]` (or computed static-equilibrium values per RESEARCH Pattern 4). Pattern: 4-element arrays for per-corner state.

**Header comment style** (vehicle.js lines 19-22):
```js
// ── SPAWN_STATE ───────────────────────────────────────────────────────────────
// Plain scalar values — main.js copies these into THREE.Vector3 / THREE.Quaternion
// fields of vehicleState on R-key reset.
```
**Apply to:** document hubY/hubVy origin and units (m, m/s) in adjacent comment.

---

### `data/ranger.js` — new params block

**Analog:** `data/ranger.js` lines 41-47 (Tire Spring-Damper block), lines 63-82 (Pacejka block)

**Block-comment + units convention** (ranger.js lines 41-47):
```js
// ── Tire Spring-Damper ───────────────────────────────────────────────────
// Matchbox car has no suspension — the tire IS the only compliance between wheel and ground.
// tireStiffness: radial spring constant. At rest, each corner compresses ~22mm (mg/4 / k).
tireStiffness: 210000,  // N/m
tireDamping:     4000,  // N·s/m
```
**Apply to:** new `// ── Suspension Spring-Damper (Phase 4) ──` and `// ── Anti-Roll Bars (Phase 4) ──` blocks. Comment must call out: which decision locks this (D-04/D-06), units in trailing comment (`// N/m`, `// N·s/m`, `// m`, `// kg`).

**No-freeze contract** (ranger.js line 8):
```js
* Do NOT Object.freeze() this object — Plan 03 mutates fields live via lil-gui sliders.
```
**Apply to:** preserved — Phase 4 sliders mutate too. No code change needed; just don't introduce `Object.freeze`.

**Derived-value derivation comment** (ranger.js lines 22-30, 83-86):
```js
// Box model formula: I = (1/12) * mass * (a² + b²) where a,b are the two ...
inertiaRoll:  (1 / 12) * 1360 * (1.85 ** 2 + 1.60 ** 2),  // kg·m² (Ixx — roll,  ≈  800)
…
// I = 0.5 × mass_wheel × r²; mass_wheel ≈ 18 kg
wheelInertia: 1.22,  // kg·m² — 0.5 × 18 kg × 0.368² (D-02)
```
**Apply to:** record the natural-frequency / damping-ratio derivation for `suspensionStiffness*` and `suspensionDamping*` defaults inline (per RESEARCH Code Examples §New ranger.js Params).

**New params required by CONTEXT D-02, D-04, D-06, D-09, D-11:**
- `suspensionStiffnessFront`, `suspensionStiffnessRear` — N/m
- `suspensionDampingFront`, `suspensionDampingRear` — N·s/m
- `suspensionRestLengthFront`, `suspensionRestLengthRear` — m
- `arbStiffnessFront`, `arbStiffnessRear` — N/m
- `wheelMass` — kg (≈18; referenced in existing wheelInertia comment)
- `physicsDt` — s (D-09; OR exported `PHYSICS_DT` constant from main.js)

---

### `src/debug.js` — new sliders + per-wheel Fz HUD readout

**Analog:** `src/debug.js` `initDebug` (entire function lines 35-95), Tire folder lines 60-69

**Folder pattern with grouped sliders** (debug.js lines 60-69):
```js
const tireFolder = gui.addFolder('Tire (Pacejka)')
tireFolder.add(params, 'pacejkaB', 5, 20, 0.5).name('B - Stiffness')
tireFolder.add(params, 'pacejkaC', 1.0, 1.99, 0.01).name('C - Shape [1.0-1.99]')
…
```
**Apply to:** create `gui.addFolder('Suspension')` with the 6 suspension sliders + 2 ARB sliders (D-11). Slider signature: `gui.add(params, 'name', min, max, step).name('Label (units)')`.

**Slider range/step convention examples** (debug.js lines 40-50):
```js
gui.add(params, 'tireStiffness', 50000, 400000, 5000).name('Tire Stiffness (N/m)')
gui.add(params, 'tireDamping', 500, 20000, 500).name('Tire Damping (N·s/m)')
gui.add(params, 'mass', 500, 3000, 10).name('Mass (kg)')
```
**Apply to:** match D-10 stability gate (2× default within range, not 10×). Recommend `suspensionStiffness*: (10000, 100000, 1000)`, `suspensionDamping*: (500, 8000, 100)`, `suspensionRestLength*: (0.10, 0.40, 0.01)`, `arbStiffness*: (0, 40000, 500)`.

**Mutable params reference** (debug.js line 31-33):
```js
* @param params — RANGER_PARAMS reference (NOT a copy). Slider mutations write
*   directly to this object, which is the same object physics.js reads each step
```
**Apply to:** preserved — same `RANGER_PARAMS` reference threading.

**HUD canvas creation pattern** (debug.js lines 75-82):
```js
plotCanvas = document.createElement('canvas')
plotCanvas.width = 300
plotCanvas.height = 200
plotCanvas.style.cssText = 'position:fixed;top:20px;right:320px;background:#111;border:1px solid #444;display:none'
document.body.appendChild(plotCanvas)
plotCtx = plotCanvas.getContext('2d')
```
**Apply to:** per-wheel Fz readout (D-12 / M4-09). For text-only readout, prefer adding a row to the existing HUD (index.html `#speedVal` pattern in main.js line 537), or a small 4-row canvas via this exact pattern. Discretion per CONTEXT.

**Backtick toggle sync** (debug.js lines 86-92):
```js
document.addEventListener('keydown', e => {
  if (e.key === '`') {
    const hidden = gui.domElement.style.display === 'none'
    gui.domElement.style.display = hidden ? '' : 'none'
    plotCanvas.style.display = hidden ? '' : 'none'
  }
})
```
**Apply to:** if a new Fz canvas is added, extend this listener to toggle it too (constraint: ONE backtick listener in the file). Same in-lockstep pattern.

---

### `src/logger.js` — `*_fz` field append

**Analog:** `src/logger.js` lines 29-46 (FIELDS array), lines 117-119 (Phase 3 omega append)

**Append-at-end convention** (logger.js lines 40-46):
```js
// Phase 3 additions (constraint #8 — appended at END, never reorder above entries)
'fl_omega', 'fr_omega', 'rl_omega', 'rr_omega',
// Tire relaxation time-floor (added with the time-floored relaxation rewrite, 2026-05-31).
'tau_min',
```
**Apply to:** add `'fl_fz', 'fr_fz', 'rl_fz', 'rr_fz'` at the END of FIELDS (after `tau_min`). NEVER reorder. Add a comment block dated 2026-05-31 / phase 4 referencing D-12.

**Capture row append-at-end** (logger.js lines 117-120):
```js
// Phase 3 additions — wheel angular velocity (constraint #8 — appended at END)
fl.omega ?? 0, fr.omega ?? 0, rl.omega ?? 0, rr.omega ?? 0,
params?.tireRelaxationTimeMin ?? 0,
```
**Apply to:** new row append: `fl.fz ?? 0, fr.fz ?? 0, rl.fz ?? 0, rr.fz ?? 0,` after `tau_min` value. Use `?? 0` nullish-default pattern.

---

### `src/main.js` — vehicleState schema additions, reset path, mesh visual binding

**Analog:** `src/main.js` lines 42-55 (vehicleState literal), lines 498-515 (reset block), lines 196-217 (syncMeshesToState), lines 175-180 (wheelLocalOffsets)

**vehicleState literal pattern** (main.js lines 42-55):
```js
const vehicleState = {
  position:        new THREE.Vector3(0, RANGER_PARAMS.cgHeight, 0),
  …
  wheelOmega:      [0, 0, 0, 0],
  handbrake:       false,
}
```
**Apply to:** add `hubY: [...]` and `hubVy: [0, 0, 0, 0]` with initial values computed from RESEARCH Pattern 4 static-equilibrium formula (or simple `wheelRadius` if accepting first-frame settle).

**Reset block pattern** (main.js lines 498-515):
```js
if (resetRequested) {
  vehicleState.position.set(SPAWN_STATE.positionX, RANGER_PARAMS.cgHeight, SPAWN_STATE.positionZ)
  …
  vehicleState.wheelOmega = [0, 0, 0, 0]
  vehicleState.slipLong = [0, 0, 0, 0]
  vehicleState.slipLat  = [0, 0, 0, 0]
  vehicleState.handbrake = false
}
```
**Apply to:** reset `hubY` and `hubVy` to static-equilibrium values; recompute body Y so car spawns settled.

**Wheel mesh local-offset XZ + Y composition** (main.js lines 175-180):
```js
const wheelLocalOffsets = [
  new THREE.Vector3(-tF, wr - RANGER_PARAMS.cgHeight, -(L * wR)),  // 0: FL
  new THREE.Vector3( tF, wr - RANGER_PARAMS.cgHeight, -(L * wR)),  // 1: FR
  …
]
```
**Apply to:** D-16 visual binding — XZ stays as-is; Y becomes dynamic per frame in `syncMeshesToState`.

**Wheel mesh quaternion composition pattern** (main.js lines 204-216):
```js
for (let i = 0; i < 4; i++) {
  const spinQ = new THREE.Quaternion().setFromAxisAngle(_spinAxis, -state.wheelAngles[i])
  if (i < 2) {
    const steer = state.wheelSteerAngles ? state.wheelSteerAngles[i] : state.steerAngle
    const steerQ = new THREE.Quaternion().setFromAxisAngle(_steerAxis, steer)
    wheelMeshes[i].quaternion.multiplyQuaternions(steerQ, spinQ)
  } else {
    wheelMeshes[i].quaternion.copy(spinQ)
  }
}
```
**Apply to:** add `wheelMeshes[i].position.y = …` line per wheel — set body-local Y from `state.hubY[i] - state.position.y` rotated into body frame (or simpler: `wheelLocalOffsets[i].y + (state.hubY[i] - hubYRest[i])` if body roll is small; full-correct uses inverse quaternion).

**HUD readout pattern** (main.js line 537):
```js
const speedKmh = vehicleState.velocity.length() * 3.6
document.getElementById('speedVal').textContent = speedKmh.toFixed(1)
```
**Apply to:** per-wheel Fz HUD elements (M4-09) — add `#flFzVal`, `#frFzVal`, `#rlFzVal`, `#rrFzVal` `<span>`s to `index.html`, update each render frame from `vehicleState.wheelDebug[i].fz`.

**Constant declaration pattern (for PHYSICS_DT per D-09)** (main.js lines 30-31):
```js
const FIXED_DT = 1 / 60          // physics step: 16.667ms
const MAX_FRAME_TIME = 0.25       // spiral-of-death clamp: 250ms
```
**Apply to:** rename `FIXED_DT` → `PHYSICS_DT` (or add export) and pass into `stepPhysics` as already done. D-09 says either constant or `vehicleState.physicsDt` — constant is simpler.

---

### `scenarios/m4-*.json` — initial condition JSON

**Analog:** `scenarios/straight-60kph.json` (entire file)

**JSON structure** (straight-60kph.json):
```json
{
  "description": "Car moving at 60 km/h in a straight line (forward = -Z)",
  "position":        { "x": 0, "y": 0.55, "z": 0 },
  "velocity":        { "x": 0, "y": 0,    "z": -16.667 },
  "quaternion":      { "x": 0, "y": 0,    "z": 0, "w": 1 },
  "angularVelocity": { "x": 0, "y": 0,    "z": 0 }
}
```
**Apply to:** all four Wave 0 scenarios listed in RESEARCH §Wave 0 Gaps:
- `scenarios/m4-02-asymmetric-bump.json`
- `scenarios/m4-04-static-vs-braking.json`
- `scenarios/m4-05-wheel-lift-ramp.json`
- `scenarios/m4-06-bump-response.json`

**Loader contract** (logger.js lines 130-160 — `openInitialCondition`): only `position`, `velocity`, `quaternion`, `angularVelocity` keys are applied; **unknown keys are silently ignored** (line 153 `console.error` only on JSON parse failure). This means scenarios CANNOT carry `hubY`/`hubVy` initial state — they will settle from the spawn equilibrium. Document this limitation in any new scenario that depends on stationary suspension state.

---

## Shared Patterns

### Underscore-prefixed transient `params._*` fields
**Source:** `src/physics.js` lines 108, 193-194; `src/suspension.js` lines 46-47
**Apply to:** all Phase 4 modules
**Convention:** Per-step transient state (rotation helper, compression, velocities, new `_tireFz[]`, `_suspForceAccum[]`) is attached to `params` with underscore prefix, NOT to `vehicleState`. `vehicleState` is reserved for integrated state that persists across steps.
```js
// physics.js:108  — helper injection
params._rotateVector = (v) => new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(vehicleState.quaternion)
// physics.js:193-194 — per-contact transient
params._compression         = depth
params._compressionVelocity = -contactVel.dot(normal)
// suspension.js:46-47 — read pattern
const compression    = params._compression          || 0
```
**Phase 4 new transients:** `params._tireFz` (Array(4)), `params._suspForceAccum` (Array(4)), `params._suspMountWorld` (optional cache).

### Math.max(0, …) clamp for one-way forces
**Source:** `src/suspension.js` line 48; `src/physics.js` line 348
**Apply to:** D-15 no-tension clamp on suspension spring; D-14 airborne tireFz≤0 check
```js
// Existing tire-spring clamp (lines 46-48)
return Math.max(0, params.tireStiffness * compression + params.tireDamping * compressionVel)
// Existing body-contact clamp (line 348-350)
const Fn = Math.max(0,
  params.bodyContactStiffness * depth + params.bodyContactDamping * (-contactVel.dot(normal))
)
```
**Phase 4 application:** `const springTerm = suspComp > 0 ? k_S * suspComp : 0` (no-tension), `if (tireFz <= 0) skip` (airborne).

### Wheel-index dispatch convention
**Source:** `src/suspension.js` lines 97-98; `src/physics.js` lines 46, 73
**Apply to:** ARB axle pairing, front/rear param selection
```js
const isFront = corner === 0 || corner === 1   // alt: corner < 2
const isLeft  = corner === 0 || corner === 2
```
**ARB pairing (Phase 4):** front axle = indices [0, 1], rear axle = [2, 3]. Per GLOSSARY: 0=FL, 1=FR, 2=RL, 3=RR.

### lil-gui slider signature
**Source:** `src/debug.js` lines 40-69
**Apply to:** all new D-11 sliders
```js
gui.add(params, 'name', min, max, step).name('Label (units)')
// or grouped:
const folder = gui.addFolder('Group Name')
folder.add(params, 'name', min, max, step).name('Label')
```

### Logger field append-at-end + nullish-coalesce default
**Source:** `src/logger.js` lines 40, 113-118
**Apply to:** new `*_fz` fields
```js
// FIELDS array — append, never reorder
'fl_omega', 'fr_omega', 'rl_omega', 'rr_omega',
// captureFrame row — match order
fl.omega ?? 0, fr.omega ?? 0, rl.omega ?? 0, rr.omega ?? 0,
```

### `wheelDebug[i]` per-wheel scratchpad
**Source:** `src/physics.js` lines 138, 252-257; `src/main.js` line 52
**Apply to:** new `fz` field per D-12
```js
// Init at top of per-wheel loop (zeros stale values when airborne)
vehicleState.wheelDebug[i] = { fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 }
// Write after substep
vehicleState.wheelDebug[i].fz = params._tireFz[i]
```
Also update the reset block in `main.js` line 510 and the initial literal in line 52 to include `fz: 0`.

### Section-comment decorated headers
**Source:** `src/physics.js` lines 107, 110, 125, 130 (`// ── Step N: Title ──`)
**Apply to:** new substep block in physics.js, new params block in ranger.js, new state block in main.js vehicleState

### Pure-math module isolation (no Three.js import)
**Source:** `src/suspension.js` lines 7-10 + line 117-123 fallback
**Apply to:** all new code in `src/suspension.js` — use `params._rotateVector` helper, return plain `{x,y,z}` objects, NEVER `import * as THREE from 'three'`.

---

## No Analog Found

| File | Reason |
|------|--------|
| `docs/GLOSSARY.md` (D-13 additions) | Not read in this mapping; follow existing markdown structure of GLOSSARY.md for terms (sprung mass, unsprung mass, suspension travel, ride height, anti-roll bar, substep convention). Planner: read GLOSSARY.md before writing additions. |

All other Phase 4 surfaces have clear in-tree analogs.

---

## Metadata

**Analog search scope:** `src/`, `data/`, `scenarios/` (entire project source tree, 8 files total per CLAUDE.md no-build-system constraint)
**Files scanned:** 8 (suspension.js, physics.js, vehicle.js, ranger.js, debug.js, logger.js, main.js, straight-60kph.json) — every source file in the project
**Pattern extraction date:** 2026-05-31
**Phase:** 4 - Suspension
