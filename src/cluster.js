// ── FEAT-49: 1992 Ford Ranger gauge cluster ──────────────────────────────────────────────────
//
// Skeuomorphic 2D instrument cluster drawn on a fixed bottom-right canvas overlay (#cluster).
// Modeled on the early-90s Ranger cluster with the right-hand pod (oil pressure / battery)
// trimmed off: temp + fuel small gauges on the left, tachometer, speedometer with odometer.
//
// Rendering: the static face (bezel, wells, ticks, numerals, labels) is painted ONCE into an
// offscreen canvas at devicePixelRatio; the per-frame pass is a single drawImage blit plus four
// needles and the odometer drum — cheap enough to run every render frame so needles stay smooth
// (the 10 Hz HUD-text throttle would make them visibly steppy).
//
// Data wiring:
//   update(dt, speedMps, rpm) — live from physics (speed) and drivetrain (engineRPM).
//   setFuelLevel(frac 0..1) / setCoolantTemp(frac 0..1) — PLACEHOLDER needles until the fuel
//     model (FEAT-50) and coolant temp model (FEAT-51) exist; defaults sit at believable spots.
//     The needles are fully wired — those tickets only have to call the setters.
//   seedOdometer(miles?) — random high "jalopy" mileage when omitted; accumulates real miles
//     driven, and is re-seeded on each story-mode entry (the next run's jalopy). Once runs have
//     a persistent jalopy identity, seed/save should key off that instead (noted in FEAT-49).

// Angle convention (canvas, y-down): increasing angle sweeps CLOCKWISE on screen.
// 135° = bottom-left, 270° = top, 405° = bottom-right — so every gauge maps
// frac → startDeg + frac * sweepDeg with the scale reading left-to-right over the top.
const DEG = Math.PI / 180

// Layout in CSS pixels (canvas logical size — scaled by devicePixelRatio at construction).
const W = 400
const H = 172
const TEMP  = { cx: 60,  cy: 54,  well: 36, scaleR: 27, start: 215, sweep: 110 }
const FUEL  = { cx: 60,  cy: 126, well: 36, scaleR: 27, start: 215, sweep: 110 }
const TACH  = { cx: 166, cy: 86,  well: 62, scaleR: 54, start: 135, sweep: 195, max: 6 }    // ×1000 RPM
const SPEEDO= { cx: 306, cy: 86,  well: 70, scaleR: 62, start: 135, sweep: 270, max: 120 }  // MPH

const FACE   = '#171412'   // gauge face / panel
const WHITE  = '#e8e6e0'
const DIM    = '#9a958f'   // inner km/h ring
const RED    = '#d8402c'
const NEEDLE = '#f2f0ea'

function gaugeAngle (g, frac) {
  const f = Math.max(0, Math.min(1, frac))
  return (g.start + f * g.sweep) * DEG
}

export class GaugeCluster {
  constructor (canvas) {
    this._canvas = canvas
    this._dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = W * this._dpr
    canvas.height = H * this._dpr
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    this._ctx = canvas.getContext('2d')
    this._ctx.scale(this._dpr, this._dpr)

    // Live needle state (first-order lag gives the needles a touch of mechanical damping).
    this._speedMph = 0
    this._rpm = 0
    // Placeholder targets until FEAT-50 / FEAT-51 drive them: temp settles mid-gauge,
    // fuel at ~5/8 — believable for a jalopy that was handed over "with some gas in it".
    this._fuelFrac = 0.62
    this._tempFrac = 0.5
    this._fuelShown = 0      // sweep up from rest on load, like a key-on
    this._tempShown = 0
    this._odoMiles = 0
    this._visible = true

    this._bg = document.createElement('canvas')
    this._bg.width = W * this._dpr
    this._bg.height = H * this._dpr
    this._paintFace()
  }

  /** Seed the odometer. No argument → random high jalopy mileage (80k–160k miles). */
  seedOdometer (miles) {
    this._odoMiles = miles !== undefined ? miles : 80000 + Math.floor(Math.random() * 80000)
  }

  /** 0 = E, 1 = F. Placeholder until the fuel model (FEAT-50) calls this with a real level. */
  setFuelLevel (frac) { this._fuelFrac = Math.max(0, Math.min(1, frac)) }

  /** 0 = C, 1 = H. Placeholder until the coolant model (FEAT-51) calls this with a real temp. */
  setCoolantTemp (frac) { this._tempFrac = Math.max(0, Math.min(1, frac)) }

  odometerMiles () { return this._odoMiles }

  setVisible (v) {
    if (v === this._visible) return
    this._visible = v
    this._canvas.style.display = v ? 'block' : 'none'
  }

  /** Per-frame. dt in seconds, speedMps = vehicle speed magnitude (m/s), rpm = engine RPM. */
  update (dt, speedMps, rpm) {
    if (!this._visible) return
    const mph = speedMps * 2.23694
    // Odometer accumulates actual distance covered (magnitude — a jalopy drum has no idea
    // which way the driveshaft turns).
    this._odoMiles += speedMps * dt / 1609.344

    // Needle damping: fast lag on the driven gauges, slow crawl on fuel/temp (real senders
    // are heavily damped — and it makes the key-on sweep from 0 read as intentional).
    const k = 1 - Math.exp(-dt / 0.06)
    this._speedMph += (mph - this._speedMph) * k
    this._rpm += (rpm - this._rpm) * k
    const ks = 1 - Math.exp(-dt / 1.2)
    this._fuelShown += (this._fuelFrac - this._fuelShown) * ks
    this._tempShown += (this._tempFrac - this._tempShown) * ks

    const ctx = this._ctx
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(this._bg, 0, 0, W, H)
    this._drawOdometer(ctx)
    this._drawNeedle(ctx, TEMP, this._tempShown, 22, 2)
    this._drawNeedle(ctx, FUEL, this._fuelShown, 22, 2)
    this._drawNeedle(ctx, TACH, this._rpm / (TACH.max * 1000), 48, 3)
    this._drawNeedle(ctx, SPEEDO, this._speedMph / SPEEDO.max, 56, 3)
  }

  // ── static face ────────────────────────────────────────────────────────────────────────────

  _paintFace () {
    const ctx = this._bg.getContext('2d')
    ctx.scale(this._dpr, this._dpr)

    // Housing: wide rounded lozenge, dark charcoal with a faint top-edge highlight.
    ctx.beginPath()
    ctx.roundRect(1, 1, W - 2, H - 2, 26)
    ctx.fillStyle = '#211d1a'
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.roundRect(2.5, 2.5, W - 5, H - 5, 24)
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    ctx.lineWidth = 1
    ctx.stroke()

    for (const g of [TEMP, FUEL, TACH, SPEEDO]) this._paintWell(ctx, g)

    this._paintSmallGauge(ctx, TEMP, 'C', 'H', 1)   // red mark at the H end
    this._paintSmallGauge(ctx, FUEL, 'E', 'F', 0)   // red mark at the E end
    this._paintTempIcon(ctx, TEMP.cx, TEMP.cy + 13)
    this._paintFuelIcon(ctx, FUEL.cx, FUEL.cy + 13)
    this._paintTach(ctx)
    this._paintSpeedo(ctx)
  }

  // Circular recess each gauge sits in — face disc with a soft inner shadow at the rim.
  _paintWell (ctx, g) {
    const grad = ctx.createRadialGradient(g.cx, g.cy, g.well * 0.55, g.cx, g.cy, g.well)
    grad.addColorStop(0, FACE)
    grad.addColorStop(0.85, '#131110')
    grad.addColorStop(1, '#0b0a09')
    ctx.beginPath()
    ctx.arc(g.cx, g.cy, g.well, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()
  }

  // Temp and fuel share a shape: short arc over the top, end letters, red band at one end.
  _paintSmallGauge (ctx, g, loLabel, hiLabel, redEnd) {
    ctx.strokeStyle = WHITE
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(g.cx, g.cy, g.scaleR, gaugeAngle(g, 0), gaugeAngle(g, 1))
    ctx.stroke()
    // End + middle ticks, radial, inward.
    for (const f of [0, 0.5, 1]) this._tick(ctx, g, f, g.scaleR, 5, WHITE, 1.5)
    // Red band at the warned end (H for temp, E for fuel).
    ctx.strokeStyle = RED
    ctx.lineWidth = 3
    ctx.beginPath()
    const a0 = gaugeAngle(g, redEnd === 0 ? 0 : 0.92)
    const a1 = gaugeAngle(g, redEnd === 0 ? 0.08 : 1)
    ctx.arc(g.cx, g.cy, g.scaleR + 2.5, a0, a1)
    ctx.stroke()
    // End letters just outside the arc ends.
    ctx.fillStyle = WHITE
    ctx.font = 'bold 9px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    this._labelAt(ctx, g, 0, g.scaleR - 9, loLabel)
    this._labelAt(ctx, g, 1, g.scaleR - 9, hiLabel)
  }

  _paintTach (ctx) {
    const g = TACH
    for (let n = 0; n <= g.max * 2; n++) {           // minor tick every 500 RPM
      const f = n / (g.max * 2)
      const major = n % 2 === 0
      const red = n / 2 >= 5.5
      this._tick(ctx, g, f, g.scaleR, major ? 7 : 4, red ? RED : WHITE, major ? 2 : 1)
    }
    // Redline arc from 5.5 to 6.
    ctx.strokeStyle = RED
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(g.cx, g.cy, g.scaleR + 2.5, gaugeAngle(g, 5.5 / 6), gaugeAngle(g, 1))
    ctx.stroke()
    // Numerals 0–6, the 6 in red.
    ctx.font = 'bold 12px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let n = 0; n <= g.max; n++) {
      ctx.fillStyle = n === g.max ? RED : WHITE
      this._labelAt(ctx, g, n / g.max, g.scaleR - 13, String(n))
    }
    // Legends.
    ctx.fillStyle = WHITE
    ctx.font = '7px Arial, sans-serif'
    ctx.fillText('UNLEADED', g.cx + 24, g.cy - 4)
    ctx.fillText('< FUEL ONLY', g.cx + 24, g.cy + 4)
    ctx.font = 'bold 8px Arial, sans-serif'
    ctx.fillText('RPM x1000', g.cx, g.cy + 34)
  }

  _paintSpeedo (ctx) {
    const g = SPEEDO
    for (let n = 0; n <= g.max; n += 5) {            // minor every 5 mph, major every 10
      const major = n % 10 === 0
      this._tick(ctx, g, n / g.max, g.scaleR, major ? 7 : 4, WHITE, major ? 2 : 1)
    }
    ctx.fillStyle = WHITE
    ctx.font = 'bold 9.5px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let n = 10; n <= g.max; n += 10) {
      this._labelAt(ctx, g, n / g.max, g.scaleR - 11, String(n))
    }
    // Inner km/h ring: same angular scale, kmh label sits at frac (kmh/1.609)/120.
    // Labels that would land behind the odometer box (top-center) are skipped, not overdrawn.
    ctx.fillStyle = DIM
    ctx.font = '6px Arial, sans-serif'
    for (let kmh = 20; kmh <= 180; kmh += 20) {
      const a = gaugeAngle(g, (kmh / 1.60934) / g.max)
      const lx = g.cx + Math.cos(a) * (g.scaleR - 22)
      const ly = g.cy + Math.sin(a) * (g.scaleR - 22)
      if (Math.abs(lx - g.cx) < 38 && ly > g.cy - 40 && ly < g.cy - 14) continue
      ctx.fillText(String(kmh), lx, ly)
    }
    ctx.fillStyle = WHITE
    ctx.font = 'bold 9px Arial, sans-serif'
    ctx.fillText('MPH', g.cx, g.cy + 34)
    ctx.fillStyle = DIM
    ctx.font = '7px Arial, sans-serif'
    ctx.fillText('km/h', g.cx + 40, g.cy + 46)
    // Odometer bezel (digits are live — see _drawOdometer). Sits in the trip-drum slot
    // of the reference, top-center inside the speedo face.
    ctx.fillStyle = '#060606'
    ctx.fillRect(g.cx - 34, g.cy - 34, 68, 15)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(g.cx - 34.5, g.cy - 34.5, 69, 16)
  }

  _tick (ctx, g, frac, rOuter, len, color, width) {
    const a = gaugeAngle(g, frac)
    const c = Math.cos(a); const s = Math.sin(a)
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(g.cx + c * rOuter, g.cy + s * rOuter)
    ctx.lineTo(g.cx + c * (rOuter - len), g.cy + s * (rOuter - len))
    ctx.stroke()
  }

  _labelAt (ctx, g, frac, r, text) {
    const a = gaugeAngle(g, frac)
    ctx.fillText(text, g.cx + Math.cos(a) * r, g.cy + Math.sin(a) * r)
  }

  // Simplified thermometer glyph (bulb + stem + wave) — enough to read as "temp" at 12 px.
  _paintTempIcon (ctx, x, y) {
    ctx.strokeStyle = WHITE
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 1)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y + 3, 2, 0, Math.PI * 2)
    ctx.fillStyle = WHITE
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x - 5, y + 7); ctx.quadraticCurveTo(x - 2, y + 5, x, y + 7); ctx.quadraticCurveTo(x + 2, y + 9, x + 5, y + 7)
    ctx.stroke()
  }

  // Simplified fuel-pump glyph: body + nozzle hook.
  _paintFuelIcon (ctx, x, y) {
    ctx.fillStyle = WHITE
    ctx.fillRect(x - 4, y - 2, 6, 9)
    ctx.strokeStyle = WHITE
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(x + 3, y); ctx.quadraticCurveTo(x + 6, y, x + 6, y + 4); ctx.lineTo(x + 6, y + 6)
    ctx.stroke()
    ctx.fillStyle = '#060606'
    ctx.fillRect(x - 3, y - 1, 4, 3)   // pump window
  }

  // ── live parts ─────────────────────────────────────────────────────────────────────────────

  _drawNeedle (ctx, g, frac, len, width) {
    const a = gaugeAngle(g, frac)
    const c = Math.cos(a); const s = Math.sin(a)
    ctx.strokeStyle = NEEDLE
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(g.cx - c * 6, g.cy - s * 6)    // short tail past the hub
    ctx.lineTo(g.cx + c * len, g.cy + s * len)
    ctx.stroke()
    ctx.beginPath()                            // hub cap over the tail
    ctx.arc(g.cx, g.cy, width + 2.5, 0, Math.PI * 2)
    ctx.fillStyle = '#2a2624'
    ctx.fill()
  }

  // Six-digit drum, white on black; the ones digit rolls continuously with the fraction.
  _drawOdometer (ctx) {
    const g = SPEEDO
    const x0 = g.cx - 34; const y0 = g.cy - 34; const cellW = 68 / 6; const cellH = 15
    const whole = Math.floor(this._odoMiles) % 1000000
    const rollFrac = this._odoMiles - Math.floor(this._odoMiles)
    ctx.font = 'bold 10px "Courier New", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = WHITE
    for (let i = 0; i < 6; i++) {
      const digit = Math.floor(whole / Math.pow(10, 5 - i)) % 10
      const cx = x0 + cellW * (i + 0.5)
      if (i < 5) {
        ctx.fillText(String(digit), cx, y0 + cellH / 2)
      } else {
        // Rolling ones digit: current digit slides up, next slides in from below.
        ctx.save()
        ctx.beginPath()
        ctx.rect(x0 + cellW * 5, y0 + 1, cellW, cellH - 2)
        ctx.clip()
        ctx.fillText(String(digit), cx, y0 + cellH / 2 - rollFrac * cellH)
        ctx.fillText(String((digit + 1) % 10), cx, y0 + cellH / 2 + (1 - rollFrac) * cellH)
        ctx.restore()
      }
      if (i > 0) {                               // cell separator
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x0 + cellW * i, y0 + 1)
        ctx.lineTo(x0 + cellW * i, y0 + cellH - 1)
        ctx.stroke()
        ctx.fillStyle = WHITE
      }
    }
  }
}
