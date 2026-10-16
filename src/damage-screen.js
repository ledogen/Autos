/**
 * FEAT-90 — the player's damage screen: a top-down pictogram of the truck, every damageable part
 * shaded by its condition (green = sound, red = broken), plus the left-edge icon that tells you
 * when it is worth a look.
 *
 * This is the PLAYER surface. The diagnostic text readout (damage-hud.js) is the development
 * instrument, and it now lives behind the debug panel's Damage folder.
 *
 * Owner rulings (2026-09-29) that shape it:
 *   - The screen is GATED BEHIND PARKING. V or a click on the icon opens it only while the parking
 *     brake is latched. Driving, the same input shows the park hint instead. Releasing the brake
 *     closes the screen, because the truck is driving away. Esc closes it too (main.js gives it
 *     the key ahead of the pause menu).
 *   - The icon sits TRANSLUCENT on the left edge as an optional menu tab. A damage event flashes it
 *     and holds it OPAQUE with an alert card beside it until the screen is opened. Opening
 *     the screen clears the alert and the icon goes translucent again. The card says as little as
 *     the moment allows (owner, 2026-10-01): driving, it is the P badge alone; stopped, it adds the
 *     keys; parked, just "V to open".
 *   - What counts as a damage event: a landed impact (main.js calls alert()), a puncture, or any
 *     part losing more than DROP_ALERT in one 10 Hz sample. Slow wear (tread, filter, brakes) never
 *     loses that much in a tenth of a second, so driving alone never flashes it.
 *   - Hover a part to see its name and health. The ? toggle augments the same hover card with
 *     what that damage DOES, rather than opening a separate page.
 *   - Springs and dampers are drawn differently: a zigzag coil and a piston.
 *
 * Imports nothing from the physics stack. It reads the DamageModel (conditions, flat flags, the
 * alignment/runout readouts) and vehicleState.parked, and writes only to the DOM.
 */

import { TRACKS, DAMAGE_PARAMS } from './damage.js'
import { conditionColor } from './damage-hud.js'
import { PARK_BADGE, keycap } from './park-badge.js'

const REFRESH_S = 0.1      // 10 Hz — condition moves on the scale of minutes
const DROP_ALERT = 0.03    // a part losing more than 3 points in one sample is a damage event
const HINT_S = 2.5         // how long the "park first" hint stays up after V while driving
// Ground speed (m/s) band for 'stopped' vs 'driving'. Two thresholds (hysteresis) so a truck creeping
// at the boundary does not flicker the card between its two faces.
const STOPPED_MS = 0.5, MOVING_MS = 1.0
const CORNERS = ['FL', 'FR', 'RL', 'RR']   // wheel index 0..3 (GLOSSARY.md §Wheel Index)

/** One line per class: what the damage does to the truck. Shown in the hover card while ? is on. */
const CONSEQUENCE = {
  armor:      'Soaks up hits for the parts behind it. A battered panel lets more of the next hit through.',
  tire:       'Grip holds until the tread is nearly gone, then falls away fast. A worn tire punctures more easily.',
  wheel:      'A dent makes the wheel lose its roundness, so the tire hops twice every turn.',
  spring:     'A tired spring sags. The truck sits lower and bottoms out on bumps sooner.',
  damper:     'A worn damper stops controlling the spring, so the truck keeps bouncing after a bump.',
  brake:      'Worn brakes need more distance to stop.',
  engine:     'Less power. Most of the loss arrives in the last fifth of its life.',
  filter:     'A clogged filter wears the engine out faster. Cheap to replace.',
  radiator:   'Takes front-end hits. Nothing more yet: the engine does not overheat.',
  headlights: 'Takes front-end hits. Nothing more yet: a broken lamp still lights the road.',
  alignment:  'Knocked-out toe and camber make the truck pull to one side.',
}

// ── Pictogram geometry ──────────────────────────────────────────────────────────────────────────
// Forward = up, the driver's left on screen-left. Drawn to the 2002 Ranger's real plan dimensions at
// S = 56 units per metre, so the outline reads as a truck rather than a bus (owner, 2026-10-01):
//   body 1.77 m wide × 4.76 m long → 100 × 267 (aspect 2.7, same as the truck)
//   front overhang 0.80 m, wheelbase 2.83 m, rear overhang 1.14 m → axles at y 65 and 223
//   tire 0.74 m × 0.235 m → 41 × 14
// The only liberty is the wheels: they sit just OUTBOARD of the body line instead of under it, so the
// tire, rim, brake, spring and damper each have room to be pointed at.
const CX = 120                            // body centreline; mx() mirrors about it
const BODY_L = 70, BODY_R = 170           // body side lines
const FRONT_Y = 20, REAR_Y = 287          // bumper lines
const AXLE_Y = [65, 223]                  // front, rear
const TIRE_W = 14, TIRE_H = 41
const TIRE_X = 52                         // left tire's outer edge; 4 units clear of the body line
const VIEWBOX = '18 8 204 290'            // trimmed to the drawing, alignment text included
const NEUTRAL = '#56616c'                 // non-damageable linework (cab, bed, hood)

/** Mirror an x coordinate to the right side. */
const mx = (x) => 2 * CX - x

/**
 * One damageable shape. `paint` says which attribute carries the condition colour; `hit` queues an
 * invisible, larger hover target (onto `hits`) for parts too thin to point at. The targets are drawn
 * UNDER every visible part, so a neighbour's target can never steal the hover from the part itself.
 */
function part (id, shape, paint = 'fill', hit = null, hits = null) {
  if (hit && hits) hits.push(`<rect class="ds-hit" data-track="${id}" data-paint="none" x="${hit[0]}" y="${hit[1]}" width="${hit[2]}" height="${hit[3]}"/>`)
  return shape.replace(/^<(\w+)/, `<$1 class="ds-part" data-track="${id}" data-paint="${paint}"`)
}

/** The zigzag coil spring, centred on (cx, cy). */
function springPath (cx, cy) {
  const w = 4, h = 24, n = 6
  let d = `M${cx},${cy - h / 2}`
  for (let i = 0; i < n; i++) {
    const y = cy - h / 2 + (i + 0.5) * (h / n)
    d += ` L${cx + (i % 2 ? -w : w)},${y}`
  }
  return d + ` L${cx},${cy + h / 2}`
}

function buildPictogram () {
  const s = [], hits = []
  const P = (id, shape, paint, hit) => part(id, shape, paint, hit, hits)
  // Neutral body: hood seam, windshield, cab roof, back glass, bed. Drawn first, under the parts.
  s.push(`<g class="ds-neutral" fill="none" stroke="${NEUTRAL}" stroke-width="1.5" stroke-linejoin="round">`
    + `<path d="M80,108 L160,108 L153,121 L87,121 Z"/>`                // windshield
    + `<rect x="84" y="121" width="72" height="42" rx="4"/>`           // cab roof
    + `<path d="M86,166 L154,166"/>`                                    // back glass
    + `<rect x="80" y="176" width="80" height="102" rx="3"/>`           // bed
    + `</g>`)

  // Armor: the four body edges, drawn as thick strokes.
  s.push(P('armorFront', `<path d="M${BODY_L},36 Q${BODY_L},${FRONT_Y} 86,${FRONT_Y} L154,${FRONT_Y} Q${BODY_R},${FRONT_Y} ${BODY_R},36"/>`, 'stroke'))
  s.push(P('armorRear',  `<path d="M${BODY_L},271 Q${BODY_L},${REAR_Y} 86,${REAR_Y} L154,${REAR_Y} Q${BODY_R},${REAR_Y} ${BODY_R},271"/>`, 'stroke'))
  s.push(P('armorLeft',  `<path d="M${BODY_L},42 L${BODY_L},265"/>`, 'stroke', [BODY_L - 6, 42, 12, 223]))
  s.push(P('armorRight', `<path d="M${BODY_R},42 L${BODY_R},265"/>`, 'stroke', [BODY_R - 6, 42, 12, 223]))

  // Front end. Headlights and the radiator grille share one row, set well back from the bumper
  // (≈ 8 units of clear air below its stroke) so the lamps read as lamps, not as bumper.
  s.push(P('headlightL', `<rect x="80" y="31" width="17" height="7" rx="2.5"/>`))
  s.push(P('headlightR', `<rect x="143" y="31" width="17" height="7" rx="2.5"/>`))
  s.push(P('radiator', `<rect x="102" y="30" width="36" height="9" rx="1.5"/>`))
  s.push(`<path class="ds-detail" d="M108,31.5 V37.5 M114,31.5 V37.5 M120,31.5 V37.5 M126,31.5 V37.5 M132,31.5 V37.5"/>`)
  s.push(P('engine', `<rect x="106" y="47" width="28" height="42" rx="3"/>`))
  s.push(`<g class="ds-detail-dot"><circle cx="120" cy="57" r="3"/><circle cx="120" cy="68" r="3"/><circle cx="120" cy="79" r="3"/></g>`)
  // Air filter on the centreline between engine and windshield, clear of the alignment text.
  s.push(P('airFilter', `<circle cx="120" cy="98" r="5"/>`))

  // Corners: tire (outline), wheel (rim), and the alignment readout as text under the wheel.
  for (let c = 0; c < 4; c++) {
    const right = c % 2 === 1
    const y = AXLE_Y[c < 2 ? 0 : 1]
    const tx = right ? mx(TIRE_X) - TIRE_W : TIRE_X
    s.push(P(`tire${CORNERS[c]}`, `<rect x="${tx}" y="${y - TIRE_H / 2}" width="${TIRE_W}" height="${TIRE_H}" rx="4.5"/>`, 'stroke'))
    s.push(P(`wheel${CORNERS[c]}`, `<rect x="${tx + 4}" y="${y - 10}" width="6" height="20" rx="2"/>`))
    // Anchored on the tire's INNER edge and growing outboard, so it never crosses the body line.
    const ty = y + TIRE_H / 2 + 9
    const ax = right ? tx : tx + TIRE_W
    s.push(P(`align${CORNERS[c]}`,
      `<text x="${ax}" y="${ty}" text-anchor="${right ? 'start' : 'end'}"></text>`, 'fill',
      [right ? ax : ax - 36, ty - 7, 36, 16]))
  }

  // Axles: brake caliper, coil spring, damper, inboard of each wheel. Left and right share one
  // track per axle.
  for (let a = 0; a < 2; a++) {
    const y = AXLE_Y[a]
    const sfx = a === 0 ? 'Front' : 'Rear'
    for (const right of [false, true]) {
      const X = (x) => (right ? mx(x) : x)
      s.push(P(`brake${sfx}`, `<rect x="${right ? mx(80) : 75}" y="${y - 8}" width="5" height="16" rx="2"/>`))
      s.push(P(`spring${sfx}`, `<path d="${springPath(X(87), y)}"/>`, 'stroke', [X(87) - 6, y - 13, 12, 26]))
      // Damper: a cylinder body with a rod and an end cap, so it never reads as a spring.
      const bx = right ? mx(100) : 94
      s.push(P(`damper${sfx}`,
        `<path d="M${bx},${y - 12} h6 v14 h-6 Z M${bx + 3},${y + 2} V${y + 10} M${bx},${y + 11} h6"/>`,
        'stroke', [bx - 2, y - 13, 10, 26]))
    }
  }
  // Neutral linework first, then the hover targets, then the parts on top.
  return `<svg class="ds-svg" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">${s[0]}${hits.join('')}${s.slice(1).join('')}</svg>`
}

/** The alignment readout under a wheel: "aligned", or the bent camber and toe on two lines. */
function alignText (m, wheel, x) {
  const cam = m.camberOffsetDeg[wheel], toe = m.toeOffsetDeg[wheel]
  if (Math.abs(cam) < 0.05 && Math.abs(toe) < 0.05) return 'aligned'
  const sg = (v) => (v >= 0 ? '+' : '\u2212') + Math.abs(v).toFixed(1) + '\u00b0'
  return `cam ${sg(cam)}<tspan x="${x}" dy="7.5">toe ${sg(toe)}</tspan>`
}

/** The left-edge icon: the same truck, reduced to body, wheels and powertrain. */
function buildIcon () {
  return `<svg viewBox="0 0 40 64" xmlns="http://www.w3.org/2000/svg">`
    + `<rect data-agg="armor" x="10" y="5" width="20" height="54" rx="5" fill="none" stroke-width="2.5"/>`
    + `<rect data-agg="power" x="15" y="10" width="10" height="12" rx="1.5"/>`
    + `<path d="M14,27 h12 M13,38 h14" stroke="${NEUTRAL}" stroke-width="1.5" fill="none"/>`
    + `<rect data-agg="c0" x="3"  y="12" width="5" height="12" rx="1.5"/>`
    + `<rect data-agg="c1" x="32" y="12" width="5" height="12" rx="1.5"/>`
    + `<rect data-agg="c2" x="3"  y="42" width="5" height="12" rx="1.5"/>`
    + `<rect data-agg="c3" x="32" y="42" width="5" height="12" rx="1.5"/>`
    + `</svg>`
}

const CSS = `
#dmg-dock { position: fixed; left: 20px; top: 50%; transform: translateY(-50%); z-index: 87;
  display: flex; align-items: center; gap: 10px; pointer-events: none; }
#dmg-icon { pointer-events: auto; cursor: pointer; width: 46px; height: 62px; padding: 4px 5px;
  background: rgba(0,0,0,0.55); border: 1px solid #3a4450; border-radius: 8px; opacity: 0.35;
  transition: opacity 0.4s, border-color 0.4s; }
#dmg-icon:hover { opacity: 0.8; }
#dmg-icon svg { width: 100%; height: 100%; display: block; }
#dmg-dock.alert #dmg-icon { opacity: 1; border-color: #e0705c; }
#dmg-icon.pulse { animation: dmg-pulse 0.55s ease-in-out 3; }
@keyframes dmg-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(224,112,92,0); transform: scale(1); }
  50%      { box-shadow: 0 0 14px 3px rgba(224,112,92,0.75); transform: scale(1.08); } }
#dmg-alert { display: none; background: rgba(0,0,0,0.62); border: 1px solid #3a4450; border-radius: 4px;
  padding: 6px 10px; font: 12px/1.6 monospace; color: #e6ecf2; white-space: nowrap; }
#dmg-alert .da-dim { color: #9fb3c8; }
/* Driving: just the badge, no card — anything wordier is in the way of someone racing somewhere. */
#dmg-alert.badge-only { background: none; border: none; padding: 0; }
#dmg-alert .park-badge.big { width: 30px; height: 30px; margin: 0; font-size: 18px; vertical-align: middle;
  box-shadow: 0 0 0 2px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.4); }

#dmg-screen { display: none; position: fixed; inset: 0; z-index: 95; background: rgba(6,8,10,0.45);
  align-items: center; justify-content: center; font-family: monospace; color: #e6ecf2; }
#dmg-screen.open { display: flex; }
#dmg-screen .ds-card { background: rgba(14,17,20,0.92); border: 1px solid #3a4450; border-radius: 8px;
  padding: 12px 18px 12px; display: flex; flex-direction: column; align-items: center; }
#dmg-screen .ds-head { width: 100%; display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
#dmg-screen .ds-title { flex: 1; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #9fb3c8; }
#dmg-screen .ds-btn { width: 24px; height: 24px; border-radius: 50%; border: 1px solid #56616c;
  background: transparent; color: #c8d2dc; font: bold 13px monospace; cursor: pointer; padding: 0; }
#dmg-screen .ds-btn:hover { border-color: #c8d2dc; }
#dmg-screen .ds-btn.on { background: #c8d2dc; color: #0e1114; border-color: #c8d2dc; }
#dmg-screen .ds-svg { height: min(60vh, 460px); width: auto; display: block; margin: 4px 0; }
#dmg-screen .ds-part { cursor: help; transition: filter 0.15s; }
#dmg-screen .ds-part[data-paint="stroke"] { fill: none; stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
#dmg-screen .ds-part[data-track^="tire"] { fill: #1b2026; stroke-width: 4; }
#dmg-screen .ds-part[data-track^="spring"] { stroke-width: 2.4; }
#dmg-screen .ds-part[data-track^="damper"] { stroke-width: 2.4; fill: none; }
#dmg-screen .ds-part[data-track^="align"] { font: 6.5px/1 monospace; }
#dmg-screen .ds-part.flat { stroke-dasharray: 5 4; }
#dmg-screen .ds-part.hot { filter: brightness(1.45) drop-shadow(0 0 3px rgba(255,255,255,0.55)); }
#dmg-screen .ds-hit { fill: transparent; cursor: help; }
#dmg-screen .ds-detail { stroke: #0e1114; stroke-width: 1.4; pointer-events: none; }
#dmg-screen .ds-detail-dot { fill: #0e1114; pointer-events: none; }
#dmg-screen .ds-foot { width: 100%; display: flex; align-items: center; gap: 8px; margin-top: 6px;
  font-size: 11px; color: #9fb3c8; }
#dmg-screen .ds-ramp { flex: 1; height: 5px; border-radius: 3px;
  background: linear-gradient(90deg, hsl(0,70%,45%), hsl(60,70%,45%), hsl(120,70%,45%)); }
#dmg-screen .ds-note { margin-top: 6px; font-size: 11px; color: #6f7c88; }
#dmg-tip { display: none; position: fixed; z-index: 96; pointer-events: none; max-width: 260px;
  background: rgba(10,12,14,0.95); border: 1px solid #3a4450; border-radius: 4px; padding: 6px 9px;
  font: 12px/1.45 monospace; color: #e6ecf2; }
#dmg-tip .dt-name { color: #c8d2dc; }
#dmg-tip .dt-pct { font-size: 16px; font-weight: bold; }
#dmg-tip .dt-extra { color: #f0a08f; }
#dmg-tip .dt-why { margin-top: 4px; padding-top: 4px; border-top: 1px solid #2c343d; color: #9fb3c8;
  white-space: normal; }
`

export class DamageScreen {
  /**
   * @param {import('./damage.js').DamageModel} model
   * @param {object} vehicleState - read-only; `parked` gates the screen.
   * @param {() => boolean} [isSuppressed] - true while the dock must not show (the menu stage).
   */
  constructor (model, vehicleState, isSuppressed = () => false) {
    this.model = model
    this.vehicleState = vehicleState
    this.isSuppressed = isSuppressed
    this.isOpen = false
    this.alerting = false
    this.help = false
    this._acc = REFRESH_S
    this._hintT = 0
    this._hover = null
    this._prev = { ...model.condition }
    this._prevFlat = model.flat.slice()
    this._cardKey = ''
    this._moving = false

    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)

    // Left-edge dock: the icon + the alert card beside it.
    this.dock = document.createElement('div')
    this.dock.id = 'dmg-dock'
    this.dock.innerHTML = `<div id="dmg-icon" title="vehicle condition (V)">${buildIcon()}</div><div id="dmg-alert"></div>`
    document.body.appendChild(this.dock)
    this.iconEl = this.dock.querySelector('#dmg-icon')
    this.alertEl = this.dock.querySelector('#dmg-alert')
    this.iconAgg = [...this.iconEl.querySelectorAll('[data-agg]')]
    // mousedown preventDefault keeps focus off the icon: Space is the parking brake, and a focused
    // element would swallow the tap.
    this.iconEl.addEventListener('mousedown', (e) => e.preventDefault())
    this.iconEl.addEventListener('click', () => this.request())

    // The screen.
    this.screen = document.createElement('div')
    this.screen.id = 'dmg-screen'
    this.screen.innerHTML =
      `<div class="ds-card">`
      + `<div class="ds-head"><span class="ds-title">Vehicle condition</span>`
      + `<button class="ds-btn" data-act="help" title="what does the damage do?">?</button>`
      + `<button class="ds-btn" data-act="close" title="close (V / Esc)">&times;</button></div>`
      + buildPictogram()
      + `<div class="ds-foot"><span>broken</span><span class="ds-ramp"></span><span>sound</span></div>`
      + `<div class="ds-note">hover a part · ? adds what the damage does</div>`
      + `</div>`
    document.body.appendChild(this.screen)
    this.parts = [...this.screen.querySelectorAll('[data-track]')]
    this.helpBtn = this.screen.querySelector('[data-act="help"]')
    for (const b of this.screen.querySelectorAll('.ds-btn')) b.addEventListener('mousedown', (e) => e.preventDefault())
    this.helpBtn.addEventListener('click', () => {
      this.help = !this.help
      this.helpBtn.classList.toggle('on', this.help)
      if (this._hover) this._renderTip(this._hover)
    })
    this.screen.querySelector('[data-act="close"]').addEventListener('click', () => this.close())
    this.screen.addEventListener('click', (e) => { if (e.target === this.screen) this.close() })

    // Hover card.
    this.tip = document.createElement('div')
    this.tip.id = 'dmg-tip'
    document.body.appendChild(this.tip)
    this.screen.addEventListener('mousemove', (e) => {
      const id = e.target?.dataset?.track || null
      if (id !== this._hover) this._setHover(id)
      if (id) {
        const w = this.tip.offsetWidth, h = this.tip.offsetHeight
        const x = Math.min(e.clientX + 16, window.innerWidth - w - 8)
        const y = Math.min(e.clientY + 14, window.innerHeight - h - 8)
        this.tip.style.left = x + 'px'
        this.tip.style.top = y + 'px'
      }
    })
    this.screen.addEventListener('mouseleave', () => this._setHover(null))

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'v' && e.key !== 'V') return
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      this.request()
    })

    this._paintIcon()
  }

  /** V or an icon click: open while parked, close if open, otherwise show the park hint. */
  request () {
    if (this.isSuppressed()) return
    if (this.isOpen) { this.close(); return }
    if (!this.vehicleState.parked) { this._hintT = HINT_S; this._renderCard(); return }
    this.open()
  }

  open () {
    this.isOpen = true
    this.alerting = false        // viewed — the icon goes back to being an optional tab
    this._hintT = 0
    this.dock.classList.remove('alert')
    this.screen.classList.add('open')
    this._paintScreen()
    this._renderCard()
  }

  close () {
    if (!this.isOpen) return
    this.isOpen = false
    this.screen.classList.remove('open')
    this._setHover(null)
  }

  /** The truck was made whole under the alert (a free-roam reseat): there is nothing left to see. */
  clearAlert () {
    this.alerting = false
    this.dock.classList.remove('alert')
    this._renderCard()
  }

  /** A damage event: flash the icon and hold the alert until the screen is opened. */
  alert () {
    if (this.isOpen) return       // already looking at it
    this.alerting = true
    this.dock.classList.add('alert')
    // Restart the pulse even if one is mid-flight: drop the class, force a reflow, re-add.
    this.iconEl.classList.remove('pulse')
    void this.iconEl.offsetWidth
    this.iconEl.classList.add('pulse')
    this._renderCard()
  }

  /** @param {number} dt - real seconds since the last frame. */
  update (dt) {
    const hidden = this.isSuppressed()
    this.dock.style.display = hidden ? 'none' : 'flex'
    if (hidden) { this.close(); return }
    if (this._hintT > 0) { this._hintT -= dt; if (this._hintT <= 0) this._renderCard() }
    this._acc += dt
    if (this._acc < REFRESH_S) return
    this._acc = 0

    // Damage-event detection. Skipped while damage is disabled: toggling it snaps every track to
    // the nominal condition, which is a debug action, not a hit.
    const m = this.model
    let hit = false
    for (const id in m.condition) {
      const c = m.condition[id]
      if (DAMAGE_PARAMS.enabled && (this._prev[id] ?? c) - c > DROP_ALERT) hit = true
      this._prev[id] = c
    }
    for (let i = 0; i < 4; i++) {
      if (m.flat[i] && !this._prevFlat[i]) hit = true
      this._prevFlat[i] = m.flat[i]
    }
    if (hit) this.alert()

    if (this.isOpen && !this.vehicleState.parked) this.close()   // driving away
    this._paintIcon()
    if (this.isOpen) { this._paintScreen(); if (this._hover) this._renderTip(this._hover) }
    this._renderCard()
  }

  // ── rendering ────────────────────────────────────────────────────────────────────────────────

  _paintIcon () {
    const m = this.model
    const min = (...ids) => Math.min(...ids.map(id => m.get(id)))
    for (const el of this.iconAgg) {
      const a = el.dataset.agg
      let c
      if (a === 'armor') c = min('armorFront', 'armorLeft', 'armorRight', 'armorRear')
      else if (a === 'power') c = min('engine', 'radiator', 'airFilter')
      else {
        const k = +a[1]
        c = m.flat[k] ? 0 : min(`tire${CORNERS[k]}`, `wheel${CORNERS[k]}`)
      }
      const col = conditionColor(c)
      if (a === 'armor') el.style.stroke = col
      else el.style.fill = col
    }
  }

  _paintScreen () {
    const m = this.model
    for (const el of this.parts) {
      const paint = el.dataset.paint
      if (paint === 'none') continue
      const id = el.dataset.track
      const col = conditionColor(m.get(id))
      if (paint === 'stroke') el.style.stroke = col
      else el.style.fill = col
      const t = TRACKS[id]
      if (t.cls === 'tire') el.classList.toggle('flat', !!m.flat[t.wheel])
      else if (t.cls === 'alignment') el.innerHTML = alignText(m, t.wheel, el.getAttribute('x'))
    }
  }

  /**
   * The alert card beside the icon, in three modes (owner, 2026-10-01):
   *   driving → the P badge alone, larger. A racing player gets the reminder and nothing to read.
   *   stopped → "P Space" / "V to open": now there is time to read how to park.
   *   parked  → "V to open".
   * Rebuilt only when what it says changes.
   */
  _renderCard () {
    const show = !this.isOpen && (this.alerting || this._hintT > 0)
    const vs = this.vehicleState
    const v = Math.hypot(vs.velocity?.x || 0, vs.velocity?.z || 0)
    if (v < STOPPED_MS) this._moving = false
    else if (v > MOVING_MS) this._moving = true
    const mode = vs.parked ? 'parked' : this._moving ? 'driving' : 'stopped'
    const key = show ? mode : ''
    if (key === this._cardKey) return
    this._cardKey = key
    this.alertEl.style.display = show ? 'block' : 'none'
    if (!show) return
    this.alertEl.classList.toggle('badge-only', mode === 'driving')
    const open = `${keycap('V')} <span class="da-dim">to open</span>`
    this.alertEl.innerHTML =
        mode === 'driving' ? PARK_BADGE.replace('park-badge', 'park-badge big')
      : mode === 'stopped' ? `<div>${PARK_BADGE}${keycap('Space')}</div><div>${open}</div>`
      : `<div>${open}</div>`
  }

  _setHover (id) {
    if (this._hover) for (const el of this.parts) if (el.dataset.track === this._hover) el.classList.remove('hot')
    this._hover = id
    if (!id) { this.tip.style.display = 'none'; return }
    for (const el of this.parts) if (el.dataset.track === id) el.classList.add('hot')
    this._renderTip(id)
    this.tip.style.display = 'block'
  }

  _renderTip (id) {
    const m = this.model
    const t = TRACKS[id]
    const c = m.get(id)
    let extra = ''
    if (t.cls === 'tire' && m.flat[t.wheel]) extra = 'FLAT'
    else if (t.cls === 'wheel') {
      const mm = m.wheelRunout(t.wheel) * 1000
      if (mm >= 0.5) extra = `${mm.toFixed(1)} mm out of round`
    } else if (t.cls === 'alignment') {
      const cam = m.camberOffsetDeg[t.wheel], toe = m.toeOffsetDeg[t.wheel]
      if (Math.abs(cam) >= 0.05 || Math.abs(toe) >= 0.05) {
        const sg = (v) => (v >= 0 ? '+' : '') + v.toFixed(1)
        extra = `camber ${sg(cam)}° · toe ${sg(toe)}°`
      }
    }
    this.tip.innerHTML =
      `<div class="dt-name">${t.label}</div>`
      + `<div class="dt-pct" style="color:${conditionColor(c)}">${Math.round(c * 100)}%</div>`
      + (extra ? `<div class="dt-extra">${extra}</div>` : '')
      + (this.help ? `<div class="dt-why">${CONSEQUENCE[t.cls] || ''}</div>` : '')
  }
}
