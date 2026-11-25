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
//  11. FEAT-230 slice 2 (DEC-338): the fresh clock per unit (one old unit never spoils the stack, the oldest eaten first),
//      every food chilled ×1/4 / ×1/8 in 4 SLOTS a cooler, a whole stack to a slot (DEC-379), ice melting in 24 h
//      and lasting 72 h / 120 h in a cooler, the bar's fraction, save → load, an old save fresh, the ground; the sources.
//   7. Catalog: every REWARDS id but a dineIn meal is an ITEMS id (the grant path can't miss), and no desc carries a
//      digit (SM-INV-10 — described, never scored).
//
// Pure node: no THREE, no DOM.
import { InventorySystem, runInventory } from '../src/inventory.js'
import { ITEMS, foodSatietyH, COOKING_KIT_FOOD_MULT } from '../data/items.js'
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
// FEAT-182 (owner, item setup page 2026-11-24, DEC-500): the figures, the shelf, the rank gates and the givers
{
  const fig = { daypack: [2, 100], duffel: [6, 30], rucksack: [4, 80], framePack: [6, 120] }
  check('DEC-500: slots and reach are the owner\'s', Object.entries(fig).every(([id, [n, r]]) => ITEMS[id].packSlots === n && ITEMS[id].reachM === r))
  check('DEC-500: prices $15 daypack, $20 duffel, $20 rucksack; the Frame pack is not sold', ITEM_PRICE.daypack === 15 && ITEM_PRICE.duffel === 20
    && ITEM_PRICE.rucksack === 20 && !STOREFRONT.generalStore.always.includes('framePack') && !Object.values(STOREFRONT).some(v => 'framePack' in (v.weights ?? {})))
  const sold = id => Object.entries(STOREFRONT).filter(([, v]) => id in (v.weights ?? {}) || (v.always ?? []).includes(id)).map(([k]) => k).join()
  check('DEC-500: the daypack, duffel and rucksack are sold at the general store only (rolled, not always)',
    ['daypack', 'duffel', 'rucksack'].every(id => sold(id) === 'generalStore' && !STOREFRONT.generalStore.always.includes(id)))
  const gates = id => REWARD_LIST.find(r => r.id === id)?.gates.join('')
  check('DEC-500: reward ranks B-A daypack, A-S duffel, A-S rucksack, S frame pack', gates('daypack') === 'BA' && gates('duffel') === 'AS'
    && gates('rucksack') === 'AS' && gates('framePack') === 'S')
  const givers = id => Object.entries(REWARD_CATS).filter(([, v]) => rewardsIn([...v.cats, ...(v.rare ?? [])], 0).some(r => r.id === id)).map(([k]) => k).sort().join()
  const want = {
    daypack: ['larrysHouse', 'generalStore', 'residence', 'strandedMotorist', 'farm'],
    duffel: ['larrysHouse', 'firewoodYard', 'workSite', 'residence', 'farm', 'strandedMotorist', 'generalStore'],
    rucksack: ['larrysHouse', 'generalStore', 'strandedMotorist', 'workSite', 'residence', 'farm'],
    framePack: ['larrysHouse', 'generalStore', 'residence', 'farm', 'strandedMotorist'] }
  for (const [id, w] of Object.entries(want)) check(`DEC-500: ${id} is offered by exactly its givers`, givers(id) === [...w].sort().join(), givers(id))
}

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
  const f = new InventorySystem({ slotCap: () => 8, effects: { eat: (e) => { held = ITEMS[e.id].satiety } } })
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
  check('BUG-209: canConvert says so up front — full: no; room or a lone raw: yes; none aboard: no',
    !full.canConvert('potato', 'potatoCooked') && f.canConvert('potato', 'potatoCooked') && !f.canConvert('coffee', 'potatoCooked'))
  check('DEC-310: the kit at camp holds food 1.2x as long, the same food away from camp does not',
    COOKING_KIT_FOOD_MULT === 1.2 && Math.abs(foodSatietyH('potatoCooked', true) - 4.8) < 1e-9 && foodSatietyH('potatoCooked', false) === 4
    && Math.abs(foodSatietyH('chiliDog', true) - 12) < 1e-9 && foodSatietyH('chiliDog', false) === 10)
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

// ── 11. FEAT-230 slice 2: the fresh clock, the coolers and ice (items.md §1 / §1b / §2) ───────────────
{
  const near = (a, b) => Math.abs(a - b) < 1e-9
  check('the ruled fresh clocks: chili dog and burger 16 h; packed lunch, cooked potato, groceries raw and cooked (DEC-379) and ice 24 h; raw potato none',
    ITEMS.chiliDog.freshH === 16 && ITEMS.burger.freshH === 16 && ITEMS.packedLunch.freshH === 24 && ITEMS.potatoCooked.freshH === 24
    && ITEMS.groceries.freshH === 24 && ITEMS.ice.freshH === 24 && ITEMS.potato.freshH === undefined && ITEMS.groceriesCooked.freshH === 24)
  check('the coolers: ×1/4 (DEC-367) with 72 h ice holding 4; the Ice King ×1/8 with 5 days of ice holding 4 (DEC-338)',
    ITEMS.cooler.coolRate === 1 / 4 && ITEMS.cooler.iceLastsH === 72 && ITEMS.cooler.holds === 4
    && ITEMS.iceKing.coolRate === 1 / 8 && ITEMS.iceKing.iceLastsH === 120 && ITEMS.iceKing.holds === 4)
  const mk = () => { const s = new InventorySystem({ slotCap: () => 20, effects: { ice: (e) => s.iceCooler(e), eat: () => {} } }); s.start(); return s }
  const ent = (id) => runInventory.entries.find(e => e.id === id)
  let f = mk()
  const n = (id) => f.list().filter(r => r.id === id).reduce((k, r) => k + r.n, 0)
  f.tick(0); f.grant('packedLunch'); f.tick(100, true)
  check('DEC-339: held hours (the tutorial) age nothing — a packed lunch survives 100 held hours', n('packedLunch') === 1)
  f.tick(123.9); check('…and ages from the hold\'s end: fresh at 23.9 h after it', n('packedLunch') === 1)
  f.tick(124.1); check('…gone at 24 h after it', n('packedLunch') === 0)
  check('FEAT-306 (DEC-448): …but not deleted: it is "Rotten packed lunch", cannot be eaten, and can be dropped',
    n('rottenPackedLunch') === 1 && ITEMS.rottenPackedLunch.name === 'Rotten packed lunch' && !f.usable('rottenPackedLunch')
    && f.drop(f.list().findIndex(r => r.id === 'rottenPackedLunch')) && n('rottenPackedLunch') === 0)
  f = mk()
  f.tick(0); f.grant('packedLunch'); f.tick(10)
  check('FEAT-310 (DEC-449): the timer reads 14 h at 10 h of a 24 h lunch',
    near(f.list().find(r => r.id === 'packedLunch').spoilH, 14))
  f.grant('cooler'); ent('cooler').iceH = 2
  const cl = f.list().find(r => r.id === 'packedLunch').spoilH
  check('…and it runs by the spoil rule: with 2 h of ice at x1/4 the 14 h left is 2 h cold (0.5 h of life) + 13.5 h open = 15.5 h, and tick agrees',
    near(cl, 15.5) && (f.tick(10 + cl - 0.01), n('packedLunch') === 1) && (f.tick(10 + cl + 0.01), n('packedLunch') === 0 && n('rottenPackedLunch') === 1), String(cl))
  f = mk()
  f.tick(100); f.grant('chiliDog', 2); f.grant('potato', 3); f.grant('potatoCooked')
  f.tick(115.9)
  check('fresh at 15.9 h: the chili dogs and the cooked potato are still aboard', n('chiliDog') === 2 && n('potatoCooked') === 1)
  f.tick(116)
  check('at 16 h both chili dogs (the same age) are gone', n('chiliDog') === 0 && n('potatoCooked') === 1)
  f.tick(124); f.tick(1000)
  check('at 24 h the cooked potato is gone; a raw potato after 900 h is still there', n('potatoCooked') === 0 && n('potato') === 3)
  f.grant('potatoCooked'); f.tick(1010); f.grant('potatoCooked')
  check('every unit keeps its own age: a new one joins a stack fresh', n('potatoCooked') === 2 && ent('potatoCooked').ages.join() === '0,10')
  f.tick(1024)
  check('one old unit spoils alone, never the stack (owner, 11-16)', n('potatoCooked') === 1 && near(ent('potatoCooked').ages[0], 14))
  f.tick(1034)
  check('… and the younger one goes at its own 24 h', n('potatoCooked') === 0)
  f.grant('chiliDog'); f.tick(1042); f.grant('chiliDog')
  check('the bar shows the next to go: 8 h into 16 is half', near(f.list().find(r => r.id === 'chiliDog').fresh, 0.5)
    && f.list().find(r => r.id === 'potato').fresh === null)
  f.use('chiliDog')
  check('eating takes the oldest first: the fresh one is left, its bar full', n('chiliDog') === 1 && f.list().find(r => r.id === 'chiliDog').fresh === 1)
  f.remove(f.list().findIndex(r => r.id === 'chiliDog'))

  // Ice: on the fresh clock, melting in a day in the inventory (owner 11-16); used into a cooler, 72 h / 120 h.
  f.grant('ice'); f.tick(1065.9)
  check('a bag of ice in the inventory keeps 23.9 h', n('ice') === 1)
  f.tick(1066)
  check('… and melts at 24 h (owner, 11-16)', n('ice') === 0)
  check('ice with no cooler aboard is kept', f.grant('ice', 2) === 'taken' && f.use('ice') === false && n('ice') === 2)
  f.grant('cooler')
  check('an empty cooler shows no bar', f.list().find(r => r.id === 'cooler').fresh === null)
  check('a fresh bag of ice fills the cooler to 72 h; its bar is full', f.use('ice') && n('ice') === 1 && ent('cooler').iceH === 72
    && f.list().find(r => r.id === 'cooler').fresh === 1)
  f.grant('burger'); f.grant('chiliDog'); f.grant('packedLunch'); f.grant('groceries')
  f.tick(1066 + 24)
  check('the bag left beside the iced cooler still melts in its day (ice is not food: the cooler chills food)', n('ice') === 0)
  // DEC-367: the cooler is ×1/4. A 16 h food lasts 64 h in it, less than the ice's 72 h; a 24 h food outlasts the ice.
  f.tick(1066 + 63.9)
  check('burger, chili dog, packed lunch and groceries chill ×1/4 (DEC-367): all four still good 63.9 h in',
    ['burger', 'chiliDog', 'packedLunch', 'groceries'].every(id => near(ent(id).ages[0], 63.9 / 4)))
  f.tick(1066 + 64)
  check('the 16 h foods go at 64 h in the iced cooler; the 24 h foods are at 16', n('burger') === 0 && n('chiliDog') === 0
    && near(ent('packedLunch').ages[0], 16) && near(ent('groceries').ages[0], 16))
  f.tick(1066 + 72)
  check('72 h in the iced cooler cost the 24 h foods 18, and the ice is out', near(ent('packedLunch').ages[0], 18) && ent('cooler').iceH === 0)
  f.tick(1066 + 72 + 5.9)
  check('the ice ran out: warm again, ×1, the packed lunch goes at 24', n('packedLunch') === 1 && (f.tick(1066 + 78), n('packedLunch') === 0) && n('groceries') === 0)

  // DEC-379 (owner 11-17): a stack is ONE cooler slot, and a cooler has four. A stack of 5 chills whole; a fifth KIND stays out.
  f = mk(); f.tick(0); f.grant('cooler'); f.grant('ice'); f.use('ice'); f.grant('chiliDog', 5)
  f.grant('burger'); f.grant('salad'); f.grant('deliSandwich'); f.grant('groceriesCooked')
  f.tick(12)
  check('5 chili dogs are one slot: all five chill, and so do the next three kinds (four slots)', ent('chiliDog').ages.every(a => near(a, 3))
    && near(ent('burger').ages[0], 3) && near(ent('salad').ages[0], 3) && near(ent('deliSandwich').ages[0], 3))
  check('…the fifth slot (cooked groceries) has no room and ages warm', near(ent('groceriesCooked').ages[0], 12))
  f.tick(24)
  check('DEC-379: cooked groceries spoil in 24 h outside a cooler', n('groceriesCooked') === 0 && n('chiliDog') === 5)
  f.tick(63.9)
  check('the five chilled ×1/4: still good at 63.9 h', n('chiliDog') === 5)
  f.tick(64)
  check('… gone at 16 h of fresh life, 64 h in, with ice still in the cooler', n('chiliDog') === 0 && ent('cooler').iceH > 0)
  f.tick(76)
  f.grant('ice'); f.tick(88); f.use('ice')
  check('a bag 12 h into its day gives the empty cooler half its 72 h: 36', Math.abs(ent('cooler').iceH - 36) < 1e-6)
  f.grant('iceKing'); f.grant('ice'); f.use('ice'); f.grant('ice'); f.use('ice')
  check('a fresh bag goes to the cooler with the least ice: the empty Ice King to 120, then the cooler to 72',
    ent('cooler').iceH === 72 && ent('iceKing').iceH === 120)
  f.grant('groceries', 5); f.tick(96)
  check('the Ice King (×1/8) chills first, then the cooler (×1/4): four bags at 1, one at 2',
    runInventory.entries.filter(e => e.id === 'groceries').map(e => e.ages[0]).every((a, k) => near(a, k < 4 ? 1 : 8 * ITEMS.cooler.coolRate)))

  // Save → load: the run save is JSON of runInventory (main.js _runSnapshot).
  const saved = JSON.parse(JSON.stringify(f.snapshot()))
  const g = new InventorySystem({ slotCap: () => 20 })
  g.restore(saved); g.tick(96); g.tick(100)
  check('save → load keeps every unit\'s age and the ice', near(runInventory.entries.find(e => e.id === 'groceries').ages[0], 1.5)
    && runInventory.entries.find(e => e.id === 'iceKing').iceH === 108)
  g.restore({ entries: [{ id: 'pack', n: 1, equipped: true, contents: ['bedroll'] }, { id: 'chiliDog', n: 2 }, { id: 'cooler', n: 1 }], pending: null, quick: [null, null, null, null] })
  g.tick(2000); g.tick(2015)
  check('an old save (no ages, no ice) loads fresh: a chili dog lives its full 16 h from the load',
    runInventory.entries.find(e => e.id === 'chiliDog')?.n === 2 && (g.tick(2016), !runInventory.entries.some(e => e.id === 'chiliDog')))
  g.grant('chiliDog'); g.tick(2020); g.grant('chiliDog')
  const i = runInventory.entries.findIndex(e => e.id === 'chiliDog'), down = runInventory.entries[i]
  g.drop(i); g.tick(2026)
  check('on the ground the bar keeps falling: the older dog 10 h of 16', near(g.rowOf(down).fresh, 6 / 16))
  check('picked up 6 h later every unit has spoiled on: 10 h and 6 h', g.restoreEntry(down)
    && runInventory.entries.find(e => e.id === 'chiliDog').ages.join() === '6,10' && runInventory.entries.every(e => e.droppedH == null))
  const pool = (cats, gate) => rewardsIn(cats, 0).filter(r => r.gates.includes(gate)).map(r => r.id)
  check('the cooler is a tackle-shop reward at A–S and nobody else\'s but Larry\'s', pool(REWARD_CATS.tackleShop.cats, 'A').includes('cooler')
    && !pool(REWARD_CATS.tackleShop.cats, 'B').includes('cooler')
    && Object.entries(REWARD_CATS).every(([k, v]) => ['tackleShop', 'larrysHouse'].includes(k) || !pool([...v.cats, ...(v.rare ?? [])], 'A').includes('cooler')))
  check('the Ice King: S only, from the tackle shop and residences', pool(REWARD_CATS.residence.cats, 'S').includes('iceKing')
    && pool(REWARD_CATS.tackleShop.cats, 'S').includes('iceKing') && !pool(REWARD_CATS.tackleShop.cats, 'A').includes('iceKing'))
  check('ice is never a reward; $5 at the gas station and the general store', !REWARD_LIST.some(r => r.id === 'ice') && ITEM_PRICE.ice === 5
    && STOREFRONT.gasStation.always.includes('ice') && STOREFRONT.generalStore.always.includes('ice'))
  check('the cooler at the general store and the tackle shop, $10–30; the Ice King rarely at both, $30–100',
    STOREFRONT.generalStore.always.includes('cooler') && STOREFRONT.tackleShop.always.includes('cooler')
    && ITEM_PRICE.cooler >= 10 && ITEM_PRICE.cooler <= 30 && STOREFRONT.generalStore.weights.iceKing > 0
    && STOREFRONT.tackleShop.weights.iceKing > 0 && ITEM_PRICE.iceKing >= 30 && ITEM_PRICE.iceKing <= 100)
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
    check(`${id}: edible, ${hold} h of satiety, stack ${stack ?? 'uncapped'}`, ITEMS[id].use === 'eat' && ITEMS[id].satiety === hold && ITEMS[id].stack === stack)
    check(`${id}: sold at the ${shop} under $5`, STOREFRONT[shop].always.includes(id) && ITEM_PRICE[id] > 0 && ITEM_PRICE[id] < 5)
    check(`${id}: a ${g} reward from ${who} only`, gates(id) === g && givers(id, g[0]) === who)
    check(`${id}: not found (no find channel, no other shelf)`, Object.entries(STOREFRONT).every(([k, s]) => k === shop || !s.always.includes(id)))
  }
  const f = new InventorySystem({ slotCap: () => 8 }); f.start(); const s0 = f.slotsUsed(); f.grant('candyBar', 5); f.grant('gummyWorms', 6)
  check('a capped snack spans slots (candy 4+1, gummy 5+1)', f.slotsUsed() === s0 + 4)
  check('the packed lunch is a B-A reward from residences, farms and the food vendor, never sold',
    gates('packedLunch') === 'BA' && givers('packedLunch', 'B') === 'farm,foodVendor,residence' && !Object.values(STOREFRONT).some(s => s.always.includes('packedLunch')))
  check('the dinner meal: eat-in only, 8 h, 30 min, on the food vendor\'s shelf, never stowed',
    ITEMS.dinnerMeal.eatIn && !ITEMS.dinnerMeal.use && ITEMS.dinnerMeal.satiety === 8 && ITEMS.dinnerMeal.eatH === 0.5
    && STOREFRONT.foodVendor.always.includes('dinnerMeal'))
}

// ── 10. FEAT-230 slice 3: groceries ───────────────────────────────────────────────────────────
{
  const pool = (cats, gate) => rewardsIn(cats, 0).filter(r => r.gates.includes(gate)).map(r => r.id)
  const givers = (gate) => Object.entries(REWARD_CATS).filter(([k, v]) => k !== 'larrysHouse' && pool(v.cats, gate).includes('groceries')).map(([k]) => k).sort().join()
  check('groceries: raw is no meal, cooked gives 10 h', !ITEMS.groceries.use && ITEMS.groceriesCooked.use === 'eat' && ITEMS.groceriesCooked.satiety === 10)
  check('groceries: the kit\'s +20 % does NOT apply on top (10 h with or without), the potato still gets it',
    foodSatietyH('groceriesCooked', true) === 10 && foodSatietyH('groceriesCooked', false) === 10 && Math.abs(foodSatietyH('potatoCooked', true) - 4.8) < 1e-9)
  check('groceries: on the price line at the general store and the farm', ITEM_PRICE.groceries === 2.5 && STOREFRONT.generalStore.always.includes('groceries') && STOREFRONT.farm.always.includes('groceries'))
  check('groceries: a B-A reward from the farm and the general store only', REWARD_LIST.find(r => r.id === 'groceries')?.gates.join('') === 'BA'
    && givers('B') === 'farm,generalStore' && givers('A') === 'farm,generalStore')
  check('groceries: never a find, no other shelf', Object.entries(STOREFRONT).every(([k, s]) => ['generalStore', 'farm'].includes(k) || !s.always.includes('groceries'))
    && !REWARD_LIST.some(r => r.id === 'groceriesCooked'))
  const f = new InventorySystem({ slotCap: () => 8 }); f.start(); f.grant('groceries', 2)
  check('groceries: a bag a slot', f.list().filter(r => r.id === 'groceries').length === 2)
  check('groceries: cooking turns one raw bag into one cooked meal', f.convert('groceries', 'groceriesCooked') && f.list().filter(r => r.id === 'groceries').length === 1 && f.list().some(r => r.id === 'groceriesCooked'))
}

// ── 12. FEAT-250 / FEAT-260 / DEC-407 (owner 2026-11-17): cost per hour of satiety by where a food is sold ─────────────
{
  const cooksInto = { groceries: 'groceriesCooked', potato: 'potatoCooked', cannedBeans: 'beansHeated' }
  const sold = [...new Set(Object.values(STOREFRONT).flatMap(s => s.always))].filter(id => ITEMS[id].kind === 'food')
  const cls = (id) => STOREFRONT.foodVendor.always.includes(id) ? 'vendor' : STOREFRONT.gasStation.always.includes(id) ? 'gas' : cooksInto[id] ? 'cook' : 'staple'
  const rows = sold.map(id => { const h = ITEMS[cooksInto[id] ?? id].satiety; return { id, c: cls(id), h, perH: ITEM_PRICE[id] / h } })
  if (process.env.FOOD_TABLE) for (const r of [...rows].sort((a, b) => a.perH - b.perH)) console.log(`${r.id.padEnd(18)} ${r.c.padEnd(7)} $${ITEM_PRICE[r.id].toFixed(2)} ${String(r.h).padStart(4)} h  $${r.perH.toFixed(3)}/h`)
  const of = (c) => rows.filter(r => r.c === c), mn = (c) => Math.min(...of(c).map(r => r.perH)), mx = (c) => Math.max(...of(c).map(r => r.perH))
  const mean = (c) => of(c).reduce((a, r) => a + r.h, 0) / of(c).length
  const out = rows.filter(r => r.perH < 0.245 - 1e-9 || r.perH > 0.70 + 1e-9)
  check("DEC-407: every sold food is inside the band, $0.245-0.70 an hour (DEC-388's $0.35 less 30 % to plus 100 %)", out.length === 0, out.map(r => r.id).join())
  check('DEC-407 rule 1: grocery staples and cookables are cheaper an hour than the food vendor', Math.max(mx('staple'), mx('cook')) < mn('vendor'))
  check('DEC-407 rule 2: a cookable is the cheapest an hour (the cooking act is its price) and holds more than a staple',
    mx('cook') <= mn('staple') && mean('cook') > mean('staple') && of('staple').every(r => r.h <= 5))
  check('DEC-407 rule 3: the food vendor holds long (8 h and up) at a high price an hour', mn('vendor') >= 0.5 && of('vendor').every(r => r.h >= 8))
  check('DEC-407 rule 4: the gas station is the worst deal an hour, and nothing there holds more than 5 h',
    mn('gas') > mx('vendor') && of('gas').every(r => r.h <= 5))
  check("DEC-407: the bag of peanuts is in line with the gas station's snacks", cls('bagOfPeanuts') === 'gas' && ITEM_PRICE.bagOfPeanuts <= 2.1)
  const four = ['salad', 'deliSandwich', 'cookies', 'bread']
  check('FEAT-260: the salad, deli sandwich, cookies and bread are edible, spoil, and sell at the general store only',
    four.every(id => ITEMS[id].use === 'eat' && ITEMS[id].satiety > 0 && ITEMS[id].freshH > 0 && STOREFRONT.generalStore.always.includes(id)
      && Object.entries(STOREFRONT).every(([k, s]) => k === 'generalStore' || !s.always.includes(id))))
  check('…cheap and short to dear and long: the salad spoils first, the cookies last', ITEMS.salad.freshH < ITEMS.deliSandwich.freshH
    && ITEMS.deliSandwich.freshH < ITEMS.bread.freshH && ITEMS.bread.freshH < ITEMS.cookies.freshH)
}

console.log(fails === 0 ? '\ninventory gate: ALL OK' : `\ninventory gate: ${fails} FAILURE(S)`)
process.exit(fails === 0 ? 0 : 1)
