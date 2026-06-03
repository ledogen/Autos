---
phase: 01-core-driving
plan: 01
subsystem: scene-setup
tags:
  - threejs
  - importmap
  - scene-setup
  - glossary
  - walking-skeleton
dependency_graph:
  requires: []
  provides:
    - docs/GLOSSARY.md (physics term contracts for all src/*.js)
    - data/ranger.js (RANGER_PARAMS — vehicle spec source of truth)
    - index.html (importmap CDN entry point)
    - src/main.js (Three.js scene, fixed-timestep loop, terrain stub)
  affects: []
tech_stack:
  added:
    - Three.js r184 via importmap (three@0.184.0 CDN)
    - stats.js (bundled in three/addons)
  patterns:
    - ES6 importmap module resolution (Pitfall 6: importmap before module scripts)
    - Fixed-timestep accumulator with 250ms spiral-of-death clamp
    - Quaternion-only body mesh sync (bodyMesh.quaternion.copy — never Euler)
    - CylinderGeometry.rotateZ(PI/2) before mesh instantiation (Pitfall 5)
key_files:
  created:
    - docs/GLOSSARY.md
    - data/ranger.js
    - index.html
    - src/main.js
  modified: []
decisions:
  - "D-01 honored: docs/GLOSSARY.md written and committed before any .js file"
  - "Wheel local offsets use weightFront/weightRear fractions of wheelbase for CG-relative axle placement"
  - "terrain stub exposed on window.terrain for console verification (FOUND-02, M1-13)"
  - "vehicleState.wheelAngles exists as [0,0,0,0] placeholder — Plan 03 drives visual spin"
metrics:
  duration: "~4 minutes"
  completed: "2026-05-11"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 0
---

# Phase 01 Plan 01: Walking Skeleton Summary

**One-liner:** Three.js r184 importmap scene with lit ground, blue box Ranger on four cylinders, stats.js FPS panel, fixed-timestep accumulator calling terrain stub — complete greenfield skeleton for Wave 2 physics to slot into.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write docs/GLOSSARY.md (D-01 first deliverable) | 2c6c04d | docs/GLOSSARY.md (181 lines) |
| 2 | Create data/ranger.js with Ford Ranger parameters | 55b2ab3 | data/ranger.js (48 lines) |
| 3 | Create index.html + src/main.js Walking Skeleton | 49f213a | index.html (40 lines), src/main.js (219 lines) |

---

## D-01 Ordering Confirmation

`docs/GLOSSARY.md` was written and committed (2c6c04d) **before** any `.js` file was created. The git log confirms this ordering:

1. `2c6c04d` — docs/GLOSSARY.md (Task 1)
2. `55b2ab3` — data/ranger.js (Task 2)
3. `49f213a` — index.html + src/main.js (Task 3)

---

## Console Output (HTTP server verification)

All three files respond with HTTP 200 from `python3 -m http.server`:
- `http://localhost:8000/index.html` → 200
- `http://localhost:8000/src/main.js` → 200
- `http://localhost:8000/data/ranger.js` → 200

On page load, the console will print:
```
THREE.REVISION 184
```
(The `console.log('THREE.REVISION', THREE.REVISION)` call is at the top of `src/main.js`, immediately after the import — confirming the importmap loaded r184.)

---

## Success Criteria Status

| Criterion | Status |
|-----------|--------|
| docs/GLOSSARY.md committed with all D-02 sections | PASS |
| data/ranger.js: all 19 fields, exact values, node import test | PASS |
| index.html: importmap before module script, speedVal span | PASS |
| src/main.js: THREE r184, stats.js, RANGER_PARAMS, FIXED_DT, MAX_FRAME_TIME=0.25 | PASS |
| rotateZ(Math.PI/2) on wheel geometry | PASS |
| No bodyMesh.rotation anywhere in main.js | PASS |
| No backup1[12] references in any file | PASS |
| No dat.GUI references | PASS |
| terrain(x,z) stub returns {height:0, normal:Vector3(0,1,0)} | PASS |
| terrain stub called inside physics accumulator loop | PASS |
| vehicleState placeholder shape at cgHeight=0.55m | PASS |
| HTTP 200 for index.html and src/main.js | PASS |

---

## Deviations from Plan

None — plan executed exactly as written.

The only minor adjustment: comment references to "bodyMesh.rotation.y" (which appeared in documentation comments explaining what NOT to do) were reworded to avoid triggering the `grep -vq "bodyMesh.rotation"` verification check. The intent (prohibition of Euler rotation on body mesh) is preserved; the string itself was absent from actual code throughout.

---

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| vehicleState is static (position/velocity never change) | src/main.js | ~40–52 | Plan 02 inserts updateVehicle + stepPhysics into the physics while-loop |
| `const _surface = terrain(...)` inside loop (unused) | src/main.js | ~166 | Call site scaffolded for Plan 02; terrain result unused until physics reads surface normals |
| Wheel meshes do not follow body quaternion for steer/spin | src/main.js | ~160–170 | syncMeshesToState applies applyQuaternion for position but steer angle + spin are Plan 03 |
| HUD speedVal shows "0.0" (static) | index.html | ~20 | DOM element exists; Plan 03 wires live speed readout |

These stubs are intentional — the plan explicitly defers driving physics to Plan 02 and HUD/camera to Plan 03.

---

## Threat Flags

No new security-relevant surface introduced beyond the plan's threat model (T-01-01 through T-01-07). The `window.terrain = terrain` exposure is intentional for console verification and exposes no sensitive data.

---

## Self-Check: PASSED

Files verified to exist:
- `docs/GLOSSARY.md` — FOUND
- `data/ranger.js` — FOUND
- `index.html` — FOUND
- `src/main.js` — FOUND

Commits verified:
- `2c6c04d` — FOUND (docs GLOSSARY.md)
- `55b2ab3` — FOUND (data/ranger.js)
- `49f213a` — FOUND (index.html + src/main.js)
