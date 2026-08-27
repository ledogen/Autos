// test/lib/road-battery.mjs — THE BUG-56 ROAD BATTERY: one window list, one builder, shared by
// every gate in the road close-out so their counts are comparable to each other and to the
// measurements recorded in .planning/HANDOFF-2026-08-27-BUG-56-camber.md.
//
// A window is a streamed RoadSystem around a point. Two of them are named reproducers the owner
// drove and photographed; the rest are the crossing-rung battery, kept so a fix that helps one
// fork and hurts five others is visible in the same run.
//
// Consumers: junction-stitch.mjs (deck + ribbon-edge stitching), node-pin.mjs (B2 — legs stay
// welded to their node). Add a window here, not in a gate.

import * as THREE from 'three'
import { RoadSystem } from '../../src/road.js'
import { parseWorldSeed, seedFor } from '../../src/seed.js'

export const WINDOWS = [
  // BUG-56 mark A (owner capture 2026-08-26): g:-3,1,1:-4,2,0 cedes 96 m to g:-3,1,1:-3,3,2 and
  // then packs a 22 m radius, a 34 deg camber swing and a -17 % -> +24 % grade reversal into 45 m.
  { name: 'seed6 fork -3,1,1', seed: '6', cx: -1582, cz: 1333, r: 1400 },
  // BUG-56 mark B (2026-08-27): g:-4,6,0:-4,7,1 cedes 76 m to g:-5,6,1:-4,6,0. Grade is FINE here
  // (peak 15.3 %) and the camber still swings 35 deg in 35 m — the fork defect with its grade
  // component subtracted out, which is what makes it the clean isolate for the B4 camber match.
  // Also carries mark C at (-870, 2468): the run that ends 17.3 m off its own node (B2).
  { name: 'seed6 fork mark-B',  seed: '6', cx: -2507, cz: 4209, r: 1000 },
  { name: 'lone-pine spawn',   seed: 'lone-pine', spawn: true },           // road-smoothness canary
  { name: 'seed6 origin',      seed: '6',  cx: 0, cz: 0, r: 1400 },
  { name: 'seed6 gate window', seed: '6',  cx: 4500, cz: 600, r: 1600 },
  { name: 'seed3 origin',      seed: '3',  cx: 0, cz: 0, r: 1400 },
  { name: 'seed7 origin',      seed: '7',  cx: 0, cz: 0, r: 1400 },
  { name: 'seed20 origin',     seed: '20', cx: 0, cz: 0, r: 1400 },
  { name: 'seed11 origin',     seed: '11', cx: 0, cz: 0, r: 1400 },
]

/**
 * Stream a RoadSystem for one window entry.
 * The `spawn: true` window is built the way road-smoothness builds it (drive-in from the seeded
 * spawn point, not a radius sweep) so the two gates look at the same network there.
 * TRAP: a string seed MUST go through parseWorldSeed — a raw 'lone-pine' builds a garbage world.
 */
export function buildWindow(W, P) {
  const ws = parseWorldSeed(W.seed)
  const road = new RoadSystem(ws, P)
  if (W.spawn) {
    const ss = seedFor(ws, 'spawn')
    const bx = ((ss & 0xFFFF) / 0xFFFF - 0.5) * 200
    const bz = (((ss >>> 16) & 0xFFFF) / 0xFFFF - 0.5) * 200
    road.ensureTile(Math.floor(bx / 64), Math.floor(bz / 64))
    let n = road.queryNearest(bx, bz, 200)
    if (n) {
      road.ensureTile(Math.floor(n.point.x / 64), Math.floor(n.point.z / 64))
      n = road.queryNearest(n.point.x, n.point.z, 100) || n
      road.update(new THREE.Vector3(n.point.x, 0, n.point.z))
    } else road.update(new THREE.Vector3(bx, 0, bz))
  } else {
    road.setRadius(W.r)
    road.update(new THREE.Vector3(W.cx, 0, W.cz))
  }
  return road
}
