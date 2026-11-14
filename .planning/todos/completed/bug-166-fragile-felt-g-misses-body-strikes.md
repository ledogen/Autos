---
id: BUG-166
type: bug
status: done
severity: major
opened: 2026-11-13
source: Lane B, BUG-161 replays (side finding)
relates: [BUG-161, FEAT-97, FEAT-139]
---
lane: B

# A fragile load's felt g misses body strikes (the joint force reads the last substep)

## What

`_fragileStep` (main.js) prices a fragile load's shocks from `feltG(physicsEngine.jointForce(joint), massKg)`, the
weld's constraint force. In normal driving that is exact. It matches the load's own acceleration, Δv / dt, to the
hundredth (`wip/bug-161/feltg.mjs`, 220 kg welded box):

| case | joint force | load's Δv / dt |
|---|---|---|
| washboard ±4 cm at 15 m/s, peak | 0.78 g | 0.78 g |
| 0.15 m ledge at 15 m/s, peak | 3.39 g | 3.39 g |

On a body strike it reads almost nothing. In the cargo soak's worst capture (seed 198355854, the truck sideways at
13 m/s into a bank, `wip/bug-161/soak/r2/198355854-cargo-3.json`), the strike step stops the truck's sideways
8.5 m/s in one step:

| step | joint force | load's Δv / dt (accelerometer, incl. 1 g) |
|---|---|---|
| strike (367) | 0.47 g | 53.4 g |

Likely cause: Box3D reports the joint's force from the LAST substep. The tire and strut forces are ours and spread
evenly over the step, so every substep carries the same share and the last one is representative. A chassis contact
is solved inside the engine and lands in the first substep or two, so the last substep sees none of it. The adapter
already documents the same for contact impulses (`normalImpulse` is ~1/16 of the step at rest and 0 on the step a hit
lands).

The effect: a crash, a kerb strike on the body, or a landing that bottoms the chassis costs a fragile load nothing,
and the FEAT-139 g bar does not move.

## Fix (proposed)

Read the load's own Δv / dt in `_fragileStep` instead of the joint force: its velocity after the step minus its
velocity before it, over PHYSICS_DT. This is the quantity feltG already means (|a| of the load, 0 at rest). It is
identical in normal driving, so the tiers' calibration stands, and it sees strikes. It needs the load's velocity at the
start of each step (DebrisSystem.beforeStep already snapshots its pose).

## Owner call

Answered 2026-11-14: "yes, a crash breaks it" (DEC-168). A crash then breaks the statue. That is the honest outcome, but it is new behaviour for fragile jobs (53 g is far
past every tier's break g: 6.0–8.25 g). Recommend yes.

## Acceptance

- [x] A strike reads ≥ 40 g (rig: 22 mph wall, 55–63 g). Washboard and crest read as before, to the hundredth.
- [x] A gate pins both: fragile-cargo's new `strike` scenario beside its washboard / crest calibration.

## Log
- 2026-11-14: Lane B, land/phys-1114: feltG(v0, v1, dt) = the load's |Δv| / dt / g; main.js snapshots the load's velocity just
  before stepPhysics (_fragilePre). fragile-cargo: + `strike` scenario, every tier ≥ 40 g and broken (was 0.53 g on the piano);
  calibration unchanged. Note: the rig spawns the load at rest under a moving truck, so step 0 is not read; starting it at speed
  moves the piano's crest 75 % → 62 % (not taken). Closed.
