/**
 * src/props/prop-palette.js — Bake the small fixed set of prop variant geometries ONCE at load.
 *
 * Per FEAT-06: a few baked geometries per category, instanced thousands of times. Per-instance
 * variety comes from transform + tint (prop-system.js), NOT from unique geometry. This module
 * just produces the variant geometries + their three materials (main, cover, ground).
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
  makeGrassClump, makeRyeClump, makeSageClump, makeGrassLo, makeRyeLo, makeSageLo,
} from './prop-geometry.js'

// FEAT-85: categories rendered through the COVER material (wind sway + distance fade, DoubleSide,
// no collision, no shadow casting, no shadow bake, no billboard). prop-system keys off this set.
// The *Lo cats are the far-ring stand-ins (COVER_FAR_CAT below); never placed by the scatter.
export const COVER_CATS = new Set(['grass', 'rye', 'sage', 'grassLo', 'ryeLo', 'sageLo'])
export const COVER_FAR_CAT = { grass: 'grassLo', rye: 'ryeLo', sage: 'sageLo' }
// Ground litter drawn through the GROUND material: the cover's distance shrink (so a pebble costs
// no fragments past the fade), no wind, single-sided. NOT baked into the shadow atlas (R-16, owner
// 2026-10-15): the rock is gone by 77–133 m but its baked speck lasted to the 380 m shadow fade.
export const FADE_CATS = new Set(['smallRock', 'medRock'])

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

// FEAT-15: fallen log — a kinked trunk tube LAID DOWN. Authored horizontal along +X, resting on
// the y=0 plane (tube axis at y = baseRadius), midpoint at the origin so the instance pivot is
// the log's centre (scatter grounds both ends and pitches the instance about local Z via the
// existing tilt machinery). Collision is a GENERAL capsule (kind 'logCapsule'): prop-system bakes
// world endpoints per instance from length/radius here + the placement transform.
function bakeLogs(P, rng) {
  const out = []
  for (let i = 0; i < P.variants; i++) {
    const t = P.trunk
    const segCount = Math.round(rr(rng, t.segCount))
    const baseRadius = rr(rng, t.baseRadius)
    const trunk = makeKinkedTube({
      segCount, segLen: P.length / segCount,   // FIXED nominal length (see data/flora.js log note)
      baseRadius, taperPow: t.taperPow, topFrac: t.topFrac, bend: t.bend, sides: t.sides,
    }, rng)
    fleckColor(trunk.geo, P.barkColor, P.barkFleck, P.fleckChance, rng)
    const geo = trunk.geo
    geo.rotateZ(-Math.PI / 2)                  // stand → lie: +Y (up the trunk) → +X
    geo.translate(-trunk.topY / 2, baseRadius, 0)   // centre the length; rest the tube on y=0
    out.push({ geo, collision: {
      kind: 'logCapsule',
      radius: baseRadius,          // tube radius (trunkRadiusScale applies live at query time)
      length: trunk.topY,          // actual kinked length (≤ nominal; capsule never outgrows the visual)
      boundR: trunk.topY / 2 + baseRadius,   // grid-insertion bounding radius (half-length + tube)
    } })
  }
  return out
}

// kind: 'sphere' (collidable rock), 'mesh' (boulder — exact triangles, BUG-22c), 'bush' (soft drag),
// 'none' (small / medium rock, decorative).
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
 *            material: THREE.Material, coverMaterial: THREE.Material, groundMaterial: THREE.Material,
 *            coverUniforms: object, params: object }}
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
    log:       bakeLogs(params.log, rng),   // FEAT-15: fallen trunks (hard logCapsule obstacle)
  }
  // FEAT-85: cover clumps draw AFTER every existing category so their bake never shifts the rng
  // draws the older variants are built from (their geometry stays byte-identical).
  const bakeCover = (cfg, fn) => Array.from({ length: cfg.variants }, () => ({ geo: fn(cfg, rng), collision: null }))
  if (params.grass) variants.grass = bakeCover(params.grass, makeGrassClump)
  if (params.rye)   variants.rye   = bakeCover(params.rye, makeRyeClump)
  if (params.sage)  variants.sage  = bakeCover(params.sage, makeSageClump)
  // Later additions draw after the cover for the same reason (medium rocks 2026-09-23, then the
  // far-ring Lo stand-ins — one per full variant so the key swap is index-for-index).
  if (params.medRock) variants.medRock = bakeBlobs(params.medRock, rng, 'none')
  if (params.grass) variants.grassLo = bakeCover(params.grass, makeGrassLo)
  if (params.rye)   variants.ryeLo   = bakeCover(params.rye, makeRyeLo)
  if (params.sage)  variants.sageLo  = bakeCover(params.sage, makeSageLo)
  const material = new THREE.MeshLambertMaterial({ vertexColors: true })
  const { coverMaterial, groundMaterial, coverUniforms } = buildCoverMaterial(params.scatter?.cover)
  return { variants, material, coverMaterial, groundMaterial, coverUniforms, params }
}

/**
 * FEAT-85: the cover material — Lambert like the rest, but DoubleSide (a blade is one strip, seen
 * from both sides) with two vertex-stage effects patched in:
 *   • DISTANCE FADE: each instance shrinks toward its root between uFadeStart and uFadeEnd (view
 *     distance from the instance origin), so the cover thins into the fog with no pop and past
 *     uFadeEnd costs zero fragments. Instances stay resident (the chunk owns them either way).
 *   • WIND: a slow sway of the tips (`aSway` 0 root → 1 tip), phase keyed by world position and
 *     modulated by a gust term, so neighbouring clumps move together but not in lockstep.
 * Uniforms are shared with PropSystem, which advances uTime per frame and writes the fade/wind
 * dials from the params (tier + GUI).
 */
export function buildCoverMaterial(cover = {}) {
  const coverUniforms = {
    uTime:      { value: 0 },
    uWind:      { value: cover.windStrength ?? 1 },
    uFadeStart: { value: cover.fadeStart ?? 60 },
    uFadeEnd:   { value: cover.fadeEnd ?? 95 },
  }
  // The shrink. STAGGERED per instance (owner 2026-09-23: the cover "abruptly stops"): each
  // clump hashes its own start inside the window, so across the band the cover THINS — a few
  // clumps gone at the start, most by the end — instead of every clump shrinking in step, which
  // read as a line. `k` scales the window (ground litter is invisible sooner than a 0.5 m tuft).
  const fadeGLSL = (k) => `
      #ifdef USE_INSTANCING
        vec3 cvOrigin = instanceMatrix[3].xyz;
      #else
        vec3 cvOrigin = vec3(0.0);
      #endif
        float cvJit = fract(sin(dot(cvOrigin.xz, vec2(12.9898, 78.233))) * 43758.5453);
        float cvEnd = uFadeEnd * ${k.toFixed(2)};
        float cvStart = mix(uFadeStart * ${k.toFixed(2)}, cvEnd, cvJit * 0.75);
        float cvFade = 1.0 - smoothstep(cvStart, cvEnd, distance(cvOrigin, cameraPosition));
        transformed *= cvFade;`
  const coverMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
  coverMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, coverUniforms)
    shader.vertexShader = 'uniform float uTime, uWind, uFadeStart, uFadeEnd;\nattribute float aSway;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>` + fadeGLSL(1.0) + `
        float cvPh = uTime * 1.4 + cvOrigin.x * 0.13 + cvOrigin.z * 0.11;
        float cvGust = 0.6 + 0.4 * sin(uTime * 0.37 + cvOrigin.x * 0.02 + cvOrigin.z * 0.017);
        transformed.xz += vec2(sin(cvPh), cos(cvPh * 0.8 + 0.9)) * (0.10 * uWind * cvGust * aSway * cvFade);   // 0.10: doubled, owner 2026-09-22`
    )
  }
  coverMaterial.customProgramCacheKey = () => 'feat85-cover'
  // Ground litter (FADE_CATS): the same shrink at 0.7× the window, no wind, front faces only.
  const groundMaterial = new THREE.MeshLambertMaterial({ vertexColors: true })
  groundMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, coverUniforms)
    shader.vertexShader = 'uniform float uFadeStart, uFadeEnd;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>` + fadeGLSL(0.7))
  }
  groundMaterial.customProgramCacheKey = () => 'feat85-ground'
  return { coverMaterial, groundMaterial, coverUniforms }
}
