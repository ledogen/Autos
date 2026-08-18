---
id: BUG-52
type: bug
status: open
severity: minor
opened: 2026-08-18
source: found while diagnosing seed 20's spawn road (BUG-51); scoped out of the router work by owner decision
relates: BUG-51, BUG-47, FEAT-61, FEAT-29
---

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
