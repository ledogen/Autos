---
id: PERF-55
type: perf
status: open
severity: minor
opened: 2026-11-22
source: owner, 2026-11-22 — free roam on High felt like it slowed down as if thermally throttled; suspects the recent shadow changes compound on High
relates: PERF-40, PERF-41, BUG-217, BUG-229, FEAT-243, FEAT-223, src/main.js, test/playtest-bench.mjs
---
lane: perf

# PERF-55: What each quality preset costs on the M4 Air, and why High is slow

## Next steps
Lane agent: measure (Low / Normal / High, the High levers one at a time, High before/after the shadow work, one long
High session for heat). Then the owner picks from the options; preset numbers are the owner's call.

## Summary
The owner's High session held no frame times, so this measures it. The bench gains `--quality` and `--window`
(the preset and the canvas), a thermal-pressure read, and per-second fps stats. Results below.

## Description
(measurements land here)

## Tracker
- [ ] Bench `--quality=<tier>` (applied once story is live, terrain settled), recorded in output and history rows
- [ ] Low / Normal / High per phase at main's head, same seeds, heat-balanced order
- [ ] High − Normal split by lever (resolution, ring, shadow map + atlas, prop rings)
- [ ] High at main vs High before BUG-217 (A-B-A-B)
- [ ] One long High session: fps and clocks first 5 min vs last 5 min

## Files
`test/playtest-bench.mjs`

## Log
- 2026-11-22: ticket opened; bench options on land/perf-55-preset-cost.
