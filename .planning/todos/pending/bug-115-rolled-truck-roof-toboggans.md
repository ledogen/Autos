---
id: BUG-115
type: bug
status: open
severity: minor
opened: 2026-11-06
source: Lane B, measuring FEAT-138's hi-lift on cross-slopes (2026-11-06) — the same complaint as BUG-89 ("slides too far when truck is on side add friction so you self right or roll more often", owner 2026-10-19), on the roof this time
lane: B
relates: BUG-89 (the side: fixed by the tires' sidewall friction), BUG-27b (body μ 0.1, so bumpers glance off a shoulder), FEAT-138 (hi-lift), FEAT-162 (a rolled truck with no hi-lift is stranded), src/physics.js createVehicleChassis
---

# BUG-115: A truck on its roof toboggans down any slope over ~6°

## What

On its side, a rolled truck holds: BUG-89 gave the down-side tires their rubber friction. On its roof, the
cab roof touches the ground at the body's pair friction μ 0.1 (BUG-27b). That is below tan 5.7°, so on any
steeper cross-slope it slides away and keeps accelerating.

Measured (dropped on its roof, then 10 s; probe `wip/bug-roof-slide/roof-slide.mjs`):

| slope | today, cab at the body's μ 0.1 | prototype, cab hull at pair μ 0.5 |
|---|---|---|
| 5° | 0.43 m | 0.03 m |
| 8° | **28 m, still 4.6 m/s** | 0.02 m |
| 12° | **78 m, 12.7 m/s** | 0 m |
| 15° | **110 m, 18.3 m/s** | 5.3 m (the landing settling), at rest |
| on its side, 0–15° | ≤ 1.4 m (BUG-89) | ≤ 0.04 m |

Real roof metal on asphalt or dirt is μ ≈ 0.4–0.6; a real rolled truck stays where it lands on 8°.

## The prototype (one line, not applied)

BUG-27b's slipperiness is for the bumper glancing off a shoulder, and the bumper is the lower slab (shape 1).
The cab is its own hull (shape 3: cowl, windshield, roof, back panel). Give the cab hull its own friction,
inverted through the geometric mean the way the body and bed materials are:

```js
// src/physics.js createVehicleChassis, shape 3
], P.cabHalfW), { ...mat, friction: 0.5 * 0.5 / TERRAIN_FRICTION_REF })   // pair μ 0.5 on terrain
```

- Physics fingerprint (`test/fingerprint-physics.mjs`, healthy truck, round and out-of-round): **ALL
  IDENTICAL** with the prototype applied. A healthy drive never touches the cab.
- The hi-lift grid (`test/hilift.mjs` §3) stays green with it. Roof: level 6/6 in one press, slopes 21/24 in
  one press and 24/24 in two. Side: 15/15 within two. A truck dropped at 100° on 15° now tips onto its roof
  instead of sliding to its side.

The prototype is committed on its own branch, **`proto/bug-115-cab-mu`** (8279f97a, off feature/machine 741ea4c2):
`CAB_PAIR_MU` 0.5 → `CAB_SHAPE_MU` on the cab hull. If (a) is the call, cherry-pick it; (b) changes that one number.

## The call (owner)

- **(a) the cab hull grips at pair μ 0.5** [recommended]. The roof stops sliding. The cost: a cab that
  side-swipes a rock face or a barricade now grabs it, where today it glances off. The slab and bumper stay
  at 0.1.
- (b) a lower roof μ (0.3: holds to ~16°, glances more in a swipe).
- (c) leave it: a rolled truck on a slope slides off; with FEAT-162 that is often a run's end.

## Acceptance

- [ ] The owner's call.
- [ ] If (a)/(b): `test/side-slide.mjs` gains the roof on 8°/15° (holds within 1 m after it lands); the
      physics fingerprint stays identical (it was, with the prototype); physics gates and the hi-lift grid are green.
