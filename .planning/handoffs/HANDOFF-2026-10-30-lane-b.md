# Handoff — Lane B, 2026-10-30 (after BUG-99)

**Worktree** `/Users/ledogen/CodeShit/CarGame-machine` · **branch** `feature/machine` · **serve** `:3282`
(if it is down: `npx vite --port 3282 --strictPort` from the worktree). Work ONLY there; own only Lane B's
files. `git merge main` before starting. Tracker page: https://claude.ai/artifact/8P7QDPAaKxKPtJuf6zvRVH
(Lane B rows; `lanes/b` handoff). Supersedes `HANDOFF-2026-10-29-tire-on-rock.md`.

## State

- **BUG-99 (tire-on-rock) is committed on `feature/machine` at 1506d155. It is NOT merged.** It is live
  on :3282. The full story is the work log at the bottom of
  `.planning/todos/pending/bug-99-tire-on-rock-physics.md`. Read it before touching rock contact.
- **The owner's play-test on 2026-10-30:** they like it. There are no crawl yeets, the stutter is fixed,
  and the 35 mph dip in the pop rate reads as a natural sweet spot.
- **Census** (`node test/census-rock-strike.mjs --big`: about 3000 hits at a held speed, with
  punctures live): **0 flips**. Pop rates by speed are below.

  | mph | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55 |
  |---|---|---|---|---|---|---|---|---|---|---|---|
  | pop % | 0 | 0 | 1 | 16 | 26 | 34 | 10 | 14 | 26 | 39 | 51 |

  Rock exit is 1.2–1.9× truck speed (p95). The worst one-step speed loss is 1.2 m/s.
- **The physics fingerprint (no debris) is byte-identical to main.** `test:all` passes 109/111; the
  only reds are the known ones, road-tunnel and road-clearance.

## What BUG-99 changed

The root cause, measured: a rock got the tire's push only when it was the wheel's *support* contact.
So the rock stayed planted, and the rigid core pinched it. That pinch caused the flips, the yeets and
the stutter. Now:

- **Newton's third law on every tire–rock contact.** It goes through an injected `onForce` on the
  contact, so `suspension.js` stays pure maths.
- **The contact is followed through the step**, with a one-step look-ahead. The overlap at time t is
  the gap + closing speed × t + the rock's in-step yield.
- **The rock answers in-step as a rigid body.** It uses the engine's `massProperties`, and it is held
  by the ground it lies on (`staticSupports`).
- **The rim cores are free 18 kg bodies, re-seated on the hub every step.** The impulse a rock puts
  into a core (`contactImpulseOn`) is split two ways: along the strut it goes into `strutCompVel`;
  across the strut it goes to the chassis at the hub.
- **A rock-only tire damper:** `params.tireDampingDebris` is 150 N·s/m, and the road keeps 1500. It has
  a debug slider, "Rock Damping".
- **A puncture reads the rim two ways.** Either the force on the core (FEAT-93, 30× static wheel load),
  or the soft path's pinch (`vehicleState.rimHazardSoft`, a step mean, `hazardPinchMult` 4.5×, about
  15 kN).

These were tried, measured and rejected, with the reasons in the code comments:

- **A prismatic joint for the core.** It went unstable, and it moved 72 kg of mass off the body.
- **Ground friction in the rock proxy.** It predicted a pin that the engine does not honour.
- **A peak (not mean) pinch signal.** One-substep spikes popped tires at a crawl.

## NEXT — the owner's open ask

**The owner wants few pops below about 40 mph.** None of the measured levers move the curve along the
speed axis:

- **The threshold** scales the whole curve. At 25 kN it reads 0/0/0/4/9/13/3/6/13/23/39 %; at 30 kN
  almost nothing pops until 55 mph.
- **Rock size and mass** scale the magnitude, but the hump stays at 20–30 mph and the dip at 35 mph
  for every size.
- **The rock damper** moves the high-speed end, not the hump.

The lever worth measuring is to pop on **energy** instead of force. That means the work the carcass
absorbs past full squash (∫ residual · d depth), which grows roughly with the square of the impact
speed. A slow climb presses hard but slowly, so it does little work. This is a change of measurement,
not a speed rule. Record it in the census and fit it with `--big` as the force threshold was. Bring
the owner the table before changing anything. It is unmeasured, so don't promise 40 mph.

## Also open

- **Low-speed rocks feel weightless** (the owner's report). The theory: the tire has no grip on a rock
  face unless the rock is its support contact (the single Pacejka patch, BUG-38). So the tire shoves a
  rock it should climb. The old physics climbed only because the rock never pushed back.
- **Rare crawl exits up to about 2×** on 14 kg rocks. They come from a tumbling rock being mispredicted
  by the coupled step.
- **`PhysicsEngine.replaceHullLocal`** no longer has a caller in `src/`. Delete it when
  `collider-seam-churn.mjs` is reworked.
- **Merge `feature/machine` to main** once the owner OKs BUG-99.

## After BUG-99

1. FEAT-132.
2. FEAT-138, the hi-lift jack. It is APPROVED: 10.5 N·m per kg for up to 3 s, cut at the balance point,
   with a 5 s real-time cooldown. Its likelihood tier on the shelf is still owed by the owner.
3. BUG-89, BUG-54, BUG-92.
4. FEAT-150.

FEAT-94 and FEAT-152 are signed off: don't retune them, and never re-add a spark point light.
