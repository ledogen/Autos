---
id: PERF-42
type: perf
status: open
opened: 2026-11-12
severity: major
source: PERF-40 bench, 2026-11-12 — the per-second read of the three-way run (Nov 01 / main 07581275 / this branch).
  Owner, same day, on the averages table: "so according to this data there was never a performance bug and we didnt
  fix it?" The averages hid it; the per-second data shows the spikes are still there.
relates: [BUG-70 (the tread solve that brought them), PERF-37 (session 2 profiled them: `treadContact` → `rho2` 23 % of
  main-thread busy in the spikes), PERF-39 (cut the per-wheel query cost; the typical second recovered, the spikes did
  not), PERF-40 (the bench that measures them)]
branch: perf/perf-37-tire-map — worktree /Users/ledogen/CodeShit/CarGame-perf37
---

# PERF-42 — the tread solve's physics spikes are still there

## What the bench shows

Physics main-thread ms in each second of driving. Only seconds where the truck was moving above 3 m/s, together
with both neighbouring seconds, so re-seats are excluded. Pooled over every valid and invalid session of the two
2026-11-12 runs (`perf-runs/2026-11-12-*` in this worktree, gitignored):

| | Nov 01 (9a7e3d71, before BUG-70) | main 07581275 | branch (PERF-39) |
|---|---|---|---|
| moving seconds | 713 | 1712 | 1855 |
| median | 52 | 61 | **52** |
| p95 | 90 | 126 | 131 |
| p99 | 129 | 168 | 184 |
| worst | 153 | 325 | 303 |
| seconds > 100 ms/s | **4 %** | 10 % | **10 %** |

- PERF-39 brought the typical second back to Nov 01's 52 ms/s.
- The spikes are unchanged: 1 driving second in 10 costs over 100 ms of physics, against 1 in 25 before BUG-70.
- On average they add about 10 ms/s, so they cost smoothness more than heat. Session 2 saw p95 frames of 25–100 ms
  while they ran.

## The work

1. **Find where they happen.** The bench samples carry no position yet. Add `x, z` and the nearest road feature
   (junction pad, carve, kerb or deck edge, bore, causeway) to each 1 Hz sample, or profile the spike seconds
   (PERF-37's `playlog3.mjs` approach). The suspects, from session 2's profile: `treadContact` → `rho2` sampling ground
   height about 57 times per wheel per step, through the road carve stack. Probably at junctions and carves.
2. **Remove them at the root.** Fewer samples where the ground is simple, or a cheaper sample through the stack. Not a
   cap or a skip; physics must stay honest (MESH == PHYSICS).
3. **Prove it** with PERF-40 (after its spike metrics land, see the handoff): seconds over 100 ms/s down to Nov 01's
   ~4 %, with `npm test`'s physics gates and the kerb-graze bench unchanged (pops 3/4/8, no flips).

## Acceptance

- [ ] Where the spike seconds happen, measured.
- [ ] The spike share is back near Nov 01's (≤ 5 % of moving seconds over 100 ms/s) on the PERF-40 bench, three seeds.
- [ ] Physics gates green; the kerb-graze bench unchanged.
