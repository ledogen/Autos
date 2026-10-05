---
id: BUG-52
type: bug
status: closed
closed: 2026-10-05
severity: minor
opened: 2026-08-18
source: found while diagnosing seed 20's spawn road (BUG-51); scoped out of the router work by owner decision
relates: BUG-51, BUG-47, FEAT-61, FEAT-29
---

> **RE-TRIAGED 2026-08-27 against the v2 world — STILL OPEN, and still the same defect.**
>
> BUG-51 (its sibling, the reason this was found) is CLOSED: the seed-20 spawn edge that weighed
> 452 m in the planner against 1134 m of up-to-118 % road is now **601 m of ≤18 % road**. So the
> *consequence* is much milder — the planner is no longer being lured onto three-figure grades,
> because those no longer exist.
>
> **The defect is untouched.** `buildGraphAdj` (`src/mission.js:117`) still weights every edge by
> `Math.hypot` of the chord, and the v2 router changed nothing in `mission.js`. A detour factor of
> 2.5× was the headline example, not the mechanism. Do not close this on BUG-51's numbers.
>
> One thing that DID change in its favour: the ticket argues the stale justification was
> *"routing an edge just to measure it would cost more than the bias is worth"*. Registered runs now
> carry `polyCum`, so the real road length is a single array read — measuring is free where the edge
> is already streamed.


# BUG-52: every planner weights graph edges by straight-line chord, not road length

## The defect

`buildGraphAdj` (`src/mission.js:117`) — the one adjacency builder every planner shares (mission
planner, FEAT-61 paper route) — weights each edge:

```js
const w = Math.hypot(pa.x - pb.x, pa.z - pb.z)
```

That is the **chord**, not the road. Seed 20's spawn edge `g:0,-1,2:-1,0,2` weighs **452 m** in the
planner while the actual road is **1134 m** (detour ×2.51) of up-to-118% grade — a 2.5× underestimate
before grade is considered at all. The planner therefore *prefers* exactly the edges the terrain
punished hardest, because a big detour factor is what a ridge crossing looks like.

## Why the existing justification is stale

`paper-route.js:478` documents the mixed metric deliberately: *"routing an edge just to measure it
would cost more than the bias is worth."* That was true when measuring meant routing. It is not true
now:

- `networkGraph()` reads `_network`, and **every registered run already carries `polyCum`** — the
  true arc length is computed and cached before any planner runs. `edgeParData(a, b)` already hands
  back per-edge views of it.
- For a traversal-TIME weight (better than length where grades differ), `parForEdge`
  (`src/par.js:281`) is a calibrated per-edge model that mission scoring already trusts.

## Fix sketch (small)

In `buildGraphAdj`, weight by the registered run's arc span (fall back to chord only for edges whose
run is not streamed). Optionally a second pass: weight by `parForEdge` time so steep-but-short and
gentle-but-long price honestly against each other. Verify with `test/paper-route.mjs` /
`test/mission-network.mjs` — tour orderings will legitimately change.

## Scope note

Deliberately **not** bundled into the BUG-51 router work (owner decision 2026-08-18): this bug
changes which routes planners *pick*, not which roads *exist*. Fixing them together would confound
the ablation there.

## Resolution (2026-10-05)

Fixed as sketched, first pass only (length, not `parForEdge` time).

- `networkGraph()` (`src/road.js`) carries each run's driven arc — `polyCum`'s end, the
  `edgeParData` domain — as the 4th slot of the edge tuple. Every networkGraph edge is a
  registered run, so the length is always there; no routing.
- `buildGraphAdj` (`src/mission.js`) weights by it; chord survives only as the no-length fallback.
  paper-route's "mixed metric, deliberately" note is gone — the spliced chain and the graph now
  speak one metric.
- **Leg bands re-scaled ×1.3 (owner, 2026-10-05: option 2 — keep today's leg lengths, don't move
  the economy).** Shortest-path distances measured 1.19-1.35× (p50) longer in road metres than
  chord-sum metres (seeds 6/20/11, 1400 m band; per-edge detour p90 1.58-1.91, max 2.53). So
  LEG_MIN 1500→1950, LEG_MAX 4000→5200, POI_LEG_MIN 800→1050, all now in road metres.
- Roads themselves untouched — only which existing roads the planners string together.
- Gates: mission-network, world-determinism, story-poi, scenario-route, par-oracle, paper-route,
  paper-tour, paper-reroute all green with no re-baselining.
- Not done: the optional `parForEdge` time weighting. Open a ticket if steep-short vs gentle-long
  ever prices wrong in play.

