# Phase 7: Free-Cam + Seeded Layered Terrain - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 delivers three foundational systems for milestone v1.1 "Mountains & Roads":

1. **World-seed foundation** — a single `worldSeed` drives all procedural generation; `seedFor(domainTag, ...coords)` derives independent sub-seed streams; settable via `?seed=` URL param (string or int) and an editable debug-panel field; changing it regenerates the world deterministically without a full page reload. HARD RULE: every generator is a pure function of `(worldSeed, world coords)` — no chunk-load-order, frame-timing, or visit-history dependence.
2. **Three-layer Sierra terrain** — coarse landform (escarpments + valleys) + fine suspension-texture layer + low-frequency regional-roughness modulator, replacing today's fixed 3-octave simplex, exposed through one unified `height(x,z)` (and its normal) shared by the Web Worker mesh build and the physics sampler.
3. **Free-fly dev camera** — a decoupled fly mode added to `camera.js`, shipped FIRST so all terrain tuning is observable from the air.

**In scope:** the seed system, the layered height function + its calibration UI, the free-cam, a spawn/regenerate re-seating flow, and a minimal Esc pause menu with a flat "grid world" tuning mode.

**Out of scope (own phases):** road routing/splines (Phase 8), road surface mesh + carve (Phase 9), POI anchors + pothole stretch (Phase 10). Roads do not exist in Phase 7 — only the *seams* that let Phase 8 plug in (road-anchored spawn).

</domain>

<decisions>
## Implementation Decisions

### Free-Fly Camera (CAM-01/02/03)
- **D-01:** Enter free-cam with **`Shift+C`**. Exit with **`C` or `Shift+C`** (both exit when already in free-cam). `C` alone still cycles chase↔cockpit when NOT in free-cam.
- **D-02:** Look = **pointer-lock FPS mouse-look**. **`Esc` releases the pointer lock ONLY and stays in free-cam** (so the lil-gui panel is usable for slider tuning); click the canvas to re-capture and resume flying from the same spot. (Browser forces Esc to release pointer-lock — we work *with* that, not against it.)
- **D-03:** Move = **WASD flies along the camera look direction** AND **Space = up / Ctrl = down** explicit vertical (both schemes). **Shift held = speed boost.**
- **D-04:** On entry, the free-cam **spawns a couple meters directly above the car** so it's never confusing where you are. The truck idles with zero input while flying (CAM-02). Returning to chase has **no snap/jump** (CAM-03).
- **D-05:** While free-cam is active, WASD routes to the **camera**, not the truck.

### Sierra Terrain Target & Calibration (TERR-01..06)
- **D-06:** Calibrate the coarse terrain to the statistics of `references/km elev ref.png`: **~600–700 m relief over ~10–15 km**, two-scale structure — coarse undulation (±100–200 m, ~0.5–1 km wavelength) plus **occasional steep ridge faces (~40–60% grade, ~300 m wide)**. Match the *statistics*, do NOT import the finite profile — the world stays infinite & procedural.
- **D-07:** Target vibe = **drivable mountain-pass country**, NOT alpine summits. Terrain must be steep enough to justify Phase 8 switchbacks but **never undriveable** — switchbacks exist to keep the *road* at a mellow grade across relief, not to crest huge peaks. The whole world should feel like the reference transect (where a road would actually go).
- **D-08:** All three layers get **live debug sliders**: coarse (amplitude, wavelength/frequency, octaves, ridge sharpness), fine (amplitude, frequency), regional roughness (strength, scale).
- **D-09:** Slider apply = **live-on-drag, debounced (~100–200 ms after movement stops)** because coarse changes re-run the Worker for every loaded chunk; amplitude-only stays an instant cheap Y-rescale (existing `rebuildAllChunks` path).
- **D-10:** Fine-layer suspension-texture aggressiveness at the default = **Claude's discretion** — pick a value that noticeably unsettles the truck on open ground at speed; fully slider-tunable so the user can dial it in.

### World Seed & Regeneration (SEED-01..05)
- **D-11:** Default world seed (when no `?seed=` is given) = **`"lone-pine"`** (on-theme with the Eastern Sierra reference).
- **D-12:** **No hard freeze of coarse params.** "Lock" means: by P7 end, **commit a sensible default coarse param set into the data file** so (a) a bare seed is deterministic & shareable (SEED-01/03) and (b) Phase 8 has a stable terrain to route over. The sliders stay live forever (anyone in the debug menu wants to change things). Changing coarse *shape* after Phase 8 is allowed but obliges re-checking that the roads still switchback well (roads are pure functions and re-route automatically — no data corruption, just re-validation). **No export/capture button** — when the user likes the look, they report values or read them off-screen and the agent writes them into the data file by hand.
- **D-13:** Changing the seed in the debug panel regenerates the world **without a full page reload** (success criterion 2). Coarse-param slider changes also trigger regeneration (debounced per D-09).

### Spawn & Regenerate Behavior
- **D-14:** A **single canonical spawn function returns `{position, heading}`**, used for both initial load and every regenerate.
- **D-15:** On **any regenerate (seed change OR coarse-param change)**, teleport the truck to the **spawn point**, ground-probe the new `height(x,z)` there, seat it at ride height, and zero velocity — do NOT re-ground it where it happens to be idling (avoids dropping it onto a steep face / off-road / buried). Free-cam is unaffected (it flies free).
- **D-16:** The spawn must be **on a road, facing down the road** (oriented to the road tangent), never mid-slope. **Phase 7 seam:** the spawn function resolves to a terrain-only, low-slope point (no roads exist yet); **Phase 8 swaps the resolver** to "probe nearest road node + tangent heading" so the car always spawns on the road. Same call site — design it road-aware now, fill it in Phase 8. (Don't hope a road crosses a fixed spawn; derive spawn FROM the road graph.)

### Grid World & Pause Menu (new, supports the calibration workflow)
- **D-17:** Add a **simple Esc pause menu**. `Esc` opens it from chase/cockpit; in free-cam the first `Esc` releases the mouse (browser-forced) and the menu is reachable from there. Keep it minimal / dev-aesthetic.
- **D-18:** The menu has an option labeled exactly **"grid world"** → takes the car to a **flat-ground grid world** (flat plane + dev grid, car at origin, **terrain streaming paused**) for clean physics/suspension tuning. A **"return to world"** option brings you back and re-seats the car at the spawn point.
- **D-19:** The Phase 6 **test ramp/plateau props retire from the Sierra terrain world** and move into **grid world** as the controlled rollover-test rig (so they don't clip into / clutter natural slopes).

### Terrain Architecture & Streaming
- **D-20:** **Full replacement** of the current fixed 3-octave simplex (the inline `WORKER_SOURCE` FBM in `src/terrain.js`, currently seeded by `random()=>0.5`) with the new seeded coarse+fine+regional height function. **One unified `height(x,z)`** for Worker mesh + physics sampler — no second/fallback height path. (Height-agreement is an exit gate, see Constraints.)
- **D-21:** While free-cam is active, the **chunk ring centers on the CAMERA** (terrain streams wherever you fly); it reverts to the truck on exit. Fast Shift-boost flying may outrun the 2-builds/frame loader so terrain pops in — acceptable for a dev cam.

### Claude's Discretion
- Fine-layer suspension-texture default aggressiveness (D-10).
- Free-cam fly speed (m/s) and Shift-boost multiplier values.
- **`height(x,z)` architecture** — analytic direct-sample vs bilinear-of-chunk. Left to research/planner, constrained by the height-agreement exit gate and the current physics behavior (`sampleHeight` returns 0 when a chunk isn't loaded). Worth resolving whether physics should call the analytic height directly to remove the unloaded-chunk gap.
- `seedFor()` hashing implementation and the string→32-bit-int hash (blueprint pre-decided "accept string or int"; the math is the planner's).
- Pause-menu / grid-world visual styling (keep minimal).

### Reviewed Todos
- **BUG-06 (`bug-chase-cam-jitter.md`)** — reviewed, **not folded**. Minor chase-cam jitter (unsmoothed `lookAt` target in `camera.js`). Adjacent because Phase 7 heavily edits `camera.js`, but it's a chase-path bug, not free-cam scope. Flagged so the planner *may* opportunistically apply the documented fix (smoothed `_smoothLookAt` lerp) while already in the file — not a Phase 7 requirement.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Calibration target (REQUIRED)
- `references/km elev ref.png` — **REQUIRED.** Google Earth elevation profile, ~13.3 km transect, 1,822 m→2,460 m (~640 m relief). The coarse terrain's amplitude/wavelength/octaves/ridge-sharpness MUST be calibrated to its statistics (see D-06/D-07). The user may later add a road-elevation profile and/or larger-peak context to `references/` — optional, primarily for Phase 8 max-grade tuning.

### Milestone & phase intent
- `.planning/ROADMAP.md` — Phase 7 goal, success criteria, exit gates, and the LOCK note. Also Phase 8–10 dependencies (coarse params + `seedFor()` frozen for Phase 8).
- `.planning/REQUIREMENTS.md` — requirements driving this phase: **SEED-01..05**, **TERR-01..06**, **CAM-01..03**.
- `.planning/v1.1-BLUEPRINT-DRAFT.md` — the milestone blueprint: World-Seed foundation (sub-seed derivation, HARD RULE), Layered Terrain (coarse/fine/regional, unified `height(x,z)`, topo baseline), free-cam intent.
- `.planning/PROJECT.md` — milestone context, locked terrain-gen decision criteria (speed + fun), HARD RULE, the "#1 correctness constraint" (single `height(x,z)` for mesh + physics).

### Code to read before implementing
- `src/terrain.js` — `TerrainSystem`: inline `WORKER_SOURCE` (3-octave simplex, fixed permutation needing a seed hook), `sampleHeight` (bilinear), `sampleNormal` (central-diff), `terrainAmplitude` live multiplier, `rebuildAllChunks`, `_updateChunkRing(ccx, ccz)` (centers ring on car — change to follow free-cam), constants `CHUNK_SIZE=64`, `GRID_SAMPLES=65`, `RING_RADIUS=2`, `MAX_BUILDS_PER_FRAME=2`.
- `src/terrain-worker.js` — standalone copy of the worker source (kept in sync with the embedded string).
- `src/camera.js` — multi-mode camera (`chase`/`cockpit`, `C` toggle, left-drag orbit). Add the free-cam mode here; do NOT parent camera to the car mesh.
- `src/main.js` — `queryContacts` (sphere contact sampler reads terrain height/normal), spawn state, render loop calls `terrainSystem.update(carPos)` and `updateCamera(...)`, debug-panel wiring.
- `src/debug.js` — lil-gui panel (existing `terrainAmplitude`, CG sliders) — add the seed field + three-layer sliders here.

### Exit-gate todos (tracked in STATE.md "Pending Todos")
- P7-1: `seedFor()` determinism test must pass before any other generator uses it.
- P7-2: height-agreement test — `sampleHeight(x,z) == bilinear(chunk.heights) * amp` at ≥5 world positions.
- P7-3: lock (commit-to-data-file) coarse amplitude/wavelength/octaves — do not change after P8 starts (per D-12).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`camera.js` multi-mode architecture** — already supports `chase`/`cockpit` via a `cameraMode` string + `C`-key handler and a left-drag orbit. Free-cam adds a third mode, not a rewrite (D-01..05). Reuse the `getCameraMode()` export for debug/HUD if useful.
- **`terrain.js` `rebuildAllChunks()`** — already re-applies amplitude to built geometry; the amplitude-only instant path in D-09 maps directly onto it. Coarse-param changes need a heavier path (re-run Worker for loaded chunks).
- **`terrain.js` `terrainAmplitude` live multiplier** — the pattern (a live param read by both `sampleHeight` and geometry build) is the template for the new three-layer params.
- **lil-gui debug panel (`debug.js`)** — host for the seed field and three-layer sliders; folder-grouping pattern already in use.

### Established Patterns
- **One unified height, applied identically in mesh + physics** — the existing `sampleHeight` reads the Worker-produced `chunk.heights` (bilinear) and re-applies `terrainAmplitude` to match geometry. The new layered function must preserve this agreement (height-agreement exit gate). The "#1 correctness constraint."
- **Pure functions of `(seed, world coords)`** — the Worker is already stateless per chunk; keep it Worker-safe (no DOM), seed passed in the `generate` message or baked from `worldSeed` deterministically.
- **Frame-spread builds (`MAX_BUILDS_PER_FRAME=2`) and `_pendingWorker` reservation** — keep the duplicate-request race fix intact when changing the streaming center to the camera (D-21).

### Integration Points
- **`camera.js updateCamera`** — add the free-cam branch; **`main.js`** must pass the camera position to `terrainSystem.update(...)` when free-cam is active (D-21), and route WASD to the camera vs the vehicle (D-05).
- **Worker seed hook** — `terrain.js`'s inline simplex uses a fixed permutation (`random()=>0.5`); P7 must thread `worldSeed`/`seedFor("coarse"|"fine"|"regional")` into the generator.
- **New seed module** — a `seedFor(domainTag, ...coords)` utility (likely a new `src/` module) consumed by terrain now and roads/POIs later; must parse `?seed=` and the debug field (string→32-bit int or raw int).
- **Spawn re-seating** — `main.js` spawn/regenerate path teleports + ground-probes the truck (D-14/15/16). **MEMORY NOTE:** new `vehicleState` fields must be added in **3 places** — `vehicle.js` SPAWN_STATE, the `main.js` literal, and the `main.js` reset — not just SPAWN_STATE.
- **Pause menu / grid world** — a new minimal UI layer (Esc) plus a flat-plane mode that pauses terrain streaming and relocates the ramp/plateau props (D-17/18/19).

</code_context>

<specifics>
## Specific Ideas

- "Driving up a mountain pass, or occasional zero-grade traversal" — the explicit feel target (D-07). The reference profile is "an example of somewhere a road would actually be," not a mellow corner of something bigger.
- Free-cam should "spawn a couple meters above the car, so it's not confusing where you are" (D-04).
- Grid-world menu item must read exactly **"grid world"** (D-18).
- "Would not be fun to spawn on a steep slope" — drives the road-anchored, tangent-facing spawn (D-16).

</specifics>

<deferred>
## Deferred Ideas

- **Road-elevation profile + larger-peak topo context** — user offered to add these to `references/`; primarily informs **Phase 8** road max-grade. Optional, not blocking Phase 7.
- **Road-anchored spawn (snap to nearest road node + tangent heading)** — designed as a seam in Phase 7 (D-16); the actual road-graph probe lands in **Phase 8**.
- **Regional-roughness difficulty-system hook** — regional layer is random for now; a difficulty driver is a later gameplay phase (per blueprint).
- **`feat-dust-trails.md`** — reviewed, not folded. Separate visual feature (terrain-triggered dust); belongs in a later visual/polish phase, not Phase 7.
- **BUG-06 chase-cam jitter** — reviewed; optional opportunistic fix while in `camera.js`, not a Phase 7 requirement (see Reviewed Todos above).

</deferred>

---

*Phase: 7-free-cam-seeded-layered-terrain*
*Context gathered: 2026-06-07*
