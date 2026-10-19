---
id: FEAT-127
type: feature
status: open
severity: minor
opened: 2026-10-19
source: owner, 2026-10-19 (FEAT-41 run setup) — the gearbox is the jalopy's starting box; "opposite-box
  loot is future work, so ticket it; nothing is locked."
relates: FEAT-126 (the manual gearbox), FEAT-41 (the run setup page that picks the starting box),
  FEAT-57 / FEAT-115 (other drivetrain/bed hardware as found parts), SM-3 parts pool, items.md §3 (parts)
---

# FEAT-127: The opposite gearbox as a found part

## Request

In a story run the gearbox is chosen on the run setup page and is the jalopy's **starting** box,
fixed for the run (DESIGN.md "Difficulty settings", 2026-10-19). The owner wants the other box — a
manual if you started automatic, or the reverse — to be something you can **find** mid-run and fit,
like any other part.

## Scope (to design when the parts pool lands)

- The box as a part: where it is found (yard, junk pile, a mission reward), what it costs to fit, and
  whether fitting takes a shop.
- Fitting goes through `fitTransmission()` (`src/drivetrain.js`), the same path the run setting and
  the debug selector use.
- The setup page's "locked for this run" row would then read what is fitted, not what was chosen.

## Acceptance

- A story run can end on a different box from the one it started with, by finding and fitting it.
- Nothing about the starting choice is locked behind progression (owner: "nothing is locked").
