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
