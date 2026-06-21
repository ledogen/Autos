# 09 — Window-Invariance Rewrite + Headless Harness + Game↔Harness Bridge

**Goal:** make the road network *actually* a pure function of (seed, world-coords, params) — eliminating the
BUG-08/11/14/tear lineage at the root — and build the permanent headless test infrastructure that proves it,
replacing log/dump-file debugging with deterministic gates. Plus a game→harness capture bridge (file export)
and an in-game bug-capture button (screenshot + state).

**Locked decisions (2026-06-20):**
- Headless THREE = **npm devDependency** (`three`), tests `import 'three'`; runtime keeps the CDN importmap.
- Game→harness = **file export + manual `node` run** (no backend).
- Capture = **full-replay superset schema, implemented in layers L1→L2→L3** (ambition of opt-3, sequencing of opt-2).
- Visual capture = **screenshot now** (PNG + state JSON).

**Core invariant under test (D-16, currently FALSE at edges):** for any world region, the run polylines,
run identities, per-run arc origins, gradeY, and slice boundaries are byte-identical regardless of the
streaming center. Root cause of the violation: run identity (`${mz}:${runIndex}`), arc origin (`run[0]`),
COVER-split boundaries, and the grade-smoothing window all depend on the transient canonical band
`[mx0,mx1] = f(center_mx)` (road.js:1351, 1446-1473).

---

## Phase 0 — Headless test infrastructure  ⟶ gate: `npm test` runs in node

0.1 Add `package.json` (`"type":"module"`, `devDependencies: { "three": "0.184.x" }`, `scripts.test`). Add
    `node_modules/` to `.gitignore`. Runtime `index.html` importmap is untouched — verify game still loads.
0.2 `test/lib/road-headless.mjs`: construct a `RoadSystem` in node with a deterministic height function
    (use the existing `coarseHeightOverride` ctor arg, road.js:345 — or the real seeded noise). Expose helpers:
    `buildNetwork(center)`, `sampleRegion(region)` → {runKeys, points, arcS, gradeY, sliceBoundaries}.
    Carve agreement reuses `collectChunkSplinePoints` + a replicated nearest-XZ assignment (no TerrainSystem /
    no Worker needed — `analyticHeight`/carve math is main-thread).
0.3 Confirm the existing pure gates still pass under the new runner: `arc-router.mjs`, `defect-b-grade.mjs`.

## Phase 1 — Invariance harness (RED first — proves the bug)  ⟶ gate: `test/invariance.mjs`

1.1 `test/invariance.mjs`: build the network at center A (spawn) and center B (e.g. +800 m east). For a shared
    world region assert byte-identical (within float eps): (a) set of runKeys covering it, (b) run polyline
    points, (c) per-world-point arcS, (d) gradeY, (e) slice arcS0/arcS1 boundaries. **Expect RED on current
    code** — this reproduces the freecam-vs-drive tear deterministically (no game, no dump).
1.2 Fold in a ribbon↔carve agreement assertion (synthetic, not dump-based): ribbon Y (sweepRibbon arcS path)
    == carve Y (collectChunkSplinePoints nearest-XZ path) for the region, both under cumulative-XZ. This is the
    permanent replacement for the dump-dependent `seam-grade.mjs`.
1.3 **Retire `test/seam-grade.mjs`** (dump-fixture-based) once 1.2 covers it synthetically.

## Phase 2 — World-anchored rewrite (make Phase 1 GREEN)  ⟶ gate each step on `invariance.mjs`

2.1 **World-anchor arc origin:** measure each run's arcS from a world-fixed per-run origin (not `run[0]`,
    which shifts with the band). Per-run origin avoids float-precision issues of a single global zero.
2.2 **World-anchor run identity:** key runs by a world-fixed identifier derived from their start anchor, not
    the band-relative `runIndex`. Update all `runKey` consumers (107 refs across road/road-mesh/terrain —
    mechanical; the harness catches misses).
2.3 **World-fix COVER suppression** (the genuinely hard part, road.js:1446-1473): compute suppression over a
    deterministic *world-fixed* neighborhood with stable ordering, so a region's run split/truncation is
    identical regardless of where the band is centered. Gate hard on 1.1.
2.4 Verify `smoothGradeInPlace` (defect-B) is window-invariant under the new run extents; adjust if the
    harness shows edge variance.

## Phase 3 — Delete the now-dead band-aids  ⟶ gate: full headless suite green

Once invariance is real, these become unnecessary (remove carefully, gated):
- the "do NOT bump _generation on positional re-stream" special-casing + the downstream `_runProfileCache`
  clear-on-restream (road.js:1325) — geometry no longer changes, so caches stay valid.
- evaluate whether `CANONICAL_HALF_WIDTH` margin / "consume interior" can shrink (perf win) now that
  correctness no longer depends on it.
- the BUG-14 +20m teleport guard, if the harness shows it's dead.
**Perf note:** this phase is net-positive — fewer forced re-slices/rebuilds, and it makes the future
drip-feed streamer correct by construction.

## Phase 4 — Game↔harness capture bridge + bug button  ⟶ gate: `test/replay.mjs` consumes a real capture

4.1 **Capture schema** `test/capture-schema.md` — full-replay superset, L1 fields populated now:
    `{ version, seed, params, region, streamCenterHistory[{t,x,z}], stateSnapshot, (L2: inputTimeline[],
    L3: clock) }`.
4.2 **In-game bug button** (debug UI + hotkey): snapshot seed/params/stream-center history + full vehicleState,
    grab the canvas to PNG (set `preserveDrawingBuffer:true` on the renderer), download both as a timestamped
    pair. Reuses the press-'p' dump plumbing but writes the schema, not the ad-hoc dump.
4.3 `test/replay.mjs`: load a capture file, reconstruct the headless scenario, run the matching gate
    (invariance now; physics later) and report. **This is the new default debug loop — captures replace dumps.**

## Phase 5 — (fast follow, optional) input-timeline replay = the high-value 80% of full replay

5.1 Record control inputs per fixed physics tick into the capture (L2).
5.2 `test/replay.mjs` feeds the input timeline to a headless `stepPhysics` loop (pure fn + `queryContacts`
    against headless `analyticHeight`) → reproduces driving/physics bugs headlessly.
5.3 Defer L3 (deterministic streaming clock) until a streaming-timing bug actually needs bit-exact replay.

---

## How to execute (workflow)

1. **I build Phase 0 + 1**, run `npm test`, and show you the RED invariance failures — confirming the tear's
   root cause as a deterministic test before any production code changes. (Go/no-go checkpoint.)
2. **I do Phase 2 test-first**, each sub-step gated on `invariance.mjs` going green. No in-sim guessing.
3. **You spot-check in-sim** after Phase 2 (freecam→tear-location should now match drive-in). One screenshot
   via the new bug button if anything's off → I replay it headless.
4. **Phase 3 cleanup**, **Phase 4 bridge**, then optionally **Phase 5**.

**Commands:** `npm install` once; `npm test` (runs all `test/*.mjs` gates); `node test/replay.mjs <capture.json>`
to reproduce a captured bug. Dumps/logs are retired in favor of captures + synthetic gates.

**Risk:** ~80% clean success because every step is headlessly gated; the one hard spot is Phase 2.3 (world-fixing
COVER suppression). Float precision (2.1) and the 107-ref rename (2.2) are mechanical and harness-guarded.
