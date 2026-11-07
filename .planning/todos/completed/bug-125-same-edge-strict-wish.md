---
id: BUG-125
type: bug
status: closed
opened: 2026-11-07
severity: minor
source: Lane A, while fixing BUG-124 (2026-11-07)
owner: Lane A
relates_to: BUG-124 (the run-critical case, fixed at placement)
---

# BUG-125: a giver on its only destination's graph edge can never post that thing

## What happens

The planner never ends a job on its start's own graph edge (`mission.js _roll`: a candidate with
`edgeKey(qa, qb) === srcEdge` is skipped). Six things wish strictly for a type the region has only one of:
classNotes → school, deck → office, reel → tackleShop, and cinderBlocks / concrete / jobBox → workSite. A giver
that shares an edge with that one destination can never post that thing: the offer fails to plan, and the giver posts
one job fewer.

Census (Lane A, `wip/bug124-census.mjs`): 7 of 51 worlds, one giver and one thing each. Not run-critical.

## Direction (Lane A)

Placement can't rule this out cheaply, because it couples many slots. The general fix is the planner accepting a
same-edge destination, with the route running along the shared road. Check first why the own-edge skip exists (a
route of zero or near-zero length? pads ≥ 250 m apart along an edge already guarantee distance) and keep whatever it
protects.

## Why the own-edge skip existed (Lane A, 2026-11-07)

It came in with FEAT-67 (9b05ccaa), and that commit gives no reason. The reason is in the route model. `_roll`
builds every POI-to-POI route as **head + node path + tail**:

- the head runs from the giver's marker out to one end of its edge;
- the node path runs through the junction graph;
- the tail runs in from a junction to the destination's marker.

A destination on the giver's own edge has no honest route in that model. With exit A and entry A, the route
would leave the giver, possibly pass the destination, turn at A and come back along the same stretch. With exit A
and entry B, it would loop round the block. The skip kept those out-and-back and loop routes out. The same protection
is behind the doubling-back rule (`_firstHop === other`).

## Fix

**What it protects stays.** Node-path candidates still skip the giver's edge, so no route ever drives past its
destination and doubles back.

**A same-edge destination is now its own option.** It is driven STRAIGHT along the shared road: one partial segment
from the giver's marker to the destination's, priced like any partial edge. Its length is the gap along the road,
held to the same leg band as every other candidate. The floor is `POI_LEG_MIN` (1050 m), or `minM` for an item
offer; an `anyLeg` wish takes any length of at least 1 m. It joins every exit's option list on equal terms, so
`pick` and `nearest` treat it like any other candidate. Pricing (`computePar`, the arc table, the region guard) is
one `priced()` closure that both paths share. The direct option draws no randomness, so a world with no in-band
same-edge pair plans exactly as before.

## Census (`wip/bug125-census.mjs`, the same 51 worlds as BUG-124)

- **The seven same-edge single-destination pairs** (reel, classNotes ×2, jobBox ×2, deck ×2) sit **252–566 m**
  apart along their road. They are under the 1050 m courier floor, so they still don't plan. They are now refused
  by the floor, as the same destination would be at that distance on any road. That is the owner's 2026-10-25
  ruling ("the one school being too near means that offer does not plan"). **No pair at or past the floor was
  refused: the own-edge rule refuses nothing any more.**
- **The live boards:** 789 offers, 749 planned. None became a same-edge direct job, because no in-band same-edge
  pair occurs on these worlds, so no existing job changed.
- **Pay / par of the rest:** shortest job 1.4 km, lowest base pay $1.96. Par runs 69–79 s/km and pay $1.48–1.69/km
  (payRange at tier 1).
- **A direct route, priced** (gate casserole-plans, 2646203056: mom's to the pad that was Larry's): one segment of
  300 m, par 27.4 s = 91 s/km. On random world 2643947676: 384 m along the road, 388 m priced (par's distance is 3D, so a grade adds length), par 40.9 s = 105 s/km. That is above the long jobs' 69–79 s/km because a short drive from rest to rest
  spends more of itself accelerating and braking, as par should. Pay is proportional to par, so it follows. No job
  can be near zero: taken pads on one edge are at least `poiPadSpacing` (250 m) apart, an ordinary job needs
  1050 m, and the two anyLeg jobs never meet a same-edge destination. The casserole is kept off mom's edge
  (BUG-124), and the requisition lines go to the camp, whose edge is never in the pool.

**Gates:** the affected set is 26 of 26 green. The first run caught the new check's own over-tight tolerance, plan
arc against par's 3D length; the tolerance is now 5 % over the gap.

**Also fixed by it:** BUG-118's tutorial re-plan from a truck on the door's own road used to fail and keep the old
line. It now plans the straight stretch.

## Acceptance

- [x] Why the own-edge skip exists, stated.
- [x] A same-edge destination plans (route along the shared road) where that is sound.
- [x] The census re-run: 0 of 51 worlds lose a strict-wish offer to the own-edge rule. (The seven pairs are refused
      by the 1050 m floor instead: all are 252–566 m apart.)
- [x] Pay / par on a same-edge job look sane (pay follows route length; no 0-length jobs).

## Resolution (orchestrator, 2026-11-07)

Landed on main (merge of 93f6fb07, tree identical): affected 26/26 on the merged tree, cdp-smoke 25/25 on main.
