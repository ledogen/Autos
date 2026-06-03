---
phase: 1
slug: core-driving
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-10
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual smoke test (no test runner — browser-only, no Node.js runtime) |
| **Config file** | none |
| **Quick run command** | `python3 -m http.server` then open `http://localhost:8000/index.html` |
| **Full suite command** | Work through all 5 success criteria manually (see Phase gate below) |
| **Estimated runtime** | ~5 minutes (manual) |

---

## Sampling Rate

- **After every task commit:** Visual + console check of the specific slice added
- **After every plan wave:** All 5 roadmap success criteria checked manually
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 minutes per wave

---

## Per-Task Verification Map

| Task ID | Req | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|-----|------------|-----------------|-----------|-------------------|-------------|--------|
| FOUND-01 | Opens from GitHub Pages / local HTTP with no install | — | N/A | manual-smoke | Open URL in browser, check no 404s | ❌ W0 | ⬜ pending |
| FOUND-02 | Three.js r184 importmap loads | — | N/A | manual-console | `THREE.REVISION` in console === "184" | ❌ W0 | ⬜ pending |
| FOUND-03 | stats.js FPS panel visible | — | N/A | visual | See stats panel in corner | ❌ W0 | ⬜ pending |
| FOUND-04 | Works via `python3 -m http.server` | — | N/A | manual-smoke | Run server, load page, no errors | ❌ W0 | ⬜ pending |
| FOUND-05 | GLOSSARY.md exists with all terms | — | N/A | manual-review | Read file, check all D-02 terms present | ❌ W0 | ⬜ pending |
| M1-01 | Ground plane + grid + lighting visible | — | N/A | visual | Open browser, see 3D scene | ❌ W0 | ⬜ pending |
| M1-02 | Car body + 4 wheels visible | — | N/A | visual | See box + 4 cylinders in scene | ❌ W0 | ⬜ pending |
| M1-03 | Quaternion rotation, no gimbal lock | — | N/A | manual-drive | Spin car 360° on all axes, no jitter | ❌ W0 | ⬜ pending |
| M1-04 | Fixed timestep accumulator | — | N/A | manual-console | Log physics step count per frame; 1 at 60fps | ❌ W0 | ⬜ pending |
| M1-05 | W/S throttle/brake | — | N/A | manual-drive | Press W, car accelerates forward | ❌ W0 | ⬜ pending |
| M1-06 | A/D Ackermann steer | — | N/A | manual-drive | Turn left/right; inner wheel turns sharper | ❌ W0 | ⬜ pending |
| M1-07 | Analog steer accumulation | — | N/A | manual-drive | Hold A: steer builds; release: decays to 0 | ❌ W0 | ⬜ pending |
| M1-08 | Speed-scaled steering limit | — | N/A | manual-drive | High speed → smaller max steer angle | ❌ W0 | ⬜ pending |
| M1-09 | Wheels spin at correct rate | — | N/A | visual | Wheel spin matches vehicle speed | ❌ W0 | ⬜ pending |
| M1-10 | Chase + cockpit camera, C toggle | — | N/A | manual-drive | Press C, view switches between modes | ❌ W0 | ⬜ pending |
| M1-11 | HUD speed readout in km/h | — | N/A | visual | Speed readout updates while driving | ❌ W0 | ⬜ pending |
| M1-12 | R key resets car to spawn | — | N/A | manual-drive | Press R, car teleports to spawn position | ❌ W0 | ⬜ pending |
| M1-13 | Terrain stub returns flat ground | — | N/A | manual-console | `terrain(5,5)` → `{height:0, normal:{y:1}}` | ❌ W0 | ⬜ pending |
| M1-14 | getDriveTorque stub returns number | — | N/A | manual-console | `getDriveTorque(0, state, params)` → number | ❌ W0 | ⬜ pending |
| M1-15 | Vehicle specs from data/ranger.js | — | N/A | manual-console | `RANGER_PARAMS.wheelbase` → 2.85 | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `docs/GLOSSARY.md` — first deliverable before any code; covers all D-02 terms (FOUND-05)
- [ ] `index.html` with importmap wiring Three.js r184 — required for all subsequent visual validation

*All 20 requirements are Wave 0 gaps (no existing code). The scene setup plan is the foundation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No gimbal lock through full rotation | M1-03 | Visual artifact; no test runner | Drive in circles, do barrel rolls via terrain ramps; watch for snap/jitter |
| Ackermann geometry correctness | M1-06 | Geometric correctness best seen visually | Steer at low speed; inner front wheel visually turns sharper than outer |
| Chase camera spring feel | M1-10 | Subjective feel | Camera should lag behind car smoothly, not snap |
| 60fps target on mid-range laptop | FOUND-03 | Hardware-dependent | Check stats.js panel shows ≥60fps on target hardware |

---

## Phase Gate (5 Success Criteria)

Before marking Phase 1 complete, ALL of these must be TRUE:

1. [ ] User can open `index.html` via local HTTP and see 3D scene with car + wheels on grid
2. [ ] User can drive W/S/A/D; orientation tracks correctly through 360° without gimbal lock
3. [ ] User can press R to reset car to spawn position
4. [ ] User sees live speed readout (km/h) in HUD and stable FPS counter in debug mode
5. [ ] User can toggle chase and cockpit camera modes with C

---

## Validation Sign-Off

- [ ] All tasks have visual/console verify or Wave 0 dependencies
- [ ] Sampling continuity: per-task check after every commit
- [ ] Wave 0 covers all MISSING references (docs/GLOSSARY.md, index.html)
- [ ] Phase gate: all 5 success criteria green
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
