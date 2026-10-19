// GATE (FEAT-41, owner 2026-10-19): the world knobs — terrain relief, POI spacing, road climbs — and the
// two presets that name them (Casual / Classic).
//
//   1. Classic applied over mutated params restores the pristine RANGER_PARAMS / POI_PARAMS bit-exactly
//      (deep-equal against a structured clone taken before anything ran);
//   2. Casual's values are exact: coarse 120 m, wGrade 290, POI spacing ×0.8 — and nothing else moves;
//      a custom world writes exactly its knobs; off-grid knobs fall back to Classic;
//   3. applying is idempotent;
//   4. world codes round-trip: '6/C', '6/K', '6/T50P120R290'; a preset's knobs always print as its
//      letter; 'my/world' and off-grid tags stay part of the seed;
//   5. the settings store (src/settings.js): save/load round-trips, and missing, corrupt or throwing
//      storage gives the defaults — which are Classic's knobs.
//
// Run: node test/world-presets.mjs   (self-checking; exits non-zero on failure)

import { isDeepStrictEqual } from 'node:util'
import { RANGER_PARAMS } from '../data/ranger.js'
import { POI_PARAMS } from '../src/poi.js'
import { applyWorld, activeWorld, presetOf, worldTag, formatWorldCode, parseWorldCode, WORLD_PRESETS, KNOBS } from '../src/world-presets.js'
import { loadSettings, saveSettings, SETTINGS_DEFAULTS } from '../src/settings.js'

let failures = 0
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) failures++ }
const eq = (a, b) => isDeepStrictEqual(a, b)

const pristineR = structuredClone(RANGER_PARAMS), pristineP = structuredClone(POI_PARAMS)
const { casual: CASUAL, classic: CLASSIC } = WORLD_PRESETS

console.log('worlds')
applyWorld(CASUAL)
check(RANGER_PARAMS.coarseAmplitude === 120, `casual coarseAmplitude 120 (got ${RANGER_PARAMS.coarseAmplitude})`)
check(RANGER_PARAMS.roadV2.wGrade === 290, `casual wGrade 290 (got ${RANGER_PARAMS.roadV2.wGrade})`)
check(POI_PARAMS.poiPadSpacing === 200 && POI_PARAMS.poiNearSpawnR === 800 && POI_PARAMS.poiNearSpawnStep === 400
      && POI_PARAMS.poiStationMinSep === 1600 && POI_PARAMS.poiPumpMinSep === 800, 'casual POI spacing ×0.8')
check(RANGER_PARAMS.fineAmplitude === pristineR.fineAmplitude && RANGER_PARAMS.roadV2.gMaxRoad === pristineR.roadV2.gMaxRoad
      && RANGER_PARAMS.roadV2.cTurn === pristineR.roadV2.cTurn, 'casual leaves fine amplitude, grade cap and cTurn alone')
check(presetOf(activeWorld()) === 'casual', 'activeWorld tracks the apply')
const once = structuredClone(RANGER_PARAMS)
applyWorld(CASUAL)
check(eq(RANGER_PARAMS, once), 'applying casual twice is idempotent')
applyWorld({ t: 50, p: 120, r: 290 })
check(RANGER_PARAMS.coarseAmplitude === 75 && POI_PARAMS.poiPadSpacing === 300 && POI_PARAMS.poiStationMinSep === 2400
      && RANGER_PARAMS.roadV2.wGrade === 290, 'custom T50 P120 R290: coarse 75 m, pads 300 m, stations 2400 m, wGrade 290')

RANGER_PARAMS.coarseAmplitude = 333; RANGER_PARAMS.roadV2.wGrade = 7; POI_PARAMS.poiPadSpacing = 1
applyWorld(CLASSIC)
check(eq(RANGER_PARAMS, pristineR), 'classic over mutated params == pristine RANGER_PARAMS')
check(eq(POI_PARAMS, pristineP), 'classic over mutated params == pristine POI_PARAMS')
applyWorld({ t: 130, p: 100, r: 180 })
check(presetOf(activeWorld()) === 'classic' && eq(RANGER_PARAMS, pristineR), 'off-grid knobs (t 130, steeper than Classic) fall back to classic')
check(KNOBS.t[0] === 50 && KNOBS.t.at(-1) === 120 && KNOBS.t.length === 8, 'terrain notches 50–120 % in 10s')

console.log('world codes')
check(formatWorldCode('6', CASUAL) === '6/C' && formatWorldCode('6', CLASSIC) === '6/K', 'format: 6/C, 6/K')
check(worldTag({ t: 80, p: 80, r: 290 }) === 'C', "Casual's knobs set by hand print as C")
check(formatWorldCode('6', { t: 50, p: 120, r: 290 }) === '6/T50P120R290', 'custom: 6/T50P120R290')
check(eq(parseWorldCode('6/C'), { seed: '6', world: { t: 80, p: 80, r: 290 } }), "'6/C' → 6 casual")
check(eq(parseWorldCode(' 6/k '), { seed: '6', world: { t: 100, p: 100, r: 180 } }), "' 6/k ' → 6 classic (trimmed, any case)")
check(eq(parseWorldCode('6/t50p120r290'), { seed: '6', world: { t: 50, p: 120, r: 290 } }), "'6/t50p120r290' → the knobs")
check(eq(parseWorldCode('my/world'), { seed: 'my/world', world: null }), "'my/world' stays a seed")
check(eq(parseWorldCode('6/X'), { seed: '6/X', world: null }), 'an unknown letter stays part of the seed')
check(eq(parseWorldCode('6/T130P100R180'), { seed: '6/T130P100R180', world: null }), 'an off-grid tag stays part of the seed')
check(eq(parseWorldCode('6'), { seed: '6', world: null }), "'6' → seed, no world")
for (const w of [CASUAL, CLASSIC, { t: 60, p: 110, r: 180 }])
  check(eq(parseWorldCode(formatWorldCode('hello world', w)).world, { t: w.t, p: w.p, r: w.r }), `round-trip ${worldTag(w)}`)

console.log('settings store')
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) } }
const st = mem()
check(eq(loadSettings(st), { ...SETTINGS_DEFAULTS }), 'empty storage → defaults')
check(presetOf({ t: SETTINGS_DEFAULTS.worldTerrain, p: SETTINGS_DEFAULTS.worldPoi, r: SETTINGS_DEFAULTS.worldRoads }) === 'classic', "the default knobs are Classic's")
const mine = { ...SETTINGS_DEFAULTS, worldTerrain: 80, worldPoi: 80, worldRoads: 290, gearbox: 'manual', steerAssist: false }
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
