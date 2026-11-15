---
id: FEAT-205
type: feature
status: open — built and on main (9bed46d7); waiting on the owner's try (owed card feat205-try)
severity: minor
opened: 2026-11-13
source: owner, 2026-11-13 (inbox) — "dont remember if i wrote this down yet but alpha feature is if you beat the game we save your vehicle configuration to the save file so you can load up your winning truck in freeroam. not urgent."
relates: FEAT-146 (the run ends), FEAT-42 (saves), FEAT-103 (the expedition camp is the win), run-shape.md
---
lane: A

# FEAT-205: Beating the game saves your truck — load the winning truck in free roam

## Next steps
Built on feature/run-shape (unlanded). Owner: try it (owed card feat205-try).
Lane A, after FEAT-146's win path. Not urgent (owner). Not written down before this: no earlier ticket or design note carries it.

## Summary
When a run is won, the truck's configuration is written to the save file. Free roam can then load that truck.

## Description
- **Saved:** the vehicle configuration only: the fitted parts (tires, wheels, suspension, differential, gearbox, mods) and their condition. No world data goes in a save (standing rule: every world is generated cold).
- **Where:** the same storage the saves use (FEAT-42).
- **Free roam:** a way to pick "your winning truck" beside the stock one.

## Tracker
- [x] A win writes the truck configuration to the save
- [x] Free roam offers the saved truck and builds it
- [x] A gate round-trips a configuration through the save

## Decisions
- 2026-11-13, owner: an alpha feature, not urgent.

## Open questions
- One winning truck or a list? Built: ONE, the latest win replaces it (ticket default; a list is a later change).
- Wear? Built: loads NEW. Free roam wipes damage on every seat, so wear would not survive a reset anyway; the fitted parts and gearbox are what carry.

## Files
`src/save.js` · `src/main.js` · the free-roam menu

## Log
- 2026-11-13: minted from the owner's inbox by the orchestrator. Nothing built.
- 2026-11-14: built. `putTruck`/`loadTruck` in src/save.js (own key `autos-truck/1`, survives the run's end); `_endRun('win')` writes parts snapshot + gearbox; free-roam setup page gets a `truck` row (stock / winning truck, shown only when one is saved). Free roam now always starts on stock parts (`partsSystem.start()`) unless the winner is picked. Gate: run-save.mjs extended. No DEC conflicts (DEC-008 allows exactly this).
