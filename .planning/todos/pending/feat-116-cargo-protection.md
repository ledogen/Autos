---
id: FEAT-116
type: feature
status: open
severity: minor
opened: 2026-10-14
source: owner, 2026-10-12 / 2026-10-14 — "For fragile maybe we can replace the straps with
  shock-absorbing pads or a furniture blanket." 2026-10-14: "All damage threshold increases should
  be proportional to the item's standard damage threshold, not just additive. Bubble wrap: single
  use, high damage threshold increase. Furniture pad: three uses, limited to furniture, low damage
  threshold and low damage reduction. Heavy-duty pad: 3× uses, medium damage reduction, all items."
relates: FEAT-97 (fragile — `shockFloorG`, `breakG`, the per-hit health cost), FEAT-104 (shop),
  cargo.md § Fragile (the `furniture` tag)
requires: FEAT-97, FEAT-104
invariants: SM-INV-10 (described, never scored)
design: design-amendments-2026-10-14.md §10
---

# FEAT-116: Cargo protection — bubble wrap, furniture pad, heavy-duty pad

| Item | Uses | Works on | Effect |
|---|---|---|---|
| **Bubble wrap** | 1 | any fragile item | high threshold increase |
| **Furniture pad** | 3 | items tagged `furniture` | low threshold increase and low damage reduction |
| **Heavy-duty pad** | 3 | any fragile item | medium damage reduction |

**Every effect is proportional.** A threshold increase multiplies the item's own `shockFloorG` (and
`breakG` with it): small knocks are absorbed, a big hit still breaks it. Damage reduction multiplies
each hit's health cost. Nothing adds a flat amount.

The `furniture` tag goes on the dining chairs, the dining table, the full-length mirror, the
wardrobe and the piano.

## Open

- The multipliers.
- When the item is applied (at accept, or at the loading pad) and whether a use is spent on a
  cancelled job.

## Acceptance

- [ ] Each item scales FEAT-97's numbers for the job it is used on; a gate runs FEAT-97's calibration
      scenarios with and without each one.
- [ ] The furniture pad refuses an untagged item.
- [ ] Uses count down per job and the item leaves the inventory at zero.
