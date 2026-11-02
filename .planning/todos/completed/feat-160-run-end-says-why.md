---
id: FEAT-160
type: feature
status: done
severity: minor
opened: 2026-11-02
source: owner, 2026-11-02 — approved item A of the Sid Meier review (.planning/story-mode/review-sid-meier-2026-11-02.md)
relates: FEAT-146 (the run-end cards), src/main.js `_runEndHtml` / `RUN_END_TITLE`, src/damage.js fatal speed
  (fatalMphBare 60 → fatalMphFull 100 by the panel's armour), src/damage-screen.js (already prints "A crash over
  N mph here is fatal"), the broke ending's recovery cost
---
lane: Spare (touches Lane A's FEAT-146 card in main.js — tell Lane A)

# FEAT-160: The run-end card says why it ended, and how to avoid it

## What

Meier (GDC 2010): players never question a reward, but an unexplained setback reads as the game
cheating; *"explain why these things happen, and how to avoid these things in the future."* Today:

- **Crash** prints `hit at N mph — front`, but not the limit that panel had, which is the "how to avoid" half.
- **The truck is dead.** (broke) prints no reason at all.

Add one line to each, from numbers the run already tracks:

- crash: the panel's limit at its armour and the fresh limit, e.g. *"hit at 74 mph — front · at 30 % armour
  the front could take 72 mph; fresh it takes 100"*. Same formula as damage.js line ~1096 (`armorBefore`).
- broke: what recovery would have cost against the wallet, e.g. *"the tow was $X — you had $Y"*.
- towel and win: unchanged.

Words are placeholders in the owner's voice rules (no letters, numerals for money). The owner may reword.

## Acceptance

- [x] Crash card shows the hit speed, the panel's limit at its armour, and the fresh limit.
- [x] Broke card shows the recovery cost against the wallet.
- [x] Numbers come from the same functions the game uses (no second copy of the fatal formula).
- [x] cdp-smoke still passes; the run-end gate (if any) covers the new line.

## Resolution (2026-11-02, Spare, cf983bf9)

Built as specified. `damage.js` exports `fatalMph(c)`, the one copy of the fatal formula: `applyImpact`,
the damage screen's "A crash over N mph here is fatal" and the card all call it. `fatalImpact` also
records `armor` (the panel's condition before the hit). In `main.js`, `_runEndWhy(kind)` writes the card's
`re-why` line:

- crash: *"hit at 90 mph — front · at 30 % armor the front could take 72 mph; fresh it takes 100"*
- broke: *"the tow was $12.89 — you had $0.00"*. That is the cheapest of the two `_towQuote`s the
  Recovery card offered, or *"no tow could reach you"* when neither could.

The cdp-smoke `endings` step checks both lines. Affected gates are 26/26 green, and the smoke passes
21/21 steps. The words are placeholders: rewording either line is a one-line edit in `_runEndWhy`.
