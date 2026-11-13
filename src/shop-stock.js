// ── SM-3 / FEAT-137: the rotating shelf — what each auto shop has in stock right now ─────────────
//
// The numbers and the intent are data/shop-stock.js; what turns up, data/stock-weights.js. This runs them:
//   • Each shop has SHELF_SLOTS slots, `{ id, cond, expiresAt } | null`. Every whole game hour each
//     EMPTY slot rolls (an expired item empties its slot first, the same hour).
//   • A roll is a pure function of (run seed, shop POI id, game hour, slot) — mulberry32 over seedFor —
//     so a revisit agrees and the gate is reproducible.
//   • Lazy: a query rolls every hour from the shop's last rolled hour up to now. The catch-up is capped
//     at the longest shelf life: anything older would have expired anyway. A shop looked at for the
//     first time starts that far back, so it is already stocked as if it had been open all along.
//   • Buying empties the slot (take()).
//   • FEAT-165/168: after the slots, the ALWAYS rows (data/shop-stock.js) — new, never expiring, never
//     emptied — so a shop is never out of an old tire, an air filter or a plug kit.
//   • FEAT-104: the storefronts (general store, gas station, food vendor) run the same shelf with their own
//     lines (data/shop-stock.js STOREFRONT). Each takes its POI type; the auto shop is the default.
//
// Run-layer state (SM-INV-12: run-layer randomness stays free) is a plain module object beside
// runEconomy / runInventory, so it follows them into any save. main.js rolls the run seed at run start
// (onRegionLive, as it does the jalopy's). Pure: no THREE, no DOM.

import { PARTS, BEAD } from '../data/parts.js'
import { ITEMS } from '../data/items.js'
import { SHELF_SLOTS, P_FILL, LIFE_H, P_NEW, USED_COND, ITEM_PRICE, ALWAYS, STOREFRONT } from '../data/shop-stock.js'
import { STOCK_WEIGHT, REWARD_ONLY } from '../data/stock-weights.js'
import { mulberry32, seedFor, hash32 } from './seed.js'

export const runShelves = {
    seed: 0,
    shops: {},      // POI id → { slots: [entry | null × SHELF_SLOTS], rolledTo: whole game hour }
}

const CATCH_UP_H = LIFE_H[1]
const row = (id) => Object.freeze({ id, cond: PARTS[id] ? 1 : null, expiresAt: Infinity })   // an item has no condition (rollSlot)

/** What can fill a slot: every id the stock table weighs above nothing. */
const STOCK = Object.entries(STOCK_WEIGHT).filter(([id, w]) => w > 0 && !REWARD_ONLY.has(id))

/** FEAT-104: per shop type, what a slot rolls and what is always there. A storefront's rolled lines sit on
 *  the auto shop's scale: the rest of STOCK's weight is a roll that turns up nothing (null). A storefront
 *  with no rolled lines has no slots at all. */
const SCALE = STOCK.reduce((a, [, w]) => a + w, 0)
const KINDS = { autoShop: { stock: STOCK, always: ALWAYS.map(row) } }
for (const [type, { always, weights = {} }] of Object.entries(STOREFRONT)) {
    const lines = Object.entries(weights)
    KINDS[type] = { stock: lines.length ? [...lines, [null, SCALE - lines.reduce((a, [, w]) => a + w, 0)]] : [], always: always.map(row) }
}
/** The POI types that sell: the auto shop and the storefronts. */
export const SHOP_TYPES = new Set(Object.keys(KINDS))
const slotsOf = (type) => KINDS[type].stock.length ? SHELF_SLOTS : 0

const pick = (pairs, r) => {
    r *= pairs.reduce((a, [, w]) => a + w, 0)
    return pairs.find(([, w]) => (r -= w) < 0)?.[0] ?? pairs.at(-1)[0]
}

/** One slot's roll at whole hour `h` at a shop of `type`: what turns up, or null (most hours). */
export function rollSlot (poiId, h, slot, type = 'autoShop') {
    const rand = mulberry32(seedFor(runShelves.seed, 'shelf', hash32(String(poiId)), h, slot))
    if (rand() >= P_FILL) return null
    const span = ([lo, hi]) => lo + (hi - lo) * rand()
    const id = pick(KINDS[type].stock, rand())
    if (!id) return null   // FEAT-104: a storefront's roll that lands on nothing it sells
    const cond = PARTS[id] ? (rand() < P_NEW ? 1 : span(USED_COND)) : null
    return { id, cond, expiresAt: h + span(LIFE_H) }
}

/** A new run: a new seed, every shelf unseen. */
export function startShelves (seed) {
    runShelves.seed = seed >>> 0
    runShelves.shops = {}
}

/** Shop `poiId`'s shelf at game time `nowH` (daySystem.clockH): its slots (null = empty; SHELF_SLOTS, or
 *  none at a storefront that rolls nothing), then its always rows (expiresAt Infinity). */
export function shelf (poiId, nowH, type = 'autoShop') {
    const H = Math.floor(nowH)
    let s = runShelves.shops[poiId]
    if (!s || s.rolledTo < H - CATCH_UP_H) s = runShelves.shops[poiId] = { slots: new Array(slotsOf(type)).fill(null), rolledTo: H - CATCH_UP_H }
    for (let h = s.rolledTo + 1; h <= H; h++) {
        for (let i = 0; i < s.slots.length; i++) {
            if (s.slots[i]?.expiresAt <= h) s.slots[i] = null
            s.slots[i] ??= rollSlot(poiId, h, i, type)
        }
    }
    s.rolledTo = Math.max(s.rolledTo, H)
    return [...s.slots.map(e => e && e.expiresAt > nowH ? e : null), ...KINDS[type].always]
}

/**
 * GAME-FEEL REVIEW 2026-10-24 (R-24, owner: "a new stock timer … don't want them to wait for an empty
 * roll"): the game hour the NEXT item lands on this shelf, or null when nothing is due within
 * CATCH_UP_H. The rolls are a pure function of (seed, shop, hour, slot), so the future is readable:
 * walk each slot forward from the first hour it is empty (now, or when its item expires) to the first
 * hour that rolls something. Exact unless a purchase empties a slot early — then the real answer is sooner.
 */
export function nextStockH (poiId, nowH, type = 'autoShop') {
    const H = Math.floor(nowH)
    const slots = shelf(poiId, nowH, type)
    let best = null
    for (let i = 0; i < slotsOf(type); i++) {
        const from = slots[i] ? Math.ceil(slots[i].expiresAt) : H + 1
        for (let h = from; h <= H + CATCH_UP_H && (best === null || h < best); h++) {
            if (rollSlot(poiId, h, i, type)) { best = h; break }
        }
    }
    return best
}

/** Bought: the slot empties (and rolls again from the next hour). An always row stays. */
export function take (poiId, slot) {
    const s = runShelves.shops[poiId]
    if (s && slot < s.slots.length) s.slots[slot] = null
}

/** A shelf item's price before the day tier: a part's price × its condition (new = 1), or the item's. */
/** A used part costs its price × condition. A mounted tire is priced as its parts (owner, 2026-10-23):
 *  the tire at its condition, a new wheel, and the bead job that mounted them. */
export const shelfPrice = (e) => {
    const m = PARTS[e.id]?.mounted
    if (m) return PARTS[m.tire].price * e.cond + PARTS[m.wheel].price + BEAD.price
    return PARTS[e.id] ? PARTS[e.id].price * e.cond : ITEM_PRICE[e.id]
}

/** How the shelf names an item. */
export const shelfName = (e) => PARTS[e.id]?.name ?? ITEMS[e.id].name
