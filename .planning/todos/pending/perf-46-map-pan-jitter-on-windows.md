---
id: PERF-46
type: perf
status: open
severity: minor
opened: 2026-11-12
source: owner, 2026-11-11 inbox — "I didn't notice this on my faster MacBook processor but on Windows, panning the map seems like it has periods where it is laggy and jittery and periods where it's perfectly smooth"
relates: [PERF-38, BUG-68]
---
lane: engine & world (the perf session)

# Map panning is jittery in bursts on the Windows machine

## What

Smooth on the MacBook, alternately smooth and jittery on Windows. PERF-38 (map render skip + repaint) just
landed on main; this report may predate it. First step: have the owner retry on the current build. Then profile
map pan under 4–6× CPU throttle (Chrome's slow-CPU emulation) and look for the periodic cost: network adoption
while the map is open (BUG-68's path), repaint of the whole map canvas, or garbage-collection pauses (the
browser reclaiming memory).

## Acceptance

- [ ] Owner retest on a build with PERF-38.
- [ ] If it remains: the periodic cost named, with pan frame times (median / p99 / worst) under throttle, before and after.
