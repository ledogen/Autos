/**
 * SM-3 — the service center screen. Opens when the parking brake latches at an auto shop (main.js
 * _updateParkTriggers); closes on Esc, the ×, or the brake coming off. Two tabs:
 *   Repairs — every worn track with its price and labour, and "repair all".
 *   Parts   — per slot: what is fitted, the shop's other parts (buy & fit), and parts from your
 *             inventory (fit). A part that comes off waits on the bench: sell it or keep it.
 * The shop still posts jobs (owner, 2026-10-20): the header's "jobs" button hands over to the offer.
 *
 * Described, never scored (SM-INV-10): conditions are colour bars, parts are names, prices are money,
 * rarity is the tint behind the icon (data/parts.js RARITY_COLOR). Rules live in src/service.js; this
 * reads it and the DOM only (the inventory-screen.js layout).
 */

import { PARTS, SLOTS, RARITY_COLOR } from '../data/parts.js'
import { formatMoney } from './economy.js'
import { formatGameDuration } from './offer-board.js'

const CSS = `
#svc-screen { display: none; position: fixed; inset: 0; z-index: 95; background: rgba(6,8,10,0.45);
  align-items: center; justify-content: center; font-family: monospace; color: #e6ecf2; }
#svc-screen.open { display: flex; }
#svc-screen .sv-card { background: rgba(14,17,20,0.94); border: 1px solid #3a4450; border-radius: 8px;
  padding: 12px 16px 14px; width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow-y: auto; box-sizing: border-box; }
#svc-screen .sv-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
#svc-screen .sv-title { flex: 1; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #9fb3c8; }
#svc-screen .sv-wallet { font-size: 12px; color: #c8d2dc; }
#svc-screen .sv-x { width: 24px; height: 24px; border-radius: 50%; border: 1px solid #56616c;
  background: transparent; color: #c8d2dc; font: bold 13px monospace; cursor: pointer; padding: 0; }
#svc-screen .sv-tabs { display: flex; gap: 4px; margin-bottom: 10px; border-bottom: 1px solid #2c343d; }
#svc-screen .sv-tab { font: 12px monospace; color: #9fb3c8; background: transparent; border: 0;
  border-bottom: 2px solid transparent; padding: 4px 10px; cursor: pointer; }
#svc-screen .sv-tab.on { color: #e6ecf2; border-bottom-color: #e6ecf2; }
#svc-screen .sv-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; }
#svc-screen .sv-name { flex: 1; min-width: 0; }
#svc-screen .sv-desc { font-size: 11px; color: #6f7c88; line-height: 1.35; }
#svc-screen .sv-bar { width: 60px; height: 6px; border-radius: 3px; background: #2c343d; overflow: hidden; flex: none; }
#svc-screen .sv-bar i { display: block; height: 100%; }
#svc-screen .sv-cost { width: 104px; text-align: right; color: #9fb3c8; font-size: 11px; flex: none; }
#svc-screen .sv-btn { font: 11px monospace; color: #c8d2dc; background: transparent; border: 1px solid #56616c;
  border-radius: 3px; padding: 2px 8px; cursor: pointer; flex: none; }
#svc-screen .sv-btn:hover:not(:disabled) { border-color: #c8d2dc; }
#svc-screen .sv-btn:disabled { opacity: 0.35; cursor: default; }
#svc-screen .sv-slot { margin-top: 10px; padding-top: 8px; border-top: 1px solid #2c343d; }
#svc-screen .sv-slot:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
#svc-screen .sv-slothead { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #6f7c88; margin-bottom: 2px; }
#svc-screen .sv-chip { width: 22px; height: 22px; border-radius: 4px; flex: none; background-size: contain;
  background-repeat: no-repeat; background-position: center; }
#svc-screen .sv-bench { padding: 7px 9px; margin-bottom: 10px; border-radius: 4px;
  border: 1px solid #c9a24a; background: rgba(201,162,74,0.10); font-size: 12px; line-height: 1.6; }
#svc-screen .sv-empty { font-size: 12px; color: #6f7c88; padding: 6px 0; }
#svc-screen .sv-foot { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding-top: 8px;
  border-top: 1px solid #2c343d; font-size: 12px; }
`

/** Condition → the damage screen's green-through-red. */
const condColor = (c) => `hsl(${Math.round(120 * Math.max(0, Math.min(1, c)))}, 60%, 45%)`
const bar = (c) => `<span class="sv-bar"><i style="width:${Math.round(c * 100)}%;background:${condColor(c)}"></i></span>`
const meanCond = (cond) => { const v = Object.values(cond ?? {}); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 1 }
const chip = (id) => `<span class="sv-chip" style="background-color:${RARITY_COLOR[PARTS[id].rarity]}55;`
  + `background-image:url(assets/items/${PARTS[id].slot}.png)"></span>`
const btn = (act, label, enabled = true, data = '') =>
  `<button class="sv-btn" data-act="${act}" ${data}${enabled ? '' : ' disabled'}>${label}</button>`
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
      case 'buy': s.buyAndFit(id); break
      case 'fit': s.fitFromInventory(+b.dataset.index); break
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
    const s = this.service, rows = s.repairRows(), money = s.money()
    if (!rows.length) return `<div class="sv-empty">Nothing needs fixing.</div>`
    const all = s.repairAllQuote()
    return rows.map(r => `<div class="sv-row"><span class="sv-name">${r.label}</span>${bar(r.cond)}`
        + `<span class="sv-cost">${cost(r.price, r.hours)}</span>`
        + btn('repair', 'repair', money + 1e-9 >= r.price, `data-id="${r.id}"`) + `</div>`).join('')
      + `<div class="sv-foot"><span class="sv-name">Everything</span><span class="sv-cost">${cost(all.price, all.hours)}</span>`
      + btn('repairAll', 'repair all', money + 1e-9 >= all.price) + `</div>`
  }

  _parts () {
    const s = this.service, money = s.money(), stock = s.stock(), busy = !!s.off
    const owned = s.inventory.list()
    let h = ''
    for (const slot of Object.keys(SLOTS)) {
      const fitted = s.parts.fitted(slot)
      const tracks = SLOTS[slot].tracks
      h += `<div class="sv-slot"><div class="sv-slothead">${SLOTS[slot].name} · ${formatGameDuration(SLOTS[slot].hours)} to swap</div>`
        + `<div class="sv-row">${chip(fitted)}<span class="sv-name">${PARTS[fitted].name} <span class="sv-desc">fitted</span></span>`
        + (tracks.length ? bar(meanCond(s.parts.condOf(slot))) : '') + `</div>`
      for (const r of owned) {
        if (PARTS[r.id]?.slot !== slot) continue
        h += `<div class="sv-row">${chip(r.id)}<span class="sv-name">${PARTS[r.id].name} <span class="sv-desc">yours</span></span>`
          + (tracks.length ? bar(meanCond(r.cond)) : '') + btn('fit', 'fit', !busy, `data-index="${r.index}"`) + `</div>`
      }
      for (const id of stock[slot]) {
        h += `<div class="sv-row">${chip(id)}<span class="sv-name">${PARTS[id].name}<div class="sv-desc">${PARTS[id].desc}</div></span>`
          + `<span class="sv-cost">$${formatMoney(s.buyPrice(id))}</span>`
          + btn('buy', 'buy & fit', !busy && money + 1e-9 >= s.buyPrice(id), `data-id="${id}"`) + `</div>`
      }
      h += `</div>`
    }
    return h
  }
}
