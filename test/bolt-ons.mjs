// FEAT-204 bolt-ons gate — the roof rack, the bull bar and the light bar as parts on the truck configuration.
//
//   1. Slots: the roof rack adds its 4 (DEC-129) to the inventory's cap while fitted, and takes them away again.
//   2. Models: each fitted bolt-on shows its own .glb; the light bar shows the rack-mount model when the rack is
//      fitted too, the solo one otherwise (DEC-340); stock shows nothing.
//   3. Armour: with the bull bar on, the same front hit costs the front panel 1/armor of what it costs bare, through
//      damage.js applyImpact (its one collision entry point); taking it off puts the bare rate back.
//   4. Light: the light bar patches the head spots' gain and reach; stock is 1 / 1 (RANGER_PARAMS).
//   5. Per run (SM-INV-8, BUG-184): start() — the run-start path main.js onRegionLive calls — clears every bolt-on,
//      its slots, its model and its armour; a save written before the bolt-ons existed restores to stock ones.
//   6. Sold: each is an inventory part with a shelf weight; the "none" parts are neither.
//   7. Mass: boltOnKg sums the fitted bolt-ons' massKg and nothing else; no bed toolbox part exists (DEC-372).
//
// Pure node: no THREE, no DOM.
import { PARTS, SLOTS } from '../data/parts.js'
import { ITEMS } from '../data/items.js'
import { STOCK_WEIGHT } from '../data/stock-weights.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { PartsSystem, runParts, modModels } from '../src/parts.js'
import { DamageModel } from '../src/damage.js'
import { InventorySystem } from '../src/inventory.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}

const params = { ...RANGER_PARAMS }
const damage = new DamageModel({ params })
const parts = new PartsSystem({ params, damage })
const inv = new InventorySystem({ slotCap: () => params.inventorySlots + parts.extraSlots() })
parts.start()
const models = () => modModels(runParts.fitted).sort().join()

// ── 1. Slots ──────────────────────────────────────────────────────────────────────────────────
check('stock: the truck\'s 8 slots', inv.slotCap() === 8, inv.slotCap())
parts.fit('roofRack')
check('roof rack: 12 slots', inv.slotCap() === 12, inv.slotCap())
parts.fit('roofRackNone')
check('roof rack off: 8 again', inv.slotCap() === 8, inv.slotCap())

// ── 2. Models ─────────────────────────────────────────────────────────────────────────────────
check('stock: no bolt-on models', models() === '', models())
parts.fit('lightBar')
check('light bar alone: the solo bar', models() === 'mod-light-bar-solo', models())
parts.fit('roofRack')
check('light bar + rack: the rack-mount bar and the rack', models() === 'mod-light-bar-rack,mod-roof-rack', models())
parts.fit('bullBar')
check('all three', models() === 'mod-bull-bar,mod-light-bar-rack,mod-roof-rack', models())
parts.fit('roofRackNone')
check('rack off: back to the solo bar', models() === 'mod-bull-bar,mod-light-bar-solo', models())

// ── 3. Armour ─────────────────────────────────────────────────────────────────────────────────
const frontLoss = () => {
  damage.set('armorFront', 1)
  damage.applyImpact('front', 1360 * 6, 1360)   // a 6 m/s (13 mph) knock
  return 1 - damage.get('armorFront')
}
parts.fit('bullBar')
const barred = frontLoss()
parts.fit('bullBarNone')
const bare = frontLoss()
check(`bull bar: the front panel loses 1/${PARTS.bullBar.armor} of the bare loss (${barred.toFixed(4)} vs ${bare.toFixed(4)})`,
  bare > 0 && Math.abs(barred * PARTS.bullBar.armor - bare) < 1e-9)
check('bull bar: guards the front panel only', SLOTS.bullBar.guards === 'armorFront' && SLOTS.bullBar.tracks.length === 0)

// ── 4. Light ──────────────────────────────────────────────────────────────────────────────────
parts.fit('lightBar')
check('light bar: gain and reach patched', params.headlightGain === PARTS.lightBar.patch.headlightGain && params.headlightReach === PARTS.lightBar.patch.headlightReach
  && params.headlightGain > 1 && params.headlightReach > 1)
parts.fit('lightBarNone')
check('light bar off: 1 / 1 again', params.headlightGain === 1 && params.headlightReach === 1)

// ── 5. Per run ────────────────────────────────────────────────────────────────────────────────
for (const id of ['roofRack', 'bullBar', 'lightBar']) parts.fit(id)
const old = parts.snapshot()
for (const s of ['roofRack', 'bullBar', 'lightBar']) delete old.fitted[s]
delete old.durability.armorFront; delete old.params.headlightGain; delete old.params.headlightReach
parts.start()
check('new run: every bolt-on off, 8 slots, no models, bare front, no light boost',
  ['roofRack', 'bullBar', 'lightBar'].every(s => PARTS[runParts.fitted[s]].stock) && inv.slotCap() === 8 && models() === ''
  && (damage._durabilityScale.armorFront ?? 1) === 1 && params.headlightGain === 1 && params.headlightReach === 1)
parts.restore(old)
check('a save from before the bolt-ons restores stock ones', ['roofRack', 'bullBar', 'lightBar'].every(s => PARTS[runParts.fitted[s]]?.stock))

// ── 6. Sold ───────────────────────────────────────────────────────────────────────────────────
for (const id of ['roofRack', 'bullBar', 'lightBar']) {
  check(`${id}: an inventory part with a price, mass and shelf weight`, ITEMS[id]?.kind === 'part' && PARTS[id].price > 0 && PARTS[id].massKg > 0 && STOCK_WEIGHT[id] > 0)
  check(`${id}None: nothing to carry or stock`, !ITEMS[id + 'None'] && !(id + 'None' in STOCK_WEIGHT))
}
// ── 7. Mass (DEC-373): the fitted bolt-ons' mass is boltOnKg (main.js → params.fittedKg → the chassis); stock is 0 ──
parts.start()
check('stock: no bolt-on mass', parts.boltOnKg() === 0, parts.boltOnKg())
for (const id of ['roofRack', 'bullBar', 'lightBar']) parts.fit(id)
const kgAll = PARTS.roofRack.massKg + PARTS.bullBar.massKg + PARTS.lightBar.massKg
check('all three fitted: their masses sum', Math.abs(parts.boltOnKg() - kgAll) < 1e-9, `${parts.boltOnKg()} vs ${kgAll}`)
parts.fit('springsHD', null, 'springsFront')
check('a non-bolt-on swap adds nothing (its stock mass is inside params.mass)', Math.abs(parts.boltOnKg() - kgAll) < 1e-9)
parts.start()
check('a new run: 0 again', parts.boltOnKg() === 0)

check('there is no bed toolbox before the alpha (DEC-372)', !Object.values(PARTS).some(p => /toolbox/i.test(p.model ?? '')))

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
