---
id: PERF-28
type: perf
status: completed
closed: 2026-11-06
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

  Code reading, 11-06 (no measurement):
  - **`_detectNodeJunctions` is struck off.** A positional adopt pays for it eagerly, between frames:
    `adoptNetwork` → `_adoptDirtyRegions` → `padReachNodes()` (road.js:2433, :9098). So the next physics step
    finds it already built. The adopt runs in the worker's reply handler (`_onReply`,
    road-network-client.js), which is a task of its own between frames, not part of any frame.
    What is still lazy on the wheel path is `carveHint`'s 0.05 m memo and the sibling-test map.
    The sibling-test map is one O(runs) pass, which is cheap.
  - **In freecam the parked truck's ground streams away.** `roadStreamCenter()` (main.js) returns
    the freecam position, so the 320 m road window and the terrain ring follow the camera. The stream
    scenario starts the camera at the truck and moves it away along +x. The truck leaves the road window
    after about 16 s at 20 m/s, and after about 3 s at 100 m/s. So the 45 ms step is paid by wheel queries
    on ground outside the streamed window. It showed in 2 of 2 freecam runs and 0 of 1 drive run, so it
    may be a freecam-only cost that a driving player never pays. That needs n > 1 to say.
  - The program counter was 0 on all five clean spikes, not only the 105 ms one (`prog`,
    perf28-clean-*.json). That fits churn, and also a program created on an earlier frame that links late.
    `--gpu`'s per-tick +/− log tells the two apart.

Our own GPU time per frame (timer queries): p50 9.5–12.7 ms, mostly the main scene; the shadow bake's
renders peak at 40–68 ms in one frame at 100 m/s. Frames timed at 85 ms of GPU still had a 16.7 ms
period, so these ANGLE/Metal readings are upper bounds, not execution time. Do not act on them alone.

## 2026-11-06 clean-GPU batch (Lane A) — attribution complete

All runs were on current main (feature/run-shape c5ca43f7 = main + Lane A's own work, which touches no
frame-loop code), seed 6, 1400×900. The GPU was cleared by the orchestrator: before every run there were 0
foreign headless Chromes, and the load average was 2–4. Logs and JSON are in `perf-runs/g-*.json`.

### 1. The ticket's own commands at cpu ×4, A/B against the PERF-33 merge 072692f0 (same session)

| run (cpu ×4) | p50 | p95 | p99 | over 24 ms | frames over 100 ms |
|---|---|---|---|---|---|
| stream 60 s, current main | 16.7 | 18.6 | 19.2 | 0.25 % | none |
| stream 60 s, 072692f0 | 16.6 | 18.7 | 20.4 | 0.17 % | 281 ms (+2 shader programs) |
| drive 45 s, current main | 16.7 | 18.6 | 24.1 | 1.0 % | none |
| drive 45 s, 072692f0 | 16.7 | 18.5 | 19.1 | 0.31 % | 326 ms, 130 ms (+1 program), 130 ms (+1 program) |

- **No streaming regression.** The 11-05 "baseline" (p95 45 ms, 20 % over 24 ms) was the shared GPU, not code.
  The acceptance bar holds: no streaming tag has a lift that implies a frame over 50 ms at cpu ×4, in either
  scenario.
- **The big frames in 072692f0 are mid-play shader compiles** (frame.render 120–313 ms at ×4, `+Nsh` on the
  hitch line). BUG-98 (3fdc3f32, after that base) prewarms the lamp-state and light-count variants and sweeps
  late materials. Current main shows none in 5 runs.
- **One open question, small:** at ×4, driving on current main had 27 frames over 24 ms against 8 on the base.
  These are frames carrying two physics steps (frame.physics 22–28 ms at ×4). The quiet-frame CPU is 8.1 ms
  against 7.4 ms (+0.7 ms at ×4, about +0.2 ms native). That is steady per-step cost from what landed since
  09-24 (FEAT-147/169/65/171…), not a streaming event, and it is n = 1 each. One more A/B pair would say whether
  it is real. The base worktree is kept for that (`/Users/ledogen/CodeShit/CarGame-perf28-base`, :3732).

### 2. Program churn (`--gpu`, native): none

`programs: +0 created / -0 deleted` in all three native runs (freecam 20 m/s, freecam 100 m/s, drive), and the
traces show no synchronous GL waits (`CommandBufferHelper::Finish`: 0 ms). The two GetProgramiv waits on 11-05
(33 ms, and 63 + 29 ms) did not reproduce in 3 traced runs. BUG-98 was already in that tree, so they stay
unexplained. With n = 2 in 6 runs and 0 here, there is nothing to act on.

### 3. The "45 ms physics step": the AudioContext being constructed, not physics

`--phys`: Box3D's step is 0.02–0.05 ms mean, with no call over 5 ms in any run. `--trace`'s JS profile of the
long frame (both freecam runs; it is also the 47 ms frame in the cpu ×4 stream run):

```
js 38.1 getAudioContext < live < playLanding        (freecam 20 m/s, 40.7 ms frame)
js 37.7 getAudioContext < live < playLanding        (freecam 100 m/s, 46.0 ms frame)
```

- `src/contact-audio.js`'s `live()` calls `getAudioContext()` (src/engine-audio.js), and the first call
  CONSTRUCTS the context: `new AudioContext()` costs about 38 ms. Its docstring says "created lazily, on a user
  gesture", but this caller is the landing thud, inside the fixed step (`stepContactAudio`).
- The stream scenario never presses a key, so no gesture has made the context yet. The parked truck "lands"
  once the camera is about 1.1–1.3 km away (57 s in at 20 m/s, 13 s in at 100 m/s): its ground streams out from
  under it, because in freecam `roadStreamCenter()` is the camera.
- **A player never pays this in a frame.** `_unlockAudio` (main.js) builds the context on the first pointerdown,
  keydown or pad input, normally on a menu. The drive run shows that cost where it belongs: 52 ms in the first
  `keydown` task (`getAudioContext < ensureEngineAudio < _unlockAudio`, 39.8 ms; tire noise and starter fetch the
  rest), once per page load.
- So this spike is a harness artefact. It also exposes a freecam-only quirk: the parked truck drops when the
  camera streams its ground away.

### Also seen, harness artefacts (not the game)

- The first frame of every `--trace` window is 158–171 ms with about 2 ms of CPU: Tracing.start stalling the
  renderer (t ≈ 98.5–98.9 s in all three runs, at the window start).
- ANGLE/Metal timer queries keep reading above the frame period (47 ms of "GPU" in a 16.7 ms period). As
  noted above, they are upper bounds only.

### Verdict and proposals (the owner's / orchestrator's call; nothing changed in src/)

The 0.1–0.2 s events were a **shared GPU** (finding 1, 11-05): other GPU clients, such as orphaned harness
Chromes, a game, or a video. On a clean GPU, current main runs 0–1 frames over 30 ms per minute in freecam and
driving, and the one it does run is the harness's own artefact.

1. **Nothing to fix in streaming.** Close the ticket on this evidence.
2. Optional, one line, about 38 ms: give the audio playback helpers' `live()` (contact, result, rank-music,
   pump) a getter that never constructs the context. That would make getAudioContext's docstring true and take
   the artefact out of headless measurements. A player sees no difference.
3. Optional: one more cpu ×4 drive A/B pair to settle the +0.7 ms (×4) per-frame CPU question above.

Cleanup: the 11-05 and 11-06 traces (about 2 GB) are deleted; the JSON summaries stay in perf-runs/.

## Resolution (2026-11-06, Lane A) — CLOSED on evidence (orchestrator)

The 0.1–0.2 s events were other GPU clients sharing the GPU (finding 1). On a clean GPU, current main has no
streaming hitch class left: no streaming regression against 072692f0 at cpu ×4, and no mid-play shader
compiles (BUG-98 closed that class). One spike was left: the AudioContext being built inside a fixed step, in
headless runs only.

- Taken: proposal 2 (a2d28361). `getAudioContext(create = false)` on every playback path, so only the gesture
  unlock constructs the context and no fixed step can.
- Skipped: proposal 3 (the +0.2 ms native drive A/B pair). The base worktree is removed.
- Tooling kept in `test/hitch-report.mjs`: `--trace` (JS stacks, GPU-process busy, sync GL waits),
  `--analyze=FILE`, `--gpu` (timer queries plus program churn), `--phys` (Box3D step timer). `test/lib/cdp.mjs`
  now kills its Chrome on SIGTERM and SIGHUP, the orphan fix behind finding 1.
- Owed before landing: `cdp-smoke`, the only gate that covers the audio files. It was held while Spare timed
  PERF-31 on the shared GPU.

