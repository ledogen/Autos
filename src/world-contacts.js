// src/world-contacts.js — the contact query stepPhysics is handed: what the wheels and the body touch in the world.
//
// ONE definition, built from the world's systems. main.js builds the game's from its live systems; the headless drive
// soak (test/drive-soak.mjs) builds one from the same systems constructed headless — so the soak drives on exactly the
// surfaces the game does, with no copy of this function to drift (physics-replay.mjs's terrain-only query predates it).
//
// The ground is resolved PER SAMPLE (the caller's groundH / groundN take each sample's own x, z), never once at the
// wheel centre: a centre still off the road would resolve every sample against bare terrain and the tire could not
// feel a road edge until its centre crossed it (owner, 2026-08-22). The query's own height rides along (`y`), so a
// bore span or a bridge answers for the level the wheel is on (FEAT-40).

import * as THREE from 'three'
import { tireContact } from './tire-contact.js'

/**
 * @param {object} w
 *   params            RANGER_PARAMS (wheelFootprint, wheelWidth)
 *   groundH(x, z, y, hint)  the surface height at (x, z) for a query at height y; `hint` is a road resolve to use in
 *                           place of resolving at (x, z) (undefined: resolve it there)
 *   groundN(x, z, y, hint)  its unit normal {x, y, z}
 *   hintAt(x, z)      the road resolve at (x, z) (roadSystem.carveHint), shared by one tire's samples; optional
 *   props()           the PropSystem whose hard props collide (queryProps), or null
 *   pois()            the PoiSystem whose marker cubes are solid (queryContact), or null
 *   tunnelWall(cx, cy, cz, r)   a bore wall hit {normal, depth, contactPoint}, or null
 *   extra(cx, cy, cz, r, hits)  any further contacts appended in place (the lab's ramp, the barrel cube's kick)
 * @returns {(cx, cy, cz, r, footprint?, axle?) => Array<{normal, depth, contactPoint}>}
 */
export function makeQueryContacts (w) {
  let qy = 0, qh   // the query's height, and the road resolve shared by one tire's samples (undefined = resolve per sample)
  const gH = (x, z) => w.groundH(x, z, qy, qh), gN = (x, z) => w.groundN(x, z, qy, qh)
  const tire = {}
  return function queryContacts (cx, cy, cz, r, footprint = false, axle = undefined) {
    const hits = []
    qy = cy

    // FEAT-70: a wheel is solved as the tire CYLINDER it is (src/tire-contact.js) — the surface point closest to the
    // axle across three lines of the tread, depth along the radial line, the normal radial at an edge — so a kerb
    // ahead lifts and slows the wheel continuously and ground BESIDE the tire lifts nothing.
    if (footprint && axle && r > 0 && w.params.wheelFootprint !== false) {
      // PERF-39: ONE road resolve for the whole tire, at its hub. Every tread sample lies within 0.37 m of the hub, deep
      // inside the resolver's ~18 m reach, and the resolve carries the winning run AND its rivals, each sample projected
      // onto them (road.js _sampleCarveWorld) — so the samples' heights are the per-sample resolve's. It was one resolve
      // per sample (57 a tire); carveHint's 5 cm memo only saves that for a parked wheel, never a moving one.
      qh = w.hintAt?.(cx, cz)
      const c = tireContact(gH, gN, cx, cy, cz, r, w.params.wheelWidth, axle, tire)
      qh = undefined
      if (c) hits.push({ normal: new THREE.Vector3(c.nx, c.ny, c.nz), depth: c.depth, contactPoint: new THREE.Vector3(c.px, c.py, c.pz) })
    } else {
      const h = gH(cx, cz), gd = h + r - cy
      if (gd > 0) {
        const n = gN(cx, cz)
        hits.push({ normal: new THREE.Vector3(n.x, n.y, n.z), depth: gd, contactPoint: new THREE.Vector3(cx, h, cz) })
      }
    }

    w.extra?.(cx, cy, cz, r, hits)

    // FEAT-06b: prop hard contacts (trunks = capsule, rocks/boulders = their mesh) from the per-chunk collidable grid
    // — bushes are not here (soft drag, once per step). Same {normal, depth, contactPoint} shape.
    w.props?.()?.queryProps(cx, cy, cz, r, hits)   // appends in place (S-49)

    // FEAT-46: the POI marker cube is SOLID — a marker you drive through reads as scenery.
    const poiHit = w.pois?.()?.queryContact(cx, cy, cz, r)
    if (poiHit) {
      const t = r - poiHit.depth   // query centre back along −normal to the solid's surface
      hits.push({
        normal: new THREE.Vector3(poiHit.nx, poiHit.ny, poiHit.nz),
        depth: poiHit.depth,
        contactPoint: new THREE.Vector3(cx - poiHit.nx * t, cy - poiHit.ny * t, cz - poiHit.nz * t),
      })
    }

    // BUG-37: a bore's curved WALL — the ground above resolves only its floor.
    const wallHit = w.tunnelWall?.(cx, cy, cz, r)
    if (wallHit) hits.push(wallHit)

    return hits
  }
}
