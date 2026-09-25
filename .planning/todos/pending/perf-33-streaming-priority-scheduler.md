---
id: PERF-33
type: perf
status: open
severity: major
opened: 2026-09-24
source: owner report (2026-09-24) — long-standing driving microstutter (can't reproduce idle;
  suspected under heavy machine load) + props slow to appear near the player after freecam/teleport
relates: PERF-28 (hitch attribution; load-dependent suspects appended 2026-09-24), PERF-19
  (deferred terrain main-thread stages → Worker), PERF-14 (prop scatter slicing), PERF-26
  (sliced carve), PERF-30 (network Worker — the pattern step 1 copies), PERF-32 (accumulator)
branch: feature/stutter
---

# PERF-33: streaming priority — smooth driving first, generation in owner-ranked order

## Owner priorities (ruled 2026-09-24)

1. Smooth driving beats everything — EXCEPT near the edge of generation: if the car would reach
   unready ground within **< 2 s at current speed**, it is OK to freeze until drivable road exists.
2. Main-thread streaming priority: **terrain → routing / road surface → props**.
3. Within each system: **near the player first, then ahead of travel, distant/behind last**
   (the ground around the truck always first; past that, ahead beats behind at equal distance).
4. Freeze presentation: **silent hold** (sim paused, last frame held) **+ a small yellow warning
   triangle in a corner** (FPS-game network-issue style) — tells low-performance machines to try
   lower graphics settings. No overlay, no loading screen.
5. Road network window **shifted ahead** of travel — only above **10 mph**, re-evaluated only every
   **1–2 s** (anti-thrash).

## Gap audit (2026-09-24, main @ d3e72b7)

- No in-play "ground ahead ready" guard exists (`isRingSettled` is used only for story go-live).
- No shared frame budget: terrain build 3 ms + terrain re-carve 3 ms (separate deadline) + props
  3 ms + shadow bake + water warm 2 ms + ribbon 1 tile (no ms cap) all run every frame, uncoordinated.
- Unsliced main-thread steps (scale 1:1 with CPU contention): terrain in-place re-carve (whole
  `_buildCarveTable` per chunk), ribbon tile build, prop hard-radius `ensureChunk` (20–40 ms/chunk),
  `_physicsHook.syncChunk` per commit/recarve.
- Ordering: terrain requests/builds nearest-first (no direction); re-carves in `_chunkMap` insertion
  order; ribbon tiles FIFO; props sorted by a `d2` frozen at enqueue time (re-sorted only when
  something new is enqueued), active scatter job never pre-empted; road window centred on the car.
- Throughput: prop scatter 20–40 ms/chunk at a 3 ms/frame drip ≈ 10 frames/chunk; 7×7 = 49-chunk
  prop ring ≈ 500 frames (~8 s idle) to refill after a teleport. `drainScatter()` is documented as
  the teleport path but nothing calls it.
- Terrain Worker requests cannot be cancelled once posted (FIFO); up to 8/worker/frame are posted,
  so a teleport leaves a backlog, and out-of-ring replies are still built then disposed.

## Plan (in order)

1. **Terrain chunk finishing moves into the terrain Workers** (the PERF-30 pattern — no new
   Workers, more work per existing Worker). Convert the Blob/`WORKER_SOURCE` classic worker to a
   real module worker that **imports** `road-carve.js` / `seed.js` (retires the CARVE SYNC copies).
   Ship road centreline data to the pool on each network adopt; the Worker returns heights + carve
   + normals + vertex colours as transferables; main thread only adds the mesh + engine heightfield.
   Re-carves go through the same path. Same Workers, same road data, also take:
   - **Ribbon tile geometry** (`road-mesh.js _buildRoadTile`) — pure geometry from the centrelines;
     today the only uncapped-ms item in the loop.
   - **Water detection** (`water.js warmRegion` — pond rim casts, stream traces; imports only
     `seed.js`). A cold WATER_CELL lookup costs 13–58 ms (PERF-14); off-thread, a miss never
     lands in a frame.
2. **One shared per-frame streaming budget** handed out terrain → road (adopt, ribbon) → props →
   shadow bake / water. Anything still unsliced on the main thread gets sliced so the budget
   binds. Includes:
   - **Water mesh sync keep-margin** (`water-render.js sync`): every 64 m window-key change tears
     down and rebuilds ALL stream + bed meshes in one frame (7–10 ms at cpu×4, perf30 runs). Add
     ring hysteresis (same as terrain/ribbon) and rebuild only changed pieces.
   - **Prop LOD swaps** (`_syncChunkLod`, up to ~16 ms at cpu×4 with 6 swaps/frame): GPU-buffer
     rewrites, must stay main-thread — spread across frames under the budget.
   - Physics is NOT a Worker candidate (project rule). Its 20–30 ms in hitch frames is
     accumulator catch-up after a slow frame; it falls as streaming spikes fall.
3. **< 2 s freeze guard**: ready-ground lookahead at current speed (carved terrain + road present
   along the travel direction); below 2 s the budget is lifted and the frame holds; yellow warning
   triangle while holding. Driving only (not freecam).
4. **Near-then-ahead priority** everywhere: terrain requests/builds, re-carves, ribbon tiles, props.
   Re-score queues on change, pre-empt far active jobs, skip replies for chunks that left the ring.
   Cap in-flight Worker requests (~2/worker) so the uncancellable backlog stays short.
5. **Teleport reset**: clear prop scatter queue + active job and re-arm the burst; clear terrain
   pending build queue + pending-request set with an epoch tag so stale Worker replies are dropped;
   clear ribbon / re-carve queues.
6. **Road window ahead-shift**: centre the network window ~100 m ahead of travel when > 10 mph,
   re-evaluated every 1–2 s. Network geometry is window-invariant (D-16), so only arrival timing moves.
7. **Props to a Worker** — later, only if props still show in the hitch tables after 1–6.
   `prop-scatter.js` imports only seed / flora data / biome plus height, road and water lookups —
   once step 1 puts all three in the Workers, scatter moves nearly free.

## Acceptance

- `hitch-report --cpu=4` stream + drive: no streaming tag implying a >50 ms frame; repeat with
  `npm run test:all` running alongside (the load case) and record before/after here.
- After a 2 km teleport the prop ring around the arrival point fills in ≤ ~1 s (idle machine).
- Freeze guard fires only when ready ground ahead < 2 s; warning triangle shows while holding.
- Worldgen byte-green: `npm run test:all` (invariance, restream, road-worker-parity,
  network-worker-parity in particular — step 1 changes the terrain Worker seam).

## Findings + fix 0 (2026-09-24) — the driving hitch was duplicate network adopts

Baseline (`hitch-report --cpu=4 --seed=6`, perf-runs/perf33-base-*.json): drive p99 20.1 / max
121 ms; stream p99 25.2 / max 39.4 ms. The worst DRIVING frames carried only ~8 ms of in-loop CPU:
the cost ran between frames, in the network client's `onmessage` (unbucketed until probed).

- **Duplicate adopts.** The network Worker's persistent RoadSystem kept its own PROTO_REGEN_MOVE
  (96 m) lazy gate, while the main thread re-requests by BAND. A band crossing < 96 m from the
  Worker's last center returned the OLD window; main saw the wrong band and re-requested every build
  cycle until the car cleared 96 m. Measured 5 of 6 adopts in a drive run repeating the installed
  band, each 36–84 ms at cpu×4 (adopt 10–16 + onAdopted 9–46 + pump 7–10).
  Fix: `RoadSystem.forgetStreamCenter()` before every Worker build (a request IS the decision), plus
  `holdsWindow()` so the client drops a queued 'move' for the window already installed. Band
  derivation now lives in one place (`_bandAt`).
- **Unbudgeted prop sweep in the adopt handler.** BUG-71's "whole ring on the next 6 adopts" ran a
  25–46 ms (cpu×4) sweep inside `onmessage`; with duplicates gone those 6 landed while driving.
  Fix: an adopt now OWES a whole-ring pass, paid 2 chunks/frame in the loop (`owePropSweep`). Also
  covers BUG-71's parked-truck case without an unbounded pass.

After (perf33-fix2-drive): 1 adopt instead of 6; adopt frame 25 ms (was 67–84); p99 20.3.
The remaining ~100 ms frame is the harness's first W press (one-time, every run) — not streaming.

## Owner ruling (2026-09-25) — order of work

Steps 2–6 now; step 1 (terrain finishing → Workers) only if valuable later. **Benchmark for step
1: it goes in only if its benefit outweighs its cost on a `--cpu=4` hitch-report run** (cost
includes forwarding each adopted network to every terrain Worker on the main thread).

## Steps 2–5 landed (2026-09-25) — step 6 measured and REJECTED

- **Shared budget** (`src/stream-budget.js`): one per-frame allowance = what a 60 fps frame has left
  after the smoothed non-streaming CPU (clamped 1.5–6 ms; FILL 30 ms during fills / a hold). Spent
  in order terrain → ribbon (moved ahead of props) → props scatter + LOD swaps → owed prop sweep →
  shadow bake → water pre-warm. Terrain re-carve is now SLICED (`_activeRecarve`, the same resumable
  `_carveTableGen`) — the last unsliced carve on the main thread.
- **Freeze guard** (main.js `_updateGenHold`): holds the sim when ready ground (terrain chunk ready +
  ribbon tile built + network coverage) runs out < 2 s ahead; releases at 3 s; gives up after 8 s
  (5 s cooldown). Yellow triangle top-right (below the run HUD), lingers 3 s. Driving only.
  Verified: invalidating 2 chunks ahead of a 14.5 m/s truck → one short hold, triangle shown, release.
- **Near-then-ahead ordering** (`src/stream-priority.js` `streamScore`): terrain requests, builds,
  re-carves, ribbon tiles, props (re-scored every frame, far active scatter pre-empted). In-flight
  cap 3/Worker; out-of-ring replies/active builds dropped; regen replies epoch-tagged (also fixes old-
  seed heights arriving after a reseed).
- **Teleport reset**: a stream-centre jump (>128 m/frame) re-arms the fill budgets; stale backlog is
  dropped lazily where it is out of range (a spawn warm's queue AT the destination survives).
- **Step 6 (road window ahead) REJECTED by measurement**: shifting the network centre 64 m moved its
  coverage circle too — 13 re-carve hitches + a 50 ms synchronous network build per freecam run —
  and bought nothing (the network already leads the visible terrain). Code deleted.

**A/B, cpu×4, seed 6, 3 interleaved rounds vs main d3e72b7 (medians):**

| | p95 | p99 | over-24 ms |
|---|---|---|---|
| stream base → new | 20.6 → 18.6 | 25.4 → 22.2 | 1.72 % → 0.56 % |
| drive base → new | 17.7 → 17.6 | 20.9 → 20.3 | 0.56 % → 0.36 % |

Drive outliers on both sides (3.53 % base r1, 2.28 % new r3) are physics-bound (~21 ms physics per
hitch frame, no streaming events — the truck in a contact-heavy wedge), not streaming.

**Teleport fill** (`node test/teleport-fill.mjs --cpu=4`, 2 km free-cam jumps, median of 4):
props 3×3 5.0 s → 1.6 s, 5×5 13.9 s → 3.8 s; ground 3×3 0.41 s → 0.22 s, 5×5 0.73 s → 0.32 s
(terrain first under the shared budget).
