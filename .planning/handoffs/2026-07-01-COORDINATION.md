# COORDINATION — 4 parallel workers, one repo (2026-07-01)

**From:** lead session (holding the QUAL-08 dedicated-router-worker ticket)
**To:** the ponds worker, the streams worker, the intersections-beautification worker
**Purpose:** keep four efforts that all touch `road.js` / `main.js` / `WORKER_SOURCE` from clobbering
each other. Read this before you start; then read your own handoff.

---

## The four efforts

| Worker | Ticket(s) | Handoff | Primary files |
|--------|-----------|---------|---------------|
| **Router (me)** | QUAL-08 (dedicated road-network Worker; ex-BUG-26) | ticket has the plan | NEW `src/road-worker.js`, `terrain.js`, `main.js`, `map2d.js`, `road.js` (dispatcher only), `test/route-worker-sync.mjs` |
| **Ponds** | FEAT-22 (foundation) + FEAT-17 (ponds) | `2026-07-01-ponds-worker.md` | NEW `src/water/*`, `road.js` (route-around), `main.js`, `data/ranger.js` |
| **Streams** | FEAT-18 (streams) | `2026-07-01-streams-worker.md` | NEW stream carve body in `road-carve.js` (+ `WORKER_SOURCE` mirror), `road.js` (bridge), `main.js` |
| **Intersections** | QUAL-10 (visual blend; rides on FEAT-19 = done) | `2026-07-01-intersections-worker.md` | `road-mesh.js`, `road.js` (junction detect/carve), `data/ranger.js`, `debug.js` |

## Current tree state (verified `git status` 2026-07-01)

```
 M data/ranger.js      ← UNCOMMITTED QUAL-10 (roadJunctionCarveRadius param)
 M src/debug.js        ← UNCOMMITTED QUAL-10 (Terrain Carve Radius slider)
 M src/road-mesh.js    ← UNCOMMITTED QUAL-10 (node-junction pad build)
 M src/road.js         ← UNCOMMITTED QUAL-10 (_detectNodeJunctions + _junctionCarve, ~L2740–2980)
```

⚠️ **There is already in-flight QUAL-10 work in the tree — it belongs to the intersections worker.**
Nobody else `git add -A`. The intersections worker commits it first (see its handoff); everyone else
branches/rebases on top of that commit.

## Shared-file collision map (the whole reason for this doc)

- **`src/road.js`** — touched by three workers, but in **disjoint regions**:
  - Router: dispatcher surface only, `L1145–1240` (`setRouteDispatcher`/`warmRoutes`/`ingestRoutedConnections`). No structural change.
  - Intersections: `_detectNodeJunctions` + `_junctionCarve` + `_carveDirtY`, `~L2740–2980` (already written, uncommitted).
  - Ponds: a route-around exclusion hook (pond disc + skirt) in the router/anchor path — new, small, near the valley-anchor code (`_rawValleyAnchor` ~L1240+) and/or `queryNearest`.
  - Streams: a bridge-at-crossing hook in the crossing/assembly path.
  - → Low *real* conflict, high *textual* conflict risk. **Serialize road.js-touching commits**; don't run two road.js editors in the same worktree simultaneously. Prefer separate git worktrees (`git worktree add`), land in the order below.

- **`terrain.js` `WORKER_SOURCE`** (one backtick string) — touched by two:
  - Router **REMOVES** the `ROUTE SYNC` region + `'route'` handler (terrain becomes heightfield-only).
  - Streams **ADD** a stream-carve body (CARVE SYNC) — *if* the carve needs to run in the worker. Note
    terrain.js:1399 says carve is a **post-read main-thread blend** (never baked in the worker), so the
    stream carve likely follows the road-carve pattern (mirror the body, apply the blend main-thread) and
    may not touch `WORKER_SOURCE`'s execution path at all — but it still edits `road-carve.js`, whose
    CARVE SYNC region **is** mirrored into `WORKER_SOURCE`. Confirm at planning.
  - → These are independent regions of the same literal. **Router lands its WORKER_SOURCE split FIRST**;
    streams rebases its CARVE SYNC mirror onto the post-split terrain.js.

- **`data/ranger.js`** — everyone appends params. Additive; near-zero conflict. Keep each worker's params
  in its own clearly-commented block (QUAL-10 already did: `roadJunctionCarveRadius`). Streams/ponds add
  their own blocks. Don't reorder existing keys.

- **`src/main.js`** — everyone adds wiring (system instantiation + per-frame `update` + seed-reset path).
  Same lesson as the FEAT-06 merge: **last-mile main.js edits are localized but overlap-prone.** Each
  worker adds its block in a distinct location (imports together; instantiate after the relevant system;
  `update` in `loop()`). Reconcile with `git diff src/main.js` on merge, don't blind-merge.

## STATUS UPDATE (2026-07-01) — router step LANDED (uncommitted)

The **router worker (QUAL-08) core is done** in the working tree (uncommitted, on disjoint files):
`src/road-worker.js` (new), `src/terrain.js`, `src/main.js`, `src/map2d.js`, `test/route-worker-sync.mjs`.
The **ROUTE SYNC region has MOVED out of `terrain.js`'s `WORKER_SOURCE` into `src/road-worker.js`** —
terrain's Worker is now heightfield-only. `route-worker-sync.mjs` now guards `road-worker.js`.

**→ Streams worker: mirror your new stream carve body into the POST-SPLIT `terrain.js` `WORKER_SOURCE`
(CARVE SYNC region only — the route region is gone). Do NOT reintroduce routing into terrain.js.**
**→ Nobody edits `src/terrain.js` `WORKER_SOURCE` without checking `git diff` first — the router just
reshaped it.** Ponds' route-around exclusion should be a pure fn the router queries; the router code now
lives in `road-worker.js` (for the Worker copy) + `road-carve.js` (canonical) — main-thread road.js still
calls the synchronous fallback, so your exclusion hook goes in road.js as planned.

## Land order (dependencies, not a hard gate)

1. **Intersections** commits the in-flight QUAL-10 tree first (unblocks a clean base for everyone).
2. **Router** lands next: it removes the route region from `WORKER_SOURCE` and stands up `road-worker.js`.
   Do this before streams so streams rebases onto the final terrain.js worker shape.
3. **Ponds** (FEAT-22 foundation → FEAT-17) — mostly new files (`src/water/*`); its road.js hook is small
   and independent. Can proceed in parallel with router in its own worktree; merges cleanly either order.
4. **Streams** (FEAT-18) — depends on FEAT-22 (shared basin/flow/saddle foundation from the ponds worker)
   AND on the router's WORKER_SOURCE split. Land last. Streams terminate at ponds *for free* (gradient
   descent ends at basins), so FEAT-22 must exist first.

Ponds and streams share **FEAT-22** (basins / flow traces / saddles). **The ponds worker builds FEAT-22**
(it needs the basin index first); streams consumes the flow-trace + saddle half. Coordinate the FEAT-22
API surface between those two before streams starts (see both handoffs).

## Invariants everyone keeps (non-negotiable)

- **Window-invariance** — every feature is a pure fn of `(seed, x, z, params)`. Terrain
  `analyticHeight(wx,wz)` is samplable anywhere (no chunk lookup) — that's what makes water detection,
  routing, and off-thread builds byte-identical regardless of stream order. If your feature looks
  different depending on which tile/draw-distance/approach built it, it's wrong.
- **mesh == collision** (QUAL-07) — any surface you add (junction apron, pond plane exception, stream bed)
  must have the physics query agree with the rendered mesh.
- **`npm test` stays green** — 20+ headless gates. Add a gate for anything new (scatter determinism,
  carve smoothness, route-sync). Headless has no Worker/GPU — keep the synchronous fallback path intact.
- **TWO workers total** — terrain-gen (latency-critical) + road-network router (bursty). Do **NOT** add a
  third. No carve worker (carve sits at the terrain+route confluence — too expensive to ship cross-worker;
  it's ~3.4 ms/frame main-thread with no drops). See CLAUDE.md "Terrain Worker".
- **No new per-frame diagnostic plumbing in `src/`** — diagnostics live in `test/` against the headless
  harness. `src/` is the shippable engine.

## Comms

Tag inline comments with your ticket id (`QUAL-08`, `FEAT-17`, `FEAT-18`, `QUAL-10`) + an invariant
explainer — they ship with `src/` and stop regressions. If you change a **public** RoadSystem/terrain API
another worker consumes (`queryNearest`, `analyticHeight`, `crossingList`, `ingestRoutedConnections`),
say so here so the others adjust their one call site.
