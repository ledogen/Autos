// ── SM-3 / FEAT-137: what turns up on an auto shop's shelf ──────────────────────────────────────
//
// Owner's intent (2026-10-22): a shade-tree mechanic, and you pulled up without an appointment. The
// selection is very limited and nothing is guaranteed; most of it is used, now and then something is
// new. You see an LSD on the map and either race over or fund it with a mission or two before it goes.
//
// The mechanism (owner picked; src/shop-stock.js runs it): each shop has SHELF_SLOTS slots. Every game
// hour each EMPTY slot rolls, and most rolls come up empty (P_FILL). A filled slot holds one item for
// its own LIFE_H; buying it empties the slot. WHAT fills it is data/stock-weights.js (per item, shared
// with the mission rewards).
//
// Owner-approved 2026-10-22 (the setup page): the slots, P_FILL, LIFE_H, USED_COND, P_NEW.
// FEAT-168 (owner, 2026-11-05: "increase slots to 6 and on average they should carry ~3 items"): 4 → 6
// slots, and P_FILL 0.06 → 0.037 so a slot is filled half the time — mean life 27 h, mean wait
// 1/0.037 ≈ 27 h. (4 slots at 0.06 averaged 2.5; 6 at 0.06 would be 3.7.) The ALWAYS rows come on top.

export const SHELF_SLOTS = 6
// FEAT-259 (owner, 2026-11-17: "Increase the frequency at which new stock comes into the store") [DEFAULT, on the
// machine-1117-look card]: P_FILL 0.037 → 0.074 and LIFE_H 6–48 → 3–21 h. The shelf still carries ~3 rotating items
// (mean life 12.5 h against a mean wait 12.5 h), but they turn over ~1.85× as often: 3.1 → 5.8 new items per shop
// per day, each lasting 12 h on average instead of 27 h.
export const P_FILL = 0.074           // per empty slot per game hour
export const LIFE_H = [3, 21]         // an item's shelf life, uniform
export const P_NEW = 0.15             // otherwise used:
export const USED_COND = [0.4, 0.85]  //   condition, uniform

/** FEAT-165 (owner 2026-11-04, "i keep tearing through tires over the first day and cant find a place to
 *  pick up new ones … make sure shops always offer standard/old tires but increase the price a little"):
 *  what EVERY shop always has, new, listed after the rotating slots. Buying one never empties it.
 *  FEAT-168 (owner, 2026-11-05): the true needs — the old tire, the air filter ("you basically will need
 *  the air filter by day 3 and its not a guaranteed spawn - not fun") and the plug kit [DEFAULT reading
 *  of "patch kit"]. The standard tire went back to the rotating slots.
 *  FEAT-162 (2026-11-06): and the steel wheel — a collapsed wheel is replaced, never straightened, so a
 *  tow to any shop is a way out of one [DEFAULT]. */
export const ALWAYS = ['tireOld', 'airFilterStock', 'tirePlugKit', 'wheelSteel']

/** Shelf items that aren't parts: no condition, priced here. */
export const ITEM_PRICE = { tirePlugKit: 5, compressor: 20, quickJack: 30, tireIron: 30,   // tireIron: FEAT-203 [DEFAULT] = the quick-jack's price
      // owner, 2026-10-22
    zipTies: 10, stopLeak: 10,  // owner, 2026-10-24
    hiLiftJack: 20,             // FEAT-138 [DEFAULT]: the middle of the owner's $10–30 (2026-10-24)
    // FEAT-168 camp-gear-source (owner, 2026-11-06: "camp + shelf") [DEFAULT]
    shadeTarp: 15,              // owner, 2026-10-24 (the setup page; folded 2026-11-08 — was FEAT-168's $6 [DEFAULT])
    awning: 12, tent: 15, cookingKit: 15,
    // FEAT-104: the storefronts' lines (items.md). Moved here from data/offers.js REWARD_VALUE, so a reward
    // card still reads the same price. Duct tape and emergency gas are "$5–10": $8 is the reading the
    // reward card already used [DEFAULT].
    coffee: 3, energyDrink: 4, ductTape: 8, emergencyGas: 8,
    // FEAT-231 [DEFAULT]: inside the owner's ranges, the mat $5–10 (the $8 its reward card read), the bedliner $10–30
    rubberBedMat: 8, bedliner: 20,
    // FEAT-250 / DEC-377 (owner, 2026-11-17, FEAT-69 dive: "cut costs: food to about $0.35 per hour of hold"): a food
    // costs $0.35 × its satiety (data/items.js; test/inventory.mjs holds the line) — raw groceries and the raw potato by the meal they cook into.
    // Was: chili dog, burger, dinner meal, groceries $5; potato, gummy worms, candy bar $2; spicy chips $3.
    // FEAT-260's four [DEFAULT]: ±$0.05 an hour by shelf life (salad $0.30, sandwich $0.35, cookies and bread $0.40).
    chiliDog: 3.5, burger: 2.8, dinnerMeal: 2.8, groceries: 3.5, potato: 1.4, gummyWorms: 0.7, spicyChips: 1.05, candyBar: 1.05,
    salad: 1.2, deliSandwich: 2.45, cookies: 0.8, bread: 2.4,
    bagOfPeanuts: 3,            // DEC-293 (owner, 2026-11-15: "keep $3") stands over the $0.35 line ($1.05): owed on the food card
    ice: 5,                     // owner, 2026-10-22
    cooler: 20, iceKing: 65,    // FEAT-230 [DEFAULT]: the middles of the owner's $10–30 and $30–100; the owner sets them
    // FEAT-121 camp gear on the general-store shelf [DEFAULT]: the reward worths (data/offers.js REWARD_VALUE) as the
    // price, the owner sets the numbers; the Rucksack is "mid-priced" (items.md), $25 [DEFAULT]
    blanket: 4, airMattress: 5, sleepingPad: 8, sleepingBag: 10, deluxeSleepingPad: 15, rucksack: 25,
    jerryCan: 30 }              // owner, 2026-10-22: "sold at the gas station, rarely, $30" — sold full

/**
 * FEAT-104: what each storefront sells, by POI type (owner, 2026-10-07: buy only, no stock levels). Only
 * items that exist in data/items.js and have a ruled price; items.md says which store sells what.
 *   always   new, never out, listed after any slots (the auto shop's ALWAYS rule).
 *   weights  the few lines items.md sells "rarely". They roll on the auto shop's slots and on its scale:
 *            a fill lands on one of these lines as often as it would on an auto-shop part of the same
 *            weight, and the rest of the scale turns up nothing (src/shop-stock.js).
 * The tackle shop sells the coolers (FEAT-230); its fishing gear isn't an item yet. The auto shop
 * is the rows above (ALWAYS, data/stock-weights.js).
 */
export const STOREFRONT = {
    // FEAT-121 [DEFAULT]: the four bed rungs below the top are always there; the deluxe pad and the Rucksack roll
    // (Hardly ever / Sometimes, the reward weights of data/stock-weights.js). FEAT-230: ice and the cooler always (items.md §1/§2);
    // the Ice King "very rarely", a quarter of the jerry can's rarely [DEFAULT]
    // FEAT-260 (owner, 2026-11-17: "This store needs to carry more than just groceries"): the salad, the deli sandwich,
    // the cookies and the bread.
    generalStore: { always: ['coffee', 'energyDrink', 'zipTies', 'ductTape', 'potato', 'groceries', 'salad', 'deliSandwich', 'cookies', 'bread', 'blanket', 'airMattress', 'sleepingPad', 'sleepingBag',
                             'ice', 'cooler'],
                    weights: { deluxeSleepingPad: 0.25, rucksack: 1, iceKing: 0.25 } },
    farm:         { always: ['groceries'] },   // FEAT-230 slice 3: a farm sells for the first time (items.md, Groceries)
    gasStation:   { always: ['coffee', 'energyDrink', 'stopLeak', 'emergencyGas', 'bagOfPeanuts', 'gummyWorms', 'spicyChips', 'candyBar', 'ice'], weights: { jerryCan: 1 } },   // Rarely; peanuts: items.md §1d, sold at the gas station
    foodVendor:   { always: ['coffee', 'chiliDog', 'burger', 'dinnerMeal'] },
    tackleShop:   { always: ['cooler'], weights: { iceKing: 0.25 } },   // FEAT-230 (items.md §2)
}
