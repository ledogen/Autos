---
id: BUG-66
type: bug
status: pending
severity: low
opened: 2026-09-10
source: >
  seven of the eight road-clearance rows left on main @ 9bf4545 (2026-09-14). Six at promoted-T
  forks: seed 6 (−2799,450), lone-pine (−68,320), seed 3 (−4,1533), seed 7 (−182,933),
  seed 20 (−1258,1040), seed 11 (647,−647). One at a graph node with the same shape:
  seed 3 (1976,−889), 27.8 m over 16 m with 8 m of height.
---

# BUG-66 — a T side road leaving a trunk on a tall fill trips the clearance rule for 4–16 m

## What happens

Every remaining `road-clearance` row is a promoted-T pair (one key is a fork vertex): the side
road just past its departure band sits 24–28.3 m from the trunk while the rule asks 28.5 m,
because the two decks are 6–15 m apart in height — the trunk rides a fill or cut and the side road
has already dropped off it. Rows are 4–16 m long and 0.2–4.6 m short of the rule. Several of these
Ts shipped as `promote-residual` ("best available T — departure grade 34–41 % > cap"), so the
height split IS the steep departure the probe already condemned.

## Where the fix belongs

Not the throat (the geometric throat, owner ruling 2026-09-10, already exempts the junction's own
geometry — these rows start after the pavements have parted) and not the rule. The side road
should carry the trunk's deck a little longer before it drops — the FEAT-82 hold recovery exists
for graph nodes; a T fork has no hold (by FEAT-76 design). Either give the departure a short deck
hold sized by the height split, or let `_v2DepartureAccepts` price earthwork reach the way it
prices departure grade so the fork ranking prefers a station where the decks are closer.

## Prevalence (fresh windows, 2026-09-11)

Nine seeds the battery never sees (97 69 21 67 90 3301512992 1517161527 526302544 1625430154):
11 clearance rows, of which **6 are this shape** (fork keys, 4–8 m, 0.1–3.5 m short) and 2 more
are the graph-node variant with a large height split. So this is the dominant residue class
everywhere, not a battery artefact — about 0.7 rows per 1400 m window.

## Pictures

- Seed 7 (−182,933) overhead + plan drawing (the side road forking off the trunk's downhill edge
  into a gully): https://claude.ai/code/artifact/28c7b3aa-0137-44ec-a97d-a9b235a41ad2
- Seed 3 (1979,−874) then/now (was 18.6 m over 140 m on the 2026-09-08 branch, now 16 m):
  https://claude.ai/code/artifact/9e8d5edd-a7eb-4d97-aaa7-3539cbfe5a2e

## Rulings that bound the fix (owner 2026-09-14)

- `road-clearance` STAYS RED on these rows until they are fixed verifiably — no length threshold,
  no report-only ("true clearance is necessary to enforce, otherwise roads potentially intersect").
- The owner's eye: the rows look driveable ("maybe they technically violate on spacing"). The fix
  must not make the T worse to drive to satisfy the ruler.
- The geometric throat (2026-09-10) is applied to the GATE and the re-convergence test only; do not
  reach for it here — these rows start after the pavements have parted.

## Cost estimate

Measured planner stages on the seed 11 window (7.5 s build): a T probe is ~40 ms (40 per window),
a departure build ~3 ms, a profile solve ~2 ms. A short deck hold at T forks is one re-solve per
promoted T (~20 per window): well under 1 %. An earthwork term in `_v2DepartureAccepts` is a
polyline walk per candidate (~350 builds per window): also under 1 %.

## Acceptance

- [ ] `road-clearance` green across the battery (the seven rows above, and nothing new); the nine fresh windows above lose their 6+2 rows too
- [ ] `junction-stitch` green; `promoted-node-id` unchanged T count (19 core)

## State 2026-09-14 (feature/bug-65-66) — mechanism built, two rows left, neither is this shape

**Built: the ticket's second option.** `_v2DepartureAccepts` gained a third test, **B7 clearance**:
past the departure band and the junction's own geometric throat (`_v2ThroatLen` on the side, the
same walk on the trunk from P), the side road's BUILT deck — pinned to the trunk's deck at P and
re-solved, which is what ships — must clear the trunk under `_v2ClearReq`, judged exactly as the
gate measures (band ± 2 m and both throats exempt, nothing beyond 60 m of separation, and only the
MOUTH: the walk stops where the side first leaves the trunk's 60 m reach, so a mid-span pair's
second strand or a hug 400 m out is the plan layer's business, not this fork's). The candidate
prefilter in `_v2ForkCandidates` had judged the side's PURE profile there, pinned at its old node's
height — on a trunk riding a fill above a gully that is 6–15 m off what ships. A shortfall declines
like the grade and seam tests and ranks metre-for-metre with deck step in `_score`, so when nothing
clears the fork with the least earthwork conflict ships (a T still always beats no T).

Measured on the battery: six of the seven rows gone; six Ts moved 8–17 m along their trunks; shipped
departure grade (worst 12 m in the first 60 m of every T side, 76 → 77 sides) mean 23.4 % → 23.4 %,
max 39 % → 39 % — the T is not worse to drive for it. Nine fresh windows (origin, r 1400): 8 → 5
rows (3 of the T-mouth shape cleared; the two of the same shape left — seed 1625430154 (−899,694)
2.1 m short over 8 m and (−1686,1354) 0.1 m over 4 m — plus seed 90 and seed 526302544 which are
other classes, see BUG-65's resolution). 38/39 affected gates green; `junction-stitch`,
`promoted-node-id`, `restream-invariance`, `world-determinism` green.

**The two battery rows left, and why B7 does not reach them:**
- **lone-pine (−68,320)**, 28.3 vs 28.5 over 4 m, 60 m past the T at (−127,335): every fork station
  on that trunk carries the identical shortfall (traced: `_clearOver` 1.16 for all 12 candidates
  that build; the further stations are rejected by the prefilter for the same rule), because past
  the band the side runs on ITS OWN ROUTE, 24–28 m from the trunk for 60 m while diving at 38 % on
  5–7 m of its own fill. Moving the fork cannot change that line; a longer deck hold would put the
  side on a 15–20 m viaduct (own profile 14 m below the trunk surface at the parting point — measured
  on the probe). The lever is the ROUTE (the FEAT-77 second pass / QUAL-26 occupancy pricing), not
  the T.
- **seed 3 (1976,−889)**, 27.8 vs 28.5 over 16 m: NOT a junction mouth — it sits 470 m from the
  shared node 2,−1,2, where the two legs RE-CONVERGE to 27.8–28.2 m with 8 m of height. The ticket's
  "graph-node variant with the same shape" was a misread of the row; it is the re-convergence class
  (the 2026-09-10 cull rung's territory: its detour test or the mid-span planner), and B7 never
  sees it.

**Owner's call:** the T-mouth mechanism is closed; the gate stays red on these two rows under the
2026-09-14 ruling ("leave red or fix verifiably"). Closing this ticket against them would need either
a route-side fix (QUAL-26) or a ruling that a sub-metre apron shortfall over ≤ 16 m is inside the
carve's tolerance — neither is this ticket's to decide.
