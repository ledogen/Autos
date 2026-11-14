---
id: FEAT-205
type: feature
status: open
severity: minor
opened: 2026-11-13
source: owner, 2026-11-13 (inbox) — "dont remember if i wrote this down yet but alpha feature is if you beat the game we save your vehicle configuration to the save file so you can load up your winning truck in freeroam. not urgent."
relates: FEAT-146 (the run ends), FEAT-42 (saves), FEAT-103 (the expedition camp is the win), run-shape.md
---
lane: A

# FEAT-205: Beating the game saves your truck — load the winning truck in free roam

## Next steps
Lane A, after FEAT-146's win path. Not urgent (owner). Not written down before this: no earlier ticket or design note carries it.

## Summary
When a run is won, the truck's configuration is written to the save file. Free roam can then load that truck.

## Description
- **Saved:** the vehicle configuration only: the fitted parts (tires, wheels, suspension, differential, gearbox, mods) and their condition. No world data goes in a save (standing rule: every world is generated cold).
- **Where:** the same storage the saves use (FEAT-42).
- **Free roam:** a way to pick "your winning truck" beside the stock one.

## Tracker
- [ ] A win writes the truck configuration to the save
- [ ] Free roam offers the saved truck and builds it
- [ ] A gate round-trips a configuration through the save

## Decisions
- 2026-11-13, owner: an alpha feature, not urgent.

## Open questions
- One winning truck (the latest win replaces it) or a list of them?
- Does the saved truck keep its wear, or load as new?

## Files
`src/save.js` · `src/main.js` · the free-roam menu

## Log
- 2026-11-13: minted from the owner's inbox by the orchestrator. Nothing built.
