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
// FEAT-259 (owner, 2026-11-17: "Increase the frequency at which new stock comes into the store"): P_FILL 0.037 → 0.074.
// DEC-408 (owner, 2026-11-17: "Set the shelf life of an item a little higher, The goal should be to have 4.5 rotating
// items"): LIFE_H 3–21 h → 6–68 h (mean 37). A slot is filled a fraction (m+0.5) / (m+0.5 + 1/P_FILL − 1) of the hours
// (m = mean life: an item holds its slot to the next whole hour; the roll that fills it is the hour it appears), so 4.5 of 6
// slots = 0.75 needs m + 0.5 = 3 × (1/0.074 − 1) = 37.5. Measured (wip/food-shop/shelf-sim.mjs, 3000 h × 50 shops): 4.50
// rotating items, ≤ 2 of them 3.7 % of hours; 2.9 new items per shop per day (was 5.8 at 3 items).
export const P_FILL = 0.074           // per empty slot per game hour
export const LIFE_H = [6, 68]         // an item's shelf life, uniform
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
// FEAT-325 (arc trial, owner 2026-11-23: "The shop should always carry the v6 engine"): engineStock is the V6.
// Arc trial (owner, 2026-11-24: "always stock standard instead of old"): the standard tire is the always-stocked tire;
// the old tire is now a mission reward only.
// Owner, 2026-11-24: "the auto shop should stock all basic consumables so stock pads and shoes".
export const ALWAYS = ['tireStandard', 'airFilterStock', 'brakesFrontStd', 'brakesRearStd', 'tirePlugKit', 'wheelSteel', 'engineStock', 'rucksack']   // rucksack: owner 2026-11-24, the next pack up is always at the auto shop

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
    // FEAT-250 / DEC-377 / DEC-407 (owner, 2026-11-17: "allow +100% - 30% on the .35 cost/hr figure" and the order of the
    // places: groceries cheapest, the food vendor dear, the gas station the worst deal): $ per hour of satiety, by where it is sold.
    // Cookable groceries (potato, beans, groceries; priced by the meal they cook into) $0.25; grocery-store staples $0.27–0.33;
    // food vendor $0.50–0.60; gas-station snacks $0.67–0.70. The band is $0.245–0.70; test/inventory.mjs holds it and the order.
    // Was (DEC-377, $0.35 flat): chili dog 3.5, burger 2.8, dinner meal 2.8, groceries 3.5, potato 1.4, gummy worms 0.7,
    // spicy chips 1.05, candy bar 1.05, salad 1.2, deli sandwich 2.45 (7 h), cookies 0.8, bread 2.4 (6 h); peanuts 3 (DEC-293).
    // Arc trial (owner, 2026-11-24: beans nerfed a little, groceries buffed): heated beans 6 → 5 h, cooked groceries 10 → 12 h.
    // Beans 1.5 → 1.25 keeps them at $0.25 an hour. Groceries stay 2.5: $0.21 an hour, UNDER DEC-407's $0.245 floor on purpose
    // (owner, 2026-11-24: "i want groceries at the proposed .21 an hr").
    potato: 1, cannedBeans: 1.25, groceries: 2.5,
    apple: 0.4, cookies: 0.6, salad: 1.1, bread: 1.5, deliSandwich: 1.65,
    dinnerMeal: 4, burger: 4.4, chiliDog: 5.8, friedChicken: 7.2,
    gummyWorms: 1.4, spicyChips: 2, bagOfPeanuts: 2, candyBar: 2.1, beefJerky: 2.1, breakfastBurrito: 3.35,
    ice: 5,                     // owner, 2026-10-22
    cooler: 20, iceKing: 65,    // FEAT-230 [DEFAULT]: the middles of the owner's $10–30 and $30–100; the owner sets them
    // FEAT-121 camp gear on the general-store shelf [DEFAULT]: the reward worths (data/offers.js REWARD_VALUE) as the
    // price, the owner sets the numbers; the Rucksack is "mid-priced" (items.md), $20 (owner, DEC-487)
    blanket: 4, airMattress: 5, sleepingPad: 8, sleepingBag: 10, deluxeSleepingPad: 15, rucksack: 20,
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
    generalStore: { always: ['coffee', 'energyDrink', 'zipTies', 'ductTape', 'potato', 'cannedBeans', 'groceries', 'apple', 'beefJerky', 'salad', 'deliSandwich', 'cookies', 'bread', 'blanket', 'airMattress', 'sleepingPad', 'sleepingBag',
                             'ice', 'cooler'],
                    weights: { deluxeSleepingPad: 0.25, rucksack: 1, iceKing: 0.25 } },
    farm:         { always: ['groceries', 'apple'] },   // FEAT-230 slice 3: a farm sells for the first time (items.md, Groceries)
    gasStation:   { always: ['coffee', 'energyDrink', 'stopLeak', 'emergencyGas', 'bagOfPeanuts', 'gummyWorms', 'spicyChips', 'candyBar', 'beefJerky', 'breakfastBurrito', 'ice'], weights: { jerryCan: 1 } },   // Rarely; peanuts: items.md §1d, sold at the gas station
    foodVendor:   { always: ['coffee', 'chiliDog', 'burger', 'dinnerMeal', 'friedChicken'] },
    tackleShop:   { always: ['cooler'], weights: { iceKing: 0.25 } },   // FEAT-230 (items.md §2)
}
