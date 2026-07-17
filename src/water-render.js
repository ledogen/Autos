/**
 * src/water-render.js — procedural water surfaces for FEAT-17 ponds + FEAT-18 streams.
 *
 * STATUS: wired into main.js (constructed at boot, added to the scene, sync()'d every frame).
 * Render is deliberately DECOUPLED from detection: src/water.js stays a THREE-free,
 * headless-testable leaf; this module turns its pure pond/stream records into meshes.
 *
 * Design (locked scope, ponds/streams tickets): SIMPLE procedural water, no assets.
 *   - Pond: a flat clipped plane at the pond's waterLevel. The shoreline "clip" is free —
 *     terrain rises above waterLevel toward the rim and occludes the disc via the depth
 *     buffer, so a flat disc of radius = pond.radius shows water only where terrain is
 *     below it. No shader clip needed for v1.
 *   - Stream: a thin ribbon strip following the centerline at bed+waterDepth (DESCENDING,
 *     not a flat plane), width = 2·streamWidth.
 *
 * A single shared, lightly-tinted transparent material is enough for the first cut; a
 * scrolling normal/flow map + sky (src/sky.js) tie-in is a later polish pass.
 */

import * as THREE from 'three'
import { makeCobbleTextures } from './stone-texture.js'   // FEAT-25: procedural riverbed cobble

// Simple shared water material (transparency + tint). depthWrite off so overlapping water
// surfaces don't z-fight; terrain (opaque, drawn first) still occludes submerged areas.
export function makeWaterMaterial(opts = {}) {
    return new THREE.MeshStandardMaterial({
        color:       opts.color ?? 0x2f6d8c,
        transparent: true,
        opacity:     opts.opacity ?? 0.72,
        roughness:   opts.roughness ?? 0.15,
        metalness:   opts.metalness ?? 0.0,
        depthWrite:  false,
        side:        THREE.DoubleSide,
    })
}

// ── Pond disc at waterLevel ───────────────────────────────────────────────────────────────
// CircleGeometry in XZ (rotated from its default XY), centered on the basin floor.
export function buildPondMesh(pond, material, segments = 48) {
    const geom = new THREE.CircleGeometry(pond.radius, segments)
    geom.rotateX(-Math.PI / 2)                                   // XY disc → XZ plane
    const mesh = new THREE.Mesh(geom, material)
    mesh.position.set(pond.floorX, pond.waterLevel, pond.floorZ)
    mesh.renderOrder = 1                                         // draw after terrain
    mesh.userData.water = { kind: 'pond', key: pond.key }
    return mesh
}

// ── Shared span/classification machinery (FEAT-25: water ribbon + bed ribbon share this) ─────
// Groups a stream's centerline into the contiguous index spans that should actually be drawn,
// applying the BUG-32 window clip and BUG-33 road/pad suppression. Extracted so the water
// surface ribbon and the cobble BED ribbon key off the IDENTICAL spans — the bed can never
// paint where the water was suppressed (over a road deck / lifted pad), and neither can drift
// from the other. Returns an array of [i0,i1] spans, or null if nothing is drawable.
//
// `surfaceLift` is passed relative to the centerline terrain y (waterDepth − depth): BOTH
// ribbons pass the WATER-surface lift so the suppression decision is made against where the
// water would actually stand (the bed ribbon is drawn lower but suppressed on the same rule).
//
// BUG-32: an optional bbox CLIPS the ribbon to the render window — a stream can run 1.4 km
// while the terrain ring shows ~200 m, and unclipped ribbons hang in the void. Points are
// grouped into contiguous in-window spans (one strip each, one point of overhang per end so
// the cut edge sits past the window, under fog); indices never bridge span gaps.
//
// BUG-33: two optional samplers suppress ribbon spans that would paint the road blue:
//  - roadBlendAt(x, z): the road-carve blend. Where a road core covers a probe (blend > 0.5)
//    and the water level is not clearly BELOW the deck surface, the span is suppressed —
//    the deck fills the channel, so real water could not stand there at all. Water clearly
//    below the deck keeps rendering (the opaque deck occludes it via the depth buffer).
//  - groundAt(x, z): the COMPOSED driving surface. Backstop for surfaces the road blend
//    doesn't cover (junction pads): in an honest channel the water sits exactly waterDepth
//    above the carved bed, so waterY > ground + waterDepth + slack means SOMETHING was
//    pulled up through the channel.
export function computeStreamSpans(stream, surfaceLift, bbox, groundAt, roadBlendAt) {
    const pts = stream.points
    if (pts.length < 2) return null

    const spans = []
    if (!bbox && !groundAt && !roadBlendAt) {
        spans.push([0, pts.length - 1])
        return spans
    }
    const pad = (stream.maxWidth ?? stream.width)
    const STAND_SLACK = 0.25   // m — composition tolerance above the honest waterDepth stand
    const ACTIVE = 0, OUT_WINDOW = 1, OVER_ROAD = 2
    const classify = (p, i) => {
        if (bbox && (p.x < bbox.minX - pad || p.x > bbox.maxX + pad ||
                     p.z < bbox.minZ - pad || p.z > bbox.maxZ + pad)) return OUT_WINDOW
        if (groundAt || roadBlendAt) {
            const waterY = p.y + surfaceLift
            const ceiling = stream.waterDepth + STAND_SLACK
            // Probe the centerline and BOTH ribbon edges — a road grazing one side of
            // the channel lifts the ground under that edge while the centerline still
            // reads the honest bed. Edge probes at the FULL half-width: the road rule
            // below is immune to bank grazing (banks have no road blend), and the
            // ceiling rule needs the true edge to catch decks clipping the ribbon rim.
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
            let tx = b.x - a.x, tz = b.z - a.z
            const tl = Math.hypot(tx, tz) || 1
            const nx = -tz / tl, nz = tx / tl
            const half = p.w ?? stream.width
            for (let e = -1; e <= 1; e++) {
                const px = p.x + nx * half * e, pz = p.z + nz * half * e
                // Road rule: a road core under the probe, with water NOT clearly below
                // the deck → the deck fills the channel; water cannot stand there.
                if (roadBlendAt && roadBlendAt(px, pz) > 0.5 &&
                    (!groundAt || waterY > groundAt(px, pz) - 0.1)) return OVER_ROAD
                // Pad backstop: water standing impossibly above the composed ground.
                // Skipped at the exact edges when the bend swings the perpendicular
                // into the rising bank (ground > bed is honest there): only fire when
                // the probe ground is BELOW the water minus the honest stand — i.e.,
                // something flat was pulled up under standing water.
                if (groundAt && waterY > groundAt(px, pz) + ceiling &&
                    (e === 0 || waterY > groundAt(px, pz) + ceiling + 0.5)) return OVER_ROAD
            }
        }
        return ACTIVE
    }
    const cls = new Array(pts.length)
    for (let i = 0; i < pts.length; i++) cls[i] = classify(pts[i], i)
    // Spans of ACTIVE points. A span end extends one point of overhang ONLY into an
    // OUT_WINDOW neighbour (the cut hides past the window, under fog) — never into an
    // OVER_ROAD one (that would put the cut edge back on the visible road surface).
    let start = -1
    for (let i = 0; i <= pts.length; i++) {
        const c = i < pts.length ? cls[i] : OUT_WINDOW
        if (c === ACTIVE) { if (start < 0) start = i }
        else if (start >= 0) {
            const s0 = (start > 0 && cls[start - 1] === OUT_WINDOW) ? start - 1 : start
            const s1 = (i < pts.length && c === OUT_WINDOW) ? i : i - 1
            if (s1 > s0) spans.push([s0, s1])
            start = -1
        }
    }
    return spans.length === 0 ? null : spans
}

// ── Stream ribbon following the descending centerline ──────────────────────────────────────
// Builds a triangle strip: at each centerline point, offset ± streamWidth perpendicular to
// the local tangent (XZ), at y = centerlineY − depth + waterDepth (the water surface, which
// sits above the carved bed and descends with the channel). Span clipping + road/pad
// suppression are delegated to computeStreamSpans (BUG-32 / BUG-33 above).
export function buildStreamMesh(stream, material, bbox, groundAt, roadBlendAt) {
    const pts = stream.points
    if (pts.length < 2) return null
    const surfaceLift = stream.waterDepth - stream.depth   // relative to centerline terrain y

    const spans = computeStreamSpans(stream, surfaceLift, bbox, groundAt, roadBlendAt)
    if (!spans) return null

    let nPts = 0
    for (const [a, b] of spans) nPts += b - a + 1
    const positions = new Float32Array(nPts * 2 * 3)
    const indices = []
    let row = 0

    for (const [i0, i1] of spans) {
        const rowStart = row
        for (let i = i0; i <= i1; i++, row++) {
            const p = pts[i]
            const half = p.w ?? stream.width               // FEAT-24: per-point channel half-width
            // Tangent from neighbours (central where possible).
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
            let tx = b.x - a.x, tz = b.z - a.z
            const tl = Math.hypot(tx, tz) || 1
            tx /= tl; tz /= tl
            const nx = -tz, nz = tx                        // left-perpendicular in XZ
            const y = p.y + surfaceLift
            const o = row * 6
            positions[o + 0] = p.x + nx * half; positions[o + 1] = y; positions[o + 2] = p.z + nz * half
            positions[o + 3] = p.x - nx * half; positions[o + 4] = y; positions[o + 5] = p.z - nz * half
        }
        for (let r = rowStart; r < row - 1; r++) {
            const l0 = r * 2, r0 = r * 2 + 1, l1 = (r + 1) * 2, r1 = (r + 1) * 2 + 1
            indices.push(l0, r0, l1,  r0, r1, l1)
        }
    }

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geom.setIndex(indices)
    geom.computeVertexNormals()
    const mesh = new THREE.Mesh(geom, material)
    mesh.renderOrder = 1
    mesh.userData.water = { kind: 'stream', key: stream.key }
    return mesh
}

// ── FEAT-25: cobbled riverbed ribbon DRAPED over the carved channel ──────────────────────────
// Same span machinery as buildStreamMesh, but the geometry hugs the composed terrain instead of
// floating at a flat bed plane. The first cut (flat strip at bedY + 6 cm, +1 m margin) was
// invisible in-game: everything inside the channel sits under the 0.72-opacity water, and the
// flat margins were BURIED inside the rising bank ramps — so no dry cobble ever showed
// (FEAT-25 reopen, 2026-07-08). Instead:
//   - 5 columns per row at cross-offsets {0, ±w, ±(w + margin)} — matching the carve's
//     piecewise-linear cross-section (flat bed to ±w, bank ramp beyond) so the drape never
//     chords across a kink.
//   - y = groundAt(x,z) + 0.06 : 6 cm above the COMPOSED terrain (analyticHeight includes the
//     stream carve), so the margins climb the bank toe and read as dry cobble shoulders above
//     the waterline — the visible part of the riverbed. Falls back to the flat bed plane when
//     no groundAt sampler is injected (headless fixtures).
//   - margin = bankWidth/2 : the lower half of each bank ramp gets cobbled.
//   - UVs : u = 0..1 across the strip, v = arcS / 12 → one cobble repeat per ~12 m of stream.
// It reuses computeStreamSpans with the WATER-surface lift (waterDepth − depth) so the bed is
// suppressed on the IDENTICAL spans as the water — never visible over a road deck or lifted pad.
export function buildStreamBedMesh(stream, material, bbox, groundAt, roadBlendAt) {
    const pts = stream.points
    if (pts.length < 2) return null
    const surfaceLift = stream.waterDepth - stream.depth   // WATER-surface lift → same spans as water

    const spans = computeStreamSpans(stream, surfaceLift, bbox, groundAt, roadBlendAt)
    if (!spans) return null

    const margin = (stream.bankWidth ?? 5) * 0.5
    const COLS = 5
    let nPts = 0
    for (const [a, b] of spans) nPts += b - a + 1
    const positions = new Float32Array(nPts * COLS * 3)
    const uvs = new Float32Array(nPts * COLS * 2)
    const indices = []
    let row = 0

    for (const [i0, i1] of spans) {
        const rowStart = row
        for (let i = i0; i <= i1; i++, row++) {
            const p = pts[i]
            const w = p.w ?? stream.width
            const half = w + margin
            // Tangent from neighbours (central where possible).
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
            let tx = b.x - a.x, tz = b.z - a.z
            const tl = Math.hypot(tx, tz) || 1
            tx /= tl; tz /= tl
            const nx = -tz, nz = tx                         // left-perpendicular in XZ
            const bedFallbackY = p.y - stream.depth + 0.06  // flat bed plane (no-sampler fixtures)
            const v = p.s / 12                              // one cobble repeat per ~12 m of arc
            for (let c = 0; c < COLS; c++) {
                const off = [half, w, 0, -w, -half][c]      // kink-aligned cross offsets, left → right
                const px = p.x + nx * off, pz = p.z + nz * off
                const y = groundAt ? groundAt(px, pz) + 0.06 : bedFallbackY
                const o = (row * COLS + c) * 3
                positions[o + 0] = px; positions[o + 1] = y; positions[o + 2] = pz
                const u = (row * COLS + c) * 2
                uvs[u + 0] = (off + half) / (2 * half); uvs[u + 1] = v
            }
        }
        for (let r = rowStart; r < row - 1; r++) {
            for (let c = 0; c < COLS - 1; c++) {
                const l0 = r * COLS + c, r0 = l0 + 1, l1 = (r + 1) * COLS + c, r1 = l1 + 1
                indices.push(l0, r0, l1,  r0, r1, l1)
            }
        }
    }

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geom.setIndex(indices)
    geom.computeVertexNormals()
    const mesh = new THREE.Mesh(geom, material)
    mesh.renderOrder = 0                                    // before water (renderOrder 1), after terrain
    mesh.userData.water = { kind: 'bed', key: stream.key + '|bed' }
    return mesh
}

/**
 * WaterRenderer — owns a THREE.Group of pond + stream meshes and rebuilds them for the
 * streamed region. Rebuild is keyed so unchanged features are reused across updates
 * (window-invariant records → stable keys → no per-frame churn).
 */
export class WaterRenderer {
    constructor(water, opts = {}) {
        this.water = water
        this.group = new THREE.Group()
        this.group.name = 'water'
        this.material = makeWaterMaterial(opts.material || {})
        // FEAT-25: one shared cobble bed material for ALL stream bed ribbons (opaque, textured).
        // Textures are procedural (no assets) and generated once here. roughness high / metalness 0
        // so wet river rock reads matte under the directional sun. depthWrite defaults on (opaque)
        // so the bed occludes the terrain floor and the transparent water draws over it.
        this._bedTex = makeCobbleTextures()
        this.bedMaterial = new THREE.MeshStandardMaterial({
            map: this._bedTex.map, normalMap: this._bedTex.normalMap,
            roughness: 0.95, metalness: 0.0,
        })
        this._meshes = new Map()   // feature key -> mesh (dedup / reuse); bed ribbons keyed "<key>|bed"
        this._winKey = ''          // BUG-32: chunk-quantized clip window of the current stream meshes
        this._contentGen = -1      // PERF-19.1: water content-generation stamp at the last sync
        this._groundAt = opts.groundAt ?? null         // BUG-33: composed driving-surface sampler
        this._roadBlendAt = opts.roadBlendAt ?? null   // BUG-33: road-carve blend sampler
    }

    // Ensure meshes exist for every pond/stream overlapping the bbox; drop meshes whose
    // feature left the region. Cheap because feature keys are deterministic + stable.
    // BUG-32: stream ribbons are CLIPPED to the bbox, so their geometry depends on the
    // window — quantizing the window to the 64 m chunk grid keys the rebuild to chunk
    // crossings (a still camera re-syncs for free; driving rebuilds a handful of small
    // strips per crossing, same cadence as terrain chunk streaming). Ponds are compact
    // discs — built whole, reused across windows.
    sync(minX, minZ, maxX, maxZ) {
        const winKey = `${Math.floor(minX / 64)},${Math.floor(minZ / 64)},${Math.floor(maxX / 64)},${Math.floor(maxZ / 64)}`
        // PERF-19.1: early-out when neither the quantized window nor the water system's
        // discovered content changed since the last sync — the pond/stream enumeration and
        // mesh reconciliation below would reproduce exactly the meshes already present.
        const contentGen = this.water.contentGeneration()
        if (winKey === this._winKey && contentGen === this._contentGen) return
        this._contentGen = contentGen
        if (winKey !== this._winKey) {
            this._winKey = winKey
            for (const [key, mesh] of this._meshes) {
                // BUG-32: both the water ribbon ('stream') and the FEAT-25 cobble bed ('bed') are
                // window-CLIPPED, so both rebuild on a window-key change. Ponds are window-invariant.
                const kind = mesh.userData.water.kind
                if (kind === 'stream' || kind === 'bed') {
                    this.group.remove(mesh); mesh.geometry.dispose(); this._meshes.delete(key)
                }
            }
        }
        const wanted = new Set()
        for (const pond of this.water.pondsInBBox(minX, minZ, maxX, maxZ)) {
            wanted.add(pond.key)
            if (!this._meshes.has(pond.key)) {
                const m = buildPondMesh(pond, this.material)
                this._meshes.set(pond.key, m); this.group.add(m)
            }
        }
        const bbox = { minX, minZ, maxX, maxZ }
        for (const st of this.water.streamsInBBox(minX, minZ, maxX, maxZ)) {
            wanted.add(st.key)
            if (!this._meshes.has(st.key)) {
                const m = buildStreamMesh(st, this.material, bbox, this._groundAt, this._roadBlendAt)
                if (m) { this._meshes.set(st.key, m); this.group.add(m) }
            }
            // FEAT-25: matching cobble bed ribbon, keyed separately so it shares the _meshes
            // dispose/reuse lifecycle. Same spans as the water → never shows where water is suppressed.
            const bedKey = st.key + '|bed'
            wanted.add(bedKey)
            if (!this._meshes.has(bedKey)) {
                const bm = buildStreamBedMesh(st, this.bedMaterial, bbox, this._groundAt, this._roadBlendAt)
                if (bm) { this._meshes.set(bedKey, bm); this.group.add(bm) }
            }
        }
        for (const [key, mesh] of this._meshes) {
            if (!wanted.has(key)) {
                this.group.remove(mesh); mesh.geometry.dispose(); this._meshes.delete(key)
            }
        }
    }

    dispose() {
        for (const mesh of this._meshes.values()) { this.group.remove(mesh); mesh.geometry.dispose() }
        this._meshes.clear(); this.material.dispose()
        // FEAT-25: release the shared bed material + its procedural textures.
        this.bedMaterial.dispose()
        this._bedTex.map.dispose(); this._bedTex.normalMap.dispose()
    }
}
