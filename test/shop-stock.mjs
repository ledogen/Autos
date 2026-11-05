// test/shop-stock.mjs — SM-3 / FEAT-137 rotating shelf gate (owner, 2026-10-22).
//
//   1. Rolls over many shop-hours: the fill rate, and each item's share of the fills following its
//      data/stock-weights.js weight; nothing outside the table, never a massless 'none' part, and
//      every stocked id sellable (a part, or an item with a price). Mission rewards share the table:
//      over many draws a source's bonus rewards follow the same weights (unlisted = 1).
//   2. Condition: new at P_NEW, otherwise used inside USED_COND; non-part items carry none.
//   3. Lifetimes inside LIFE_H.
//   4. Mean occupancy of a shelf run hour by hour (reported; checked against the two-state estimate).
//   5. Same seed → same shelf; another seed → another.
//   6. Buying empties the slot; an item is gone once its time is up.
//   7. FEAT-165: every shop, every hour, ends its shelf with the ALWAYS tires, new; buying one leaves it.
//
// Pure node: no THREE, no DOM.
import { rollSlot, startShelves, shelf, take, shelfPrice, runShelves } from '../src/shop-stock.js'
import { SHELF_SLOTS, P_FILL, LIFE_H, P_NEW, USED_COND, ITEM_PRICE, ALWAYS } from '../data/shop-stock.js'
import { STOCK_WEIGHT, REWARD_ONLY } from '../data/stock-weights.js'
import { PARTS } from '../data/parts.js'
import { ITEMS } from '../data/items.js'
import { REWARDS } from '../data/offers.js'
import { pickReward } from '../src/offer-board.js'
import { mulberry32 } from '../src/seed.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}
/** |got − want| inside 4 standard errors of a binomial share over n draws. */
const share = (label, hits, n, want) => {
  const got = hits / n, sd = Math.sqrt(want * (1 - want) / n)
  check(`${label}: ${(got * 100).toFixed(2)}% ≈ ${(want * 100).toFixed(2)}%`, Math.abs(got - want) < 4 * sd + 1e-4)
}

// ── 1. Roll statistics ────────────────────────────────────────────────────────────────────────
const SHELF = Object.fromEntries(Object.entries(STOCK_WEIGHT).filter(([id]) => !REWARD_ONLY.has(id)))
const bad = Object.keys(SHELF).filter(id => !ITEMS[id] || !(PARTS[id] ? PARTS[id].massKg > 0 : ITEM_PRICE[id] > 0))
check('every stocked id is a carried part or a priced item', bad.length === 0, bad.join())
startShelves(12345)
const fills = []
let rolls = 0
for (let shop = 0; shop < 40; shop++) {
  for (let h = 0; h < 20000; h++) {
    rolls++
    const e = rollSlot(`autoShop:${shop}`, h, h % SHELF_SLOTS)
    if (e) fills.push(e)
  }
}
const pFill = fills.length / rolls
check(`fill rate ${pFill.toFixed(4)} ≈ P_FILL ${P_FILL}`, Math.abs(pFill - P_FILL) < 0.003)
const W = Object.values(SHELF).reduce((a, w) => a + w, 0)
const n = {}
for (const e of fills) n[e.id] = (n[e.id] ?? 0) + 1
check('nothing outside the table, nothing reward-only', Object.keys(n).every(id => SHELF[id] > 0))
for (const [id, w] of Object.entries(SHELF)) share(`shelf ${id}`, n[id] ?? 0, fills.length, w / W)

// Rewards: every source's pool at every gate, drawn many times, follows the same weights.
for (const src of [...new Set(REWARDS.flatMap(r => r.pools))]) {
  for (const gate of ['C', 'B', 'A', 'S']) {
    const at = REWARDS.filter(r => r.pools.includes(src) && r.gates.includes(gate))
    if (at.length < 2) continue
    const rand = mulberry32(7), N = 40000, got = {}
    for (let i = 0; i < N; i++) { const id = pickReward(at, rand()).id; got[id] = (got[id] ?? 0) + 1 }
    const tw = at.reduce((a, r) => a + (STOCK_WEIGHT[r.id] ?? 1), 0)
    for (const r of at) share(`reward ${src}/${gate} ${r.id}`, got[r.id] ?? 0, N, (STOCK_WEIGHT[r.id] ?? 1) / tw)
  }
}

// ── 2. Condition ──────────────────────────────────────────────────────────────────────────────
const partFills = fills.filter(e => PARTS[e.id])
const pNew = partFills.filter(e => e.cond === 1).length / partFills.length
check(`new ${(pNew * 100).toFixed(1)}% ≈ ${P_NEW * 100}%`, Math.abs(pNew - P_NEW) < 0.02)
const used = partFills.filter(e => e.cond !== 1).map(e => e.cond)
check(`used condition inside ${USED_COND.join('–')}`, used.every(c => c >= USED_COND[0] && c < USED_COND[1]))
const mean = used.reduce((a, b) => a + b, 0) / used.length
check(`used condition evenly spread (mean ${mean.toFixed(3)})`, Math.abs(mean - (USED_COND[0] + USED_COND[1]) / 2) < 0.01)
check('non-part items carry no condition, and a price', fills.filter(e => !PARTS[e.id]).every(e => e.cond === null && shelfPrice(e) === ITEM_PRICE[e.id]))
const p = partFills.find(e => e.cond !== 1)
check('a used part costs its price × condition', Math.abs(shelfPrice(p) - PARTS[p.id].price * p.cond) < 1e-9)

// ── 3. Lifetimes ──────────────────────────────────────────────────────────────────────────────
let lifeOk = true
for (let h = 0; h < 200000; h++) {
  const e = rollSlot('life', h, 0)
  if (e && !(e.expiresAt - h >= LIFE_H[0] && e.expiresAt - h <= LIFE_H[1])) lifeOk = false
}
check(`lifetimes inside ${LIFE_H.join('–')} h`, lifeOk)

// ── 4. Occupancy ──────────────────────────────────────────────────────────────────────────────
startShelves(777)
let filled = 0, samples = 0
for (let h = 0; h < 40000; h++) {
  filled += shelf('occ', h + 0.5).slice(0, SHELF_SLOTS).filter(Boolean).length
  samples++
}
const occ = filled / samples
// Two-state estimate: an empty slot waits (1 − p)/p hours on average (the roll the hour it empties
// counts); a fill lasts the mean life rounded up to the next whole hour (expiry is checked hourly).
const life = (LIFE_H[0] + LIFE_H[1]) / 2 + 0.5, wait = (1 - P_FILL) / P_FILL
const est = SHELF_SLOTS * life / (life + wait)
console.log(`       mean occupancy ${occ.toFixed(2)} of ${SHELF_SLOTS} slots (estimate ${est.toFixed(2)})`)
check('mean occupancy as the numbers imply', Math.abs(occ - est) < 0.15)

// ── 5. Determinism ────────────────────────────────────────────────────────────────────────────
const snap = (seed) => { startShelves(seed); return JSON.stringify([100, 130, 175.5].map(t => shelf('shopA', t))) }
check('same seed, same shelf', snap(42) === snap(42))
check('another seed, another shelf', snap(42) !== snap(43))
startShelves(42); shelf('shopA', 100)
const revisit = JSON.stringify(shelf('shopA', 130))
startShelves(42); shelf('shopA', 100); shelf('shopA', 110); shelf('shopA', 120)
check('a revisit agrees however often it was looked at in between', JSON.stringify(shelf('shopA', 130)) === revisit)

// ── 6. Buying and expiry ──────────────────────────────────────────────────────────────────────
startShelves(9)
let t = 200, s = shelf('buy', t).slice(0, SHELF_SLOTS)
while (!s.some(Boolean)) s = shelf('buy', ++t).slice(0, SHELF_SLOTS)
const i = s.findIndex(Boolean), e = s[i]
take('buy', i)
check('buying empties the slot', shelf('buy', t)[i] === null && runShelves.shops.buy.slots[i] === null)
startShelves(9)
s = shelf('buy', t)
check('…and the same shelf without the purchase still has it', s[i]?.id === e.id)
check('still there just before its time is up', shelf('buy', e.expiresAt - 0.01)[i]?.expiresAt === e.expiresAt)
check('gone once it is', shelf('buy', e.expiresAt)[i]?.expiresAt !== e.expiresAt)

// ── 7. The tires every shop always has (FEAT-165) ──────────────────────────────────────────────
let always = true
for (const seed of [1, 2, 3, 4, 5]) {
  startShelves(seed)
  for (const shop of ['autoShop:a', 'autoShop:b', 'autoShop:c']) for (let h = 0; h < 24 * 12; h += 0.5) {
    const tail = shelf(shop, h).slice(SHELF_SLOTS)
    if (tail.length !== ALWAYS.length || tail.some((e, k) => e?.id !== ALWAYS[k] || e.cond !== 1)) always = false
  }
}
check(`every shop, every half hour of 12 days × 5 seeds, has ${ALWAYS.join(' and ')}, new`, always)
startShelves(3)
const at = shelf('autoShop:a', 50).length - 1
take('autoShop:a', at)
check('buying one leaves it on the shelf', shelf('autoShop:a', 50)[at]?.id === ALWAYS.at(-1) && runShelves.shops['autoShop:a'].slots.length === SHELF_SLOTS)

console.log(fails ? `\n${fails} FAILED` : '\nshop-stock gate: ALL OK')
process.exit(fails ? 1 : 0)
