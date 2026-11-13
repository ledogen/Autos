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

## Where they happen (measured 2026-11-12)

**On the shoulder, not the junctions.** A wheel whose hub is off the deck had every tread sample resolve the road afresh.

- Headless, one wheel's ground query on seed 1768572700's roads (`wip/perf-42/lat.mjs`, gitignored), by the hub's
  lateral off the centreline: **60 µs on the deck (1.2 road resolves a query), 117 µs at 5.5–9 m (56 resolves)**,
  70–94 µs at 12–30 m (36–43). About 960 wheel queries a second (4 wheels × 4 substeps × 60 Hz) make that ~58 ms/s
  of physics on the deck and ~112 ms/s on the shoulder, which is the bench's median-vs-spike split.
- Live, one probed bench session (`--probe` counts road resolves per second; `perf-runs/2026-11-12-perf42-probe`):
  moving seconds with the truck centre on the deck had physics median 46 ms/s at ~935 resolves/s; on the shoulder or
  bank (4–20 m) median 85 ms/s at ~14,700 resolves/s, 7 of 15 over 100. 10 of the session's 16 spike seconds carry
  the high resolve counts. The other 6 (2.4 % of moving seconds) do not; their cause is something else (below).
- **Why.** PERF-39 resolves the road once at the hub and reuses it per sample where `road.js _hintHolds` says the reuse
  is exact. Off the deck it refused everywhere (a rival road's bank could fade in), so the whole tread re-resolved.

**A second finding on the way: PERF-39's reuse was not exact.** `test/hint-reuse.mjs` compares the reused height with
a fresh resolve at random points within 1 m of a hub. Before this fix: worst **48 mm**, 261 of ~100 k points over 1 mm
on two seeds. 249 of them sat in BUG-154 departure bands: `_bandRefine` returns no primitive bounds, the resolve
defaulted them to ±∞, and `_hintHolds` reused the band's turning frame as a straight line. The other 12 are 1–2 mm
on the 0.15 m deck-edge lip of 12 m arcs (the reuse's exact arc projection vs the fresh resolve's numeric search).

## The fix (branch, 2026-11-12)

- `_bandRefine` returns `lo = hi = 0`: a band frame is no line or arc, so a reused hint holds only at its resolve point.
- `_resolveRoadSurface` marks a resolve **solo** when no other carve field reaches the disc `HINT_REACH_M` (1 m) round
  it: no rival, no other run or run end within footHW / cos 29° + 1 m (distance moves at most as far as the point),
  the winner's toe beyond the disc, no apex-sliver end. `_hintHolds` then reuses a solo resolve off the deck for any
  point within 1 m, after `_soloPassFree` checks at that point that the winner's own run does not pass again. That
  check cannot be done at the hub: near a bend's centre of curvature the run is nearly equidistant along the bend, and
  a point 1 m off sees two passes where the hub saw one (seed 1768572700 (144, 745): 12 m inside the start of a 12 m
  bend, 0.14 m off before the check moved to the point). It is one walk over the run's segments, much cheaper than
  a resolve.
- Result, headless: shoulder wheel 117 → 90 µs, resolves 56 → 17 a query; deck unchanged (61 µs; 2.1 resolves, up
  from 1.2 because band frames now resolve per sample). On 7–9 m shoulders 84 % of hubs hold; 12.5 % have a real
  rival (junctions, parallel roads) and still resolve per sample, which is needed there.
- `test/hint-reuse.mjs` (new gate): worst |reused − fresh| ≤ 2.5 mm (2.2 / 1.8 mm on the two seeds) and the solo
  reuse holds on ≥ 30 % of off-deck points (83 %). The 72 gates `src/road.js` affects are green. `kerb-graze.mjs` and
  `fingerprint-physics.mjs` do not touch `road.js`, so they are unchanged by construction.
- What is left: inside a junction's reach, off the deck, every sample still resolves (a wheel there costs about the
  old shoulder's 2×). The edge-leg smoke saw 113–254 ms/s while the truck sat in a junction's ditch. Making that
  exact needs the rival weights computed per sample (`_carveCrossSectionBlended`), a change to the carve core.
  The 2.4 % of spike seconds with normal resolve counts are a separate, unexplained cost.

## Acceptance

- [x] Where the spike seconds happen, measured (above: the shoulder, the hub resolve refused off the deck).
- [ ] The spike share is back near Nov 01's (≤ 5 % of moving seconds over 100 ms/s) on the PERF-40 bench, three seeds.
- [ ] Physics gates green; the kerb-graze bench unchanged.
