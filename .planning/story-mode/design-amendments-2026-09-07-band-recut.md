# Design amendment — 2026-09-07: THE v2 BAND RE-CUT

**Status: RATIFIED (owner).** Provenance record for one ruling. DESIGN.md carries the decision
inline and **wins wherever this and it differ** — read this only for the reasoning and the numbers
it was measured against.

Scope: the **rank thresholds** and the payout line's two anchors. `PAR_REF` and `PAR_SLACK` are
untouched, and no invariant is amended — SM-INV-2 (par scales with nothing) and SM-INV-3 (rank is
display-only) are both satisfied exactly as before. This moves the LETTERS, which is where the
difficulty ramp has been allowed to live since 2026-08-01.

## The complaint

> "i feel like a rank and s rank are unattainable. i took a bunch of captures today and only got s
> rank once and it was by cutting a significant portion of the course."

## What the corpus said

Six fresh drives were added to `runs-v2/` (now 18 runs, seeds 97/69/0/1 + four new). Graded under
the 2026-08-16 bands (S 0.72 · A 0.76 · B 0.80 · C 1.00) the whole library scores:

| letter | runs |
|---|---|
| S | 1 |
| A | 1 |
| B | 5 |
| C | 11 |
| D | 0 |

Two measurements make that a defect rather than a taste:

1. **The single S was not a driving result.** Run `0015` (ratio 0.668) was checked frame-by-frame
   against the centerline it was priced on: the trace **skips 471 m of a 2762 m route — 17% —
   peaking 210 m off the line**, driven path 2274 m against a routed 2762 m. Every other capture
   stays inside ~2 m mean / 12 m max. Par priced a route that was not driven.
2. **With it excluded, no honest drive in 17 has ever gone below ratio 0.740.** The S line of 0.72
   had never once been cleared by anybody, and A (0.76) exactly once.

The bands were fitted 2026-08-16 against four **router-v1** drives (0.687 "solid S", 0.712 "barely
S", 0.809 "mid C", 0.910 "middle C"). Router v2 took the whole network on 2026-08-18. `PAR_REF`
survived that transition — it was re-measured 2026-09-06 and nothing moved — but the letters never
followed the geometry that shifted underneath them.

`runs-report` residuals against curvature, grade, straight-fraction and distance are all |r| < 0.4,
so par is **not** biased by route type. This is a re-cut of the letters and explicitly **not**
evidence against `mu`. Do not "fix" it by touching `PAR_REF`.

## The ruling

**Thresholds: S 0.77 · A 0.81 · B 0.85 · C 1.00** (day 1), tightening a flat −0.02 to
**S 0.75 · A 0.79 · B 0.83** by day 20. C stays pinned at 1.00 on every day — the 2026-08-16 rule
that par IS the pass line is untouched.

Over the 17 honest v2 runs that grades **S 2 · A 5 · B 5 · C 5 · D 0**: every band populated, and
the best drive on record earns an S.

Accepted costs, ruled by the owner rather than derived:

- a felt-**"slow"** drive (0.830) now lands **B**, and a felt-**"par"** one (0.803) lands **A**.
- **the `felt` labels cannot arbitrate this and no future refit should let them.** The corpus holds
  a felt-"very fast" drive at 0.833 and a felt-"par" drive at 0.803 — the label ordering is partly
  inverted against the clock, exactly as `calibrate-par.mjs`'s own health warning says. Fit the
  bands to the ratio DISTRIBUTION and to owner letter-targets; use `felt` only as a tie-break.

## The payout line follows

`breakEven` is not a free constant — it **is** the B/C boundary (gated), so it rides B from 0.80 to
**0.85**, and the two derived numbers move with it by their existing rules:

- `k = k_old × b_new/b_old = 0.024 × 0.85/0.80 = ` **0.0255**. A break-even day is worth *exactly*
  the same dollars as before: `0.024 × T/0.80 === 0.0255 × T/0.85 === 0.03·T`. The letters moved,
  the wage did not — so the ~$130-190 region-1 day and SM-3's repair bills stay valid.
- `payoutZero` re-solved from the same anchor that fixed it at 1.20 (par pays exactly half a unit):
  `(z − 1)/(z − 0.85) = 0.5 ⇒ z = ` **1.15**.

Consequence worth knowing: the anchors now sit 0.30 of ratio apart instead of 0.40, so the payout
**line is ~33% steeper** — margin is worth more per unit of ratio, while both anchor VALUES are
unchanged. That falls out of the re-cut; it was not a separate decision.

## Left open — deliberately, both recorded so they are not rediscovered

1. **The off-route shortcut is a real hole and is NOT closed by this — but it is already ruled on,
   and nothing new should be proposed for it.** The offense is the **intentional non-shortcut skip**
   (leaving the maintained network and rejoining having saved >~200 m of road distance by a path that
   was not a cut), the penalty is **graded by the distance skipped** and cumulative, and it is priced
   through the **Highway** relationship — not by voiding a payout and not by walling off-road driving
   off, both of which the 2026-08-02 rebuild explicitly rejected (`spirits-and-pacts.md` #05/#06:
   *"the game keeps the shortcut legal and expressive and simply prices it"*). The detector is
   **owed by FEAT-52 §5**, alongside the cut-traversal event that suppresses it. Run `0015` skipped
   471 m — ~2.4× the ratified threshold — and is recorded there as a fixture. See DESIGN.md
   "Ratification pass 2026-08-02 — the route domain is rebuilt".
2. **D is unreachable and the ratio range is too narrow.** The whole observed spread from flat-out
   to dawdling is 0.74 → 0.97; both drives the owner labelled "very slow" scored 0.903 and 0.950,
   comfortably passing. Par is meant to be where careless driving starts to fail, and on v2 roads
   nothing fails. **No threshold set and no `PAR_SLACK` value can fix both ends at once** — slack is
   a pure rescale, it slides every ratio together and the thresholds absorb it exactly. Widening the
   range needs par to discriminate better BETWEEN ROUTES (it prices two routes ~10% apart for the
   same felt pace). More labelled runs before chasing it.
