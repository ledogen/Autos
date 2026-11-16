---
id: BUG-185
type: bug
status: closed
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "I smacked the rear wheel into a tree and it gave out. I would like it to be a little bit more resistant to getting destroyed. That was maybe a 10 mile an hour side impact maybe 20. I'm just wanting a little bit more forgiveness there. Maybe take a look at where the bedside collision is versus the wheel. If the bedside is flush with the wheel, maybe pop it out A dozen centimeters or so and that could help alleviate the issue."
relates: src/world-contacts.js, src/damage.js, src/physics.js, data/ranger.js
---
lane: unplaced (physics, Opus)

# BUG-185: A 10 to 20 mph side hit on a tree destroys the rear wheel

## Next steps
Fix landed on `land/bug-185` (Lane A), affected gates green. Waiting on the owner for one call: since the fix, a side hit
on a tree never damages the wheel at any speed (see Open questions). Then land.

## Summary
The wheel felt a tree with a 0.37 m SPHERE, not the 0.235 m wide tire. A trunk beside the rear wheel was touched 23 cm
before the body's flank could reach it, and read as on the rim while still 10 cm clear of the sidewall. So a 15 mph slide
pinch-flatted the tire without the body ever touching the tree. Now the wheel meets props and the POI cube at its real
width, and the body takes a square side hit first. The bedside was NOT the problem and was not moved.

## Description
**Geometry (body frame, |x| from the centreline, m).**

| | rear axle (z 1.5675) | front axle (z −1.2825) |
|---|---|---|
| tire outer face: track/2 + width/2 | 0.715 + 0.1175 = **0.8325** | 0.8325 |
| slab flank hull (`slabHalfW`), hub +5 cm to hub +20 cm under the bed, to the hip (beltY) ahead of it | **0.850** (1.75 cm outboard of the tire) | 0.850 |
| open-bed side wall (`outerHalfW`, rail), above the slab | 0.822 (1 cm inboard of the tire) | — |
| hood hull | — | 0.8075 |
| the wheel's prop / POI contact before the fix: sphere r 0.368 about the hub | **1.083** (25 cm outboard of the tire) | 1.083 |

A vertical trunk at the rear axle meets the flank (0.85), which spans the wheel arch at hub height. So the body already
stood outboard of the tire. Only the sphere reached further.

**Real 2002 Ranger.** Owner's manual track: front 1486 mm, rear 1455 mm. The rear tire face is therefore at about 0.845 m.
I could not source an exact overall width: the figures disagree, from 68.5 to 70.3 in (half-width 0.870 to 0.893 m), and
whether mirrors are included is not stated. So the real bedside stands about 2.5 to 5 cm outboard of the tire. The model's
1.75 cm is within 1 to 3 cm of that, because the track was pulled in to 1.43 m for the fender clip (2026-10-09). The 12 cm
suggestion is more than the real truck has, and once the wheel's reach is fixed it is not needed.

**How a wheel took the hit.** The trunk is a static prop. The chassis meets its engine capsule. The wheels meet it only
through the analytic query `queryContacts` → `PropSystem.queryProps`, which is `sphereVsCapsule` with r = wheelRadius. The
suspension soft path reads any depth past `WHEEL_SOFT_BAND` (0.15 m) as rim contact and publishes the load past full
carcass compression as `rimForceRoad`. `damage.js` prices that as a road rim strike. It pinch-flats an inflated tire past
24 × static wheel load (80 kN). It bends the wheel past 24 × 2 (160 kN, inflated) and writes it off at 54× of overload
(180 kN), collapsing it at 0 %. The body's impact path (`applyImpact`, `impactWheel` floor 18 / full 85 mph of Δv, 10 %
through full armor) barely touched it. "Gave out" was the pinch flat at 15 mph, and the collapse at 40 mph.

**Repro and gate:** `node test/side-tree-wheel.mjs --mph=…` (the table). The truck slides square to its left, level,
wheels straight. The trunk is r 0.35, its axis on the rear axle line, its surface 0.25 m outboard of the flank. The run
goes through the game's own step, the game's `makeQueryContacts` and the open-bed chassis. "v@touch" is the lateral speed
at the first contact of either kind.

Before (main 88151171), full armor:

| mph | v@touch | first touch | body J N·s | rim road kN | impacts (mph Δv) | wheel RL | tire RL |
|---|---|---|---|---|---|---|---|
| 5 | 4.7 | wheel, body never | 0 | 0 | — | 100 % | 100 % |
| 10 | 9.6 | wheel, body never | 0 | 51 | — | 100 % | 100 % |
| 15 | 14.6 | wheel, body never | 0 | 146 | — | 100 % | **flat** |
| 20 | 19.6 | wheel, body +1 step | 3438 | 188 | 17.6 | 94 % | **flat** |
| 30 | 29.6 | wheel, body +1 step | 6214 | 292 | 23.4, 7.2 | 37 % | **flat** |
| 40 | 39.6 | both | 16418 | 386 | 35.5 | **0 %, collapsed** | flat |
| 50 | 49.6 | both | 17530 | 457 | 43.3 | **0 %, collapsed** | flat |

After (`land/bug-185`), full armor. The rim-core force and the bump-stop force are 0 throughout, and the tire never
reaches the sidewall plane at the axle line:

| mph | v@touch | first touch | body J N·s | rim road kN | impacts (mph Δv) | wheel RL | tire RL | armor L |
|---|---|---|---|---|---|---|---|---|
| 5 | 2.1 | body, wheel never | 623 | 0 | — | 100 % | 100 % | 100 % |
| 10 | 8.6 | body, wheel never | 5929 | 0 | 7.2 | 100 % | 100 % | 100 % |
| 15 | 14.0 | body, wheel never | 9527 | 0 | 10.4 | 100 % | 100 % | 100 % |
| 20 | 19.3 | body, wheel never | 12357 | 0 | 13.5 | 100 % | 100 % | 100 % |
| 30 | 29.3 | body, wheel never | 16603 | 0 | 19.8 | 100 % | 100 % | 98 % |
| 40 | 39.6 | body, wheel never | 18123 | 0 | 26.0 | 100 % | 100 % | 95 % |
| 50 | 49.6 | body, wheel never | 19500 | 0 | 32.3 | 100 % | 100 % | 90 % |

At armor 0, 40 mph leaves the wheel at 99 % and 50 mph at 95 %. The lower v@touch at low speed is the 0.25 m the truck now
slides on its tires before the body meets the trunk. The CG's Δv is below the launch speed because the truck pivots about
the tree.

## Tracker
- [x] Measured: bed-side collider against the wheel's outer face, front and rear (table above)
- [x] Body takes a side hit before the wheel where the real truck's would (flank 1.75 cm outboard of the tire; real ≈ 2.5–5 cm)
- [x] A 10 to 20 mph side hit on a tree no longer destroys a healthy wheel; numbers before and after
- [ ] Wheel damage from a hard hit still happens. Tread strikes, landings, rocks and kerbs are unchanged. A hard SIDE hit on a tree now never damages the wheel: owner call, see Open questions

## Decisions
- None new. Governing: DEC-169 (bump-stop wheel damage, untouched), DEC-167 (fatal Δv, untouched), DEC-033 (one damage
  framework), DEC-151 (no damage in the tutorial: `held`, untouched). No tuned damage value changed, so DEC-328 is unused.

## Open questions
- **A hard side hit on a tree no longer wrecks a wheel at any speed.** Before the fix, the only thing that ever wrecked one
  was the phantom sphere's rim strike. Now the rigid body takes the whole hit, and the body path gives the wheel 10 % (full
  armor) of `impactWheel` (floor 18, full 85 mph). Those are owner-tuned numbers, so they were left alone. Options:
  (a) keep it this way, because the body is the armor;
  (b) price the wheel on the Δv at the struck point rather than at the CG (at 40 mph that is about 40 mph, not 26), which is
  still only 1 % through full armor;
  (c) retune `impactWheel` or the side armor's pass-through.
  Recommendation: (a). A tree that misses the body, or a low stump below the flank, still meets the tire at its real width
  and can still strike the rim.

## Links
- Sources (real geometry): Ford 2002 Ranger owner's manual specifications page (track 58.5 / 57.3 in),
  https://www.manualsdir.com/manuals/602534/ford-2002-ranger-v2.html?page=276 ; widths conflicting:
  https://www.kbb.com/ford/ranger-regular-cab/2002/specs , https://www.ford-trucks.com/?p=2313
- Same sphere-vs-tire class: BUG-176 (debris, fixed in the engine query), BUG-165 (the welded load), FEAT-70 (ground)

## Files
- `src/world-contacts.js`: a wheel query (footprint + axle) re-measures each prop and POI-cube hit as the tire cylinder
  along the hit normal: depth −= r − r·√(1 − (n·A)²) − (w/2)·|n·A|. A hit with no overlap left is dropped. The bore wall
  keeps the sphere, because there is no engine mirror for the body to meet there.
- `test/side-tree-wheel.mjs`: the repro table plus the gate; registered in `test/gates.mjs`.

## Log
- 2026-11-16: filed from the owner's inbox note.
- 2026-11-16 (Lane A, `land/bug-185`): repro b05444bb, fix 2266cb67, gate 9448a743 / 681a6753. Affected gates 4/4 green
  (rock-contact, drop-rebound, side-slide, side-tree-wheel). The gate fails 5 checks on main's contact.
  `fingerprint-physics` is ALL IDENTICAL to main: its bumpy ground has no props. Unverified: in-game feel, the POI-cube and
  pump-bay clearance (the wheel's reach only got narrower, so clearance cannot be worse), and rock and boulder props beside a tire.
- 2026-11-16: landed on main (local). Closed.
