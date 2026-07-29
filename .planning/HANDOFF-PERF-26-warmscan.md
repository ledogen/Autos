# Handoff — PERF-26 closed (warmRoutes streaming hitch)

**For:** next session (whoever merges this, or picks up the leftovers)
**Date:** 2026-07-28
**Worktree:** `/Users/ledogen/CodeShit/CarGame-perf-26-warmscan` · branch `feature/perf-26-warmscan`
(off `main` @ `a50090a`)
**Dev server:** `http://localhost:8124` (Vite, `npm run dev -- --port 8124 --strictPort`, running in bg)
**node_modules:** installed in-worktree (`npm install`) — headless gates resolve `three` fine.
**Uncommitted:** nothing. Working tree clean.
**Commits:** `b719cc1` (this branch, unmerged). Earlier half already on main: `18166e0` + merge `a50090a`.

---

## State: DONE, unmerged, awaiting your call

PERF-26 is **closed** — ticket moved to `.planning/todos/completed/perf-26-streaming-hitch.md`,
`status: complete`. All three acceptance criteria met and verified. Nothing is half-finished.

The only open decision is **merge + push**, which the user had not yet given the word on.

---

## What the ticket was, and what actually fixed it

Periodic stutter while driving. By the time this session started, prior work had already narrowed it
to `frame.road.warmRoutes` and split it into three named buckets. Two remained: `warm.degreeDrops`
and `warm.scan`.

### Half 1 — `warm.degreeDrops` (on main, `18166e0`)

`_degreeDrops` built its graph at `roadGraphMargin + roadGraphCullMaxHops + 1` = **12** cells and used
it for two consumers with different reach. `_cullNetwork`'s `detour()` genuinely needs hop-8 over the
returned `dg` — but the *drop set* comes from `_degreeDropSet`, whose Phase-2 BFS reaches only
`roadGraphDegreeDetourHops` (**4**), so margin **8** already contains every in-window candidate's
detour neighbourhood.

`warmRoutes` reads only `.drop` and was paying a margin-12 delaunay (1261 edges) per column crossing
to decide what a margin-8 one (645 edges) decides identically. Fix: compute `drop` from the margin-8
build, make `dg` a **lazy getter** so only cull/one-ring callers build the wide graph.

−72 % cold (9.6 → 2.7 ms per crossing), **107 in-window decisions compared, 0 mismatches**.

### Half 2 — `warm.scan` (this branch, `b719cc1`)

`PREWARM_MAX_JOBS` bounds *dispatched jobs*. An edge taking a `deferred` branch pays full `_edgeDeps`
+ `_corridorDiscsFor` and yields **no job**, so nothing bounded the work — a cold macro-column
crossing evaluated ~115 edges (~38 ms) in one frame.

Added **`PREWARM_MAX_EVALS = 4`** (a work budget) alongside the job budget, plus a persistent rotating
**`_warmCursor`**. `Infinity` callers (cold spawn, region warm) keep their exact previous edge order.

---

## The two things most likely to trip you up

### 1. The cursor is load-bearing — do not "simplify" it away

A fixed-start eval cap re-evaluates the same first N edges every frame and starves the tail, because
`warmRoutes` rescans from scratch while `deferred`. Measured over 40 scans of a 115-edge cold column:

| | uncached edges reached |
|---|---|
| with the cursor | **115 / 115** — full sweep, ~15 scans |
| cursor pinned to 0 | **5 / 115** — starved |

Rotating the start is behaviour-neutral: a route is a pure function of its edge, and dep SOLO adoption
is documented as a pure function of the edge too — order changes **when** a job ships, never **what**
it computes. `_warmCursor` resets to 0 in the constructor and in `_invalidateProto`.

### 2. One change in `b719cc1` is deliberately kept despite measuring nothing

`_edgeDeps` builds a per-edge Urquhart over its own window. Those windows are **single-use** — a cold
scan issued 115 builds giving **113 distinct sigs and 0 memo hits** — and against the 6-entry
clear-all `_urqMemo` they **wiped it 16 times per scan**, evicting the big warm-band and cull graphs.
Real pathology, verified directly (warm-band graph present before the scan, gone after).

Fixed with a `cacheable=false` flag on `_buildUrquhart` (reads the memo, never writes it).
**It moved the in-browser number by zero** — `warm.scan` 28.8 → 28.8 ms. What it protects is ~1 ms
(`warm.urquhart`). It is kept because the pathology is real, but **it is not the fix** — the work
budget is. Don't cite it as a win, and don't let its existence suggest `warm.urquhart` is worth more
attention than it is.

---

## Numbers (back-to-back `--scenario=stream --cpu=4 --duration=60`, Normal, seed 6)

| | max frame | `warmRoutes` | `warm.scan` | `warm.degreeDrops` |
|---|---|---|---|---|
| main (before this branch) | 58.2 ms | 41.0 | 29.1 | 10.9 |
| after | **37.3 ms** | **20.2** | **7.5** | 10.8 |

Full lift table after: `props.lodSwap` **+2.7**, `shadow.bake` +1.4, `shadow.map.view` +0.4,
`shadow.map.geom` +0.3, `props.chunk` / `terrain.chunk` / `road.tile` +0.0.

- **Acceptance 1** (no tag above ~5 ms lift): MET — worst is +2.7, was +15.4.
- **Acceptance 2** (no cold-load regression): MET — ready 1395 → 1374 ms, ring-complete 2853 → 2823.
- **Acceptance 3** (affected gates green): MET — 23/23, run after *each* change, not just at the end.

**Machine-noise warning, learned the hard way this session:** an early A/B on a contended machine
produced a 296 ms outlier carrying 124 ms of `frame.physics` and made the fix look like a regression.
Run A and B back to back on a quiet machine, and trust the within-mechanism bucket (`warm.*`) over
cross-run worst-frame deltas. The ticket has carried this warning since 2026-07-27 for good reason.

---

## Reproduce

```bash
cd /Users/ledogen/CodeShit/CarGame-perf-26-warmscan
npm run dev -- --port 8124 --strictPort          # already running
node test/hitch-report.mjs --scenario=stream --cpu=4 --duration=60 --port=8124 --cdp=9334
node test/profile.mjs --scenario=coldload --port=8124 --cdp=9334
npm test                                          # 23 affected gates, ~3 min wall
```

Ports 8000/8010/8011/8071 and CDP 9222 are used by other work — pass free ones (8124 / 9334 here).

The headless benches that drove every decision were **external, prototype-wrapping scripts** (no
probes in `src/`, per the `src/ is the product` rule). They were scratch and are not committed; they
live in this session's scratchpad. Rebuilding one is ~20 lines: `new RoadSystem(6, P)`, `setRadius`,
`update`, then wrap `RoadSystem.prototype.<method>` with timers.

**Gotcha that cost me a wrong conclusion:** if you wrap `_buildUrquhart` for instrumentation, forward
**all** args (`function (...args) { origBuild.apply(this, args) }`). A fixed 6-arg wrapper silently
drops the new 7th `cacheable` param and makes the fix look like it isn't working.

---

## Leftovers — NOT part of PERF-26, no ticket yet

Both were listed under "Still open, unchanged" in the ticket and are carried into the closing note.
Neither is a streaming hitch; I left them rather than silently absorbing them.

1. **Re-measure `road.tile` before any ribbon work.** It sat at +0.2 / +1.7 / +0.3 / +0.0 lift across
   five runs against the +12 ms originally recorded. On this evidence the ribbon is not a problem, and
   a per-segment slicing attempt was already tried and reverted for nothing. Do not touch the ribbon
   without a fresh measurement.
2. **Fix or retire `--scenario=drive`.** It silently reports "no hitches" because the truck travels
   ~55 m from spawn and stops permanently at (−119.2, 176.6) — same terminal position throttled and
   unthrottled, so it is an obstacle/spawn-heading problem, not throttling. Only `stream` results have
   ever been valid. This is worse than not having the scenario, because it reads as a clean bill of
   health.

Also parked, from the earlier half: the **heap probe** built during the instrumentation phase was
dropped before shipping and the branch carrying it deleted. Headless Chrome reports a static
`usedJSHeapSize` even with `--enable-precise-memory-info`. Do not rebuild it.

---

## Merge

```bash
bash ~/.claude/skills/worktree/scripts/wt.sh merge perf-26-warmscan
bash ~/.claude/skills/worktree/scripts/wt.sh clean perf-26-warmscan
```

No conflicts expected — `src/road.js` and the one ticket file, and nothing else has touched them since
`a50090a`. Note that pushing `main` also deploys to GitHub Pages via `.github/workflows/deploy.yml`.
