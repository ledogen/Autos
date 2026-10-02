/**
 * FEAT-90: the "you are not parked" badge — an orange P in a circle — and the keycap it is shown
 * beside. ONE owner for the markup, so every "park to …" prompt draws the same mark (owner,
 * 2026-09-29: "we should start using this circle everywhere possible to essentially say you are not
 * parked"). The CSS (.park-badge / .keycap) lives in index.html beside the other HUD styles.
 *
 * Plain HTML strings, because every caller writes a prompt with innerHTML. Only static text ever
 * goes through these, never player- or world-supplied strings.
 */

/** The orange P-in-a-circle. Read as "park first". */
export const PARK_BADGE = '<span class="park-badge" aria-label="park">P</span>'

/** A key hint, drawn as a small keycap. */
export function keycap (label) { return `<span class="keycap">${label}</span>` }

/** Prefix a "park to …" line with the badge. */
export function parkPrompt (text) { return `${PARK_BADGE}${text}` }
