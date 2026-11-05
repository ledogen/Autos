// BUG-111: the game's pond no-go for a headless RoadSystem. main.js wires setWaterNoGo before the first stream, so
// the game's roads route round the ponds; a gate that builds its network without it measures other roads near a
// pond (BUG-110: seed 4194356868's spawn replica landed on a road 325 m from the game's). Call it right after
// `new RoadSystem`, before the first update. Returns the WaterSystem (raw heights: the same water the game has).
import { WaterSystem } from '../../src/water.js'
import { makeTerrainHeadless } from './terrain-headless.mjs'

export function wirePondNoGo (road, seed, params) {
    const water = new WaterSystem(seed, params, makeTerrainHeadless(seed, params, null).rawHeightWorld)
    road.setWaterNoGo((x, z) => water.isRoadNoGo(x, z), (x0, z0, x1, z1) => {
        const d = []
        for (const p of water.pondsNear(x0, z0, x1, z1)) d.push(p.floorX, p.floorZ, p.radius + p.skirt)
        return d
    })
    return water
}
