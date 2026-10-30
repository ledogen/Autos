---
id: FEAT-155
type: feature
status: open
severity: minor
opened: 2026-10-30
source: owner, 2026-10-30 — "good but we should hide the truck dashboard in camp" (on FEAT-128, the key turning off at camp)
relates: FEAT-128 (camp turns the key off), FEAT-66 (camp gear at the campsite), BUG-95 (camp card flow), the HUD dock (#hud-dock, index.html)
---
lane: A

# FEAT-155: Hide the truck dashboard while in camp

## What

Making camp turns the key off (FEAT-128), but the dashboard (the HUD dock: gauges, lamps, gear,
fuel) stays on screen at the campsite. Hide it while the camp is made; bring it back when camp
breaks. Mom's and the cab card are not camp — leave those as they are unless the owner says.

## Where to look

- `src/camp.js` makes / breaks camp; `src/main.js` draws the dock. A body class set on make and
  cleared on break (`body.camp-on`), plus one CSS rule in `index.html` hiding `#hud-dock`, is the
  whole change. The run readout (deeds / due-in) is not the dashboard; keep it.

## Acceptance

- [ ] Dashboard gone while a camp is made, back on break camp; the run HUD readout stays.
- [ ] cdp-smoke's camp step passes.
