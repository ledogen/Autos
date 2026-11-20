// ── GATE: the camp card at speed says whether this is a camping area (FEAT-308, DEC-451) ──────
//
// Above CAMP_PROMPT_KPH the card does not grade a site (no live score at speed), but it does say
// whether the truck is in a camp zone, and ONLY in one does it tell the player to slow down for the
// details. The words are [DEFAULT] (the owner writes copy); the rule is what is asserted:
//   1. campFastLine(true) asks to slow down; campFastLine(false) does not, and says no camping;
//   2. main.js's _campPromptState reads the zone BEFORE its speed return and hands it on as
//      fastZone, and the card's fast line is campFastLine(camp.fastZone) — read from the source,
//      since main.js does not import headless.
import { readFileSync } from 'node:fs'
import { campFastLine } from '../src/camp.js'

let fails = 0
const ok = (c, m) => { if (!c) { fails++; console.log(`  FAIL  ${m}`) } else console.log(`  ok    ${m}`) }

ok(/slow down/.test(campFastLine(true)), `in a zone: "${campFastLine(true)}" asks to slow down`)
ok(!/slow down/.test(campFastLine(false)) && /no camping/.test(campFastLine(false)), `not in a zone: "${campFastLine(false)}" says no camping, no slow-down`)

const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
const fn = src.slice(src.indexOf('function _campPromptState ('), src.indexOf('\n}\n', src.indexOf('function _campPromptState (')))
const iZone = fn.indexOf('campSystem.zoneAt('), iFast = fn.indexOf('return { fast: true, fastZone: zone }')
ok(iZone > 0 && iFast > iZone, '_campPromptState reads the zone, then returns { fast, fastZone } above the prompt speed')
ok(/camp\.fast\s*\?\s*campFastLine\(camp\.fastZone\)/.test(src), 'the card\'s fast line is campFastLine(camp.fastZone)')

console.log(fails ? `FAIL (${fails})` : 'PASS')
process.exit(fails ? 1 : 0)
