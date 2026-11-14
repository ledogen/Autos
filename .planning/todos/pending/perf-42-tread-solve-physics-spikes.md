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
  not), PERF-40 (the bench that measures them, and since 2026-11-13 its work measure), PERF-43 (the per-wheel surface
  patch; closed by the owner with its levers unbuilt)]
branch: none open — the 2026-11-12 fixes are on main (via the PERF-37 branch); the verdict ran in CarGame-perf (feature/perf)
---
lane: Perf (p)

# PERF-42 — the tread solve's physics spikes are still there

## Next steps
Owner: say whether the junction carve's per-sample maths (PERF-43's levers 1 and 2, closed as "not worth the squeeze")
is reopened on this data. The Perf lane recommends yes: it is the only lever sized for seed 17535907 (§ Verdict).

## Summary
In about 1 driving second in 20, physics costs several times what a calm second costs. Measured in work (retired
instructions, which the CPU clock cannot move), the pooled share is 5.2 %: on the 5 % target, inside its noise band.
Seed 17535907 misses the target on both reps (9.0 % and 6.7 %). Three quarters of the spike seconds sit inside a
junction's 40 m reach, and the same junctions spike again on a repeat drive.

## Description

### Verdict, 2026-11-13 (work units, two reps)

The run: PERF-40 bench, `--fake-audio`, three seeds × 2 reps, src identical to main 0f6fbc38. Host load 0.27–0.40 per
core. 6 of 6 sessions valid. Data: `perf-runs/perf42-verdict-0f6fbc38` in CarGame-perf (gitignored), log
`perf-runs/perf42-verdict.log`.

**The measure.** Physics work in each moving second, in Minstr (million retired instructions). A moving second has the
truck over 3 m/s in it and in both neighbouring seconds, so re-seats are excluded. A spike second is one over 1000
Minstr, about 100 ms of physics on a P core near 3 GHz. Work, not ms, because ms/s on this Mac moved 2–5× with the
host's state on the same build (PERF-40 § Work, not time). The ms columns stay beside it, because a player feels ms.

| seed | rep | moving s | work p50 | work p99 | work worst | share > 1000 Minstr | ms p50 | share > 100 ms |
|---|---|---|---|---|---|---|---|---|
| 1768572700 | 1 | 226 | 338 | 2401 | 3186 | **4.4 %** | 54 | 5.3 % |
| 1768572700 | 2 | 215 | 339 | 1351 | 2358 | **3.3 %** | 55 | 4.7 % |
| 17535907 | 1 | 177 | 399 | 2705 | 3299 | **9.0 %** | 58 | 13.6 % |
| 17535907 | 2 | 209 | 403 | 1662 | 2126 | **6.7 %** | 60 | 12.9 % |
| 759313244 | 1 | 218 | 335 | 1263 | 2019 | **2.3 %** | 54 | 3.2 % |
| 759313244 | 2 | 257 | 350 | 1843 | 2536 | **5.4 %** | 57 | 7.8 % |
| pooled (mean ± rep spread) | | 1302 | | 1871 ± 891 | | **5.18 ± 2.17 %** | | 7.92 ± 1.97 % |

- **The 5 % target is not met.** The pooled 5.18 % sits 0.18 above the line. That is well inside its ±2.17 noise band
  (the mean spread between a seed's two reps), so the pooled figure says neither met nor missed. Seed 17535907 misses
  on both reps. In ms the run misses on every count (7.92 %), but the host's clock was low (2.2 GHz), which inflates ms.
- The typical second is flat between reps (work p50 within 1–4 %). The spike share moves ±1–3 points between reps of a
  seed: it is a threshold count, and a few seconds more or less at one junction move it.
- No earlier record carries work, so there is no Nov 01 baseline in work. This run is the work baseline.
- 104 seconds spike in one measure or both: 62 in both, 38 in ms only, 4 in work only. The one-sided seconds ran on P
  cores (median P share 1.00), so they are clock and memory-stall effects, not seconds parked on an E core.

### Where the spike seconds fall (2026-11-13)

The 11-12 method (`wip/perf-40n/where.mjs`): each moving second is placed by the truck's 1 Hz position against the
network's nodes. "Junction" means within 40 m of a node of degree ≥ 3. "Deg-2 kink" means within 40 m of a degree-2
node (the QUAL-16 connector carve) and not a junction. Off the deck means |lateral| > 4.5 m. All 1302 moving seconds of
the six sessions:

| place | share of moving s | work p50 | ms p50 | spike seconds (share of all moving s) |
|---|---|---|---|---|
| junction, on the deck | 7 % | 772 | 93 | **2.2 %** |
| junction, off the deck | 2 % | 1268 | 134 | **1.7 %** |
| deg-2 kink, on the deck | 5 % | 516 | 74 | 0.3 % |
| deg-2 kink, off the deck | 3 % | 735 | 95 | 0.7 % |
| plain road, on the deck | 67 % | 315 | 53 | 0.0 % |
| plain road, off the deck | 14 % | 385 | 61 | 0.2 % |

- **Junctions carry 3.9 of the 5.2 points.** A junction second on the deck costs 2.5× a plain one. Off the deck the
  median junction second is itself a spike (1268 Minstr, 4× a plain on-deck second).
- Deg-2 kinks, the 11-12 fix's target, now hold 1.0 point. Plain road's shoulder holds 0.2.
- **More than half of the junction spike seconds are ON the deck.** Several have the truck within 0.5 m of the
  centreline (seed 17535907 at (−814, 719) and (208, −2278)). On the deck the hub's road resolve is already reused for
  the whole tyre (`_hintHolds`), so the cost there is the junction carve's own per-sample maths, not re-resolving.

**Repeatable by place.** The autopilot drives the same route on both reps of a seed. A place that spiked in one rep
spiked again in the other at 4 of 5 places (1768572700), 5 of 6 (17535907) and 2 of 3 (759313244; its rep 2 added
three kink places, one of them 45 m from a junction that spiked on both reps). Second by second the work matches: seed
17535907's junction at (−814, 719) read 1274 / 1385 / 1029 / 1882 / 1505 Minstr on rep 1 and 1279 / 1355 / 1093 /
1755 / 1662 on rep 2. So a spike belongs to a junction's road geometry, not to chance.

**Seed 17535907's excess is many places.** It spiked at 6 places per rep, 5 of them junctions. Two junctions,
(−814, 719) and (−1162, 1442), gave 10 of rep 1's 16 spike seconds. The excess is exposure: its route spends 12–14 % of
moving seconds inside a junction's reach, against 7–9 % on the other two seeds, and 42–56 % of those seconds spike,
against 28–41 %. A junction second there costs about what it costs elsewhere (on-deck median 818–858 Minstr against
730–867).

**What would move it.** A what-if on these samples: cut each junction second's work above its session's plain-deck
median by a fraction, then recount the spikes.

| cut of a junction second's excess | pooled share | seed 17535907, rep 1 / rep 2 |
|---|---|---|
| none (today) | 5.19 % | 9.0 / 6.7 % |
| 15 %, on and off the deck | 4.74 % | 8.5 / 6.2 % |
| 30 %, on and off the deck | 3.27 % | 5.6 / 3.8 % |
| 50 %, on and off the deck | 2.25 % | 3.4 / 2.9 % |
| all of it, off the deck only | 3.44 % | 5.1 / 4.8 % |

- **This corrects the 11-12 "what is left".** Per-sample rival weights act only off the deck. Removing ALL of the
  off-deck junction excess would still leave seed 17535907 at 5 %. PERF-43 measured the resolver at ≤ 18 % of a
  junction query, so the realistic gain is about 0.3 points pooled.
- The target needs the junction carve's per-sample maths cut by about 30 %, on and off the deck. PERF-43 profiled it
  at seed 1768572700's junction spikes: `_junctionPadCarve` 36 % of a query, of it `_legDeckTop` 25 %. `_legDeckTop`
  is a Newton walk along the ribbon (a solver that steps toward the answer): about 5 frame evaluations per solve, each
  with four binary searches. The inter-leg blend (`_carveDirtY`) is about 20 % and runs twice per sample.
- **The recommended next lever: PERF-43's lever 1, with lever 2 alongside.** Lever 1 starts each binary search in
  `_legDeckTop`'s frame evaluations (`runPointAt`, `runProfile`, `tangentAt`'s `_locate`, `_interpArcTable`) from the
  previous iteration's index; exact and local. Lever 2 evaluates the inter-leg blend once per sample per node instead
  of twice; exact, about 10 % of the query. Together they act on ~45 % of a junction query. Expected, if they cut the
  30 % the target needs: pooled ≈ 3.3 %, seed 17535907 ≈ 4–6 %. That is an estimate from the what-if, not a
  measurement. Measure it headless first (`spots.mjs` at the junctions named above).

### What the bench showed (2026-11-12, ms)

Physics main-thread ms in each second of driving. Only seconds where the truck was moving above 3 m/s, together
with both neighbouring seconds, so re-seats are excluded. Pooled over every valid and invalid session of the two
2026-11-12 runs (`perf-runs/2026-11-12-*` in CarGame-perf37, gitignored):

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

### The work as planned (2026-11-12)

1. **Find where they happen.** The bench samples carried no position then. Add `x, z` and the nearest road feature
   (junction pad, carve, kerb or deck edge, bore, causeway) to each 1 Hz sample, or profile the spike seconds
   (PERF-37's `playlog3.mjs` approach). The suspects, from session 2's profile: `treadContact` → `rho2` sampling ground
   height about 57 times per wheel per step, through the road carve stack. Probably at junctions and carves.
2. **Remove them at the root.** Fewer samples where the ground is simple, or a cheaper sample through the stack. Not a
   cap or a skip; physics must stay honest (MESH == PHYSICS).
3. **Prove it** with PERF-40: seconds over 100 ms/s down to Nov 01's ~4 %, with `npm test`'s physics gates and the
   kerb-graze bench unchanged (pops 3/4/8, no flips).

### Where they happened (measured 2026-11-12)

**At deg-2 kinks — the QUAL-16 connector carve.** (The first answer below, "the shoulder", was real per query but is NOT
what makes the live spike seconds; the rerun showed it. Kept because its fix stands on its own.)

- The rerun (`perf-runs/2026-11-12-rerun-main-vs-branch`: main 07581275 vs the branch with the shoulder fix, three
  seeds, reps 2, 11 of 12 valid): moving seconds over 100 ms/s **main 7.1 %, branch 10 %**; the typical second
  branch p50 51–54 vs main 60–66. Pooled by the truck's lateral, spikes sit on the deck and the shoulder about
  equally on BOTH builds (branch: 4.4 % of moving seconds on the deck, 5.4 % on the shoulder/bank). Main, which has
  no hub reuse at all, has a shoulder median only 8 ms/s over its deck median. So the shoulder is not the spike.
- Headless at the bench's own spike positions (`wip/perf-42/spots.mjs`, the world rig at each 1 Hz position, 30 hubs
  on a 6 m disc): one wheel's ground query **241 µs median at spike seconds vs 42 µs at calm seconds** (seed
  1768572700, 39 spike seconds). Profiled at one (1443, 276), on the deck: **78 % of the query is `_connectorCarve`**
  → `_connectorDesignAt` → `_runGradeAt`, twice per height sample (both legs), each a FULL-polyline
  `_projectOntoRun` (34 %) and a 0.25 m grid `centerline.nearest` over ±20 m (34 %). PERF-32 had already met this
  path (the Lipschitz skip); the hub reuse never touched it.
- **Fixed (`_runGradeAt`):** the PERF-25 windowed projection (`_projectOntoRunRanges`, bit-identical whenever it
  answers, the full scan otherwise — so bit-identical always), and the analytic foot refined straight from the polyline
  foot with `_refineFoot`'s exact line/arc step instead of the grid search: the same foot at all 3,664 connector leg
  feet on two seeds (|Δs|, |Δgrade| < 0.5 µm; `wip/perf-42/foot.mjs`), 0.2 µs instead of 2.1–2.6. Heights near every
  connector move by ≤ 1.3e-13 m (float noise; `fingerprint-world`'s exact-bit surface hash flags 5 windows, carve and
  tiles identical). Spike-position query median 241 → **133 µs**; the profiled spot 251 → 92 (calm 42). What is left
  there is spread: the connector 45 %, the junction inter-leg blend (`_carveDirtY` → `_projectLegMemo`) 26 %.

**First answer: the shoulder.** A wheel whose hub is off the deck had every tread sample resolve the road afresh.

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

### The fix (2026-11-12, on main)

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
- What was left on 11-12 (corrected by the 11-13 verdict above): inside a junction's reach, off the deck, every sample
  still resolves (a wheel there costs about the old shoulder's 2×). The edge-leg smoke saw 113–254 ms/s while the
  truck sat in a junction's ditch. Making that exact needs the rival weights computed per sample
  (`_carveCrossSectionBlended`), a change to the carve core. The 2.4 % of spike seconds with normal resolve counts
  were a separate, unexplained cost. (11-13: most likely the on-deck junction seconds, where the junction carve's own
  maths is the cost.)

## Tracker
- [x] Where the spike seconds happen, measured: 11-12 the deg-2 connector carves (fixed; the shoulder was a smaller
      cost); 11-13 a junction's 40 m reach, 3.9 of the 5.2 points, more than half on the deck, repeatable by place.
- [ ] Spike share ≤ 5 % of moving seconds on the PERF-40 bench, three seeds, reps 2. In work: physics over 1000 Minstr
      in the second (now 5.18 ± 2.17 % pooled; seed 17535907 9.0 / 6.7 %). In ms: over 100 ms/s (now 7.92 ± 1.97 %;
      Nov 01 was ~4 %). Work decides; ms is read beside it.
- [ ] Physics gates green; the kerb-graze bench unchanged.

## Decisions
- 2026-11-12, owner (closing PERF-43, the per-wheel surface patch): "fix the regression and then i think the rest of
  the juice is not worth the squeeze." PERF-43's levers 1–5 were left unbuilt, to be reopened only with a measured
  reason. This ticket stayed open.

## Open questions
- Reopen PERF-43's levers 1 and 2 (the junction carve's per-sample maths) on the 11-13 verdict? Recommendation: yes.
  Junctions are three quarters of the spike seconds, and this is the only lever sized to bring seed 17535907 near 5 %.
- Does the 5 % target hold pooled, or on every seed? Recommendation: pooled, since one seed's share moves ±1–3 points
  between reps; read seed 17535907 as the hard case.

## Links
- Verdict data: `perf-runs/perf42-verdict-0f6fbc38` and `perf-runs/perf42-verdict.log` (CarGame-perf, gitignored).
- Readers: `wip/perf-40n/table.mjs` (ms vs work per phase), `wip/perf-40n/where.mjs <spikeMi>` (spike seconds by place)
  (CarGame-perf, gitignored).
- Headless spot tools: `wip/perf-42/spots.mjs`, `lat.mjs`, `foot.mjs` (CarGame-perf37, gitignored).

## Files
`src/road.js` (`_hintHolds`, `_soloPassFree`, `_runGradeAt`, `_junctionPadCarve`, `_legDeckTop`, `_carveDirtY`) ·
`src/tire-contact.js` · `test/hint-reuse.mjs` · `test/playtest-bench.mjs`

## Log
- 2026-11-12: located (connector carve at deg-2 kinks; the shoulder); fixed `_runGradeAt` and the solo reuse;
  `test/hint-reuse.mjs` gate; 72 affected gates green. Landed on main with the PERF-37 branch.
- 2026-11-12: PERF-43 (surface patch) closed by the owner; its PERF-40 baseline on main b71cd825 was 7.7 % over 100 ms/s.
- 2026-11-13: verdict in WORK (PERF-40 `threadcounts.py`), main 0f6fbc38 (src identical), fake audio, 3 seeds × 2
  reps, 6/6 valid, host 0.27–0.40/core. Pooled 5.18 ± 2.17 % over 1000 Minstr (ms: 7.92 ± 1.97 % over 100 ms/s);
  seed 17535907 9.0 / 6.7 %. Spike places by the 11-12 method: junctions 3.9 points of 5.2; a place that spiked on one
  rep spiked on the other at 11 of 14. Not closed.
