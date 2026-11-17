// FEAT-246: the chase boom stops short of terrain and walls, never longer than desired, clear = unchanged.
import { boomFreeFraction, makeBoomProbe } from '../src/camera-boom.js'
import { createPhysicsEngine, GROUP_STATIC, GROUP_ROAD } from '../src/physics-engine.js'
import { strict as assert } from 'node:assert'
const pivot = { x: 0, y: 2, z: 0 }, want = { x: 0, y: 4, z: 10 }
const flat = () => 0
assert.equal(boomFreeFraction(pivot, want, flat), 1, 'clear boom unchanged')
const ridge = (x, z) => (z > 5 && z < 8 ? 9 : 0)          // a ridge between truck and camera
const t = boomFreeFraction(pivot, want, ridge)
assert(t <= 0.5 && t > 0.3, 'stops at the ridge foot, got ' + t)
const camY = pivot.y + (want.y - pivot.y) * t, camZ = want.z * t
assert(camY >= ridge(0, camZ) + 0.4, 'camera above ground')
assert(boomFreeFraction(pivot, want, flat, 4) < 0.4 && boomFreeFraction(pivot, want, flat, 4) > 0.3, 'wall at 4 m stops short')
assert.equal(boomFreeFraction(pivot, want, flat, 500), 1, 'far wall: never further than desired')
assert.equal(boomFreeFraction(pivot, pivot, flat), 1)
assert.equal(boomFreeFraction({ x: 0, y: -5, z: 0 }, { x: 0, y: -5, z: 1 }, flat), 1, 'pivot under the heightfield (a tunnel): terrain not tested, boom free')
assert(boomFreeFraction({ x: 0, y: -5, z: 0 }, { x: 0, y: -5, z: 10 }, flat, 4) < 0.4, 'pivot in a tunnel: the wall ray still stops it')

// The real probe against road colliders (main.js passes GROUP_STATIC | GROUP_ROAD). A bore along x: a flat deck
// (up-facing, surface only, as RoadPhysics adds ribbons) and a half-tube lining of radius 5 about the deck's centre
// line, both windings (RoadPhysics' shell rule). The analytic surface is the mountain 100 m above (pivot under it).
const eng = await createPhysicsEngine()
const quads = (pts, both) => { const idx = []; for (let i = 0; i < pts.length / 12; i++) { const b = i * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3); if (both) idx.push(b, b + 2, b + 1, b, b + 3, b + 2) } return [new Float32Array(pts), new Uint32Array(idx)] }
const road = (pts, both) => { const b = eng.createBody({ type: 'static' }); const [p, i] = quads(pts, both); eng.addRoadMesh(b, p, i); return b }
const R = 5, X = 60, seg = 16, tube = []
for (let k = 0; k < seg; k++) {
  const a0 = Math.PI * k / seg, a1 = Math.PI * (k + 1) / seg
  const z0 = R * Math.cos(a0), y0 = R * Math.sin(a0), z1 = R * Math.cos(a1), y1 = R * Math.sin(a1)
  tube.push(-X, y0, z0, X, y0, z0, X, y1, z1, -X, y1, z1)
}
road(tube, true)
road([-X, 0, -4, -X, 0, 4, X, 0, 4, X, 0, -4], false)   // the bore floor
const mountain = () => 100
const MASK = GROUP_STATIC | GROUP_ROAD
const inBore = makeBoomProbe(eng, mountain, MASK), staticOnly = makeBoomProbe(eng, mountain, GROUP_STATIC)
const P = { x: 0, y: 0.7, z: 0 }
assert.equal(inBore(P, { x: 6, y: 3.2, z: 0 }), 1, 'straight bore: the boom down the tube is free')
const side = { x: 6, y: 2.5, z: 7 }, up = { x: 3, y: 8, z: 0 }   // a bend (camera outside the wall) and the ceiling
const ts = inBore(P, side), tc = inBore(P, up)
assert.equal(staticOnly(P, side), 1, 'the old static-only ray misses the lining (the bug)')
assert(ts > 0.2 && ts < 0.8, 'bend: the boom stops at the wall, got ' + ts)
const sz = P.z + (side.z - P.z) * ts, sy = P.y + (side.y - P.y) * ts
assert(Math.hypot(sz, sy) < R, 'bend: the camera is inside the lining')
assert(tc > 0.2 && P.y + (up.y - P.y) * tc < R, 'ceiling: the boom stops under the crown, got ' + tc)
// Open road and a crest: the deck under the truck never shortens the boom.
const eng2 = await createPhysicsEngine()
const deck = (pts) => { const b = eng2.createBody({ type: 'static' }); const [p, i] = quads(pts, false); eng2.addRoadMesh(b, p, i) }
deck([-260, 0, -4, -260, 0, 4, -140, 0, 4, -140, 0, -4])   // open road
deck([0, 0, -4, 0, 0, 4, X, -6, 4, X, -6, -4]); deck([-X, -6, -4, -X, -6, 4, 0, 0, 4, 0, 0, -4])                  // a 10 % crest at x 0
const open = makeBoomProbe(eng2, () => 0, MASK), crest = makeBoomProbe(eng2, (x) => -0.1 * Math.abs(x), MASK)
const O = { x: -200, y: 0.7, z: 0 }
assert.equal(open(O, { x: -194, y: 3.2, z: 0 }), 1, 'open road: unchanged')
assert.equal(open(O, { x: -194, y: 0.5, z: 1 }), 1, 'open road, camera lower than the pivot: unchanged')
assert.equal(crest(P, { x: 6, y: 2.6, z: 0 }), 1, 'crest: unchanged')
assert.equal(crest(P, { x: -6, y: 2.6, z: 0.5 }), 1, 'crest, other way: unchanged')
console.log('camera-boom: PASS')
