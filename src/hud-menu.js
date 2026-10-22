/**
 * The controller's icon menu (owner, 2026-10-21): hold B and the HUD icon column becomes a menu.
 * D-pad ↑/↓ walks it, releasing B opens the highlighted icon, and a quick tap opens the pre-selected
 * one. gamepad.js drives it through pad.hudMenu (open / move / select / cancel). The keyboard never
 * does: Tab / V / Z / X stay direct.
 *
 * It owns no actions. Every column icon is a .hud-icon whose click handler already does its job, so
 * selecting is a click(). Only what can be used now is on the menu: the park zone's icons drop out
 * while it is locked (unparked, or the brake belongs to a POI), and the cursor wraps round what is
 * left (owner, 2026-10-21). Nothing left → no menu, the PARK stencil pulses instead. The
 * pre-selection is always the top icon, nearest the HOLD Ⓑ prompt (owner, 2026-10-22; was recovery,
 * then camp, then the last pick).
 *
 * Beside the pick, a label names it (its tooltip, minus the "(key)") with an ↑/↓ chevron pair that
 * teaches the D-pad walks it — dropped when there is only one item (owner, 2026-10-21).
 */

import { pad } from './gamepad.js'
import { hintPark } from './park-badge.js'

let sel = null   // the highlighted icon

const label = document.createElement('div')
label.id = 'hud-menu-label'
label.innerHTML = '<span></span><svg viewBox="0 0 10 18"><path d="M2,6 5,3 8,6 M2,12 5,15 8,12"/></svg>'
document.body.appendChild(label)

/** The column's usable icons, top to bottom as drawn (CSS `order` puts inventory first). */
const items = () => [...document.querySelectorAll('#hud-icons .hud-icon')]
  .filter(el => el.offsetParent !== null && !el.closest('#park-zone.locked'))
  .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)

function mark (el) {
  sel?.classList.remove('menu-sel')
  sel = el
  if (!el) return
  el.classList.add('menu-sel')
  const r = el.getBoundingClientRect()
  label.firstChild.textContent = el.title.replace(/ \(.*\)$/, '')
  label.style.left = `${r.left - 12}px`
  label.style.top = `${r.top + r.height / 2}px`
}

function close () {
  mark(null)
  document.body.classList.remove('hud-menu-on')
}

pad.hudMenu = {
  open () {
    const list = items()
    if (!list.length) { hintPark(); return }
    label.classList.toggle('solo', list.length < 2)
    mark(list[0])
    document.body.classList.add('hud-menu-on')
  },
  move (d) {
    const list = items(), i = list.indexOf(sel)
    if (i >= 0) mark(list[(i + d + list.length) % list.length])
    else if (list.length) mark(list[0])   // the pick dropped out under the hold (the zone locked)
  },
  select () {
    const el = sel
    close()
    if (el && items().includes(el)) el.click()   // not if it locked under the hold
  },
  cancel: close,
}
