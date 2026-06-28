---
id: FEAT-10
type: feature
status: open
opened: 2026-06-25
severity: major
source: user-observation (in-sim screenshot — spiral + parallel-duplicate roads)
supersedes: COVER suppression mechanism (PROTO_COVER_*)
prereq_for: FEAT-07
closes_on_landing: BUG-17 (COVER toggle is removed by this — close BUG-17 as subsumed)
note: "Request: a routing-graph that MERGES into existing roads instead of laying parallel duplicates,
with a robust exclusion zone — robust network connecting points, minimal small loopbacks, a real (but
condensed-for-game) forest-road system. This is UPSTREAM of FEAT-07: FEAT-07 renders junctions; it
cannot fix a network that generates duplicates in the first place."
---

# FEAT-10: Robust route merge + exclusion — a deterministic road GRAPH (replaces COVER)

## Problem (observed 2026-06-25, in-sim)

The streamed network lays **multiple near-parallel ribbons down the same corridor** (e.g. two roads
leaving the same point on the same path) and **spirals on itself** (concentric "rose" loops). It is
ugly and hard to drive. Two distinct root causes, neither of which is FEAT-07:

1. **Parallel duplicates.** Each macro-row routes its run **independently** (`_protoConnect` per
   `mz:mx`, `road.js:~1259`), and the A\* may take a ±`PROTO_MARGIN` (120 m) N/S detour to wrap peaks
   (`road.js:233`). Runs from different rows converge into the same valley corridor and stack. The
   dedup meant to stop this — **COVER** (`_streamNetwork`, `road.js:1470`) — is too weak:
   - **whole-connection grain** (drops only if > `PROTO_COVER_FRAC`=0.5 of a *whole* connection
     overlaps — partial overlaps survive),
   - **adjacent-row only** (`PROTO_COVER_DEPTH`=1),
   - **heading-gated** (`PROTO_COVER_DOT`=0.93 ≈ 21° — the BUG-16 heading dither defeats it),
   - and it **deletes, never merges** (leaves a gap; never reuses the existing road).
2. **The spiral.** `_protoAnchor` (`road.js:1197`) gradient-descends each cell's anchor into its
   valley floor; many cells funnel into one basin (the `PROTO_SNAP_CAP`≈115 m lane cap is not enough),
   and the router wraps the central peak with **no penalty for revisiting near-traversed ground or for
   tight loopbacks** → concentric rings. COVER does not address this at all.

## Goal

Generate the network as a **deterministic, window-invariant GRAPH** that connects the macro-anchors
with **minimal redundancy**: where a road already exists along a corridor, **merge onto it** (forming a
clean T/Y junction) instead of laying a parallel duplicate; collapse converging anchors into shared
nodes; suppress tight self-loops. Target character (user): **connected, mostly-tree, a FEW deliberate
loops** where two corridors genuinely serve different areas — a condensed forest-road network, not a
spiral and not a merged-into-one-blob mess.

The merge points this produces ARE the junctions FEAT-07 then renders as a single merged mesh — so this
ticket is FEAT-07's prerequisite and feeds it clean, deduplicated junction nodes.

## The non-negotiable constraint: window-invariance

Every "a road already exists here / merge to it" decision MUST be a **pure function of (seed, world
coords, params) + a deterministic total priority** — never of stream center or build order. This is the
one thing COVER got right (it compares against canonical lower-`mz` centerlines, computed even for
out-of-band rows) and it must be preserved. Use the existing tie-break: **lower `(mz, mx)` lexicographic
= higher priority.** Lower-priority elements yield/merge to higher-priority ones by pure geometry, so
any stream center reaches the identical graph.

## Design — two mechanisms (user chose BOTH)

### A. Anchor-node EXCLUSION → shared graph nodes (kills the spiral at the source)
After `_protoAnchor` snaps a cell's anchor to its valley floor, run a deterministic merge pass: an
anchor computes the snapped positions of its neighbour anchors (a bounded macro-window; all pure
fns/cached) and, if a **higher-priority** anchor lies within `roadNodeMergeRadius` (R_excl), it
**adopts that node's position** (merge) instead of standing as a separate node a few metres away.
Result: **one shared node per basin**; rows connect TO it rather than each laying a ring. The implicit
per-row chain becomes a real **graph** (deduped nodes + edges between consecutive *distinct* nodes;
zero-length/degenerate edges from two anchors that merged to the same node simply vanish).

### B. Corridor MERGE (merge mid-span overlaps, not just at nodes)
Where two connections still want the same corridor mid-span (from detours), the lower-priority one
should **ride the higher-priority centerline** (shared geometry = a merge), diverging only to reach its
distinct endpoint → a T/Y at the divergence. Where corridors genuinely separate, a **parallel penalty**
pushes the lower one onto its own corridor (a deliberate loop is allowed).

**KEY DESIGN FORK (resolve in planning — affects scope a lot):**
- **B1 — post-route graph merge pass (LEANING THIS).** Keep the per-connection router *unchanged*.
  After all connections are routed canonically, run a deterministic **span-grained** pass (COVER's
  successor, but MERGING not deleting): where a lower-priority centerline runs within `roadMergeBand`
  of, and co-directional with, a higher-priority one, **snap/replace that span with the shared
  geometry** and trim to a junction node. Pure geometric post-process on the main thread → **no Worker
  router changes, no ROUTE SYNC churn** (the `route-worker-sync` gate stays trivially green).
- **B2 — corridor cost inside `arcPrimitiveConnect`.** Add a parallel-penalty + follow-discount cost
  term so the A\* itself prefers to share an existing centerline. More "correct," but the higher-priority
  centerline set must then be available **inside the Worker pre-warm** (`WORKER_SOURCE` ROUTE SYNC) or
  the merge only happens on the main-thread fallback path — inconsistent. Heavier, riskier.

Recommendation: **B1** (post-route merge) for robustness with the least router/Worker risk; revisit B2
only if mid-span merges need to influence the actual arc geometry rather than snap onto it.

### C. Loopback suppression
Penalize tight self-loops: a cost for a primitive whose cell was already traversed within THIS
connection (or revisit-within-R of an earlier arc-s of the same run) in `arcPrimitiveConnect`, and/or
cap/relax `PROTO_MARGIN` so peak-wrapping can't spiral. Tune so a genuine switchback survives but a
concentric ring does not.

### D. Junction nodes are GRAPH-NATIVE — supersede `_detectJunctions`'s brute-force scan (2026-06-27)
The merge graph from A/B **emits junction nodes by construction** (a merge node where an anchor adopts a
higher-priority node, a T/Y where a corridor diverges). FEAT-10 therefore OWNS the junction-node record
and **replaces the post-hoc geometric detection** in `road.js _detectJunctions()`.

Why this matters (the disposition, with FEAT-07): `_detectJunctions` today is a **pairwise
O(runs² × seg²) crossing rescan run EVERY re-stream**, memoized only by object identity and cleared on
re-stream. It caused a measured **296 ms single-frame stall at Ultra** (CPU trace
`Trace-20260627T013753`: `loop → flushPendingQueue → _buildRoadTile → _detectJunctions`; only the M4 is
fast enough to reach an Ultra-size network and notice the freeze). **Do NOT broad-phase-optimize that
scan — delete it.** Junction nodes come from the graph in O(N), incrementally. A large part of the N²
cost is also a *symptom* of the un-merged network this ticket fixes: it footprints crossings at the very
parallel-duplicate / spiral overlaps FEAT-10 deletes, so the crossing set collapses once A/B land.

Residual: genuine NON-merge X-crossings (two corridors that legitimately cross at an angle without
merging) and FEAT-08 arc-separated overpasses still need a geometric crossing pass — but **bounded**
(tile-bucket broad-phase) and run **ONCE during graph build**, emitted into the same node record, not
rescanned per frame. Design the node/junction record ONCE here so FEAT-07 (at-grade merged mesh) and
FEAT-08 (overpass) both consume graph nodes directly.

Immediate, FEAT-10-independent mitigation: `road-mesh.js buildJunctionFootprint` renders only an
imperfect placeholder pad (overlapping ribbons, no carve), so **gate it off the hot path now** to kill
the 296 ms stall with zero shipped-feature loss until FEAT-07 builds the real merged surface.

> **DONE 2026-06-27 (mitigation only — Design D proper still open):** added `roadJunctionFootprints`
> (ranger.js, default **false**) and gated the per-tile `_detectJunctions()` call in `road-mesh.js`
> `_buildRoadTile` behind it. The O(N²) crossing rescan no longer runs on the `flushPendingQueue` hot
> path → 296 ms Ultra stall removed. The scan + placeholder footprint are dormant, not deleted; the
> real fix (graph-native junction nodes, delete the brute-force scan) is still owned by this ticket.
> 16 gates green.

## Acceptance

- On the seed that currently spirals (the screenshot, seed 6): **no two roads run parallel within
  ~`roadMergeBand` over a meaningful length**, **no concentric self-loops**, and the leftward duplicate
  is gone (merged to one). Every macro-anchor stays **reachable** (connectivity preserved — we didn't
  just delete roads into disconnection).
- Redundant corridors merge into clean **T/Y junction nodes** (the FEAT-07 input), not overlapping
  ribbons. A few deliberate loops remain where corridors genuinely diverge.
- **Window-invariant + deterministic:** the merged graph (node set + positions + edge set +
  centerlines) is **identical across two stream centers** and across a re-stream. COVER (`PROTO_COVER_*`)
  is removed; **BUG-17 closed as subsumed.**
- No regression: `road-minradius`, `road-smoothness`, `camber-continuity`, `invariance`,
  `restream-invariance`, `route-worker-sync` all stay green.
- **Junction nodes are graph-native (Design D):** the `_detectJunctions` brute-force O(N²) crossing
  rescan is **deleted**, junction nodes are read from the merge graph + a bounded once-per-build crossing
  pass. The Ultra re-stream frame stall (296 ms, `Trace-20260627T013753`) is gone — no per-re-stream
  full network rescan. (If the placeholder footprint is gated off first as the immediate mitigation,
  verify the real graph-node path restores correct junction nodes.)

## Determinism / gates

- Extend the invariance harness: assert node positions + edge set + per-edge centerline are identical
  from two stream centers (the BUG-08 contract, now at the GRAPH level).
- New metric gates (register in `run-all.mjs`): **no-duplicate** (no pair of centerlines within
  `roadMergeBand`, same heading, for > `Lmin` on test seeds) and **loop-count** (bounded
  self-loops per unit area) — with a control showing the pre-FEAT-10 network exceeds them.
- If B1: `route-worker-sync` is untouched (merge is post-network). If B2: the ROUTE SYNC region grows —
  mirror into `WORKER_SOURCE` in the same commit and keep the gate byte-identical.

## Relationships

- **FEAT-07** (merged intersection mesh): FEAT-10 is its **prerequisite** — it produces the clean,
  deduplicated junction nodes FEAT-07 renders. They share the junction concept; design the node/junction
  record once so FEAT-07 consumes FEAT-10's graph nodes directly (Design D). FEAT-10 OWNS the deletion of
  the `_detectJunctions` brute-force scan; FEAT-07 owns the merged mesh + carve that consume the nodes,
  and the immediate gate-off-the-placeholder mitigation.
- **BUG-17** (COVER toggle does nothing): **subsumed** — COVER is deleted here. Close BUG-17 when this
  lands (user: "defer BUG-17 when we remove COVER").
- **BUG-16** (heading dither): the dither is part of why COVER's heading gate fails; a smoother
  centerline also makes the parallel/merge test cleaner. Related, not blocking.
- **QUAL-03** (graph-based constrained-spline road re-architecture): FEAT-10 is a concrete step toward
  it — the network becomes an explicit graph here.
- **FEAT-08** (self-overpasses): an arc-length-separated crossing that is NOT merged stays a candidate
  overpass; FEAT-10's merge-vs-cross classification feeds FEAT-08's detection too.

## Files (anticipated)

- `src/road.js` — `_protoAnchor` (node exclusion/merge), `_streamNetwork` (build the graph + **remove
  the COVER pass**), the post-route merge pass (B1), `_protoConnect`/`_protoConnectCenterline`,
  `_segSegDist2` pre-filter reuse, delete `PROTO_COVER_*`, revisit `PROTO_SNAP_CAP`/`PROTO_MARGIN`.
  **Replace `_detectJunctions`'s brute-force scan (road.js:1700) with graph-node emission + a bounded
  once-per-build crossing pass (Design D); keep the junction-node RECORD shape FEAT-07/08 consume.**
- `src/road-carve.js` — only if B2 / loop-penalty land in `arcPrimitiveConnect` (then ROUTE SYNC).
- `data/ranger.js` — `roadNodeMergeRadius`, `roadMergeBand`, parallel/follow + loop-penalty knobs,
  network-character sliders.
- `test/` — graph-invariance + no-duplicate + loop-count gates (+ register in `run-all.mjs`).

## Open questions (planning)

- B1 vs B2 (above) — the main fork; lean B1.
- Node-merge radius vs anchor spacing: too large = roads collapse into one trunk (the "don't merge
  everything" failure); too small = duplicates survive. Tune for "connected + a few loops."
- How a merge trims to a junction (T vs Y vs crossing) and how that record is shaped so FEAT-07 +
  FEAT-08 both consume it.
- Connectivity guarantee: after merges/exclusions, prove no anchor is orphaned (a reachability check in
  the no-duplicate gate).
