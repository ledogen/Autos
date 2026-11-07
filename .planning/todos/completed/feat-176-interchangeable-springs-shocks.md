---
id: FEAT-176
type: feature
status: closed
severity: minor
opened: 2026-11-06
source: owner, 2026-11-06 playtest (relayed verbatim by the orchestrator)
relates: data/parts.js (spring/shock families), FEAT-168 (shelf slots), FEAT-165
---
lane: B

# FEAT-176: Front and rear springs and shocks are interchangeable

> I think we can make front and rear springs and shocks interchangeable. Having only one part type fitting in more
> slots gives the player more opportunities to get the part that they need and fix up their truck.

One spring part and one shock part, each fitting any corner. Where front and rear values differ today, decide what
the single part carries (the corner's stock rate stays per-axle, the part scales it), and flag any rating change.

## Acceptance
- [ ] A spring (shock) off the shelf or out of the inventory fits any of the four corners.
- [ ] The truck's stock front/rear behaviour is unchanged (physics fingerprint identical with stock parts).
- [ ] Shelves and rewards stop offering front/rear variants; existing saves with old ids still load.

## Work log

**2026-11-07, Lane B — built on feature/machine, not landed.**

- **Six parts become three springs and three shocks** (data/parts.js): `springsOEM / springsHD / springsSport`,
  `dampersOEM / dampersHD / dampersSport`. Both axle sockets take them (`takes: 'springs'` / `'dampers'`, the tire
  pattern), so any one fits front or rear.
- **What the single part carries:** both axles' values, the ones the two parts had. A fit writes only its socket's
  axle (src/parts.js `_fit`: a key ending in the other axle is skipped). So a heavy-duty spring is 46 kN/m on the
  front and 52 kN/m on the rear, as before. Stock, heavy-duty and sport behave exactly as they did; no rating
  changed. The sport spring's lowering `drop` is per axle too (59 mm front, 54 mm rear).
- **Changed, for the owner to overrule:**
  - Mass is the old pair's mean: stock springs 15 kg (was 14 front / 16 rear), heavy-duty 19 kg (17 / 21). Shocks
    were already equal.
  - Shelf and reward weights (data/stock-weights.js): each new part weighs the front + rear pair's sum (stock 8,
    sport 2, heavy-duty 0.5). Springs and shocks keep the same share of a shelf, and every one of them now fits.
  - Names drop "front" / "rear". The descriptions became axle-neutral (the HD spring was "Hold the nose up…" and
    "An extra leaf…"; now "Stiffer springs. They hold the truck up under a load, and buck over bumps when empty.").
  - Rewards by category: `PART_REWARD_CAT` keys are the two new slots.
- **Old saves:** `RENAMED` (data/parts.js) maps every retired id to its part; `loadRun` (src/save.js) renames them
  anywhere in the record, as a value or a key. Pinned in test/run-save.mjs.
- **Gates:** parts (new: a spring needs its axle named, refuses a shock socket, and on the front writes the front
  rate only), service, shop-stock, run-save and the other light affected gates (21) green. The 9 heavy world gates
  are affected only through data/offers.js's import closure (a category map); not run.

## Resolution

**Closed on evidence (Lane B, 2026-11-07).** Landed d5c03b3a. One springs and one shocks part per family; either
axle takes it and writes only its own axle's values. Stock behaviour is unchanged by construction (each stock part's
patch equals RANGER_PARAMS, test/parts.mjs; the physics fingerprint never loads parts). Shelves and rewards list only
the merged parts; old save ids are renamed on load (test/run-save.mjs). Flags for the owner (masses averaged, shelf
weights summed, axle-neutral names) are in the work log.
