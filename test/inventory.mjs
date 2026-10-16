// test/inventory.mjs — FEAT-122 inventory gate (SM-3).
//
// Pins the owner's 2026-10-16 structure rulings (FEAT-122 ticket, items.md Gaps #3):
//   1. The run starts with the kit: the equipped Pack holding the bedroll — one truck slot.
//   2. Slots: consumables/food stack one kind per slot; tools, camp gear and parts take one each.
//   3. Full → the swap prompt: the grant waits as `pending`; drop frees a slot; take / leave resolve it.
//   4. Mass: stowedKg sums every unit and reaches onMassChange on every change.
//   5. Use: an item with a built effect runs it once per unit and is spent; quick slots auto-bind
//      usable items and clear when the last unit goes.
//   6. Backpacks (items.md §2c): packed camp gear frees its truck slot but keeps its mass; a full
//      pack refuses; only camp gear packs; the equipped pack keeps a bed (swap, never remove);
//      equipping a spare moves the bed across; the equipped pack and a loaded pack can't be dropped.
//   7. Catalog: every REWARDS id is an ITEMS id (the grant path can't miss), and no desc carries a
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

// ── 1. The starting kit ───────────────────────────────────────────────────────────────────────
const KIT_KG = ITEMS.pack.massKg + ITEMS.bedroll.massKg
inv.grant('spareTire')
inv.start()
const kit = inv.list()
check('start() resets to the kit: one slot, the equipped Pack holding the bedroll', inv.slotsUsed() === 1
  && kit[0].id === 'pack' && kit[0].equipped && kit[0].contents.map(c => c.id).join() === 'bedroll'
  && inv.pending() === null && runInventory.quick.every(q => q === null))
check('start() reports the kit mass', Math.abs(massKg - KIT_KG) < 1e-9, `got ${massKg}`)

// ── 2. Slots ──────────────────────────────────────────────────────────────────────────────────
inv.grant('coffee'); inv.grant('coffee', 2)
check('consumables stack: 3 coffees = 1 slot', inv.slotsUsed() === 2 && inv.list()[1].n === 3)
inv.grant('chiliDog')
check('food stacks by kind into its own slot', inv.slotsUsed() === 3)
inv.grant('spareTire'); inv.grant('spareTire')
check('parts take a slot each: 2 tires = 2 slots', inv.slotsUsed() === 5)
check('unknown id is refused, not stored', inv.grant('noSuchThing') === null && inv.slotsUsed() === 5)

// ── 4. Mass ───────────────────────────────────────────────────────────────────────────────────
const want = KIT_KG + 3 * ITEMS.coffee.massKg + ITEMS.chiliDog.massKg + 2 * ITEMS.spareTire.massKg
check('stowedKg sums every unit', Math.abs(inv.stowedKg() - want) < 1e-9, `${inv.stowedKg()} vs ${want}`)
check('onMassChange saw the latest mass', Math.abs(massKg - want) < 1e-9, `${massKg} vs ${want}`)

// ── 3. Full → swap prompt ─────────────────────────────────────────────────────────────────────
for (let i = 0; i < 3; i++) inv.grant('spareTire')
check('8 of 8 slots filled', inv.slotsUsed() === 8)
check('a stacking kind already owned still fits when full', inv.grant('coffee') === 'taken')
check('a 9th slot goes to pending', inv.grant('spareTire') === 'pending' && inv.slotsUsed() === 8
  && inv.pending()?.id === 'spareTire')
check('pending adds no mass', Math.abs(inv.stowedKg() - (want + ITEMS.coffee.massKg + 3 * ITEMS.spareTire.massKg)) < 1e-9)
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

// ── 6. Backpacks ──────────────────────────────────────────────────────────────────────────────
// Only one non-bed camp item exists yet, so the gate brings its own (removed before the catalog checks).
ITEMS.testTarp = { name: 'Test tarp', kind: 'camp', massKg: 1, desc: 'gate only' }
const ids = (p) => inv.list()[p].contents.map(c => c.id).join()
inv.start()
inv.grant('testTarp')
check('the equipped pack can not be dropped', inv.drop(0) === false)
check('the bed can not be unpacked from the equipped pack', inv.unpackItem(0, 0) === false && ids(0) === 'bedroll')
const kg0 = inv.stowedKg()
check('packing a camp item frees its truck slot, keeps its mass', inv.packItem(1) === true
  && inv.slotsUsed() === 1 && ids(0) === 'bedroll,testTarp' && Math.abs(inv.stowedKg() - kg0) < 1e-9)
inv.grant('testTarp')
check('a full pack refuses', inv.packItem(1) === false && inv.slotsUsed() === 2)
inv.grant('coffee')
check('only camp gear packs', inv.packItem(inv.list().findIndex(r => r.id === 'coffee'), 0) === false)
check('unpack returns a packed item to a truck slot', inv.unpackItem(0, 1) === true && ids(0) === 'bedroll'
  && inv.slotsUsed() === 4)
inv.grant('bedroll')
const bedAt = inv.list().findIndex(r => r.id === 'bedroll')
check('a second bed SWAPS with the packed one, never adds', inv.packItem(bedAt) === true && ids(0) === 'bedroll'
  && inv.list()[bedAt].id === 'bedroll' && inv.slotsUsed() === 5)
// Indices shift as entries move, so every step re-finds what it needs.
const spareAt = () => inv.list().findIndex(r => r.id === 'pack' && !r.equipped)
const tarpAt = () => inv.list().findIndex(r => r.id === 'testTarp')
inv.grant('pack')
check('a granted pack arrives spare', spareAt() > 0)
inv.packItem(tarpAt(), spareAt())
check('a spare pack takes camp gear', ids(spareAt()) === 'testTarp')
check('a loaded spare pack can not be dropped', inv.drop(spareAt()) === false)
const toEquip = spareAt()
check('equipping a spare moves the bed across', inv.equip(toEquip) === true && inv.list()[toEquip].equipped
  && !inv.list()[0].equipped && ids(toEquip) === 'testTarp,bedroll' && ids(0) === '')
check('the old pack, now spare and empty, can be dropped', inv.drop(0) === true)
inv.grant('pack')
inv.packItem(tarpAt(), spareAt())
inv.grant('testTarp')
inv.packItem(tarpAt(), spareAt())
check('equip refuses a full pack with no bed in it', ids(spareAt()) === 'testTarp,testTarp' && inv.equip(spareAt()) === false)
delete ITEMS.testTarp

// ── 7. Catalog ────────────────────────────────────────────────────────────────────────────────
const missing = REWARDS.filter(r => !ITEMS[r.id]).map(r => r.id)
check('every REWARDS id is in ITEMS', missing.length === 0, missing.join(', '))
const digits = Object.entries(ITEMS).filter(([, it]) => /\d/.test(it.desc)).map(([id]) => id)
check('no item desc carries a digit (SM-INV-10)', digits.length === 0, digits.join(', '))
const bad = Object.entries(ITEMS).filter(([, it]) => !(it.massKg > 0) || !it.name).map(([id]) => id)
check('every item has a name and a positive mass', bad.length === 0, bad.join(', '))
check('the starting Pack is a pack with room beside the bed', ITEMS.pack.kind === 'pack' && ITEMS.pack.packSlots >= 2
  && ITEMS.bedroll.kind === 'camp' && ITEMS.bedroll.sleep === true)

console.log(fails === 0 ? '\ninventory gate: ALL OK' : `\ninventory gate: ${fails} FAILURE(S)`)
process.exit(fails === 0 ? 0 : 1)
