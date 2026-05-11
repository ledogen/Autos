/**
 * Debug panel for RangerSim. Phase 1: backtick (`) toggle, lateralDampingCoeff and
 * rollingResistanceCoeff sliders (D-10). Phase 2 adds full physics parameter panel
 * (M2-05, M2-06). Uses lil-gui (bundled in three/addons — per CLAUDE.md forbidden list).
 */

import { GUI } from 'three/addons/libs/lil-gui.module.min.js'

/**
 * Initialize the debug panel. Creates a lil-gui instance, adds Phase 1 friction sliders,
 * registers the backtick toggle listener, and returns the GUI instance for Phase 2 expansion.
 *
 * @param {object} params — RANGER_PARAMS reference (NOT a copy). Slider mutations write
 *   directly to this object, which is the same object physics.js reads each step — changes
 *   take effect immediately (M2-06 behavior established in Phase 1 for these two sliders).
 * @returns {GUI} the lil-gui GUI instance (for use by Phase 2 when adding more controllers)
 */
export function initDebug (params) {
  const gui = new GUI({ title: 'RangerSim Debug' })
  gui.domElement.style.display = 'none'  // hidden by default; backtick reveals it

  // D-10: Phase 1 friction tuning. Range (500–10000) and (10–1000) chosen for feel;
  // expose as Claude's discretion per CONTEXT.md. Both fields live in data/ranger.js,
  // mutated live here.
  gui.add(params, 'lateralDampingCoeff', 500, 10000, 100).name('Lateral Damping (N/m·s)')
  gui.add(params, 'rollingResistanceCoeff', 10, 1000, 10).name('Rolling Resistance (N/m·s)')

  // Backtick toggle listener
  document.addEventListener('keydown', e => {
    if (e.key === '`') {
      const hidden = gui.domElement.style.display === 'none'
      gui.domElement.style.display = hidden ? '' : 'none'
    }
  })

  return gui
}
