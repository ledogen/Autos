/**
 * data/engines.js — FEAT-50: the engine registry. One entry per engine the game can fit.
 *
 * An entry is everything that describes the ENGINE itself, as opposed to the truck it sits in:
 * the wide-open-throttle torque curve the drivetrain reads (src/drivetrain.js), and the inputs the
 * fuel model builds its rpm × throttle table from (src/fuel.js buildFuelMap). A vehicle names its
 * engine and spreads the entry into its params (data/ranger.js), so the drivetrain and the debug
 * sliders keep reading flat `params.engineTorqueCurve` etc.
 *
 * DIFFERENT ENGINES AND UPGRADES (owner, 2026-10-16): the fuel table is a pure function of the
 * entry, so another vehicle's engine is another entry, and an engine upgrade is a PATCHED entry —
 * `{ ...ENGINES.vulcan30, etaIndicated: 0.39 }` — which gets its own table. There is no modifier
 * layer yet; build one when the first upgrade exists.
 *
 * FUEL MODEL — the Willans line. The fuel's chemical power, times the engine's indicated thermal
 * efficiency, is the work done on the pistons. That work pays for the useful (brake) torque plus
 * three losses: friction, pumping, and accessories. So
 *     fuel power = (T_brake + T_friction + T_pumping + T_accessory) · ω / etaIndicated
 * and every loss is a mean effective pressure (MEP — a pressure that, acting over the swept volume,
 * does the same work per cycle): T = MEP · Vd / 4π for a four-stroke.
 *   friction MEP  = a + b·N + c·N² (N in krpm) — the Barnes-Moss form; rises with rpm, which is
 *                   most of why lugging beats revving.
 *   pumping MEP   = pumpingK · p_atm · (1 − manifold-pressure fraction): a nearly closed throttle
 *                   leaves the intake in deep vacuum and the pistons pay to pull against it — the
 *                   part-throttle penalty.
 *   enrichment    = above enrichFrom of pedal the ECU runs rich for power, up to +enrichMax fuel.
 *   DFCO          = decel fuel cut-off: zero pedal above dfcoRPM injects nothing (EEC-V does this).
 */

export const ENGINES = {

    // 2002 Ranger 3.0 L Vulcan V6 (OHV, 2 valves/cyl, sequential port injection), as paired with the
    // 4R44E auto in data/ranger.js. ≈ 250 N·m (185 lb·ft) @ ~3750, ~145 hp @ 4750.
    // Anchors (fueleconomy.gov, 2002 Ranger 2WD 3.0 L auto): 15 city / 20 hwy / 17 combined mpg.
    // These inputs land idle at 0.33 gal/h, best BSFC ≈ 286 g/kWh around 1500–2500 rpm at 80 %
    // pedal (an old pushrod two-valve; modern engines sit nearer 240), and 27 / 25 / 21 mpg at a
    // steady 55 / 60 / 70 mph on the sim's own road load — between the EPA lab highway figure (~26)
    // and the window-sticker 20. test/fuel-map.mjs pins those bands.
    vulcan30: {
        engineTorqueCurve: [
            [ 800, 160], [1200, 195], [2000, 225], [2800, 242], [3750, 250],
            [4500, 240], [5200, 215], [5800, 150],
        ],
        engineIdleRPM:    750,   // rpm — governed idle floor; engine never drops below this
        engineRedlineRPM: 5500,  // rpm — rev limiter cuts torque above this (over 200 rpm band)
        cylinders:        6,     // [-] firing pulses per rev = cylinders / 2 (src/engine-audio.js)
        shiftUpRPM:       5400,  // rpm(coupled) — WOT upshift, just under the limiter (always-WOT play)
        shiftUpLightRPM:  2000,  // rpm(coupled) — upshift at a light foot (FEAT-124), into the cheap low-rpm map cells

        // ── Fuel model (FEAT-50) — USER-OWNED ──────────────────────────────────────────────────
        displacementL: 2.99,     // L — swept volume
        etaIndicated:  0.375,    // [-] indicated thermal efficiency — sets the best-BSFC level
        fmepA:         97,       // kPa — friction MEP, constant term
        fmepB:         15,       // kPa per krpm
        fmepC:         5,        // kPa per krpm²
        accessoryNm:   10,       // N·m — alternator, water/oil/steering pumps
        pumpingK:      0.9,      // [-] fraction of atmospheric pressure lost at a closed throttle
        mapFloor:      0.25,     // [-] manifold-pressure fraction never drops below this (idle vacuum)
        enrichFrom:    0.85,     // [-] pedal above which power enrichment starts
        enrichMax:     0.15,     // [-] extra fuel at full pedal
        dfcoRPM:       1200,     // rpm — zero pedal above this cuts fuel entirely
    },

    // 2002 Ranger 2.3 L Duratec 23 I4 (Mazda MZR L3: DOHC, 4 valves/cyl, 87.5 × 94 mm, 9.7:1) — the
    // Ranger's own base engine from mid-2001, replacing the 2.5 L Lima. 143 hp @ 5250, 154 lb·ft
    // (209 N·m) @ 3750. The curve passes 195 N·m at 5250, which is 107 kW: the rated peak.
    // Anchors (fueleconomy.gov, 2002 Ranger 2WD 2.3 L): 5-spd auto 18 / 23 / 20 mpg, 5-spd manual
    // 21 / 25 / 23 — about 3 mpg better than the V6 across the board. Our gearbox is still the V6's
    // 4R44E 4-speed unless the 5R55E is picked too (data/transmissions.js), so in-game mpg gaps will differ.
    duratec23: {
        engineTorqueCurve: [
            [ 800, 140], [1500, 170], [2500, 192], [3750, 209],
            [4500, 204], [5250, 195], [6000, 165], [6500, 120],
        ],
        engineIdleRPM:    750,
        engineRedlineRPM: 6250,  // the PCM's rev limiter on the Duratec Ranger
        cylinders:        4,
        shiftUpRPM:       6000,  // past the 5250 power peak: the next gear still lands near 4750
        shiftUpLightRPM:  2200,  // the I4 makes its torque higher up than the V6

        // ── Fuel model (FEAT-50) — USER-OWNED ──────────────────────────────────────────────────
        displacementL: 2.26,
        etaIndicated:  0.385,    // a touch over the Vulcan: 4-valve pent-roof head, higher compression
        fmepA:         97,
        fmepB:         15,
        fmepC:         5,
        accessoryNm:   9,
        pumpingK:      0.9,
        mapFloor:      0.25,
        enrichFrom:    0.85,
        enrichMax:     0.15,
        dfcoRPM:       1200,
    },
}
