---
id: PERF-28
type: perf
status: open
severity: major
opened: 2026-08-24
source: owner observation (2026-08-24) — "occasionally a .1-.2ms frame loss event" while
  free-camming (most noticeable) and driving (less noticeable); reading the magnitude as
  0.1–0.2 s stalls (a 6–12 frame loss at 60 fps — a 0.2 ms event would be invisible)
relates: PERF-26 (hitch-report attribution harness + warmscan), PERF-08 (?prof/?hitch
  instrumentation), BUG-55 (delete-rung cost — the top suspect), PERF-19 item 5 (terrain
  main-thread stages, deferred)
---

# PERF-28: diagnose the occasional 0.1–0.2 s frame-loss events (freecam ≫ driving)

Owner report: intermittent frame-loss events, most noticeable in free-cam, less while driving.
Unknown whether terrain or router. Diagnose FIRST, then fix the top-ranked cause — no smoothing
work before the attribution table exists.

## Hypothesis going in (to be confirmed, not assumed)

Free-cam crosses macro-cell window thresholds much faster than driving, and the frequency
ordering (freecam ≫ driving) matches main-thread work that fires per stream-window rebuild:

1. **Top suspect — the BUG-55 registration-side scans**: the pair census + the delete rung's
   `_v2ConflictPairs` enumeration measured **+270–360 ms per origin build (~7 %)** headless,
   and both run on the main thread at window rebuild. The consolidation lever (census and
   delete rung each scan per-edge today — fold into one pass) is already booked in the BUG-55
   ticket. Nest windows additionally build the lazy deep box (measured ~noise, but it is on
   the same thread).
2. Terrain chunk main-thread stages (`_buildCarveTable`, normals, vertex colors — the
   PERF-19-deferred "move to the Worker" items).
3. Degree pass / Urquhart rebuild (PERF-26 memoized the hot path; a miss still pays 30–91 ms
   at 4×).

## Method

`test/hitch-report.mjs` is built for exactly this — CDP-driven, per-frame subsystem
attribution, lift table vs quiet-frame control, `--cpu=N` throttling for stable ranking:

```
node test/hitch-report.mjs --scenario=stream --cpu=4 --duration=60 --seed=6 --out=perf-runs/perf28-stream.json
node test/hitch-report.mjs --scenario=drive  --cpu=4 --duration=45 --seed=6 --out=perf-runs/perf28-drive.json
```

(run against the corridor-router worktree server — pass its port; nothing needed from the
owner, the ?hitch instrumentation self-attributes). A/B any fix with the same two commands.

## Acceptance

- The attribution table names the subsystem(s) carrying the events, recorded in this ticket
  (before/after).
- After the fix: no streaming tag with a lift that implies a >50 ms frame at --cpu=4 in either
  scenario, and the owner no longer sees the events in free-cam at native speed.
- No behavioural change to the network: worldgen gates byte-green (`npm test` affected set;
  invariance + restream in particular if the fix stages or reorders window work).

## PERF-30 re-measure (2026-09-04) — the road-side class is CLOSED, terrain remains

PERF-30 moved the entire network build (routing + BUG-56 plan layer + assembly) onto the
network Worker; play adopts finished networks atomically (~5 ms/swap, measured). Re-run of
this ticket's own method (`hitch-report --cpu=4`, stream 60 s + drive 45 s, seed 6, results
in `perf-runs/perf30-after-{stream,drive}.json`):

- **Hypothesis suspect #1 (BUG-55/56 registration-side scans at window rebuild) no longer
  fires at all**: `road.streamNetwork` synchronous rebuild cost during play measured **0 ms /
  0 calls** across four 2 km freecam jumps (was 3.09 s over the same pattern on the sync
  path, ~770 ms per restream, with 0.2–1.4 s frame gaps per jump).
- The worst remaining ROAD frames were `frame.road.warmRoutes` + `warm.degreeDrops`
  (~40 ms combined at cpu×4) — the route pre-warm scanning for a cache nothing consumes with
  the worker active ("route warm never drained"). Fixed in the same pass: play skips
  warmRoutes when the network client is wired.
- **What remains is suspect #2**: terrain chunk main-thread stages —
  `flush.buildCarveTable`, `terrain.flushPendingQueue`, `flush.writeVertexColors` — plus
  physics/shadow/props spikes, all in the 30–57 ms band at cpu×4. A 2.3 km teleport still
  shows a ~4 s worst gap that attributes to terrain streaming, not roads.

So: this ticket's remaining scope is the PERF-19-deferred terrain worker items (+ the
props.lodSwap / shadow.bake spikes visible in the tables). The road half is done.

## 2026-09-24 — owner can no longer reproduce at idle; load-dependent suspects

The owner can't reproduce the stutter on an idle machine and suspects it only shows under heavy
background load (e.g. a test suite running). Every per-subsystem ms budget is wall-clock based, so
it self-limits under load, but these steps are NOT sliced and scale directly with CPU contention:

- Terrain in-place recarve (`_updateChunkRing` re-carve pass): one full `_buildCarveTable` per
  chunk, unsliced (the deadline is only checked before starting a chunk). Fires on every adopt that
  changes coverage. Iterates `_chunkMap` insertion order, not nearest-first.
- Ribbon tile build (`road-mesh.js flushPendingQueue`): count-capped (1/frame), no ms budget.
- Prop hard radius (`prop-system.js update` → `ensureChunk`): synchronous 20–40 ms scatter per
  chunk (PERF-14 figure) whenever the 3 ms drip feed falls behind the truck.
- Engine heightfield rebuild (`_physicsHook.syncChunk`) on every chunk commit/recarve.
- Any slow frame then pays physics catch-up substeps (PERF-32 accumulator).

Repro idea for later: run `hitch-report --scenario=drive` at `--cpu=4` WITH `npm run test:all`
running alongside, and compare against the idle baseline. The structural fix is the shared
per-frame streaming budget in the priority-scheduling work on `feature/stutter`.

## 2026-11-05 re-measure (Lane A) — the 0.1–0.2 s events are a SHARED GPU; on a clean GPU two rare CPU spikes remain

Measure-and-attribute only (orchestrator, 11-05): no fix without a number behind it. Code: main @ fb48214b
(after PERF-33's scheduler and PERF-30's network Worker). Seed 6 (a test seed), 1400×900 @1x, headless
Chrome on the M4 (ANGLE on Metal). Results: `perf-runs/perf28-*.json` + traces (git-ignored).

**New tooling in `test/hitch-report.mjs`** (each flag is described where it is parsed):
- `--trace=FILE` — a Chrome trace over the window. Every long frame period is split into the frame
  loop's own JS / GC / other main-thread tasks (worker replies, timers) / idle main thread, plus
  GPU-process busy time, synchronous GL waits, and the top JS functions from V8's sampling profiler.
  The in-loop buckets cannot see between frames; the old "off-CPU" column lumped all of these together.
- `--analyze=FILE` — the same split on a saved trace, no browser.
- `--gpu` — our own GPU milliseconds per frame (WebGL timer queries around every `renderer.render`),
  and every shader program created or deleted, by frame.
- `--phys` — times the Box3D engine step on its own; logs every call over 5 ms.

### Finding 1 — the frequent stalls are GPU sharing, not our code

Two orphaned headless Chromes (another lane's harness runs) had been rendering the game for 4 h. Same
command, native speed (`--cpu=1`), freecam sweep at 20 m/s, 60 s:

| | frames ≥ 40 ms | worst | where the time went |
|---|---|---|---|
| shared GPU (2 other WebGL clients) | 43 of 3344 (1.33 %) | 163 ms | main thread **idle** 59 %, loop 36 %, GC 0 % |
| clean GPU | 1 of 4134 (0.02 %) | 46 ms | see finding 3 |

In every shared-GPU long period, Chrome's GPU process sat 54–70 ms in
`CALayerTreeCoordinator::ApplyBackpressure::Metal`. That is Chrome refusing to present a new frame until
the GPU has finished the previous one. The GPU was busy for 93 % of those periods; our main thread had
nothing to do. So the CPU-side budgets cannot touch this class. It matches the owner's 09-24 note
("only under load"), with one correction: the load that matters is **other GPU clients** (headless test
Chromes, another game, a video), not CPU load.

Amplifier, bounded: after each stall the next frame pays 17–19 ms of physics catch-up (the PERF-32
wall-clock cap stops it there).

Fix already landed for the orphans: `test/lib/cdp.mjs` now kills its Chrome on SIGTERM and SIGHUP, not
just SIGINT (main d1654a41 + 55c8b013). A stopped harness had been leaving Chrome running.

### Finding 2 — clean GPU, native speed: 1–2 frames over 30 ms per minute

| run (60 s / 45 s) | p95 | p99 | over 30 ms | worst frames |
|---|---|---|---|---|
| freecam 20 m/s | 17.6 | 18.0 | 2 | 46 ms (physics), 41.5 ms (shader compile) |
| freecam 100 m/s (boost) | 17.5 | 17.7 | 1 | 55 ms (physics) |
| drive | 17.6 | 17.7 | 2 | **105 ms (shader compile)**, 57 ms (off-loop, one frame) |

### Finding 3 — what the remaining spikes are

- **Mid-play shader program compiles.** The 105 ms driving frame is two synchronous
  `GetProgramiv` waits of 63 and 29 ms. That's three.js asking the GPU process whether a freshly
  linked program has finished, and blocking until it has. The 41.5 ms freecam frame is a 33 ms wait of
  the same kind. Each run makes 111–169 `GetProgramiv` calls, so programs are created all through play,
  not just at load. Almost all return in under 1 ms (a driver cache hit); one or two per run block for
  30–60 ms. The hitch log's program counter did not move on the 105 ms frame. That fits **program
  churn**: three.js deletes a program when its last material is disposed, and the next material
  needing it compiles it again. Which materials do that is OPEN — `--gpu` now logs it.
- **A single 44–47 ms physics step, truck parked, freecam far away** (twice, at 20 and 100 m/s; a 178 ms one
  in a shared-GPU run). No GL wait, no GC; the time is inside the fixed-step block. Suspect: the first
  ground query after a road-network adopt paying the lazily rebuilt, revision-keyed road caches
  (`_detectNodeJunctions`, `carveHint`'s cache, the sibling-test map). Unconfirmed — `--trace`'s JS
  profile and `--phys` will say whether it is Box3D or our code.

Our own GPU time per frame (timer queries): p50 9.5–12.7 ms, mostly the main scene; the shadow bake's
renders peak at 40–68 ms in one frame at 100 m/s. Frames timed at 85 ms of GPU still had a 16.7 ms
period, so these ANGLE/Metal readings are upper bounds, not execution time. Do not act on them alone.

### Still owed (when the GPU is free — the owner is using it 11-05 evening)

1. The ticket's own commands on a clean GPU (`--cpu=4`, stream 60 s + drive 45 s). The 11-05 baseline
   (p95 45 ms, 20 % of frames over 24 ms) ran next to the two orphans, so it does not count. A/B against
   the PERF-33 merge (072692f0) in the same session, to rule a regression in or out.
2. `--gpu` on stream + drive: name the materials whose programs churn.
3. `--trace --phys` on freecam: name the 45 ms physics step.

No fix proposed yet.
