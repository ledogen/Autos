---
id: BUG-128
type: bug
status: open
opened: 2026-11-07
severity: critical
source: Lane A, while gating FEAT-154 (2026-11-07)
owner: Lane A
relates_to: SM-INV-7 (the run must be winnable), FEAT-157 (requisition lines), FEAT-154 (barricade rows), BUG-124 (the
  same class: a run-critical job that can't plan)
---

# BUG-128: on some worlds a requisition line can't be planned, so the run can't be won

## What happens

On random world 3109505264, the requisition line `reqFuel` does not plan: expedition-camp's check "every line plans
from its source to the camp … reqFuel (no route)" fails. The win needs every line, so that run can't be won
(SM-INV-7).

The same world also fails "from past every row the fade returns … near the row" on 4 barricade rows.

## Evidence (Lane A)

- Already on main: it fails the same with Lane A's FEAT-154 change stashed, and with the planner from before BUG-125
  (7fb41583's `mission.js`). So it is not BUG-124, BUG-125 or FEAT-154.
- The gate's two seeds (1 and 6) pass both checks, which is why it never showed.

## Acceptance

- [ ] Root cause named on 3109505264.
- [ ] A census on ≥ 50 random seeds: how many worlds have a line that can't plan (any line, not only fuel), before
      and after.
- [ ] Every line always plans: a constructive guarantee where the lines' sources and the camp are placed, or a
      fallback that never blocks the win.
- [ ] The 4 fade-return rows on 3109505264 are explained (same cause or separate).
- [ ] expedition-camp pins it on a random-seed sample (reported as a sample).
