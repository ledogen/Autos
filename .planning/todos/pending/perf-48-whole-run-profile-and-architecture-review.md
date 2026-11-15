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
Owner answered the lever 6 card 2026-11-14 (DEC-207): not the all-baked version. Perf lane builds a hybrid: the bake for ground 70 m and farther from the truck, the live shader nearby, and reports how much of the 10-21 % GPU saving survives (the earlier "hybrid" test kept steep ground live, saving ~5 %: this one splits by distance).

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
- [ ] Lever 6 hybrid: baked look at 70 m+ from the truck, live shader nearby; before/after screenshots; the GPU saving that remains is MEASURED and reported to the owner (DEC-207)

## Decisions
- 2026-11-14, owner (lever 1, the energy/hunger strips stepping one device pixel at a time): "keep the pixel steps".
- 2026-11-14, owner (lever 5): "yes, default 60" to a 60 / 30 / display-rate setting (DEC-185).
- 2026-11-14, owner (lever 6): "build the prototype".
- 2026-11-14, owner (lever 7, 30 fps while parked): "no, keep 60" (DEC-186).
- 2026-11-14, owner (lever 6 card perf48-bake-look): "i dont like the loss of detail nearby. can we build it so it uses the bake for things 70m+ from the truck and uses live for the things nearby? how much of our savings would we lose?" (DEC-207).

## Open questions
- What "snappy" means in numbers: the owner's targets for frame time, load time and battery draw.
- ~~Lever 5~~ answered: a 60 / 30 / display setting, default 60 (DEC-185).
- ~~Lever 6~~ answered: build the prototype.
- ~~Lever 7~~ answered: no, keep 60 (DEC-186).

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
- 2026-11-13: lever 1 built (Perf lane). Energy/hunger strips write only when their device pixel moves; the hidden
  debug panel's live read-outs stop while hidden. Recalcs 60 → 13 /s driving, 58 → 3 parked, 57 → 6 map; postStream
  −28 / −26 / −22 ms/s; CPU −0.13 / −0.07 / −0.16 W (A-B, 3 seeds, unprofiled, fake audio). The cluster's `ctx.font` left
  alone (forces nothing once nothing is dirty). Stills: 0 px on the device grid, otherwise only the anti-aliased
  column of each hour tick / band edge and the band labels' glyph edges (`wip/perf-48-l1/diff.txt` in the perf
  worktree). No gate: the guard lives in main.js and lil-gui, both DOM-bound; a pure-node gate would need a fake DOM.
- 2026-11-13 (Perf lane): lever 2 void. `_drawRegion`'s ~59 ms/s was the forced style recalc its `ctx.font` (the frame's first) pays, not
  its dim fill: the fill is ≤ 0.09 ms/frame (≤ 5.5 ms/s); knocking `_drawRegion` out moves the recalc to the next font setter.
  Not built. Numbers, and the pan/settle probe it led to, in PERF-46.
- 2026-11-13 (Perf lane): lever 1b, the tail. The POI / camp / stranded prompts write `innerHTML` only when the markup
  changes (`_hudHtml`), and the hidden debug HUD is not written (`_writeDebugHud`; refreshed the moment it shows). Recalcs
  13 → 5 /s driving (p50 10 → 2), 5.1 → 0 map, 3.1 → 0 parked; recalc ms/s 8.4 → 2.0 / 8.3 → 0 / 2.6 → 0; mainMi within
  noise (A-B `perf-runs/p48-l1b`, 6/6 valid, fake audio). The 60/s driving seconds were CSS animations, every one (damage
  pulse, reseat toast fade, HUD chip fades): visible, kept, cheap. Stills 0 px (`wip/perf-48-l1b/diff.txt`). No gate (DOM).
  Numbers and sources in COST-MAP-2026-11.md § 1.
- 2026-11-14: owner answers recorded (Decisions); lever 1b landed on main fb2802a6.
- 2026-11-14 (Perf lane): lever 5 built (7f304aa2): `frameCap` in settings.js, a "frame rate" row on the settings page, and
  `loop()` returns early on a frame not yet due. Pacing checked in a node simulation (±0.5 ms vsync jitter): 60 / 30 fps
  exact on 60, 120 and 240 Hz, gaps 15.7–17.6 / 32.4–34.3 ms; on 144 Hz it averages the cap with uneven gaps (13–22 ms),
  inherent to 144/60. Not yet run in the browser (no smoke on a branch); world-presets gate green.
- 2026-11-14: scribe recorded the owner's answer to the terrain-bake card.
