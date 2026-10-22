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
// Rarely 1 · Hardly ever 0.25. Rows marked [DEFAULT] are not set yet and keep the first proposal's
// category weight × rarity share.

export const STOCK_WEIGHT = {
    // Tires and wheels
    tireOld:          10,
    tireStandard:     10,
    tireSport:        4,
    tireOffroad:      1,
    tireLT:           1,
    wheelSteel:       10,
    spareTire:        4,     // the mounted wheel + tire
    tirePlugKit:      10,
    compressor:       1,

    // Brakes
    brakesFrontStd:   10,
    brakesFrontSport: 4,
    brakesFrontRace:  1,
    brakesRearStd:    10,
    brakesRearSport:  4,
    brakesRearRace:   1,

    // Springs, shocks, anti-roll bars, lift
    springsFrontOEM:  1.33,   // [DEFAULT]
    springsFrontHD:   0.67,   // [DEFAULT]
    springsRearOEM:   1.33,   // [DEFAULT]
    springsRearHD:    0.67,   // [DEFAULT]
    dampersFrontOEM:  1.33,   // [DEFAULT]
    dampersFrontHD:   0.67,   // [DEFAULT]
    dampersRearOEM:   1.33,   // [DEFAULT]
    dampersRearHD:    0.67,   // [DEFAULT]
    springsFrontSport: 0.67,  // [DEFAULT] — the sport tier, like HD
    springsRearSport: 0.67,   // [DEFAULT]
    dampersFrontSport: 0.67,  // [DEFAULT]
    dampersRearSport: 0.67,   // [DEFAULT]
    arbFrontStock:    1.5,   // [DEFAULT]
    arbFrontSport:    0.75,   // [DEFAULT]
    arbRearSport:     0.75,   // [DEFAULT]
    liftKit:          2,   // [DEFAULT]

    // Engine bay and drivetrain
    airFilterStock:   10,
    headlightStock:   10,
    radiatorStock:    1,
    diffOpen:         4,
    diffLSD:          0.25,
    diffWelded:       4,
    engineStock:      0.25,

    // Rewards only: never on the shelf (REWARD_ONLY below)
    emergencyGas:     4,
    coffee:           4,
    chiliDog:         4,
}

/** Weighted for mission rewards but never stocked on a shelf (the owner's reward-only rows). */
export const REWARD_ONLY = new Set(['emergencyGas', 'coffee', 'chiliDog'])
