// GATE (FEAT-143 phase 1): items dropped on the ground and picked back up — the pure layer.
//   1. a drop hands main.js the removed entry (InventorySystem onDrop), and it lies where it was put;
//   2. near() finds it within the one shared reach (REACH_M), nearest first, and not beyond it;
//   3. take() + restoreEntry() puts back the IDENTICAL entry — a part's condition, a can's gallons, an
//      open roll's uses — and with no room it refuses (the item stays on the ground, no swap prompt);
//   4. the list survives the save (JSON round trip through restoreWorldItems);
//   5. the reach is measured from the truck's OUTLINE: a thing just behind the tailgate is in reach.
import { InventorySystem, runInventory } from '../src/inventory.js'
import { runWorldItems, place, near, take, rest, restoreWorldItems, REACH_M } from '../src/world-items.js'
import { ITEMS } from '../data/items.js'

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`  [${ok ? ' ok ' : 'FAIL'}] ${label}${ok || !detail ? '' : ' — ' + detail}`)
    if (!ok) fails++
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const dropped = []
const inv = new InventorySystem({ slotCap: () => 12, onDrop: (e) => dropped.push(e) })
inv.start()
restoreWorldItems(null)
const part = Object.keys(ITEMS).find(id => ITEMS[id].kind === 'part')
const can = Object.keys(ITEMS).find(id => ITEMS[id].capGal)
inv.grant(part, 1, { cond: 0.42 })
inv.grant(can, 1)
runInventory.entries.find(e => e.id === can).gal = 1.7
const before = runInventory.entries.map(e => JSON.parse(JSON.stringify(e)))

// 1. drop → onDrop with the entry; place it on the ground
const iPart = runInventory.entries.findIndex(e => e.id === part), iCan = () => runInventory.entries.findIndex(e => e.id === can)
check('a drop succeeds', inv.drop(iPart) === true)
check('the drop hands over the removed entry', dropped.length === 1 && dropped[0].id === part && dropped[0].cond === 0.42, JSON.stringify(dropped))
place(dropped[0], { x: 10, y: 5, z: 10, q: [0, 0, 0, 1] })
inv.drop(iCan())
place(dropped[1], { x: 11, y: 5, z: 10 })
rest(1, { x: 10.5, y: 5.2, z: 10, q: [0, 0.7071, 0, 0.7071] })
check('both lie on the ground', runWorldItems.items.length === 2 && runWorldItems.items[1].x === 10.5 && runWorldItems.items[1].q[1] === 0.7071)

// 2. near: within the reach, nearest first; nothing beyond it
const n1 = near(10.4, 10)
check(`near() finds both within ${REACH_M} m, nearest first`, same(n1, [1, 0]), JSON.stringify(n1))
check('nothing is in reach from 4 m away', near(10, 10 + REACH_M + 1).length === 0)

// 3. take + restore: the identical entries come back
const back = []
for (const i of near(10.4, 10).sort((a, b) => b - a)) back.push(take(i))
for (const e of back) check(`picks up ${e.id}`, inv.restoreEntry(e) === true)
const after = runInventory.entries.map(e => JSON.parse(JSON.stringify(e)))
const key = (l) => l.map(e => JSON.stringify(e)).sort()
check('picked up, the entries are exactly what went down (condition, gallons)', same(key(after), key(before)), `${JSON.stringify(before)} → ${JSON.stringify(after)}`)
check('the ground is empty again', runWorldItems.items.length === 0)

// 3b. an open roll keeps its uses; no room refuses and changes nothing
const roll = Object.keys(ITEMS).find(id => ITEMS[id].uses > 1)
inv.grant(roll, 2)
const iRoll = runInventory.entries.findIndex(e => e.id === roll)
runInventory.entries[iRoll].left = 1
inv.drop(iRoll)
const rollBack = take(place(dropped.at(-1), { x: 0, y: 0, z: 0 }))
inv.restoreEntry(rollBack)
const r = runInventory.entries.find(e => e.id === roll)
check(`${roll}: the open one still has 1 use left`, r?.n === 2 && r.left === 1, JSON.stringify(r))
const full = new InventorySystem({ slotCap: () => 0 })
const snap = JSON.stringify(runInventory)
check('no room: refused, the inventory unchanged', full.restoreEntry({ id: part, n: 1, cond: 0.5 }) === false && JSON.stringify(runInventory) === snap)
runInventory.entries.splice(runInventory.entries.findIndex(e => e.id === roll), 1)

// 4. save round trip
place({ id: part, n: 1, cond: 0.9 }, { x: 1, y: 2, z: 3, q: [0, 0, 0.3826834, 0.9238795] })
const saved = JSON.parse(JSON.stringify({ worldItems: runWorldItems.items }))
restoreWorldItems(null)
check('a new run starts with nothing on the ground', runWorldItems.items.length === 0)
restoreWorldItems(saved.worldItems)
check('a save brings the drop back where it lay', runWorldItems.items.length === 1 && runWorldItems.items[0].entry.cond === 0.9 && runWorldItems.items[0].q[2] === 0.3826834)

// 5. reach from the outline: a truck at the origin facing −Z, tail 2.54 m back, nose 2.17 m on, 0.83 m half width
restoreWorldItems(null)
place({ id: part, n: 1 }, { x: 0.3, y: 0, z: 2.54 + 0.6 })   // 0.6 m off the tailgate (3.15 m from the centre)
place({ id: part, n: 1 }, { x: 0.83 + REACH_M + 0.2, y: 0, z: 0 })   // just past the reach off the side
const fp = { fx: 0, fz: -1, front: 2.17, rear: 2.54, half: 0.83 }
check('behind the tailgate: out of reach of the centre, in reach of the outline', near(0, 0).length === 0 && same(near(0, 0, REACH_M, fp), [0]),
    JSON.stringify(near(0, 0, REACH_M, fp)))

console.log(fails ? `\nworld-items: ${fails} FAIL` : '\nworld-items: all ok')
process.exit(fails ? 1 : 0)
