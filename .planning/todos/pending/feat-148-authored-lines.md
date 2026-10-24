---
id: FEAT-148
type: feature
status: open
severity: minor
opened: 2026-10-24
source: owner, 2026-10-24 (game-feel review N-09 / N-10) — "yes make it a ticket. I'd like to own most dialogue and character text myself though"
relates: FEAT-147 (tutorial + opening), FEAT-142 (giver traits), FEAT-67 (offer board — the `flavor` field), R-11 (the three Uncle Larry intro cards on feature/game-feel)
---

# FEAT-148: The owner-authored lines — giver flavor, the sleep reminder, the intro

## What
The alpha ships no stubs. Three places still show placeholder or model-written text:

1. **The giver's line on the parked offer panel** — `_panelHead` prints `"[flavor line]"` when
   `card.flavor` is null, which is every offer today (offer-board.js `card()` sets `flavor: null`).
   The lines belong in a data table (data/offers.js) keyed by family and, once FEAT-142 lands, by
   trait, and are picked from the offer's spec stream so a revisit agrees. Until the lines exist, the
   bracketed stub should NOT show in the alpha build — hide the quote (keep the portrait slot).
2. **The end-of-day / sleep reminder** (owner, 2026-10-24, in place of the cut N-10 "today's costs"
   line): one line on the camp sleep card, in the world's voice, that the pressure is rising —
   *"shortages increase"* was the owner's phrasing. Owner-authored. No arithmetic on screen ("we don't
   want to see how the sausage is made").
3. **The run-intro cards** (R-11, data/dialogue.js `RUN_INTRO`): three Uncle Larry cards saying six
   deeds → the camp, a deed is a B / half at C, base + tip or an item. Model-written placeholders the
   owner kept "for now, replace with tutorial" (FEAT-147). Owner to re-voice or FEAT-147 to replace.

## Acceptance
- [ ] A flavor-line table exists in data/offers.js (per family; trait-keyed when FEAT-142 lands);
      `card()` fills `flavor` from it; the `[flavor line]` stub is gone from every panel.
- [ ] Sleep card carries the owner's one-line pressure reminder.
- [ ] `RUN_INTRO` text is the owner's, or FEAT-147 has replaced the cards.
- [ ] Nothing on screen in story mode reads as a bracketed placeholder.

## Notes
The owner writes the words. A session's job here is the plumbing (table, pick, hide-until-written)
and a list of the slots that need lines, with their length budget (the panel head wraps at ~2 lines;
a map card quotes nothing).
