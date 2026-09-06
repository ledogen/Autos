---
id: QUAL-29
type: quality
status: done
opened: 2026-09-05
closed: 2026-09-06
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

- [x] The three candidates have been driven and the owner REJECTED all of them with a direction.
- [x] No knob change to ship — the shipped defaults ARE the pick. See Resolution.
- [x] The shipped values' column is QUAL-28's "v2 ship (45/180)" column, re-verified 2026-09-05 and byte-identical. Recorded below.
- [x] No src change from this ticket, so nothing to gate. (The two bugs found while running it are committed separately and carry their own gate runs.)
- [x] FEAT-76 is unblocked — its sequencing block names QUAL-28, but the baseline it is actually
      waiting on is the retune landing here. Confirm with the owner and correct FEAT-76's block if so.


## Resolution (2026-09-06) — NO KNOB CHANGE. The shipped defaults are ratified.

The owner drove the bracket and rejected the whole `wGrade` axis on feel: **"I hate how wGrade
feels at 360. 180 looks great, 360 gets really knotted up."** A follow-up `cTurn` sweep at
`wGrade: 180` was then driven, and rejected too: **"every cTurn below 45 looks too eager to take
the long way. I like 45."**

So `roadV2` stays exactly as shipped — `cTurn: 45`, `wGrade: 180` — which is where the owner had
already put them from the live sliders (owner review 2026-08-21 and 2026-08-20, comments in
`data/ranger.js`). **This ticket ships no diff.**

### Why the ticket existed at all, and what was actually wrong with it

Worth writing down, because the reasoning looked sound at every step and the conclusion was still
wrong. QUAL-29 descends from one remark on 2026-09-05 — *"the old one after par reanchor was
pretty much perfect and we should seek to replicate it"* — and QUAL-28 treated it as a
specification. It measured v1-at-reanchor against v2, found v2 straighter and smoother with a third
the switchbacks, and inferred a retune was owed.

The inference that did not hold is **"different from v1" ⇒ "worse than v1"**. Nobody had observed a
problem with the shipped road. The character report is a difference detector, not a preference
detector, and it cannot tell those apart. Driving settled it the other way: v2's character as tuned
is the one the owner wants, and the v1 column was a historical reference, not a target.

QUAL-28's own ruling anticipated exactly this — *"numbers narrow it, driving settles it… the report
describes whatever is picked; it does not decide it."* The process worked. The answer was "keep it".

**Do not re-open this from the character report.** A future session that runs `road-character.mjs`,
sees v2 at 10.4 % straight against v1's 5.2 % and 17 switchbacks against 52, and concludes a retune
is owed will be repeating this ticket. That gap is measured, understood, and ACCEPTED.

### The switchback trade, stated so it is a choice and not a miss

v1's 52 switchbacks are not reachable at `wGrade: 180`. Switchbacks come from grade demand, and the
`wGrade` that produces them is the setting that reads as "knotted up". Measured ceiling at
`wGrade: 180` is 29 switchbacks (at `cTurn: 5`), and the owner rejected everything below `cTurn` 45
as "too eager to take the long way" — i.e. the detour those switchbacks are made of is itself the
thing being rejected, not just its price. The shipped 17 is the deliberate answer.

### The shipped column (seed 6, landmark window, re-verified 2026-09-05)

| straight % >200 m | hairpin | tight | sweeper | switchbacks | grade max / p95 | earthwork mean / max | crest g |
|---|---|---|---|---|---|---|---|
| 10.4 | 2.4 | 12.2 | 26.4 | 17 | 0.313 / 0.218 | 5.25 / 143.4 m | 1.01 |

### `cTurn` sweep at `wGrade: 180` (driven and rejected — kept so it is not re-run)

| `cTurn` | straight % | hairpin | tight | sweeper | switchbacks | grade p95 | earthwork mean | crest p99 |
|---|---|---|---|---|---|---|---|---|
| 5 | 8.8 | 3.6 | 15.0 | 24.5 | 29 | 24.0 | 6.01 | 0.51 |
| 15 | 7.1 | 3.8 | 13.3 | 22.8 | 26 | 23.4 | 5.30 | 0.47 |
| 25 | 9.8 | 3.4 | 13.4 | 25.0 | 23 | 23.0 | 5.21 | 0.46 |
| 35 | 9.6 | 2.9 | 13.9 | 24.8 | 25 | 22.2 | 5.26 | 0.46 |
| **45 (ship)** | 10.4 | 2.4 | 12.2 | 26.4 | 17 | 21.8 | 5.25 | 0.45 |
| 60 | 9.9 | 2.0 | 13.8 | 28.6 | 17 | 21.2 | 5.38 | 0.44 |
| 80 | 13.1 | 1.3 | 12.2 | 27.1 | 15 | 23.5 | 5.56 | 0.47 |

Crest is the **p99** — the max is a single-station outlier and is wildly noisy (see BUG-58).

One thing this sweep settles for free: QUAL-28 predicted the character we wanted would cost ~50 %
more earthwork. That was an artefact of the `wGrade: 320` bracket. At `wGrade: 180` earthwork sits
at 5.2–5.4 m against v1's 4.75 across the whole `cTurn` row, so the "over-worked ground" follow-up
sweep (`cCutM` / `cCut2` / `cFillM`) this ticket held in scope is **not needed and was never run**.

### What the exercise actually yielded

Nothing in `data/ranger.js`, and two real bugs found while driving it — both committed:

- `314b8ee` — the 2D map kept a network priced with the old `roadV2` list (the network worker's
  warm-instance reuse key did not include the params).
- `0939d7b` — terrain and the ribbon never reconciled a network that ARRIVED late, so a teleport
  after a param change left the deck floating over uncarved ground with no ribbon.

Plus **BUG-58**, minted from the measurements taken here.
