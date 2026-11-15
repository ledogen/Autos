/**
 * src/terrain-bake.js — PERF-48 lever 6 PROTOTYPE: the terrain material baked into a world atlas.
 *
 * Off unless the URL carries `?terrainBake=<px per chunk>` (main.js); main's look is untouched by default.
 *
 * The live terrain shader (terrain.js onBeforeCompile) evaluates the noise mottle, the six FEAT-84 surface
 * taps, the height contest and the rock bump for every pixel every frame. Here that work is done ONCE per
 * chunk: an orthographic top-down camera renders the chunk mesh with the live shader cut short at two
 * markers, writing its final albedo (`// @bake-b`) and its final world normal (`// @bake-d`) into two
 * atlases. The baked material is the live one with both blocks swapped for one atlas tap each; lighting,
 * real-time shadows, the baked prop shadow, fog and the tunnel cut-outs still run per pixel, so the bake follows
 * the time of day by construction (it stores surface, never light).
 *
 * Hybrid by distance (DEC-207: the owner rejected the all-baked look nearby). Ground at BAKE_FAR_M and farther
 * from the truck (horizontal distance) uses the bake; nearer ground keeps the live shader. Across the
 * BAKE_BLEND_M band inside BAKE_FAR_M the two are cross-faded per pixel (albedo and normal, smoothstep weight),
 * so there is no line. Each chunk gets the cheapest material that is exact for it: wholly inside the band → the
 * live material; wholly past BAKE_FAR_M → the baked one; touching the band → the blend one, which taps the atlas
 * and runs the live blocks only where the weight is below 1.
 *
 * Atlas layout — toroidal, like the prop-shadow atlas (prop-shadow-bake.js), but addressed as ONE continuous
 * image: uv = (−x, z) / (CHUNK_SIZE · BAKE_N) with repeat wrapping, so neighbouring chunks are neighbouring
 * tiles and mip filtering blends the real world neighbour, no per-tile clamp. The −x is because the camera is
 * NOT mirrored (a mirrored camera flips the winding and with it gl_FrontFacing, which flips the baked normal).
 *
 * Measured (wip/perf-48/bake-ab.mjs, paired A/B, 2 random seeds): baking every pixel saves 10–24 % of GPU active
 * cycles. Known ceilings (prototype): the top-down bake streaks steep cut faces past BAKE_FAR_M (keeping steep
 * pixels live was tried and ate most of the saving); palette slider edits do not re-bake (reload).
 */
import * as THREE from 'three'
import { CHUNK_SIZE } from './terrain-height.js'

const BAKE_N = 12            // tiles per side — exceeds the live ring diameter (≤ 11 at Ultra with the keep margin)
const BAKES_PER_FRAME = 4    // chunks baked per frame while streaming; the full ring fills in ~30 frames
const BAKE_FAR_M = 70        // DEC-207: ground this far (m, horizontal) from the truck and farther is fully baked
const BAKE_BLEND_M = 15      // cross-fade band just inside BAKE_FAR_M: live at 55 m, baked at 70 m

const pmod = (a, n) => ((a % n) + n) % n

/** src with shader marker m (terrain.js) replaced by text; loud if a terrain.js edit dropped the marker. */
function mark(src, m, text) {
    if (!src.includes(m)) throw new Error(`[terrain-bake] shader marker ${m} missing`)
    return src.replace(m, text)
}

export class TerrainBake {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {number} tilePx  atlas texels per chunk side (256 → 0.25 m/texel, atlas 3072²)
     */
    constructor(renderer, tilePx = 256) {
        this.enabled = true          // runtime A/B toggle (window.__terrainBake in ?prof=1)
        this._truck = { value: new THREE.Vector2() }                                       // uBakeTruck (x, z)
        this._band = { value: new THREE.Vector2(BAKE_FAR_M - BAKE_BLEND_M, BAKE_FAR_M) }   // uBakeBand
        this._r = renderer
        this._tp = tilePx
        const size = BAKE_N * tilePx
        const opts = (colorSpace) => ({
            colorSpace, depthBuffer: false, generateMipmaps: true,
            minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
            wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: 8,
        })
        // Albedo in an sRGB target: the hardware encodes on write and decodes on read, so 8 bits keep dark tones.
        this._alb = new THREE.WebGLRenderTarget(size, size, opts(THREE.SRGBColorSpace))
        this._nrm = new THREE.WebGLRenderTarget(size, size, opts(THREE.NoColorSpace))
        // Allocate now, while generateMipmaps is true, so the storage has its mip chain (the bake later turns
        // the flag off for all but a frame's last tile).
        renderer.initRenderTarget(this._alb); renderer.initRenderTarget(this._nrm)
        this._cam = new THREE.OrthographicCamera(-CHUNK_SIZE / 2, CHUNK_SIZE / 2, CHUNK_SIZE / 2, -CHUNK_SIZE / 2, 1, 4000)
        this._cam.up.set(0, 0, 1)    // screen up = +Z, screen right = −X (hence the −x in the atlas uv)
        this._scene = new THREE.Scene()
        this._mesh = new THREE.Mesh(undefined, undefined)
        this._mesh.frustumCulled = false
        this._scene.add(this._mesh)
        this._live = null            // the TerrainSystem material the clones below were made from
        this._state = new Map()      // chunk key → { mesh, v } of the last bake
        this.baked = 0               // tiles baked so far (diagnostic for the harness)
    }

    _makeMaterials(live) {
        this._live = live
        this._state.clear()
        const variant = (key, patch) => {
            const m = live.clone()
            m.onBeforeCompile = (shader, r) => { live.onBeforeCompile(shader, r); patch(shader) }
            m.customProgramCacheKey = () => key
            return m
        }
        this._bakeAlb = variant('perf48-bake-alb', (s) => {
            s.fragmentShader = s.fragmentShader.replace('// @bake-b', 'gl_FragColor = vec4(diffuseColor.rgb, 1.0); return;')
        })
        this._bakeNrm = variant('perf48-bake-nrm', (s) => {
            s.fragmentShader = s.fragmentShader.replace('// @bake-d',
                'gl_FragColor = vec4(normalize(transpose(mat3(viewMatrix)) * normal) * 0.5 + 0.5, 1.0); return;')
        })
        const scale = 1 / (CHUNK_SIZE * BAKE_N)
        const uv = `(vec2(-vWorldPos.x, vWorldPos.z) * ${scale.toExponential(8)})`
        const head = 'uniform sampler2D uBakeAlb, uBakeNrm;\n'
        const bind = (s) => { s.uniforms.uBakeAlb = { value: this._alb.texture }; s.uniforms.uBakeNrm = { value: this._nrm.texture } }
        this._baked = variant('perf48-baked', (s) => {
            bind(s)
            let f = head + s.fragmentShader
            f = mark(f, '// @bake-a', `diffuseColor.rgb = texture2D(uBakeAlb, ${uv}).rgb;\nif (false) {\n`)
            f = mark(f, '// @bake-b', '}\n')
            f = mark(f, '// @bake-c', `normal = normalize(mat3(viewMatrix) * (texture2D(uBakeNrm, ${uv}).xyz * 2.0 - 1.0));\nif (false) {\n`)
            f = mark(f, '// @bake-d', '}\n')
            s.fragmentShader = f
        })
        // The band: w = 0 → live, 1 → baked. Both atlas taps sit before the branch (uniform control flow, so their
        // mip choice is defined); the live blocks run only where w < 1 and are mixed out by w.
        this._blend = variant('perf48-blend', (s) => {
            bind(s)
            s.uniforms.uBakeTruck = this._truck
            s.uniforms.uBakeBand = this._band
            let f = head + 'uniform vec2 uBakeTruck, uBakeBand;\nfloat bkW; vec3 bkAlb, bkNrm;\n' + s.fragmentShader
            f = mark(f, '// @bake-a', `bkW = smoothstep(uBakeBand.x, uBakeBand.y, distance(vWorldPos.xz, uBakeTruck));
bkAlb = texture2D(uBakeAlb, ${uv}).rgb; bkNrm = texture2D(uBakeNrm, ${uv}).xyz * 2.0 - 1.0;
if (bkW < 1.0) {\n`)
            f = mark(f, '// @bake-b', '}\ndiffuseColor.rgb = mix(diffuseColor.rgb, bkAlb, bkW);\n')
            f = mark(f, '// @bake-c', 'if (bkW < 1.0) {\n')
            f = mark(f, '// @bake-d', '}\nnormal = normalize(mix(normal, mat3(viewMatrix) * bkNrm, bkW));\n')
            s.fragmentShader = f
        })
    }

    /**
     * Per frame: queue chunks whose mesh or vertex data changed since their bake, bake a few, and give every
     * chunk its material by its distance from the truck (live / blend / baked, see the header; live before its bake
     * or with the toggle off).
     * @param {THREE.Material} liveMat  terrainSystem's shared material (a new TerrainSystem → new clones)
     * @param {Map} chunkMap  terrainSystem's chunk records ({ cx, cz, mesh })
     * @param {THREE.Vector3} truck  the vehicle position
     */
    update(liveMat, chunkMap, truck) {
        if (liveMat !== this._live) this._makeMaterials(liveMat)
        this._truck.value.set(truck.x, truck.z)
        const h = CHUNK_SIZE / 2, { x: r0, y: r1 } = this._band.value   // the harness may move the band (e.g. bake all)
        const todo = []
        for (const [key, c] of chunkMap) {
            const g = c.mesh.geometry
            let v = 0
            for (const a of Object.values(g.attributes)) v += a.version
            const st = this._state.get(key)
            const fresh = st && st.mesh === c.mesh && st.v === v
            if (!fresh && todo.length < BAKES_PER_FRAME) todo.push([key, c, v])
            // nearest and farthest point of the chunk square from the truck (horizontal)
            const ax = Math.abs(truck.x - c.mesh.position.x), az = Math.abs(truck.z - c.mesh.position.z)
            const nx = Math.max(ax - h, 0), nz = Math.max(az - h, 0), fx = ax + h, fz = az + h
            const m = !(this.enabled && fresh) || Math.hypot(fx, fz) <= r0 ? this._live
                : Math.hypot(nx, nz) >= r1 ? this._baked : this._blend
            c.mesh.material = m
        }
        if (todo.length) this._bakeTiles(todo)
    }

    _bakeTiles(todo) {
        const r = this._r, tp = this._tp
        const prevTarget = r.getRenderTarget()
        for (const rt of [this._alb, this._nrm]) {
            this._mesh.material = rt === this._alb ? this._bakeAlb : this._bakeNrm
            for (let i = 0; i < todo.length; i++) {
                const [, c] = todo[i]
                const px = pmod(-c.cx - 1, BAKE_N) * tp, py = pmod(c.cz, BAKE_N) * tp
                const { x, z } = c.mesh.position
                this._cam.position.set(x, 2000, z)
                this._cam.lookAt(x, 0, z)
                this._cam.updateMatrixWorld(true)
                this._mesh.geometry = c.mesh.geometry
                this._mesh.position.copy(c.mesh.position)
                // rt.viewport/scissor are raw pixels (see prop-shadow-bake.js: renderer.setViewport scales by DPR).
                rt.viewport.set(px, py, tp, tp)
                rt.scissor.set(px, py, tp, tp)
                rt.scissorTest = true
                rt.texture.generateMipmaps = i === todo.length - 1   // one mip rebuild per atlas per frame
                r.setRenderTarget(rt)
                r.render(this._scene, this._cam)
            }
        }
        r.setRenderTarget(prevTarget)
        for (const [key, c, v] of todo) this._state.set(key, { mesh: c.mesh, v })
        this.baked += todo.length
    }
}
