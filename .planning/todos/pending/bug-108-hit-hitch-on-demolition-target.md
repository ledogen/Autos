---
id: BUG-108
type: bug
status: open
severity: minor
opened: 2026-11-03
source: owner, 2026-11-03 — "There was a brief lag upon hitting them, I think it's the same physics bug that lane B was trying to fix where there is a momentary freeze or reduction in velocity upon contact."
relates: FEAT-65 (demolition — sleeping targets wake on touch), BUG-99 (the rock-strike stutter; closed with "check ?hitch=20, render-side suspect")
---
lane: B

# BUG-108: a brief hitch when the truck hits a demolition target

## What

Hitting a sleeping demolition target (an 18 kg drum, a 13 kg sign, a 10 kg barricade) gives a brief lag: the
truck seems to freeze or lose speed for a moment, then carries on. The owner reads it as BUG-99's rock-strike
stutter. That ticket fixed a missing reaction force and closed with the stutter itself unresolved
("check `?hitch=20` at a pop, render-side suspect").

The honest momentum bound is small: an 1800 kg truck at 15 m/s putting an 18 kg drum to ~2× its speed loses
about 0.3 m/s. Anything visibly more is a defect.

## First split it

- **Render or physics?** Play with `?hitch=20` and `window.__hitchDump()` at a hit. Suspects on the render side:
  a first-use shader or material compile on the woken body, a smashed-latch HUD repaint, an impact sound's first
  play.
- **Physics:** a headless strike (real `stepPhysics`, a sleeping body at the target's mass placed on the
  shoulder, the truck at 10 / 20 / 30 / 40 mph, hull and wheel hits) logging the chassis velocity per step.
  Suspects: the waking body's island solving one step with a huge push-out, the hull core taking the whole
  impulse in one step.

## Acceptance

- [ ] The cause is named (render frame time vs per-step chassis velocity), with numbers.
- [ ] No one-step chassis velocity loss beyond the momentum bound (+ a margin) across the strike census.
- [ ] No frame over the `?hitch` threshold at a hit.
- [ ] The owner's drive through a demolition site.
