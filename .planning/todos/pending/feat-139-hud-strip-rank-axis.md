---
id: FEAT-139
type: feature
status: open
severity: minor
opened: 2026-10-21
source: owner, 2026-10-21 — "Whatever the strip is showing should also show what rank you have. For
  example: Haul, 12 pieces, A rank." / "just do a vertical combined acceleration bar that shows the
  threshold and instant destruction limits."
relates: FEAT-87 (the rank timer strip), FEAT-97 (fragile health), FEAT-113 (due time), FEAT-138
requires: FEAT-138
design: design-amendments-2026-10-21-mission-recut.md §9
---

# FEAT-139: The HUD strip shows each type's rank axis and the live letter

## Request

| Type | Strip | Live warning |
|---|---|---|
| Courier | unchanged: the FEAT-87 boundary bar + letter | the bar itself |
| Haul | `Haul · 12 aboard · A` | `lose 2 → B` |
| Freight | `Freight · 710 kg · S` | the due time (static while driving — freight can't lose cargo) |
| Fragile | a health bar + letter | **a vertical bar of the combined felt g** |
| Papers | `Papers · 3/4` + the FEAT-87 boundary bar + letter | the bar; the due time as a clock time |

**The combined-g bar.** One vertical bar of the magnitude of the felt g (the same scalar `fragile.js`
already computes — damage reads the magnitude, vertical included). Two marks on it: the cargo's
**damage threshold** and its **instant-destruction limit**. Landings are what light it up: hard paved
cornering peaks around 0.6 g, a 1 m crest lands at 4.6–4.8 g.

The health bar is for now. Later, damage should show on the cargo itself (texture, deformation).

## Notes

- **Reverses** FEAT-96's "no number describing the cargo on the HUD" (10-10) and FEAT-97 / missions.md
  "no HUD number; the sound and the blink are the only readouts" (10-06). SM-INV-10 is about parts and
  is not touched.
- **SM-INV-3 holds:** no countdown digits anywhere. A deadline shows as a clock time. The FEAT-87 gate
  (`test/rank-timer.mjs`, no time string) stays green.
- `main.js` `_rankTimerSource` / `_updateRankTimer` / `_updateJobDue`, `#job-stack` in index.html. Haul
  aboard count per frame from `_haulAboard`.
- Follow UI-STYLE.md (System family, the token palette, the 12 px floor).

## Acceptance

- [ ] Every type's strip shows its rank axis and the live letter, per the table.
- [ ] Haul shows how many more lost pieces drop a letter.
- [ ] Fragile shows the health bar and the combined-g bar with both marks, at the cargo's own values.
- [ ] No countdown digits; `test/rank-timer.mjs` green.
