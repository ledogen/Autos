---
id: FEAT-03
type: feature
status: open
opened: 2026-06-04
---

# FEAT-03: Terrain-dependent dust trails behind the tires

## Request

Particle dust trails kicked up behind the tires while driving, with emission
that depends on what the tire is rolling/sliding on. Loose off-road terrain
throws a lot of dust; a smooth road surface (once roads exist in v1.1) throws
little to none. The effect should be visual only — no physics coupling — but
driven by the existing per-wheel physics state so it reacts to wheelspin,
braking lockup, drifting, speed, and load.

## Motivation

The sim currently gives no visual feedback for tire activity against the
ground. Dust trails make wheelspin, drifts, and hard cornering legible at a
glance, reinforce the "honest physics" feel, and make the high-desert /
Eastern-Sierra environment (see v1.1 blueprint) read as dirt rather than a
neutral plane. It also visually distinguishes the smooth road surface from
the lively off-road terrain, which is a core v1.1 goal.

## Behavior spec

- **Per wheel**, emit dust from the contact patch when the wheel is both (a) in
  ground contact and (b) "working" — i.e. some combination of:
  - longitudinal slip (wheelspin under throttle, lockup under brake)
  - lateral slip (drifting / hard cornering)
  - forward speed (light rooster-tail even when just rolling fast on dirt)
- **Emission rate / size / opacity** scale with the magnitude of the above
  (more slip or load → more dust).
- **Terrain dependence:**
  - Off-road loose terrain → full dust.
  - Road surface (v1.1) → little or no dust (smooth, sealed surface).
  - Hook for future per-region / per-surface material so dust color and
    density can vary (e.g. pale dust in the valley, darker on a wet patch).
    Until a material system exists, derive a simple "dustiness" scalar from
    whatever the surface query exposes, defaulting to full off-road dust.
- Particles trail behind the vehicle, drift/settle, and fade out over a short
  lifetime. Should look like a billowing trail, not a rigid ribbon.

## Implementation sketch

- New module `src/dust.js` (or fold into a small effects module): owns a
  pooled `THREE.Points` / sprite particle system. Pure rendering — imports
  Three.js only, reads vehicle/contact state passed in from main.js.
- Driven from the render/game loop in `main.js`, NOT the fixed physics step
  (it's cosmetic and can run at frame rate).
- Inputs per wheel already available: contact from `queryContacts`, slip from
  `vehicleState.slipLong` / `slipLat` / `wheelDebug` (fn/fz, omega), and body
  speed. Emit at the wheel contact-patch world position.
- Surface "dustiness": start with a constant (1.0 off-road). When v1.1 roads
  land, the surface query should return a dustiness factor (≈0 on road,
  blended across the shoulder) so dust suppression falls out naturally.
- Particle pool with a fixed cap (e.g. a few hundred) to protect the 60fps
  target; recycle oldest. No new dependencies.

## Scope

- `src/dust.js` — new particle system module (pooled, terrain-aware emission)
- `src/main.js` — instantiate, feed per-wheel contact/slip/speed each frame,
  update + recycle particles in the render loop
- `src/debug.js` — optional toggle + sliders (emission rate, particle
  lifetime, max count, master on/off) under a new "Effects" folder
- `data/ranger.js` — optional tunables (dust emission thresholds, particle
  size/lifetime) if slider-driven

## Notes

- Visual only — must not touch the physics step or contact solver.
- Performance is the main constraint: cap the particle count and update on the
  render loop, not per physics substep. Watch the 60fps target with terrain
  active.
- Naturally complements v1.1: the road carve gives a clean place to zero out
  dustiness, so the road visibly reads as the "clean" preferred surface.
- Consider gating emission below a small speed/slip threshold so a parked car
  doesn't smolder dust.
