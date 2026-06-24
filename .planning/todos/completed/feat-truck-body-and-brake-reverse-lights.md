---
id: FEAT-04
type: feature
status: closed
opened: 2026-06-10
updated: 2026-06-24
closed: 2026-06-24
resolution_branch: visual-model
followup: FEAT-04a
source: scribe-session
absorbs: 999.1-truck-body-styles-and-functional-brake-reverse-lights
note: "Merged with the retired ROADMAP backlog phase 999.1 (2026-06-11) — this todo is the single source of intent."
resolution: "Shipped via the visual-model merge (merge commit 2fe2d46, branch commits 0ee74ad + c5744a7). src/vehicle-model.js createVehicleModel() loads a low-poly Hilux GLB (assets/models/hilux.glb, data/vehicle-models.js spec) with functional tail/brake/reverse lights driven each frame by syncMeshesToState, plus a 'Body color' debug picker. Follow-up FEAT-04a (wire the visual swap to the physics-vehicle dropdown) remains OPEN."
---

# FEAT-04: Truck body shape + swappable body styles + functional brake/reverse lights

## Request

Vehicle-visuals feature (decoupled from physics). Merged from the scribe capture and the retired
ROADMAP backlog phase `999.1`. Three threads:

1. **Truck body model** — replace the current `BoxGeometry` body (built in `main.js`) with a proper
   truck-shaped mesh so the rendered Ranger looks truck-like, not a placeholder box.
2. **Swappable body-style architecture** — a vehicle-visual model registry so additional bodies
   (e.g. Nissan 240sx) can be selected later, keeping the physics rig (collision box, CG, wheelbase)
   INDEPENDENT of the visual shell. The visual body is a swappable shell over the unchanged physics rig.
3. **Functional lights** (emissive meshes that toggle with vehicle state, driven live off input/state):
   - **Brake lights** — rear/tail lights illuminate when braking is applied (`vehicleState.brake` /
     `smoothBrake`).
   - **Reverse lights** — rear lights illuminate when the vehicle rolls backwards (velocity projected
     onto the body forward axis < 0).

## Notes

- Visual / presentation only — NOT physics. Independent of the road/terrain work.
- Keep the physics collision box / CG / wheelbase decoupled from the visual body (swap shells freely).
- Lights react live from existing input/vehicle state — no new physics.
- **Provenance:** captured live via scribe session during Phase 9 work; merged here with ROADMAP
  backlog phase 999.1 (now retired — see ROADMAP.md). When picked up, promote via `/gsd:review-backlog`
  or plan directly; the old 999.1 phase number is retired in favor of this todo.

## Implementation hints (from the retired 999.1 entry)

- Current body geometry is a `BoxGeometry` constructed in `main.js` — that is the thing to replace.
- Brake state is available as `vehicleState.brake` / `smoothBrake` (smoothed brake accumulator).
- Reverse detection: project world velocity onto the body's forward axis; < 0 ⇒ rolling backward.
- Emissive material toggle (set `material.emissiveIntensity` / `emissive` on the light meshes) keyed to
  those states each frame in the mesh-sync path.

## Resolution (2026-06-24, branch `visual-model`)

Delivered on the `visual-model` branch (base commit `0ee74ad` + follow-up lights/multi-vehicle work).
The entire vehicle visual was extracted out of `main.js` into a dedicated, self-contained module so
it no longer collides with terrain/road code.

**1. Truck body model — DONE.** The `BoxGeometry` body is gone from `main.js`. `src/vehicle-model.js`
now loads a low-poly **Toyota Hilux 97 GLB** (`assets/models/hilux.glb`, CC-BY Muhammad Reyhan) as the
body shell — auto scale / center / ground-plant, fine-alignment offsets, and a debug-panel **body-color
picker** that recolors the paint material live. A hand-built primitive truck remains as an automatic
fallback if the GLB fails to load.

**2. Swappable body-style architecture — DONE.** Per-vehicle visual data lives in a new registry,
`data/vehicle-models.js` (kept separate from the physics presets in `data/vehicles.js`). The loader is
generic: `createVehicleModel(scene, params, spec)` consumes any spec `{ url, targetLength, bodyScale,
yaw, shiftRear, shiftDown, paint, tail, reverse, ... }`. Adding a vehicle is data-only — drop a `.glb`
in `assets/models/`, add an entry, pass the spec. Light fields are optional (a model lacking a tail/
reverse material simply skips that light). **Physics rig is fully decoupled** — the contact model
(`bodyContactRadius` / contact points / wheel hubs) is param-driven and untouched; the GLB is cosmetic.
*Partial:* runtime model-switching (tying the visual swap to the physics-vehicle dropdown) still needs a
small reload hook — the architecture supports it (pass a different spec); only the wiring is outstanding.
Tracked separately as **FEAT-04a**.

**3. Functional lights — DONE.** Driven live each frame in the mesh-sync path off vehicle state:
  - **Brake lights** — the GLB rear lamp (`Lisanne_Bandana`) glows bright red. Direction-aware so it
    means *deceleration*, not just the key: brake (`S`) while moving forward, throttle (`W`) while
    reversing. Dim red running-light glow when headlights are on (`L` toggle).
  - **Reverse lights** — the white rear lens (split off the shared `FrontColor` material by triangle
    position so only the rear faces light) glows white when world velocity projected on the forward
    axis is backward (`vLong < -0.4`).
  - Wheels are procedural (spin / steer / suspension travel); the GLB's own static wheels are stripped.

**Files:** `src/vehicle-model.js` (new), `data/vehicle-models.js` (new), `assets/models/hilux.glb` +
`CREDITS.md` (new), `src/main.js` (factory call + color-picker hook), `src/version.js` (build marker).

**Status:** complete on `visual-model`; **pending merge into `main`** once PERF-03 reaches a commit
boundary (conflict surface is tiny — the `version.js` marker line plus a few separated `main.js` hunks).
