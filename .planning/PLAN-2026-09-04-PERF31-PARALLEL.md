# PLAN 2026-09-04 — PERF-31: the plan-layer CPU, with parallel routing as one lever of several

Owner-directed 2026-09-04, following the ROUTER-REUSE-AND-PARALLELISM.md memo ("i think we can
parallelize routing and get a big perf win. if the plan layer is the true cost, it will not help
us as much however. unless that too can benefit from more workers"). This plan is the spec for
the next session; PERF-31 is the tracker entry. FEAT-76 (route reuse / T-junctions) is a
**separate, banked effort** — see the sequencing note at the end.

## The measurement that frames everything (2026-09-04, test/measure-route-demand.mjs)

Three 1400 m windows, seed 6, cold, M4, unthrottled:

| quantity | value |
|---|---|
| build wall-clock | 17.4 s |
| inside `_edgeCenterline` (routing on the build thread) | 7.8 s — **45 %** |
| everything else (the plan layer + assembly) | 9.6 s — **55 %** |
| route keys demanded | 214 |
| predictable by today's warm scan | 112 — **52 %** |
| `#g` hard-grade rungs (unpredictable by design) | 0 |
| plan-demanded, outside the warm set | 102 |

Two corrections to the memo, both measured rather than argued:

1. **Routing is 45 % of the build, not 70.7 %.** The memo quoted PERF-31's sampled CPU profile;
   the wall-clock wrapper on `_edgeCenterline` (which IS the quantity parallelism can remove
   from the build thread) says 45 %. The owner's instinct — the plan layer is the true cost —
   is correct: it is 55 % and fully serial.
2. **Naive re-pointing of warmRoutes buys only half the routing.** 48 % of demanded keys are
   invisible to the warm scan. The sample dump shows why: they are the SAME edges under
   DIFFERENT `#p` pin fingerprints — the R4 settle pass routes margin edges with pins derived
   from the band graph's fringe-truncated adjacency, and per-direction variants, which
   `_warmScan` does not derive. Not mysterious, not random: a pin-derivation gap.

Amdahl with honest numbers: parallelising only the predictable 52 % of 7.8 s at a perfect 3.5×
takes 17.4 s → ~14.5 s. Parallelising ALL routing (pin-parity fixed) → ~11.8 s. Neither reaches
PERF-31's ≤ 8 s target alone. **The route-count lever and the parallelism lever must both land;
they multiply.** 214 demanded keys against v2-at-birth's 64 routes is the single biggest number
on the board.

## Execution model (binding, unchanged)

Serial on shared code; parallel subagents read-only; subagents launch with model: opus. Full
`npm run test:all` at each workstream boundary. `test/network-worker-parity.mjs` and
`road-worker-parity` are the referees for anything touching the worker seams;
`world-determinism` + `restream-invariance` for anything touching pins or scan order.
**priced == built is not relaxable without an explicit owner ruling** (standing PERF-31 rule).

## Workstream order (each gated on the previous, each measured with the instrument)

### W1 — route-count: attack the 214-vs-64 inflation FIRST (PERF-31 lever 1)

Shrinking demanded routes shrinks both the serial build AND what W2 must parallelise — it is
the multiplier on everything downstream, which is why it goes first.

- Classify the 214 by producer (extend measure-route-demand.mjs: tag keys by call site —
  registered edge / census partner sample / settle 1-ring / direction variant / pin variant).
- Candidates from the ticket, now with a sharper target list: pin-variant dedup (a route under
  fringe pins vs interior pins for the same edge — measure how often the GEOMETRY differs; if
  rarely, a verified-equal fallback could collapse the variant), partner-sampling bound
  (`censusChordM` 300 m) with a false-negative check, cross-planner sample sharing.
- Gate: battery network hash unchanged, junction-stitch row count unchanged, wye-release green.

### W2 — parallel routing (PERF-31 lever 5, the memo's §2)

Two sub-steps, strictly ordered:

1. **Pin parity in the warm scan.** Make the enumeration derive the same pin fingerprints the
   build demands (the settle pass's fringe pins + direction variants) — `_v2EdgeDirs`/
   `_v2DirsNS` are the shared machinery, so this is re-deriving with the same inputs, not new
   math. Re-run the instrument; go/no-go bar: **≥ 90 % predictable**. Below that, W2 stops and
   the effort goes to W1/W3 (Amdahl says so).
2. **Plumbing.** Prefer the memo's option (b): predictive pre-warm, build-as-cache-walk.
   Recommended shape: the NETWORK worker spawns its own route-worker pool (nested workers —
   support check first; Safari 16.4+ per the memo) and pre-warms its private instance's
   `_proto.cls` before calling update(). Fallback if nested workers disappoint: batch-ship —
   main thread pre-warms via the existing pool and posts routed centerlines into the build
   request. Keep the pool cap at 4 TOTAL routing workers machine-wide (the 8-worker E-core
   regression is measured — road-worker.js:44); if the network worker owns a pool, the
   main-thread pool must not run concurrently with a build.
- Gate: network-worker-parity byte-green (the pre-warm must be invisible in the output),
  plus the instrument's routing-on-build-thread number → ~0.

### W3 — the serial remainder (PERF-31 levers 2–4), only as far as the target needs

After W1+W2, re-measure. If the three-window bench is still above 8 s, the remaining levers in
the ticket's order: margin-box cost for plan-only samples (needs the priced==built fence),
merge-ladder re-solves, R4 pass-2 scope. **The plan layer stays single-threaded** — its
parallelisable share (profile solves, ~10 % of total) cannot pay for the determinism risk of
concurrent mutation of shared graph state; the owner's "unless that too can benefit from more
workers" is answered: no, by measurement — the plan layer's cost yields to less-work levers,
not more-workers levers.

### Cleanup

- Retire the duplicated warm machinery this obsoletes (if W2 lands, the main-thread route pool
  serves only map/mission fallbacks — measure whether it still earns its four workers).
- Re-run PERF-30's felt numbers (story entry, spawn, map cold open) and record them in both
  tickets; they should all drop roughly with the bench.

## Targets (owner, 2026-09-04)

The bench target stays ≤ 8 s on the three windows. But the owner's REAL concern is absolute
cost on slow hardware: *"a player on a slow device will have their experience hampered by a
>30 s loading screen."* So every workstream also records **story-mode entry at --cpu=4** (the
established slow-device proxy) — treat > 30 s there as failing the actual requirement
regardless of the bench number, and treat every second removed as valuable even past the
target ("more important we're doing what we can to make it faster as an absolute").

## Sequencing vs FEAT-76 (route reuse / T-junctions)

Banked behind PERF-31 (owner-confirmed 2026-09-04): FEAT-76 changes WHICH
routes exist and adds a dependency DAG to routing order — doing it concurrently with W1/W2
would make every measurement ambiguous. The memo shows the two are multiplicative, not
competing; FEAT-76 gets a faster, parallel router for free if it lands second.

## Where things stand going in

- PERF-30 shipped and pushed (`54b1415`): whole build off-thread, multi-client worker
  ('play'/'mission'/'map'), stale-until-replaced in play, cold flows behind loading screens,
  story map adopts the play network. Owner drove it: feel is good.
- The instrument is committed: `node test/measure-route-demand.mjs` (rainy-day, not a gate).
- Suite state: green modulo the four booked reds (junction-stitch + the three instrument
  re-baselines — still owed by some session, unrelated to this effort).
- The memo: `.planning/research/ROUTER-REUSE-AND-PARALLELISM.md`. The ticket: PERF-31 (lever 5
  added 2026-09-04). FEAT-76's ticket carries the reuse architecture.
