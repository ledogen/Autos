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
//   • FEAT-165: after the slots, the ALWAYS tires (data/shop-stock.js) — new, never expiring, never
//     emptied — so a shop is never out of a tire (owner, 2026-11-04).
//
// Run-layer state (SM-INV-12: run-layer randomness stays free) is a plain module object beside
// runEconomy / runInventory, so it follows them into any save. main.js rolls the run seed at run start
// (onRegionLive, as it does the jalopy's). Pure: no THREE, no DOM.

import { PARTS, BEAD } from '../data/parts.js'
import { ITEMS } from '../data/items.js'
import { SHELF_SLOTS, P_FILL, LIFE_H, P_NEW, USED_COND, ITEM_PRICE, ALWAYS } from '../data/shop-stock.js'
import { STOCK_WEIGHT, REWARD_ONLY } from '../data/stock-weights.js'
import { mulberry32, seedFor, hash32 } from './seed.js'

export const runShelves = {
    seed: 0,
    shops: {},      // POI id → { slots: [entry | null × SHELF_SLOTS], rolledTo: whole game hour }
}

const CATCH_UP_H = LIFE_H[1]
const ALWAYS_ROWS = ALWAYS.map(id => Object.freeze({ id, cond: 1, expiresAt: Infinity }))

/** What can fill a slot: every id the stock table weighs above nothing. */
const STOCK = Object.entries(STOCK_WEIGHT).filter(([id, w]) => w > 0 && !REWARD_ONLY.has(id))

const pick = (pairs, r) => {
    r *= pairs.reduce((a, [, w]) => a + w, 0)
    return pairs.find(([, w]) => (r -= w) < 0)?.[0] ?? pairs.at(-1)[0]
}

/** One slot's roll at whole hour `h`: what turns up, or null (most hours). */
export function rollSlot (poiId, h, slot) {
    const rand = mulberry32(seedFor(runShelves.seed, 'shelf', hash32(String(poiId)), h, slot))
    if (rand() >= P_FILL) return null
    const span = ([lo, hi]) => lo + (hi - lo) * rand()
    const id = pick(STOCK, rand())
    const cond = PARTS[id] ? (rand() < P_NEW ? 1 : span(USED_COND)) : null
    return { id, cond, expiresAt: h + span(LIFE_H) }
}

/** A new run: a new seed, every shelf unseen. */
export function startShelves (seed) {
    runShelves.seed = seed >>> 0
    runShelves.shops = {}
}

/** Shop `poiId`'s shelf at game time `nowH` (daySystem.clockH): SHELF_SLOTS entries (null = empty),
 *  then the ALWAYS rows (expiresAt Infinity). */
export function shelf (poiId, nowH) {
    const H = Math.floor(nowH)
    let s = runShelves.shops[poiId]
    if (!s || s.rolledTo < H - CATCH_UP_H) s = runShelves.shops[poiId] = { slots: new Array(SHELF_SLOTS).fill(null), rolledTo: H - CATCH_UP_H }
    for (let h = s.rolledTo + 1; h <= H; h++) {
        for (let i = 0; i < SHELF_SLOTS; i++) {
            if (s.slots[i]?.expiresAt <= h) s.slots[i] = null
            s.slots[i] ??= rollSlot(poiId, h, i)
        }
    }
    s.rolledTo = Math.max(s.rolledTo, H)
    return [...s.slots.map(e => e && e.expiresAt > nowH ? e : null), ...ALWAYS_ROWS]
}

/**
 * GAME-FEEL REVIEW 2026-10-24 (R-24, owner: "a new stock timer … don't want them to wait for an empty
 * roll"): the game hour the NEXT item lands on this shelf, or null when nothing is due within
 * CATCH_UP_H. The rolls are a pure function of (seed, shop, hour, slot), so the future is readable:
 * walk each slot forward from the first hour it is empty (now, or when its item expires) to the first
 * hour that rolls something. Exact unless a purchase empties a slot early — then the real answer is sooner.
 */
export function nextStockH (poiId, nowH) {
    const H = Math.floor(nowH)
    const slots = shelf(poiId, nowH)
    let best = null
    for (let i = 0; i < SHELF_SLOTS; i++) {
        const from = slots[i] ? Math.ceil(slots[i].expiresAt) : H + 1
        for (let h = from; h <= H + CATCH_UP_H && (best === null || h < best); h++) {
            if (rollSlot(poiId, h, i)) { best = h; break }
        }
    }
    return best
}

/** Bought: the slot empties (and rolls again from the next hour). An ALWAYS row stays. */
export function take (poiId, slot) {
    const s = runShelves.shops[poiId]
    if (s && slot < SHELF_SLOTS) s.slots[slot] = null
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
