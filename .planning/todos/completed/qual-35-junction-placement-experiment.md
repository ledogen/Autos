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

## Resolution (2026-11-07) — CLOSED, leave it

Owner, answering qual35-call: "1 — leave it". The idea moves to a post-alpha redesign ticket, FEAT-183, with the
owner's words: smarter node placement still worth pursuing as part of a big road-network redesign, plus suggested
speed limits through curves. BUG-104 no longer waits on this: it rides BUG-105's re-shaped trim (owner 11-07,
bug105-trim: every crossing without a junction is promoted to one, at any length).
