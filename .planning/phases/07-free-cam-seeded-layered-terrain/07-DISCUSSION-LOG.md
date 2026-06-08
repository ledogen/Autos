# Phase 7: Free-Cam + Seeded Layered Terrain - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-07
**Phase:** 7-free-cam-seeded-layered-terrain
**Areas discussed:** Sierra terrain target, Free-cam controls, Calibration knobs, Chunk streaming in free-cam, Old terrain + test props, Default seed value, Spawn/regenerate behavior, Grid world / pause menu

---

## Sierra terrain target

| Option | Description | Selected |
|--------|-------------|----------|
| I'll provide a topo/DEM | Match statistics of a real reference; concrete visual validation target | ✓ |
| Pick Sierra stats for me | Research representative Eastern Sierra stats; no reference file | |
| Eyeball it to feel | Skip topo matching; tune by eye | |

**Topo timing question — User's choice:** "I have it right now." Provided `references/km elev ref.png`.

**Whole-world character question:**

| Option | Description | Selected |
|--------|-------------|----------|
| This IS the target | High-country rolling + steep ridge spikes, drivable valleys | ✓ (refined) |
| Want bigger escarpments too | Add the full 2000–3000 m Sierra escarpment | |
| This but steeper/bigger | Same character, amplified relief, more frequent steep faces | |

**User's choice (free text):** "this is an example of somewhere a road would actually be. i dont want undriveable switchback roads that crest huge mountains... the vibe should just be driving up a mountain pass, or occasional zero grade traversal."
**Notes:** Reference = where a road actually goes. ~640 m relief / 13.3 km transect; two-scale (undulation + ~40–60% ridge faces). Switchbacks keep the road mellow, not for summiting peaks. Optional later: road-elevation profile / larger-peak context for Phase 8.

---

## Free-cam controls

| Option | Description | Selected |
|--------|-------------|----------|
| Hold right-mouse to look | Look only while RMB held; cursor free otherwise | |
| Pointer-lock (click to capture) | FPS continuous look; Esc to release | ✓ (refined) |
| Arrow keys to look | Keyboard-only look | |

**User's choice (free text):** "c still toggles between cockpit and chase, but shift c takes you to free-cam. either c or shift c will take you out of free cam. esc takes you out of free cam. free cam should have pointer lock. wasd controls to move free cam. shift (held) to increase speed."

**Vertical movement:**

| Option | Description | Selected |
|--------|-------------|----------|
| Fly along where you look | WASD along facing direction; no dedicated up/down | |
| Dedicated Space/Ctrl up/down | WASD horizontal; Space/Ctrl altitude | |
| Both | WASD along look + Space/Ctrl up/down | ✓ |

**Esc vs sliders:**

| Option | Description | Selected |
|--------|-------------|----------|
| Esc releases mouse, stays in free-cam | Pointer-lock released for lil-gui; free-cam holds position | ✓ |
| Esc fully exits to chase | Drops back to truck chase cam | |

**Notes:** Esc-stays-in-free-cam supersedes the earlier "esc takes you out." Free-cam also spawns a couple meters above the car on entry (user note).

---

## Calibration knobs

| Option | Description | Selected |
|--------|-------------|----------|
| All three layers | Coarse + fine + regional sliders | ✓ |
| Coarse-only focus | Only coarse landform knobs | |
| Minimal | Amplitude + wavelength only | |

**Apply mode:**

| Option | Description | Selected |
|--------|-------------|----------|
| Live on drag, debounced | Regenerate ~100–200ms after drag stops; amplitude instant | ✓ |
| Live on every change | Regenerate on any movement | |
| Apply button | Explicit regenerate button | |

**Locking / capture:** User questioned whether locking is needed at all ("its already in a debug menu... you've gotta want to change stuff"). Resolved: no hard freeze — "lock" = commit a default to the data file for seed determinism + Phase 8 starting point; slider stays live; changing later implies road re-validation.

**Capture mechanism:**

| Option | Description | Selected |
|--------|-------------|----------|
| Export/copy button | Dump params as snippet | |
| Console.log readout | Log to console | |
| No capture mechanism | Report values by hand | ✓ |

---

## Chunk streaming in free-cam

| Option | Description | Selected |
|--------|-------------|----------|
| Follow the free-cam | Ring centers on camera while free-cam active | ✓ |
| Stay on the truck | Ring stays on idle truck | |
| Follow whichever is active | Reusable focus-target concept | |

**Notes:** Fast Shift-boost flying may outrun the 2-builds/frame loader — terrain pops in, acceptable for a dev cam.

---

## Old terrain + test props

| Option | Description | Selected |
|--------|-------------|----------|
| Full replacement | New seeded layered fn replaces 3-octave simplex | ✓ |
| Keep old as a fallback | Old simplex selectable via toggle | |

**Test props:**

| Option | Description | Selected |
|--------|-------------|----------|
| Retire them | Remove ramp/plateau entirely | |
| Keep in grid world | Move ramp/plateau into flat grid world | ✓ |
| Keep in terrain world | Leave in Sierra world | |

---

## Default seed value

| Option | Description | Selected |
|--------|-------------|----------|
| "lone-pine" | Themed to Eastern Sierra reference | ✓ |
| "ranger" | Themed to vehicle/project | |
| You decide | Claude picks | |

---

## Spawn / regenerate behavior (raised by user mid-discussion)

**User insight:** Regenerating moves road locations; wants the car to spawn ON the road, facing down it, not on a steep slope. Resolved to a single canonical spawn function returning `{position, heading}`; on any regenerate, teleport to spawn + ground-probe + seat + zero velocity (not re-ground in place). Phase 7 = terrain-only low-slope point; Phase 8 swaps the resolver to nearest-road-node + tangent heading.

---

## Grid world / pause menu (raised by user mid-discussion)

**User request:** "add a simple esc pause menu that has an option to take the car to a flat ground grid world for tuning. it should just say 'grid world'." Esc-collision and leaving-behavior resolved: Esc opens menu from chase/cockpit (in free-cam first Esc releases mouse, menu reachable from there); grid world = flat plane + dev grid, car at origin, streaming paused; "return to world" re-seats at spawn. Ramp/plateau props relocate here.

---

## Claude's Discretion

- Fine-layer suspension-texture default aggressiveness (slider-tunable).
- Free-cam fly speed + Shift-boost multiplier values.
- `height(x,z)` architecture (analytic vs bilinear-of-chunk) — constrained by height-agreement exit gate.
- `seedFor()` hashing + string→32-bit-int implementation.
- Pause-menu / grid-world visual styling.

## Deferred Ideas

- Road-elevation profile + larger-peak topo context (optional, Phase 8).
- Road-anchored spawn probe (seam in P7, implemented P8).
- Regional-roughness difficulty-system hook (later gameplay phase).
- `feat-dust-trails.md` — separate visual feature, later phase.
- BUG-06 chase-cam jitter — optional opportunistic fix while in `camera.js`, not a P7 requirement.
