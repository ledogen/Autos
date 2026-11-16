---
id: BUG-183
type: bug
status: closed
severity: major
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "I started a new game chose to go into the tour tutorial Drove until I got to the gas station and was filling up then I decided I don't want to play the tutorial and skipped it It skipped to the burger joint with more money in my pocket and the fuel dialogue was still open and I was able to continue pumping I Feel like we're lacking some sort of Event or state or checkpoint system to ensure that every variable is set properly when We leave story mode and come back into it or when we go to different parts of the tutorial and then skip it, etc. Definitely don't want a bunch of exploits to be possible because of silly oversights. If there's a way that other games handle this, maybe we should adopt something similar Otherwise I guess just paper over all the holes"
relates: FEAT-184, FEAT-229, DEC-148, DEC-152, src/main.js
---
lane: A

# BUG-183: Skipping the tutorial mid-pump leaves the pump open; no one place resets state on a transition

## Next steps
Orchestrator: land `land/bug-183` (then smoke main: its new `skipMenus` step). Lane A then takes FEAT-229, on top of this reset.

## Summary
Skipping the tutorial while fuelling teleports the player to the burger joint with the pump menu still open and
still pumping. The owner suspects a class: transitions (tutorial skip, tutorial stage changes, leaving and
re-entering story mode) each set some variables by hand, and nothing guarantees all of them.

## Description
The owner asks for a system, not patches: "some sort of Event or state or checkpoint system to ensure that every
variable is set properly". The usual shape in games is one transition function that every mode or stage change calls:
it closes every open menu and clears every piece of in-progress state (pump session, shop cart, tow, dialogue queue,
held brake, timers), then the new stage sets only what it needs.

### Repro (2026-11-16, `SMOKE_STEPS=boot,skipMenus node test/cdp-smoke.mjs`, tutorial seed 822480141)
Played tutorial, parked at the worst day's station, 1 s of F, two M holds. Before the fix: the pump display stayed up at
the joint and F kept pumping. Wallet $13 (the $3 pocket + the $10 check), tank 10.23 gal, the same as a clean skip: the
counter was not charged yet; "more money" is the manager's check (DEC-150), as designed. Cause: `_skipOpening` closed
only mom's sleep card; the pump settles only when the brake comes off, and the skip's seat lands parked.

### Audit: transitions × what they could strand (before the fix)
Menus registered in the new list: damage (V), map (M), inventory (Tab), service/shop (and its cart), camp/sleep card,
pump, recovery (X). Everything else in the brief's list is either closed by its transition already or derived per frame.

| Transition | Closed before | Could strand | Now |
|---|---|---|---|
| Tutorial skip, evening (same world) | dialogue + queue, firing cam, sleep card, worst day, guide | pump (open, pumping), shop + cart, damage, inventory, map, recovery, `_towOwed` | `_closeMenus` in the skip + in the seat |
| Tutorial skip, intro card / on the tutorial seed with a return seed | as above | as above until the world load | the load is a region exit/entry: `_resetRunLocals` |
| Tutorial skip, morning leg | as above | as above; a non-worst-day pump | same; that pump settles (pays its counter) |
| Stage change: evening → morning (sleep / 07:00), morning stops, paycheck | — | nothing: no seat, the player is where the menu is | unchanged (a menu up there is legitimate) |
| Opening end → free will (`_checkOpeningEnd`) | — | on the tutorial seed: the world load (exit/entry) | covered by `_resetRunLocals` |
| Leave story to menu (`pm-menu`), save & exit, give up, lab / free roam from the pause menu | service, damage, inventory, pump (discarded, not paid) | map, recovery, camp (closed separately) | `_closeMenus` in `_resetRunLocals`; the pump now settles |
| Continue / new run (region entry) | the same `_resetRunLocals` | same | same |
| Death / broke down / win (run-end card) | pause menu | every menu behind the card | `_closeMenus` when the card shows |
| Tow (`_towTo`) | recovery card | other menus; `_towOwed` from a previous seat | `_closeMenus` in the seat (`_towOwed` set again after it lands) |
| R reset, the evening's off-road reset, edge fade, map teleport, resume seat | camp card (R only), map (map teleport only) | pump (open at the old spot, still parked) and the rest | `_closeMenus` in `_reseatTruckAtSpawn` |
| Sleep (camp / mom's / truck) | its own card and fade | nothing (`_campBusy` refuses a skip mid-fade) | unchanged |

Not menus, already safe: the dialogue queue and `_cardHold` (skip and exit clear them), the latched brake, mom's fill-up
hold and the flat's cut accelerator (derived per step from the tutorial's state, off after a skip), the clock hold and
no-damage (`damageModel.held = _inTutorial()` per step), the reset countdown (`_eveningBeats` zeroes it off the
tutorial), the GPS line and start board (`_eveningGuide` cleared), the skip hint and its confirm.

### The fix
`src/main.js`: `_menus` + `_menu(name, isOpen, close)` + `_closeMenus()`, one line per menu beside its definition; every
transition calls `_closeMenus` (the seat, `_resetRunLocals`, the run-end card, the skip). The pump's settle is factored
out (`_settlePump`) and is its close: a counter is paid, not discarded. The skip undoes the worst day's own pump visit
(reset, tank back to the start fill) so the wallet and tank equal a clean skip's (DEC-150). One exploit closed on the
way: a save mid-fill held the counter's fuel unpaid (the visit is not saved), so `_saveBlock` now holds the save while
the counter is above zero, as it does for a full cart. `window.__openMenus()` is the dev handle the smoke reads.

## Tracker
- [x] Reproduced: skip mid-pump leaves the pump open
- [x] Audit: every transition and every piece of transient state it can strand, as a table in this ticket
- [x] One reset point; every transition goes through it
- [x] The smoke or a gate skips the tutorial from inside each menu and fails on anything left open

## Open questions
- Holes left open (not exploits, listed for the owner): the pause menu is not in the list (a skip while paused leaves it
  up, the player's own menu); the offer cards are not either (no giver offers during the tutorial; a region exit already
  ends them through `missionSystem.exit` / `paperRouteSystem.abort`); a skip inside a tow's ~1-frame seat lets the tow
  set `_towOwed` after the skip's close (harmless: the joint has no pump or shop to answer it).

## Files
`src/main.js` · `test/cdp-smoke.mjs` (step `skipMenus`)

## Log
- 2026-11-16: filed from the owner's inbox note.
- 2026-11-16 (Lane A, `land/bug-183` @ c39df39b): repro FAIL on main (pump left open, F pumps on); fix: the menu list +
  `_closeMenus` (main.js +38/−11). `SMOKE_STEPS=boot,skipMenus` PASS: clean · pump · shop (cart filled) · damage ·
  inventory · map · recovery, all closed, $13 and 10.23 gal on every one. Affected gates: 0 (main.js is smoke-only).
  Unverified: the full smoke on the branch (orchestrator smokes main after the merge).
- 2026-11-16: landed on main ab82e43f, full smoke green incl. skipMenus (wip/orch/smoke-1116-183.log). Closed. Left open, none an exploit: pause menu and offer cards not in the list; a skip in the one frame a tow lands can leave _towOwed set.
