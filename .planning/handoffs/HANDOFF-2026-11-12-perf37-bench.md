# Handoff 2026-11-12 (evening) — PERF-37 branch: PERF-42 spikes, the PERF-40 bench's second pass

**Worktree** `/Users/ledogen/CodeShit/CarGame-perf37` · **branch** `perf/perf-37-tire-map` (off main 07581275, not
landed) · **dev server** :8039 (background Vite; the bench starts its own). Window title `CarGame-perf37 :8039`.

Other worktrees this work made or uses:
- `/Users/ledogen/CodeShit/CarGame-main0758` — detached at main 07581275 with cloned `node_modules`: the pinned A side of
  the bench A/B (nothing can move under its Vite). Keep while A/Bs against 07581275 are wanted.
- `/Users/ledogen/CodeShit/CarGame-nov01` — detached at 9a7e3d71 (Nov 01), for the third column. Owner 11-12: two
  builds only for the rerun; still on disk.

## What happened this session (details: the PERF-42 ticket)

1. **Shoulder fix** (`road.js _hintHolds` / `_resolveRoadSurface` `solo` / `_soloPassFree`, `HINT_REACH_M`): off the
   deck, a wheel's one hub resolve is reused for samples within 1 m when no other carve field reaches. Headless shoulder
   wheel 117 → 90 µs. **Not the spike** (the rerun showed it), but real.
2. **PERF-39's reuse was inexact (48 mm)** in BUG-154 departure bands — the band frame reused as a straight line.
   Fixed (`_bandRefine` returns `lo = hi = 0`). New gate `test/hint-reuse.mjs` (≤ 2.5 mm, solo coverage ≥ 30 %).
3. **The spike's real cause: the deg-2 connector carve** (`_runGradeAt`, twice per height sample near a kink). At the
   bench's spike positions a wheel query cost 241 µs vs 42 calm. Fixed: PERF-25 windowed projection (bit-identical) +
   exact `_refineFoot` from the polyline foot instead of a ±20 m grid search (same foot on 3,664 leg feet; heights
   move ≤ 1.3e-13 m). Spike-position median 241 → 133 µs.
4. Bench (PERF-40): per-second spike metrics in every report; a harder map script (zoom out, fast pan, zoom in); a
   60 s edge leg (autopilot `lane` 5 m); validity bar 2.5 km (owner); `x, z, lat` per sample; `--probe` resolves.

Gates: the 72 `road.js` affects are green after each change. `fingerprint-world` vs a2e95e87: only `surface` differs
(5 windows, exact-bit hash; the change is float noise), carve/tiles identical.

## Numbers (perf-runs/, gitignored)

Physics ms per moving second, pooled:

| | p50 | p95 | p99 | worst | > 100 ms/s |
|---|---|---|---|---|---|
| main 07581275 (rerun, 6 sessions) | 61 | 122 | 171 | 255 | 8.1 % |
| branch, shoulder fix (rerun, 6) | 52 | 137 | 184 | 270 | 10.1 % |
| branch + connector fix (3 seeds × 1, `2026-11-12-branch-connector-fix`) | 54 | 118 | 158 | 208 | **7.7 %** |
| Nov 01 (earlier run, no edge leg) | 52 | 90 | 129 | 153 | 4 % |

The edge leg (added this session) puts more shoulder/junction time in every drive than the Nov 01 run had, so that
row is not the same drive. Map: the harder script did NOT reproduce main's repaint stall (main's worst 54–62 ms/s
vs 920–960 in the owner's session 2); the branch's GPU-under-map saving holds (52–66 vs 765–816 Mcyc/s).

## What is left (PERF-42 not closed — acceptance wants ≤ 5 %)

At the remaining spike positions the ground query is still 110–300 µs (calm 33–42). Profiled at seed 17535907
(−827, 704), a junction pad in a departure band: 43.5 resolves a query (band frames now resolve per sample, the price
of item 2), `_junctionPadCarve` 23 %. Seven spike seconds there have a CHEAP ground query (20–36 µs): another cost.
Each next lever is a carve-core design change — the owner's call which, if any:
- reuse in a band with a per-sample `_bandRefine` (exact, no cell scan);
- rival weights computed per sample in `_carveCrossSectionBlended`, so a hint holds near junctions;
- a cheaper `_junctionPadCarve` / `_carveDirtY` inter-leg blend.
Tools: `wip/perf-42/spots.mjs <seed> <run dir> <build letter>` (query cost at a run's spike vs calm positions),
`prof-spot.mjs` + `under.cjs` (profile one, self time under `queryContacts`), `lat.mjs`, `foot.mjs`, `ab-surface.mjs`.

## Open questions for the owner

1. Which of the three levers above, or close PERF-42 at 7.7 % (below main's 8.1 %) and ticket the rest?
2. Record the baseline (`--record`) now or after landing?
3. Land the branch (PERF-38 map, PERF-39 tire, PERF-40 bench, PERF-42 so far)? A `test:all` is owed first.
4. Remove `CarGame-nov01` / `CarGame-main0758`?
5. Optional: `sudo powermetrics` beside one session, only if watts are wanted in reports.
