/**
 * SM-3 — the service center screen. Opens when the parking brake latches at an auto shop (main.js
 * _updateParkTriggers); closes on Esc, the ×, or the brake coming off. While it is open the camera
 * holds a front three-quarter view of the truck (main.js, through `onView`) — it's a modification
 * game, and the player should see the truck — so the card docks to the side, and the HUD hides
 * behind it (FEAT-167: the card carries the wallet and the clock). Tabs (owner, 2026-10-22):
 *   Maintenance — FEAT-212 (owner, 2026-11-13): the owner's outline as a tree (TREE below; the outline,
 *                line by line, is in the ticket). One item open per level; selecting an open item closes
 *                it and everything under it, so the top level again collapses everything. Every item
 *                starts closed, and every label wears the band of the worst part under it (FEAT-167, FEAT-244).
 *                Its leaves: REPAIR (a repairable class: set how far with ◀ ▶, ←/→ or the D-pad, in 5%
 *                steps up to the bench's cap; price and hours follow live), SWAP WITH INVENTORY (only a
 *                part you carry that fits: never shop stock), a corner's SWAP WITH CORNER (FEAT-196: the
 *                two mounted pairs trade), ALIGN ALL (one job, four corners), PATCH, OIL CHANGE and the
 *                clutch LSD's CHANGE CLUTCHES — each with its price and its hours. "Vehicle Diagnostics"
 *                opens the V-key damage screen over this one.
 *   Shop       — FEAT-212 (owner, 2026-11-13: "just a list of parts"): ONLY this shop's shelf right now
 *                (src/shop-stock.js), as one level of the Maintenance tree's rows. Closed, a row is its name,
 *                its condition (a mounted tire: its tire's and its wheel's), its price and how long before
 *                it's gone; open, the two-line description and its options, each with its price and hours
 *                (ServiceCenter.buyQuote): buy & fit (a tire or wheel names its corner) and buy to carry.
 *                One row open at a time. Hovering — or pad-focusing — an item fits it on the truck for a look
 *                (ServiceCenter.preview), on the corner under the pointer or else the worst one; moving off
 *                puts back exactly what was there.
 *                My Items, below it: sell the parts you carry, and repair or patch them as their own items
 *                (a mounted pair's wheel too, FEAT-196).
 *   Jobs       — a BUTTON at the top, not a tab (FEAT-252, owner 2026-11-17), only while the shop has live
 *                offers (it still posts work; FEAT-197). It closes the screen and hands over to the offers
 *                (the offer card over the map); declining them comes back to this screen.
 * THE CART (FEAT-212, owner 2026-11-13): every button that costs money or time queues its job (ServiceCenter.queue) —
 * the truck shows it at once, the money and the clock wait for "check out" on the card's foot; "discard" puts it all
 * back; a line's × takes one out. With work in the cart, leaving (Esc / B, back, go to jobs, the brake) asks first.
 * A part that comes off goes straight into My Items (owner 11-04: no sell / keep prompt).
 *
 * FEAT-104: a storefront (general store, gas station, food vendor) opens the same screen as a STORE:
 * the Shop tab and the Jobs button, nothing else. It is buy only (owner, 2026-10-07): no My Vehicle, no My
 * Items, no selling, and the camera stays where it was, since there is nothing on the truck to look at.
 *
 * Described, never scored (SM-INV-10): parts are names, prices are money, conditions are colour bars
 * with their percentage (wear is a state, not a score: owner, 2026-10-22),
 * rarity is the tint behind the icon (data/parts.js RARITY_COLOR). Rules live in src/service.js; this
 * reads it and the DOM only (the inventory-screen.js layout).
 */

import { PARTS, SLOTS, REPAIRS, REPAIR_CAP, RARITY_COLOR, socketsFor } from '../data/parts.js'
import { ITEMS } from '../data/items.js'
import { TRACKS, DAMAGE_PARAMS } from './damage.js'
import { infoHtml } from '../data/component-info.js'
import { formatMoney } from './economy.js'
import { bandColor } from './damage-screen.js'
import { formatGameDuration, formatDue } from './offer-board.js'
import { shelfName } from './shop-stock.js'
import { BACK_BUTTON } from './park-badge.js'

// UI-STYLE.md: a Story card (the shop talking) — tokens only, square panel, story buttons. The screen
// itself lets the pointer through, so a drag on the world still orbits the camera round the truck.
const CSS = `
#svc-screen { display: none; position: fixed; top: 0; right: 0; bottom: 0; z-index: 95; pointer-events: none;
  align-items: center; padding: 0 16px; font-family: var(--font); color: var(--text-body); }
#svc-screen.open { display: flex; }
body.map-open #svc-screen { visibility: hidden; }
body:has(#dmg-screen.open) #svc-screen { visibility: hidden; }   /* FEAT-212: Vehicle Diagnostics opens over it */
/* FEAT-167 (owner, 2026-11-05): no HUD behind the shop — the card carries the wallet and the clock. The
   dock comes back over the map, where the run HUD lifts above it. */
body:has(#svc-screen.open) #quickjob-btn, body:has(#svc-screen.open) #cluster,
body:has(#svc-screen.open):not(.map-open) #hud-dock { visibility: hidden; }
#svc-screen .sv-card { pointer-events: auto; background: var(--card-bg); border: 1px solid var(--line-card);
  padding: 12px 16px 14px; width: min(520px, calc(100vw - 32px)); max-height: calc(100% - 64px); box-sizing: border-box;
  display: flex; flex-direction: column; }
/* FEAT-288 P3b: max-height in %, not vh — under Big's zoom (FEAT-248) a vh is zoomed with the card, so 100vh ran 1.5 screens
   tall and the wallet, the cart's check out and back fell off a short screen; % of the full-height screen box stays one. */
/* FEAT-212: the card's body scrolls; the cart's subtotal and the back button stay on its foot, below it */
/* BUG-170: the rows bleed 6 px each side (margin 0 -6px) so their hover bar reaches past the text; the scrolling body
   carries that 6 px as padding (and gives it back as margin), else the row's right edge overhung it and scrolled sideways. */
#svc-screen .sv-body { overflow-y: auto; min-height: 0; padding: 0 6px; margin: 0 -6px; }
#svc-screen .sv-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
#svc-screen .sv-title { flex: 1; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; color: var(--accent-story); }
#svc-screen .sv-wallet { font-size: 14px; color: var(--money); text-align: right; }
#svc-screen .sv-clock { font-size: 12px; color: var(--text-dim); }
#svc-screen .sv-tabs { display: flex; gap: 4px; margin-bottom: 10px; border-bottom: 1px solid var(--line); }
#svc-screen .sv-tab { font: 14px var(--font); color: var(--text-dim); background: transparent; border: 0;
  border-bottom: 2px solid transparent; padding: 4px 10px; cursor: pointer; transition: color 0.1s; }
#svc-screen .sv-tab:hover { color: var(--text-bright); }
#svc-screen .sv-tab.on { color: var(--text-bright); border-bottom-color: var(--accent-story); }
#svc-screen .sv-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 14px; }
/* FEAT-196 (owner, 2026-11-14: "a little less cramped … you only need to be looking at 12 or so entries"): one pitch for
   every row, tree or shelf, sized so about 12 fit the card's body (the card's head, tabs, list head and foot take ~260 px
   of the window); never tighter than the item icon's 28 px + 12 (40 px), never looser than 56 px. */
#svc-screen .sv-line { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 6px; margin: 0 -6px;
  min-height: clamp(28px, calc((100vh - 260px) / 12 - 12px), 44px);
  box-sizing: content-box; font: 14px var(--font); color: var(--text-body); text-align: left; background: transparent;
  border: 0; cursor: pointer; transition: background 0.1s; }
#svc-screen .sv-line:hover, #svc-screen .sv-line.on { background: rgba(255,255,255,0.09); color: var(--text-bright); }
#svc-screen .sv-name { flex: 1; min-width: 0; }
#svc-screen .sv-acts { flex-basis: 100%; display: flex; justify-content: flex-end; gap: 4px; }
#svc-screen .sv-desc { font-size: 12px; color: var(--text-dim); line-height: 1.35; }
#svc-screen .sv-flat { font-size: 12px; color: var(--bad-text); }
#svc-screen .sv-bar { width: 60px; height: 6px; background: var(--line); overflow: hidden; flex: none; }
#svc-screen .sv-bar i { display: block; height: 100%; }
#svc-screen .sv-pct { width: 36px; text-align: right; color: var(--text-dim); font-size: 12px; flex: none; }
#svc-screen .sv-cost { width: 112px; text-align: right; color: var(--text-dim); font-size: 12px; flex: none; }
#svc-screen .sv-btn { font: 12px var(--font); color: var(--text-body); background: transparent; border: 1px solid var(--line-control);
  border-radius: 3px; padding: 2px 8px; cursor: pointer; flex: none; transition: background 0.1s, border-color 0.1s; }
#svc-screen .sv-btn:hover:not(:disabled) { background: rgba(255,255,255,0.09); border-color: var(--line-hover); color: var(--text-bright); }
#svc-screen .sv-btn:disabled { opacity: 0.35; cursor: default; }
#svc-screen .sv-btn.ok { border-color: var(--accept); color: var(--accept-text); }
#svc-screen .sv-btn.bad { border-color: var(--bad-line); color: var(--bad-text); }
#svc-screen .sv-foot { margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--line); }
#svc-screen .sv-total { color: var(--text-bright); }
#svc-screen .sv-step { display: flex; align-items: center; gap: 8px; margin: 4px 0; padding: 4px 6px; background: transparent;
  border: 1px solid var(--line-control); border-radius: 3px; color: var(--text-body); font: 14px var(--font); cursor: default; }
#svc-screen .sv-step i { font-style: normal; cursor: pointer; padding: 0 4px; }
#svc-screen .sv-step i:hover { color: var(--text-bright); }
#svc-screen .sv-hbar { position: relative; width: 200px; height: 10px; background: var(--line); }
#svc-screen .sv-hbar > * { position: absolute; top: 0; bottom: 0; }
#svc-screen .sv-hbar .now { left: 0; }
#svc-screen .sv-hbar .gain { opacity: 0.45; }
#svc-screen .sv-hbar .tgt { top: -3px; bottom: -3px; width: 2px; margin-left: -1px; background: var(--text-bright); }
#svc-screen .sv-hbar .cap { width: 1px; background: var(--text-faint); }
#svc-screen .sv-slot { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--line); }
#svc-screen .sv-slot:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
#svc-screen .sv-slothead { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: var(--text-faint); margin-bottom: 2px; }
#svc-screen button.sv-slothead { display: block; width: 100%; padding: 2px 6px; margin: 0 -6px 2px; box-sizing: content-box;
  font: 12px var(--font); letter-spacing: 2px; text-align: left; background: transparent; border: 0; cursor: pointer; transition: background 0.1s; }
#svc-screen button.sv-slothead:hover { background: rgba(255,255,255,0.09); }
#svc-screen .sv-clamp { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
/* FEAT-212: a closed shelf row's fixed columns (condition, price, time left), so they line up down the list */
#svc-screen .sv-cond.sv-ccol { width: 104px; flex: none; justify-content: flex-end; gap: 8px; }
#svc-screen .sv-each { width: 56px; flex: none; text-align: right; }
#svc-screen .sv-left { width: 88px; flex: none; text-align: right; white-space: nowrap; }
#svc-screen .sv-line[data-slot] .sv-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#svc-screen .sv-name .sv-chip { display: inline-block; vertical-align: middle; margin-right: 4px; }
#svc-screen .sv-cond { display: flex; align-items: center; gap: 4px; }
#svc-screen .sv-chip { width: 28px; height: 28px; border-radius: 3px; flex: none; background-size: contain;
  background-repeat: no-repeat; background-position: center; }
#svc-screen .sv-i { color: var(--accent-story); }   /* FEAT-213 */
/* Owner, 2026-11-15: the part's info is an (i) icon's hover. The pad's highlight (.nav-focus) is that hover — the icon is a
   button, so D-pad / stick reach it, and the text shows while it is highlighted; no click, no hidden gesture. */
#svc-screen .sv-ibtn { width: auto; min-height: 0; margin: 0; padding: 2px 6px; }
#svc-screen .sv-info { display: none; font-size: 12px; line-height: 1.45; color: var(--text-body); padding: 4px 8px 6px; }
#svc-screen .sv-ibtn:hover + .sv-info, #svc-screen .sv-ibtn.nav-focus + .sv-info { display: block; }
#svc-screen .sv-kids { margin-left: 6px; padding-left: 6px; border-left: 2px solid var(--accent-story); }   /* FEAT-212: one level in */
#svc-screen .sv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; padding: 4px 0; font-size: 14px; }
#svc-screen .sv-empty { font-size: 14px; color: var(--text-faint); padding: 4px 0; }
`

/** Condition, coloured by the damage screen's bands (the palette's one owner, UI-STYLE.md §3). */
const bar = (c, flat = false) => `<span class="sv-bar"><i style="width:${Math.round(c * 100)}%;background:${bandColor(flat ? 0 : c)}"></i></span>`
  + `<span class="sv-pct">${Math.round(c * 100)}%</span>`
/** The repair bar: where the part is now, what the repair adds, the target marker, the bench's cap. */
const pct = (x) => `${(x * 100).toFixed(1)}%`
const hbar = (c, t) => `<span class="sv-hbar"><span class="now" style="width:${pct(c)};background:${bandColor(c)}"></span>`
  + `<span class="gain" style="left:${pct(c)};width:${pct(t - c)};background:${bandColor(t)}"></span>`
  + `<span class="cap" style="left:${pct(REPAIR_CAP)}"></span><span class="tgt" style="left:${pct(t)}"></span></span>`
const rarity = (id) => PARTS[id]?.rarity ?? ITEMS[id]?.rarity
const chip = (id) => `<span class="sv-chip" style="background-color:${rarity(id) ? RARITY_COLOR[rarity(id)] + '55' : 'transparent'};`
  + `background-image:url(assets/items/${ITEMS[id]?.thumb ?? id}.png)"></span>`
const btn = (act, label, enabled = true, data = '', cls = '') =>
  `<button class="sv-btn${cls}" data-act="${act}" ${data}${enabled ? '' : ' disabled'}>${label}</button>`
const cost = (price, hours) => `${price < 0 ? '−' : ''}$${formatMoney(Math.abs(price))} · ${formatGameDuration(hours)}`   // a sale reads −$
/** A many-socket part's button names where it goes: a corner (FL…RR) or a side (left / right). */
const where = (sk) => /[FR][LR]$/.test(sk) ? sk.slice(-2) : { L: 'left', R: 'right' }[sk.slice(-1)]
const dim = (t) => `<div class="sv-empty">${t}</div>`
/** Maintenance node id → COMPONENT_INFO key (depth ≥ 1; the 'engine' section at depth 0 is not the part). */
const NODE_INFO = { tire: 'tires', wheel: 'wheels', brakes: 'brakes', springs: 'springs', dampers: 'dampers', filter: 'filter',
  radiator: 'radiator', engine: 'engine', trans: 'transmission', lights: 'lights', panels: 'panels' }
const isFlat = (d, track) => TRACKS[track]?.cls === 'tire' && d.flat[TRACKS[track].wheel]

const CORNERS = [['FL', 'Front left'], ['FR', 'Front right'], ['RL', 'Rear left'], ['RR', 'Rear right']]
const AXLES = ['Front', 'Rear']
/** FEAT-244: the ONE "worst condition under this node": its own condition (a part's, a flat counting as 0) and
 *  every kid's, whichever exist; null when nothing under it wears. Used at every level of the tree. */
export const worstUnder = (own, kids) => {
  const cs = [own, ...kids.map(k => k.c)].filter(x => x != null)
  return cs.length ? Math.min(...cs) : null
}
/** A Maintenance tree item: `kids` (items, or a row's HTML) show under it while it is open. `c`, the
 *  condition its label is banded by, is the worst under it (its own `c`, if given, included). Ids are unique among siblings. */
const node = (id, label, kids, info = '', c) => ({ id, label, kids, info, c: worstUnder(c, kids) })
/** "T 80%" in its band's colour: the corner line's two conditions (owner: "W:xx% T:xx%, stay minimal"). */
const pctIn = (label, c, flat = false) => `<span class="sv-desc" style="color:${bandColor(flat ? 0 : c)}">${label} ${Math.round(c * 100)}%</span>`

export class ServiceScreen {
  /**
   * @param {import('./service.js').ServiceCenter} service
   * @param {object} vehicleState - read-only; the brake coming off closes the screen
   * @param {object} o
   * @param {() => object[]} o.jobs - this shop's live offers (the top Jobs button shows while there are any)
   * @param {() => void} o.openJobs - hand the brake to the offers; their decline reopens this screen (FEAT-197)
   * @param {() => number} o.nowH - the game clock (daySystem.clockH): the shelf's time left
   * @param {(open:boolean) => void} o.onView - the screen opened / closed (main.js: the camera)
   * @param {() => void} o.openDiagnostics - Maintenance's "Vehicle Diagnostics": the V-key damage screen over this one
   */
  constructor (service, vehicleState, { jobs, openJobs, nowH, onView, openDiagnostics }) {
    this.service = service
    this.vehicleState = vehicleState
    Object.assign(this, { jobs, openJobs, nowH, onView, openDiagnostics })
    this.isOpen = false
    this.tab = 'maint'
    this.name = ''
    this.store = false    // FEAT-104: a storefront's shop, not a service center
    this.paths = {}       // FEAT-212: per tab, the open tree item per level, by id (`this.path`)
    this.target = {}      // repair key → the chosen target condition
    this._pv = null       // the live preview's `slot:socket`, or null
    this._mouse = true    // the last input was the pointer (else keys / the pad, which move .nav-focus)
    this.leaving = null   // FEAT-212: asked to leave with a full cart — what to do once it is checked out or discarded
    this.note = 0         // FEAT-212: lines that came out with the one just removed

    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)
    this.screen = document.createElement('div')
    this.screen.id = 'svc-screen'
    this.screen.innerHTML = '<div class="sv-card"></div>'
    document.body.appendChild(this.screen)
    this.card = this.screen.firstChild
    // mousedown preventDefault keeps focus off the buttons: Space is the parking brake.
    this.screen.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault() })
    this.screen.addEventListener('click', (e) => this._onClick(e))
    // FEAT-212: ↑ / ↓ walk the items in list order (menu-nav's navStep). The tree's indents sent the spatial nearest
    // from the map button straight to the back button, past every row. The tabs are LB / RB's (and ← / →).
    this.screen.navStep = (el, dx, dy) => {
      if (!dy) return null
      const items = [...this.card.querySelectorAll('button:not(.sv-tab)')].filter(b => b.offsetParent !== null)
      const i = items.indexOf(el)
      return items[i + dy] ?? (i < 0 ? null : el)   // the ends hold (owner, 2026-11-15): ↑ at the top never wraps to the bottom
    }
    // isTrusted: menu-nav's highlight sends the item a synthetic mousemove (BUG-109) — that is the pad, not the pointer.
    this.screen.addEventListener('mousemove', (e) => { if (e.isTrusted) this._mouse = true })
    window.addEventListener('keydown', () => { this._mouse = false }, true)
  }

  /** The open tree item per level on this tab: Maintenance's and the Shop's are kept apart. */
  get path () { return this.paths[this.tab] ?? [] }
  set path (p) { this.paths[this.tab] = p }

  /** `name` is the shop's sign (POI name); `store` opens a storefront's shop (FEAT-104). */
  open (name, store = false) {
    this.isOpen = true
    this.name = name
    this.store = store
    this.tab = store ? 'shop' : 'maint'
    this.target = {}
    this.paths = {}
    this.leaving = null
    this.note = 0
    this.screen.classList.add('open')
    if (!store) this.onView(true)
    this.render()
  }

  close () {
    if (!this.isOpen) return
    this.isOpen = false
    this._pv = null
    this.leaving = null
    this.msg = false; clearTimeout(this._msgTimer)
    this.service.close()   // a cart still full here (the truck towed off) is discarded
    this.screen.classList.remove('open')
    if (!this.store) this.onView(false)
  }

  /** Per frame: driving off closes it; the shelf item under the pointer (or the pad's highlight) is
   *  previewed on the truck, and moving off it puts the truck back. */
  update () {
    if (!this.isOpen) return
    if (!this.vehicleState.parked) { this.close(); return }
    const want = this.tab === 'shop' ? this._previewWant() : null
    const key = want ? `${want.slot}:${want.socket}` : null
    if (key === this._pv) return
    this._pv = key
    if (want) this.service.preview(want.slot, want.socket)
    else this.service.unpreview()
  }

  /** The shelf item to preview and where: the corner button under the pointer / highlight, else the
   *  item's one socket, else (a tire or wheel) its worst corner. */
  _previewWant () {
    const el = this._mouse ? [...this.card.querySelectorAll(':hover')].at(-1) : this.card.querySelector('.nav-focus')
    const row = el?.closest('[data-slot]')
    const e = row && this.service.stock()[+row.dataset.slot]
    const sockets = e ? socketsFor(e.id) : []
    if (!sockets.length) return null
    return { slot: +row.dataset.slot, socket: el.closest('[data-socket]')?.dataset.socket ?? this._worst(sockets) }
  }

  /** The socket in the worst shape (a flat reads as nothing left). */
  _worst (sockets) {
    const d = this.service.damage, c = (s) => isFlat(d, SLOTS[s].tracks[0]) ? 0 : this.service.parts.condOf(s)
    return sockets.reduce((a, b) => c(b) < c(a) ? b : a)
  }

  /** The repair targets behind a repair key: `v:<track>` on the truck, `i:<index>` in the inventory. */
  _targets (key) {
    const [k, v] = key.split(':'), from = this._line(key)?.from
    if (k === 'w') return this.service.ownedWheelTargets(+v, from)   // FEAT-196: a mounted pair's wheel
    return k === 'v' ? this.service.targets(v, from) : this.service.ownedTargets(+v, from)
  }

  /** BUG-197: the cart line already repairing the part behind a repair key, or null. The bar then edits that line: it
   *  starts from the line's `from` and its select replaces the line (ServiceCenter.queueRepair). */
  _line (key) {
    const [k, v] = key.split(':')
    return k === 'v' ? this.service.repairLine('repair', v) : this.service.repairLine('repairOwned', +v, k === 'w')
  }

  /** The chosen target, kept on the list (default: as far as the bench goes). */
  _target (key) {
    const ts = this._targets(key)
    return ts.includes(this.target[key]) ? this.target[key] : ts.at(-1)
  }

  _onClick (e) {
    const b = e.target.closest('button[data-act]')
    if (!b) return
    const s = this.service
    s.unpreview()   // a real action never lands on a previewed truck
    this._pv = null
    const key = b.dataset.key
    this.note = 0
    // FEAT-212: every job goes on the cart (ServiceCenter.queue), named for its line. `inv(i)`: the inventory row's name.
    const inv = (i) => s.inventory.list()[+i]?.name, q = (m, args, label) => s.queue(m, args, label)
    const shelfItem = () => shelfName(s.stock()[+b.dataset.slot])
    switch (b.dataset.act) {
      case 'close': this.leave(); return
      case 'jobs': this.leave(() => this.openJobs()); return
      case 'checkout': if (s.checkout()) this._left(); break
      case 'discard': s.discard(); this.paths.shop = []; this._left(); break
      case 'unqueue': this.note = s.remove(+b.dataset.line); this.paths.shop = []; break
      case 'tab': this.tab = b.dataset.tab; break
      case 'node': { const d = +b.dataset.d; this.path = this.path[d] === b.dataset.id ? this.path.slice(0, d) : [...this.path.slice(0, d), b.dataset.id]; break }
      case 'diag': this.openDiagnostics(); return
      case 'align': q('align', [], 'Align all'); break
      case 'oil': q('changeOil', [], 'Oil change'); break
      case 'step': {
        const d = e.target.closest('.sel-prev') ? -1 : e.target.closest('.sel-next') ? 1 : 0
        const ts = this._targets(key)
        this.target[key] = ts[Math.max(0, Math.min(ts.length - 1, ts.indexOf(this._target(key)) + d))]
        break
      }
      case 'repair': {
        const [k, v] = key.split(':'), t = this._target(key), to = `to ${Math.round(t * 100)}%`
        // BUG-197: one line per part — a repair already on the cart is corrected, never doubled.
        if (k === 'v') s.queueRepair('repair', [v, t], v === 'diff' ? 'Change clutches' : `Repair ${TRACKS[v].label} ${to}`)
        else s.queueRepair('repairOwned', [+v, t, k === 'w'], `Repair ${inv(v)}${k === 'w' ? ' wheel' : ''} ${to}`)
        break
      }
      case 'patch': q('patch', [b.dataset.track], `Patch ${TRACKS[b.dataset.track].label}`); break
      case 'patchOwned': q('patchOwned', [+b.dataset.index], `Patch ${inv(b.dataset.index)}`); break
      case 'exchange': q('exchange', [+b.dataset.index, b.dataset.socket], `Fit ${inv(b.dataset.index)} · ${SLOTS[b.dataset.socket].name.toLowerCase()}`); break
      case 'swap': {   // the open path follows the tire to its new corner
        const [a, c] = [CORNERS[+b.dataset.a][0], CORNERS[+b.dataset.b][0]]
        if (q('swapCorners', [+b.dataset.a, +b.dataset.b], `Swap corners ${a} ↔ ${c}`)) this.path = this.path.map(id => id === a ? c : id)
        break
      }
      case 'sellOwned': q('sellOwned', [+b.dataset.index], `Sell ${inv(b.dataset.index)}`); this.path = []; break
      case 'split': q('split', [+b.dataset.index], `Split ${inv(b.dataset.index)}`); this.path = []; break
      case 'combine': q('combine', [+b.dataset.index, +b.dataset.with], `Mount ${inv(b.dataset.index)} + ${inv(b.dataset.with)}`); this.path = []; break
      case 'buy': q('buyAndFit', [+b.dataset.slot, b.dataset.socket], `Buy ${shelfItem()} · fit ${SLOTS[b.dataset.socket].name.toLowerCase()}`); this.path = []; break
      case 'eat': q('buyAndEat', [+b.dataset.slot], `Eat ${shelfItem()} here`); this.path = []; break
      case 'stow': q('buyToInventory', [+b.dataset.slot], `Buy ${shelfItem()}`); this.path = []; break
    }
    this.render()
  }

  /** FEAT-212: the player's way out — Esc / B, the back button, "go to jobs", the brake (main.js). With work in the cart
   *  it asks first: check out or discard, and `then` runs once one of them is done (no silent loss, no silent charge). */
  leave (then = () => {}) {
    if (!this.isOpen) return
    if (!this.service.cart.length) { this.close(); then(); return }
    this.leaving = then
    // BUG-188: the line is a message, not a toggle — every press (re)shows it and it hides itself ~1 s later
    this.msg = true
    clearTimeout(this._msgTimer)
    this._msgTimer = setTimeout(() => { this.msg = false; this.render() }, 1000)
    this.render()
  }

  /** Esc / pad B: leaves, or with work in the cart re-shows the ask (never hides it early). */
  back () { this.leave() }

  /** The cart was checked out or discarded: an ask in progress finishes leaving. */
  _left () {
    const then = this.leaving
    if (!then) return
    this.leaving = null
    this.close(); then()
  }

  render () {
    if (!this.isOpen) return
    const s = this.service
    const jobs = this.jobs()
    const tab = (id, label) => `<button class="sv-tab${this.tab === id ? ' on' : ''}" data-act="tab" data-tab="${id}">${label}</button>`
    const [lines, foot] = this._cart(), top = this.card.querySelector('.sv-body')?.scrollTop ?? 0
    this.card.innerHTML =
      `<div class="sv-body"><div class="sv-head"><span class="sv-title">${this.name}${this.store ? '' : ' · service'}</span>`
      + `<span class="sv-wallet">$${formatMoney(s.money())}<br><span class="sv-clock">${formatDue(Math.floor(this.nowH() * 60) / 60)}</span></span>`
      + (jobs.length ? btn('jobs', 'jobs') : '')   // FEAT-252 (owner, 2026-11-17): a button, not a tab — it opens the offers on the map
      + `</div>`
      + `<div class="sv-tabs">${this.store ? tab('shop', 'Shop') : tab('maint', 'Maintenance') + tab('shop', 'Shop')}</div>`
      + (this.tab === 'maint' ? this._maintenance() : this._shop())
      + lines + `</div>` + foot
      + BACK_BUTTON   // the card's way out (owner, 2026-10-21: replaces the corner ×)
    this.card.firstChild.scrollTop = top   // a click re-renders the body: it stays where it was scrolled
  }

  // ── The cart (FEAT-212) ────────────────────────────────────────────────────────────────────────

  /** Under every tab while it holds work: each line with its price and hours and its × (take it out), then — pinned to
   *  the card's foot, below the scrolling body, so a long tree never scrolls it away — the subtotal in money and time and
   *  the two ways out of it. Short of the wallet, checkout waits (adding never does). Returns [the lines, the foot]. */
  _cart () {
    const s = this.service
    if (!s.cart.length) return ['', '']
    const t = s.total(), short = s.short()
    return [`<div class="sv-slot"><div class="sv-slothead">Cart <span class="sv-desc">· paid and done at checkout</span></div>`
      + s.cart.map((l, j) => `<div class="sv-row"><span class="sv-name">${l.label}</span><span class="sv-cost">${cost(l.price - l.earn, l.hours)}</span>`
        + btn('unqueue', '×', true, `data-line="${j}" title="take it out"`) + `</div>`).join('')
      + (this.note ? dim(`${this.note} more came out with it: ${this.note > 1 ? 'they' : 'it'} needed it.`) : '') + `</div>`,
      `<div class="sv-foot"><div class="sv-row"><span class="sv-name">Subtotal</span><span class="sv-cost sv-total">${cost(t.price, t.hours)}</span></div>`
      + (short > 0 ? `<div class="sv-flat">$${formatMoney(short)} short</div>` : '')
      + (this.leaving && this.msg ? `<div class="sv-desc">Check out or discard before you leave.</div>` : '')
      + `<div class="sv-row"><span class="sv-acts">${btn('discard', 'discard', true, '', ' bad')}${btn('checkout', 'check out', short <= 0, '', ' ok')}</span></div></div>`]
  }

  // ── Maintenance (FEAT-212) ─────────────────────────────────────────────────────────────────────

  /** The tree, in the owner's outline order (the ticket's plan maps each line). Hidden until the game has
   *  it: a tire-only or wheel-only corner swap, the cold air intake's clean. */
  _maintenance () {
    const s = this.service, d = s.damage
    const sw = ['swap'], sr = ['swap', 'repair'], rs = ['repair', 'swap']
    const oil = s.oilQuote(), clutch = s.repairQuote('diff', 1)
    const tree = [
      `<button class="sv-line" data-act="diag"><span class="sv-name">▸ Vehicle Diagnostics</span></button>`,
      node('twbs', 'Tires, Wheels, Brakes and Suspension', [
        node('tw', 'Tires and Wheels', [this._alignment(), ...CORNERS.map((_, i) => this._corner(i))]),
        node('brakes', 'Brakes', AXLES.map(a => this._part(a, a, { socket: 'brakes' + a, track: 'brake' + a, acts: sw }))),
        node('susp', 'Suspension', [
          node('springs', 'Springs', AXLES.map(a => this._part(a, a, { socket: 'springs' + a, track: 'spring' + a, acts: sr }))),
          node('dampers', 'Dampers', AXLES.map(a => this._part(a, a, { socket: 'dampers' + a, track: 'damper' + a, acts: sr }))),
          node('arb', 'Roll bars', AXLES.map(a => this._part(a, a, { socket: 'arb' + a, acts: sw }))),
          this._part('lift', 'Lift', { socket: 'lift', acts: sw }),
        ]),
      ]),
      node('engine', 'Engine and Cooling', [
        this._part('filter', 'Air filter', { socket: 'airFilter', track: 'airFilter', acts: sw }),
        this._part('radiator', 'Radiator', { socket: 'radiator', track: 'radiator', acts: rs }),
        this._part('engine', 'Engine', { socket: 'engine', track: 'engine', acts: rs, c: Math.min(d.get('engine'), d.get('oil')),   // old oil bands its section
          info: pctIn('filter', d.get('airFilter')) + pctIn('oil', d.get('oil')),
          pre: [this._act('Oil change', oil, btn('oil', 'change', d.get('oil') < 1, '', ' ok'))] }),
      ]),
      node('drive', 'Drivetrain', [
        // The outline lists no action under the transmission; its rebuild stays, or synchro wear could never be fixed.
        ...(d.manualBox ? [this._part('trans', 'Transmission', { track: 'transmission', acts: ['repair'] })] : []),
        this._part('diff', 'Rear differential', { socket: 'diff', track: d.clutchDiff ? 'diff' : null, acts: sw,
          pre: d.clutchDiff ? [this._act('Change clutches', clutch, btn('repair', 'change', s.targets('diff').length > 0, 'data-key="v:diff"', ' ok'))] : [] }),
        this._part('axle', 'Final drive', { socket: 'axle', acts: sw }),
      ]),
      node('body', 'Headlights and Body Panels', [
        node('lights', 'Headlights', [['L', 'Left'], ['R', 'Right']].map(([k, l]) => this._part(k, l, { socket: 'headlight' + k, track: 'headlight' + k, acts: sw }))),
        node('panels', 'Body Panels', ['Front', 'Left', 'Right', 'Rear'].map(k => this._part(k, k, { track: 'armor' + k, acts: ['repair'] }))),
      ]),
      // FEAT-204: the bolt-ons, every socket data/parts.js marks `bolton`.
      node('boltons', 'Bolt-ons', Object.keys(SLOTS).filter(k => SLOTS[k].bolton).map(k => this._part(k, SLOTS[k].name, { socket: k, acts: sw }))),
    ]
    return `<div class="sv-tree">${this._level(tree, 0)}</div>`
  }

  /** One level of the tree: each item a single button (one pad stop), the open one's kids under it. Every
   *  label wears the band of the worst part under it (FEAT-244). */
  _level (items, depth) {
    return items.map(n => {
      if (typeof n === 'string') return n
      const open = this.path[depth] === n.id
      const band = n.c != null ? ` style="color:${bandColor(n.c)}"` : ''
      return `<button class="sv-line${open ? ' on' : ''}" data-act="node" data-d="${depth}" data-id="${n.id}"${n.attrs ?? ''}>`
        + `<span class="sv-name"${band}>${open ? '▾' : '▸'} ${n.label}</span>${n.info}</button>`
        + (open ? `<div class="sv-kids">${depth && NODE_INFO[n.id] ? this._infoRow(NODE_INFO[n.id]) : ''}${this._level(n.kids, depth + 1)}</div>` : '')
    }).join('')
  }

  /** FEAT-213: the (i) button of an open part (a pad stop), and its text under it while it is hovered or highlighted. */
  _infoRow (k) {
    return `<button class="sv-line sv-ibtn" aria-label="About"><span class="sv-i">(i)</span></button><div class="sv-info">${infoHtml(k, DAMAGE_PARAMS)}</div>`
  }

  /** An action row: what it does, its price and hours, its one button. */
  _act (name, q, button) {
    return `<div class="sv-row"><span class="sv-name">${name}</span><span class="sv-cost">${cost(q.price, q.hours)}</span>${button}</div>`
  }

  /** A part on the truck: its bar when it wears (a flat reads as nothing left), the fitted part's name when
   *  it isn't factory, then `pre` rows and its `acts` in order ('swap' with inventory, 'repair'). */
  _part (id, label, { socket = null, track = null, acts = [], pre = [], info = '', c = null }) {
    const d = this.service.damage, flat = !!track && isFlat(d, track), part = socket && this.service.parts.fitted(socket)
    const name = part && (!PARTS[part].stock || !track) ? ` <span class="sv-desc">${PARTS[part].name}</span>` : ''   // no bar: the name is the state
    const kids = [...pre, ...acts.map(a => a === 'swap' ? this._swapNode(socket) : this._repairNode(track)).filter(Boolean)]
    return node(id, label + name, kids, (flat ? '<span class="sv-flat">flat</span>' : '') + info + (track ? bar(d.get(track), flat) : ''), c ?? (track ? (flat ? 0 : d.get(track)) : null))
  }

  /** Repair, for a repairable class; none for a replace-only one or a collapsed (scrap) wheel. */
  _repairNode (track) {
    const s = this.service, cls = TRACKS[track].cls
    if (!REPAIRS[cls] || (cls === 'wheel' && s.damage.get(track) <= 0)) return null
    const from = this._line(`v:${track}`)?.from ?? s.damage.get(track)   // BUG-197: a queued repair is edited from where it began
    return node('repair', 'Repair', [this._repair(`v:${track}`, from, (t) => s.repairQuote(track, t, from))])
  }

  /** Swap with inventory: the parts you carry that fit `socket` (never shop stock). `loose`: a wheel takes
   *  only a loose wheel; on a tire a mounted pair swaps whole. None: the owner's line. */
  _swapNode (socket, loose = false) {
    const s = this.service
    const opts = s.exchangeOptions(socket).filter(r => !loose || !PARTS[r.id]?.mounted)
    return node('swap', 'Swap with inventory', opts.length ? opts.map(r => {
      const q = s.fitLabour(r.id, socket)
      return `<div class="sv-row">${chip(r.id)}<span class="sv-name">${r.name}</span>${bar(r.cond ?? 1)}<span class="sv-cost">${cost(q.price, q.hours)}</span>`
        + btn('exchange', 'swap', true, `data-index="${r.index}" data-socket="${socket}"`) + `</div>`
    }) : [dim('No appropriate replacement in inventory.')])   // owner's words, 2026-11-13
  }

  /** Alignment: the four corners in a 2×2 chart (as they sit on the truck), then the one job for all four. */
  _alignment () {
    const s = this.service, q = s.alignQuote(), cs = CORNERS.map(([c]) => s.damage.get('align' + c)), worst = Math.min(...cs)
    return node('align', 'Alignment', [
      `<div class="sv-grid">${CORNERS.map(([c], i) => `<span class="sv-cond"><span class="sv-name">${c}</span>${bar(cs[i])}</span>`).join('')}</div>`,
      this._act('Align all', q, btn('align', 'align', s.bent(), '', ' ok')),
    ], bar(worst), worst)
  }

  /** A corner: its tire's and wheel's conditions on one line (a flat, a collapsed wheel), then Swap with
   *  corner (FEAT-196: the two mounted pairs trade), its Tire and its Wheel. */
  _corner (i) {
    const s = this.service, d = s.damage, [c, label] = CORNERS[i]
    const tire = 'tire' + c, wheel = 'wheel' + c, flat = d.flat[i], tc = d.get(tire), wc = d.get(wheel)
    const swap = s.cornerSwapQuote(), patch = s.patchQuote()
    const tag = (flat ? '<span class="sv-flat">flat</span>' : '') + (wc <= 0 ? '<span class="sv-flat">wheel failed</span>' : '')
    // FEAT-262 (owner, 2026-11-17): the corner line names the tire on it, the part's own name (Old / Standard / Sport / ...), stock or not.
    const fitted = s.parts.fitted(tire)
    return node(c, label + (fitted ? ` <span class="sv-desc">${PARTS[fitted].name}</span>` : ''), [
      node('corner', 'Swap with corner', CORNERS.flatMap(([o, ol], to) => to === i ? [] : [
        `<div class="sv-row"><span class="sv-name">${ol}</span>${pctIn('T', d.get('tire' + o), d.flat[to])}${pctIn('W', d.get('wheel' + o))}`
        + `<span class="sv-cost">${cost(swap.price, swap.hours)}</span>` + btn('swap', 'swap', true, `data-a="${i}" data-b="${to}"`) + `</div>`])),
      node('tire', 'Tire', [this._swapNode(tire),
        ...(flat ? [this._act('Patch <span class="sv-desc">the hole, not the wear</span>', patch, btn('patch', 'patch', true, `data-track="${tire}"`, ' ok'))] : [])],
        (flat ? '<span class="sv-flat">flat</span>' : '') + bar(tc, flat), flat ? 0 : tc),
      node('wheel', 'Wheel', [this._swapNode(wheel, true), this._repairNode(wheel)].filter(Boolean),
        (wc <= 0 ? '<span class="sv-flat">failed</span>' : '') + bar(wc), wc),
    ], tag + pctIn('T', tc, flat) + pctIn('W', wc), Math.min(flat ? 0 : tc, wc))
  }

  /** The repair stepper: ◀ bar ▶ (←/→ and the D-pad step it through menu-nav's .sel-prev / .sel-next),
   *  then the live price and the confirm button. Nothing to do at or above the bench's cap. */
  _repair (key, cond, quote) {
    if (!this._targets(key).length) return dim(`Cannot repair above ${Math.round(REPAIR_CAP * 100)}%.`)   // owner's words, 2026-11-05
    const t = this._target(key), q = quote(t)
    return `<button class="sv-step" data-act="step" data-key="${key}" title="← → set how far">`
      + `<i class="sel-prev">◀</i>${hbar(cond, t)}<i class="sel-next">▶</i>`
      + `<span class="sv-pct">${Math.round(cond * 100)}% → ${Math.round(t * 100)}%</span></button>`
      + `<div class="sv-row"><span class="sv-name sv-desc">You can only repair to ${Math.round(REPAIR_CAP * 100)}%, otherwise fit a new component.</span>`
      + `<span class="sv-cost">${cost(q.price, q.hours)}</span>`
      + btn('repair', 'repair', true, `data-key="${key}"`, ' ok') + `</div>`
  }

  // ── Shop (FEAT-212) ────────────────────────────────────────────────────────────────────────────

  /** The shelf as one level of the tree: a row per item (one pad stop), open = its description and its options. */
  _shop () {
    const s = this.service, now = this.nowH()
    // R-24 (owner, 2026-10-24): "For sale", and when the next item lands.
    const nxt = s.nextStock?.()
    // "Just a list of parts" (owner, 2026-11-13): an empty slot is no row; the head says when the next item lands.
    const rows = s.stock().flatMap((e, i) => !e ? []
      : [Object.assign(node(String(i), chip(e.id) + shelfName(e), [this._buyOpts(e, i)], this._shelfInfo(e, i, now)), { attrs: ` data-slot="${i}" data-item="${e.id}"` })])   // data-item: the tutorial's shop lesson (FEAT-288 P3b)
    return `<div class="sv-slot"><div class="sv-slothead">For sale${nxt ? ` <span class="sv-desc">· new stock in ${nxt}</span>` : ''}</div>`
      + this._level(rows, 0) + `</div>` + (this.store ? '' : this._myItems())
  }

  /** A closed shelf row's columns (owner, 2026-11-13): condition (a mounted tire: its tire's and its wheel's, the
   *  wheel new), price, how long before it's gone. An item with no condition leaves its column blank. */
  _shelfInfo (e, i, now) {
    const cond = e.cond === null ? '' : PARTS[e.id]?.mounted ? pctIn('T', e.cond) + pctIn('W', 1) : bar(e.cond)
    return `<span class="sv-cond sv-ccol">${cond}</span><span class="sv-desc sv-each">$${formatMoney(this.service.shelfPrice(i))}</span>`
      + `<span class="sv-desc sv-left">${e.expiresAt === Infinity ? 'always' : `${formatGameDuration(e.expiresAt - now)} left`}</span>`
  }

  /** An open shelf row: the two-line description, then each way to buy it with its price and hours. Landing 3 (the
   *  cart) swaps these buttons' action for "add to cart"; until then they buy as they are pressed. `data-slot`:
   *  the pointer anywhere on it keeps the preview on. */
  _buyOpts (e, i) {
    const s = this.service, sockets = socketsFor(e.id)
    const fitQ = sockets.length && s.buyQuote(i, sockets[0]), carry = s.buyQuote(i)
    const why = s.locked?.(e) ?? null, ok = !why   // DEC-356: a row the shop will not sell now (main.js says why), its buttons off
    return `<div data-slot="${i}" data-item="${e.id}"><div class="sv-row"><span class="sv-name sv-desc sv-clamp">${PARTS[e.id]?.desc ?? ITEMS[e.id].desc}</span></div>`   // the row's padding: as My items' first line
      + (why ? `<div class="sv-row"><span class="sv-name sv-desc">${why}</span></div>` : '')
      + (sockets.length ? this._act('Fit on the truck', fitQ, sockets.length > 1   // a tire or wheel names its corner
        ? sockets.map(sk => btn('buy', where(sk), ok, `data-slot="${i}" data-socket="${sk}"`)).join(' ')
        : btn('buy', 'add to cart', ok, `data-slot="${i}" data-socket="${sockets[0]}"`, ' ok')) : '')
      + (ITEMS[e.id]?.eatIn ? this._act('Eat here', carry, btn('eat', 'add to cart', ok, `data-slot="${i}"`, ' ok'))
        : this._act('Into the inventory', carry, btn('stow', 'add to cart', ok, `data-slot="${i}"`, sockets.length ? '' : ' ok'))) + `</div>`
  }

  /** My Items (owner, 2026-11-14: "match what you did on the maintenance tab"): the parts you carry as rows of the same
   *  tree, sharing the shelf's one open row. Closed: name and condition (a mounted pair: T and W). Open: the pair's two
   *  parts, then sell, split, combine (the partners), repair (FEAT-196: a mounted pair's wheel too) and patch. */
  _myItems () {
    const s = this.service
    const owned = s.inventory.list().filter(r => r.kind === 'part')
    const head = `<div class="sv-slot"><div class="sv-slothead">My items</div>`
    if (!owned.length) return head + dim('You carry no parts.') + `</div>`
    const bq = s.beadQuote()
    const rows = owned.map(r => {
      const key = `i:${r.index}`, cond = r.cond ?? 1, m = PARTS[r.id].mounted, wc = r.wheelCond ?? 1
      const fromI = this._line(key)?.from ?? cond, fromW = this._line(`w:${r.index}`)?.from ?? wc   // BUG-197
      const flat = r.flat ? '<span class="sv-flat">flat</span>' : ''
      const partners = s.combineOptions(r.index)
      const kids = [
        // A mounted tire shows its two parts, each with its own wear (owner, 2026-10-23).
        ...(m ? [`<div class="sv-row"><span class="sv-name sv-desc">Tire · ${PARTS[r.tire ?? m.tire].name}</span>${flat}${bar(cond, r.flat)}</div>`,
          `<div class="sv-row"><span class="sv-name sv-desc">Wheel · ${PARTS[r.wheel ?? m.wheel].name}</span>${bar(wc)}</div>`] : []),
        this._act('Sell it to the shop', { price: -s.ownedValue(r), hours: 0 }, btn('sellOwned', 'sell', true, `data-index="${r.index}"`)),
        ...(m ? [this._act('Split into tire and wheel', bq, btn('split', 'split', s.inventory.fits(r.wheel ?? m.wheel), `data-index="${r.index}"`, ' ok'))] : []),
        ...(partners.length ? [node('combine', 'Combine', partners.map(p => `<div class="sv-row">${chip(p.id)}<span class="sv-name">${p.name}</span>`
          + (p.flat ? '<span class="sv-flat">flat</span>' : '') + bar(p.cond ?? 1, p.flat) + `<span class="sv-cost">${cost(bq.price, bq.hours)}</span>`
          + btn('combine', 'combine', true, `data-index="${r.index}" data-with="${p.index}"`, ' ok') + `</div>`))] : []),
        ...(this._targets(key).length ? [node('repair', 'Repair', [this._repair(key, fromI, (t) => s.ownedQuote(r.index, t, false, fromI))])] : []),
        ...(m && this._targets(`w:${r.index}`).length ? [node('wheel', 'Repair the wheel', [this._repair(`w:${r.index}`, fromW, (t) => s.ownedQuote(r.index, t, true, fromW))])] : []),
        ...(r.flat ? [this._act('Patch the flat', s.patchQuote(), btn('patchOwned', 'patch', true, `data-index="${r.index}"`, ' ok'))] : []),
      ]
      return node('i' + r.index, chip(r.id) + r.name, kids, m ? pctIn('T', cond, r.flat) + pctIn('W', wc) : flat + bar(cond, r.flat), Math.min(r.flat ? 0 : cond, m ? wc : 1))
    })
    return head + this._level(rows, 0) + `</div>`
  }
}
