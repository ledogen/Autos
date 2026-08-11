---
id: FEAT-63
type: feature
status: open
severity: major
opened: 2026-08-11
source: owner ruling 2026-08-11, during the FEAT-61 rung-radius pass
relates: FEAT-61, FEAT-39, FEAT-16, BUG-46, BUG-47
note: "SM-INV-2 (one par, one oracle) is the constraint that shapes this ticket: the GUIDANCE
  re-plans, the PAR never does. Read the Invariant section before touching src/par.js."
---

# FEAT-63: the GPS always gives you the best remaining route — computed across frames, never a stutter

## The ruling (owner, 2026-08-11)

> I want the GPS to always provide the player with the best path when the player goes off route,
> which forces recalculation. We'll just put something in the corner of the screen that says
> RECALCULATING so the player knows they're about to get their GPS route, and then we can allow it
> to partially calculate over a number of frames whenever there is additional CPU overhead, so that
> it never introduces a stutter. It will always provide the best route. A one or two second delay
> here isn't the end of the world — if a player needs the GPS it means they're already off track,
> and we'll accept any sort of routing help.

Exact, not approximate. Sliced, not deferred. Honest about working, via the corner indicator.

## Today's behaviour (traced, not assumed)

`gpsSystem.getRoute()` returns `paperRouteSystem.route` — the tour baked at accept and never
touched again. Drive off it and lateral error passes `REACQUIRE_M = 40`, `advanceProgress`
full-scans, and snaps you to the nearest point on that **static** polyline. On a tour that crosses
itself that can drop you onto a later leg, and the chevrons then guide you along a stretch whose
customers you have already served. Nothing throws; the arrows just quietly point at the wrong thing.

Scoring is unaffected — `recordLanding()` has no order term, so delivering in any sequence scores
identically. This ticket is about the arrows, not the mission.

## Two things already work and need NO changes

Worth stating, because both look like work and are not:

- **`src/gps.js` re-bakes on route object IDENTITY** (`mission !== this._src`, line ~426) and resets
  `this._idx = 0`. Hand it a new route object and it adapts, progress included.
- **`map2d._drawMission` is a per-frame layer** reading `markers()`, not a cached background. It
  repaints the new line for free.

So the deliverable is: produce a new route object, on time, without a dropped frame.

## The measurements this design rests on

Seed 6, warm region, full `planTour` including graph surgery, Dijkstra and Held-Karp:

| stops | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|
| ms | 1.8 | 2.1 | 2.1 | 3.2 | 5.4 | 7.5 | **14.1** |

The curve is Held-Karp's 2ⁿ·n and nothing else — the graph surgery and the Dijkstras are the flat
1–3 ms underneath it. **15 stops is 14 ms of a 16.6 ms frame**, and ~20 ms observed on a cold cache.
That is the stutter, and it is the only stutter.

**The budget is far kinder than the ruling assumes.** The whole job is ~14 ms of work. Sliced at a
conservative 2 ms of spare time per frame it completes in **~7 frames — about 120 ms**, an eighth of
the "one or two seconds" allowed. The indicator will need a *minimum* display time so it does not
flicker rather than a patience budget.

Greedy nearest-next was measured as the cheap alternative and is **rejected by this ruling**, but
the numbers are recorded so nobody re-proposes it blind: 0.2–0.7 ms per re-target, and against the
exact optimum it tied on seeds 11 and 42 and lost **+15.3 % (2.95 km)** on seed 6.

## The invariant this must not break

**SM-INV-2 — one par, one oracle.** `run.par` is computed once at accept over the tour as planned
and is **never recomputed**. A re-plan produces guidance only.

**And the guidance is always the SHORTEST completion, precisely because par is frozen** (owner,
2026-08-11). The two facts are not in tension — the second is the reason for the first. Once you
have gone off the priced tour, that tour is no longer a route you are driving; it is only a number
you are being measured against. The shortest way to finish from where you actually are is therefore
the player's *best remaining chance of coming in under a par that was set on a different line*, and
pointing at anything else would be withholding help from someone who is already behind.

`gps.js` currently carries a comment arguing the opposite — that pointing anywhere other than the
priced tour would guide you along a route the clock is not measuring. It is superseded and must be
**rewritten, not deleted**: the clock measuring a different line is exactly why the guidance must be
optimal rather than faithful. Say that in the code.

A corollary worth pinning in the gate: a player who follows the GPS exactly from the start never
triggers a re-plan, so the accept-time optimum and the driven line are the same and par is exact.

## Design

### 1. Make `planTour` resumable — one algorithm, two drivers

Do **not** write a second planner. Convert the body of `planTour` into a generator that yields at
chunk boundaries, and keep `planTour` as a thin drain over it:

```js
export function* planTourJob (road, origin, cust, want, region, margin, ringR) { … yield … }
export function planTour (...args) {
    const it = planTourJob(...args)
    let r = it.next(); while (!r.done) r = it.next()
    return r.value
}
```

Accept-time planning keeps calling `planTour` and is untouched. The re-plan pumps the generator.
This is the whole reason the ticket is small: there is one ordering algorithm, and it cannot drift
from itself.

Yield points, coarsest first:

- after the split-graph surgery (sub-ms, one shot — do not slice it)
- **one yield per Dijkstra** (`searchFrom`), n+1 of them
- **inside the Held-Karp mask loop**, every K masks — this is where the 14 ms lives. The outer
  `for (let mask = 1; mask < SZ; mask++)` is already the natural resume point; nothing needs
  restructuring, only a `yield` and a counter.
- after reconstruction / segment build / polyline (one shot)

### 2. Pre-allocate the DP tables

At n = 15 the tables are `Float64Array(32768 × 15)` ≈ 3.9 MB plus `Int16Array` ≈ 1 MB. Allocating
~5 MB mid-drive is its own hitch and a GC event afterwards. Allocate **once at route accept**, sized
for the tier's stop count, and reuse across every re-plan on that route. Free at route end.

### 3. The spare-time pump

Live in `main.js`'s frame loop, after render. Spend `max(0, TARGET_MS − frameSoFar − MARGIN)` on
`it.next()` calls, checking the clock between chunks; skip entirely on any frame that already
overran. Suggested `TARGET_MS = 16.6`, `MARGIN = 2`. A conservative floor of ~1 ms per frame keeps
the job progressing even under sustained load, so it can never starve indefinitely.

### 4. Triggers, and cancellation

Re-plan when **either**:

- lateral error to the current route exceeds `REACQUIRE_M` continuously for ~2 s (a wrong turn, not
  a wide corner), **or**
- the undelivered set stops matching the current route's remaining suffix — i.e. a customer was
  served out of order.

A delivery in the expected order does **not** trigger one; the remaining suffix is still optimal.

If a trigger fires while a job is running, **discard and restart** — the origin moved. The indicator
stays up across the restart.

### 5. Origin, and the staleness guard

The origin is the truck's current `(edge, arc)` from `road.queryNearest` (~25 µs), wrapped in the
`{id, aId, bId, s, x, z}` shape `planTour` already takes for Larry. This synthetic origin is the one
genuinely new piece of machinery.

Capture the origin position when the job starts; on completion, discard the result if the truck is
now more than ~50 m from it and start again. At ~120 ms and 20 m/s the drift is ~2.4 m, so this
should never fire — it is a guard against a pathological frame-rate collapse, and it should log when
it does.

### 6. The indicator

A small `RECALCULATING…` in a screen corner while a job is live, on the existing HUD poll — not a
per-frame write. Minimum display ~400 ms so a 120 ms job does not flash. Styling docks onto the
existing panel chrome by selector, as the dialogue panel did.

## Interaction with BUG-47

On a seed where Larry is on a stranded component, a re-plan can legitimately reach **fewer** stops
than remain undelivered. Do not treat that as a failure: route what is reachable, keep the rest
undelivered, and let BUG-47 own the topology. A re-plan must **never** return null and leave the
player with no line — on a failed job, keep the previous route and drop the indicator.

## Acceptance

- Going off route by a wrong turn produces a **new, exactly-optimal** line for the remaining
  undelivered customers, from the truck's current position.
- **No frame exceeds its budget during a re-plan**, measured at the top rung (15 stops) — the
  PERF-08 profiling harness (`?prof=1`) is the instrument, not a stopwatch and not a gate's
  wall-clock assertion.
- `RECALCULATING…` is visible for the whole job and at least ~400 ms.
- `run.par` and the deadline are byte-identical before and after any number of re-plans.
- Following the original route exactly never triggers a re-plan.
- The 2D map's route line and the chevrons both show the new route without either subsystem
  gaining re-plan-specific code.

## Gates

- **`paper-reroute.mjs`** (new, heavy — needs a routed network):
  - `planTour` and a fully-drained `planTourJob` return **identical** routes for the same inputs.
    This is the check that keeps the two drivers honest.
  - A job driven in deliberately tiny slices (one `next()` per call) returns the same route as one
    driven in a single slice — resumption carries no state across yields that it should not.
  - A re-plan from a mid-route origin returns exactly a permutation of the **undelivered** set,
    never re-adding a delivered customer.
  - A re-plan is never longer than the original route's remaining suffix from the same origin.
  - Par is unchanged across a re-plan.
- **`paper-tour.mjs`** keeps its existing checks; the tier ladder and SM-INV-12 nesting are
  untouched by this ticket.

## Do not

- Do not recompute par. Do not call `computePar` anywhere in the re-plan path.
- Do not put this on a Worker. The planner needs the live `RoadSystem` (`networkGraph`,
  `edgeParData`) and the project bans Web Workers for anything on the physics path; the sliced
  generator is the sanctioned shape and the measured cost does not justify a second routing client.
- Do not fall back to greedy nearest-next. Measured, rejected by ruling — see above.
- Do not slice the graph surgery or the polyline build. They are sub-ms and slicing them buys
  nothing but state to get wrong.
