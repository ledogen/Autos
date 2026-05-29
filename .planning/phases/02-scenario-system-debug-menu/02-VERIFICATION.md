---
phase: 02-scenario-system-debug-menu
verified: 2026-05-29T06:09:04Z
status: gaps_found
score: 2/4 must-haves verified
overrides_applied: 0
gaps:
  - truth: "User can load a JSON scenario file in the browser, run it headlessly through the same physics step function used for live play, and download a per-frame log (position, velocity, quaternion, angular velocity, per-wheel data)"
    status: failed
    reason: "No scenario runner exists in the codebase. The IC loader (openInitialCondition) only sets initial vehicle state from JSON — it does not read a per-frame input sequence, does not execute physics steps headlessly, and does not produce a downloadable log from a scripted run. The frame logger is live-play-only. Requirements M2-01 (JSON scenario file format), M2-02 (scenario runner executes scripted inputs), and M2-04 (scenario runner accessible from browser) are unimplemented. Context document D-01 explicitly excluded headless replay from scope, but this conflicts with the ROADMAP success criteria which are the verification contract."
    artifacts:
      - path: "src/logger.js"
        issue: "openInitialCondition only applies position/velocity/quaternion/angularVelocity from JSON — no input sequence, no headless run, no triggered download"
      - path: "src/main.js"
        issue: "Game loop has no scenario runner path — only live interactive play"
    missing:
      - "A scenario runner that reads a JSON file with initial conditions AND per-frame input sequences (throttle/brake/steer per tick)"
      - "Headless execution path that calls stepPhysics in a tight loop without rAF, consuming the scenario inputs"
      - "Triggered log download at the end of headless run (or equivalently: the existing logger wired to the headless loop)"
      - "Browser UI to load the scenario file and start the headless run (button or key press)"
  - truth: "User can replay the same scenario file twice and receive identical logs (deterministic physics confirmed)"
    status: failed
    reason: "No scenario replay mechanism exists. Determinism cannot be confirmed without a headless runner. This is downstream of the scenario runner gap — no runner means no replay, means no determinism verification."
    artifacts: []
    missing:
      - "Scenario runner (prerequisite — see gap above)"
      - "Documented or tested evidence that two identical runs produce bit-identical JSON logs"
---

# Phase 2: Scenario System + Debug Menu Verification Report

**Phase Goal:** The user can record scripted driving runs, download JSON logs of per-frame physics state, and tune every physics constant live while driving via a lil-gui debug panel — without restarting the simulation.
**Verified:** 2026-05-29T06:09:04Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can load a JSON scenario file in the browser, run it headlessly through the same physics step function used for live play, and download a per-frame log | FAILED | No scenario runner exists. `openInitialCondition` only sets initial state; no headless execution path, no input sequence processing. Context doc D-01 explicitly excluded this. |
| 2 | User can press backtick to open/close the debug menu overlay and see sliders for all tunable physics constants | VERIFIED | `debug.js` line 51 checks `e.key === '\`'`; 10 sliders confirmed present (3 Phase 1 + 7 D-08); `gui.domElement.style.display` toggled. |
| 3 | User can move a debug slider (e.g. friction coefficient) while driving and observe the car behavior change immediately with no restart | VERIFIED | `initDebug(RANGER_PARAMS)` at `main.js:350` passes the live RANGER_PARAMS object by reference. `frictionCoeff` slider at `debug.js:37` writes directly to the same object read by `stepPhysics` each tick. No restart mechanism needed. |
| 4 | User can replay the same scenario file twice and receive identical logs (deterministic physics confirmed) | FAILED | No scenario runner exists; no replay mechanism; no determinism verification possible. |

**Score: 2/4 truths verified**

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| M2-01 | JSON scenario file format: initial conditions, per-frame input sequences, duration | BLOCKED | No scenario file format defined. IC loader handles initial conditions only; no input sequence, no duration field. |
| M2-02 | Scenario runner executes scripted inputs using same physics step function as live loop | BLOCKED | No scenario runner implemented anywhere in `src/`. |
| M2-03 | JSON log output captures per-frame state: position, velocity, quaternion, angular velocity, per-wheel data | SATISFIED | `src/logger.js` FIELDS constant has 33 entries covering all required state; `captureFrame` pushes 33 values per row; wheelDebug written by `physics.js` per wheel per step. |
| M2-04 | Scenario runner accessible from browser (load scenario file, run, download log) | BLOCKED | No browser-accessible scenario runner exists. IC loader opens a file picker but does not run physics. |
| M2-05 | lil-gui debug menu (backtick toggle) exposes all tunable physics constants | SATISFIED | 10 sliders present: lateralDampingCoeff (unused), tireStiffness, tireDamping, mass, frictionCoeff, maxDriveTorque, maxBrakeTorque, bodyContactStiffness, bodyContactDamping, corneringStiffness. rollingResistanceCoeff absent (0 grep hits). D-09/D-10 forbidden fields absent. |
| M2-06 | Debug menu parameter changes take effect immediately with no restart | SATISFIED | RANGER_PARAMS passed by reference to `initDebug`; slider writes go directly to the live object consumed by `stepPhysics`. |

**M2-01, M2-02, M2-04: BLOCKED — scenario system not implemented.**
**M2-03, M2-05, M2-06: SATISFIED.**

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/logger.js` | Frame logger module — toggleRecording, captureFrame, openInitialCondition | VERIFIED | All three exports present and substantive. FIELDS = 33 entries (t..rr_c). _downloadLog uses createObjectURL + anchor.click. openInitialCondition wraps parse in try/catch. |
| `src/physics.js` | wheelDebug write — fn, fy, sa, c per wheel per step | VERIFIED | Lines 94-95 zero `wheelDebug[i]` at top of wheel loop; lines 156-160 write fn/fy/sa/c inside contacts loop, guarded by `if (vehicleState.wheelDebug)`. |
| `src/main.js` | Game loop hooks — simTime, captureFrame call after stepPhysics, IC loader trigger | VERIFIED | `simTime` at line 34; `captureFrame(simTime, vehicleState, vehicleState.wheelDebug)` at line 395; `\` → toggleRecording at line 355; Ctrl+I → openInitialCondition at line 356. |
| `src/debug.js` | Expanded lil-gui panel with all D-08 sliders and Logger hint | VERIFIED | 10 `gui.add(params, ...)` calls confirmed; corneringStiffness labeled with 'Phase 2 placeholder'; lateralDampingCoeff labeled '(unused)'; `disable()` called on Logger hint; rollingResistanceCoeff absent. |
| `docs/GLOSSARY.md` | Frame Logger Fields section with all 33 field definitions | VERIFIED | "## Frame Logger Fields" section present; {fl/fr/rl/rr}_fn, _fy, _sa, _c all documented with units and sign conventions. |
| scenario runner | Headless physics execution from JSON scenario file | MISSING | No file in `src/` contains scenario runner, headless runner, or input sequence processor. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `main.js` game loop while block | `logger.js captureFrame` | called after `stepPhysics` each fixed step | WIRED | `main.js:393-395`: stepPhysics → simTime += FIXED_DT → captureFrame(simTime, ...) → accumulator -= FIXED_DT |
| `physics.js` per-wheel loop | `vehicleState.wheelDebug[i]` | direct write inside wheel loop | WIRED | `physics.js:94-95` (zero at top), `physics.js:156-160` (write inside contacts) |
| `main.js` IC loader trigger | `logger.js openInitialCondition` | keydown 'i' + ctrlKey | WIRED | `main.js:356`: `if (e.key === 'i' && e.ctrlKey) openInitialCondition(vehicleState)` |
| `debug.js` frictionCoeff slider | `RANGER_PARAMS.frictionCoeff` | params reference passed from main.js | WIRED | `initDebug(RANGER_PARAMS)` at `main.js:350`; `gui.add(params, 'frictionCoeff', ...)` at `debug.js:37` |
| `debug.js` mass slider | `RANGER_PARAMS.mass` | params reference | WIRED | `gui.add(params, 'mass', ...)` at `debug.js:36` |
| scenario file → headless runner | `stepPhysics` | (not implemented) | NOT_WIRED | No scenario runner exists to make this link |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `logger.js captureFrame` | `vehicleState.wheelDebug[i].fn` | `physics.js:157` writes Fn from `computeNormalForce` inside contacts loop | Yes — Fn is computed from real compression depth | FLOWING |
| `debug.js` frictionCoeff slider | `RANGER_PARAMS.frictionCoeff` | lil-gui writes directly to params object; `computeLateralForce(0, Fn, params)` in `physics.js:148` reads `params.frictionCoeff` | Yes — direct reference mutation | FLOWING |

---

## Behavioral Spot-Checks

Step 7b: SKIPPED — requires running browser; sim has no CLI/server entry point. All checks require loading `index.html` via HTTP and interacting in-browser.

---

## Probe Execution

No probes defined for this phase. SKIPPED.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/debug.js` | 42-43 | "placeholder" in comment and slider label | INFO | Intentional per D-12 — corneringStiffness is documented as a Phase 2 placeholder to be replaced by Pacejka in Phase 3. Not a debt marker; it is per-plan labeling. |
| `src/main.js` | 39 | "placeholder" in section comment | INFO | Section header comment "Vehicle state placeholder" predates Phase 2. Not a debt marker for any unfinished work — vehicleState is fully initialized. |

No TBD, FIXME, or XXX debt markers found in any Phase 2-modified file.

---

## Human Verification Required

### 1. Debug Slider Live Effect

**Test:** Open `index.html`, start driving, open debug panel (backtick), move Friction Coeff slider from 0.9 to 0.1 while driving.
**Expected:** Car visibly slides more on same steering input; no restart; returning slider to 0.9 restores grip.
**Why human:** Cannot verify behavioral change programmatically without running the sim.

### 2. Frame Logger Record / Download

**Test:** Press `\` while driving, drive for 3-5 seconds, press `\` again.
**Expected:** Browser auto-downloads `rangersim-log-{timestamp}.json`; file has `fields` array (33 entries, first `t`, last `rr_c`) and `frames` array with non-zero `fl_fn`, `fl_fy`, `fl_sa`, `fl_c` values for frames recorded while on ground.
**Why human:** Download behavior and file inspection require running the browser.

### 3. IC Loader Error Handling

**Test:** Press Ctrl+I, select a non-JSON file (e.g., a `.txt` file).
**Expected:** `console.error('[logger] Failed to parse IC file: ...')` in browser console; sim continues without crash.
**Why human:** Requires running the browser and observing the console.

---

## Gaps Summary

**Root cause:** The Phase 2 context document (02-CONTEXT.md, decision D-01) explicitly descoped headless deterministic replay before planning began: "No headless deterministic replay. The scenario system is two simpler tools: initial condition loader + frame logger." The plans were written to this descoped spec.

However, the ROADMAP Success Criteria — which are the authoritative verification contract — require:
- SC#1: headless execution of scripted scenario through `stepPhysics`
- SC#4: deterministic replay producing identical logs

These two success criteria are directly contradicted by D-01 and were never implemented. The three plans instead delivered a frame logger (SC#3 log format satisfied via M2-03), an IC loader (partial M2-04 — file loading exists but not scenario execution), and debug panel expansion (SC#2, SC#3 debug menu, M2-05, M2-06).

**What is missing:**
1. A JSON scenario file format that includes: `{ initialConditions: {...}, inputs: [{throttle, brake, steer}, ...], duration: N }` (M2-01)
2. A scenario runner function that applies inputs frame-by-frame through `stepPhysics` in a tight loop (M2-02)
3. Browser UI (button/key) to load a scenario file and trigger the headless run, then download the resulting log (M2-04)
4. Evidence of deterministic output when the same file is run twice (SC#4)

**What is working:** M2-03 (log format), M2-05 (debug sliders), M2-06 (live param mutation), SC#2 (backtick toggle), SC#3 (immediate slider effect).

---

_Verified: 2026-05-29T06:09:04Z_
_Verifier: Claude (gsd-verifier)_
