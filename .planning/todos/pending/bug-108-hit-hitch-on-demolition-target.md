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

- [x] The cause is named (render frame time vs per-step chassis velocity), with numbers.
- [x] No one-step chassis velocity loss beyond the momentum bound (+ a margin) across the strike census.
- [x] No frame over the `?hitch` threshold at a hit.
- [ ] The owner's drive through a demolition site.

## Work log — 2026-11-04 (Lane B): render vs physics, measured

Probes are in `wip/bug-108/` (git-invisible):
- `census.mjs`: headless. The real `stepPhysics`, with each target standing as main.js stands it: a debris
  hull at the target's mass, slept at once. Struck at 10/20/30/40 mph from dead centre to 1.1 m off.
- `browser-probe.mjs`: free roam on :3282 with `?hitch=20`, headless Chrome on the GPU. A sleeping target
  stands on a straight road and the truck is driven into it at about 44 mph. Every rAF period and the
  truck's speed per frame are logged.

**Render: no hitch.** Barrel, open drum, stop sign, barricade, small crate, stop sign again, all in one
session. Every frame around every hit, the first included, was 16.5–16.8 ms. p99 elsewhere was 16.8 ms.
`?hitch=20` attributed nothing at a hit.

**Physics: drums, signs and barricades are clean.** Over the second after the hit the truck loses less
than the momentum bound (2·m·v / M). The worst single-step drop:
- barrel / open drum: 0.23 m/s at 40 mph;
- stop sign: 0.14 m/s;
- barricade: 0.13 m/s.
(In-browser: barrel 0.23, sign 0.09 m/s.) The wake step costs at most 2.7 ms of CPU against a 0.1 ms
median step, so it is not a compute hitch either.

**The exception is the small crate** (18 kg, 0.45 m tall). It loses 2–4× the bound: up to 0.98 m/s in a
single step at 40 mph (about 6 g for one frame; 0.72 m/s in-browser), and the nose lifts.
- Cause: the collider's lower slab has no bumper face. Its front is one 48° ramp from the bumper top
  (0.76 m) down to the undercarriage (0.37 m), 0.43 m back.
- A 45 cm box meets that ramp near its foot and is pressed down into the road. With the box–road friction
  of about 0.73, a 48° face can barely push it forward. It wedges, and the truck climbs it.
- The drawn Ranger has a vertical chrome blade from 0.49 to 0.70 m and nothing below it at the nose
  (`assets/models/src/ranger.py` Z_BUMP0/Z_BUMP1).
- Measured experiment (reverted): add the bumper's bottom edge (0.49 m) to the nose hull.
  - Crate worst single-step drop 0.98 → 0.46 m/s.
  - Barrel 0.22 → 0.26 m/s, since a vertical face hits squarely.
  - Signs unchanged.
  - The approach angle falls from about 45° to about 31°. A real Ranger is about 25–30°, so steep
    transitions scrape a little sooner. The chamfer was put there for scrapes (capture 1786773473453),
    so the scrape and ramp gates need re-measuring.

**For comparison, BUG-99's rocks** (40–90 kg, rigid) drop 1.3–1.6 m/s in a single step at 30–50 mph
(`census-rock-strike --nopop`). That is near their momentum bound, delivered in one 16 ms frame. A real
tire-on-rock strike lasts 10–20 ms, so one frame is honest. That is the "momentary reduction in velocity"
the owner remembers.

**Owed to the owner:**
1. **Which targets were hit, and at roughly what speed?** And did the picture stop for a moment (a frame
   hitch), or did the truck visibly lurch or slow (a velocity drop)? If convenient: play with `?hitch=20`
   and run `__hitchDump()` in the console after a hit.
2. **Collider nose fix:** go or no-go. It matches the drawn bumper. It halves the crate wedge, and drums
   hit a little more squarely. It changes how the nose meets the ground on steep transitions; the
   numbers come before it lands.

## Work log — 2026-11-06 (Lane B): the nose fix, built

The owner said "go" on the collider nose (2026-11-06, via the orchestrator). No target or speed details came, so
this rests on the 11-04 measurements.

- **`src/physics.js`:** a new field, `CHASSIS_PROFILE.bumperLowY = −0.06`. That is the drawn blade's bottom edge,
  `ranger.py` Z_BUMP0, 0.49 m above the ground at ride height. The nose end of the lower slab hull gains two points
  there, so its front face is a vertical blade from the bumper top down to 0.49 m, and the approach chamfer starts
  below it.
- **Strike census** (`wip/bug-108/census.mjs`), worst single-step drop at 40 mph, before → after:

| Target | Dead centre | Wheel line | Momentum bound |
|---|---|---|---|
| small crate | 0.98 → 0.42 m/s | → 0.46 m/s | 0.47 m/s |
| barrel / open drum | 0.23 → 0.26 | 0.26 | 0.47 |
| stop sign | 0.14 | 0.14 | 0.34 |
| barricade | 0.13 → 0.11 | 0.11 | 0.26 |

  Every target at every speed is now under the bound in one step. The barrel rises a little because the blade
  meets it squarely.
- **What remains:** a dead-centre crate at 40 mph passes under the blade (the crate is 0.45 m tall, the blade's
  edge is at 0.49 m) and is run over. That costs 1.06 m/s over the whole second, against a 0.47 bound. It is real
  contact with the undercarriage spread over many steps, not a one-frame hitch.
- **Approach angle**, measured as the ramp tangent under the front tire to the hull: 52.2° → 37.1°. A real Ranger is
  about 25–30°, so the hull is still more forgiving than the truck it draws.
- **Gates:** every gate a `physics.js` change selects passed (21, including `penetration-failsafe` and
  `body-contact-energy`). So did `tire-contact` (FEAT-70 kerbs), `damage-bumpstop` (lab-ramp bottoming) and
  `shift-schedule`.
- **Identity:** `fingerprint-physics` against main is identical. The blade changes nothing in ordinary driving.
- **New gate, `test/strike-hitch.mjs`** (physics, fast, 1.2 s):
  - The small crate and the barrel, struck at 40 mph, dead centre and on the wheel line.
  - It requires the worst one-step loss to stay ≤ 1.25 × 2·m·v/M.
  - It passes at 0.89× / 0.96× / 0.55× / 0.55×. Against the old nose it fails: the crate at 1.35× and 1.92×.

**Still owed:** the owner's drive through a demolition site.
