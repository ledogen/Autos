---
id: FEAT-237
type: feature
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "Fragile G Meter: Let's make this a logarithmic plot so we have more resolution in the bottom end. I'd love to see another tick mark for 10% damage. That should be around halfway up the meter. make it grey with a grey label"
relates: src/main.js, QUAL-36
---
lane: unplaced (UI, Sonnet)

# FEAT-237: Fragile G meter: log scale and a 10 % damage tick

## Next steps
Built on land/ui-batch; waits for the owner's look.

## Summary
Make the fragile G meter a logarithmic plot for more resolution at the bottom, and add a tick for 10 % damage about halfway up, grey with a grey label.

## Tracker
- [x] Meter is logarithmic
- [x] A grey 10 % damage tick with a grey label, about halfway up
- [ ] Owner has looked

## Decisions
The mapping (src/fragile.js `meterPos`): height = ln(g / 0.8) / ln(top / 0.8), 0 at and below 0.8 g, top = 1.2 x the tier's break g
(unchanged). The 10 % tick is `tenPctG` (the inverse of shockCost's curve). Fragile tier (top 8.52 g): 25 / 50 / 75 / 100 % of the
height = 1.45 / 2.61 / 4.72 / 8.52 g. Tick heights: 1 % 28 %, 10 % 51 %, break 92 % (Very fragile 27 / 49 / 92; Sturdy 30 / 53 / 92).
Rest and paved driving (< 0.8 g) now draw nothing; the floor (1.2 g) sits at 17 % of the height.

## Log
- 2026-11-16: filed from the owner's inbox note.
- 2026-11-16 land/ui-batch: built (fragile.js, main.js _updateFragileG, index.html `.jg-ten`, grey --text-dim tick + label). Gate: test/fragile-cargo.mjs extended (10 % tick within 4 points of halfway on all tiers).
