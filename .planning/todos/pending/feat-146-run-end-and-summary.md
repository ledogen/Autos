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

- [ ] A fatal crash in story mode ends the run on the death card. Free roam is untouched (respawn
      stays a free-roam tool — SM-INV-1 lives clause).
- [ ] Recovery's "end run — you broke down" goes to the summary, not straight to the menu.
- [ ] The pause menu has "throw in the towel" in story mode only, behind one confirm.
- [ ] Completing the FEAT-103 requisition ends the run on the win card.
- [ ] All three roads reach the same summary, and it returns to the main menu.
- [ ] If FEAT-42's run slot exists by then, every ending deletes it.
- [ ] `node test/cdp-smoke.mjs` drives all three endings without a console error.

## Open

- The win/towel card wording.
- Whether the lives clause (a difficulty setting) is in the alpha. If it is, a fatal crash with a life
  in hand is not an ending.
