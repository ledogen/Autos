---
id: PERF-54
type: perf
status: open
severity: minor
opened: 2026-11-21
source: orchestrator, 2026-11-21 — the recorded bench on main 9b04c5f5 (wip/bench-1121/run.log): map-phase GPU 32.5 → 716 Mcyc/s since the 11-13 record (6f82f733)
relates: PERF-40, PERF-38, FEAT-211, DEC-175, DEC-225, DEC-319, src/main.js
---
lane: unplaced

# PERF-54: with the map open the 3D world renders at full rate behind it

## Next steps
Owner: keep the live world behind the map at full rate (as ruled), or take the cheaper option below. Nothing is built.

## Summary
On 11-13 the frame loop skipped the 3D render while the map was open (PERF-38, 5becbc7b): the map was an opaque
full-screen canvas. FEAT-211 (a8a309b8, 2026-11-14) made the map a 90 % window and put the world back behind it at full
rate, on the owner's ruling "make the background live" (DEC-175, carried by DEC-225 and the standing DEC-319). So the
cost is meant, not an accident. It is reported here, not undone.

## Description
### Measurement (2026-11-21, quiet machine, bench seed 17535907, one session each, `--fake-audio`)
Map phase (30 s, truck stopped, map open, zoom and pan):

| build | GPU active cycles | GPU W | main thread |
|---|---|---|---|
| main 7f1b8d08 (live world) | 760 Mcyc/s | 2.28 | 936 Minstr/s |
| main + PERF-38's skip put back (`if (!map2d.isOpen()) renderer.render(...)`) | 39 Mcyc/s | 0.06 | 537 Minstr/s |
| the 11-13 record (6f82f733) | 32.5 Mcyc/s | 0.05 | 737 Minstr/s |

The one-line skip takes the whole GPU delta back to the 11-13 figure, so the live world is the entire cost: about
720 Mcyc/s of GPU and 400 Minstr/s of main thread, the same as a parked truck with the map shut (park phase 772 Mcyc/s).
Logs: `wip/perf-54/ab1.log` (B = the skip), `wip/perf-54/a2.log` (A = main).

### The cheapest option (not built)
Render the world behind the open map at a lower rate, e.g. every 6th frame (10 Hz). Only 19 % of the screen shows it
and nothing moves there but the sky and an idling truck, so 10 Hz should read as live. GPU cost should fall roughly in
proportion, to about 120–150 Mcyc/s. One counter in the frame loop's render branch (src/main.js, the FEAT-41 block).

## Tracker
- [x] Find the commit: a8a309b8 (FEAT-211), reversing PERF-38's 5becbc7b skip
- [x] Measure it: the skip put back gives 39 Mcyc/s against 760
- [x] Check the rulings: DEC-175 → DEC-225 → DEC-319 (standing) keep "the 90 % window over a live world"
- [ ] Owner: full rate stays, or a lower render rate behind the map

## Open questions
- Keep the world behind the map at full rate, or render it at ~10 Hz while the map is open (about 1/6 of the GPU cost)?

## Files
`src/main.js`

## Log
- 2026-11-21: found and measured (lane a, branch land/perf-54-map-gpu). No src/ change.
