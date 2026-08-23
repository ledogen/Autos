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
// Temp and fuel are staggered like the reference — temp high and inboard, fuel low and outboard.
// W/H are FEAT-49's 416x200 plus a few px of slack: the FEAT-33 ignition switch is small enough to
// tuck into the housing's existing bottom-right corner, so it only bumps the outline out slightly
// rather than growing a whole extra lobe. The canvas is anchored bottom-right in CSS.
const W = 420
const H = 204
const TEMP  = { cx: 86,  cy: 70,  well: 33, scaleR: 26, start: 215, sweep: 110 }
const FUEL  = { cx: 62,  cy: 136, well: 33, scaleR: 26, start: 215, sweep: 110 }
const TACH  = { cx: 180, cy: 102, well: 62, scaleR: 54, start: 135, sweep: 195, max: 6 }    // ×1000 RPM
const SPEEDO= { cx: 318, cy: 102, well: 70, scaleR: 62, start: 135, sweep: 270, max: 120 }  // MPH
// FEAT-33 ignition switch — a small well tucked diagonally into the housing's bottom-right corner.
// It carries its OWN indent pad (smaller than DIAL_PAD) because at this size the standard ring would
// be most of the dial. Three distances have to hold, and they are tight — check all three before
// moving it (all measured from the speedo centre, 90.5 px away):
//   wells apart      93.3 > SPEEDO.well + KEY.well (87)      or the key face eats the speedo face
//   indent clears    93.3 − (well+pad) = 73.3 > SPEEDO.well   or it bites a crescent out of 120/km-h
//   indents overlap  93.3 < SPEEDO.well + DIAL_PAD + well+pad or the switch reads as a detached island
// The well grew 13 → 17 when the needle became a key grip: a key silhouette needs pixels to read as
// an object, and 26 px of dial was not enough. 34 px is the most the three distances above allow.
const KEY   = { cx: 384, cy: 168, well: 17, pad: 3 }
// Key detents, in canvas angles (0 = 3 o'clock, increasing clockwise): 10 / 12 / 2 o'clock.
const KEY_ANGLE = { off: 210 * DEG, on: 270 * DEG, start: 330 * DEG }
const KEY_TICK_R = 16.5   // detent ticks run inward from here to r=14.5 — OUTSIDE the fascia, framing it
const KEY_FASCIA_R = 12   // the silver escutcheon the key turns in
// Escutcheon metal. The rest of the cluster is dark plastic; the ignition surround is the one part
// of a real dash that is bare metal, and that contrast is what makes the switch findable.
const STEEL_HI = '#e4e4de'
const STEEL    = '#b4b4ac'
const STEEL_LO = '#6f6f68'
// Vertical foreshortening of the dial plane — the whole isometric read in one number. Lower = the
// dash is seen from further above, so a key pointing up flattens more against one pointing sideways.
const ISO = 0.80
const KEY_PLASTIC = '#242428'   // moulded plastic key body
// The key body is the keyhole slot's shape at a larger size — half-length and thickness, vs the
// slot's 5.6 / 2.2. Keep it wider AND thicker than the slot or the two states stop reading apart.
const KEY_BODY_L = 8.0
const KEY_BODY_W = 5.2

// Indent geometry (the recessed regions the dials sit in) and the housing margin around them.
// The housing outline is NOT drawn as its own shape: it is the indent geometry dilated by
// MARGIN, so it frames every indent with a constant offset and follows their curves — including
// the concave pinches where neighbouring shapes meet.
const POD_R    = 39   // radius of the temp/fuel capsule indent
const DIAL_PAD = 8    // indent ring visible around the tach/speedo wells
const MARGIN   = 13   // constant housing frame around the indents

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
    // FEAT-33 ignition. _keyPos is which of the three renderings to draw; _keyAngle chases
    // _keyTarget so the key SWEEPS between 12 and 2 o'clock instead of teleporting (a
    // quarter-second start would otherwise be a single-frame flicker at START and easy to miss).
    this._keyPos = 'on'
    this._keyTarget = KEY_ANGLE.on
    this._keyAngle = KEY_ANGLE.on

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

  /**
   * FEAT-33: which of the three switch renderings to draw — 'off' | 'on' | 'start', straight from
   * src/ignition.js keyPosition(). No second argument: 'start' happens exactly when the key is held
   * against the spring, which is exactly when the starter is turning, so the position IS the tell.
   */
  setIgnition (pos) {
    const next = KEY_ANGLE[pos] ? pos : 'on'
    // Leaving OFF, the key was not on screen at all, so there is nothing to sweep FROM — snap to
    // the new detent. Otherwise a start would animate the key up from 10 o'clock as if it had been
    // sitting there, which is the one transition the three-rendering design is meant to avoid.
    if (this._keyPos === 'off' && next !== 'off') this._keyAngle = KEY_ANGLE[next]
    this._keyPos = next
    this._keyTarget = KEY_ANGLE[next]
  }

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
    this._keyAngle += (this._keyTarget - this._keyAngle) * (1 - Math.exp(-dt / 0.045))
    this._drawKey(ctx)
  }

  // ── static face ────────────────────────────────────────────────────────────────────────────

  _paintFace () {
    const ctx = this._bg.getContext('2d')
    ctx.scale(this._dpr, this._dpr)

    // Housing: successive dilations of the indent geometry. Each layer fully covers the next
    // larger one except for its outer band, so the visible result is a 2px dark rim, a 1.5px
    // edge highlight, then the housing face — all as true constant-offset curves of the indents.
    this._fillDilated(ctx, MARGIN + 2, 'rgba(10,8,7,0.9)')   // outer dark rim
    this._fillDilated(ctx, MARGIN, '#3a332e')                 // edge highlight band
    this._fillDilated(ctx, MARGIN - 1.5, '#282320')           // housing face

    this._paintIndents(ctx)
    for (const g of [TEMP, FUEL, TACH, SPEEDO, KEY]) this._paintWell(ctx, g)

    this._paintSmallGauge(ctx, TEMP, 'C', 'H', 1)   // red mark at the H end
    this._paintSmallGauge(ctx, FUEL, 'E', 'F', 0)   // red mark at the E end
    this._paintTempIcon(ctx, TEMP.cx, TEMP.cy + 13)
    this._paintFuelIcon(ctx, FUEL.cx, FUEL.cy + 13)
    this._paintTach(ctx)
    this._paintSpeedo(ctx)
    this._paintKeyFace(ctx)
  }

  // FEAT-33 ignition switch face: a silver escutcheon with three detent ticks FRAMING it at
  // 10 / 12 / 2 o'clock (OFF / ON / START). There is no needle — the key grip itself is the pointer,
  // drawn live in _drawKey.
  _paintKeyFace (ctx) {
    const g = KEY
    // Escutcheon: lit from the top-left like the rest of the cluster's shading, with a dark seam
    // where the metal meets the plastic recess.
    const grad = ctx.createRadialGradient(g.cx - 4.5, g.cy - 5, 0.5, g.cx, g.cy, KEY_FASCIA_R)
    grad.addColorStop(0, STEEL_HI)
    grad.addColorStop(0.55, STEEL)
    grad.addColorStop(1, STEEL_LO)
    ctx.beginPath()
    ctx.arc(g.cx, g.cy, KEY_FASCIA_R, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.65)'
    ctx.lineWidth = 1
    ctx.stroke()
    // Ticks sit on the dark recess OUTSIDE the metal, so they frame the escutcheon instead of
    // competing with the key for the middle of the dial.
    const r = KEY_TICK_R
    for (const [pos, a] of Object.entries(KEY_ANGLE)) {
      const c = Math.cos(a); const sn = Math.sin(a)
      // START is the momentary position you have to hold against a spring, so it wears the warning
      // colour the redlines use — the same "don't sit here" language as the rest of the cluster.
      ctx.strokeStyle = pos === 'start' ? RED : WHITE
      ctx.lineWidth = pos === 'on' ? 1.6 : 1.2
      ctx.beginPath()
      ctx.moveTo(g.cx + c * r, g.cy + sn * r)
      ctx.lineTo(g.cx + c * (r - 2), g.cy + sn * (r - 2))
      ctx.stroke()
    }
    // No 'IGN' legend at this size — a 7 px word inside a 26 px dial is mud, and the three detents
    // plus a key shape already say what it is.
  }

  // Fill the housing silhouette at dilation `pad`: the convex hull of the four outline circles
  // (temp + fuel pod discs at POD_R+pad, tach/speedo discs at well+DIAL_PAD+pad). The hull's
  // straight tangent edges BRIDGE the circles across the top and bottom (flush on each circle,
  // near-horizontal), while the sides stay the same circle arcs as the plain dilated union —
  // the pod's rounded left end and the speedo's right arc are untouched.
  _fillDilated (ctx, pad, style) {
    const T = { x: TEMP.cx, y: TEMP.cy, r: POD_R + pad }
    const F = { x: FUEL.cx, y: FUEL.cy, r: POD_R + pad }
    const K = { x: TACH.cx, y: TACH.cy, r: TACH.well + DIAL_PAD + pad }
    const S = { x: SPEEDO.cx, y: SPEEDO.cy, r: SPEEDO.well + DIAL_PAD + pad }
    const G = { x: KEY.cx, y: KEY.cy, r: KEY.well + KEY.pad + pad }        // FEAT-33 ignition switch
    // Outward normals of the common external tangents, in clockwise boundary order. The tach
    // crests above the temp→speedo line, so the top edge is two tangent segments (temp→tach,
    // tach→speedo); it stays inside the bottom edge, so the bottom is one (speedo→fuel).
    const nA = this._tangentNormal(T, K, (n) => n.y < 0)   // top, pod → tach
    const nB = this._tangentNormal(K, S, (n) => n.y < 0)   // top, tach → speedo
    // FEAT-33: the bottom edge used to run speedo → fuel in one tangent. The key well hangs below
    // and right of the speedo, so the hull now goes speedo → key → fuel: down the OUTER (upper-right)
    // tangent to the key, around it, then back along the bottom to the pod.
    const nE = this._tangentNormal(S, G, (n) => n.y < 0)   // right side, speedo → key (outer tangent)
    const nC = this._tangentNormal(G, F, (n) => n.y > 0)   // bottom, key → fuel
    const nD = this._tangentNormal(F, T, (n) => n.x < 0)   // left side, fuel → temp (pod side)
    const ang = (n) => Math.atan2(n.y, n.x)
    const pt = (c, n) => ({ x: c.x + c.r * n.x, y: c.y + c.r * n.y })
    // Top edge: ONE continuous convex curve from the pod shoulder to the speedo — a quadratic
    // whose control point is the intersection of the two top tangent lines (so it leaves the pod
    // and meets the speedo along their tangents), lifted a touch for the dash-visor bow. It
    // clears the tach crest, which no longer contributes an arc of its own.
    const pA = pt(T, nA)
    const pB = pt(S, nB)
    const X = this._lineHit(pA, { x: -nA.y, y: nA.x }, pB, { x: -nB.y, y: nB.x })
    X.y -= 22   // visor arc height — the tangent-line intersection sits almost on the chord,
                // so without this lift the "curve" renders as a straight line
    ctx.fillStyle = style
    ctx.beginPath()
    ctx.arc(T.x, T.y, T.r, ang(nD), ang(nA))   // pod top-left shoulder
    ctx.quadraticCurveTo(X.x, X.y, pB.x, pB.y) // visor curve, left edge to right edge
    ctx.arc(S.x, S.y, S.r, ang(nB), ang(nE))   // speedo right end
    ctx.arc(G.x, G.y, G.r, ang(nE), ang(nC))   // ignition switch — the bottom-right corner
    ctx.arc(F.x, F.y, F.r, ang(nC), ang(nD))   // pod bottom-left nose (bottom stays straight)
    ctx.closePath()
    ctx.fill()
  }

  // Intersection of lines a + t·u and b + s·v (u/v are directions). Falls back to the segment
  // midpoint if near-parallel (keeps the path sane if layout constants ever degenerate).
  _lineHit (a, u, b, v) {
    const den = u.x * v.y - u.y * v.x
    if (Math.abs(den) < 1e-6) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const t = ((b.x - a.x) * v.y - (b.y - a.y) * v.x) / den
    return { x: a.x + t * u.x, y: a.y + t * u.y }
  }

  // Unit normal of the common external tangent line of circles a → b, on the side selected by
  // `pick` (e.g. n.y < 0 for the upper tangent). Tangent touch points are a + r·n and b + r·n.
  _tangentNormal (a, b, pick) {
    const dx = b.x - a.x; const dy = b.y - a.y
    const d = Math.hypot(dx, dy)
    const al = (a.r - b.r) / d                     // along-axis component keeps both offsets equal
    const be = Math.sqrt(Math.max(0, 1 - al * al))
    for (const s of [1, -1]) {
      const n = { x: (al * dx - s * be * dy) / d, y: (al * dy + s * be * dx) / d }
      if (pick(n)) return n
    }
    return { x: 0, y: -1 }                          // degenerate fallback (concentric circles)
  }

  // Recessed regions the dial faces sit in (the "indents" on the real cluster): a capsule around
  // the staggered temp/fuel pod, and the UNION of two discs around tach + speedo — the union
  // outline pinches between the dials exactly like the raised face edge on the reference.
  _paintIndents (ctx) {
    const FILL = '#1a1613'
    const RIM  = 'rgba(0,0,0,0.55)'
    // Pod capsule: stroking it 3px wider in the rim color first leaves a 1.5px border ring.
    ctx.lineCap = 'round'
    for (const [style, w] of [[RIM, POD_R * 2 + 3], [FILL, POD_R * 2]]) {
      ctx.strokeStyle = style
      ctx.lineWidth = w
      ctx.beginPath()
      ctx.moveTo(TEMP.cx, TEMP.cy)
      ctx.lineTo(FUEL.cx, FUEL.cy)
      ctx.stroke()
    }
    // Dial indents: tach ∪ speedo ∪ ignition switch, as one merged region. Drawn stroke-UNDER-fill
    // (the same trick as the pod capsule above): every circle is stroked 3 px wide in the rim colour
    // FIRST, then all three are filled, so each fill covers the stroke halves that fall inside its
    // neighbours and only the outer 1.5 px of rim survives. That gives a true union outline —
    // including the concave pinches where the circles meet — without computing the outline path.
    const dials = [[TACH, TACH.well + DIAL_PAD], [SPEEDO, SPEEDO.well + DIAL_PAD], [KEY, KEY.well + KEY.pad]]
    ctx.strokeStyle = RIM
    ctx.lineWidth = 3
    for (const [g, r] of dials) {
      ctx.beginPath()
      ctx.arc(g.cx, g.cy, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.fillStyle = FILL
    for (const [g, r] of dials) {
      ctx.beginPath()
      ctx.arc(g.cx, g.cy, r, 0, Math.PI * 2)
      ctx.fill()
    }
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

  // FEAT-33: the ignition switch has THREE distinct renderings, not one shape swept through three
  // angles (owner, 2026-08-22). Each state is a different picture, and that is what makes it
  // readable at a glance rather than something you have to measure:
  //
  //   OFF     no key at all — a bare silver disc with a dark slot lying on the 10 o'clock axis.
  //           An empty keyhole IS the "this truck is dead" read; nothing else has to say it.
  //   START   the plastic key body — the slot shape, fattened — turned to 2 o'clock. Only ever
  //           on screen while the key is physically held against the spring.
  //   ON      the same key body at 12 o'clock — and it LOOKS different there, because the
  //           projection foreshortens vertically (see ISO below), so a key pointing up reads
  //           shorter and flatter than the same key pointing up-right. That is the perspective
  //           change, and it falls out of the projection rather than being drawn twice.
  //
  // THE PROJECTION. The key turns in the plane of the dial, and we view that plane from slightly
  // above, so screen_y = y · ISO. Applying that squash BEFORE the rotation is what makes it a fixed
  // viewpoint — squash after and the foreshortening spins with the key, which reads as a wobble.
  // Thickness is the silhouette drawn twice with the dark copy offset in SCREEN space (always down);
  // offsetting it inside the key's rotated frame — the obvious way — reads as a smear, not depth.
  _drawKey (ctx) {
    const g = KEY
    if (this._keyPos === 'off') { this._drawKeyhole(ctx); return }

    // The key body is deliberately the SAME shape as the keyhole, just wider and thicker (owner,
    // 2026-08-22). That is the whole visual language of the switch: a thin dark slot means empty,
    // a fat plastic bar means the key is in, and which way the bar lies is which detent it is at.
    // No head, no blade, no keyring — none of that survives being 34 px across anyway.
    const bar = (oy, fill) => {
      ctx.save()
      ctx.translate(g.cx, g.cy + oy)
      ctx.scale(1, ISO)                  // viewpoint foreshortening — before rotate, see above
      ctx.rotate(this._keyAngle)
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.roundRect(-KEY_BODY_L, -KEY_BODY_W / 2, KEY_BODY_L * 2, KEY_BODY_W, KEY_BODY_W / 2)
      ctx.fill()
      ctx.restore()
    }
    // Thickness first, then the face on top of it. 2 px of extrusion, not 1 — at this size a
    // one-pixel offset reads as a printing error rather than as a body standing off the metal.
    bar(2.0, '#08080a')
    bar(0, KEY_PLASTIC)
    // Moulding highlight down the body's upper edge, in the same projected frame.
    ctx.save()
    ctx.translate(g.cx, g.cy)
    ctx.scale(1, ISO)
    ctx.rotate(this._keyAngle)
    ctx.strokeStyle = 'rgba(255,255,255,0.20)'
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.moveTo(-KEY_BODY_L + 2, -KEY_BODY_W / 2 + 0.9)
    ctx.lineTo(KEY_BODY_L - 2, -KEY_BODY_W / 2 + 0.9)
    ctx.stroke()
    ctx.restore()
  }

  // OFF: the slot the key goes into, lying along the 10 o'clock axis — the direction the key points
  // when it is in and turned off. Dark, with a light lower lip so it reads as cut INTO the metal.
  _drawKeyhole (ctx) {
    const g = KEY
    ctx.save()
    ctx.translate(g.cx, g.cy)
    ctx.rotate(KEY_ANGLE.off)
    ctx.fillStyle = 'rgba(255,255,255,0.30)'                       // lip catching the light below
    ctx.beginPath()
    ctx.roundRect(-5.6, -1.1 + 0.9, 11.2, 2.2, 1.1)
    ctx.fill()
    ctx.fillStyle = '#141416'
    ctx.beginPath()
    ctx.roundRect(-5.6, -1.1, 11.2, 2.2, 1.1)
    ctx.fill()
    ctx.restore()
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
