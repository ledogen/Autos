---
quick_id: 260610-pl6
slug: perf-01-resolvespawn-single-warm-call
type: quick
created: 2026-06-11
files_modified:
  - src/main.js
resolves: PERF-01
---

# Quick Task: PERF-01 — resolveSpawn single warm call

## Objective

Eliminate the spawn/reload load-time regression (PERF-01) by replacing the redundant 9×9
`ensureTile` warm loop in `resolveSpawn` with a single warm call. Root cause and fix are documented
in `.planning/todos/pending/perf-road-load-time.md` (CONFIRMED ROOT CAUSE section).

## Root cause (confirmed)

`resolveSpawn` (`src/main.js`) warms the spawn region by looping `ensureTile` over a
`warmBlk = Math.ceil(200/CHUNK_SIZE) = 4` → **9×9 = 81 tiles**. Each `ensureTile(tx,tz)` re-centers
`roadSystem._streamNetwork` on that tile's center (tiles 64 m apart). `_streamNetwork` re-streams
whenever the center moves > `PROTO_REGEN_MOVE = 96` m, so consecutive tile-center drift triggers a
full network rebuild + re-slice on **~40 of the 81 calls** — over `this._proto.radius = 640 m`. This
runs on every reload (before first paint) and every R-reset. A single `_streamNetwork` already covers
640 m, so all 81 tile centers (≤ ±256 m from spawn) fall inside ONE stream — the loop is redundant.
CR-01 introduced this when it widened the loop from 3×3 to 9×9.

## Task 1: Replace the per-tile warm loop with a single warm call

**File:** `src/main.js`, `resolveSpawn`

Replace the nested warm loop:
```js
const baseTX = Math.floor(baseX / CHUNK_SIZE)
const baseTZ = Math.floor(baseZ / CHUNK_SIZE)
const warmBlk = Math.ceil(200 / CHUNK_SIZE)
for (let dtx = -warmBlk; dtx <= warmBlk; dtx++) {
  for (let dtz = -warmBlk; dtz <= warmBlk; dtz++) {
    roadSystem.ensureTile(baseTX + dtx, baseTZ + dtz)
  }
}
```
with a single warm call:
```js
const baseTX = Math.floor(baseX / CHUNK_SIZE)
const baseTZ = Math.floor(baseZ / CHUNK_SIZE)
// One ensureTile streams the whole 640 m-radius network around the spawn tile, which fully covers
// the 200 m query radius below — so a single warm call is sufficient. queryNearest then searches a
// radius-sized block of this._tiles (CR-01) cheaply, with NO further streaming. Warming per-tile
// (a 9×9 grid) re-centered _streamNetwork past its 96 m move-gate ~40 times, rebuilding the network
// redundantly on every spawn/reload (PERF-01).
roadSystem.ensureTile(baseTX, baseTZ)
```

**Constraints:**
- Do NOT modify `src/road.js`.
- Keep `queryNearest(baseX, baseZ, 200)` and the rest of `resolveSpawn` unchanged.
- Preserve the terrain-only fallback path.

**Done when:**
- The 9×9 warm loop is gone; a single `ensureTile(baseTX, baseTZ)` remains.
- `node --check src/main.js` passes.
- CR-01 correctness preserved: `queryNearest` still searches the radius-sized block, so an in-radius
  road 2–3 tiles from spawn is still found (the data is present — one 640 m stream covered it).

## Verification

- `node --check src/main.js` → OK.
- `grep -c "for (let dtx" src/main.js` → 0 in resolveSpawn (loop removed).
- Manual/browser (user): reload + R-reset noticeably faster; truck still spawns ON a road facing down
  it (Phase-08 UAT test 3 still passes).

## On completion

PERF-01 is resolved — the executor should note that `.planning/todos/pending/perf-road-load-time.md`
can be moved to completed (orchestrator handles todo closure + STATE Quick Tasks table).
