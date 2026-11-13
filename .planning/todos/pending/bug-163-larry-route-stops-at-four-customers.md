---
id: BUG-163
type: bug
status: open
severity: minor
opened: 2026-11-12
source: owner, 2026-11-11 inbox — "Larry doesn't seem to be offering more than four customers on the route"
relates: [BUG-134]
---
lane: Spare

# Larry never offers a paper route longer than four customers

## What

The owner's 2026-11-07 ruling on bug134-route was route sizes of **4 / 7 / 9 / 11 customers**. In play only
the 4-customer route appears. Check whether the larger sizes are gated (by rank, day, region reach) and never
unlock, or whether the roster cannot find enough customers in the alpha circle.

## Acceptance

- [ ] The cause named, with how often each size is offered over a sample of random seeds and days.
- [ ] 7 / 9 / 11 routes appear in a normal run, or the gate that holds them back is put to the owner.

## Findings (Spare, 2026-11-12) — not a supply bug; the FEAT-141 ladder holds 7 / 9 / 11 back

**Supply is fine.** Headless sample (`wip/bug-163/sample.mjs`, built as `test/paper-scenario.mjs` builds a story
region) over 8 random seeds — 975668289, 972785478, 471269853, 1021246684, 124748104, 318189386, 778635431,
156064081: every region was playable, had Larry, and held 11 customers; **every rung planned a full tour on 8 / 8**.

| rung | tours planned | distance (min – max) | par (min – max) |
|---|---|---|---|
| 4  | 8 / 8 | 1.0 – 2.9 km  | 1.6 – 3.8 min  |
| 7  | 8 / 8 | 4.1 – 5.8 km  | 5.7 – 9.2 min  |
| 9  | 8 / 8 | 4.9 – 9.0 km  | 6.9 – 13.0 min |
| 11 | 8 / 8 | 10.7 – 14.2 km | 14.7 – 19.0 min |

Day plays no part: nothing in the size path reads the clock.

**The cause is the ladder, a deliberate gate.** `PaperRouteSystem.sizes()` offers `tiers[0 … runPaper.tier]`, and
`runPaper.tier` only climbs when a **finished** round on the **top unlocked size** letters **B or better**
(`advancesTier`, FEAT-141, owner 2026-10-21) — elapsed ≤ 0.794 × par on the default thresholds. It is run-layer
(reset to 0 every run, SM-INV-12), saved and restored with the run. A C or D round, an unfinished round, or a
round on a smaller size never climbs. Nothing on Larry's card says this: the only mention is the result card
after the B ("Larry's giving you a bigger route — 7 houses next time"). So a run that never beats 0.794 × par on
the 4-house route sees only the 4.

Not removed (the brief: a deliberate gate goes to the owner). **Owner call:** keep the ladder and say it on Larry's
offer (e.g. "B or better on this route and Larry gives you 7 next") — recommended; or relax the climb to any
finished round (C); or drop the ladder and open every size from the start (as the FEAT-62 scenario already does).
