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

## Built — 2026-11-05 (feature/run-shape, Lane A; ff0c1452)

The truck's dashboard is the gauge cluster, `canvas#cluster` (src/cluster.js: speed, revs, lamps, gear, fuel).
`#hud-dock`, the ticket's first pointer, is the top-right column of wallet, deeds, clock, energy and the context
icons; that is the run readout, which stays. `body.camp-on` is set in `_enterCampScene` and cleared in
`_exitCampScene`. Every way out of a camp runs through `_exitCampScene`: break camp, R, and leaving story mode.
One CSS rule next to `stage-on`'s hides the cluster. Mom's and the cab never enter the camp scene, so they keep
it. cdp-smoke's `campGear` step checks it through the debug camp shortcut: the cluster is gone, and it comes
back on break camp.

**Owed:** the owner's look.
