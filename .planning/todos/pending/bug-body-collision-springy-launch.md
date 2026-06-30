---
id: BUG-27
type: bug
status: open
opened: 2026-06-30
severity: medium
source: user-report
note: "Vehicle BODY (frame/bumper) collisions are too springy / under-damped. Slamming the bumper into
the ground can pick up an oscillation that LAUNCHES the car unrealistically. Real frame members deform
on a hard hit and absorb energy — i.e. they are essentially inelastic AND energy-dissipating (very well
damped), not bouncy. The body-contact solver should behave plastically on hard hits, not store/return
energy. NOT the wheel suspension — this is the Step 3b body-contact impulse solver in src/physics.js."
---

# BUG-27: Body collisions too springy — bumper slam picks up an oscillation that launches the car

## Symptom

Hard contact between the **vehicle body** (bumper / frame probes, not the wheels) and the ground is
under-damped. Slamming the front bumper into the ground can set up an **oscillation that grows / throws
the car into the air** unrealistically — energy appears to be injected rather than absorbed. In reality,
a hard hit to a frame member **deforms it and absorbs the energy** (plastic, near-zero rebound, strongly
dissipative). The sim should read the same: a hard body hit thuds and stops, it does not bounce or launch.

## Where it lives

`src/physics.js` **Step 3b — Body contact** (≈`physics.js:508–594`): sphere probes from
`getBodyContactPoints` (`src/suspension.js:394`, 14 probes — bumper corners + underbody) resolved by a
sequential-impulse (Gauss-Seidel) solver with Baumgarte position correction. Relevant constants:

- `BODY_RESTITUTION = 0.05` (`physics.js:108`)
- `BODY_FRICTION_MU = 0.6` (`physics.js:109`)
- `REST_VEL_THRESHOLD = 0.5` m/s, `BAUMGARTE_BETA = 0.25`, `SLOP = 0.005`, `SOLVER_ITERATIONS = 8`
  (`physics.js:516–519`)

This is distinct from the wheel suspension (`stepSuspensionSubsteps`) and from the catastrophic
penetration failsafe (`physics.js:115`).

## Suspected mechanism (confirm with a headless replay before fixing)

The current solver removes the *approaching* normal velocity but has at least two energy paths that can
manifest as a springy launch on a hard hit:

1. **Restitution IS applied on hard hits.** `restitution = -vn > REST_VEL_THRESHOLD ? BODY_RESTITUTION : 0`
   (`physics.js:554`) — the threshold suppresses bounce only for *slow/resting* contacts. A hard slam
   arrives fast (`-vn ≫ 0.5`), so it gets the full `0.05` rebound. Five percent of a large slam velocity
   is a real upward kick, and across the 14 coincident probes + multiple solver passes it can compound.
2. **Baumgarte position correction injects positional energy.** `correction = (depth − SLOP) * 0.25`
   per step (`physics.js:586–592`) shoves the body out of penetration *positionally* without a matching
   velocity sink. On a deep hard-hit penetration this is a large teleport-out; combined with the
   restitution kick and the suspension reloading underneath, it can pump an oscillation instead of
   settling. (Baumgarte adding energy on deep contacts is a known failure mode.)
3. **No plastic / energy-absorbing term.** Real frame deformation *dissipates* kinetic energy — the
   model has no path that removes energy beyond zeroing the approach velocity; nothing models the
   deformation sink, so the hit is at best perfectly elastic-minus-restitution, never lossy.

The growing oscillation suggests net energy gain per cycle (path 1 and/or 2), which a well-damped
inelastic contact would never do.

## Investigate first (headless, per CLAUDE.md — diagnostics live in test/)

- Reproduce headlessly: drop the body onto flat/known ground at a hard impact speed and log body-probe
  contact events — track total mechanical energy (KE + rotational + gravitational PE) across the impact.
  A correct damped hit should show energy strictly **decreasing**; the bug should show a step UP. Build
  this as a rainy-day script / gate in `test/` (cf. `test/assert-m4-*.mjs` physics scripts), not in
  `src/`. A scenario log + replay can pin which term (restitution vs Baumgarte) supplies the gain.
- Isolate the terms: re-run with `BODY_RESTITUTION = 0`, then with Baumgarte velocity-coupled / capped,
  and see which kills the launch.

## Fix directions (after the replay pins the dominant term)

- **Make hard body hits inelastic + dissipative.** Set effective restitution to 0 for real impacts
  (deformation absorbs the rebound). Optionally model a *plastic* contact: cap the restored normal
  velocity and explicitly remove a fraction of impact KE proportional to penetration/impact speed
  (a deformation energy sink), so harder hits damp harder — matching "frame members deform and absorb."
- **Tame Baumgarte.** Lower `BAUMGARTE_BETA`, and/or replace the pure positional push with a
  velocity-coupled correction (relaxation / soft constraint) so the de-penetration doesn't read as a
  spring. Clamp the per-step correction so a deep hard hit can't produce a large positional kick.
- **Add explicit normal damping on the contact** (a restitution < 0-style velocity bleed, or a
  damped soft constraint), tuned so the body settles in ≪1 cycle with no rebound.
- Keep resting-contact behaviour stable (no micro-jitter at rest — the original reason
  `REST_VEL_THRESHOLD` + small restitution exist; don't reintroduce that while fixing the launch).

## Acceptance

- A hard bumper/frame slam into the ground **thuds and settles** — no growing oscillation, no launch;
  post-impact mechanical energy is ≤ pre-impact (strictly dissipative across the hit).
- Resting on the body (e.g. flipped, roof/underbody down) stays stable — no micro-jitter, no creep.
- Harder hits damp at least as hard as soft hits (no speed at which the contact turns springy).
- A `test/` energy/replay gate covers the impact case and is added to `npm test`; existing physics
  behaviour scripts and `npm test` stay green.

## Related

- Body-contact solver constants/structure: `src/physics.js` Step 3b; probes `src/suspension.js:394`.
- Wheel-side damping history (different system, useful precedent for sign/energy bugs):
  [[project_phase4_suspension_fix]] (inverted damper sign caused a collapse), [[project_active_suspension_bugs]].
- Penetration failsafe that must not preempt the normal solver: completed
  `bug-penetration-failsafe-preempts-suspension.md`.
