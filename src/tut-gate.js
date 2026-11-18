// src/tut-gate.js — FEAT-288 P2 (DEC-422, DEC-359): the tutorial's lock and highlight, in ONE place.
//
// "Lock the player out of every action that doesn't teach them a lesson" (owner, 2026-11-18). The STEP is what main.js
// says is on now (initTutGate's `stepOf`): null outside the tutorial, else the dialogue card up (or a step of its own
// between cards). A step is data, read straight off the card in data/dialogue.js:
//   allow  BINDINGS action names (gamepad.js) it unlocks out of LOCKED, plus CSS selectors of the card / screen
//          elements it unlocks (an element matches when it or an ancestor does: '#dmg-screen' frees the whole screen).
//          A step that HAS `allow` locks every other button, slot and row of the in-game cards (ZONES); a step without
//          one leaves the cards free. main.js hands stepFor(): a card's own step, or BETWEEN when no card is up.
//   hi     CSS selectors drawn with .tut-hi (index.html): the control or menu entry the card is about.
// The base lock — every tutorial step — refuses LOCKED; driving, the brake, the key, lights, looking, the map, pause,
// back, the skip hold and the tutorial's reset are never in it, so nothing here can strand the truck.
//
// Enforced at four hooks and nowhere else: keys (a capture-phase listener here; the pad's buttons arrive as synthetic
// keys, gamepad.js sendKey), the B menu (hud-menu.js items()), the card walk (menu-nav.js live()), and clicks (a
// capture-phase listener here; locked elements also get pointer-events: none). A refused action nudges what it hit and
// the card asking for something else: no sound, no alert.
//
// No state of its own: every call reads stepOf(), so a skip, the tutorial's end, a run end or a reload (stepOf() → null)
// unlocks everything on the next look, and the 10 Hz paint wipes its classes (BUG-183). Inactive, every hook is one
// early return.

import { BINDINGS } from './gamepad.js'

/** The actions a tutorial step refuses unless its `allow` names them. */
export const LOCKED = ['inventory', 'damage screen', 'camp', 'recovery', 'abandon job (parked; twice)', 'map: drop / clear the waypoint']
const KEY_ACT = Object.fromEntries(BINDINGS.filter(b => LOCKED.includes(b.action)).map(b => [b.key.replace(/ \(.*\)$/, '').toLowerCase(), b.action]))
/** The HUD icons (and the job's abandon button, and the camp card's inventory button) that ARE those actions: a click or a
 *  B-menu pick of one is the action. */
export const ICON_ACT = { 'inv-icon': 'inventory', 'dmg-icon': 'damage screen', 'camp-icon': 'camp', 'recovery-icon': 'recovery', 'job-cancel': 'abandon job (parked; twice)', 'cp-item': 'inventory' }
/** The in-game cards and the icon column: the only places an element is ever locked (pause, settings, the intro's
 *  play / skip and the run's end are outside them, so they are always live). */
export const ZONES = '#hud-icons, #inv-screen, #dmg-screen, #svc-screen, #camp-panel, #mission-panel, #recovery-card'
const LOCKABLE = 'button, input, .inv-slot, .ds-part, .ds-row, .hud-icon, #job-cancel'
const BACK = '[data-act="close"]'   // a screen's back button (park-badge.js BACK_BUTTON): leaving is always allowed
export const isSelector = (q) => /^[#.[]/.test(q)

let stepOf = () => null

/** FEAT-288 P3a: between cards the shop, the camp / mom's card, the job card and the tow stay free (their lessons are their
 *  own cards'); the inventory and the damage screen do not — left open as a lesson ends, they are not a way to eat the
 *  food or swap the wheels. */
export const BETWEEN = { allow: ['#svc-screen', '#camp-panel', '#mission-panel', '#recovery-card'] }
/** The step for `card` (the dialogue card up, or null): a lesson card is its own step; a press-any-key card locks every
 *  card element under it (the click that turns it must not also press what lies beneath: break camp under Katie's talk,
 *  sleep under mom's), and keeps its `hi`; no card, `between`. */
export const stepFor = (card, between = BETWEEN) => !card ? between : card.allow ? card : { ...card, allow: [] }

/** May the player do `action` (a BINDINGS action name) under step `s`? */
export const allows = (action, s = stepOf()) => !s || !LOCKED.includes(action) || !!s.allow?.includes(action)

/** May the player press `el` under step `s`? */
export function allowsEl (el, s = stepOf()) {
  if (!s) return true
  const act = ICON_ACT[el.id]
  if (act) return allows(act, s)
  if (!s.allow || !el.closest(ZONES)) return true
  return el.matches(BACK) || s.allow.some(q => isSelector(q) && el.closest(q))
}

/** A refused press: `el` (what was hit) and the card asking for something else give a short shake. */
export function refuse (el) {
  const dp = document.getElementById('dialogue-panel')
  for (const n of [el, dp?.style.display === 'block' ? dp : null]) {
    if (!n) continue
    n.classList.remove('tut-nudge'); void n.offsetWidth; n.classList.add('tut-nudge')   // the reflow restarts the animation
  }
}

/** A card that waits for any key owns every key (main.js), so the gate leaves keys to it. */
const cardOwnsKeys = () => { const dp = document.getElementById('dialogue-panel'); return dp?.style.display === 'block' && !dp.classList.contains('dlg-waits') }
const typing = (t) => (t?.tagName === 'INPUT' && t.type !== 'range') || t?.tagName === 'TEXTAREA'

let painted = false
/** Mark .tut-hi / .tut-locked to match the step; clears them when the step goes. */
function paint () {
  const s = stepOf()
  if (!s && !painted) return
  painted = !!s
  const hi = new Set(s?.hi?.flatMap(q => [...document.querySelectorAll(q)]) ?? [])
  const lock = new Set(s ? [...document.querySelectorAll(`:is(${ZONES}) :is(${LOCKABLE}), #job-cancel`)].filter(el => !allowsEl(el, s)) : [])
  for (const [cls, want] of [['tut-hi', hi], ['tut-locked', lock]]) {
    for (const el of document.querySelectorAll('.' + cls)) if (!want.has(el)) el.classList.remove(cls)
    for (const el of want) el.classList.add(cls)
  }
}

/** Install once. `getStep()` → null (no tutorial: nothing locked) or the step ({ allow?, hi? }). */
export function initTutGate (getStep) {
  stepOf = getStep
  window.addEventListener('keydown', (e) => {
    const s = stepOf()
    if (!s) return
    const act = KEY_ACT[e.key.toLowerCase()]
    if (!act || allows(act, s) || typing(e.target) || cardOwnsKeys()) return
    e.preventDefault(); e.stopImmediatePropagation()
    if (!e.repeat) refuse(document.getElementById(Object.keys(ICON_ACT).find(id => ICON_ACT[id] === act)))
  }, true)
  window.addEventListener('click', (e) => {
    const s = stepOf()
    if (!s) return
    const el = e.target.closest?.(LOCKABLE)
    if (!el || allowsEl(el, s)) return
    e.preventDefault(); e.stopImmediatePropagation()
    refuse(el)
  }, true)
  setInterval(paint, 100)   // ponytail: a poll, like menu-nav's; a card that re-renders its rows is re-marked within 100 ms
}
