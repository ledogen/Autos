/**
 * test/map-bg-slice.mjs — PERF-46: the map's sheet rebuild stays cut to the frame budget.
 *
 * The rebuild (src/map2d.js _bgWork) is one generator that yields between units of work, and _stepBackground
 * reads the clock between units. The failure mode is silent: drop a `yield` from a tile builder and the map still
 * draws, it just stalls a frame for tens of milliseconds the second after every pan or zoom.
 *
 * So this runs the REAL rebuild on a headless Map2D (canvas calls stubbed) under a FAKE CLOCK that advances one
 * tick per height sample (road._coarseH and the water system's raw height): the work every unit is made of. It
 * checks, for a close view (ground level 0, glyphs on) and the widest the map zooms out to (level 2, water
 * queries over ~20 km):
 *   1. no step runs past its budget by more than UNIT_MAX samples — the largest piece of work that cannot stop
 *      part-way (a water cell's flow trace, a row of a tile). A builder that lost a `yield` overruns by thousands;
 *   2. the job ends and swaps a finished sheet in.
 * What it cannot see: work that samples nothing (the draw's canvas calls, a ground tile's texel loop). Those are
 * measured in the browser: wip/perf-46/probe.mjs, numbers in PERF-46.
 */

import { RoadSystem } from '../src/road.js'
import { WaterSystem } from '../src/water.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

let clock = 0
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true, writable: true })
const TICK = 1e-3   // ms per height sample: the fake clock's only source of time
const ctx = new Proxy({}, { get: (t, k) => k in t ? t[k] : () => {}, set: (t, k, v) => { t[k] = v; return true } })
const canvas = (width = 0, height = 0) => ({ width, height, getContext: () => ctx })
globalThis.document = { createElement: () => canvas() }
globalThis.ImageData = class { constructor (w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4) } }
globalThis.Path2D = class { moveTo () {} lineTo () {} }
const { Map2D } = await import('../src/map2d.js')

const UNIT_MAX = 4000          // samples a step may overrun its budget by; the observed worst is printed
const BUDGET = 6               // ms — BG_SLICE_MS
const SEED = '6'               // the test seed
let failures = 0
const check = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failures++ } }

const ws = parseWorldSeed(SEED)
const road = new RoadSystem(ws, RANGER_PARAMS)
const coarse = road._coarseH.bind(road)
road._coarseH = (x, z) => { clock += TICK; return coarse(x, z) }
const { rawHeightWorld } = makeTerrainHeadless(ws, RANGER_PARAMS, null)
const water = new WaterSystem(ws, RANGER_PARAMS, (x, z) => { clock += TICK; return rawHeightWorld(x, z) })

// The map at the owner's canvas (1045 × 700 CSS px at 2× — 2090 × 1400 device px), its fields set as _resize would.
const m = Object.create(Map2D.prototype)
Object.assign(m, {
    _road: road, _getWater: () => water, _getSeed: () => ws, _tileMemo: new Map(), _coverMemo: new Map(),
    _cssW: 1045, _cssH: 700, _dpr: 2, _bgOffX: 523, _bgOffY: 350, _panX: 0, _panZ: 0,
    _bg: canvas(4180, 2800), _bgNext: canvas(),
})
m._sheetRect = m._computeSheet(m._cssW, m._cssH)

for (const [name, zoom] of [['close (level 0, glyphs)', 1.0], ['widest', 0.11]]) {
    m._zoom = zoom
    m._startBackground()
    const job = m._bgJob
    let overMax = 0, steps = 0
    while (m._bgJob && steps < 1e6) {
        const t = clock
        m._stepBackground(BUDGET)
        overMax = Math.max(overMax, (clock - t) - BUDGET)
        steps++
    }
    const over = Math.max(0, Math.round(overMax / TICK))
    console.log(`  ${name}: zoom ${zoom}, ground level ${job.lv}, ${job.todo.length} tiles, ${steps} steps of ${BUDGET / TICK} samples, worst overrun ${over} samples`)
    check(!m._bgJob && m._bgZoom === zoom, `${name}: the job did not finish and swap`)
    check(over <= UNIT_MAX, `${name}: a step ran ${over} samples past its budget (> ${UNIT_MAX}) — a builder lost a yield`)
}

if (failures) { console.error(`map-bg-slice: ${failures} failure(s)`); process.exit(1) }
console.log('map-bg-slice: PASS')
