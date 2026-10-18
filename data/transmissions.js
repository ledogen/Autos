/**
 * data/transmissions.js — the gearbox registry, the engine registry's sibling (data/engines.js).
 * An entry is the box's own ratios; a vehicle names one and spreads it into its params, and the debug
 * menu's Transmission selector Object.assigns another over them. src/drivetrain.js is N-speed generic
 * (it clamps the held gear into range), so a swap mid-drive just lands in the nearest valid gear.
 *
 * The torque converter, final drive and shift schedule stay on the vehicle (data/ranger.js); the
 * upshift point is the ENGINE's (it follows the redline), see data/engines.js.
 */

export const TRANSMISSIONS = {

    // 4R44E 4-speed auto — the V6 Ranger's box, as tuned by FEAT-23.
    '4r44e': {
        gearRatios:   [2.47, 1.47, 1.00, 0.71],  // 1st → 4th
        reverseRatio: 2.47,
    },

    // 5R55E 5-speed auto — the 2.3 L Ranger's box. Mechanically the 4R44E: the extra 1.86 "2nd" is
    // the overdrive band applied in 1st. Ratios per The Ranger Station's Ranger automatics page.
    '5r55e': {
        gearRatios:   [2.47, 1.86, 1.47, 1.00, 0.75],  // 1st → 5th
        reverseRatio: 2.10,
    },
}
