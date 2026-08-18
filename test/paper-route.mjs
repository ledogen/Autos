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
    deadlineFor, scoreRoute, advancesTier,
} from '../src/paper-route.js'
import { EconomySystem, runEconomy, ECONOMY_PARAMS, pointsFor, payoutFor } from '../src/economy.js'

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
// `.total` from here on where the check means MONEY EARNED. Since 2026-08-15 accuracy money is
// banked ON THE SPOT as each paper lands (`spot`) and only the clock settles at the bell
// (`payout`), so a route driven exactly at par settles ZERO — every dollar was already paid. The
// old assertions read `.payout` and were really asking about the total.
check('…and still pays for the one', one.total > 0, `total ${one.total}`)
check('…which is exactly one paper at the tip rate', near(one.spot, one.tip))
const half = scoreRoute(Array(5).fill(accuracyScore(0, R)), 9, PAR, PAR, TIER)
check('more deliveries pay strictly more', half.total > one.total)
check('coverage is delivered/customers', near(half.coverage, 5 / 9))
const sloppy = scoreRoute(Array(9).fill(accuracyScore(R, R)), 9, PAR, PAR, TIER)
const clean  = scoreRoute(Array(9).fill(accuracyScore(0, R)), 9, PAR, PAR, TIER)
check('a full sloppy route pays less than a full clean one', sloppy.total < clean.total)
check(`…by exactly the accuracy floor (${ACC_FLOOR}×)`, near(sloppy.spot, clean.spot * ACC_FLOOR, 1e-9))
// Both routes were driven at par, and under the amended model the letter is the CLOCK — so they
// letter the same and differ only in money. That is the point of the change: accuracy is paid for,
// not graded. (These two checks previously asserted S and D respectively, off coverage x accuracy.)
check('a clean and a sloppy route driven at par letter the SAME',
    clean.letter === sloppy.letter, `clean ${clean.letter}, sloppy ${sloppy.letter}`)
// [RE-ANCHORED 2026-08-16] This asserted B "because B contains par" — the THIRD copy of that rule
// in the suite, after economy.mjs and par-oracle.mjs. Par is the C/D boundary now, game-wide: the
// owner's 2026-08-14 ruling that the paper route keeps par-in-B was explicitly REVERSED rather
// than left standing as a second convention for one mission type.
check('…and that letter is C, because par is the slowest PASSING drive',
    clean.letter === 'C', `got ${clean.letter}`)

console.log('\n── 3. the fare IS the margin line, the tips ride on top ────────')
// [RESHAPED 2026-08-17, owner] The expediency bonus is GONE. It was a second time-payout curve
// beside the margin line, and because it saturated at expediteFull while the margin line keeps
// climbing, a paper round paid best relative to a POI job when you drove SLOWLY — inverting below
// ratio ~0.66. The clock is now priced by the SAME function every other mission uses, and the
// customers' tips are the difference. These checks pin that identity, because the moment the two
// drift apart the old bug is back.
const PT = 1.0
for (const r of [1.00, 0.90, 0.80, 0.72, 0.65]) {
    const round = scoreRoute(Array(9).fill(1), 9, PAR * r, PAR, PT)
    check(`the fare at ratio ${r.toFixed(2)} IS payoutFor — same function, same number`,
        near(round.payout, payoutFor(PAR, r, PT), 1e-9),
        `${round.payout} vs ${payoutFor(PAR, r, PT)}`)
}
// The thing the owner said went wrong with the old model, pinned so it cannot come back:
// time money used to fall to exactly zero at par. Par is the slowest PASSING drive; it pays.
const atPar = scoreRoute(Array(9).fill(1), 9, PAR, PAR, PT)
check('PAR STILL PAYS — the fare does not road-to-zero at the bell', atPar.payout > 0,
    `fare at par ${atPar.payout}`)
check('…and the tips at par are already banked on top', atPar.spot > 0)
// A tip is a fixed gratuity on a growing fare: the premium is biggest where the fare is smallest
// and tapers as you drive faster. What it must never do is invert — that was the old bug.
let prem = [], monotone = true, prev = Infinity
for (const r of [1.00, 0.90, 0.80, 0.72, 0.65, 0.60]) {
    const round = scoreRoute(Array(9).fill(1), 9, PAR * r, PAR, PT)
    const x = round.total / payoutFor(PAR, r, PT)
    prem.push(x)
    if (x > prev + 1e-9) monotone = false
    prev = x
}
check('a perfect round ALWAYS out-earns the equivalent POI job (never inverts)',
    prem.every(x => x > 1.0), prem.map(x => x.toFixed(2) + 'x').join(' '))
check('…and the premium tapers as the fare grows, like a tip', monotone,
    prem.map(x => x.toFixed(2)).join(' → '))
check('…worth ~20% at the break-even pace, which is what paperTip means',
    Math.abs(prem[2] - (1 + PAPER_PARAMS.paperTip)) < 0.005, `${prem[2].toFixed(3)}x`)
// The income floor is now the TIPS, not the fare: an unfinished round still banks what it placed.
const partial = scoreRoute(Array(3).fill(1), 9, PAR * 0.9, PAR, PT)
check('an unfinished round still banks its tips (the floor)', partial.spot > 0)
check('…and is paid for the road it actually served, not cliff-edged', partial.payout >= 0)
check('accuracy scales the tips and nothing else', (() => {
    const sharp = scoreRoute(Array(9).fill(1.0), 9, PAR * 0.8, PAR, PT)
    const rough = scoreRoute(Array(9).fill(0.3), 9, PAR * 0.8, PAR, PT)
    return near(sharp.payout, rough.payout) && rough.spot < sharp.spot
})())
check('the retired bonus is really gone (no expediteFull / bonusMax left to drift)',
    PAPER_PARAMS.bonusMax === undefined && PAPER_PARAMS.expediteFull === undefined &&
    PAPER_PARAMS.expediteOn === undefined && PAPER_PARAMS.paperW === undefined)

console.log('\n── 4. rank is per-axis, and the ladder ────────────────────────')
// THE CLOCK GRADES [ratified 2026-08-14] — the exact reversal of what this gate used to assert,
// which said the rank ignored the clock entirely. Kept as an explicit inversion so a reader of the
// history can see the model changed rather than the test rotting.
check('the rank is the CLOCK now, not the throwing', (() => {
    const slow  = scoreRoute(Array(9).fill(1), 9, PAR * 1.4, PAR, TIER)   // perfect throws, dawdled
    const quick = scoreRoute(Array(9).fill(1), 9, PAR * 0.5, PAR, TIER)
    return slow.letter !== quick.letter && quick.letter === 'S' && slow.letter === 'D'
})())
// [RE-ANCHORED 2026-08-16] Was "B contains par (SM-INV-3, owner-confirmed 2026-08-14)". That
// confirmation is REVERSED, by the owner, game-wide — par is the last passing letter, not the
// middle one. A perfect round driven at par is a C: you passed, you earned your throw money, and
// you earned nothing for the clock.
check('…and par itself is a C (SM-INV-3 as re-anchored 2026-08-16, reversing 2026-08-14)',
    scoreRoute(Array(9).fill(1), 9, PAR, PAR, TIER).letter === 'C')
check('…dawdling past par is a D, not a C — past par you have failed the standard',
    scoreRoute(Array(9).fill(1), 9, PAR * 1.1, PAR, TIER).letter === 'D')
check('accuracy does NOT move the letter — only the money', (() => {
    const sharp = scoreRoute(Array(9).fill(1.0), 9, PAR, PAR, TIER)
    const rough = scoreRoute(Array(9).fill(0.3), 9, PAR, PAR, TIER)
    return sharp.letter === rough.letter && rough.total < sharp.total
})())
// PAR SCALES WITH COVERAGE [owner, 2026-08-15] — skipping people cannot buy time, because it
// shrinks the clock you are held to by exactly as much. This replaced a flat D for any incomplete
// route, which graded 8-of-9 the same as 1-of-9.
check('an incomplete route is measured against a SHORTER par, not handed a flat D', (() => {
    const third = scoreRoute(Array(3).fill(1), 9, PAR / 3, PAR, TIER)   // a third of the job, a third of the time
    const full  = scoreRoute(Array(9).fill(1), 9, PAR, PAR, TIER)
    return third.letter === full.letter
})())
check('…so dropping papers and taking the full time is punished', (() => {
    const lazy = scoreRoute(Array(3).fill(1), 9, PAR, PAR, TIER)        // a third of the job, all of the time
    return lazy.letter === 'D'
})())
check('…and one paper short of a full round still beats half a round', (() => {
    const nearly = scoreRoute(Array(8).fill(1), 9, PAR * 0.88, PAR, TIER)
    const half   = scoreRoute(Array(4).fill(1), 9, PAR * 0.88, PAR, TIER)
    const order  = ['D', 'C', 'B', 'A', 'S']
    return order.indexOf(nearly.letter) > order.indexOf(half.letter)
})())
check('…and still PAYS for what it placed (the income floor)',
    scoreRoute(Array(8).fill(1), 9, PAR * 0.5, PAR, TIER).total > 0)
// THE SPLIT ITSELF [owner, 2026-08-15]: accuracy is banked live, the clock settles at the bell, and
// the end-of-route payout is a PURE FUNCTION OF TIME. Two routes with the same time and wildly
// different accuracy must settle the same amount and differ only in what was already paid.
check('the end-of-route payout is decoupled from accuracy entirely', (() => {
    const sharp = scoreRoute(Array(9).fill(1.0), 9, PAR * 0.8, PAR, TIER)
    const rough = scoreRoute(Array(9).fill(0.3), 9, PAR * 0.8, PAR, TIER)
    return near(sharp.payout, rough.payout) && rough.spot < sharp.spot
})())
// [RESHAPED 2026-08-17] The inverse of what this used to assert. Running to the bell settling
// NOTHING was the owner-reported flaw: the bell is par, par is the slowest passing drive, and a
// pass should pay. It now settles the margin line's value at ratio 1.0 — half a day-tier unit.
check('a route that runs to the BELL still settles a fare — par pays', (() => {
    const r = scoreRoute(Array(9).fill(1.0), 9, PAR * PAPER_PARAMS.tolerance, PAR, TIER)
    return r.payout > 0 && r.spot > 0 && near(r.payout, payoutFor(PAR, 1.0, TIER))
})())
// THE OWNER'S EQUIVALENCE IS RETIRED [2026-08-17], and its replacement is pinned instead so the
// change is visible rather than merely absent. It used to say a rim-scraper blasting the round
// earned what a methodical driver earned at par — the equation that fixed bonusMax at 0.70. The
// fare is the margin line now, which rewards pace without a ceiling, so SPEED OUT-EARNS ACCURACY
// and that is the accepted consequence of "pay the clock like any other job, tip on top".
// `paperTip` is the single dial for how much accuracy is worth; raise it to weight throwing more.
check('speed now out-earns accuracy (the 2026-08-14 equivalence is retired, deliberately)', (() => {
    const methodical = scoreRoute(Array(9).fill(1.0), 9, PAR, PAR, TIER)          // perfect, at par
    const blaster    = scoreRoute(Array(9).fill(0.3), 9, PAR * 0.70, PAR, TIER)   // ragged, quick
    return blaster.total > methodical.total
})())
check('…but accuracy is still worth real money, not a rounding error', (() => {
    const sharp = scoreRoute(Array(9).fill(1.0), 9, PAR * 0.8, PAR, TIER)
    const rough = scoreRoute(Array(9).fill(0.3), 9, PAR * 0.8, PAR, TIER)
    return (sharp.total - rough.total) / rough.total > 0.10
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
// [REVERSED 2026-08-17] This gate used to pin that the paper route NEVER calls payoutFor, on the
// reasoning that the margin line was the wrong shape for it. That produced two time-payout curves
// with different ceilings, and the route ended up paying best for driving slowly. It now calls the
// shared function on purpose — the whole point is that one drive over one road is priced once.
check('paper-route.js DOES price the clock through the shared margin line', /\bpayoutFor\s*\(/.test(src))
// gradeRun IS called now [ratified 2026-08-14] — the rank is the par ratio, through the same
// function every other mission type grades with, so a paper route's B means what a POI job's B
// means. payoutFor is still never called: the MONEY is a flat rate, not the margin line, and
// SM-INV-4 stays untouched. That asymmetry is the thing worth pinning.
check('paper-route.js DOES grade through the shared gradeRun', /\bgradeRun\s*\(/.test(src))
check('…and imports it from economy.js rather than re-deriving the curve',
    /import\s*\{[^}]*payoutFor[^}]*\}\s*from\s*'\.\/economy\.js'/.test(src))
check('…and does NOT reimplement the payout line locally (no second copy to drift)',
    !/1\.20\s*-\s*ratio|payoutZero/.test(src))

// ── the calibration form has to be REACHABLE from the paper card [2026-08-17] ───────────────────
// This shipped broken once and no gate could see it: `#mp-export-row` is a child of
// `#mission-panel`, and `#paper-panel` is a SIBLING of that — so toggling the row's own `display`
// while the paper card was up did nothing at all, and a finished round showed earnings, a continue
// button, and no form. main.js therefore MOVES the single form node into whichever panel is up.
// Text assertions, because the failure is DOM parenting and lives outside any headless harness —
// they encode the two facts that made it break rather than re-testing the browser.
{
    const { readFileSync } = await import('node:fs')
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    const mpPanel = html.slice(html.indexOf('id="mission-panel"'), html.indexOf('id="paper-panel"'))
    check('the export row still lives in the MISSION panel (so moving it is required)',
        mpPanel.includes('id="mp-export-row"'))
    check('…and there is exactly ONE of it — never a second copy for the paper card',
        (html.match(/id="mp-export-row"/g) || []).length === 1)
    check('main.js mounts the form into the paper panel on a finished round',
        /mountExportRow\(\s*'paper-panel'/.test(main))
    check('…and back into the mission panel for a POI job',
        /mountExportRow\(\s*'mission-panel'/.test(main))
    check('…and hides it ownership-guarded, so one card cannot strip the other\'s form',
        /function unmountExportRow/.test(main) &&
        !/show\(document\.getElementById\('mp-export-row'\),\s*false\)/.test(main))
    check('the felt buttons ask whichever system owns the card (not always the POI one)',
        /_exportSource\s*\?\?\s*missionSystem/.test(main))
    // THE SECOND bug in the same feature, pinned because a build will never catch it: every
    // `show()` in main.js is a const LOCAL to one render function, so a module-scope helper calling
    // it throws a ReferenceError the instant it runs. That aborted _renderPaperUI midway — the body
    // was already written, so the card looked fine while the form never mounted and the buttons kept
    // the previous render's labels. These helpers must stay self-contained.
    const helper = (name) => {
        const i = main.indexOf(`function ${name} `)
        if (i < 0) return ''
        let d = 0, k = main.indexOf('{', i), start = k
        for (;; k++) { if (main[k] === '{') d++; else if (main[k] === '}' && --d === 0) break }
        return main.slice(start, k)
    }
    const bodies = helper('mountExportRow') + helper('unmountExportRow')
    check('the export-row helpers are self-contained (they run at module scope)',
        bodies.length > 0 && !/(?<![.\w])show\s*\(/.test(bodies),
        'a renderer-local show() here is a ReferenceError at runtime')
}
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
check('the TIP is k × par × tier × paperTip / customers', (() => {
    const r = scoreRoute([1], 9, PAR, PAR, 2.0)
    return near(r.tip, ECONOMY_PARAMS.k * PAR * 2.0 * PAPER_PARAMS.paperTip / 9)
})())
check('a longer route tips proportionally more per paper', (() => {
    const a = scoreRoute([1], 9, PAR, PAR, TIER)
    const b = scoreRoute([1], 9, PAR, PAR * 2, TIER)
    return near(b.tip, a.tip * 2)
})())
check('the day tier lifts the floor with the cost curve', (() => {
    const d1 = scoreRoute(Array(9).fill(1), 9, PAR, PAR, 1.0)
    const d20 = scoreRoute(Array(9).fill(1), 9, PAR, PAR, 4.58)
    return d20.total > d1.total * 4
})())
// The FLOOR anchor: what the papers alone are worth on a perfect round at par. Reads `spot`, not
// `total`, since paperW describes the paper money — the part that has to survive the 20-day ramp.
//
// [RE-ANCHORED 2026-08-16] This used to divide by a LOCAL constant `k·PAR·TIER·1.0`, commented
// "payoutFor at ratio 1.0 → m = 1". That identity died with the re-anchor (ratio 1.0 now pays
// m = 0.5), and because the constant was hand-inlined rather than read from payoutFor, the check
// would have gone on passing while silently measuring paperW against the wrong yardstick. It now
// names its yardstick explicitly: ONE DAY-TIER UNIT, which is what paperW is defined against
// (see PAPER_PARAMS.paperW) — and asserts the identity that used to be assumed, so the next
// re-anchor breaks this loudly instead of quietly.
check('a perfect route\'s TIPS are worth ~20% of ONE DAY-TIER UNIT', (() => {
    const r = scoreRoute(Array(9).fill(1), 9, PAR, PAR, TIER)
    const unit = ECONOMY_PARAMS.k * PAR * TIER           // == payoutFor at the break-even ratio
    return near(r.spot / unit, PAPER_PARAMS.paperTip, 1e-9)
})())
check('…and that unit really is payoutFor at break-even (not an inlined guess)',
    near(payoutFor(PAR, ECONOMY_PARAMS.breakEven, TIER), ECONOMY_PARAMS.k * PAR * TIER, 1e-9))
check('…while par itself pays only half of it — the floor now beats a bare pass, deliberately',
    near(payoutFor(PAR, 1.0, TIER), 0.5 * ECONOMY_PARAMS.k * PAR * TIER, 1e-9))

console.log('\n── 7b. the target circle never overlaps the road ──────────────')
// The offset exists FOR this: a paper that lands on the tarmac must not score. Growing the radius
// (3 → 5 m, owner 2026-08-07) had to move the offset out with it, and nothing else in the codebase
// couples the two — so it is pinned here.
const { POI_PARAMS } = await import('../src/poi.js')
const shoulderEdge = (POI_PARAMS.roadHalfWidth ?? 5) + (POI_PARAMS.roadShoulderWidth ?? 2.5)
check('the delivery circle clears the shoulder edge entirely',
    POI_PARAMS.poiHouseLat - POI_PARAMS.poiHouseTargetR > shoulderEdge,
    `lat ${POI_PARAMS.poiHouseLat} − R ${POI_PARAMS.poiHouseTargetR} = ${POI_PARAMS.poiHouseLat - POI_PARAMS.poiHouseTargetR}, shoulder edge ${shoulderEdge}`)

console.log('\n── 8. ballistics: drag, and the path the score came from ──────')
const { simulateThrow, launchVelocity, THROW_PARAMS } = await import('../src/throw.js')
const flat = () => 0
const v0 = launchVelocity({ x: 0.6, y: 0.35, z: -0.72 }, { x: 0, y: 0, z: -12 })
const shot = simulateThrow({ x: 0, y: 1.5, z: 0 }, v0, flat)
check('the velocity is ADDED to the truck\'s, not substituted',
    near(launchVelocity({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -20 }).z, -(THROW_PARAMS.throwSpeed + 20)))
check('drag shortens the throw', (() => {
    const noDrag = simulateThrow({ x: 0, y: 1.5, z: 0 }, v0, flat, { ...THROW_PARAMS, dragK: 0 })
    return Math.hypot(shot.x, shot.z) < Math.hypot(noDrag.x, noDrag.z) * 0.9
})())
check('…and with drag OFF the integrator is still exact vs the closed form', (() => {
    const t = Math.sqrt(2 * 10 / 9.81)
    const r = simulateThrow({ x: 0, y: 10, z: 0 }, { x: 10, y: 0, z: 0 }, flat, { ...THROW_PARAMS, dragK: 0 })
    return Math.abs(r.x - 10 * t) < 1e-3      // 1 mm over a 14 m throw
})())
check('THE LANDING POINT IS STEP-SIZE INDEPENDENT — the score cannot depend on dt', (() => {
    const b = simulateThrow({ x: 0, y: 1.5, z: 0 }, v0, flat, { ...THROW_PARAMS, stepS: 1 / 480 })
    const c = simulateThrow({ x: 0, y: 1.5, z: 0 }, v0, flat, { ...THROW_PARAMS, stepS: 1 / 2000 })
    return Math.hypot(shot.x - b.x, shot.z - b.z) < 1e-3 && Math.hypot(shot.x - c.x, shot.z - c.z) < 1e-3
})(), 'RK2 regression — a first-order step moves this ~17 cm')
check('the recorded path ENDS at the scored landing point', (() => {
    const p = shot.path, n = p.length / 3 - 1
    return near(p[n * 3], shot.x, 1e-9) && near(p[n * 3 + 1], shot.y, 1e-9) && near(p[n * 3 + 2], shot.z, 1e-9)
})(), 'the renderer replays this path; if it ends elsewhere the paper lies about where it scored')
check('…and STARTS at the launch point', (() => {
    const p = shot.path
    return near(p[0], 0) && near(p[1], 1.5) && near(p[2], 0)
})())
check('a throw at the sky never lands rather than landing somewhere silly',
    simulateThrow({ x: 0, y: 1.5, z: 0 }, { x: 0, y: 400, z: 0 }, flat) === null)
check('a paper launched below ground lands at once', (() => {
    const r = simulateThrow({ x: 0, y: -1, z: 0 }, { x: 5, y: 5, z: 0 }, flat)
    return r && r.t === 0 && r.y === 0
})())
check('landing is consistent with the ground it landed on (1:5 slope)', (() => {
    const slope = (x) => x * 0.2
    const r = simulateThrow({ x: 0, y: 5, z: 0 }, { x: 8, y: 0, z: 0 }, (x) => slope(x))
    return r && Math.abs(r.y - slope(r.x)) < 1e-9
})())

console.log(fails === 0 ? '\nALL PAPER-ROUTE CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`)
process.exit(fails ? 1 : 0)
