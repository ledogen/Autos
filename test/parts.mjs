// test/parts.mjs — SM-3 parts gate.
//
// Pins the parts system's contract (data/parts.js, src/parts.js):
//   1. Catalog shape: every slot has exactly one STOCK part, and its patch equals RANGER_PARAMS — so
//      swapping back to stock restores the factory truck exactly. Every part in a slot patches the
//      same keys; no two slots share a key (or one slot's fit would clobber another's).
//   2. start() fits stock everywhere, new, at OEM durability.
//   3. fit() lays the patch over params, returns what came off with its wear, sets the slot's tracks
//      to the incoming part's condition (new = 1, used = carried), and sets its family's durability —
//      a heavy-duty spring loses half as much to the same insult.
//   4. A new set of tires is not flat.
//   5. Load ratings: the weakest part sets the limits, so one heavy-duty part alone moves nothing and
//      the full §3f package does.
//
// Pure node: no THREE, no DOM.
import { PARTS, SLOTS, FAMILY_DURABILITY } from '../data/parts.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { PartsSystem, runParts } from '../src/parts.js'
import { DamageModel } from '../src/damage.js'
import { truckConfig, massLimits } from '../src/load-verdict.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}
const keys = (id) => Object.keys(PARTS[id].patch).sort().join()

// ── 1. Catalog shape ──────────────────────────────────────────────────────────────────────────
const owner = {}
for (const slot of Object.keys(SLOTS)) {
  const ids = Object.keys(PARTS).filter(id => PARTS[id].slot === slot)
  const stock = ids.filter(id => PARTS[id].stock)
  check(`${slot}: exactly one stock part`, stock.length === 1, stock.join())
  const off = stock[0] && Object.entries(PARTS[stock[0]].patch).filter(([k, v]) => RANGER_PARAMS[k] !== v)
  check(`${slot}: stock patch equals RANGER_PARAMS`, off && off.length === 0, JSON.stringify(off))
  const odd = ids.filter(id => keys(id) !== keys(ids[0]))
  check(`${slot}: every part patches the same keys`, odd.length === 0, odd.join())
  for (const k of Object.keys(PARTS[ids[0]].patch)) {
    check(`key ${k} belongs to one slot`, !owner[k] || owner[k] === slot, `${owner[k]} and ${slot}`)
    owner[k] = slot
  }
}
for (const [id, p] of Object.entries(PARTS)) {
  check(`${id}: known slot and family`, SLOTS[p.slot] && p.family in FAMILY_DURABILITY)
  check(`${id}: desc carries no digit (SM-INV-10)`, !/\d/.test(p.desc), p.desc)
}

// ── 2. start() ────────────────────────────────────────────────────────────────────────────────
const params = { ...RANGER_PARAMS }
const damage = new DamageModel({ params })
let changes = 0
const parts = new PartsSystem({ params, damage, onChange: () => { changes++ } })
params.frictionCoeff = 0.5; damage.set('springFront', 0.3)
parts.start()
check('start(): stock tires fitted, factory grip restored', runParts.fitted.tires === 'tiresStandard' && params.frictionCoeff === 0.80)
check('start(): every slot filled with its stock part', Object.keys(SLOTS).every(s => PARTS[runParts.fitted[s]]?.stock))
check('start(): tracks new', damage.get('springFront') === 1)
check('start(): one onChange', changes === 1, changes)

// ── 3. fit() ──────────────────────────────────────────────────────────────────────────────────
damage.set('springFront', 0.6); damage.set('springRear', 0.4)
const off = parts.fit('springsHD')
check('fit: patch lands on params', params.suspensionStiffnessFront === 46000 && params.suspensionStiffnessRear === 52000)
check('fit: returns the outgoing part with its wear', off.id === 'springsOEM' && off.cond.springFront === 0.6 && off.cond.springRear === 0.4,
  JSON.stringify(off))
check('fit: the new part is new', damage.get('springFront') === 1 && damage.get('springRear') === 1)
damage.wear('springFront', 0.1, 1)
check('fit: heavy-duty durability halves the wear', Math.abs(damage.get('springFront') - (1 - 0.1 / FAMILY_DURABILITY.hd)) < 1e-12,
  damage.get('springFront'))
parts.fit('springsOEM', off.cond)
check('fit: a used part brings its wear back', damage.get('springFront') === 0.6 && damage.get('springRear') === 0.4)
check('fit: back to stock restores the factory rate', params.suspensionStiffnessFront === RANGER_PARAMS.suspensionStiffnessFront)
check('fit: unknown id refused', parts.fit('nope') === null)

// ── 4. New tires hold air ─────────────────────────────────────────────────────────────────────
damage.flat[2] = true
parts.fit('tiresSport')
check('fit tires: flats cleared, grip changed', !damage.flat.some(Boolean) && params.frictionCoeff === 0.88)

// ── 5. Load ratings — the weakest part sets the limits ────────────────────────────────────────
const limits = () => massLimits(truckConfig(DEFAULT_VEHICLE_MODEL, parts.loadUpgrades()))
parts.start()
const stock = limits()
check('stock limits are the manufacturer\'s', stock.softKg === 570 && stock.hardKg === 820, JSON.stringify(stock))
parts.fit('springsHD')
check('one heavy-duty part alone moves nothing', limits().softKg === 570)
parts.fit('dampersHD'); parts.fit('tiresLT')
check('the full package raises both limits', limits().softKg === 800 && limits().hardKg === 1100, JSON.stringify(limits()))

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
