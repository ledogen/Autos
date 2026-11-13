---
id: FEAT-198
type: feature
status: open
severity: minor
opened: 2026-11-12
source: owner, 2026-11-11 inbox — "Hunger should get its own scrolling bar in the same box as Energy. Just mirror the energy layout so for example it would say energy rested new line energy scroller new line hunger peckish new line hunger scroller make sure that the words well rested and peckish both get colors"
relates: [FEAT-173]
---
lane: A

# Hunger gets its own bar under Energy, same box, same layout

## What

Four lines in the one box: `energy <state word>`, the energy bar, `hunger <state word>`, the hunger bar. Both
state words ("rested", "peckish", …) are coloured by their state, from the UI token palette
(`.planning/research/UI-STYLE.md`).

## Acceptance

- [ ] The layout above, hunger mirroring energy; both state words coloured; no hex outside the palette.
