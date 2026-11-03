// GATE (FEAT-153): every POI type earns its visits. Over 300 seeded boards on the real roster
// (src/poi.js POI_ROSTER, with the ids and tags PoiSystem gives it), at the hour a run opens:
//   1. every giver posts at least GIVER_FLOOR of the live offers;
//   2. every POI type has a reason to be visited (the ticket's aim): it posts at least GIVER_FLOOR, or
//      ends at least END_FLOOR jobs per board that are MEANT for it — a thing whose `to` (or a fetch's
//      pickup) names it, as the ticket's census counted. An offer counts 1/n at each of the n POIs its
//      destination wish allows (destWish; the planner's pick among them is uniform). Reach is
//      ignored — no network here — so this is the pool's share, not a routed one. A generic thing can
//      end anywhere and counts in the "any" column only: spread over every POI it hid the office's
//      and school's gap (0.44 / 0.38 per board before FEAT-153, against 0.13 / 0.10 meant for them).
//      The doctor has nothing meant for it (owner, 2026-11-02: no specimen) and passes by posting.
// Pure: no network, no terrain. Prints the census table it judged (posts share, ends per board).
import { OfferBoard } from '../src/offer-board.js'
import { POI_ROSTER } from '../src/poi.js'
import { SOURCES, NOT_A_DESTINATION } from '../data/offers.js'

const BOARDS = 300, T0 = 6
const GIVER_FLOOR = 0.03   // owner-approved proposal (FEAT-153, 2026-11-02)
const END_FLOOR = 0.3      // jobs per board: one in three boards
// Types that are never anyone's drop-off by design: the motorist is a wreck on the shoulder, there
// only while their own job is open.
const NOT_ENDS = new Set([...NOT_A_DESTINATION, 'strandedMotorist'])

let n = 0
const pois = POI_ROSTER.flatMap(r => Array.from({ length: r.count }, () => {
    n += 2
    return { id: `poi:${n - 1}|${n}`, type: r.type, tags: [r.type, ...(r.tags ?? [])] }
}))
const typeOf = new Map(pois.map(q => [q.id, q.type]))
const posts = {}, ends = {}, any = {}
let live = 0
for (let seed = 1; seed <= BOARDS; seed++) {
    const b = new OfferBoard({ seed, pois, nowH: T0 })
    for (const id of b.sources()) for (const o of b.offers(id, T0)) {
        live++
        posts[typeOf.get(id)] = (posts[typeOf.get(id)] ?? 0) + 1
        const w = b.destWish(o, pois, new Set())
        if (w.kind !== 'poi' || !w.pois.length) continue
        const each = Math.min(1, (w.stops ?? 1) / w.pois.length), sp = b.spec(o)
        const meant = sp.shape === 'fetch' || sp.to ? ends : any
        for (const q of w.pois) meant[q.type] = (meant[q.type] ?? 0) + each
    }
}

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`[${ok ? ' ok ' : 'FAIL'}] ${label}${ok || !detail ? '' : ' — ' + detail}`)
    if (!ok) fails++
}
const types = [...new Set(pois.map(q => q.type))]
const perBoard = (m, t) => NOT_ENDS.has(t) ? '    —' : ((m[t] ?? 0) / BOARDS).toFixed(2).padStart(5)
console.log(`${BOARDS} boards, ${(live / BOARDS).toFixed(1)} live offers each\n  type               posts   ends/board: meant · any`)
for (const t of types) console.log(`  ${t.padEnd(18)} ${SOURCES[t] ? ((posts[t] ?? 0) / live * 100).toFixed(1).padStart(5) + ' %' : '      —'}   ${perBoard(ends, t)} · ${perBoard(any, t)}`)

const lowGivers = types.filter(t => SOURCES[t] && (posts[t] ?? 0) / live < GIVER_FLOOR)
check(`every giver posts at least ${GIVER_FLOOR * 100} % of the live offers`, lowGivers.length === 0,
    lowGivers.map(t => `${t} ${((posts[t] ?? 0) / live * 100).toFixed(1)} %`).join(', '))
const unvisited = types.filter(t => !NOT_ENDS.has(t) && (ends[t] ?? 0) / BOARDS < END_FLOOR
    && !(SOURCES[t] && (posts[t] ?? 0) / live >= GIVER_FLOOR))
check(`every POI type posts at least ${GIVER_FLOOR * 100} % or ends at least ${END_FLOOR} jobs per board`, unvisited.length === 0,
    unvisited.map(t => `${t} ends ${((ends[t] ?? 0) / BOARDS).toFixed(2)}`).join(', '))

console.log(fails ? `\n${fails} offer-census check(s) FAILED` : '\nall offer-census checks passed')
process.exit(fails ? 1 : 0)
