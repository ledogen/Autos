// src/settings.js — the player's saved choices (FEAT-41 run setup + settings page).
//
// One localStorage key. Storage can be missing, blocked (private window, previews) or hold junk from
// an older build, so every access is wrapped and anything unusable falls back to the defaults: the
// game must play identically with no storage at all. Pure apart from that one key — main.js applies
// the values (PAD_PARAMS, RANGER_PARAMS, the gearbox, the world preset).

const KEY = 'autos-settings/1'

export const SETTINGS_DEFAULTS = Object.freeze({
  // The world knobs (src/world-presets.js KNOBS), Classic's by default. Off-grid values from an old or
  // edited save fall back to Classic when applied.
  worldTerrain: 100,        // terrain relief, % of Classic
  worldPoi: 100,            // POI spacing, % of Classic
  worldRoads: 180,          // roadV2.wGrade: 180 normal (Classic) · 290 gentle
  // FEAT-296 (DEC-433): the setup page's rule rows (data/difficulty.js levels), Classic's by default. A run copies them
  // into its save at start (main.js _runRules): the run keeps its own rules whatever this page says later.
  ruleDamage: 'medium',     // none · low · medium
  ruleHunger: 'normal',     // off · low · normal
  ruleCost: 'normal',       // off · low · normal ("medium" before DEC-475: main.js reads it as normal)
  ruleFuel: 'normal',       // off · low · normal (DEC-475)
  ruleTows: '0',            // free tows a run: 0 · 1 · 3 · 5 · 10 · infinite (DEC-475)
  ruleDeath: 'on',          // on · off (DEC-475)
  ruleEndless: 'off',       // off · on
  gearbox: 'auto',          // 'auto' = the truck's own automatic · 'manual' = the M5OD-R1 (FEAT-126)
  steerAssist: true,        // PAD_PARAMS.steerAssist (FEAT-125)
  clutchAssist: true,       // RANGER_PARAMS.clutchAssist (FEAT-126)
  abs: true,                // RANGER_PARAMS.abs — anti-lock brakes (src/abs.js)
  throttleAssist: true,     // RANGER_PARAMS.throttleAssist — the skilled foot (src/traction.js, FEAT-159; owner 2026-11-02: on)
  tractionControl: false,   // RANGER_PARAMS.tractionControl — brake + torque traction control (FEAT-159; owner: off)
  stickDeadzone: 0.10,      // PAD_PARAMS.stickDeadzone — keep equal to gamepad.js's default
  steerShape: 1,            // PAD_PARAMS.steerShape — likewise, 100 % when first toggled on (DEC-489) (0 linear … 1 parabolic … 1.5)
  padLayout: 'Professor',   // PAD_PARAMS.padLayout — DEC-431: 'Professor' · 'Ventura Highway' (gamepad.js PAD_LAYOUTS)
  vibration: 1,             // RUMBLE_PARAMS.vibration — controller vibration master: 0 off · 0.5 low · 1 normal · 1.5 high (FEAT-247)
  uiScale: 'small',         // FEAT-248: the 2D layer's size — 'small' (today's, the default) · 'big' (a TV): index.html `html[data-ui-scale=big]` zooms it
  frameCap: 60,             // PERF-48 (DEC-185): render frames per second — 60 · 30 · 90 · 120 · 0 = the display's own rate (BUG-169, DEC-224). Physics is not capped
  // FEAT-184 (DEC-148, owner 2026-11-14: "no setting", "there is no more flag"): not a choice and not on any page — the
  // one mark of "this browser has played an opening before" (finished or skipped: main.js _markPlayed). Until it is set,
  // a skip asks "are you sure" first. It replaced the "always skip the tutorial" setting.
  playedBefore: false,
  // No last seed: the seed field is always blank (owner, 2026-09-06) — remembering it would make
  // "just press start" mean "replay the same world forever".
})

/** The saved settings over the defaults. Unknown keys and wrongly-typed values are dropped. */
export function loadSettings (storage = globalThis.localStorage) {
  const out = { ...SETTINGS_DEFAULTS }
  try {
    const saved = JSON.parse(storage.getItem(KEY))
    for (const k of Object.keys(out)) if (typeof saved?.[k] === typeof out[k]) out[k] = saved[k]
  } catch { /* missing, blocked or corrupt → defaults */ }
  return out
}

/** Persist `s`. A blocked storage loses the save, never the game. */
export function saveSettings (s, storage = globalThis.localStorage) {
  try { storage.setItem(KEY, JSON.stringify(s)) } catch { /* blocked → this session only */ }
}
