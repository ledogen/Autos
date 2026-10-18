// GATE (FEAT-67): the mission board — slots, timers, seeded rolls, names, the card view-model.
//
// Pure: no network, no terrain. The board (src/offer-board.js) is a function of (seed, POI list,
// clock, completion/cancel log), so a synthetic roster exercises all of it. The route half (a board
// offer planned into a mission) lives in test/story-poi.mjs, which has a real region.
//
// What is pinned, and why each matters:
//   1. DETERMINISM — same seed, same board, down to every name and every roll. Different seed, a
//      different board.
//   2. SLOTS — always-on sources have exactly their SOURCES slots; BUDGET_JOBS budget slots are
//      spread over budget givers within their caps; non-givers (tackle shop, office, school, mom)
//      hold nothing.
//   3. BOARD SIZE (FEAT-101) — with no player, every slot is live at every time: 12 budget jobs +
//      food 2–3 + yard 2 + Larry 1 = 17–18, and no giver ever exceeds its cap.
//   4. EXPIRY NOISE — every lifetime is inside centre ± 30 % (range centres rolled per POI); Larry's
//      offer never expires.
//   5. DESYNC — no two of a POI's own slots share an expiry at world start, and the starting age /
//      life fraction is uniform over 2000 seeds (the L/2 line-up is the thing to avoid).
//   6. LAZY == STEPPED — one 30 h jump and 1800 one-minute steps land on the identical board, with a
//      completion interleaved (the budget's coupled events replay in global time order).
//   7. THE LOCK RULE — a completion locks for a FRESH full life from that moment; a locked budget
//      slot stays parked and its place takes no new budget job until it clears; finishing a job
//      never brings the next budget offer sooner (200 seeds, against an untouched twin). Larry never
//      expires, shows no timer, and is unavailable 12 h after a round.
//   8. CANCEL locks exactly as a completion does — including a cancel after expiry.
//   9. TAKEN offers are hidden and do not count toward the turnover timer.
//  10. ONLY BUILT FAMILIES roll (BUILT_FAMILIES) and every built one appears — demolition never does.
//  11. NAMES — deduplicated within a region; a 'home' giver is "the <last> place", a 'person'
//      giver is one person and no place name.
//  12. THE CARD — base pay equals economy.basePay at the offer's multiplier (0.5× on a bonus
//      offer), the gate reads "X or better" / "S only", and the terms state distance, weight, board
//      expiry and the delivery window.
//  13. BONUS SHARE ≈ 25 % where the source has rewards; never where it has none.
//  16. DEADLINES (FEAT-113) — every thing resolves a deadline slack (its own or the family's);
//      take() stamps dueH = take + par × (1 + slack) (60 real s of par = one game hour); no par → no
//      deadline; a taken slot still in hand at dueH locks AT dueH (always-on and budget alike), and a
//      late complete/cancel is then a no-op.
//  14. IMPORT DISCIPLINE — the board imports only its tables, seed.js and economy.js, and never
//      reads Math.random.
import { readFileSync } from 'node:fs'
import { OfferBoard, BUILT_FAMILIES, gateText, formatGameDuration, personLabel } from '../src/offer-board.js'
import { THINGS, DEADLINE_SLACK, SOURCES, BUDGET_JOBS, EXPIRY_NOISE, BONUS_PAY_MULT, HAUL_BUNDLES, HAUL_BUNDLE_KG, HAUL_PAY_PER_BUNDLE, HAUL_PAR_SLACK } from '../data/offers.js'
import { basePay, formatMoney } from '../src/economy.js'
import { NAME_FORMS, HOUSEHOLDS, BUSINESS_TYPES, POI_ADJECTIVES, PLACE_NOUNS } from '../data/offer-names.js'

// Could POI `q`'s rolled name have come from one of its class's forms? Each form becomes a regex
// with the slots opened up: {first}/{last} are the POI's first person, the rest their word lists.
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const alt = (list) => `(?:${list.map(esc).join('|')})`
function fromForms (type, name, p) {
    return (NAME_FORMS[type] || []).some(f => new RegExp('^' + f.split(/(\{\w+\})/).map(t =>
        t === '{first}' ? esc(p.first) : t === '{last}' ? esc(p.last)
        : t === '{the}' ? '(?:The )?' : t === '{adj}' ? `(?:${alt(POI_ADJECTIVES)} )?`
        : t === '{biz}' ? alt(BUSINESS_TYPES[type]) : esc(t)).join('') + '$').test(name))
}

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

// A full roster in the shape PoiSystem.list() hands over (ids + types + model keys).
const POIS = [
    { id: 'poi:1|2',   type: 'momsHouse',    modelKey: 'trailerHomeA' },
    { id: 'poi:3|4',   type: 'larrysHouse',  modelKey: 'trailerHomeA' },
    { id: 'poi:5|6',   type: 'gasStation' },
    { id: 'poi:7|8',   type: 'gasStation' },
    { id: 'poi:9|10',  type: 'autoShop' },
    { id: 'poi:11|12', type: 'autoShop' },
    { id: 'poi:13|14', type: 'foodVendor' },
    { id: 'poi:15|16', type: 'generalStore' },
    { id: 'poi:17|18', type: 'tackleShop' },
    { id: 'poi:19|20', type: 'residence', modelKey: 'trailerHomeA' },
    { id: 'poi:21|22', type: 'residence', modelKey: 'winnebago' },
    { id: 'poi:23|24', type: 'strandedMotorist', modelKey: 'brokenCar' },
    { id: 'poi:25|26', type: 'residence', modelKey: 'trailerHomeA' },
    { id: 'poi:27|28', type: 'residence', modelKey: 'winnebago' },
    { id: 'poi:29|30', type: 'firewoodYard' },
    { id: 'poi:31|32', type: 'workSite' },
    { id: 'poi:33|34', type: 'residence', modelKey: 'trailerHomeA' },
    { id: 'poi:35|36', type: 'farm' },
    { id: 'poi:37|38', type: 'farm' },
    { id: 'poi:39|40', type: 'farm' },
    { id: 'poi:41|42', type: 'office' },
    { id: 'poi:43|44', type: 'school' },
    { id: 'poi:45|46', type: 'doctor' },
]
const T0 = 6   // dayStartHour: the clock a run opens on
const make = (seed, nowH = T0) => new OfferBoard({ seed, pois: POIS, nowH })
const slotsOf = (b, id) => b._always.get(id) || []            // a POI's OWN (always-on) slots
const hosted = (b, id) => b._budget.filter(s => s.poiId === id && s.state !== 'idle')
const snapshot = (b) => b._slots.map(s => `${s.slot}:${s.poiId}:${s.offer?.id}@${s.offer?.expiresH.toFixed(9)}:${s.state}:${s.until}`).join('|')
const ofType = (t) => POIS.filter(q => q.type === t).map(q => q.id)

// ── 1. determinism ──────────────────────────────────────────────────────────────────────────────
{
    const a = make(6), b = make(6), c = make(7)
    const dump = (x) => x.sources().map(id => [x.poiName(id), JSON.stringify(x.people(id)),
        ...x.offers(id, T0).map(o => JSON.stringify(x.spec(o)))].join(';')).join('\n') + snapshot(x)
    check('same seed → identical board (names, people, specs, timers)', dump(a) === dump(b))
    check('different seed → a different board', dump(a) !== dump(c))
}

// ── 2. slot counts ──────────────────────────────────────────────────────────────────────────────
{
    const b = make(6)
    const bad = POIS.filter(q => {
        const src = SOURCES[q.type], n = slotsOf(b, q.id).length
        if (!src || src.cap) return n !== 0
        return Array.isArray(src.slots) ? !(n >= src.slots[0] && n <= src.slots[1]) : n !== src.slots
    })
    check('always-on sources have exactly their own slots; nobody else has any', bad.length === 0,
        bad.map(q => `${q.type} ${slotsOf(b, q.id).length}`).join(', '))
    check(`${BUDGET_JOBS} budget jobs are live at world start`, b._budget.filter(s => s.state === 'live').length === BUDGET_JOBS)
    const off = POIS.filter(q => !SOURCES[q.type]?.cap && hosted(b, q.id).length)
    check('only budget givers host budget jobs (never the office, school or mom)', off.length === 0,
        off.map(q => q.type).join(', '))
    check('isGiver: every source, and no one else', POIS.every(q =>
        b.isGiver(q.id) === !!SOURCES[q.type]), POIS.filter(q => b.isGiver(q.id) !== !!SOURCES[q.type]).map(q => q.type).join(', '))
    const budgetOnly = ofType('residence')[0]
    check('a budget giver schedules no "next offer" — where the budget refills is a roll',
        b.nextTurnoverH(budgetOnly, T0) === null)
}

// ── 3. board size ───────────────────────────────────────────────────────────────────────────────
{
    let lo = Infinity, hi = 0, overCap = 0, notFull = 0, everHost = new Set()
    for (const seed of [11, 12, 13]) {
        const b = make(seed)
        const own = b._slots.length - BUDGET_JOBS
        for (let t = T0; t < T0 + 24 * 10; t += 0.37) {
            b.advance(t)
            let live = 0
            for (const id of b.sources()) {
                live += b.offers(id, t).length
                const src = SOURCES[b._pois.get(id).type]
                if (src.cap && hosted(b, id).length > src.cap) overCap++
                if (hosted(b, id).length) everHost.add(`${seed}:${id}`)
            }
            if (live !== own + BUDGET_JOBS) notFull++
            lo = Math.min(lo, live); hi = Math.max(hi, live)
        }
    }
    check('with no player the whole board is live, always (10 days × 3 seeds)', notFull === 0, `${notFull} samples short`)
    check('…and it holds 17–18 jobs', lo >= 17 && hi <= 18, `${lo}–${hi}`)
    check('no budget giver ever holds more than its cap', overCap === 0, `${overCap}`)
    const givers = POIS.filter(q => SOURCES[q.type]?.cap).length
    check('every budget giver hosts work at some point (the refill is uniform, not sticky)',
        everHost.size === 3 * givers, `${everHost.size}/${3 * givers}`)
}

// ── 4. expiry noise ─────────────────────────────────────────────────────────────────────────────
{
    let bad = 0, n = 0
    for (let seed = 1; seed <= 40; seed++) {
        const b = make(seed)
        b.advance(T0 + 24 * 6)
        for (const s of b._slots) {
            if (s.state === 'idle') continue
            const src = SOURCES[s.type]
            n++
            if (src.expiryH == null) { if (isFinite(s.offer.lifeH)) bad++; continue }
            const lo = (Array.isArray(src.expiryH) ? src.expiryH[0] : src.expiryH) * (1 - EXPIRY_NOISE)
            const hi = (Array.isArray(src.expiryH) ? src.expiryH[1] : src.expiryH) * (1 + EXPIRY_NOISE)
            if (!(s.offer.lifeH >= lo - 1e-9 && s.offer.lifeH <= hi + 1e-9)) bad++
        }
        // A range centre is rolled ONCE per POI: all its offers sit within ±30 % of it.
        for (const q of POIS.filter(p => p.type === 'residence')) {
            const lifes = []
            for (let k = 0; k < 20; k++) lifes.push(b._lifeH(q.id, q.type, 0, k))
            const c = lifes.reduce((x, y) => x + y) / lifes.length
            if (Math.max(...lifes) / Math.min(...lifes) > (1 + EXPIRY_NOISE) / (1 - EXPIRY_NOISE) + 1e-9) bad++
            if (!(c >= 24 * 0.7 && c <= 72 * 1.3)) bad++
        }
    }
    check('every lifetime is inside centre ± 30 % (range: one centre per POI); Larry never expires', bad === 0, `${bad} of ${n}`)
}

// ── 5. desync ───────────────────────────────────────────────────────────────────────────────────
{
    let shared = 0
    const bins = new Array(10).fill(0)
    let samples = 0
    for (let seed = 1; seed <= 2000; seed++) {
        const b = make(seed)
        for (const id of b.sources()) {
            const ex = slotsOf(b, id).filter(s => isFinite(s.offer.lifeH)).map(s => s.offer.expiresH)
            if (new Set(ex.map(x => x.toFixed(6))).size !== ex.length) shared++
        }
        for (const s of b._slots) {
            if (s.state !== 'live' || !isFinite(s.offer.lifeH)) continue
            const f = (T0 - s.offer.bornH) / s.offer.lifeH
            bins[Math.min(9, Math.floor(f * 10))]++; samples++
        }
    }
    check('no two of a POI\'s own slots share an expiry at world start (2000 seeds)', shared === 0, `${shared}`)
    const worst = Math.max(...bins.map(c => Math.abs(c / samples - 0.1)))
    check('starting age / life is uniform over 2000 seeds (every decile 10 % ± 1.5 %)', worst < 0.015,
        bins.map(c => (100 * c / samples).toFixed(1)).join(' '))
}

// ── 6. lazy == stepped ──────────────────────────────────────────────────────────────────────────
{
    const a = make(21), b = make(21)
    // The same completion in both, at the same clock: the budget's coupling must not care how the
    // clock got there.
    const act = (x) => {
        const s = x._budget[0], o = s.offer
        x.take(o.id, T0 + 1); x.complete(o.id, T0 + 2)
    }
    a.advance(T0 + 1); act(a); a.advance(T0 + 30)
    for (let i = 1; i <= 1800; i++) { b.advance(T0 + i / 60); if (i === 60) act(b) }
    check('one 30 h jump == 1800 one-minute steps, a completion interleaved (ids, expiries, states, hosts)',
        snapshot(a) === snapshot(b))
    // …and the lazy offer CONTENT does not depend on when it was first read.
    const idA = a.sources()[0], oA = a.offers(idA, T0 + 30)[0], oB = b.offers(idA, T0 + 30)[0]
    check('an offer rolls the same content whenever it is first read',
        JSON.stringify(a.spec(oA)) === JSON.stringify(b.spec(oB)))
}

// ── 7. the lock rule ────────────────────────────────────────────────────────────────────────────
{
    const b = make(31)
    const s = b._budget[0], o = s.offer, host = s.poiId
    const t = T0 + 0.5
    check('take removes a live offer from the board', !!b.take(o.id, t) && !b.offers(host, t).some(x => x.id === o.id))
    const fin = t + 0.1
    b.complete(o.id, fin)
    check('a completed budget job locks for a FRESH full life from the completion, parked on its place',
        s.state === 'locked' && s.poiId === host && Math.abs(s.until - (fin + o.lifeH)) < 1e-9)
    let intruded = 0
    for (let u = fin; u < s.until - 1e-6; u += 0.25) { b.advance(u); if (b._budget.some(x => x !== s && x.poiId === host && x.offer?.bornH > fin)) intruded++ }
    check('…and its place takes no new budget job until the lock clears', intruded === 0, `${intruded}`)
    const until = s.until
    b.advance(until + 1e-6)
    check('…then the slot refills, born at the lock\'s end', s.state === 'live' && s.offer.k === o.k + 1
        && Math.abs(s.offer.bornH - until) < 1e-9)
    check('completing twice is a no-op', b.complete(o.id, until + 1) === false)

    // Finishing never brings the next budget offer sooner — against an untouched twin. Take the
    // slot's first offer at a seeded moment, finish it halfway to its expiry, and compare when the
    // slot next refills with the twin that left it alone.
    let sooner = 0
    for (let seed = 1; seed <= 200; seed++) {
        const i = seed % BUDGET_JOBS
        const x = make(seed), y = make(seed), sx = x._budget[i], sy = y._budget[i], ox = sx.offer
        const tk = T0 + (ox.expiresH - T0) * ((seed * 0.618) % 1)
        x.take(ox.id, tk); x.complete(ox.id, tk + (ox.expiresH - tk) * 0.5)
        const refillX = sx.until, refillY = sy.offer.expiresH   // locked until / untouched expiry
        if (refillX < refillY - 1e-9) sooner++
    }
    check('finishing a job never brings the next budget offer sooner (200 seeds, vs an untouched twin)', sooner === 0, `${sooner}`)

    // Always-on: the haul yard locks the same way and re-rolls in its own slot.
    const yard = ofType('firewoodYard')[0], ys = slotsOf(b, yard)[0], yo = ys.offer
    const yt = Math.max(until + 2, yo.bornH)
    b.advance(yt)
    const yo2 = ys.offer
    b.take(yo2.id, yt); b.complete(yo2.id, yt + 1)
    check('an always-on slot locks for a fresh full life too', ys.state === 'locked'
        && Math.abs(ys.until - (yt + 1 + yo2.lifeH)) < 1e-9)

    // Larry: never expires, no timer, 12 h after a round (owner, 2026-10-07).
    const larry = ofType('larrysHouse')[0], ls = slotsOf(b, larry)[0], lo = ls.offer
    b.advance(T0 + 24 * 30)
    check("Larry's offer never expires (still the first one after 30 days)", ls.offer === lo && !isFinite(lo.expiresH))
    const card = b.card(lo, { nowH: T0 + 24 * 30 })
    check("…and his card shows no timer", !card.terms.some(x => x.startsWith('expires')), card.terms.join(' | '))
    check("…nor does the map schedule a turnover there", b.nextTurnoverH(larry, T0 + 24 * 30) === null)
    const lf = T0 + 24 * 30 + 1
    b.take(lo.id, lf - 1); b.complete(lo.id, lf)
    check("after a round Larry is unavailable for exactly 12 h", ls.state === 'locked' && Math.abs(ls.until - (lf + 12)) < 1e-9
        && b.nextTurnoverH(larry, lf) === lf + 12)
    b.advance(lf + 12 + 1e-6)
    check('…then a fresh offer appears', ls.state === 'live' && ls.offer.k === lo.k + 1)
}

// ── 8. cancel ───────────────────────────────────────────────────────────────────────────────────
{
    const b = make(41)
    const food = ofType('foodVendor')[0]
    const o = b.offers(food, T0)[0]
    b.take(o.id, T0)
    const t = T0 + 0.2
    b.abandon(o.id, t)
    const s = slotsOf(b, food)[o.slot]
    check('cancel locks the slot for the full life from the cancel',
        s.state === 'locked' && Math.abs(s.until - (t + o.lifeH)) < 1e-9)

    // Cancel AFTER the original expiry: still the full life (the retired formula gave 0).
    b.advance(s.until + 1e-6)
    const o2 = b.offers(food, s.until + 1e-6).find(x => x.slot === o.slot)
    b.take(o2.id, o2.bornH)
    const late = o2.expiresH + 5
    b.abandon(o2.id, late)
    check('a cancel after expiry is NOT free — locked for the full life from the cancel',
        s.state === 'locked' && Math.abs(s.until - (late + o2.lifeH)) < 1e-9)
    check('cancel of an offer that is not taken is refused', b.abandon(b.offers(food, late)[0]?.id, late) === false)
}

// ── 9. taken offers are hidden ──────────────────────────────────────────────────────────────────
{
    const b = make(51)
    const food = ofType('foodVendor')[0]
    const before = b.offers(food, T0)
    const o = before[0]
    b.take(o.id, T0)
    const after = b.offers(food, T0)
    check('a taken offer disappears from offers()', after.length === before.length - 1 && !after.some(x => x.id === o.id))
    check('isLive is false for a taken offer', !b.isLive(o.id, T0))
    const others = slotsOf(b, food).filter(s => s.state === 'live').map(s => s.offer.expiresH)
    check('the turnover timer ignores the taken slot', b.nextTurnoverH(food, T0) === Math.min(...others))
    check('a taken offer cannot be taken twice', b.take(o.id, T0) === null)
}

// ── 10. only built families ─────────────────────────────────────────────────────────────────────
{
    const seen = new Set()
    for (let seed = 1; seed <= 60; seed++) {
        const b = make(seed)
        for (let t = T0; t < T0 + 24 * 5; t += 3) for (const id of b.sources()) for (const o of b.offers(id, t)) seen.add(b.spec(o).family)
    }
    check('only built families ever roll', [...seen].every(f => BUILT_FAMILIES.has(f)), [...seen].join(','))
    check('every built family appears', [...BUILT_FAMILIES].every(f => seen.has(f)), [...seen].join(','))
}

// ── 11. names ───────────────────────────────────────────────────────────────────────────────────
{
    let dupPoi = 0, dupPerson = 0, formBad = 0, personBad = 0, houseBad = 0, dupHouse = 0
    const formOff = new Set()
    for (let seed = 1; seed <= 300; seed++) {
        const b = make(seed)
        // Fixed placeholder names (the two gas stations) are exempt — they are not rolled.
        const FIXED = new Set(["Larry's", "Mom's", 'the gas station'])
        const names = POIS.map(q => b.poiName(q.id)).filter(n => n && !FIXED.has(n))
        if (new Set(names).size !== names.length) dupPoi++
        const full = POIS.flatMap(q => b.people(q.id)).filter(p => p.last).map(p => `${p.first} ${p.last}`)
        if (new Set(full).size !== full.length) dupPerson++
        for (const q of POIS.filter(p => (SOURCES[p.type] || NAME_FORMS[p.type]) && p.type !== 'larrysHouse')) {
            const ppl = b.people(q.id)
            if (NAME_FORMS[q.type]) {
                if (!fromForms(q.type, b.poiName(q.id) ?? '', ppl[0])) { formBad++; formOff.add(`${q.type}: ${b.poiName(q.id)}`) }
            } else if (FIXED.has(b.poiName(q.id))) {
                // a fixed-name source (the gas station) keeps its placeholder name
            } else if (b.poiName(q.id) !== null || ppl.length !== 1
                || b.placeLabel(q.id) !== personLabel(ppl[0])) personBad++
            if (HOUSEHOLDS.includes(q.type) && ppl.some(p => p.last !== ppl[0].last)) houseBad++
        }
        const surnames = POIS.filter(q => HOUSEHOLDS.includes(q.type)).map(q => b.people(q.id)[0].last)
        if (new Set(surnames).size !== surnames.length) dupHouse++
    }
    check('POI names are unique within a region (300 seeds)', dupPoi === 0, `${dupPoi}`)
    check('people are unique within a region (300 seeds)', dupPerson === 0, `${dupPerson}`)
    check('every source — and every receive-only class (office, school) — is named by its class\'s forms (300 seeds)', formBad === 0,
        `${formBad}: ${[...formOff].slice(0, 5).join(' · ')}`)
    check('a class with no forms is ONE person, no place name — just the person', personBad === 0, `${personBad}`)
    check('a household shares one last name', houseBad === 0, `${houseBad}`)
    check('no two households in a region share a surname (300 seeds)', dupHouse === 0, `${dupHouse}`)
    check('no roadside place noun promises a farm, quarry or dairy, or reads as a farm\'s name',
        !PLACE_NOUNS.some(n => ['farm', 'quarry', 'dairy', 'ranch', 'orchard', 'acres', 'homestead'].includes(n)))
    // FEAT-102: the motorist posts exactly three jobs — a ride to an auto shop, or a FETCH of a spare
    // tire (from an auto shop) or a jerry can (from a gas station) — and the card says which.
    const motorist = POIS.find(q => q.type === 'strandedMotorist').id
    const seenM = new Map()
    for (let seed = 1; seed <= 80 && seenM.size < 3; seed++) {
        const mb = make(seed)
        for (let t = T0; t < T0 + 24 * 6; t += 2) for (const o of mb.offers(motorist, t)) {
            const sp = mb.spec(o)
            if (seenM.has(sp.thingId)) continue
            const dest = POIS.find(q => q.type === (sp.thingId === 'jerryCan' ? 'gasStation' : 'autoShop')).id
            const line = mb.card(o, { nowH: t, route: { par: 300, distance: 2000, endPoiId: dest } }).sentence.map(r => r.t).join('')
            seenM.set(sp.thingId, { shape: sp.shape, from: sp.from, line, want: `${personLabel(mb.people(motorist)[0])} needs ${sp.phrase}`
                + `${sp.thingId === 'motoristRide' ? ' to ' : ' fetched from '}${mb.placeLabel(dest)}.` })
        }
    }
    check('the motorist posts exactly a ride, a spare-tire fetch and a jerry-can fetch',
        [...seenM.keys()].sort().join() === 'jerryCan,motoristRide,spareTire', [...seenM.keys()].join())
    check('…shaped and sourced right (ride = courier to an auto shop; tire ← auto shop; can ← gas station)',
        seenM.get('motoristRide')?.shape === 'courier' && seenM.get('spareTire')?.shape === 'fetch'
        && seenM.get('spareTire').from.join() === 'autoShop' && seenM.get('jerryCan')?.from.join() === 'gasStation')
    check('…and each card reads right ("needs a ride to …" / "needs … fetched from …")',
        [...seenM.values()].every(v => v.line === v.want), [...seenM.values()].map(v => v.line).join(' | '))
    const b = make(6)
    const larry = POIS.find(q => q.type === 'larrysHouse').id
    const p = { first: 'Earl', nick: 'Two-Tone', last: 'Pruitt' }
    check('a person reads by the full grammar: first "nick" last', personLabel(p) === 'Earl "Two-Tone" Pruitt'
        && personLabel({ first: 'Deb', nick: null, last: 'Hadley' }) === 'Deb Hadley')
    check('Larry is just "Larry" at "Larry\'s"', b.poiName(larry) === "Larry's"
        && b.people(larry).length === 1 && b.people(larry)[0].first === 'Larry')
}

// ── 12. the card ────────────────────────────────────────────────────────────────────────────────
{
    const b = make(6)
    const route = { par: 360, distance: 2400, endPoiId: null }
    let plain = null, bonused = null
    for (let t = T0; t < T0 + 24 * 30 && !(plain && bonused); t += 1) {
        for (const id of b.sources()) for (const o of b.offers(id, t)) {
            const sp = b.spec(o)
            if (sp.family !== 'delivery') continue
            if (sp.bonus && !bonused) bonused = { o, t }
            if (!sp.bonus && !plain) plain = { o, t }
        }
    }
    const cp = b.card(plain.o, { nowH: plain.t, payTier: 1.52, route })
    check('base pay == economy.basePay at ratio 1 for a plain offer',
        cp.pay === `Base pay $${formatMoney(basePay(360, 1.52))}`, cp.pay)
    const cb = b.card(bonused.o, { nowH: bonused.t, payTier: 1.52, route })
    check(`a bonus offer quotes ${BONUS_PAY_MULT}× base pay`,
        cb.pay === `Base pay $${formatMoney(basePay(360, 1.52, BONUS_PAY_MULT))}`, cb.pay)
    check('the bonus line names the item and its gate', cb.bonus?.includes(b.spec(bonused.o).bonus.name)
        && cb.bonus.includes(gateText(b.spec(bonused.o).bonus.gate)))
    check('gate text: "S only" / "X or better"', gateText('S') === 'S only' && gateText('B') === 'B or better')
    check('the card states distance, weight, expiry and the delivery window', cp.terms.length === 4 && cp.terms[0] === '2.4 km'
        && cp.terms[2] === `expires in ${formatGameDuration(plain.o.expiresH - plain.t)}`
        && cp.terms[3] === `deliver within ${formatGameDuration(b.deadlineH(plain.o, route.par))}`, cp.terms.join(' | '))
    check('a roadside drop names its rolled place', cp.sentence.some(r => r.t === b.spec(plain.o).placeName))
    const dest = POIS.find(q => q.type === 'gasStation').id
    const cd = b.card(plain.o, { nowH: plain.t, route: { ...route, endPoiId: dest } })
    check('a POI drop names the destination POI', cd.sentence.some(r => r.t === b.placeLabel(dest)))
}

// ── 13. bonus share ─────────────────────────────────────────────────────────────────────────────
{
    const count = { foodVendor: [0, 0], residence: [0, 0], larrysHouse: [0, 0] }
    for (let seed = 1; seed <= 200; seed++) {
        const b = make(seed)
        for (let t = T0; t < T0 + 24 * 3; t += 2) for (const q of POIS) {
            if (!count[q.type]) continue
            for (const o of b.offers(q.id, t)) { count[q.type][1]++; if (b.spec(o).bonus) count[q.type][0]++ }
        }
    }
    const share = count.foodVendor[0] / count.foodVendor[1]
    check('bonus share ≈ 25 % where the source has rewards', Math.abs(share - 0.25) < 0.03, share.toFixed(3))
    check('no bonus where the source has no rewards (givers, Larry)',
        count.residence[0] === 0 && count.larrysHouse[0] === 0)
}

// ── 13b. no two offers at a POI are the same job ────────────────────────────────────────────────
// Owner, 2026-09-27: two identical takeout orders to the gas station. A fake planner that ALWAYS
// wants the same destination (unless told to avoid it) forces the collision planDistinct must break.
{
    const food = POIS.find(q => q.type === 'foodVendor').id   // 3 slots, takeout only
    const sigOf = (b, o) => `${b.spec(o).thingId}|${b.spec(o).bonus?.rewardId ?? ''}|${o.route?.endPoiId ?? 'road:' + o.route?.placeName}`
    let dupPoi = 0, dupRoad = 0, older = 0, n = 0
    for (let seed = 1; seed <= 60; seed++) {
        // (a) POI destinations: every offer wants the gas station first, then the next in a list.
        const b = make(seed)
        const prefs = ['poi:5|6', 'poi:7|8', 'poi:17|18', 'poi:1|2']
        const planPoi = (o, ex) => ({ par: 300, distance: 2000, endPoiId: prefs.find(id => !ex.has(id)) ?? null })
        const live = b.offers(food, T0)
        const firstWant = live.map(() => null)
        for (const o of live) b.planDistinct(o, planPoi)
        const sig = live.map(o => sigOf(b, o))
        if (new Set(sig).size !== sig.length) dupPoi++
        // The OLDEST offer keeps its first choice — only newcomers yield.
        const oldest = [...live].sort((x, y) => x.bornH - y.bornH || x.slot - y.slot)[0]
        if (oldest.route.endPoiId !== prefs[0]) older++
        // (b) roadside: every offer is a roadside drop with the SAME rolled name.
        const b2 = make(seed)
        const live2 = b2.offers(food, T0)
        for (const o of live2) b2.spec(o).placeName = 'the drop point'
        for (const o of live2) b2.planDistinct(o, () => ({ par: 300, distance: 2000, endPoiId: null }))
        const sig2 = live2.map(o => sigOf(b2, o))
        if (new Set(sig2).size !== sig2.length) dupRoad++
        n++
    }
    check('forced POI collisions: siblings never share a destination', dupPoi === 0, `${dupPoi}/${n}`)
    check('forced roadside collisions: a clashing place name re-rolls until it differs', dupRoad === 0, `${dupRoad}/${n}`)
    check('the oldest offer keeps its destination — only the newcomer yields', older === 0, `${older}/${n}`)
    // BUG-88 (owner, 2026-10-16): a different reward no longer makes it a different job — the
    // destination still may not repeat.
    const b = make(3)
    const live = b.offers(food, T0)
    b.spec(live[0]).bonus = null
    b.spec(live[1]).bonus = { rewardId: 'coffee', name: 'Coffee', gate: 'C' }
    const prefs = ['poi:5|6', 'poi:7|8']
    const first = (o, ex) => ({ par: 300, distance: 2000, endPoiId: prefs.find(id => !ex.has(id)) ?? null })
    b.planDistinct(live[0], first); b.planDistinct(live[1], first)
    check('a different reward does not let the destination repeat', live[0].route.endPoiId !== live[1].route.endPoiId)

    // BUG-88: two offers at a multi-thing source. A repeated thing, or a strict wish left with no
    // candidate (seed 6's two fetches from the one general store), CYCLES to a new job.
    let pairs = 0, dupThing = 0, dead = 0
    for (let seed = 1; seed <= 200; seed++) {
        const bb = make(seed)
        for (let t = T0; t < T0 + 24 * 3; t += 6) for (const id of bb.sources()) {
            if (POIS.find(q => q.id === id).type !== 'tackleShop') continue
            const lv = bb.offers(id, t)
            if (lv.length < 2) continue
            pairs++
            // Force the worst case: the newcomer rolled the elder's thing.
            const [old, nu] = [...lv].sort((x, y) => x.bornH - y.bornH || String(x.slot).localeCompare(String(y.slot)))
            if (old.route === undefined && nu.route === undefined) {
                nu._spec = { ...bb.spec(old) }
            }
            // A planner with ONE pickup for every fetch: a second fetch has nowhere left to go.
            const one = (o, ex) => bb.spec(o).shape === 'fetch' && ex.has('store')
                ? null : { par: 300, distance: 2000, endPoiId: bb.spec(o).shape === 'fetch' ? 'store' : null }
            for (const o of lv) bb.planDistinct(o, one)
            if (bb.spec(lv[0]).thingId === bb.spec(lv[1]).thingId) dupThing++
            if (lv.some(o => !o.route)) dead++
        }
    }
    check('BUG-88: siblings at a multi-thing source never share a thing (the newcomer cycles)', pairs > 0 && dupThing === 0,
        `${dupThing}/${pairs}`)
    check('BUG-88: a newcomer with no destination left cycles to a job that has one', pairs > 0 && dead === 0, `${dead}/${pairs}`)
}

// ── 15. haul (FEAT-88) ──────────────────────────────────────────────────────────────────────────
{
    let wrongPlace = 0, badCount = 0, badMass = 0, badPay = 0, n = 0
    const counts = new Set()
    for (let seed = 1; seed <= 60; seed++) {
        const b = make(seed)
        for (let t = T0; t < T0 + 24 * 5; t += 3) for (const id of b.sources()) for (const o of b.offers(id, t)) {
            const sp = b.spec(o)
            if (sp.family !== 'haul') { if (sp.bundles != null) badCount++; continue }
            n++
            if (o.type !== 'firewoodYard') wrongPlace++
            if (!Number.isInteger(sp.bundles) || sp.bundles < HAUL_BUNDLES[0] || sp.bundles > HAUL_BUNDLES[1]) badCount++
            counts.add(sp.bundles)
            if (sp.massKg !== sp.bundles * HAUL_BUNDLE_KG) badMass++
            const want = (sp.bonus ? BONUS_PAY_MULT : 1) * sp.bundles * HAUL_PAY_PER_BUNDLE / HAUL_PAR_SLACK
            const card = b.card(o, { nowH: t, route: { par: 300, distance: 3000 } })
            if (Math.abs(sp.payMult - want) > 1e-12 || card.pay !== `Base pay $${formatMoney(basePay(300, 1, want))}`) badPay++
        }
    }
    check('haul rolls, and only at the firewood yard', n > 0 && wrongPlace === 0, `${n} hauls, ${wrongPlace} elsewhere`)
    check(`every haul is ${HAUL_BUNDLES[0]}..${HAUL_BUNDLES[1]} bundles (and only hauls have a count)`, badCount === 0)
    check('the whole range rolls', counts.size === HAUL_BUNDLES[1] - HAUL_BUNDLES[0] + 1, [...counts].sort((a, b) => a - b).join(','))
    check('the card weight is bundles × the bundle mass', badMass === 0)
    check('pay scales per bundle, and the card quotes exactly that', badPay === 0)
    // Owner, 2026-10-05: 10 bundles pays a courier job. The haul's par is HAUL_PAR_SLACK longer and
    // pay rides par, so on the haul's own (longer) par the 10-bundle multiplier must undo it.
    check('10 bundles on the haul par pays exactly a courier job on the route par',
        Math.abs(basePay(300 * HAUL_PAR_SLACK, 1, 10 * HAUL_PAY_PER_BUNDLE / HAUL_PAR_SLACK) - basePay(300, 1, 1)) < 1e-9)

    // The bundle count is drawn on its OWN stream: adding the yard must not move any other offer.
    const without = POIS.filter(q => q.type !== 'firewoodYard')
    const key = (sp) => JSON.stringify([sp.family, sp.thingId, sp.massKg, sp.bonus, sp.payMult, sp.destKind, sp.destPick, sp.placeName])
    let moved = 0
    for (let seed = 1; seed <= 30; seed++) {
        const a = make(seed), b = new OfferBoard({ seed, pois: without, nowH: T0 })
        for (const q of without) for (const o of b.offers(q.id, T0)) {
            const o2 = a.offers(q.id, T0).find(x => x.id === o.id)
            if (!o2 || key(a.spec(o2)) !== key(b.spec(o))) moved++
        }
    }
    check('adding the yard leaves every other offer unchanged', moved === 0, `${moved} moved`)
}

// ── 16. to-tags (FEAT-100) ──────────────────────────────────────────────────────────────────────
// A thing with a `to` asks the planner for a POI of a listed class, strictly; a generic thing keeps
// the DEST_POI_CHANCE roll and may go roadside. PoiSystem leads every POI's tags with its type.
{
    const tagged = POIS.map(q => ({ ...q, tags: [q.type, ...(q.type === 'momsHouse' ? ['residence', 'mom'] : [])] }))
    let taggedN = 0, taggedBad = 0, genericStrict = 0, roadside = 0, fetchN = 0, fetchBad = 0, roadN = 0, roadBad = 0, roadKinds = new Set()
    for (let seed = 1; seed <= 60; seed++) {
        const b = make(seed)
        for (let t = T0; t < T0 + 24 * 4; t += 3) for (const id of b.sources()) for (const o of b.offers(id, t)) {
            const sp = b.spec(o)
            if (sp.family === 'papers') continue
            const w = b.destWish(o, tagged, new Set())
            if (sp.to?.includes('roadside')) {
                // BUG-88: a matching POI or a roadside spot — never strict, never another class.
                roadN++; roadKinds.add(w.kind)
                if (w.strict || (w.kind === 'poi' && !w.pois.every(q => q.id !== o.poiId && sp.to.some(x => q.tags.includes(x))))) roadBad++
            } else if (sp.to) {
                taggedN++
                if (w.kind !== 'poi' || !w.strict || !w.pois.length
                    || !w.pois.every(q => q.id !== o.poiId && sp.to.some(x => q.tags.includes(x)))) taggedBad++
            } else if (sp.shape === 'fetch') {
                fetchN++
                if (w.kind !== 'poi' || !w.strict || !w.fetch || !w.pois.length
                    || !w.pois.every(q => q.id !== o.poiId && sp.from.some(x => q.tags.includes(x)))) fetchBad++
            } else {
                if (w.strict) genericStrict++
                if (w.kind === 'roadside') roadside++
            }
        }
    }
    check('a tagged thing asks for a matching POI only, strictly (never roadside)', taggedN > 0 && taggedBad === 0,
        `${taggedBad}/${taggedN}`)
    check('a generic thing is never strict, and may still go roadside', genericStrict === 0 && roadside > 0)
    check('a fetch asks strictly for its PICKUP class, and says it is a fetch (FEAT-102)', fetchN > 0 && fetchBad === 0,
        `${fetchBad}/${fetchN}`)
    check("a `to` naming 'roadside' goes to a matching POI or roadside, never strictly (BUG-88)",
        roadN > 0 && roadBad === 0 && roadKinds.size === 2, `${roadBad}/${roadN}, kinds ${[...roadKinds]}`)
    check('the tackle shop posts fetches of general-store sundries, and its own goods to homes or roadside',
        THINGS.filter(t => t.pools.includes('tackleShop') || t.fetchBy?.includes('tackleShop'))
            .every(t => t.fetchBy?.includes('tackleShop') ? t.pools.join() === 'generalStore'
                : t.pools.join() === 'tackleShop' && t.to.join() === 'residence,roadside'))
    check('every fetchBy / fetchFrom names a real class',
        THINGS.every(t => [...(t.fetchBy ?? []), ...(t.fetchFrom ?? [])].every(x => POIS.some(q => q.type === x))))
    check('THINGS name only real classes in `to` (or the planned sawmill/quarry)',
        THINGS.every(t => !t.to || t.to.every(x => SOURCES[x] || POIS.some(q => q.type === x)
            || ['sawmill', 'quarry', 'roadside'].includes(x))))
}

// ── 16. deadlines (FEAT-113) ────────────────────────────────────────────────────────────────────
{
    const missing = THINGS.filter(t => !((t.deadlineSlack ?? DEADLINE_SLACK[t.family]) >= 0))
    check('every thing resolves a deadline slack (own or family default)', !missing.length,
        missing.map(t => t.id).join(', '))
    const slack = (id) => THINGS.find(t => t.id === id).deadlineSlack ?? DEADLINE_SLACK[THINGS.find(t => t.id === id).family]
    check('owner slacks: takeout +50 %, courier +100 %, haul and fragile +200 %, freight +300 %',
        slack('takeout') === 0.5 && slack('groceries') === 1 && slack('firewood') === 2 && slack('eggs') === 2
        && slack('tomatoes') === 3)

    // take() stamps the deadline from par; past it the always-on slot locks AT the deadline.
    const PAR = 180   // s — 3 game hours
    const b = make(61)
    const food = ofType('foodVendor')[0]
    const o = b.offers(food, T0)[0]
    b.take(o.id, T0 + 0.1, PAR)
    check('take stamps dueH = take + par × (1 + slack)', Math.abs(o.dueH - (T0 + 0.1 + 3 * (1 + b.spec(o).deadlineSlack))) < 1e-9,
        `${o.dueH}`)
    const s = slotsOf(b, food)[o.slot]
    b.advance(o.dueH - 1e-6)
    check('...still taken just before the deadline', s.state === 'taken')
    b.advance(o.dueH + 1e-6)
    check('a taken slot still in hand at its deadline locks AT the deadline',
        s.state === 'locked' && Math.abs(s.until - (o.dueH + o.lifeH)) < 1e-9, `state=${s.state} until=${s.until}`)
    check('...and a late completion is a no-op on the board', b.complete(o.id, o.dueH + 1e-6) === false)

    // No par handed over → no deadline (the old behaviour: taken never expires).
    const n = make(63), nf = n.offers(food, T0)[0]
    n.take(nf.id, T0)
    check('a take with no par carries no deadline', nf.dueH === Infinity)

    // The budget's coupled replay takes the same deadline.
    const bb = make(62)
    const bs = bb._budget.find(x => x.state === 'live')
    const bo = bs.offer
    bb.take(bo.id, T0, PAR)
    bb.advance(bo.dueH + 1e-6)
    check('a taken BUDGET slot locks at its deadline too',
        bs.state === 'locked' && Math.abs(bs.until - (bo.dueH + (SOURCES[bs.type].lockH ?? bo.lifeH))) < 1e-9,
        `state=${bs.state}`)
    check('...and a cancel after the deadline is refused (already locked)', bb.abandon(bo.id, bo.dueH + 1) === false)
}

// ── 14. import discipline ───────────────────────────────────────────────────────────────────────
{
    const src = readFileSync(new URL('../src/offer-board.js', import.meta.url), 'utf8')
    const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]).sort()
    const allowed = ['../data/offer-names.js', '../data/offers.js', './day.js', './economy.js', './seed.js']
    check('offer-board.js imports only its tables, seed.js, economy.js and day.js (the clock unit)',
        JSON.stringify(imports) === JSON.stringify(allowed), imports.join(', '))
    check('offer-board.js never reads Math.random', !/Math\.random/.test(src.replace(/\/\/.*$/gm, '')))
}

console.log(fails ? `\n${fails} FAILED` : '\nall offer-board checks passed')
process.exit(fails ? 1 : 0)
