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
//      6c. The bigger packs (FEAT-182): each has slots and a reach; the Frame pack takes a whole camp and refuses
//      one more; camp's tether follows the equipped pack, capped at 120 m (src/camp.js reachM).
//   7. Catalog: every REWARDS id but a dineIn meal is an ITEMS id (the grant path can't miss), and no desc carries a
//      digit (SM-INV-10 — described, never scored).
//
// Pure node: no THREE, no DOM.
import { InventorySystem, runInventory } from '../src/inventory.js'
import { ITEMS, foodHoldH, COOKING_KIT_FOOD_MULT } from '../data/items.js'
import { REWARD_CATS } from '../data/offers.js'
import { STOREFRONT, ITEM_PRICE } from '../data/shop-stock.js'
import { REWARD_LIST, rewardsIn } from '../src/offer-board.js'
import { CampSystem, CAMP_PARAMS } from '../src/camp.js'

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
inv.grant('tireStandard')
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
inv.grant('tireStandard'); inv.grant('tireStandard')
check('parts take a slot each: 2 tires = 2 slots', inv.slotsUsed() === 5)
check('unknown id is refused, not stored', inv.grant('noSuchThing') === null && inv.slotsUsed() === 5)

// ── 4. Mass ───────────────────────────────────────────────────────────────────────────────────
const want = KIT_KG + 3 * ITEMS.coffee.massKg + ITEMS.chiliDog.massKg + 2 * ITEMS.tireStandard.massKg
check('stowedKg sums every unit', Math.abs(inv.stowedKg() - want) < 1e-9, `${inv.stowedKg()} vs ${want}`)
check('onMassChange saw the latest mass', Math.abs(massKg - want) < 1e-9, `${massKg} vs ${want}`)

// ── 3. Full → swap prompt ─────────────────────────────────────────────────────────────────────
for (let i = 0; i < 3; i++) inv.grant('tireStandard')
check('8 of 8 slots filled', inv.slotsUsed() === 8)
check('a stacking kind already owned still fits when full', inv.grant('coffee') === 'taken')
check('a 9th slot goes to pending', inv.grant('tireStandard') === 'pending' && inv.slotsUsed() === 8
  && inv.pending()?.id === 'tireStandard')
check('pending adds no mass', Math.abs(inv.stowedKg() - (want + ITEMS.coffee.massKg + 3 * ITEMS.tireStandard.massKg)) < 1e-9)
check('take refuses while still full', inv.takePending() === false && inv.pending() !== null)
const tireAt = inv.list().findIndex(r => r.id === 'tireStandard')
inv.drop(tireAt)
check('drop frees a slot', inv.slotsUsed() === 7)
check('take succeeds after the drop', inv.takePending() === true && inv.pending() === null && inv.slotsUsed() === 8)
inv.grant('tireStandard')
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

// ── 6b. Sleeping gear (items.md §2b, FEAT-171): the equipped pack's `rest` adds up, one item per bed layer
inv.start()
const at6 = (id) => inv.list().findIndex(r => r.id === id)
check('the bare bedroll adds no rest', inv.restBonus() === 0)
inv.grant('blanket'); inv.packItem(at6('blanket'))
inv.grant('deluxeSleepingPad')
check('bedroll + blanket = +5%, and the starter Pack is full: no room for a pad', Math.abs(inv.restBonus() - 0.05) < 1e-9
  && inv.packItem(at6('deluxeSleepingPad')) === false, String(inv.restBonus()))
inv.unpackItem(inv.equippedIndex(), inv.packed().indexOf('blanket')); inv.packItem(at6('deluxeSleepingPad'))
check('the deluxe pad goes UNDER the bedroll: +15%, the bedroll stays packed', Math.abs(inv.restBonus() - 0.15) < 1e-9
  && inv.packed().join() === 'bedroll,deluxeSleepingPad', `${inv.restBonus()} ${inv.packed()}`)

// ── 6c. The bigger packs (FEAT-182) ─────────────────────────────────────────────────────────────
const PACKS = Object.keys(ITEMS).filter(id => ITEMS[id].kind === 'pack')
check('five packs, each with slots and a reach', PACKS.length === 5
  && PACKS.every(id => ITEMS[id].packSlots >= 2 && ITEMS[id].reachM > 0), PACKS.join())
inv.start()
const camp = new CampSystem({ getParams: () => ({}), getReachM: () => inv.reachM() })
check('the starter Pack sets the tether to its reach', camp.reachM() === ITEMS.pack.reachM
  && camp.tetherM() === 5 + 2.5 + ITEMS.pack.reachM, String(camp.tetherM()))
const WHOLE = ['sleepingPad', 'blanket', 'tent', 'awning', 'cookingKit']   // with the bedroll: every camp slot
inv.grant('framePack')
for (const id of WHOLE) inv.grant(id)
check('equipping the Frame pack brings the bedroll across', inv.equip(at6('framePack')) === true
  && inv.packed().join() === 'bedroll')
for (const id of WHOLE) inv.packItem(at6(id))
inv.grant('shadeTarp')
check(`the Frame pack takes a whole camp (${ITEMS.framePack.packSlots}) and refuses one more`,
  inv.packed().length === ITEMS.framePack.packSlots && inv.packed().join() === ['bedroll', ...WHOLE].join()
  && inv.packItem(at6('shadeTarp')) === false, inv.packed().join())
check('the tether follows the equipped pack', camp.reachM() === ITEMS.framePack.reachM, String(camp.reachM()))
const far = ITEMS.framePack.reachM
ITEMS.framePack.reachM = 500
check('no pack reaches past 120 m', camp.reachM() === 120, String(camp.reachM()))
ITEMS.framePack.reachM = far
check('with no pack to ask (headless), the param', new CampSystem({}).reachM() === CAMP_PARAMS.campRoadEdgeM)

// ── 7. Catalog ────────────────────────────────────────────────────────────────────────────────
const missing = REWARD_LIST.filter(r => !r.dineIn && !ITEMS[r.id]).map(r => r.id)
check('every reward id is in ITEMS', missing.length === 0, missing.join(', '))
const digits = Object.entries(ITEMS).filter(([, it]) => /\d/.test(it.desc)).map(([id]) => id)
check('no item desc carries a digit (SM-INV-10)', digits.length === 0, digits.join(', '))
const bad = Object.entries(ITEMS).filter(([, it]) => !(it.massKg > 0) || !it.name).map(([id]) => id)
check('every item has a name and a positive mass', bad.length === 0, bad.join(', '))
check('the starting Pack is a pack with room beside the bed', ITEMS.pack.kind === 'pack' && ITEMS.pack.packSlots >= 2
  && ITEMS.bedroll.kind === 'camp' && ITEMS.bedroll.bed === 'bedding')

// ── 8. FEAT-230 slice 1: the potato ───────────────────────────────────────────────────────────
{
  let held = null
  const f = new InventorySystem({ slotCap: () => 8, effects: { eat: (e) => { held = ITEMS[e.id].hold } } })
  f.start()
  const slots0 = f.slotsUsed()
  f.grant('potato', 7)
  check('potatoes stack 5 to a slot: 7 take two', f.slotsUsed() === slots0 + 2 && f.list().filter(r => r.id === 'potato').map(r => r.n).join() === '5,2')
  check('a raw potato cannot be eaten', f.usable('potato') === false && f.use('potato') === false && held === null)
  check('the raw potato says why', /raw/i.test(ITEMS.potato.desc) && /campfire/i.test(ITEMS.potato.desc))
  check('cooking converts exactly one raw into one cooked',
    f.convert('potato', 'potatoCooked') && f.list().filter(r => r.id === 'potato').reduce((k, r) => k + r.n, 0) === 6
    && f.list().find(r => r.id === 'potatoCooked').n === 1)
  check('the cooked potato holds hunger 4 h through the eat hook', f.use('potatoCooked') && held === 4)
  check('convert with none aboard is a no-op', !f.convert('coffee', 'potatoCooked'))
  const full = new InventorySystem({ slotCap: () => 3 })
  full.start(); full.grant('potatoCooked', 5); full.grant('potato', 2)   // pack + a full cooked stack + raw: no slot left
  check('convert refuses, changing nothing, when the cooked has no room',
    !full.convert('potato', 'potatoCooked') && full.list().find(r => r.id === 'potato').n === 2 && full.slotsUsed() === 3)
  check('DEC-310: the kit at camp holds food 1.2x as long, the same food away from camp does not',
    COOKING_KIT_FOOD_MULT === 1.2 && Math.abs(foodHoldH('potatoCooked', true) - 4.8) < 1e-9 && foodHoldH('potatoCooked', false) === 4
    && Math.abs(foodHoldH('chiliDog', true) - 12) < 1e-9 && foodHoldH('chiliDog', false) === 10)
  const pool = (cats, gate) => rewardsIn(cats, 0).filter(r => r.gates.includes(gate)).map(r => r.id)
  check('the potato is a farm reward at C and B, not A', pool(REWARD_CATS.farm.cats, 'C').includes('potato')
    && pool(REWARD_CATS.farm.cats, 'B').includes('potato') && !pool(REWARD_CATS.farm.cats, 'A').includes('potato'))
  check('no other giver but Larry hands out a potato', Object.entries(REWARD_CATS).every(([k, v]) =>
    ['farm', 'larrysHouse'].includes(k) || !pool(v.cats, 'C').includes('potato')))
  check('the cooked potato is never a reward, sold or found', !REWARD_LIST.some(r => r.id === 'potatoCooked')
    && !Object.values(STOREFRONT).some(s => s.always.includes('potatoCooked')))
  check('the general store sells the potato at a price under $5', STOREFRONT.generalStore.always.includes('potato')
    && ITEM_PRICE.potato > 0 && ITEM_PRICE.potato < 5)
}

// ── 9. FEAT-232: the snacks, the burger, the packed-lunch reward, the dinner meal ─────────────
{
  const pool = (cats, gate) => rewardsIn(cats, 0).filter(r => r.gates.includes(gate)).map(r => r.id)
  const givers = (id, gate) => Object.entries(REWARD_CATS).filter(([k, v]) => k !== 'larrysHouse' && pool(v.cats, gate).includes(id)).map(([k]) => k).sort().join()
  const gates = (id) => REWARD_LIST.find(r => r.id === id)?.gates.join('')
  // id: hold h, stack, gate pair, ruled givers (Larry aside), shelf
  const rows = { gummyWorms: [2, 5, 'CB', 'gasStation,generalStore', 'gasStation'], spicyChips: [3, 3, 'CB', 'gasStation', 'gasStation'],
    candyBar: [3, 4, 'CB', 'gasStation', 'gasStation'], bagOfPeanuts: [3, 3, 'CB', 'gasStation,generalStore', 'gasStation'],
    burger: [8, undefined, 'CB', 'foodVendor', 'foodVendor'] }
  for (const [id, [hold, stack, g, who, shop]] of Object.entries(rows)) {
    check(`${id}: edible, holds ${hold} h, stack ${stack ?? 'uncapped'}`, ITEMS[id].use === 'eat' && ITEMS[id].hold === hold && ITEMS[id].stack === stack)
    check(`${id}: sold at the ${shop} under $5 (burger $5)`, STOREFRONT[shop].always.includes(id) && ITEM_PRICE[id] > 0 && (id === 'burger' ? ITEM_PRICE[id] === 5 : ITEM_PRICE[id] < 5))
    check(`${id}: a ${g} reward from ${who} only`, gates(id) === g && givers(id, g[0]) === who)
    check(`${id}: not found (no find channel, no other shelf)`, Object.entries(STOREFRONT).every(([k, s]) => k === shop || !s.always.includes(id)))
  }
  const f = new InventorySystem({ slotCap: () => 8 }); f.start(); const s0 = f.slotsUsed(); f.grant('candyBar', 5); f.grant('gummyWorms', 6)
  check('a capped snack spans slots (candy 4+1, gummy 5+1)', f.slotsUsed() === s0 + 4)
  check('the packed lunch is a B-A reward from residences, farms and the food vendor, never sold',
    gates('packedLunch') === 'BA' && givers('packedLunch', 'B') === 'farm,foodVendor,residence' && !Object.values(STOREFRONT).some(s => s.always.includes('packedLunch')))
  check('the dinner meal: eat-in only, 8 h, 30 min, $5-10, on the food vendor\'s shelf, never stowed',
    ITEMS.dinnerMeal.eatIn && !ITEMS.dinnerMeal.use && ITEMS.dinnerMeal.hold === 8 && ITEMS.dinnerMeal.eatH === 0.5
    && STOREFRONT.foodVendor.always.includes('dinnerMeal') && ITEM_PRICE.dinnerMeal >= 5 && ITEM_PRICE.dinnerMeal <= 10)
}

// ── 10. FEAT-230 slice 3: groceries ───────────────────────────────────────────────────────────
{
  const pool = (cats, gate) => rewardsIn(cats, 0).filter(r => r.gates.includes(gate)).map(r => r.id)
  const givers = (gate) => Object.entries(REWARD_CATS).filter(([k, v]) => k !== 'larrysHouse' && pool(v.cats, gate).includes('groceries')).map(([k]) => k).sort().join()
  check('groceries: raw is no meal, cooked holds 10 h', !ITEMS.groceries.use && ITEMS.groceriesCooked.use === 'eat' && ITEMS.groceriesCooked.hold === 10)
  check('groceries: the kit\'s +20 % does NOT apply on top (10 h with or without), the potato still gets it',
    foodHoldH('groceriesCooked', true) === 10 && foodHoldH('groceriesCooked', false) === 10 && Math.abs(foodHoldH('potatoCooked', true) - 4.8) < 1e-9)
  check('groceries: $5 at the general store and the farm', ITEM_PRICE.groceries === 5 && STOREFRONT.generalStore.always.includes('groceries') && STOREFRONT.farm.always.includes('groceries'))
  check('groceries: a B-A reward from the farm and the general store only', REWARD_LIST.find(r => r.id === 'groceries')?.gates.join('') === 'BA'
    && givers('B') === 'farm,generalStore' && givers('A') === 'farm,generalStore')
  check('groceries: never a find, no other shelf', Object.entries(STOREFRONT).every(([k, s]) => ['generalStore', 'farm'].includes(k) || !s.always.includes('groceries'))
    && !REWARD_LIST.some(r => r.id === 'groceriesCooked'))
  const f = new InventorySystem({ slotCap: () => 8 }); f.start(); f.grant('groceries', 2)
  check('groceries: a bag a slot', f.list().filter(r => r.id === 'groceries').length === 2)
  check('groceries: cooking turns one raw bag into one cooked meal', f.convert('groceries', 'groceriesCooked') && f.list().filter(r => r.id === 'groceries').length === 1 && f.list().some(r => r.id === 'groceriesCooked'))
}

console.log(fails === 0 ? '\ninventory gate: ALL OK' : `\ninventory gate: ${fails} FAILURE(S)`)
process.exit(fails === 0 ? 0 : 1)
