// src/world-presets.js — the world settings: three knobs, two named presets (FEAT-41, owner 2026-10-19).
//
// A world is (seed, knobs). DESIGN.md (2026-08-01) keeps difficulty out of worldgen UNLESS it is part
// of the seed's identity, so the knobs ride in the world code (SM-INV-12):
//   6/K              Classic — today's world, bit-exact
//   6/C              Casual
//   6/T80P120R290    anything else, spelled out: terrain relief %, POI spacing %, road wGrade
// A code carries the VALUES, never a hash of them: a hash is one-way, and a code has to rebuild its world.
//
// The knobs (a world is `{ t, p, r }`):
//   t  terrain relief, % of Classic's coarse amplitude (150 m). fineAmplitude stays: it is ride bumps.
//   p  POI spacing, % of Classic's siting distances (pad spacing, near-spawn radius, station/pump floors).
//   r  roadV2.wGrade, the router's grade discomfort: g* = 1/√r is the climb it prefers. Gentle 290 (5.9 %)
//      or Classic's own (180, 7.5 %).
// Ranges stop at Classic on the steep side (owner: "if it got much steeper than classic it would be quite
// deadly and probs messed up"): t and p 50–120 % in 10 % notches, r gentle or normal. The hard grade
// cap and cTurn never move.
//
// Applying writes ABSOLUTE values from the defaults captured when this module loads, before anything can
// mutate them — so applying is idempotent and Classic restores the defaults exactly. The rebuild that
// follows (applyWorldSeed) carries them to every worker: the terrain worker gets HEIGHT_PARAM_KEYS at
// reinit, the network worker re-snapshots roadV2, POIs read POI_PARAMS when the region goes live.

import { RANGER_PARAMS } from '../data/ranger.js'
import { POI_PARAMS } from './poi.js'

const POI_SPACING_KEYS = ['poiPadSpacing', 'poiNearSpawnR', 'poiNearSpawnStep', 'poiStationMinSep', 'poiPumpMinSep']
const BASE = {
  coarseAmplitude: RANGER_PARAMS.coarseAmplitude,
  wGrade: RANGER_PARAMS.roadV2.wGrade,
  poi: Object.fromEntries(POI_SPACING_KEYS.map(k => [k, POI_PARAMS[k]])),
}

const notches = (lo, hi, step) => Array.from({ length: (hi - lo) / step + 1 }, (_, i) => lo + i * step)
/** The legal values of each knob — the setup page's selector options and the code parser's whitelist. */
export const KNOBS = {
  t: notches(50, 120, 10),
  p: notches(50, 120, 10),
  r: [[290, 'gentle'], [BASE.wGrade, 'normal']],
}

// The code letters are fixed forever: a shared code has to keep meaning the same world.
export const WORLD_PRESETS = {
  casual:  { code: 'C', t: 80,  p: 80,  r: 290 },
  classic: { code: 'K', t: 100, p: 100, r: BASE.wGrade },
}

const sameWorld = (a, b) => a.t === b.t && a.p === b.p && a.r === b.r
/** The preset id whose knobs `w` matches exactly, or null (a custom world). */
export const presetOf = (w) => Object.keys(WORLD_PRESETS).find(id => sameWorld(WORLD_PRESETS[id], w)) ?? null
const legal = (w) => KNOBS.t.includes(w.t) && KNOBS.p.includes(w.p) && KNOBS.r.some(([v]) => v === w.r)

let _active = { ...WORLD_PRESETS.classic }
/** The world the params currently carry. */
export const activeWorld = () => ({ ..._active })

/** Write world `w` into the live RANGER_PARAMS / POI_PARAMS. Off-grid knobs fall back to Classic. */
export function applyWorld (w) {
  _active = legal(w) ? { t: w.t, p: w.p, r: w.r } : { ...WORLD_PRESETS.classic }
  const { t, p, r } = _active
  RANGER_PARAMS.coarseAmplitude = BASE.coarseAmplitude * t / 100
  RANGER_PARAMS.roadV2.wGrade = r
  for (const k of POI_SPACING_KEYS) POI_PARAMS[k] = BASE.poi[k] * p / 100
}

/** The part of a world code after the slash: a preset's letter, or the knobs spelled out. */
export function worldTag (w) {
  const id = presetOf(w)
  return id ? WORLD_PRESETS[id].code : `T${w.t}P${w.p}R${w.r}`
}
/** `6` + Casual's knobs → '6/C'. */
export const formatWorldCode = (seed, w) => `${seed}/${worldTag(w)}`

/**
 * '6/C' → { seed: '6', world: Casual's knobs }; '6/T80P120R290' → the knobs it spells. Without a legal
 * trailing tag the whole text is the seed, exactly as parseWorldSeed treats it, and `world` is null
 * (the caller's selection stands).
 */
export function parseWorldCode (text) {
  const s = String(text).trim()
  const slash = s.lastIndexOf('/')
  const tag = slash > 0 ? s.slice(slash + 1).toUpperCase() : ''
  let world = null
  const id = Object.keys(WORLD_PRESETS).find(k => WORLD_PRESETS[k].code === tag)
  if (id) world = { t: WORLD_PRESETS[id].t, p: WORLD_PRESETS[id].p, r: WORLD_PRESETS[id].r }
  const m = /^T(\d+)P(\d+)R(\d+)$/.exec(tag)
  if (m) world = { t: +m[1], p: +m[2], r: +m[3] }
  return world && legal(world) ? { seed: s.slice(0, slash), world } : { seed: s, world: null }
}
