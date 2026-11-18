// test/tut-gate.mjs — FEAT-288 P2: the tutorial gate's pure logic and its data (src/tut-gate.js, data/dialogue.js).
//
// 1. Every lesson card (`until`) is a step: it carries `allow`; every allow / hi entry is a locked BINDINGS action or a
//    selector whose #ids and data-ids exist (index.html / src, data/items.js).
// 2. The base lock refuses exactly LOCKED — never driving, the brake, the key, lights, the map, pause, back, the reset.
// 3. Elements: a step with `allow` locks the in-game cards' other elements; back always works; pause / settings never lock.
// 4. Release (BUG-183): no step → everything allowed, and main.js hands the gate null outside the tutorial and after a
//    run's end (the browser half — nothing marked after a skip — is test/cdp-smoke.mjs's opening step).

import { readFileSync, readdirSync } from 'node:fs'
import { BINDINGS } from '../src/gamepad.js'
import { LOCKED, ICON_ACT, ZONES, isSelector, allows, allowsEl } from '../src/tut-gate.js'
import * as DLG from '../data/dialogue.js'
import { ITEMS } from '../data/items.js'

let fails = 0
const ok = (c, msg) => { if (!c) { fails++; console.log('  FAIL ' + msg) } }

// ── 1. data ──
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const src = readdirSync(new URL('../src/', import.meta.url)).filter(f => f.endsWith('.js'))
  .map(f => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8')).join('\n')
const idExists = (id) => html.includes(`id="${id}"`) || new RegExp(`id\\s*[=:]\\s*['"\`]${id}['"\`]|id="${id}"|getElementById\\(['"]${id}['"]\\)`).test(src)
const actions = new Set(BINDINGS.map(b => b.action))
const cards = [...Object.entries(DLG.TUT).flatMap(([k, cs]) => cs.map((c, i) => [`${k}[${i}]`, c])),
  ...['MOM_CALL', 'FIRING', 'LARRY_CALL', 'PAYCHECK', 'BOSS_CHECK', 'LARRY_PACK'].flatMap(k => (DLG[k] ?? []).map((c, i) => [`${k}[${i}]`, c]))]
let steps = 0
for (const [name, c] of cards) {
  if (!c.until && !c.allow && !c.hi) continue
  steps++
  ok(!c.until || Array.isArray(c.allow), `${name}: a lesson card (until '${c.until}') carries allow`)
  for (const q of [...(c.allow ?? []), ...(c.hi ?? [])]) {
    if (!isSelector(q)) { ok(LOCKED.includes(q), `${name}: '${q}' is a locked action`); continue }
    for (const [, id] of q.matchAll(/#([\w-]+)/g)) ok(idExists(id), `${name}: #${id} exists (index.html or src/)`)
    for (const [, id] of q.matchAll(/data-id="(\w+)"/g)) ok(!!ITEMS[id], `${name}: data-id ${id} is an item`)
  }
  for (const q of c.hi ?? []) ok(isSelector(q), `${name}: hi '${q}' is a selector`)
}
ok(steps >= 10, `the existing lesson cards are steps (${steps} found, ≥ 10)`)
for (const a of LOCKED) ok(actions.has(a), `LOCKED '${a}' is a BINDINGS action`)
for (const [id, a] of Object.entries(ICON_ACT)) { ok(LOCKED.includes(a), `icon ${id} → a locked action`); ok(idExists(id), `icon #${id} exists`) }
for (const z of ZONES.split(',').map(s => s.trim().slice(1))) ok(idExists(z), `zone #${z} exists`)

// ── 2. the base lock ──
const BASE = {}
for (const a of LOCKED) ok(!allows(a, BASE), `base lock refuses '${a}'`)
for (const a of ['throttle', 'brake / reverse', 'steer', 'look around', 'handbrake / park (tap)', 'ignition (hold)', 'headlights',
  'pause', 'back (menus, cards, map)', 'map', 'reset truck', 'pump (hold)', 'cards: pick / press', 'pick up / load lost cargo (parked)'])
  ok(actions.has(a) && allows(a, BASE), `base lock never refuses '${a}'`)
const flat = DLG.TUT['tut-flat'][0]
ok(allows('damage screen', flat) && !allows('inventory', flat) && !allows('camp', flat) && !allows('recovery', flat),
  'the flat card opens the damage screen only')

// ── 3. elements (a stand-in: `in` = the zone / ancestors it sits in, `is` = selectors it matches itself) ──
const el = (id, inside = [], is = []) => {
  const all = [...inside, ...is, ...(id ? ['#' + id] : [])]
  const hit = (q) => q.split(/,(?![^(]*\))/).map(s => s.trim()).some(s => all.includes(s))
  return { id, closest: (q) => hit(q) ? {} : null, matches: (q) => q.split(',').map(s => s.trim()).some(s => is.includes(s)) }
}
const camp = DLG.TUT['tut-campmade'][0]
const nuts = el('', ['#inv-screen'], ['.inv-slot[data-id="bagOfPeanuts"]'])
ok(allowsEl(nuts, camp), 'campmade: the peanuts slot is live')
ok(!allowsEl(el('', ['#inv-screen'], ['.inv-slot[data-id="packedLunch"]']), camp), 'campmade: a packed lunch is locked')
ok(!allowsEl(el('cp-break', ['#camp-panel']), camp), 'campmade: break camp is locked')
ok(allowsEl(el('cp-item', ['#camp-panel']), camp), 'campmade: the camp card\'s inventory button is live')
ok(allowsEl(el('', ['#inv-screen'], ['[data-act="close"]']), camp), 'campmade: back is live')
ok(allowsEl(el('pm-resume', ['#pause-menu']), camp), 'pause is never locked')
ok(!allowsEl(el('dmg-icon', ['#hud-icons']), BASE) && allowsEl(el('dmg-icon', ['#hud-icons']), flat), 'the V icon: locked by the base, live on the flat')
ok(!allowsEl(el('camp-icon', ['#hud-icons']), flat) && !allowsEl(el('inv-icon', ['#hud-icons']), flat), 'the flat card: the other B-menu entries are refused')
ok(allowsEl(el('', ['#svc-screen'], ['button']), BASE), 'a step without allow leaves the cards free (the shop)')

// ── 4. release ──
for (const a of actions) ok(allows(a, null), `no step: '${a}' allowed`)
ok(allowsEl(el('cp-break', ['#camp-panel']), null) && allowsEl(el('dmg-icon', ['#hud-icons']), null), 'no step: every element allowed')
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
ok(/initTutGate\(\(\) => !_tutDrive\(\) \|\| _runEnded \|\| !storySystem\.isActive\(\) \? null/.test(main),
  'main.js: the step is null outside the tutorial (skip, end), after the run\'s end and outside a story run')

console.log(fails ? `tut-gate: ${fails} FAIL` : `tut-gate: PASS (${steps} steps)`)
process.exit(fails ? 1 : 0)
