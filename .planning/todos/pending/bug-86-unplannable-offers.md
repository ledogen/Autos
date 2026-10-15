---
id: BUG-86
type: bug
status: open
severity: major
opened: 2026-10-15
source: owner, 2026-10-15 — seed 1813164377, day 2: "The tackle shop is posting a fetch mission. When
  I park here, I still see the park to see the offer card. The actual offer never shows up, whether I
  park or un-park. On the map, there's also no route drawn when I hover it."
  Capture: autos-capture-1792059697317.json (truck parked at the tackle shop, 1773, 86).
relates: FEAT-102 (fetch), FEAT-101 (job supply), FEAT-67 (offer board), BUG-85 (region splits)
---

# BUG-86: the board posts offers that cannot be planned

## What was broken

The board rolls offers without knowing the road network. The planner then has to find a route for
each one. When it can't, the offer still counted as live, so:
- the park prompt said "park to see the offer",
- parking opened nothing (MissionSystem._present dropped it silently),
- the map's hover card showed no route.

**Why this seed's tackle shop can never plan.** The tackle shop posts only fetches of general-store
sundries (FEAT-102), so every job must reach a general store. This region has ONE general store, at
(745, −2518), on the opposite side of the region from the tackle shop at (1774, 91). The best leg
from the tackle shop's nodes is **8.0 km of road and 13 hops**. The planner allows at most
LEG_MAX 5.2 km and MAX_EDGES 9 hops (src/mission.js). A fetch would also drive the leg twice.
Measured headless on the seed's 2.8 km region build.

## Fixed (2026-10-15)

`_takeableOffers` in main.js: every reader now sees only offers that are live AND plannable. That
covers the park prompt, the brake trigger, the map hover card and the parked panel's refresh. The
map diamond drops offers already known to be unplannable, without planning on the draw path.
Browser check on the seed: main says "park to see the offer", this branch says "no work here right
now".

## Still open — the owner's call

On this seed the tackle shop is now honestly dead: every offer it posts is a fetch it can't reach,
so it says "no work here right now" all run long. Options:

1. **Fall back:** a giver whose offer can't be planned re-rolls a different thing or family it is
   allowed (the tackle shop would need a second family, e.g. courier).
2. **Guarantee reach at placement:** the roster places a pickup class within fetch reach of every
   POI that fetches from it (a general store within ~2.5 km of road of the tackle shop).
3. **Relax the fetch leg:** a strict fetch ignores LEG_MAX / MAX_EDGES. This lengthens the job, and
   par prices it.

Strict `to` deliveries (FEAT-100, and now FEAT-97's `to: ['residence']` rows) can hit the same wall
when their only destination class is out of reach. They are covered by the same fix, and dropped
from the board in the same way.

## Acceptance

- [x] No prompt, card or diamond advertises an offer that opens nothing.
- [ ] The owner picks 1 / 2 / 3 (or another rule), so a fetch-only giver is never dead for a run.
