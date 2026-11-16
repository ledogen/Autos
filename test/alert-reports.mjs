// FEAT-216 / DEC-327: the machine-word rules in src/alerts.js — criticals persist, oil/filter words at 50/40/30, 10 % re-reports.
import assert from 'node:assert/strict'
import { wordAction, stepOf, wearLevel, AlertCycle } from '../src/alerts.js'

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
console.log('alert-reports: ok')
