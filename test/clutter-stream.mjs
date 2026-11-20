// test/clutter-stream.mjs — FEAT-278: the world-clutter queue (src/clutter.js). FAST, pure.
//
// Asserts: nothing spawns before the queue is opened, nor after a reset that came before the open resolved (a load
// from an older rebuild opens nothing) · it drains nearest the truck first · it stops at the deadline but always
// spawns one · every queued piece spawns exactly once, and a reset drops what is still pending · the yards it carries
// are poi.js's, so streaming changes when a piece appears, never which or where (poi-yard.mjs gates where).
import { ClutterQueue } from '../src/clutter.js'

let fails = 0
const check = (label, ok, detail = '') => { console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`); if (!ok) fails++ }

const q = new ClutterQueue(), got = []
const pts = [[50, 0], [5, 5], [-20, 1], [0, 300], [2, -1], [100, 100]]
for (const [x, z] of pts) q.add(x, z, () => got.push(`${x},${z}`))
check('closed: nothing drains before openWhen resolves', q.drain(0, 0, Infinity) === 0 && got.length === 0)

// A reset before the open resolves: the stale open is dropped.
let release
const stale = q.openWhen(new Promise(r => { release = r }))
q.reset()
release(); await stale
check('a reset before the load resolves keeps the queue closed', q.drain(0, 0, Infinity) === 0 && q.pending === 0)

for (const [x, z] of pts) q.add(x, z, () => got.push(`${x},${z}`))
await q.openWhen(Promise.resolve())
// A fake clock: each call to now() advances 1 ms; the deadline is 3 ms out → three spawns, nearest first.
let t = 0
const now = () => ++t
check('stops at the deadline', q.drain(0, 0, 3, now) === 3, `pending ${q.pending}`)
check('nearest first', got.join(' ') === '2,-1 5,5 -20,1', got.join(' '))
check('a spent budget still spawns one', q.drain(0, 0, -1, now) === 1 && got.at(-1) === '50,0', got.join(' '))
q.drain(0, 0, Infinity)
check('every piece once, none twice', got.length === pts.length && new Set(got).size === pts.length, got.join(' '))

q.add(1, 1, () => got.push('late'))
q.reset()
check('a reset drops what is pending', q.pending === 0 && q.drain(0, 0, Infinity) === 0 && !got.includes('late'))

console.log(fails ? `FAIL: ${fails}` : 'PASS')
process.exit(fails ? 1 : 0)
