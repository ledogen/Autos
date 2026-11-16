---
id: PERF-52
type: perf
status: closed
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "The very first time I open the map it usually hangs for about half a second to a second Not the end of the world that the hang is there but I'd much rather it be behind the loading screen So can we force load the map during world load so that we don't have to look at the Freeze the first time the player hits the button"
relates: src/map2d.js, src/main.js
---
lane: Map batch

# PERF-52: The first map open hangs 0.5 to 1 s; build it behind the loading screen

## Next steps
Owner: look at a first open on the real machine. Orchestrator: BUG-184 (another agent) fixes stale tiles across worlds; see Description.

## Summary
The first time the map opens it hangs for about half a second to a second. Do that work during world load so the freeze is behind the loading screen.

## Tracker
- [x] Measured: first map open, worst frame, before (2423 / 2167 ms long task, rAF gaps 2483 / 2250 ms)
- [x] The map's first-open work runs during world load (`Map2D.preload()`, called from `_exitStageLoad` and the `?nomenu` boot)
- [x] After: first open 72 / 84 ms long task, rAF gaps 83 / 383 ms; load cost stated (+2.3 to 2.7 s of main thread on this loaded box)

## Description
### What the first open does (CPU profile, 1 ms sampling, seed 6, ?nomenu, free roam)
`show()` is cheap. The hang is the first background build, run unbounded because no bitmap is valid yet (`_stepBackground(Infinity)`): `_bgWork` 2098 ms of 2112 ms, of which `_groundTile` 2012 (`_coverRaster` 1792: `_coverChunk` 949 = the per-cell biome read, noise2D 950 ms self; `_warmWater` 486; `heightAt` 516; `slopeAt` 380) and `_contourTile` 47. Fonts, layout and the legend are inside the remaining 50 ms.

### What was done
`Map2D.preload()`: the same world path as `show()` (`_paramSig` to `_buildRoad`, which drops the memos with the old world), on the window laid out hidden (`visibility`), then one unbounded `_startBackground` / `_stepBackground`. No network stream is started: `show()` does that as ever. Called where the load ends: `_exitStageLoad` (after `stage-on` is off, since the stage hides `#map-window`) and, for `?nomenu`, just before `__rsReady`. Every tile and cover chunk is memoised, so the real first open rebuilds from memos.

### Before / after (headless Chrome, load average ~7 on 10 cores: timings are noisy; read the shape)
| | first open long task | rAF gap | load: long tasks at boot end |
|---|---|---|---|
| before (2 runs) | 2423 ms, 2167 ms | 2483 ms, 2250 ms | none from the map |
| after (3 runs) | 69+84 ms, 72 ms | 383 ms, 83 ms | +2697 ms, +2343 ms (the same work, moved) |
Counted work: the background build's inclusive time under `_stepBackground` is 2112 ms before and 14 ms after on the open (profile `wip/map-batch/*-prof.log`). The remaining 83 to 383 ms rAF gap is the first display of the map window (compositing two large canvases), not map code.

### Cache correctness (BUG-184 overlap)
Another agent (land/bug-184) fixes the map showing the previous world's tiles. This change adds no cache: the preload goes through `_paramSig` / `_buildRoad`, so it is exactly as correct as `show()` is, and exactly as stale where `show()` is stale. It runs once per world load, so a new world gets a fresh warm. If BUG-184 changes the memo-clearing rule, the preload inherits it. Both touch `src/map2d.js` near `show()`: expect a merge to resolve there.

## Log
- 2026-11-16: filed from the owner's inbox note.
- 2026-11-16 (lane C): built and measured (Description). Not measured: a story-mode load (the preload also runs from `_exitStageLoad` there, and the smoke's story step went live and passed), a slow disk, a real display (headless compositing).
- 2026-11-16: landed on main (local). Closed.
