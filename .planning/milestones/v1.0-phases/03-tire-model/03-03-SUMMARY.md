---
phase: 03-tire-model
plan: 03
subsystem: debug-ui, hud, logger, docs
tags: [tire-model, hud, debug-ui, pacejka-plot, logger, glossary]
one_liner: "Live Pacejka curve canvas overlay, slip-angle/throttle/brake HUD, Pacejka slider audit, omega logger fields, and full GLOSSARY for Phase 3 terms"

dependency_graph:
  requires:
    - "03-01 (pacejkaB/C/D/E, pacejkaBx/Cx/Dx/Ex, maxHandbrakeTorque in RANGER_PARAMS)"
    - "03-02 (vehicleState.wheelDebug[i].omega, vehicleState.wheelOmega[4], vehicleState.handbrake)"
  provides:
    - "src/debug.js: Lateral Tire (Pacejka) folder with B/C/D/E sliders"
    - "src/debug.js: Longitudinal Tire (Pacejka) folder with Bx/Cx/Dx/Ex sliders"
    - "src/debug.js: maxHandbrakeTorque slider (500-5000 N·m)"
    - "src/debug.js: Pacejka canvas overlay (300×200 px, normalized curve + FL/FR operating-point dots)"
    - "src/debug.js: backtick toggle syncs both gui panel and plotCanvas (constraint #9)"
    - "src/debug.js: export updatePacejkaCurve(vehicleState, params)"
    - "src/main.js: slip-angle HUD (D-14 thresholds 5°/10°, color green/orange/red)"
    - "src/main.js: throttle % and brake % HUD updates each render frame"
    - "src/main.js: updatePacejkaCurve called once per render frame outside fixed accumulator"
    - "index.html: slipVal, thrVal, brkVal span elements in #hud"
    - "src/logger.js: fl_omega/fr_omega/rl_omega/rr_omega FIELDS at positions 33-36"
    - "docs/GLOSSARY.md: definitions for kappa, wheelOmega, Pacejka B/C/D/E, friction circle, handbrake"
  affects:
    - "All debug panel users — corneringStiffness and lateralDampingCoeff sliders removed"
    - "Logger consumers — 37-field contract replaces 33-field contract (append-only; no break)"

tech_stack:
  added: []
  patterns:
    - "Pacejka canvas overlay: standalone <canvas> at right:320px, early-return when hidden (T-03-09)"
    - "Backtick toggle syncs two DOM elements in lockstep (constraint #9)"
    - "HUD color thresholds: D-14 values 5°/10° (not M3-07 15° value)"
    - "Logger FIELDS: append-only contract — new fields go at END only (constraint #8)"

key_files:
  created: []
  modified:
    - src/debug.js
    - src/main.js
    - index.html
    - src/logger.js
    - docs/GLOSSARY.md

decisions:
  - "D-14 thresholds used for slip-angle HUD (5°/10°) — RESEARCH.md explicitly notes D-14 takes precedence over M3-07 (15°)"
  - "plotCanvas at right:320px (Pitfall 8) — avoids overlap with lil-gui panel at right:0"
  - "updatePacejkaCurve closes over plotCanvas/plotCtx inside initDebug module scope — no global, no export of canvas ref"
  - "C hard-clamped in updatePacejkaCurve AND in tire.js (defense in depth — T-03-07)"
  - "Deferred table in GLOSSARY.md renamed from 'Phase 3/4' to 'Phase 4' now that all Phase 3 terms are defined"

metrics:
  duration: "~25 minutes"
  completed: "2026-05-30"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 5
---

# Phase 03 Plan 03: User-Facing Surface Summary

## What Was Built

Delivered the complete user-facing surface of Phase 3: Pacejka slider audit, live Pacejka curve plot, slip-angle/throttle/brake HUD, logger omega fields, and GLOSSARY updates.

**Task 1 — src/debug.js:**
- Removed `corneringStiffness` and `lateralDampingCoeff` sliders (D-08, D-16). Both params remain in `data/ranger.js` for backward compat; only the GUI controls are removed.
- Added "Lateral Tire (Pacejka)" folder with B [5-20], C [1.0-1.99], D [0.5-2.0], E [-1.0-1.0] sliders.
- Added "Longitudinal Tire (Pacejka)" folder with Bx/Cx/Dx/Ex sliders (same ranges).
- Added `maxHandbrakeTorque` slider (500-5000 N·m, step 100).
- Created 300×200 px `plotCanvas` overlay at `right:320px` (Pitfall 8 — no overlap with lil-gui).
- Extended the single backtick listener to sync both `gui.domElement.style.display` and `plotCanvas.style.display` in lockstep (constraint #9).
- Exported `updatePacejkaCurve(vehicleState, params)`: draws normalized Pacejka lateral curve over [-0.3, +0.3] rad at 200 samples; FL/FR operating-point dots colored green/orange/red at |fNorm| < 0.5 / < 0.8 / ≥ 0.8; early-returns when canvas hidden (T-03-09); C hard-clamped [1.0, 1.99] (T-03-07).

**Task 2 — src/main.js + index.html:**
- `index.html`: extended `#hud` div with `slipVal`, `thrVal`, `brkVal` spans.
- `main.js`: extended `debug.js` import to include `updatePacejkaCurve`.
- `main.js`: slip-angle HUD using `wheelDebug[0].sa`; D-14 thresholds 5°/10° (not M3-07 15°); color-coded `#00ff88` / `#ffaa00` / `#ff2222`.
- `main.js`: throttle % and brake % written to HUD each render frame.
- `main.js`: `updatePacejkaCurve(vehicleState, RANGER_PARAMS)` called once per render frame OUTSIDE the fixed-timestep accumulator (constraint #10).

**Task 3 — src/logger.js + docs/GLOSSARY.md:**
- `logger.js`: appended `'fl_omega'`, `'fr_omega'`, `'rl_omega'`, `'rr_omega'` to FIELDS at positions 33-36 (constraint #8 — append-only).
- `logger.js`: appended matching `fl.omega ?? 0` ... `rr.omega ?? 0` values at end of `captureFrame` push array.
- `logger.js`: updated header comment from 33 to 37 fields; documented Phase 3 additions.
- `GLOSSARY.md`: added 8 new term definitions: kappa, wheelOmega, Pacejka B/C/D/E, friction circle, handbrake.
- `GLOSSARY.md`: added 4 new logger field entries: fl_omega, fr_omega, rl_omega, rr_omega.
- `GLOSSARY.md`: updated frame count from 33 to 37; removed Phase 3 terms from Deferred table.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Debug panel slider audit and Pacejka canvas overlay | 6deb68e | src/debug.js |
| 2 | Wire HUD spans, updatePacejkaCurve call, slip/throttle/brake updates | e5cb148 | src/main.js, index.html |
| 3 | Append omega fields to logger and update GLOSSARY | aaa6a6b | src/logger.js, docs/GLOSSARY.md |

## Verification Results

### Task 1 — src/debug.js
All 16 automated checks passed (node -e verify):
- `removed-corneringStiffness`: slider line absent (only comments reference it)
- `removed-lateralDamping`: slider line absent (only comments reference it)
- `lateral-folder`: addFolder('Lateral Tire (Pacejka)') present
- `longitudinal-folder`: addFolder('Longitudinal Tire (Pacejka)') present
- `pacejkaB-slider`: range 5, 20, 0.5 correct
- `pacejkaC-slider`: range 1.0, 1.99 correct
- `pacejkaBx-slider`: range 5, 20 correct
- `handbrake-slider`: 500, 5000, 100 correct
- `canvas-create`, `canvas-width-300`, `canvas-right-320`: overlay geometry correct
- `backtick-syncs-canvas`: plotCanvas.style.display = hidden present
- `updatePacejkaCurve-export`: export function signature correct
- `operating-point-loop`: for (const i of [0, 1]) loop present
- `C-clamp-in-curve`: Math.max(1.0, Math.min(1.99 present

Additional acceptance checks:
- Exactly 1 backtick listener (grep -c returns 1)
- `right:320px` in cssText (Pitfall 8)
- `Math.max(1.0, Math.min(1.99` in updatePacejkaCurve body (constraint #3)

### Task 2 — index.html + src/main.js
All 14 automated checks passed:
- `slipVal`, `thrVal`, `brkVal`, `speedVal` spans present in index.html
- `updatePacejkaCurve` in import from `./debug.js`
- `updatePacejkaCurve(vehicleState` call present
- `slipDeg`, `getElementById('slipVal'/'thrVal'/'brkVal')` present
- Color hex `#00ff88`, `#ffaa00`, `#ff2222` all present
- D-14 thresholds `Math.abs(slipDeg) < 5` and `< 10` (no `< 15`)
- No invalid optional-chain assignment on LHS

Ordering check (awk): updatePacejkaCurve call appears AFTER HUD updates, OUTSIDE while-loop, BEFORE renderer.render — OK.

### Task 3 — src/logger.js + docs/GLOSSARY.md
All 22 automated checks passed:
- FIELDS array contains all 4 omega entries in fl/fr/rl/rr order
- captureFrame push array contains matching `fl.omega` ... `rr.omega` in same order
- GLOSSARY contains: Longitudinal Slip Ratio, wheelOmega, Pacejka B/C/D/E, Friction Circle, Handbrake
- GLOSSARY contains all 4 logger field names
- FIELDS array declaration line (29) < fl_omega line (41): append-only contract verified
- Header comment updated to 37 fields; Phase 3 additions documented

## Deviations from Plan

None — plan executed exactly as written.

Notes on acceptance criteria:
- `node --input-type=module` import check for `debug.js` fails at "Cannot find package 'three'" — expected browser-only behavior (Three.js is loaded via CDN importmap, not npm). All logic and exports are syntactically correct; the module cannot be Node-imported.
- The plan's `FIELDS\s*=` awk regex uses `\s` which is not supported in standard awk basic regex. With `const FIELDS` pattern the check passes (fa=29, fo=41, fa < fo is true → exits 0).

## Known Stubs

None. All user-facing features are fully wired:
- Pacejka sliders write directly to RANGER_PARAMS (live mutation)
- updatePacejkaCurve reads real wheelDebug[0/1].sa from physics
- HUD reads real vehicleState.throttle / .brake / .wheelDebug[0].sa
- Logger omega values read real wheelDebug[i].omega from physics

## Threat Flags

None. All threats from the plan's threat register are mitigated:
- T-03-07 (C slider to 2.0): Hard-clamped in updatePacejkaCurve (defense in depth alongside tire.js clamp)
- T-03-08 (FIELDS reordering): Append-only enforced; new entries at positions 33-36
- T-03-09 (canvas redraws per frame when hidden): Early return when plotCanvas.style.display === 'none'

## Self-Check: PASSED

- `src/debug.js` modified and committed: 6deb68e
- `src/main.js` + `index.html` modified and committed: e5cb148
- `src/logger.js` + `docs/GLOSSARY.md` modified and committed: aaa6a6b
- All 3 automated verify node checks: OK (16/14/22 checks each)
- Ordering constraint verified via awk: OK
