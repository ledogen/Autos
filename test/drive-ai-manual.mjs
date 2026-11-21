// test/drive-ai-manual.mjs — BUG-240 gate: the driving AI (src/autopilot.js) drives the MANUAL. test/drive-ai-soak.mjs in
// its manual-gate mode (it sees it is run as this file): a 2 km drive on the real physics and world on two pinned random
// seeds, on the automatic, on the M5OD-R1 manual with the clutch assistant off (the AI's own clutch foot alone) and, on the
// first seed, with it on. Each must finish with no trouble, no reseat, no stall, no missed shift, and the manual's mean
// speed within 10 % of the automatic's on the same road.
import './drive-ai-soak.mjs'
