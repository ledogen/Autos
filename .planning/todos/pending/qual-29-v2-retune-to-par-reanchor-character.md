---
id: QUAL-29
type: quality
status: open
opened: 2026-09-05
severity: minor
source: QUAL-28 Half 2 — the owner ruled "numbers narrow it, driving settles it"; QUAL-28 delivered
  the numbers and the bracket, this ticket is the driving and the knob change that follows it
relates_to: QUAL-28 (the baseline capture, the sweep, the bracket — read it first),
  FEAT-68 (router v2 — the price list being retuned), FEAT-76 (blocked behind the settled baseline),
  data/ranger.js `roadV2` (the knobs that actually change), test/road-character.mjs (the instrument)
---

# QUAL-29: retune roadV2 to the par-reanchor character — the drive test and the knob change

QUAL-28 established the target and narrowed the search; it deliberately shipped **no knob change**,
because the owner's ruling was that the character report is a coarse filter and driving settles it.
This ticket is that second half.

## What is already decided (do not redo)

- **The target** is the v1-at-reanchor character column, captured from `926e993` and tabulated in
  QUAL-28. Do not re-capture it.
- **`wGrade` is the lever, `cTurn` is the shaper.** Switchbacks come from grade demand, not turn price.
- **`wGrade` ~= 320 is the optimum**; 500 and 750 both score *worse* and over-flatten the grade p95
  below v1's. Do not sweep upward again.
- **The three candidates to drive** (all at `wGrade: 320`): `cTurn` 5 (most hairpin, best crest),
  20 (most switchbacks, grade p95 dead on v1, worst crest at 1.47 g), 30 (cheapest earthwork, least
  hairpin). Both are live sliders under Roads > the v2 price list.

## The work

1. **Drive the three.** Same seed and window as the report (seed 6, around (-975, 765)) so what is
   driven is what was measured. The owner picks, or rejects all three and says which axis was wrong.
2. **Ship the pick** as new `roadV2` defaults in `data/ranger.js`, with the usual owner-review comment
   line recording the date and the before/after, alongside the existing `cTurn` 55 -> 45 and
   `wGrade` 120 -> 180 entries.
3. **Re-run `node test/road-character.mjs`** on the shipped values and paste the column into this
   ticket, so the next person tuning has a current baseline rather than QUAL-28's candidate table.
4. **Check the gates.** The road/terrain gates assert geometry, not character, but a materially
   curvier network is exactly the kind of change that finds a latent one. `npm run test:all`.

## The open question this ticket inherits

QUAL-28 measured that **no `wGrade` setting reaches v1's character without a ~50% higher earthwork
bill** — closest is 4.7% hairpin / 37 switchbacks at 7.0-7.3 m mean earthwork, against v1's 6.7% / 52
at 4.75 m. The cause is structural: v1 priced the plan abstractly and could wander cheaply, v2 prices
elevation with money, so making it wander means making climbing expensive and the router pays in cut
and fill.

So if the drive test says "the character is right but the ground looks over-worked", the next lever is
the **earthwork prices** (`cCutM`, `cCut2`, `cFillM`) at a fixed `wGrade: 320` — cheaper earthwork lets
the router take the wandering line without the cutting being the thing you notice. That is a second
sweep on a different axis, and it is in scope here. It is NOT a reason to raise `wGrade` further.

## Acceptance

- [ ] The three candidates have been driven and the owner has picked (or rejected with a direction).
- [ ] The pick is shipped as `roadV2` defaults in `data/ranger.js` with a dated owner-review comment.
- [ ] A current `road-character.mjs` column for the shipped values is recorded in this ticket.
- [ ] `npm run test:all` green.
- [ ] FEAT-76 is unblocked — its sequencing block names QUAL-28, but the baseline it is actually
      waiting on is the retune landing here. Confirm with the owner and correct FEAT-76's block if so.
