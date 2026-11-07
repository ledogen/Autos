// One seed's story region, built the way main.js builds it (spawnDecision → validateArea → PoiSystem.build
// over mainNodes, region-pieces.mjs's build), with its POI PAD HEADROOM: per roster slot, placed on its own
// pad kind / fell back to a lay-by / not placed; per pad kind, usable pads (the pool minus BUG-128's off-wall
// pads), needed (the roster's counts) and LEFT once the roster took its picks and every pad clashing with one.
// Shared by test/poi-pad-census.mjs (the census) and test/poi-headroom.mjs (the gate). Routes a full region:
// ~35 s of CPU a seed.
import * as THREE from 'three'
import { RoadSystem } from '../../src/road.js'
import { RANGER_PARAMS as P } from '../../data/ranger.js'
import { PROP_MODELS } from '../../data/prop-models.js'
import { parseWorldSeed } from '../../src/seed.js'
import { WaterSystem } from '../../src/water.js'
import { PoiSystem, POI_ROSTER, POI_PARAMS } from '../../src/poi.js'
import { validateArea, discArea } from '../../src/world-validate.js'
import { REGION_MARGIN } from '../../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../../src/story.js'
import { makeTerrainHeadless } from './terrain-headless.mjs'
import { spawnDecision } from './spawn-decision.mjs'
import { wirePondNoGo } from './pond-no-go.mjs'

const PP = { ...POI_PARAMS, ...P }
const kindOf = (slot) => (slot.model && PROP_MODELS[slot.model]?.pad) || 'std'
const multi = new Set(POI_ROSTER.filter((a, i) => POI_ROSTER.findIndex((b) => b.type === a.type) !== i).map((a) => a.type))
const label = (slot) => multi.has(slot.type) ? `${slot.type}/${slot.model ?? slot.modelPool}` : slot.type

export function buildStoryRegion (s) {
    const seed = parseWorldSeed(s)
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
    // BUG-128's off-wall set is local to build(): catch it on its way into the roster (an instance
    // property shadowing the method, so nothing outside this one system sees the wrap).
    let offWall = null
    const assign = poi._assignRoster
    poi._assignRoster = function (...a) { offWall = a[5]; return assign.apply(this, a) }
    const out = poi.build(C, REGION_RADIUS_M, rep.mainNodes)
    return { seed: s, C, rep, poi, out, ...padHeadroom(poi, out, offWall) }
}

function padHeadroom (poi, out, offWall) {
    // Attribute each placed POI to its slot: by type, and for a type with two slots by the model it wears
    // (the farm's barn slot wears barn or its fallback barnBroadside).
    const slots = POI_ROSTER.map((slot) => ({ slot: label(slot), kind: kindOf(slot), count: slot.count, own: 0, fallback: 0,
                                              model: slot.model, fallbackModel: slot.fallbackModel, type: slot.type }))
    for (const q of out) {
        if (q.type === 'expeditionCamp') continue
        const cand = slots.filter((r) => r.type === q.type)
        const r = cand.length === 1 ? cand[0] : cand.find((r) => r.model === q.modelKey || r.fallbackModel === q.modelKey)
        if ((q.padKind ?? 'std') === r.kind) r.own++; else r.fallback++
    }
    const usable = poi.pool().filter((q) => !offWall?.has(q))
    const kinds = {}
    for (const k of new Set(slots.map((r) => r.kind))) {
        const mine = usable.filter((q) => (q.padKind ?? 'std') === k)
        kinds[k] = {
            usable: mine.length,
            needed: slots.filter((r) => r.kind === k).reduce((n, r) => n + r.count, 0),
            left: mine.filter((q) => !out.includes(q) && !out.some((o) => o.edge === q.edge && Math.abs(o.s - q.s) < PP.poiPadSpacing)).length,
        }
    }
    return {
        slots: slots.map(({ slot, kind, count, own, fallback }) => ({ slot, kind, count, own, fallback, missing: count - own - fallback })),
        kinds,
    }
}
