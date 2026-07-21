// src/map2d.js — FEAT-16: 2D top-down map (dev / validation overlay, toggled with M).
//
// A self-contained HTML5 2d-context overlay for eyeballing the road network's MACRO shape
// (parallel runs, intersection density, disconnected pockets, sparse-vs-dense) without
// freecaming. It is a DEV/VALIDATION surface, kept entirely off the physics/frame-critical
// path (CLAUDE.md "src/ is the product") — no scene mutation, no per-frame hot-loop cost when
// closed.
//
// Data source = a SEPARATE, read-only RoadSystem instance dedicated to the map, NOT the live
// play network: the play network only holds the ~320 m streamed window the truck + ribbon mesh
// consume, so re-streaming IT around a pan cursor would re-shape the road under the truck. The
// road network is window-invariant (a pure fn of seed + coords), so the map builds its own
// `new RoadSystem(seed, params)` streamed around the PAN CURSOR at a large radius, fully
// independent of play (the same construct-and-update path the headless gates use). It is never
// init(scene)'d and never setDebugVisible'd — it stays pure data (no THREE objects).
//
// Built to graduate: the render is a plain canvas draw, so it can later feed a CanvasTexture
// for the fluttering map-prop (ticket "Future") without a rewrite.

import * as THREE from 'three'
import { RoadSystem } from './road.js'
import { MISSION_PLAN_RADIUS } from './mission.js'

// Streamed radius of the map's own RoadSystem around the pan cursor. UNIFIED with the story-mode
// planner's radius: the two are the big read-only networks in the app and they share route caches,
// so matching radii means whichever streams first pays and the other rides warm — mismatched radii
// (map 1500 vs planner 1400, as shipped) made the map re-route a ring the planner never covers.
const MAP_RADIUS      = MISSION_PLAN_RADIUS
// Progressive (chunked) streaming radii. Growing the radius in steps fills the network
// incrementally (first ring paints fast, then the rest streams in) instead of one long freeze.
// Each step yields between chunks (PROGRESSIVE_GAP), and each step's routing is warmed on the
// road Worker BEFORE the synchronous update runs — see _pump.
const MAP_RADIUS_STEPS = [400, 650, 900, 1150, MAP_RADIUS]
// Story mode plans over a WIDER network than the map streams by default (MISSION_PLAN_RADIUS in
// mission.js), so a mission route can run past the edge of what the map has built — which reads
// exactly like the route being drawn over empty ground. setRadiusTarget lets the mission tell the
// map how far it must reach; the extra rings are appended to the progressive stream.
// Capped so the map never streams more than ~4 x 4 km of world: at 3000 m it built a 6 km-wide
// network and took 20+ s, which is the load the owner was seeing. The mission ROUTE is drawn from
// the planner's own data regardless, so the map's network is context, not the subject — it does not
// need to reach the far end of every route.
const MAP_RADIUS_MAX = 2000
const PROGRESSIVE_GAP  = 16    // ms — yield between stream chunks so the page stays responsive
const STREAM_DEBOUNCE = 120    // ms — re-stream only after a pan settles (a stream is expensive)
const RESTREAM_MOVE   = 300    // m — re-stream when the pan center has drifted past this since last stream
const COARSE_DIV      = 250    // m — coarse-height normaliser for terrain shading (≈ full range, see ranger.js)
const BG_CELL_PX      = 18     // px — terrain shading sample cell (coarser = cheaper)
const TELEPORT_SNAP_RADIUS = 500  // m — double-click snaps to the nearest road within this range

export class Map2D {
    /**
     * @param {object}   o
     * @param {HTMLCanvasElement} o.canvas   — the #map2d overlay canvas
     * @param {() => number}      o.getSeed  — current world seed (numeric); map rebuilds its instance on change
     * @param {() => object}      o.getParams— live RANGER_PARAMS ref (so the map mirrors the graph knobs)
     * @param {() => {x:number,z:number,fx:number,fz:number}} o.getCar — car world XZ + world-forward XZ
     * @param {(pose:{x:number,z:number,roadTopY:?number,heading:?number}) => void} [o.onTeleport]
     *        — called on double-click with the nearest-road snap (roadTopY/heading null when no road near)
     * @param {() => boolean} [o.canTeleport] — gate: teleport prompt + double-click only when true (free-roam)
     * @param {() => ?{start:{x,z}, end:{x,z}, poly:{x,z}[]}} [o.getMission]
     *        — story-mode mission overlay (route + start/end pins); null when no mission is live
     */
    constructor({ canvas, getSeed, getParams, getCar, onTeleport, canTeleport, getMission }) {
        this._canvas    = canvas
        this._ctx       = canvas.getContext('2d')
        this._getSeed   = getSeed
        this._getParams = getParams
        this._getCar    = getCar
        this._onTeleport  = onTeleport   || null
        this._canTeleport = canTeleport  || (() => false)
        this._getMission  = getMission   || (() => null)

        this._open       = false
        this._road       = null          // the map's own RoadSystem; KEPT ALIVE across opens (route cache)
        this._routeWorker = null         // QUAL-08: dedicated road-network Worker (client 'map'); set via setRouteWorker
        this._sharedRouteSource = null   // QUAL-14 perf: getter for the play RoadSystem (shared route cache)
        this._sig        = null          // seed+road-param signature the current _road was built for
        this._streamAt   = null          // THREE.Vector3 the network was last streamed around
        this._streamTimer = 0            // pan-debounce handle
        this._paramTimer  = 0            // road-slider-change debounce handle (live rebuild while open)
        this._centeredOnce = false       // pan is centred on the car on the FIRST open only

        // Progressive (chunked) streaming state — see MAP_RADIUS_STEPS.
        this._streaming   = false        // a chunked stream is in flight
        this._streamStep  = 0            // next index into MAP_RADIUS_STEPS to stream
        this._radiusTarget = MAP_RADIUS  // grown by setRadiusTarget (story mode)
        this._streamFull  = false        // network is streamed out to the final radius around _streamAt
        this._pumpTimer   = 0            // setTimeout handle between chunks
        this._pumpToken   = 0            // invalidates in-flight warm polls when a new stream starts

        // View transform: pan = world center of the view; zoom = px per world metre.
        this._panX = 0
        this._panZ = 0
        this._zoom = 0.1

        // Cached background layer (terrain + roads + nodes + crossings) — only depends on the
        // transform + streamed network, NOT the car. Rebuilt when dirty; the moving car marker
        // is drawn on top each frame, so an idle (non-panning) map costs ~nothing per frame.
        //
        // Pan/zoom do NOT rebuild it per-move (that redraw — terrain shading + every road — is the
        // stutter the owner reported while dragging). Instead render() BLITS the cached bitmap with
        // an offset/scale derived from (bg transform → current transform), and a short idle timer
        // triggers one sharp rebuild after the gesture settles. Content changes (stream chunks,
        // params) still set _bgDirty for an immediate rebuild.
        this._bg      = document.createElement('canvas')
        this._bgDirty = true
        this._bgPanX  = 0                // transform the cached bg was rendered at
        this._bgPanZ  = 0
        this._bgZoom  = 0
        this._bgTimer = 0                // settle-redraw debounce handle

        // Drag-pan state.
        this._dragging = false
        this._lastX = 0
        this._lastY = 0

        // Bound listeners (so show/hide can add+remove the exact same refs).
        this._onDown  = this._onMouseDown.bind(this)
        this._onMove  = this._onMouseMove.bind(this)
        this._onUp    = this._onMouseUp.bind(this)
        this._onWheel = this._onWheelEvent.bind(this)
        this._onDbl   = this._onDblClick.bind(this)
    }

    // QUAL-08: attach the dedicated road-network routing Worker so the map's read-only RoadSystem routes
    // OFF the main thread (client 'map'), decoupled from the play/terrain pipeline. Optional — without it
    // the map falls back to synchronous routing (its prior behaviour). Wired in _buildRoad on (re)build.
    setRouteWorker(rw) { this._routeWorker = rw }

    /**
     * Ensure the map streams at least `r` metres around the pan cursor. Used by story mode so the
     * white network always extends past the blue route — without this the map looks like it is
     * missing roads the mission "invented", when in fact it simply had not built that far.
     * Only ever grows, and re-streams if the current pass already finished short of the new target.
     */
    setRadiusTarget(r) {
        const want = Math.max(MAP_RADIUS, Math.min(MAP_RADIUS_MAX, r))
        if (want <= this._radiusTarget) return
        this._radiusTarget = want
        this._streamFull = false
        if (this._open) this._startStream()
    }

    _radiusSteps() {
        const steps = [...MAP_RADIUS_STEPS]
        for (let r = MAP_RADIUS + 500; r <= this._radiusTarget + 1e-6; r += 500) steps.push(r)
        if (steps[steps.length - 1] < this._radiusTarget) steps.push(this._radiusTarget)
        return steps
    }

    // QUAL-14 perf: share the PLAY RoadSystem's per-connection route cache. Centerlines are pure
    // fns of (seed, road params) and this map rebuilds its instance on any sig change, so aliasing
    // the two instances' cache Maps is safe — the map never re-routes a connection play already
    // paid for (cold map open stops recomputing the whole play band), and map panning pre-fills
    // the cache play will stream into later. A GETTER, not an instance: play swaps RoadSystem
    // instances on seed regen and the map must re-adopt the live one on its own rebuild.
    setSharedRouteSource(fn) { this._sharedRouteSource = fn }

    // FEAT-17: the same water no-go injection the play RoadSystem gets (see main.js
    // rebuildWaterSystem) — the map must route with the identical pond exclusion or the network it
    // validates differs from the one the player drives. Stored + applied to the current instance
    // and every rebuild.
    setWaterNoGo(noGoFn, discsFn) {
        this._waterNoGoFns = [noGoFn, discsFn]
        if (this._road) this._road.setWaterNoGo(noGoFn, discsFn)
    }

    isOpen() { return this._open }

    toggle() { this._open ? this.hide() : this.show() }

    show() {
        if (this._open) return
        this._open = true
        this._canvas.style.display = 'block'
        this._resize()

        // Rebuild the map's RoadSystem only when the seed or a road param actually changed (so the
        // tool always reflects the graph knobs being validated) — otherwise REUSE
        // the kept instance, whose warm route cache makes a reopen instant. The terrain layer paints
        // immediately; the network then streams in progressively (see _startStream).
        const sig = this._paramSig()
        if (!this._road || sig !== this._sig) { this._buildRoad(); this._sig = sig }

        if (!this._centeredOnce) {
            const car = this._getCar()
            this._panX = car.x; this._panZ = car.z
            this._centeredOnce = true
        }
        // Resume/begin the chunked stream unless this exact center is already fully streamed.
        if (!this._streamFull || !this._streamAt ||
            Math.hypot(this._panX - this._streamAt.x, this._panZ - this._streamAt.z) > RESTREAM_MOVE) {
            this._startStream()
        }

        this._canvas.addEventListener('mousedown', this._onDown)
        window.addEventListener('mousemove', this._onMove)
        window.addEventListener('mouseup', this._onUp)
        this._canvas.addEventListener('wheel', this._onWheel, { passive: false })
        this._canvas.addEventListener('dblclick', this._onDbl)
        this._bgDirty = true
    }

    /**
     * Center + zoom so a world-XZ box fits on screen (story-mode mission framing: the whole
     * route should be readable the moment the offer appears, not somewhere off the edge).
     * Call AFTER show() — it needs the resized canvas. Sets _zoomInit so the first background
     * draw doesn't stomp the fit with the default whole-radius zoom.
     */
    frameBounds(minX, minZ, maxX, maxZ, marginFrac = 0.22) {
        const w = this._canvas.clientWidth, h = this._canvas.clientHeight
        if (!w || !h) return
        this._panX = (minX + maxX) / 2
        this._panZ = (minZ + maxZ) / 2
        const spanX = Math.max(1, maxX - minX), spanZ = Math.max(1, maxZ - minZ)
        const fit = Math.min(w / spanX, h / spanZ) * (1 - marginFrac)
        this._zoom = Math.max(0.005, Math.min(4, fit))
        this._zoomInit = true
        this._bgDirty = true
        // A programmatic pan has no mouse-up to hang the usual debounced re-stream off, so without
        // this the route would be drawn over blank noise until the user nudged the map by hand
        // (owner-reported after hitting "regenerate" while panned away).
        if (!this._streamAt || Math.hypot(this._panX - this._streamAt.x, this._panZ - this._streamAt.z) > RESTREAM_MOVE) {
            this._streamFull = false
            if (this._open) this._startStream()
        }
    }

    hide() {
        if (!this._open) return
        this._open = false
        this._dragging = false
        this._streaming = false
        clearTimeout(this._pumpTimer)
        clearTimeout(this._streamTimer)
        clearTimeout(this._paramTimer)
        clearTimeout(this._bgTimer)
        this._canvas.style.display = 'none'
        this._canvas.removeEventListener('mousedown', this._onDown)
        window.removeEventListener('mousemove', this._onMove)
        window.removeEventListener('mouseup', this._onUp)
        this._canvas.removeEventListener('wheel', this._onWheel)
        this._canvas.removeEventListener('dblclick', this._onDbl)
    }

    // ── RoadSystem (the map's own read-only instance) ────────────────────────────────────────
    // A signature over the seed + every road* param, so the kept instance is rebuilt iff the network
    // it represents could have changed (mode/graph-knob tuning) — and reused (instant) otherwise.
    _paramSig() {
        const p = this._getParams()
        let s = 'seed=' + this._getSeed()
        for (const k of Object.keys(p)) if (/^road/i.test(k) && typeof p[k] !== 'function') s += '|' + k + '=' + p[k]
        return s
    }

    // Called each render frame while open: if the seed / a road* param changed since the current
    // instance was built, adopt the new signature immediately (so we don't re-queue every frame) and
    // debounce a full rebuild + restream. Adopting the sig up front means a settled value fires the
    // timer once, while a still-dragging slider keeps producing new sigs → the timer keeps resetting.
    _checkParamChange() {
        const sig = this._paramSig()
        if (sig === this._sig) return
        this._sig = sig
        clearTimeout(this._paramTimer)
        this._paramTimer = setTimeout(() => {
            if (!this._open) return
            this._buildRoad()     // fresh instance off the new params (resets the progressive cursor)
            this._startStream()   // restart the chunked stream around the current pan center
        }, 150)
    }

    // Fresh instance — wholly independent of the live play network. Cheap (constructor is ~0); the
    // cost is in streaming, which _startStream chunks. Resets the progressive cursor.
    _buildRoad() {
        this._road = new RoadSystem(this._getSeed(), this._getParams())
        this._streamAt = null
        this._streamFull = false
        this._streamStep = 0
        // QUAL-08: route this instance off-thread via the shared road-network Worker (client 'map'). The
        // stable 'map' id swaps the instance on rebuild; old in-flight replies drop by the new instance's
        // epoch. warmRoutes() (see _pump) then pre-warms the map cache off the main thread.
        if (this._routeWorker) {
            this._routeWorker.registerClient('map', this._road)
            this._road.setRouteDispatcher((jobs, epoch) => this._routeWorker.postRouteJobs('map', jobs, epoch))
        }
        // FEAT-17: re-apply the water no-go so the fresh instance routes around ponds like play does.
        if (this._waterNoGoFns) this._road.setWaterNoGo(this._waterNoGoFns[0], this._waterNoGoFns[1])
        // QUAL-14 perf: adopt the play instance's route-cache Maps — strictly AFTER setWaterNoGo
        // above (it calls _invalidateProto, which CLEARS the caches it can see; it must not wipe
        // play's warm entries). Guarded on seed match; params match by construction (both read the
        // live RANGER_PARAMS, and a road-param change rebuilds this instance via _paramSig).
        const src = this._sharedRouteSource?.()
        if (src && src._worldSeed === this._getSeed()) {
            const p = src._proto, q = this._road._proto
            q.cls = (p.cls ??= new Map())
            q.clsSolo = (p.clsSolo ??= new Map())
        }
    }

    // Begin/restart the chunked stream around the current pan center: grow the radius through
    // MAP_RADIUS_STEPS one chunk per timer tick, marking the bg dirty after each so the network
    // visibly fills in. Already-routed edges hit the warm route cache, so re-streaming a center
    // that's already covered (e.g. a small pan, or resuming after reopen) is fast.
    _startStream() {
        clearTimeout(this._pumpTimer)
        // Restart the radius growth from the smallest step for the NEW center (first ring paints fast).
        this._streamStep = 0
        this._streamFull = false
        this._streamCenter = new THREE.Vector3(this._panX, 0, this._panZ)
        this._streaming = true
        // Defer the FIRST chunk one tick so the next render paints the terrain layer + "streaming…"
        // badge immediately (the overlay appears instantly; the network then fills in).
        this._pumpTimer = setTimeout(() => this._pump(), 0)
    }

    _pump() {
        if (!this._open || !this._streaming) { this._streaming = false; return }
        const R = this._radiusSteps()[this._streamStep]
        this._road.setRadius(R)
        // Route OFF-THREAD first (owner-reported freeze fix): poll warmBandComplete until the road
        // Worker has cached every connection in this radius band, and only THEN run the synchronous
        // update — with a warm cache it is the cheap registration pass (~0.2 s at full radius), not
        // the multi-second routing hang that froze panning. Without a worker, warmBandComplete
        // returns true immediately and this collapses to the old sync path (headless/tests).
        const token = ++this._pumpToken
        const t0 = performance.now()
        const poll = () => {
            if (!this._open || !this._streaming || token !== this._pumpToken) return
            let done = true
            try { done = this._road.warmBandComplete(this._streamCenter) } catch (e) { console.warn('[map2d] warm failed', e) }
            // Safety valve: if the worker wedges, fall through to the sync path rather than a map
            // that never finishes painting.
            if (!done && performance.now() - t0 < 20000) { this._pumpTimer = setTimeout(poll, 120); return }
            this._road.update(this._streamCenter)
            this._streamAt = this._streamCenter
            this._bgDirty = true
            this._streamStep++
            if (this._streamStep < this._radiusSteps().length) {
                this._pumpTimer = setTimeout(() => this._pump(), PROGRESSIVE_GAP)
            } else {
                this._streaming = false
                this._streamFull = true
            }
        }
        poll()
    }

    // ── Transform helpers ────────────────────────────────────────────────────────────────────
    _sx(wx) { return (wx - this._panX) * this._zoom + this._canvas.clientWidth  / 2 }
    _sy(wz) { return (wz - this._panZ) * this._zoom + this._canvas.clientHeight / 2 }

    _resize() {
        const dpr = window.devicePixelRatio || 1
        const w = window.innerWidth, h = window.innerHeight
        for (const c of [this._canvas, this._bg]) {
            c.width = Math.round(w * dpr)
            c.height = Math.round(h * dpr)
        }
        this._canvas.style.width = w + 'px'
        this._canvas.style.height = h + 'px'
        this._dpr = dpr
        // Fit MAP_RADIUS*2 to the short screen edge on the very first sizing.
        if (!this._zoomInit) { this._zoom = Math.min(w, h) / (MAP_RADIUS * 2); this._zoomInit = true }
        this._bgDirty = true
    }

    // ── Mouse: drag-pan + wheel-zoom ──────────────────────────────────────────────────────────
    _onMouseDown(e) {
        this._dragging = true
        this._lastX = e.clientX
        this._lastY = e.clientY
        this._canvas.style.cursor = 'grabbing'
    }

    _onMouseMove(e) {
        // Road-Feel QoL: remember the hover position so render() can show world coords under the
        // cursor (correlates the map with test/road-character.mjs worst-offender x/z listings).
        const rect = this._canvas.getBoundingClientRect()
        this._hoverX = e.clientX - rect.left
        this._hoverY = e.clientY - rect.top
        if (!this._dragging) return
        const dx = e.clientX - this._lastX
        const dy = e.clientY - this._lastY
        this._lastX = e.clientX
        this._lastY = e.clientY
        // Drag moves the world under the cursor: pan center shifts opposite the drag, scaled by zoom.
        this._panX -= dx / this._zoom
        this._panZ -= dy / this._zoom
        this._deferBgRedraw()   // render() blits the cached bg at an offset; sharp redraw on settle
    }

    // Transform gesture in progress: don't rebuild the (expensive) background per move — schedule
    // one sharp rebuild shortly after the gesture goes quiet. render() blits the stale bitmap with
    // the right offset/scale in the meantime, so dragging stays smooth even mid-stream.
    _deferBgRedraw() {
        clearTimeout(this._bgTimer)
        this._bgTimer = setTimeout(() => { this._bgDirty = true }, 140)
    }

    _onMouseUp() {
        if (!this._dragging) return
        this._dragging = false
        this._canvas.style.cursor = 'grab'
        // Re-stream (chunked) only if the pan center drifted far from where we last streamed, and
        // debounced so a flurry of small drags doesn't kick off repeated streams.
        if (!this._streamAt ||
            Math.hypot(this._panX - this._streamAt.x, this._panZ - this._streamAt.z) > RESTREAM_MOVE) {
            clearTimeout(this._streamTimer)
            this._streamTimer = setTimeout(() => this._startStream(), STREAM_DEBOUNCE)
        }
    }

    _onWheelEvent(e) {
        e.preventDefault()
        // Zoom about the cursor — a PURE canvas transform, no re-stream.
        const rect = this._canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left, my = e.clientY - rect.top
        // World point under the cursor before zoom.
        const wx = (mx - this._canvas.clientWidth / 2) / this._zoom + this._panX
        const wz = (my - this._canvas.clientHeight / 2) / this._zoom + this._panZ
        const factor = Math.exp(-e.deltaY * 0.0015)
        this._zoom = Math.max(0.005, Math.min(4, this._zoom * factor))
        // Keep that same world point under the cursor after zoom.
        this._panX = wx - (mx - this._canvas.clientWidth / 2) / this._zoom
        this._panZ = wz - (my - this._canvas.clientHeight / 2) / this._zoom
        this._deferBgRedraw()   // scale-blit until the wheel goes quiet, then one sharp redraw
    }

    // Double-click → teleport the truck here (free-roam only). Snaps to the nearest road within
    // TELEPORT_SNAP_RADIUS using the map's OWN read-only network (window-invariant, so world coords
    // resolve identically to play), passing the road-top Y + tangent heading to main.js. When no
    // road is near, passes the raw clicked XZ (main drops on terrain, keeps the current heading).
    _onDblClick(e) {
        if (!this._canTeleport() || !this._onTeleport || !this._road) return
        const rect = this._canvas.getBoundingClientRect()
        const W = this._canvas.clientWidth, H = this._canvas.clientHeight
        const wx = (e.clientX - rect.left - W / 2) / this._zoom + this._panX
        const wz = (e.clientY - rect.top  - H / 2) / this._zoom + this._panZ
        const near = typeof this._road.queryNearest === 'function'
            ? this._road.queryNearest(wx, wz, TELEPORT_SNAP_RADIUS) : null
        if (near && near.point) {
            const roadTopY = typeof this._road.sampleRoadTopY === 'function'
                ? this._road.sampleRoadTopY(near.point.x, near.point.z) : null
            const heading = near.tangent ? Math.atan2(near.tangent.x, near.tangent.z) : null
            this._onTeleport({ x: near.point.x, z: near.point.z, roadTopY, heading })
        } else {
            this._onTeleport({ x: wx, z: wz, roadTopY: null, heading: null })
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────────────────────
    // Called each frame from the main loop ONLY while open. Rebuilds the cached bg layer when the
    // transform/network changed, then blits it and draws the (moving) car marker + legend on top.
    render() {
        if (!this._open) return
        // Live road-param tracking: show() only checks the signature on OPEN, so a road-slider change
        // made WHILE the map is open would otherwise leave the map's own read-only RoadSystem stale
        // (the play network rebuilds via main.js debouncedRoadRebuild; the map is decoupled). Re-check
        // each frame and rebuild+restream when the seed or a road* param drifts. Debounced (like
        // main.js's 150ms road rebuild) so dragging a slider doesn't thrash the expensive stream.
        this._checkParamChange()
        if (this._canvas.width !== Math.round(window.innerWidth * (window.devicePixelRatio || 1))) this._resize()
        if (this._bgDirty) { this._drawBackground(); this._bgDirty = false }

        const ctx = this._ctx
        const W = this._canvas.clientWidth, H = this._canvas.clientHeight
        ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0)
        ctx.clearRect(0, 0, W, H)
        // Blit the cached bg through the delta between its transform and the current one — during a
        // drag/zoom gesture this is the whole cost of the background (the sharp rebuild waits for
        // the gesture to settle; see _deferBgRedraw). At rest the delta is identity.
        const k = this._bgZoom ? this._zoom / this._bgZoom : 1
        const dx = W / 2 - k * W / 2 + (this._bgPanX - this._panX) * this._zoom
        const dy = H / 2 - k * H / 2 + (this._bgPanZ - this._panZ) * this._zoom
        ctx.drawImage(this._bg, dx, dy, W * k, H * k)

        this._drawMission(ctx)   // under the car marker, over the cached bg
        this._drawCar(ctx)
        this._drawLegend(ctx)
        this._drawCursorCoords(ctx)
        if (this._canTeleport()) this._drawTeleportPrompt(ctx)
        if (this._streaming) this._drawStreamingBadge(ctx)
    }

    // Top-center hint that double-clicking teleports (free-roam only).
    _drawTeleportPrompt(ctx) {
        const W = this._canvas.clientWidth
        const txt = 'double click to teleport'
        ctx.font = '14px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        const w = ctx.measureText(txt).width + 24
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(W / 2 - w / 2, 12, w, 26)
        ctx.fillStyle = '#d8d8d0'; ctx.fillText(txt, W / 2, 26)
        ctx.textAlign = 'left'
    }

    // Road-Feel QoL: seed / x / z of the world point under the cursor, bottom-left. Same
    // screen→world transform as the wheel-zoom anchor.
    _drawCursorCoords(ctx) {
        if (this._hoverX === undefined) return
        const W = this._canvas.clientWidth, H = this._canvas.clientHeight
        const wx = (this._hoverX - W / 2) / this._zoom + this._panX
        const wz = (this._hoverY - H / 2) / this._zoom + this._panZ
        const txt = `seed ${this._getSeed()} / ${wx.toFixed(0)} / ${wz.toFixed(0)}`
        ctx.font = '13px monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
        const w = ctx.measureText(txt).width + 16
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(10, H - 36, w, 24)
        ctx.fillStyle = '#d8d8d0'; ctx.fillText(txt, 18, H - 24)
    }

    // Small bottom-center badge while the network is still filling in (chunked stream in flight).
    _drawStreamingBadge(ctx) {
        const W = this._canvas.clientWidth, H = this._canvas.clientHeight
        const txt = `streaming network… ${Math.round(100 * this._streamStep / this._radiusSteps().length)}%`
        ctx.font = '13px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        const w = ctx.measureText(txt).width + 24
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(W / 2 - w / 2, 14, w, 26)
        ctx.fillStyle = '#ffd24a'; ctx.fillText(txt, W / 2, 28)
        ctx.textAlign = 'left'
    }

    _drawBackground() {
        const ctx = this._bg.getContext('2d')
        ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0)
        const W = this._canvas.clientWidth, H = this._canvas.clientHeight
        ctx.clearRect(0, 0, W, H)
        // Record the transform this bitmap is valid for — render() blits through the delta.
        this._bgPanX = this._panX; this._bgPanZ = this._panZ; this._bgZoom = this._zoom

        this._drawTerrain(ctx, W, H)
        this._drawRoads(ctx)
        this._drawCrossings(ctx)
        this._drawNodes(ctx)
    }

    // (1) Cheap coarse-height grayscale so roads read in context (not a full terrain render).
    //     Samples the map RoadSystem's own coarse-noise closure (works standalone — the
    //     constructor builds it; no terrain system / surface sampler needed).
    _drawTerrain(ctx, W, H) {
        const road = this._road
        if (!road) return
        for (let py = 0; py < H; py += BG_CELL_PX) {
            for (let px = 0; px < W; px += BG_CELL_PX) {
                const wx = (px + BG_CELL_PX / 2 - W / 2) / this._zoom + this._panX
                const wz = (py + BG_CELL_PX / 2 - H / 2) / this._zoom + this._panZ
                const h = road._coarseH(wx, wz)
                const t = Math.max(0, Math.min(1, h / COARSE_DIV))
                const v = Math.round(20 + t * 70)   // dark olive-gray ramp; roads (light) pop over it
                ctx.fillStyle = `rgb(${v},${v + 6},${v - 2})`
                ctx.fillRect(px, py, BG_CELL_PX, BG_CELL_PX)
            }
        }
    }

    // (2) Road centerlines — each streamed network run projected (x,z) → screen.
    _drawRoads(ctx) {
        const road = this._road
        if (!road || !road._network) return
        ctx.strokeStyle = '#d8d8d0'
        ctx.lineWidth = 2
        ctx.lineJoin = 'round'
        for (const { points } of road._network.values()) {
            if (!points || points.length < 2) continue
            ctx.beginPath()
            ctx.moveTo(this._sx(points[0].x), this._sy(points[0].z))
            for (let i = 1; i < points.length; i++) ctx.lineTo(this._sx(points[i].x), this._sy(points[i].z))
            ctx.stroke()
        }
    }

    // (3) Classified crossings — colored by kind (at-grade junction vs near-parallel graze).
    _drawCrossings(ctx) {
        const road = this._road
        if (!road || typeof road.crossingList !== 'function') return
        const col = { AT_GRADE: '#3fd06a', NEAR_PARALLEL: '#e0c83c' }
        for (const c of road.crossingList()) {
            const p = c.point; if (!p) continue
            ctx.fillStyle = col[c.kind] || '#aaaaaa'
            ctx.beginPath()
            ctx.arc(this._sx(p.x), this._sy(p.z), 3.5, 0, Math.PI * 2)
            ctx.fill()
        }
    }

    // (4) Anchor nodes — unique cells from edge cellA/cellB, colored by graph degree
    //     (leaf vs hub — the node taxonomy the v2 rework is validating).
    _drawNodes(ctx) {
        const road = this._road
        if (!road || !road._network) return
        const seen = new Set()
        for (const e of road._network.values()) {
            for (const cell of [e.cellA, e.cellB]) {
                if (!cell) continue
                const key = cell.join(',')
                if (seen.has(key)) continue
                seen.add(key)
                // FEAT-13 v2: node id is a blue-noise site id [cmx,cmz,k].
                const a = road._nodePos(cell)
                const deg = typeof road._graphDegreeOf === 'function' && cell.length >= 3 ? road._graphDegreeOf(cell) : 2
                // leaf (deg≤1) dim, degree-2 pass-through mid, hub (deg≥3) bright cyan.
                ctx.fillStyle = deg >= 3 ? '#46c8ff' : deg === 2 ? '#7088a0' : '#506070'
                ctx.beginPath()
                ctx.arc(this._sx(a.x), this._sy(a.z), deg >= 3 ? 4 : 2.5, 0, Math.PI * 2)
                ctx.fill()
            }
        }
    }

    // Story-mode mission overlay: the planned route + start/end pins. Per-frame layer (NOT the
    // cached bg) so re-rolling a mission repaints without a background rebuild. Endpoints are
    // arbitrary points on an edge, not nodes (DESIGN.md "Where missions and POIs live") — the pins
    // land mid-road on purpose.
    _drawMission(ctx) {
        const m = this._getMission()
        if (!m) return
        if (m.poly && m.poly.length > 1) {
            ctx.strokeStyle = 'rgba(90,180,255,0.85)'
            ctx.lineWidth = 3
            ctx.lineJoin = 'round'
            ctx.beginPath()
            ctx.moveTo(this._sx(m.poly[0].x), this._sy(m.poly[0].z))
            for (let i = 1; i < m.poly.length; i++) ctx.lineTo(this._sx(m.poly[i].x), this._sy(m.poly[i].z))
            ctx.stroke()
        }
        const pin = (p, fill, label) => {
            if (!p) return
            const sx = this._sx(p.x), sy = this._sy(p.z)
            ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2)
            ctx.fillStyle = fill; ctx.fill()
            ctx.strokeStyle = '#101010'; ctx.lineWidth = 2; ctx.stroke()
            ctx.fillStyle = '#f0f0e8'; ctx.font = 'bold 11px monospace'
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            ctx.fillText(label, sx, sy - 15)
            ctx.textAlign = 'left'
        }
        pin(m.start, '#5ad06a', 'START')
        pin(m.end, '#ffcf3c', 'DROP')
    }

    // (5) Car marker — a triangle at the car's world XZ, pointing along its world-forward XZ.
    _drawCar(ctx) {
        const car = this._getCar()
        const sx = this._sx(car.x), sy = this._sy(car.z)
        let fx = car.fx, fz = car.fz
        const m = Math.hypot(fx, fz) || 1; fx /= m; fz /= m   // forward (screen: x→right, z→down)
        const px = -fz, pz = fx                               // perpendicular
        const L = 9, Wd = 5
        ctx.fillStyle = '#ff5a3c'
        ctx.strokeStyle = '#1a1a1a'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(sx + fx * L,            sy + fz * L)             // nose
        ctx.lineTo(sx - fx * L + px * Wd,  sy - fz * L + pz * Wd)   // rear-left
        ctx.lineTo(sx - fx * L - px * Wd,  sy - fz * L - pz * Wd)   // rear-right
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
    }

    // (6) Legend + scale bar (drawn on-canvas — no extra DOM).
    _drawLegend(ctx) {
        const W = this._canvas.clientWidth, H = this._canvas.clientHeight
        ctx.font = '12px monospace'
        ctx.textBaseline = 'middle'
        const rows = [
            ['#d8d8d0', 'road'],
            ['#3fd06a', 'AT_GRADE'],
            ['#e0c83c', 'NEAR_PARALLEL'],
            ['#46c8ff', 'hub (deg≥3)'],
            ['#7088a0', 'node (deg 2)'],
            ['#506070', 'leaf (deg≤1)'],
            ['#ff5a3c', 'car'],
        ]
        const x0 = 16, y0 = 16, lh = 18
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(x0 - 8, y0 - 8, 168, rows.length * lh + 16)
        rows.forEach(([c, label], i) => {
            const y = y0 + i * lh + lh / 2
            ctx.fillStyle = c
            ctx.beginPath(); ctx.arc(x0 + 5, y, 5, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#e8e8e8'
            ctx.fillText(label, x0 + 18, y)
        })

        // Scale bar: a "nice" world length near 120 px wide.
        const targetPx = 120
        const rawM = targetPx / this._zoom
        const pow = Math.pow(10, Math.floor(Math.log10(rawM)))
        const niceM = (rawM / pow >= 5 ? 5 : rawM / pow >= 2 ? 2 : 1) * pow
        const barPx = niceM * this._zoom
        const bx = W - barPx - 24, by = H - 28
        ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + barPx, by)
        ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 4)
        ctx.moveTo(bx + barPx, by - 4); ctx.lineTo(bx + barPx, by + 4)
        ctx.stroke()
        ctx.fillStyle = '#e8e8e8'; ctx.textBaseline = 'bottom'
        ctx.fillText(niceM >= 1000 ? (niceM / 1000) + ' km' : niceM + ' m', bx, by - 6)
        ctx.textBaseline = 'middle'
    }
}
