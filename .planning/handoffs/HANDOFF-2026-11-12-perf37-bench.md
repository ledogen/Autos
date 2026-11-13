# Handoff 2026-11-12 — PERF-37 branch: the PERF-40 bench, and what it found

**Worktree** `/Users/ledogen/CodeShit/CarGame-perf37` · **branch** `perf/perf-37-tire-map` (off main 07581275, not
landed) · **dev server** :8039 (a background Vite from the earlier session; the bench starts its own Vites, so it
does not need it). Window title should read `CarGame-perf37 :8039`.

Also on disk: `/Users/ledogen/CodeShit/CarGame-nov01`, a detached worktree at main 9a7e3d71 (the Nov 01 build) with a
cloned `node_modules`, kept for comparisons. Main is clean at 07581275.

## Order of work (owner, 2026-11-12: "b first then a so we dont have to rerun twice")

1. **(b) PERF-42 — the remaining tread-solve physics spikes.** Ticket `.planning/todos/pending/perf-42-…`: the data,
   the plan, the acceptance. Find WHERE the spike seconds happen, fix at the root, keep the physics gates green.
2. **(a) PERF-40 bench fixes**, so the bench can see both bugs:
   - **Spike metrics in every report:** per phase, the p99 second and the share of seconds over 100 ms/s for
     physics, and the worst postStream second for the map. Use only moving seconds for the drive: v > 3 m/s, plus
     both neighbours, so re-seats are excluded. Copy the snippet logic from this handoff's § Numbers.
   - **A harder map script.** Zoom right out to the whole map. Pan fast into ground the map has not drawn yet. Zoom
     back in. The current gentle pan never triggered main's repaint stall (920–960 ms/s in the owner's session 2),
     although it did catch Nov 01's (623 ms/s, 38 fps).
   - Position (`x, z`) in each sample. PERF-42 needs it first, so do that part during (b).
3. **Then ONE rerun:** main 07581275 vs the branch (with PERF-42 in it), three seeds, `--reps=2`. It must show:
   - the PERF-38 map repaint fix (map p99 down);
   - the PERF-38 render skip (GPU cycles under the map −90 %, already seen);
   - PERF-42's spike share down to about Nov 01's 4 %.
   Add Nov 01 as `--c` if the owner wants the third column again.

## State of the bench (PERF-40)

- `test/playtest-bench.mjs`: plays story mode unattended in headless Chrome on the real M4 GPU at the owner's canvas.
  Phases: drive 300 s (one off-road leg) → re-seat at the drive's start pose → map open 30 s → parked 30 s.
- `test/lib/ioreport.py`: sudo-less CPU / GPU / DRAM watts plus GPU active cycles. `--check` self-tests it.
- `test/lib/autopilot.mjs`: a PURE autopilot (state in, controls out). The owner wants it to grow into in-game AI
  cars, so keep it engine- and DOM-free. `node test/lib/autopilot.mjs` self-checks (PASS).
- The ticket `.planning/todos/pending/perf-40-…` records the design, the autopilot module, and **six story-mode traps
  for an unattended driver**, each now handled:
  1. a seat is a dead, parked truck;
  2. a seat keeps the damage, so a recovery is a tow restoring the run's STARTING damage;
  3. dialogues swallow every key;
  4. the region is walled;
  5. physics at rest depends on the spot;
  6. a brake held at rest is reverse.
- CLAUDE.md § Diagnostic tools and LAYOUT.md already name the bench.
- **Pinned seeds** 1768572700, 17535907, 759313244. 711969014 was swapped out: it failed on every build before traps
  2–3 were fixed, and is worth retrying as an autopilot test.

## Numbers (results in `perf-runs/2026-11-12-*`, gitignored, in this worktree)

- `perf-runs/2026-11-12-ab-branch-vs-main/`: an A/B with reps 2. It ran before the fixed park spot and the tow fix,
  so its map and park phases are not comparable; its drive numbers are fine.
- `perf-runs/2026-11-12-3way-branch-main-nov01/`: the clean three-way run. 7 of 9 sessions valid; seed 17535907
  fell short of 3 km on main (2.6) and Nov 01 (2.86).
- `perf-runs/2026-11-12-owner-session3-powermetrics.txt`: the owner's session-3 `powermetrics`. "GPU Power" appears
  twice per sample in this file; halve when averaging.

**Averages, 2 seeds valid on all builds** (drive / map open / parked):
- Main thread: Nov 01 192 / 190 / 174 ms/s; main 203 / 185 / 166; branch 201 / **146** / 164.
- GPU active cycles: Nov 01 774 / 826 / 770 Mcyc/s; main 806 / 807 / 747; branch 818 / **81** / 820.
- Physics while driving: Nov 01 56, main 66, branch 64 ms/s.
- CPU power while driving: 0.77 / 0.83 / 0.80 W. Triangles: 716 k / 897 k / 883 k.
- The owner's session 3 (branch, played): main thread 192 ms/s, GPU ~900 Mcyc/s, CPU 1.15 W, consistent with the
  bench. The CPU is higher because a profiler was attached and the window was visible.

**Per-second spikes** are what matter for these bugs. Moving seconds only:
- Physics median: Nov 01 52, main 61, branch 52.
- Seconds over 100 ms/s: Nov 01 4 %, main 10 %, branch 10 %. Worst second: 153 / 325 / 303.
- Map postStream, worst second after the first 3 s: Nov 01 623 (38 fps), main 98, branch 80.
- The computation: read every `<build>-<seed>-<rep>.json` sample; drive seconds where this sample and both neighbours
  have v > 3; `cpu['frame.physics']`; map samples `.slice(3)`.

**Lesson (saved to memory):** compare per-second spikes, not phase averages. Both of these bugs were spikes, and the
first summary's averages hid them. GPU watts from ioreport swing from 0.9 to 3.6 W for the same state, so never
compare them; compare GPU active cycles.

## Open questions for the owner (ask after the clear)

1. **Seed 17535907** sits on the 3 km validity bar (2.6–3.5 km over six sessions): its roads are slow. Keep it and
   lower the bar to 2.5 km (8.3 m/s average), or swap in a new random seed?
2. **A kerb-hugging leg in the drive?** The autopilot stays mid-lane, so the bench under-exercises the kerb and edge
   contact where BUG-70 / PERF-39 lived. Add a leg that drives on the road edge for about 60 s?
3. **Record the baseline** (`--record`, appending to `.planning/perf/history.jsonl`) once (a) lands, or wait until the
   branch is on main?
4. **Land the branch on main?** It holds PERF-38 (map), PERF-39 (tire) and PERF-40 (bench). It has been offered and
   not yet asked for. Gates were green at the last full run; a `test:all` is owed before landing.
5. **The Nov 01 worktree**: keep it for the rerun's third column, or remove it?
6. Optional: GPU watts from ioreport are noisy. A 2-minute `sudo powermetrics` beside one bench session would show
   whether the GPU energy channel is read right. Only worth it if the owner wants watts in reports.
