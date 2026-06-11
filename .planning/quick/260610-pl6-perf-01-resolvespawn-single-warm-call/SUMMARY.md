---
quick_id: 260610-pl6
slug: perf-01-resolvespawn-single-warm-call
subsystem: road
tags: [road, performance, spawn, ensureTile, streamNetwork]

requires:
  - phase: 08-road-routing
    provides: resolveSpawn road-graph probe + CR-01 queryNearest correctness fix
provides:
  - Single-call spawn warm in resolveSpawn; CR-01 correctness preserved; PERF-01 resolved
affects: [phase 09 ribbon mesh, spawn/reload latency]

tech-stack:
  added: []
  patterns:
    - "One ensureTile(baseTX, baseTZ) primes the full 640 m-radius _streamNetwork before queryNearest(radius=200) — no per-tile loop needed"

key-files:
  created: []
  modified:
    - src/main.js

key-decisions:
  - "Replace 9x9 ensureTile loop with single ensureTile(baseTX, baseTZ); 640 m stream radius covers 200 m query radius completely"
  - "CR-01 correctness preserved via queryNearest's own radius-sized this._tiles read, not the warm loop"

requirements-completed: []

duration: 5min
completed: 2026-06-10
---

# Quick Task 260610-pl6: PERF-01 resolveSpawn single warm call

**Replaced 81-call 9x9 ensureTile spawn-warm loop with a single ensureTile(baseTX, baseTZ), cutting ~40 redundant _streamNetwork rebuilds per spawn/reload to 1**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-06-10
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Removed `const warmBlk = Math.ceil(200 / CHUNK_SIZE)` and the nested `for dtx / for dtz` loop in `resolveSpawn`
- Replaced with a single `roadSystem.ensureTile(baseTX, baseTZ)` with an explanatory comment documenting PERF-01 and CR-01 interaction
- CR-01 correctness preserved: `queryNearest(baseX, baseZ, 200)` still uses the radius-sized `this._tiles` scan internally
- `node --check src/main.js` passes; no `for (let dtx` in resolveSpawn remains

## Task Commits

1. **Replace 9x9 warm loop with single ensureTile call** — `f377235` (perf)

## Files Created/Modified

- `src/main.js` — resolveSpawn: warm loop removed, single ensureTile(baseTX, baseTZ) with PERF-01/CR-01 explanatory comment

## Decisions Made

- One ensureTile is sufficient: `_streamNetwork` radius is 640 m; spawn query radius is 200 m. All 81 tile centers in the old loop (max +/-256 m from spawn) fall inside one stream.
- CR-01 correctness mechanism (queryNearest reads a radius-sized block of `this._tiles`) is independent of the warm loop.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Self-Check: PASSED

- `f377235` confirmed in git log
- `src/main.js` syntax-checks clean (`node --check` passes)
- `grep "for (let dtx" src/main.js` returns empty (loop gone)
- `src/road.js` not modified
