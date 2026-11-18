// test/drive-ai.mjs — FEAT-293 gate: the driving AI (src/autopilot.js). test/drive-ai-soak.mjs in its gate mode (it sees
// it is run as this file):
//   1. a short fixed drive on the real physics and world on a gentle stretch: no trouble, lateral error from its lane
//      under 1.5 m p99;
//   2. the autopilot's kinematic self-check (`node src/autopilot.js`): holds its lane on a ring at the bend speed,
//      three-point-turns at a dead end without leaving the deck, reverses out when stuck and then gives up.
import './drive-ai-soak.mjs'
