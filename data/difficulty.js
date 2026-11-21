// data/difficulty.js — the difficulty rows (FEAT-296, DEC-433): rows × levels → the numbers a run's rules resolve to.
//
// Each row's middle level is today's game: every multiplier 1, so Classic is bit-exact (the owner: "the current damage
// setting will be known as medium", "normal hunger", "medium" cost scaling). src/difficulty.js writes these into the
// params the systems already read; this file is only the table. Every number on a non-middle level is a [DEFAULT]
// for the owner to tune (the debug panel's "Difficulty (FEAT-296)" folder edits them live).
//
//   damage.wear    × every wear class's rate (DAMAGE_PARAMS.wearScale): continuous wear AND the loss each event deals
//   damage.onset   × every damage-onset threshold (src/difficulty.js ONSET_KEYS): the bump-stop force that starts
//                  spring damage, pops a worn tire or bends alignment; the rim strike that pinch-flats a tire or
//                  bends a rim; a rock's pop force and pinch energy; the crash speed that starts armor/wheel loss
//   damage.cap     the most one bump-stop event takes off a spring or a wheel, before wear (1 = uncapped, today)
//   damage.off     'none': the truck takes nothing at all (damageModel.held, the tutorial's own lock)
//   hunger.graceH  hours the satiety counter may fall below empty before the hungry drain starts (0 = today)
//   hunger.energy  × the extra energy drain of being hungry (hungryRate − 1, starvingRate − 1)
//   cost.growth    the per-day price multiplier of the cost curve (economy.js dayTierTable = growth^(day − 1))
//   endless.on     the expedition camp is a milestone, not the run's end (main.js _endRun)
//   hunger.off     hunger does nothing: no word, no bar, no extra drain (DAY_PARAMS.hungerOn false)
//   fuel.burn      × the engine's fuel burn (RANGER_PARAMS.fuelBurnScale); 0 = the tank never drains
//   tows.n         tows on the house per run, before a tow costs money (main.js _towQuote)
//   death.on       off: a death (a fatal crash or a breakdown, DEC-001) is a lost life, never the end (main.js _loseLife)
export const DIFFICULTY_ROWS = {
  damage: {
    none:   { wear: 1, onset: 1, cap: 1, off: true },   // in no preset (owner)
    low:    { wear: 0.6, onset: 1.25, cap: 0.05 },      // [DEFAULT] 40 % less wear, onsets +25 %, ≤ 5 % per bump (3 % after wear)
    medium: { wear: 1, onset: 1, cap: 1 },              // today
  },
  hunger: {
    off:    { graceH: 0, energy: 1, off: true },        // DEC-475: hunger off
    low:    { graceH: 1, energy: 0.5 },                 // [DEFAULT] an hour past empty before it bites; the drain ×1.125 → ×1.25
    normal: { graceH: 0, energy: 1 },                   // today: ×1.25 → ×1.5 from empty
  },
  cost: {
    off:    { growth: 1 },                              // DEC-475: day-1 prices all run
    low:    { growth: 1.035 },                          // [DEFAULT] +3.5 %/day: day 12 ×1.46, day 20 ×1.92
    normal: { growth: 1.065 },                          // today: +6.5 %/day: day 12 ×2.0, day 20 ×3.3 (was "medium", DEC-475)
  },
  fuel: {                                               // DEC-475: fuel burn
    off:    { burn: 0 },
    low:    { burn: 0.5 },                              // [DEFAULT] half the burn
    normal: { burn: 1 },                                // today
  },
  tows: {                                               // DEC-475: free tows (integer-like keys list in this order)
    1:        { n: 1 },
    3:        { n: 3 },
    5:        { n: 5 },
    10:       { n: 10 },
    infinite: { n: Infinity },
  },
  death: {                                              // DEC-475: death on/off
    on:  { on: true },
    off: { on: false },
  },
  endless: {
    off: { on: false },
    on:  { on: true },
  },
}

/** Each row's level when a value is missing or unknown (an old save, a junk setting): today's. */
export const CLASSIC_RULES = Object.freeze({ damage: 'medium', hunger: 'normal', cost: 'normal', fuel: 'normal', tows: '1', death: 'on', endless: 'off' })
/** Level names a row used to have, read as today's (an old save or setting): DEC-475 renamed cost "medium" to "normal". */
export const RULE_ALIASES = { cost: { medium: 'normal' } }

/** The presets: a world (src/world-presets.js WORLD_PRESETS id) and a level per row. Zen (owner): "low-cost scaling,
 *  low damage, and every other setting will be the same as classic", endless on. Easiest first. */
export const DIFFICULTY_PRESETS = {
  zen:     { world: 'classic', ...CLASSIC_RULES, damage: 'low', cost: 'low', endless: 'on' },
  // DEC-475: Casual's fuel is low; its 3 free tows are a [DEFAULT] (Classic's 1 is the row's least).
  casual:  { world: 'casual',  ...CLASSIC_RULES, damage: 'low', hunger: 'low', cost: 'low', fuel: 'low', tows: '3' },
  classic: { world: 'classic', ...CLASSIC_RULES },
}
