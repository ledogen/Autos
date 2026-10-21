// src/menu-nav.js — keyboard + pad navigation of the menus (FEAT-41 / FEAT-125).
//
// ONE code path for both devices: the arrows move a highlight over the visible items of whichever
// menu or card owns the screen — SPATIALLY, to the nearest item that way, so a row of buttons and
// the inventory grid work like a list does (FEAT-133); off the end, ↑/↓ wrap round the list. ←/→
// cycle a ◂ value ▸ selector (or step a range slider) when the highlighted item is one. Enter activates. The pad reaches
// it through gamepad.js's menu key map (D-pad / left stick → arrows, A → Enter, B → Escape), so there
// is no pad-specific menu code at all. Escape is never consumed here: the menus' own Esc handling
// (back / resume / cancel) is the same for both devices already.
//
// The highlight is a class (.nav-focus, drawn like hover), NOT DOM focus: the menu buttons refuse
// focus on purpose, because a focused button turns Space — the brake — into a click. Inputs are the
// exception: highlighting one focuses it so it takes typing.
//
// The menus that count: the pause menu (or the settings page inside it), the story refusal dialog,
// and the main-menu page on the stage. A menu holds the truck (gamepad.js zeroes the pedals).
//
// FEAT-133: the in-game CARDS are navigated the same way — the offer / result cards, the paper
// route, the scenario finish, camp, the fuel recovery card, and the inventory and damage screens.
// A card does NOT hold the truck: the pad keeps driving, and only its A / X / B / D-pad change role
// (gamepad.js CARD_KEYS). A dialogue card on top owns every key ("press any key"), so no card
// counts while one is showing.

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

/** FEAT-133: the live in-game card, or null. Screens first: the camp card opens the inventory over itself. */
function cardContainer () {
  if ($('dialogue-panel')?.style.display === 'block') return null
  for (const id of ['inv-screen', 'dmg-screen']) { const el = $(id); if (el?.classList.contains('open')) return el }
  for (const id of ['camp-panel', 'mission-panel', 'paper-panel', 'scenario-panel', 'recovery-card']) {
    const el = $(id)
    if (el?.style.display === 'block') return el
  }
  return null
}

const ITEMS = 'button, input, .inv-slot[data-slot], .inv-slot[data-packslot]'   // the inventory's slots are divs

let cur = null   // the highlighted item
// FEAT-133: where it was, so a card that re-renders its innerHTML (the inventory, on every change)
// keeps the highlight's place instead of starting over: the old node is DETACHED, not hidden.
let curIdx = -1, curBox = null

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
  if (cur && cur.isConnected && cur.offsetParent === null) highlight(null)
}

/** The nearest item from `from` in direction (dx, dy), off-axis distance weighted ×2; null if none. */
function nearest (items, from, dx, dy) {
  const r = from.getBoundingClientRect(), fx = r.x + r.width / 2, fy = r.y + r.height / 2
  let best = null, bestD = Infinity
  for (const el of items) {
    if (el === from) continue
    const q = el.getBoundingClientRect()
    const ox = q.x + q.width / 2 - fx, oy = q.y + q.height / 2 - fy
    const along = ox * dx + oy * dy
    if (along <= 1) continue
    const d = along + 2 * Math.abs(ox * dy - oy * dx)
    if (d < bestD) { bestD = d; best = el }
  }
  return best
}

function onKey (e) {
  const c = menuContainer() ?? cardContainer()
  if (!c) return
  const typing = document.activeElement?.tagName === 'INPUT' && document.activeElement.type !== 'range'
  if (e.key === 'Escape') { requestAnimationFrame(sync); return }
  // A text field keeps its own ←/→ (caret) and Enter (start).
  if (typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Enter')) return
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) return
  e.preventDefault()
  e.stopPropagation()
  const items = [...c.querySelectorAll(ITEMS)].filter(el => el.offsetParent !== null)
  if (!items.length) return
  if (!items.includes(cur)) {
    // Re-rendered under the highlight (same card, fresh nodes): resume at its index and act on this
    // press. Otherwise the first press only places the highlight.
    if (cur && !cur.isConnected && curBox === c) highlight(items[Math.min(curIdx, items.length - 1)])
    else { highlight(items.includes(document.activeElement) ? document.activeElement : items[0]); curBox = c; curIdx = items.indexOf(cur); return }
  }
  curIdx = items.indexOf(cur)
  if (e.key === 'Enter') {
    cur.click()
    requestAnimationFrame(sync)
    return
  }
  const sel = e.key === 'ArrowLeft' ? cur.querySelector('.sel-prev') : e.key === 'ArrowRight' ? cur.querySelector('.sel-next') : null
  if (sel) { sel.click(); return }
  // A range slider (the camp card's sleep hours) takes ←/→ itself. Done here, not left to the browser:
  // the pad's D-pad arrives as synthetic key events, which never move a native slider (owner,
  // 2026-10-20: the sleep slider would not budge on a pad).
  if (cur.type === 'range' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.key === 'ArrowLeft' ? cur.stepDown() : cur.stepUp()
    cur.dispatchEvent(new Event('input', { bubbles: true }))
    return
  }
  const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
  const next = nearest(items, cur, dx, dy)
  if (next) highlight(next)
  else if (dy) highlight(items[(items.indexOf(cur) + dy + items.length) % items.length])
  curIdx = items.indexOf(cur)
}

/** Install once. gamepad.js asks pad.menuActive() each poll to pick its menu key map. */
export function initMenuNav () {
  window.addEventListener('keydown', onKey, true)   // capture: ahead of the game's own key handlers
  // The mouse and the highlight agree: pointing at an item moves the highlight to it.
  document.addEventListener('pointerover', (e) => {
    const c = menuContainer() ?? cardContainer()
    const el = e.target.closest?.(ITEMS)
    if (c && el && c.contains(el)) highlight(el, false)
  })
  pad.menuActive = () => menuContainer() !== null
  pad.cardActive = () => cardContainer() !== null
}
