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
### The owner's own session (2026-11-22 22:35–22:42, built game, fresh tab, free roam, full screen)
Machine: 15-inch M4 Air (Mac16,13), panel 2880 × 1864, macOS "looks like" 1710 × 1107 points, so Chrome reports
devicePixelRatio 2 and a full-screen canvas on High is 3420 × 2214 device px (7.6 Mpx; macOS then scales the frame down
to the panel). Normal caps at 1200 lines: 1854 × 1200 (2.2 Mpx). High full screen shades 3.4× Normal's pixels.
Outside samples (test/lib/ioreport.py, 1 Hz):
- Normal, 4 min: GPU 81 % busy at ~880 MHz ≈ 715 Mcycles/s active, 1.2 W.
- High from 22:38:58: GPU 99 % busy at 1468 MHz (top clock 1470) ≈ 1455 Mcycles/s, 11–13 W: saturated at once, ~10× the GPU power.
- From 22:40:28 the clock sagged to 1430–1436 MHz and GPU power fell 13.2 → 11.5 W; the owner felt the lag from ~22:40.
- Hitch log (?hitch=24) at 22:41: frames of 40–52 ms carrying only 3–4 ms of main-thread CPU (frame.render ~2 ms):
  GPU-bound, not main-thread-bound. pmset recorded no thermal warning.
Raw: `wip/run-logs/perf-1123/` (capture 1795416091914) in the main checkout; the io samples were in the orchestrator's scratchpad (owner-io.jsonl).

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
