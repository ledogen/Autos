// test/budget-recount.mjs — FEAT-69 rainy-day script: the one-region point and money budget, re-derived.
// NOT a gate. Pure node, no world, one process:  node test/budget-recount.mjs [--draws=20000]
//
// 1. RE-GRADE every recorded human drive (runs/ v1 roads + old par, runs-v2/pre-feat80-grip/ old tire,
//    runs-v2/ new grip) under TODAY's par: PAR_REF + PAR_SLACK as they stand, by test/calibrate-par.mjs's
//    reconstruction (par rebuilt from the exported topology; a per-run factor c = recorded par /
//    par rebuilt under the run's own ref absorbs the junction caps the export lost). Paper rounds have
//    their own par scale (a stop per porch) and are re-graded by the slack alone.
// 2. A day, Monte Carlo: jobs drawn from the real OfferBoard mix (300 boards), drive ratios drawn from a
//    corpus, par lengths from the corpus' own routes. Pay and deeds by economy.js's own functions.
// 3. Costs per day from the game's prices (food, fuel, oil, filter, wear) under STATED duty assumptions
//    (the ASSUME block). Those are the model's soft spots; argue with them, not with the output.
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { computePar, PAR_REF, PAR_SLACK, gradeRun } from '../src/par.js'
import { ECONOMY_PARAMS as E, payoutFor, pointsFor, dayTier } from '../src/economy.js'

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const DRAWS = +(process.argv.find(a => a.startsWith('--draws='))?.slice(8) ?? 20000)

// ── 1. the corpus, re-graded ────────────────────────────────────────────────────────────────
function toSegments (run) {   // test/calibrate-par.mjs toSegments, verbatim in effect
    const col = Object.fromEntries(run.topology.columns.map((c, i) => [c, i]))
    const rows = run.topology.rows, S = rows.map(r => r[col.s_m]), CURV = rows.map(r => r[col.curv_1pm]), ELEV = rows.map(r => r[col.elev_m])
    const len = S[S.length - 1]
    const at = (arr, s) => {
        if (s <= S[0]) return arr[0]
        if (s >= len) return arr[arr.length - 1]
        let i = Math.min(arr.length - 2, Math.max(0, Math.floor(s / run.topology.spacing_m)))
        while (i > 0 && S[i] > s) i--
        while (i < S.length - 2 && S[i + 1] < s) i++
        const t = (s - S[i]) / Math.max(1e-9, S[i + 1] - S[i])
        return arr[i] + (arr[i + 1] - arr[i]) * t
    }
    return [{ centerline: { length: len, curvatureAt: s => at(CURV, s), tangentAt: () => ({ x: 1, z: 0 }) }, gradeAt: s => at(ELEV, s), s0: 0, s1: len }]
}
const BASE = { ...PAR_REF }
const parWith = (seg, r) => { Object.assign(PAR_REF, r); const p = computePar(seg).time; Object.assign(PAR_REF, BASE); return p }

function load (dir, label) {
    const seen = new Set(), out = []
    for (const f of readdirSync(join(ROOT, dir)).sort()) {
        if (!f.endsWith('.json')) continue
        const d = JSON.parse(readFileSync(join(ROOT, dir, f), 'utf8'))
        if (!/^rangersim-run-export\/\d+$/.test(d.format ?? '') || !d.result) continue
        const key = `${d.result.elapsed_s}|${d.result.par_s}|${d.route?.distance_m}`
        if (seen.has(key)) continue
        seen.add(key)
        const slackUsed = d.par_ref?.slack ?? 1.0
        let par
        if (d.mission_type === 'paper_route' || !d.topology?.rows?.length) par = d.result.par_s * PAR_SLACK / slackUsed
        else {
            const seg = toSegments(d)
            const corr = d.result.par_s / (parWith(seg, d.par_ref) / PAR_SLACK * slackUsed)
            par = corr * parWith(seg, BASE); d._corr = corr
        }
        const ratio = d.result.elapsed_s / par
        out.push({ set: label, file: f, km: (d.route?.distance_m ?? 0) / 1000, felt: d.felt ?? '?', elapsed: d.result.elapsed_s, par, ratio, letter: gradeRun(d.result.elapsed_s, par).letter, then: d.result.letter, paper: d.mission_type === "paper_route", corr: d._corr })
    }
    return out
}
const SETS = { v1: load('runs', 'v1'), oldTire: load('runs-v2/pre-feat80-grip', 'oldTire'), newGrip: load('runs-v2', 'newGrip') }
const ALL = Object.values(SETS).flat()

const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))] }
const tip = r => Math.min(Math.max((E.tipZero - r) / (E.tipZero - E.fullTipRatio), 0), 1)
console.log(`today: PAR_SLACK ${PAR_SLACK}, mu ${BASE.mu}; time lines S ${E.RANK_TABLE.time[0].S} A ${E.RANK_TABLE.time[0].A} B ${E.RANK_TABLE.time[0].B} C 1`)
for (const [name, runs] of Object.entries(SETS)) {
    const n = runs.length, L = { S: 0, A: 0, B: 0, C: 0, D: 0 }
    for (const r of runs) L[r.letter]++
    const deeds = runs.reduce((a, r) => a + pointsFor(r.letter), 0) / n, pay = runs.reduce((a, r) => a + E.baseFrac + (1 - E.baseFrac) * tip(r.ratio), 0) / n
    console.log(`\n${name}: ${n} drives · S ${L.S} A ${L.A} B ${L.B} C ${L.C} D ${L.D} · deeds/job ${deeds.toFixed(2)} · pay ${(pay * 100).toFixed(0)} % of max`
        + ` · ratio p10 ${pct(runs.map(r => r.ratio), 0.1).toFixed(2)} p50 ${pct(runs.map(r => r.ratio), 0.5).toFixed(2)} p90 ${pct(runs.map(r => r.ratio), 0.9).toFixed(2)}`
        + ` · par p50 ${pct(runs.map(r => r.par), 0.5).toFixed(0)} s`)
    if (process.argv.includes('--verbose')) for (const r of runs) console.log(`  ${r.ratio.toFixed(3)} ${r.letter} (was ${r.then}) ${r.felt.padEnd(9)} par ${r.par.toFixed(0)} s ${r.paper ? 'paper ' : ''}${r.file}`)
}
const cs = ALL.filter(r => r.corr).map(r => r.corr)
console.log(`\nreconstruction factor c (recorded par / rebuilt par): min ${Math.min(...cs).toFixed(3)} · p50 ${pct(cs, 0.5).toFixed(3)} · max ${Math.max(...cs).toFixed(3)}`)

// ── 2. the job: real offer mix × corpus pace ────────────────────────────────────────────────
import { OfferBoard } from '../src/offer-board.js'
import { POI_ROSTER } from '../src/poi.js'
import { HAUL_PAR_SLACK, FREIGHT_PAR_SLACK_PER_KG, FREIGHT_TIP_MULT, HAUL_STOCK_PRICE } from '../data/offers.js'
import { ITEM_PRICE } from '../data/shop-stock.js'
import { OIL_CHANGE } from '../data/parts.js'
import { PARTS } from '../data/parts.js'
import { DAMAGE_PARAMS as DMG } from '../src/damage.js'
import { RANGER_PARAMS as RP } from '../data/ranger.js'

// THE ASSUMPTIONS — everything below that is not a game number. [A] = an agent's estimate, owed a measurement.
export const ASSUME = {
    travelH: 2,            // [A] game h from a finished job to the next giver (run-shape.md's "~2 h")
    travelMS: 15,          // [A] m/s on that leg (54 km/h) → km of fuel and wear
    overheadH: 1.5,        // [A] game h a day off the job clock: finding camp ~1 h, a sit-down meal 0.5 h
    awakeH: 16,            // DAY_PARAMS.fullEnergyH
    galPerKm: 0.29,        // [A] honest 15 mpg (fuel-map's city anchor) × fuelBurnScale 7 → 0.29 gal/km; 20 mpg → 0.22
    insultMission: 0.35,   // [A] mean normalised engine load on a job (0.5 = the wear fits' "hard")
    insultTravel: 0.2,     // [A] between jobs
    foodPerH: 0.5,         // $ per hour of hunger hold, the cheapest lines (chili dog 5/10 h, groceries 5/10 h, potato 2/4 h)
    incidentPerDay: 0,     // [A] $ day-1 of crashes: plugs, bent wheels, tows. Swept below.
    // non-time letters — no recorded drive grades these; [A] shares of B+ / C / D:
    fragile:    [0.7, 0.25, 0.05],
    demolition: [0.7, 0.25, 0.05],
    haulLoad: 25,          // [A] bundles loaded (≤ the yard's stock), all delivered
    paceX: 1,              // the corpus ratio × this (1 = the recorded driver, the owner)
    payX: 1, oilPrice: OIL_CHANGE.price,   // lever hooks: pay × this (k), the oil change price
}

let _n = 0
const POIS = POI_ROSTER.flatMap(r => Array.from({ length: r.count }, () => { _n += 2; return { id: `poi:${_n - 1}|${_n}`, type: r.type, tags: [r.type, ...(r.tags ?? [])] } }))
const SPECS = []
for (let seed = 1; seed <= 300; seed++) { const b = new OfferBoard({ seed, pois: POIS, nowH: 6 }); for (const id of b.sources()) for (const o of b.offers(id, 6)) SPECS.push(b.spec(o)) }

const POOL = ALL.filter(r => !r.paper)
const parMean = POOL.reduce((a, r) => a + r.par, 0) / POOL.length
const AVG_PAR = 180 * PAR_SLACK / 1.15                          // the measured planner mean (economy.js header)
const PARS = POOL.map(r => r.par * AVG_PAR / parMean)           // the corpus' route spread, scaled to the planner's mean
const KM_PER_PAR_S = pct(POOL.map(r => r.km / r.par), 0.5)      // route km per par-second
let _s = 12345
const rnd = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 2 ** 32 }
const pick = a => a[Math.floor(rnd() * a.length)]
const letterFrom = sh => { const u = rnd(); return u < sh[0] ? 'B' : u < sh[0] + sh[1] ? 'C' : 'D' }

/** One job: { kind, pay, cost (haul stock), deeds, jobH (game h on the job), km, insult } at day-1 prices. */
function job (A) {
    const sp = pick(SPECS), r0 = pick(POOL)
    const ratio = r0.ratio * A.paceX
    let par = pick(PARS), tipMult = sp.tipMult ?? 1, pay, cost = 0, letter
    const timeLetter = gradeRun(ratio * par, par).letter
    if (sp.stock) {                                        // haul: pay per piece, bought at accept
        par *= HAUL_PAR_SLACK
        const n = Math.min(sp.stock, A.haulLoad)
        pay = n * payoutFor(par, ratio, 1) * sp.payMult
        cost = n * HAUL_STOCK_PRICE * E.baseFrac * E.k * par * sp.payMult
        const t = E.RANK_TABLE.haul.firewood[0]; letter = n >= t.S ? 'S' : n >= t.A ? 'A' : n >= t.B ? 'B' : n >= t.C ? 'C' : 'D'
    } else {
        if (sp.load && !sp.fragile) { par *= 1 + FREIGHT_PAR_SLACK_PER_KG * sp.massKg; tipMult *= FREIGHT_TIP_MULT }
        const line = payoutFor(par, ratio, 1) * sp.payMult, base = E.baseFrac * E.k * par * sp.payMult
        pay = base + (line - base) * tipMult
        if (sp.load && !sp.fragile) { const t = E.RANK_TABLE.freight[0]; letter = sp.massKg >= t.S ? 'S' : sp.massKg >= t.A ? 'A' : sp.massKg >= t.B ? 'B' : 'C' }
        else if (sp.fragile) letter = letterFrom(A.fragile)
        else if (sp.family === 'demolition') letter = letterFrom(A.demolition)
        else letter = timeLetter
    }
    const deeds = sp.deeds === 'none' ? 0 : pointsFor(letter) + (sp.deeds === 'extraHalf' && pointsFor(letter) > 0 ? 0.5 : 0)
    const kind = sp.stock ? 'haul' : sp.load && !sp.fragile ? 'freight' : sp.fragile ? 'fragile' : sp.family
    const driveS = ratio * par, travelS = A.travelH * 60
    pay *= A.payX; cost *= A.payX
    return { kind, pay, cost, deeds, letter, jobH: (driveS + travelS) / 60, km: (par * KM_PER_PAR_S + travelS * A.travelMS / 1000), insult: driveS * A.insultMission + travelS * A.insultTravel }
}

/** Day-1 running cost of a day that drove `km` with `insult` load-seconds — food, fuel, oil, filter, incidents. */
function dayCost (A, km, insult) {
    const food = (A.awakeH) * A.foodPerH
    const fuel = km * A.galPerKm * RP.fuelPricePerGal
    const oil = A.oilPrice * insult / (DMG.durOil * (1 - DMG.oilKnee))                  // changed at the knee
    const filter = PARTS.airFilterStock.price * insult / (DMG.durFilter * (1 - DMG.filterKnee))
    return { food, fuel, oil, filter, incident: A.incidentPerDay, total: food + fuel + oil + filter + A.incidentPerDay }
}

// ── 3. a run: days to the camp gate, then the five requisition lines (unpaid) ───────────────────
/** `rate` jobs a day (fractional: the remainder is a coin) or 'clock' = as many as the awake day fits. */
function run (A, rate) {
    let day = 1, cash = E.startCash, deeds = 0, lines = 0, minCash = cash, gateDay = null, earned = 0, inc1 = 0, cost1 = 0, brokeEarly = false
    const spent = { food: 0, fuel: 0, oil: 0, filter: 0, incident: 0 }
    while (lines < 5 && day <= 30) {
        const e0 = earned
        let left = A.awakeH - A.overheadH, km = 0, insult = 0
        let slots = rate === 'clock' ? Infinity : Math.floor(rate) + (rnd() < rate % 1 ? 1 : 0)
        while (slots-- > 0 && lines < 5) {
            const j = job(A)
            if (rate === 'clock' && j.jobH > left) break
            left -= j.jobH; km += j.km; insult += j.insult
            if (deeds < E.campDeeds) { cash += j.pay - j.cost; earned += j.pay - j.cost; deeds += j.deeds; if (deeds >= E.campDeeds) gateDay = day }
            else if (cash < 2 * dayCost(A, 0, 0).total * dayTier(day)) { cash += j.pay - j.cost; earned += j.pay - j.cost }   // short of two days' food: a paid job
            else lines++                                         // a requisition line: same time and miles, no pay
        }
        const c = dayCost(A, km, insult), t = dayTier(day)
        for (const k of Object.keys(spent)) spent[k] += c[k] * t
        cash -= c.total * t; minCash = Math.min(minCash, cash)
        if (cash < 0 && (gateDay === null || gateDay === day)) brokeEarly = true
        if (gateDay === null || gateDay === day) { inc1 += earned - e0; cost1 += c.total }   // the deed phase's days, at day-1 prices
        day++
    }
    return { gateDay, days: lines >= 5 ? day - 1 : null, cash, minCash, spent, earned, inc1, cost1, brokeEarly }
}

const fmt = (v, d = 2) => (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(d)
const p3 = (a, d = 0, f = x => x.toFixed(d)) => `${f(pct(a, 0.1))}/${f(pct(a, 0.5))}/${f(pct(a, 0.9))}`
function summarise (A, rate, label) {
    const rs = Array.from({ length: DRAWS / 4 }, () => run(A, rate))
    const done = rs.filter(r => r.days), gd = rs.map(r => r.gateDay ?? 31)
    const I = rs.reduce((a, r) => a + r.inc1, 0), C = rs.reduce((a, r) => a + r.cost1, 0)   // income and day-1 cost per deed-phase day
    const be = E.dayTierTable.findIndex(t => t * C >= I) + 1                                 // the day costs overtake income
    console.log(`  ${label.padEnd(30)} gate day ${p3(gd)} · finished ${(done.length / rs.length * 100).toFixed(0).padStart(3)} % by day 30, on day ${done.length ? p3(done.map(r => r.days)) : '-'}`
        + ` · a day earns ${fmt(I / rs.reduce((a, r) => a + (r.gateDay ?? 30), 0))} vs costs ${fmt(C / rs.reduce((a, r) => a + (r.gateDay ?? 30), 0))} (day 1) → costs overtake on day ${be || '>30'}`
        + ` · short of cash before the gate ${(rs.filter(r => r.brokeEarly).length / rs.length * 100).toFixed(0)} %`)
}

console.log(`\n── the job, day-1 prices (${SPECS.length} offers, 300 boards; par spread from the corpus, mean ${AVG_PAR.toFixed(0)} s; ${(KM_PER_PAR_S * 1000).toFixed(1)} m of route per par-second) ──`)
for (const paceX of [1, 1.15, 1.3, 1.5]) {
    const A = { ...ASSUME, paceX }, js = Array.from({ length: DRAWS }, () => job(A))
    const net = j => j.pay - j.cost, L = { S: 0, A: 0, B: 0, C: 0, D: 0 }
    for (const j of js) L[j.letter]++
    console.log(`\npace x${paceX}: net pay p10/50/90 ${p3(js.map(net), 2, v => fmt(v))} · mean ${fmt(js.reduce((a, j) => a + net(j), 0) / js.length)}`
        + ` · deeds/job ${(js.reduce((a, j) => a + j.deeds, 0) / js.length).toFixed(2)} · game h/job ${(js.reduce((a, j) => a + j.jobH, 0) / js.length).toFixed(1)}`
        + ` · letters ${Object.entries(L).map(([k, v]) => k + ' ' + (v / js.length * 100).toFixed(0) + '%').join(' ')}`)
    for (const k of [...new Set(js.map(j => j.kind))]) {
        const s = js.filter(j => j.kind === k)
        console.log(`  ${k.padEnd(11)} ${(s.length / js.length * 100).toFixed(0).padStart(3)} % · net pay p10/50/90 ${p3(s.map(net), 2, v => fmt(v))}`
            + ` · deeds/job ${(s.reduce((a, j) => a + j.deeds, 0) / s.length).toFixed(2)}${k === 'haul' ? ` (stock bought ${fmt(s.reduce((a, j) => a + j.cost, 0) / s.length)})` : ''}`)
    }
}

const c3 = dayCost(ASSUME, 3 * (AVG_PAR * KM_PER_PAR_S + ASSUME.travelH * 60 * ASSUME.travelMS / 1000), 3 * (AVG_PAR * 0.62 * ASSUME.insultMission + ASSUME.travelH * 60 * ASSUME.insultTravel))
console.log(`\n── a 3-job day's running cost at day-1 prices: ${Object.entries(c3).map(([k, v]) => k + ' ' + fmt(v)).join(' · ')}  (x dayTier: day 7 ${dayTier(7)}, day 12 ${dayTier(12)})`)

console.log(`\n── the run: ${E.campDeeds} deeds, then the 5 requisition lines (unpaid); start cash $${E.startCash}; ${DRAWS / 4} runs each ──`)
console.log('After the gate a line takes a job slot; the player takes a paid job instead while short of two days of food.')
for (const paceX of [1, 1.3, 1.5]) {
    console.log(`pace x${paceX}, no incidents:`)
    for (const rate of ['clock', 3, 2, 1.5, 1]) summarise({ ...ASSUME, paceX }, rate, rate === 'clock' ? 'every hour worked' : `${rate} jobs a day`)
}

// ── 4. the levers: one knob at a time, owner pace ───────────────────────────────────────────────
const LEVERS = [
    ['as built', {}],
    ['food $0.40/h (-20 %)', { foodPerH: 0.4 }],
    ['food $0.625/h (burgers)', { foodPerH: 0.625 }],
    ['oil+filter wear x0.5', { insultMission: ASSUME.insultMission / 2, insultTravel: ASSUME.insultTravel / 2 }],
    ['fuel 20 mpg, not 15', { galPerKm: 0.217 }],
    ['incidents $5/day', { incidentPerDay: 5 }],
    ['start cash $30', { startCash: 30 }],
    ['no day tier (flat)', { flat: true }],
    ['travel 3 h a job', { travelH: 3 }],
    ['food $0.30/h', { foodPerH: 0.3 }],
    ['food $0.35/h + oil change $6', { foodPerH: 0.35, oilPrice: 6 }],
    ['pay +30 % (k)', { payX: 1.3 }],
    ['day tier 1.035/day', { tier: 1.035 }],
    ['camp at 10 deeds', { deeds: 10 }],
    ['camp at 12 deeds', { deeds: 12 }],
]
console.log('\n── levers (owner pace), one at a time ──')
for (const [label, o] of LEVERS) {
    const sc = E.startCash, tt = E.dayTierTable
    if (o.startCash) E.startCash = o.startCash
    if (o.flat) E.dayTierTable = tt.map(() => 1)
    if (o.tier) E.dayTierTable = tt.map((_, i) => Math.round(o.tier ** i * 100) / 100)
    const cd = E.campDeeds; if (o.deeds) E.campDeeds = o.deeds
    for (const rate of [2, 'clock']) summarise({ ...ASSUME, ...o }, rate, `${label}, ${rate === 'clock' ? 'clock' : rate + '/day'}`)
    E.startCash = sc; E.dayTierTable = tt; E.campDeeds = cd
}
