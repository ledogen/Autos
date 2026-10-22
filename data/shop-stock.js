// ── SM-3 / FEAT-137: what turns up on an auto shop's shelf ──────────────────────────────────────
//
// Owner's intent (2026-10-22): a shade-tree mechanic, and you pulled up without an appointment. The
// selection is very limited and nothing is guaranteed; most of it is used, now and then something is
// new. You see an LSD on the map and either race over or fund it with a mission or two before it goes.
//
// The mechanism (owner picked; src/shop-stock.js runs it): each shop has SHELF_SLOTS slots. Every game
// hour each EMPTY slot rolls, and most rolls come up empty (P_FILL). A filled slot holds one item for
// its own LIFE_H; buying it empties the slot.
//
// Every number here is [DEFAULT] — proposed 2026-10-22, for the owner to approve or move.

export const SHELF_SLOTS = 4
export const P_FILL = 0.06            // per empty slot per game hour
export const LIFE_H = [6, 48]         // an item's shelf life, uniform
export const P_NEW = 0.15             // otherwise used:
export const USED_COND = [0.4, 0.85]  //   condition, uniform

/**
 * Category weights on a fill. `slots` names the part slots it draws from (data/parts.js — every part
 * there with mass, so never a massless 'none'); `ids` names its items outright.
 */
export const SHELF_CATEGORIES = {
    tires:      { w: 30,  slots: ['tire'] },
    brakes:     { w: 20,  slots: ['brakesFront', 'brakesRear'] },
    wheels:     { w: 12,  slots: ['wheel'] },
    spare:      { w: 10,  ids: ['spareTire'] },          // the mounted wheel + tire
    airFilter:  { w: 8,   slots: ['airFilter'] },
    headlight:  { w: 8,   slots: ['headlight'] },
    plugKit:    { w: 8,   ids: ['tirePlugKit'] },
    springs:    { w: 4,   slots: ['springsFront', 'springsRear'] },
    shocks:     { w: 4,   slots: ['dampersFront', 'dampersRear'] },
    arb:        { w: 3,   slots: ['arbFront', 'arbRear'] },
    radiator:   { w: 3,   slots: ['radiator'] },
    lift:       { w: 2,   slots: ['lift'] },
    compressor: { w: 2,   ids: ['compressor'] },
    diff:       { w: 1,   slots: ['diff'] },
    engine:     { w: 0.5, slots: ['engine'] },
}

/** Within a category, a part is picked by its rarity. */
export const RARITY_WEIGHT = { common: 6, uncommon: 3, rare: 1 }

/** Shelf items that aren't parts: no condition, priced here (items.md §7 put the plug kit at $5–10). */
export const ITEM_PRICE = { tirePlugKit: 5, compressor: 15 }
