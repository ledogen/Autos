/**
 * src/props/prop-palette.js — Bake the small fixed set of prop variant geometries ONCE at load.
 *
 * Per FEAT-06: a few baked geometries per category, instanced thousands of times. Per-instance
 * variety comes from transform + tint (prop-system.js), NOT from unique geometry. This module
 * just produces the variant geometries + the one shared material.
 *
 * Each tree variant is a single merged geometry (trunk bark + canopy colour baked as vertex
 * colours); rocks/bushes are single blobs. The shared MeshLambertMaterial uses vertexColors +
 * per-instance instanceColor (cheap on the iGPU floor — no alpha blend; see FEAT-06 / PERF-05).
 *
 * Pure aside from THREE allocation; deterministic given worldSeed.
 */

import * as THREE from 'three'
import { mulberry32, seedFor } from '../seed.js'
import { FLORA_PARAMS } from '../../data/flora.js'
import {
  makeBlob, makeKinkedTube, makeConeStack, fillColor, fleckColor, assembleTree,
} from './prop-geometry.js'

const rr = (rng, [lo, hi]) => lo + (hi - lo) * rng()

function bakeAspen(P, rng) {
  const out = []
  for (let i = 0; i < P.variants; i++) {
    const t = P.trunk
    const baseRadius = rr(rng, t.baseRadius)
    const trunk = makeKinkedTube({
      segCount: Math.round(rr(rng, t.segCount)), segLen: rr(rng, t.segLen),
      baseRadius, taperPow: t.taperPow, topFrac: t.topFrac, bend: t.bend, sides: t.sides,
    }, rng)
    const c = P.canopy
    const canopy = makeBlob({
      radius: rr(rng, c.radius),
      axisScale: [c.axisScale[0], rr(rng, [c.axisScale[1] * 0.85, c.axisScale[1]]), c.axisScale[2]],
      irregularity: c.irregularity, noiseFreq: c.noiseFreq, subdiv: c.subdiv,
    }, rng)
    // white bark with black flecks (pre-colour the trunk, then assemble with barkHex=null)
    fleckColor(trunk.geo, P.barkColor, P.barkFleck, P.fleckChance, rng)
    // canopy blob centre sits a little above the trunk top
    const geo = assembleTree(trunk, canopy, null, P.canopyColor, -rr(rng, c.radius) * 0.4)
    out.push({ geo, collision: { kind: 'capsule', radius: baseRadius, height: trunk.topY } })
  }
  return out
}

function bakePine(P, rng) {
  const out = []
  for (let i = 0; i < P.variants; i++) {
    const t = P.trunk
    const baseRadius = rr(rng, t.baseRadius)
    const trunk = makeKinkedTube({
      segCount: Math.round(rr(rng, t.segCount)), segLen: rr(rng, t.segLen),
      baseRadius, taperPow: t.taperPow, topFrac: t.topFrac, bend: t.bend, sides: t.sides,
    }, rng)
    const c = P.canopy
    // Stretch the cone stack vertically (c.stretch) without widening it.
    const coneHeight = rr(rng, c.coneHeight) * c.stretch
    const canopy = makeConeStack({
      coneCount: Math.round(rr(rng, c.coneCount)), baseRadius: rr(rng, c.baseRadius),
      coneHeight, overlap: c.overlap, bend: c.bend, sides: c.sides,
    }, rng)
    // Sit the canopy base c.dropFrac of a cone below the trunk tip, and recentre it over the
    // trunk's kinked top node (topX/topZ) so leaning trunks don't look "glued on" off-axis.
    const geo = assembleTree(trunk, canopy, P.barkColor, P.canopyColor,
      coneHeight * c.dropFrac, trunk.topX, trunk.topZ)
    out.push({ geo, collision: { kind: 'capsule', radius: baseRadius, height: trunk.topY } })
  }
  return out
}

// kind: 'sphere' (collidable rock/boulder), 'bush' (soft drag), 'none' (small rock, decorative).
function bakeBlobs(P, rng, kind) {
  const out = []
  for (let i = 0; i < P.variants; i++) {
    const b = P.blob
    const drawnRadius = rr(rng, b.radius)
    const geo = makeBlob({
      radius: drawnRadius,
      axisScale: [b.axisScale[0], b.axisScale[1], b.axisScale[2]],
      irregularity: b.irregularity, noiseFreq: b.noiseFreq, subdiv: b.subdiv,
    }, rng)
    fillColor(geo, P.color)
    let collision = null
    if (kind === 'mesh') {
      // BUG-22c: boulders collide against their ACTUAL visible mesh (few boulders, low-poly → cheap).
      // No sphere proxy can match a lumpy 20 m boulder — the truck either hit "air" (overshoot) or the
      // sphere sat inside the rock. queryProps tests the vehicle probe vs these triangles directly, so
      // collision lands exactly on the surface the player sees. `radius` is the full boundingSphere =
      // broad-phase cull only (never miss an outer lump); the triangle-soup is the narrow phase.
      geo.computeBoundingSphere()
      collision = { kind, radius: geo.boundingSphere.radius, tris: new Float32Array(geo.attributes.position.array) }
    } else if (kind === 'sphere') {
      // BUG-22/22b: collide against the VISIBLE BOUNDARY, derived from the ACTUAL baked mesh. makeBlob
      // displaces vertices symmetrically (r·(1+irregularity·n), n∈[-1,1]), so the MEAN horizontal reach
      // sits at the CENTRE of the lumps — basing the proxy there (× mean axis) put the sphere far INSIDE
      // the rock (truck penetrated the visible surface before contacting), and rockRadiusScale then inset
      // it further. But the theoretical outer surface r·(1+irregularity) OVERSHOOTS the real mesh: value
      // noise on a low-poly icosphere never realises the full ±1 amplitude, so that formula exceeded the
      // actual boundingSphere. So measure the geometry directly: take a high PERCENTILE of the equatorial-
      // band horizontal reach — the flanks the truck actually contacts — which sits AT the visible surface
      // while ignoring the single outermost spike (whose uniform-sphere use was the original overshoot).
      const pos = geo.attributes.position
      let maxAbsY = 0
      for (let v = 0; v < pos.count; v++) { const ay = Math.abs(pos.getY(v)); if (ay > maxAbsY) maxAbsY = ay }
      const flankHr = []
      for (let v = 0; v < pos.count; v++) {
        if (Math.abs(pos.getY(v)) < 0.4 * maxAbsY) flankHr.push(Math.hypot(pos.getX(v), pos.getZ(v)))
      }
      flankHr.sort((p, q) => p - q)
      // 90th-percentile flank reach = out at the visible surface, short only of the lone widest lump.
      // (The live rockRadiusScale 0.92 insets this a touch, landing the effective sphere on the flank —
      // not the mean bulk it sat at before, which read as "collision far inside the rock".)
      const rBulk = flankHr[Math.floor(0.9 * (flankHr.length - 1))]
      collision = { kind, radius: rBulk }
    } else if (kind === 'bush') {
      // Bush soft-drag extent is the full visual reach (unchanged) — it's a gentle field, not a wall.
      collision = { kind, radius: geo.boundingSphere.radius }
    }
    out.push({ geo, collision })
  }
  return out
}

/**
 * Build the full prop palette.
 * @param {number} worldSeed
 * @param {object} [params=FLORA_PARAMS]
 * @returns {{ variants: Record<string, Array<{geo:THREE.BufferGeometry, collision:?object}>>,
 *            material: THREE.Material, params: object }}
 */
export function buildPalette(worldSeed, params = FLORA_PARAMS) {
  const rng = mulberry32(seedFor(worldSeed, params.worldSeedTag + ':palette'))
  const variants = {
    aspen:     bakeAspen(params.aspen, rng),
    pine:      bakePine(params.pine, rng),
    rock:      bakeBlobs(params.rock, rng, 'sphere'),
    boulder:   bakeBlobs(params.boulder, rng, 'mesh'),
    smallRock: bakeBlobs(params.smallRock, rng, 'none'),
    bush:      bakeBlobs(params.bush, rng, 'bush'),
  }
  const material = new THREE.MeshLambertMaterial({ vertexColors: true })
  return { variants, material, params }
}
