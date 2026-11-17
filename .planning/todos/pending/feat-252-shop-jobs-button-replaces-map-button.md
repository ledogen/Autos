---
id: FEAT-252
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "It doesn't really make sense to have a jobs tab in the shops. I think we should just put a jobs button up at the top. Since it has to open the map anyway, it can't live on a tab, so a button is more appropriate. Just replace the map button with the jobs button."
relates: UI-STYLE.md
---
lane: unplaced

# FEAT-252: Shops: a Jobs button at the top replaces the Map button; no Jobs tab

## Next steps
Owner: look at a farm / shop with an offer up (branch land/pad-menus). The orchestrator runs the smoke at landing.

## Summary
The Jobs tab only opens the map, so it should be a button. It takes the place of the Map button at the top of the shop screen.

## Description
Check the pad binding for the old Map button still works under its new name.

Built: the head button reads "jobs" and does what the tab's "go to jobs" did (closes the shop, the offer card over the map; declining returns to the shop). It shows only while the shop has live offers; with none there is no button, so the shop's plain Map button is gone (no other route to the map from inside the screen; M / View still open it behind). The service screen's `openMap` hook and `_jobs()` are deleted. Smoke steps and the soak click `[data-act=jobs]` directly.

## Tracker
- [x] Jobs tab gone
- [x] Top button reads Jobs and opens the job map
- [x] Pad and keyboard both reach it (the button is in the card's nav list; D-pad / A, Enter)
- [ ] Smoke green (orchestrator at landing)
