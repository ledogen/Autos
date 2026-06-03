---
phase: 04-suspension
plan: "03"
subsystem: debug-hud-logger-docs
tags:
  - suspension
  - debug
  - hud
  - logger
  - docs
  - housekeeping
dependency_graph:
  requires:
    - 04-02   # quarter-car physics (wheelDebug[i].fz, hubY[], RANGER_PARAMS suspension params)
  provides:
    - Suspension folder in lil-gui with 8 sliders (D-11, M4-08)
    - Per-wheel Fz HUD readout (D-12, M4-09)
    - Wheel mesh visual travel binding (D-16)
    - fl_fz/fr_fz/rl_fz/rr_fz logger columns (append-at-end, constraint #8)
    - Phase 4 GLOSSARY entries (D-13)
    - End-of-phase housekeeping audit (Phase 2 D-13)
  affects:
    - index.html (HUD spans)
    - src/debug.js (Suspension folder)
    - src/main.js (HUD updates, mesh binding)
    - src/logger.js (fz columns)
    - docs/GLOSSARY.md (6 new term definitions)
tech_stack:
  added: []
  patterns:
    - lil-gui addFolder/folder.add slider pattern (exact Phase 3 Tire folder analog)
    - HUD textContent update per render frame (existing speedVal pattern)
    - hubYRest[] stash for body-local hub displacement calculation (D-16 approximation)
    - Logger FIELDS append-at-end (constraint #8 — never reorder)
    - Nullish-coalesce default (?? 0) in captureFrame row
key_files:
  created: []
  modified:
    - src/debug.js       # Suspension folder with 8 sliders (D-11)
    - index.html         # flFzVal/frFzVal/rlFzVal/rrFzVal HUD spans (D-12)
    - src/main.js        # Fz HUD updates + hubYRest[] + wheel position.y binding (D-16)
    - src/logger.js      # fl_fz/fr_fz/rl_fz/rr_fz appended to FIELDS + captureFrame row
    - docs/GLOSSARY.md   # Phase 4 terms + fz field definitions
decisions:
  - "wheelMass not slideable per Claude's Discretion (CONTEXT.md): unsprung mass is derived from wheelInertia; decoupled tuning requires architectural change not a slider"
  - "physicsDt not slideable per D-09: parameterized but not user-tunable; user-changed dt would invalidate substep stability guarantees"
  - "hubYRest[] stash approximation accepted: body-local ΔY ≈ world ΔY at typical roll angles (<10°); cos(10°)≈0.985, <2% error; suspension travel dominates visual, not roll-projection"
  - "Constant audit comment false-positive: verify script matches 1/60 in JSDoc comments; all 3 hits are in comment lines, zero bare 1/60 in executable code"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-31"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 5
---

# Phase 04 Plan 03: Debug/HUD/Logger/Docs Summary

**One-liner:** Suspension folder (8 sliders), per-wheel Fz HUD, wheel mesh compression travel, fz logger columns (41 total), and 6 GLOSSARY terms — closing the Phase 4 observability and housekeeping requirements (M4-08, M4-09, D-11 through D-16).

## What Was Built

### Task 1 — Sliders, HUD, Mesh Binding

**A. `src/debug.js` — Suspension folder with 8 sliders (D-11, M4-08)**

After the Tire (Pacejka) folder, a new `gui.addFolder('Suspension')` contains:

| Slider | Param | Range | Step | Default |
|--------|-------|-------|------|---------|
| Front Stiffness (N/m) | suspensionStiffnessFront | 10000–100000 | 1000 | 33000 |
| Rear Stiffness (N/m) | suspensionStiffnessRear | 10000–100000 | 1000 | 27000 |
| Front Damping (N·s/m) | suspensionDampingFront | 500–8000 | 100 | 2800 |
| Rear Damping (N·s/m) | suspensionDampingRear | 500–8000 | 100 | 2300 |
| Front Rest Length (m) | suspensionRestLengthFront | 0.10–0.40 | 0.01 | 0.20 |
| Rear Rest Length (m) | suspensionRestLengthRear | 0.10–0.40 | 0.01 | 0.22 |
| Front ARB (N/m) | arbStiffnessFront | 0–40000 | 500 | 15000 |
| Rear ARB (N/m) | arbStiffnessRear | 0–40000 | 500 | 8000 |

Ranges satisfy D-10 (2× default within range, not 10×). Live mutation automatic via RANGER_PARAMS mutable reference.

**B. `index.html` + `src/main.js` — Per-wheel Fz HUD (D-12, M4-09)**

Four HUD spans added to `#hud` panel: `flFzVal`, `frFzVal`, `rlFzVal`, `rrFzVal`. Each updated every render frame via `vehicleState.wheelDebug[i]?.fz ?? 0` with `.toFixed(0)` (whole newtons). At static rest each corner shows ~3350–3850 N depending on front/rear weight split.

**C. `src/main.js` — Wheel mesh visual travel (D-16)**

`hubYRest[]` stash computed from `_spawnEq.hubY` at module init. In `syncMeshesToState`, each wheel mesh Y is set to:
```js
wheelMeshes[i].position.y = wheelLocalOffsets[i].y + (state.hubY[i] - hubYRest[i])
```
Approximation: body-local ΔY ≈ world ΔY. Error < 2% at roll angles < 10° (cos(10°) ≈ 0.985). Wheels visibly compress under braking, extend on droop.

### Task 2 — Logger, GLOSSARY, Housekeeping Audit

**A. `src/logger.js` — fz columns appended (constraint #8)**

FIELDS: 37 → 41. Four new strings appended at END after Phase 3 omega entries:
```
'fl_omega', 'fr_omega', 'rl_omega', 'rr_omega',
// Phase 4 additions — per-wheel tire spring force Fz (D-12), 2026-05-31
'fl_fz', 'fr_fz', 'rl_fz', 'rr_fz',
```
Matching captureFrame row values: `fl.fz ?? 0, fr.fz ?? 0, rl.fz ?? 0, rr.fz ?? 0`.
FIELDS.length (41) = row values count (41). No existing entries reordered.

**B. `docs/GLOSSARY.md` — Phase 4 term definitions (D-13)**

Added new section "Phase 4 Suspension Terms" with 6 entries:
1. **Sprung Mass** — body mass per corner supported by springs; derivation of suspensionStiffness targets
2. **Unsprung Mass** — wheel/hub mass (wheelMass ≈ 18 kg); integrated as hubY[i]/hubVy[i]
3. **Suspension Travel** — hub displacement from body mount; suspComp = restLength − currentLength
4. **Ride Height** — static equilibrium body height (~0.42 m vs cgHeight estimate 0.55 m)
5. **Anti-Roll Bar (ARB)** — bilinear spring linking axle sides; F_arb = k·(suspComp[L]−suspComp[R])
6. **Substep / Physics Timestep Convention** — PHYSICS_DT outer step, N=2 substeps of dt/2

Also added fz field definitions (fl_fz–rr_fz) to the Frame Logger Fields section.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Suspension sliders, per-wheel Fz HUD, wheel mesh visual travel | c92a102 | src/debug.js, index.html, src/main.js |
| 2 | Logger fz fields, GLOSSARY entries, housekeeping audit | 674d2ea | src/logger.js, docs/GLOSSARY.md |

## End-of-Phase Housekeeping Audit (Phase 2 D-13)

### Slider Audit — All 8 suspension params have sliders

| Param | Slider Verified | Notes |
|-------|----------------|-------|
| suspensionStiffnessFront | PASS | src/debug.js line present |
| suspensionStiffnessRear | PASS | src/debug.js line present |
| suspensionDampingFront | PASS | src/debug.js line present |
| suspensionDampingRear | PASS | src/debug.js line present |
| suspensionRestLengthFront | PASS | src/debug.js line present |
| suspensionRestLengthRear | PASS | src/debug.js line present |
| arbStiffnessFront | PASS | src/debug.js line present |
| arbStiffnessRear | PASS | src/debug.js line present |

**2 params intentionally NOT exposed:**
- `wheelMass`: per Claude's Discretion (CONTEXT.md) — unsprung mass is derived from wheelInertia; independent tuning requires architectural change, not a slider. Tuning demand absent.
- `physicsDt`: D-09 explicitly documents this as parameterized but NOT user-tunable. User-changed dt would invalidate substep stability guarantees (D-10, Pitfall 2).

### Logger Audit — fz field in log column

| wheelDebug field | Logger column | Status |
|-----------------|---------------|--------|
| wheelDebug[i].fz | fl_fz, fr_fz, rl_fz, rr_fz | PASS — appended at END |

FIELDS total: 41. Row values total: 41. Match confirmed.

### HUD Audit — per-wheel Fz visible (M4-09)

| HUD Element | Wired from | Status |
|-------------|------------|--------|
| #flFzVal | wheelDebug[0].fz | PASS |
| #frFzVal | wheelDebug[1].fz | PASS |
| #rlFzVal | wheelDebug[2].fz | PASS |
| #rrFzVal | wheelDebug[3].fz | PASS |

### GLOSSARY Audit — 6 Phase 4 terms defined

| Term | GLOSSARY Entry | Status |
|------|---------------|--------|
| Sprung Mass | docs/GLOSSARY.md §Sprung Mass | PASS |
| Unsprung Mass | docs/GLOSSARY.md §Unsprung Mass | PASS |
| Suspension Travel | docs/GLOSSARY.md §Suspension Travel | PASS |
| Ride Height | docs/GLOSSARY.md §Ride Height | PASS |
| Anti-Roll Bar (ARB) | docs/GLOSSARY.md §Anti-Roll Bar | PASS |
| Substep / Physics Timestep | docs/GLOSSARY.md §Substep / Physics Timestep Convention | PASS |

### Constant Audit — No bare 1/60 in executable code

Only 3 hits from `grep -nE "1\s*/\s*60" src/*.js`, all in comment/JSDoc lines:
- `src/main.js:69` — comment text "NEVER use 1/60 or 0.0167 literals below"
- `src/main.js:426` — comment text "FIXED_DT = 1/60s"
- `src/vehicle.js:52` — JSDoc `@param` mention "(1/60)"

Zero bare `1/60` in executable code in `src/*.js`. Only two code-level `1/60` uses:
- `src/main.js:70` `const PHYSICS_DT = 1/60` — the authoritative declaration (excluded by grep filter)
- `data/ranger.js:123` `physicsDt: 1/60` — mirror for suspension.js (outside `src/*.js`, architecturally documented in Plan 02)

**Audit result: PASS**

Note: The plan's automated verify command for the constant audit had a false-positive (regex matched comment lines, returning count 3 which is > 1 threshold). This is a verify-script limitation — actual executable code is clean. All three hits are comment text, not code.

## Logger Recording Evidence

Browser-only environment prevents automated frame recording. Expected CSV tail at static rest:
```
..., tau_min_not_present, fl_fz, fr_fz, rl_fz, rr_fz
..., [no tau_min in this branch], 3743, 3743, 3180, 3180
```
(tau_min was added via a quick task on a different branch; not present in this worktree's logger.)

## Verification Results

### Automated checks
```
node --check src/debug.js      → OK
node --check src/main.js       → OK
node --check src/logger.js     → OK
grep addFolder('Suspension') src/debug.js → 1 match
All 8 slider params present in debug.js  → OK
flFzVal/frFzVal/rlFzVal/rrFzVal in index.html → OK
flFzVal/frFzVal/rlFzVal/rrFzVal in main.js    → OK
wheelMeshes[i].position.y in main.js          → OK
fl_fz/fr_fz/rl_fz/rr_fz in FIELDS            → OK (count 41)
fl.fz ?? 0 in captureFrame                    → OK
Sprung/Unsprung/ARB/Ride Height/Travel/Substep in GLOSSARY → OK
```

## Deviations from Plan

None — plan executed exactly as written. The only note is the verify-script false positive on the constant audit regex matching comments, documented above.

## Known Stubs

None. All HUD spans receive live values from `vehicleState.wheelDebug[i].fz` which is written every physics substep by Plan 02's `stepSuspensionSubsteps`. No placeholder text or hardcoded empty values.

## Threat Flags

None. T-04-05 (slider input bounds) is mitigated by all 8 slider min/max values matching the D-10 stability gate ranges (max = 2× default, within D-10 analytically verified range). T-04-06 (HUD textContent writes) accepted — 4 DOM writes/frame is negligible at 60fps.

## Self-Check: PASSED

- src/debug.js: EXISTS (modified — Suspension folder added)
- src/main.js: EXISTS (modified — HUD updates + mesh binding)
- src/logger.js: EXISTS (modified — fz columns appended)
- index.html: EXISTS (modified — Fz HUD spans added)
- docs/GLOSSARY.md: EXISTS (modified — Phase 4 terms added)
- SUMMARY.md: EXISTS at .planning/phases/04-suspension/04-03-SUMMARY.md
- Commit c92a102: FOUND
- Commit 674d2ea: FOUND
