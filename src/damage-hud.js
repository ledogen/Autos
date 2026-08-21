/**
 * SM-3 damage readout — the driver's-seat view of the condition model.
 *
 * Toggled with **V**, hidden by default, and it costs nothing at all while hidden (the update
 * returns on the first line). Visible, it refreshes at 10 Hz, not per frame — condition moves on
 * the scale of minutes, so a 60 Hz DOM rewrite would be pure waste.
 *
 * Three panes, because there are three different questions to answer while driving:
 *
 *   CONDITION — every track at once, with its wear RATE beside it. The rate is the load-bearing
 *     half. A condition number tells you where you are; the rate tells you what the drive you are
 *     doing right now is costing, which is the only way to judge whether a wear signal is honest.
 *     It is measured here by differencing the conditions over a moving window rather than asking
 *     the model, so it always describes what actually happened to the truck.
 *
 *   SIGNALS — the raw per-corner quantities the wear tracks integrate, each against the floor it
 *     has to clear before it does any harm. This exists for one specific open question (the damper
 *     and wheel tracks ride on strutCompVel, a 4-substep explicit-Euler value that may be too noisy
 *     to honestly decide when a part takes damage): if normal road driving sits above a floor, that
 *     floor is wrong or the signal is noise, and you can see which from the seat.
 *
 *   IMPACTS — the last few landed collisions. A crash is over in a tenth of a second, so without a
 *     log there is no way to tell a registered hit from a missed one.
 *
 * This is the DIAGNOSTIC readout, not the damage GUI. The ratified GUI is a top-down schematic of
 * the truck shading green to red, and it replaces the CONDITION pane when it is built; the other
 * two panes are development instruments and go away with them.
 */

import { TRACKS, TRACK_IDS, DAMAGE_PARAMS, MPH } from './damage.js'

const REFRESH_S = 0.1     // 10 Hz — condition moves on the scale of minutes
const RATE_WINDOW_S = 3   // moving window the wear rate is measured over

// Track classes in display order, with the heading each group sits under.
const GROUPS = [
  ['armor',     'Armor'],
  ['tire',      'Tires'],
  ['wheel',     'Wheels'],
  ['spring',    'Springs'],
  ['damper',    'Dampers'],
  ['brake',     'Brakes'],
  ['engine',    'Engine'],
  ['radiator',  'Radiator'],
  ['headlights', 'Lights'],
  ['alignment', 'Alignment'],
]

/** Green at full health through amber to red at zero — the same ramp the ratified GUI will use. */
function conditionColor (c) {
  const h = Math.max(0, Math.min(1, c)) * 120     // 0 = red, 120 = green
  return `hsl(${h.toFixed(0)}, 70%, ${c < 0.15 ? 58 : 45}%)`
}

const CSS = `
#dmg-hud { position: fixed; top: 6px; right: 6px; width: 470px; max-height: calc(100vh - 12px);
  overflow-y: auto; z-index: 95; display: none; padding: 6px 8px 8px;
  font: 10px/1.25 ui-monospace, Menlo, Consolas, monospace; color: #dfe4dc;
  background: rgba(16, 18, 16, 0.88); border: 1px solid rgba(255,255,255,0.14); border-radius: 4px;
  backdrop-filter: blur(3px); }
#dmg-hud h4 { margin: 6px 0 2px; font-size: 9px; letter-spacing: 0.09em; text-transform: uppercase;
  color: #8c9a88; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.10); padding-bottom: 1px; }
#dmg-hud .dh-title { font-size: 10px; letter-spacing: 0.10em; text-transform: uppercase; color: #c8d2c4;
  margin-bottom: 2px; }
#dmg-hud .dh-off { color: #d08a4a; }
/* Two columns: the condition pane is 26 tracks and would otherwise push the panes that matter
   (signals, impacts) off the bottom of the screen. */
#dmg-hud .dh-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; align-items: start; }
#dmg-hud .dh-row { display: grid; grid-template-columns: 72px 1fr 28px 62px; gap: 4px; align-items: center;
  height: 12px; }
#dmg-hud .dh-lbl { color: #a8b2a4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* display:block matters — an inline span ignores height, which renders every bar as flat background. */
#dmg-hud .dh-bar { display: block; height: 5px; background: rgba(255,255,255,0.10); border-radius: 1px;
  overflow: hidden; }
#dmg-hud .dh-fill { display: block; height: 5px; }
#dmg-hud .dh-pct { text-align: right; }
#dmg-hud .dh-rate { text-align: right; color: #6f7a6c; font-size: 9px; }
#dmg-hud .dh-rate.hot { color: #e0a25c; }
#dmg-hud .dh-sig { display: grid; grid-template-columns: 78px repeat(4, 1fr); gap: 4px; height: 12px; }
#dmg-hud .dh-sig span { text-align: right; }
#dmg-hud .dh-sig span:first-child { text-align: left; color: #a8b2a4; }
#dmg-hud .dh-sig .over { color: #e0705c; font-weight: 600; }
#dmg-hud .dh-note { color: #6f7a6c; font-size: 9px; margin-top: 2px; }
#dmg-hud .dh-imp { color: #c8d2c4; white-space: pre; }
#dmg-hud .dh-imp.fatal { color: #e0705c; font-weight: 600; }
#dmg-hud .dh-none { color: #6f7a6c; }
`

export class DamageHUD {
  /**
   * @param {import('./damage.js').DamageModel} model
   * @param {object} vehicleState - read-only; the SIGNALS pane reads per-corner probes off it.
   */
  constructor (model, vehicleState) {
    this.model = model
    this.vehicleState = vehicleState
    this.visible = false
    this.impacts = []          // most recent first, capped
    this._acc = 0
    this._history = []         // [{t, condition:{...}}] for the wear-rate window
    this._t = 0

    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)

    this.el = document.createElement('div')
    this.el.id = 'dmg-hud'
    document.body.appendChild(this.el)

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'v' && e.key !== 'V') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      this.toggle()
    })
  }

  toggle (on = !this.visible) {
    this.visible = on
    this.el.style.display = on ? 'block' : 'none'
    if (on) { this._history.length = 0; this._acc = REFRESH_S }   // redraw immediately
  }

  /** Record a landed impact for the IMPACTS pane. Called whether or not the pane is open. */
  noteImpact (landed) {
    this.impacts.unshift(landed)
    if (this.impacts.length > 6) this.impacts.pop()
  }

  /** @param {number} dt - real seconds since the last frame. */
  update (dt) {
    if (!this.visible) return
    this._t += dt
    this._acc += dt
    if (this._acc < REFRESH_S) return
    this._acc = 0

    // Wear rate over a moving window: %/min of condition lost. Differencing the actual conditions
    // means the rate always describes what happened, even if a track is worn by something the
    // model gains later.
    const snap = { t: this._t, c: { ...this.model.condition } }
    this._history.push(snap)
    while (this._history.length > 1 && snap.t - this._history[0].t > RATE_WINDOW_S) this._history.shift()
    const base = this._history[0]
    const span = snap.t - base.t
    const rate = (id) => (span > 0.5 ? (base.c[id] - snap.c[id]) / span * 60 * 100 : 0)

    this.el.innerHTML = this._render(rate)
  }

  _render (rate) {
    const P = DAMAGE_PARAMS
    const d = this.model
    const out = [`<div class="dh-title">Damage${P.enabled ? '' : ' <span class="dh-off">— disabled, held at nominal</span>'}</div>`]

    // Two columns, split at the halfway point by row count so neither runs much longer.
    const cols = [[], []]
    let placed = 0
    const total = TRACK_IDS.length + GROUPS.length
    for (const [cls, heading] of GROUPS) {
      const ids = TRACK_IDS.filter(id => TRACKS[id].cls === cls)
      if (!ids.length) continue
      const col = cols[placed * 2 >= total ? 1 : 0]
      placed += ids.length + 1
      col.push(`<h4>${heading}</h4>`)
      for (const id of ids) {
        const c = d.get(id)
        const r = rate(id)
        // Alignment's condition is a READOUT of how bent it is, so show the bend itself too —
        // that is the quantity that actually reaches the physics.
        // Alignment and wheels show their SYMPTOM rather than a wear rate: for those two the
        // condition number is a summary, and the bend in degrees / the runout in mm is the quantity
        // that actually reaches the physics. Runout in particular is an OUTPUT of wheel condition —
        // nothing derives wear from it — so it belongs here beside the wheel, never in SIGNALS.
        const cls = TRACKS[id].cls
        const extra = cls === 'alignment'
          ? `${d.camberOffsetDeg[TRACKS[id].wheel] >= 0 ? '+' : ''}${d.camberOffsetDeg[TRACKS[id].wheel].toFixed(2)}°cam`
          : cls === 'wheel'
            ? `${(d.wheelRunout(TRACKS[id].wheel) * 1000).toFixed(1)}mm o-o-r`
            : (r > 0.005 ? `${r.toFixed(2)}%/min` : '')
        col.push(
          `<div class="dh-row"><span class="dh-lbl">${TRACKS[id].label}</span>` +
          `<span class="dh-bar"><span class="dh-fill" style="width:${(c * 100).toFixed(1)}%;background:${conditionColor(c)}"></span></span>` +
          `<span class="dh-pct">${(c * 100).toFixed(0)}%</span>` +
          `<span class="dh-rate${r > 0.05 ? ' hot' : ''}">${extra}</span></div>`)
      }
    }
    out.push(`<div class="dh-cols"><div>${cols[0].join('')}</div><div>${cols[1].join('')}</div></div>`)

    // ── SIGNALS: the raw wear inputs against the floors they must clear ────────────────────────
    const vs = this.vehicleState
    const fmt = (v, floor, dp = 1) => `<span class="${v > floor ? 'over' : ''}">${v.toFixed(dp)}</span>`
    const corner = (arr, floor, dp = 1) => [0, 1, 2, 3].map(i => fmt(Math.abs(arr?.[i] || 0), floor, dp)).join('')
    out.push('<h4>Signals — wear INPUTS, per corner, red is above the floor</h4>')
    out.push('<div class="dh-sig"><span>&nbsp;</span><span>FL</span><span>FR</span><span>RL</span><span>RR</span></div>')
    out.push(`<div class="dh-sig"><span>slip m/s</span>${corner(vs.slipVel, P.tireSlipFloor, 2)}</div>`)
    out.push(`<div class="dh-sig"><span>bump kN</span>${[0, 1, 2, 3].map(i =>
      fmt(Math.abs(vs.bumpForce?.[i] || 0) / 1000, P.springForceFloor / 1000, 1)).join('')}</div>`)
    out.push(`<div class="dh-sig"><span>strut m/s</span>${corner(vs.strutCompVel, P.damperVelFloor, 2)}</div>`)
    out.push(`<div class="dh-note">floors — slip ${P.tireSlipFloor} m/s · bump ${(P.springForceFloor / 1000).toFixed(0)} kN`
      + ` (align ${(P.alignBumpFloorN / 1000).toFixed(0)} kN) · strut ${P.damperVelFloor} m/s.`
      + ` Wheels have no continuous wear source — they are damaged by impacts only.</div>`)
    out.push('<div class="dh-note">a floor that is red on ordinary road is wrong, or the signal under it is noise.</div>')

    // ── IMPACTS ───────────────────────────────────────────────────────────────────────────────
    out.push(`<h4>Impacts — floor ${P.impactMinMph} mph</h4>`)
    if (!this.impacts.length) {
      out.push('<div class="dh-none">nothing has hit the truck yet.</div>')
    } else {
      for (const h of this.impacts) {
        out.push(`<div class="dh-imp${h.fatal ? ' fatal' : ''}">${h.region.padEnd(5)} `
          + `${(h.v / MPH).toFixed(1)} mph · ${Math.round(h.passed * 100)}% through armor`
          + `${h.fatal ? ' · FATAL' : ''}</div>`)
      }
    }
    return out.join('')
  }
}
