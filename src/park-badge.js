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
// "D-pad ↑" → "D↑". Space is the binding table's ' '.
const PAD_CAP = new Map(BINDINGS.map(b => [b.key.toLowerCase(), b.pad.replace(/ \(.*\)$/, '').replace('D-pad ', 'D')]))
PAD_CAP.set('space', PAD_CAP.get(' '))

/** A key hint, drawn as a small keycap that reads the pad's button while the pad drives. */
export function keycap (label) {
  const pad = PAD_CAP.get(label.toLowerCase())
  return pad
    ? `<span class="keycap"><span class="kc-kb">${label}</span><span class="kc-pad">${pad}</span></span>`
    : `<span class="keycap">${label}</span>`
}

/** PARK and the handbrake's key. Read as "park first". */
export const PARK_BADGE = `<span class="park-badge" aria-label="park">PARK${keycap('Space')}</span>`

/** A "park to …" line: the badge says the "park", so a leading "park" in the text is dropped. */
export function parkPrompt (text) {
  const rest = text.replace(/^park /, '')
  return `${PARK_BADGE}${rest === text ? '&middot; ' : ''}${rest}`
}
