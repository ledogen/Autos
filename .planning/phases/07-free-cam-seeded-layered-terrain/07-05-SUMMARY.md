---
phase: 07-free-cam-seeded-layered-terrain
plan: 05
subsystem: terrain, ui
tags: [terrain, grid-world, pause-menu, ramp, streaming, esc-handler]

# Dependency graph
requires:
  - "src/terrain.js: TerrainSystem, setChunksVisible (this plan adds setEnabled)"
  - "src/main.js: _reseatTruckAtSpawn, computeStaticEquilibrium, getCameraMode (Plans 01/04)"
  - "data/ranger.js: rampEnabled toggle (Phase 6)"
provides:
  - "src/terrain.js: setEnabled(flag) — streaming pause/resume; setChunksVisible(flag) — hide/show without dispose"
  - "src/main.js: _gridWorldActive flag; enterGridWorld(); returnToWorld(); pause menu Esc handler"
  - "index.html: #pause-menu overlay with resume / grid world / return to world"
affects:
  - "08+ (road routing): grid world provides clean physics test surface for validation; Sierra world unchanged"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "setEnabled early-return pattern: update() no-ops when _enabled===false — streaming paused without disposing chunks"
    - "setChunksVisible: hide/show all _chunkMap meshes without dispose — instant restore on returnToWorld"
    - "Grid-world flat physics: queryContacts/queryVertexContacts use y=0 when _gridWorldActive; analytic terrain otherwise"
    - "Authoritative gate pattern: _gridWorldActive is primary gate; RANGER_PARAMS.rampEnabled is secondary debug override"
    - "Esc menu gate: getCameraMode() !== 'freecam' prevents flash-open/close on pointer-lock release (Pitfall 3)"

key-files:
  created: []
  modified:
    - src/terrain.js
    - src/main.js
    - index.html

key-decisions:
  - "Grid-world physics uses flat y=0 (not analyticHeight(0,0)) — analyticHeight returns real terrain height at origin which is not 0; flat physics surface matches the visual flat grid plane"
  - "_gridWorldActive is the authoritative ramp gate; RANGER_PARAMS.rampEnabled is a secondary debug override — both must be true for ramp contacts/visibility in grid world"
  - "Physics loop is NOT frozen while pause menu is open — truck continues to settle (CAM-02 spirit)"
  - "Free-cam Esc behavior: browser releases pointer lock first; menu only opens from chase/cockpit mode (Pitfall 3); user exits free-cam with C then presses Esc"
  - "setChunksVisible hides Sierra chunks in grid world without disposing — re-enables instantly on returnToWorld without requiring re-streaming"

requirements-completed: [TERR-06]

# Metrics
duration: ~15min
completed: 2026-06-09T01:50:49Z
---

# Phase 07 Plan 05: Pause Menu, Grid World Mode, and Ramp Relocation Summary

**Minimal Esc pause menu with grid-world flat-plane tuning mode (streaming paused, ramp rig visible) and return-to-world canonical re-seat; Phase 6 test ramp retired from Sierra terrain world**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-09T01:35:00Z
- **Completed:** 2026-06-09T01:50:49Z
- **Tasks completed:** 2 of 2
- **Files modified:** 3

## Accomplishments

### Task 1: TerrainSystem.setEnabled + _gridWorldActive + ramp gated out of Sierra world (commit `9078fab`)

**src/terrain.js:**
- Added `setEnabled(flag)` — sets `this._enabled`; `update()` early-returns when `this._enabled === false` (streaming paused, no chunk ring changes)
- Added `setChunksVisible(flag)` — iterates `_chunkMap` and sets `chunk.mesh.visible`; hides Sierra chunks without disposing them so they reappear instantly on `returnToWorld`

**src/main.js:**
- Added `let _gridWorldActive = false` module-scope flag (authoritative ramp gate, D-18/D-19)
- `rampMesh.visible = false` on initialization — ramp not present in Sierra world (D-19)
- `queryVertexContacts` ramp guard: `_gridWorldActive && RANGER_PARAMS.rampEnabled !== false` (was `rampEnabled !== false`)
- `queryContacts` ramp guard: same dual-gate pattern
- Ground contact in both query functions: flat `y=0` when `_gridWorldActive` (Rule 2 correction — see Deviations)

### Task 2: Pause-menu overlay + Esc handler + enterGridWorld/returnToWorld (commit `04201dd`)

**index.html:**
- Added `#pause-menu` overlay (display:none, position:fixed centered, dark semi-transparent panel, monospace)
- Three buttons: `#pm-resume` ("resume"), `#pm-grid` ("grid world" — EXACTLY D-18), `#pm-return` ("return to world")

**src/main.js:**
- `_gridHelper` (THREE.GridHelper 200m, 40x40 cells) — visible only in grid world
- `_gridGroundPlane` (PlaneGeometry 200x200, y=0, visual only) — visible only in grid world
- `enterGridWorld()`: `_gridWorldActive = true`; `terrainSystem.setEnabled(false)`; `setChunksVisible(false)`; show grid helper + ground plane; `rampMesh.visible = true` (if rampEnabled); seat car at origin `(0, eq.bodyY, 0)` identity quaternion zero state
- `returnToWorld()`: `_gridWorldActive = false`; hide grid + ramp; `terrainSystem.setEnabled(true)`; `setChunksVisible(true)`; `_reseatTruckAtSpawn()` (canonical Plan 04 re-seat)
- `_showPauseMenu()` / `_hidePauseMenu()` helpers
- Button click listeners: `pm-resume -> _hidePauseMenu`, `pm-grid -> enterGridWorld`, `pm-return -> returnToWorld`
- Esc `keydown` listener: `getCameraMode() !== 'freecam'` gate — toggles menu visibility (Pitfall 3 compliance)

## Task Commits

1. `9078fab` — feat(07-05): setEnabled + _gridWorldActive + ramp gated out of Sierra world
2. `04201dd` — feat(07-05): pause-menu overlay + Esc handler + grid world / return to world

## Files Created/Modified

- `src/terrain.js` — `setEnabled(flag)`, `setChunksVisible(flag)`; `update()` early-return when disabled
- `src/main.js` — `_gridWorldActive`, flat-ground physics gate, ramp guards, `enterGridWorld`, `returnToWorld`, Esc handler, grid helper, menu helpers
- `index.html` — `#pause-menu` overlay with styled buttons

## Decisions Made

- Grid-world physics uses flat y=0 for contacts (not `analyticHeight(0,0)`): the analytic height at origin returns the real terrain height (could be 50m+); placing the car at `eq.bodyY` ~0.55m above a 50m analytic ground would cause it to fall. Flat y=0 matches the visual `_gridGroundPlane`.
- `_gridWorldActive` is the authoritative ramp gate with `RANGER_PARAMS.rampEnabled` as a secondary debug toggle — both must be true for the ramp to be present. This allows the existing debug panel "Ramp Visible" slider to work within grid world without enabling the ramp in Sierra world.
- Physics loop is not frozen while pause menu is open — keeps the truck settling naturally.
- Free-cam Esc behavior: user must exit free-cam (C key) before Esc opens the menu. The second-Esc-after-pointer-release path is NOT wired — the menu is only reachable from chase/cockpit mode (Pitfall 3 compliance, RESEARCH Pitfall 3).

## Deviations from Plan

### Auto-added Issues

**1. [Rule 2 - Missing Critical Functionality] Flat ground physics in grid world**
- **Found during:** Task 2 implementation analysis
- **Issue:** `enterGridWorld` places the car at `eq.bodyY` ~0.55m above y=0. However, `queryContacts` and `queryVertexContacts` use `analyticHeight(x, z)` for ground contact, which returns the real terrain height at the car's XZ position. At origin with `lone-pine` seed, this could be 50m+; the car would be well above the terrain surface and free-fall through the flat visual grid.
- **Fix:** Added `_gridWorldActive` conditional in both `queryContacts` and `queryVertexContacts`: use `terrainH = 0` (flat y=0) and flat `{x:0,y:1,z:0}` normal when `_gridWorldActive`, otherwise use `analyticHeight/analyticNormal` as before.
- **Files modified:** `src/main.js`
- **Commit:** `04201dd`

## Known Stubs

None. All buttons are wired to real handlers. `enterGridWorld` and `returnToWorld` fully wire streaming pause/resume, ramp visibility, and car placement. Grid-world physics uses real flat-ground contacts.

Free-cam Esc second-press path: the user cannot open the pause menu from free-cam directly. This is intentional (Pitfall 3 compliance) — documented in Decisions Made above.

## Human Verification Required

The plan marks `autonomous: false`. The human-check items from Tasks 1 and 2 require browser verification:

**Task 1 (D-19):** In Sierra terrain world, the ramp/plateau is invisible and the truck cannot collide with it.

**Task 2 (D-17/18):** From chase view, press Esc — minimal pause menu appears with "resume", "grid world", "return to world". Click "grid world": car goes to flat grid with ramp rig, terrain stops streaming. Roll the truck off the ramp to test rollover. Click Esc -> "return to world": terrain resumes, car re-seats at canonical spawn. In free-cam, Esc releases mouse without flashing the menu.

## Threat Surface Scan

T-07-05-DOM (mitigated per plan): pause-menu overlay is authored static HTML with fixed labels; no user string is injected into it (no innerHTML from input). Button handlers call fixed functions only. No XSS surface.

T-07-05-STATE (accepted per plan): `_gridWorldActive` is an internal boolean; mismatched toggles only affect view state — chunks are hidden not disposed, streaming re-enables idempotently.

No new threat surface beyond plan's threat register.

## Self-Check: PASSED

- `src/terrain.js` — FOUND; contains `setEnabled`, `setChunksVisible`, early-return in `update()`
- `src/main.js` — FOUND; contains `_gridWorldActive`, `enterGridWorld`, `returnToWorld`, `Escape`, `setEnabled`, `getCameraMode() !== 'freecam'`
- `index.html` — FOUND; contains `pause-menu`, `grid world` (exact label), `return to world`, `pm-resume`, `pm-grid`, `pm-return`
- Commit `9078fab` — FOUND in git log
- Commit `04201dd` — FOUND in git log

---
*Phase: 07-free-cam-seeded-layered-terrain*
*Tasks completed: 2/2 (human browser verification required -- plan marked autonomous: false)*
*Completed: 2026-06-09*
