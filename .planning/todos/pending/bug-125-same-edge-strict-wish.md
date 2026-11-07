---
id: BUG-125
type: bug
status: open
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

## Acceptance

- [ ] Why the own-edge skip exists, stated.
- [ ] A same-edge destination plans (route along the shared road) where that is sound.
- [ ] The census re-run: 0 of 51 worlds lose a strict-wish offer to the own-edge rule.
- [ ] Pay / par on a same-edge job look sane (pay follows route length; no 0-length jobs).
