// FEAT-246: the chase boom stops short of terrain and walls, never longer than desired, clear = unchanged.
import { boomFreeFraction } from '../src/camera-boom.js'
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
assert.equal(boomFreeFraction({ x: 0, y: -5, z: 0 }, { x: 0, y: -5, z: 1 }, flat), 0, 'pivot underground: camera at pivot')
console.log('camera-boom: PASS')
