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
//   setFuelLevel(frac 0..1) — the tank, every frame from main.js (FEAT-50, src/fuel.js).
//   setCoolantTemp(frac 0..1) — fed every frame from DamageModel.tempGaugeFrac() (FEAT-51).
//     Both needles are driven; the defaults below only cover the frames before the first feed.
//   seedOdometer(miles?) — random high "jalopy" mileage when omitted; accumulates real miles
//     driven, and is re-seeded on each story-mode entry (the next run's jalopy). Once runs have
//     a persistent jalopy identity, seed/save should key off that instead (noted in FEAT-49).

// Angle convention (canvas, y-down): increasing angle sweeps CLOCKWISE on screen.
// 135° = bottom-left, 270° = top, 405° = bottom-right — so every gauge maps
// frac → startDeg + frac * sweepDeg with the scale reading left-to-right over the top.
const DEG = Math.PI / 180

// Layout units (CSS pixels before SCALE; the canvas is SCALE × devicePixelRatio device px per unit).
// The canvas is anchored bottom-right in CSS.
//
// FEAT-34 round 2 (owner, 2026-11-07: "the rpm circle combined with the speedo like the reference, so the
// circles overlap"): the 2002 Ranger's tach and speedo share ONE face — the speedo stands into the tach's
// right side, the two rims meet in a cusp at the top, and no line divides them. Measured off the owner
// guide's cluster drawing: hubs 0.71 of the summed radii apart (here 96 px of 132), and the tach is a short
// arc — 0 at about half past eight, the top numeral at about twenty to one — so its scale ends before the
// cusp and its empty lower right is where the speedo's 0–30 mph sit. Hence TACH's 130° sweep (was 195°).
// Nothing of the tach may sit right of the cusp: BRAKE moved to the tach's lower left (where the 2002 has
// it).
//
// FEAT-34 round 3 (owner, 2026-11-08: "the outline and overall cluster shape is a little awkwardly slanted …
// straighten it out and make it a little more symmetric"): the layout is mirror-symmetric about the dial axis
// (y = AXIS), and the housing's two ends mirror each other. The temp/fuel pod stands upright (it was staggered 20°
// off vertical, temp high and inboard), centred on the axis; the key sits on the axis at 3 o'clock from the speedo
// (it hung off the bottom-right corner), inside a right end with the pod end's shape (END). The top and bottom edges
// are one symmetric arch each (_fillDilated). W grew 378 → 394 for the right end.
// And "blow up all the gauges like 15% the numbers are getting a little small": SCALE.
//
// FEAT-34 round 4 (owner, 2026-11-14: "make it a little wider and grow the speedo and tach to fill the frame make the
// top of the outline a little more convex than the bottom to represent the dashboard cluster shade"): W 394 → 418,
// the tach's well 62 → 68 and the speedo's 70 → 76 (scales, needles and the key's distance follow), H 204 → 224
// for the taller dials, and the arches differ — the top bows ARCH_TOP 26 beyond the corners' line, the bottom
// only ARCH_BOTTOM 7 (was 14 both), the brow of the cluster's hood. The mirror symmetry of round 3 now holds
// left–right only.
//
// FEAT-34 round 5 (owner, 2026-11-15: "move the key back to the bottom right corner. then grow the speedo and tach
// gauges so they fill the rectangular frame nicely ... bump their size 10%"): tach well 68 → 75 and speedo 76 → 84
// (scales and needles follow), POD_E 39 → 46 so the pod's corners still share the speedo's crest line, H 224 → 240,
// and the key sits in the housing's bottom-right corner (KEY_CORNER) instead of on the axis. Because the key left
// the axis the right end is stated by END_X, not derived from the key, and W 418 → 466.
// FEAT-34 round 6 (owner, 2026-11-15, DEC-283): sizes untouched; every position here is a named number. The tach
// moves right TACH_SHIFT 5, the speedo right SPEEDO_SHIFT 10 (more than the tach), and the key moves away from the
// speedo by KEY_AWAY 10: END_X grows by SPEEDO_SHIFT + KEY_AWAY (the right end follows the speedo, then the key's
// extra), so W grows by the same 20. The speed labels: km/h now stands above MPH, both on the hub's vertical,
// MPH 34 → 47 and km/h 46 (off to the right) → 38, i.e. the pair's centre down 4.5 with km/h over MPH.
//
// FEAT-34 round 7 (owner, 2026-11-15, DEC-284): the key's centre is the centre of the frame's bottom-right corner
// arc, and the tach+speedo pair is centred between the left pod and the key: GAP of plain housing on each side,
// measured indent edge to indent edge (pod capsule right edge → tach indent; speedo indent → key indent). So
// TACH.cx, SPEEDO.cx and END_X are DERIVED from GAP and TACH_SPEEDO (the hub-to-hub distance: 117 in round 6, +18 so the
// tach's last numeral clears the speedo's 20 and 40), not typed. The tach's scale now ends at 2 o'clock (TACH.sweep 130 → 170) and its four lamps
// (brake, tire, check engine, headlamp) share one row along its bottom (LAMP_*).
const GAP = 12, TACH_SPEEDO = 135
const KMH_DY = 38, MPH_DY = 47
const LAMP_DY = 47, LAMP_PITCH = 24   // the row's drop below the tach hub, and the spacing
// FEAT-34 round 8 (owner, 2026-11-15, DEC-285): km/h and MPH labels ×1.2 (7 → 8.4, 9 → 10.8 px); the frame's right edge
// moves halfway to the key (FRAME_IN; the key stays put, so it is 17 right of the corner arcs' centre); the tach's redline
// arc sits REDLINE_R beyond the scale (was 2.5) so it clears the tick ends; the lamps are re-scaled so their visual
// bounding boxes match (LAMP_K, glyph scale per slot: brake, tire, check engine, headlamp); dial numerals and pod letters
// move NUM_IN inward off the ticks; the fuel and temp symbols drop ICON_DY (13 → 16) clear of the needles' heels.
const KMH_PX = 7 * 1.2, MPH_PX = 9 * 1.2
const REDLINE_R = 4.5
const LAMP_K = { brake: 1.10, flat: 0.88, engine: 1.42, head: 1.28 }
const NUM_IN = 1.5
const ICON_DY = 16
const H = 240
const AXIS = H / 2   // the dial axis: tach and speedo hubs
// FEAT-235 (owner, 2026-11-16, against the 2002 owner guide's cluster drawing): three layers, as on the real one.
//   The housing (_outlinePath): a broad arch on top, a flat bottom with a raised inset under the dials — the hull of
//     the pods' circles grown by ROOM, the arch one big circle internally tangent to the grown temp and speedo (OUTLINE).
//   A lighter face inside it (FACE_LIGHT), the reference's appliqué, BEZEL inside the outline.
//   Dark pods on that face: the dials' pod (tach ∪ speedo ∪ key as before, now with a flat bottom: the tach's indent
//     reaches TACH_DROP further down so its bottom meets the speedo's), and a rounded triangle for temp + fuel
//     (_leftPodPath) whose right side runs concentric with the tach's indent, GAP out — a light band of constant width.
// Temp and fuel stagger like the reference — temp up and right, fuel down and left (POD_DX) — and stand closer together
// vertically (POD_E 46 → 38). The tach is placed so temp's backing stands exactly GAP from the tach's indent (DEC-284's
// GAP, now measured to the nearest pod); speedo, key and the right edge follow as in rounds 7–8.
const POD_R = 39    // a small gauge's dark backing circle (well 33 + 6)
const POD_E = 38    // temp above, fuel below the axis
const POD_DX = 12   // temp right of, fuel left of the pod's centre line
const POD_DY = 15   // the pod's centre below the axis: the reference's temp sits near the axis, fuel low (round 8: 0)
const FUEL_X = 56
const POD_CORNER = 14   // the left pod's bottom-right corner radius
const DIAL_PAD = 8      // indent ring visible around the tach/speedo wells
const TACH_DROP = 84 - 75   // SPEEDO.well − TACH.well: the tach's indent bottom level with the speedo's
const POD_GAP_R = 75 + DIAL_PAD + GAP   // the left pod's concave right side: the tach's indent radius + GAP
const TEMP  = { cx: FUEL_X + 2 * POD_DX, cy: AXIS + POD_DY - POD_E, well: 33, scaleR: 26, start: 215, sweep: 110 }
const FUEL  = { cx: FUEL_X, cy: AXIS + POD_DY + POD_E, well: 33, scaleR: 26, start: 215, sweep: 110 }
const TACH_X = TEMP.cx + Math.sqrt((POD_GAP_R + POD_R) ** 2 - (AXIS - TEMP.cy) ** 2)
const TACH  = { cx: TACH_X, cy: AXIS, well: 75, scaleR: 65, start: 160, sweep: 170 }    // dial top: _tachMax (setRedline)
const SPEEDO= { cx: TACH_X + TACH_SPEEDO, cy: AXIS, well: 84, scaleR: 75, start: 135, sweep: 270, max: 120 }  // MPH
// The left pod's bottom-right corner circle: tangent to the bottom line and to the concave side (centre POD_GAP_R +
// POD_CORNER from the dropped tach centre).
const POD_BR = (() => {
  const y = FUEL.cy + POD_R - POD_CORNER, dy = y - (AXIS + TACH_DROP)
  return { x: TACH_X - Math.sqrt((POD_GAP_R + POD_CORNER) ** 2 - dy * dy), y }
})()
// The odometer drum's window, from the speedo hub. Low enough that the 40 and 80 clear its top corners (round 3).
const ODO = { x: -29, y: -23, w: 58, h: 14 }
// One factor on the canvas transform (round 3), so every distance the layout balances (the key's three below, the
// joined faces' cusp) scales with it, and the layout keeps its own units.
const SCALE = 1.15
// FEAT-33 ignition switch — a small well on the dial axis at the speedo's 3 o'clock (round 3).
// It carries its OWN indent pad (smaller than DIAL_PAD) because at this size the standard ring would
// be most of the dial. Three distances have to hold, and they are tight — check all three before
// moving it (all measured from the speedo centre, the distance is now set by END_X (round 5)):
//   wells apart      93.3 > SPEEDO.well + KEY.well (87)      or the key face eats the speedo face
//   indent clears    93.3 − (well+pad) = 73.3 > SPEEDO.well   or it bites a crescent out of 120/km-h
//   indents overlap  93.3 < SPEEDO.well + DIAL_PAD + well+pad or the switch reads as a detached island
// The well grew 13 → 17 when the needle became a key grip: a key silhouette needs pixels to read as
// an object, and 26 px of dial was not enough. 34 px is the most the three distances above allow.
// Round 5: the key's indent stands MARGIN inside the bottom-right corner circle (centre END_X, AXIS + POD_E),
// i.e. KEY_CORNER = POD_R + MARGIN − (KEY.well + KEY.pad) − MARGIN from that centre, along the diagonal. END_X puts the
// key 103 from the speedo hub, > SPEEDO.well + KEY.well (101) so the key face does not eat the speedo face.
const END_X = SPEEDO.cx + 84 + 8 + GAP + 17 + 3   // the speedo's indent edge + GAP + the key's indent (well + pad)
// Round 8 (DEC-285): the housing's right edge (its dark rim's outside) stands KEY_EDGE right of the key's centre.
// FEAT-235 keeps that edge and the key's height (46 below the axis), now inside the outline's right end.
const KEY_EDGE = 37
const W = END_X + KEY_EDGE + 8   // plus the 8 px canvas margin
const KEY   = { cx: END_X, cy: AXIS + 46, well: 17, pad: 3 }
// Key detents, in canvas angles (0 = 3 o'clock, increasing clockwise): 10 / 12 / 2 o'clock.
const KEY_ANGLE = { off: 210 * DEG, on: 270 * DEG, start: 330 * DEG }
const KEY_TICK_R = 16.5   // detent ticks run inward from here to r=14.5 — OUTSIDE the fascia, framing it
const KEY_FASCIA_R = 12   // the silver escutcheon the key turns in
// Escutcheon metal. The rest of the cluster is dark plastic; the ignition surround is the one part
// of a real dash that is bare metal, and that contrast is what makes the switch findable.
const LAMP_ORANGE = '#ff9a1f'   // FEAT-50 low-fuel lamp, lit
const LAMP_RED    = '#ff3a26'   // FEAT-34 BRAKE lamp, lit
const LAMP_BLUE   = '#3d84ff'   // FEAT-34 headlamp lamp at high beam, lit
const LAMP_GREEN  = '#3fd45e'   // FEAT-34 headlamp lamp at low beam, lit
const LAMP_UNLIT_AMBER = '#3a2410'   // an unlit amber lens: just enough to see there is a lamp there
const LAMP_UNLIT_RED   = '#3a1210'
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

// The housing outline (FEAT-235). Its offsets: the dark rim's outside at +2, the housing band to −BEZEL, the light
// face inside that. FACE_M is the least light face shown around any pod; the ends are placed from it.
const BEZEL = 5
const FACE_M = 8
const INSET_Y = AXIS + 84 + DIAL_PAD + FACE_M + BEZEL   // the inset's top: FACE_M of light face under the dials' pod
const INSET_H = 7        // how far the inset stands up from the bottom line
const INSET_RUN = 9      // its sloped sides' horizontal run
const INSET_HALF = 120   // half its width at the top, centred on the cluster
const BOTTOM_Y = INSET_Y + INSET_H
const ROOM = FACE_M + BEZEL   // a pod's circle grown by this is where the outline may come
const CORNER = 16             // the bottom corners' radius
const ARCH_PEAK = 7           // the arch's top, from the canvas top
const KEY_END = KEY_EDGE - 2  // the right end's circle round the key: its outside is the round-8 edge
// The outline is the hull of these circles, clockwise from the arch (_outlinePath): the arch, internally tangent to the
// grown temp and speedo circles; the grown speedo; the key's end; the bottom corners; the grown fuel and temp circles.
const OUTLINE = (() => {
  const temp = { x: TEMP.cx, y: TEMP.cy, r: POD_R + ROOM }, fuel = { x: FUEL.cx, y: FUEL.cy, r: POD_R + ROOM }
  const speedo = { x: SPEEDO.cx, y: SPEEDO.cy, r: SPEEDO.well + DIAL_PAD + ROOM }
  const key = { x: KEY.cx, y: KEY.cy, r: KEY_END }
  const br = { x: KEY.cx + KEY_END - CORNER, y: BOTTOM_Y - CORNER, r: CORNER }
  const bl = { x: fuel.x - fuel.r + CORNER, y: BOTTOM_Y - CORNER, r: CORNER }
  return [archThrough(temp, speedo, ARCH_PEAK), speedo, key, br, bl, fuel, temp]
})()
const INSET_X = (OUTLINE[4].x - CORNER + OUTLINE[3].x + CORNER) / 2
const FACE_LIGHT = '#575049'   // the light face (the owner guide's white appliqué, as a lighter plastic)

const FACE   = '#171412'   // gauge face / panel
const WHITE  = '#e8e6e0'
const DIM    = '#9a958f'   // inner km/h ring
const RED    = '#d8402c'
const NEEDLE = '#f2f0ea'

// The circle internally tangent to both circles l and r ({x, y, r}) whose top is at peakY: bisect its radius, where the
// centre's x found from l's tangency meets the one found from r's.
function archThrough (l, r, peakY) {
  const cx = (R, c, s) => c.x + s * Math.sqrt((R - c.r) ** 2 - (peakY + R - c.y) ** 2)
  let lo = Math.max(l.r + l.y - peakY, r.r + r.y - peakY) / 2, hi = 1e5
  for (let i = 0; i < 80; i++) { const R = (lo + hi) / 2; if (cx(R, l, 1) < cx(R, r, -1)) lo = R; else hi = R }
  return { x: cx(lo, l, 1), y: peakY + lo, r: lo }
}

// The outward normal angle of the outer tangent from circle a to circle b, walking clockwise on screen.
function tangentAngle (a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  return Math.atan2(dy, dx) - Math.acos(Math.max(-1, Math.min(1, (a.r - b.r) / Math.hypot(dx, dy))))
}

function gaugeAngle (g, frac) {
  const f = Math.max(0, Math.min(1, frac))
  return (g.start + f * g.sweep) * DEG
}

export class GaugeCluster {
  constructor (canvas) {
    this._canvas = canvas
    this._dpr = Math.min(2, window.devicePixelRatio || 1) * SCALE   // device px per layout unit
    canvas.width = Math.ceil(W * this._dpr)
    canvas.height = Math.ceil(H * this._dpr)
    canvas.style.width = W * SCALE + 'px'
    canvas.style.height = H * SCALE + 'px'
    this._ctx = canvas.getContext('2d')
    this._ctx.scale(this._dpr, this._dpr)

    // Live needle state (first-order lag gives the needles a touch of mechanical damping).
    this._speedMph = 0
    this._rpm = 0
    // Both are driven every frame — fuel from the tank (FEAT-50), temp from the engine (FEAT-51). These
    // are the values before the first frame: fuel at fuelStartFrac's 0.62, a cold engine at C.
    this._fuelFrac = 0.62
    this._lowFuel = false
    this._flat = false
    this._parkBrake = false
    this._lights = 0          // headlamp switch: 0 off, 1 low, 2 high
    this._lightsDead = false  // either headlamp at 0 % (round 3)
    this._checkEngine = false
    this._overheat = false
    this._tempFrac = 0
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
    this._drawn = {}   // the inputs of the last repaint (update()'s early-out)
    this._redline = 5500   // rpm — setRedline() repaints the tach face when the fitted engine changes
    this._tachMax = 6      // ×1000 rpm — the dial's top numeral

    this._bg = document.createElement('canvas')
    this._bg.width = Math.ceil(W * this._dpr)
    this._bg.height = Math.ceil(H * this._dpr)
    this._paintFace()
    // BUG-182: a GPU reset blanks every 2D canvas and resets its state (contextrestored, on each canvas): repaint the
    // face, re-apply the scale, and let update() redraw the dial.
    this._bg.addEventListener('contextrestored', () => { this._paintFace(); this._drawn = {} })
    canvas.addEventListener('contextrestored', () => { this._ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0); this._drawn = {} })
  }

  /** The fitted engine's redline (rpm). Dial top = next 1000 above redline + 250: V6 5500 → 6, I4 6250 → 7. */
  setRedline (rpm) {
    if (rpm === this._redline) return
    this._redline = rpm
    this._tachMax = Math.ceil((rpm + 250) / 1000)
    this._paintFace()
    this._drawn = {}
  }

  /** Seed the odometer. No argument → random high jalopy mileage (80k–160k miles). */
  seedOdometer (miles) {
    this._odoMiles = miles !== undefined ? miles : 80000 + Math.floor(Math.random() * 80000)
  }

  /** The odometer reading, in miles (FEAT-42: the run save carries it). */
  get odoMiles () { return this._odoMiles }

  /** 0 = E, 1 = F. Fed every frame from the tank (FEAT-50). */
  setFuelLevel (frac) { this._fuelFrac = Math.max(0, Math.min(1, frac)) }

  /** FEAT-50: the low-fuel lamp's sender — true below the warning level. Lit only with the key on. */
  setLowFuel (on) { this._lowFuel = !!on }

  /** FEAT-94: the tire-pressure lamp's sender — true while any tire is flat. Lit only with the key on. */
  setFlat (on) { this._flat = !!on }

  /** FEAT-34: the BRAKE lamp's sender — the parking brake applied (latched, or held). Lit only with the key on. */
  setParkBrake (on) { this._parkBrake = !!on }

  /** FEAT-34: the high-beam lamp's sender. On the headlamp circuit, not the ignition: lit with the key off too. */
  setHeadlights (mode, dead) { this._lights = mode | 0; this._lightsDead = !!dead }

  /** FEAT-34: the CHECK ENGINE lamp's sender — engine condition at or under its knee. Lit only with the key on. */
  setCheckEngine (on) { this._checkEngine = !!on }

  /** FEAT-34: the overheat lamp's sender — the coolant past H, where engine damage starts. Lit only with the key on. */
  setOverheat (on) { this._overheat = !!on }

  /** 0 = C, 1 = H (FEAT-51: C = 90 °C, mid = 100 °C, H = 110 °C on the stock thermostat). */
  setCoolantTemp (frac) { this._tempFrac = Math.max(0, Math.min(1, frac)) }

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

  /** FEAT-126: the gear readout in the tach face — 'R' / 'N' / '1'..'5' in a manual, 'D3' / 'R' in an automatic. */
  setGear (label) { this._gear = String(label ?? '') }

  setVisible (v) {
    if (v === this._visible) return
    this._visible = v
    this._canvas.style.display = v ? 'block' : 'none'
  }

  /** Per-frame. dt in seconds, speedMps = vehicle speed magnitude (m/s), rpm = engine RPM. */
  update (dt, speedMps, rpm) {
    // Odometer accumulates actual distance covered (magnitude — a jalopy drum has no idea
    // which way the driveshaft turns). BEFORE the visibility return: the truck still covers
    // ground while the map hides the cluster, and the drum must not lose those miles.
    this._odoMiles += speedMps * dt / 1609.344
    if (!this._visible) return
    const mph = speedMps * 2.23694

    // Needle damping: fast lag on the driven gauges, slow crawl on fuel/temp (real senders
    // are heavily damped — and it makes the key-on sweep from 0 read as intentional).
    const k = 1 - Math.exp(-dt / 0.06)
    this._speedMph += (mph - this._speedMph) * k
    this._rpm += (rpm - this._rpm) * k
    const ks = 1 - Math.exp(-dt / 1.2)
    this._fuelShown += (this._fuelFrac - this._fuelShown) * ks
    this._tempShown += (this._tempFrac - this._tempShown) * ks
    this._keyAngle += (this._keyTarget - this._keyAngle) * (1 - Math.exp(-dt / 0.045))

    // Nothing drawn has moved → the canvas already shows this frame; skip the repaint. EXACT
    // equality on every drawn input (not a tolerance), so a skipped frame is pixel-identical to the
    // one it replaces. Hits when everything has settled: engine off and parked, or a paused game.
    const d = this._drawn
    if (d.speed === this._speedMph && d.rpm === this._rpm && d.temp === this._tempShown
        && d.fuel === this._fuelShown && d.odo === this._odoMiles
        && d.key === this._keyAngle && d.keyPos === this._keyPos && d.low === this._lowLit() && d.flat === this._flatLit() && d.gear === this._gear
        && d.brake === this._brakeLit() && d.lamp === this._headlampState()
        && d.ce === this._checkEngineLit() && d.hot === this._overheatLit()) return
    d.speed = this._speedMph; d.rpm = this._rpm; d.temp = this._tempShown
    d.fuel = this._fuelShown; d.odo = this._odoMiles; d.key = this._keyAngle; d.keyPos = this._keyPos
    d.low = this._lowLit()
    d.flat = this._flatLit()
    d.gear = this._gear
    d.brake = this._brakeLit()
    d.lamp = this._headlampState()
    d.ce = this._checkEngineLit()
    d.hot = this._overheatLit()

    const ctx = this._ctx
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(this._bg, 0, 0, W, H)
    this._drawOdometer(ctx)
    this._drawNeedle(ctx, TEMP, this._tempShown, 22, 2)
    this._drawLowFuelLamp(ctx)
    this._drawFlatLamp(ctx)
    this._drawBrakeLamp(ctx)
    this._drawHeadlampLamp(ctx)
    this._drawCheckEngineLamp(ctx)
    this._drawOverheatLamp(ctx)
    this._drawGear(ctx)
    this._drawNeedle(ctx, FUEL, this._fuelShown, 22, 2)
    this._drawNeedle(ctx, TACH, this._rpm / (this._tachMax * 1000), 58, 3)
    this._drawNeedle(ctx, SPEEDO, this._speedMph / SPEEDO.max, 69, 3)
    this._drawKey(ctx)
  }

  // ── static face ────────────────────────────────────────────────────────────────────────────

  _paintFace () {
    const ctx = this._bg.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)        // setRedline() repaints: reset before re-scaling
    ctx.clearRect(0, 0, this._bg.width, this._bg.height)
    ctx.scale(this._dpr, this._dpr)

    // Housing: successive offsets of one outline, each covering the next larger but for its outer band — a 2 px dark
    // rim, a 1.5 px edge highlight, the housing band, a dark lip, then the light face (FEAT-235).
    const layers = [[2, 'rgba(10,8,7,0.9)'], [0, '#3a332e'], [-1.5, '#282320'], [-BEZEL, '#100d0b'], [-BEZEL - 1, FACE_LIGHT]]
    for (const [pad, style] of layers) { this._outlinePath(ctx, pad); ctx.fillStyle = style; ctx.fill() }

    this._paintIndents(ctx)
    for (const g of [TEMP, FUEL, TACH, KEY]) this._paintWell(ctx, g)
    this._paintJoinedWell(ctx, SPEEDO, TACH)

    this._paintSmallGauge(ctx, TEMP, 'C', 'H', 1)   // red mark at the H end
    this._paintSmallGauge(ctx, FUEL, 'E', 'F', 0)   // red mark at the E end
    this._paintTempIcon(ctx, TEMP.cx, TEMP.cy + ICON_DY)
    this._paintFuelIcon(ctx, FUEL.cx, FUEL.cy + ICON_DY)
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

  // The housing outline offset by p (FEAT-235): the hull of OUTLINE's circles, each grown by p — an exact offset, since
  // the tangents' angles depend only on radius differences. The bottom run (br → bl) takes the inset, cornered by arcTo.
  _outlinePath (ctx, p) {
    const c = OUTLINE, n = c.length
    const out = c.map((a, i) => tangentAngle(a, c[(i + 1) % n]))   // leaving circle i
    const x1 = INSET_X - INSET_HALF, x2 = INSET_X + INSET_HALF, yB = BOTTOM_Y + p, yI = INSET_Y + p, f = 4
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const a = c[i], a0 = out[(i + n - 1) % n]
      let a1 = out[i]
      while (a1 < a0) a1 += 2 * Math.PI
      ctx.arc(a.x, a.y, a.r + p, a0, a1)
      if (i === 3) {   // the bottom corner on the right: the bottom line to the left, through the inset
        ctx.arcTo(x2 + INSET_RUN, yB, x2, yI, f)
        ctx.arcTo(x2, yI, x1, yI, f)
        ctx.arcTo(x1, yI, x1 - INSET_RUN, yB, f)
        ctx.arcTo(x1 - INSET_RUN, yB, c[4].x, yB, f)
      }
    }
    ctx.closePath()
  }

  // The temp/fuel pod offset by p (FEAT-235): a rounded triangle. Clockwise: over temp's backing circle, down the
  // concave side (around the tach's indent at POD_GAP_R, its TACH_DROP straight, around the dropped centre), round the
  // bottom-right corner, along the flat bottom, round fuel's backing circle, and up the straight tangent back to temp.
  // Every joint is a tangency, so the outline is smooth.
  _leftPodPath (ctx, p) {
    const r = POD_R + p, ty = AXIS + TACH_DROP
    const dx = TEMP.cx - FUEL.cx, dy = TEMP.cy - FUEL.cy, n = Math.hypot(dx, dy)
    const aN = Math.atan2(-dx / n, dy / n)    // the outward normal of the left tangent line
    const aT = Math.atan2(TEMP.cy - AXIS, TEMP.cx - TACH.cx), aB = Math.atan2(POD_BR.y - ty, POD_BR.x - TACH.cx)
    ctx.beginPath()
    ctx.arc(TEMP.cx, TEMP.cy, r, aN, aT + Math.PI)
    ctx.arc(TACH.cx, AXIS, POD_GAP_R - p, aT, Math.PI, true)
    ctx.arc(TACH.cx, ty, POD_GAP_R - p, Math.PI, aB, true)
    ctx.arc(POD_BR.x, POD_BR.y, POD_CORNER + p, aB + Math.PI, Math.PI / 2)
    ctx.arc(FUEL.cx, FUEL.cy, r, Math.PI / 2, aN + 2 * Math.PI)
    ctx.closePath()
  }

  // Recessed regions the dial faces sit in (the "indents" on the real cluster): the temp/fuel pod, and the UNION of
  // the tach (dropped TACH_DROP at the bottom), speedo and key discs with a flat bottom between the tach and speedo.
  _paintIndents (ctx) {
    const FILL = '#1a1613'
    const RIM  = 'rgba(0,0,0,0.55)'
    this._leftPodPath(ctx, 1.5); ctx.fillStyle = RIM; ctx.fill()
    this._leftPodPath(ctx, 0); ctx.fillStyle = FILL; ctx.fill()
    // Dial indents, as one merged region. Drawn stroke-UNDER-fill: every shape is stroked 3 px wide in the rim colour
    // FIRST, then all are filled, so each fill covers the stroke halves that fall inside its neighbours and only the
    // outer 1.5 px of rim survives — a true union outline, cusp included, without computing the outline path.
    const tr = TACH.well + DIAL_PAD, bottom = AXIS + TACH_DROP + tr
    const shapes = [
      () => { ctx.arc(TACH.cx, AXIS, tr, Math.PI, 0); ctx.arc(TACH.cx, AXIS + TACH_DROP, tr, 0, Math.PI); ctx.closePath() },
      () => ctx.arc(SPEEDO.cx, SPEEDO.cy, SPEEDO.well + DIAL_PAD, 0, Math.PI * 2),
      () => ctx.arc(KEY.cx, KEY.cy, KEY.well + KEY.pad, 0, Math.PI * 2),
      () => ctx.rect(TACH.cx, AXIS, SPEEDO.cx - TACH.cx, bottom - AXIS),
    ]
    ctx.strokeStyle = RIM
    ctx.lineWidth = 3
    for (const s of shapes) { ctx.beginPath(); s(); ctx.stroke() }
    ctx.fillStyle = FILL
    for (const s of shapes) { ctx.beginPath(); s(); ctx.fill() }
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

  // FEAT-34: the speedo's face JOINS the tach's (see TACH) — one face, no dividing rim. Outside the tach's
  // disc it paints like any well; inside, each pixel keeps the lighter of the two shadings ('lighten'), so
  // each rim's dark edge vanishes inside the other face and only the union's own outline stays dark.
  _paintJoinedWell (ctx, g, under) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, W, H)
    ctx.arc(under.cx, under.cy, under.well, 0, Math.PI * 2)
    ctx.clip('evenodd')
    this._paintWell(ctx, g)
    ctx.restore()
    ctx.save()
    ctx.beginPath()
    ctx.arc(under.cx, under.cy, under.well, 0, Math.PI * 2)
    ctx.clip()
    ctx.globalCompositeOperation = 'lighten'
    this._paintWell(ctx, g)
    ctx.restore()
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
    this._labelAt(ctx, g, 0, g.scaleR - 9 - NUM_IN, loLabel)
    this._labelAt(ctx, g, 1, g.scaleR - 9 - NUM_IN, hiLabel)
  }

  _paintTach (ctx) {
    const g = TACH, max = this._tachMax, red = this._redline / 1000
    for (let n = 0; n <= max * 2; n++) {             // minor tick every 500 RPM
      const f = n / (max * 2)
      const major = n % 2 === 0
      this._tick(ctx, g, f, g.scaleR, major ? 7 : 4, n / 2 >= red ? RED : WHITE, major ? 2 : 1)
    }
    // Redline arc from the redline to the top of the dial.
    ctx.strokeStyle = RED
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(g.cx, g.cy, g.scaleR + REDLINE_R, gaugeAngle(g, red / max), gaugeAngle(g, 1))
    ctx.stroke()
    // Numerals 0–max, the ones past the redline in red.
    ctx.font = 'bold 12px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let n = 0; n <= max; n++) {
      ctx.fillStyle = n >= red ? RED : WHITE
      this._numeralAt(ctx, g, n / max, String(n), 8.6)
    }
    // Legend — kept left of the cusp (see TACH): RPM x1000 at the top under the numerals, as the 2002 prints it.
    // (The UNLEADED FUEL ONLY legend went in round 3: owner, 2026-11-08, "get rid of unleaded fuel only".)
    ctx.fillStyle = WHITE
    ctx.font = 'bold 8px Arial, sans-serif'
    ctx.fillText('RPM x1000', g.cx, g.cy - 22)
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
    // Numerals every 20 mph from 0 (round 3, owner 2026-11-08: "skip every other 10 mph too. so 0-20-40-60").
    for (let n = 0; n <= g.max; n += 20) {
      this._numeralAt(ctx, g, n / g.max, String(n), 6.8)
    }
    // Inner km/h ring: same angular scale, kmh label sits at frac (kmh/1.609)/120. Inside the mph numerals' widest
    // reach (the 100 at 3 o'clock), so 160 km/h does not run into it. Labels that would land behind the odometer box
    // are skipped, not overdrawn.
    ctx.fillStyle = DIM
    ctx.font = '6px Arial, sans-serif'
    for (let kmh = 20; kmh <= 180; kmh += 20) {
      const a = gaugeAngle(g, (kmh / 1.60934) / g.max)
      const lx = g.cx + Math.cos(a) * (g.scaleR - 32)
      const ly = g.cy + Math.sin(a) * (g.scaleR - 32)
      if (Math.abs(lx - g.cx) < ODO.w / 2 + 6 && ly > g.cy + ODO.y - 3 && ly < g.cy + ODO.y + ODO.h + 3) continue
      ctx.fillText(String(kmh), lx, ly)
    }
    ctx.fillStyle = WHITE
    ctx.font = `bold ${MPH_PX}px Arial, sans-serif`
    ctx.fillText('MPH', g.cx, g.cy + MPH_DY)
    ctx.fillStyle = DIM
    ctx.font = `${KMH_PX}px Arial, sans-serif`
    ctx.fillText('km/h', g.cx, g.cy + KMH_DY)
    // Odometer bezel (digits are live — see _drawOdometer). Sits in the trip-drum slot
    // of the reference, top-center inside the speedo face.
    ctx.fillStyle = '#060606'
    ctx.fillRect(g.cx + ODO.x, g.cy + ODO.y, ODO.w, ODO.h)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(g.cx + ODO.x - 0.5, g.cy + ODO.y - 0.5, ODO.w + 1, ODO.h + 1)
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

  // A dial numeral, its outer edge 9.5 px inside the scale (the major ticks are 7 long with a round cap, plus a 1.5 px
  // gap): the centre is pulled in by the text's own half-extent along the radius, so a wide numeral at 3 or 9 o'clock
  // ("100", "20") clears its tick as a narrow one at 12 does. capH = the font's digit height (0.72 × its px size).
  _numeralAt (ctx, g, frac, text, capH) {
    const a = gaugeAngle(g, frac), c = Math.cos(a), s = Math.sin(a)
    const r = g.scaleR - 9.5 - NUM_IN - (Math.abs(c) * ctx.measureText(text).width + Math.abs(s) * capH) / 2
    ctx.fillText(text, g.cx + c * r, g.cy + s * r)
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

  // FEAT-50: the LOW FUEL lamp — a plain orange lens on the fuel dial's low side, under the E and
  // clear of the needle's sweep (which runs across the top of the dial). Like a real dash lamp it is
  // dark with the key off, a barely-there lens when unlit, and a glowing orange disc when lit.
  _lowLit () { return this._lowFuel && this._keyPos !== 'off' }

  // FEAT-126: the gear, lit like the lamps (dark with the key off), in the tach face above RPM x1000 —
  // under the needle, which is drawn after it.
  _drawGear (ctx) {
    if (!this._gear || this._keyPos === 'off') return
    ctx.save()
    ctx.font = 'bold 15px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = this._gear === 'R' ? LAMP_ORANGE : '#e8e8e0'
    ctx.fillText(this._gear, TACH.cx, TACH.cy + 24)
    ctx.restore()
  }
  _drawLowFuelLamp (ctx) {
    const x = FUEL.cx - 15, y = FUEL.cy + 9, r = 3.2
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    if (this._lowLit()) {
      ctx.shadowColor = 'rgba(255,150,30,0.9)'
      ctx.shadowBlur = 7
      ctx.fillStyle = LAMP_ORANGE
    } else {
      ctx.fillStyle = LAMP_UNLIT_AMBER
    }
    ctx.fill()
    ctx.restore()
  }

  // FEAT-94: the TIRE PRESSURE lamp — the standard symbol (a tire's cross-section, open at the top,
  // with a "!" in it) in the speedo face above MPH, mirroring the gear in the tach. A state, never a
  // number (SM-INV-10): it says a tire is flat, not which one or how much — the pop and the pull
  // already say which. Under the needle, which is drawn after it.
  _flatLit () { return this._flat && this._keyPos !== 'off' }
  _drawFlatLamp (ctx) {
    const x = 0, y = 0, r = 7
    const lit = this._flatLit()
    ctx.save()
    this._lampAt(ctx, 1, LAMP_K.flat)
    if (lit) { ctx.shadowColor = 'rgba(255,150,30,0.9)'; ctx.shadowBlur = 7 }
    ctx.strokeStyle = ctx.fillStyle = lit ? LAMP_ORANGE : LAMP_UNLIT_AMBER
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(x, y, r, -60 * DEG, 240 * DEG)   // clockwise round the bottom: open at the top
    ctx.moveTo(x, y - 4)
    ctx.lineTo(x, y + 1)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y + 3.6, 1, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // FEAT-34: the 2002 Ranger's two state lamps (owner guide's cluster drawing; colours per FMVSS 101 — a brake telltale
  // is red, high beam blue). BRAKE: "((!))" over the word, at the tach's lower left as the 2002 cluster draws it (the
  // lower right is the speedo's since the faces joined). Lit while the parking brake is applied
  // and, as the guide says, "momentarily at start up to ensure the circuit is functional" (the key at START).
  _brakeLit () { return this._keyPos === 'start' || (this._parkBrake && this._keyPos !== 'off') }
  // Round 7: the row's slot i (0..3, left to right, centred on the tach hub) as the origin, the glyph scaled by k so
  // every lamp's visual bounding box has about the same size (LAMP_K, round 8). Call after ctx.save(); the caller's restore undoes it.
  _lampAt (ctx, i, k) {
    ctx.translate(TACH.cx + (i - 1.5) * LAMP_PITCH, TACH.cy + LAMP_DY)
    ctx.scale(k, k)
  }
  _drawBrakeLamp (ctx) {
    const x = 0, y = 0
    const lit = this._brakeLit()
    ctx.save()
    this._lampAt(ctx, 0, LAMP_K.brake)
    if (lit) { ctx.shadowColor = 'rgba(255,50,30,0.9)'; ctx.shadowBlur = 7 }
    ctx.strokeStyle = ctx.fillStyle = lit ? LAMP_RED : LAMP_UNLIT_RED
    ctx.lineWidth = 1.4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(x, y, 4.2, 0, Math.PI * 2)                                           // the drum
    ctx.moveTo(x - 6.4 + 1.2, y - 3.6); ctx.arc(x, y, 6.4, 214 * DEG, 146 * DEG, true)   // ( — the shoes
    ctx.moveTo(x + 6.4 - 1.2, y + 3.6); ctx.arc(x, y, 6.4, 34 * DEG, -34 * DEG, true)    //   )
    ctx.moveTo(x, y - 2.3); ctx.lineTo(x, y + 0.6)
    ctx.stroke()
    ctx.beginPath(); ctx.arc(x, y + 2.2, 0.75, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  // FEAT-34: the HEADLAMP lamp, in the fuel pod mirroring the low-fuel lamp (the 2002 sets its high-beam lamp beside
  // its fuel gauge). Owner, 2026-11-08: "green low beams blue high beams and red if your lights are both dead and you
  // try to turn them on"; round 3, the same day: "headlight light should be on if either headlight is dead". So one
  // lens follows the switch: the low-beam symbol (beams angled down) green, the high-beam symbol ("≡D", beams level)
  // blue, and the switched-on symbol red when EITHER headlamp is at 0 %. On the headlamp circuit, not the ignition:
  // it lights with the key off too.
  _headlampState () { return !this._lights ? 'off' : this._lightsDead ? 'dead' : this._lights === 2 ? 'high' : 'low' }
  _drawHeadlampLamp (ctx) {
    const x = 1.5, y = 0   // the glyph's centre is 1.5 left of its origin
    const st = this._headlampState()
    const [col, glow] = { off: ['#10241a', null], low: [LAMP_GREEN, 'rgba(60,210,90,0.9)'],
      high: [LAMP_BLUE, 'rgba(70,130,255,0.9)'], dead: [LAMP_RED, 'rgba(255,50,30,0.9)'] }[st]
    const drop = this._lights === 2 ? 0 : 1.6      // beam droop: level at high, angled down at low (and off)
    ctx.save()
    this._lampAt(ctx, 3, LAMP_K.head)
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 7 }
    ctx.strokeStyle = col
    ctx.lineWidth = 1.3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x - 0.5, y - 3.5); ctx.arc(x - 0.5, y, 3.5, -90 * DEG, 90 * DEG); ctx.closePath()   // the lamp, flat face left
    for (const dy of [-3, 0, 3]) { ctx.moveTo(x - 2.5, y + dy); ctx.lineTo(x - 6, y + dy + drop) } // the beams
    ctx.stroke()
    ctx.restore()
  }

  // FEAT-34 round 2 (owner, 2026-11-07): the temp pod mirrors the fuel pod — a lamp each side of the glyph.
  // CHECK ENGINE as the symbol, not the 2002's text lens (owner: "check engine (as a symbol)"): the ISO engine
  // outline, amber, on the C side. Lit at the engine's knee (DAMAGE_PARAMS.engineKnee, 50 %), where its power
  // loss steepens; and at START, the bulb check the 2002 guide describes for this lamp, like BRAKE.
  _checkEngineLit () { return this._keyPos === 'start' || (this._checkEngine && this._keyPos !== 'off') }
  _drawCheckEngineLamp (ctx) {
    const x = 0.3, y = -0.25   // the glyph's own centre is (−0.3, +0.25) from its drawing origin; this recentres it
    const lit = this._checkEngineLit()
    ctx.save()
    this._lampAt(ctx, 2, LAMP_K.engine)
    if (lit) { ctx.shadowColor = 'rgba(255,150,30,0.9)'; ctx.shadowBlur = 7 }
    ctx.strokeStyle = lit ? LAMP_ORANGE : LAMP_UNLIT_AMBER
    ctx.lineWidth = 1.1
    ctx.lineJoin = 'round'
    ctx.beginPath()
    // The block, its intake on top (a cap over a short neck), the fan pulley left, the exhaust stepping out right.
    ctx.moveTo(x - 4, y - 1.5); ctx.lineTo(x - 1.5, y - 1.5); ctx.lineTo(x - 1.5, y - 3); ctx.lineTo(x + 1, y - 3)
    ctx.lineTo(x + 1, y - 1.5); ctx.lineTo(x + 3, y - 1.5); ctx.lineTo(x + 3, y - 0.5); ctx.lineTo(x + 5, y - 0.5)
    ctx.lineTo(x + 5, y + 2.5); ctx.lineTo(x + 3, y + 2.5); ctx.lineTo(x + 3, y + 3.5); ctx.lineTo(x - 4, y + 3.5)
    ctx.closePath()
    ctx.moveTo(x - 2.8, y - 3); ctx.lineTo(x + 2.3, y - 3)                                  // the intake's cap
    ctx.moveTo(x - 4, y + 1); ctx.lineTo(x - 5.6, y + 1)                                    // the pulley shaft
    ctx.moveTo(x - 5.6, y - 0.6); ctx.lineTo(x - 5.6, y + 2.6)                              // the pulley
    ctx.stroke()
    ctx.restore()
  }

  // The overheat lamp — owner: "mimic low fuel with a light under the high side of coolant gauge". The low-fuel
  // lens's twin under H, red (FMVSS 101's colour for a coolant-temperature telltale). Lit past H, where engine
  // damage and power loss start (DAMAGE_PARAMS.tempHotC).
  _overheatLit () { return this._overheat && this._keyPos !== 'off' }
  _drawOverheatLamp (ctx) {
    const x = TEMP.cx + 15, y = TEMP.cy + 9, r = 3.2
    const lit = this._overheatLit()
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    if (lit) { ctx.shadowColor = 'rgba(255,50,30,0.9)'; ctx.shadowBlur = 7 }
    ctx.fillStyle = lit ? LAMP_RED : LAMP_UNLIT_RED
    ctx.fill()
    ctx.restore()
  }

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
    const x0 = g.cx + ODO.x; const y0 = g.cy + ODO.y; const cellW = ODO.w / 6; const cellH = ODO.h
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
