---
id: FEAT-146
type: feature
status: open
severity: major
opened: 2026-10-23
source: owner, 2026-10-23 — alpha scoping: "reach camp or die due to crash or run out of money"; "summary. The player should also be able to throw in the towel from the pause menu. I imagine most of the time people will see a run going south and quit before they actually get locked"
relates: SM-INV-1 (death is crash or breakdown only), FEAT-103 (the camp — the win), FEAT-42 (saves — a run end deletes the run slot), FEAT-41 (menus), FEAT-62 (the pause menu), src/damage.js (`fatal`), src/main.js (`rc-end`, `_backToMenu`), design-amendments-2026-10-23-release-cuts.md
---

# FEAT-146: The run ends — three ways out, and a summary

**Alpha.** The alpha run has a start and, today, no end: a fatal crash is only flagged on the debug
HUD (`damage.js` `fatal`), and "can't afford the tow" drops straight back to the menu (`rc-end` →
`_backToMenu`). This ticket gives every run an ending and a screen that says how it went.

## The three endings

| Ending | Trigger | Card title |
|---|---|---|
| **Win** | The FEAT-103 requisition is complete at the expedition camp. | "You made it" (wording open) |
| **Death** | SM-INV-1, unchanged: a fatal crash (`damage.js` Δv ≥ the armor-scaled fatal speed), or a breakdown you can't pay to recover from (the Recovery card's "end run"). Running out of money is the second case — it only ends the run when the truck needs a tow you can't afford. | "You crashed" / "You broke down" |
| **Throw in the towel** | A pause-menu button, story mode only, with one confirm. | "You called it" (wording open) |

The towel is the player's choice, not a fail state the game imposes, so SM-INV-1 holds ("no other
fail states"). The owner expects it to be the most common ending: players will see a run going south
and quit before the game locks them.

## The summary

One screen, the same for all three endings, then back to the main menu. It reads what the run
already tracks — nothing new is measured for it:

- how it ended (the card title above), day reached, and time played;
- jobs done, with rank counts (D/C/B/A/S) and good deeds toward the camp;
- money earned, money spent, and the final wallet;
- the truck's final condition.

Style per UI-STYLE.md: a Story card (the world talking), not a System panel.

## Acceptance

- [x] A fatal crash in story mode ends the run on the death card. Free roam is untouched (respawn
      stays a free-roam tool — SM-INV-1 lives clause).
- [x] Recovery's "end run — you broke down" goes to the summary, not straight to the menu.
- [x] The pause menu has "throw in the towel" in story mode only, behind one confirm.
- [x] Completing the FEAT-103 requisition ends the run on the win card.
- [x] All three roads reach the same summary, and it returns to the main menu.
- [x] Every ending calls main.js `_discardRunSave()` (FEAT-42, owner 2026-10-29: the run save is a
      ROLLING AUTOSAVE, rewritten every second while a run is live). It deletes the save and stops the
      autosave for the rest of that run; without it the autosave keeps rewriting a dead run and
      "continue" brings it back. (Replaces Spare's earlier ask to grey save & exit on the end screen.)
- [x] `node test/cdp-smoke.mjs` drives all three endings without a console error.

## Built (2026-10-30, feature/run-shape)

- **One way through** — main.js `_endRun(kind)`: `_discardRunSave()` first, the summary read the moment
  the run ends, any live mission exited, then the `#run-end` Story card (index.html). The card holds
  the sim (`_heldPause`) and counts as a menu for keyboard / pad (menu-nav.js). Its one button is
  `_backToMenu()`.
- **Crash** — the frame loop reads `damageModel.fatalImpact` (latched by damage.js, cleared at run
  start). The world turns black and white at the hit (a CSS grayscale on the canvas), and the card
  follows 1.5 s later (owner, 2026-10-30).
- **Broke down** — the Recovery card's "end run" calls `_endRun('broke')`.
- **Towel** — `#pm-towel` in a live story run's pause menu, two clicks within 3 s (the job-cancel
  pattern).
- **Win** — `_renderRunHud` ends the run once every requisition line is done and the last result card
  is put away. A save written on that card resumes straight into the win.
- **The summary** — the title carries the in-game day ("you made it in 3 days", "you crashed on day
  3"), then playtime as "xh yym" in real time (owner, 2026-10-30: show both). Then jobs done, rank
  counts D·C·B·A·S, good deeds of 6, the requisition once open, money earned / spent / wallet, and
  the truck's three worst parts (damage-screen.js `worstParts`, the same ranking as the damage screen).
- **New run state** — economy.js `runEconomy.ranks` and `.spent` (earned = wallet + spent − start
  cash); main.js `_playedS`, counted while a live run is unpaused, carried in the run save.
- **Lives** — none: DESIGN.md SM-INV-1, "the default mode has no lives", and no setting grants any.
- Smoke: cdp-smoke `endings` drives all four roads (towel, crash, broke down, win), checks the save is
  gone and "continue" is not offered, and checks playtime counts while driving and stops while paused.

## Open

- The card wording: every title and row label is a PLACEHOLDER.
