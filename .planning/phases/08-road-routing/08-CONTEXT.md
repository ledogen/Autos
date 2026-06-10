# Phase 8: Road Routing - Context

**Gathered:** 2026-06-09
**Revised:** 2026-06-09 (REPLAN — architecture changed after spike 001; see banner below)
**Status:** Ready for planning (replan)

> ## ⚠ ARCHITECTURE REPLAN — read before planning
> The first Phase-8 build (per-tile west→east A* with a **hard** grade block) **failed verification**
> (`.planning/phases/08-road-routing/VERIFICATION.md`): on the locked steep coarse terrain A* found
> **no valid path on nearly every 64 m tile**, fell back to straight lines that climb mountains, and
> the seam C0 exit gate could not pass. **Do NOT plan the per-tile / hard-block model.**
>
> **GSD spike 001 (`.planning/spikes/001-valley-route-wraps-mountain/`) VALIDATED a replacement**
> architecture, user-signed-off in-sim: a **valley-following streaming-anchor trunk** routed by a
> **soft-cost A\*** that wraps around high ground. The prototype already lives in `src/road.js`
> (`updateProto`, `_protoAnchor`, `_protoConnect`, behind Roads → "Valley Trunk (proto)") and draws a
> debug centerline only. This phase makes that proto the **real, queryable, per-tile-sliced**
> `RoadSystem` output and retires the old per-tile router. The decisions below are revised to match.

<domain>
## Phase Boundary

Deliver a **deterministic, infinite road network** routed over the coarse terrain using the
**valley-following streaming-anchor** model: seeded macro-anchors snapped down to valley floors,
connected by a soft-cost A* (altitude + grade dominated) so the trunk **wraps around** high ground
instead of climbing it, streamed around the view center like terrain chunks. The continuous route
polyline is **sliced into per-tile splines** (seam C0/C1 falls out for free) and exposed as a
**queryable centerline API** with debug-line viz. The network must be stable and continuous across
64 m tile seams **before** any ribbon mesh is built.

**In scope:** make the valley trunk the real `RoadSystem` output (retire the per-tile A* / hard-block
path); soft-cost A* (altitude + grade² + finite over-cap penalty + turn penalty) over a wide window;
deterministic lazy macro-anchor generation (256 m grid) with bounded valley gradient-descent; per-tile
slicing of the continuous polyline into Catmull-Rom splines; `queryNearest(x,z) → {point, tangent}`;
**trunk-only** network (sparse spurs D-01 deferred); centerline debug viz with live cost-weight
sliders; and wiring the Phase 7 `resolveSpawn` seam to spawn the truck on the nearest road facing down it.

**Out of scope (own phases):** road surface ribbon mesh / crown / camber / terrain carve (Phase 9 —
SURF); POI anchors (Phase 10); pothole/crack micro-noise (Phase 10 stretch). **Final route-quality
tuning** (slight 10 m grid coarseness; a few unnatural loop-backs) is explicitly **deferred** by the
user to post-functional polish — not a blocker for this phase (spike 001 sign-off).

**Risk note:** This was the HIGHEST-RISK phase in v1.1. The novel router risk is now **retired** —
spike 001 validated the valley-following architecture on the real locked terrain and the user signed
off in-sim. This phase is the productionization of a proven prototype, not a fresh algorithm search.
</domain>

<decisions>
## Implementation Decisions

> Decision IDs are preserved across the replan (ROADMAP/VERIFICATION reference them). Where the
> spike-001 architecture changed a decision's mechanism, the change is called out as **(REVISED)**.

### Architecture (LOCKED by spike 001 — non-negotiable)
- **D-08 (NEW):** **Valley-following streaming-anchor model.** Endless roads = a deterministic chain
  of **valley-snapped macro-anchors on a 256 m grid**, each connected to the next by a **soft-cost
  A\*** over a wide window, streamed around the view center like terrain chunks. There is **no global
  route and no length cap** — anchors are generated lazily per macro-cell. Anchor placement is a
  **bounded valley gradient-descent** (≤ 0.45·spacing from the seeded grid point) so adjacent rows
  don't collapse into the same valley (no parallel duplicate roads). This **replaces** the per-tile
  west→east A* entirely; the old `road.js` per-tile / hard-block path is retired.
- **D-09 (NEW):** **Cost model (soft, never returns "no path"):**
  `edgeCost = wDist·horiz + wAlt·h + wGrade·grade² + wOver·max(0, grade − maxGrade) + wTurn·(Δheading/45°)`.
  The dominant **altitude** term (`wAlt·h`) is what makes the path wrap *around* high ground; the
  **finite** over-cap penalty (`wOver`) keeps it gentle without ever blocking; a **turn penalty**
  (`wTurn`, A* state carries heading) produces true switchbacks / long straights instead of micro-jogs.
  User-tuned defaults: **wAlt 0.85, wGrade 400, wOver 8000, maxGrade 0.15, wTurn 120** (current code).
  Post-path cleanup: **dedupe identical segments + collinear-simplify** before splining.

### Network Shape
- **D-01 (DEFERRED out of Phase 8):** **Sparse network** — a trunk road with *occasional seeded
  spurs/forks*. **Spurs are deferred to post-functional polish:** a trunk-only valley network already
  yields the usable per-tile splines this phase (and Phase 9) needs; seeded spurs are an additive
  branch pass that can land later without reworking the trunk. Phase 8 ships **trunk-only**. (The
  `spurProbability` param stays defined in `data/ranger.js` for that future pass.)

### Grade & Switchbacks
- **D-02 (REVISED):** **Max grade is a soft target, ~15%** (`maxGrade 0.15`), enforced by the **finite
  over-cap penalty** (D-09 `wOver`), **not** a hard `Infinity` block. The old hard block caused "no
  path" on the real terrain; the soft model wraps around steep ground and only crosses genuine passes.
  Switchbacks (ROAD-03) emerge from the turn-penalty A* + altitude term, not from grade rejection.
  Some genuine passes will still be steep — accepted by the user.
- **D-03:** Expose **maxGrade as a live debug slider** (and ideally the dominant cost weights) consistent with Phase 7's live-tuning ethos (D-08/D-12 of P7). Roads are pure functions of `(worldSeed, coords)`; param changes **debounced re-route** deterministically — no data corruption, just re-validation.

### Routing Character
- **D-04:** **Valley/altitude-seeking** cost — the dominant `wAlt·h` term (D-09) makes roads hug valley floors and wrap around high ground (the validated behavior), climbing only where unavoidable, rather than wandering mid-slope or climbing straight over peaks.

### Debug Visualization
- **D-05:** **Shipped debug viz = road centerline splines only**, toggled via a **debug-panel (lil-gui) checkbox** — consistent with existing panel conventions. Clean by default (no waypoint/grid clutter). The proto's "Valley Trunk (proto)" toggle is subsumed into the real shipped viz.
- **D-06 (REVISED):** **Seam continuity (no kinks at 64 m tile boundaries) is the exit gate.** Under the
  new model continuity is **free**: the trunk is **one continuous polyline sliced at 64 m boundaries**,
  so consecutive per-tile splines share exact endpoints (C0) and tangents (C1) with **no shared-seam-
  waypoint / ghost-point machinery** (the old C0-fix approach is moot). Re-run the seam exit-gate test
  (`test/test-road-seam.html`) green before declaring the phase complete / starting Phase 9.

### Spawn Integration (fills Phase 7 seam D-16)
- **D-07:** Swap the Phase 7 `resolveSpawn` body to **`queryNearest(x,z) → {point, tangent}`** over the
  streamed network so the truck spawns **ON the road, facing down it** (`atan2(tangent)`). Same call
  site (`src/main.js` `resolveSpawn(worldSeed, params) → {position, heading}`); signature unchanged;
  Phase 7 terrain low-slope fallback preserved if no road is near.

### Claude's Discretion
Delegated to planner within the locked constraints above: A* grid resolution (currently ~10 m — coarseness is a **deferred** tuning item, not a blocker), exact macro-anchor spacing internals, spur branch-point logic, per-tile slice/resampling resolution, spline query API shape (kept clean + stable for Phase 9 consumption), and which cost weights get live sliders beyond maxGrade.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Validated architecture (READ FIRST — supersedes the old per-tile model)
- `.planning/spikes/001-valley-route-wraps-mountain/README.md` — full investigation trail, results, and **user-tuned weights**. The valley-following architecture is VALIDATED in-sim here.
- `.planning/spikes/MANIFEST.md` — the idea, locked requirements, and the **"Real-build scope" (6 items)** that defines what "road generation actually works" means (the backbone of this replan).
- `.planning/phases/08-road-routing/VERIFICATION.md` — why the per-tile / hard-block model FAILED (architectural root cause) and the recommended replacement. Read so the failure is not re-introduced.
- `src/road.js` — the in-sim prototype lives here (`updateProto`, `_protoAnchor`, `_protoConnect`); productionize this path and retire the old per-tile / hard-block code.

### Routing / requirements / determinism
- `.planning/ROADMAP.md` — Phase 8 goal, 4 success criteria, the seam-continuity exit gate. Also the Phase 7 lock note: coarse params committed + `seedFor()` frozen. (The ROADMAP's "required research spike" note is **satisfied** by spike 001.)
- `.planning/REQUIREMENTS.md` — ROAD-01 (deterministic tile-able graph), ROAD-02 (slope-weighted cost + hard max grade), ROAD-03 (switchback), ROAD-04 (queryable splines + debug lines).
- `.planning/v1.1-BLUEPRINT-DRAFT.md` §② Road Routing — milestone intent, `seedFor("roads", …)` domain tagging, switchback rationale, 60fps constraint on `queryContacts`.
- `.planning/phases/07-free-cam-seeded-layered-terrain/07-CONTEXT.md` — D-16 (spawn-on-road seam, design road-aware now / fill in P8), D-07 (drivable mountain-pass vibe), and the HARD RULE that every generator is a pure function of `(worldSeed, world coords)`.

### Terrain calibration reference
- `references/km elev ref.png` — Eastern Sierra elevation transect (~13.3 km, ~640 m relief). Primary reference for max-grade / switchback tuning (Phase 7 D-06/D-07).

### Code seams
- `src/terrain.js` — `coarseHeight(wx,wz)` / `analyticHeight`. Router MUST use **pure `coarseHeight`**, never `sampleHeight` (chunk-load-order dependent).
- `src/seed.js` — `seedFor(worldSeed, domainTag, ...coords)` (frozen). Roads use `seedFor("roads", tileX, tileZ)`.
- `src/main.js` — `resolveSpawn` seam (D-07/D-16), `queryContacts`, render loop, debug-panel wiring.
- `src/debug.js` — lil-gui panel (folder pattern) — host the road-viz toggle + max-grade slider.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`seedFor(worldSeed, domainTag, ...coords)`** (`src/seed.js`) — domain-tagged deterministic sub-seeds; roads consume the `"roads"` tag with tile coords. Independent stream from terrain noise (no correlation).
- **`coarseHeight` / `analyticHeight`** (`src/terrain.js`) — pure coarse-terrain height for routing; never returns chunk-load-dependent values.
- **lil-gui debug panel** (`src/debug.js`) — established folder pattern; host the road-viz checkbox + max-grade slider here.
- **`resolveSpawn(worldSeed, params) → {position, heading}`** (`src/main.js`) — already designed road-aware (D-16); swap only the resolver body.

### Established Patterns
- **Pure-function-of-`(worldSeed, coords)` generators** — HARD RULE (no chunk-load / frame-timing / visit-history dependence). The router obeys it.
- **Tile-based generation (64 m tiles)** — roads are a tileable graph keyed by tile coords; **shared tile-edge waypoints derived by both adjacent tiles from the same `seedFor()` key** enforce C1 continuity at seams.
- **Debounced regenerate on param change** (Phase 7 D-09) — max-grade / road param changes re-route deterministically.

### Integration Points
- `resolveSpawn` (main.js) → road-graph nearest-node + tangent probe (D-07/D-16).
- Debug panel (debug.js) → road-viz toggle + max-grade slider.
- **Phase 9 (Road Surface)** consumes the queryable centerline splines — keep the spline query API clean and stable.
</code_context>

<specifics>
## Specific Ideas

- Feel target: **"drivable mountain-pass country"** (Phase 7 D-07) — roads like the reference transect, "somewhere a road would actually be."
- Eastern Sierra escarpment as the switchback reference — steep faces force visible hairpins, valleys stay flat.

### Real-build scope (from spike MANIFEST — the plan's backbone)
The proto only renders a debug centerline. To replace the failed per-tile router *for real*, the plan
MUST cover these six items:
1. **Make the valley trunk the actual `RoadSystem` output** — retire the per-tile A* / hard-block path.
2. **Queryable for spawn:** `queryNearest(x,z) → {point, tangent}` over the streamed network so
   `resolveSpawn` (D-07) puts the truck on the road facing down it.
3. **Per-tile slicing** of the continuous polylines so Phase 9 consumes stable per-tile splines;
   seam C0/C1 is automatic (one curve sliced).
4. ~~**Sparseness / spurs (D-01)**~~ — **DEFERRED** to post-functional polish (trunk-only ships; see D-01).
5. **Determinism + lazy infinite generation preserved** (already true of the streaming-anchor model).
6. **Re-run the Phase-8 verification / seam exit gate** (`test/test-road-seam.html`, `test/test-road.html`).
</specifics>

<deferred>
## Deferred Ideas

- **Seeded sparse spurs (D-01)** — trunk-only ships in Phase 8; spurs are an additive branch pass for later polish (`spurProbability` param retained).
- **Final route-quality tuning** — slight 10 m grid coarseness + a few unnatural loop-backs (spike 001 sign-off: post-functional polish).
- Road surface ribbon mesh, crown/camber, terrain carve — Phase 9 (SURF).
- POI anchors at road-adjacent low-slope sites — Phase 10.
- Pothole / crack micro-noise on the road surface — Phase 10 stretch.
- Truck body styles + functional brake/reverse lights — backlog 999.1.

### Reviewed Todos (not folded)
- `feat-dust-trails.md` — weak match (terrain-dependent keyword only). A particle/visual effect unrelated to road routing; deferred to its own future work.
</deferred>

---

*Phase: 8-Road Routing*
*Context gathered: 2026-06-09 · Revised 2026-06-09 (replan after spike 001 — valley-following architecture)*
