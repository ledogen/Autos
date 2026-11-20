// test/tut-gate.mjs — FEAT-288 P2: the tutorial gate's pure logic and its data (src/tut-gate.js, data/dialogue.js).
//
// 1. Every lesson card (`until`) is a step: it carries `allow`; every allow / hi entry is a locked BINDINGS action or a
//    selector whose #ids and data-ids exist (index.html / src, data/items.js).
// 2. The base lock refuses exactly LOCKED — never driving, the brake, the key, lights, the map, pause, back, the reset.
// 3. Elements: a step with `allow` locks the in-game cards' other elements; back always works; pause / settings never lock.
// 3b. P3a's lessons (FEAT-288 P3a): the flat → diagnostics → inventory → spare → tow path, break camp under Katie's talk,
//     eating only the lesson's item, the sleep card's slider, and between cards (BETWEEN) the inventory / damage screen
//     locked while the shop, the camp card, the job card and the tow stay free.
// 3c. P3b's lessons (FEAT-288 P3b): the map beat (the map, Shopping, a waypoint on the station only, the legend, the map
//     shut) and the shop beat (the peanuts only, check out only, leave only); every until is a main.js _UNTIL action.
// 4. Release (BUG-183) and the quest mark (P5): no step → everything allowed, and main.js hands the gate null outside the tutorial and after a
//    run's end (the browser half — nothing marked after a skip — is test/cdp-smoke.mjs's opening step).
// 5. P8's speaker slide (src/dialogue.js cardSlide, DEC-426 Q2): over every played script as framed, the same speaker cycles
//    in place, a change of speaker slides the old card out to the right and the new one in from the left (FEAT-305: one
//    way, every change), the first card enters from the left and the last leaves to the right. (The browser
//    half — the slide on screen, a press mid-slide, reduced motion — is test/cdp-smoke.mjs's opening step.)

import { readFileSync, readdirSync } from 'node:fs'
import { BINDINGS } from '../src/gamepad.js'
import { LOCKED, ICON_ACT, ZONES, BETWEEN, isSelector, allows, allowsEl, stepFor } from '../src/tut-gate.js'
import * as DLG from '../data/dialogue.js'
import { ITEMS } from '../data/items.js'
import { DialogueSystem, cardSlide } from '../src/dialogue.js'

let fails = 0
const ok = (c, msg) => { if (!c) { fails++; console.log('  FAIL ' + msg) } }

// ── 1. data ──
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const src = readdirSync(new URL('../src/', import.meta.url)).filter(f => f.endsWith('.js'))
  .map(f => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8')).join('\n')
const idExists = (id) => html.includes(`id="${id}"`) || new RegExp(`id\\s*[=:]\\s*['"\`]${id}['"\`]|id="${id}"|getElementById\\(['"]${id}['"]\\)`).test(src)
const svcSrc = readFileSync(new URL('../src/service-screen.js', import.meta.url), 'utf8')
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
    // an inventory slot's data-id is an item; a service-screen tree row's is a node of its tree (FEAT-305)
    for (const [, sv, id] of q.matchAll(/(\.sv-line[^\s]*)?\[data-id="(\w+)"\]/g)) ok(sv ? svcSrc.includes(`'${id}'`) : !!ITEMS[id], `${name}: data-id ${id} is ${sv ? 'a service-screen node' : 'an item'}`)
  }
  for (const q of c.hi ?? []) ok(isSelector(q), `${name}: hi '${q}' is a selector`)
  if (c.quest) ok(!!ITEMS[c.quest], `${name}: quest '${c.quest}' is an item`)
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

// ── 3b. P3a's lessons ──
const [diag, spare] = DLG.TUT['tut-damage']
const swap = el('', ['#dmg-screen'], ['button', '.ds-swap'])
ok(allows('damage screen', diag) && !allows('inventory', diag), 'diagnostics card: V (to close it) only, the inventory locked')
ok(allowsEl(el('', ['#dmg-screen'], ['.ds-row']), diag) && allowsEl(el('', ['#dmg-screen'], ['.ds-part']), diag), 'diagnostics card: the rows and the diagram stay live (hover)')
ok(!allowsEl(swap, diag), 'diagnostics card: "Swap two wheels" is locked')
ok(allowsEl(el('', ['#dmg-screen'], ['[data-act="close"]']), diag), 'diagnostics card: back is live')
ok(diag.until === 'diagback' && spare.until === 'spare', 'the damage cards wait for the back, then the spare')
ok(allows('inventory', spare) && !allows('damage screen', spare) && !allows('recovery', spare), 'spare card: the inventory only (no V back into the diagnostics)')
ok(allowsEl(el('', ['#inv-screen'], ['.inv-slot[data-id="spareTire"]']), spare) && !allowsEl(el('', ['#inv-screen'], ['.inv-slot[data-id="packedLunch"]']), spare),
  'spare card: the spare\'s slot is live, the food is not')
ok(allowsEl(el('', ['#dmg-screen', '#dmg-screen.picking'], ['button']), spare) && !allowsEl(swap, spare), 'spare card: the tire picker is live, the plain damage screen is not')
const sleep = DLG.TUT['tut-moms'].at(-1)
ok(sleep.until === 'slept' && /\{alarm\}/.test(sleep.text), "mom's last card waits for the night on the alarm")
for (const id of ['cp-sleep', 'cp-hours', 'cp-sleep-go']) ok(allowsEl(el(id, ['#camp-panel']), sleep), `sleep card: #${id} is live`)
ok(!allowsEl(el('cp-break', ['#camp-panel']), sleep) && !allowsEl(el('cp-item', ['#camp-panel']), sleep), "sleep card: leave and the inventory are locked")
const bfast = DLG.TUT['tut-breakfast'][0]
ok(allowsEl(el('cp-item', ['#camp-panel']), bfast) && allowsEl(el('', ['#inv-screen'], ['.inv-slot[data-id="packedLunch"]']), bfast)
  && !allowsEl(el('', ['#inv-screen'], ['.inv-slot[data-id="bagOfPeanuts"]']), bfast), 'breakfast card: the inventory and a packed lunch only')
// a press-any-key card locks what lies beneath it; a lesson card is its own step; no card is BETWEEN
const talk = stepFor(DLG.TUT['tut-katie'][0])
ok(Array.isArray(talk.allow) && !talk.allow.length && !allowsEl(el('cp-break', ['#camp-panel']), talk), "Katie's talk: break camp is locked under her cards")
ok(!allowsEl(el('cp-sleep', ['#camp-panel']), stepFor(DLG.TUT['tut-moms'][0])), "mom's first cards: sleep is locked under them")
ok(stepFor(camp) === camp && stepFor(null) === BETWEEN, 'stepFor: a lesson card is its own step; no card is BETWEEN')
ok(stepFor({ text: '', hi: ['#x'] }).hi?.[0] === '#x', 'stepFor: a press-any-key card keeps its rings')
ok(!allowsEl(el('cp-item', ['#camp-panel']), BETWEEN) && !allowsEl(el('', ['#inv-screen'], ['.inv-slot[data-id="packedLunch"]']), BETWEEN),
  'between cards: no eating (the camp card\'s inventory button and a slot left open are locked)')
ok(!allowsEl(swap, BETWEEN) && allowsEl(el('', ['#inv-screen'], ['[data-act="close"]']), BETWEEN), 'between cards: the damage screen\'s swap is locked; back is live')
for (const [z, id] of [['#svc-screen', ''], ['#camp-panel', 'cp-break'], ['#camp-panel', 'cp-make'], ['#mission-panel', ''], ['#recovery-card', '']])
  ok(allowsEl(el(id, [z], ['button']), BETWEEN), `between cards: ${z} ${id} stays free`)
ok(!BETWEEN.allow.some(q => !isSelector(q)), 'BETWEEN unlocks no locked action')

// ── 3c. P3b's lessons: Katie's map beat (inside tut-picnic) and her shop beat (tut-shop) ──
const mapBeat = DLG.TUT['tut-picnic'].filter(c => c.until)
ok(mapBeat.map(c => c.until).join() === 'map,shoptab,waypoint,mapshut', `the map beat waits for: the map, Shopping, a waypoint, the map shut (${mapBeat.map(c => c.until)})`)
ok(mapBeat.every(c => c.phone) && mapBeat.at(-1).holds && DLG.TUT['tut-picnic'].at(-1) === mapBeat.at(-1), 'the map beat is inside her call, which holds the line to the store')
ok(mapBeat.every(c => allows('map', c) && allows('back (menus, cards, map)', c)), 'the map beat never locks the map or back')
ok(mapBeat.every(c => allows('map: drop / clear the waypoint', c) === (c.until === 'waypoint')), 'the waypoint: refused on every map card but the waypoint card')
ok(mapBeat.find(c => c.until === 'waypoint').hi.some(q => q.includes('{snack}')), "the waypoint card rings the station's row (main.js fills {snack})")
const [pick, pay, bye] = DLG.TUT['tut-shop']
ok(pick.answered && pick.phone && !bye.holds && [pick, pay, bye].map(c => c.until).join() === 'cart,bought,shopshut',
  'tut-shop: her held call, the cart, the check out, the shop left, then her click')
const nutRow = el('', ['#svc-screen', '#svc-screen [data-item="bagOfPeanuts"]'], ['button'])
const gumRow = el('', ['#svc-screen', '#svc-screen [data-item="gummyWorms"]'], ['button'])
const svc = (act) => el('', ['#svc-screen', `#svc-screen [data-act="${act}"]`], ['button', `[data-act="${act}"]`])
ok(allowsEl(nutRow, pick) && !allowsEl(gumRow, pick) && !allowsEl(svc('checkout'), pick), 'shop card 1: the peanuts row and its add to cart only')
ok(allowsEl(svc('checkout'), pay) && !allowsEl(svc('discard'), pay) && !allowsEl(svc('unqueue'), pay) && !allowsEl(nutRow, pay), 'shop card 2: check out only (no discard, no ×)')
ok(!allowsEl(svc('checkout'), bye) && !allowsEl(nutRow, bye) && allowsEl(el('', ['#svc-screen'], ['[data-act="close"]']), bye), 'shop card 3: leave only')
for (const c of [pick, pay, bye]) ok(['inventory', 'damage screen', 'camp', 'recovery'].every(a => !allows(a, c)), `shop card '${c.until}': the B menu's screens stay locked`)

// Every until a card names is a main.js _UNTIL action; mom's gas call no longer waits on the brake (DEC-422); every waypoint
// drop (N, pad Y, a click) passes the gate.
const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
const untils = new Set([...(mainSrc.match(/const _UNTIL = \{([\s\S]*?)\n\}/)?.[1] ?? '').matchAll(/^  (\w+): /gm)].map(m => m[1]))
for (const [name, c] of cards) if (c.until) ok(untils.has(c.until), `${name}: until '${c.until}' is a main.js _UNTIL action`)
ok(/stop === 'pump' && !serviceScreen\.isOpen\) _tut\('tut-gas'\)/.test(mainSrc), "main.js: mom's gas call fires as the shop closes, not on the brake")
ok(/onWaypoint: \(p\) => [^\n]*_tutWaypointOk\(p\) && _setWaypoint\(p\)/.test(mainSrc), 'main.js: every waypoint drop passes _tutWaypointOk')

// ── 4. release ──
for (const a of actions) ok(allows(a, null), `no step: '${a}' allowed`)
ok(allowsEl(el('cp-break', ['#camp-panel']), null) && allowsEl(el('dmg-icon', ['#hud-icons']), null), 'no step: every element allowed')
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
ok(/const _tutStep = \(\) => !_tutDrive\(\) \|\| _runEnded \|\| !storySystem\.isActive\(\) \? null\s*: stepFor\(/.test(main)
  && /initTutGate\(_tutStep\)/.test(main),
  'main.js: the step is null outside the tutorial (skip, end), after the run\'s end and outside a story run; else stepFor')
// P5: the quest mark is read off that same step every frame (no state of its own), so it goes when the step does.
ok(/function _questMark \(\) \{\n  const id = _tutStep\(\)\?\.quest\n/.test(main) && /_dayStop\(\) === 'pack' \? _TUT_PACK/.test(main),
  'main.js: the quest mark reads _tutStep().quest; the pack is marked while it is the stop')
// The sleep card's value lock is the button's own disabled state, recomputed from the tutorial's state on every sync — so a
// skip, the night's end or a reload (fresh DOM, _firingDay() read off the save) leaves Sleep live.
ok(/go\.disabled = _firingDay\(\) && /.test(main) && !/cp-sleep-go[^\n]*disabled = true/.test(main), 'main.js: Sleep is greyed only while _firingDay() (DEC-426 Q1)')

// ── 5. P8: the speaker slide (FEAT-305: one way, out to the right, in from the left) ──
{ const S = (speaker) => ({ speaker })
  const walk = (cards) => { let prev = null; const out = []
    for (const c of [...cards, null]) { out.push(cardSlide(prev, c)); prev = c }
    return out }
  // Katie, Katie, the manager, then nothing: in from the left; cycle; out right + in left; out right.
  const w = walk([S('Katie'), S('Katie'), S('The manager')])
  ok(w[0].out === 0 && w[0].in === -1, `P8: the first card enters from the left, nothing leaves: ${JSON.stringify(w[0])}`)
  ok(w[1].out === 0 && w[1].in === 0, `P8: the same speaker's next card cycles in place: ${JSON.stringify(w[1])}`)
  ok(w[2].out === 1 && w[2].in === -1, `FEAT-305: a change of speaker: out to the right, in from the left: ${JSON.stringify(w[2])}`)
  ok(w[3].out === 1 && w[3].in === 0, `FEAT-305: the last card leaves to the right: ${JSON.stringify(w[3])}`)
  // Every played script, framed as main.js frames it (DEC-354's ring and <click> cards included): each step obeys the rule.
  const dlg = new DialogueSystem(DLG.PHONE)
  const scripts = [...Object.values(DLG.TUT), ...['FIRING', 'MOM_CALL', 'LARRY_CALL', 'PAYCHECK', 'BOSS_CHECK', 'LARRY_PACK', 'RUN_INTRO', 'PAPER_ROUTE_INTRO'].map(k => DLG[k])]
    .filter(cs => Array.isArray(cs) && cs.length)
  let changes = 0
  for (const cs of scripts) {
    const f = dlg._frame(cs), m = walk(f)
    for (let i = 1; i < f.length; i++) {
      const same = f[i].speaker === f[i - 1].speaker
      if (!same) changes++
      ok(same ? !m[i].out && !m[i].in : m[i].out === 1 && m[i].in === -1,
        `P8: ${f[i - 1].speaker} → ${f[i].speaker} (${same ? 'cycle' : 'slide'}): ${JSON.stringify(m[i])}`)
    }
  }
  ok(changes > 5, `P8: the scripts hold ${changes} changes of speaker (the ring card → the caller counts)`) }

// ── 6. FEAT-305 (tutorial round 5) ──
{ const nav = readFileSync(new URL('../src/menu-nav.js', import.meta.url), 'utf8'), hud = readFileSync(new URL('../src/hud-menu.js', import.meta.url), 'utf8')
  // DEC-443: the highlight and the B menu walk every item; a locked one is refused only when pressed (the click listener)
  ok(/const live = \(c\) => \[\.\.\.c\.querySelectorAll\(ITEMS\)\]\.filter\(el => el\.offsetParent !== null\)\n/.test(nav), 'DEC-443: menu-nav live() fences nothing')
  ok(/if \(!allowsEl\(cur\)\) return/.test(nav), "DEC-443: a locked slider takes no arrow step")
  ok(/^const items = usable$/m.test(hud) && !/refuse/.test(hud), 'DEC-443: the B menu walks every usable icon, and a wrong pick is silent')
  ok(/ \.tut-locked \{ opacity: 0\.35 !important; \}/.test(html) && /input\.tut-locked \{ pointer-events: none/.test(html),
    'DEC-443: a locked element keeps the pointer and the highlight (only a locked slider takes no drag)')
  // DEC-442: no tip after the tutorial — every non-story card is gated on _inTutorial(), and the three that only ever came after it are gone
  ok(/function _tut \(key, cards = TUT\[key\], done = null, always = false\) \{\n  if \(!always && !_inTutorial\(\)\) return\n/.test(main), 'DEC-442: _tut plays only inside the tutorial (or a story beat, `always`)')
  for (const k of ['tut-offer', 'tut-rank', 'tut-sleep']) ok(!(k in DLG.TUT) && !main.includes(`'${k}'`), `DEC-442: the after-the-tutorial tip ${k} is gone`)
  ok(/_tut\('tut-camp', TUT\['tut-camp'\], null, true\)/.test(main), "DEC-442: the camp taking you on is a story beat (`always`)")
  // item 4: a key inside a pad half is the pad's own button (the map's X), never put through the keyboard's keycap
  ok(/if \(!k\.closest\('\.kc-pad'\) && _DLG_PAD_KEYS\.has/.test(main), 'item 4: a pad half\'s dlg-key is not re-read as a keyboard key')
  ok(Object.values(DLG.TUT).flat().every(c => !/>View</.test(c.text)), 'item 6: no card names the pad\'s View')
  // item 11: a press-any card shuts the screens under it; item 12: the lesson's spare fits only the flat corner
  ok(/if \(card && card !== _dlg\.card && !card\.until\) \{ damageScreen\.close\(\); inventoryScreen\.close\(\) \}/.test(main), 'item 11: a card that owns every key shuts the inventory under it')
  ok(/corner: \(c\) => trap \? damageModel\.flat\[c\] : !e\.flat/.test(main), 'item 12: the trap\'s spare is offered the flat corner alone') }

console.log(fails ? `tut-gate: ${fails} FAIL` : `tut-gate: PASS (${steps} steps)`)
process.exit(fails ? 1 : 0)
