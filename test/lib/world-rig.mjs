// test/lib/world-rig.mjs — a headless world the real physics drives on (the drive soak, test/drive-soak.mjs).
//
// Built from the real modules, the way test/fingerprint-world.mjs builds its windows — no copies of game logic:
//   • road (the v2 router, synchronous headless), water, POIs, and the analytic terrain with the stream carve wired;
//   • every collider the game mirrors, streamed around the truck as the game streams them:
//       terrain chunk heightfields — the chunk mesh's own Y (TerrainSystem.prototype _buildCarveTable,
//         _buildStreamTable, _composeCarvedY on the chunk PlaneGeometry) into TerrainPhysics.syncChunk;
//       road trimeshes — RoadMeshSystem._buildRoadTile into RoadPhysics (asphalt, pads, bores);
//       props — PropSystem's scatter into PropPhysics;  POI markers + yard solids — PoiPhysics.sync;
//   • the game's contact query (src/world-contacts.js makeQueryContacts), built from these same systems.
// Two small adapters stand where main.js wires its systems: the prop samplers (main.js makePropSamplers, as
// fingerprint-world has them, minus the render-only sun shear) and the stream-carve hook (main.js setWaterCarve: the
// same streamCarveSample over the streams near the point, a fresh box per call instead of its windowed cache).

import * as THREE from 'three'
import { RoadSystem } from '../../src/road.js'
import { RoadMeshSystem } from '../../src/road-mesh.js'
import { TerrainSystem, CHUNK_SIZE, GRID_SAMPLES } from '../../src/terrain.js'
import { WaterSystem } from '../../src/water.js'
import { PoiSystem, POI_PARAMS, satSolid } from '../../src/poi.js'
import { PropSystem } from '../../src/props/prop-system.js'
import { createPhysicsEngine } from '../../src/physics-engine.js'
import { TerrainPhysics, RoadPhysics, PropPhysics, PoiPhysics } from '../../src/terrain-physics.js'
import { createVehicleChassis } from '../../src/physics.js'
import { makeQueryContacts } from '../../src/world-contacts.js'
import { FLORA_PARAMS } from '../../data/flora.js'
import { DEFAULT_VEHICLE_MODEL } from '../../data/vehicle-models.js'
import { makeTerrainHeadless } from './terrain-headless.mjs'

const TER_RING = 1      // chunks of terrain collider around the truck (±1 → a 3×3, 192 m square: the chassis meets nothing farther)
const ROAD_RING = 1     // road tiles likewise
const PROP_RING = 1     // the prop scatter's full ring (the game's near ring; trees past it are billboards)

/**
 * Build the world for `seed` around `center` (a region of `radius` m) and an engine with the truck in it.
 * @returns rig: { P, seed, road, water, terr, pois, props, engine, chassis, ctx, queryContacts, stream(x, z), dispose() }
 */
export async function buildWorld (seed, P, vs, { center = { x: 0, z: 0 }, radius = 1500 } = {}) {
  const { rawHeightWorld } = makeTerrainHeadless(seed, P, null)
  const water = new WaterSystem(seed, P, rawHeightWorld)
  const road = new RoadSystem(seed, P)
  road.setWaterNoGo((x, z) => water.isRoadNoGo(x, z), (a, b, c, d) => {
    const o = []; for (const p of water.pondsNear(a, b, c, d)) o.push(p.floorX, p.floorZ, p.radius + p.skirt); return o
  })
  road.setRadius(radius)
  road.update(new THREE.Vector3(center.x, 0, center.z))

  // The stream-carve hook — main.js setWaterCarve's shape.
  const k = water.k, reach = k.streamWidth * Math.max(k.widthFlatScale ?? 1, 1) + k.streamBankWidth, R = 512
  const waterCarve = {
    streamsNear: (x0, z0, x1, z1) => water.streamsInBBox(x0, z0, x1, z1),
    maxReach: () => reach,
    sampleAt: (x, z, streams, raw) => water.streamCarveSample(x, z, streams ?? water.streamsInBBox(x - R, z - R, x + R, z + R), raw),
  }
  const terr = makeTerrainHeadless(seed, P, road, waterCarve)

  const pois = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terr, getSeed: () => seed, getParams: () => P })
  pois.build(center, radius); pois.buildHouses(center, radius)

  const engine = await createPhysicsEngine()
  const terrainPhysics = new TerrainPhysics(engine, () => road)
  const roadPhysics = new RoadPhysics(engine)
  const propPhysics = new PropPhysics(engine, FLORA_PARAMS)
  const poiPhysics = new PoiPhysics(engine)
  const shown = pois.list().filter(q => !q.hidden)
  poiPhysics.sync([...shown, ...shown.flatMap(q => (q.satellites ?? []).map(satSolid).filter(Boolean))], POI_PARAMS.poiCubeSize)

  // Props: main.js's sampler set.
  const ex = FLORA_PARAMS.scatter.roadExclusion
  const T = { ...terr, _params: P, groundClassify: TerrainSystem.prototype.groundClassify }
  const props = new PropSystem({ scene: new THREE.Scene(), worldSeed: seed, samplers: {
    heightAt: (x, z) => terr.analyticHeight(x, z), normalAt: (x, z) => terr.analyticNormal(x, z),
    roadBlocked: (x, z) => !!road.queryNearest(x, z, ex) || road.poiPadBlocked(x, z, ex),
    roadClear: (x, z, kk) => !road.queryNearest(x, z, kk) && !road.poiPadBlocked(x, z, kk),
    roadDist: (x, z) => { const nr = road.queryNearest(x, z, 25); return nr ? Math.hypot(x - nr.point.x, z - nr.point.z) : Infinity },
    waterAt: (x, z) => water.pondSkirtAt(x, z), streamAt: (x, z) => water.streamChannelAt(x, z),
    waterNear: (a, b, c, d) => water.waterNearBBox(a, b, c, d), roadWalk: (tx, tz, st) => road.walkTileRoads(tx, tz, st),
    groundAt: (x, z) => TerrainSystem.prototype.groundAt.call(T, x, z), groundClassify: (sl, y) => T.groundClassify(sl, y),
    padBlocked: (x, z, kk) => road.poiPadBlocked(x, z, kk) || road.junctionPadBlocked(x, z, kk),
  } })
  props.setPhysicsHook(propPhysics)

  // Road tiles: RoadMeshSystem against a scene that only collects; canvas textures are browser-only.
  const sink = { add () {}, remove () {} }
  const roadMesh = new RoadMeshSystem(sink, road, null, P, seed)
  roadMesh._getTunnelMaterial = roadMesh._getPortalMaterial = () => null
  roadMesh.setPhysicsHook(roadPhysics)

  const chassis = createVehicleChassis(engine, vs, P, { bed: DEFAULT_VEHICLE_MODEL.bed ?? null })
  const ctx = { engine, chassis }

  const queryContacts = makeQueryContacts({
    params: P,
    groundH: (x, z, y, hint) => terr.analyticHeight(x, z, hint !== undefined ? hint : road.carveHint(x, z), y),
    groundN: (x, z, y, hint) => terr.analyticNormal(x, z, hint !== undefined ? hint : road.carveHint(x, z), y),
    hintAt: (x, z) => road.carveHint(x, z),
    props: () => props,
    pois: () => pois,
    tunnelWall: (cx, cy, cz, r) => road.queryTunnelWallContact(cx, cy, cz, r, road.carveHint(cx, cz)),
  })

  // ── Streaming: the colliders within the rings of (x, z), built once each, dropped when left behind ──────────────
  const N = GRID_SAMPLES, S = CHUNK_SIZE, cell = S / (N - 1)
  const TP = TerrainSystem.prototype, self = terr.self
  const chunks = new Set(), tiles = new Set()
  const buildChunk = (cx, cz) => {
    const raw = new Float32Array(N * N)
    for (let zi = 0; zi < N; zi++) for (let xi = 0; xi < N; xi++) raw[zi * N + xi] = terr.rawHeightWorld(cx * S + xi * cell, cz * S + zi * cell)
    const carve = TP._buildCarveTable.call(self, cx, cz, raw), stream = TP._buildStreamTable.call(self, cx, cz, raw)
    const geom = new THREE.PlaneGeometry(S, S, N - 1, N - 1); geom.rotateX(-Math.PI / 2)
    const pos = geom.attributes.position
    for (let i = 0; i < N * N; i++) pos.setY(i, TP._composeCarvedY.call(self, raw[i], carve, stream, i))
    terrainPhysics.syncChunk(`${cx},${cz}`, cx, cz, pos, N, S)
  }
  function stream (x, z) {
    const ccx = Math.floor(x / S), ccz = Math.floor(z / S)
    const want = new Set()
    for (let dx = -TER_RING; dx <= TER_RING; dx++) for (let dz = -TER_RING; dz <= TER_RING; dz++) want.add(`${ccx + dx},${ccz + dz}`)
    for (const key of want) if (!chunks.has(key)) { const [a, b] = key.split(',').map(Number); buildChunk(a, b); chunks.add(key) }
    for (const key of chunks) if (!want.has(key)) { terrainPhysics.disposeChunk(key); chunks.delete(key) }
    const wantT = new Set()
    for (let dx = -ROAD_RING; dx <= ROAD_RING; dx++) for (let dz = -ROAD_RING; dz <= ROAD_RING; dz++) {
      const key = `${ccx + dx},${ccz + dz}`
      if (road._tiles.has(key)) wantT.add(key)
    }
    for (const key of wantT) if (!tiles.has(key)) { const [a, b] = key.split(',').map(Number); roadMesh._buildRoadTile(a, b, key); tiles.add(key) }
    for (const key of tiles) if (!wantT.has(key)) { roadPhysics.disposeTile(key); tiles.delete(key) }
    props.update(x, z, PROP_RING)
    props.drainScatter()
  }

  return { P, seed, center, radius, road, water, terr, pois, props, engine, chassis, ctx, queryContacts, stream, dispose: () => engine.dispose() }
}
