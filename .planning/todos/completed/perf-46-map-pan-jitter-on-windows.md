---
id: PERF-46
type: perf
status: closed
severity: minor
opened: 2026-11-12
source: owner, 2026-11-11 inbox — "I didn't notice this on my faster MacBook processor but on Windows, panning the map seems like it has periods where it is laggy and jittery and periods where it's perfectly smooth"
relates: PERF-38, PERF-48, BUG-68, src/map2d.js
---
lane: engine & world (the perf session)

# PERF-46: Map panning is jittery in bursts on the Windows machine

## Next steps
None. Closed by the owner 2026-11-14 (see Decisions).

## Summary
Smooth on the MacBook, alternately smooth and jittery on Windows. Under 4× slow-CPU emulation on this Mac the cause
was the sheet rebuild in the second or so after a pan or zoom settles: its tile builds and draw were not cut to the
frame budget (zoom-outs ran 30–38 frames over 20 ms, worst 100–117 ms). PERF-46 slices the rebuild: same three seeds,
every frame now lands in 16.7 ms except one, the finished sheet is pixel-identical, and it sharpens about as fast.

## Description

### PERF-48 lever 2: the dimming was not the cost (2026-11-13)
The cost map put ~59 ms/s of the map-open main thread in `_drawRegion`, read as its full-canvas even-odd fill (the
dim outside the region disc). Measured with in-page timers around each map method (story mode, seed 1768572700,
parked at the start, map open, 2090 × 1226 device px, unprofiled, fake audio, lever 1 in). Per frame:

| | still | panning | zooming |
|---|---|---|---|
| `map2d.render` | 0.86 ms | 0.86 ms | 0.98 ms |
| `_drawRegion` | 0.36 | 0.32 | 0.35 |
| … its `ctx.font =` | 0.18 | 0.18 | 0.24 |
| … its dim fill | 0.09 | 0.06 | 0.01 |
| `_drawTunnels` | 0.15 | 0.16 | 0.19 |
| `_drawPois` | 0.12 | 0.13 | 0.14 |
| `_checkParamChange` | 0.09 | 0.10 | 0.11 |

- The `ctx.font` assignment is the frame's FIRST font set, and a font set is where a dirty page pays its forced style
  recalculation (the browser recomputing CSS before it can resolve the font). Map open: 9.2 recalcs/s, 8.2 ms/s left
  after lever 1. Before lever 1 it was 57/s, 44 ms/s: that was the "dimming" cost. The pre-lever-1 profile's map trace
  shows 60 forced recalcs/s, all inside the frame's `requestAnimationFrame` callback.
- Knocking `_drawRegion` out whole leaves `render` unchanged (0.84 vs 0.75–0.89 ms as shipped): its recalc moves to
  the next font setter.
- The fill itself: ≤ 0.09 ms a frame, ≤ 5.5 ms/s. Baking it into the cached sheet would buy that much, and the
  dimming would then scale with the bitmap during a zoom gesture. Not built.
- What a still map still costs: ~0.85 ms a frame (~50 ms/s), spread over a dozen layers. Only skipping the whole
  redraw when nothing on the sheet changed would take that to ~0. It needs every input of a dozen layers tracked (the
  car, the hover, POI and offer state, the stream, the view), and a missed one is a stale map. A separate lever, not
  built.

### Pan, zoom and settle (same probe)
| | this Mac | 4× slow-CPU emulation |
|---|---|---|
| continuous pan (600 CSS px/s) or zoom (2 e-folds/s): frame p95 / worst | 16.8 / 16.8 ms | 16.8 / 16.8 ms |
| pan 1.5 s, hold 1.5 s, ×4 (720 frames): p99 / worst, frames over 20 ms | 16.8 / 16.8, 0 | 16.8 / 33.3, 1 |
| … the compose pass per rebuild (one unsliced draw of the whole sheet) | 7.1 / 5.0 / 6.6 / 4.0 ms | 9.9 / 15.0 / 25.2 / 5.0 ms |
| … worst tile steps (budget `BG_SLICE_MS` = 6 ms; a step always finishes its tile) | 14.6, 8.5, 8.4 ms | 20.2, 18.5, 16.0 ms |
| hold after a zoom (new detail level, ~280 ms of tiles): worst frame | 33.3 ms | 66.8 ms |

The emulation pauses the main thread rather than slowing it evenly, so treat its numbers as a direction, not a
forecast for the Windows machine.

### The slicing (2026-11-13, Perf lane)
The rebuild is now ONE generator (`_bgWork` in `src/map2d.js`) that yields between units of work, and
`_stepBackground` reads the clock between units. The units: a row of a ground, contour or glyph tile; a cover chunk; a
water cell's detection (`WaterSystem.warmRegion`, which is pure cache priming); a 2048 m band of the whole-sheet water
queries; a row of a pond's shore raster; one stream of the stream path. The draw itself stays ONE unit, run in a step of
its own (≤ 7 ms under 4×): drawn across several frames, Chrome rasterised it in several flushes and antialiased the road
and stream edges differently (measured, and it varied with frame timing). The previous sheet is shown until the new one
is drawn, as before. `BG_SLICE_MS` went 6 → 10: with the steps no longer overrunning, 6 made a zoom-out take 1.8–2×
as long to sharpen, and 10 still keeps every frame inside 16.7 ms under 4×. Two pure savings came with it: a tile no
longer queries the water for its cover samplers once its chunks are warm, and a ground tile skips the count blur it
never reads.

Probe `wip/perf-46/probe.mjs` (story mode, 2090 × 1226 device px, fake audio, 4× emulation, load average ~3.1–3.4 from
a macOS background process): per seed 3 pans of 600 CSS px and 4 zooms, each followed by a hold. Frames over the 2 s
after the last input (and over the whole rebuild where it ran longer), seeds 1768572700 / 17535907 / 759313244:

| hold | before: p95 / p99 / worst, frames > 20 ms | after: p95 / p99 / worst, frames > 20 ms |
|---|---|---|
| pans (9 holds) | 16.8 / 16.8 / 50.1, 2 frames | 16.8 / 16.8 / 16.8, 0 |
| zoom out to 0.147 (3) | 33.4 / 33.4–50 / 50, 31–38 each | 16.8 / 16.8 / 16.8, 0 |
| zoom out to 0.110 (3) | 100 / 100–117 / 117, 24–26 each | 16.8 / 16.8 / 16.8, 0 |
| zoom in to 0.76–0.87 (3) | 16.8 / 16.8–33.3 / 50, 0–2 | 16.8 / 16.8–33.3 / 49.9, 0–2 (seed 17535907 only: one 40 ms unit, twice in two runs, once in a glyph tile and once in the water step: likely a GC pause) |
| zoom in to 2.1–2.4 (3) | 16.8 / 16.8 / 16.8, 0 | 16.8 / 16.8 / 16.8, 0 |

Time from the last input to the finished sheet (4×; the sheet before it is shown scaled meanwhile):

| hold | before | after (budget 10) | after (budget 6) |
|---|---|---|---|
| pans | 262–468 ms | 266–434 ms | 333–601 ms |
| zoom out to 0.147 | 1.54–1.68 s | 1.74–1.77 s | 2.79–2.87 s |
| zoom out to 0.110 | 2.48–2.79 s | 3.03–3.17 s | 5.02–5.11 s |
| zoom in to ~0.8 | 1.09–1.15 s | 0.85–0.96 s | 1.32–1.36 s |

Unthrottled on this Mac (seed 17535907, budget 6): the widest zoom-out dropped 7 frames before (worst 33 ms) and none
after; time to sheet 0.73 → 1.51 s there, the rest within 16 %. Worst step after: 10–18 ms at 4× against the 10 ms budget.

Pixels: the cached sheet's raw RGBA hashed (SHA-256) at three fixed views per seed (start, zoomed out 4×, zoomed in 2×
and panned), before vs after: 9 of 9 identical, both on a fresh boot and after the pan/zoom holds. The map canvas PNGs
(`wip/perf-46/final-base/`, `final-new10/`) differ only in 1–35 px of the car marker's edge, which the base differs by
against itself (the truck parks a few cm differently each boot): `wip/perf-46/diff-crop-car-marker.png`.

Gate `test/map-bg-slice.mjs` (pure node): the real rebuild on a headless map, a fake clock that ticks once per height
sample, a close view and the widest; no step may overrun its budget by more than 4000 samples (worst seen 3076; with
one `yield` removed from a ground tile it overruns by 66 743). It cannot see work that samples nothing (the draw, a
tile's texel loop); the probe covers that.

### The Windows hypothesis (unverified here)
The drag itself only blits the cached sheet, and stays smooth. The rebuild that follows each settled pan or zoom is the
part that overruns a frame, and only for the second or so it runs. That matches "periods laggy, periods smooth". The
fix: slice the compose pass, and stop a tile build at the budget. Other suspects not yet ruled out there: network
adoption while the map is open (BUG-68's path; it must never be frozen) and garbage-collection pauses. If Chrome on
that machine draws canvas in software, every full-canvas pass (the sheet blit, the dimming) costs CPU milliseconds
instead, and the dimming bake becomes worth doing after all.

## Tracker
- [x] Owner retest on a build with PERF-38 (landed 3d008134) and PERF-48 lever 1.
- [x] ~~Owner: the `chrome://gpu` Canvas line~~ not needed: the jitter is gone (owner, 2026-11-14).
- [x] The rebuild sliced to the frame budget: settle and zoom-hold frames under 20 ms at 4× emulation, before and after
  (one 40–50 ms frame left on one seed, see Next steps).
- [x] The finished sheet pixel-identical (9/9 views by hash) and as quick to sharpen (within ~10–20 %, faster on zoom-in).
- [x] Owner: the jitter gone on the Windows machine.

## Decisions
- 2026-11-14, owner: "this has been fixed since we started cacheing the map. close"

## Links
- `.planning/perf/COST-MAP-2026-11.md` lever 2 (void). Probe: `wip/perf-48-l2/probe.mjs` (`[checkout] [throttle]`),
  results in `wip/perf-48-l2/probe.txt`, both in the perf worktree (git-invisible).

## Files
`src/map2d.js` (`_stepBackground`, `_bgWork`, the tile builders, `_warmCover`, `_waterPlate`, `_waterQuery`) ·
`test/map-bg-slice.mjs` · probe `wip/perf-46/` (perf worktree, git-invisible)

## Log
- 2026-11-12: opened from the owner's inbox.
- 2026-11-13 (Perf lane): PERF-48 lever 2 measured void, as above. No `src/` change. The bench's map phase already
  pans and zooms for its whole 30 s without a hold, so it measures the drag more than the settle (its worst map frames,
  27–154 ms before lever 1, are not yet traced to a cause); the probe holds on purpose.
- 2026-11-13 (Perf lane): the rebuild sliced (feature/perf c88f0301, 75c919db, 2b85577d, fdf891b2). Before/after above;
  gate map-bg-slice added. Landing branch land/perf-46.
- 2026-11-14: closed by the owner (Decisions). The one 40–50 ms frame on seed 17535907 is left untraced.

## Resolution (2026-11-14)
Fixed on the owner's Windows machine by the cached map sheet and its sliced rebuild (on main). Closed.
