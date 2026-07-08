/**
 * src/water-render.js — procedural water surfaces for FEAT-17 ponds + FEAT-18 streams.
 *
 * STATUS: NOT wired into main.js yet (water is unwired — see the 2026-07-01 water handoffs).
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

// ── Stream ribbon following the descending centerline ──────────────────────────────────────
// Builds a triangle strip: at each centerline point, offset ± streamWidth perpendicular to
// the local tangent (XZ), at y = centerlineY − depth + waterDepth (the water surface, which
// sits above the carved bed and descends with the channel).
//
// BUG-32: an optional bbox CLIPS the ribbon to the render window — a stream can run 1.4 km
// while the terrain ring shows ~200 m, and unclipped ribbons hang in the void. Points are
// grouped into contiguous in-window spans (one strip each, one point of overhang per end so
// the cut edge sits past the window, under fog); indices never bridge span gaps.
export function buildStreamMesh(stream, material, bbox) {
    const pts = stream.points
    if (pts.length < 2) return null
    const surfaceLift = stream.waterDepth - stream.depth   // relative to centerline terrain y

    // Contiguous index spans to emit. Without a bbox: the whole polyline.
    const spans = []
    if (!bbox) {
        spans.push([0, pts.length - 1])
    } else {
        const pad = (stream.maxWidth ?? stream.width)
        const inWin = (p) => p.x >= bbox.minX - pad && p.x <= bbox.maxX + pad &&
                             p.z >= bbox.minZ - pad && p.z <= bbox.maxZ + pad
        let start = -1
        for (let i = 0; i < pts.length; i++) {
            if (inWin(pts[i])) { if (start < 0) start = i }
            else if (start >= 0) { spans.push([Math.max(0, start - 1), i]); start = -1 }
        }
        if (start >= 0) spans.push([Math.max(0, start - 1), pts.length - 1])
        if (spans.length === 0) return null
    }

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
        this._meshes = new Map()   // feature key -> mesh (dedup / reuse)
        this._winKey = ''          // BUG-32: chunk-quantized clip window of the current stream meshes
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
        if (winKey !== this._winKey) {
            this._winKey = winKey
            for (const [key, mesh] of this._meshes) {
                if (mesh.userData.water.kind === 'stream') {
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
        for (const st of this.water.streamsInBBox(minX, minZ, maxX, maxZ)) {
            wanted.add(st.key)
            if (!this._meshes.has(st.key)) {
                const m = buildStreamMesh(st, this.material, { minX, minZ, maxX, maxZ })
                if (m) { this._meshes.set(st.key, m); this.group.add(m) }
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
    }
}
