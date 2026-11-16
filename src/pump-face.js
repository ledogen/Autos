// FEAT-233 — the pump you are parked at shows the sale on its own face, in rolling drums. Owner, 2026-11-16: "reuse
// the style that's on the gas pump right now ... All we have to do is animate those numbers spinning ... rolling drum
// style numbers as to the digital style", and the face's lighting "is working just fine". The 2D display stays as is.
//
// A model opts in with `pumpFace` in data/prop-models.js:
//   material  the face material's name (substring) — its atlas carries the gauge artwork
//   region    [x, y, w, h] of that artwork in the atlas image, px from the image's top-left; scale = canvas px per atlas px
//   plates    model-local centre of each gauge plate, n = the plate's outward normal along Z (±1); w, h = plate size, m
//   bg / wheel / ink / dot   window ground, drum face, figure and decimal-point colours
//   windows   [{ r: [x, y, w, h] in region px, show: 'sale' | 'gal' | 'price', n drums, dp decimals }]
//   rest      the values every idle face shows (what the bake prints)
//
// HOW. A canvas copies the model's own gauge region — so box, band and lettering ARE the model's — and paints drums
// over the windows. It goes on a quad 1 mm proud of each plate (polygonOffset holds it in front at range), in a CLONE
// of the face's own material, whose night glow (poi-night.js: emissive = the picture) is mirrored every frame — so it
// lights exactly as the baked face does. Every face wears its model's one REST texture; the face in use swaps to the
// model's one LIVE texture and keeps the last sale until another face goes live. Repainted only when a drum moves.
// New meshes and materials only: the model's pooled geometry is never touched (DEC-073).
import * as THREE from 'three'
import { PROP_MODELS } from '../data/prop-models.js'
import { drumPositions } from './fuel-stop.js'

const BLUR_DIGITS_PER_S = 12   // a drum turning faster than this is drawn blurred, the way a spinning wheel reads
const PROUD = 0.001            // m, the quad off its plate

function paint (ctx, spec, atlas, vals, flow) {
  const [rx, ry, rw, rh] = spec.region, k = spec.scale
  const rate = { sale: flow * (vals.price ?? 0), gal: flow, price: 0 }   // counter units per second
  ctx.drawImage(atlas, rx, ry, rw, rh, 0, 0, rw * k, rh * k)
  for (const w of spec.windows) {
    const [x, y, ww, hh] = w.r.map(v => v * k), n = w.n
    const g = Math.max(1, Math.round(hh * 0.06)), gDot = w.dp ? 3 * g : g   // the gap a decimal point sits in is wider
    const cw = (ww - g * (n + 1) - (gDot - g)) / n, ch = hh - 2 * g, fs = Math.round(ch * 0.78)
    ctx.fillStyle = spec.bg; ctx.fillRect(x, y, ww, hh)
    ctx.font = `bold ${fs}px Arial, Helvetica, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    const pos = drumPositions(vals[w.show] ?? 0, n, w.dp)
    let cx = x + g
    const cy = y + g
    for (let i = 0; i < n; i++) {
      const d = Math.floor(pos[i]), f = pos[i] - d
      ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip()
      ctx.fillStyle = spec.wheel; ctx.fillRect(cx, cy, cw, ch)
      if (rate[w.show] * 10 ** w.dp / 10 ** (n - 1 - i) > BLUR_DIGITS_PER_S) ctx.filter = `blur(${(ch * 0.07).toFixed(1)}px)`
      ctx.fillStyle = spec.ink
      const base = cy + ch * (0.5 - f) + fs * 0.36   // Arial's figures stand ~0.72 em tall
      ctx.fillText(String(d % 10), cx + cw / 2, base)
      ctx.fillText(String((d + 1) % 10), cx + cw / 2, base + ch)
      ctx.filter = 'none'
      const sh = ctx.createLinearGradient(0, cy, 0, cy + ch)   // the drum's curve: darker as it turns away
      sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(0.3, 'rgba(0,0,0,0)'); sh.addColorStop(0.7, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.5)')
      ctx.fillStyle = sh; ctx.fillRect(cx, cy, cw, ch)
      ctx.restore()
      cx += cw
      if (w.dp && i === n - 1 - w.dp) {
        ctx.fillStyle = spec.dot; ctx.beginPath(); ctx.arc(cx + gDot / 2, cy + ch * 0.82, g * 0.9, 0, Math.PI * 2); ctx.fill()
        cx += gDot
      } else cx += g
    }
  }
}

// What a repaint would change: each drum to an eighth of a digit, plus the flow (blur on / off).
const drumKey = (spec, vals, flow) => spec.windows.map(w => drumPositions(vals[w.show] ?? 0, w.n, w.dp).map(p => Math.round(p * 8)).join(',')).join('|') + (flow > 0)

export class PumpFaces {
  constructor () {
    this._kinds = new Map()   // model key → { spec, src, rest, live, ctx, tex, key, vals, flow }
    this._live = null         // the face mesh wearing its kind's live material
  }

  /** A pump model's onReady (after its night lamps are wired): every gauge plate gets a quad wearing the rest face. */
  attach (key, inst) {
    const spec = PROP_MODELS[key]?.pumpFace
    const kind = spec && (this._kinds.get(key) ?? this._makeKind(key, spec, inst))
    if (!kind) return
    inst.userData.pumpFaces = spec.plates.map((p) => {
      const m = new THREE.Mesh(kind.geo, kind.rest)
      m.position.set(p.x, p.y, p.z + p.n * PROUD)
      if (p.n < 0) m.rotation.y = Math.PI
      m.receiveShadow = true
      m.userData.kind = kind
      inst.add(m)
      return m
    })
  }

  /**
   * Per frame. `root`: the model root of the pump POI in use, or null when no pump is open (the last sale then
   * stays on its face). `at`: the truck (world) — the face nearest it is the one in use. `vals` { sale, gal, price };
   * `flow`: gal/s while fuel runs, else 0.
   */
  update (root, at, vals, flow) {
    for (const k of this._kinds.values()) for (const m of [k.rest, k.live]) {   // the lamp switch, mirrored
      m.emissive.copy(k.src.emissive); m.emissiveIntensity = k.src.emissiveIntensity
      if (!m.emissiveMap !== !k.src.emissiveMap) { m.emissiveMap = k.src.emissiveMap ? m.map : null; m.needsUpdate = true }
    }
    const faces = root?.children.find(c => c.userData.pumpFaces)?.userData.pumpFaces   // root = spawnModel's group, its child the model
    if (!faces) return
    let face = faces[0], best = Infinity
    for (const f of faces) { const d = f.getWorldPosition(_v).distanceToSquared(at); if (d < best) { best = d; face = f } }
    const kind = face.userData.kind
    if (face !== this._live) {
      if (this._live) this._live.material = this._live.userData.kind.rest
      face.material = kind.live
      this._live = face
      kind.key = null
    }
    const key = drumKey(kind.spec, vals, flow)
    if (key === kind.key) return
    kind.key = key; kind.vals = { ...vals }; kind.flow = flow
    paint(kind.ctx, kind.spec, kind.src.map.image, vals, flow)
    kind.tex.needsUpdate = true
  }

  _makeKind (key, spec, inst) {
    let src = null
    inst.traverse((o) => { if (!src && o.isMesh) src = [].concat(o.material).find(m => m.name?.includes(spec.material)) ?? null })
    if (!src?.map?.image) return null
    const [, , rw, rh] = spec.region, W = rw * spec.scale, H = rh * spec.scale
    const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h })
    const texOf = (img) => {
      const t = new THREE.CanvasTexture(img)
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = src.map.anisotropy
      return t
    }
    const mat = (tex) => {
      const m = src.clone()
      m.name = `${src.name} (FEAT-233 face)`
      m.map = tex; m.emissiveMap = src.emissiveMap ? tex : null
      m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4
      return m
    }
    // REST: painted once, handed to three as its pixels (BUG-182: a GPU reset blanks a 2D canvas; ImageData survives)
    const rc = canvas(W, H).getContext('2d')
    paint(rc, spec, src.map.image, spec.rest, 0)
    // LIVE: its own canvas, repainted as it runs; BUG-182 — repaint it when a GPU reset hands it back blank
    const lc = canvas(W, H), ctx = lc.getContext('2d')
    paint(ctx, spec, src.map.image, spec.rest, 0)
    const kind = { spec, src, ctx, tex: texOf(lc), geo: new THREE.PlaneGeometry(spec.w, spec.h), key: null, vals: spec.rest, flow: 0 }
    kind.rest = mat(texOf(rc.getImageData(0, 0, W, H)))
    kind.live = mat(kind.tex)
    lc.addEventListener('contextrestored', () => { paint(ctx, spec, src.map.image, kind.vals, kind.flow); kind.tex.needsUpdate = true })
    this._kinds.set(key, kind)
    return kind
  }
}
const _v = new THREE.Vector3()
