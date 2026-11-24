---
id: FEAT-326
type: feature
status: open
severity: major
opened: 2026-11-23
source: owner, 2026-11-23 — "Then we'll have to come up with a better boss fight."
---

# FEAT-326: The blasting run — one boss mission for the arc trial

## Next steps
- DESIGN ONLY. Nothing is built. The owner and the orchestrator are still in question rounds.
- Rigid-body ceiling measured (§ Research below): ≈ 300 rocks per slide (≤ 400 awake), ≈ 1500 total, one slide awake at a time.
  Owner calls it raises: a collider simpler than the drawn rock (12-vertex hull, 2.2× cheaper) and ~1500 rocks against DEC-400's 5–15.

## Summary
One pass-or-fail mission replaces the 5-mission expedition camp ending in the arc trial (FEAT-325). The player
drives a fixed-par stretch of road closed by five rock slides, throws charges to break each slide, and threads the
truck through the gap before nightfall.

## Description
The owner's goal is a run in three parts: maintenance days, upgrade days, boss. The boss must make the upgrades
feel necessary, "otherwise players might just hoard the cash", yet "always feel possible to win".

Design as agreed so far (owner's answers, 2026-11-23):
- **Goal.** Reach a party of the expedition that is cut off past the slides. "Reach the cutoff party is a compelling
  goal. I do like that it justifies only a truck wide passage is necessary."
- **Premise.** The slope is still moving. What is cleared by day is buried overnight, so the run goes end to end in
  one day. Owner: "yes".
- **Clock.** Nightfall, the existing day clock.
- **Why the player.** "you earned your reputation as a driver and nobody in the camp is confident enough to drive
  this mission themselves." The gate stays 6 good deeds (DEC-120).
- **Retry.** Failing does not end the run. "this mission is pass or fail. it cant cost you anything but the mission
  attempt." The truck keeps the damage it took; the charges are issued again. A crash can still end the run.
- **Ends on arrival.** No return leg. "we can sell the idea that the crew helped clear the rest of the rubble."
  All rubble is deleted on completion.
- **Slides.** Five. "The more consistency we can find across runs, the better." Par is held constant: "a steeper
  mission is allowed to be shorter than a flatter one."
- **Length.** "2x-3x a normal mission / all day."
- **Charges.** "more like 12 and slides requiring more than one charge to clear." Out of charges, the player may ram
  through: "as long as you can drive through you get the point."
- **Rocks.** "model larger rocks and have ~7 different sizes. The explosive could also split large rocks into smaller
  rocks. Then if it hits a small rock directly it just deletes it."
- **The loop.** "you throw the charges ahead of you and it breaks the rocks apart in a way that leaves a narrow gap
  … aim, throw, identify the opening, and maneuver the truck through it really quickly."
- **No fragile, no shock limit on the load.** "drop shock limit in favor of driving over rubble." The rubble tests
  the suspension and gives the lift kit a use.
- **Heavy load.** The standard suspension must manage it but struggle, so heavy-duty parts are the implicit
  recommendation.
- **Preparation card.** Before the mission, a card compares the truck's parts and condition, and the player's food
  and rest, against a recommended list. The player may go regardless. Wording is the owner's.
- **Explosions that push rigid bodies** are wanted beyond this mission.
- **The bypass guard.** More than 25 m from the road's edge for 5 s and the attempt is called off, after a warning.
  No teleport. Owner: "yes", "good". A reset to the road during the mission fails the attempt: "fail". Fixed rocks
  beside a slide are dressing only. The 25 m and 5 s are starting values to tune from the owner's first drive.
- Dropped: liquid cargo ("kill liquid"), the relief run, the gauntlet.

## Tracker
- [x] Rigid-body ceiling researched and measured (§ Research: rigid-body ceiling).
- [ ] Census: how much the route's bends and grade still vary at constant par, over random seeds.
- [ ] Seven rock sizes (asset tickets).
- [ ] Charges: throw, blast impulse, split and delete rules.
- [ ] Route pick, slide placement, clock, retry, rubble removal.
- [ ] Preparation card.

## Decisions
- Conflict to settle before building: DEC-425 limits story rock slides to three expedition missions.
- No decision record is written yet. These are trial-design answers; records follow if the owner adopts the trial.

## Open questions
- **Rigid-body ceiling.** Owner: "I know there are a lot of optimizations that could bring our max rigid body count
  up. For example, in the slide area we can grid it off into sections and rocks only have to check collisions with
  rigid bodies that are in neighboring cells. When the agent that is responsible for building rock slides looks
  into it, they should do research on this topic to determine what the right max number of entities is."
- Instant heal items in the boss: already instant everywhere in FEAT-325.

## Links
FEAT-325 (the arc trial build) · FEAT-103 (the 5-mission expedition camp, kept on main) · DEC-120 · DEC-425 ·
`src/debris.js` (rock slides today)

## Log
- 2026-11-23: design rounds with the owner; this ticket holds the state so far.
- 2026-11-24: rigid-body ceiling measured, `test/rigid-body-ceiling.mjs` (rainy-day). Node only, busy machine (load 3–5), 3 reps each.
  Not measured: GPU, browser timing, the unbuilt grid/move-event fixes.

## Research: rigid-body ceiling
2026-11-23/24, branch `scratch/feat-326-rigid-body-ceiling`, nothing in `src/` changed. Harness: `test/rigid-body-ceiling.mjs`
(rainy-day script, not a gate). Raw runs: `wip/feat-326/{qa,qb,lever}.jsonl` (git-invisible), tables by `wip/feat-326/sum.mjs`.
Timing was taken in node on this M4 Air while other lanes ran (load average 3–5 of 10 cores), so each case ran 3 times and
the spread is printed in brackets. Wall-clock ms follow the core clock macOS picks; read the spreads, not the third decimal.

### Answer first
- **One slide: about 300 rocks; never more than 400 in the slide the player is working on.** With the oblong, seven-size mix,
  300 rocks is about 170 t. That fills roughly 10 m of road, 7 m wide and 1.5 m deep, which blocks it.
- **Five slides: about 1500 rocks in total, with at most one slide awake at a time.** The other four are asleep, or not yet
  created. Slides must sit apart (a gap of open road between them), so each one is its own island. An island is the group of
  bodies that touch each other, directly or through a chain; the engine wakes and sleeps a whole island at once.
- Assumptions: this M4 Air; node runs the engine's WebAssembly (WASM, the compiled C engine) at about Chrome's speed, since both
  use the same V8 JavaScript engine; 8 engine substeps unchanged; hull colliders as built today; the slide may add 4 ms per step
  steady and 8 ms for the 1–3 s after a charge (the budget below). A machine with half this Mac's single-core speed has half
  the allowance, so halve every N.

### 1. What the engine already does (from the vendored bindings, `vendor/box3d/dist/`)
- **Broad phase: yes.** The broad phase is the first pass that finds which bodies could touch. Box3D's is a dynamic AABB tree.
  An AABB (axis-aligned bounding box) is a box around each shape, and the tree is a hierarchy of those boxes, so a lookup is
  about log N deep rather than a walk over all N. The tree is `b3DynamicTree` (its functions are strings in `box3d.wasm`). It
  shows in `b3World_GetCounters` (`treeHeight`, `staticTreeHeight`) and in `b3World_GetProfile` (`pairs`, `refit`). Only
  bodies that moved query the tree.
- **Islands and sleeping: yes, and both are on.** `b3DefaultWorldDef()` reads `enableSleep true` and `enableContinuous true`.
  The profile has `splitIslands` and `sleepIslands`, and `b3BodyMoveEvent` carries `fellAsleep`. The adapter keeps the
  defaults: `src/physics-engine.js` sets only gravity, `workerCount 0` (single-threaded, for determinism) and
  `restitutionThreshold 1.0`. Bodies are `canSleep = true` unless a caller says otherwise. The sleep threshold is the engine
  default, 0.05 m/s (`b3DefaultBodyDef().sleepThreshold`).
- **Solver:** one engine step per 1/60 s game step (`main.js` `PHYSICS_DT`), with **8 substeps** (`physics.js`
  `ENGINE_SUBSTEPS`). The solver is Box2D-v3 style "soft step", so there are no separate velocity or position iteration
  counts: substeps are the knob. Contact softness is the default: `contactHertz 30`, damping ratio 10, `contactSpeed 3`.
- Also in the bindings, and unused: `b3World_Explode`, a radial impulse with radius and falloff. The FEAT-326 charge could use
  it through an adapter call.

### 2. Rock slides today
- `src/rockslide.js` + `src/debris.js`. A slide is 5–15 rocks (`SLIDE.rocksMin/Max`, DEC-400). There are 6 variants of the
  scatter's blob, radius 0.15–0.32 m. Each collider is a convex hull of the 80-face blob's 42 vertices (MESH == PHYSICS).
  The rocks are granite at 2650 kg/m³, measured 25–330 kg, with friction 0.7 and restitution 0.15.
- Rocks are created when the director releases the slide, timed so they arrive with the truck. They are spawned **pinned**
  through `DebrisSystem.spawn`, which puts them outside `DEBRIS_CAP` (12). They sleep by the engine's default rule.
- They are removed by `_cleanup`: once their ground chunk has unloaded **and** 1.5 game hours have passed (`keepH`). If the
  ground unloads sooner, they are frozen (`setEnabled(false)`). At most 4 slides are kept.

### 3. Measured: step cost of a pile of N rocks
Setup: seed 1828043085's real world (terrain heightfield, road trimesh, props) at a straight road stretch at (−752, 607). The
rocks are spawned through the real `DebrisSystem`, pinned. Each step runs what `main.js` runs: `debris.beforeStep`, then
`stepPhysics`, then `debris.update`. The truck is parked 40 m back.
- **Piles.** `today` = a grid pile (9 across, 4 layers, 0.75 m pitch) of today's six sizes. `seven` = a sphere-stacked heap,
  7 m wide and about 1.5 m mean depth, of seven sizes. The seven sizes are long semi-axes 0.25, 0.325, 0.42, 0.55, 0.71, 0.92
  and 1.2 m, drawn 30 : 24 : 18 : 12 : 8 : 5 : 3, so there are fewer big ones.
- **Shapes.** `round` = today's blob (axes 1.1 : 0.9 : 1.0). `oblong` = the same blob at 2 : 1 : 1.3 (long : tall : wide), the
  owner's "oblong, somewhat stackable".
- **Masses** (measured largest, the rest scaled by r³). Oblong seven sizes: ≈ 65, 145, 310, 700, 1500, 3200 and 7200 kg; the
  biggest is 2.4 × 1.2 × 1.6 m. Round seven sizes run up to 22 t. Oblong today sizes are 20–107 kg, a third of round at the
  same long axis.
- **"slide ms"** = engine step (`b3World_GetProfile().step`) + debris JS (beforeStep + update) + the wheel walk. These are
  the costs the rocks add. The truck's own step is not in it: in node it is ~9 ms, because the headless rig's ground query is
  uncached, which is not the game. Its browser cost is in the budget (§4).
- **Wheel walk** = `contactSphere`, the wheel-vs-debris query. It walks **every dynamic body** 20 times a step; the harness
  times those 20 calls at the truck's hub spots.
- **States.** *rest* = 300 steps after the pile settled. *blast* = every rock kicked 6 m/s out from the pile centre plus 3 m/s
  up (the whole pile, the worst case), first 2 s. *plough* = the pile re-settled after the blast, then the truck driven
  through it at 30 km/h for 8 s.
- **Engine split** is the profile's broad phase (`pairs`), narrow phase (`collide`, the exact shape-vs-shape tests) and
  `solve`, as p50 over the blast's first 2 s.
- **Awake share** = the share of rocks awake at 1/3/5/10/15 s after the blast.
- **"touch/rock"** = touching contacts per rock at rest, from the engine's own body contact data. A rock-on-rock contact counts
  at both rocks; the ground counts once.

| shape/mix | N | mass p50 / max / sum kg | settle s | touch/rock | asleep after rest | rest slide ms p50 / p99 | blast 0–2 s slide p50 / p99 | blast 0–2 s engine: pairs / collide / solve | blast 15 s awake share at 1/3/5/10/15 s | plough slide p50 / p99 | wheel walk ms rest / plough | debris JS ms rest |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| round/today | 50 | 191 / 327 / 8801 | 11.5–30 | 2.26–2.8 | 0.98–1 | 0.046 / 0.073 (0.041–0.053) | 0.233 / 0.486 (0.217–0.25) | 0.017 / 0.087 / 0.1 | 1 / 0.96 / 0.66 / 0.2 / 0.04 | 0.079 / 0.209 (0.072–0.106) | 0.016 / 0.018 | 0.011 |
| round/today | 100 | 191 / 327 / 16955 | 21–30 | 3.05–3.13 | 0.99–1 | 0.089 / 0.12 (0.067–0.094) | 0.461 / 1.441 (0.459–0.474) | 0.03 / 0.188 / 0.186 | 1 / 0.95 / 0.55 / 0.25 / 0.05 | 0.108 / 0.186 (0.102–0.11) | 0.034 / 0.034 | 0.027 |
| round/today | 200 | 124 / 327 / 33614 | 15.5–21.5 | 3.37–3.46 | 1–1 | 0.193 / 0.499 (0.166–0.195) | 1.49 / 4.759 (1.336–2.253) | 0.106 / 0.735 / 0.486 | 1 / 0.93 / 0.53 / 0.24 / 0.06 | 0.321 / 0.608 (0.247–0.328) | 0.076 / 0.089 | 0.076 |
| round/today | 400 | 191 / 327 / 67879 | 18.5–30 | 3.7–3.78 | 0.1–1 | 0.417 / 0.656 (0.335–1.709) | 3.311 / 10.647 (3.148–3.355) | 0.198 / 1.803 / 0.951 | 1 / 0.91 / 0.48 / 0.2 / 0.07 | 0.536 / 1.575 (0.485–0.665) | 0.154 / 0.217 | 0.16 |
| round/today | 800 | 191 / 327 / 139894 | 19–30 | 3.8–3.94 | 1–1 | 1.001 / 3.4 (0.789–1.066) | 9.645 / 23.999 (8.164–15.854) | 0.477 / 5.683 / 2.292 | 1 / 0.93 / 0.45 / 0.11 / 0.06 | 1.109 / 4.53 (1.017–1.155) | 0.403 / 0.423 | 0.515 |
| round/today | 1600 | 191 / 327 / 279834 | 30–30 | 3.82–3.85 | 1–1 | 1.889 / 8.07 (1.682–2.999) | 24.935 / 60.941 (19.028–42.683) | 1.123 / 15.83 / 5.444 | 1 / 0.95 / 0.63 / 0.06 / 0.03 | 2.334 / 6.233 (2.11–2.376) | 0.854 / 0.847 | 0.954 |
| round/seven | 50 | 441 / 7869 / 65668 | 18–23.5 | 1.66–1.76 | 1–1 | 0.079 / 0.139 (0.069–0.079) | 0.336 / 0.514 (0.295–0.345) | 0.022 / 0.146 / 0.121 | 1 / 0.88 / 0.52 / 0.1 / 0.06 | 0.147 / 0.345 (0.127–0.157) | 0.02 / 0.024 | 0.022 |
| round/seven | 100 | 441 / 21989 / 144530 | 22–29.5 | 2–2.1 | 1–1 | 0.145 / 0.67 (0.111–0.157) | 0.865 / 1.684 (0.831–0.881) | 0.042 / 0.457 / 0.293 | 1 / 0.93 / 0.46 / 0.08 / 0.02 | 0.152 / 0.319 (0.14–0.201) | 0.052 / 0.039 | 0.051 |
| round/seven | 200 | 441 / 21989 / 370912 | 17–30 | 2–2.1 | 0.99–1 | 0.133 / 0.189 (0.123–0.151) | 1.167 / 2.017 (1.145–1.171) | 0.043 / 0.61 / 0.41 | 1 / 0.88 / 0.45 / 0.05 / 0.02 | 0.167 / 0.305 (0.146–0.267) | 0.068 / 0.069 | 0.047 |
| round/seven | 400 | 441 / 21989 / 675903 | 28–30 | 1.9–2.07 | 1–1 | 0.272 / 0.433 (0.221–0.319) | 2.514 / 4.207 (2.41–2.68) | 0.102 / 1.386 / 0.882 | 0.98 / 0.83 / 0.37 / 0.07 / 0.01 | 0.298 / 0.548 (0.298–0.324) | 0.136 / 0.141 | 0.107 |
| round/seven | 800 partly¹ | 441 / 21989 / 1520828 | 30–30 | 1.57–1.64 | 0.83–0.84 | 0.628 / 0.911 (0.517–0.849) | 4.603 / 7.687 (4.546–5.121) | 0.252 / 2.419 / 1.497 | 0.99 / 0.86 / 0.45 / 0.22 / 0.2 | 0.835 / 1.121 (0.698–0.841) | 0.275 / 0.289 | 0.221 |
| round/seven | 1600 INVALID¹ | 441 / 21989 / 3216469 | 30–30 | 0.76–0.79 | 0.39–0.43 | 2.054 / 2.786 (1.783–2.435) | 6.513 / 8.431 (6.244–6.765) | 0.608 / 2.705 / 1.817 | 0.99 / 0.93 / 0.74 / 0.63 / 0.62 | 2.43 / 3.533 (2.3–2.713) | 0.619 / 0.638 | 0.661 |
| oblong/today | 50 | 63 / 107 / 2889 | 8–30 | 2.1–2.52 | 0.98–1 | 0.047 / 0.077 (0.045–0.05) | 0.212 / 0.486 (0.211–0.233) | 0.014 / 0.063 / 0.103 | 1 / 0.9 / 0.5 / 0.12 / 0 | 0.076 / 0.152 (0.075–0.079) | 0.018 / 0.018 | 0.012 |
| oblong/today | 100 | 63 / 107 / 5566 | 6–30 | 2.85–3.11 | 1–1 | 0.074 / 0.097 (0.067–0.096) | 0.522 / 1.529 (0.464–0.523) | 0.032 / 0.192 / 0.218 | 1 / 0.8 / 0.38 / 0.09 / 0.02 | 0.106 / 0.182 (0.105–0.118) | 0.033 / 0.034 | 0.023 |
| oblong/today | 200 | 41 / 107 / 11035 | 6–30 | 2.85–3.23 | 0.99–1 | 0.132 / 0.164 (0.119–0.184) | 0.979 / 3.212 (0.956–1.139) | 0.054 / 0.408 / 0.41 | 1 / 0.82 / 0.32 / 0.14 / 0.05 | 0.211 / 0.454 (0.183–0.235) | 0.068 / 0.075 | 0.044 |
| oblong/today | 400 | 63 / 107 / 22283 | 6–30 | 3.25–3.37 | 1–1 | 0.347 / 0.585 (0.336–0.521) | 2.953 / 8.201 (2.945–3.107) | 0.16 / 1.419 / 1.038 | 1 / 0.75 / 0.25 / 0.08 / 0.02 | 0.621 / 1.088 (0.606–0.678) | 0.154 / 0.213 | 0.167 |
| oblong/today | 800 | 63 / 107 / 45925 | 9.5–30 | 3.26–3.33 | 1–1 | 0.842 / 2.3 (0.674–0.869) | 7.364 / 20.24 (7.267–8.157) | 0.365 / 4.054 / 2.331 | 1 / 0.71 / 0.17 / 0.05 / 0.01 | 1.177 / 2.616 (0.986–1.595) | 0.351 / 0.413 | 0.435 |
| oblong/today | 1600 | 63 / 107 / 91865 | 30–30 | 3.26–3.34 | 0.21–1 | 2.081 / 8.235 (1.557–6.737) | 20.472 / 64.622 (16.923–30.159) | 0.789 / 11.545 / 5.493 | 1 / 0.74 / 0.17 / 0.03 / 0.01 | 2.665 / 10.918 (2.348–5.133) | 0.875 / 1.035 | 1.099 |
| oblong/seven | 50 | 145 / 2583 / 21558 | 11.5–30 | 1.6–2.24 | 0.98–1 | 0.082 / 0.189 (0.073–0.084) | 0.388 / 0.764 (0.32–0.492) | 0.028 / 0.141 / 0.161 | 1 / 0.8 / 0.32 / 0.04 / 0.02 | 0.137 / 0.377 (0.135–0.146) | 0.021 / 0.023 | 0.023 |
| oblong/seven | 100 | 145 / 7219 / 47447 | 18–23.5 | 2.13–2.35 | 1–1 | 0.125 / 0.332 (0.106–0.131) | 0.798 / 1.621 (0.764–0.921) | 0.036 / 0.388 / 0.298 | 1 / 0.65 / 0.18 / 0.06 / 0.02 | 0.208 / 0.643 (0.201–0.229) | 0.045 / 0.065 | 0.042 |
| oblong/seven | 200 | 145 / 7219 / 121764 | 30–30 | 2.21–2.34 | 0.99–0.99 | 0.182 / 0.474 (0.141–0.219) | 1.805 / 3.012 (1.142–2.239) | 0.069 / 0.951 / 0.605 | 1 / 0.65 / 0.16 / 0.04 / 0.02 | 0.269 / 0.568 (0.204–0.305) | 0.068 / 0.098 | 0.076 |
| oblong/seven | 400 | 145 / 7219 / 221887 | 19.5–30 | 2.25–2.42 | 0.99–1 | 0.269 / 0.498 (0.217–0.284) | 2.5 / 4.816 (2.457–2.602) | 0.073 / 1.285 / 0.944 | 1 / 0.64 / 0.19 / 0.03 / 0.01 | 0.311 / 0.593 (0.286–0.334) | 0.132 / 0.143 | 0.106 |
| oblong/seven | 800 | 145 / 7219 / 499262 | 30–30 | 2.04–2.22 | 1–1 | 0.522 / 0.744 (0.462–0.751) | 5.68 / 9.933 (5.317–6.45) | 0.208 / 2.95 / 2.093 | 1 / 0.66 / 0.19 / 0.04 / 0.02 | 0.72 / 1.114 (0.633–0.831) | 0.268 / 0.31 | 0.21 |
| oblong/seven | 1600 INVALID¹ | 145 / 7219 / 1055911 | 30–30 | 1.38–1.51 | 0.69–0.72 | 1.51 / 1.927 (1.467–1.701) | 9.332 / 15.037 (9.282–10.086) | 0.563 / 4.258 / 3.158 | 1 / 0.83 / 0.42 / 0.34 / 0.34 | 1.879 / 2.468 (1.784–2.012) | 0.591 / 0.624 | 0.53 |

¹ INVALID: the seven-size heap at 1600 rocks ran 120–190 m along the road, past the harness's streamed collider ring
(±1 chunk), so rocks fell off the ground (touch/rock 0.8–1.5, a third never sleeps). Round/seven 800 is borderline, at about 75–95 m.
A single slide is far smaller than either, so these rows only bound the five-slide total.

**Lever mode.** No truck (chassis disabled), `engine.step` alone, the grid pile of today's six sizes in each collider shape.
*blast 15 s total* is the engine time summed over the 15 s after the whole-pile blast: the honest cost of one blast.
*R 3 m* = a local charge (only rocks within 3 m, Δv falling to 0 at 3 m). *asleep / disabled / empty* = the engine step with
the pile asleep, with every rock `setEnabled(false)`, and with the rocks destroyed.


| lever case | settle s | contacts (pairs) | touch/rock | asleep after rest | rest ms p50 | blast ms p50 / p99 | blast 15 s total ms | awake 1/3/5/10/15 s | asleep / disabled / empty ms |
|---|---|---|---|---|---|---|---|---|---|
| hull42 (baseline) N 1600 | 25–30 | 16307 | 3.83 | 1–1 | 0.007 | 0.516 / 19.309 (0.506–0.532) | 3193 (3144–3328) | 1 / 0.95 / 0.69 / 0.05 / 0.03 | 0.007 / 0.006 / 0.006 |
| oblong hull42 (2:1:1.3) N 1600 | 30–30 | 11748 | 3.25 | 0.99–1 | 0.018 | 0.334 / 17.322 (0.276–0.914) | 2294 (2254–2542) | 1 / 0.71 / 0.14 / 0.04 / 0.02 | 0.059 / 0.006 / 0.006 |
| hull12 N 1600 | 7–9.5 | 14200 | 3.5 | 1–1 | 0.007 | 0.116 / 9.262 (0.103–0.128) | 1426 (1395–1498) | 1 / 0.72 / 0.05 / 0.01 / 0 | 0.006 / 0.006 / 0.006 |
| hull42 (baseline) N 400 | 23–30 | 3805 | 3.69 | 1–1 | 0.009 | 0.45 / 3.311 (0.422–0.478) | 742 (722–750) | 1 / 0.91 / 0.45 / 0.21 / 0.1 | 0.007 / 0.006 / 0.007 |
| oblong hull42 (2:1:1.3) N 400 | 30–30 | 2856 | 3.22 | 0.99–0.99 | 0.014 | 0.229 / 2.861 (0.215–0.261) | 520 (502–543) | 1 / 0.72 / 0.24 / 0.11 / 0.05 | 0.023 / 0.006 / 0.006 |
| hull12 N 400 | 4.5–5 | 3375 | 3.33 | 1–1 | 0.006 | 0.162 / 1.846 (0.117–0.174) | 339 (338–350) | 1 / 0.61 / 0.18 / 0.05 / 0.01 | 0.007 / 0.007 / 0.006 |
| sphere N 400 | 30–30 | 607 | 1.39 | 0.32–0.34 | 0.173 | 0.462 / 0.516 (0.457–0.463) | 394 (366–417) | 1 / 1 / 1 / 1 / 0.69 | 0.154 / 0.006 / 0.006 |
| box N 400 | 4–6 | 2418 | 3.31 | 1–1 | 0.006 | 0.058 / 1.374 (0.032–0.084) | 237 (233–244) | 1 / 0.42 / 0.06 / 0.01 / 0 | 0.006 / 0.006 / 0.006 |
| sphere N 1600 | 30–30 | 6867 | 3.25 | 0–0.72 | 3.223 | 3.306 / 3.799 (3.044–3.637) | 2997 (2769–3359) | 1 / 1 / 1 / 1 / 1 | 0.342 / 0.007 / 0.007 |
| hull42 substeps 4 N 400 | 18–30 | 3855 | 3.68 | 1–1 | 0.005 | 0.352 / 3.206 (0.318–0.386) | 615 (610–619) | 1 / 0.91 / 0.48 / 0.15 / 0.06 | 0.006 / 0.005 / 0.005 |
| hull42 sleep threshold 0.15 m/s N 400 | 20.5–26.5 | 3861 | 3.73 | 1–1 | 0.006 | 0.438 / 3.398 (0.433–0.51) | 727 (706–727) | 1 / 0.9 / 0.41 / 0.21 / 0.07 | 0.007 / 0.007 / 0.006 |
| hull42 sleep threshold 0.3 m/s N 400 | 24.5–30 | 3824 | 3.7 | 1–1 | 0.007 | 0.464 / 3.68 (0.427–0.491) | 743 (731–788) | 1 / 0.88 / 0.48 / 0.18 / 0.1 | 0.01 / 0.007 / 0.007 |
| hull42 charge R 3 m N 400 | 23–30 | 3844 | 3.68 | 1–1 | 0.008 | 0.01 / 3.354 (0.01–1.163) | 443 (409–936) | 0.9 / 0.9 / 0 / 0 / 0 | 0.008 / 0.007 / 0.006 |
| box N 1600 | 5–6 | 10542 | 3.69 | 1–1 | 0.006 | 0.033 / 5.806 (0.028–0.033) | 1189 (1184–1313) | 1 / 0.87 / 0.32 / 0 / 0 | 0.006 / 0.006 / 0.006 |
| hull42 substeps 4 N 1600 | 22–30 | 16119 | 3.79 | 1–1 | 0.006 | 0.479 / 16.397 (0.396–0.5) | 2434 (2428–2442) | 1 / 0.95 / 0.59 / 0.07 / 0.03 | 0.006 / 0.004 / 0.004 |
| hull42 sleep threshold 0.15 m/s N 1600 | 11.5–30 | 16232 | 3.79 | 1–1 | 0.006 | 1.054 / 17.496 (0.534–1.609) | 3015 (2968–3100) | 1 / 0.94 / 0.49 / 0.06 / 0.03 | 0.009 / 0.006 / 0.006 |
| hull42 sleep threshold 0.3 m/s N 1600 | 24.5–30 | 16236 | 3.78 | 1–1 | 0.008 | 0.561 / 17.198 (0.554–0.793) | 2928 (2834–3021) | 1 / 0.94 / 0.6 / 0.06 / 0.03 | 0.012 / 0.006 / 0.006 |
| hull42 charge R 3 m N 1600 | 21.5–30 | 16344 | 3.79 | 1–1 | 0.008 | 0.01 / 5.686 (0.006–0.01) | 1300 (985–1520) | 0.9 / 0.9 / 0 / 0 / 0 | 0.01 / 0.006 / 0.006 |

**What the numbers say**
- **Asleep rocks cost the engine nothing.** At 1600 rocks asleep the step is 0.007 ms, the same as an empty world (0.006).
  Disabled is the same. At rest, ~95 % of the pile's cost is **our own JavaScript**. At 1600 rocks: wheel walk 0.85–1.3 ms,
  debris sync 0.95–1.5 ms, engine 0.05–0.09 ms. Both are linear in N: about 0.5 µs per rock per step for the walk, and about
  0.6 µs for the sync.
- **Awake rocks** cost the engine about 7 µs each per step while they fly, up to 400. Past 400 a whole-pile blast is
  superlinear (it grows faster than N): 800 costs 2.5–3× what 400 does, and 1600 costs 17–40 ms. The narrow phase (`collide`)
  is 60–70 % of an awake step, and the broad phase (`pairs`) is 5–8 %.
- **Sleeping over time:** after a whole-pile blast, 30–50 % of rocks are still awake at 5 s and 2–10 % at 15 s. A pile is
  **one island**. A local 3 m charge still woke 90 % of a touching pile at 1 s. The upside is that the pile then fell asleep
  as a unit by 5 s. One creeping rock keeps its whole island awake, which is why settling often took 20–30 s.
- **Oblong stacks sleep and stay asleep.** After the 300-step rest window, 0.99–1.0 of the rocks were asleep in every valid
  oblong run but one: oblong/today 1600, rep 0.21. **Touching contacts per rock:** round 3.7–3.9 (grid pile), oblong
  3.25–3.35 (grid pile), oblong seven-size heap 2.0–2.4, round heap 1.9–2.1. So here the oblong rocks did **not** carry more
  contacts per body than the round ones; the size mix lowers it further. The per-contact manifold point count was not read.
- **The plough is cheap:** 0.3 ms p50 at 400 rocks. The truck wakes only the rocks it touches, because after a blast the
  rubble is many small islands. Caveat: the plough ran through post-blast rubble. A truck shoved into an intact,
  road-blocking heap was not measured.

### 4. The budget
- Fixed step: `PHYSICS_DT` = 1/60 s, one engine step of 8 substeps. If one step takes longer than 16.7 ms, the accumulator owes
  two steps the next frame. That is how a heavy pile turns into a frame-rate collapse rather than a single slow frame.
- **Truck alone, in the browser** (PERF-40 bench, main @ a7a241e8, 2026-11-21, this M4 Air): physics 57 ms/s driving, about
  **0.95 ms per step** median. The worst seconds reach 144 ms/s, about 2.4 ms per step. The whole main thread is 188 ms/s,
  about **3.1 ms per frame**, out of 16.7 ms.
- **Allowance for a slide: 4 ms per step steady, 8 ms for the 1–3 s after a charge.** That leaves at least 9 ms of the frame
  for the truck, render submission, streaming spikes and garbage collection (GC, the JavaScript runtime pausing to reclaim
  memory). It also leaves room for the 2–5× core-clock swing macOS applies. A weaker laptop has less: at half the single-core
  speed the allowance is 2 / 4 ms.
- **N awake at once** that fits (blast first 2 s, p50 ≤ 4 and p99 ≤ 8 ms): round/today **≈ 250**, oblong/today **≈ 300**,
  oblong/seven **≈ 400–500**.
- **N in total with most asleep:** 1600 resting rocks cost 1.5–2.1 ms today, all of it JavaScript, so **≈ 1500–2000**. With
  the two JavaScript fixes below the engine part is ~0, and the limit moves to memory and draw calls.

### 5. Levers, ranked by measured gain
| # | Lever | Measured | Verdict |
|---|---|---|---|
| 1 | Keep slides apart, and asleep or uncreated until approached | Asleep = disabled = empty: 0.006–0.007 ms at 1600. A local 3 m charge vs the whole pile: 742 → 443 ms per blast at N 400, 3193 → 1300 at 1600, and asleep at 5 s instead of 15. | The biggest lever. Slides need gaps so each is its own island, and one charge wakes its whole slide, so cap a slide at the awake budget (≤ 400). |
| 2 | Simpler collider | Engine ms per blast at N 400: hull42 742 · oblong hull42 520 · **hull12 339 (2.2×)** · **box 237 (3.1×)** · sphere 394. hull12 and box settle in 4–9 s vs 23–30. | A 12-vertex hull (the subdiv-0 blob) is the cheap win. **Spheres are the worst:** they roll on the road and never sleep (rest 3.2 ms at 1600 vs 0.007). A hull simpler than the drawn mesh breaks MESH == PHYSICS exactly, so that is an owner call. |
| 3 | Our own JavaScript: the wheel walk and the debris sync | 1.8–2.8 ms of the 1600-rock rest cost; scales linearly. | **This is where the owner's grid idea applies.** `contactSphere` walks every dynamic body 20× per step, and a grid of cells would cut that to the rocks near the wheels. Sync only the bodies in the engine's `b3BodyMoveEvent` list (it lists only bodies that moved). Est. gain ~1.8–2.8 ms → ~0 at 1600; not built. |
| 4 | Substeps 8 → 4 | Per blast: 742 → 615 ms (−17 %) at N 400, 3193 → 2434 (−24 %) at 1600 | World-wide: it changes the truck too (`physics.js` Step 3e explains the 8). Not recommended. |
| 5 | Sleep threshold 0.05 → 0.15 / 0.3 m/s | 742 → 727 / 743 ms at N 400; 3193 → 3015 / 2928 at 1600, within the spread | No gain. The island's time-to-sleep decides, not the threshold. |
| 6 | Split only on blast, delete small rocks | Spawn costs ≈ 0.05 ms a rock (1600 in 80–280 ms); cost ∝ N awake | Spawning fragments only when a charge hits is free until then. A split of 50 rocks costs ~2.5 ms in one frame: spread it over 2–3 frames. Deleting a small rock removes its share outright. |
| — | A grid for rock-vs-rock collision (the owner's idea, inside the engine) | `pairs` is 5–8 % of an awake step | **Already done** by the engine's AABB tree, so a grid would not beat it. The cost is the narrow phase, which lever 2 attacks. |

### 6. Rendering (not benchmarked)
`DebrisSystem.spawn` clones the template per body, which is **one Mesh, so one draw call, per rock**. A draw call is one
command the CPU (central processor) sends the GPU (graphics card) to draw one object. The geometry is shared per size and the
material per slide. Three.js frustum-culls each mesh, skipping it when it is outside the camera's view. Rocks receive shadows
and cast none, so there is no extra shadow pass. 1500 rocks in view would be 1500 draw calls. An `InstancedMesh` per size would
make it 7: an InstancedMesh draws many copies of one mesh in a single call.

### Not measured
GPU time and draw-call cost; browser timing (node only; the truck's browser cost comes from PERF-40); the two JavaScript fixes
(grid walk, move-event sync), which are not built; `b3World_Explode`; a truck stopped by an intact blocking heap; contact
manifold points; seven-size piles over ~800 rocks (they ran off the harness's collider).
