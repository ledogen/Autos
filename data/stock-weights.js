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
// Relative weights; only the ratios matter. [DEFAULT] — derived 2026-10-22 from the first proposal's
// category weight × the part's share by rarity (common 6 : uncommon 3 : rare 1) within its category:
// tires 30, brakes 20, wheels 12, mounted spare 10, air filter 8, headlight 8, plug kit 8, springs 4,
// shocks 4, anti-roll bars 3, radiator 3, lift kit 2, compressor 2, differential 1, engine 0.5.

export const STOCK_WEIGHT = {
    // Tires and wheels
    tireOld:          8.57,
    tireStandard:     8.57,
    tireSport:        4.29,
    tireOffroad:      4.29,
    tireLT:           4.29,
    wheelSteel:       12,
    spareTire:        10,     // the mounted wheel + tire
    tirePlugKit:      8,
    compressor:       2,

    // Brakes
    brakesFrontStd:   6,
    brakesFrontSport: 3,
    brakesFrontRace:  1,
    brakesRearStd:    6,
    brakesRearSport:  3,
    brakesRearRace:   1,

    // Springs, shocks, anti-roll bars, lift
    springsFrontOEM:  1.33,
    springsFrontHD:   0.67,
    springsRearOEM:   1.33,
    springsRearHD:    0.67,
    dampersFrontOEM:  1.33,
    dampersFrontHD:   0.67,
    dampersRearOEM:   1.33,
    dampersRearHD:    0.67,
    arbFrontStock:    1.5,
    arbFrontSport:    0.75,
    arbRearSport:     0.75,
    liftKit:          2,

    // Engine bay and drivetrain
    airFilterStock:   8,
    headlightStock:   8,
    radiatorStock:    3,
    diffOpen:         0.75,
    diffLSD:          0.13,
    diffLocked:       0.13,
    engineStock:      0.5,
}
