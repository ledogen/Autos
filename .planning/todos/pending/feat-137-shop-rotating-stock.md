---
id: FEAT-137
type: feature
status: open
severity: minor
opened: 2026-10-21
source: owner, 2026-10-21 — "as with all sold auto parts, only sometimes not always. We should probably come up with a stock table with probabilities for items that will rotate and be on sale"; mechanism ruled 2026-10-22
relates: SM-3, FEAT-115 (bed upgrades as parts — "a shop stocks a subset"), FEAT-69 (repair-economy prices), FEAT-121 (item tracker)
---

# FEAT-137: Rotating shop stock — what a shop has on the shelf today

## Why

Today the service center (`src/service.js`, `src/service-screen.js`, feature/parts) sells **every**
part in `data/parts.js` at every auto shop, every visit. The owner ruled that sold auto parts — and
shop items such as the worn spare and the tire plug kit — are on sale **only sometimes**. A part
being missing from today's shelf is what makes a reward or a roadside find land as an event
(SM-INV-7), and it gives a reason to visit a second shop.

## Ruled (owner, 2026-10-22)

"Think shade tree mechanic and you pulled up without an appointment." A very limited selection with
nothing guaranteed: some brakes, a couple of tires, a wheel or two, maybe a wheel-and-tire combo. Rarely
suspension, shocks, an anti-roll bar, a radiator or a lift kit; exceedingly rarely a differential or an
engine. Mostly used, occasionally new. The point: a player checks the map, sees the LSD or the off-road
suspension they want, and either races over or plans a mission or two to fund it before it is gone.

- **Mechanism:** each auto shop has **4 shelf slots**. Every game hour, each EMPTY slot rolls (most rolls
  come up empty). A filled slot holds one item until its own timer runs out, **6–48 h**. Buying empties it.
- **Visible from the map**, each item with its time left. In-world you rang them, the same way you know
  the missions.
- **Repairs never come off the shelf** (they are labour). Replace-only parts (tires, pads/shoes,
  headlights, air filter) are bought here or exchanged from your own inventory; repairable ones
  (springs, shocks, radiator, wheels, engine, transmission, armor) go to at most **80% in 5% steps**,
  so new is the only way to 100%. Alignment is an adjustment: always back to 100%.
- **Numbers** (fill chance, category and rarity weights, used/new split, used condition range) are
  proposed as [DEFAULT] in the build and go to the owner to approve or modify.

Being built on `feature/parts-shop` (off feature/parts), with the service screen split into My Vehicle /
Parts Shop / My Items.

## Acceptance

- [ ] The owner approves the [DEFAULT] numbers.
- [ ] The Parts Shop shows only the shelf, each item with condition, price and time left; the map
      shows the same.
- [ ] Rolls are seeded per (run, shop, hour), so a revisit agrees and a gate can pin them.
- [ ] A headless gate pins the frequencies, the 6–48 h lifetimes, expiry and buying.
