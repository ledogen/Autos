---
id: FEAT-196
type: feature
status: open
severity: major
opened: 2026-11-12
source: owner, 2026-11-11/12 inbox, four items — (1) "The auto shop menu is still quite cluttered and confusing under the parts shop. I think every part should be selectable. And then the options should only appear once you actually select the item. That way there's not like a thousand buttons on the screen all the time that keep grabbing the virtual cursor on pad. First you click the item then the options appear then you select the specific option you want." (2) "I noticed it's not possible to swap tires between different corners in the auto shop You have to first remove the tire by changing it for one in your inventory and then you can reinstall it It'd be nice if You just selected the tire you wish to move and then In addition to swapping for the tire in your inventory, it also showed the other three corners" (3) "Realize there's no way to repair a steel wheel that's just sitting in your inventory Adding that will definitely make the menu quite dense So if you can think of a better way, propose it to me" (4) "It's a bit tricky to select the front tire in the vehicle diagnostic screen on controller. I think both axles should go spring, body, brake, tire, then wheel in that order as you move the selection from inside to outside of the diagram."
relates: [FEAT-167, FEAT-125]
---
lane: B

# Service shop: select a part first, then its options appear (plus corner-to-corner tire swap, inventory wheel repair, diagram pad order)

## What

**1 — select, then act.** Every part row in the parts shop is one selectable item with no buttons on it.
Selecting it opens that part's options (buy, fit, repair, swap…). The pad's virtual cursor then has one target
per row instead of several.

**2 — swap between corners.** Selecting a fitted tire lists, beside the inventory tires, the other three
corners as swap targets.

**3 — repair a wheel that is in the inventory.** Proposal (orchestrator, for the owner to confirm): this falls
out of item 1 for free. Inventory parts are rows like any other; selecting a damaged steel wheel shows
"repair" among its options. No new button is on screen until the wheel is selected, so the menu gets no denser.

**4 — diagram order on the pad.** On the vehicle diagnostic diagram, both axles step spring → body → brake →
tire → wheel as the selection moves from the inside of the diagram outward.

## Acceptance

- [x] Parts shop rows carry no inline buttons; options appear on select. Pad and mouse.
- [x] A fitted tire can be moved to another corner in one action.
- [x] A damaged wheel in the inventory can be repaired at the shop (built on the proposal in 3; owner has not objected).
- [x] Diagram selection order as in 4, both axles; pad-e2e covers reaching the front tire.

## Implementation (Lane B, 2026-11-13, feature/machine)

- **1.** `src/service-screen.js`: a shelf row is one `.sv-line` button (key `s:<slot>`); selecting it opens a panel with
  the corner buttons (or buy & fit) and to inventory. My Vehicle and My Items already worked this way. The live
  preview still follows the hovered / pad-focused row (worst corner) or corner button.
- **2.** `ServiceCenter.swapCorners(a, b)` reuses the roadside's `recovery.js swapCorners` (FEAT-177): the two
  mounted pairs trade, each tire and wheel with its wear, the puncture with its tire. Priced as four hub swaps
  (`cornerSwapQuote`, $4 / 40 min at tier 1) — [DEFAULT], owner may re-price or want tire-only (bead jobs).
  Offered under a selected tire OR wheel row: "Swap corners · the wheel goes with it", the other three corners.
- **3.** A loose wheel in the inventory already had Repair. The gap was a MOUNTED pair (the spare, a pair a swap took
  off): its wheel had no repair. `ownedWheelTargets` / `ownedQuote(i, t, true)` / `repairOwned(i, t, true)`
  straighten it still mounted (REPAIRS.wheel, the setup charge, no access time). Row: "Repair the wheel".
- **4.** `menu-nav.js` asks a card's `navStep(el, dx, dy)` before the spatial nearest; `damage-screen.js` answers
  ←/→ along each axle, inside out: damper, spring, body, brake, tire, wheel (the damper, innermost, comes first;
  the body side stays on the axle it was entered from; pick mode skips what it doesn't offer).
- Gates: `test/service.mjs` §10 (swap + mounted-wheel repair). `test/pad-e2e.mjs` walks FL, RL and FR rows (green;
  its "RT launches it on the assist" check fails at 2.9 m/s on main's script too — pre-existing, not this work).
  `cdp-smoke.mjs` (store, worst day) and `run-soak.mjs` buyFood select the row before pressing its button.
