// src/rank-timer.js — FEAT-87: the live rank timer, pure math.
//
// A mission's rank is the par ratio (elapsed / par) bucketed by the thresholds FROZEN at accept
// (FEAT-53). Laid out along a time axis those thresholds are four lines ahead of the player —
// S→A, A→B, B→C, C→D — and the run starts in S. This module turns a mission's contract into that
// line-up (`rankTimerLayout`) and, per frame, answers "which band am I in, which line is next, how
// hard should the bar be sweating, and did a line just go past" (`rankTimerFrame`). main.js owns
// the DOM: a ticker strip in the style of the FEAT-55 energy meter that scrolls these bands past a
// fixed pointer, sited on the run HUD (top-right), never over the road.
//
// What is binding here (DESIGN.md SM-INV-3 as amended 2026-08-17, and the FEAT-87 rulings):
//   • BOUNDARY PROXIMITY, NEVER A COUNTDOWN. This module hands out seconds so the strip can be
//     drawn to scale; nothing downstream may render them as digits. `3:41 remaining` is the exact
//     banned string. The bar shows where the letters fall, not how long is left.
//   • NOT THERE UNTIL IT MATTERS (owner, 2026-10-01). The bar pops up `appearS` (15) seconds before
//     the S/A line and stays for the rest of the job. For most of a drive it has nothing to say — the
//     player only gets useful data from it when the mission is almost over — so until then it is
//     not on screen at all. `shown` is that decision.
//   • CALM → FLASHY NEAR THE EDGE. `intensity` is 0 for the whole quiet middle of a band and ramps
//     to 1 only inside the last `escalateS` seconds before the NEXT line. The 2026-08-17
//     "glanceable and peripheral" constraint is relaxed near boundaries only — the ramp is what
//     keeps the relaxation local.
//   • THE OFFER'S GATE IS MARKED, AND CROSSING IT IS THE "BONUS LOST" BEAT. A gate of X is earned
//     at X or better (economy.js bonusEarned), so the bonus lapses the instant the X band ends:
//     gate 'S' is the S/A line, 'A' the A/B line, 'B' the B/C line, 'C' the C/D line. `lost` fires
//     on exactly the frame elapsed steps over it.
//   • D IS VISUAL PRESSURE, NOT A CLIFF. `slow` fires when the C/D line goes past so the bar can
//     make a moment of it; the payout underneath is the same continuous line (SM-INV-4) and this
//     module never touches money. Past D nothing is ahead, so the bar goes calm — there is nothing
//     left to sweat.
//
// Pure: imports nothing, no DOM, no clock of its own (elapsed comes from the mission state
// machine, which is what the result card grades on — the bar and the letter cannot disagree).

/** Rank letters in the order the bands lie along the time axis. */
export const RANK_ORDER = ['S', 'A', 'B', 'C', 'D']

// GEOMETRY [owner, 2026-10-01]: the targets are A·B·C·D, so they get the bar. The pointer sits
// near the LEFT edge (little of the past is worth showing), the scale is 6 px/s so the 7-second
// A and B bands are real targets (43 px) rather than slivers, and the view is 40 s wide. The bar
// pops appearS = 15 s before the S/A line, so AT THE POP the S band is exactly half the view
// (5 s behind + 15 s ahead = 20 of 40 s) and A–D the other half — from there S only shrinks.
// Gated: appearS·pxPerS + pointerFrac·viewW ≤ viewW/2.
export const RANK_TIMER_PARAMS = {
    pxPerS:     6,      // strip scale — one second of elapsed is this many pixels of scroll
    viewW:      240,    // px — the visible window of the strip (40 s; 35 s of it AHEAD)
    pointerFrac: 1 / 8, // the fixed pointer sits this far across the view (so 7/8 of it is AHEAD)
    appearS:    15,     // s — the bar pops up this long before the S/A line, not before
    escalateS:  10,     // s — a line within this many seconds ramps the bar from calm to flashy
    // The pulse [owner, 2026-10-01: "slow and mild leading into fast, stronger pulsing right
    // before breakaway"; top raised 120 → 140 bpm with the kick-drum heartbeat, 2026-10-02]: ONE
    // oscillator whose frequency ramps with intensity, no randomness. 140 bpm is 2.33 Hz — a racing
    // heartbeat, not a buzz; the ramp starts under a beat a second (48 bpm) and reaches 140 at the
    // line. It drives the glow, the letter's scale
    // and a heartbeat sound on every peak (heartbeat-audio.js). The card no longer shakes (owner,
    // 2026-10-02).
    pulseHzMin: 0.8,    // Hz — the oscillator at the start of the ramp (48 bpm)
    pulseHzMax: 140 / 60, // Hz — …at the line (140 bpm)
    heartMin:   0.35,   // heartbeat loudness at the start of the ramp (→ 1 at the line; × 0.5 for a light line)
    beatS:      1.4,    // s — how long the "bonus lost" / "too slow" beat holds on screen
}

/**
 * The band line-up for one accepted job: where each letter starts and ends in SECONDS of elapsed.
 *
 * @param {number} par — the job's par (seconds)
 * @param {{S:number,A:number,B:number,C:number}} thresholds — the ratios frozen at accept
 * @param {string|null} [gate] — the offer's bonus gate letter (S/A/B/C), or null for no bonus
 * @returns {{bands:Array<{letter:string,t0:number,t1:number}>, gateT:number|null, slowT:number}|null}
 *   `bands` run S→D contiguous from 0; D's `t1` is Infinity. `gateT` is the second the bonus
 *   lapses (null without a gate). `slowT` is the C/D line. Null for a degenerate par.
 */
export function rankTimerLayout (par, thresholds, gate = null) {
    if (!isFinite(par) || par <= 0 || !thresholds) return null
    const edges = [0, thresholds.S * par, thresholds.A * par, thresholds.B * par, thresholds.C * par, Infinity]
    const bands = RANK_ORDER.map((letter, i) => ({ letter, t0: edges[i], t1: edges[i + 1] }))
    // The gate's band ends where its letter lapses — the last second the bonus is still earnable.
    const gi = gate ? RANK_ORDER.indexOf(gate) : -1
    const gateT = (gi >= 0 && gi < 4) ? bands[gi].t1 : null   // D is never a gate (economy.js)
    // `par`/`thresholds` ride along so the frame can bucket by RATIO with gradeRun's own
    // arithmetic (`ratio <= threshold`), not by comparing seconds against a product — the two
    // differ by an ulp at the line, and the bar must never show a letter the card won't.
    return { bands, gateT, slowT: edges[4], par, thresholds: { ...thresholds } }
}

/** The band a ratio falls in — gradeRun's bucketing, verbatim (on the line is still the better letter). */
function letterAt (ratio, T) {
    if (ratio <= T.S) return 'S'
    if (ratio <= T.A) return 'A'
    if (ratio <= T.B) return 'B'
    if (ratio <= T.C) return 'C'
    return 'D'
}

/**
 * One frame of the timer.
 *
 * @param {ReturnType<typeof rankTimerLayout>} layout
 * @param {number} elapsed — seconds on the mission clock now
 * @param {number} prevElapsed — the same, last frame (crossings are detected on the step)
 * @param {object} [P]
 * @returns {{shown:boolean, letter:string, next:{letter:string,t:number}|null, intensity:number,
 *            heavy:boolean, lost:boolean, slow:boolean}}
 *   `shown`     the bar is on screen — from appearS before the S/A line to the end of the job
 *   `letter`    the band under the pointer now
 *   `next`      the line ahead (the letter it lapses TO and when), null once in D
 *   `intensity` 0 (calm) → 1 (on the line), ramping only inside the last escalateS seconds
 *   `heavy`     the line ahead is a heavy one — the bonus gate or the C/D line
 *   `lost`      the bonus gate went past on THIS step (fires once)
 *   `slow`      the C/D line went past on THIS step (fires once)
 */
export function rankTimerFrame (layout, elapsed, prevElapsed, P = RANK_TIMER_PARAMS) {
    const calm = { shown: false, letter: 'D', next: null, intensity: 0, heavy: false, lost: false, slow: false }
    if (!layout) return calm
    const e = Math.max(0, elapsed), T = layout.thresholds
    const shown = e >= layout.bands[0].t1 - P.appearS
    const letter = letterAt(e / layout.par, T)
    const prevLetter = letterAt(Math.max(0, prevElapsed) / layout.par, T)
    const i = RANK_ORDER.indexOf(letter)
    const band = layout.bands[i]
    const next = i < 4 ? { letter: RANK_ORDER[i + 1], t: band.t1 } : null
    // A line is crossed on the step whose letter is worse than the last step's — by letters, so a
    // beat fires on exactly the frame the card's letter would change, never an ulp early or late.
    const li = RANK_ORDER.indexOf(prevLetter)
    const crossed = (t) => {
        if (t == null || !isFinite(t)) return false
        const k = layout.bands.findIndex(b => b.t1 === t)     // the band that ends on this line
        return li <= k && i > k
    }
    if (!next) return { ...calm, shown, lost: crossed(layout.gateT), slow: crossed(layout.slowT) }
    const intensity = Math.min(1, Math.max(0, 1 - (next.t - e) / P.escalateS))
    const heavy = next.t === layout.gateT || next.t === layout.slowT
    return { shown, letter, next, intensity, heavy, lost: crossed(layout.gateT), slow: crossed(layout.slowT) }
}
