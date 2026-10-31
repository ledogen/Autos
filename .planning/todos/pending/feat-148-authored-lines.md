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

## Ruled (owner, 2026-10-31) — write them BEFORE the alpha

1. **The giver's line is two parts.** A **generic first line** that fits any job ("looking for work?",
   "lend a hand?", "you got a second to help me out?", "hey i got a job if you want it.", "say, if you
   got a sec,", "would ya mind taking care of this for me?") and a **second line keyed on the THING**
   (e.g. the empty propane cylinder: "fresh outta gas do ya think you could drop this off for me?"; a
   full one from the store: "got an order. (name) needs a bottle of propane right away. Think ya can
   help?"; milk bottles: "these milk bottles are delicate but i need them delivered to (name) and havent
   got the time"). Each spawns **70 %** of the time, from the offer's spec stream; the first line is
   **guaranteed when the second does not spawn**, so a panel never has no quote. So: both, first only,
   or second only. The owner populates them on the **item setup page** (Giver lines section, db
   `answers/_lines`: `first` = one per line, `t_<thingId>` per THINGS row); the fold goes to a table in
   data/offers.js.
2. **The sleep reminder is a live midnight overlay**, not a card line: at midnight every day a text
   falls from the top of the screen and settles in the centre — main line **"Supplies are drying up"**,
   subtitle **"costs keep rising"** — large, thin-stroke white at 50 % opacity so the night road stays
   visible through it; about 4 s overall. If the player sleeps through midnight it plays on the black
   after they hit sleep. (Replaces the camp-card line in What §2.)
3. **The intro cards are reworked after the tutorial beats** (FEAT-147) — not before.

## Acceptance
- [ ] A giver-line table exists in data/offers.js (generic first lines + per-thing second lines, Ruled
      §1, 70 % / 70 % with the first guaranteed as fallback); `card()` fills `flavor` from it; the
      `[flavor line]` stub is gone from every panel.
- [ ] The midnight overlay (Ruled §2) plays at every midnight, and on black when slept through.
- [ ] `RUN_INTRO` text is the owner's, or FEAT-147 has replaced the cards.
- [ ] Nothing on screen in story mode reads as a bracketed placeholder.

## Notes
The owner writes the words. A session's job here is the plumbing (table, pick, hide-until-written)
and a list of the slots that need lines, with their length budget (the panel head wraps at ~2 lines;
a map card quotes nothing).
