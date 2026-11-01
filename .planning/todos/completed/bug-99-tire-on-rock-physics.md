---
id: BUG-99
type: bug
status: closed
closed: 2026-11-01
severity: major
opened: 2026-10-29
source: owner play-test of FEAT-93 on feature/machine (:3282), 2026-10-29 — recorded verbatim below
relates: FEAT-93 (hazard punctures), FEAT-94 (driving on a flat), QUAL-25 (wheel hard cores),
  FEAT-48 (Box3D adapter), the soft-path debris contact in src/physics.js Step 0.5
invariants: CLAUDE.md core value — "physics that feel honest"; feedback_fix_root_not_symptom
---

# BUG-99: tire-on-rock physics — flips on a pop, a one-frame stutter, rocks yeeted at a crawl

## The owner's words (verbatim, 2026-10-29)

> Testing on 3282 because main might move as other agents merge
>
> Initial reaction
> below 30 usually theres no pop and no damage. this is fine
> one time i had wheel damage and no pop around 30-40mph also fine
> usually above 30mph you get a puncture and 4/5 times it also flips the car. flipping is most significant undesired behavior. i suspect it has to do with how we handle physics of rock on wheel when a collision is detected. I think in real life a 30 kilogram wheel entire is more than happy to move out of the way of a 30 kilogram rock instead of flipping the car especially at high speeds
>
> if i could have everything i wanted, i would want <30 to be non-pop, sometimes wheel damage. >30 wheel damage sometimes pop. >45 pop most of the time. I do not want this behavior to be determined from speed directly, but rather as a natural fallout of the physics system. Small deviations are fine if the physics and damage are honest.
>
> I also noticed a very small stutter when hitting a rock at speed, like maybe one frame where it seems like the truck stops moving and then resumes at the same speed. My gut feel is that there's something not quite right with the physics here. I will say at very low speeds it doesn't seem like rocks randomly damaged or pop wheels which is great. However, sometimes below 10 miles an hour The tire yeets a rock out super fast which doesnt feel super realistic. its pretty unpredictable as to when it happens.
>
> Record these thoughts verbatim and procure a handoff so I can clear context and send the next agent after chasing this particular bug and behavior class. I'd like to really refine tire on rock physics so that the popping mechanic feels fair and fun.

## The three defects, ranked by the owner

1. **Flip on a pop (most important).** Above ~30 mph a rock strike pops the tire and flips the
   truck about 4 times in 5.
2. **One-frame stutter** on a rock hit at speed: the truck seems to stop for a frame, then resumes at
   the same speed.
3. **Rock yeeted at a crawl.** Below ~10 mph the tire sometimes throws a rock out very fast,
   unpredictably.

## Target (the owner's, as an OUTCOME — never as a speed rule)

| speed | wanted |
|---|---|
| < 30 mph | no pop; sometimes wheel damage |
| > 30 mph | wheel damage; sometimes a pop |
| > 45 mph | a pop most of the time |
| any | no flip from a rock alone |

**It must fall out of the physics.** No speed term in the pop or damage law. Small deviations are
fine if the physics and the damage are honest.

## What is already right (keep it)

- Below 30 mph: usually no pop and no damage.
- At very low speed rocks do not randomly damage or pop wheels.
- 30–40 mph: occasional wheel damage with no pop.

## Leads (from the session that filed this — VERIFY, do not trust)

- **The core is rigid to the chassis.** The wheel hard core (`src/physics.js` `wheelCorePoints`,
  added at `createVehicleChassis`) is a hull on the CHASSIS body: about 2000 kg, rigid. When a rock
  reaches it, Box3D solves the impulse against the whole truck at the wheel's position, with a lever
  arm to the CG. There is no unsprung mass and no suspension travel in that path. A real ~30 kg wheel
  would move up on its spring and take that hit. This is the owner's own hypothesis, and the
  likeliest root of the flips.
- **The core is rebuilt as the strut moves.** `updateWheelRims` rebuilds it (`replaceHullLocal`)
  whenever the hub has moved more than 4 mm (`RIM_REBUILD_M`). If that happens while a rock is in
  contact, the contact geometry jumps between two steps, and Box3D's push-out of a fresh overlap
  could explain a rock **yeeted at a crawl**. Check whether the yeets line up with rebuild steps.
- **Two contact paths act on one rock.** The soft path (our tire spring–damper vs the rock through
  `engine.contactSphere`, applied equal and opposite to the rock) and the engine's core contact
  can both act on the same rock in the same step. Check whether they double-count.
- **The stutter.** First tell a render hitch from a physics event. Play with `?hitch=20` and call
  `window.__hitchDump()`. A first lamp-state shader compile used to look exactly like this, but
  the owner's test ran on :3282, which already had the BUG-98 fix. So a physics cause is more
  likely: a huge core impulse taking the chassis to ~0 velocity for a step. Log the chassis velocity
  per step around the hit.
- **Pop threshold.** `hazardPunctureMult` = 30× the static wheel load, about 100 kN, read from the
  core force against HAZARD bodies only (`vehicleState.rimHazard`). The force on a rigid core is
  very different from the force on a sprung wheel. If the core gets proper compliance, re-measure
  before keeping that number. The FEAT-93 ticket has the crawl-spike measurements behind it.

## Tools

- In game: debug **F** throws a rock. Test on the lane's worktree server, not main.
- `test/damage-hazard-puncture.mjs` — the FEAT-93 headless gate.
- `test/fingerprint-physics.mjs` — physics identity proof (expect a change here; say why).
- `test/assert-m4-*.mjs` — rainy-day physics behaviour scripts.

## Acceptance

- [ ] A headless rock-strike census (several rock sizes and approach angles at 10/20/30/40/50 mph)
      shows the target table emerging, with the pop law unchanged in form (force on the tire, no
      speed term).
- [ ] No flip from a single rock strike at any speed on flat ground, across that census.
- [ ] No one-frame velocity drop on the chassis at a strike (per-step velocity logged).
- [ ] No rock leaves a crawl-speed (< 10 mph) contact faster than physically plausible
      (rock exit speed bounded by roughly the wheel's surface speed plus the spring's stored energy).
- [ ] The owner's play-test on the lane server.

## Work log — 2026-10-29 (Lane B session)

**Measured first** (`test/census-rock-strike.mjs`, new rainy-day script; `--big` ≈3000 hits). Baseline:
flips 0/0/1/3/4 of 18 at 10/20/30/40/50 mph, all IMPACT flips (`--nopop` flips the same), rock
spikes to 30 m/s, worst one-step chassis loss 3.1 m/s.

**Root cause — a missing reaction (Newton's third law).** `physics.js` Step 3 gave a rock the tire's
push only when it was the wheel's SUPPORT (most-upward normal). A tire still on the road running into
a rock's face put up to 80 kN into the truck and nothing into the rock → the rock stayed planted →
the rigid core (a hull on the chassis) pinched it: 295 kN for one step, +2.9 m/s up and 4.3 rad/s
roll → the flip. When the wheel finally climbed on, the stored force landed on the rock in one step
→ the crawl yeet. The truck braked against a force the rock never got → the stutter. Lead #1 (rigid
core) was real but downstream: cores OFF still flipped about once per band (rock sinks into tire).

**What shipped in the working tree** (owner rulings this session: "A + rotating proxy + small B",
"rim load either path", a rock-only damper, "set threshold and accept shape"):
1. Every tire–rock contact gives the rock exactly the force the hub felt, substep by substep, through
   an injected `onForce` on the contact (suspension.js stays pure maths).
2. The contact is followed THROUGH the step: look-ahead by one step of hub travel, overlap = gap +
   closing·t + the rock's in-step yield — continuous collision detection for the soft tire.
3. The rock answers in-step as a rigid body (engine mass + inverse inertia; spins, slides) held by the
   ground it lies on (engine contact points, normal only). Ground FRICTION in the proxy was tried and
   made it worse (predicted a pin the engine does not honour) — removed, reason in the code.
4. The debris tire damper closes against the rock's own point velocity (was a backward difference of
   depth — last step's approach).
5. Rim cores are their own 18 kg bodies, re-seated on the hub each step; what debris did to one is
   split: along the strut → strutCompVel, across → the chassis at the hub. A prismatic joint was
   tried: unstable at the engine default (3 MJ out of a 0.1 MJ slam) and it moved 72 kg off the body
   (ride change). The 4 mm hull rebuild (lead #2) is gone by construction.
6. `params.tireDampingDebris` = 150 N·s/m (road keeps 1500); debug slider "Rock Damping".
7. Punctures read the rim two ways: core force (FEAT-93, 30×) OR the soft path's carcass pinch past
   full squash (`vehicleState.rimHazardSoft`, step mean, `hazardPinchMult` 4.5× ≈ 15 kN).
8. Physics fingerprint (no debris) byte-identical to main.

**Census after** (held speed, punctures live, 2970 hits): pops 0/0/1/16/26/34/10/14/26/39/51 % at
5/10/…/55 mph, **0 flips**, no hit rolls past 30°, rock exit p95 1.2-1.9× truck speed, one-step loss
≤ 1.2 m/s. The 20–30 mph hump is physics (the tire climbs the rock and presses it into the road; at
speed it bats the rock away) — owner: accept the shape.

**Still open:** low-speed rocks feel "weightless" (owner play-test) — theory: the tire has no GRIP on a
rock face unless the rock is the support (BUG-38's single Pacejka patch), so it shoves a rock it should
climb; the old physics climbed because the rock was effectively immovable. Rare 14 kg crawl exits up
to ~2× remain (tumbling rock vs the coupled-step prediction). `PhysicsEngine.replaceHullLocal` now has
no src caller (only `collider-seam-churn.mjs` drives it) — delete with that gate's rework. Stutter:
check `?hitch=20` at a pop on :3282 (render-side suspect).

## Work log — 2026-10-31 (Lane B): pop on energy, and the sandwich fix

**Pop on ENERGY.** The suspension now publishes `vehicleState.rimHazardWork` (J per step): the hazard
pinch residual × the tire's closing speed on the contact, loading only. `damage.js` sums it over one
squash event (the run of steps with a pinch) and pops at `hazardPinchEnergyJ` = 800 J. It replaces the
15 kN pinch-force rule (`hazardPinchMult`, deleted). The 100 kN core-force rule (FEAT-93) stays.

**What the --nopop census exposed.** With fewer pops, hits that used to pop stopped hiding a blowup:
1 flip at 25 mph and rocks thrown at up to 282 m/s (committed 1506d155 gives the same numbers). The
cause: a 9 kg rock sandwiched under the tire got the tire's push (2.5 kN·s, 280 m/s into the road)
but not the ground's reaction. The proxy predicted the ground holding the rock and did not tell the
engine, whose soft contact let the rock sink and then spat it out at 47 m/s. Fix: `proxyGround` hands
its support impulses to the engine with the tire pushes. Both sides of the contact now step the same
rock.

**That fix also removed the 20–30 mph hump.** It was this artefact, not "the tire pressing a climbed
rock into the road". Max roll over the whole sweep: 87° → 4° (no pops). Pops by speed, 5…55 mph:

| rule | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| before (force 15 kN, 1506d155) | 0 | 0 | 1 | 16 | 26 | 34 | 10 | 14 | 26 | 39 | 51 |
| force 15 kN + sandwich fix | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 5 | 19 | 24 | 44 |
| **energy 800 J + sandwich fix (shipped)** | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 6 | 23 | 33 | 53 |

Rock exit (÷ truck speed) p95 is 1.0–1.6× at 5–30 mph (was 1.5–1.75×) and 1.4× at 40–55 (was 1.2×).
Three of 1080 hits at 45–50 mph exceed 2.3× (max 3.0×, a 9 kg rock). Live: 0 flips; one 55 mph hit
rolls 49° on the FLAT tire after the pop (no steering in the census; the same hit unpopped rolls 4°).
Wheel damage from rocks fell with the sandwich force (55 mph: 144 → 122 of 270 hits damage a rim).
Physics fingerprint (no debris) identical.

## Work log — 2026-11-01 (Lane B): pop on RATE; rock grip attempted and parked

**Pinch work is leaky-integrated** (`hazardPinchTauS` 50 ms, 328625ee): rubber relaxes, so a slow press
caps at power × τ (800 J needs ≈16 kW held into the rim) — owner: "differentiate based on how quickly
the energy is dumped". Every real strike over 100 J dumps it inside one 16.7 ms step, so τ from 16 to
200 ms gives the identical pop curve. Owner play-test of the energy curve: "the popping feels fair. And
natural."

**Crawl baseline to beat** (`--nopop --speeds=2,5,10 --big`, 270 hits each): the struck hub rises > 5 cm
in 0 / 0 / 0 hits, the rock ends > 1 m from where it lay in 74 / 175 / 270, rock exit ≤ 1.9×. Owner:
"the truck hardly ever climbs over them".

**Rock grip — tried, NOT working, parked on `wip/bug99-rock-grip` (48f2c41d).** Two pieces:
1. Road friction in the rock proxy (Coulomb at each support, the engine's mixed μ — measured to be the
   geometric mean — handed to the engine with the normal impulses). Owed: since 10-31 the engine no
   longer sees the rock driven into the road, so its own friction holds only μ·m·g.
2. A second tire patch per wheel on the rock the tire is pressed against: its own slip state, own load
   (tire springs at each depth scaled to Fn), the face's tangent frame (forward-and-up on a face), slip
   against the rock's point velocity, both patches in the ω Newton, strut share to the hub next step
   (`params._tireGripUp`), implicit in the rock's yield. A shared single slip state was tried first:
   the road wants ωr = v, a 40° face ωr ≈ 0.5·v, and the average reversed the wheel in three steps.

Result: face grip alone does nothing (a free rock is carried along); with road friction the rock is
pinned at its base, PIVOTS (effective mass ≈ 1.4 kg at the tire contact for a 9 kg rock) and the
proxy's EXPLICIT per-substep coupling slingshots it — 2 mph → 22 m/s. The proxy was built for rocks
that slide; a gripped one is a stiff oscillator (√(k/m_eff)·substep ≈ 1.6). **Next design:** solve the
tire–rock–road contact implicitly each substep (the tire normal force evaluated at the rock's
end-of-substep yield, with the road constraints in the rock's effective mass), then re-land the two
pieces on top. Fingerprint (no debris) stayed identical throughout.

**Also seen:** an 88 kg rock (1.3×, ~0.5 m) hit dead-centre at 50 mph rolls the truck — pre-existing
(1506d155 does too); the `--big` grid stops at 1.0×. Check what sizes the game spawns.

## Resolution — 2026-11-01

Closed on the owner's OK ("the popping feels fair. And natural."), merged to main from
`feature/machine`. Shipped: Newton's third law on every tire–rock contact, sprung rim cores, the
ground's half of a sandwiched rock handed to the engine, and punctures on leaky-integrated pinch
ENERGY (800 J, τ 50 ms). Census: 0 flips in the 0.6–1.0× sweep; pops 0 below 35 mph, 3/6/23/33/53 %
at 35…55. Physics fingerprint (no debris) identical to main; test:all 110/112, the two known reds.
Open follow-on work moved to **FEAT-158** (rock grip / crawling — the parked attempt is on
`wip/bug99-rock-grip`). Also still open from this log: rare crawl exits up to ~2× on light rocks,
the 88 kg dead-centre 50 mph roll (check spawned sizes), `PhysicsEngine.replaceHullLocal` has no src
caller (delete with `collider-seam-churn.mjs`'s rework).
