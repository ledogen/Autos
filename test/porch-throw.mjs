// GATE (FEAT-295): a paper thrown from the lane comes to rest ON a route house's porch and scores.
//
// The paper scenario's world (seed 90), built as story entry builds it; the first stop of each house model. The
// physics is the game's: the carved ground (analyticHeight, house pads included) as a heightfield, the house's
// colliders through terrain-physics.js PoiPhysics (main.js _syncPoiPhysics hands it the same record), the paper
// through debris.js + throw.js PaperThrows, launched as main.js _throwRoll does (16 m/s along the aim plus the
// truck's velocity, 1.5 m above the truck's origin, 1.2 m out along the aim). The truck sits in the near lane
// (2.5 m off the centreline) at the stop, parked or rolling at 8 m/s with the aim led back against the roll;
// a fan of pitches 0–30°. Per house:
//   · at least one pitch rests on the porch floor (inside the box's footprint, at its top: the box is solid)
//   · every paper that rests on the porch scores (paper-route.js accuracyScore inside the target radius) and is
//     credited at least "ok" (DEC-416 tiers); the best one is reported
//   · no paper rests inside a house box (MESH == PHYSICS: walls and porch stop it)
// Run: node test/porch-throw.mjs
import fs from 'node:fs'
import * as THREE from 'three'
globalThis.ProgressEvent ??= class extends Event { constructor (t, o = {}) { super(t); Object.assign(this, o) } }
THREE.DefaultLoadingManager.setURLModifier(u => u.startsWith('data:') ? u
  : 'data:application/octet-stream;base64,' + fs.readFileSync(new URL('../' + u, import.meta.url)).toString('base64'))
const _warn = console.warn
console.warn = (...a) => { const m = String(a[0]); if (!m.includes("'newsRoll' GLB load failed") && !m.startsWith('[poi]')) _warn(...a) }
const { RoadSystem } = await import('../src/road.js')
const { RANGER_PARAMS: P } = await import('../data/ranger.js')
const { PROP_MODELS } = await import('../data/prop-models.js')
const { WaterSystem } = await import('../src/water.js')
const { PoiSystem, POI_PARAMS } = await import('../src/poi.js')
const { validateArea, discArea } = await import('../src/world-validate.js')
const { REGION_MARGIN } = await import('../src/mission.js')
const { REGION_RADIUS_M, REGION_WARM_RADIUS_M } = await import('../src/story.js')
const { makeTerrainHeadless } = await import('./lib/terrain-headless.mjs')
const { spawnDecision } = await import('./lib/spawn-decision.mjs')
const { wirePondNoGo } = await import('./lib/pond-no-go.mjs')
const { createPhysicsEngine } = await import('../src/physics-engine.js')
const { PoiPhysics } = await import('../src/terrain-physics.js')
const { DebrisSystem } = await import('../src/debris.js')
const { PaperThrows, launchVelocity, accuracyScore } = await import('../src/throw.js')
const { accuracyTier } = await import('../src/paper-route.js')

let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }
const DT = 1 / 60, R = POI_PARAMS.poiHouseTargetR, SEED = 90

const sp = spawnDecision(SEED, P), C = { x: sp.x, z: sp.z }
const road = new RoadSystem(SEED, P)
wirePondNoGo(road, SEED, P)
road.setRadius(REGION_WARM_RADIUS_M)
road.update(new THREE.Vector3(C.x, 0, C.z))
const rep = validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P)
const terrain = makeTerrainHeadless(SEED, P, road)
const water = new WaterSystem(SEED, P, (x, z) => terrain.rawHeightWorld(x, z))
const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terrain, getSeed: () => SEED, getParams: () => P })
poi.build(C, REGION_RADIUS_M, rep.mainNodes); poi.buildHouses(C, REGION_RADIUS_M, rep.mainNodes)

const picks = [...new Set(poi.routeHouses().map(r => r.key))].map(k => poi.houses().find(h => h.house?.key === k))
ok(picks.length === 3, `seed ${SEED}: a stop with each of the three houses (${picks.map(h => h.house.key).join(', ')})`)

/** Is world (x, z, y) inside box `b` of house `r` (model frame, y from its base)? */
const inBox = (r, b, x, y, z, pad = 0) => {
  const sn = Math.sin(r.modelYaw), cs = Math.cos(r.modelYaw), dx = x - r.modelX, dz = z - r.modelZ
  const lx = dx * cs - dz * sn - b.c[0], lz = dx * sn + dz * cs - b.c[2], ly = y - r.baseY - b.c[1]
  return Math.abs(lx) <= b.s[0] / 2 + pad && Math.abs(lz) <= b.s[2] / 2 + pad && Math.abs(ly) <= b.s[1] / 2 + pad
}

for (const h of picks) {
  const r = h.house, porch = r.collision.boxes[PROP_MODELS[r.key].porch]
  const tx = h.tx, tz = h.tz   // along the road
  // the truck in the near lane at the stop: origin ~0.6 m over the deck
  const lane = { x: h.x - h.nx * (POI_PARAMS.poiHouseLat - 2.5), z: h.z - h.nz * (POI_PARAMS.poiHouseLat - 2.5) }
  const ty = road.sampleRoadTopY(lane.x, lane.z) + 0.6
  console.log(`${h.id}: ${r.key}, porch floor ${(r.floorY - r.baseY).toFixed(2)} m up, target ${(POI_PARAMS.poiHouseLat - 2.5).toFixed(1)} m from the lane`)
  const engine = await createPhysicsEngine()
  // the carved ground round the stop, a 64 m square at 0.5 m
  const N = 129, cell = 0.5, ext = 32, hf = new Float32Array(N * N), ox = h.x - ext, oz = h.z - ext
  for (let zi = 0; zi < N; zi++) for (let xi = 0; xi < N; xi++) hf[zi * N + xi] = terrain.analyticHeight(ox + xi * cell, oz + zi * cell)
  engine.addHeightfield(engine.createBody({ type: 'static', position: { x: ox, y: 0, z: oz } }), hf, N, N, cell, { friction: 0.8 })
  new PoiPhysics(engine).sync([r], POI_PARAMS.poiCubeSize)
  const debris = new DebrisSystem(engine, { add () {}, remove () {} })
  await debris.load('paper')
  const pt = new PaperThrows(debris)
  const rows = []
  for (const u of [0, 8]) for (let pitch = 0; pitch <= 30; pitch += 2.5) {
    // aim at the target across the road, led back against the truck's roll so the paper's own velocity points at it
    const lead = u / 16, k = Math.sqrt(1 - lead * lead), pr = pitch * Math.PI / 180
    const aim = { x: (h.nx * k - tx * lead) * Math.cos(pr), y: Math.sin(pr), z: (h.nz * k - tz * lead) * Math.cos(pr) }
    const p0 = { x: lane.x + aim.x * 1.2, y: ty + 1.5, z: lane.z + aim.z * 1.2 }
    const f = pt.throw(p0, launchVelocity(aim, { x: tx * u, y: 0, z: tz * u }))
    let rest = null
    for (let i = 0; i < 12 / DT && !rest; i++) {
      debris.beforeStep(null, null); engine.step(DT, 4)
      rest = pt.step(DT).find(e => e.type === 'rest' && e.f === f) ?? null
    }
    const d = Math.hypot(rest.x - h.x, rest.z - h.z), q = accuracyScore(d, R)
    const onPorch = inBox(r, porch, rest.x, r.baseY + porch.c[1], rest.z) && Math.abs(rest.y - r.floorY) < 0.2
    const inside = r.collision.boxes.some(b => inBox(r, b, rest.x, rest.y, rest.z, -0.05))
    rows.push({ u, pitch, d, q, onPorch, inside, y: rest.y - r.floorY, tier: q > 0 ? accuracyTier(q, d).word : 'miss' })
  }
  const on = rows.filter(x => x.onPorch)
  console.log('   ' + rows.map(x => `${x.u}m/s ${x.pitch}°: ${x.onPorch ? 'PORCH' : x.d.toFixed(1) + 'm'} ${x.tier} y${x.y.toFixed(2)}`).join(' · '))
  ok(on.length > 0, `${on.length}/${rows.length} throws rest on the porch floor (centre ${on.length ? on.map(x => x.y.toFixed(2)).join('/') : '-'} m over its top)`)
  ok(on.every(x => x.q > 0 && x.tier !== 'bad'), `every paper on the porch scores, at least "ok": ${on.map(x => `${x.tier} ${x.d.toFixed(2)} m`).join(', ')}`)
  ok(rows.every(x => !x.inside), 'no paper rests inside a house box')
  engine.dispose()
}
console.log(fail ? '\nPORCH-THROW: FAIL' : '\nPORCH-THROW: ALL CHECKS PASSED')
process.exit(fail)
