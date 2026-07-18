/**
 * Debug panel for RangerSim.
 *
 * Phase 1: backtick (`) toggle, lateralDampingCoeff, tireStiffness, and tireDamping sliders
 *   (plus a slider that was removed in Phase 2 per D-09).
 * Phase 2 (M2-05, M2-06): Removes fixed-field slider per D-09. Relabels lateralDampingCoeff
 *   as '(unused)' (D-11). Adds 7 new D-08 sliders:
 *   mass, frictionCoeff, brake torque (front/rear), bodyContactStiffness,
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
 * QUAL-09: Folds every vehicle-physics control into one top-level 'Vehicle' folder, sub-grouped
 *   into Mass & CG / Drivetrain & Brakes / Tires (Pacejka folded in) / Suspension. Panel root is
 *   now Build · (quality selector) · Vehicle · Terrain · Roads · Logger. Renamed the weightFront
 *   slider 'CG Fwd/Back (front fraction)' → 'CG (front fraction)'. Pure GUI nesting — no params /
 *   physics / main.js change.
 *
 * Uses lil-gui (bundled in three/addons — zero additional dependency).
 */

import { GUI } from 'three/addons/libs/lil-gui.module.min.js'
import { VEHICLES } from '../data/vehicles.js'
import { resolveBuild } from './version.js'

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
export function initDebug (params, callbacks = {}, options = {}) {
  const gui = new GUI({ title: 'RangerSim Debug' })
  gui.domElement.style.display = 'none'  // hidden by default; backtick reveals it

  // QUAL-04: build marker — confirms which build the browser actually loaded (deploy lag + cache).
  // Read-only text controller at the top of the panel. The value is the SERVED main.js
  // Last-Modified/ETag, fetched once via resolveBuild() (src/version.js) — it reflects the bundle
  // that is actually RUNNING (no manual bump, no build step). Starts as '…' and fills in when the
  // probe resolves. The input is disabled (not editable), so to make the ID easy to SEND we attach
  // click-to-copy on the row: click copies the resolved id to the clipboard and flashes "(copied!)"
  // in the label. Falls back to selecting the text if the Clipboard API is unavailable.
  const buildState = { build: '…' }
  const buildCtrl = gui.add(buildState, 'build').name('Build').disable()
  resolveBuild().then(v => { buildState.build = v; buildCtrl.updateDisplay() })
  buildCtrl.domElement.style.cursor = 'pointer'
  buildCtrl.domElement.title = 'Click to copy build ID'
  buildCtrl.domElement.addEventListener('click', () => {
    const flash = () => { buildCtrl.name('Build (copied!)'); setTimeout(() => buildCtrl.name('Build'), 1200) }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(buildState.build).then(flash).catch(() => {
        const inp = buildCtrl.domElement.querySelector('input')
        if (inp) { inp.disabled = false; inp.select(); inp.disabled = true }
      })
    } else {
      const inp = buildCtrl.domElement.querySelector('input')
      if (inp) { inp.disabled = false; inp.select(); inp.disabled = true }
    }
  })

  // ── Quality selector (PERF-06) ────────────────────────────────────────────────
  // Top-level master perf tier (supersedes the old Terrain-folder "Draw Distance" dropdown). Each tier
  // bundles terrain ring + road route radius + fog + detail shader PLUS dynamic shadows, prop render
  // radius, and internal render resolution (callbacks.applyQuality in main.js). Default 'Normal' == the
  // current shipped behaviour, so this only changes anything when the user picks another tier. Low strips
  // every non-gameplay GPU cost (shadows off, props thinned, fbm off, 720p) for weak machines.
  const _qualityState = { quality: 'Normal' }
  gui.add(_qualityState, 'quality', ['Low', 'Normal', 'High', 'Ultra']).name('Quality').onChange(v => {
    if (typeof callbacks.applyQuality === 'function') callbacks.applyQuality(v)
    // The tier also sets params.terrainDetailScale (Low = 0 kill-switch), so refresh controllers to
    // reflect the new Detail-scale value wherever it is bound in the panel.
    gui.controllersRecursive().forEach(c => c.updateDisplay())
  })

  // ── Vehicle folder (QUAL-09) ──────────────────────────────────────────────────
  // All vehicle-physics controls live here, sub-grouped into Mass & CG / Drivetrain & Brakes /
  // Tires / Suspension, so the panel ROOT stays a short folder list (Vehicle / Terrain / Roads)
  // plus the meta Build marker + Logger hint. The vehicle PRESET selector sits at the folder root;
  // selecting a preset copies it into live params and refreshes every (now-nested) slider via
  // controllersRecursive (which walks subfolders).
  const vehicleFolder = gui.addFolder('Vehicle')
  const vehicleState = { vehicle: 'Ranger' }
  vehicleFolder.add(vehicleState, 'vehicle', Object.keys(VEHICLES)).name('Vehicle').onChange(name => {
    const preset = VEHICLES[name]
    for (const key of Object.keys(preset)) {
      if (!key.startsWith('_')) params[key] = preset[key]
    }
    params._suspStabChecked = false  // re-run stability check with new params
    gui.controllersRecursive().forEach(c => c.updateDisplay())
  })

  // ── Mass & CG ──────────────────────────────────────────────────────────────────
  const massCgFolder = vehicleFolder.addFolder('Mass & CG')
  massCgFolder.add(params, 'cgHeight', 0.20, 1.20, 0.01).name('CG Height (m)')
  massCgFolder.add(params, 'weightFront', 0.30, 0.70, 0.01).name('CG (front fraction)')
    .onChange(v => { params.weightRear = +(1 - v).toFixed(4) })
  // D-08: live mutation of RANGER_PARAMS
  massCgFolder.add(params, 'mass', 500, 3000, 10).name('Mass (kg)')

  // ── Drivetrain & Brakes ─────────────────────────────────────────────────────────
  // D-08 / D-16: all write directly to RANGER_PARAMS (live mutation).
  const driveFolder = vehicleFolder.addFolder('Drivetrain & Brakes')
  // FEAT-23 engine → torque converter → automatic gearbox → final drive (src/drivetrain.js).
  driveFolder.add(params, 'engineTorqueScale', 0.3, 2.0, 0.05).name('Engine Torque ×')
  driveFolder.add(params, 'engineIdleRPM', 500, 1200, 25).name('Idle RPM')
  driveFolder.add(params, 'engineRedlineRPM', 4000, 7000, 100).name('Redline RPM')
  driveFolder.add(params, 'engineIdleThrottle', 0, 0.15, 0.005).name('Idle Creep')
  driveFolder.add(params, 'engineRpmLag', 0, 0.4, 0.01).name('Rev Lag (s)')
  driveFolder.add(params, 'converterStallTorqueRatio', 1.0, 3.0, 0.05).name('Converter Stall TR')
  driveFolder.add(params, 'converterStallRPM', 1200, 3500, 50).name('Converter Stall RPM')
  driveFolder.add(params, 'converterCouplingSR', 0.7, 0.98, 0.01).name('Converter Couple SR')
  driveFolder.add(params, 'finalDrive', 2.5, 5.5, 0.01).name('Final Drive')
  driveFolder.add(params, 'reverseRatio', 1.5, 4.0, 0.01).name('Reverse Ratio')
  driveFolder.add(params, 'shiftUpRPM', 2500, 6500, 50).name('Upshift RPM')
  driveFolder.add(params, 'shiftDownRPM', 800, 3500, 50).name('Downshift RPM (cruise)')
  driveFolder.add(params, 'kickdownRPM', 1200, 4000, 50).name('Downshift RPM (WOT kickdown)')
  driveFolder.add(params, 'shiftHysteresis', 200, 2000, 50).name('Shift Hysteresis (RPM)')
  driveFolder.add(params, 'shiftHoldTime', 0.1, 1.5, 0.05).name('Shift Hold (s)')
  driveFolder.add(params, 'wheelspinShiftLock').name('Wheelspin Shift-Lock')
  driveFolder.add(params, 'wheelspinThreshold', 1, 20, 0.5).name('Wheelspin Lock (m/s)')
  driveFolder.add(params, 'maxBrakeTorqueFront', 200, 4000, 50).name('Brake Torque Front (N·m)')
  driveFolder.add(params, 'maxBrakeTorqueRear', 200, 4000, 50).name('Brake Torque Rear (N·m)')
  driveFolder.add(params, 'maxHandbrakeTorque', 500, 5000, 100).name('Handbrake Torque (Nm)')
  // Body-slam rebound (0 = the old fully-plastic thud). Read live per contact — no rebuild needed.
  driveFolder.add(params, 'bodyRestitution', 0, 0.6, 0.01).name('Body Bounce (restitution)')
  // Rolling resistance + aero drag — coast/top-speed feel
  driveFolder.add(params, 'rollingResistanceCoeff', 0, 0.05, 0.001).name('Rolling Resistance Cr')
  driveFolder.add(params, 'aeroDragArea', 0, 3.0, 0.05).name('Aero Drag Cd·A (m²)')
  driveFolder.add(params, 'engineAudioEnabled').name('Engine Audio')
  driveFolder.add(params, 'engineAudioVolume', 0, 1, 0.05).name('Engine Volume')

  // ── Differentials (FEAT-23) ───────────────────────────────────────────────────────
  // Rear diff mode: open / limited-slip / locked (src/drivetrain.js couples the rear wheels).
  // Front differential + a per-axle final-drive slider will join this folder in a later phase.
  const diffFolder = vehicleFolder.addFolder('Differentials')
  diffFolder.add(params, 'rearDiffMode', { Open: 'open', 'Limited Slip': 'lsd', Locked: 'locked' }).name('Rear Differential')

  // ── Tires ───────────────────────────────────────────────────────────────────────
  // Vertical tire spring (stiffness/damping) + ground friction + the Pacejka force-curve model
  // (D-12, combined-slip in slip-velocity space). Pacejka B/C/D/E define the force curve shape;
  // slip-velocity model params control dynamic response (relaxation length, peak slip velocity,
  // anisotropy). (Phase 1 tireStiffness/Damping kept — lateralDampingCoeff/corneringStiffness
  // removed in Phase 3 per D-08, D-16.)
  const tiresFolder = vehicleFolder.addFolder('Tires')
  tiresFolder.add(params, 'tireStiffness', 100000, 300000, 5000).name('Tire Stiffness (N/m)')
  tiresFolder.add(params, 'tireDamping', 200, 4000, 100).name('Tire Damping (N·s/m)')
  tiresFolder.add(params, 'frictionCoeff', 0.1, 1.5, 0.05).name('Friction Coeff')
  tiresFolder.add(params, 'pacejkaB', 5, 20, 0.5).name('B - Stiffness')
  tiresFolder.add(params, 'pacejkaC', 1.0, 1.99, 0.01).name('C - Shape [1.0-1.99]')
  tiresFolder.add(params, 'pacejkaD', 0.5, 2.0, 0.05).name('D - Peak Factor')
  tiresFolder.add(params, 'pacejkaE', -1.0, 1.0, 0.05).name('E - Curvature')
  // BUG-20: carcass length (L) and slip-vel ref (vRef) are tuned as a COUPLED pair, never
  // independently — moving one alone silently rescales grip. The grip curve depends only on the ratio
  // L/vRef; the stored carcass displacement (slide-to-stop slosh energy) scales with L. So:
  //   • "Carcass Length / Slosh" drives L and moves vRef with it (ratio held) → grip unchanged, only
  //     sloshiness changes (lower = shorter carcass, less slosh, snappier build).
  //   • "Relax:VRef Ratio (grip)" changes L/vRef at fixed L → the grip-character knob.
  const carcass = {
    slosh: params.tireRelaxationLength,                          // = L
    ratio: params.tireRelaxationLength / params.tireSlipVelRef,  // = L/vRef (grip-curve shape)
  }
  const applyCarcass = () => {
    params.tireRelaxationLength = carcass.slosh
    params.tireSlipVelRef       = carcass.slosh / carcass.ratio
  }
  tiresFolder.add(carcass, 'slosh', 0.03, 0.4, 0.005).name('Carcass Length / Slosh').onChange(applyCarcass)
  tiresFolder.add(carcass, 'ratio', 0.15, 0.6, 0.01).name('Relax:VRef Ratio (grip)').onChange(applyCarcass)
  tiresFolder.add(params, 'tireStiffnessLong', 0.3, 2.0, 0.05).name('Stiffness Long ×')
  tiresFolder.add(params, 'tireStiffnessLat', 0.3, 2.0, 0.05).name('Stiffness Lat ×')
  tiresFolder.add(params, 'tireBreakawaySlip', 0.05, 0.5, 0.01).name('Break-away (curve x)')

  // Phase 4 (D-11): Suspension folder — 8 sliders for spring/damper/rest-length/ARB per axle.
  // Ranges per PATTERNS §lil-gui slider range/step convention (2× default within range, D-10 stability).
  // Pass-through to live params is automatic — params is the mutable RANGER_PARAMS reference.
  // wheelMass and physicsDt are intentionally NOT exposed: wheelMass is fixed per Claude's Discretion
  // (CONTEXT.md) and physicsDt is parameterized but not user-tunable (D-09).
  const suspFolder = vehicleFolder.addFolder('Suspension')
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
  //
  // BUG-31 FULL FIX — "Terrain Amplitude" is now a WORLD-SCALE MACRO over the coarse + fine LAYER
  // amplitudes, not the visual-only params.terrainAmplitude Y-rescale it used to drive.
  //   Why this is byte-equivalent to the old Y-scale AND honest to the router:
  //   terrain height = coarseHeight + fineHeight·regionalModulator (terrain.js:192-231). coarseHeight
  //   and fineHeight are EXACTLY LINEAR in coarseAmplitude / fineAmplitude (the ridge+pow shaping acts
  //   on the raw noise BEFORE the amplitude multiply; the modulator depends on neither). So scaling
  //   BOTH layer amplitudes by k scales the final height by k — the same geometry the old Y-scale
  //   produced — but through params the road router ALREADY prices (coarseAmplitude feeds _coarseHeight),
  //   the routing worker ALREADY ships (init), and routeCacheSig ALREADY keys (^coarse). Result: taller
  //   mountains RE-ROUTE (switchbacks, grade caps respected) with ZERO router/sig/worker/bundle changes,
  //   and the shipped default-world bundle still matches at k=1 (coarseAmplitude unchanged). The router
  //   only prices the coarse layer, so scaling fineAmplitude alters visual detail but never routes.
  //   params.terrainAmplitude stays permanently 1.0 (the internal visual/physics multiply), unless set
  //   programmatically elsewhere.
  //
  //   STALE-BASE contract: the macro is INCREMENTAL. It stores the last-applied k (_worldScale.lastK)
  //   and on each change multiplies the CURRENT coarse/fine amplitudes by k/lastK. So if the user nudges
  //   the raw Coarse/Fine Amplitude sliders in between, the macro simply scales from whatever those
  //   values are now — no stale captured baseline, always internally consistent. The raw sliders'
  //   displays are refreshed after each macro step (updateDisplay).
  //
  //   Fires callbacks.rebuildTerrainFull → debouncedRebuildFull (main.js: reinitWorker + new RoadSystem
  //   + _importSessionOrBundledRoutes + rebuildAllChunksFromWorker + truck re-seat) — the same
  //   full-rebuild path the coarse/fine/regional shape sliders use.
  const terrainFolder = gui.addFolder('Terrain')
  let _coarseAmpCtrl = null, _fineAmpCtrl = null   // assigned when the sub-folder sliders are built below
  const _worldScale = { k: 1, lastK: 1 }
  terrainFolder.add(_worldScale, 'k', 0, 3.0, 0.05).name('Terrain Amplitude (world scale)').onChange(v => {
    const k = v <= 0 ? 1e-3 : v            // avoid collapsing amplitudes to 0 (unrecoverable ratio)
    const r = k / _worldScale.lastK
    params.coarseAmplitude *= r
    params.fineAmplitude   *= r
    _worldScale.lastK = k
    if (_coarseAmpCtrl) _coarseAmpCtrl.updateDisplay()
    if (_fineAmpCtrl) _fineAmpCtrl.updateDisplay()
    if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
  })
  terrainFolder.add(params, 'rampEnabled').name('Ramp Visible').onChange(v => {
    if (typeof callbacks.setRampVisible === 'function') callbacks.setRampVisible(v)
  })

  // World Seed text field (D-13 / SEED-04) — lil-gui renders a plain <input type="text">
  // automatically when the property value is a string. Initialized from the ACTIVE seed
  // (options.initialSeed, derived from ?seed= in main.js) so the field never misreports the
  // loaded world (CR-01). Uses onFinishChange (not onChange) so the terrain only regenerates
  // once the user commits the seed by pressing Return (or blurring), not on every keystroke.
  const _seedState = { seed: options.initialSeed ?? '6' }
  terrainFolder.add(_seedState, 'seed').name('World Seed').onFinishChange(v => {
    if (typeof callbacks.changeSeed === 'function') callbacks.changeSeed(v)
  })

  // ── Coarse Layer sub-folder (ridged-multifractal — TERR-01, D-08 ranges) ────────────────
  // All sliders fire rebuildTerrainFull (Path B) — shape changes require Worker re-init.
  const coarseFolder = terrainFolder.addFolder('Coarse Layer')
  _coarseAmpCtrl = coarseFolder.add(params, 'coarseAmplitude', 50, 500, 10).name('Amplitude (m)').onChange(() => {
    if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
  })
  // Coarse frequency exposed in cycles per kilometre (friendlier than the raw 1/m param).
  // Display value = coarseFreq * 1000; converted back to the 1/m value the height math uses.
  // Default 0.5 /km == 0.0005 /m == 2 km wavelength. Higher = rougher (more, tighter features).
  const _coarseFreqKm = { freq: params.coarseFreq * 1000 }
  coarseFolder.add(_coarseFreqKm, 'freq', 0.1, 1.0, 0.05).name('Frequency (1/km)').onChange(v => {
    params.coarseFreq = v / 1000
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
  _fineAmpCtrl = fineFolder.add(params, 'fineAmplitude', 0, 10, 0.1).name('Amplitude (m)').onChange(() => {
    if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
  })
  fineFolder.add(params, 'fineFreq', 0.01, 0.2, 0.005).name('Frequency (1/m)').onChange(() => {
    if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
  })

  // ── Regional Modulator sub-folder (valley/hillside roughness — TERR-03) ──────────────
  const regionalFolder = terrainFolder.addFolder('Regional Modulator')
  regionalFolder.add(params, 'regionalStrength', 0, 2, 0.05).name('Strength (0=uniform, 1=full)').onChange(() => {
    if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
  })
  regionalFolder.add(params, 'regionalScale', 250, 2500, 50).name('Scale (m)').onChange(() => {
    if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull()
  })

  // ── Terrain Look (FEAT-05) — alpine biome palette + procedural fbm detail ──────
  // Two kinds of control:
  //  • Palette + biome thresholds are written per-vertex (CPU) → recolour live via
  //    callbacks.rebuildTerrain() (Path A — re-runs _writeChunkVertexColors on existing chunks).
  //  • Detail (mottle/bump/scale) are shader uniforms → callbacks.setTerrainUniform(name, value)
  //    updates the shared terrain + road materials live, no rebuild.
  // terrainDetailScale=0 is the PERF-05 GPU kill-switch (disables all per-pixel fbm).
  const lookFolder = terrainFolder.addFolder('Terrain Look (alpine)')
  const _recolor = () => { if (typeof callbacks.rebuildTerrain === 'function') callbacks.rebuildTerrain() }
  const _setU = (n, v) => { if (typeof callbacks.setTerrainUniform === 'function') callbacks.setTerrainUniform(n, v) }
  lookFolder.addColor(params, 'terrainGrassColor').name('Fertile colour').onChange(_recolor)
  lookFolder.addColor(params, 'terrainMeadowColor').name('Meadow colour').onChange(_recolor)
  lookFolder.addColor(params, 'terrainDirtColor').name('Dirt colour').onChange(_recolor)
  lookFolder.addColor(params, 'terrainRockColor').name('Rock colour').onChange(_recolor)
  lookFolder.add(params, 'terrainGrassSlopeMax', 0.05, 0.40, 0.01).name('Grass slope max').onChange(_recolor)
  // Meadow (relative elevation): basins below the local mean greenify; radius sets the valley scale.
  lookFolder.add(params, 'terrainRelRadius', 10, 120, 5).name('Meadow radius (m)').onChange(_recolor)
  lookFolder.add(params, 'terrainMeadowRelLo', -30, 0, 1).name('Meadow full at (m)').onChange(_recolor)
  lookFolder.add(params, 'terrainMeadowRelHi', -15, 2, 0.5).name('Meadow start at (m)').onChange(_recolor)
  lookFolder.add(params, 'terrainTreelineLo', 0, 200, 5).name('Treeline low (m)').onChange(v => { _setU('uTreeLo', v); _recolor() })
  lookFolder.add(params, 'terrainTreelineHi', 0, 300, 5).name('Treeline high (m)').onChange(v => { _setU('uTreeHi', v); _recolor() })
  lookFolder.add(params, 'terrainDetailScale', 0, 1, 0.05).name('Detail scale (0=off)').onChange(v => _setU('uDetailScale', v))
  lookFolder.add(params, 'terrainNoiseScale', 0.02, 0.50, 0.01).name('Noise scale (1/m)').onChange(v => _setU('uNoiseScale', v))
  lookFolder.add(params, 'terrainMottleStrength', 0, 0.6, 0.02).name('Mottle strength').onChange(v => _setU('uMottle', v))
  lookFolder.add(params, 'terrainBumpStrength', 0, 2.0, 0.05).name('Rock bump strength').onChange(v => _setU('uBump', v))
  lookFolder.add(params, 'roadShoulderBump', 0, 2.0, 0.05).name('Shoulder bump').onChange(v => _setU('uShoulderBump', v))

  // ── Water folder (FEAT-24 meadow meander streams; FEAT-17/18 rarity dials) ────────────
  // Every dial reshapes the deterministic water records + the terrain stream carve, so all
  // fire the FULL Path-B rebuild (Worker re-init + water + chunks) — same contract as the
  // Coarse Layer sliders. onFinishChange (not onChange): a full rebuild per keystroke hurts.
  const waterFolder = gui.addFolder('Water')
  const _waterRebuild = () => { if (typeof callbacks.rebuildTerrainFull === 'function') callbacks.rebuildTerrainFull() }
  waterFolder.add(params.water, 'streamKeepFraction', 0, 1, 0.05).name('Stream keep fraction').onFinishChange(_waterRebuild)
  waterFolder.add(params.water, 'saddleMinDrop', 5, 60, 1).name('Stream min drop (m)').onFinishChange(_waterRebuild)
  waterFolder.add(params.water, 'meanderStrength', 0, 2, 0.05).name('Meander strength').onFinishChange(_waterRebuild)
  waterFolder.add(params.water, 'meanderWavelength', 30, 200, 5).name('Meander wavelength (m)').onFinishChange(_waterRebuild)
  waterFolder.add(params.water, 'meanderAmplitude', 0, 1.5, 0.05).name('Meander amplitude (rad)').onFinishChange(_waterRebuild)
  waterFolder.add(params.water, 'meanderSlopeRef', 0.02, 0.5, 0.005).name('Meadow slope threshold').onFinishChange(_waterRebuild)
  waterFolder.add(params.water, 'streamWidth', 1, 6, 0.25).name('Channel half-width (m)').onFinishChange(_waterRebuild)
  waterFolder.add(params.water, 'widthFlatScale', 1, 4, 0.1).name('Width × on flats').onFinishChange(_waterRebuild)
  waterFolder.add(params.water, 'streamDepth', 0.5, 5, 0.1).name('Bed depth (m)').onFinishChange(_waterRebuild)

  // ── Roads folder (Phase 8 / D-03 / D-05 / D-04 / D-07 / D-09) ─────────────────
  // Road viz checkbox + max-grade slider + cost-weight sliders + surface tuning sliders.
  // Placed AFTER the Terrain folder — do not reorder existing sliders.
  //
  // Callback contract (callbacks = {} default — never throws if not provided):
  //   callbacks.onRoadVizToggle(v: boolean)  — show/hide road splines (setDebugVisible)
  //   callbacks.onRoadParamChange()           — debounced re-route (invalidateCache + rebuild)
  //   callbacks.onRoadSurfaceChange()         — debounced re-bake carve + road mesh + terrain
  //                                            (roadWidth/crown/camber/carve geometry changes)
  //
  // D-05: _roadState.roadViz is UI-only state (not a params field) — mirrors the _seedState
  //   pattern above. Default false = clean (no lines on load).
  // D-03: road routing sliders → onRoadParamChange → debouncedRoadRebuild() in main.js (same 150ms
  //   pattern as terrainFolder sliders). debug.js fires callbacks unconditionally on onChange;
  //   debounce lives in main.js (consistent with D-09 / rebuildTerrainFull convention).
  // D-04/D-07: surface geometry sliders fire onRoadSurfaceChange → main.js debounced rebuild
  //   (re-bake carve tables + rebuildAllChunksFromWorker + re-sweep road mesh tiles).
  const roadFolder = gui.addFolder('Roads')
  const _roadState = { roadViz: false }
  roadFolder.add(_roadState, 'roadViz').name('Show Road Splines').onChange(v => {
    if (typeof callbacks.onRoadVizToggle === 'function') callbacks.onRoadVizToggle(v)
  })
  // D-09 dominant cost-weight sliders (08-07): bound directly to the live `params` object, each
  // firing onRoadParamChange so main.js invalidates + re-streams the valley-trunk network with the
  // updated weights (D-03 deterministic re-route). These replace the retired roadSlopePenalty /
  // roadAltWeight sliders (per-tile router params, removed in 08-05). The full "Valley Trunk (proto)"
  // subfolder is gone — there is ONE road system and ONE viz now (Show Road Splines above).
  const fireRoadParam = () => { if (typeof callbacks.onRoadParamChange === 'function') callbacks.onRoadParamChange() }
  // FEAT-13 v2 URQUHART/blue-noise graph topology knobs (the sole road network — QUAL-12 removed rows).
  roadFolder.add(params, 'roadSiteCandidates', 1, 4, 1).name('Site Candidates').onChange(fireRoadParam)
  roadFolder.add(params, 'roadSiteSpacing', 256, 900, 32).name('Density (cell m)').onChange(fireRoadParam)
  roadFolder.add(params, 'roadSiteMinDist', 120, 600, 20).name('Node Min-Gap (m)').onChange(fireRoadParam)
  roadFolder.add(params, 'roadSiteValleySnap').name('Valley Snap').onChange(fireRoadParam)
  roadFolder.add(params, 'roadGraphMargin', 1, 6, 1).name('Margin (cells)').onChange(fireRoadParam)
  roadFolder.add(params, 'roadGraphDeviationCap', 0, 12, 0.5).name('Earthwork Cap (m)').onChange(fireRoadParam)
  roadFolder.add(params, 'roadGraphMaxGrade', 0.05, 0.25, 0.01).name('Max Grade').onChange(fireRoadParam)
  roadFolder.add(params, 'roadGraphGoalBlend', 20, 200, 10).name('Goal Blend').onChange(fireRoadParam)
  roadFolder.add(params, 'roadGraphWTurn', 0, 12000, 250).name('Curve Penalty').onChange(fireRoadParam)
  roadFolder.add(params, 'roadGraphWAlt', 0, 6, 0.1).name('wAlt').onChange(fireRoadParam)
  roadFolder.add(params, 'roadGraphCullCrossings').name('Cull Crossings').onChange(fireRoadParam)
  // QUAL-14 route clearance: self-clearance contract (D_self = roadWidth + 2·shoulder + margin over
  // arc-separations > gap; violations re-route via the router's no-go repair loop) and the corridor
  // clearance kept between an edge and its higher-priority siblings' solo lanes. Re-routes.
  roadFolder.add(params, 'roadSelfClearMargin', 0, 10, 0.5).name('Self-Clear Margin (m)').onChange(fireRoadParam)
  roadFolder.add(params, 'roadSelfClearGap', 40, 200, 10).name('Self-Clear Gap (m)').onChange(fireRoadParam)
  roadFolder.add(params, 'roadCorridorClearance', 10, 40, 1).name('Corridor Clearance (m)').onChange(fireRoadParam)
  roadFolder.add(params, 'roadCorridorExempt', 30, 150, 5).name('Corridor Exempt (m)').onChange(fireRoadParam)
  roadFolder.add(params, 'roadWGrade', 0, 2000,  20  ).name('wGrade').onChange(fireRoadParam)
  roadFolder.add(params, 'roadWOver',  0, 40000, 500 ).name('wOver').onChange(fireRoadParam)
  // Valley-seek depth cap (m below the straight edge baseline that still rewards descending). Higher =
  // more decisive valley-following / less squiggly (slightly more detour); the cap bounds wander.
  roadFolder.add(params, 'roadValleyDepthCap', 0, 120, 5).name('Valley Depth Cap (m)').onChange(fireRoadParam)
  // FEAT-10 earthwork routing levers (re-route + re-stream + carve rebuild on change via fireRoadParam).
  // Window 0 = OFF (terrain-following / old spiral behaviour). These trade loops vs earthwork depth.
  roadFolder.add(params, 'roadEarthworkWindow', 0, 250, 10).name('Earthwork Window (m)').onChange(fireRoadParam)
  roadFolder.add(params, 'roadWDeviation',      0, 20,  0.5).name('wDev').onChange(fireRoadParam)
  roadFolder.add(params, 'roadDeviationCap',    0, 25,  1  ).name('Deviation Cap (m)').onChange(fireRoadParam)
  // roadMergeBand = "same node" tolerance for skipping a degenerate (collapsed) graph edge. Re-routes.
  roadFolder.add(params, 'roadMergeBand', 4, 60, 2).name('Merge Band (m)').onChange(fireRoadParam)
  // D0 — min turn radius (m); arc-fillet rounds corners tighter than this (higher = wider hairpins).
  // Floor: 6 m (UI lower bound; road.js _refreshParams further clamps to ≥ roadHalfWidth+clearance+ε).
  // D3 (plan 09-22) COUPLING: carve footprint (blendW=1 trough width) is capped at roadMinTurnRadius
  // so adjacent switchback arms' footprints can't overlap. Changing this slider re-routes the road
  // AND re-bakes the carve (debouncedRoadRebuild now also calls rebuildAllChunksFromWorker).
  roadFolder.add(params, 'roadMinTurnRadius', 6, 300, 5).name('Min Turn Radius (m)').onChange(fireRoadParam)

  // D-arc (2026-06-16) / fixed-angle palette (QUAL-05 follow-up, 2026-06-24) — arc-primitive router knobs.
  // The road is min-radius-valid BY CONSTRUCTION: the router turns a FIXED ANGLE per primitive (one
  // heading bin) at one of the palette radii below, preferring the LARGEST that fits the heading change +
  // grade → sweeping turns on mild ground, tight switchbacks only where grade forces them. Each re-routes
  // via onRoadParamChange. The old single 'Arc Gentle Radius' slider is GONE — it bound roadArcGentleRadius,
  // which the fixed-angle router now only reads as a fallback when roadArcRadii is absent (never, here).
  //   Sweep/Gentle/Medium Radius: the curvature palette roadArcRadii[0..2] — ↑ = wider, sweepier turns.
  //   Hard Radius:   tightest switchback the router (and the Dubins terminal) can express — the real fold
  //                  floor. Writes BOTH roadArcRadii[3] and roadArcHardRadius so the palette tail stays
  //                  pinned to the floor (ranger.js invariant: "last entry should equal roadArcHardRadius").
  //   Heading Bins:  heading-lattice resolution; one bin is turned per turn primitive. COARSER (fewer
  //                  bins) = LONGER, sweepier arcs (the opposite of the old anti-zigzag intuition).
  //   Grade Samples: grade sample points along each (now variable-length) arc; ≥2 for the long sweeps.
  //   Heur Weight:   weighted-A* speed knob. ↑ = faster chunk loads, slightly less optimal routes.
  roadFolder.add(params.roadArcRadii, '0', 60, 400, 10).name('Arc Sweep Radius (m)').onChange(fireRoadParam)
  roadFolder.add(params.roadArcRadii, '1', 30, 200, 5 ).name('Arc Gentle Radius (m)').onChange(fireRoadParam)
  roadFolder.add(params.roadArcRadii, '2', 15, 100, 5 ).name('Arc Medium Radius (m)').onChange(fireRoadParam)
  roadFolder.add(params, 'roadArcHardRadius', 6, 40, 1).name('Arc Hard Radius (m)').onChange(() => {
    params.roadArcRadii[3] = params.roadArcHardRadius   // keep the palette tail pinned to the min-radius floor
    fireRoadParam()
  })
  roadFolder.add(params, 'roadArcHeadingBins', 8, 48, 1 ).name('Arc Heading Bins').onChange(fireRoadParam)
  roadFolder.add(params, 'roadArcGradeSamples', 1, 6, 1 ).name('Arc Grade Samples').onChange(fireRoadParam)
  roadFolder.add(params, 'roadArcHeurWeight',   1, 3, 0.1).name('Arc Heur Weight').onChange(fireRoadParam)

  // De-quantize refit (BUG-16 + FEAT-20) — post-passes on the routed chain (road-carve.js).
  //   Refit Shortcut: corridor Dubins shortcut — straightens the quantized-heading bow on
  //                   near-straight roads and yields continuous (chord-derived) turn radii.
  //   Refit Smooth Window: κ box-filter window re-emitted as clothoid ramps; 0 = off. Larger =
  //                   smoother curvature but more far-end drift for the terminal to absorb.
  roadFolder.add(params, 'roadRefitShortcut').name('Refit Shortcut').onChange(fireRoadParam)
  roadFolder.add(params, 'roadRefitWindow', 0, 100, 5).name('Refit Smooth Window (m)').onChange(fireRoadParam)

  // ── Road Surface sub-folder (D-04/D-07 — Plan 09-05 surface sliders) ────────────
  // These sliders change ROAD GEOMETRY (width, crown, camber, carve slopes, shoulder, etc.)
  // and fire onRoadSurfaceChange which triggers a full debounced road-mesh + carve rebuild.
  // Debounce lives in main.js (consistent with D-09 pattern). Sliders bound directly to `params`.
  //
  // Ranges use Claude's-discretion realistic defaults with 2× headroom above default (D-09):
  //   roadWidth:           6–14 m (default 10 m, 0.5 step — D-04)
  //   crownHeight:         0–0.2 m (default 0.05 m, 0.005 step — D-04)
  //   camberStrength:      0.5–10 (default 4, step 0.5 — D-04; gain is in RADIANS, was mis-set to 200)
  //   roadCutSlope:        0.5–2 H:V (default 1.0, step 0.05 — D-08)
  //   roadFillSlope:       1.5–5 H:V (default 3.0, step 0.1 — D-08)
  //   roadShoulderWidth:   1–6 m (default 2.5, step 0.5 — D-05)
  //   designGradeWindow:   10–150 m (default 50, step 5 — D-06)
  //   roadCliffSlopeLo/Hi: slope thresholds for cliff shading (D-11)
  const fireSurface = () => { if (typeof callbacks.onRoadSurfaceChange === 'function') callbacks.onRoadSurfaceChange() }
  const surfaceFolder = roadFolder.addFolder('Road Surface')
  surfaceFolder.add(params, 'roadWidth',          6,   14,    0.5).name('Road Width (m)').onChange(() => {
    // Keep roadHalfWidth derived field in sync (hot path avoids division)
    params.roadHalfWidth = params.roadWidth / 2
    fireSurface()
  })
  surfaceFolder.add(params, 'crownHeight',         0,    0.2,  0.005).name('Crown Height (m)').onChange(fireSurface)
  surfaceFolder.add(params, 'camberStrength',      0.5,  10,   0.5  ).name('Camber Strength').onChange(fireSurface)
  surfaceFolder.add(params, 'roadCutSlope',         0.5,  2,    0.05).name('Cut Slope (H:V)').onChange(fireSurface)
  surfaceFolder.add(params, 'roadFillSlope',        1.5,  5,    0.1 ).name('Fill Slope (H:V)').onChange(fireSurface)
  // FEAT-10: caps how far the fill/cut embankment apron extends past the carve core. Lower = tighter
  // banks + fewer fan-shaped shards at tight turns; higher = gentler banks but more cross-arm overlap.
  surfaceFolder.add(params, 'roadMaxEmbankmentToe', 3,   20,    0.5 ).name('Max Embankment Toe (m)').onChange(fireSurface)
  surfaceFolder.add(params, 'roadShoulderWidth',    1,    6,    0.5 ).name('Shoulder Width (m)').onChange(fireSurface)
  surfaceFolder.add(params, 'designGradeWindow',   10,  150,   5   ).name('Grade Window (m)').onChange(fireSurface)
  surfaceFolder.add(params, 'roadCliffSlopeLo',     0,    0.5,  0.02).name('Cliff Slope Lo').onChange(fireSurface)
  surfaceFolder.add(params, 'roadCliffSlopeHi',     0.3,  0.9,  0.02).name('Cliff Slope Hi').onChange(fireSurface)

  // Plan 09-10 — Decal ribbon depth-bias + edge skirts.
  // roadSkirtDepth is geometry → fires fireSurface (full road rebuild).
  // roadPolygonOffsetFactor/Units are material state → update live material via
  // callbacks.onRoadMaterialChange THEN fireSurface for the rebuild path.
  const fireMaterial = (factor, units) => {
    if (typeof callbacks.onRoadMaterialChange === 'function') {
      callbacks.onRoadMaterialChange(factor, units)
    }
  }
  surfaceFolder.add(params, 'roadSkirtDepth',           0,   1.5, 0.05).name('Skirt Depth (m)').onChange(fireSurface)
  surfaceFolder.add(params, 'roadPolygonOffsetFactor',  -4,  0,   0.5 ).name('PolyOffset Factor').onChange(() => {
    fireMaterial(params.roadPolygonOffsetFactor, params.roadPolygonOffsetUnits)
    fireSurface()
  })
  surfaceFolder.add(params, 'roadPolygonOffsetUnits',   -8,  0,   0.5 ).name('PolyOffset Units').onChange(() => {
    fireMaterial(params.roadPolygonOffsetFactor, params.roadPolygonOffsetUnits)
    fireSurface()
  })

  // QUAL-10/11 — junction pad look. Pad GEOMETRY params → full road rebuild via fireSurface so the
  // AT_GRADE pads re-tessellate. Fillet Radius rounds the welded pad corners (QUAL-11); Apron Lift is
  // a hair of Y over the ribbon (0 relies on the pad's stronger polygonOffset to win the depth test —
  // raise a touch only if you see z-fight flicker at a pad).
  const junctionFolder = roadFolder.addFolder('Junctions')
  junctionFolder.add(params, 'roadJunctionCutback',     0,   25,  1   ).name('Ribbon Cutback (m)').onChange(fireSurface)
  junctionFolder.add(params, 'roadFilletRadius',        0.5, 10,  0.5 ).name('Pad Fillet Radius (m)').onChange(fireSurface)
  junctionFolder.add(params, 'roadJunctionCarveRadius', 0,  25,  1   ).name('Terrain Carve Radius (m)').onChange(fireSurface)
  junctionFolder.add(params, 'roadJunctionApronLift',   0,   0.05, 0.001).name('Apron Lift (m)').onChange(fireSurface)
  // QUAL-16 — deg-2 kink pads. Changes WHICH nodes are junctions (_detectNodeJunctions is
  // _networkRev-guarded) → needs fireRoadParam's rev bump, same as the QUAL-13 sliders below.
  junctionFolder.add(params, 'roadJunctionKinkDeg',        0, 45,   1    ).name('Deg-2 Kink Pad (°)').onChange(fireRoadParam)
  // QUAL-13 — sloped pad planes. These reshape the run GRADE profiles (rev-guarded caches), so they
  // need the full re-route path (fireRoadParam bumps _networkRev), not just a surface rebuild.
  junctionFolder.add(params, 'roadJunctionPadMaxGrade',    0, 0.15, 0.005).name('Pad Max Grade').onChange(fireRoadParam)
  junctionFolder.add(params, 'roadJunctionPadTerrainBias', 0, 10,   0.5  ).name('Pad Terrain Bias (m)').onChange(fireRoadParam)
  junctionFolder.add(params, 'roadJunctionBlendMaxGrade',  0, 0.30, 0.01 ).name('Blend Max Grade').onChange(fireRoadParam)

  // Plan 09-11 — Cheap below-margin carve params.
  // Both are geometry params → full road rebuild via fireSurface.
  // D3 (plan 09-22) COUPLING NOTE: carveExtraWidth sets the blendW=1 trough width, but the
  // effective carveHalfWidth is ALSO capped at roadMinTurnRadius (footprint bound ≤ ½ min inter-arm
  // separation). Widening carveExtraWidth beyond roadMinTurnRadius has no effect on the trough width;
  // to widen the trough further you must also widen roadMinTurnRadius (re-route slider, Road folder).
  // roadClearanceMargin is now uniform on banked turns (carve trough tilts WITH the ribbon — D3).
  surfaceFolder.add(params, 'roadClearanceMargin', 0,   1.5, 0.05).name('Clearance Margin (m)').onChange(fireSurface)
  surfaceFolder.add(params, 'roadCarveExtraWidth', 0,   8,   0.5 ).name('Carve Extra Width (m)').onChange(fireSurface)

  // D5 (plan 09-20) ring hysteresis: keep-radius = build-radius + roadTileKeepMargin.
  // Does not require a full road rebuild — tile lifecycle adjusts on the next syncToChunkRing.
  // Fires onRoadSurfaceChange so syncToChunkRing picks up the new margin promptly.
  surfaceFolder.add(params, 'roadTileKeepMargin', 0, 3, 1).name('Keep Margin (tiles)').onChange(fireSurface)

  // D2 (plan 09-21) camber slew-rate: camberProfile(arcS) limits |dCamber/ds| ≤ roadCamberRate
  // along the CONTINUOUS canonical run, easing banking across seams + zero-crossings (bug #4).
  // Keep ≤ 2.0 °/m to satisfy the harness gate (MAX_DCAMBER_DEG_PER_M). Full rebuild needed
  // because camberProfile is cached per run and the cached profile must be rebuilt.
  surfaceFolder.add(params, 'roadCamberRate', 0.1, 4.0, 0.1).name('Camber Rate (°/m)').onChange(fireSurface)

  // Plan 09-24 — Dirt shoulder colour picker (SURF-05 / D-01 / D-08).
  // addColor accepts a hex int on `params`; changing it fires fireSurface so the ribbon
  // rebuilds and the new skirt vertex colours take effect immediately.
  // No asset files — colour is applied as vertex colour on the skirt apron verts only.
  surfaceFolder.addColor(params, 'roadDirtColor').name('Dirt Shoulder Color').onChange(fireSurface)

  // Road-knob hover hints. The labels above are kept SHORT so the slider control stays usable, so a
  // one-line "what does this do" lives behind a hover instead. addInfo prepends a dimmed "ⓘ" to a
  // controller's label (at the START, where lil-gui's right-side ellipsis can't clip it) carrying a
  // native title tooltip. Keyed by the bound property so the blurbs survive label renames. Applied to
  // the three Road folders below (their subfolders' controllers are listed on each folder separately).
  const ROAD_INFO = {
    roadViz:               'Draws the road centerline splines in the 3D scene (debug overlay). Visual only — no effect on the road itself.',
    roadSiteCandidates:    'How many node placements the graph tries per cell before picking one. Higher = denser, more varied junctions.',
    roadSiteSpacing:       'Target spacing between graph nodes (cell size, m). Larger = sparser network with fewer intersections.',
    roadSiteMinDist:       'Minimum distance allowed between two graph nodes — stops junctions from clustering too tightly.',
    roadSiteValleySnap:    'Nudges graph nodes toward nearby valley floors so roads settle into low ground.',
    roadGraphMargin:       'Extra cells beyond the streamed area the graph is built into, so edges near the border still connect.',
    roadGraphDeviationCap: 'Max earthwork (m of cut/fill) the graph router spends to hold grade before it detours instead.',
    roadGraphMaxGrade:     'Steepest grade the graph router permits. Higher = straighter/steeper; lower = windier routes that stay gentle.',
    roadGraphGoalBlend:    'How hard the router aims straight at the destination near the end. Higher = less weaving as it arrives.',
    roadGraphWTurn:        'Curve penalty for the graph router — higher = straighter roads with fewer, gentler turns.',
    roadGraphWAlt:         'Reward for staying low / following valleys. Higher = roads hug the low ground more.',
    roadGraphCullCrossings:'Drops redundant crossings from the graph, thinning tangled intersection clusters.',
    roadSelfClearMargin:   'Extra clearance (m) beyond the road+shoulder footprint a road must keep from ITSELF. Higher = wider berth where a road loops back near itself.',
    roadSelfClearGap:      'Arc window (m) within which a road passing close to itself is treated as one natural bend (exempt). Below it = expected switchback; beyond it, a close approach is a self-overlap and the route re-threads wider. Lower = tighter hairpins get flagged and un-knotted.',
    roadWGrade:            'Cost weight for steepness — higher trades distance for gentler grades.',
    roadWOver:             'Soft-cap penalty once grade exceeds Max Grade — discourages, but does not forbid, over-steep segments.',
    roadValleyDepthCap:    'How far below baseline (m) descending still earns reward. Higher = more decisive valley-following, less squiggle.',
    roadEarthworkWindow:   'Look-ahead window (m) for planning cut/fill to smooth grade. 0 = off (the road just follows the terrain).',
    roadWDeviation:        'Weight pulling the road to hug existing terrain (less earthwork). Higher = fewer, smaller cuts and fills.',
    roadDeviationCap:      'Max cut or fill depth (m) the earthwork pass may use at any point.',
    roadMergeBand:         'Tolerance (m) for treating an edge\'s two endpoints as the "same" node (skips a collapsed edge).',
    roadMinTurnRadius:     'Tightest corner the road can make (m). The fillet rounds sharper corners up to this radius.',
    '0':                   'Widest radius in the turn palette (m) — used for sweeping turns on mild ground.',
    '1':                   'Second-widest turn radius in the palette (m).',
    '2':                   'Mid turn radius in the palette (m).',
    roadArcHardRadius:     'Tightest radius the router can express (m) — the real switchback floor. Also pins the palette tail.',
    roadArcHeadingBins:    'Heading-lattice resolution; one bin is turned per turn. Fewer bins = longer, sweepier arcs.',
    roadArcGradeSamples:   'Grade sample points along each arc. Use ≥2 so long sweeps read grade correctly.',
    roadArcHeurWeight:     'Weighted-A* speed knob. Higher = faster routing, slightly less optimal roads.',
    roadRefitShortcut:     'Post-pass that straightens the quantized-heading "bow" on near-straight roads via a Dubins shortcut.',
    roadRefitWindow:       'Smoothing window (m) that re-emits curvature as clothoid ramps. 0 = off; larger = smoother but more end drift.',
    // Road Surface
    roadWidth:             'Total drivable width of the road surface (m).',
    crownHeight:           'Height of the centerline crown (m) — the slight peak that sheds water to the edges.',
    camberStrength:        'How much the road banks into turns. Higher = more lean through corners.',
    roadCutSlope:          'Steepness of cut banks where the road slices into a hill, as H:V (lower = steeper).',
    roadFillSlope:         'Steepness of fill banks where the road is built up, as H:V (lower = steeper).',
    roadMaxEmbankmentToe:  'Caps how far (m) the embankment apron spreads past the road. Lower = tighter banks, fewer shards at tight turns.',
    roadShoulderWidth:     'Width (m) of the dirt shoulder flanking each side of the paved surface.',
    designGradeWindow:     "Smoothing window (m) for the road's lengthwise grade profile. Larger = smoother rises and dips.",
    roadCliffSlopeLo:      'Lower slope threshold where terrain starts shading as cliff rock.',
    roadCliffSlopeHi:      'Upper slope threshold where terrain is fully cliff rock.',
    roadSkirtDepth:        'How far (m) the road-edge skirt drops below the ribbon to hide seams against terrain.',
    roadPolygonOffsetFactor:'Depth-bias factor pushing the road decal above terrain to prevent z-fighting.',
    roadPolygonOffsetUnits: 'Depth-bias units for the road decal (pairs with PolyOffset Factor).',
    roadClearanceMargin:   'Extra headroom (m) carved below the road so it never pokes through terrain on banked turns.',
    roadCarveExtraWidth:   'Widens the carved trough (m) beyond the road. Effective width is capped at Min Turn Radius.',
    roadTileKeepMargin:    'Hysteresis (in tiles) before a streamed road tile is dropped — reduces churn at the ring edge.',
    roadCamberRate:        'Max rate the camber may change along the road (°/m). Lower = smoother banking across seams.',
    roadDirtColor:         'Colour of the dirt shoulder apron.',
    // Junctions
    roadJunctionCutback:     'How far (m) the ribbon legs pull back from a junction to make room for the pad.',
    roadFilletRadius:        'Corner rounding (m) of the junction pad — the tangent arc joining adjacent legs\' road edges. Auto-shrinks at tight corners.',
    roadJunctionCarveRadius: 'Radius (m) of terrain flattening around a junction pad.',
    roadJunctionApronLift:   'Tiny Y lift (m) of the junction pad over the ribbon to avoid z-fight flicker.',
    roadJunctionKinkDeg:     'Heading kink (°) at a degree-2 node above which the corner gets a mini-junction pad. 0 = off.',
    roadJunctionPadMaxGrade:    'Max slope of a junction pad plane (rise/run). 0 = flat pads. Pads tilt with the hillside up to this, shrinking uphill cut walls.',
    roadJunctionPadTerrainBias: 'How far (m) a pad may shift up/down toward the local terrain to reduce cut/fill. 0 = pad stays at the mean approach height.',
    roadJunctionBlendMaxGrade:  'Steepest artificial grade a junction approach blend may add. Bigger corrections stretch the blend further up the road instead of spiking.',
  }
  // Native `title=` proved unreliable here (it needs the pointer dead-still and lil-gui's repaints
  // reset the browser's hover timer), so we render our OWN tooltip: one reused fixed-position div on
  // <body> (escaping the panel's overflow clip), shown instantly on the icon's mouseenter and placed
  // to the LEFT of the cursor since the panel hugs the right screen edge.
  let _tip = null
  const _showTip = (e, text) => {
    if (!_tip) {
      _tip = document.createElement('div')
      _tip.style.cssText = 'position:fixed;z-index:100000;max-width:280px;padding:6px 9px;' +
        'background:rgba(20,20,24,0.96);color:#e8e8e8;font:12px/1.35 sans-serif;border:1px solid #555;' +
        'border-radius:4px;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.5)'
      document.body.appendChild(_tip)
    }
    _tip.textContent = text
    _tip.style.display = 'block'
    const w = _tip.offsetWidth, h = _tip.offsetHeight
    let x = e.clientX - w - 14; if (x < 8) x = e.clientX + 14
    let y = e.clientY + 6;      if (y + h > window.innerHeight - 8) y = window.innerHeight - h - 8
    _tip.style.left = x + 'px'
    _tip.style.top  = y + 'px'
  }
  const _hideTip = () => { if (_tip) _tip.style.display = 'none' }
  const addInfo = (ctrl, text) => {
    if (!ctrl || !ctrl.$name || !text || ctrl.$name.querySelector('.info-i')) return
    const icon = document.createElement('span')
    icon.className = 'info-i'
    icon.textContent = 'ⓘ'
    icon.style.cssText = 'margin-right:5px;opacity:0.5;cursor:help'
    icon.addEventListener('mouseenter', e => _showTip(e, text))
    icon.addEventListener('mousemove',  e => _showTip(e, text))
    icon.addEventListener('mouseleave', _hideTip)
    ctrl.$name.insertBefore(icon, ctrl.$name.firstChild)
  }
  for (const folder of [roadFolder, surfaceFolder, junctionFolder]) {
    for (const ctrl of folder.controllers) addInfo(ctrl, ROAD_INFO[ctrl.property])
  }

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
