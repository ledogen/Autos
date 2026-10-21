/**
 * SM-3 — the service center screen. Opens when the parking brake latches at an auto shop (main.js
 * _updateParkTriggers); closes on Esc, the ×, or the brake coming off. Two tabs:
 *   Repairs — every worn track with its price and labour, and "repair all"; then the worn or flat
 *             parts in your inventory, each repaired as its own item.
 *   Parts   — per kind of part: what is fitted, the shop's parts (buy & fit) and yours (fit). A tire
 *             goes on any corner, so its buttons name the corner. A part that comes off waits on the
 *             bench: sell it or keep it.
 * The shop still posts jobs (owner, 2026-10-20): the header's "jobs" button hands over to the offer.
 *
 * Described, never scored (SM-INV-10): conditions are colour bars, parts are names, prices are money,
 * rarity is the tint behind the icon (data/parts.js RARITY_COLOR). Rules live in src/service.js; this
 * reads it and the DOM only (the inventory-screen.js layout).
 */

import { PARTS, SLOTS, RARITY_COLOR, takes, partIcon } from '../data/parts.js'
import { formatMoney } from './economy.js'
import { bandColor } from './damage-screen.js'
import { formatGameDuration } from './offer-board.js'

// UI-STYLE.md: a Story card (the shop talking) — tokens only, square panel, story buttons.
const CSS = `
#svc-screen { display: none; position: fixed; inset: 0; z-index: 95; background: rgba(6,8,10,0.45);
  align-items: center; justify-content: center; font-family: var(--font); color: var(--text-body); }
#svc-screen.open { display: flex; }
#svc-screen .sv-card { background: var(--card-bg); border: 1px solid var(--line-card);
  padding: 12px 16px 14px; width: min(480px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow-y: auto; box-sizing: border-box; }
#svc-screen .sv-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
#svc-screen .sv-title { flex: 1; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; color: var(--accent-story); }
#svc-screen .sv-wallet { font-size: 14px; color: var(--money); }
#svc-screen .sv-x { width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--line-control);
  background: transparent; color: var(--text-body); font: bold 14px var(--font); cursor: pointer; padding: 0; }
#svc-screen .sv-tabs { display: flex; gap: 4px; margin-bottom: 10px; border-bottom: 1px solid var(--line); }
#svc-screen .sv-tab { font: 14px var(--font); color: var(--text-dim); background: transparent; border: 0;
  border-bottom: 2px solid transparent; padding: 4px 10px; cursor: pointer; transition: color 0.1s; }
#svc-screen .sv-tab:hover { color: var(--text-bright); }
#svc-screen .sv-tab.on { color: var(--text-bright); border-bottom-color: var(--accent-story); }
#svc-screen .sv-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 14px; }
#svc-screen .sv-name { flex: 1; min-width: 0; }
#svc-screen .sv-row.wrap { flex-wrap: wrap; }
#svc-screen .sv-acts { flex-basis: 100%; display: flex; justify-content: flex-end; gap: 4px; }
#svc-screen .sv-desc { font-size: 12px; color: var(--text-dim); line-height: 1.35; }
#svc-screen .sv-bar { width: 60px; height: 6px; background: var(--line); overflow: hidden; flex: none; }
#svc-screen .sv-bar i { display: block; height: 100%; }
#svc-screen .sv-cost { width: 112px; text-align: right; color: var(--text-dim); font-size: 12px; flex: none; }
#svc-screen .sv-btn { font: 12px var(--font); color: var(--text-body); background: transparent; border: 1px solid var(--line-control);
  border-radius: 3px; padding: 2px 8px; cursor: pointer; flex: none; transition: background 0.1s, border-color 0.1s; }
#svc-screen .sv-btn:hover:not(:disabled) { background: rgba(255,255,255,0.09); border-color: var(--line-hover); color: var(--text-bright); }
#svc-screen .sv-btn:disabled { opacity: 0.35; cursor: default; }
#svc-screen .sv-btn.ok { border-color: var(--accept); color: var(--accept-text); }
#svc-screen .sv-slot { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--line); }
#svc-screen .sv-slot:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
#svc-screen .sv-slothead { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: var(--text-faint); margin-bottom: 2px; }
#svc-screen .sv-chip { width: 28px; height: 28px; border-radius: 3px; flex: none; background-size: contain;
  background-repeat: no-repeat; background-position: center; }
#svc-screen .sv-bench { padding: 7px 9px; margin-bottom: 10px; border: 1px solid var(--warn-line);
  background: rgba(255,176,32,0.10); color: var(--warn-text); font-size: 14px; line-height: 1.6; }
#svc-screen .sv-empty { font-size: 14px; color: var(--text-faint); padding: 6px 0; }
#svc-screen .sv-foot { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding-top: 8px;
  border-top: 1px solid var(--line); font-size: 14px; }
`

/** Condition, coloured by the damage screen's bands (the palette's one owner, UI-STYLE.md §3). */
const bar = (c, flat = false) => `<span class="sv-bar"><i style="width:${Math.round(c * 100)}%;background:${bandColor(flat ? 0 : c)}"></i></span>`
const chip = (id) => `<span class="sv-chip" style="background-color:${RARITY_COLOR[PARTS[id].rarity]}55;`
  + `background-image:url(assets/items/${partIcon(id)}.png)"></span>`
const btn = (act, label, enabled = true, data = '', cls = '') =>
  `<button class="sv-btn${cls}" data-act="${act}" ${data}${enabled ? '' : ' disabled'}>${label}</button>`
const TIRES = ['tireFL', 'tireFR', 'tireRL', 'tireRR']
const CORNER = { tireFL: 'FL', tireFR: 'FR', tireRL: 'RL', tireRR: 'RR' }
const cost = (price, hours) => `$${formatMoney(price)} · ${formatGameDuration(hours)}`

export class ServiceScreen {
  /**
   * @param {import('./service.js').ServiceCenter} service
   * @param {object} vehicleState - read-only; the brake coming off closes the screen
   * @param {object} o
   * @param {() => number} o.jobs - live offers at this shop
   * @param {() => void} o.openJobs - close the screen and hand the brake to the offer
   */
  constructor (service, vehicleState, { jobs, openJobs }) {
    this.service = service
    this.vehicleState = vehicleState
    this.jobs = jobs
    this.openJobs = openJobs
    this.isOpen = false
    this.tab = 'repairs'
    this.name = ''

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
  }

  /** `name` is the shop's sign (POI name). */
  open (name) {
    this.isOpen = true
    this.name = name
    this.tab = 'repairs'
    this.screen.classList.add('open')
    this.render()
  }

  close () {
    if (!this.isOpen) return
    this.isOpen = false
    this.service.close()
    this.screen.classList.remove('open')
  }

  /** Per frame: driving off closes it. */
  update () { if (this.isOpen && !this.vehicleState.parked) this.close() }

  _onClick (e) {
    if (e.target === this.screen) { this.close(); return }
    const b = e.target.closest('button[data-act]')
    if (!b) return
    const s = this.service, id = b.dataset.id
    switch (b.dataset.act) {
      case 'close': this.close(); return
      case 'jobs': this.close(); this.openJobs(); return
      case 'tab': this.tab = b.dataset.tab; break
      case 'repair': s.repair(id); break
      case 'repairAll': s.repairAll(); break
      case 'buy': s.buyAndFit(id, b.dataset.socket); break
      case 'stow': s.buyToBed(id); break
      case 'fit': s.fitFromInventory(+b.dataset.index, b.dataset.socket); break
      case 'repairOwned': s.repairOwned(+b.dataset.index); break
      case 'sell': s.settleOff('sell'); break
      case 'keep': s.settleOff('keep'); break
    }
    this.render()
  }

  render () {
    if (!this.isOpen) return
    const s = this.service
    const jobs = this.jobs()
    this.card.innerHTML =
      `<div class="sv-head"><span class="sv-title">${this.name} · service</span>`
      + `<span class="sv-wallet">$${formatMoney(s.money())}</span>`
      + (jobs ? btn('jobs', `jobs (${jobs})`) : '')
      + `<button class="sv-x" data-act="close" title="close (Esc)">&times;</button></div>`
      + `<div class="sv-tabs">`
      + `<button class="sv-tab${this.tab === 'repairs' ? ' on' : ''}" data-act="tab" data-tab="repairs">Repairs</button>`
      + `<button class="sv-tab${this.tab === 'parts' ? ' on' : ''}" data-act="tab" data-tab="parts">Parts</button></div>`
      + (s.off ? this._bench() : '')
      + (this.tab === 'repairs' ? this._repairs() : this._parts())
  }

  _bench () {
    const s = this.service, off = s.off
    return `<div class="sv-bench">Took off <b>${PARTS[off.id].name}</b>. `
      + `${btn('sell', `sell for $${formatMoney(s.sellValue(off.id, off.cond))}`)} ${btn('keep', 'keep it')}</div>`
  }

  _repairs () {
    const s = this.service, rows = s.repairRows(), owned = s.ownedRepairRows(), money = s.money()
    let h = ''
    if (rows.length) {
      const all = s.repairAllQuote()
      h += rows.map(r => `<div class="sv-row"><span class="sv-name">${r.label}</span>${bar(r.cond, r.flat)}`
          + `<span class="sv-cost">${cost(r.price, r.hours)}</span>`
          + btn('repair', 'repair', money + 1e-9 >= r.price, `data-id="${r.id}"`) + `</div>`).join('')
        + `<div class="sv-foot"><span class="sv-name">Everything</span><span class="sv-cost">${cost(all.price, all.hours)}</span>`
        + btn('repairAll', 'repair all', money + 1e-9 >= all.price, '', ' ok') + `</div>`
    } else h += `<div class="sv-empty">Nothing on the truck needs fixing.</div>`
    if (owned.length) {
      h += `<div class="sv-slot"><div class="sv-slothead">In the truck bed</div>`
        + owned.map(r => `<div class="sv-row">${chip(r.id)}<span class="sv-name">${PARTS[r.id].name}`
          + `${r.flat ? ' <span class="sv-desc">flat</span>' : ''}</span>${bar(r.cond, r.flat)}`
          + `<span class="sv-cost">${cost(r.price, r.hours)}</span>`
          + btn('repairOwned', 'repair', money + 1e-9 >= r.price, `data-index="${r.index}"`) + `</div>`).join('')
        + `</div>`
    }
    return h
  }

  /** One button per socket the part could go in: a plain label for a one-socket part, the corner for a tire. */
  _socketBtns (act, label, sockets, ok, data) {
    return sockets.map(([sk, enabled]) =>
      btn(act, sockets.length > 1 ? CORNER[sk] : label, ok && enabled, `${data} data-socket="${sk}"`)).join(' ')
  }

  _parts () {
    const s = this.service, money = s.money(), busy = !!s.off
    const owned = s.inventory.list()
    let h = ''
    for (const kind of [...new Set(Object.keys(SLOTS).map(takes))]) {
      const sockets = Object.keys(SLOTS).filter(sk => takes(sk) === kind)
      const tracked = SLOTS[sockets[0]].tracks.length > 0
      const head = sockets.length > 1 ? 'Tires' : SLOTS[sockets[0]].name
      h += `<div class="sv-slot"><div class="sv-slothead">${head} · ${formatGameDuration(SLOTS[sockets[0]].hours)} to swap</div>`
      for (const sk of sockets) {
        const fitted = s.parts.fitted(sk)
        h += `<div class="sv-row">${chip(fitted)}<span class="sv-name">${PARTS[fitted].name} <span class="sv-desc">`
          + `${sockets.length > 1 ? SLOTS[sk].name.toLowerCase() : 'fitted'}</span></span>`
          + (tracked ? bar(s.parts.condOf(sk), s.damage.flat[TIRES.indexOf(sk)]) : '') + `</div>`
      }
      for (const r of owned) {
        if (PARTS[r.id]?.slot !== kind) continue
        h += `<div class="sv-row">${chip(r.id)}<span class="sv-name">${PARTS[r.id].name} <span class="sv-desc">${r.flat ? 'yours, flat' : 'yours'}</span></span>`
          + (tracked ? bar(r.cond ?? 1, r.flat) : '')
          + this._socketBtns('fit', 'fit', sockets.map(sk => [sk, true]), !busy && !r.flat, `data-index="${r.index}"`) + `</div>`
      }
      for (const id of Object.keys(PARTS).filter(id => PARTS[id].slot === kind)) {
        const open = sockets.map(sk => [sk, s.parts.fitted(sk) !== id])
        if (!open.some(([, e]) => e) && kind !== 'tire') continue
        const afford = money + 1e-9 >= s.buyPrice(id)
        const buy = this._socketBtns('buy', 'buy & fit', open, !busy && afford, `data-id="${id}"`)
        h += `<div class="sv-row${sockets.length > 1 ? ' wrap' : ''}">${chip(id)}<span class="sv-name">${PARTS[id].name}<div class="sv-desc">${PARTS[id].desc}</div></span>`
          + `<span class="sv-cost">$${formatMoney(s.buyPrice(id))}</span>`
          // A tire's buttons name the corners and take their own line; it can also be bought to carry
          // (the spare, or any tire as one).
          + (sockets.length > 1 ? `<span class="sv-acts">${buy} ${btn('stow', 'to bed', afford, `data-id="${id}"`)}</span>` : buy)
          + `</div>`
      }
      h += `</div>`
    }
    return h
  }
}
