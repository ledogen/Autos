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
export const DIFFICULTY_ROWS = {
  damage: {
    none:   { wear: 1, onset: 1, cap: 1, off: true },   // in no preset (owner)
    low:    { wear: 0.6, onset: 1.25, cap: 0.05 },      // [DEFAULT] 40 % less wear, onsets +25 %, ≤ 5 % per bump (3 % after wear)
    medium: { wear: 1, onset: 1, cap: 1 },              // today
  },
  hunger: {
    low:    { graceH: 1, energy: 0.5 },                 // [DEFAULT] an hour past empty before it bites; the drain ×1.125 → ×1.25
    normal: { graceH: 0, energy: 1 },                   // today: ×1.25 → ×1.5 from empty
  },
  cost: {
    low:    { growth: 1.035 },                          // [DEFAULT] +3.5 %/day: day 12 ×1.46, day 20 ×1.92
    medium: { growth: 1.065 },                          // today: +6.5 %/day: day 12 ×2.0, day 20 ×3.3
  },
  endless: {
    off: { on: false },
    on:  { on: true },
  },
}

/** Each row's level when a value is missing or unknown (an old save, a junk setting): today's. */
export const CLASSIC_RULES = Object.freeze({ damage: 'medium', hunger: 'normal', cost: 'medium', endless: 'off' })

/** The presets: a world (src/world-presets.js WORLD_PRESETS id) and a level per row. Zen (owner): "low-cost scaling,
 *  low damage, and every other setting will be the same as classic", endless on. Easiest first. */
export const DIFFICULTY_PRESETS = {
  zen:     { world: 'classic', damage: 'low',    hunger: 'normal', cost: 'low',    endless: 'on' },
  casual:  { world: 'casual',  damage: 'low',    hunger: 'low',    cost: 'low',    endless: 'off' },
  classic: { world: 'classic', ...CLASSIC_RULES },
}
