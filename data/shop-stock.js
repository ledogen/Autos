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

export const SHELF_SLOTS = 4
export const P_FILL = 0.06            // per empty slot per game hour
export const LIFE_H = [6, 48]         // an item's shelf life, uniform
export const P_NEW = 0.15             // otherwise used:
export const USED_COND = [0.4, 0.85]  //   condition, uniform

/** FEAT-165 (owner 2026-11-04, "i keep tearing through tires over the first day and cant find a place to
 *  pick up new ones … make sure shops always offer standard/old tires but increase the price a little"):
 *  new tires EVERY shop always has, listed after the rotating slots. Buying one never empties it. Their
 *  price rise is the parts' own (data/parts.js tireOld / tireStandard), so the shelf, the map card and a
 *  resale all agree. */
export const ALWAYS = ['tireOld', 'tireStandard']

/** Shelf items that aren't parts: no condition, priced here. */
export const ITEM_PRICE = { tirePlugKit: 7, compressor: 20, quickJack: 30,   // owner, 2026-10-22
    zipTies: 10, stopLeak: 10,  // owner, 2026-10-24
    hiLiftJack: 20 }            // FEAT-138 [DEFAULT]: the middle of the owner's $10–30 (2026-10-24)
