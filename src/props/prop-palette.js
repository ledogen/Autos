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
  makeBlob, makeKinkedTube, makeConeStack, fillColor, assembleTree,
} from './prop-geometry.js'

const rr = (rng, [lo, hi]) => lo + (hi - lo) * rng()

function bakeAspen(P, rng) {
  const out = []
  for (let i = 0; i < P.variants; i++) {
    const t = P.trunk
    const trunk = makeKinkedTube({
      segCount: Math.round(rr(rng, t.segCount)), segLen: rr(rng, t.segLen),
      baseRadius: rr(rng, t.baseRadius), taperPow: t.taperPow, topFrac: t.topFrac,
      bend: t.bend, sides: t.sides,
    }, rng)
    const c = P.canopy
    const canopy = makeBlob({
      radius: rr(rng, c.radius),
      axisScale: [c.axisScale[0], rr(rng, [c.axisScale[1] * 0.85, c.axisScale[1]]), c.axisScale[2]],
      irregularity: c.irregularity, noiseFreq: c.noiseFreq, subdiv: c.subdiv,
    }, rng)
    // canopy blob centre sits a little above the trunk top
    out.push(assembleTree(trunk, canopy, P.barkColor, P.canopyColor, -rr(rng, c.radius) * 0.4))
  }
  return out
}

function bakePine(P, rng) {
  const out = []
  for (let i = 0; i < P.variants; i++) {
    const t = P.trunk
    const trunk = makeKinkedTube({
      segCount: Math.round(rr(rng, t.segCount)), segLen: rr(rng, t.segLen),
      baseRadius: rr(rng, t.baseRadius), taperPow: t.taperPow, topFrac: t.topFrac,
      bend: t.bend, sides: t.sides,
    }, rng)
    const c = P.canopy
    const canopy = makeConeStack({
      coneCount: Math.round(rr(rng, c.coneCount)), baseRadius: rr(rng, c.baseRadius),
      coneHeight: rr(rng, c.coneHeight), overlap: c.overlap, bend: c.bend, sides: c.sides,
    }, rng)
    out.push(assembleTree(trunk, canopy, P.barkColor, P.canopyColor, rr(rng, c.coneHeight) * 0.3))
  }
  return out
}

function bakeBlobs(P, rng) {
  const out = []
  for (let i = 0; i < P.variants; i++) {
    const b = P.blob
    const geo = makeBlob({
      radius: rr(rng, b.radius),
      axisScale: [b.axisScale[0], b.axisScale[1], b.axisScale[2]],
      irregularity: b.irregularity, noiseFreq: b.noiseFreq, subdiv: b.subdiv,
    }, rng)
    fillColor(geo, P.color)
    out.push(geo)
  }
  return out
}

/**
 * Build the full prop palette.
 * @param {number} worldSeed
 * @param {object} [params=FLORA_PARAMS]
 * @returns {{ variants: Record<string, THREE.BufferGeometry[]>, material: THREE.Material,
 *            params: object }}
 */
export function buildPalette(worldSeed, params = FLORA_PARAMS) {
  const rng = mulberry32(seedFor(worldSeed, params.worldSeedTag + ':palette'))
  const variants = {
    aspen:     bakeAspen(params.aspen, rng),
    pine:      bakePine(params.pine, rng),
    rock:      bakeBlobs(params.rock, rng),
    boulder:   bakeBlobs(params.boulder, rng),
    smallRock: bakeBlobs(params.smallRock, rng),
    bush:      bakeBlobs(params.bush, rng),
  }
  const material = new THREE.MeshLambertMaterial({ vertexColors: true })
  return { variants, material, params }
}
