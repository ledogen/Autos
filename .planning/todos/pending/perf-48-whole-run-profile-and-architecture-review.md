---
id: PERF-48
type: perf
status: open
severity: major
opened: 2026-11-13
source: owner, 2026-11-13 — "i'd like to launch a performance investigation soon. we just recently looked at tire physics lookup costs and biggest profiled gpu draws. with the new autopilot we built we should be able to can a run cycle with a quiet machine and really profile where the cycles are going. I have basic intuition of how snappy things should be but would like to lean heavily on the agent working the request to investigate our architecture and the way games solve similar problems at the professional level in order to make this a truly lightweight app"
relates: PERF-40, PERF-42, PERF-44, PERF-45, PERF-46, PERF-47, test/playtest-bench.mjs, test/lib/autopilot.mjs, .planning/perf/FINDINGS.md
---
lane: Perf

# PERF-48: Whole-run profile and architecture review

## Next steps
Owner: read the ranked lever list at the top of `.planning/perf/COST-MAP-2026-11.md` and pick. Levers 1–4 need no
owner call (exact, invisible); 5–7 are one question each (Open questions). Perf lane then builds the picks, one ticket each.

## Summary
The owner wants the game to be a truly lightweight app. Earlier perf work chased single suspects (tire lookups, the
biggest GPU draws). This ticket profiles a whole canned run end to end, says where every cycle goes, and compares
our architecture with how professional games solve the same problems. Its output is a ranked list of levers with
measured cost and expected gain, not fixes.

## Description
### The canned run
The PERF-40 bench already plays the real game unattended on three pinned random seeds (drive ~5 min with an
off-road leg, map 30 s, parked 30 s) through `test/lib/autopilot.mjs`. Use it as the run cycle. Attach CPU profiles
(main thread and each worker) and the bench's GPU active-cycle read to the same run, so every phase has a full
breakdown by subsystem and by function.

### The cost map
Per phase, per thread: main-thread ms per second by bucket, then by function inside the big buckets; worker CPU;
GPU active cycles by pass (terrain, props, shadows, post) as far as the tools resolve it; memory and allocation
rate (garbage-collection pauses). Report per-second median / p99 / worst, never averages alone. Random seeds, not
only the test seed.

### The architecture review
For each large cost, name how shipped games at a professional level handle the same problem (e.g. fixed-step
physics budgets and sub-stepping, broad-phase and query caching, streaming and level-of-detail schedulers, draw-call
batching and instancing, shadow cascades and update rates, frame pacing, allocation-free hot loops), say what we do
instead, and estimate what closing the gap is worth here. Cite sources. Flag where our design is already right.

### Constraints
The vehicle model stays ours (Pacejka tires, strut suspension) and physics stays on the main thread at a fixed
step (CLAUDE.md). A lever that breaks either is listed as out of bounds, not proposed.

### Host note
2026-11-13: this Mac's audio service was stuck and inflated bench main-thread ms 2–4× (PERF-47). No profile is valid
until `afplay -v 0 /System/Library/Sounds/Tink.aiff` returns in under a second, or the run uses Chrome's
`--disable-audio-output` fake device.

## Tracker
- [x] A cost map of one canned run per phase and thread, committed under `.planning/perf/` (COST-MAP-2026-11.md)
- [x] The architecture review: each large cost against professional practice, with sources
- [x] A ranked lever list (cost today, expected gain, risk, effort), each lever a ticket or a line in an existing one
- [ ] The owner picks levers (a deep dive if the list needs a table)

## Open questions
- What "snappy" means in numbers: the owner's targets for frame time, load time and battery draw.
- Lever 5: is the "faster MacBook" a 120 Hz (ProMotion) screen? With no frame-rate cap the game renders 120 fps there,
  about twice the render CPU and GPU of this 60 Hz Air. Recommend a 60 / 30 / display setting, default 60.
- Lever 6: prototype the baked terrain material (one chunk ring, before/after sheet)? Recommend yes: it is the only
  large GPU lever left, and the GPU is ~2.5× the CPU in watts.
- Lever 7: a 30 fps render while parked with the camera still? A look call; recommend trying it on the owner's screen.

## Links
The deliverable: `.planning/perf/COST-MAP-2026-11.md` (lever list first). Raw runs: `perf-runs/p48-profile`, `p48-control`
in the perf worktree (gitignored); measuring scripts in its `wip/perf-48/`.
PERF-42 (tread-solve spikes), PERF-44 (triangles), PERF-45 (parked main thread) and PERF-46 (map pan jitter on
Windows) are open single-suspect tickets; this ticket ranks them against everything else.

## Log
- 2026-11-13: filed from the owner's inbox note. Perf lane agent started on step 1.
- 2026-11-13: cost map + review + lever list done (`.planning/perf/COST-MAP-2026-11.md`). Bench gained `--profile`
  (per-phase traces, GPU timer queries per pass, heap, scene census) and `--fake-audio`; `test/bench-trace-report.mjs`
  reads the traces. Three seeds profiled and three unprofiled, machine held, fake audio sink (coreaudiod still stuck).
  Findings: the HUD forces a style recalc every frame from the cluster's `ctx.font` (~45 ms/s, 21 % of the main
  thread); the map's region dimming ~60 ms/s while open; the GPU (~2 W) outweighs the CPU (0.8 W) 2.5×; main-thread
  ms/s rises 1.6–3.3× when the CPU is lightly loaded (macOS picks a slower core), so it is not a work measure alone.
