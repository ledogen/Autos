// src/world-presets.js — world difficulty presets, Casual / Classic (FEAT-41, owner 2026-10-19).
//
// A world is (seed, preset). DESIGN.md (2026-08-01) keeps difficulty out of worldgen UNLESS it is
// part of the seed's identity, so the preset rides in the world code: `6/K` is seed 6 Classic, `6/C`
// seed 6 Casual (SM-INV-12). Classic is today's world, bit-exact.
//
// Applying writes ABSOLUTE values computed from the defaults captured when this module loads, before
// anything can mutate them — so applying is idempotent and Classic restores the defaults exactly.
// The rebuild that follows (applyWorldSeed) carries the values to every worker: the terrain worker
// gets HEIGHT_PARAM_KEYS at reinit, the network worker re-snapshots roadV2, POIs read POI_PARAMS
// when the region goes live.

import { RANGER_PARAMS } from '../data/ranger.js'
import { POI_PARAMS } from './poi.js'

// The code letters are fixed forever: a shared code has to keep meaning the same world. Per-notch
// custom settings (the stated goal) can grow a suffix after the letter without breaking K / C.
export const WORLD_PRESETS = {
  classic: { code: 'K', label: 'classic', terrain: 1,   wGrade: null, poiSpacing: 1 },
  // Halfway between the proposal and Classic: relief ×0.8 (150 → 120 m), the router's preferred
  // climb 7.5 % → 5.9 % (g* = 1/√wGrade), POIs 20 % closer. The hard grade cap and cTurn stay.
  casual:  { code: 'C', label: 'casual',  terrain: 0.8, wGrade: 290,  poiSpacing: 0.8 },
}

const POI_SPACING_KEYS = ['poiPadSpacing', 'poiNearSpawnR', 'poiNearSpawnStep', 'poiStationMinSep', 'poiPumpMinSep']
const BASE = {
  coarseAmplitude: RANGER_PARAMS.coarseAmplitude,   // fineAmplitude stays: it is ride bumps, not relief
  wGrade: RANGER_PARAMS.roadV2.wGrade,
  poi: Object.fromEntries(POI_SPACING_KEYS.map(k => [k, POI_PARAMS[k]])),
}

let _active = 'classic'
/** The preset the params currently carry. */
export const activePreset = () => _active

/** Write preset `id` into the live RANGER_PARAMS / POI_PARAMS. Unknown ids fall back to Classic. */
export function applyWorldPreset (id) {
  const p = WORLD_PRESETS[id] ?? WORLD_PRESETS.classic
  _active = WORLD_PRESETS[id] ? id : 'classic'
  RANGER_PARAMS.coarseAmplitude = BASE.coarseAmplitude * p.terrain
  RANGER_PARAMS.roadV2.wGrade = p.wGrade ?? BASE.wGrade
  for (const k of POI_SPACING_KEYS) POI_PARAMS[k] = BASE.poi[k] * p.poiSpacing
}

/** `6` + 'casual' → '6/C'. */
export const formatWorldCode = (seed, preset) => `${seed}/${(WORLD_PRESETS[preset] ?? WORLD_PRESETS.classic).code}`

/**
 * '6/C' → { seed: '6', preset: 'casual' }. Without a known trailing code the whole text is the seed,
 * exactly as parseWorldSeed treats it, and `preset` is null (the caller's selection stands).
 */
export function parseWorldCode (text) {
  const m = /^(.+)\/([a-z])$/i.exec(String(text).trim())
  const id = m && Object.keys(WORLD_PRESETS).find(k => WORLD_PRESETS[k].code === m[2].toUpperCase())
  return id ? { seed: m[1], preset: id } : { seed: String(text).trim(), preset: null }
}
