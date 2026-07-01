# HANDOFF → streams worker (FEAT-18)

**From:** lead session (2026-07-01)
**Ticket:** FEAT-18 — `feat-water-streams.md` (freshly SCOPED 2026-07-01 — the SCOPING DECISIONS block
is locked; don't re-open it)
**Depends on:** **FEAT-22** (shared water-placement foundation — flow trace + saddle sources), built by
the **ponds worker** as `src/water.js`. **You cannot start until FEAT-22 exists.**
**Read first:** `2026-07-01-COORDINATION.md`, the FEAT-18 ticket, memory
`project_water_features_scope.md` + `project_terrain_worker_constraints.md`.

---

## TL;DR

A stream is a channel that **carves its own bed/banks into the terrain** and runs downhill; **roads
ALWAYS BRIDGE a stream** wherever the network crosses one (never route around — that's ponds). Streams
**terminate at ponds for free** because a gradient-descent trace always ends at a basin.

You are the **last of the four workers to land** (see COORDINATION land-order). Two hard dependencies:
1. **FEAT-22 `src/water.js`** must exist (flow trace + saddle list) — the ponds worker builds it.
2. **The router worker (QUAL-08) must have split `WORKER_SOURCE` first** — after that, the ROUTE SYNC
   routing region lives in `src/road-worker.js`, and `terrain.js`'s `WORKER_SOURCE` is heightfield +
   CARVE SYNC only. Your new carve body mirrors into the **post-split** `WORKER_SOURCE`.

---

## §1 — Locked scope (from the ticket)

- **Routing = FEAT-22 flow trace.** A stream = `traceFlow(source)`: gradient descent (−∇height) from a
  seeded **saddle** (FEAT-22 saddle detection). A saddle is the spill point of the uphill basin AND the
  head of the downhill stream — that's the natural source.
- **Streams terminate at ponds for FREE.** Gradient descent always ends at a local minimum; minima ARE
  FEAT-17 basins. No confluence/hydrology system for v1 — it's a property of the trace, not extra logic.
- **Own channel carve** — a NEW carve body cutting bed + banks, **separate from the road carve**. The
  water surface **descends** along the centerline (NOT a flat plane like a pond).
- **Roads BRIDGE every crossing** — road holds its line, deck at road grade, channel continuous
  underneath (no road carve into the bed at the crossing). Shares FEAT-08's deck/support builder.
- **Simple procedural water material** — same spirit as FEAT-17's shader; a ribbon-like surface following
  the channel centerline at bed+depth height (possibly reuse the road ribbon centerline→strip machinery).

## §2 — The channel carve (respect CARVE SYNC — this is the trap)

The stream carve is a **NEW carve body** alongside the road carve. CARVE SYNC discipline (CLAUDE.md
"Terrain Worker", memory `project_terrain_worker_constraints`):

- **Canonical carve body** lives in `src/road-carve.js`; height helpers in `src/seed.js`.
- Both are **mirrored verbatim** into `WORKER_SOURCE` in `src/terrain.js` (search `CARVE SYNC` / SYNC
  RULE). **Edit the canonical original and reflect it into `WORKER_SOURCE` in the SAME commit.**
- ⚠️ Note: terrain.js:1399 says "carve never enters the worker — it is a post-read main-thread blend."
  So the carve *body* (geometry math) is mirrored for determinism, but the actual height blend is applied
  main-thread after the worker returns raw heights. Follow the existing road-carve pattern exactly; don't
  invent a new worker path for water carve. **Do NOT add a carve worker** (COORDINATION invariant: two
  workers total).
- **Road-carve × stream-carve interaction at a crossing:** the road bridges OVER, so the channel carve
  passes UNDER the bridge — the road deck is **NOT** carved down to the streambed there. Make the two
  carve bodies compose cleanly (stream carves the bed; road carve is suppressed / lifted to the deck at
  the crossing span).

⚠️ **Coordinate the `WORKER_SOURCE` edit with the router worker (QUAL-08).** The router is *removing* the
ROUTE SYNC region from that same string. Land after the router's split so you mirror your CARVE SYNC body
into the final terrain.js. Independent regions of the string, but don't edit it simultaneously — rebase.

## §3 — Bridge detection + geometry

- **Detect road×stream crossings** after the network is routed — same pattern as `_detectJunctions` /
  the crossing classifier (memory `project_crossing_classifier`): road network polylines vs stream
  centerlines → crossing points.
- **Emit a bridge span** at each: deck at road grade, abutments/piers at the banks, channel continuous
  underneath. **Reuse FEAT-08's self-overpass deck/support builder** (grade-separated span) — bridges are
  the water counterpart. Check FEAT-08's state (`feat-road-self-overpass.md`) — if it's not built yet,
  you may build the shared span builder here and FEAT-08 reuses it.
- Procedural, no-asset. Window-invariant: a bridge is a pure fn of (road network × stream path), identical
  regardless of approach / draw distance.

## §4 — Files

- **EDIT `src/road-carve.js`** — new stream carve body (canonical) in a CARVE SYNC region.
- **EDIT `src/terrain.js`** — mirror the new carve body into `WORKER_SOURCE` (same commit; the
  route-worker-sync + carve gates enforce byte-equality). Do this on the **post-QUAL-08** terrain.js.
- **NEW** stream path/index module (or extend `src/water.js`) — seeded saddle sources + `traceFlow`
  consumption → stream centerlines, macro-cell-keyed + window-invariant.
- **NEW** stream water-surface render (descending ribbon) + bridge geometry (or share FEAT-08's builder).
- **EDIT `src/road.js`** — bridge-at-crossing hook in the crossing/assembly path (disjoint from the
  router's dispatcher region L1145–1240 and QUAL-10's node-junction region L2740–2980; serialize commits).
- **EDIT `src/main.js`** — wiring (instantiate, per-frame update, seed-reset rebuild).
- **EDIT `data/ranger.js`** — stream frequency, channel width/depth, bridge clearance (own commented
  block; USER-OWNED values; don't reorder keys).
- **`test/`** — stream-carve smoothness + determinism/invariance gate; add the new carve body to ALL
  CARVE SYNC sites the gates check. Register in `run-all.mjs`.

## §5 — Acceptance (from the ticket)

- Streams carve visible channels (bed + banks) that **descend** across terrain, deterministic +
  window-invariant (identical regardless of approach / draw distance).
- **Every** road×stream crossing is a BRIDGE: road holds alignment, deck at road grade, channel
  continuous underneath (no road carve into the streambed at the crossing).
- `npm test` green (carve gates, smoothness, road-band coverage, route-worker-sync) **with the new stream
  carve body added to all CARVE SYNC sites**.
- Tunable: stream frequency, channel width/depth, bridge clearance (debug sliders, USER-OWNED set).

## §6 — Watch-outs / coordination

- **FEAT-22 API** — agree `traceFlow(source) → polyline` + `saddlesNear(region) → [{pos}]` with the ponds
  worker before you start; they own `src/water.js`, you import it. Don't duplicate detection.
- **Land last** — after intersections (commits the tree), router (splits WORKER_SOURCE), and ponds
  (builds FEAT-22). Work in a git worktree; rebase onto the final terrain.js/road.js.
- **CARVE SYNC is the #1 regression risk** here — the byte-equality gate will catch drift, but only if you
  mirror in the same commit. Re-read `project_terrain_worker_constraints` (never postMessage whole
  RANGER_PARAMS; the mirror must be byte-identical).
- **Physics** beyond "don't fall through to void" is v2 — record the decision, don't build water dynamics.
- Confluence into ponds is FREE via the trace ending at a basin; don't build hydrology. Just make sure a
  stream visually meets a pond cleanly (it flows into the basin the trace terminates in).
