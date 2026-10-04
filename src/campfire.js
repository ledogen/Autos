// src/campfire.js — the player's campfire, lit (FEAT-66 `fire` slot + ASSET-24's deferred VFX).
//
// ASSET-24 ships COLD: four flat materials (FireAsh / FireCoal / FireLog / FireStone) and an empty
// node, FireFlameAnchor, at (0, 0.085, 0) model-space. Everything that makes it a fire lives here:
//
//   • FLAMES — a handful of low-poly cones, unlit (MeshBasicMaterial), each breathing and swaying on
//     its own sum-of-sines clock. ART-STYLE.md rules out a soft textured sprite, so the flame is
//     geometry like everything else: faceted, flat colours. The facets read because each triangle
//     gets its own baked brightness (vertex colours), not because anything lights them — a flame is
//     an emitter, so it must not shade with the sun.
//   • COALS — the model's FireCoal material gets a DULL emissive glow that pulses slowly. It also
//     covers the black bed and the charred log tips, so it stays low: it is the bed smouldering.
//     The material is CLONED onto our instance first (model-service.js's trap: clones share
//     materials, so mutating the template's would light every campfire ever spawned).
//   • HOT COALS — a few extra faceted coals, bright orange, dropped into the GAPS of the model's
//     own coal spiral so they read as part of the same bed. Each pulses on its own clock.
//   • EMBERS — one InstancedMesh of tiny octahedra rising out of the fire. One draw call.
//   • LIGHT — one PointLight, warm, flickering in intensity and jittering a few cm in position (the
//     jitter is what makes nearby ground "move" without a shadow map). Scaled by the sky's
//     nightFactor the same way the headlight pools are (vehicle-model.js LIGHT_ENV): faint by day,
//     full at night.
//
// NO SHADOWS FROM THE FIRE, for now (owner, 2026-10-01). A shadow-casting PointLight renders six
// extra shadow passes (a cube map); with no camp props on the pad yet there is nothing near the fire
// for them to show — the truck is parked out of shot. Revisit when FEAT-66 puts the tent/tarp down.
//
// THE LIGHT IS A SHADER-PROGRAM VARIANT. three.js compiles the number of point lights into every lit
// material's shader, so the first frame the fire light is visible would recompile terrain, props,
// road and water mid-game. prewarm() compiles that variant at boot, the same way PERF-21's
// prewarmLightPrograms does for the vehicle lamps. While no camp is up the light is visible=false,
// which removes it from the light loop entirely — zero per-pixel cost when you are not camped.
//
// Render-only module: main.js hands it a pad position and a nightFactor, and nothing in the story
// layer (camp.js stays THREE-free) ever imports it.

import * as THREE from 'three'
import { getModel } from './model-service.js'
import { hash32 } from './seed.js'

/** Tunables — live in the debug panel (addGui). Light units are physical candela, like the lamps. */
export const CAMPFIRE_PARAMS = {
  lightIntensity: 24,      // cd at full night; authored against the ACES scene, same scale as tail lamps
  lightDistance:  22,      // m — cutoff radius of the point light
  lightDecay:     2,       // physical inverse-square
  lightHeight:    0.6,     // m above the flame anchor. Higher than the flames on purpose: inverse-square
                           // blows the nearest stones to white if the light sits inside the fire
  dayScale:       0.1,     // fraction of full intensity in daylight (nightFactor 0)
  flicker:        0.18,    // ± fraction of intensity the flicker swings
  jitterM:        0.04,    // m — light position wobble
  flameHeight:    1.0,     // scale on the flame cones' authored heights
  coalGlow:       0.6,     // emissiveIntensity of the modelled FireCoal bed (dull — see header)
  hotCoalGlow:    2.6,     // emissiveIntensity of the hot coals at their pulse's midpoint
  emberRate:      5,       // embers per second
}

const ANCHOR_DEFAULT = new THREE.Vector3(0, 0.085, 0)   // ASSET-24's FireFlameAnchor, if it's missing
const LIGHT_COLOR  = 0xff8a3a
const COAL_EMISSIVE = 0xff4a12
const EMBER_POOL = 32

// The hot coals, in GLB model space (y up). campfire.py lays its 9 black coals on a golden-angle
// spiral inside r 0.090 — the middle of the bed, which is exactly where the flame cones and the log
// butts stand, so a hot coal placed among them is hidden (the first try was). These ring the OUTER
// band of the black bed instead (r 0.10–0.12, inside bed_r_black 0.126), between the logs and the
// stones, where the camp camera can see them. Seated on the ash mound (0.054 m at r 0.126 rising to
// 0.064 at the centre) with a little over half showing, so they read as IN the bed, not on it.
// Blender (x, y, z-up) → glTF (x, z, −y).
const HOT_COALS = [[0.4, 0.108], [1.7, 0.118], [2.9, 0.102], [4.1, 0.116], [5.3, 0.110]].map(([a, r], k) => {
  const surf = 0.054 + 0.010 * Math.max(0, 1 - r / 0.126)
  const size = 0.028 + 0.010 * (0.5 + 0.5 * Math.sin(a * 1.7))
  return { x: r * Math.cos(a), y: surf + 0.25 * size * 0.62, z: -r * Math.sin(a), size, ph: k * 1.3 }
})

// The flame cones: [x, z, baseRadius, height, colour, phase]. Three orange outer tongues around a
// yellow core, sized to rise through ASSET-24's 0.38 m teepee and lick ~0.15 m out of the top.
// Bases stay inside r ≈ 0.085 so the outer band of the black bed (and the hot coals on it) shows:
// the first cut reached 0.13 m and buried the whole bed under opaque flame.
const FLAMES = [
  [ 0.030,  0.013, 0.055, 0.42, 0xff5a14, 0.0 ],
  [-0.026,  0.023, 0.052, 0.36, 0xff6a1c, 2.1 ],
  [ 0.000, -0.033, 0.049, 0.39, 0xff4e10, 4.3 ],
  [ 0.007,  0.003, 0.040, 0.50, 0xffa630, 1.2 ],
  [-0.010, -0.007, 0.025, 0.33, 0xffe07a, 3.4 ],
]

// A smooth pseudo-noise in [-1, 1]: three incommensurate sines. Cheap, allocation-free, and it never
// repeats visibly over the seconds anyone watches a fire for.
function wobble (t, f, ph) {
  return 0.55 * Math.sin(t * f * 6.2832 + ph)
       + 0.30 * Math.sin(t * f * 11.1 + ph * 1.7)
       + 0.15 * Math.sin(t * f * 19.3 + ph * 2.9)
}

/**
 * One faceted flame cone, base at y=0. Non-indexed so every triangle owns its vertices, then each
 * triangle is tinted by how its normal faces a fixed "key" direction — the facets read on an unlit
 * material, and the flame looks the same at noon and midnight because it is an emitter.
 */
function flameGeometry (r, h, color) {
  const geo = new THREE.ConeGeometry(r, h, 5, 1, true).toNonIndexed()
  geo.translate(0, h / 2, 0)
  geo.computeVertexNormals()
  const base = new THREE.Color(color)
  const key = new THREE.Vector3(0.6, 0.3, 0.75).normalize()
  const pos = geo.attributes.position, nrm = geo.attributes.normal
  const cols = new Float32Array(pos.count * 3)
  const n = new THREE.Vector3(), c = new THREE.Color()
  for (let i = 0; i < pos.count; i += 3) {
    // Face normal = mean of the triangle's three vertex normals (flat already, after toNonIndexed).
    n.set(0, 0, 0)
    for (let k = 0; k < 3; k++) n.x += nrm.getX(i + k), n.y += nrm.getY(i + k), n.z += nrm.getZ(i + k)
    n.normalize()
    const shade = 0.78 + 0.22 * (0.5 + 0.5 * n.dot(key))
    c.copy(base).multiplyScalar(shade)
    for (let k = 0; k < 3; k++) c.toArray(cols, (i + k) * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3))
  geo.deleteAttribute('normal')
  geo.deleteAttribute('uv')
  return geo
}

export class CampfireFx {
  /** @param {THREE.Object3D} parent — the camp group main.js owns */
  constructor (parent) {
    this.root = new THREE.Group()
    this.root.name = 'campfire'
    this.root.visible = false
    parent.add(this.root)

    // The flame rig sits at the anchor; it moves onto the real FireFlameAnchor once the .glb lands.
    this._rig = new THREE.Group()
    this._rig.position.copy(ANCHOR_DEFAULT)
    this.root.add(this._rig)

    // Unlit, unshadowed, NOT tone-mapped: a flame is a light source, so exposure (which the sky
    // drives hard at night) must not wash it out or crush it. Fog still applies — a fire 200 m off
    // in the murk should fade with the world around it.
    const flameMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide })
    this._flames = FLAMES.map(([x, z, r, h, col, ph]) => {
      const m = new THREE.Mesh(flameGeometry(r, h, col), flameMat)
      m.position.set(x, 0, z)
      m.userData.ph = ph
      m.castShadow = false
      this._rig.add(m)
      return m
    })

    this._embers = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false }),
      EMBER_POOL)
    this._embers.frustumCulled = false   // instances move outside the base geometry's bounds
    this._embers.count = 0
    this._rig.add(this._embers)
    this._emb = Array.from({ length: EMBER_POOL }, () => ({ age: 0, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0 }))
    this._embAlive = 0
    this._embCarry = 0

    this.light = new THREE.PointLight(LIGHT_COLOR, 0, CAMPFIRE_PARAMS.lightDistance, CAMPFIRE_PARAMS.lightDecay)
    this.light.castShadow = false
    this.light.visible = false
    this._rig.add(this.light)

    this._coalMats = []
    // Hot coals: one material each so each can pulse on its own phase (5 draws, trivial).
    // flatShading so the facets catch the firelight like the modelled coals beside them.
    const coalGeo = new THREE.IcosahedronGeometry(1, 0)
    this._hotCoals = HOT_COALS.map((c) => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1c0b05, emissive: COAL_EMISSIVE, emissiveIntensity: CAMPFIRE_PARAMS.hotCoalGlow,
        roughness: 0.9, flatShading: true })
      const m = new THREE.Mesh(coalGeo, mat)
      m.position.set(c.x, c.y, c.z)
      m.scale.set(c.size, c.size * 0.62, c.size)    // campfire.py's coal_flatten
      m.rotation.y = c.ph
      m.userData.ph = c.ph
      this.root.add(m)
      return m
    })
    this._t = 0
    this._m4 = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._v = new THREE.Vector3()
    this._s = new THREE.Vector3()

    this._ready = getModel('campfire').then((rec) => {
      const inst = rec.template.clone(true)
      inst.updateMatrixWorld(true)
      inst.traverse((o) => {
        if (o.name === 'FireFlameAnchor') this._rig.position.setFromMatrixPosition(o.matrixWorld)
        if (!o.isMesh) return
        o.castShadow = true
        o.receiveShadow = true
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        const swapped = mats.map((m) => {
          if (!m?.name?.includes('FireCoal')) return m
          const c = m.clone()
          c.emissive = new THREE.Color(COAL_EMISSIVE)
          this._coalMats.push(c)
          return c
        })
        o.material = Array.isArray(o.material) ? swapped : swapped[0]
      })
      this.root.add(inst)
    })
  }

  /**
   * Light the fire at a pad. Yaw is randomised (ASSET-24 is rotationally symmetric — "yaw-randomise
   * on placement") but deterministically, from the pad's position, so the same pad lays the same fire.
   */
  show (x, y, z) {
    this.root.position.set(x, y, z)
    this.root.rotation.y = (hash32(`campfire:${x.toFixed(2)}:${z.toFixed(2)}`) / 4294967296) * Math.PI * 2
    this.root.visible = true
    this.light.visible = true
  }

  /** Put it out. The light leaves the light loop entirely (visible=false), so a cold camp costs nothing. */
  hide () {
    this.root.visible = false
    this.light.visible = false
    this._embAlive = 0
    this._embers.count = 0
  }

  /**
   * Per render frame. No-op when no camp is up.
   * @param {number} dt           seconds
   * @param {number} nightFactor  SkySystem.nightFactor(): 0 day … 1 night
   */
  update (dt, nightFactor) {
    if (!this.root.visible) return
    const P = CAMPFIRE_PARAMS
    const t = (this._t += dt)

    // Flames: breathe in height, pinch in girth as they stretch, lean on two slow axes.
    for (const f of this._flames) {
      const ph = f.userData.ph
      const n = wobble(t, 1.6, ph)
      const sy = P.flameHeight * (1 + 0.24 * n)
      const sxz = 1 - 0.1 * n
      f.scale.set(sxz, sy, sxz)
      f.rotation.set(0.14 * wobble(t, 0.9, ph + 1), t * 0.6 + ph, 0.14 * wobble(t, 0.8, ph + 2))
    }

    // Coals: a slow pulse, so the bed breathes under the flames.
    const pulse = 1 + 0.25 * wobble(t, 0.35, 0.7)
    for (const m of this._coalMats) m.emissiveIntensity = P.coalGlow * pulse
    for (const m of this._hotCoals) {
      m.material.emissiveIntensity = P.hotCoalGlow * (1 + 0.35 * wobble(t, 0.5, m.userData.ph))
    }

    // Light: same day/night response as the lamp pools, plus a fast flicker and a small wander.
    const scale = P.dayScale + (1 - P.dayScale) * nightFactor
    this.light.intensity = P.lightIntensity * scale * (1 + P.flicker * wobble(t, 2.7, 0.3))
    this.light.distance = P.lightDistance
    this.light.decay = P.lightDecay
    this.light.position.set(
      P.jitterM * wobble(t, 1.9, 5.1),
      P.lightHeight + 0.5 * P.jitterM * wobble(t, 2.3, 1.9),
      P.jitterM * wobble(t, 1.7, 3.3))

    this._updateEmbers(dt)
  }

  _updateEmbers (dt) {
    const P = CAMPFIRE_PARAMS
    const pool = this._emb
    // Advance and compact live embers to the front of the pool.
    let live = 0
    for (let i = 0; i < this._embAlive; i++) {
      const e = pool[i]
      e.age += dt
      if (e.age >= e.life) continue
      e.vx += (Math.random() - 0.5) * 0.8 * dt
      e.vz += (Math.random() - 0.5) * 0.8 * dt
      e.vy -= 0.15 * dt                      // they slow as they cool
      e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt
      if (live !== i) { pool[i] = pool[live]; pool[live] = e }
      live++
    }
    // Spawn.
    this._embCarry += P.emberRate * dt
    while (this._embCarry >= 1 && live < pool.length) {
      this._embCarry -= 1
      const e = pool[live++]
      e.age = 0
      e.life = 1.2 + Math.random() * 1.6
      e.x = (Math.random() - 0.5) * 0.12; e.y = 0.15; e.z = (Math.random() - 0.5) * 0.12
      e.vx = (Math.random() - 0.5) * 0.25; e.vy = 0.7 + Math.random() * 0.6; e.vz = (Math.random() - 0.5) * 0.25
      e.s = 0.010 + Math.random() * 0.008
    }
    if (this._embCarry > 1) this._embCarry = 1
    this._embAlive = live
    // Write instance matrices: shrink to nothing over the ember's life.
    for (let i = 0; i < live; i++) {
      const e = pool[i]
      const k = e.s * (1 - e.age / e.life)
      this._v.set(e.x, e.y, e.z)
      this._s.set(k, k, k)
      this._m4.compose(this._v, this._q, this._s)
      this._embers.setMatrixAt(i, this._m4)
    }
    this._embers.count = live
    this._embers.instanceMatrix.needsUpdate = true
  }

  /**
   * Compile the fire-lit shader variant at boot (see header). Waits for the .glb so the coal material
   * is compiled too; restores everything after. Best-effort — a failure just means one hitch later.
   */
  async prewarm (renderer, scene, camera) {
    await this._ready
    const rootVis = this.root.visible, lightVis = this.light.visible
    this.root.visible = true
    this.light.visible = true
    try { await renderer.compileAsync(scene, camera) } catch (_) { /* best-effort */ }
    this.root.visible = rootVis
    this.light.visible = lightVis
  }

  addGui (gui) {
    const f = gui.addFolder('Campfire (FEAT-66)')
    const P = CAMPFIRE_PARAMS
    f.add(P, 'lightIntensity', 0, 200, 1).name('light (cd)')
    f.add(P, 'lightDistance', 2, 60, 1).name('light reach (m)')
    f.add(P, 'lightDecay', 0, 3, 0.1).name('decay')
    f.add(P, 'lightHeight', 0, 1, 0.01).name('light height (m)')
    f.add(P, 'dayScale', 0, 1, 0.01).name('day scale')
    f.add(P, 'flicker', 0, 0.6, 0.01).name('flicker')
    f.add(P, 'jitterM', 0, 0.2, 0.005).name('jitter (m)')
    f.add(P, 'flameHeight', 0.3, 2, 0.05).name('flame height')
    f.add(P, 'coalGlow', 0, 5, 0.1).name('coal bed glow')
    f.add(P, 'hotCoalGlow', 0, 8, 0.1).name('hot coal glow')
    f.add(P, 'emberRate', 0, 30, 1).name('embers /s')
    return f
  }
}
