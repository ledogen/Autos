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

## Implementation — Lane A, 2026-11-12 (b5edb67d, 53ab5ac3)

- `index.html` `#energy-meter`: a `Hunger · <word>` line and its own strip under the energy bar, the same
  `.em-*` classes, 6 px gap. `main.js _updateEnergyMeter` lays the bands from `DAY_PARAMS.hungerWords`
  (longest meal hold, 10 h → 6 · 4 · 2 · 0 h left) plus `hungry` for `hungryRampH`, and scrolls it by
  `DaySystem.fedLeftH()` at the energy strip's 25 px/h; past the ramp the drain is flat, so the bar stops.
  Both lines hide with hunger switched off.
- Colours: `HUNGER_COLOR` in `src/day.js`, built from `STAGE_COLOR` (fed green, peckish yellow, hungry
  orange). No new hex; UI-STYLE.md's domain-palette table names the new owner.
- cdp-smoke's tutorial-morning check now reads `#hm-stage` (the hunger word left `#em-stage`).
- Owed: the in-browser screenshot (held for the perf bench), then the owner's look.
