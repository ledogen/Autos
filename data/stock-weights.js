// ── SM-3 / FEAT-137: how often each item turns up — the auto-shop shelf AND mission rewards ───────
//
// ONE flat table, per item (owner, 2026-10-22). Hand-edited: the owner sets these through the items
// session's setup page and they are folded in here.
//
//   • The shelf (src/shop-stock.js): a slot that fills picks its item by these weights. An id that
//     is not here is NEVER stocked, so every id here must be sellable — a part (data/parts.js) or an
//     item with an ITEM_PRICE (data/shop-stock.js); test/shop-stock.mjs checks.
//   • Mission rewards (src/offer-board.js): a bonus picks among the source's eligible REWARDS by these
//     weights. A reward with no entry here weighs 1 there [DEFAULT].
//
// Likelihood is deliberately SEPARATE from `rarity`: rarity is only the icon tint. Stock springs are
// plain grey, yet seldom on a shade-tree shelf.
//
// Relative weights; only the ratios matter. The owner's tiers (2026-10-22): Often 10 · Sometimes 4 ·
// Rarely 1 · Hardly ever 0.25.

export const STOCK_WEIGHT = {
    // Tires and wheels
    tireOld:          10,
    tireStandard:     10,
    tireSport:        4,
    tireOffroad:      1,
    tireLT:           1,
    wheelSteel:       10,
    spareTire:        4,     // the mounted wheel + tire
    tirePlugKit:      4,
    compressor:       1,
    quickJack:        1,      // Rarely (owner, 2026-10-22)
    hiLiftJack:       1,      // Rarely (owner, 2026-10-31)

    // Brakes
    brakesFrontStd:   10,
    brakesFrontSport: 4,
    brakesFrontRace:  1,
    brakesRearStd:    10,
    brakesRearSport:  4,
    brakesRearRace:   1,

    // Springs, shocks, anti-roll bars, lift (owner, 2026-10-23)
    // FEAT-176: one part per family now fits either axle; each weighs what its front and rear pair did together, so
    // springs and shocks take the same share of a shelf as before, and every one of them fits.
    springsOEM:   8,
    dampersOEM:   8,
    springsSport: 2,
    dampersSport: 2,
    springsHD:    0.5,
    dampersHD:    0.5,
    arbFrontStock:     1,
    arbFrontSport:     0.25,
    arbRearSport:      0.25,
    liftKit:           1,

    // Engine bay and drivetrain
    airFilterStock:   10,
    headlightStock:   10,
    radiatorStock:    1,
    diffOpen:         4,
    diffClutchLSD:    1,      // FEAT-166 (owner took the default, 2026-11-06): the middle rung — commoner than the helical
    diffLSD:          0.25,
    diffWelded:       4,
    engineStock:      0.25,

    // Field repairs (owner, 2026-10-23): zip ties and stop-leak are sold at the auto shop too
    zipTies:          4,
    stopLeak:         4,

    // Camp gear (FEAT-168 camp-gear-source, owner 2026-11-06: "camp + shelf") [DEFAULT]: the four the owner
    // named are shelf stock as well as rewards; the bed layers below them are rewards only.
    shadeTarp:        1,
    tent:             1,
    awning:           1,
    cookingKit:       1,

    // Rewards only: never on the auto shop's shelf (REWARD_ONLY below)
    emergencyGas:     4,
    coffee:           10,
    chiliDog:         4,
    ductTape:         4,     // sold at the general store (FEAT-104, data/shop-stock.js STOREFRONT), not the auto shop
    energyDrink:      10,
    dinnerMeal:       4,     // eaten on the spot, never stowed
    blanket:          4,     // FEAT-168 camp rewards [DEFAULT]: the bottom rungs Sometimes, the top Hardly ever
    airMattress:      4,
    sleepingPad:      4,
    quilt:            1,
    sleepingBag:      1,
    deluxeSleepingPad: 0.25,
}

/** Weighted for mission rewards but never stocked on an AUTO SHOP's shelf (the owner's reward-only rows). Some
 *  are storefront lines: data/shop-stock.js STOREFRONT, which these weights don't touch. */
export const REWARD_ONLY = new Set(['emergencyGas', 'coffee', 'chiliDog', 'ductTape', 'energyDrink', 'dinnerMeal',
    'blanket', 'airMattress', 'sleepingPad', 'quilt', 'sleepingBag', 'deluxeSleepingPad'])
