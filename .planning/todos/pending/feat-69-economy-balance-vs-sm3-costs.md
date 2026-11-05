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

## Moved in from FEAT-54 (2026-10-12)

- [ ] **Repairs need a time cost alongside the money cost**, applied as a clock skip (the
      shops/service/camp pause ruling, run-shape.md). Price the time with the money.

## Amended 2026-10-14 (owner) — what this now balances

design-amendments-2026-10-14.md §12–15 change the problem:

- **Pay no longer rides `dayTier`** (FEAT-117). `dayTierTable` now scales **costs only**: the day's
  cost anchor, repairs, gas and parts. The 2026-10-12 difficulty knobs scale that growth.
- **Pay grows with the region step × a capped regional reputation** (FEAT-117). Solve the cap, the
  points to reach it, the day-1 cost share `c₀` and the daily cost growth `g` so each region pays for
  itself for about its planned length, then gets tight.
- **Run shape for alpha: three regions, provisionally 7 / 6 / 5 days** (supersedes ~12–14 days).
  Recount the point budget against it.
- **Re-solve `regionMult` for three regions** (it is solved for six). The step must cover the cost
  growth since the run began and still be a raise over the old region at full reputation.
- ~~Parts are priced by the furthest region unlocked (§11), so their prices follow the region step,
  scaled by the upgrade/item-cost knob.~~ **Retired 2026-10-21 (owner):** parts scale with the clock
  (`dayTier`) like every other cost, times the upgrade/item-cost knob. No region term.

## Owner, 2026-11-05 (page inbox) — more spread between S and D

"relevant to rebalancing: i think we want more spread between S and D times S is about right maybe slightly too
challenging, C should be accessible at a much more forgiving time (+10%-20%). just add it to the ticket for now"

**A conflict to resolve when this is built:** C is pinned at exactly par (ratio 1.00) in every region, because par
is the pass line by definition (the 2026-08-16 re-anchor), and `tipZero` is solved from it. Moving C to 1.10–1.20
breaks that. The clean way that keeps it: raise `PAR_SLACK` 1.15 → ~1.32–1.38, so par itself sits 15–20 % later,
and pull S/A/B down as ratios so S's absolute time barely moves (S 0.77 → ~0.66; "maybe slightly too challenging"
→ a touch easier still). The owner rules on which, with numbers, at build time.

**Measured options (Lane B, 2026-11-05; nothing shipped changed).** The day-1 average region-1 job: today par
180 s, so its reference drive is 180 / 1.15 = 156.5 s. Rules used in every option:
- S's absolute time is held at 138.6 s.
- A and B keep their place in the S→C gap (A 17 %, B 43 % of the way from S to C), so the spread grows evenly.
- `fullTipRatio` stays = S and `tipZero` = 2 − S (both gated today), so par still earns half the tip.
- `k` is rescaled by 1.15 / slack, so the average job still pays $5 base and $10 max (the owner's day-1 anchors).

| `PAR_SLACK` | S / A / B ratios | S | A | B | C (= par) | base pay only from |
|---|---|---|---|---|---|---|
| 1.15 (today) | 0.770 / 0.810 / 0.870 | 138.6 s | 145.8 s | 156.6 s | 180.0 s | 221 s |
| 1.27 | 0.697 / 0.750 / 0.829 | 138.6 s | 149.1 s (+2 %) | 164.8 s (+5 %) | 198.8 s (+10 %) | 259 s |
| 1.32 | 0.671 / 0.728 / 0.814 | 138.6 s | 150.4 s (+3 %) | 168.2 s (+7 %) | 206.6 s (+15 %) | 275 s |
| 1.38 | 0.642 / 0.704 / 0.797 | 138.6 s | 152.1 s (+4 %) | 172.3 s (+10 %) | 216.0 s (+20 %) | 293 s |

Pay at each letter's line is the SAME in every option: S $10.00 · A $9.57 · B $8.91 · C $7.50 · D floor
$5.00. The tip is linear in time between S and C, and both ends are held, so only the times move. What
changes is the pay for a given drive time, because the tip runs out later:

| drive time | 150 s | 160 s | 170 s | 180 s | 190 s | 200 s | 210 s |
|---|---|---|---|---|---|---|---|
| 1.15 (today) | $9.31 | $8.71 | $8.10 | $7.50 | $6.90 | $6.29 | $5.69 |
| 1.27 | $9.53 | $9.11 | $8.70 | $8.28 | $7.86 | $7.45 | $7.03 |
| 1.32 | $9.58 | $9.21 | $8.85 | $8.48 | $8.11 | $7.74 | $7.38 |
| 1.38 | $9.63 | $9.31 | $8.99 | $8.66 | $8.34 | $8.02 | $7.69 |

If `k` is NOT rescaled, par grows and every dollar above grows with it: ×1.10 / ×1.15 / ×1.20 (1.38 gives a
$6 base and a $12 max on the average job).

Knock-on effects to weigh:
- B moves 5–10 % later, so more drives earn a whole deed. FEAT-168 sized the 12-day run (10 deeds) on
  today's lines.
- Everything priced off par grows by the same factor: offer deadlines, the papers deadline (par × 1.5),
  and haul and freight pars.
- Gate pins to re-express: region 1's time row == par.js `RANK_THRESHOLDS_DEFAULT`, and "S at or above the
  best honest drive, ratio 0.740". In absolute time that drive is 133 s, still faster than S's 138.6 s.
