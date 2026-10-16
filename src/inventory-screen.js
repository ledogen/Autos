/**
 * FEAT-122 — the player's inventory screen, plus its icon in the right-hand HUD column.
 *
 * Owner rulings (2026-10-16) that shape it:
 *   - Tab or a click on the icon opens it anywhere (I is the ignition). The clock keeps running on
 *     the road; at camp it is held, for free, by the frame loop's `_campUi` gate (main.js), and the
 *     camp menu's "inventory" button opens this same screen.
 *   - Keys 1–4 use the item bound to that quick slot, open or closed. The binding is shown on the
 *     row as a keycap.
 *   - Counts may show (×3, "5 of 8 slots"); mass and effects never do (SM-INV-10).
 *   - A grant that doesn't fit shows here first as the swap prompt: drop something, then take it,
 *     or leave it.
 *
 * Layout follows damage-screen.js (one class, own CSS, own DOM). Reads/writes only the
 * InventorySystem and the DOM.
 */

import { keycap } from './park-badge.js'

const CSS = `
#inv-screen { display: none; position: fixed; inset: 0; z-index: 95; background: rgba(6,8,10,0.45);
  align-items: center; justify-content: center; font-family: monospace; color: #e6ecf2; }
#inv-screen.open { display: flex; }
#inv-screen .is-card { background: rgba(14,17,20,0.92); border: 1px solid #3a4450; border-radius: 8px;
  padding: 12px 18px; width: 340px; max-height: 80vh; overflow-y: auto; }
#inv-screen .is-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
#inv-screen .is-title { flex: 1; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #9fb3c8; }
#inv-screen .is-slots { font-size: 11px; color: #6f7c88; }
#inv-screen .is-x { width: 24px; height: 24px; border-radius: 50%; border: 1px solid #56616c;
  background: transparent; color: #c8d2dc; font: bold 13px monospace; cursor: pointer; padding: 0; }
#inv-screen .is-pending { padding: 7px 9px; margin-bottom: 8px; border-radius: 4px;
  border: 1px solid #c9a24a; background: rgba(201,162,74,0.10); font-size: 12px; line-height: 1.45; }
#inv-screen .is-row { padding: 6px 8px; margin-bottom: 4px; border-radius: 4px; background: rgba(255,255,255,0.04); }
#inv-screen .ir-top { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #e6ecf2; }
#inv-screen .ir-name { flex: 1; }
#inv-screen .ir-n { color: #9fb3c8; }
#inv-screen .ir-desc { font-size: 11px; line-height: 1.4; color: #9fb3c8; margin: 2px 0 4px; }
#inv-screen .is-empty { font-size: 12px; color: #6f7c88; padding: 8px 2px; }
#inv-screen .is-btn { font: 11px monospace; color: #c8d2dc; background: transparent; border: 1px solid #56616c;
  border-radius: 3px; padding: 2px 8px; cursor: pointer; margin-right: 4px; }
#inv-screen .is-btn:hover:not(:disabled) { border-color: #c8d2dc; }
#inv-screen .is-btn:disabled { opacity: 0.35; cursor: default; }
#inv-screen .keycap { position: static; }
`

// A canvas duffel bag: body, handles, zip line.
const ICON = '<svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="#c8d2dc" stroke-width="2" stroke-linejoin="round">'
  + '<path d="M8,16 h24 a3,3 0 0 1 3,3 v11 a3,3 0 0 1 -3,3 h-24 a3,3 0 0 1 -3,-3 v-11 a3,3 0 0 1 3,-3 z"/>'
  + '<path d="M14,16 v-3 a3,3 0 0 1 3,-3 h6 a3,3 0 0 1 3,3 v3"/>'
  + '<path d="M9,22 h22" stroke-width="1.5"/>'
  + '</svg>'

const btn = (act, label, data = '', disabled = false) =>
  `<button class="is-btn" data-act="${act}" ${data}${disabled ? ' disabled' : ''}>${label}</button>`

export class InventoryScreen {
  /**
   * @param {import('./inventory.js').InventorySystem} inventory
   * @param {() => boolean} [isSuppressed] - true while the menu stage owns the screen (Tab and 1–4
   *   are inert; the dock itself is hidden by index.html's body.stage-on rule).
   */
  constructor (inventory, isSuppressed = () => false) {
    this.inventory = inventory
    this.isSuppressed = isSuppressed
    this.isOpen = false

    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)

    // A row in the right-hand icon column, under the damage and camp rows.
    this.dock = document.createElement('div')
    this.dock.id = 'inv-dock'
    this.dock.className = 'hud-row'
    this.dock.innerHTML = `<div id="inv-icon" class="hud-icon ready" title="inventory (Tab)">${ICON}${keycap('Tab')}</div>`
    ;(document.getElementById('hud-icons') || document.body).appendChild(this.dock)
    this.iconEl = this.dock.querySelector('#inv-icon')
    // mousedown preventDefault keeps focus off: Space is the parking brake (damage-screen.js).
    this.iconEl.addEventListener('mousedown', (e) => e.preventDefault())
    this.iconEl.addEventListener('click', () => this.toggle())

    this.screen = document.createElement('div')
    this.screen.id = 'inv-screen'
    this.screen.innerHTML = '<div class="is-card"></div>'
    document.body.appendChild(this.screen)
    this.card = this.screen.firstChild
    this.screen.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault() })
    this.screen.addEventListener('click', (e) => {
      if (e.target === this.screen) { this.close(); return }
      const b = e.target.closest('button[data-act]')
      if (!b) return
      const inv = this.inventory
      switch (b.dataset.act) {
        case 'close': this.close(); return
        case 'take': inv.takePending(); break
        case 'leave': inv.leavePending(); break
        case 'use': inv.use(b.dataset.id); break
        case 'drop': inv.drop(+b.dataset.i); break
      }
      this.render()
    })

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'Tab') { e.preventDefault(); this.toggle(); return }
      const slot = '1234'.indexOf(e.key)
      if (slot >= 0 && !this.isSuppressed()) this.inventory.useQuick(slot)
    })
  }

  toggle () {
    if (this.isOpen) { this.close(); return }
    if (this.isSuppressed()) return
    this.open()
  }

  open () {
    this.isOpen = true
    this.screen.classList.add('open')
    this.iconEl.classList.add('on')
    this.render()
  }

  close () {
    this.isOpen = false
    this.screen.classList.remove('open')
    this.iconEl.classList.remove('on')
  }

  /** Redraw the card. Cheap; called on open and on every inventory change. */
  render () {
    if (!this.isOpen) return
    const inv = this.inventory
    const p = inv.pending()
    const rows = inv.list()
    const pName = p && inv.nameOf(p.id)
    this.card.innerHTML =
      `<div class="is-head"><span class="is-title">Inventory</span>`
      + `<span class="is-slots">${inv.slotsUsed()} of ${inv.slotCap()} slots</span>`
      + `<button class="is-x" data-act="close" title="close (Tab / Esc)">&times;</button></div>`
      + (p
        ? `<div class="is-pending">No room for <b>${pName}</b>. Drop something to make room.<br>`
          + btn('take', 'take it', '', !inv.fits(p.id, p.n)) + btn('leave', 'leave it') + `</div>`
        : '')
      + (rows.length
        ? rows.map(r => `<div class="is-row"><div class="ir-top">`
            + (r.key ? keycap(r.key) : '')
            + `<span class="ir-name">${r.name}</span>${r.n > 1 ? `<span class="ir-n">&times;${r.n}</span>` : ''}</div>`
            + `<div class="ir-desc">${r.desc}</div>`
            + (r.usable ? btn('use', 'use', `data-id="${r.id}"`) : '')
            + btn('drop', 'drop', `data-i="${r.index}"`)
            + `</div>`).join('')
        : `<div class="is-empty">The truck is empty.</div>`)
  }
}
