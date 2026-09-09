# HANDOFF — merging `feature/portal-cost` into main — 2026-09-09

**One router bug, one worldgen knob, and five gates that were measuring the wrong thing. §1 is the
thing to read before merging: the owner's complaint was stubby tunnels, the obvious lever (`cPortal`)
turned out to be the WRONG one and is left untouched at 250, and four of the five gates that went red
along the way had no defect behind them at all. Clean merge — verified with `merge-tree`; main has
moved one commit (`ba48edd`, ASSET-34) but it touches only `assets/models/*`, which is disjoint.**

Branch `feature/portal-cost` @ `8c2d3a1`, worktree `/Users/ledogen/CodeShit/CarGame-portal-cost`,
dev on :8021.

---

## 1. READ THIS FIRST — `cPortal` is not the stubby-tunnel lever, `cutMax` is

The complaint: bores as long as they are tall, punching the leftover dirt after earthwork.

`cPortal` 250 → 450 was tried and **rejected**. It makes bores rarer but does not remove the short
ones — and that is not a tuning shortfall, it is structural:

| | cPortal 250 | 450 | 700 | 1000 |
|---|---|---|---|---|
| bores (seeds 6/20/11, r 1400) | 42 | 35 | 31 | 27 |
| seed 6's 20 m bore | present | present | present | **still present** |

A 20 m bore under 30 m of rock survives `cPortal` **1000**, because above `cutMax` there is no cut
state to buy. The router was never choosing a tunnel over a cutting — it had no cutting to choose. So
price cannot reach it; the class boundary can.

`cutMax` 20 → 25 empties the sub-25 m band in every seed while barely moving the count (42 → 40).
`cutMax` is a live debug slider (`src/debug.js:576`, range **6–40**), so the whole range has to
produce a valid world — that bar drove the rest of the work.

**Do not re-open a `cPortal` raise as the answer to stubby tunnels.**

## 2. The recurring finding — five gates, one real defect

Raising the slider turned five gates red. **Exactly one was a defect the knob created. None of the
other four were defects at all** — each was a one- or two-probe gate whose probe relocated onto
something pre-existing, or a mis-dimensioned tolerance.

| gate | what it turned out to be |
|---|---|
| `pond-route-around` | **REAL ROUTER BUG.** `isBlocked` resolved no-go discs at the lattice CELL CENTRE, so the exclusion was accurate only to ±cell/2 — 16 m, 22.6 m at a corner — while the pond skirt is 10 m. The skirt was finer than the quantum enforcing it. Fixed. |
| `road-tunnel` | Admitted samples on their MIDPOINT, scoring a portal transition as bore grade. Sample `[851.3, 855.3]` against a span starting at 851.5 read 22.5 % while the bore behind it runs at 13.7 %. |
| `mission-network` | Fixed 0.5 m bar against an error that is 0.02–0.06 % **of run length**. Its own comment quoted both numbers and encoded only the metre. |
| `road-fill-support` | Marched one lateral direction from one fill, on a SIDE-HILL BENCH — the cut side, where nothing is raised and nothing is owed. |
| `paper-reroute` | Stale metric was algebraically degenerate; 5 % bar was a property of one seed's customer draw. |

A green `npm test` was weaker evidence than it looked for anything worldgen-shaped. That is the
durable lesson here.

## 3. The three commits

**`53c03f0` — the pond exclusion is a CELL test, not a cell-CENTRE test.** `_carveCrossSection`'s
disc check now tests whether any part of the 32 m cell intersects the disc, so an open cell lies
wholly outside it and the polyline through open cell centres does too. Measured on seed 6, edge
`g:1,-1,1:2,0,0` came to 51.2 m of a 60 m disc — 8.8 m in, comfortably under a half-cell — and every
rung's fit then failed `clearsDiscs`, so the last-resort `wet` branch shipped it. **Measured cost:
none.** `paper-reroute` returns numbers byte-identical to main with this fix alone.

**`b1e028d` — `cutMax` 25, bore grade graced at the portal, relative arc bar.**

*The portal is a transition, not a line.* A span boundary does not sit on the profile's station grid,
so the first station inside a span still carries the surface approach grade — seed 11 runs 25.1 %
(legal road) into a mouth, blends across one 4 m sample, settles to 20.1 % (legal bore). The gate now
enforces `gMaxBore` on the INTERIOR and `gMaxRoad` within a grace band of each mouth. **The band is
sized by that mechanism, not fitted:** one station (~10 m) + one polyline sample (4 m) = 15 m, capped
at 20 % of the span so a short bore keeps ≥60 % strictly enforced. Measured over **350 bores**
(6 seeds × cutMax 12/20/25/32/40): only 2 need any grace, worst interior grade 20.4 % everywhere.

*`mission-network`'s arc bar is now relative* — 0.15 %, measured over 415 runs, ~500× below the tens
of metres a genuine re-seat produces.

**`8c2d3a1` — the two gates assert the real property, over a corpus.**

`road-fill-support` now checks **`blendW`**, not height. `_carveCrossSection` sets it to 1.0 for
`radDist < carveHalfWidth` unconditionally, so a flat core IS the footprint contract — sign-agnostic,
equally true on a cut, a fill or a bench, and still failed hard by the pre-fix bug it guards (which
drove it to 0 at 7.5 m). Both sides, top-20 fills, 4 seeds, non-vacuous. Two further bugs the wider
corpus exposed: the drivable band was `lat <= hw + DLAT`, which includes the first DIRT sample and so
scored the asphalt→dirt edge plus a tall fill's own bank as undrivable; and `lat += 0.2` accumulated
to `7.799999999999995`, making the old comparison false by 5e-15.

`paper-reroute`'s stale metric was `(cum[last] − cum[bi]) + cum[bi]`, in which `bi` **cancels** — the
whole tour length regardless of where the player jumped, so it never priced "carry on from here" at
all. Corrected to *drive the tail, then run back for the earliest customer skipped behind*, and
asserted as a DISTRIBUTION over ~50 scenarios (every jump point × the tier ladder × two worlds):

| seed | median gain | worst scenario | >5 % |
|---|---|---|---|
| 6 | 25.7 % | −1.0 % | 32/39 |
| 20 | 46.1 % | −0.5 % | 35/39 |
| 11 | 31.5 % | −1.3 % | 36/39 |
| 3 | 20.5 % | +3.1 % | 37/39 |

The planner is exact (Held-Karp), so a thin margin never meant a weak planner — it meant that draw's
stale order happened to be near-optimal. Seeds cost ~10 s of `road.update()` each while jump points
cost ~4 ms, so two worlds × 39 scenarios buys far more evidence than four worlds × one scenario.

## 4. Verification

- **`npm run test:all`: 68/69 green.** Only `junction-stitch.mjs` red — **pre-existing on main**
  (BUG-56), confirmed by running it on main's checkout during this work.
- Both rewritten gates green across `cutMax` **12 / 20 / 25 / 32** — the slider-range bar.
- `road-tunnel` green across 12/20/25/32/40.
- Teeth checked, not assumed: `blendW` is 1.0 inside the core and the pre-fix footprint clip at 7.5 m
  drives it to 0, so the new check bites on the failure it guards.

## 5. Merge

Main moved one commit since the branch point. No conflict — verified without touching the tree:

```
git -C <worktree> merge-tree --write-tree --name-only main HEAD   # → clean tree, exit 0
```

`ba48edd` (ASSET-34, headlamp cutout) touches `assets/models/*` only; this branch touches
`data/ranger.js`, `src/corridor-router.js`, `test/*`. Disjoint.

```
bash ~/.claude/skills/worktree/scripts/wt.sh merge portal-cost
```

## 6. Open items — surfaced here, deliberately NOT fixed

Both gates fail at **`cutMax` 40** on genuine, newly-surfaced defects. They were left red rather than
tuned away, and want tickets:

1. **A 1.152 m UPWARD step at a junction pad rim** (seed 6, fill 8.2 m @(−962,−690), lat 7.8,
   `blendW` 1.000, run `g:-2,-2,0:-970783,-685247,-1`). This is the "invisible cliff" class
   `road-fill-support` exists to catch.
2. **A 12.5 % re-plan REGRESSION** — one scenario where the exact planner loses to the stale line.
   With Held-Karp that cannot be optimality; it means the planner's mixed chord/arc graph metric
   diverged badly from `computePar`'s true arc. The gate's own text calls this "the optimiser was
   handed the wrong graph".

Two more, unrelated to the slider:

3. **Earthwork runs where tunnelling already won** (owner, in passing) — upstream of the whole stubby
   tunnel complaint and probably the better root fix.
4. **`carve-mesh-smoothness.mjs` already MEASURES mesh-vs-physics agreement** (worst 0.3–0.5 m over
   147 k samples) and only reports it. Turning that into an assertion is cheap and is the natural home
   for the MESH == PHYSICS invariant — `road-fill-support` deliberately does not duplicate it.
