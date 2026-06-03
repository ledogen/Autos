---
id: FEAT-02
type: feature
status: open
opened: 2026-06-03
---

# FEAT-02: Flat-ground toggle in debug panel (disable procedural terrain)

## Request

A toggle in the debug panel (Terrain folder) to switch between procedural terrain and flat ground. Useful for debugging physics in isolation, testing suspension behavior, or just driving without the noise of terrain geometry. The terrain amplitude slider already exists; this is a harder toggle — flat grid, no chunk geometry.

## Behavior spec

- **Terrain ON (default):** current behavior — chunks generated, bilinear height/normal query active, ramp toggle available.
- **Terrain OFF:** physics falls back to `y = 0, normal = (0,1,0)` flat ground. Terrain mesh chunks are hidden (or disposed). A flat infinite grid visual is shown instead (the original Phase 1 grid, or just the existing `THREE.GridHelper` that's already in the scene).

User accepts: "I expect some glitching if the terrain change moves through the car." A car teleport to the terrain surface at toggle-on is nice-to-have but not required.

## Implementation approaches

### Option A — `terrainEnabled` param flag (simpler, recommended)

1. Add `terrainEnabled: true` to `data/ranger.js`.
2. In `src/main.js` `queryContacts` and `queryVertexContacts`: wrap all chunk-based queries in `if (RANGER_PARAMS.terrainEnabled !== false)`. When false, fall through to flat-ground return: `{ height: 0, normal: {x:0,y:1,z:0} }`.
3. In `src/terrain.js` or `src/main.js`: when toggled off, set all chunk meshes invisible (`terrain.setVisible(false)` or just iterate chunks). The `GridHelper` flat grid (already in scene from Phase 1) becomes visible again, OR add a new one.
4. In `src/debug.js` Terrain folder: add `gui.add(params, 'terrainEnabled').name('Terrain On').onChange(v => { terrain.setMeshesVisible(v); flatGrid.visible = !v })`.
5. Optional: on toggle-to-ON, call a probe to find terrain height under the car and teleport: `vehicleState.position.y = terrain.sampleHeight(x, z) + cgHeight + safetyMargin`.

### Option B — Full stage reload

On toggle change, `window.location.reload()` with a URL param `?terrain=0`. main.js reads the param on init and skips TerrainSystem construction entirely. Avoids runtime state issues but adds a reload delay and loses current driving state.

**Recommendation: Option A.** The terrain mesh visibility and physics fallback can be toggled cleanly at runtime. The brief glitch when the car is mid-air over terrain geometry is acceptable.

## Files affected

- `data/ranger.js` — add `terrainEnabled: true`
- `src/main.js` — terrainEnabled guard in queryContacts / queryVertexContacts; flat grid visibility
- `src/terrain.js` or `src/main.js` — chunk mesh visibility control method
- `src/debug.js` — Terrain folder: toggle boolean + onChange callback

## Notes

- The `rampEnabled` toggle (FEAT-06-03) is the pattern to follow for this — it's the same guard-and-callback approach
- If the car is below terrain surface when toggling terrain OFF, the ground constraint will immediately pop it to y=cgHeight — this is the "glitch" the user accepts
- Consider whether TerrainSystem worker should pause generation when disabled (nice-to-have — avoids background chunk builds for nothing)
