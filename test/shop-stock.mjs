// test/shop-stock.mjs — SM-3 / FEAT-137 rotating shelf gate (owner, 2026-10-22).
//
//   1. Rolls over many shop-hours: the fill rate, the category frequencies and, within a category,
//      the rarity split, each within tolerance of data/shop-stock.js; never a massless 'none' part.
//   2. Condition: new at P_NEW, otherwise used inside USED_COND; non-part items carry none.
//   3. Lifetimes inside LIFE_H.
//   4. Mean occupancy of a shelf run hour by hour (reported; checked against the two-state estimate).
//   5. Same seed → same shelf; another seed → another.
//   6. Buying empties the slot; an item is gone once its time is up.
//
// Pure node: no THREE, no DOM.
import { rollSlot, startShelves, shelf, take, shelfPrice, runShelves } from '../src/shop-stock.js'
import { SHELF_SLOTS, P_FILL, LIFE_H, P_NEW, USED_COND, SHELF_CATEGORIES, RARITY_WEIGHT, ITEM_PRICE } from '../data/shop-stock.js'
import { PARTS } from '../data/parts.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}
const catOf = (id) => Object.keys(SHELF_CATEGORIES).find(k => SHELF_CATEGORIES[k].ids?.includes(id)
  || (!PARTS[id]?.mounted && SHELF_CATEGORIES[k].slots?.includes(PARTS[id]?.slot)))

// ── 1. Roll statistics ────────────────────────────────────────────────────────────────────────
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
const W = Object.values(SHELF_CATEGORIES).reduce((a, c) => a + c.w, 0)
const byCat = {}
for (const e of fills) byCat[catOf(e.id)] = (byCat[catOf(e.id)] ?? 0) + 1
for (const [k, c] of Object.entries(SHELF_CATEGORIES)) {
  const want = c.w / W, got = (byCat[k] ?? 0) / fills.length
  const sd = Math.sqrt(want * (1 - want) / fills.length)
  check(`category ${k}: ${(got * 100).toFixed(2)}% ≈ ${(want * 100).toFixed(2)}%`, Math.abs(got - want) < 4 * sd + 1e-4)
}
check('never a massless part', fills.every(e => !PARTS[e.id] || PARTS[e.id].massKg > 0))
// Rarity inside the biggest part category: tires.
const tires = fills.filter(e => catOf(e.id) === 'tires')
const tireIds = Object.keys(PARTS).filter(id => PARTS[id].slot === 'tire' && !PARTS[id].mounted)
const tw = tireIds.reduce((a, id) => a + RARITY_WEIGHT[PARTS[id].rarity], 0)
for (const id of tireIds) {
  const want = RARITY_WEIGHT[PARTS[id].rarity] / tw, got = tires.filter(e => e.id === id).length / tires.length
  const sd = Math.sqrt(want * (1 - want) / tires.length)
  check(`tires: ${id} (${PARTS[id].rarity}) ${(got * 100).toFixed(1)}% ≈ ${(want * 100).toFixed(1)}%`, Math.abs(got - want) < 4 * sd)
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
  filled += shelf('occ', h + 0.5).filter(Boolean).length
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
let t = 200, s = shelf('buy', t)
while (!s.some(Boolean)) s = shelf('buy', ++t)
const i = s.findIndex(Boolean), e = s[i]
take('buy', i)
check('buying empties the slot', shelf('buy', t)[i] === null && runShelves.shops.buy.slots[i] === null)
startShelves(9)
s = shelf('buy', t)
check('…and the same shelf without the purchase still has it', s[i]?.id === e.id)
check('still there just before its time is up', shelf('buy', e.expiresAt - 0.01)[i]?.expiresAt === e.expiresAt)
check('gone once it is', shelf('buy', e.expiresAt)[i]?.expiresAt !== e.expiresAt)

console.log(fails ? `\n${fails} FAILED` : '\nshop-stock gate: ALL OK')
process.exit(fails ? 1 : 0)
