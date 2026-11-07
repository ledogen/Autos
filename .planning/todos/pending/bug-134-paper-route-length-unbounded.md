---
id: BUG-134
type: bug
status: open
severity: minor
opened: 2026-11-07
source: owner, 2026-11-07 — bug131-keepout answer "(a) land, route length as a new ticket"
relates: BUG-131 (POI keep-out: its fix moves paper houses), FEAT-62 (paper-route scenario), src/paper-route.js tierRoadM
---

# BUG-134: nothing bounds the top paper route's length

## What happens

`test/paper-tour.mjs:178` checks that the top route stays inside the ~14 km driving budget, with 15.5 km as the
hard limit. Nothing in `src/paper-route.js` enforces it. The only lever is the outer customer band, `tierRoadM`'s
5 km of road distance from Larry. The route length is whatever the plotter's tour through those customers comes to.

- On main, 2 of 12 random seeds already go over, up to 18.4 km (BUG-131's census).
- BUG-131's fix moves some paper houses to other roads. On seed 6 that takes the top route 14.8 → 16.4 km, so the
  gate fails there.
- The owner chose to land BUG-131 anyway. Its landing turns the seed-6 15.5 km check into a measurement (it reports
  the length and doesn't fail on it), and this ticket owns the real bound.

## The owner's question

How should a top route be bounded? Options for the owner, measured before asking:

- (a) The plotter drops the farthest customer until the tour fits 15.5 km. The route gets shorter, and the
  customer count can fall below the tier's.
- (b) Customers are chosen by their tour cost, not their road distance from Larry. The count is kept, and the
  houses are nearer together.
- (c) 15.5 km stays a soft target: the pay and par scale with the length, and nothing is cut.

## Acceptance

- Top-route lengths measured on 20+ random seeds (main, then each option), as a table and a shot of the worst one.
- The owner picks, and the chosen bound holds on every seed measured.
- `test/paper-tour.mjs`'s check becomes a real failure again.
