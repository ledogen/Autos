---
id: PERF-13
type: perf
status: done
severity: minor
created: 2026-07-13
closed: 2026-07-13
---

# Initial world fill trickles at 1 chunk + 1 road tile per frame — burst until the first ring lands

## Problem

The PERF-02/05 frame budgets (1 terrain chunk / 3 ms, 1 road tile per frame) exist to prevent
hitches DURING PLAY — but they also throttle the initial fill after `__rsReady`, when there is
nothing to hitch: the player is watching the world assemble. Measured (PERF-08 Phase 2): seed-6
cold load is ready in ~1.65 s but takes ~3.2 s to ring-complete — ~1.6 s of pure trickle.

## Fix

- `src/terrain.js`: `_initialFillDone` flag — until the first full generated ring
  (`(2·(ring+warm)+1)²` chunks) is built, `_flushPendingQueue` runs burst budgets (8 builds /
  16 ms vs 1 / 3 ms). Re-armed by `rebuildAllChunksFromWorker()` (seed change/full regen is a
  load, not play).
- `src/road-mesh.js`: same pattern — `flushPendingQueue` builds up to 8 tiles/frame until the
  queue first drains empty; re-armed by `clearAll()`.

No WORKER_SOURCE / CARVE SYNC impact (main-thread scheduling only). Headless gates unaffected
(they don't run the frame-budget path).

## Verified — and honest outcome: SMALL effect on the M4; fill is worker-generate-bound

- Cold load seed 6 ×2 post-fix: ready 1687/1671 ms, ring-complete 3105/3074 ms (baseline
  3180/3270). Only ~0.1–0.2 s saved.
- Why: the pre-fix trickle was already arriving at <2 chunks/frame — the bottleneck is the
  single terrain Worker's serial `generate` cadence (+ reply latency), not the main-thread build
  cap this ticket raised. Burst only bites when the pending queue backs up (full regens, slow
  main threads à la PERF-05 iGPUs), so the change is kept: it is strictly ≤ the old wall time
  and drains regen backlogs ~8× faster.
- Drive scenario post-fix: p99 18.6 ms, dropped 0.65 % — no steady-state regression (burst is
  inert once the first ring lands).
- Follow-up (NOT scheduled): to actually cut the ready→ring ~1.4 s, parallelize terrain
  generate (worker pool like roads) or batch multiple chunks per generate message.
