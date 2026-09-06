---
id: BUG-41
type: bug
status: open
opened: 2026-08-02
closed: 2026-08-03
reopened: "2026-09-05: the drift alarm fired exactly as designed — see the RE-OPENED section"
renumbered: "2026-08-03: filed as BUG-40, which collided with the closed deg-2 connector hump bug"
severity: medium   # 2026-09-05: raised from minor — par misprices DISTANCE on merged runs (up to 6.39%), and par is the FEAT-53 payout denominator
source: discovered while fixing FEAT-39 GPS defects (feature/gps-fix)
relates_to: src/par.js (computePar / gradeRun), src/road.js (_gradeSampler, edgeParData,
  runProfile), src/mission.js (segments[].gradeAt), FEAT-29 (par oracle), FEAT-30 (par
  calibration), FEAT-53 (economy spine — payout/rank scale, k re-derived 2026-08-02 in 30544cb)
note: "Do NOT fix silently. Correcting this shifts every par time, and par is the denominator of
  the FEAT-53 payout/rank scale that was just re-derived. It is the owner's call whether to take
  the correction and re-calibrate, or leave par on its current basis."
---

# BUG-41: the par oracle prices grade off an elevation series the world does not build

## Observed

`RoadSystem.edgeParData()` hands the par oracle a `gradeAt(s)` built by `_gradeSampler(hit.points,
hit.clArc)` (`src/road.js:617`, `:1736`) — the ROUTED design polyline's `points[].y`. That is not
the elevation the world is carved to. The carve, the ribbon mesh and the physics all read
`RoadSystem.runProfile(s, runKey).gradeY`, a later pipeline stage.

The two disagree substantially. Measured on seed 6 over ~5 k route samples
(`RANGER_PARAMS`, `MISSION_PLAN_RADIUS`), against the true carved surface via
`terrain.analyticHeight`:

| elevation source | \|err\| vs carved surface, p50 | p90 | max |
|---|---|---|---|
| `seg.gradeAt` (what par uses) | 0.05 m | 0.74 m | **27.40 m** |
| `runProfile().gradeY` (what the world builds) | 0.05 m | **0.09 m** | 22.47 m* |

\* the runProfile tail is entirely FEAT-40 tunnel bores, where `analyticHeight` correctly returns
the hill overhead rather than the bore floor — i.e. runProfile has no genuine outliers.

The error is dominated by a per-run CONSTANT offset (all four worst samples on one runKey sat
-27 m, at arcs 6/12/18/24 m). This is why the impact on par is modest but nonzero: `par.js:147`
prices grade as a DIFFERENCE, `gradeAt(sFwd) - gradeAt(sBack)`, so a constant offset cancels — but
it does not cancel across a run boundary or wherever the offset varies along the run.

## Impact

Re-pricing 25 rolled missions on seed 6 with `runProfile` in place of `gradeAt`:

```
par time, relative change:  p50 0.61%   p90 2.61%   max 3.42%
```

So: real, one-sided-ish, and small. It does not invalidate FEAT-30's calibration, but it means par
is computed against hills that are not the hills the truck drives.

## Why this was not fixed in the GPS pass

FEAT-39's overlay had the same bug far more visibly — baking `gradeAt` put 5.6% of chevrons UNDER
the road surface (depth-tested away: "the chevrons disappear") and 7.2% more than a metre above it
("floating in the sky"), and left the junction arrow a median 7 m off. GPS now bakes from
`runProfile` (`src/gps.js` bakeRoute, ELEVATION SOURCE note) and is accurate to 0.02 m at junctions.

Par was deliberately left alone: changing it moves every par time by up to ~3.4%, and par is the
denominator of the FEAT-53 payout/rank scale whose `k` was re-derived only days earlier (30544cb).
That is a balance decision, not a bug fix.

## Resolution — WONTFIX (owner ruling, 2026-08-03): par keeps the routed-polyline basis

**Ruling:** *"par feels good as is."* Par is not switched to `runProfile().gradeY`.

### What par actually does with elevation

`par.js:141-153` differences `gradeAt` over one `DS` = 2 m step into `θ = atan2(Δy, ds)`, and θ feeds
exactly three terms: `sinθ` (gravity in the forward/backward passes), `cosθ` (normal load in the
`μ·g·cosθ` corner envelope), and 3-D distance inflation. **There is no second-derivative term
anywhere in the oracle** — par does not model vertical curvature, so crest unloading, dip
compression, and the crest-while-turning combination are all outside what it prices (owner's point,
and it checks out against the code). Feeding par a finer Y series cannot change a number par derives
from it, because par only ever asks the series for a local slope.

### The disagreement is END-BAND, not a constant offset — measured 2026-08-03

⚠ **This corrects the "Observed" section above.** That section characterised the error as a per-run
constant offset (inferred from a comparison against `analyticHeight`). Comparing the two series
*directly* over 133 runs on seeds 6 / 1 / 42 shows a different and much more legible structure:

| where | \|Δelevation\| between the two series |
|---|---|
| run **interior** (>250 m from either end) | p50 **0.009 m** · p99 0.21 m · max 0.54 m |
| run **end bands** | p50 peak 5.9 m · p90 peak 13.7 m · **max 30.8 m** |
| end-band **width** (last point with \|Δ\| > 0.5 m) | p50 **36 m** · p90 96 m · p99 176 m · max 232 m |

33 of 266 run ends show no divergence at all. So: **away from the junctions the two series are the
same road to within centimetres.** All of the disagreement is the approach zone, where the later
pipeline stage reconciles each run onto the shared node/pad elevation its neighbours also have to
meet — earthwork the routed design polyline has not been told about yet.

That is why the measured par impact is small (`p50 0.61%`, `max 3.42%`, "Impact" above): the bands
are a minor fraction of a multi-kilometre run, **and they are exactly where par has already clamped
the reference truck to a junction speed cap** (`par.js:130-138`), so a grade error there buys little
time in either direction.

### Why the basis is sound rather than merely tolerable

FEAT-30 fitted `PAR_REF` (mu 0.90, accel 3.0, brake 7.0) against 20 labelled real drives **through
this same sampler**, so whatever systematic bias the end bands contribute is already absorbed into
the fitted reference. Par is calibrated end-to-end on this series. Switching it would invalidate that
fit and force a re-calibration plus a second `k` re-derive (FEAT-53 Phase D item 1) to buy a
difference par cannot express.

### This is a convention, and it is now a deliberate one

Two elevation series exist by design: **carve / ribbon / physics / GPS overlay read
`runProfile().gradeY`; par reads the routed polyline.** GPS was switched (FEAT-39) because it renders
*in world space* against the carved surface, where being 27 m out is fatal. Par integrates a local
slope, where the offset cancels and the end bands are speed-capped anyway.

### Re-open if any of these become true

- par gains a vertical-curvature term (crest unloading, jump detection, combined-load cresting) — at
  that point the elevation series stops being a convention and becomes a physical input;
- **the end bands widen into the run interior** — the drift alarm below is what tells you;
- anything player-facing puts a par-derived elevation next to a `runProfile`-derived one, where the
  two would visibly disagree.

## Acceptance — as closed

- [x] Owner decides: **keep the current basis**, reasoning recorded above (2026-08-03).
- [x] Drift alarm built — `test/mission-network.mjs` §7, on the live `RoadSystem` the gate already
      streams (no extra network build). Three checks, thresholds set with headroom over the measured
      envelope: interior agreement (`p99 < 0.5 m`, `max < 2.0 m`; measured 0.18 / 0.29 on seed 6),
      band width stays a junction phenomenon (`p99 ≤ 250 m`, `max ≤ 320 m`; measured 184 / 184), and
      band magnitude stays its measured size (`≤ 45 m`; measured 26.0). It asserts the **shape** of
      the disagreement, never agreement — a FAIL means *re-open BUG-41*, not *revert the carve*.
- [x] `gates.mjs` desc updated so the alarm is discoverable from the registry.
- ~~If switched: `runProfile`-backed `gradeAt` with an unstreamed-run fallback~~ — not switched.
- ~~If switched: re-run `test/calibrate-par.mjs` and re-derive `k`~~ — not switched.


---

# RE-OPENED 2026-09-05 — the alarm fired, and it is NOT the failure it was written to describe

`test/mission-network.mjs` §7 went RED: interior p99 **3.241 m** (licensed < 0.5), band p99
**400 m** (licensed ≤ 250). Per this ticket's own rule, that means re-open. Diagnosed the same
day; full evidence and the sequencing call:
`.planning/handoffs/HANDOFF-2026-09-05-BUG-41-diagnosed.md`.

**It is an ARC-DOMAIN bug, not an elevation one.** `edgeParData()` hands out a sampler
parameterised by `clArc` (the PRE-MERGE routed centerline arc) while the run's real geometry is
its polyline (`polyCum`). BUG-53/55/57 merge machinery re-seats a losing run onto the winner's
course (`offCurveSpans`), at which point the two domains come apart.

- Compared at matched XZ instead of matched `s`, the worst run's "disagreement" collapses from
  **3.156 m to 0.298 m**; the arc-domain offset reaches **17.3 m**.
- The 2026-08-03 premise still HOLDS on unmerged road — plain-road interior p99 **0.265 m**,
  inside the original bar. 100% of the drift is inside the merge spans. The ruling was not wrong;
  it predated machinery that re-seats runs.
- **The part that matters to the game:** `centerline.length` is `clArc`'s, so par prices a road
  SHORTER than the one driven — 11 of 51 runs off by 0.19%–**6.39%** (worst −46.5 m and −41.5 m).
  Par is the denominator of the FEAT-53 payout/rank scale, so this is an economy defect, not a
  cosmetic one.

The frontmatter's original warning stands and is now the crux: correcting this shifts par times.
The handoff's §1 lays out the three options (re-parameterise to `polyCum` and move all four
consumers; correct `.length` only; or something else) — the sampler's `clArc` was DELIBERATE
(BUG-53 kept it so existing `s` values stayed meaningful), so this is a domain change with
consumers in `par.js`, `mission.js`, `gps.js`, `poi.js`, not a typo fix.

**Prerequisite:** `mission-network`'s "registered centerline object" check is nondeterministic
run-to-run (30/38 then 27/34 on an unchanged tree) — make it deterministic first or you cannot
read your own result.

**Sequencing:** par-side, and par never feeds routing, so this parallelises safely with QUAL-28
on its own worktree. Do NOT take a carve-side fix — that changes geometry and would collide with
QUAL-28's character bar.

## Acceptance — re-opened

- [ ] Ruling on the three options in the handoff §1.
- [ ] `centerline.length` equals the true driven length on off-curve runs.
- [ ] `mission-network` §7's two failing BUG-41 checks green, the third still passing.
- [ ] The gate stops comparing two samplers at the same `s` without asserting the domains match.
- [ ] Par-time delta quantified and the `PAR_REF` / `k` fit checked against it.
