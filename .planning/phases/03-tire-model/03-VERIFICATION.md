---
phase: 03-tire-model
verified: 2026-05-30T00:00:00Z
status: gaps_found
score: 8/10 must-haves verified
overrides_applied: 1
overrides:
  - must_have: "M3-06: Handbrake (Space) reduces rear wheel Pacejka D for drift initiation"
    reason: "CONTEXT.md D-09 uses brake torque to build negative slip ratio naturally — achieves drift via Pacejka saturation without D modification. Mechanistically superior: avoids discontinuous D jumps; drift develops and recovers smoothly."
    accepted_by: "ledogen"
    accepted_at: "2026-05-30T00:00:00Z"
gaps:
  - truth: "A standalone canvas overlay (300x200 px) displays the Pacejka lateral force curve normalized to D and dots for FL/FR operating points; colored green/orange/red by |f|/D thresholds 0.5/0.8"
    status: failed
    reason: "updatePacejkaCurve references plotCanvas and plotCtx which are const declarations inside initDebug() function scope. These variables are not in module scope. The exported updatePacejkaCurve function at module level cannot close over locals of a sibling function — it will throw ReferenceError: plotCanvas is not defined at runtime on every render frame call. Canvas exists in DOM but the draw function is broken."
    artifacts:
      - path: "src/debug.js"
        issue: "plotCanvas declared as const on line 69 inside initDebug(); plotCtx declared as const on line 74 inside initDebug(). updatePacejkaCurve is a separate export at module scope (line 105) that references plotCanvas and plotCtx as free variables — these are not in scope. Fix: promote both to module-level let variables assigned inside initDebug."
    missing:
      - "Promote plotCanvas to module-level: let plotCanvas = null at module scope, assign inside initDebug"
      - "Promote plotCtx to module-level: let plotCtx = null at module scope, assign inside initDebug"
      - "Guard in updatePacejkaCurve: if (!plotCanvas || plotCanvas.style.display === 'none') return"
  - truth: "M3-06: Handbrake (Space) reduces rear wheel Pacejka D for drift initiation"
    status: overridden
    reason: "REQUIREMENTS.md M3-06 specifies handbrake reduces rear wheel Pacejka D coefficient. Implementation instead applies maxHandbrakeTorque brake torque to rear wheels via getBrakeTorque helper. This is a documented design deviation (CONTEXT.md D-09) that achieves drift through slip ratio buildup rather than D modification. The functional outcome (drift initiation) is equivalent but the implementation does not match the requirement literal text. No override has been recorded."
    resolution: "See overrides[0]"
    artifacts:
      - path: "src/physics.js"
        issue: "getBrakeTorque returns params.maxHandbrakeTorque for rear wheels when handbrake active — brake torque approach, not Pacejka D reduction"
      - path: ".planning/REQUIREMENTS.md"
        issue: "M3-06 text: 'Handbrake (Space) reduces rear wheel Pacejka D for drift initiation' — not matched by implementation"
    missing:
      - "Either: implement actual Pacejka D reduction for rear wheels when handbrake active, OR add an override entry to this VERIFICATION.md accepting the brake-torque deviation as equivalent"
---

# Phase 3: Tire Model Verification Report

**Phase Goal:** The user experiences physics-honest lateral grip, wheelspin, and drift — driven by the Pacejka Magic Formula using real wheel angular velocity and a friction circle that couples lateral and longitudinal forces correctly.
**Verified:** 2026-05-30
**Status:** gaps_found — 1 code blocker (CR-01: plotCanvas scope bug) + 1 requirement deviation (M3-06 approach mismatch)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | data/ranger.js exports all 10 Pacejka fields with exact names and starting values (M3-03, M3-04, M3-10) | VERIFIED | grep confirms pacejkaB=10.0, pacejkaC=1.9, pacejkaD=1.0, pacejkaE=0.97, pacejkaBx/Cx/Dx/Ex, wheelInertia=1.22, maxHandbrakeTorque=2000 |
| 2 | computeLateralForce and computeLongitudinalForce are Pacejka Magic Formula with C clamped [1.0,1.99], no negation, no internal caps (M3-03, M3-04) | VERIFIED | Behavioral spot-check: Fy(0)=0, Fy(0.1)=955.8>0, Fx(0)=0, Fx(0.2)=999.2>0; C clamp: pacejkaC=2.5 produces same output as 1.99 |
| 3 | wheelOmega[4] integrated per physics step from drive/brake/road reaction torques; slip ratio computed and passed to computeLongitudinalForce (M3-01, M3-02) | VERIFIED | physics.js: SLIP_EPSILON=0.1, slipRatio formula present, computeLongitudinalForce(slipRatio...) called (no zero placeholder), omega integrator with OMEGA_EPSILON=0.5 present |
| 4 | Friction circle scales Flat and Flong when sqrt(Flat^2+Flong^2) exceeds frictionCoeff*Fn; omega integrator uses scaled Flong as road reaction (M3-05) | VERIFIED | physics.js: Math.sqrt(Flat*Flat+Flong*Flong) present; ordering check passes (frictionBudget line 179 < roadReactionTorque line 193 < totalForce.add line 206) |
| 5 | Space key sets vehicleState.handbrake=true; rear wheels receive maxHandbrakeTorque; R-key reset zeroes wheelOmega and handbrake (M3-06 partial) | VERIFIED | vehicle.js: e.key===' ' in both listeners, vehicleState.handbrake=keys[' ']; SPAWN_STATE.handbrake=false; physics.js: getBrakeTorque returns params.maxHandbrakeTorque for rear when handbrake active; main.js: reset block zeros wheelOmega=[0,0,0,0] and handbrake=false |
| 6 | HUD shows front slip angle in degrees, color-coded green/orange/red; throttle and brake percentage (M3-07, M3-08) | VERIFIED | main.js: slipDeg computed from wheelDebug[0].sa; thresholds <5/#00ff88, <10/#ffaa00, else #ff2222 (D-14 values); thrEl/brkEl updated each frame; index.html has slipVal/thrVal/brkVal spans |
| 7 | updatePacejkaCurve is exported from debug.js and called once per render frame outside the fixed-timestep accumulator (M3-09 partial — see gap) | VERIFIED (wiring only) | main.js imports and calls updatePacejkaCurve(vehicleState, RANGER_PARAMS) at line 434; ordering check: while-loop at 376, call at 434, renderer.render at 438 — call is outside accumulator |
| 8 | CANVAS DRAW BROKEN: plotCanvas/plotCtx scope bug means the curve plot crashes at runtime (M3-09 FAILED) | FAILED | plotCanvas declared const inside initDebug() line 69; updatePacejkaCurve at module scope references it as free variable — JavaScript const bindings are function-scoped, not module-visible; will throw ReferenceError |
| 9 | Logger FIELDS has 37 entries with fl_omega/fr_omega/rl_omega/rr_omega appended at the end; captureFrame pushes omega values in matching order (constraint #8) | VERIFIED | FIELDS count=37; last 4: fl_omega, fr_omega, rl_omega, rr_omega; captureFrame: fl.omega??0, fr.omega??0, rl.omega??0, rr.omega??0 appended at end |
| 10 | GLOSSARY.md defines kappa, wheelOmega, Pacejka B/C/D/E, friction circle, handbrake; logger field entries added (D-15) | VERIFIED | GLOSSARY.md contains: Longitudinal Slip Ratio, wheelOmega, Pacejka B/C/D/E, Friction Circle, Handbrake; fl_omega/fr_omega/rl_omega/rr_omega defined in Frame Logger Fields section |

**Score:** 8/10 truths verified (1 hard fail: plotCanvas scope bug; 1 requirement deviation: M3-06 approach)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/tire.js` | Pacejka lateral and longitudinal force functions | VERIFIED | Both functions present with correct Pacejka formula, C-clamp, no negation, no internal cap |
| `data/ranger.js` | RANGER_PARAMS with all Pacejka coefficients + wheelInertia + maxHandbrakeTorque | VERIFIED | All 10 fields present with correct starting values |
| `src/physics.js` | Slip ratio, friction circle, omega integrator, getBrakeTorque | VERIFIED | All components present; getBrakeTorque module-private (not exported); critical ordering constraint passes |
| `src/vehicle.js` | Space-key handbrake; vehicleState.handbrake field; SPAWN_STATE.handbrake | VERIFIED | All present; e.key===' ' used (not 'space'); no 'space' string literal |
| `src/main.js` | wheelOmega/handbrake init and reset; updatePacejkaCurve import and call; HUD updates | VERIFIED | All wiring correct; call placement outside accumulator confirmed |
| `src/debug.js` | Pacejka folders; canvas overlay; updatePacejkaCurve export; backtick sync | STUB (partial) | Canvas DOM element created; export function present; BUT plotCanvas/plotCtx are function-local — updatePacejkaCurve will ReferenceError at runtime |
| `src/logger.js` | fl_omega/fr_omega/rl_omega/rr_omega FIELDS and captureFrame values | VERIFIED | 37-field contract; append-only maintained; values pushed in fl/fr/rl/rr order |
| `index.html` | slipVal, thrVal, brkVal span elements | VERIFIED | All three spans present with correct ids; speedVal preserved |
| `docs/GLOSSARY.md` | 8 new term definitions + 4 logger field entries | VERIFIED | All required terms and logger fields documented |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| src/tire.js | data/ranger.js | params.pacejkaB/C/D/E read inside computeLateralForce | WIRED | Confirmed: B/C/D/E and Bx/Cx/Dx/Ex read from params |
| src/physics.js | src/tire.js | computeLongitudinalForce(slipRatio, Fn, params) | WIRED | No stale zero-arg call remaining |
| src/physics.js | vehicleState.wheelOmega | omega integrator writes wheelOmega[i] each step | WIRED | Both free-rolling clamp and Euler integration paths present |
| src/vehicle.js | vehicleState.handbrake | Space key state copied to vehicleState.handbrake | WIRED | vehicleState.handbrake = keys[' '] || false |
| src/physics.js getBrakeTorque | params.maxHandbrakeTorque | rear-only return when handbrake active | WIRED | if (vehicleState.handbrake && isRear) return params.maxHandbrakeTorque |
| src/main.js render section | src/debug.js updatePacejkaCurve | called outside fixed accumulator | WIRED (wiring OK) | Import present; call at line 434, outside while-loop at 376 |
| src/debug.js backtick listener | plotCanvas.style.display | same listener toggles both gui and canvas | WIRED (internal to initDebug) | plotCanvas.style.display = hidden inside the backtick listener — BUT canvas ref not accessible to updatePacejkaCurve |
| src/logger.js captureFrame | vehicleState.wheelDebug[i].omega | omega values pushed at end of row | WIRED | fl.omega??0 etc. pushed at positions 33-36 |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| src/debug.js updatePacejkaCurve | plotCanvas, plotCtx | Local consts inside initDebug() | N/A — scope error | DISCONNECTED — ReferenceError at runtime |
| src/main.js HUD slipDeg | vehicleState.wheelDebug[0].sa | physics.js stepPhysics omega integrator | Yes — written each contact step | FLOWING |
| src/main.js HUD throttle/brake | vehicleState.throttle/brake | vehicle.js updateVehicle | Yes — set from key state each step | FLOWING |
| src/logger.js captureFrame omega | fl.omega ?? 0 | vehicleState.wheelDebug[i].omega set by physics.js | Yes — written each contact | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| computeLateralForce(0) = 0 | node -e import tire.js | Fy0=0 | PASS |
| computeLateralForce(0.1) > 0 (no negation) | node -e import tire.js | Fy_pos=955.8 | PASS |
| computeLongitudinalForce(0) = 0 | node -e import tire.js | Fx_zero=0 | PASS |
| computeLongitudinalForce(0.2) > 0 | node -e import tire.js | Fx_pos=999.2 | PASS |
| C-clamp: pacejkaC=2.5 equals pacejkaC=1.99 output | node -e import tire.js | both=971.8 match=true | PASS |
| physics.js critical ordering | awk frictionBudget < roadReactionTorque < totalForce.add | f=179 r=193 t=206 | PASS |
| updatePacejkaCurve call placement | awk while < call < render | while=376 call=434 render=438 | PASS |
| Logger FIELDS count | node -e count FIELDS array | 37 fields, last 4 omega | PASS |
| updatePacejkaCurve at runtime | (browser only — DOM required) | ReferenceError: plotCanvas is not defined | FAIL |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| M3-01 | 03-02 | Real wheel angular velocity integrated per wheel | SATISFIED | wheelOmega[4] integrated via omega integrator in physics.js |
| M3-02 | 03-02 | Longitudinal slip ratio from omega vs contact patch speed | SATISFIED | slipRatio = (omegaR - vx) / max(abs(omegaR), abs(vx), 0.1) |
| M3-03 | 03-01 | Pacejka lateral force with C hard-clamped [1.0, 1.99] | SATISFIED | tire.js computeLateralForce with Math.max(1.0, Math.min(1.99, params.pacejkaC)) |
| M3-04 | 03-01 | Pacejka longitudinal force: slip ratio → Fx | SATISFIED | tire.js computeLongitudinalForce with Pacejka formula |
| M3-05 | 03-02 | Friction circle coupling | SATISFIED | physics.js: sqrt(Flat^2+Flong^2) check + scale before omega integration |
| M3-06 | 03-02 | Handbrake Space reduces rear wheel Pacejka D for drift | BLOCKED | REQUIREMENTS says "reduces Pacejka D"; implementation uses maxHandbrakeTorque brake torque (CONTEXT.md D-09 design decision). Functionally achieves drift but does not match requirement literal text. |
| M3-07 | 03-03 | HUD front slip angle color-coded green<5°, orange 5-15°, red>15° | PARTIAL | Implemented with D-14 thresholds (5°/10°) per RESEARCH.md note — orange threshold is 10° not 15°. HUD element exists and colors are correct per D-14. |
| M3-08 | 03-03 | HUD throttle/brake bar | SATISFIED | thrEl and brkEl updated each render frame in main.js |
| M3-09 | 03-03 | Live Pacejka curve plot with operating-point dot per front wheel | BLOCKED | plotCanvas/plotCtx scope bug: updatePacejkaCurve will ReferenceError at runtime. Canvas DOM element exists but draw function is broken. |
| M3-10 | 03-01/03-03 | Drifting and wheelspin tunable via debug menu | SATISFIED | All 8 Pacejka sliders + maxHandbrakeTorque present in debug panel; corneringStiffness/lateralDampingCoeff sliders removed |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/debug.js | 69, 74 | const plotCanvas / const plotCtx declared inside initDebug() function body; referenced as free variables in module-scope export updatePacejkaCurve | BLOCKER | updatePacejkaCurve throws ReferenceError at runtime; M3-09 broken |
| src/physics.js | 43 | getDriveTorque returns vehicleState.throttle * params.maxBrakeTorque (3000 N·m) when throttle pressed while moving backward — should use maxReverseTorque (800 N·m) per ranger.js comment "Bug 4 fix" | WARNING | Violent jerk deceleration when switching from backward roll to throttle |
| src/physics.js | 188-202 | Omega integrator nested inside contacts loop — wheelOmega not updated while airborne; stale omega causes incorrect slip ratio spike on first landing frame | WARNING | Physics correctness issue on airborne-to-contact transition |
| src/vehicle.js | 133-136 | spinDelta derived from body velocity, not wheelOmega — wheel meshes spin wrong under wheelspin or locked braking | WARNING | Visual disconnect: wheel tires don't visually spin up during wheelspin |
| src/physics.js | 174-205 | Positive slipAngle from atan2(latVel, abs(longVel)) produces positive Flat applied via addScaledVector(wheelRight, Flat) — pushes car in same direction as slide rather than opposing it | WARNING | Lateral force sign may be inverted; car may not exhibit correct understeer/oversteer response |
| src/main.js | 28 | console.log('THREE.REVISION', THREE.REVISION) on every page load | INFO | No functional impact; noisy production console |

---

## Human Verification Required

### 1. Drift Behavior Under Handbrake

**Test:** Open index.html via local HTTP server, accelerate to ~30 km/h, hold Space while steering — does the rear end step out into a controllable drift?
**Expected:** Rear axle slides; car oversteers without instant spin-out; releasing Space allows recovery
**Why human:** Requires live driving; lateral slip physics behavior with sign-convention question from WR-02

### 2. Throttle-from-rest Wheelspin

**Test:** From rest, hold W (full throttle) — do the rear wheels visually spin faster than the car is moving forward?
**Expected:** Rear wheelOmega increases faster than forward speed; slip ratio approaches +1; car accelerates with visible wheelspin effect
**Why human:** Visual wheel spin rate is derived from wheelAngles (body velocity), not wheelOmega — WR-01 may make this invisible even if physics is correct

### 3. Pacejka Curve Plot (After CR-01 Fix)

**Test:** After fixing the plotCanvas scope bug, press backtick to open debug panel — does the Pacejka curve canvas appear? Drive into a corner — do the FL/FR operating-point dots move along the curve and change color?
**Expected:** 300x200 canvas visible at right:320px; curve draws in green (#44ff88); dots cycle green/orange/red with cornering intensity
**Why human:** Requires browser DOM and visual confirmation; cannot test programmatically

### 4. Slip Angle Color Thresholds

**Test:** Drive into progressively tighter corners and observe the SLIP HUD indicator color change
**Expected:** Green at gentle cornering (<5°), orange at moderate (5-10°), red at aggressive (>=10°)
**Why human:** Threshold values use D-14 (5°/10°) not REQUIREMENTS M3-07 (5°/15°) — need human judgment on whether this is acceptable behavior

---

## Gaps Summary

**2 gaps block phase goal achievement:**

### Gap 1 (BLOCKER) — CR-01: plotCanvas scope bug in src/debug.js

`plotCanvas` and `plotCtx` are declared with `const` inside `initDebug()` at lines 69 and 74. The exported `updatePacejkaCurve` function lives at module scope (outside `initDebug`) and references these identifiers as free variables. JavaScript does not make local function-scope variables visible to other functions at module scope — there is no closure here because `updatePacejkaCurve` is not defined *inside* `initDebug`. At runtime, every call to `updatePacejkaCurve` will throw:

```
ReferenceError: plotCanvas is not defined
```

This crashes the render loop's post-accumulator section every frame once the application starts.

**Fix required:** Promote both variables to module-level `let` declarations, assigned inside `initDebug`:

```js
// module level
let plotCanvas = null
let plotCtx = null

export function initDebug(params) {
  // ...
  plotCanvas = document.createElement('canvas')
  // ... set properties ...
  plotCtx = plotCanvas.getContext('2d')
  // ...
}

export function updatePacejkaCurve(vehicleState, params) {
  if (!plotCanvas || plotCanvas.style.display === 'none') return
  // ... rest of function ...
}
```

### Gap 2 (WARNING) — M3-06 requirement deviation: brake-torque vs Pacejka-D approach

REQUIREMENTS.md M3-06: "Handbrake (Space) **reduces rear wheel Pacejka D** for drift initiation"

Implementation (CONTEXT.md D-09): Space key applies `params.maxHandbrakeTorque` brake torque to rear wheels via `getBrakeTorque` — this causes omega to decelerate, slip ratio to go negative, and the friction circle to reduce lateral budget, enabling drift. The Pacejka D coefficient is never modified.

The functional outcome (drift development) is achieved. However the requirement specifies a specific mechanism (D reduction) that is not implemented. This is an intentional architectural decision documented in CONTEXT.md D-09 with sound physics reasoning ("slip develops naturally via the Pacejka model").

**Resolution options:**
1. Accept the deviation: add an override to this VERIFICATION.md
2. Implement the requirement literally: modify getBrakeTorque or add D-scaling when handbrake is active

If the developer judges the brake-torque approach meets the spirit of M3-06 (drift initiation), add to VERIFICATION.md frontmatter:

```yaml
overrides:
  - must_have: "M3-06: Handbrake (Space) reduces rear wheel Pacejka D for drift initiation"
    reason: "CONTEXT.md D-09 uses brake torque to build negative slip ratio naturally — achieves drift via Pacejka saturation without D modification. Mechanistically superior: avoids discontinuous D jumps; drift develops and recovers smoothly."
    accepted_by: "ledogen"
    accepted_at: "2026-05-30T00:00:00Z"
```

---

_Verified: 2026-05-30_
_Verifier: Claude (gsd-verifier)_
