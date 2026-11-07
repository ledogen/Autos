// CENSUS (not a gate): node test/poi-pad-census.mjs --seed=<s>   → one JSON line on stdout
//
// Does every roster slot get its OWN pad kind, and how much room is left? For one seed it builds the
// story region exactly as main.js does (spawnDecision → validateArea → PoiSystem.build over mainNodes,
// region-pieces.mjs's build) and reports, per roster slot: placed on its own pad kind, fell back to a
// lay-by, and not placed. Per pad kind: usable pads (pool minus BUG-128's off-wall pads), needed (the
// roster's counts), and LEFT after the roster took its picks and every pad clashing with one.
//
// Fan it out over seeds with xargs, e.g.:
//   node -e 'for(let i=0;i<100;i++)console.log(Math.random()*2**32>>>0)' > seeds.txt
//   xargs -P 4 -I{} node test/poi-pad-census.mjs --seed={} < seeds.txt > census.jsonl
// Heavy: routes a full region per seed (~20 s).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { PROP_MODELS } from '../data/prop-models.js'
import { parseWorldSeed } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem, POI_ROSTER, POI_PARAMS } from '../src/poi.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

const s = (process.argv.find((a) => a.startsWith('--seed=')) || '').split('=')[1]
if (!s) { console.error('usage: --seed=<s>'); process.exit(2) }
const seed = parseWorldSeed(s)
const PP = { ...POI_PARAMS, ...P }
const kindOf = (slot) => (slot.model && PROP_MODELS[slot.model]?.pad) || 'std'
const multi = new Set(POI_ROSTER.filter((a, i) => POI_ROSTER.findIndex((b) => b.type === a.type) !== i).map((a) => a.type))
const label = (slot) => multi.has(slot.type) ? `${slot.type}/${slot.model ?? slot.modelPool}` : slot.type

// The roster's own inputs, caught on the way in: the pool and BUG-128's off-wall set.
let offWall = null
const assign = PoiSystem.prototype._assignRoster
PoiSystem.prototype._assignRoster = function (pool, center, sd, Pr, camp, ow) { offWall = ow; return assign.apply(this, arguments) }

const sp = spawnDecision(seed, P)
const C = { x: sp.x, z: sp.z }
const road = new RoadSystem(seed, P)
wirePondNoGo(road, seed, P)
road.setRadius(REGION_WARM_RADIUS_M)
road.update(new THREE.Vector3(C.x, 0, C.z))
const rep = validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P)
const terrain = makeTerrainHeadless(seed, P, road)
const water = new WaterSystem(seed, P, (x, z) => terrain.rawHeightWorld(x, z))
const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terrain,
                            getSeed: () => seed, getParams: () => P })
const out = poi.build(C, REGION_RADIUS_M, rep.mainNodes)

// Attribute each placed POI to its slot: by type, and for a type with two slots by the model it wears
// (the farm's barn slot wears barn or its fallback barnBroadside).
const slots = POI_ROSTER.map((slot) => ({ slot, label: label(slot), kind: kindOf(slot), own: 0, fallback: 0 }))
for (const q of out) {
    if (q.type === 'expeditionCamp') continue
    const cand = slots.filter((r) => r.slot.type === q.type)
    const r = cand.length === 1 ? cand[0]
        : cand.find((r) => r.slot.model === q.modelKey || r.slot.fallbackModel === q.modelKey)
    if ((q.padKind ?? 'std') === r.kind) r.own++; else r.fallback++
}
const usable = poi.pool().filter((q) => !offWall?.has(q))
const kinds = {}
for (const k of new Set(slots.map((r) => r.kind))) {
    const mine = usable.filter((q) => (q.padKind ?? 'std') === k)
    kinds[k] = {
        usable: mine.length,
        needed: slots.filter((r) => r.kind === k).reduce((n, r) => n + r.slot.count, 0),
        left: mine.filter((q) => !out.includes(q) && !out.some((o) => o.edge === q.edge && Math.abs(o.s - q.s) < PP.poiPadSpacing)).length,
    }
}
console.log(JSON.stringify({
    seed: s, playable: rep.playable, stranded: rep.stranded.length, camp: out.some((q) => q.type === 'expeditionCamp'),
    cubes: out.filter((q) => !q.modelKey).map((q) => q.type),
    slots: slots.map((r) => ({ slot: r.label, kind: r.kind, count: r.slot.count, own: r.own, fallback: r.fallback,
                               missing: r.slot.count - r.own - r.fallback })),
    kinds,
}))
