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
export const P_FILL = 0.037           // per empty slot per game hour
export const LIFE_H = [6, 48]         // an item's shelf life, uniform
export const P_NEW = 0.15             // otherwise used:
export const USED_COND = [0.4, 0.85]  //   condition, uniform

/** FEAT-165 (owner 2026-11-04, "i keep tearing through tires over the first day and cant find a place to
 *  pick up new ones … make sure shops always offer standard/old tires but increase the price a little"):
 *  what EVERY shop always has, new, listed after the rotating slots. Buying one never empties it.
 *  FEAT-168 (owner, 2026-11-05): the true needs — the old tire, the air filter ("you basically will need
 *  the air filter by day 3 and its not a guaranteed spawn - not fun") and the plug kit [DEFAULT reading
 *  of "patch kit"]. The standard tire went back to the rotating slots. */
export const ALWAYS = ['tireOld', 'airFilterStock', 'tirePlugKit']

/** Shelf items that aren't parts: no condition, priced here. */
export const ITEM_PRICE = { tirePlugKit: 7, compressor: 20, quickJack: 30,   // owner, 2026-10-22
    zipTies: 10, stopLeak: 10,  // owner, 2026-10-24
    hiLiftJack: 20 }            // FEAT-138 [DEFAULT]: the middle of the owner's $10–30 (2026-10-24)
