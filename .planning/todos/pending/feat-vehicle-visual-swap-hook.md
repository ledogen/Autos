---
id: FEAT-04a
type: feature
status: open
severity: minor
opened: 2026-06-24
source: feat-04-followup
relates: FEAT-04
---

# FEAT-04a: Wire the visual model swap to the physics-vehicle dropdown

## Request

Split out of FEAT-04 (truck body / swappable shells), which delivered the swappable visual-model
**architecture** but loads the model once at startup. This ticket is the remaining runtime wiring so
selecting a different vehicle actually swaps the visual shell too.

The visual spec registry already exists (`data/vehicle-models.js`) and the loader is generic
(`createVehicleModel(scene, params, spec)`). What's missing is the live switch.

## Acceptance

- Selecting a vehicle in the debug-panel dropdown (the existing physics-preset switch that copies
  `data/vehicles.js` params into the live `RANGER_PARAMS`) **also** swaps the visual model to the
  matching `data/vehicle-models.js` spec.
- Specs are linkable to physics presets by key (e.g. `'Ranger'`, `'240sx'`) — a preset with no matching
  visual spec falls back cleanly to the primitive truck (current fallback path).
- Swapping disposes/removes the previous GLB scene (geometry + cloned materials) before loading the new
  one — no leak, no stale meshes left in `carGroup`.
- Body-color picker, wheel-strip, and the tail/brake/reverse light wiring re-bind to the new model.
- Physics rig is untouched by the visual swap (contact model stays param-driven, as in FEAT-04).

## Implementation hints

- `createVehicleModel` currently builds primitives + kicks off one async GLB load. Factor the GLB-load
  body into a `loadModel(spec)` that can be called again: clear the prior `root` from `carGroup`,
  reset `paintMaterials` / `modelTailMats` / `modelReverseMats`, then load the new spec.
- Expose a `setVehicle(spec)` (or `setVehicleModel(id)`) on the returned object; have the debug dropdown
  `onChange` call it alongside the physics-param copy.
- Dispose old resources: `geometry.dispose()` + `material.dispose()` on the removed GLB subtree.
