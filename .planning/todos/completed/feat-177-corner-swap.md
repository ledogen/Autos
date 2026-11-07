---
id: FEAT-177
type: feature
status: closed
severity: minor
opened: 2026-11-06
source: owner, 2026-11-06 playtest (relayed verbatim by the orchestrator)
relates: src/recovery.js (spare change, spareFitHours), src/service.js (fitLabour)
---
lane: B

# FEAT-177: Swap two mounted tires (a corner swap) without a spare

> There's currently no way to swap the positions of two mounted tires on the vehicle unless you have a spare. I
> think we should allow players to just perform a Corner Swap for2x the time that it takes to change a tire.

## Acceptance
- [ ] Parked, the player can pick two corners and swap their wheels (tire, wheel condition, flat state travel with them).
- [ ] It takes 2 × the time of one tire change.
- [ ] Pinned in a node gate (the two corners' state exchanged, the clock advanced).

## Work log

**2026-11-07, Lane B — built on feature/machine, not landed.**

- **Where:** the damage screen (V, parked) has a "Swap two wheels" button under its parts list. It opens the
  screen's pick mode: pick one corner on the pictogram or in the list, and the confirm buttons are the other three
  corners, each with the time ("Swap with the rear right — 4 h"). The factory jack is no inventory item, so the
  damage screen, where the four corners are already drawn, is its home. On the pad the D-pad reaches it like any
  card button.
- **What moves** (`swapCorners`, src/recovery.js): each corner's tire and wheel, each with its wear, and the tire's
  puncture (a flat stays flat). The tire's grip goes with it. The alignment does not: it is the hub's bent geometry,
  so a bent corner stays bent whatever wheel is on it.
- **Time** (`swapCornerHours`): 2 × the spare change, so 4 h with the factory jack, less with the compressor and the
  quick-jack exactly as the spare change (1 h with both). On the clock through the same `_afterRoadsideWork` the
  spare uses.
- **Pinned** in test/recovery.mjs §4b: FL (sport tire, worn, flat; worn wheel) ↔ RR (bent hub). Tire, wear,
  puncture, grip and wheel moved; RR's toe stayed; a corner with itself or no corner refused; 4 h bare, 1 h with
  both tools. recovery gate green. The button itself: cdp-smoke, owed (Chrome held).

## Resolution

**Closed on evidence (Lane B, 2026-11-07).** Landed d5c03b3a. The damage screen's "Swap two wheels"; tire and
wheel trade corners with wear, puncture and grip, the bent hub stays; 2 × the spare change. test/recovery.mjs §4b pins
the exchange and swapCornerHours (4 h bare, 1 h with both tools); the clock advance is main.js's shared
_afterRoadsideWork, the spare's own path.
