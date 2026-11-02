---
id: FEAT-158
type: feature
status: open
severity: major
opened: 2026-11-01
source: owner play-test of BUG-99 on :3282, 2026-11-01 — "At really low speeds, interactions with rocks
  still feels a bit simple. The truck hardly ever climbs over them. I think it's time to attempt adding
  tire friction on rocks. I think rock friction on road is also a natural thing to put in there. So long
  as neither of these are performance hogs"
relates: BUG-99 (closed — its 2026-11-01 work log is the starting point), BUG-38 (one Pacejka patch per
  wheel), the rock proxy in src/physics.js Step 0.5 (`proxyGround`, `qcPlus`)
---

# FEAT-158 — rock grip: the tire climbs rocks, rocks grip the road (crawling)

A tire pressed against a rock face has no grip on it (BUG-38's single patch sits on the road), and a
rock pressed into the road has only its own weight's friction (the engine no longer sees it driven in,
since BUG-99). So at a crawl the truck shoves rocks instead of climbing them. Needed now for slow-speed
feel, later for crawling.

## What was learned (BUG-99 work log 2026-11-01; code parked on `wip/bug99-rock-grip`, 48f2c41d)

- Road friction in the proxy + a second tire patch on the rock face (own slip state, load, face
  tangent frame, both in the ω Newton) were built. Grip alone does nothing to a free rock; with road
  friction a light rock pivots on its base (≈1.4 kg effective mass at the tire for a 9 kg rock) and the
  proxy's EXPLICIT per-substep coupling slingshots it (2 mph → 22 m/s).
- A single shared slip state across road + face does not work (the two want different ω; the wheel
  reversed in three steps).

## Approach

Solve the tire–rock–road contact IMPLICITLY each substep — the tire normal force evaluated at the
rock's end-of-substep yield, with the road's constraints (normal + friction) in the rock's effective
mass — then re-land the parked road friction and second patch on top of it.

## Acceptance

- `node test/census-rock-strike.mjs --nopop --speeds=2,5,10 --big`: the struck hub climbs (rises > 5 cm)
  over the 0.6–0.8× rocks at 2–5 mph in most hits (baseline 0 / 270), rocks pushed > 1 m drop well
  below the baseline 74 / 175 / 270, rock exit ≤ 2× truck speed.
- `--big` at 5–55 mph: 0 flips, the pop curve within a few points of 0/…/3/6/23/33/53 %.
- Physics fingerprint (no debris) identical; no measurable frame cost (a few dozen flops per wheel on a rock).
- Owner play-test at a crawl.

## Work log — 2026-11-02 (Lane B)

**Why the parked attempt failed, measured.** Three separate faults, not one:
1. The second Pacejka patch ran once per 1/60 s and built grip over the relaxation length (≈0.16 s
   at a crawl), while the normal push acted every substep — the rock was rolled away before any grip
   existed. Once saturated it handed a pivoting rock μ·N for a whole step (60 N·s on 9 kg).
2. `proxyGround` was not a real solver: a support's push could only grow within a sweep, so one
   point over-corrected another and lifted the rock; and it solved on this step's velocity CHANGE
   only, so a rock already sliding under a 6 kN press kept sliding (the engine's friction knows only
   its weight). Isolated test (one rock, steady tire-like push with grip): the engine alone holds it
   after a 6 cm settle; the old proxy flung it to 178 m/s; the fixed proxy settles like the engine.
3. When the tire climbed fully onto the rock, the rock became the Pacejka SUPPORT: frictionless
   through the substeps (it rolled out under the tire at 61 rad/s), then explicit per step, and its
   reaction went straight to the engine past the proxy (3–4 kN on a 9 kg rock held only by its weight).

**What is in the working tree (feature/machine, uncommitted at the time of writing):**
- `rockGrip` (physics.js Step 0.5): Coulomb friction between the tire and EVERY rock it touches, per
  substep, at velocity level — the impulse that stops the tire surface sliding over the rock, against
  the rock's compliance with its ground holding it (`proxyYield`, a unit-impulse probe through
  `proxyGround`) plus the wheel's spin compliance, capped at μ·Fn·sdt (μ = the tire's own peak μ).
  Implicit: it can stop a slide but never reverse it. Reaction: strut-axis part to the hub (next
  substep, `params._rockGripUp`), the rest to the body via `_hubNormalXZ`, the torque to ω (`rockSpin`).
- The Step 3 Pacejka patch rides the road/terrain only (never a rock), with the road's load
  (`Fn − rockLoad`). The FEAT-48 relative-velocity support branch is deleted.
- `proxyGround`: road friction (the engine's mixed μ via `staticSupports`), projected Gauss–Seidel
  (clamped accumulated sums), on the WHOLE point velocity (engine start velocity + change).
- Implicit normal (suspension.js): a debris contact's spring and damper scaled by
  1/(1 + (k·sdt + c)·sdt·y), y = the rock's yield along −n. Without it, a base-held rock pivots at
  ≈1 kg effective mass and the explicit substep push pumps it (30 mph → a 9 kg rock at 73 m/s).
- Census: `--rear` (the rock just ahead of the driven rear-left tire); rows print climb and moved.

**Measured (all `--big`, 270 hits per speed):**

| | 2 mph | 5 mph | 10 mph |
|---|---|---|---|
| climbs > 5 cm, front (undriven) — main | 0 | 0 | 0 |
| climbs > 5 cm, front — branch | 59 | 137 | 227 |
| climbs > 5 cm, rear (driven) — main | 0 | 0 | 0 |
| climbs > 5 cm, rear — branch | 165 | 229 | 165 |
| rock moved > 1 m, front — main / branch | 74 / 184 | 175 / 226 | 270 / 233 |
| rock exit max ÷ truck speed — main / branch | 1.8 / 2.5 | 1.9 / 2.7 | 1.6 / 2.7 |

The front-left wheel the census strikes is UNDRIVEN (RWD): a free wheel has no torque to react face
friction, so in steady state its grip on a face is ≈ 0 and a round rock the tire presses down-forward
squeezes out ahead (the > 2× exits are these). Rocks moved > 1 m therefore rise at 2–5 mph.

**The cost at speed (owner call).** Pops by speed, punctures off, thresholds applied offline (% of 270):

| | 30 | 35 | 40 | 45 | 50 | 55 mph |
|---|---|---|---|---|---|---|
| main, 800 J | 0 | 3 | 6 | 23 | 33 | 53 |
| branch, 800 J | 14 | 31 | 49 | 57 | 64 | 67 |
| branch, 2000 J | 0 | 8 | 16 | 24 | 28 | 52 |
| branch, 2500 J | 0 | 4 | 9 | 14 | 19 | 40 |

Impact flips (punctures off): main 0; branch 2 at 50 mph, 2 at 55 (of 270 each). Rock max 31–52 m/s
(main 16–67). Ablation: with road friction removed from the proxy the pinch curve returns to main's
— and the crawl climbs drop to 0. Road friction is what makes a rock climbable AND what makes it hit
harder: on main a pressed rock skated with only its weight's friction ("weightless", owner 10-29).
`damage-hazard-puncture` goes red on its 20–30 mph bound (8 of 21 lines pop at 30 mph). Physics
fingerprint (no debris) identical to main; other affected gates green; step cost unchanged (0.06 ms).

## Work log — 2026-11-02, second session (Lane B, after the crash)

The working tree above survived the crash; merged main twice around it (BUG-54/89, FEAT-138/150/159
landed meanwhile — no conflicts). Re-measured on the merged tree: same picture as above.

**Two flips traced (50 mph, 29–40 kg rocks).** The first hit leaves the rock at ~0.65× truck speed
(road friction takes part of the push), the tire overruns it, and `proxyGround` then pins it: the
tire presses down at ~45°, friction holds the base, the rock pivots on its front edge and leaves the
step 10 m/s UPWARD under the wheel → 161 kN on the bump stop → roll 3.7 rad/s. The proxy held the
base with the start-of-step contact points for the whole step, while the rock was turning ~1 rad.

**Fix (in the tree):** the supports ride with the rock within the step — each support's offset is
carried by the rotation so far (small angle, `p.Th`), and a support that has LIFTED (`p.D` + rotation
along n > 0) holds nothing unless it would touch down within the substep (speculative contact:
vn ≥ −gap/sdt). A lifted base stops gripping, as a real one does. Pushes go to the engine at the
carried points.

**Measured, all `--big --nopop`, 270 hits per speed:**

| | main | before the fix | after |
|---|---|---|---|
| front climbs > 5 cm, 2 / 5 / 10 mph | 0 / 0 / 0 | 50 / 136 / 243 | 24 / 150 / 227 |
| rear (driven) climbs, 2 / 5 / 10 mph | — | 178 / 228 / 176 | 120 / 259 / 198 |
| front rock moved > 1 m | 74 / 175 / 270 | 187 / 225 / 237 | 163 / 210 / 221 |
| rear rock moved > 1 m | — | 157 / 138 / 242 | 149 / 98 / 209 |
| crawl exits > 2× truck speed (of 810) | 0 (max 1.89) | 17 (max 2.76) | 7 (max 3.03, one 9 kg rock) |
| flips 25–55 mph (of 1890) | 0 | 4 | 2 (40 kg rocks at 50 and 55) |

Pops vs threshold (offline, `--nopop`), 25…55 mph: 800 J 0/14/24/47/48/56/62 %, 1500 J
0/2/11/20/31/32/55, **2000 J 0/0/7/11/19/21/45**, 2500 J 0/0/3/8/11/15/38 (main, 800 J:
0/0/3/6/23/33/53). Pops-on census at 2000 J: 0/0/19/30/51/56/122 of 270, **1 flip** (50 mph).
Rim damage: small dings now common at 25–35 mph (59–121 of 270 hits, mean 0.6–1.7 %; main ≈ 0), and
lighter at 55 mph (mean 2.1 % vs main 7.9 %).

**Why front rocks still move more than main.** The front-left is UNDRIVEN. A free wheel has no
torque to sustain face friction, so it climbs only on the normal force, and a loose rock held by
μ ≈ 0.79 stays put only if the push is steeper than ~51° below horizontal — for a rock taller than
~8 cm on a 0.37 m tire it is not. Bulldozing loose rocks taller than a hand with a free wheel is the
honest result; on main they squirted aside because they skated on their own weight. The acceptance
row "rocks moved > 1 m drop well below baseline" assumed otherwise; the owner's ask was climbing.

**[DEFAULT] `hazardPinchEnergyJ` 800 → 2000 J** (damage.js, table in the comment) — the rows that
fitted 800 J were measured on the skating rock. `damage-hazard-puncture` green at 2000 J (0 of 21
lines pop at 20–30 mph, 14 of 14 at 40–50). Physics fingerprint (no debris) identical to main;
affected gates 36/36 green.

**Approximations, flagged:** the proxy is linear within a substep (small-angle rotation); its
ground supports are the engine's start-of-step contact points (now carried and dropped when
lifted, but no NEW point can appear within a step); the tire is a sphere for debris contact.

**Owed to the owner:** (1) the pinch threshold — 2000 J [DEFAULT] or another row; (2) whether
1 flip in 270 hits at 50 mph into a 40 kg rock as tall as the tire's radius is acceptable (main: 0;
the rock no longer skates away, so the corner runs over it); (3) the crawl play-test on :3282.
