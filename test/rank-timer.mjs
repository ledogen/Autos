// test/rank-timer.mjs — FEAT-87 live rank timer gate.
//
// Pins the math behind the in-run rank bar (src/rank-timer.js) and the two presentation rules
// that are BINDING on it (DESIGN.md SM-INV-3 as amended 2026-08-17; FEAT-87 rulings 2026-09-25):
//
//   1. The band line-up IS the contract: S·A·B·C·D contiguous from 0, each line at the FROZEN
//      threshold × par (so the bar and gradeRun can never disagree about where a letter lapses),
//      D open-ended, degenerate par → no layout.
//   2. The offer's gate maps to the line where that letter LAPSES (gate X earned at X-or-better,
//      economy.js bonusEarned): S→S/A, A→A/B, B→B/C, C→C/D; no gate → no marker; D never a gate.
//   3. Calm → flashy near the edge, and nowhere else: intensity is exactly 0 further than
//      escalateS from the next line, ramps monotonically to 1 on it, drops back when the line
//      goes past, and is 0 for good once in D (nothing left to sweat).
//   4. The beats fire ONCE, on the crossing step — the bonus gate ("bonus lost") and the C/D line
//      ("too slow") — whatever the step size, and never when the clock stands still.
//   5. The gate and the C/D line are HEAVY; the lines you were not banking on are not.
//   6. NO DIGITS ON THE SURFACE. The DOM driver in main.js never calls formatTime and never
//      writes a time string — the module hands out seconds for the strip's geometry only.
//   7. rank-timer.js imports nothing (pure; headless by construction).
//
// Pure node: no THREE, no worldgen, no DOM.
import { RANK_ORDER, RANK_TIMER_PARAMS, rankTimerLayout, rankTimerFrame } from '../src/rank-timer.js'
import { gradeRun, RANK_THRESHOLDS_DEFAULT } from '../src/par.js'
import { bonusEarned } from '../src/economy.js'
import { readFileSync } from 'node:fs'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps
const P = RANK_TIMER_PARAMS
const T = RANK_THRESHOLDS_DEFAULT
const PAR = 180   // the measured day-1 average (economy.js)

// ── 1. the line-up is the contract ───────────────────────────────────────────────────────────
{
  const L = rankTimerLayout(PAR, T, null)
  check('bands run S→D in order', L.bands.map(b => b.letter).join('') === RANK_ORDER.join('') && RANK_ORDER.join('') === 'SABCD')
  check('bands are contiguous from 0', L.bands[0].t0 === 0 && L.bands.every((b, i) => i === 0 || near(b.t0, L.bands[i - 1].t1)))
  check('each line sits at threshold × par',
    near(L.bands[0].t1, T.S * PAR) && near(L.bands[1].t1, T.A * PAR) && near(L.bands[2].t1, T.B * PAR) && near(L.bands[3].t1, T.C * PAR))
  check('D is open-ended', L.bands[4].t1 === Infinity)
  check('the C/D line is par itself (C === 1.0, economy gate)', near(L.slowT, PAR))
  // The bar's letter and gradeRun's letter agree at every second — the one thing that must never drift.
  let agree = true
  for (let e = 0; e <= 1.3 * PAR; e += 0.25) {
    const f = rankTimerFrame(L, e, e - 0.25)
    if (f.letter !== gradeRun(e, PAR, T).letter) { agree = false; break }
  }
  check('band under the pointer === gradeRun letter at every quarter-second', agree)
  // Frozen thresholds, not the day-1 default: a tighter late-day contract moves the lines.
  const tight = { S: 0.70, A: 0.74, B: 0.78, C: 1.00 }
  const Lt = rankTimerLayout(PAR, tight, null)
  check('uses the thresholds handed in (frozen at accept), not the default', near(Lt.bands[0].t1, 0.70 * PAR) && near(Lt.bands[2].t1, 0.78 * PAR))
  check('degenerate par → null layout', rankTimerLayout(0, T) === null && rankTimerLayout(NaN, T) === null && rankTimerLayout(-5, T) === null)
  check('missing thresholds → null layout', rankTimerLayout(PAR, null) === null)
  check('null layout → calm frame', rankTimerFrame(null, 10, 9).intensity === 0 && rankTimerFrame(null, 10, 9).next === null)
}

// ── 2. the gate marks where that letter lapses ───────────────────────────────────────────────
{
  for (const g of ['S', 'A', 'B', 'C']) {
    const L = rankTimerLayout(PAR, T, g)
    check(`gate ${g} sits at the ${g} band's end`, near(L.gateT, T[g] * PAR))
    // Just before the line the letter still earns the bonus; just after it does not.
    const before = gradeRun(L.gateT - 0.01, PAR, T).letter, after = gradeRun(L.gateT + 0.01, PAR, T).letter
    check(`gate ${g}: bonus earned just before the marker, lost just after (bonusEarned)`, bonusEarned(before, g) && !bonusEarned(after, g))
  }
  check('no gate → no marker', rankTimerLayout(PAR, T, null).gateT === null && rankTimerLayout(PAR, T).gateT === null)
  check('D is never a gate → no marker', rankTimerLayout(PAR, T, 'D').gateT === null)
}

// ── 3. calm → flashy near the edge, nowhere else ─────────────────────────────────────────────
{
  const L = rankTimerLayout(PAR, T, 'S')
  const sLine = T.S * PAR
  check('intensity is exactly 0 beyond escalateS from the next line',
    rankTimerFrame(L, sLine - P.escalateS - 0.01, 0).intensity === 0 && rankTimerFrame(L, 0, 0).intensity === 0)
  let mono = true, prev = -1
  for (let e = sLine - P.escalateS; e <= sLine; e += 0.1) {
    const i = rankTimerFrame(L, e, e - 0.1).intensity
    if (i < prev - 1e-12 || i < 0 || i > 1) { mono = false; break }
    prev = i
  }
  check('intensity ramps monotonically 0 → 1 over the last escalateS seconds', mono && near(prev, 1, 1e-6))
  check('on the line, intensity is 1', near(rankTimerFrame(L, sLine, sLine - 0.1).intensity, 1))
  // Day-1 A and B bands are 0.04 × par = 7.2 s wide, inside the window: past the S line the bar
  // is already sweating the A/B line (lightly — see 5).
  const justPast = rankTimerFrame(L, sLine + 0.1, sLine)
  check('past the S line the next line is A→B and the ramp restarts against it',
    justPast.next.letter === 'B' && near(justPast.intensity, 1 - (T.A * PAR - (sLine + 0.1)) / P.escalateS))
  check('in D nothing is ahead and the bar is calm',
    rankTimerFrame(L, PAR + 5, PAR + 4.9).next === null && rankTimerFrame(L, PAR + 5, PAR + 4.9).intensity === 0
    && rankTimerFrame(L, 10 * PAR, 10 * PAR - 1).letter === 'D')
}

// ── 3b. not on screen until it matters (owner, 2026-10-01) ───────────────────────────────────
{
  const L = rankTimerLayout(PAR, T, 'S')
  const sLine = T.S * PAR
  check('hidden at the start of the job', !rankTimerFrame(L, 0, 0).shown)
  check('hidden just further than appearS from the S/A line', !rankTimerFrame(L, sLine - P.appearS - 0.01, 0).shown)
  check('shown exactly appearS before the S/A line', rankTimerFrame(L, sLine - P.appearS, 0).shown)
  check('…and stays shown through A, C and D to the end of the job',
    rankTimerFrame(L, sLine + 1, sLine).shown && rankTimerFrame(L, PAR - 1, PAR - 2).shown && rankTimerFrame(L, 3 * PAR, 3 * PAR - 1).shown)
  check('a job whose S band is shorter than appearS shows from the start', rankTimerFrame(rankTimerLayout(15, T, null), 0, 0).shown)
  check('appearS is inside what the view shows ahead (the line is on screen the moment the bar pops)',
    P.appearS <= (1 - P.pointerFrac) * P.viewW / P.pxPerS)
  // Owner, 2026-10-01: the targets are A–D, so from the moment the bar pops they hold at least
  // half of it — the S band (what is behind the pointer + appearS ahead) is at most half the view.
  check('at the pop the S band is at most HALF the view (A–D get the rest)',
    P.pointerFrac * P.viewW + P.appearS * P.pxPerS <= P.viewW / 2 + 1e-9)
  check('the day-1 A and B bands are real targets, not slivers (≥ 40 px each)', 0.04 * PAR * P.pxPerS >= 40)
}

// ── 4. the beats fire once, on the crossing step ─────────────────────────────────────────────
{
  const L = rankTimerLayout(PAR, T, 'A')
  for (const dt of [1 / 60, 0.25, 3]) {
    let lost = 0, slow = 0, prev = 0
    for (let e = dt; e <= 1.5 * PAR; e += dt) {
      const f = rankTimerFrame(L, e, prev)
      lost += f.lost ? 1 : 0; slow += f.slow ? 1 : 0
      prev = e
    }
    check(`sweep at dt=${dt}s: "bonus lost" fires exactly once`, lost === 1, `fired ${lost}×`)
    check(`sweep at dt=${dt}s: "too slow" fires exactly once`, slow === 1, `fired ${slow}×`)
  }
  const f0 = rankTimerFrame(L, L.gateT + 1, L.gateT + 1)
  check('a standing clock (prev === elapsed) never fires a beat', !f0.lost && !f0.slow)
  const fx = rankTimerFrame(L, L.gateT, L.gateT - 0.1)
  check('landing exactly on the line is NOT a crossing — on the line is still the better letter (gradeRun <=)', !fx.lost && fx.letter === 'A')
  const fy = rankTimerFrame(L, L.gateT + 1e-9, L.gateT)
  check('…and the first step past it is', fy.lost && fy.letter === 'B')
  const Lno = rankTimerLayout(PAR, T, null)
  let lostNo = 0
  for (let e = 1; e <= 1.5 * PAR; e += 1) lostNo += rankTimerFrame(Lno, e, e - 1).lost ? 1 : 0
  check('no gate → "bonus lost" never fires', lostNo === 0)
  // Gate C coincides with the C/D line: both beats fire on the same step (the driver shows one
  // word; "bonus lost" wins — see main.js).
  const Lc = rankTimerLayout(PAR, T, 'C')
  const fc = rankTimerFrame(Lc, PAR + 0.01, PAR)
  check('gate C: the bonus and the slow beat land on the same step', fc.lost && fc.slow)
}

// ── 5. heavy lines ───────────────────────────────────────────────────────────────────────────
{
  const L = rankTimerLayout(PAR, T, 'B')
  const at = (e) => rankTimerFrame(L, e, e - 0.1)
  check('the S/A line is light when the gate is B', !at(T.S * PAR - 1).heavy)
  check('the A/B line is light when the gate is B', !at(T.A * PAR - 1).heavy)
  check('the B/C line is HEAVY — it is the gate', at(T.B * PAR - 1).heavy)
  check('the C/D line is HEAVY always', at(PAR - 1).heavy && rankTimerFrame(rankTimerLayout(PAR, T, null), PAR - 1, PAR - 1.1).heavy)
  const Ls = rankTimerLayout(PAR, T, 'S')
  check('the S/A line is HEAVY when the gate is S', rankTimerFrame(Ls, T.S * PAR - 1, T.S * PAR - 1.1).heavy)
}

// ── 6. no digits on the surface; 7. pure module ──────────────────────────────────────────────
{
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  const start = main.indexOf('function _rankTimerSource')
  const end = main.indexOf('// FEAT-46: the mission panel', start)
  check('the rank timer driver exists in main.js', start > 0 && end > start)
  const block = main.slice(start, end)
  check('the driver never calls formatTime (no m:ss on the bar)', !/formatTime\s*\(/.test(block))
  check('the driver never renders seconds as text (no toFixed/Math.round/`remaining` into textContent/innerHTML)',
    !/(textContent|innerHTML)\s*=\s*[^\n]*(toFixed|Math\.round|Math\.floor|remaining|elapsed|\bpar\b)/.test(block))
  check('the driver is called from the frame loop', /_updateRankTimer\(\)\s*\n/.test(main.slice(end)))
  check('a letter change breaks the old letter and slams the new one (RANK: readout)',
    /_rtBreakLetter\(old\)/.test(block) && /rt-slam/.test(block) && /rt-shard/.test(block))
  check('the driver gates the DOM on the module\'s `shown` (no second appear rule)', /f\.shown/.test(block) && !/appearS/.test(block.replace(/\/\/[^\n]*/g, '')))
  const mod = readFileSync(new URL('../src/rank-timer.js', import.meta.url), 'utf8')
  check('rank-timer.js imports nothing', !/^\s*import\s/m.test(mod))
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  check('the pointer fraction and view width in index.html match RANK_TIMER_PARAMS', (() => {
    const view = /#rank-timer \.rt-view\s*{[^}]*width:\s*(\d+)px/.exec(html)
    const ptr = /#rank-timer \.rt-pointer\s*{[^}]*left:\s*([\d.]+)%/.exec(html)
    return view && +view[1] === P.viewW && ptr && near(+ptr[1] / 100, P.pointerFrac, 1e-3)
  })())
  // Owner, 2026-10-01: no tick marks on the strip — they don't line up with the transitions and
  // distract from the moment. The only lines are the band edges.
  check('no tick gradient rides the strip', !/#rank-timer \.rt-strip::after/.test(html) && !/repeating-linear-gradient[^;]*#rank-timer/.test(html))
  check('the pulse is one deterministic oscillator (no Math.random in the driver)', !/Math\.random/.test(block) && /_rtPhase \+=/.test(block))
  // Owner, 2026-10-02: the card does not shake — nothing in the driver writes a transform, and the
  // pulse drives a heartbeat on its peaks.
  check('the card never shakes (no inline transform written by the driver)', !/style\.transform\s*=/.test(block.replace(/E\.strip\.style\.transform/g, '')))
  check('the pulse peaks fire the heartbeat', /playHeartbeat\(/.test(block))
  check('the oscillator tops out at 140 bpm, a heartbeat not a buzz', near(P.pulseHzMax * 60, 140, 1e-9) && P.pulseHzMin < P.pulseHzMax)
}

console.log(fails === 0 ? '\nrank-timer gate: ALL OK' : `\nrank-timer gate: ${fails} FAILURE(S)`)
process.exit(fails === 0 ? 0 : 1)
