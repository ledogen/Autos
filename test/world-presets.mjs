// GATE (FEAT-41, owner 2026-10-19): world difficulty presets, Casual / Classic.
//
//   1. Classic applied over mutated params restores the pristine RANGER_PARAMS / POI_PARAMS bit-exactly
//      (deep-equal against a structured clone taken before anything ran);
//   2. Casual's values are exact: coarse 120 m, wGrade 290, POI spacing ×0.8 — and nothing else moves;
//   3. applying is idempotent;
//   4. world codes round-trip: '6/C' → (6, casual), 'my/world' stays a seed;
//   5. the settings store (src/settings.js): save/load round-trips, and missing, corrupt or throwing
//      storage gives the defaults.
//
// Run: node test/world-presets.mjs   (self-checking; exits non-zero on failure)

import { isDeepStrictEqual } from 'node:util'
import { RANGER_PARAMS } from '../data/ranger.js'
import { POI_PARAMS } from '../src/poi.js'
import { applyWorldPreset, activePreset, formatWorldCode, parseWorldCode } from '../src/world-presets.js'
import { loadSettings, saveSettings, SETTINGS_DEFAULTS } from '../src/settings.js'

let failures = 0
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) failures++ }

const pristineR = structuredClone(RANGER_PARAMS), pristineP = structuredClone(POI_PARAMS)

console.log('presets')
applyWorldPreset('casual')
check(RANGER_PARAMS.coarseAmplitude === 120, `casual coarseAmplitude 120 (got ${RANGER_PARAMS.coarseAmplitude})`)
check(RANGER_PARAMS.roadV2.wGrade === 290, `casual wGrade 290 (got ${RANGER_PARAMS.roadV2.wGrade})`)
check(POI_PARAMS.poiPadSpacing === 200 && POI_PARAMS.poiNearSpawnR === 800 && POI_PARAMS.poiNearSpawnStep === 400
      && POI_PARAMS.poiStationMinSep === 1600 && POI_PARAMS.poiPumpMinSep === 800, 'casual POI spacing ×0.8')
check(RANGER_PARAMS.fineAmplitude === pristineR.fineAmplitude && RANGER_PARAMS.roadV2.gMaxRoad === pristineR.roadV2.gMaxRoad
      && RANGER_PARAMS.roadV2.cTurn === pristineR.roadV2.cTurn, 'casual leaves fine amplitude, grade cap and cTurn alone')
check(activePreset() === 'casual', 'activePreset tracks the apply')
const once = structuredClone(RANGER_PARAMS)
applyWorldPreset('casual')
check(isDeepStrictEqual(RANGER_PARAMS, once), 'applying casual twice is idempotent')

RANGER_PARAMS.coarseAmplitude = 333; RANGER_PARAMS.roadV2.wGrade = 7; POI_PARAMS.poiPadSpacing = 1
applyWorldPreset('classic')
check(isDeepStrictEqual(RANGER_PARAMS, pristineR), 'classic over mutated params == pristine RANGER_PARAMS')
check(isDeepStrictEqual(POI_PARAMS, pristineP), 'classic over mutated params == pristine POI_PARAMS')
applyWorldPreset('nonsense')
check(activePreset() === 'classic' && isDeepStrictEqual(RANGER_PARAMS, pristineR), 'an unknown id falls back to classic')

console.log('world codes')
const eq = (a, b) => isDeepStrictEqual(a, b)
check(formatWorldCode('6', 'casual') === '6/C' && formatWorldCode('6', 'classic') === '6/K', "format: 6/C, 6/K")
check(eq(parseWorldCode('6/C'), { seed: '6', preset: 'casual' }), "'6/C' → 6 casual")
check(eq(parseWorldCode(' 6/k '), { seed: '6', preset: 'classic' }), "' 6/k ' → 6 classic (trimmed, any case)")
check(eq(parseWorldCode('my/world'), { seed: 'my/world', preset: null }), "'my/world' stays a seed")
check(eq(parseWorldCode('6/X'), { seed: '6/X', preset: null }), "an unknown letter stays part of the seed")
check(eq(parseWorldCode('6'), { seed: '6', preset: null }), "'6' → seed, no preset")
for (const id of ['casual', 'classic'])
  check(eq(parseWorldCode(formatWorldCode('hello world', id)), { seed: 'hello world', preset: id }), `round-trip ${id}`)

console.log('settings store')
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) } }
const st = mem()
check(eq(loadSettings(st), { ...SETTINGS_DEFAULTS }), 'empty storage → defaults')
const mine = { ...SETTINGS_DEFAULTS, worldPreset: 'casual', gearbox: 'manual', steerAssist: false }
saveSettings(mine, st)
check(eq(loadSettings(st), mine), 'save → load round-trips')
st.setItem('autos-settings/1', '{not json')
check(eq(loadSettings(st), { ...SETTINGS_DEFAULTS }), 'corrupt JSON → defaults')
st.setItem('autos-settings/1', JSON.stringify({ gearbox: 'manual', steerAssist: 'yes', bogus: 1 }))
const mixed = loadSettings(st)
check(mixed.gearbox === 'manual' && mixed.steerAssist === true && !('bogus' in mixed), 'wrong types and unknown keys dropped')
const boom = { getItem () { throw new Error('blocked') }, setItem () { throw new Error('blocked') } }
check(eq(loadSettings(boom), { ...SETTINGS_DEFAULTS }), 'throwing storage → defaults')
let threw = false; try { saveSettings(mine, boom) } catch { threw = true }
check(!threw, 'save into throwing storage does not throw')

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1) }
console.log('\nworld-presets: PASS')
