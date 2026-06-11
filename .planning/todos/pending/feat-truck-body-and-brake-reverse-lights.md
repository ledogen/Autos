---
id: FEAT-04
type: feature
status: open
opened: 2026-06-10
updated: 2026-06-11
source: scribe-session
absorbs: 999.1-truck-body-styles-and-functional-brake-reverse-lights
note: "Merged with the retired ROADMAP backlog phase 999.1 (2026-06-11) — this todo is the single source of intent."
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
