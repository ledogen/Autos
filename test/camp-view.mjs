// ── GATE: the campsite view score (skylineView) ────────────────────────────────────────────────
//
// The fourth vibe segment. skylineView is deliberately PURE in its height sampler — that is what
// keeps the score window-invariant (SM-INV-12) once it is fed terrain.rawHeightWorld — so this gate
// drives it with synthetic landscapes instead of booting a world. No terrain, no worker, no chunks.
//
// What is asserted:
//   1. ORDERING — the scores rank the way a person would rank the places. This is the real gate;
//      the absolute numbers are tuning and are allowed to move.
//   2. A FLAT PLAIN IS NOT A VIEW. It is open and it sees for kilometres, so any AZIMUTHAL measure
//      of openness scores it well — and since a plain also scores full flatness, that would make
//      featureless ground the best campsite in the world. The angular weighting is what stops it:
//      what you are actually looking at on a plain is grass 40 m away. If someone re-reads the score
//      as "how many directions are open", this is the assertion that fails.
//   3. NEAR GROUND IS WHAT RUINS A VIEW, NOT SKY. A cliff edge scores well; a hillside does not.
//   4. PURITY — same sampler, same point, same answer, and no dependence on call order.
//   5. TRANSLATION INVARIANCE — the same landform scored at a different world position gives the
//      same answer, which is the property window-invariance actually rests on.

import { skylineView, CAMP_PARAMS } from '../src/camp.js'

const P = { ...CAMP_PARAMS }
let fails = 0
const ok = (cond, msg) => { if (!cond) { fails++; console.log(`  FAIL  ${msg}`) } else console.log(`  ok    ${msg}`) }

// ── Synthetic landscapes ───────────────────────────────────────────────────────────────────────
// Each is height(x,z) in metres, centred on the origin unless stated.

const plain = () => 0

// A cone summit: 300 m radius, 150 m tall. Standing on top, every direction falls away.
const cone = (cx = 0, cz = 0) => (x, z) => {
    const d = Math.hypot(x - cx, z - cz)
    return Math.max(0, 150 * (1 - d / 300))
}

// A bowl: the inverse — a 300 m radius depression 150 m deep, walls in every direction.
const bowl = (x, z) => {
    const d = Math.hypot(x, z)
    return d >= 300 ? 150 : 150 * (d / 300)
}

// A rim: the shelf you camp on, a 120 m drop in front of it to a valley floor, a far ridge rising
// back up beyond it, and a hillside behind you. Epic one way, walled the other — the classic
// overlook. NB the far ridge is not decoration: a cliff with NOTHING beyond it is a view of sky,
// and scoring it low is correct, so a landform without one would test nothing.
const rim = (x, z) => {
    if (x < -200) return (-200 - x) * 0.5              // hillside behind
    if (x <= 0) return 0                               // the shelf you camp on
    if (x < 200) return -Math.min(120, x * 0.6)        // the drop
    if (x < 450) return -120                           // the valley floor
    return Math.min(40, -120 + (x - 450) * 0.64)       // the far ridge, climbing back up
}

// A BROAD valley floor, ridges 250 m either side — open along it, walled across it.
const valley = (x, z) => {
    const d = Math.abs(x)
    return d <= 250 ? 0 : Math.min(200, (d - 250) * 0.8)
}

// A TIGHT canyon: the same shape with 80 m walls at 50°. This, not the broad valley, is the
// walled-in case (see the ordering note below).
const canyon = (x, z) => {
    const d = Math.abs(x)
    return d <= 80 ? 0 : Math.min(200, (d - 80) * 1.2)
}

// ── 1. Ordering ────────────────────────────────────────────────────────────────────────────────

const vSummit = skylineView(cone(), 0, 0, P)
const vRim    = skylineView(rim, -40, 0, P)
const vValley = skylineView(valley, 0, 0, P)
const vCanyon = skylineView(canyon, 0, 0, P)
const vPlain  = skylineView(plain, 0, 0, P)
const vBowl   = skylineView(bowl, 0, 0, P)
// Down in the cone's own shadow: 500 m out on the flat, the 150 m cone fills one direction.
const vFoot   = skylineView(cone(), 500, 0, P)

console.log('scores:', JSON.stringify({
    summit: +vSummit.toFixed(3), rim: +vRim.toFixed(3), valley: +vValley.toFixed(3),
    canyon: +vCanyon.toFixed(3), plain: +vPlain.toFixed(3), foot: +vFoot.toFixed(3),
    bowl: +vBowl.toFixed(3),
}))

// NB these landforms are deliberately more dramatic than anything the noise produces — a 150 m cone,
// a 120 m drop — so the top of the range SATURATES here and summit == rim == 1.0. That is the curve
// working, not a tie to fix: both are far past the best ground on a real seed. The discrimination
// that matters is measured against real terrain (see the campable-population note in CAMP_PARAMS).
ok(vSummit > 0.9,          `a summit maxes out (${vSummit.toFixed(3)} > 0.9)`)
ok(vSummit >= vRim,        `a summit is no worse than a rim overlook (${vSummit.toFixed(3)} ≥ ${vRim.toFixed(3)})`)
ok(vRim > vPlain + 0.2,    `a rim overlook decisively beats a flat plain (${vRim.toFixed(3)} ≫ ${vPlain.toFixed(3)})`)
ok(vRim > vCanyon + 0.2,   `…and a tight canyon (${vRim.toFixed(3)} ≫ ${vCanyon.toFixed(3)})`)
ok(vValley > vCanyon,      `a broad valley beats a tight canyon (${vValley.toFixed(3)} > ${vCanyon.toFixed(3)})`)
// Not zero, and correctly so: this canyon is a straight trench, so two of its twelve azimuths look
// 2 km down its own length. Walled in is not the same as blind.
ok(vCanyon < 0.25,         `a tight canyon is barely a view (${vCanyon.toFixed(3)} < 0.25)`)
ok(vBowl < 0.1,            `a bowl is not a view (${vBowl.toFixed(3)} < 0.1)`)
ok(vFoot < 0.5,            `the foot of a peak is a hillside in your face (${vFoot.toFixed(3)} < 0.5)`)
ok(vSummit <= 1 && vBowl >= 0, 'scores stay inside 0..1')

// ── 2. A flat plain is open in every direction and is still not a view ─────────────────────────
// The whole reason the scan is angular. Every azimuth sees 2 km; almost none of the FRAME does.

ok(vPlain < 0.15, `a flat plain is open everywhere and scores near nothing (${vPlain.toFixed(3)} < 0.15)`)

// ── 3. Near ground is what ruins a view ────────────────────────────────────────────────────────
// The same shelf, twice: once with the land dropping away to distant terrain, once with a 35°
// hillside standing in front of it at the same distance. Nothing else differs.

const hillside = (x, z) => (x <= 0 ? 0 : x * 0.7)
const vHill = skylineView(hillside, -20, 0, P)
ok(vRim > vHill + 0.4, `a shelf over distant ground beats one facing a hillside (${vRim.toFixed(3)} ≫ ${vHill.toFixed(3)})`)

// A KNOWN, DELIBERATE LIMITATION, recorded rather than asserted. A shelf above literal nothing —
// sheer drop, no far side, no distant range — has only its own ground in frame, so it scores near
// zero even though a person would call it a hell of a view. Sky is excluded from the average (it
// neither helps nor hurts), which means a direction with no terrain but the ground at your feet is
// judged on the ground at your feet. Fractal terrain does not actually produce this: there is
// always a far side. If a hand-authored cliff ever does, this is the note that explains the score.
const voidCliff = (x, z) => (x <= 0 ? 0 : -4000)
console.log(`  info  shelf above a literal void scores ${skylineView(voidCliff, -20, 0, P).toFixed(3)}`
    + ' (known limitation — see comment)')

// ── 4. Purity ──────────────────────────────────────────────────────────────────────────────────

const a = skylineView(rim, -40, 0, P)
const b = skylineView(rim, -40, 0, P)
skylineView(bowl, 0, 0, P)                 // an unrelated call in between
const c = skylineView(rim, -40, 0, P)
ok(a === b && b === c, 'same sampler + same point ⇒ bit-identical score, whatever ran in between')

// ── 5. Translation invariance ──────────────────────────────────────────────────────────────────
// The landform moved 8 km away must score the same. Anything that leaked a world-position
// dependence — a lattice snap, a memo keyed on absolute coordinates — dies here.

const FAR = 8000
const vSummitFar = skylineView(cone(FAR, -FAR), FAR, -FAR, P)
ok(Math.abs(vSummitFar - vSummit) < 1e-12,
   `the same summit 8 km away scores the same (Δ ${Math.abs(vSummitFar - vSummit).toExponential(1)})`)

// ── 6. Cost ────────────────────────────────────────────────────────────────────────────────────
// Report-only (wall clock is flaky in the gates — see CLAUDE.md), but the SAMPLE COUNT is not: it is
// exactly what evaluate() pays twice per re-grade, and it is asserted.

// A CEILING, not an equality: an azimuth that runs into a wall stops marching (the rest of the band
// is behind it), so a walled site is cheaper than an open one. Only the worst case is budgeted.
let samples = 0
skylineView((x, z) => { samples++; return plain(x, z) }, 0, 0, P)
const budget = P.campViewAz * P.campViewSteps + 1     // +1 for the site's own h0
ok(samples === budget, `an open site costs exactly ${budget} height samples (measured ${samples})`)
let walled = 0
skylineView((x, z) => { walled++; return canyon(x, z) }, 0, 0, P)
ok(walled <= budget, `a walled site is no dearer, and stops early (${walled} ≤ ${budget})`)

const t0 = process.hrtime.bigint()
const N = 200
for (let i = 0; i < N; i++) skylineView(rim, -40 + i * 1e-3, 0, P)
const us = Number(process.hrtime.bigint() - t0) / 1000 / N
console.log(`  info  ${us.toFixed(1)} µs per scan on a synthetic sampler (report-only; real terrain noise is dearer)`)

console.log(fails ? `\nFAIL — ${fails} assertion(s)` : '\nPASS — camp view score')
process.exit(fails ? 1 : 0)
