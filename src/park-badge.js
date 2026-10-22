/**
 * FEAT-90: the "you are not parked" badge and the keycap it is shown with. ONE owner for the markup,
 * so every "park to …" prompt draws the same mark (owner, 2026-09-29: "we should start using this
 * … everywhere possible to essentially say you are not parked"). The CSS (.park-badge / .keycap /
 * .kc-kb / .kc-pad) lives in index.html beside the other HUD styles.
 *
 * The badge is the word PARK and the key that parks (owner, 2026-10-20 — it was a blue P road sign,
 * which never read as "pull the handbrake").
 *
 * A keycap carries BOTH labels — the key and its pad button, looked up in gamepad.js's BINDINGS — and
 * CSS shows whichever device last drove (body.pad-on, set by gamepad.js). So every prompt flips
 * between keyboard and controller with no per-prompt code (owner, 2026-10-20).
 *
 * Plain HTML strings, because every caller writes a prompt with innerHTML. Only static text ever
 * goes through these, never player- or world-supplied strings.
 */

import { BINDINGS } from './gamepad.js'

// key (lower case) → the pad's short name for it, as a keycap reads: "View (tap)" → "View",
// "B (hold, ↑/↓, release)" → "B". Space is the binding table's ' '.
const PAD_CAP = new Map(BINDINGS.map(b => [b.key.toLowerCase(), b.pad.replace(/ \(.*\)$/, '')]))
PAD_CAP.set('space', PAD_CAP.get(' '))

// Face buttons and stick clicks are drawn round, as they are on the pad (owner, 2026-10-21): A / B /
// X / Y in a circle, a stick as L or R in a circle. Bumpers, triggers, Start and View stay keycaps.
const STICK = { 'left stick': 'L', 'right stick': 'R', 'left stick click': 'L', 'right stick click': 'R' }
function padLabel (pad) {
  const round = /^[ABXY]$/.test(pad) ? pad : STICK[pad]
  return round ? `<span class="kc-pad kc-round">${round}</span>` : `<span class="kc-pad">${pad}</span>`
}

/** A key hint, drawn as a small keycap that reads the pad's button while the pad drives. `label` may be
 *  a number: the inventory's quick-slot keys 1–4. */
export function keycap (label) {
  const pad = PAD_CAP.get(String(label).toLowerCase())
  return pad
    ? `<span class="keycap"><span class="kc-kb">${label}</span>${padLabel(pad)}</span>`
    : `<span class="keycap">${label}</span>`
}

/** A card's back button (owner, 2026-10-21): clickable, and it shows the key that does the same — Esc
 *  on the keyboard, B on the pad. Replaces the corner ×, which reads as mouse-only. The card's click
 *  handler answers its data-act="close". */
export const BACK_BUTTON = `<div class="card-foot"><button class="card-back" data-act="close">${keycap('Esc')}back</button></div>`

/** PARK and the handbrake's key. Read as "park first". */
export const PARK_BADGE = `<span class="park-badge" aria-label="park">PARK${keycap('Space')}</span>`

/** "Park first": pulse the park zone's PARK stencil (index.html .pz-badge.hint) — what V and Tab do
 *  while driving. Restarts a pulse already in flight: drop the class, force a reflow, re-add. */
export function hintPark () {
  const b = document.querySelector('#park-zone .pz-badge')
  if (!b) return
  b.classList.remove('hint')
  void b.offsetWidth
  b.classList.add('hint')
}

/** A "park to …" line: the badge says the "park", so a leading "park" in the text is dropped. */
export function parkPrompt (text) {
  const rest = text.replace(/^park /, '')
  return `${PARK_BADGE}${rest === text ? '&middot; ' : ''}${rest}`
}
