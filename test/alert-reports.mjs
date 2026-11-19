// FEAT-216 / DEC-327: the machine-word rules in src/alerts.js — criticals persist, oil/filter words at 50/40/30, 10 % re-reports.
import assert from 'node:assert/strict'
import { wordAction, stepOf, wearLevel, engineLevel, AlertCycle, pollWords } from '../src/alerts.js'

// oil / air filter: dirty at 50 %, again at 40 %, very dirty at 30 % and every 10 % below
assert.deepEqual([0.6, 0.5, 0.4, 0.31, 0.3, 0.2, 0.1].map(wearLevel), [0, 1, 1, 1, 2, 2, 2])
const reports = []   // walk the condition down in 1 % steps, collect (percent, level) at each 'show'
let prev = 0, prevStep = stepOf(1)
for (let p = 100; p >= 0; p--) {
  const c = p / 100, l = wearLevel(c), s = stepOf(c)
  if (wordAction(prev, l, s, prevStep, false) === 'show') reports.push([p, l])
  prev = l; prevStep = s
}
assert.deepEqual(reports, [[50, 1], [40, 1], [30, 2], [20, 2], [10, 2], [0, 2]])

// a non-critical re-reports once per further 10 %, and not on a rise
assert.equal(wordAction(1, 1, 8, 9, false), 'show')
assert.equal(wordAction(1, 1, 9, 9, false), 'none')
assert.equal(wordAction(1, 1, 9, 8, false), 'none')
assert.equal(wordAction(1, 0, 10, 9, false), 'close')
// a critical is never closed by a worse/same poll, and swaps text when its level changes
assert.equal(wordAction(1, 1, 0, 0, true), 'none')
assert.equal(wordAction(1, 2, 0, 0, true), 'show')
assert.equal(wordAction(2, 1, 0, 0, true), 'show')
assert.equal(wordAction(2, 0, 10, 0, true), 'close')

// two criticals held open cycle 2 s each
const a = new AlertCycle()
a.open('w9', 'flat', false); a.open('w10', 'failed', true)
assert.equal(a.tick(0.1).text, 'flat'); assert.equal(a.tick(2).text, 'failed'); assert.equal(a.tick(2).text, 'flat')
// DEC-330: engine knocking from 20 % (inclusive) and seized at 0 are criticals: nothing closes them while true
assert.deepEqual([0.21, 0.2, 0.05, 0].map(c => engineLevel(c, 0.2)), [0, 1, 1, 2])
assert.equal(wordAction(1, 1, 1, 2, true), 'none')   // knocking keeps going down: no re-open, no fade
assert.equal(wordAction(1, 2, 0, 1, true), 'show')   // seized replaces knocking
assert.equal(wordAction(2, 0, 10, 0, true), 'close') // repaired / new run (main.js closes every slot on entry)

// BUG-215: a shop visit swings two wheels' bent level 0/1 many times (preview fit / unfit, cart replay); held, it raises nothing.
const opened = []
const al = { open: (id) => opened.push(id), close () {} }
const st = { levels: null, steps: null }, ex = new Map(), txt = Array.from({ length: 6 }, () => [null, 'bent'])
const poll = (lv, held) => pollWords(al, ex, st, lv, lv.map(() => 9), () => false, txt, 0, 4, held)
poll([0, 0, 0, 0, 0, 0])
for (let k = 0; k < 14; k++) { poll(k % 2 ? [0, 0, 0, 0, 0, 0] : [1, 0, 1, 0, 0, 0], true) }
assert.equal(opened.length, 0)
poll([1, 0, 1, 0, 0, 0], true); poll([0, 0, 0, 0, 0, 0], true)   // closed with the wheels back to the old level: still nothing
poll([0, 0, 0, 0, 0, 0], false); assert.equal(opened.length, 0)
poll([1, 0, 1, 0, 0, 0], false); poll([1, 0, 1, 0, 0, 0], false)  // a real bend after the visit: once per wheel
assert.deepEqual(opened, ['w0', 'w2'])

// BUG-227: free roam (a sound truck, steps 10), then New game rolls a jalopy with a wheel bent to 85 % (step 9). The reset
// on entry nulls the levels only; the first poll of the new truck must take it in, not read it against the old steps.
{
  const opened = [], al = { open: (id) => opened.push(id), close () {} }
  const st = { levels: null, steps: null }, ex = new Map(), txt = [[null, 'bent']]
  pollWords(al, ex, st, [0], [10], () => false, txt, 0, 4)   // free-roam truck, sound
  st.levels = null                                           // main.js _machineWords: the new-run reset
  pollWords(al, ex, st, [1], [9], () => false, txt, 0, 4)    // the jalopy's first poll: its own condition, no alert
  assert.deepEqual(opened, [])
  pollWords(al, ex, st, [1], [8], () => false, txt, 0, 4)    // a real 10 % more after the start still alerts
  assert.deepEqual(opened, ['w0'])
}
console.log('alert-reports: ok')
