// GATE (FEAT-61): the paper route's scoring algebra.
//
// Pure and world-free — no RoadSystem, no terrain, no renderer. That is the point: this is the part
// of the mission that has to be exactly right, and it is the part that can be pinned without
// driving anything. The tour construction and the state machine are verified live.
//
// The properties, in priority order:
//
//   1. PARTIAL ROUTES PAY. The paper route is the income floor (missions.md, 2026-08-05): the day
//      job is destroyed in the opening, so this is the only reliably-available earner and a run
//      must never dead-end at zero. One delivery out of nine is a D that still pays for the one.
//   2. THE ACCURACY LAW. q(0) = 1, q(R) = 0.30, linear between, and past the rim is not a delivery.
//   3. THE BONUS NEEDS A FINISHED ROUTE. You cannot finish early without finishing.
//   4. SM-INV-4 IS NOT TOUCHED. payoutFor()/gradeRun() are the margin line and this mission does
//      not call them; it settles through settleFlat, which shares the wallet and pointsFor().
//   5. NOTHING DEGENERATE REACHES THE WALLET. Zero deliveries, zero customers, a broken par: money,
//      never NaN, never negative.
import { accuracyScore, ACC_FLOOR } from '../src/throw.js'
import {
    PAPER_PARAMS, runPaper, resetPaperRun, customersForTier, stockForTier,
    deadlineFor, letterFor, scoreRoute, advancesTier,
} from '../src/paper-route.js'
import { EconomySystem, runEconomy, ECONOMY_PARAMS, pointsFor } from '../src/economy.js'

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps

const R = 3            // TARGET_R — 6 m diameter (owner, 2026-08-05)
const PAR = 600        // s
const TIER = 1.0

console.log('\n── 1. the accuracy law ─────────────────────────────────────────')
check('a dead-centre throw is worth a whole paper', near(accuracyScore(0, R), 1))
check(`the worst throw that still counts is worth ${ACC_FLOOR}`, near(accuracyScore(R, R), ACC_FLOOR))
check('…and it is linear between', near(accuracyScore(R / 2, R), (1 + ACC_FLOOR) / 2))
check('past the rim is not a delivery', accuracyScore(R + 0.01, R) === 0)
check('the rim itself still counts (the cliff is OUTSIDE)', accuracyScore(R, R) > 0)
check('monotone: closer never scores worse', (() => {
    let prev = Infinity
    for (let d = 0; d <= R; d += 0.05) { const q = accuracyScore(d, R); if (q > prev) return false; prev = q }
    return true
})())
check('nonsense distances score zero, not NaN', accuracyScore(-1, R) === 0 && accuracyScore(NaN, R) === 0)

console.log('\n── 2. partial routes pay (the income floor) ────────────────────')
const one = scoreRoute([accuracyScore(0, R)], 9, PAR * 1.1, PAR, TIER)
check('1 of 9 delivered letters D', one.letter === 'D', `got ${one.letter} (score ${one.score.toFixed(3)})`)
check('…and still pays for the one', one.payout > 0, `payout ${one.payout}`)
check('…which is exactly one paper at the flat rate', near(one.payout, one.flat))
const half = scoreRoute(Array(5).fill(accuracyScore(0, R)), 9, PAR, PAR, TIER)
check('more deliveries pay strictly more', half.payout > one.payout)
check('coverage is delivered/customers', near(half.coverage, 5 / 9))
const sloppy = scoreRoute(Array(9).fill(accuracyScore(R, R)), 9, PAR, PAR, TIER)
const clean  = scoreRoute(Array(9).fill(accuracyScore(0, R)), 9, PAR, PAR, TIER)
check('a full sloppy route pays less than a full clean one', sloppy.payout < clean.payout)
check(`…by exactly the accuracy floor (${ACC_FLOOR}×)`, near(sloppy.payout, clean.payout * ACC_FLOOR, 1e-9))
check('a full clean route letters S', clean.letter === 'S', `got ${clean.letter}`)
check('a full sloppy route still letters D', sloppy.letter === 'D', `got ${sloppy.letter}`)

console.log('\n── 3. the expediency bonus ────────────────────────────────────')
const fastPartial = scoreRoute(Array(8).fill(1), 9, PAR * 0.5, PAR, TIER)
check('an UNFINISHED route earns no bonus however fast', fastPartial.expedite === 0)
const atPar = scoreRoute(Array(9).fill(1), 9, PAR, PAR, TIER)
check('a completed route AT par earns no bonus', atPar.expedite === 0)
const fast = scoreRoute(Array(9).fill(1), 9, PAR * 0.8, PAR, TIER)
check('…10% inside par starts paying', fast.expedite > 0, `expedite ${fast.expedite}`)
const veryFast = scoreRoute(Array(9).fill(1), 9, PAR * 0.6, PAR, TIER)
check('…and it caps at bonusMax', near(veryFast.expedite, PAPER_PARAMS.bonusMax))
check('the bonus multiplies the payout', near(veryFast.payout, atPar.payout * (1 + PAPER_PARAMS.bonusMax)))
check('bonus is monotone in speed', fast.expedite < veryFast.expedite)

console.log('\n── 4. rank is per-axis, and the ladder ────────────────────────')
check('letterFor is monotone across the thresholds', (() => {
    const order = ['D', 'C', 'B', 'A', 'S']
    let last = -1
    for (let s = 0; s <= 1.0001; s += 0.01) {
        const i = order.indexOf(letterFor(Math.min(s, 1)))
        if (i < last) return false
        last = Math.max(last, i)
    }
    return true
})())
check('rank ignores the clock entirely', (() => {
    const slow = scoreRoute(Array(9).fill(1), 9, PAR * 5, PAR, TIER)
    const quick = scoreRoute(Array(9).fill(1), 9, PAR * 0.5, PAR, TIER)
    return slow.letter === quick.letter
})())
resetPaperRun()
check('a run starts on the first rung', runPaper.tier === 0 && customersForTier() === 4)
check('the ladder is 4 → 9 → 12 → 15', JSON.stringify(PAPER_PARAMS.tiers) === '[4,9,12,15]')
check('only a PERFECT route advances a tier', (() => {
    const perfect = scoreRoute(Array(4).fill(accuracyScore(R, R)), 4, PAR, PAR, TIER)   // sloppy but complete
    const missed  = scoreRoute(Array(3).fill(1), 4, PAR, PAR, TIER)
    return advancesTier(perfect, 4) === true && advancesTier(missed, 4) === false
})())
check('spares interpolate 100% → 30% down the ladder', (() => {
    const s = [0, 1, 2, 3].map(t => stockForTier(t) - customersForTier(t))
    return s[0] === 4 && s[3] === 5 && s.every((v, i) => v >= 0)
        && (s[0] / 4) === 1.0 && Math.abs(s[3] / 15 - 0.333) < 0.01
})(), JSON.stringify([0, 1, 2, 3].map(t => `${customersForTier(t)}+${stockForTier(t) - customersForTier(t)}`)))
check('the deadline is exactly par × tolerance', near(deadlineFor(PAR), PAR * PAPER_PARAMS.tolerance))

console.log('\n── 5. nothing degenerate reaches the wallet ───────────────────')
for (const [label, r] of [
    ['zero deliveries',      scoreRoute([], 9, PAR, PAR, TIER)],
    ['zero customers',       scoreRoute([], 0, PAR, PAR, TIER)],
    ['par of zero',          scoreRoute([1], 9, PAR, 0, TIER)],
    ['par of NaN',           scoreRoute([1], 9, PAR, NaN, TIER)],
    ['elapsed of NaN',       scoreRoute(Array(9).fill(1), 9, NaN, PAR, TIER)],
    ['negative accuracies',  scoreRoute([-5, -1], 9, PAR, PAR, TIER)],
]) {
    check(`${label}: payout is a finite, non-negative number`,
        isFinite(r.payout) && r.payout >= 0, `got ${r.payout}`)
}
check('zero deliveries letters D and pays nothing', (() => {
    const r = scoreRoute([], 9, PAR, PAR, TIER)
    return r.letter === 'D' && r.payout === 0
})())

console.log('\n── 6. SM-INV-4 is untouched; the wallet is shared ─────────────')
// Comments STRIPPED first: this file explains at length why it does not use the margin line, and
// naming a function in prose is not calling it. What we are pinning is the code.
const src = (await import('node:fs')).readFileSync(new URL('../src/paper-route.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
check('paper-route.js never calls payoutFor', !/\bpayoutFor\s*\(/.test(src))
check('paper-route.js never calls gradeRun', !/\bgradeRun\s*\(/.test(src))
check('…and never imports them either (the structural version)',
    !/import[\s\S]*?\b(payoutFor|gradeRun)\b[\s\S]*?from/.test(src))
const econ = new EconomySystem({ getDay: () => 1 })
econ.start()
const before = { ...runEconomy }
const paid = econ.settleFlat(clean.payout, clean.letter)
check('settleFlat accrues money to the one wallet', runEconomy.money === before.money + paid.payout)
check('…and deeds through the shared pointsFor', runEconomy.halfPoints === before.halfPoints + pointsFor(clean.letter) * 2)
check('…and counts the mission', runEconomy.missions === before.missions + 1)
econ.settleFlat(NaN, 'D')
check('a NaN payout cannot poison the wallet', isFinite(runEconomy.money))
econ.settleFlat(-500, 'D')
check('a negative payout cannot drain the wallet', runEconomy.money >= 0)

console.log('\n── 7. the flat rate is anchored to par ────────────────────────')
check('FLAT is k × par × tier × paperW / customers', (() => {
    const r = scoreRoute([1], 9, PAR, PAR, 2.0)
    return near(r.flat, ECONOMY_PARAMS.k * PAR * 2.0 * PAPER_PARAMS.paperW / 9)
})())
check('a longer route pays proportionally more per paper', (() => {
    const a = scoreRoute([1], 9, PAR, PAR, TIER)
    const b = scoreRoute([1], 9, PAR, PAR * 2, TIER)
    return near(b.flat, a.flat * 2)
})())
check('the day tier lifts the floor with the cost curve', (() => {
    const d1 = scoreRoute(Array(9).fill(1), 9, PAR, PAR, 1.0)
    const d20 = scoreRoute(Array(9).fill(1), 9, PAR, PAR, 4.58)
    return d20.payout > d1.payout * 4
})())
check('a perfect route at par pays ~60% of the margin line', (() => {
    const r = scoreRoute(Array(9).fill(1), 9, PAR, PAR, TIER)
    const margin = ECONOMY_PARAMS.k * PAR * TIER * 1.0   // payoutFor at ratio 1.0 → m = 1
    return near(r.payout / margin, PAPER_PARAMS.paperW, 1e-9)
})())

console.log(fails === 0 ? '\nALL PAPER-ROUTE CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`)
process.exit(fails ? 1 : 0)
