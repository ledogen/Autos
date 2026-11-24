/**
 * FEAT-90: the "park to …" prompt and the keycap every key hint is drawn with. ONE owner for the markup,
 * so every "park to …" prompt reads the same (owner, 2026-09-29: "we should start using this
 * … everywhere possible to essentially say you are not parked"). The CSS (.keycap / .kc-kb / .kc-pad)
 * lives in index.html beside the other HUD styles.
 *
 * A park prompt is the word park and the key that parks, in line like every other key hint ("park [Space]
 * to sleep …"; FEAT-322, owner 2026-11-20 — it was a blue PARK badge, before that a blue P road sign).
 *
 * A keycap carries BOTH labels — the key and its pad button, looked up in gamepad.js's BINDINGS — and
 * CSS shows whichever device last drove (body.pad-on, set by gamepad.js). So every prompt flips
 * between keyboard and controller with no per-prompt code (owner, 2026-10-20).
 *
 * Plain HTML strings, because every caller writes a prompt with innerHTML. Only static text ever
 * goes through these, never player- or world-supplied strings.
 */

import { BINDINGS, padOf } from './gamepad.js'

// key (lower case) → the pad's short name for it, as a keycap reads: "◂ Back (tap)" → "◂ Back",
// "B (hold, ↑/↓, release)" → "B". Space is the binding table's ' '. Looked up at each call, in the chosen pad
// layout (DEC-431: Ventura Highway's handbrake reads A); the last row for a key wins.
const padCap = (k) => { const b = BINDINGS.findLast(b => b.key.toLowerCase() === (k === 'space' ? ' ' : k)); return b && padOf(b).replace(/ \(.*\)$/, '') }

// Face buttons and stick clicks are drawn round, as they are on the pad (owner, 2026-10-21): A / B /
// X / Y in a circle, a stick as L or R in a circle. Bumpers, triggers, Start and View stay keycaps.
const STICK = { 'left stick': 'L', 'right stick': 'R', 'left stick click': 'L', 'right stick click': 'R' }
function padLabel (pad) {
  const combo = /^([ABXY]|RB) \+ (.+)$/.exec(pad)   // FEAT-195: "B + ↑" — hold the button (RB in Ventura Highway), press the other
  if (combo) return `${padLabel(combo[1])}<span class="kc-pad">+${combo[2]}</span>`
  const round = /^[ABXY]$/.test(pad) ? pad : STICK[pad]
  return round ? `<span class="kc-pad kc-round">${round}</span>` : `<span class="kc-pad">${pad}</span>`
}

/** A key hint, drawn as a small keycap that reads the pad's button while the pad drives. `label` may be
 *  a number: the inventory's quick-slot keys 1–4. `pad` overrides the binding table's button where the
 *  moment rebinds it (FEAT-170: in the opening View is the skip, so R's pad half is the D-pad alone);
 *  `false` is a key the pad has no button for (the quick slots): it hides while the pad drives. */
export function keycap (label, pad = padCap(String(label).toLowerCase())) {
  if (pad === false) return `<span class="keycap kc-kb">${label}</span>`   // keyboard-only: hidden while the pad drives
  return pad
    ? `<span class="keycap"><span class="kc-kb">${label}</span>${padLabel(pad)}</span>`
    : `<span class="keycap">${label}</span>`
}

/** A card's back button (owner, 2026-10-21): clickable, and it shows the key that does the same — Esc
 *  on the keyboard, B on the pad. Replaces the corner ×, which reads as mouse-only. The card's click
 *  handler answers its data-act="close". */
export const BACK_BUTTON = `<div class="card-foot"><button class="card-back" data-act="close">${keycap('Esc')}back</button></div>`

/** "Park first": pulse the park zone's PARK stencil (index.html .pz-badge.hint) — what V and Tab do
 *  while driving. Restarts a pulse already in flight: drop the class, force a reflow, re-add. */
export function hintPark () {
  const b = document.querySelector('#park-zone .pz-badge')
  if (!b) return
  b.classList.remove('hint')
  void b.offsetWidth
  b.classList.add('hint')
}

/** A "park to …" line: "park", the handbrake's key, then the rest of the text ("park [Space] to pay"). A text that
 *  does not start with "park" gets "park [Space] · " in front. A function call per prompt: the pad's half follows the
 *  layout (DEC-431). */
export function parkPrompt (text) {
  const rest = text.replace(/^park /, '')
  return `park ${keycap('Space')} ${rest === text ? '&middot; ' : ''}${rest}`
}

/**
 * FEAT-327: put a hover card (position: fixed, a body child) beside the pointer, kept on screen. Under Big's zoom
 * (FEAT-248) the card's left/top are zoomed too and offsetWidth is not in screen pixels, so the old
 * `clientY + 14, innerHeight - offsetHeight - 8` clamp landed off the bottom (owner 2026-11-23: rear spring / damper tip).
 * Measure the card on screen (getBoundingClientRect), clamp in screen pixels, then divide by the zoom to write left/top.
 */
export function placeTip (tip, e) {
  const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom')) || 1
  const r = tip.getBoundingClientRect()
  tip.style.left = Math.max(0, Math.min(e.clientX + 16, window.innerWidth - r.width - 8)) / z + 'px'
  tip.style.top = Math.max(0, Math.min(e.clientY + 14, window.innerHeight - r.height - 8)) / z + 'px'
}
