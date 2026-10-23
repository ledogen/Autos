/**
 * SM-3 — the service center screen. Opens when the parking brake latches at an auto shop (main.js
 * _updateParkTriggers); closes on Esc, the ×, or the brake coming off. While it is open the camera
 * holds a front three-quarter view of the truck (main.js, through `onView`) — it's a modification
 * game, and the player should see the truck — so the card docks to the side. Two tabs (owner,
 * 2026-10-22):
 *   My Vehicle — everything installed and its condition, grouped. Selecting a row offers REPAIR (a
 *                repairable class: set how far with ◀ ▶, ←/→ or the D-pad, in 5% steps up to the
 *                bench's cap; price and hours follow live) and EXCHANGE (a part you own that fits that
 *                socket, or a mounted pair on a corner). Alignment has one "straighten"; a flat has
 *                "patch"; replace-only parts only exchange.
 *   Parts Shop — ONLY this shop's shelf right now (src/shop-stock.js): name, new or used and its
 *                condition, price, and how long before it's gone. Buy & fit (a tire or wheel names its
 *                corner) or buy to carry. Hovering — or pad-focusing — an item fits it on the truck for
 *                a look (ServiceCenter.preview), on the corner under the pointer or else the worst one;
 *                moving off puts back exactly what was there.
 *                My Items, below it: sell the parts you carry, and repair or patch them as their own items.
 * A part that comes off waits on the bench: sell it or keep it. The shop still posts jobs (owner,
 * 2026-10-20): the header's "jobs" button hands over to the offer. "map" opens the map over the
 * screen (owner, 2026-10-21); the screen hides under it and the clock stays held.
 *
 * Described, never scored (SM-INV-10): parts are names, prices are money, conditions are colour bars
 * with their percentage (wear is a state, not a score: owner, 2026-10-22),
 * rarity is the tint behind the icon (data/parts.js RARITY_COLOR). Rules live in src/service.js; this
 * reads it and the DOM only (the inventory-screen.js layout).
 */

import { PARTS, SLOTS, REPAIRS, REPAIR_CAP, RARITY_COLOR, socketsFor } from '../data/parts.js'
import { ITEMS } from '../data/items.js'
import { TRACKS } from './damage.js'
import { formatMoney } from './economy.js'
import { bandColor } from './damage-screen.js'
import { formatGameDuration } from './offer-board.js'
import { shelfName } from './shop-stock.js'
import { BACK_BUTTON } from './park-badge.js'

// UI-STYLE.md: a Story card (the shop talking) — tokens only, square panel, story buttons. The screen
// itself lets the pointer through, so a drag on the world still orbits the camera round the truck.
const CSS = `
#svc-screen { display: none; position: fixed; top: 0; right: 0; bottom: 0; z-index: 95; pointer-events: none;
  align-items: center; padding: 0 16px; font-family: var(--font); color: var(--text-body); }
#svc-screen.open { display: flex; }
body.map-open #svc-screen { visibility: hidden; }
body:has(#svc-screen.open) #quickjob-btn { visibility: hidden; }   /* it sits where the card docks */
#svc-screen .sv-card { pointer-events: auto; background: var(--card-bg); border: 1px solid var(--line-card);
  padding: 12px 16px 14px; width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow-y: auto; box-sizing: border-box; }
#svc-screen .sv-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
#svc-screen .sv-title { flex: 1; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; color: var(--accent-story); }
#svc-screen .sv-wallet { font-size: 14px; color: var(--money); }
#svc-screen .sv-tabs { display: flex; gap: 4px; margin-bottom: 10px; border-bottom: 1px solid var(--line); }
#svc-screen .sv-tab { font: 14px var(--font); color: var(--text-dim); background: transparent; border: 0;
  border-bottom: 2px solid transparent; padding: 4px 10px; cursor: pointer; transition: color 0.1s; }
#svc-screen .sv-tab:hover { color: var(--text-bright); }
#svc-screen .sv-tab.on { color: var(--text-bright); border-bottom-color: var(--accent-story); }
#svc-screen .sv-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 14px; }
#svc-screen .sv-line { display: flex; align-items: center; gap: 8px; width: 100%; padding: 4px 6px; margin: 0 -6px;
  box-sizing: content-box; font: 14px var(--font); color: var(--text-body); text-align: left; background: transparent;
  border: 0; cursor: pointer; transition: background 0.1s; }
#svc-screen .sv-line:hover, #svc-screen .sv-line.on { background: rgba(255,255,255,0.09); color: var(--text-bright); }
#svc-screen .sv-name { flex: 1; min-width: 0; }
#svc-screen .sv-row.wrap { flex-wrap: wrap; }
#svc-screen .sv-acts { flex-basis: 100%; display: flex; justify-content: flex-end; gap: 4px; }
#svc-screen .sv-desc { font-size: 12px; color: var(--text-dim); line-height: 1.35; }
#svc-screen .sv-flat { font-size: 12px; color: var(--bad-text); }
#svc-screen .sv-bar { width: 60px; height: 6px; background: var(--line); overflow: hidden; flex: none; }
#svc-screen .sv-bar i { display: block; height: 100%; }
#svc-screen .sv-part { padding-left: 40px; }
#svc-screen .sv-pct { width: 36px; text-align: right; color: var(--text-dim); font-size: 12px; flex: none; }
#svc-screen .sv-cost { width: 112px; text-align: right; color: var(--text-dim); font-size: 12px; flex: none; }
#svc-screen .sv-btn { font: 12px var(--font); color: var(--text-body); background: transparent; border: 1px solid var(--line-control);
  border-radius: 3px; padding: 2px 8px; cursor: pointer; flex: none; transition: background 0.1s, border-color 0.1s; }
#svc-screen .sv-btn:hover:not(:disabled) { background: rgba(255,255,255,0.09); border-color: var(--line-hover); color: var(--text-bright); }
#svc-screen .sv-btn:disabled { opacity: 0.35; cursor: default; }
#svc-screen .sv-btn.ok { border-color: var(--accept); color: var(--accept-text); }
#svc-screen .sv-panel { margin: 2px 0 8px; padding: 6px 8px; border-left: 2px solid var(--accent-story); background: rgba(255,255,255,0.04); }
#svc-screen .sv-sub { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: var(--text-faint); margin-top: 6px; }
#svc-screen .sv-sub:first-child { margin-top: 0; }
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
#svc-screen .sv-chip { width: 28px; height: 28px; border-radius: 3px; flex: none; background-size: contain;
  background-repeat: no-repeat; background-position: center; }
#svc-screen .sv-bench { padding: 7px 9px; margin-bottom: 10px; border: 1px solid var(--warn-line);
  background: rgba(255,176,32,0.10); color: var(--warn-text); font-size: 14px; line-height: 1.6; }
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
const cost = (price, hours) => `$${formatMoney(price)} · ${formatGameDuration(hours)}`
/** A many-socket part's button names where it goes: a corner (FL…RR) or a side (left / right). */
const where = (sk) => /[FR][LR]$/.test(sk) ? sk.slice(-2) : { L: 'left', R: 'right' }[sk.slice(-1)]
const dim = (t) => `<div class="sv-empty">${t}</div>`
const isFlat = (d, track) => TRACKS[track]?.cls === 'tire' && d.flat[TRACKS[track].wheel]

/** My Vehicle: the heading names the component, a row names only where it sits (owner, 2026-10-23).
 *  A key is a socket (data/parts.js SLOTS) or, for what has no part, a track; a row with no label
 *  is a component of its own and keeps its name. */
const CORNERS = [['FL', 'Front left'], ['FR', 'Front right'], ['RL', 'Rear left'], ['RR', 'Rear right']]
const corners = (k) => CORNERS.map(([c, l]) => [k + c, l])
const axles = (k) => [[k + 'Front', 'Front'], [k + 'Rear', 'Rear']]
const GROUPS = [
  ['Wheels', corners('wheel')],
  ['Tires', corners('tire')],
  ['Alignment', corners('align')],
  ['Brakes', axles('brakes')],
  ['Springs', axles('springs')],
  ['Shocks', axles('dampers')],
  ['Anti-roll bars', axles('arb')],
  ['Lift', [['lift']]],
  ['Engine & drivetrain', [['engine'], ['radiator'], ['airFilter'], ['transmission'], ['diff']]],
  ['Headlights', [['headlightL', 'Left'], ['headlightR', 'Right']]],
  ['Armor', [['armorFront', 'Front'], ['armorLeft', 'Left'], ['armorRight', 'Right'], ['armorRear', 'Rear']]],
]

export class ServiceScreen {
  /**
   * @param {import('./service.js').ServiceCenter} service
   * @param {object} vehicleState - read-only; the brake coming off closes the screen
   * @param {object} o
   * @param {() => number} o.jobs - live offers at this shop
   * @param {() => void} o.openJobs - close the screen and hand the brake to the offer
   * @param {() => void} o.openMap - show the map over the screen
   * @param {() => number} o.nowH - the game clock (daySystem.clockH): the shelf's time left
   * @param {(open:boolean) => void} o.onView - the screen opened / closed (main.js: the camera)
   */
  constructor (service, vehicleState, { jobs, openJobs, openMap, nowH, onView }) {
    this.service = service
    this.vehicleState = vehicleState
    Object.assign(this, { jobs, openJobs, openMap, nowH, onView })
    this.isOpen = false
    this.tab = 'vehicle'
    this.name = ''
    this.sel = null       // the selected row's key: a My Vehicle key, or `i:<inventory index>` in My Items
    this.target = {}      // repair key → the chosen target condition
    this._pv = null       // the live preview's `slot:socket`, or null
    this._mouse = true    // the last input was the pointer (else keys / the pad, which move .nav-focus)

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
    this.screen.addEventListener('mousemove', () => { this._mouse = true })
    window.addEventListener('keydown', () => { this._mouse = false }, true)
  }

  /** `name` is the shop's sign (POI name). */
  open (name) {
    this.isOpen = true
    this.name = name
    this.tab = 'vehicle'
    this.sel = null
    this.target = {}
    this.screen.classList.add('open')
    this.onView(true)
    this.render()
  }

  close () {
    if (!this.isOpen) return
    this.isOpen = false
    this._pv = null
    this.service.close()
    this.screen.classList.remove('open')
    this.onView(false)
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
    const row = el?.closest('.sv-shelf')
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
    const [k, v] = key.split(':')
    return k === 'v' ? this.service.targets(v) : this.service.ownedRepairRows().find(r => r.index === +v)?.targets ?? []
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
    switch (b.dataset.act) {
      case 'close': this.close(); return
      case 'jobs': this.close(); this.openJobs(); return
      case 'map': this.openMap(); return
      case 'tab': this.tab = b.dataset.tab; this.sel = null; break
      case 'sel': this.sel = this.sel === key ? null : key; break
      case 'step': {
        const d = e.target.closest('.sel-prev') ? -1 : e.target.closest('.sel-next') ? 1 : 0
        const ts = this._targets(key)
        this.target[key] = ts[Math.max(0, Math.min(ts.length - 1, ts.indexOf(this._target(key)) + d))]
        break
      }
      case 'repair': {
        const [k, v] = key.split(':')
        if (k === 'v') s.repair(v, this._target(key))
        else s.repairOwned(+v, this._target(key))
        break
      }
      case 'patch': s.patch(b.dataset.track); break
      case 'patchOwned': s.patchOwned(+b.dataset.index); break
      case 'exchange': s.exchange(+b.dataset.index, b.dataset.socket); break
      case 'sellOwned': s.sellOwned(+b.dataset.index); this.sel = null; break
      case 'split': s.split(+b.dataset.index); this.sel = null; break
      case 'combine': s.combine(+b.dataset.index, +b.dataset.with); this.sel = null; break
      case 'buy': s.buyAndFit(+b.dataset.slot, b.dataset.socket); break
      case 'stow': s.buyToInventory(+b.dataset.slot); break
      case 'sell': s.settleOff('sell'); break
      case 'keep': s.settleOff('keep'); break
    }
    this.render()
  }

  render () {
    if (!this.isOpen) return
    const s = this.service
    const jobs = this.jobs()
    const tab = (id, label) => `<button class="sv-tab${this.tab === id ? ' on' : ''}" data-act="tab" data-tab="${id}">${label}</button>`
    this.card.innerHTML =
      `<div class="sv-head"><span class="sv-title">${this.name} · service</span>`
      + `<span class="sv-wallet">$${formatMoney(s.money())}</span>`
      + btn('map', 'map')
      + (jobs ? btn('jobs', `jobs (${jobs})`) : '')
      + `</div>`
      + `<div class="sv-tabs">${tab('vehicle', 'My Vehicle')}${tab('shop', 'Parts Shop')}</div>`
      + (s.off ? this._bench() : '')
      + (this.tab === 'vehicle' ? this._vehicle() : this._shop())
      + BACK_BUTTON   // the card's way out (owner, 2026-10-21: replaces the corner ×)
  }

  _bench () {
    const s = this.service, off = s.off
    return `<div class="sv-bench">Took off <b>${PARTS[off.id].name}</b>. `
      + `${btn('sell', `sell for $${formatMoney(s.sellValue(off.id, off.cond))}`)} ${btn('keep', 'keep it')}</div>`
  }

  // ── My Vehicle ─────────────────────────────────────────────────────────────────────────────────

  _vehicle () {
    const d = this.service.damage
    return GROUPS.map(([title, keys]) => `<div class="sv-slot"><div class="sv-slothead">${title}</div>`
      + keys.filter(([k]) => !TRACKS[k]?.manualOnly || d.manualBox).map(([k, label]) => this._vehicleRow(k, label)).join('') + `</div>`).join('')
  }

  _vehicleRow (k, label) {
    const s = this.service, d = s.damage
    const socket = SLOTS[k] ? k : null
    const track = socket ? SLOTS[k].tracks[0] : k
    const part = socket && s.parts.fitted(socket)
    const flat = isFlat(d, track)
    const open = this.sel === k
    return `<button class="sv-line${open ? ' on' : ''}" data-act="sel" data-key="${k}">`
      + `<span class="sv-name">${label ?? (socket ? SLOTS[k].name : TRACKS[k].label)}`
      + `${part && !PARTS[part].stock ? ` <span class="sv-desc">${PARTS[part].name}</span>` : ''}</span>`   // only what isn't factory
      + (flat ? '<span class="sv-flat">flat</span>' : '')
      + (track ? bar(d.get(track), flat) : '') + `</button>`
      + (open ? `<div class="sv-panel">${this._vehicleActs(socket, track, flat)}</div>` : '')
  }

  _vehicleActs (socket, track, flat) {
    const s = this.service, money = s.money(), cls = track && TRACKS[track].cls
    let h = ''
    if (cls === 'alignment') {
      const q = s.repairQuote(track, 1)
      h += s.targets(track).length
        ? `<div class="sv-row"><span class="sv-name">Straighten it</span><span class="sv-cost">${cost(q.price, q.hours)}</span>`
          + btn('repair', 'straighten', money + 1e-9 >= q.price, `data-key="v:${track}"`, ' ok') + `</div>`
        : dim('Straight.')
    } else if (cls && REPAIRS[cls]) {
      h += `<div class="sv-sub">Repair</div>` + this._repair(`v:${track}`, s.damage.get(track), (t) => s.repairQuote(track, t))
    } else if (cls) {
      h += dim('Replace only: exchange it for one you carry, or buy one off a shelf.')
    }
    if (flat) {
      const q = s.patchQuote()
      h += `<div class="sv-row"><span class="sv-name">Patch the flat <span class="sv-desc">the hole, not the wear</span></span>`
        + `<span class="sv-cost">${cost(q.price, q.hours)}</span>` + btn('patch', 'patch', money + 1e-9 >= q.price, `data-track="${track}"`, ' ok') + `</div>`
    }
    if (socket) {
      const opts = s.exchangeOptions(socket)
      h += `<div class="sv-sub">Exchange</div>`
        + (opts.length ? opts.map(r => {
            const q = s.fitLabour(r.id, socket)
            return `<div class="sv-row">${chip(r.id)}<span class="sv-name">${r.name}</span>${bar(r.cond ?? 1)}`
              + `<span class="sv-cost">${cost(q.price, q.hours)}</span>`
              + btn('exchange', 'exchange', !s.off && money + 1e-9 >= q.price, `data-index="${r.index}" data-socket="${socket}"`) + `</div>`
          }).join('')
          : dim('Nothing you carry fits here.'))
    }
    return h
  }

  /** The repair stepper: ◀ bar ▶ (←/→ and the D-pad step it through menu-nav's .sel-prev / .sel-next),
   *  then the live price and the confirm button. Nothing to do at or above the bench's cap. */
  _repair (key, cond, quote) {
    if (!this._targets(key).length) return dim('As good as the bench gets it. Only a new one is better.')
    const t = this._target(key), q = quote(t)
    return `<button class="sv-step" data-act="step" data-key="${key}" title="← → set how far">`
      + `<i class="sel-prev">◀</i>${hbar(cond, t)}<i class="sel-next">▶</i>`
      + `<span class="sv-pct">${Math.round(cond * 100)}% → ${Math.round(t * 100)}%</span></button>`
      + `<div class="sv-row"><span class="sv-name sv-desc">You can only repair to ${Math.round(REPAIR_CAP * 100)}%, otherwise fit a new component.</span>`
      + `<span class="sv-cost">${cost(q.price, q.hours)}</span>`
      + btn('repair', 'repair', this.service.money() + 1e-9 >= q.price, `data-key="${key}"`, ' ok') + `</div>`
  }

  // ── Parts Shop ─────────────────────────────────────────────────────────────────────────────────

  _shop () {
    const s = this.service, money = s.money(), now = this.nowH()
    let h = `<div class="sv-slot"><div class="sv-slothead">On the shelf</div>`
    s.stock().forEach((e, i) => {
      if (!e) { h += dim('An empty shelf.'); return }
      const price = s.shelfPrice(i), sockets = socketsFor(e.id)
      const fitQ = sockets.length ? s.fitLabour(e.id, sockets[0]) : { price: 0 }
      const ok = !s.off && money + 1e-9 >= price + fitQ.price
      const fit = sockets.length > 1
        ? sockets.map(sk => btn('buy', where(sk), ok, `data-slot="${i}" data-socket="${sk}"`)).join(' ')
        : sockets.length ? btn('buy', 'buy & fit', ok, `data-slot="${i}" data-socket="${sockets[0]}"`) : ''
      const state = e.cond === null ? '' : e.cond >= 1 ? 'new · ' : 'used · '
      h += `<div class="sv-row wrap sv-shelf" data-slot="${i}">${chip(e.id)}<span class="sv-name">${shelfName(e)}`
        + ` <span class="sv-desc">${state}gone in ${formatGameDuration(e.expiresAt - now)}`
        + `${fitQ.price ? ` · fitting $${formatMoney(fitQ.price)}` : ''}</span>`
        + `<div class="sv-desc">${PARTS[e.id]?.desc ?? ITEMS[e.id].desc}</div></span>`
        + (e.cond !== null ? bar(e.cond) : '') + `<span class="sv-cost">$${formatMoney(price)}</span>`
        + `<span class="sv-acts">${fit} ${btn('stow', 'to inventory', money + 1e-9 >= price, `data-slot="${i}"`)}</span></div>`
    })
    return h + `</div>` + this._myItems()
  }

  _myItems () {
    const s = this.service, money = s.money()
    const fix = new Map(s.ownedRepairRows().map(r => [r.index, r]))
    const owned = s.inventory.list().filter(r => r.kind === 'part')
    let h = `<div class="sv-slot"><div class="sv-slothead">My items</div>`
    if (!owned.length) return h + dim('You carry no parts.') + `</div>`
    for (const r of owned) {
      const key = `i:${r.index}`, open = this.sel === key, cond = r.cond ?? 1
      const m = PARTS[r.id].mounted
      const flat = r.flat ? '<span class="sv-flat">flat</span>' : ''
      // A mounted tire shows its two parts, each with its own wear (owner, 2026-10-23).
      h += `<button class="sv-line${open ? ' on' : ''}" data-act="sel" data-key="${key}">${chip(r.id)}<span class="sv-name">${r.name}</span>`
        + (m ? '' : flat + bar(cond, r.flat)) + `</button>`
        + (m ? `<div class="sv-row sv-part"><span class="sv-name sv-desc">Tire · ${PARTS[r.tire ?? m.tire].name}</span>${flat}${bar(cond, r.flat)}</div>`
          + `<div class="sv-row sv-part"><span class="sv-name sv-desc">Wheel · ${PARTS[r.wheel ?? m.wheel].name}</span>${bar(r.wheelCond ?? 1)}</div>` : '')
      if (!open) continue
      const bq = s.beadQuote(), canBead = money + 1e-9 >= bq.price
      h += `<div class="sv-panel"><div class="sv-row"><span class="sv-name">Sell it to the shop</span>`
        + btn('sellOwned', `sell for $${formatMoney(s.ownedValue(r))}`, true, `data-index="${r.index}"`) + `</div>`
      if (m) {
        h += `<div class="sv-row"><span class="sv-name">Split into tire and wheel</span><span class="sv-cost">${cost(bq.price, bq.hours)}</span>`
          + btn('split', 'split', canBead && s.inventory.fits(r.wheel ?? m.wheel), `data-index="${r.index}"`, ' ok') + `</div>`
      }
      const partners = s.combineOptions(r.index)
      if (partners.length) {
        h += `<div class="sv-sub">Combine · ${cost(bq.price, bq.hours)}</div>`
          + partners.map(p => `<div class="sv-row">${chip(p.id)}<span class="sv-name">${p.name}</span>`
            + (p.flat ? '<span class="sv-flat">flat</span>' : '') + bar(p.cond ?? 1, p.flat)
            + btn('combine', 'combine', canBead, `data-index="${r.index}" data-with="${p.index}"`, ' ok') + `</div>`).join('')
      }
      if (fix.get(r.index)?.targets.length) h += `<div class="sv-sub">Repair</div>` + this._repair(key, cond, (t) => s.ownedQuote(r.index, t))
      if (r.flat) {
        const q = s.patchQuote()
        h += `<div class="sv-row"><span class="sv-name">Patch the flat</span><span class="sv-cost">${cost(q.price, q.hours)}</span>`
          + btn('patchOwned', 'patch', money + 1e-9 >= q.price, `data-index="${r.index}"`, ' ok') + `</div>`
      }
      h += `</div>`
    }
    return h + `</div>`
  }
}
