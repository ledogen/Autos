// GATE (FEAT-42): the run save — one slot, read-and-delete, and the mission board's replayable history.
//
// Pure node, a Map-backed storage. What is pinned:
//   1. TAKE DELETES — put → take hands the data back, and a second take finds nothing; hasRun is a
//      yes/no that never consumes. No reader in save.js leaves the record in place.
//   2. FAILURE IS "NO SAVE" — corrupt JSON, another version, a missing payload, and a storage that
//      throws all come back null, and a corrupt record is gone afterwards (the run is lost, which is
//      the correct direction — never a half-restored run).
//   3. THE BOARD REPLAYS EXACTLY — a board driven through takes, completions and a cancel at scattered
//      hours, logged by logBoard, then JSON round-tripped and replayed onto a fresh board, lands on the
//      identical board at every later hour. A call that did not take (an offer no longer live) is not
//      logged, so a replay never re-tries it.
import * as save from '../src/save.js'
import { putRun, takeRun, hasRun, clearRun, logBoard, RUN_SAVE_VERSION } from '../src/save.js'
import { OfferBoard } from '../src/offer-board.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}
const memory = () => {
  const m = new Map()
  return { m, getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }
}

// ── 1. take deletes ──────────────────────────────────────────────────────────────────────────────
{
  const st = memory()
  const run = { seed: '6', day: { day: 3, hour: 14.25 }, economy: { money: 41.5, halfPoints: 3 } }
  check('nothing saved → no run', !hasRun(st) && takeRun(st) === null)
  check('putRun reports success', putRun(run, st) === true)
  check('hasRun sees it, and does not consume it', hasRun(st) && hasRun(st))
  const back = takeRun(st)
  check('takeRun returns the data', JSON.stringify(back) === JSON.stringify(run), JSON.stringify(back))
  check('…and deleted it: a second take is null', takeRun(st) === null && !hasRun(st))
  putRun(run, st); clearRun(st)
  check('clearRun discards it', !hasRun(st) && takeRun(st) === null)
  const readers = Object.keys(save).filter(k => typeof save[k] === 'function' && /load|read|get|peek/i.test(k))
  check('no read-without-delete API exists', readers.length === 0, readers.join(', '))
}

// ── 2. every failure is "no save" ────────────────────────────────────────────────────────────────
{
  const st = memory()
  const key = () => [...st.m.keys()][0]
  putRun({ a: 1 }, st)
  const k = key()
  for (const [label, raw] of [['corrupt JSON', '{"v":1,"data":'], ['another version', JSON.stringify({ v: RUN_SAVE_VERSION + 1, data: { a: 1 } })],
                              ['no payload', JSON.stringify({ v: RUN_SAVE_VERSION })], ['not an object', '42']]) {
    st.m.set(k, raw)
    check(`${label} → null, and the slot is emptied`, takeRun(st) === null && !hasRun(st))
  }
  const boom = { getItem () { throw new Error('blocked') }, setItem () { throw new Error('blocked') }, removeItem () { throw new Error('blocked') } }
  check('throwing storage: put false, take null, has false, clear quiet',
        putRun({ a: 1 }, boom) === false && takeRun(boom) === null && hasRun(boom) === false && (clearRun(boom), true))
}

// ── 3. the board replays exactly ─────────────────────────────────────────────────────────────────
const POIS = [
  { id: 'poi:1|2', type: 'momsHouse', modelKey: 'trailerHomeA' }, { id: 'poi:3|4', type: 'larrysHouse', modelKey: 'trailerHomeA' },
  { id: 'poi:5|6', type: 'gasStation' }, { id: 'poi:9|10', type: 'autoShop' }, { id: 'poi:13|14', type: 'foodVendor' },
  { id: 'poi:15|16', type: 'generalStore' }, { id: 'poi:19|20', type: 'residence', modelKey: 'trailerHomeA' },
  { id: 'poi:21|22', type: 'residence', modelKey: 'winnebago' }, { id: 'poi:23|24', type: 'strandedMotorist', modelKey: 'brokenCar' },
  { id: 'poi:29|30', type: 'firewoodYard' }, { id: 'poi:31|32', type: 'workSite' }, { id: 'poi:35|36', type: 'farm' },
]
const T0 = 6
const state = (b) => b._slots.map(s => `${s.slot}:${s.poiId}:${s.offer?.id}@${s.offer?.expiresH?.toFixed(9)}:${s.offer?.dueH}:${s.state}:${s.until}`).join('|')
for (const seed of [6, 1536014377, 42]) {
  const live = new OfferBoard({ seed, pois: POIS, nowH: T0 })
  const log = logBoard(live, T0)
  // A run: take the first live offer at a POI, finish or cancel it a little later, move on.
  let h = T0, n = 0
  for (let i = 0; i < 12; i++) {
    h += 0.7 + (i % 4) * 1.9
    const poi = POIS[(i * 5) % POIS.length].id
    const o = live.offers(poi, h)[0]
    if (!o) continue
    if (!live.take(o.id, h, 300 + 60 * i)) continue
    n++
    h += 0.4 + (i % 3)
    if (i % 4 === 3) live.abandon(o.id, h); else live.complete(o.id, h)
  }
  live.take('poi:5|6#nope#0', h, 300)   // not live → not logged
  const saved = JSON.parse(JSON.stringify(log))
  check(`seed ${seed}: the log holds every call that took (${n} jobs)`, saved.events.length === 2 * n, `${saved.events.length} vs ${2 * n}`)
  const back = new OfferBoard({ seed, pois: POIS, nowH: saved.t0H })
  const log2 = logBoard(back, saved.t0H, saved.events)
  let same = true
  for (const at of [h, h + 0.5]) { live.advance(at); back.advance(at); same &&= state(live) === state(back) }
  check(`seed ${seed}: the replayed board equals the live one, now and half an hour on`, same)
  const bare = new OfferBoard({ seed, pois: POIS, nowH: saved.t0H })
  bare.advance(h + 0.5); back.advance(h + 0.5)
  check(`seed ${seed}: non-vacuous — the same board WITHOUT the history differs`, state(bare) !== state(back))
  for (const at of [h + 13, h + 49]) { live.advance(at); back.advance(at); same &&= state(live) === state(back) }
  check(`seed ${seed}: …and still equal a day and two later`, same)
  check(`seed ${seed}: the replay re-logs the same history`, JSON.stringify(log2.events) === JSON.stringify(saved.events))
}

console.log(fails ? `RUN-SAVE: ${fails} FAIL` : 'ALL RUN-SAVE CHECKS PASSED')
process.exit(fails ? 1 : 0)
