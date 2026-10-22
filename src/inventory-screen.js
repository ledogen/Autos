/**
 * FEAT-122 — the player's inventory screen, its icon in the park zone, and quick keys 1–4.
 *
 * Owner rulings (2026-10-16) that shape it:
 *   - PARKED ONLY, like the damage screen (V). Tab or a click on the icon opens it while the
 *     parking brake is latched; otherwise the press pulses the park zone's PARK badge. Releasing the
 *     brake closes it. `isBlocked` (a POI owns the brake here) keeps it shut, the same as V.
 *     I is the ignition, hence Tab.
 *   - THE PARK ZONE (index.html #park-zone) boxes this icon with the damage icon under the PARK badge.
 *     update() owns its .locked flag. Camp stays outside the zone.
 *   - Keys 1–4 use the item bound to that quick slot ANY time, driving included (items.md §1c).
 *   - The truck's slots are drawn as a grid — every slot, empty ones too — each item as its
 *     rendered thumbnail (assets/items/<id>.png; the name stands in until the art exists).
 *   - Backpacks (items.md §2c): hover a pack to see its slots; click it to open it and pack or
 *     unpack. Counts may show (×3); mass and effects never do (SM-INV-10).
 *   - A grant that doesn't fit shows here first as the swap prompt.
 *   - The clock: runs on the road; held at camp by the frame loop's `_campUi` gate (main.js).
 *
 * Layout follows damage-screen.js (one class, own CSS, own DOM). Reads/writes only the
 * InventorySystem, vehicleState.parked and the DOM.
 */

import { keycap, hintPark, BACK_BUTTON } from './park-badge.js'

const THUMB = (id) => `assets/items/${id}.png`

const CSS = `
#inv-screen { display: none; position: fixed; inset: 0; z-index: 95; background: rgba(6,8,10,0.45);
  align-items: center; justify-content: center; font-family: var(--font); color: var(--text); }
#inv-screen.open { display: flex; }
#inv-screen .is-card { background: rgba(14,17,20,0.92); border: 1px solid var(--line); border-radius: 8px;
  padding: 12px 16px 14px; width: 320px; }
#inv-screen .is-head { margin-bottom: 10px; }
#inv-screen .is-title { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-dim); }
#inv-screen .is-pending { padding: 7px 9px; margin-bottom: 10px; border-radius: 4px;
  border: 1px solid #c9a24a; background: rgba(201,162,74,0.10); font-size: 12px; line-height: 1.5; }
#inv-screen .is-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.inv-slot { position: relative; aspect-ratio: 1; border-radius: 6px; box-sizing: border-box;
  background: rgba(255,255,255,0.04); border: 1px dashed var(--line); }
.inv-slot.full { border: 1px solid var(--line-control); background: rgba(255,255,255,0.07); cursor: pointer; }
.inv-slot.full:hover { border-color: var(--text-body); }
.inv-slot.sel { border-color: var(--text); box-shadow: 0 0 0 2px rgba(230,236,242,0.35); }
.inv-slot.worn { border-color: #c9a24a; }
.inv-slot img { position: absolute; inset: 6%; width: 88%; height: 88%; object-fit: contain; pointer-events: none; }
.inv-slot .sl-name { display: none; position: absolute; inset: 0; align-items: center; justify-content: center;
  text-align: center; font-size: 12px; line-height: 1.2; color: var(--text-body); padding: 3px; pointer-events: none; }
.inv-slot.noimg .sl-name { display: flex; }
.inv-slot .sl-n { position: absolute; right: 3px; bottom: 1px; font-size: 12px; color: var(--text);
  text-shadow: 0 1px 2px #000; pointer-events: none; }
.inv-slot .keycap { position: absolute; left: -5px; top: -6px; margin: 0; font-size: 12px; background: #1b2026; }
#inv-screen .is-strip { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); min-height: 52px; }
#inv-screen .st-name { font-size: 14px; }
#inv-screen .st-tag { font-size: 12px; color: #c9a24a; margin-left: 6px; }
#inv-screen .st-desc { font-size: 12px; line-height: 1.4; color: var(--text-dim); margin: 3px 0 7px; }
#inv-screen .st-pack { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px; }
#inv-screen .st-hint { font-size: 12px; color: var(--text-faint); }
#inv-screen .is-btn { font: 12px var(--font); color: var(--text-body); background: transparent; border: 1px solid var(--line-control);
  border-radius: 3px; padding: 2px 8px; cursor: pointer; margin-right: 4px; }
#inv-screen .is-btn:hover:not(:disabled) { border-color: var(--text-body); }
#inv-screen .is-btn:disabled { opacity: 0.35; cursor: default; }
#inv-tip { display: none; position: fixed; z-index: 96; pointer-events: none; width: 210px;
  background: rgba(10,12,14,0.95); border: 1px solid var(--line); border-radius: 4px; padding: 6px 9px;
  font: 12px/1.45 var(--font); color: var(--text); }
#inv-tip .tp-desc { color: var(--text-dim); font-size: 12px; }
#inv-tip .tp-pack { display: grid; grid-template-columns: repeat(4, 44px); gap: 5px; margin-top: 6px; }
`

// A canvas duffel bag: body, handles, zip line.
const ICON = '<svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="#c8d2dc" stroke-width="2" stroke-linejoin="round">'
  + '<path d="M8,16 h24 a3,3 0 0 1 3,3 v11 a3,3 0 0 1 -3,3 h-24 a3,3 0 0 1 -3,-3 v-11 a3,3 0 0 1 3,-3 z"/>'
  + '<path d="M14,16 v-3 a3,3 0 0 1 3,-3 h6 a3,3 0 0 1 3,3 v3"/>'
  + '<path d="M9,22 h22" stroke-width="1.5"/>'
  + '</svg>'

const btn = (act, label, enabled = true, data = '') =>
  `<button class="is-btn" data-act="${act}" ${data}${enabled ? '' : ' disabled'}>${label}</button>`

/** One slot square. `it` is a catalog row (+ n/key/equipped for truck entries), or null for empty. */
function slotHtml (it, attrs = '', cls = '') {
  if (!it) return `<div class="inv-slot ${cls}" ${attrs}></div>`
  return `<div class="inv-slot full${it.equipped ? ' worn' : ''} ${cls}" ${attrs}>`
    + `<img src="${THUMB(it.id)}" alt="" onerror="this.parentNode.classList.add('noimg'); this.remove()">`
    + `<span class="sl-name">${it.name}</span>`
    + (it.n > 1 ? `<span class="sl-n">&times;${it.n}</span>` : '')
    + (it.key ? keycap(it.key) : '')
    + `</div>`
}

/** A pack's slots: its contents, then empty squares up to packSlots. */
function packSlotsHtml (row, attrsFor = () => '', selSlot = -1) {
  let h = ''
  for (let i = 0; i < row.packSlots; i++) h += slotHtml(row.contents[i] ?? null, attrsFor(i), i === selSlot ? 'sel' : '')
  return h
}

export class InventoryScreen {
  /**
   * @param {import('./inventory.js').InventorySystem} inventory
   * @param {object} vehicleState - read-only; `parked` gates the screen.
   * @param {object} [o]
   * @param {() => boolean} [o.isSuppressed] - the menu stage owns the screen (Tab and 1–4 inert).
   * @param {() => boolean} [o.isBlocked] - the brake belongs to something else here (a POI).
   */
  constructor (inventory, vehicleState, { isSuppressed = () => false, isBlocked = () => false } = {}) {
    this.inventory = inventory
    this.vehicleState = vehicleState
    this.isSuppressed = isSuppressed
    this.isBlocked = isBlocked
    this.isOpen = false
    this.sel = null       // selected truck entry index
    this.packSel = -1     // selected slot inside the selected pack

    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)

    this.zone = document.getElementById('park-zone')
    this.dock = document.createElement('div')
    this.dock.id = 'inv-dock'
    this.dock.className = 'hud-row'
    this.dock.innerHTML = `<div id="inv-icon" class="hud-icon" title="inventory (Tab, parked)">${ICON}${keycap('Tab')}</div>`
    ;(this.zone || document.getElementById('hud-icons') || document.body).appendChild(this.dock)
    this.iconEl = this.dock.querySelector('#inv-icon')
    // mousedown preventDefault keeps focus off: Space is the parking brake (damage-screen.js).
    this.iconEl.addEventListener('mousedown', (e) => e.preventDefault())
    this.iconEl.addEventListener('click', () => this.request())

    this.screen = document.createElement('div')
    this.screen.id = 'inv-screen'
    this.screen.innerHTML = '<div class="is-card"></div>'
    document.body.appendChild(this.screen)
    this.card = this.screen.firstChild
    this.tip = document.createElement('div')
    this.tip.id = 'inv-tip'
    document.body.appendChild(this.tip)

    this.screen.addEventListener('mousedown', (e) => { if (e.target.closest('button, .inv-slot')) e.preventDefault() })
    this.screen.addEventListener('click', (e) => this._onClick(e))
    this.screen.addEventListener('mousemove', (e) => this._onHover(e))
    this.screen.addEventListener('mouseleave', () => { this.tip.style.display = 'none' })

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'Tab') { e.preventDefault(); this.request(); return }
      const slot = '1234'.indexOf(e.key)
      if (slot >= 0 && !this.isSuppressed()) this.inventory.useQuick(slot)
    })
  }

  _locked () { return this.isBlocked() || !this.vehicleState.parked }

  /** Tab, the icon, or the camp button: open while parked, close if open, else hint at the PARK badge. */
  request () {
    if (this.isOpen) { this.close(); return }
    if (this.isSuppressed() || this.isBlocked()) return
    if (!this.vehicleState.parked) { hintPark(); return }
    this.open()
  }

  open () {
    this.isOpen = true
    this.sel = null
    this.packSel = -1
    this.screen.classList.add('open')
    this.iconEl.classList.add('on')
    this.render()
  }

  close () {
    if (!this.isOpen) return
    this.isOpen = false
    this.screen.classList.remove('open')
    this.iconEl.classList.remove('on')
    this.tip.style.display = 'none'
  }

  /** Per frame: the park zone's lock, the icon state, and closing when the truck drives off. */
  update () {
    const locked = this._locked()
    this.zone?.classList.toggle('locked', locked)
    this.iconEl.classList.toggle('ready', !locked)
    if (this.isOpen && (locked || this.isSuppressed())) this.close()
  }

  _onClick (e) {
    if (e.target === this.screen) { this.close(); return }
    const inv = this.inventory
    const b = e.target.closest('button[data-act]')
    const s = e.target.closest('.inv-slot.full')
    if (b) {
      switch (b.dataset.act) {
        case 'close': this.close(); return
        case 'take': inv.takePending(); break
        case 'leave': inv.leavePending(); break
        case 'use': inv.use(inv.list()[this.sel].id); break
        case 'drop': inv.drop(this.sel); this.sel = null; break
        case 'pack': inv.packItem(this.sel); this.sel = null; break
        case 'equip': inv.equip(this.sel); break
        case 'unpack': inv.unpackItem(this.sel, this.packSel); this.packSel = -1; break
      }
    } else if (s?.dataset.slot != null) {
      const i = +s.dataset.slot
      this.sel = this.sel === i ? null : i
      this.packSel = -1
    } else if (s?.dataset.packslot != null) {
      const i = +s.dataset.packslot
      this.packSel = this.packSel === i ? -1 : i
    } else return
    this.render()
  }

  _onHover (e) {
    const s = e.target.closest('.inv-slot.full[data-slot]')
    const row = s && this.inventory.list()[+s.dataset.slot]
    if (!row) { this.tip.style.display = 'none'; return }
    if (this.tip.dataset.for !== s.dataset.slot) {
      this.tip.dataset.for = s.dataset.slot
      this.tip.innerHTML = `<div>${row.name}${row.equipped ? ' <span style="color:#c9a24a">equipped</span>' : ''}</div>`
        + `<div class="tp-desc">${row.desc}</div>`
        + (row.contents ? `<div class="tp-pack">${packSlotsHtml(row)}</div>` : '')
    }
    this.tip.style.display = 'block'
    const w = this.tip.offsetWidth, h = this.tip.offsetHeight
    this.tip.style.left = Math.min(e.clientX + 16, window.innerWidth - w - 8) + 'px'
    this.tip.style.top = Math.min(e.clientY + 14, window.innerHeight - h - 8) + 'px'
  }

  /** Redraw the card. Cheap; called on open and on every inventory change. */
  render () {
    if (!this.isOpen) return
    const inv = this.inventory
    const rows = inv.list()
    if (this.sel != null && !rows[this.sel]) { this.sel = null; this.packSel = -1 }
    this.tip.dataset.for = ''
    const p = inv.pending()
    let grid = ''
    for (let i = 0; i < Math.max(inv.slotCap(), rows.length); i++) {
      grid += slotHtml(rows[i] ?? null, rows[i] ? `data-slot="${i}"` : '', i === this.sel ? 'sel' : '')
    }
    this.card.innerHTML =
      `<div class="is-head"><span class="is-title">Inventory</span></div>`
      + (p
        ? `<div class="is-pending">No room for <b>${inv.nameOf(p.id)}</b>. Drop something to make room.<br>`
          + btn('take', 'take it', inv.fits(p.id, p.n)) + btn('leave', 'leave it') + `</div>`
        : '')
      + `<div class="is-grid">${grid}</div>`
      + `<div class="is-strip">${this._strip(rows)}</div>`
      + BACK_BUTTON
  }

  /** What you can do with the selected item. */
  _strip (rows) {
    const r = this.sel != null ? rows[this.sel] : null
    if (!r) return `<div class="st-hint">Click an item to use it, drop it, or open a pack.</div>`
    const inv = this.inventory
    const head = `<div class="st-name">${r.name}${r.equipped ? '<span class="st-tag">equipped</span>' : ''}</div>`
      + `<div class="st-desc">${r.desc}</div>`
    if (r.contents) {
      const packed = r.contents[this.packSel]
      const canUnpack = packed && !(r.equipped && packed.sleep) && inv.slotsUsed() < inv.slotCap()
      return head
        + `<div class="st-pack">${packSlotsHtml(r, (i) => r.contents[i] ? `data-packslot="${i}"` : '', this.packSel)}</div>`
        + (packed ? btn('unpack', `unpack ${packed.name.toLowerCase()}`, canUnpack) : '')
        + (r.equipped ? '' : btn('equip', 'equip') + btn('drop', 'drop', !r.contents.length))
    }
    const eq = rows.find(x => x.equipped)
    const canPack = r.kind === 'camp' && eq
      && (eq.contents.length < eq.packSlots || (r.sleep && eq.contents.some(c => c.sleep)))
    return head
      + (r.usable ? btn('use', 'use') : '')
      + (r.kind === 'camp' ? btn('pack', r.sleep && eq?.contents.some(c => c.sleep) ? 'swap into pack' : 'pack', canPack) : '')
      + btn('drop', 'drop')
  }
}
