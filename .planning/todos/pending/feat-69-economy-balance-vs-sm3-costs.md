---
id: FEAT-69
type: feature
status: open
opened: 2026-08-18
severity: minor
source: FEAT-53 closure — Phase D item 2's original condition was never met and could not be
relates_to: >
  FEAT-53 (closed 2026-08-18 — the par re-anchor landed as its Phase D), SM-3 (the wear/repair
  costs this must balance against), SM-INV-14 (points economics shifted under it),
  run-shape.md "The mission count", src/economy.js dayTierTable, FEAT-28/SM-4 (the region index)
---

# FEAT-69: Balance the payout ramp against SM-3's real costs, and recount the run

FEAT-53's Phase D item 2 asked for `dayTierTable` + `rankDayLate` to be balanced **against real
multi-day runs**. `rankDayLate` was balanced (softened 7% → 3%, fitted to recorded drives) but
`dayTierTable` was deliberately **not touched**, because the thing it has to balance against —
SM-3's repair and maintenance costs — does not exist yet. Closing FEAT-53 on the re-anchor would
otherwise have buried this.

run-shape.md's own rule: *tier, rank ramp and cost escalation are ONE problem.* Two of the three
now have real numbers behind them. The third does not.

## What this owes

1. **`dayTierTable` against SM-3 costs.** The current curve (~×1.15/day to a ~5× asymptote) was
   authored before any repair bill existed. Whether it is right is unanswerable until they do.
2. **Recount the 27-point run budget.** SM-INV-14's wording (1 at B+, ½ at C, 0 at D) is unchanged
   but its *economics* moved: par is a C now, so a drive that used to earn a full point may earn
   half. Flagged provisional in `run-shape.md`; a first-order estimate over the 24-run corpus put
   17/20 drives still earning a full point, i.e. probably close for a competent player and harsher
   for a weak one — **an estimate, not a recount.**
3. **Multi-day run data.** Nobody has recorded a full 20-day run. Any ramp balance without one is
   modelling.

## Not blocked on, but worth folding in

- The **region multiplier** (FEAT-53) is inert until FEAT-28/SM-4 supplies a real region index —
  `EconomySystem`'s `getRegion` dep returns 1 today. Its curve (1 → 12) was solved against the
  owner's stated $5-15 → $500-1500 targets and should be re-checked once regions are real.
- Two owner-labelled "slow" drives sit **0.10 apart in ratio** and were labelled the same, which is
  par pricing two routes differently for the same felt pace. Recorded in `src/par.js`; needs more
  labelled runs before it is chaseable, and it is a par question rather than an economy one.

## Acceptance

- `dayTierTable` justified against actual SM-3 costs rather than an authored guess.
- The per-region point schedule recounted under the re-anchored letters, and `run-shape.md`'s
  provisional warning removed or replaced with the new number.
- At least one recorded multi-day run backing the ramp.
