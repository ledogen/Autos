---
id: BUG-54
type: bug
status: open
severity: major
opened: 2026-08-20
source: owner observation while driving (2026-08-20)
relates: FEAT-48 (Box3D chassis + the static mirrors it collides with), QUAL-25 (chassis collision
  mesh), BUG-22/22b (the rock sphere proxy — a secondary suspect here, see below)
---

# BUG-54: chassis gets launched at extreme suspension travel

**Owner, 2026-08-20:** "the vehicle body collides with the small rocks on the road ... launching the
car into the air. This only seems to happen when the car is at extreme suspension travel like going
over a dip or something or cornering super hard and then it clips one of those tiny rocks and gets
launched."

**Owner, revised same day:** "i must be mistaken. its probably just a glitchy collision body on
terrain or it could be wheel on body at max suspension compression."

## The symptom (the part we're confident about)

At **extreme suspension travel** — dip entry, or the loaded side in a hard corner — the vehicle body
gets a large upward impulse it has not earned. Not a wheel bump: a launch. Rocks were the initial
suspicion but the trigger is the suspension state, not the prop.

The rock story is **not** the obvious culprit it first looked like: the decorative `smallRock`
category (6–13 cm, `data/flora.js:107`) is baked with `collision = null`
(`src/props/prop-palette.js:169`) and never reaches physics at all. Something else is doing this.

## Hypotheses, in the order worth testing

**1. Chassis hull vs the terrain/road heightfield.** At full bump the body sits at its lowest; the
chassis hulls (`src/physics.js:194` onward, bottom edge at y = 0.14 local) start touching the
terrain statics. If a step ends with the hull deeply interpenetrating the heightfield, the engine
resolves it as a large positional/impulse correction — a launch. This is the owner's "glitchy
collision body on terrain" and it is the most likely of the three. Note that nothing *hard*-limits
strut compression: the bump stop (`src/suspension.js:371`) is a **linear penalty spring**, so a big
enough hit compresses straight through it and drops the hull onto the ground.

**2. Debris pinched between the wheel core and the body.** The four wheel "hard cores"
(`src/physics.js:249`) are spheres *on the chassis body* that **track the strut** — at full
compression they ride up level with the hull. They collide with `GROUP_DEBRIS` only. A dynamic
debris body caught between a rising rim core and the chassis hull has nowhere to go, and the solver
resolves that pinch by throwing the truck. Note this cannot be literal self-collision — the rim
cores and the hulls are shapes on the *same* body, which never collide with each other — so "wheel
on body" has to route through a third object, and debris is the only candidate.

**3. The `rock` collider standing proud of the visible rock.** Still real, still worth fixing, but
demoted to a contributing factor rather than the cause. The visible blob is an ellipsoid squashed
in Y (`axisScale [1.25, 0.7, 1.0]`) while the collider is an **isotropic sphere** sized off the 90th-
percentile *horizontal* flank reach (BUG-22b), then buried 20–90%. For the smallest rock at the
smallest instance scale, the visible top sits ≈ 0.15 m above ground and the collider top ≈ 0.30 m —
a 2× invisible kerb. That is the wrong shape regardless of whether it is what launched the truck.
(These are also supposed to be excluded within `roadExclusion` = 9 m of the road, so if they are
genuinely being hit *on the road surface*, `roadClear` is a second defect — window-invariance, same
class as BUG-25.)

## How to tell them apart

The headless harness is the right instrument here, not a screenshot loop:

- Reproduce in a rainy-day script (`test/assert-m4-*.mjs` pattern) — drive a dip or a hard corner
  until the launch fires, and log per-step: `strutComp[i]` vs the travel limit, chassis contact
  count by `userData.kind` (`terrain` / `prop` / `debris`), max penetration depth, and the impulse
  applied to the chassis that step.
- **If the launch step shows a `terrain` contact on a chassis hull → hypothesis 1.** Fix upstream:
  either stop the hull reaching the ground (a genuine hard bump stop / travel clamp) or stop the
  engine over-correcting (contact push-out limit, more substeps, CCD on the hull).
- **If it shows a `debris` contact on a rim core → hypothesis 2.**
- **If it shows a `prop` static contact where nothing visible is present → hypothesis 3.**

Capture the seed and location so it replays deterministically (worldgen is strictly seed-determined).

## Acceptance

- Driving at full suspension travel over a dip or through a hard corner does not launch or
  noticeably deflect the vehicle body.
- The root cause is named from harness data, not inferred — state which hypothesis it was and the
  numbers that showed it.
- Hard obstacles still stop the truck exactly as they do today: this must not soften the rock/
  boulder/tree read that BUG-22/22b tuned in, and must not change normal driving feel.
- If the fix touches the rock collider, the change lands in BOTH consumers — the analytic wheel
  query (`prop-system.js` `queryProps`) and the engine mirror (`terrain-physics.js`
  `PropPhysics.syncChunk`) — they must not disagree.
