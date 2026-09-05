# Router: shared-corridor reuse, and the unclaimed parallelism (2026-09-04)

Session findings, no code written. Two independent conclusions came out of one question, and they
are **multiplicative, not competing**:

1. **Architecture** — centerline routing is order-*independent* by design; making it neighbour-aware
   (route reuse → T-junctions) is possible but must buy determinism a different way. → **FEAT-76**.
2. **Perf** — the play network build uses **exactly one core**, and 70.7 % of its CPU is a pure
   per-edge function. There is a ~2× hardware win sitting unclaimed. → **PERF-31 lever 5** (below).

Everything here is read out of the code at `bae2edb`, plus one fresh bench run and PERF-31's
recorded profile. File:line references are to that commit.

---

## 1. Is centerline routing simultaneous? — No, and it is deliberately order-INDEPENDENT

Each edge is routed by `corridor-router.js:1001 routeEdgeV2(spec, hTrunc, hCoarse)`. The spec is
built in exactly one place — `road.js:2661 _v2EdgeSpec` — and contains only:

- the two node positions and their pinned heights
- pond no-go discs (pure data, `FEAT-17`)
- the deg-2 departure pins (`dirs`)
- the live cost list (`costs`, so a Worker's separate module instance prices identically)

**Nothing in the spec knows another edge exists.** `route(edge)` is a pure function of that edge.

Three mechanisms lean on that purity, and all three break if reuse is added naively:

| mechanism | where | why purity matters |
|---|---|---|
| **Per-edge cache** | `road.js:2610` `_proto.cls`, keyed by edge | One edge → one geometry, forever. Routes are direction-canonical: A→B is routed, B→A is its exact reverse (`reversePrimitives`). |
| **Worker parallelism** | `road-worker.js` pool; `road-route-worker.js` imports the *same* `routeEdgeV2` | Jobs complete in arbitrary order. `test/road-worker-parity.mjs` pins byte-equality with the sync path. |
| **Window invariance** | `road.js:2603` comment on the pins | The world streams in a moving window. Which edges exist, and the order they route, depends on approach direction. Order-dependent geometry = BUG-25's failure mode (whole edges flipping on re-stream). |

The comment at `road.js:2603` states the discipline exactly: the pins are "a pure fn of the settled
post-drop adjacency, so every window derives the identical pins and cache entries stay
window-invariant."

### What sharing exists today (all post-hoc)

`road.js:2896 _v2NodeMerges` — the plan layer samples *finished* runs, finds spans where their
centres sit within `mergeProxM` (18 m), and merges them into one ribbon from the node out to the
last conflict, releasing at the wye. Two independently-routed roads that happened to land near each
other, stitched together afterwards.

One crumb of neighbour-awareness already lives in the router: R5's `sibStart` / `sibGoal`
(`corridor-router.js:1018`), a sibling-departure cost. But it applies **only at the node exit**, and
only as a **penalty** — never a discount.

---

## 2. The perf finding: the play build runs on one core

### What PERF-30 actually did

The whole network build moved into `src/road-network-worker.js`, which constructs a **private**
`RoadSystem` and calls `rs.update()` — one synchronous call (`buildNetworkSnapshot`).

**That private instance never gets a route dispatcher.** `setRouteDispatcher` is never called on it.
So every cache miss falls through to the synchronous `_edgeCenterline` → `routeEdgeV2`, one edge
after another, on that single worker thread.

And `main.js:5187` disables the parallel pre-warm the moment the network client is wired:

```js
if (roadSystem && !netClient && !_spawnWarmActive && ...) roadSystem.warmRoutes(streamCenter)
```

So during a play network build, the **2–4-worker route pool sits idle**. PERF-30 traded parallelism
for off-thread-ness (correctly — it killed the felt hitch) and never bought the parallelism back.

The pool is still exercised by **Map2D** (`map2d.js:666`) and the **mission planner**
(`main.js:2127`), which drive their own `RoadSystem` instances the pre-PERF-30 way.

### The dominant cost is the parallelisable one

PERF-31's recorded profile at head: **`corridorSearch` 70.7 %**; `profileSolve`/`profileSolveBundle`/
`classOf` ~10 %; `_v2ConflictPairs` 3.3 %; `_nearestOnPolyXZ` 2.9 %; `_pairProperCrossingsXZ` 1.5 %.

The 70.7 % is the one function that is already a pure per-edge function with no cross-edge state —
embarrassingly parallel (work that splits with no coordination between the pieces).

Amdahl on PERF-31's shipped 15.6 s three-window baseline (Amdahl = the speedup ceiling is set by the
part you *don't* parallelise): 11.0 s routing + 4.6 s everything else. A perfect 3.5× on the routing
half → 3.1 + 4.6 ≈ **7.7 s**, which lands on PERF-31's own ≤ 8 s acceptance target using hardware
rather than by fixing the route-count regression. Real dispatch overhead makes it worse; the order
of magnitude holds.

### Fresh bench (this machine, 2026-09-04, `bae2edb`, seed 6, default radius)

```
   seed |  cold ms | restream ms | ensure3x3 ms |  runs | conns cached
      6 |   2599.6 |      1539.3 |       3544.3 |    23 | 88
```

(Terrain half: 13.8 ms/chunk, 12.5 ms of it main-thread — unchanged, not the subject here.)

### The structural blocker

You cannot `await` a Worker from the middle of a synchronous call stack, and routes are demanded
**lazily** — deep inside the plan layer, on cache miss in `_edgeCenterline`. Two ways out:

- **(a) Async build.** Restructure `update()` to yield at route boundaries. Invasive; touches the
  plan layer throughout.
- **(b) Predictive pre-warm.** Enumerate the edges the build will need, route them all in parallel
  first, fill `_proto.cls`, then run the serial build as a pure cache-walk. **This machinery already
  exists** — `warmRoutes` + `_warmScan` (`road.js:1767`, `road.js:1832`), already proven
  window-invariant, already byte-identical to the sync path via `road-worker-parity`. Not new code:
  re-pointing existing code at the network worker.

**(b) is the move.**

### The one measurement that decides it (go/no-go, ~1 h)

**What fraction of the routes a build demands are predictable up front?**

`_warmScan` enumerates registered Urquhart edges. But the bench above cached **88 routes for 23
runs**, and PERF-31 records **144 routes** where "v2 at birth" needed 64. The surplus is demanded by
the planner's own logic mid-build, and `_warmScan` does not know about it:

- plan-layer partner sampling within `censusChordM` (300 m)
- the R4 settle pass's 1-ring
- the `#g` hard-grade re-route rungs (BUG-56 C)

If only 60 % is predictable, you parallelise 60 % and Amdahl eats the rest.

**Method:** instrument `_edgeCenterline` misses during a headless build; tag each cache key as
registered-edge / plan-sample / `#g` rung; count. That number is the go/no-go.

### Plumbing question

The pool lives on the main thread; the cache to fill lives inside the network worker's private
`RoadSystem`. Either:

- **nested workers** — the network worker spawns the pool itself (dedicated workers spawning workers
  is fine in Chrome/Firefox, Safari 16.4+; needs a support check), or
- **ship a routed batch in** — main thread pre-warms via the existing pool, then posts routed
  centerlines to the network worker before the build starts.

Nested workers is cleaner (the cache lands where it is used); the batch-ship avoids a browser-support
question.

### Not available: more threads, or more clock

- No thread-priority / QoS API exists in JavaScript. Nothing to grab.
- **More workers has already been tried and measured negative.** `road-worker.js:44` records that
  raising the pool from 4 to 8 on the M4 (4 performance + 6 efficiency cores) was **slower** — E-core
  stragglers plus a fanless thermal spike beat the extra throughput, even with pull dispatch. The cap
  of 4 is empirical, not arbitrary.

### Where this belongs

**PERF-31 lever 5.** PERF-31's four levers all reduce *work* (fewer routes, cheaper routes, fewer
profile solves, fewer plan passes). This one increases *throughput*. They multiply. It is also
independent of FEAT-76 — shared spans mean fewer distinct searches, which stacks again.

---

## 3. The reuse architecture, in brief

Full plan is **FEAT-76** (`.planning/todos/pending/feat-76-route-reuse-t-junctions.md`). Summary of
the reasoning that got there:

The proposal — a routed centerline that sees a neighbour has already justified a path may use it for
free, then diverge where it is most efficient — is a **cost-sharing / Steiner-tree** router. Shared
infrastructure is cheaper than duplicated infrastructure. It produces T-junctions and
arbitrary-angle divergences *naturally*, because the divergence point stops being a threshold on
separation and becomes the point where following the trunk stops being cheaper than heading for the
goal. The search finds it.

Three things have to be true for it to survive contact with this codebase:

1. **Replace "already routed" with a deterministic priority order.** Rank edges by something
   window-invariant; edge *e* may reuse only strictly-higher-ranked edges drawn from a
   radius-bounded neighbourhood. "Who went first" becomes a fixed dependency DAG. Same discipline
   the departure pins already use.
2. **Reuse must be a snap, not a discount.** A cheap-nearby-cells cost term yields two roads 3 m
   apart, which is worse than either outcome. The trunk's centerline vertices must be injected into
   the A\* lattice as traversable low-cost edges, so "reuse" literally means walking the trunk's own
   polyline. Leaving it costs a turn penalty; the exit vertex **is** the junction.
3. **The divergence vertex becomes a real graph node**, splitting the trunk edge — which changes its
   degree, which feeds the departure pins, which feeds routing. This is the
   pins→routes→degree→pins cycle the plan layer already fights with its two-pass `_planRev` trick
   (`road.js:2693`). **This is the hard part of the whole idea**, not the search.

Nice convergence: the cache-validity risk and the window-invariance risk are *the same constraint*.
A cached route becomes valid for `(edge, seed, params, higher-ranked neighbours)` instead of
`(edge, seed, params)`. The network worker's whole perf story is that its `RoadSystem` persists
across builds with warm routes intact (its own header comment says so). Make the priority
neighbourhood a radius-bounded, window-invariant function of the settled graph and you get both —
deterministic geometry *and* a cache that stays warm across moves. One decision covers both risks.

Cost check: the DAG order costs the **play** path no parallelism, because (see §2) there is none
there to lose. It costs Map2D and the mission planner a little, recoverable by dispatching per DAG
level — edges of equal rank are mutually independent and go out together.

Possible speed *win*, unmeasured: a reusing edge's A\* terminates early once it reaches the trunk
polyline (walking cheap known edges instead of expanding lattice cells), and two roads sharing a span
means one corridor search instead of two.

---

## Provenance

Read this session, at `bae2edb`: `src/corridor-router.js`, `src/road-worker.js`,
`src/road-route-worker.js`, `src/road-network-worker.js`, `src/road-network-client.js`, and
`src/road.js` regions 1700–1830 (`warmRoutes`/`_warmScan`), 2600–2700 (`_edgeCenterline`/
`_v2EdgeSpec`/`_planRev`), 2880–3050 (`_v2NodeMerges`). Bench: `node test/bench-worldgen.mjs
--seeds=6 --chunks=2`. Profile numbers quoted from `.planning/todos/pending/perf-31-plan-layer-cpu.md`
(measured 2026-09-01, not re-run here).
