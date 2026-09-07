---
id: BUG-41
type: bug
status: closed
opened: 2026-08-02
closed: 2026-09-07   # first closed 2026-08-03 as WONTFIX; re-opened 2026-09-05; all three stages done
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

---

# FIX DIRECTION (owner, 2026-09-06) — this ticket now carries the WHOLE par correction

The owner clarified the origin of the request: *"the old one after par reanchor was pretty much
perfect and we should seek to replicate it"* was about the **driven par-time feel**, not road
character — *"we reanchored par well and want to recreate that par generator on the new router."*
(QUAL-28/29 misread it as a road-character target and chased that instead; see QUAL-29's CORRECTION
section. No road change came of it and none is owed.)

So the ask is not just "fix the arc-domain bug". It is **par, end to end, correct on v2**. Three
stages, and **the order is forced** — do not reorder them.

## Stage 1 — fix what par MEASURES (the arc-domain bug, this ticket's original body)

Everything above. Ruling still needed on the handoff §1 options: re-parameterise the sampler onto
`polyCum` and move all four consumers (`par.js`, `mission.js`, `gps.js`, `poi.js`), correct
`.length` alone, or something else. The `clArc` domain was deliberate (BUG-53 preserved it so
existing `s` values kept meaning what they meant), so this is a domain change, not a typo fix.

Prerequisite is **already done**: `25a7aa3` made `mission-network` deterministic so it can referee
its own fix.

## Stage 2 — fix what par ASSUMES (re-anchor `PAR_REF` on v2 roads)

**`PAR_REF` has never been anchored on the roads it now prices.** The dates are unambiguous:

| | date |
|---|---|
| `PAR_REF` pass (4), THE re-anchor (`src/par.js`) | **2026-08-16** |
| router v2 takes over the full network (`7cff01d`) | **2026-08-18** |
| every labelled drive in `runs/*.json` (30 files) | Jul 21 – **Aug 18** |

So `mu: 0.80` / `accel: 3.0` / `brake: 7.0` were fitted against human drives on **v1 roads**, and v2
shipped two days later with measurably different geometry — QUAL-28 measured it as straighter
(10.4 % vs 5.2 % of length in >200 m straights), a third the switchbacks (17 vs 52), and a shifted
turn-radius distribution. Par's dominant dial is `mu`, i.e. CORNER SPEED, and v2 changed the corners.
This is the actual "recreate that par generator on the new router" work.

**Method:** unchanged from FEAT-30 — record drives, label each with the subjective felt class on the
mission result card, export, `node test/calibrate-par.mjs [runsDir]`. Two things to respect:

- **Record into a NEW directory, not `runs/`.** The v1 corpus must stay intact as the historical
  record of the anchor being replicated, and it must not be averaged into a v2 fit.
- **More drives is the single biggest quality lever.** The harness's own health warning on the
  existing corpus: 20 runs give *"a hint, not a fit"*, and the felt labels were *"partly INVERTED
  against the clock"*. If the point is to re-anchor as well as it was anchored, the corpus is where
  that is won or lost — not in the sweep.

`mu` is OWNER-SET, not fitted (`calibrate-par.mjs` method note 3) — the script's recommendation is
advisory. The re-anchor is a ruling informed by numbers, exactly like the 2026-08-16 one.

## Stage 3 — fix what par PAYS (re-derive FEAT-53 `k`)

Par is the denominator of the payout/rank scale. Stages 1 and 2 both move par times, so `k` must be
re-derived after them, not between them. Precedent: `30544cb`. The frontmatter's original warning —
*"correcting this shifts every par time"* — is discharged here, once, rather than twice.

## Why the order cannot change

Calibration fits `PAR_REF` so a felt-par drive lands on a target ratio. If route length is still
systematically short by up to 6.39 % on merged runs, the fit has to absorb that error somewhere, and
the only places it can go are `mu` / `accel` / `brake` — turning a design constant into a fudge
factor for a geometry bug, in the exact way pass (3) and pass (4) both had to unwind. **Fix what par
measures, then fit how fast it thinks you go, then price it.**

Corollary: do not judge Stage 1 by whether par times "feel right" afterwards. They will not — the
anchor is still v1's at that point. Stage 1 is judged on geometry (does `.length` equal the driven
length) and Stage 2 on feel.

## Sequencing

**Parallel with FEAT-76** (owner, 2026-09-06). Par never feeds routing, so the two share no code —
FEAT-76 is corridor/plan-layer, this is the par/mission consumer side. Own worktree.

Do NOT take a carve-side fix for Stage 1: that changes geometry, and geometry is FEAT-76's subject.

---

# STAGE 1 — BUILT 2026-09-06 (`feature/bug41`, worktree `CarGame-bug41`)

## The ruling: (a), re-parameterise onto `polyCum`

Owner, 2026-09-06. Two findings made (b) untenable — the codebase had already moved to `polyCum`
everywhere else, and the split domain was causing a second, unmeasured defect:

- `_buildRunProfile` (`src/road.js`) accumulates `arcPos` from the actual XZ segment lengths of
  `points`, so `runProfile` — and therefore the carve, ribbon and physics — is `polyCum`-domain.
- Every span record (`cededSpans` / `offCurveSpans` / `departureSpans`) is built from `polyCum`.
- `edgeParData` was the **only** remaining `clArc` speaker. This was a correction toward the
  existing convention, not a new one.
- **`arcOrigin` is 0.000 on all 52 runs**, so `runProfile`'s domain equals `polyCum` exactly. There
  is now an explicit throw if that ever stops being true, rather than a silent re-introduction.

## What shipped

`edgeParData` returns ONE arc domain throughout, and it is the run's driven arc. Merged run →
`polyCum` for both the point sampler and the grade sampler. Plain run → the analytic centerline is
kept: measured, its length matches `clArc`'s end **exactly**, `polyCum` agrees to 0.040% worst case,
and its `curvatureAt` is exact where a sampler's ±3 m finite difference is not. Par integrates
curvature as its dominant term, so unifying that would have smeared all 42 plain runs to buy 0.04%.

**A second live defect fell out of the same cause.** `poi.js` compared an `s` from the `clArc`
sampler against `polyCum`-domain `cededSpans` through a ±20 m tolerance — against an error up to
33 m. That is the guard stopping a lay-by pad being seated on ceded road (the winner's pavement), so
it could seat a pad where the winner's own edge also seats one. Same-domain now.

### Measured, seed 6 @ (4500,600), `MISSION_PLAN_RADIUS`

| | n | p50 | p90 | max |
|---|---|---|---|---|
| plain runs, `polyCum` vs `clArc` | 42 | 0.005% | 0.022% | 0.040% (0.39 m) |
| off-curve runs | 10 | 2.10% | 6.80% | **6.80% (33.3 m)** |

`mission-network` §7, before → after: interior p99 **3.241 → 0.045 m**, interior max 4.713 → 0.050,
band p99 **400 → 152 m**, peak 6.49 → 3.59 m. All four checks green (the fourth is the new domain
assertion). Most of what read as "junction end band" divergence was the arc offset.

## Par-time delta — the Stage 3 input

10 affected runs of 52. Distance −2.02% … **+7.15%**. Par time −2.14% … +2.04%, median |Δ| **1.04%**.

Par moves less than distance and sometimes opposite it (`g:7,-1,0:6,0,0`: distance +7.15%, par
−2.09%). That is correct, not an anomaly: `curvatureAt` is `Δangle / 2h` with `h` in arc units, so
spreading the same bend over its true longer arc gives genuinely gentler curvature per metre and a
higher corner-speed envelope. **Do not treat these as final Stage 3 numbers** — they are one seed,
and FEAT-76 will move the merge set (handoff §4).

## Gate work

- §7 rewritten. It asserted a WONTFIX shape that no longer holds; it now asserts the domains match
  FIRST (per run, `|par length − driven length| < 0.5 m`) and only then compares elevations. The
  old form compared two samplers at the same `s` without checking `s` meant the same thing in each,
  which is precisely how this went unnoticed.
- §2's centerline-identity check fixed — **same root cause, not a new one**. It asserted object
  identity with the registered centerline, but BUG-53 deliberately hands merged runs a sampler
  because their registered primitive is stale. It sat at a permanent 33/39 (all 6 misses off-curve,
  0 plain): testing the wrong property, not catching a defect. Now identity for plain runs, and
  geometric tracking of the registered polyline for merged ones.

## Gate movement across the whole suite

`npm test` (37 affected gates): **33/37 green**. Failures are `junction-stitch`, `mission-network`,
`paper-tour`, `pond-route-around` — exactly the standing-red set the handoff §5 predicted, with two
of them REDUCED. Nothing new went red. `story-poi` and `world-determinism` are unchanged (11 viable
pads, roster 11/14, byte-identical rebuilds), so POI placement is still seed-pure.

| gate | main | after Stage 1 |
|---|---|---|
| `mission-network` | 4 FAIL | **1 FAIL** (stale §0 only, see below) |
| `paper-tour` | 2 FAIL | **1 FAIL** (SM-INV-12 only) |
| `par-oracle` | PASS | PASS (SM-INV-2 holds) |

### `paper-tour`'s par-growth failure was OURS, and it is fixed

This corrects the handoff §6, which attributed BOTH paper-tour failures to one cause (tier 3 dropping
a tier-2 customer, SM-INV-12). Only one of them was. The other — *"par grows with the route"*,
failing at **78 → 661 → 655 → 979** — was this ticket's arc-domain bug: tier 3's route was being
measured short. With the driven arc it reads **144 → 631 → 796 → 950**, monotonic, and the check
passes. Tier 3 is 12.81 km against tier 2's 10.47 km, i.e. genuinely longer, which is what the
invariant was trying to say all along.

The SM-INV-12 drop (`house:7,2,1|7,3,0:3`) is real, unchanged, and still the owner's call.

### Expected ripple: POI/route content moves on merged runs

Correcting the arc moves `L` and the ceded-span guard in `poi.js`, so house and pad sites shift on
the 10 merged runs, which changes paper-route customer sets and therefore routes (tier 1 0.84 →
2.11 km). That is the intended consequence of the ruling, not a side effect to be suppressed: those
sites were previously placed against an arc that did not describe the road. `poi.js` reads the graph
and writes nothing back, so **routing is untouched and the FEAT-76 parallelism still holds**.

## STILL RED, and NOT this ticket

`mission-network` §0 — *"no routed-geometry cull exists"* — fails at 2/26 (8%) culled, identically
on `main` and here. It asserts `culled === 0` on the FEAT-68 (2026-08-19) premise that the routed-
geometry culls were deleted. BUG-57's keep-the-connection ladder later re-introduced a **delete
last-resort**, so a non-zero cull share is now correct behaviour and the control is stale. That is
router/crossing territory (BUG-57), not par — same shape as `pond-route-around`'s NON-VACUOUS
control. **Do not delete it**; re-express it for the post-BUG-57 world. Until then `mission-network`
stays on the standing-reds list for that one check, which the Stage-1 acceptance did not anticipate.

## Not started

Stages 2 and 3. Stage 2 is gated on a labelled corpus of recorded drives on v2 roads — owner work,
into a NEW directory, `runs/` left intact.

---

# CLOSED 2026-09-07 — all three stages done, two of them by ruling

Merged to main as **`4b42ef4`**. Handoff: `.planning/handoffs/HANDOFF-2026-09-06-BUG-41-merge.md`.

| stage | outcome |
|---|---|
| 1 — what par MEASURES | **fixed.** `edgeParData` re-parameterised onto `polyCum`, the driven arc. |
| 2 — what par ASSUMES | **measured, ratified unchanged.** `PAR_REF` pass (5). |
| 3 — what par PAYS | **ruled no change.** `k` stays 0.30. |

The shape of the answer is worth keeping: the bug was real and the fix was real, but *neither*
constant it threatened turned out to need moving. Par was measuring the wrong road; once it measured
the right one, the v1-fitted reference and the v1-derived `k` were both still correct.

## The last standing red went with it

`mission-network` §0 was **re-expressed, not deleted** (2026-09-07), and the gate is now FULLY GREEN
— the first time since FEAT-68. It had been wrong twice in opposite directions:

- it asserted `culled === 0` on FEAT-68's premise that the routed-geometry culls were deleted;
- BUG-57's keep-the-connection ladder re-added a DELETE last-resort, making non-zero correct again;
- then FEAT-76 made it worse for a reason that was not culling at all. **Measured: of 7 "culled"
  edges, 5 were merely SPLIT** — promoting a wye to a real T turns run A–B into A–P and P–B, so the
  site-pair key disappears while the road is entirely there. Only **2 of 26** were genuinely absent,
  which is exactly the pre-FEAT-76 reading.

It now measures **presence of the CONNECTION, not of a key**, and asserts that a gap EXISTS (which
is what makes §1's "missions route only over the registered network" non-vacuous) with a 40% ceiling
to catch a return of the pre-FEAT-68 shredding. An edge counts as built if its endpoints are joined
through **inserted nodes**, defined as *"a node the raw graph does not have"* rather than FEAT-76's
`k === -1` encoding — deliberately, so the next node-inserting feature needs no change here and this
does not drift a fourth time.

## Nothing left on the table

Everything the re-opened ticket asked for is ticked. Two things were found ALONGSIDE and are neither
owed nor forgotten:

- **`paper-tour`'s SM-INV-12 customer drop** (`house:7,2,1|7,3,0:3`, tier 3 dropping a tier-2
  customer) — a design-invariant question, always the owner's, and separately fixed on
  `feature/red-gates` 2026-09-06.
- **The v2 corpus is a hint, not a fit.** `runs-v2/` holds 12 runs / 11 fittable against
  calibrate-par's own "20 is a hint, not a fit" bar. Pass (5) ratifies rather than proves, and says
  so. If the corpus grows past 20, re-run `node test/calibrate-par.mjs runs-v2` — `on par` is the
  anchor label, `slow`/`very_slow` the thinnest. That is an OPTION, not a debt.

## Acceptance — re-opened, and expanded 2026-09-06

**Stage 1 — the domain fix** — BUILT 2026-09-06 on `feature/bug41`

- [x] Ruling on the three options in the handoff §1 — **(a)**, owner, 2026-09-06. See STAGE 1 below.
- [x] `centerline.length` equals the true driven length on off-curve runs.
- [x] `mission-network` §7's two failing BUG-41 checks green, the third still passing.
- [x] The gate stops comparing two samplers at the same `s` without asserting the domains match.
- [x] Par-time delta quantified — the headline number for Stage 3 (seed 6; re-measure across seeds
      when Stage 3 is actually taken, and after FEAT-76 moves the merge set).
- [x] All `clArc` consumers audited — **five, not four**: the handoff missed `paper-route.js`.

**Stage 2 — the v2 re-anchor** — corpus STARTED 2026-09-06, not yet fittable

- [x] A v2-road labelled corpus recorded in its own directory; `runs/` left untouched.
      `runs-v2/` (+ README), 9 runs, seeds 97/69. `runs/` verified untouched at 30 json.
      Every run carries a **`road_router`** flag so the split survives files moving — stamped at
      capture from `road.js ROAD_ROUTER_VERSION`, backfilled at import for older exports.
      `runs-add.mjs` / `runs-report.mjs` took a `--dir=` target (both were hardcoded to `runs/`,
      which would have dumped the v2 corpus straight into the v1 one).
- [x] Corpus size stated, and stated honestly against the harness's "20 is a hint, not a fit" bar.
      **8 fittable (1 of the 9 is a paper round, never fitted with point-to-point jobs). Well under
      the bar.** `runs-report` declines to call it: it wants ≥3 `on par` runs and there is **1**.
      `calibrate-par.mjs runs-v2` recommends mu 0.615 / accel 3.2 / brake 6.5 (loss 0.1647 vs
      0.1773 at the shipped 0.80/3.0/7.0) — **NOT taken.** mu is owner-set and this is n=8 with the
      single `par` run scoring 0.969, the slowest of all eight, which is what n=1 looks like.
      More `on par` drives are the gating need; the ordering elsewhere is already sane.
- [x] `calibrate-par.mjs` run on it; the recommendation recorded alongside the owner's ruling on
      `mu` (advisory, not authoritative — `mu` is owner-set).
      Recommended mu 0.77 / accel 3.2 / brake 5.5 (loss 0.1897 vs 0.1957 shipped). **DECLINED**,
      owner 2026-09-06: the mu loss surface is flat (0.74→0.1901, 0.78→0.1897, 0.82→0.1910) so the
      corpus barely identifies mu and 0.80 is inside the band; and brake 5.5 is the value pass (3)
      rejected as under-pricing corner entry when it moved to the measured 7.0.
- [x] `PAR_REF` updated with a pass (5) comment block in `src/par.js` matching the style of passes
      (1)-(4): what moved, why, and what it was measured against.
      **Nothing moved.** Pass (5) RATIFIES mu 0.80 / accel 3.0 / brake 7.0 as already correct on v2
      roads: the four felt-par drives land at mean ratio 0.879 against the ~0.88 target, and
      `runs-report`'s verdict is "the standard is well calibrated on 'felt on par' runs". v2 changed
      the corners; the constants did not need to change with them.
- [x] `par-oracle` gate green — SM-INV-2 still holds (par bit-identical before/after mutating
      vehicle params).

**Stage 3 — the economy** — the only stage left; Stage 2 contributed NO par shift

- [x] FEAT-53 `k` re-derived against the new par, once, after both stages.
      **RULED: no change** (owner, 2026-09-07) — *"I'm happy with the k value."* Stage 2 ratified
      `PAR_REF` unchanged, so `k` only ever had to absorb Stage 1, and FEAT-76 shrank that to a
      median par shift of **0.40%** (worst distance +2.37%) on 9 of 60 runs. Below the noise a
      re-derive would resolve. `k` = 0.30 stands, undisturbed since `30544cb`.
      Scope is now Stage 1's shift ALONE (median |Δ| 1.04%, max +7.15% distance on 10 of 52 runs),
      because Stage 2 ratified PAR_REF unchanged and therefore moved no par times.
- [x] Rank-threshold sanity check: the letter bands still mean what DESIGN.md says they mean.
      `par.js RANK_THRESHOLDS_DEFAULT = { S: 0.72, A: 0.76, B: 0.80, C: 1.00 }` matches DESIGN.md
      verbatim ("S 0.72 · A 0.76 · B 0.80 · **C 1.00 pinned on every day**"). A 0.40% par shift
      moves ratios, not meanings: C = 1.00 still IS par, i.e. the C/D boundary and the slowest
      passing drive, which is what the 2026-08-16 re-anchor made it mean.

**Throughout**

- [x] `npm run test:all` no worse than the documented standing reds — and `mission-network` is
      expected to LEAVE that list, since its §7 failure is this ticket.
