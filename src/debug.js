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
 *
 * Uses lil-gui (bundled in three/addons — zero additional dependency).
 */

import { GUI } from 'three/addons/libs/lil-gui.module.min.js'

// Module-level bindings so updatePacejkaCurve (defined at module scope) can read them.
// Assigned inside initDebug(); null until then.
let plotCanvas = null
let plotCtx = null

/**
 * Initialize the debug panel. Creates a lil-gui instance, adds physics sliders,
 * registers the backtick toggle listener, and returns the GUI instance.
 *
 * @param {object} params — RANGER_PARAMS reference (NOT a copy). Slider mutations write
 *   directly to this object, which is the same object physics.js reads each step — changes
 *   take effect immediately (M2-06).
 * @returns {GUI} the lil-gui GUI instance
 */
export function initDebug (params) {
  const gui = new GUI({ title: 'RangerSim Debug' })
  gui.domElement.style.display = 'none'  // hidden by default; backtick reveals it

  // Phase 1 sliders (kept — lateralDampingCoeff and corneringStiffness removed in Phase 3 per D-08, D-16).
  gui.add(params, 'tireStiffness', 50000, 400000, 5000).name('Tire Stiffness (N/m)')
  gui.add(params, 'tireDamping', 500, 20000, 500).name('Tire Damping (N·s/m)')

  // D-08: Phase 2 physics tuning sliders — all write directly to RANGER_PARAMS (live mutation)
  gui.add(params, 'mass', 500, 3000, 10).name('Mass (kg)')
  gui.add(params, 'frictionCoeff', 0.1, 1.5, 0.05).name('Friction Coeff')
  gui.add(params, 'maxDriveTorque', 100, 2000, 50).name('Max Drive Torque (N·m)')
  gui.add(params, 'maxBrakeTorque', 500, 8000, 100).name('Max Brake Torque (N·m)')
  gui.add(params, 'bodyContactStiffness', 50000, 500000, 10000).name('Body Contact Stiffness (N/m)')
  gui.add(params, 'bodyContactDamping', 1000, 30000, 500).name('Body Contact Damping (N·s/m)')

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

  // D-04: Read-only Logger hint — shows the \ key without being interactive
  const _loggerHint = { hint: '\\ to record' }
  gui.add(_loggerHint, 'hint').name('Logger').disable()

  // D-11: Pacejka canvas overlay — 300×200 px, positioned to left of the lil-gui panel.
  // Pitfall 8: right:320px avoids overlap with lil-gui which is right:0.
  plotCanvas = document.createElement('canvas')
  plotCanvas.width = 300
  plotCanvas.height = 200
  plotCanvas.style.cssText = 'position:fixed;top:20px;right:320px;background:#111;border:1px solid #444;display:none'
  document.body.appendChild(plotCanvas)
  plotCtx = plotCanvas.getContext('2d')

  // Backtick toggle listener — toggles BOTH gui panel AND plotCanvas in lockstep (constraint #9).
  // Only ONE backtick listener exists in this file (acceptance criterion).
  document.addEventListener('keydown', e => {
    if (e.key === '`') {
      const hidden = gui.domElement.style.display === 'none'
      gui.domElement.style.display = hidden ? '' : 'none'
      plotCanvas.style.display = hidden ? '' : 'none'
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

  // Draw normalized Pacejka force-magnitude curve over slip-velocity magnitude [0, 3·v_ref] m/s.
  // (Now plotting |F|/(μ·Fn·D) vs |s| — slip-velocity formulation. wheelDebug[i].sa stores
  // slip-velocity magnitude in m/s since the tire model rewrite.)
  const SAMPLES = 200
  const SV_MIN = 0
  const SV_MAX = 3.0 * vRef
  const SV_RANGE = SV_MAX - SV_MIN

  plotCtx.beginPath()
  plotCtx.strokeStyle = '#44ff88'
  plotCtx.lineWidth = 1.5

  for (let i = 0; i < SAMPLES; i++) {
    const sv = SV_MIN + (i / (SAMPLES - 1)) * SV_RANGE
    const x = sv / vRef
    const Bx = B * x
    const fNorm = Math.sin(C * Math.atan(Bx - E * (Bx - Math.atan(Bx))))
    const px = (sv - SV_MIN) / SV_RANGE * W
    const py = H - fNorm * (H - 10)  // baseline at bottom; force grows upward
    if (i === 0) plotCtx.moveTo(px, py)
    else plotCtx.lineTo(px, py)
  }
  plotCtx.stroke()

  // Draw operating-point dots for FL (index 0) and FR (index 1)
  for (const i of [0, 1]) {
    const sv = vehicleState.wheelDebug?.[i]?.sa || 0   // |slip velocity| in m/s
    const x = sv / vRef
    const Bx = B * x
    const fNorm = Math.sin(C * Math.atan(Bx - E * (Bx - Math.atan(Bx))))
    const px = Math.max(0, Math.min(W, (sv - SV_MIN) / SV_RANGE * W))
    const py = H - fNorm * (H - 10)

    const pct = Math.abs(fNorm)
    const color = pct < 0.5 ? '#00ff88' : pct < 0.8 ? '#ffaa00' : '#ff2222'

    plotCtx.beginPath()
    plotCtx.arc(px, py, 4, 0, Math.PI * 2)
    plotCtx.fillStyle = color
    plotCtx.fill()
  }
}
