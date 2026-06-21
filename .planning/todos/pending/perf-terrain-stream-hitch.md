---
id: PERF-02
type: perf
status: open
opened: 2026-06-21
severity: major
source: user-observation
---

# PERF-02: Frame-drop hitch when new terrain chunks stream in (row-at-once, uncapped main-thread carve)

## Symptom

A noticeable frame drop at the exact moment new terrain loads in while driving — as the truck crosses a
chunk boundary and a new band of terrain appears, the frame hitches. Steady-state driving is fine; the
spike is tied to chunk load. Hurts the core "honest, smooth to drive" feel.

## Root cause (from code)

`TerrainSystem._updateChunkRing` (`src/terrain.js:742`) refills the chunk ring, but the
**request/dispatch loop is the one frame-spread gap** in an otherwise budgeted system:

- `src/terrain.js:802` — `for (const key of needed)` iterates the needed-chunk **Set** (unordered, no
  proximity) and requests EVERY missing chunk in this single tick. No per-frame cap.
- `src/terrain.js:811` — for each requested chunk it builds the carve table **synchronously on the main
  thread**: `const carveTable = this._buildCarveTable(cx, cz)` (it must be main-thread — it needs road
  access; the result is transferred to the Worker). Already instrumented via
  `perfAdd('dispatch.buildCarveTable', …)` (`:812`).

With `RING_RADIUS = 2` (5×5 = 25 chunks, `:42`), crossing one chunk boundary brings a whole new
**row/column of up to 5 chunks** (an L of up to ~9 at a corner) into `needed` at once → 5–9 main-thread
`_buildCarveTable` calls in one frame → the spike the user feels.

Note the asymmetry: the Worker height generation is off-thread, and the geometry build
(`_flushPendingQueue`) AND the version-mismatch re-carve pass are BOTH capped at
`MAX_BUILDS_PER_FRAME = 2` (`:43`, `:773`). Only the request-time carve build was left uncapped and
unordered — so the fix is to extend the existing frame-spread discipline to it.

## Fix direction (user-proposed, confirmed by code)

Stream chunks **a few at a time, nearest-first**, instead of a whole row at once:

1. **Order** the missing-chunk set by distance from the truck (nearest chunk centers first) so the area
   under/ahead of the truck fills before the periphery — no visible hole where it matters.
2. **Budget** the requests per frame: introduce `MAX_REQUESTS_PER_FRAME` (or reuse
   `MAX_BUILDS_PER_FRAME`), break out of the dispatch loop once the budget is hit, and let the next
   `update()` tick request the rest. One-at-a-time = budget 1; a small N (2–3) is likely smooth enough.
   The remaining chunks just stay un-requested until the next frame — `_pendingWorker` already prevents
   duplicate requests, so no extra bookkeeping is needed.
3. (Optional, larger) move `_buildCarveTable` off the synchronous dispatch path entirely (defer/queue it),
   but budget+proximity is the minimal change that mirrors the existing capped paths.

Mirrors the proven `MAX_BUILDS_PER_FRAME` pattern already used two lines away — low risk, deterministic.

## Acceptance

- Crossing chunk boundaries at driving speed produces no perceptible frame drop; `dispatch.buildCarveTable`
  cost per frame is bounded (≤ the chosen budget), not a 5–9× row spike.
- Nearest chunks load first — no visible hole under/ahead of the truck while the ring backfills.
- No correctness regression: the ring still fully populates within a few frames; re-stream / determinism
  gates (invariance, restream-invariance) stay green; `_pendingWorker` dedup still holds.

## Files

- `src/terrain.js` — `_updateChunkRing` request loop (`:802`), `_buildCarveTable` dispatch (`:811`),
  `RING_RADIUS` / `MAX_BUILDS_PER_FRAME` (`:42-43`); add proximity sort + a per-frame request budget.

## Relationships

- **PERF-01** (completed) — that was the COLD-route spawn lag (`arcPrimitiveConnect`); this is the
  steady-state streaming hitch. Different cause, same "spread main-thread cost across frames" philosophy.
- The frame-spread budget discipline (`MAX_BUILDS_PER_FRAME`) is the existing pattern to extend.
