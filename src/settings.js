// src/settings.js — the player's saved choices (FEAT-41 run setup + Controls & Assists page).
//
// One localStorage key. Storage can be missing, blocked (private window, previews) or hold junk from
// an older build, so every access is wrapped and anything unusable falls back to the defaults: the
// game must play identically with no storage at all. Pure apart from that one key — main.js applies
// the values (PAD_PARAMS, RANGER_PARAMS, the gearbox, the world preset).

const KEY = 'autos-settings/1'

export const SETTINGS_DEFAULTS = Object.freeze({
  worldPreset: 'classic',   // src/world-presets.js id
  gearbox: 'auto',          // 'auto' = the truck's own automatic · 'manual' = the M5OD-R1 (FEAT-126)
  steerAssist: true,        // PAD_PARAMS.steerAssist (FEAT-125)
  clutchAssist: true,       // RANGER_PARAMS.clutchAssist (FEAT-126)
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
