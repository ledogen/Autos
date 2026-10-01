---
id: BUG-71
type: bug
status: closed
severity: major
opened: 2026-09-21
closed: 2026-09-29
source: >
  Owner observation 2026-09-21: "there are lots of seeds where right after spawning I see a bunch
  of props in the road. they eventually clear up but it takes a long time and ruins the first
  gameplay experience."
relates_to: cfb14ea (fix(props): re-scatter chunks a road moves into — the EVENTUAL-guarantee
  mechanism this ticket re-triggers), BUG-23 (radius-aware road keep-out, closed), PERF-26/PERF-28
  (the streaming-hitch budget the sweep was bounded against), FEAT-43 (story's routing freeze)
---

# BUG-71 — props stand in the road at spawn and the repair never reaches them

## What happens

After a world arrives, trees/bushes/rocks stand **in the road** — at and around the spawn. They
clear only after a long stretch of driving, so the defect lands on the first impression.

## Root cause — the sweep's TRIGGER, not its exclusion mask

The scatter rejects a placement with `roadClear(x, z, exclusion + propRadius)`, and `RoadSystem` can
only answer for runs **registered in its currently streamed window**. Road geometry is window-
invariant; run *membership* is not — so "no road here" and "no road here YET" are the same answer
(cfb14ea; three "regenerate at time T" attempts produced byte-identical violations).

The repair for that is `PropSystem.invalidateRoadIntrusions()`, wired to the network adopt with a
**10-chunk round-robin budget**. The budget is right for the driving frontier, where more adopts are
always coming. It is wrong wherever a whole world arrives at once — and it turns out there are two
such paths, both measured 2026-09-21 in-browser (CDP probe, Normal preset ⇒ 49 live prop chunks,
predicate = the scatter's own `roadClear` at the 9 m base exclusion, small rocks excluded by design):

| path | props in the road | worst offset | what the sweep does |
|---|---|---|---|
| free-roam **cold page load**, seeds 1–7 | **0** | — | n/a — this path was already clean |
| free-roam **reseed** (debug seed field / story seed prompt → `applyWorldSeed`), seeds 11/12/14 | **79 / 37 / 118** | **0.01 m** off the centreline | 4 adopts fire while the network settles, then STOP (a parked truck moves no band): 4 × 10 = 40 of 49 chunks, so the last 9 keep their props **permanently** — 4 and 13 still standing after 60 s |
| **story mode** region entry, seed 11 | **26** | 0.26 m | **never runs, once, for the whole run** — the region freeze (`_frozen`) means the frame loop makes no `roadSystem.update()` call, so no adopt ever fires. Unchanged over 55 s idling AND driving |

Story mode is the mode the game is entered through, and there the repair is completely inert.

## Fix (shipped on `feature/bug71`)

Keep the budget where it was earned; sweep the whole ring where no further adopt is coming.

- `src/main.js` — `sweepPropIntrusions(budget)` + `queuePropFullSweeps(n)` (`FULL_SWEEP_ADOPTS = 6`,
  which covers the ~4 adopts a reseed takes to settle). The adopt hook spends the armed window on
  unbounded passes, then falls back to the 10-chunk budget.
- Armed in `_reseatTruckAtSpawn()` — one place, so cold load, R-reset, teleport and every Path-B
  reseed all get it and no future spawn path can forget.
- `onRegionLive()` sweeps **directly**, unbounded, behind the loading screen: story has no adopt to
  hang it on, and go-live is the right moment because the region was just registered whole at the
  wide radius, so every chunk scattered after it tests against the final network.
- `invalidateRoadIntrusions()` documents `budget = Infinity`; the method itself was already correct
  for it (`Math.min(budget, n)`).

## Measured after

- reseed seeds 11 / 12 / 14: peak **0** intrusions (was 79 / 37 / 118), nothing standing at any sample.
- story entry seed 11: **0** (was 26), holding over idle + driving.
- cost: an unbounded pass is **4.3–10.3 ms** over 40–49 chunks — free behind a load screen, and
  exactly why it must NOT be the frontier default.
- steady state unchanged: after the armed window drains, 14 freecam band-moves took the 10-chunk
  budget at **1.5–2.5 ms**, same as before.
- `npm test` (affected): 5/5 green.

## Acceptance

- [x] No non-`smallRock` prop inside `roadExclusion` of a registered centreline in the live ring,
      on the reseed path and the story-entry path — measured, not eyeballed.
- [x] The driving frontier keeps its per-adopt budget (no PERF-26/28 regression).
- [x] Small rocks still ignore the exclusion by design; the termination property is untouched.
- [x] Owner confirms in-game that the first minute of a run is clean (closed by owner 2026-09-29).

## Resolution 2026-09-29 — closed by the owner

The fix merged to main as `b130e14` (feature/bug71, commit `4557584`). PERF-33 (`58f1e44`) then
reshaped the delivery without changing the guarantee: the whole-ring sweep is no longer run inside
the adopt handler (worker `onmessage` work is invisible to the hitch buckets and was the source of
the driving microstutter). Instead the sweep is OWED — `owePropSweep()` arms a chunk count and the
frame loop pays it down at `PROP_SWEEP_PER_FRAME = 2` chunks per frame (~0.3 ms/chunk, a 49-chunk
ring in ~25 frames) under the streaming budget. Story-mode go-live (`onRegionLive`) still sweeps
unbounded behind the loading screen. FEAT-85 (`87275b2`) later made the sweep ignore medium rocks,
matching the scatter's own exclusion so a road move no longer churns chunk release/re-scatter.

Owner ruling: the first minute of a run is clean. Ticket closed.
