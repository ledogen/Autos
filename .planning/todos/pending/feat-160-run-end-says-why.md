---
id: FEAT-160
type: feature
status: open
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

- [ ] Crash card shows the hit speed, the panel's limit at its armour, and the fresh limit.
- [ ] Broke card shows the recovery cost against the wallet.
- [ ] Numbers come from the same functions the game uses (no second copy of the fatal formula).
- [ ] cdp-smoke still passes; the run-end gate (if any) covers the new line.
