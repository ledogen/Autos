// data/scenarios.js — FEAT-62: authored scenarios, data only (the data/dialogue.js pattern).
//
// A scenario is a pinned world, a pinned start, a line of gates and a finish. THE SEED IS THE WHOLE
// WORLD (FEAT-62, measured by test/world-determinism.mjs): roads, terrain and props are pure
// functions of it, so the poses below are plain world coordinates and need no stored centre.
//
// The poses were extracted from the REAL routed road headless (seed + current params), not eyeballed:
// each is a centreline point with the road's forward tangent as `heading` (the body convention —
// forward is (-sin h, 0, -cos h), the same one _seatOnGroundPlane and resolveSpawn use).
// test/scenario-route.mjs re-checks that every pose still sits on the road centreline and faces down
// it, so a router/param change that moves the road fails the gate instead of silently leaving the
// gates standing in a field. If it fails, re-extract the poses; do not loosen the gate.
//
// Fields:
//   id, name, blurb   — menu text; id is also the leaderboard key, so never rename a shipped one
//   seed              — world seed STRING, exactly what the seed prompt would take
//   spawn             — truck pose at load / restart {x, z, heading}
//   start             — the white start columns (decoration: the clock starts on the countdown's GO)
//   gates             — cyan checkpoints, crossed in any order; all are required for a valid time
//   finish            — the red finish columns; crossing them ends the run
//   gateHalfWidth     — m from the centreline to each column (road half-width 5 + most of the 2.5 m
//                       shoulder). The crossing test is gateHalfWidth + GATE_SLACK_M (src/scenario.js).

export const SCENARIOS = [
  {
    // Owner's first scenario (2026-10-02, capture autos-capture-1791011156662.json — the mark sits
    // at gate 5). Starts on the crest 57 m above the node where the descent's run begins and ends
    // 25 m short of the junction at the bottom: 1.49 km of road, 163 m of drop (~11 % mean grade).
    id: 'ranger-descent',
    name: 'the descent',
    blurb: '1.5 km downhill, 160 m of drop, five gates',
    seed: '381142870',
    gateHalfWidth: 7,
    spawn:  { x:    8.43, z:  148.63, heading: -3.0750 },
    start:  { x:    9.09, z:  158.61, heading: -3.0750 },
    gates: [
      { x:   45.82, z:  387.45, heading:  2.7788 },
      { x:   38.89, z:  614.88, heading:  2.6488 },
      { x: -101.39, z:  804.29, heading:  2.2143 },
      { x:   25.58, z:  932.05, heading: -2.3562 },
      { x:  -36.57, z: 1033.83, heading:  1.1071 },
    ],
    finish: { x: -251.24, z:  926.53, heading:  1.1146 },
  },
  {
    // Owner's second scenario (2026-10-25, captures autos-capture-1792861006788.json → …118377.json:
    // "new scenarios mission from here to here"). One road, no junctions: 1.54 km that falls 107 m
    // in its first 900 m (~12 % mean grade) into a hollow, then climbs 25 m out and eases down to the
    // finish. Poses extracted headless from the routed road; named by the owner 2026-10-26.
    id: 'ranger-descent-2',
    name: 'descent 2',
    blurb: '1.5 km, 110 m down into the hollow and out, five gates',
    seed: '477662008',
    gateHalfWidth: 7,
    spawn:  { x:  -517.58, z:   605.99, heading:  1.3878 },
    start:  { x:  -529.43, z:   604.33, heading:  1.5859 },
    gates: [
      { x:  -703.76, z:   746.44, heading:  1.3136 },
      { x:  -879.95, z:   565.84, heading:  0.5156 },
      { x:  -952.83, z:   319.95, heading:  0.2714 },
      { x: -1144.93, z:   234.01, heading:  1.1177 },
      { x: -1371.94, z:   139.46, heading:  0.8483 },
    ],
    finish: { x: -1609.35, z:    63.98, heading:  2.0154 },
  },
]
