// ── FEAT-184: the tutorial seed ─────────────────────────────────────────────────────────────
// THE SEED IS THE WHOLE WORLD (as data/scenarios.js). The owner's pick from the census shortlist
// (.planning/dives/FEAT-184-tutorial-seed.html, 2026-11-14): one road, ~7 km of legs, steepest pitch 16.8 %.
// It is the owner's named exception to "there is no default seed" (DEC-111, DEC-149): the first playthrough
// ever is on it, and so is the main menu's "tutorial". Every other world stays random unless the player
// types one. A world-generation change can move its places (BUG-121 moved every region once): re-pick then.
export const TUTORIAL = { seed: '822480141' }
