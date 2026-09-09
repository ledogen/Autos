# HANDOFF — merging `feature/rank-weights` into main — 2026-09-07

**A rank-threshold re-cut plus the payout anchors that are gated to follow it. No conflicts
possible: main has not moved since the branch point (`2a5e275`) and none of the three live sibling
worktrees touch any file here. §1 is the thing to read before merging — the numbers moved because
the OLD ones had never once been reachable, and you should agree with that before it lands.**

Branch `feature/rank-weights` @ `9414962`, worktree `/Users/ledogen/CodeShit/CarGame-rank-weights`,
dev on :3311.

Two commits:

| | |
|---|---|
| `fde1bf0` | `feat(53)` the band re-cut + the payout anchors + gate de-fossilising + 6 new captures |
| `9414962` | `docs(52)` deletes a ticket I should not have filed; folds its measurement into FEAT-52 §5 |

---

## 1. READ THIS FIRST — S had never been cleared by a human

The complaint was *"a rank and s rank are unattainable"*. Measured over the whole `runs-v2/` library
(18 runs after adding the six captures from 2026-09-07), graded under the shipped bands:

| letter | runs |
|---|---|
| S | 1 |
| A | 1 |
| B | 5 |
| C | **11** |
| D | **0** |

Two measurements turn that from a taste question into a defect:

**(a) The single S was not a driving result.** Run `0015` (ratio 0.668) was checked frame-by-frame
against the centerline par priced it on. Its trace **skips 471 m of a 2762 m route — 17% — peaking
210 m off the line**; driven path 2274 m against a routed 2762 m. Every other capture in the library
stays inside ~2 m mean / 12 m max. Par charged for road that was never driven.

**(b) With it excluded, no honest drive in 17 has ever gone below ratio 0.740.** The S line sat at
0.72 and had been cleared by nobody, ever. A (0.76) had been cleared exactly once.

**Cause.** The bands were fitted 2026-08-16 against four **router-v1** drives (0.687 "solid S",
0.712 "barely S", 0.809 "mid C", 0.910 "middle C"). Router v2 took the whole network on 2026-08-18.
`PAR_REF` was re-measured against v2 on 2026-09-06 and correctly did not move — but the *letters*
never followed the geometry that shifted underneath them. This is the second half of that
re-anchor, arriving three weeks late.

**This is not evidence against `mu`.** `runs-report` residuals against curvature, grade,
straight-fraction and distance are all |r| < 0.4, so par is not biased by route type. `PAR_REF` and
`PAR_SLACK` are untouched on this branch. Do not "improve" this later by moving `mu`.

## 2. What changed

**(a) Thresholds — `src/par.js` `RANK_THRESHOLDS_DEFAULT`, mirrored in `economy.js` `rankDay1`.**

|  | was | now |
|---|---|---|
| S | 0.72 | **0.77** |
| A | 0.76 | **0.81** |
| B | 0.80 | **0.85** |
| C | 1.00 | 1.00 — **pinned, unchanged, on every day** |

Day ramp keeps its existing flat −0.02 to day 20 (S 0.75 / A 0.79 / B 0.83). Grading the 17 honest
v2 runs: **S 2 · A 5 · B 5 · C 5 · D 0.** Every band populated; the best drive on record earns an S.

**Accepted costs, ruled by the owner, not derived.** A felt-*"slow"* drive (0.830) now lands B, and
a felt-*"par"* one (0.803) lands A. That is deliberate: the corpus also holds a felt-*"very fast"*
drive at 0.833 and a felt-*"par"* at 0.803, so the labels are partly inverted against the clock —
exactly as `calibrate-par.mjs`'s own health warning has always said. **The `felt` labels cannot
arbitrate a band cut and no future refit should let them.** Fit to the ratio distribution and to
owner letter-targets; `felt` is a tie-break.

**(b) The payout line follows, because it is gated to.** `breakEven` is not a free constant — it
*is* the B/C boundary (`test/economy.mjs` asserts the identity), so it rides B and the two derived
numbers move by their existing rules:

| | was | now | rule |
|---|---|---|---|
| `breakEven` | 0.80 | **0.85** | `=== rankDay1.B`, gated |
| `k` | 0.024 | **0.0255** | `k ∝ b` — a break-even day is worth *exactly* the same dollars: `0.024 × T/0.80 ≡ 0.0255 × T/0.85 ≡ 0.03·T` |
| `payoutZero` | 1.20 | **1.15** | solved from `m(1.0) = 0.5`, i.e. `z = 2 − b` |

⚠ **One consequence to know before it surprises you.** The two anchors now sit **0.30 of ratio apart
instead of 0.40**, so the payout **line is ~33% steeper** — margin is worth more per unit of ratio
than it was, while both anchor *values* are unchanged. That falls out of the re-cut; it was not a
separate decision. The `$5-15` day-1 and `$500-1500` day-20 pins in `test/economy.mjs` still pass.

**(c) Gate fixtures that had frozen the old geometry as if it were a rule.** These were latent
traps, not breakage caused by this branch — three of them asserted letters and payouts at *hardcoded
ratios* that the constants no longer produce:

- `test/par-oracle.mjs` asserted a hardcoded `0.75` is an A. It now probes the **midpoints of
  whatever `RANK_THRESHOLDS_DEFAULT` says**, and gained a B probe.
- `test/paper-route.mjs` measured the tip premium at a hardcoded `0.80` "break-even pace". It now
  reads `ECONOMY_PARAMS.breakEven` for that probe.
- `test/economy.mjs` pinned `payoutZero === 1.20` as a bare number. It now **also** asserts
  `payoutZero === 2 − breakEven`, so a future band re-cut that forgets to re-solve `z` fails here
  rather than quietly re-pricing par.
- the day-20 S floor pinned `≥ 0.654` (a v1-corpus figure). It now pins **`≥ 0.740`, the best
  HONEST drive**, with a comment saying why `0.668` cannot certify a threshold.

**(d) Six new captures in `runs-v2/`** (`0013`–`0018`), and a rewritten corpus README recording what
the library has been used for and the exclusion below.

## 3. `0015` stays in the corpus and is excluded from every fit

It is real recorded data and it is the fixture for FEAT-52 §5's detector, so it is not deleted. Two
guards ship with this branch and neither waits on anything:

- `runs-v2/README.md` marks it excluded, states the honest best is **0.740**, and warns that
  `calibrate-par.mjs` has **no corridor check** — move the file aside before re-fitting `PAR_REF`.
- `test/economy.mjs` pins day-20 S against the honest best, so a shortcut run can never certify a
  threshold even if someone re-fits carelessly.

## 4. Correction inside this branch — read `9414962` before trusting my first pass

I filed **BUG-63** proposing three fixes for the off-route skip: fail the mission, re-price the path
driven, or a soft corridor. **Two of those are things the 2026-08-02 route-domain rebuild explicitly
rejects** — `spirits-and-pacts.md` #05/#06 keeps the shortcut *"legal and expressive and simply
prices it"* rather than hard-walling off-road driving or silently voiding payouts. The ruling
already exists: the offense is the **intentional non-shortcut skip** (>~200 m of road distance saved
off-network by a path that was not a cut), the penalty is **graded by distance skipped** and
cumulative, priced through the **Highway** relationship, and the detector is **owed by FEAT-52 §5**
alongside the cut-traversal event that suppresses it.

So `9414962` deletes the ticket and folds the measurement into FEAT-52 §5 as a fixture: `0015`'s
471 m skip is **~2.4× that ruling's ~200 m threshold**, against a ~2 m mean / 12 m max false-positive
noise floor. It also records there that the skip is **unpriced until that detector lands and is
currently the best-paying line in the game** (0.668 against a best honest 0.740). `src/par.js` now
says not to add a corridor check to `mission.js`.

**Nothing on this branch attempts to close that hole.** The work happens in FEAT-52.

## 5. Still open, deliberately — D is unreachable

Recorded in the amendment doc and in `par.js` so it is not rediscovered as a surprise: the whole
observed range from flat-out to dawdling is ratio **0.74 → 0.97**. Both drives the owner labelled
"very slow" scored **0.903 and 0.950** — comfortably passing. Par is supposed to be where careless
driving starts to fail, and on v2 roads nothing fails.

**No threshold set and no `PAR_SLACK` value can fix both ends at once.** Slack is a pure rescale — it
slides every ratio together and the thresholds absorb it exactly. Widening the range needs par to
discriminate better *between routes* (it prices two routes ~10% apart for the same felt pace, a
spread noted unresolved since 2026-08-16 and now measurably worse on v2). Needs more labelled runs
before chasing. **Do not attack it by moving `PAR_SLACK`.**

## 6. Verification

- **Affected gates: 10/10 green** (`npm test`, 1076 s wall, story subsystem, from 17 changed files).
- **Full suite: 68/69 green** (`npm run test:all`, 481 s wall, 69 gates). The one failure is
  **`junction-stitch.mjs`, and it is PRE-EXISTING on main** — verified by running the gate against
  the main worktree, which produces the identical result: **9 FAIL rows, 66 unstitched
  pair-stretches, same BUG-56 message, same exit 1**. Nothing on this branch can reach it; it is the
  BUG-56 / BUG-59 deck-divergence work, tracked there. **Do not treat it as a merge blocker and do
  not re-tune anything here to chase it.**
- No live verification needed in-browser — this is four numbers and their gated consequences. The
  dev server on :3311 is there if you want to see a result card.

## 7. Merge

Main has not moved since the branch point, and `feature/junction-stitch`, `feature/portal-cost` and
`feature/connector-cost` touch **none** of these 17 files. Expect zero conflicts.

```bash
bash ~/.claude/skills/worktree/scripts/wt.sh merge rank-weights
bash ~/.claude/skills/worktree/scripts/wt.sh clean rank-weights
```

## 8. Documentation touched

`DESIGN.md` carries the amendment inline (and the 2026-08-16 ratification item is marked superseded
in place rather than rewritten). `missions.md` and `MILESTONES.md` mirror the new numbers.
Provenance and the full measurements:
`.planning/story-mode/design-amendments-2026-09-07-band-recut.md`.
