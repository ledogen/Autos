/**
 * Debug panel for RangerSim.
 *
 * Phase 1: backtick (`) toggle, lateralDampingCoeff, tireStiffness, and tireDamping sliders
 *   (plus a slider that was removed in Phase 2 per D-09).
 * Phase 2 (M2-05, M2-06): Removes fixed-field slider per D-09. Relabels lateralDampingCoeff
 *   as '(unused)' (D-11). Adds 7 new D-08 sliders:
 *   mass, frictionCoeff, maxDriveTorque, maxBrakeTorque, bodyContactStiffness,
 *   bodyContactDamping, corneringStiffness. Adds disabled Logger hint label (D-04).
 * Phase 3 (D-08, D-11, D-12, D-13, D-16): Removes corneringStiffness and lateralDampingCoeff
 *   sliders. Adds Lateral Tire (Pacejka) and Longitudinal Tire (Pacejka) folders with
 *   B/C/D/E sliders. Adds maxHandbrakeTorque slider. Adds Pacejka canvas overlay (300×200 px)
 *   with normalized curve and FL/FR operating-point dots. Extends backtick toggle to sync
 *   canvas visibility. Exports updatePacejkaCurve(vehicleState, params).
 * Phase 4.1 (D-13, D-14): Adds 5 new Suspension sliders (Front Travel, Rear Travel,
 *   Front Body Offset, Rear Body Offset, Bump Stop Stiffness). Adds 4-corner travel-bar
 *   canvas (160×140 px). Extends backtick toggle to sync travel bar. Exports
 *   updateTravelBars(vehicleState, params).
 *
 * Uses lil-gui (bundled in three/addons — zero additional dependency).
 */

import { GUI } from 'three/addons/libs/lil-gui.module.min.js'
import { VEHICLES } from '../data/vehicles.js'

// Module-level bindings so updatePacejkaCurve and updateTravelBars (defined at module scope)
// can read them. Assigned inside initDebug(); null until then.
let plotCanvas = null
let plotCtx = null
let travelCanvas = null
let travelCtx = null
let slipCanvas = null
let slipCtx = null

/**
 * Initialize the debug panel. Creates a lil-gui instance, adds physics sliders,
 * registers the backtick toggle listener, and returns the GUI instance.
 *
 * @param {object} params — RANGER_PARAMS reference (NOT a copy). Slider mutations write
 *   directly to this object, which is the same object physics.js reads each step — changes
 *   take effect immediately (M2-06).
 * @returns {GUI} the lil-gui GUI instance
 */
export function initDebug (params, callbacks = {}) {
  const gui = new GUI({ title: 'RangerSim Debug' })
  gui.domElement.style.display = 'none'  // hidden by default; backtick reveals it

  // Vehicle selector — copies preset into live params and refreshes all sliders
  const vehicleState = { vehicle: 'Ranger' }
  gui.add(vehicleState, 'vehicle', Object.keys(VEHICLES)).name('Vehicle').onChange(name => {
    const preset = VEHICLES[name]
    for (const key of Object.keys(preset)) {
      if (!key.startsWith('_')) params[key] = preset[key]
    }
    params._suspStabChecked = false  // re-run stability check with new params
    gui.controllersRecursive().forEach(c => c.updateDisplay())
  })

  // CG position controls — top section for easy access
  gui.add(params, 'cgHeight', 0.20, 1.20, 0.01).name('CG Height (m)')
  gui.add(params, 'weightFront', 0.30, 0.70, 0.01).name('CG Fwd/Back (front fraction)')
    .onChange(v => { params.weightRear = +(1 - v).toFixed(4) })

  // Phase 1 sliders (kept — lateralDampingCoeff and corneringStiffness removed in Phase 3 per D-08, D-16).
  gui.add(params, 'tireStiffness', 100000, 300000, 5000).name('Tire Stiffness (N/m)')
  gui.add(params, 'tireDamping', 200, 4000, 100).name('Tire Damping (N·s/m)')

  // D-08: Phase 2 physics tuning sliders — all write directly to RANGER_PARAMS (live mutation)
  gui.add(params, 'mass', 500, 3000, 10).name('Mass (kg)')
  gui.add(params, 'frictionCoeff', 0.1, 1.5, 0.05).name('Friction Coeff')
  gui.add(params, 'maxDriveTorque', 100, 2000, 50).name('Max Drive Torque (N·m)')
  gui.add(params, 'maxBrakeTorque', 500, 8000, 100).name('Max Brake Torque (N·m)')
  // D-16: maxHandbrakeTorque slider
  gui.add(params, 'maxHandbrakeTorque', 500, 5000, 100).name('Handbrake Torque (Nm)')

  // Rolling resistance — horizontal drag scaled by ground load; tunable for coast feel
  gui.add(params, 'rollingResistanceCoeff', 0, 0.05, 0.001).name('Rolling Resistance Cr')

  // D-12: Tire (Pacejka) folder — combined-slip in slip-velocity space.
  // Pacejka B/C/D/E define the force curve shape; slip-velocity model params control
  // dynamic response (relaxation length, peak slip velocity, anisotropy).
  const tireFolder = gui.addFolder('Tire (Pacejka)')
  tireFolder.add(params, 'pacejkaB', 5, 20, 0.5).name('B - Stiffness')
  tireFolder.add(params, 'pacejkaC', 1.0, 1.99, 0.01).name('C - Shape [1.0-1.99]')
  tireFolder.add(params, 'pacejkaD', 0.5, 2.0, 0.05).name('D - Peak Factor')
  tireFolder.add(params, 'pacejkaE', -1.0, 1.0, 0.05).name('E - Curvature')
  tireFolder.add(params, 'tireRelaxationLength', 0.05, 1.5, 0.05).name('Relaxation Length L (m)')
  tireFolder.add(params, 'tireSlipVelRef', 0.2, 5.0, 0.1).name('Slip Vel Ref (m/s)')
  tireFolder.add(params, 'tireStiffnessLong', 0.3, 2.0, 0.05).name('Stiffness Long ×')
  tireFolder.add(params, 'tireStiffnessLat', 0.3, 2.0, 0.05).name('Stiffness Lat ×')

  // Phase 4 (D-11): Suspension folder — 8 sliders for spring/damper/rest-length/ARB per axle.
  // Ranges per PATTERNS §lil-gui slider range/step convention (2× default within range, D-10 stability).
  // Pass-through to live params is automatic — params is the mutable RANGER_PARAMS reference.
  // wheelMass and physicsDt are intentionally NOT exposed: wheelMass is fixed per Claude's Discretion
  // (CONTEXT.md) and physicsDt is parameterized but not user-tunable (D-09).
  const suspFolder = gui.addFolder('Suspension')
  suspFolder.add(params, 'suspensionStiffnessFront', 10000, 100000, 1000).name('Front Stiffness (N/m)')
  suspFolder.add(params, 'suspensionStiffnessRear',  10000, 100000, 1000).name('Rear Stiffness (N/m)')
  suspFolder.add(params, 'suspensionDampingFront',     500,   8000,  100).name('Front Damping (N·s/m)')
  suspFolder.add(params, 'suspensionDampingRear',      500,   8000,  100).name('Rear Damping (N·s/m)')
  suspFolder.add(params, 'suspensionRestLengthFront',  0.10,  0.40, 0.01).name('Front Rest Length (m)')
  suspFolder.add(params, 'suspensionRestLengthRear',   0.10,  0.40, 0.01).name('Rear Rest Length (m)')
  suspFolder.add(params, 'arbStiffnessFront',             0, 40000,  500).name('Front ARB (N/m)')
  suspFolder.add(params, 'arbStiffnessRear',              0, 40000,  500).name('Rear ARB (N/m)')

  // D-14: Phase 4.1 suspension travel + stop sliders.
  // DROOP_STOP_STIFFNESS is deliberately NOT exposed per CONTEXT.md (fixed constant, no slider).
  suspFolder.add(params, 'suspensionTravelFront',     0.05,  0.40,   0.01).name('Front Travel (m)')
  suspFolder.add(params, 'suspensionTravelRear',      0.05,  0.40,   0.01).name('Rear Travel (m)')
  suspFolder.add(params, 'suspensionBodyOffsetFront', -0.10, 0.10,   0.005).name('Front Body Offset (m)')
  suspFolder.add(params, 'suspensionBodyOffsetRear',  -0.10, 0.10,   0.005).name('Rear Body Offset (m)')
  suspFolder.add(params, 'bumpStopStiffness',         10000, 500000, 5000).name('Bump Stop Stiffness (N/m)')

  // Phase 6 (TERR-06): Terrain folder — amplitude tuning + ramp visibility toggle.
  // terrainAmplitude is read by TerrainSystem._flushPendingQueue during geometry build;
  // live mutation of params.terrainAmplitude takes effect on the next chunk built.
  // rampEnabled toggle calls the setRampVisible callback (passed via initDebug second arg)
  // to keep rampMesh.visible in sync; also guards RAMP_TRIS loops in queryContacts.
  //
  // Phase 7 (TERR-06 / SEED-04): World Seed text field + Coarse/Fine/Regional sub-folders.
  // Path A: terrainAmplitude slider → callbacks.rebuildTerrain() (instant Y-rescale, no Worker churn).
  // Path B: coarse/fine/regional sliders + seed field → callbacks.rebuildTerrainFull() (debounced ~150ms
  //   in main.js: reinitWorker → rebuildAllChunksFromWorker → re-seat truck).
  // Debounce lives in main.js.rebuildTerrainFull; debug.js fires callbacks unconditionally on onChange.
  const terrainFolder = gui.addFolder('Terrain')
  terrainFolder.add(params, 'terrainAmplitude', 0, 3.0, 0.05).name('Terrain Amplitude (Y-scale)').onChange(() => {
    if (typeof callbacks.rebuildTerrain === 'function') callbacks.rebuildTerrain()
  })
  terrainFolder.add(params, 'rampEnabled').name('Ramp Visible').onChange(v => {
    if (typeof callbacks.setRampVisible === 'function') callbacks.setRampVisible(v)
  })

  // World Seed text field (D-13 / SEED-04) — lil-gui renders a plain <input type="text">
  // automatically when the property value is a string. Internally tracks a display string
  // ('lone-pine' by default) but fires callbacks.changeSeed(v) so main.js can parseWorldSeed
  // the raw text and trigger Path B rebuild.
  const _seedState = { seed: 'lone-pine' }
  terrainFolder.add(_seedState, 'seed').name('World Seed').onChange(v => {
    if (typeof callbacks.changeSeed === 'function') callbacks.changeSeed(v)
  })

  // ── Coarse Layer sub-folder (ridged-multifractal — TERR-01, D-08 ranges) ────────────────
  // All sliders fire rebuildTerrainFull (Path B) — shape changes require Worker re-init.
  const coarseFolder = terrainFolder.addFolder('Coarse Layer')
  coarseFolder.add(params, 'coarseAmplitude', 50, 500, 10).name('Amplitude (m)').onChange(() => {
    if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
  })
  coarseFolder.add(params, 'coarseFreq', 0.0005, 0.005, 0.0001).name('Wavelength/Freq (1/m)').onChange(() => {
    if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
  })
  coarseFolder.add(params, 'coarseOctaves', 1, 6, 1).name('Octaves').onChange(() => {
    if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
  })
  coarseFolder.add(params, 'ridgeSharpness', 1.0, 4.0, 0.1).name('Ridge Sharpness').onChange(() => {
    if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
  })

  // ── Fine Layer sub-folder (FBM suspension texture — TERR-02, D-10) ────────────────────
  const fineFolder = terrainFolder.addFolder('Fine Layer')
  fineFolder.add(params, 'fineAmplitude', 0, 10, 0.1).name('Amplitude (m)').onChange(() => {
    if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
  })
  fineFolder.add(params, 'fineFreq', 0.01, 0.2, 0.005).name('Frequency (1/m)').onChange(() => {
    if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
  })

  // ── Regional Modulator sub-folder (valley/hillside roughness — TERR-03) ──────────────
  const regionalFolder = terrainFolder.addFolder('Regional Modulator')
  regionalFolder.add(params, 'regionalStrength', 0, 1, 0.05).name('Strength (0=uniform, 1=full)').onChange(() => {
    if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
  })
  regionalFolder.add(params, 'regionalScale', 500, 10000, 100).name('Scale (m)').onChange(() => {
    if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
  })

  // D-04: Read-only Logger hint — shows the \ key without being interactive
  const _loggerHint = { hint: '\\ to record' }
  gui.add(_loggerHint, 'hint').name('Logger').disable()

  // D-11: Pacejka canvas overlay — 300×200 px, positioned to left of the lil-gui panel.
  // Pitfall 8: right:320px avoids overlap with lil-gui which is right:0.
  // All three plots stack on the left side under the HUD (top:150px leaves room for 6 HUD lines).
  // travel + slip sit side by side below the Pacejka plot.
  const BG = 'rgba(0,0,0,0.5)'
  const BORDER = 'border:1px solid #444'
  const LEFT = 20   // px from left edge (aligns with HUD)

  plotCanvas = document.createElement('canvas')
  plotCanvas.width = 300
  plotCanvas.height = 200
  plotCanvas.style.cssText = `position:fixed;top:150px;left:${LEFT}px;background:${BG};${BORDER};display:none`
  document.body.appendChild(plotCanvas)
  plotCtx = plotCanvas.getContext('2d')

  travelCanvas = document.createElement('canvas')
  travelCanvas.width = 110
  travelCanvas.height = 220
  travelCanvas.style.cssText = `position:fixed;top:358px;left:${LEFT}px;background:${BG};${BORDER};display:none`
  document.body.appendChild(travelCanvas)
  travelCtx = travelCanvas.getContext('2d')

  slipCanvas = document.createElement('canvas')
  slipCanvas.width = 220
  slipCanvas.height = 220
  slipCanvas.style.cssText = `position:fixed;top:358px;left:${LEFT + 114}px;background:${BG};${BORDER};display:none`
  document.body.appendChild(slipCanvas)
  slipCtx = slipCanvas.getContext('2d')

  // Backtick toggle listener — toggles gui panel, plotCanvas, travelCanvas, AND slipCanvas in lockstep.
  // Only ONE backtick listener in this file.
  document.addEventListener('keydown', e => {
    if (e.key === '`') {
      const hidden = gui.domElement.style.display === 'none'
      gui.domElement.style.display = hidden ? '' : 'none'
      plotCanvas.style.display = hidden ? '' : 'none'
      travelCanvas.style.display = hidden ? '' : 'none'
      slipCanvas.style.display = hidden ? '' : 'none'
    }
  })

  return gui
}

/**
 * Update the Pacejka lateral force curve plot and FL/FR operating-point dots.
 * Called once per render frame from src/main.js (OUTSIDE the fixed-timestep accumulator —
 * constraint #10). Early-returns when the canvas is hidden for performance (T-03-09).
 *
 * Curve: normalized (no Fz multiplication) — y = sin(C * atan(B*sa - E*(B*sa - atan(B*sa))))
 * over slip angle range [-0.3, +0.3] rad at 200 samples.
 *
 * Operating-point dots: FL (index 0) and FR (index 1). Colored by |fNorm|:
 *   < 0.5  → green  (#00ff88)
 *   < 0.8  → orange (#ffaa00)
 *   >= 0.8 → red    (#ff2222)
 *
 * @param {object} vehicleState — read vehicleState.wheelDebug[0].sa, wheelDebug[1].sa
 * @param {object} params       — read pacejkaB, pacejkaC (clamped), pacejkaD, pacejkaE
 */
/**
 * Draw 4-corner suspension travel bars.
 * Called once per render frame from src/main.js (outside the fixed-timestep accumulator).
 * Early-returns when the canvas is hidden for performance (T-04.1-07).
 *
 * Bar fill formula per D-13 (droop stop at strutComp <= 0, so droopRange = 0):
 *   fill[i] = clamp(strutComp[i] / travel[i], 0, 1.05)
 * Color:
 *   green  — fill < 0.70 (normal travel)
 *   yellow — fill 0.70..0.95 (approaching bump stop)
 *   red    — fill >= 1.00 (bump stop engaged)
 *
 * @param {object} vehicleState — read vehicleState.strutComp[0..3]
 * @param {object} params       — read suspensionTravelFront, suspensionTravelRear
 */
export function updateTravelBars (vehicleState, params) {
  // Early return when hidden (T-04.1-07: 160×140 redraw < 0.1 ms but still worth skipping)
  if (!travelCanvas || !travelCtx || travelCanvas.style.display === 'none') return

  const W = travelCanvas.width
  const H = travelCanvas.height
  travelCtx.clearRect(0, 0, W, H)

  const labels    = ['FL', 'FR', 'RL', 'RR']
  const barW      = 32    // px — width of each bar
  const barH      = 75    // px — maximum bar height
  const colSpan   = W / 2 // px — 2 columns
  const rowSpan   = 35    // px — gap between bottom of bar and top of next row's bar (label + spacing)
  const barY0     = 20    // px — top of row-0 bars (FL, FR)
  const barY1     = barY0 + barH + rowSpan  // top of row-1 bars (RL, RR)

  const strutComp = vehicleState.strutComp || [0, 0, 0, 0]

  for (let i = 0; i < 4; i++) {
    const col     = i % 2
    const row     = Math.floor(i / 2)
    const isFront = i < 2
    const travel  = isFront ? (params.suspensionTravelFront || 0.25) : (params.suspensionTravelRear || 0.25)
    const comp    = strutComp[i] ?? 0
    const fill    = Math.max(0, Math.min(1.05, comp / Math.max(travel, 0.001)))

    const cx      = colSpan * col + colSpan / 2
    const bx      = cx - barW / 2
    const barY    = row === 0 ? barY0 : barY1
    const labelY  = barY + barH + 13
    const fillPx  = Math.round(fill * barH)

    // Background (empty) bar
    travelCtx.fillStyle = '#333'
    travelCtx.fillRect(bx, barY, barW, barH)

    // Filled portion — color by fill fraction
    let color
    if (fill >= 1.0) {
      color = '#ff2222'
    } else if (fill >= 0.70) {
      color = '#ffaa00'
    } else {
      color = '#00cc66'
    }
    travelCtx.fillStyle = color
    travelCtx.fillRect(bx, barY + barH - fillPx, barW, fillPx)

    // Corner label
    travelCtx.fillStyle = '#cccccc'
    travelCtx.font = '11px monospace'
    travelCtx.textAlign = 'center'
    travelCtx.fillText(labels[i], cx, labelY)

    // Percentage text inside bar (top edge of fill)
    const pct = Math.round(fill * 100)
    travelCtx.fillStyle = '#ffffff'
    travelCtx.font = '10px monospace'
    travelCtx.fillText(pct + '%', cx, barY + barH - fillPx - 2)
  }

  // Title
  travelCtx.fillStyle = '#888888'
  travelCtx.font = '10px monospace'
  travelCtx.textAlign = 'left'
  travelCtx.fillText('Travel', 4, 12)
}

/**
 * Draw 2x2 slip-vector diagram.
 * Each quadrant corresponds to a wheel corner (FL top-left, FR top-right, RL bottom-left, RR bottom-right),
 * matching physical wheel positions when viewed from above.
 * The vector shows contact-patch velocity in wheel frame: X = lateral (right = positive),
 * Y = longitudinal (forward = up on screen). Color encodes slip magnitude.
 *
 * @param {object} vehicleState — read vehicleState.wheelDebug[0..3].vLong / .vLat
 */
export function updateSlipVectors (vehicleState) {
  if (!slipCanvas || !slipCtx || slipCanvas.style.display === 'none') return

  const W = slipCanvas.width
  const H = slipCanvas.height
  slipCtx.clearRect(0, 0, W, H)

  const halfW = W / 2
  const halfH = H / 2
  const SCALE = 2       // px per m/s (halved for readability)
  const MAX_VEL = 20    // m/s — clamp for arrow length
  const ARROW = 5       // arrowhead size px

  // Quadrant centers: [FL, FR, RL, RR]
  const cx = [halfW / 2, halfW + halfW / 2, halfW / 2, halfW + halfW / 2]
  const cy = [halfH / 2, halfH / 2, halfH + halfH / 2, halfH + halfH / 2]
  const labels = ['FL', 'FR', 'RL', 'RR']

  // Divider lines
  slipCtx.strokeStyle = '#333'
  slipCtx.lineWidth = 1
  slipCtx.beginPath()
  slipCtx.moveTo(halfW, 0); slipCtx.lineTo(halfW, H)
  slipCtx.moveTo(0, halfH); slipCtx.lineTo(W, halfH)
  slipCtx.stroke()

  // Title
  slipCtx.fillStyle = '#888'
  slipCtx.font = '10px monospace'
  slipCtx.textAlign = 'left'
  slipCtx.fillText('Slip Vel', 4, 12)

  const debug = vehicleState.wheelDebug || []

  for (let i = 0; i < 4; i++) {
    const wd    = debug[i] || {}
    const vLong = wd.vLong || 0   // m/s forward
    const vLat  = wd.vLat  || 0   // m/s rightward
    const mag   = Math.hypot(vLong, vLat)

    // Axes — faint crosshair in each quadrant
    slipCtx.strokeStyle = '#2a2a2a'
    slipCtx.lineWidth = 1
    slipCtx.beginPath()
    slipCtx.moveTo(cx[i] - 28, cy[i]); slipCtx.lineTo(cx[i] + 28, cy[i])
    slipCtx.moveTo(cx[i], cy[i] - 28); slipCtx.lineTo(cx[i], cy[i] + 28)
    slipCtx.stroke()

    // Color by magnitude
    let color
    if (mag > 5)      color = '#ff2222'
    else if (mag > 2) color = '#ffaa00'
    else              color = '#00cc66'

    // Vector: vLat → screen X, vLong → screen -Y (forward = up)
    const clamped = Math.min(mag, MAX_VEL)
    const scale   = mag > 0 ? (clamped / mag) * SCALE : 0
    const dx =  vLat  * scale
    const dy = -vLong * scale

    const ex = cx[i] + dx
    const ey = cy[i] + dy

    // Arrow shaft
    slipCtx.strokeStyle = color
    slipCtx.lineWidth = 2
    slipCtx.beginPath()
    slipCtx.moveTo(cx[i], cy[i])
    slipCtx.lineTo(ex, ey)
    slipCtx.stroke()

    // Arrowhead
    if (mag > 0.1) {
      const angle = Math.atan2(dy, dx)
      slipCtx.fillStyle = color
      slipCtx.beginPath()
      slipCtx.moveTo(ex, ey)
      slipCtx.lineTo(ex - ARROW * Math.cos(angle - 0.4), ey - ARROW * Math.sin(angle - 0.4))
      slipCtx.lineTo(ex - ARROW * Math.cos(angle + 0.4), ey - ARROW * Math.sin(angle + 0.4))
      slipCtx.closePath()
      slipCtx.fill()
    }

    // Corner label + slip magnitude + Fz readout
    slipCtx.fillStyle = '#666'
    slipCtx.font = '10px monospace'
    slipCtx.textAlign = 'center'
    slipCtx.fillText(labels[i], cx[i], cy[i] - 32)
    slipCtx.fillStyle = color
    slipCtx.fillText(mag.toFixed(1) + ' m/s', cx[i], cy[i] + 38)
    const fz = wd.fz ?? wd.fn ?? 0
    slipCtx.fillStyle = '#aaa'
    slipCtx.fillText(Math.round(fz) + ' N', cx[i], cy[i] + 50)
  }
}

export function updatePacejkaCurve (vehicleState, params) {
  // T-03-09: early return when hidden — no canvas work per hidden frame
  // null-guard: protects against calls before initDebug has run
  if (!plotCanvas || !plotCtx || plotCanvas.style.display === 'none') return

  const W = plotCanvas.width
  const H = plotCanvas.height

  plotCtx.clearRect(0, 0, W, H)

  // Read params — C hard-clamped to [1.0, 1.99] (T-03-07 / constraint #3)
  const B    = params.pacejkaB
  const C    = Math.max(1.0, Math.min(1.99, params.pacejkaC))
  const E    = params.pacejkaE
  const vRef = params.tireSlipVelRef || 1.0

  // Plot-area margins reserve space for axis labels so they never overlap the curve.
  const ML = 4, MR = 6, MT = 10, MB = 16
  const plotW = W - ML - MR
  const plotH = H - MT - MB

  // Draw normalized Pacejka force-magnitude curve over slip-velocity magnitude [0, 1.5·v_ref] m/s.
  // Range is 1.5·v_ref (was 3·v_ref) → 2× horizontal zoom so the low-slip peak region reads clearly.
  // (Plotting |F|/(μ·Fn·D) vs |s| — slip-velocity formulation. wheelDebug[i].sa stores
  // slip-velocity magnitude in m/s since the tire model rewrite.)
  const SAMPLES = 200
  const SV_MIN = 0
  const SV_MAX = 1.5 * vRef
  const SV_RANGE = SV_MAX - SV_MIN

  // Coordinate transforms into the margined plot area.
  const xToPx = (sv) => ML + (sv - SV_MIN) / SV_RANGE * plotW
  const fToPy = (f)  => MT + plotH * (1 - f)  // f=0 → bottom, f=1 → top

  // Normalized Pacejka force magnitude at a given slip velocity.
  const fNormOf = (sv) => {
    const Bx = B * (sv / vRef)
    return Math.sin(C * Math.atan(Bx - E * (Bx - Math.atan(Bx))))
  }

  // Trace the curve and track the peak-friction slip point in the same pass.
  let peakSv = 0, peakF = -Infinity
  plotCtx.beginPath()
  plotCtx.strokeStyle = '#44ff88'
  plotCtx.lineWidth = 1.5
  for (let i = 0; i < SAMPLES; i++) {
    const sv = SV_MIN + (i / (SAMPLES - 1)) * SV_RANGE
    const fNorm = fNormOf(sv)
    if (fNorm > peakF) { peakF = fNorm; peakSv = sv }
    const px = xToPx(sv)
    const py = fToPy(fNorm)
    if (i === 0) plotCtx.moveTo(px, py)
    else plotCtx.lineTo(px, py)
  }
  plotCtx.stroke()

  // Peak-friction marker: dashed vertical line + numeric slip-velocity label.
  const peakPx = xToPx(peakSv)
  plotCtx.save()
  plotCtx.strokeStyle = '#ffcc00'
  plotCtx.lineWidth = 1
  plotCtx.setLineDash([4, 3])
  plotCtx.beginPath()
  plotCtx.moveTo(peakPx, MT)
  plotCtx.lineTo(peakPx, MT + plotH)
  plotCtx.stroke()
  plotCtx.restore()

  plotCtx.fillStyle = '#ffcc00'
  plotCtx.font = '9px monospace'
  plotCtx.textBaseline = 'top'
  plotCtx.textAlign = 'left'
  const peakLabel = `peak ${peakSv.toFixed(2)} m/s`
  const labelW = plotCtx.measureText(peakLabel).width
  // Flip label to the left of the line if it would run off the right edge.
  plotCtx.fillText(peakLabel, (peakPx + 3 + labelW > W) ? peakPx - 3 - labelW : peakPx + 3, MT)

  // Draw operating-point dots for FL (index 0) and FR (index 1)
  for (const i of [0, 1]) {
    const sv = vehicleState.wheelDebug?.[i]?.sa || 0   // |slip velocity| in m/s
    const fNorm = fNormOf(sv)
    const px = Math.max(ML, Math.min(W - MR, xToPx(sv)))
    const py = fToPy(fNorm)

    const pct = Math.abs(fNorm)
    const color = pct < 0.5 ? '#00ff88' : pct < 0.8 ? '#ffaa00' : '#ff2222'

    plotCtx.beginPath()
    plotCtx.arc(px, py, 4, 0, Math.PI * 2)
    plotCtx.fillStyle = color
    plotCtx.fill()
  }

  // Axis labels
  plotCtx.fillStyle = '#88aa99'
  plotCtx.font = '9px monospace'
  plotCtx.textBaseline = 'top'
  plotCtx.textAlign = 'left'
  plotCtx.fillText('norm |F|', ML, 0)                          // y-axis: normalized force
  plotCtx.textAlign = 'center'
  plotCtx.fillText('slip vel (m/s)', ML + plotW / 2, H - 9)    // x-axis title
  plotCtx.textAlign = 'right'
  plotCtx.fillText(SV_MAX.toFixed(1), W - MR, H - 9)           // x-axis max tick
}
