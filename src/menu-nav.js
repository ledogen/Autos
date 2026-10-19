// src/menu-nav.js — keyboard + pad navigation of the menus (FEAT-41 / FEAT-125).
//
// ONE code path for both devices: ↑/↓ move a highlight over the visible buttons and inputs of
// whichever menu owns the screen, ←/→ cycle a ◂ value ▸ selector, Enter activates. The pad reaches
// it through gamepad.js's menu key map (D-pad / left stick → arrows, A → Enter, B → Escape), so there
// is no pad-specific menu code at all. Escape is never consumed here: the menus' own Esc handling
// (back / resume / cancel) is the same for both devices already.
//
// The highlight is a class (.nav-focus, drawn like hover), NOT DOM focus: the menu buttons refuse
// focus on purpose, because a focused button turns Space — the brake — into a click. Inputs are the
// exception: highlighting one focuses it so it takes typing.
//
// The menus that count: the pause menu (or the settings page inside it), the story refusal dialog,
// and the main-menu page on the stage. In-game screens (map, inventory, offer board) are not menus.

import { pad } from './gamepad.js'

const $ = (id) => document.getElementById(id)

/** The element holding the live menu's items, or null when no menu owns the screen. */
function menuContainer () {
  const pm = $('pause-menu')
  if (pm?.style.display === 'flex') return pm.classList.contains('settings') ? $('mm-settings-panel') : pm
  const ss = $('story-seed-modal')
  if (ss?.style.display === 'flex') return ss
  const mm = $('main-menu')
  if (mm && mm.style.display !== 'none' && document.body.classList.contains('stage-on')) {
    for (const page of ['setup', 'settings', 'scenarios']) if (mm.classList.contains(page)) return $(`mm-${page}-panel`)
    return $('mm-root')
  }
  return null
}

let cur = null   // the highlighted item

/** Move the highlight. `focus` (keys) also hands typing to an input; the mouse only moves the class. */
function highlight (el, focus = true) {
  cur?.classList.remove('nav-focus')
  if (focus && cur?.tagName === 'INPUT' && cur !== el) cur.blur()
  cur = el
  if (!el) return
  el.classList.add('nav-focus')
  if (focus && el.tagName === 'INPUT') el.focus()
  if (focus) el.scrollIntoView?.({ block: 'nearest' })
}

/** Drop a highlight left on an item that is no longer showing (its page closed). */
function sync () {
  if (cur && cur.offsetParent === null) highlight(null)
}

function onKey (e) {
  const c = menuContainer()
  if (!c) return
  const typing = document.activeElement?.tagName === 'INPUT'
  if (e.key === 'Escape') { requestAnimationFrame(sync); return }
  // A text field keeps its own ←/→ (caret) and Enter (start).
  if (typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Enter')) return
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) return
  e.preventDefault()
  e.stopPropagation()
  const items = [...c.querySelectorAll('button, input')].filter(el => el.offsetParent !== null)
  if (!items.length) return
  if (!items.includes(cur)) { highlight(items.includes(document.activeElement) ? document.activeElement : items[0]); return }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const i = items.indexOf(cur) + (e.key === 'ArrowDown' ? 1 : -1)
    highlight(items[(i + items.length) % items.length])
  } else if (e.key === 'Enter') {
    cur.click()
    requestAnimationFrame(sync)
  } else {
    cur.querySelector(e.key === 'ArrowLeft' ? '.sel-prev' : '.sel-next')?.click()
  }
}

/** Install once. gamepad.js asks pad.menuActive() each poll to pick its menu key map. */
export function initMenuNav () {
  window.addEventListener('keydown', onKey, true)   // capture: ahead of the game's own key handlers
  // The mouse and the highlight agree: pointing at an item moves the highlight to it.
  document.addEventListener('pointerover', (e) => {
    const c = menuContainer()
    const el = e.target.closest?.('button, input')
    if (c && el && c.contains(el)) highlight(el, false)
  })
  pad.menuActive = () => menuContainer() !== null
}
