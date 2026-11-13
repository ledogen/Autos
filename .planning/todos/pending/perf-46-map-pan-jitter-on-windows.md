---
id: PERF-46
type: perf
status: open
severity: minor
opened: 2026-11-12
source: owner, 2026-11-11 inbox — "I didn't notice this on my faster MacBook processor but on Windows, panning the map seems like it has periods where it is laggy and jittery and periods where it's perfectly smooth"
relates: PERF-38, PERF-48, BUG-68, src/map2d.js
---
lane: engine & world (the perf session)

# PERF-46: Map panning is jittery in bursts on the Windows machine

## Next steps
Owner, on the Windows machine (nothing here can check it): (1) open `chrome://gpu` and read the "Canvas" line,
"Hardware accelerated" or "Software only"; (2) pan, let go, pan again, and say whether the jitter comes in the second
or so after letting go, or during the drag itself. Perf lane meanwhile (no answer needed to start): slice the sheet
rebuild's compose pass and stop a tile build at its budget, then re-measure under 4× slow-CPU emulation.

## Summary
Smooth on the MacBook, alternately smooth and jittery on Windows. PERF-48 lever 2 (the map's region dimming) turned out
not to be the cost, so it is void. On this Mac a scripted pan and zoom drops no frames, even under 4× slow-CPU
emulation. What does drop frames under emulation is the sheet rebuild in the second after a pan or zoom settles: its
compose pass and single tile builds are not cut to the frame budget.

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

### The Windows hypothesis (unverified here)
The drag itself only blits the cached sheet, and stays smooth. The rebuild that follows each settled pan or zoom is the
part that overruns a frame, and only for the second or so it runs. That matches "periods laggy, periods smooth". The
fix: slice the compose pass, and stop a tile build at the budget. Other suspects not yet ruled out there: network
adoption while the map is open (BUG-68's path; it must never be frozen) and garbage-collection pauses. If Chrome on
that machine draws canvas in software, every full-canvas pass (the sheet blit, the dimming) costs CPU milliseconds
instead, and the dimming bake becomes worth doing after all.

## Tracker
- [ ] Owner retest on a build with PERF-38 (landed 3d008134) and PERF-48 lever 1.
- [ ] Owner: the `chrome://gpu` Canvas line, and whether the jitter follows letting go of a pan.
- [ ] The rebuild sliced to the frame budget: settle and zoom-hold frames under 20 ms at 4× emulation, before and after.

## Links
- `.planning/perf/COST-MAP-2026-11.md` lever 2 (void). Probe: `wip/perf-48-l2/probe.mjs` (`[checkout] [throttle]`),
  results in `wip/perf-48-l2/probe.txt`, both in the perf worktree (git-invisible).

## Files
`src/map2d.js` (`render`, `_drawRegion`, `_stepBackground`, `_drawSheet`)

## Log
- 2026-11-12: opened from the owner's inbox.
- 2026-11-13 (Perf lane): PERF-48 lever 2 measured void, as above. No `src/` change. The bench's map phase already
  pans and zooms for its whole 30 s without a hold, so it measures the drag more than the settle (its worst map frames,
  27–154 ms before lever 1, are not yet traced to a cause); the probe holds on purpose.
