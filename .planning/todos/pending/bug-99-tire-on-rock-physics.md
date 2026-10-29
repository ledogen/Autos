---
id: BUG-99
type: bug
status: open
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
