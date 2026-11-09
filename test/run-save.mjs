// GATE (FEAT-42): the run save — one rolling slot, and the mission board's replayable history.
//
// Pure node, a Map-backed storage. What is pinned:
//   1. ONE SLOT, ALWAYS NOW — put → load hands the data back; a second put overwrites it (there is
//      never an older record beside it); loading leaves it (a crash during a resume's own load must
//      not lose the run); clear deletes it.
//   2. FAILURE IS "NO SAVE" — corrupt JSON, another version, a missing payload, and a storage that
//      throws all come back null, and a corrupt record is gone afterwards (the run is lost, which is
//      the correct direction — never a half-restored run).
//   3. THE BOARD REPLAYS EXACTLY — a board driven through takes, completions and a cancel at scattered
//      hours, logged by logBoard, then JSON round-tripped and replayed onto a fresh board, lands on the
//      identical board at every later hour. A call that did not take (an offer no longer live) is not
//      logged, so a replay never re-tries it.
import * as save from '../src/save.js'
import { putRun, loadRun, hasRun, clearRun, logBoard, RUN_SAVE_VERSION } from '../src/save.js'
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

// ── 1. one slot, always now ──────────────────────────────────────────────────────────────────────
{
  const st = memory()
  const run = { seed: '6', day: { day: 3, hour: 14.25 }, economy: { money: 41.5, halfPoints: 3 } }
  check('nothing saved → no run', !hasRun(st) && loadRun(st) === null)
  check('putRun reports success', putRun(run, st) === true)
  const back = loadRun(st)
  check('loadRun returns the data', JSON.stringify(back) === JSON.stringify(run), JSON.stringify(back))
  check('…and leaves it (a crash mid-resume keeps the run)', hasRun(st) && JSON.stringify(loadRun(st)) === JSON.stringify(run))
  const later = { ...run, day: { day: 3, hour: 14.27 } }
  putRun(later, st)
  check('a second write overwrites: one record, the newest', st.m.size === 1 && loadRun(st).day.hour === 14.27)
  clearRun(st)
  check('clearRun discards it', !hasRun(st) && loadRun(st) === null)
  // FEAT-176: a save from before front and rear springs became one part loads with the part it is now — as a value
  // (fitted, inventory) and as a key — and a socket name that merely starts the same is left alone.
  putRun({ parts: { fitted: { springsRear: 'springsRearHD', dampersFront: 'dampersFrontOEM' } }, inventory: { entries: [{ id: 'springsFrontSport' }] }, n: { dampersRearHD: 1 } }, st)
  const old = loadRun(st)
  check('a save with retired part ids loads them renamed', old.parts.fitted.springsRear === 'springsHD' && old.parts.fitted.dampersFront === 'dampersOEM'
    && old.inventory.entries[0].id === 'springsSport' && old.n.dampersHD === 1, JSON.stringify(old))
  clearRun(st)
  check('save.js exports no second slot or history', !Object.keys(save).some(k => /slot|history|list|backup/i.test(k)))
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
    check(`${label} → null, and the slot is emptied`, loadRun(st) === null && !hasRun(st))
  }
  const boom = { getItem () { throw new Error('blocked') }, setItem () { throw new Error('blocked') }, removeItem () { throw new Error('blocked') } }
  check('throwing storage: put false, take null, has false, clear quiet',
        putRun({ a: 1 }, boom) === false && loadRun(boom) === null && hasRun(boom) === false && (clearRun(boom), true))
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
const errorsOf = (fn) => {   // console.error lines fn() printed
  const errs = [], e0 = console.error
  console.error = (...a) => errs.push(a.join(' '))
  try { fn() } finally { console.error = e0 }
  return errs
}
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
  let log2
  check(`seed ${seed}: a faithful replay reports no dropped events`, !errorsOf(() => { log2 = logBoard(back, saved.t0H, saved.events) }).length)
  // BUG-152: a roster re-sited between sessions (every POI id new) leaves no event able to take — say so loudly.
  const moved = POIS.map(p => ({ ...p, id: p.id + '@moved' }))
  const errs = errorsOf(() => logBoard(new OfferBoard({ seed, pois: moved, nowH: saved.t0H }), saved.t0H, saved.events))
  check(`seed ${seed}: a replay onto a re-sited roster reports every event dropped`,
        errs.some(e => e.includes(`dropped ${saved.events.length} of ${saved.events.length} events`)), JSON.stringify(errs))
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
