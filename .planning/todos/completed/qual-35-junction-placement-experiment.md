---
id: QUAL-35
type: quality
status: closed (leave it)
opened: 2026-11-06
severity: minor
source: owner request 2026-11-06 (orchestrator conversation, after the BUG-105 cost review)
relates_to: BUG-105 (graze forecast — the repair this would replace), BUG-69 (stacked legs of one junction,
  25 spots in 140 windows), FEAT-76 (wye→T promotion — a post-hoc junction off the site),
  QUAL-26 (sibling clearance — banked), QUAL-21 (stroke routing — REJECTED, do not prescribe headings),
  QUAL-19 (heading gate — DISPROVEN), QUAL-22 (topology from cost — deleted untested)
blocked_by: nothing (phase 0 is measure-only, no src/ change)
---

# QUAL-35: Junctions placed by cost, not pinned to sites — the Spare-lane experiment

## The idea

Today every graph node of degree ≥ 3 is a junction ON its site, and each Urquhart edge routes alone between two
sites. Junctions off a site exist only as repairs after routing: the wye (two legs leaving one site the same way
share a trunk), FEAT-76's T promotion at the fork, and BUG-105's "will a T own this pair?" forecast, which was
27.5 % of the network thread before its memo.

The proposal: sites stay waypoints that roads must pass through, but the junction goes where the cost says. In a
length-optimal network no two legs leave a point less than 120° apart, so two legs running side by side out of one
site (BUG-105's leftovers, BUG-69's stacked legs) cannot form: they merge into one trunk and split at a junction
further out. Keep the Urquhart graph for WHICH places connect (it carries the loops); optimise only WHERE the
junctions sit.

## Owner rulings (2026-11-06, verbatim)

- "I don't care about two T's being preferred to a crossroads. A lot of forest B roads also prefer T's to
  crossroads. It would be nice to combine close tees as you suggested."
  → Twin Ts are fine. Close Ts should merge: a fixed cost per junction (or a minimum junction spacing) is the knob.
- "I'm all about the spare lane experiment. The biggest fear I have is reverifying feel, catching edge cases, and
  otherwise re-going-through the optimization checklist that we have been running on the road network for months
  already if enough changes."
  → The experiment's FIRST output is that bill: how much of the world would change.

## Phase 0 — measure only (no src/ change)

Headless, in `wip/qual-35/`, reading the real plan layer through `RoadSystem` the way `wip/bug-105/census.mjs`
does. Run on the BUG-105 census set (140 random-seed windows). Never on seed 6 alone.

Placement (the simplest thing that answers the question; Spare may pick better):
- For each graph node of degree ≥ 3, a coarse cost field (10–20 m grid) from each leg's far end, using the router's
  own per-metre length + grade terms. Sum the fields; the junction goes where the sum is lowest. No curvature term
  in the field: say so in the results, it is an approximation.
- A junction moves only when it saves more than a threshold; otherwise it stays on its site, byte-identical.
  Report at 2–3 thresholds so the owner sees benefit against bill.
- Close Ts: adjacent degree-≥3 junctions under a spacing D (try 40 / 60 / 80 m) merge.

Held fixed: the router and its cost model (cTurn 45 / wGrade 180, ratified), the profile solve, carve, pads,
causeways, the T rules. Do not prescribe headings (QUAL-21). The only thing that changes is where a junction sits.

Report, in this order:
1. **The bill.** Junctions moved > 5 / > 20 / > 50 m and the share unchanged; road km touched (legs ending at a moved
   junction) as a share of the total; windows touched out of 140.
2. **What it absorbs.** Of today's GRAZE leftovers (4), BUG-69 stacked legs (25), wyes, T promotions and close-T
   pairs: how many sit at a junction that moves.
3. **What it would delete.** The repair functions that go dead if adopted (wye / promotion / forecast / …), by name
   and line count.
4. **Time.** Placement ms per window against today's network-thread split (`wip/perf-31/`).
5. **Window invariance.** Is one round (each junction from its own legs only) a pure local function? Do adjacent
   junctions couple, and what margin would that need?
6. **A screenshot sheet** on random seeds: before/after at the 10 biggest movers and 5 typical ones.

7. **Conclusion: the full-redesign view.** Owner, 2026-11-06, verbatim: "Once Spare is finished with the
   experiment, have it conclude by presenting its thoughts on a full network redesign where nodes become just points
   along roads and junction locations are optimized versus nodes being locations where junctions are forced
   (current) It should have a little more context on which to... ...decide the value of that fix and additional
   caveats." Write it from what phase 0’s numbers showed: the value, the caveats, and what a flagged prototype
   would take to build and to test against today's criteria. Those criteria are the road gates (about 25 of the 30
   are invariants any network must meet; `wye-release` and `promoted-node-id` pin today's repairs), the census and
   the PERF-27 benches. Plain language: the owner reads it to decide.

**Stop there.** The results and the sheet go to the orchestrator, which puts them in front of the owner. Nothing
touches `src/` until the owner rules.

## If adopted — what re-verification costs

- Automated, re-runs for free: a `road.js` change triggers 60 of 131 gates (30 road-specific); the 140-window census
  (GRAZE and the rest); `fingerprint-world` names exactly which windows changed; the window-invariance gates.
- Per-metre road feel is set by the router and its cost model, which do not change. What changes is junction
  layout, so the eyes-only checks (junction look, pad shape, feel through the junction) concentrate on the moved
  junctions, and the threshold bounds how many there are.
- Downstream systems (pads, carve, causeways, stitching) take a junction position as input and do not care where it
  came from. The repairs that become dead get deleted, not retuned.

## Work log

**2026-11-06, Spare: method and tools (`wip/qual-35/`, git-invisible).**
- `place.mjs`: the census windows built as the game builds them (pond no-go, 1400 m). For every plan node of degree
  ≥ 3 whose site lies in the window, ground-following cost fields on a world-aligned 12 m grid, 16-neighbour, step cost
  `ds·(1 + wGrade·g²)` on the corridor's own height field, pond+skirt discs blocked: one from each leg's far end, one
  from the site. **The site stays on the network.** A set M of 2 to n−1 legs leaves the site down one shared trunk to a
  junction J and splits there; the other legs still start at the site. J minimises `Σ_{i∈M} F_i + F_site`; the saving
  is that sum at the site (today's cost of those legs) minus its minimum. With |M| = n−1 the site becomes a bend on a
  through road; with fewer it keeps a T of its own (twin Ts). J must lie nearer its own site than any far end (and
  ≥ 60 m from one), so the Urquhart graph still decides which sites connect. One move per site (a 4-way that would
  split into two pairs takes the better pair only).
- **The field is checked against the router** (`calib.mjs`, seed 6, 119 legs): field cost / the corridor search's own
  cost with the turn term off has median 1.02 and 10–90 % range 0.88–1.21. A fair stand-in, minus curvature.
- `report.mjs` (bill, absorbs, coupling, time; today's leftovers from BUG-105's census 10), `invariance.mjs` (one seed,
  two window centres, every shared node must place identically), `sheet-data.mjs` + `gen-page.mjs` (plan-view maps:
  today's roads, today's lines of the merging legs, the router's own lines from J; no plan-layer passes).
- Early signal, one 600 m window of seed 6 (a smoke run, not a result): all 3 nodes move 260–320 m, each saving
  1 000–3 700 cost-m: legs climbing over the same ridge side by side, merged into one crossing.
- Waiting on the orchestrator's GO (machine hold for the owner's playtest).

## Phase 0 result (Spare, 2026-11-06) — measured; recommendation: leave it

**Page:** https://claude.ai/artifact/H96gBEYDd85r4jZPiz97G4: the report, bill first; the full-redesign view (item 7);
15 maps (10 biggest movers + 5 typical, random seeds, T = 500), with the router's own lines from the new junction.
**Data:** `wip/qual-35/out/` (`report.txt`, `report.json`, `*.jsonl`); the first pass is kept in `out-v1/` (timing and
invariance). Tools: `place.mjs`, `report.mjs`, `split.mjs` (thread split), `sheet-data.mjs`, `gen-page.mjs`,
`prose.html`.

140 census windows (all127 + battery), 1,439 junction sites (degree ≥ 3), 5,354 km.

| saves more than (cost-m) | 100 | 500 | 1,000 |
|---|---|---|---|
| junctions moved | 1,402 (97 %) | 1,047 (73 %) | 571 (40 %) |
| median move | 261 m | 278 m | 296 m |
| road re-routed | 1,855 km (35 %) | 1,498 km (28 %) | 908 km (17 %) |
| windows touched / 140 | 140 | 140 | 139 |
| slides (today's routes / field's unmerged lines) | 24 / 202 | 9 / 124 | 2 / 54 |
| GRAZE absorbed / 4 | 2 | 1 | 0 |
| BUG-69 absorbed / 25 | 3 | 2 | 2 |
| planned wyes absorbed / 1,613 | 337 | 266 | 134 |
| bridges 1,478 → | 1,483 | 1,481 | 1,481 |
| sites off a loop | 5 | 3 | 3 |
| ridge crossings on merging legs, fair (field unmerged → merged) | 801 → 427 | 661 → 332 | 425 → 212 |
| saving, share of junction-leg cost | 15.0 % | 13.9 % | 10.3 % |
| coupled legs (both ends move + re-route) | 511 / 2,375 | 292 / 1,881 | 118 / 1,090 |

- **Time** (`split.mjs`, 13 battery windows, one process): placement 556 ms median against the network thread's
  1,673 ms (= build 7,292 − routing 5,202). That is 32 % (15–58 %), on the critical path before routing; per-site
  independent, so the route pool could take it.
- **Invariance:** 3 seeds at dx = 700 m, 13 of 13 shared junctions identical.
- **Close Ts:** no twin-T move lands within D (40/60/80) of its site; 4/8/9 new close pairs at T = 500.
- **Deletes:** nothing at this absorption (inventory in the page, section 3).
- **BUG-105 sites 24/25:** degree-2 sites (bends), out of scope here; visiting the site costs +2,032 / +2,922
  cost-m over going straight past. The owner's loop trim is the fix; it comes next.
- **Measurement note:** the raw "today vs field" crossings (1,980 → 332) overstate the loss. Today's roads cut and
  bore where a ground-following line goes round, so the fair column uses the field on both sides.

**Owner's call:**
1. leave (recommended);
2. a flagged prototype, slides only;
3. a flagged prototype at T = 1,000.

## Resolution (2026-11-07) — CLOSED, leave it

Owner, answering qual35-call: "1 — leave it". The idea moves to a post-alpha redesign ticket, FEAT-183, with the
owner's words: smarter node placement still worth pursuing as part of a big road-network redesign, plus suggested
speed limits through curves. BUG-104 no longer waits on this: it rides BUG-105's re-shaped trim (owner 11-07,
bug105-trim: every crossing without a junction is promoted to one, at any length).
