// test/parts.mjs — SM-3 parts gate.
//
// Pins the parts system's contract (data/parts.js, src/parts.js):
//   1. Catalog shape: every kind of part has exactly one STOCK part, and its patch equals RANGER_PARAMS
//      — so swapping back to stock restores the factory truck exactly. Every part of a kind patches the
//      same keys; no two kinds share a key (or one socket's fit would clobber another's). Every socket
//      covers at most one damage track — a part is what the durability system tracks (owner, 2026-10-20).
//   2. start() fits stock in every socket, new.
//   3. fit() lays the patch over params, returns what came off with its wear, sets the socket's track
//      to the incoming part's condition (new = 1, used = carried), and sets its family's durability —
//      a heavy-duty spring loses half as much to the same insult. A part refuses a socket it doesn't fit.
//   4. Tires are single, per corner: one sport tire changes that wheel's grip only, goes on holding
//      air, and the tire that came off reports its puncture.
//   5. Load ratings: the weakest part sets the limits, so one heavy-duty axle or three load-range
//      tires move nothing and the full §3f package does.
//
// Pure node: no THREE, no DOM.
import { PARTS, SLOTS, FAMILY_DURABILITY, RARITY_COLOR, takes, socketsFor } from '../data/parts.js'
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
for (const kind of new Set(Object.keys(SLOTS).map(takes))) {
  const ids = Object.keys(PARTS).filter(id => PARTS[id].slot === kind)
  const stock = ids.filter(id => PARTS[id].stock)
  check(`${kind}: exactly one stock part`, stock.length === 1, stock.join())
  const off = stock[0] && Object.entries(PARTS[stock[0]].patch).filter(([k, v]) => RANGER_PARAMS[k] !== v)
  check(`${kind}: stock patch equals RANGER_PARAMS`, off && off.length === 0, JSON.stringify(off))
  const odd = ids.filter(id => keys(id) !== keys(ids[0]))
  check(`${kind}: every part patches the same keys`, odd.length === 0, odd.join())
  for (const k of Object.keys(PARTS[ids[0]].patch)) {
    check(`key ${k} belongs to one kind`, !owner[k] || owner[k] === kind, `${owner[k]} and ${kind}`)
    owner[k] = kind
  }
}
for (const [s, def] of Object.entries(SLOTS)) check(`${s}: at most one track`, def.tracks.length <= 1)
for (const [id, p] of Object.entries(PARTS)) {
  check(`${id}: fits a socket, known family and rarity`, socketsFor(id).length > 0 && p.family in FAMILY_DURABILITY && p.rarity in RARITY_COLOR)
  check(`${id}: a tire carries grip, nothing else does`, (p.slot === 'tire') === (typeof p.grip === 'number'))
  check(`${id}: desc carries no digit (SM-INV-10)`, !/\d/.test(p.desc), p.desc)
}

// ── 2. start() ────────────────────────────────────────────────────────────────────────────────
const params = { ...RANGER_PARAMS }
const damage = new DamageModel({ params })
let changes = 0
const parts = new PartsSystem({ params, damage, onChange: () => { changes++ } })
damage.set('springFront', 0.3)
parts.start()
check('start(): stock tires on every corner, stock grip', ['tireFL', 'tireFR', 'tireRL', 'tireRR'].every(c => runParts.fitted[c] === 'tireStandard')
  && params._tireGrip.every(g => g === 1))
check('start(): every socket filled with its stock part', Object.keys(SLOTS).every(s => PARTS[runParts.fitted[s]]?.stock))
check('start(): tracks new', damage.get('springFront') === 1)
check('start(): one onChange', changes === 1, changes)

// ── 3. fit() ──────────────────────────────────────────────────────────────────────────────────
damage.set('springRear', 0.4)
const off = parts.fit('springsRearHD')
check('fit: patch lands on params', params.suspensionStiffnessRear === 52000 && params.suspensionStiffnessFront === 33000)
check('fit: returns the outgoing part with its wear', off.id === 'springsRearOEM' && off.cond === 0.4, JSON.stringify(off))
check('fit: the new part is new', damage.get('springRear') === 1)
damage.wear('springRear', 0.1, 1)
check('fit: heavy-duty durability halves the wear', Math.abs(damage.get('springRear') - (1 - 0.1 / FAMILY_DURABILITY.hd)) < 1e-12,
  damage.get('springRear'))
parts.fit('springsRearOEM', off.cond)
check('fit: a used part brings its wear back', damage.get('springRear') === 0.4)
check('fit: back to stock restores the factory rate', params.suspensionStiffnessRear === RANGER_PARAMS.suspensionStiffnessRear)
check('fit: unknown id refused', parts.fit('nope') === null)
check('fit: a rear spring refuses the front socket', parts.fit('springsRearHD', null, 'springsFront') === null)
check('fit: a tire needs its corner', parts.fit('tireSport') === null)

// ── 4. One tire, one corner ───────────────────────────────────────────────────────────────────
damage.flat[2] = true; damage.set('tireRL', 0.5)
const tire = parts.fit('tireSport', null, 'tireRL')
check('the flat comes off as itself, flat, with its wear', tire.id === 'tireStandard' && tire.flat && tire.cond === 0.5, JSON.stringify(tire))
check('the sport tire holds air, new', !damage.flat[2] && damage.get('tireRL') === 1)
check('only that wheel grips harder', params._tireGrip.join() === [1, 1, PARTS.tireSport.grip, 1].join(), params._tireGrip.join())
damage.publish(params)
check('…and physics sees it', params._tireMuScale[2] > params._tireMuScale[0], params._tireMuScale.join())

// ── 5. Load ratings — the weakest part sets the limits ────────────────────────────────────────
const limits = () => massLimits(truckConfig(DEFAULT_VEHICLE_MODEL, parts.loadUpgrades()))
parts.start()
const stock = limits()
check('stock limits are the manufacturer\'s', stock.softKg === 570 && stock.hardKg === 820, JSON.stringify(stock))
parts.fit('springsFrontHD'); parts.fit('springsRearHD'); parts.fit('dampersFrontHD'); parts.fit('dampersRearHD')
for (const c of ['tireFL', 'tireFR', 'tireRL']) parts.fit('tireLT', null, c)
check('three load-range tires move nothing', limits().softKg === 570, JSON.stringify(limits()))
parts.fit('tireLT', null, 'tireRR')
check('the full package raises both limits', limits().softKg === 800 && limits().hardKg === 1100, JSON.stringify(limits()))
parts.fit('dampersRearOEM')
check('one stock shock axle pulls them back', limits().softKg === 570, JSON.stringify(limits()))

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
