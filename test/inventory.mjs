// test/inventory.mjs — FEAT-122 inventory gate (SM-3).
//
// Pins the owner's 2026-10-16 structure rulings (FEAT-122 ticket, items.md Gaps #3):
//   1. Empty at run start.
//   2. Slots: consumables/food stack one kind per slot; tools, camp gear and parts take one each.
//   3. Full → the swap prompt: the grant waits as `pending`; drop frees a slot; take / leave resolve it.
//   4. Mass: stowedKg sums every unit and reaches onMassChange on every change.
//   5. Use: an item with a built effect runs it once per unit and is spent; quick slots auto-bind
//      usable items and clear when the last unit goes.
//   6. Catalog: every REWARDS id is an ITEMS id (the grant path can't miss), and no desc carries a
//      digit (SM-INV-10 — described, never scored).
//
// Pure node: no THREE, no DOM.
import { InventorySystem, runInventory } from '../src/inventory.js'
import { ITEMS } from '../data/items.js'
import { REWARDS } from '../data/offers.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}

let massKg = -1, coffees = 0
const inv = new InventorySystem({
  slotCap: () => 8,
  onMassChange: (kg) => { massKg = kg },
  effects: { coffee: () => { coffees++ } },
})

// ── 1. Empty at run start ─────────────────────────────────────────────────────────────────────
inv.grant('spareTire')
inv.start()
check('start() empties the inventory', inv.slotsUsed() === 0 && inv.pending() === null
  && runInventory.quick.every(q => q === null))
check('start() reports zero mass', massKg === 0, `got ${massKg}`)

// ── 2. Slots ──────────────────────────────────────────────────────────────────────────────────
inv.grant('coffee'); inv.grant('coffee', 2)
check('consumables stack: 3 coffees = 1 slot', inv.slotsUsed() === 1 && inv.list()[0].n === 3)
inv.grant('chiliDog')
check('food stacks by kind into its own slot', inv.slotsUsed() === 2)
inv.grant('spareTire'); inv.grant('spareTire')
check('parts take a slot each: 2 tires = 2 slots', inv.slotsUsed() === 4)
check('unknown id is refused, not stored', inv.grant('noSuchThing') === null && inv.slotsUsed() === 4)

// ── 4. Mass ───────────────────────────────────────────────────────────────────────────────────
const want = 3 * ITEMS.coffee.massKg + ITEMS.chiliDog.massKg + 2 * ITEMS.spareTire.massKg
check('stowedKg sums every unit', Math.abs(inv.stowedKg() - want) < 1e-9, `${inv.stowedKg()} vs ${want}`)
check('onMassChange saw the latest mass', Math.abs(massKg - want) < 1e-9, `${massKg} vs ${want}`)

// ── 3. Full → swap prompt ─────────────────────────────────────────────────────────────────────
for (let i = 0; i < 4; i++) inv.grant('spareTire')
check('8 of 8 slots filled', inv.slotsUsed() === 8)
check('a stacking kind already owned still fits when full', inv.grant('coffee') === 'taken')
check('a 9th slot goes to pending', inv.grant('spareTire') === 'pending' && inv.slotsUsed() === 8
  && inv.pending()?.id === 'spareTire')
check('pending adds no mass', Math.abs(inv.stowedKg() - (want + ITEMS.coffee.massKg + 4 * ITEMS.spareTire.massKg)) < 1e-9)
check('take refuses while still full', inv.takePending() === false && inv.pending() !== null)
const tireAt = inv.list().findIndex(r => r.id === 'spareTire')
inv.drop(tireAt)
check('drop frees a slot', inv.slotsUsed() === 7)
check('take succeeds after the drop', inv.takePending() === true && inv.pending() === null && inv.slotsUsed() === 8)
inv.grant('spareTire')
inv.leavePending()
check('leave clears the prompt and stores nothing', inv.pending() === null && inv.slotsUsed() === 8)

// ── 5. Use + quick slots ──────────────────────────────────────────────────────────────────────
inv.start()
inv.grant('chiliDog'); inv.grant('coffee', 2)
check('a usable item auto-binds to key 1', runInventory.quick[0] === 'coffee'
  && inv.list().find(r => r.id === 'coffee').key === 1)
check('an item with no built effect never binds', !runInventory.quick.includes('chiliDog'))
check('an item with no built effect cannot be used', inv.use('chiliDog') === false)
check('useQuick runs the effect once and spends one', inv.useQuick(0) === true && coffees === 1
  && inv.list().find(r => r.id === 'coffee').n === 1)
inv.useQuick(0)
check('the last unit goes: stack removed, quick slot cleared', coffees === 2
  && !inv.list().some(r => r.id === 'coffee') && runInventory.quick[0] === null)
check('an empty quick slot does nothing', inv.useQuick(0) === false && coffees === 2)

// ── 6. Catalog ────────────────────────────────────────────────────────────────────────────────
const missing = REWARDS.filter(r => !ITEMS[r.id]).map(r => r.id)
check('every REWARDS id is in ITEMS', missing.length === 0, missing.join(', '))
const digits = Object.entries(ITEMS).filter(([, it]) => /\d/.test(it.desc)).map(([id]) => id)
check('no item desc carries a digit (SM-INV-10)', digits.length === 0, digits.join(', '))
const bad = Object.entries(ITEMS).filter(([, it]) => !(it.massKg > 0) || !it.name).map(([id]) => id)
check('every item has a name and a positive mass', bad.length === 0, bad.join(', '))

console.log(fails === 0 ? '\ninventory gate: ALL OK' : `\ninventory gate: ${fails} FAILURE(S)`)
process.exit(fails === 0 ? 0 : 1)
