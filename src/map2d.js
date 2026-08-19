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
import { POI_ICONS, POI_ICON_PX, NEWSPAPER } from '../data/map-icons.js'   // FEAT-60: map glyphs
import { chunkCover, slopeFromGradient, COVER_CELL, CELLS_PER_CHUNK, DENSE_MIN }
    from './map-cover.js'
import { biomeAt, isWetGround, BIOME } from './biome.js'
import { FLORA_PARAMS } from '../data/flora.js'

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
// FEAT-43 raises this cap in story mode via setRadiusCap(): the 20+ s cost the cap exists to avoid
// is ROUTING, and story mode has already routed its whole region up front (the warm behind the
// loading screen). The map adopts the play instance's route cache, so those rings are cache hits.
const MAP_RADIUS_MAX = 2000
const PROGRESSIVE_GAP  = 16    // ms — yield between stream chunks so the page stays responsive
const STREAM_DEBOUNCE = 120    // ms — re-stream only after a pan settles (a stream is expensive)
const RESTREAM_MOVE   = 300    // m — re-stream when the pan center has drifted past this since last stream
const TELEPORT_SNAP_RADIUS = 500  // m — double-click snaps to the nearest road within this range

// ── Topographic paper (the map's whole visual identity) ───────────────────────────────────────
// The map is drawn as a USGS/Forest-Service quadrangle: pale green vegetated ground, burgundy
// contours off the binned coarse-height field, black-cased roads. Every colour below is picked
// against the paper green, not against the old dark canvas — anything light-on-dark (the road
// stroke, the crossing dots, the scale bar) had to be re-inked when the ground went pale.
// Vegetated ground. Sampled off the owner's USGS reference sheet (2026-08-15): the brightest,
// UNSHADED cluster of its green family. That distinction matters — on the reference the green runs
// #eaf2dd down to #d2d9c2, and that spread is hillshade already multiplied in, not four tints. So
// this is the LIT end of the ramp and _paintGround darkens from it (see HILLSHADE_MIN).
//
// One green tint only: the dense-vs-scattered distinction is carried by tree GLYPHS, not by a
// darker fill (owner, 2026-08-15), which is what the reference does — a single pale wash with
// conifer marks stamped through the parts that are genuinely forested.
//
// (Supersedes the note that stood here on 2026-08-11, that tree cover was uniform worldwide and had
// nothing to key off. It has something to key off now: the scatter itself, read via map-cover.js.)
const PAPER_GREEN   = '#e9f1db'
// Open ground — meadow, grassland, bare rock. Not pure white: the reference's cleared ground sits a
// hair under the collar cream, and #ffffff against COLLAR_CREAM reads as a hole punched in the sheet.
const PAPER_OPEN    = '#fbfbfa'
// Both contour inks run DARKER than they look on a swatch: at sub-pixel widths antialiasing
// blends most of the stroke into the paper, so a mid-tone burgundy comes out mauve on screen.
const CONTOUR_COLOR = '#7e2f3f'   // intermediate contour — dark burgundy
const INDEX_COLOR   = '#4d1622'   // index contour (every INDEX_EVERY-th), deeper burgundy
// Contour weights, CSS px (the context is pre-scaled by devicePixelRatio, so on a retina panel
// these are 2x as many device pixels and stay crisp). Fining these down past ~0.4 stops making the
// line thinner and starts making it fainter — antialiasing has no sub-pixel left to give — which
// is why the inks below are darker than the weights alone would suggest.
const CONTOUR_W     = 0.5         // px — intermediate contour weight
const INDEX_W       = 0.85        // px — index contour weight
const ROAD_INK      = '#0b0b0b'   // roads — solid black, for maximum contrast against the sheet
const ROAD_W        = 2.2         // px — road stroke weight
// Bored stretches — the road, seen through the hill. OPAQUE on purpose: as 38%-black alpha this
// took its colour from whatever happened to be underneath, so the moment another layer painted
// road-black under it (the camp-zone casing pass did exactly that) the bore rendered solid black
// and the bug looked like it lived in the tunnel code. This value is the exact composite of that
// alpha over PAPER_GREEN, so it is byte-identical on bare paper and immune everywhere else.
const TUNNEL_INK    = '#808c75'
const TUNNEL_W      = 1.8         // px — bore stroke weight
const PORTAL_W      = 2.2         // px — portal bar weight (matches the surface road)
const PORTAL_LEN    = 8           // px — portal bar length, square across the roadway
// FEAT-45 camping casing — a highlighter swipe along the road rather than the dark ochre ink it
// used to be (owner, 2026-08-11). Kept translucent on purpose: a highlighter marks a sheet
// without hiding it, so the contours it crosses must still read straight through the stripe.
const CAMP_CASING   = 'rgba(248,226,54,0.55)'
const CAMP_CASING_W = 6           // px — ~2.5x the road stroke
const MAP_INK       = '#1a1a1a'   // rules — neatline, collar ticks, scale bar
// Lettering is deliberately LIGHTER than the rules it sits between. On a sheet this dense the
// type is reference, not content: full-strength black pulled the eye to the margin and away from
// the terrain. Two strengths only — marginalia (which you read once) and place labels (which you
// hunt for), both alpha over the paper so they sit down into it rather than on top.
const MAP_TEXT      = 'rgba(26,26,26,0.5)'    // collar index, scale/interval notes, coords
const MAP_TEXT_POI  = 'rgba(16,16,16,0.68)'   // POI + mission-pin labels — still findable
const INDEX_EVERY   = 5           // every Nth contour is an index contour (so 50 m at CONTOUR_IV)
// Map lettering. No web font is loaded (browser-only, single origin, no external requests — see
// CLAUDE.md), so this is a stack that lands on Open Sans where it's installed and on the nearest
// humanist grotesque otherwise. Deliberately NOT monospace: the rest of the HUD is a terminal, the
// map is a printed sheet.
const MAP_LABEL_FONT = `'Open Sans', 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif`

// Contour interval, metres — a CONSTANT, the way a printed quadrangle states one interval for the
// whole sheet (owner, 2026-08-11). An earlier pass chose it per redraw from the terrain's slope so
// lines held a fixed screen spacing at any zoom; that read as the ground changing shape when you
// scrolled the wheel, which is exactly what a map must never do.
//
// The cost of the constant is at the extremes of the zoom range, and it is real: zoomed far out the
// 10 m lines pack tighter than a pixel and collapse into a burgundy wash. That is the honest
// behaviour of a fixed-interval sheet viewed at the wrong scale — see _drawTopo's density note.
const CONTOUR_IV = 20

// Height-field sampling. The field is `road._coarseH` — the SAME closure the router prices grade
// off and terrain.js builds the mesh from, so the contours describe the ground the truck drives.
// Its finest octave is a 250 m wavelength (coarseFreq 0.0005 × 2^3), so the step is capped well
// under half of that or the contours alias into noise.
const TOPO_STEP_PX  = 4           // target screen size of one sample cell
const TOPO_STEP_MIN = 4           // m — no finer than this (the field has no detail below it)
const TOPO_STEP_MAX = 24          // m — Nyquist guard against the 250 m octave
// Cells per axis, bounding the marching-squares cost per redraw. Scaled with BG_OVERSCAN below:
// the cached bitmap now covers OVERSCAN× the screen per axis, and holding the old cap would have
// silently coarsened the sample step by the same factor — aliasing the contours as a side effect
// of an unrelated change.
const TOPO_GRID_MAX = 480

// ── Hillshade ─────────────────────────────────────────────────────────────────────────────────
// Relief shading, multiplied into the ground fill. It is free in the sense that matters: it reads
// the SAME height grid _drawTopo already built for the contours, so it adds a pass over an array in
// hand and not one new sample of the field. Landing it in the cached background means it is paid
// once per settled pan/zoom, never per frame.
//
// Lit from the upper-LEFT of the screen. That is the cartographic convention, not a physical sun:
// lighting relief from the upper left is what makes a reader see ridges standing up instead of
// valleys — get it wrong and the terrain inverts perceptually.
//
// The angle is in WORLD xz, and the map draws +z DOWN the screen (see _sy), so "upper-left" means
// the light lies toward (−x, −z): azimuth 5π/4, not the 3π/4 this shipped with. 3π/4 puts it at
// (−x, +z) — lower-left — which is why the sheet read as lit from the bottom edge.
//
// The band is deliberately shallow. On the owner's reference the shading only takes the green from
// #e9f1db to about #d2d9c2, ~12%, and a heavier hand turns a printed sheet into a render — the
// contours are what carry the relief, the shade only tells you which way it faces.
const HILLSHADE_AZ  = Math.PI * 1.25   // rad — light from the screen's upper-left
const HILLSHADE_MIN = 0.88             // darkest multiplier on a fully-shaded slope
const HILLSHADE_K   = 2.2              // gradient → shade gain; ~1.0 saturates on a mild grade

// ── Ground cover raster ───────────────────────────────────────────────────────────────────────
// The green/white sheet is a small bitmap — one texel per COVER_CELL of world — scaled up under
// the contours with smoothing ON. That upscale is the whole trick: it costs one drawImage, and the
// bilinear filter is what gives clearings the soft organic edge of the reference instead of the
// stair-stepped 16 m blocks a per-cell fillRect would print.
//
// The raster is keyed to a FIXED WORLD LATTICE, never to the view. Same discipline as the terrain
// and scatter (D-16 window-invariance): a clearing has to have the same shape and the same edge
// whatever zoom you found it at, and a view-aligned raster would reshape it under the cursor.
// The three cover bins. Two fill colours only — COVER_HIGH prints the same green as COVER_MED and
// is told apart by carrying foliage glyphs, which is the reference's own vocabulary (owner,
// 2026-08-15: "low cover is white, med cover is green and high cover is foliage icon").
const COVER_LOW  = 0
const COVER_MED  = 1
const COVER_HIGH = 2
// Texels per lattice cell in the composed ground bitmap. 4 puts a texel every 4 m, which is what
// buys a hard cover boundary that still curves — the bins are interpolated and re-thresholded at
// this resolution rather than being blended by the upscale. Costs COVER_SS² array writes, all of
// them trivial, inside a redraw that is already debounced.
const COVER_SS   = 4
// Radius, in cells, the tree COUNTS are area-averaged over before they are binned. Since white
// became biome-only, this has exactly ONE remaining consumer: the MED/HIGH split, i.e. where
// foliage glyphs are stamped. Widened to 4 (a 144 m window) purely to make that region hold
// together — at r=1 a 42%-coverage cut has an edginess of ~1.07, which is visually indistinguishable
// from static; at r=4 the same coverage reads 0.69.
//
// ⚠ HONESTY NOTE — the med/high distinction is not describing anything real, and no tuning here can
// make it so. `clustersPerChunk` is a flat 4 and `treesPerCluster` a uniform [4,11], so per-cell
// tree count is Poisson sampling noise with NO low-frequency field behind it: this world has no
// dense stands and no thin stands, only uniform forest sampled unevenly. Every threshold on it
// therefore prints smoothed noise, and pushing for a smaller, "denser-looking" subset makes it
// worse, not better (blur r=4: 42% → edginess 0.69, but 2% → 1.86).
//
// This is the same shape of problem as white ground before biomes existed, and it has the same two
// honest fixes: collapse to two bins (open / forest), or give the scatter a real low-frequency
// density field that BOTH the world and the map read. Flagged to the owner 2026-08-15; the current
// values are the best available compromise pending that ruling, not a solution.
const COVER_COUNT_BLUR = 4
// Safety cap on chunks whose SCATTER REPLAY is resolved in one background redraw. The real gate is
// glyph visibility (see _glyphsVisible) — the replay's only product is the MED/HIGH split, and that
// only shows as foliage glyphs — so this exists purely to bound the pathological case where glyphs
// are just barely visible across an enormous sheet.
//
// Sized against measurement: the replay costs ~31 us a chunk, so 16000 is ~0.5 s, paid once per
// chunk for the life of the seed and inside an already-debounced redraw. It was 1400, then 6000,
// and both were still cutting in at ordinary reading zooms — the cached background is OVERSCANNED
// 2x per axis, so it covers 4x the chunks on screen. At GLYPH_MIN_PX the sheet spans ~4.4k chunks
// on a 1200x800 canvas and ~9.5k on a 1920x1080 one, so anything under ~10000 makes the foliage
// pop-in depend on the WINDOW SIZE rather than on the zoom. This must stay comfortably above that
// or the two glyph plates drift apart again.
const COVER_CHUNK_BUDGET = 16000

// ── Water ─────────────────────────────────────────────────────────────────────────────────────
// Rivers and ponds, straight off the play WaterSystem (injected — see the getWater ctor option).
// Both queries are cell-cached inside that system, so this is a fetch and not a generation pass.
const WATER_INK     = '#4da2e8'   // stream centreline + pond outline — the reference's blue
const WATER_FILL    = '#bcdcf5'   // pond body
const WATER_W       = 1.6         // px — stream stroke weight
const WATER_MARGIN  = 200         // m — bbox slop so a stream entering from off-sheet is drawn
// Max texels per side of a pond's shoreline raster — see _drawPond. Bounds the cost of a large
// pond at high zoom; past this the shore is resolved coarser than one screen pixel, which no
// reader can tell from the exact one.
const POND_TEXELS_MAX = 192

// ── Vegetation + wet-ground glyphs ────────────────────────────────────────────────────────────
// Both are stamped on a JITTERED WORLD LATTICE, for the same reason the cover raster is
// world-keyed: a glyph has to stay on the tuft of marsh it marks when you zoom, and a
// screen-space scatter would make the whole sheet crawl.
const GLYPH_TREE_INK = '#4a7f3c'   // conifer marks in forested cells
const GLYPH_WET_INK  = '#7db6de'   // marsh tick-tufts on wet ground
const GLYPH_CELL     = 26          // m — nominal lattice spacing between glyph slots
const GLYPH_PX       = 7           // px — drawn size of one glyph
// Glyphs are a texture, not data: below this on-screen spacing they merge into a smear and are
// simply not drawn. This is also the cost bound — it caps how many can ever land on one sheet.
//
// 9 → 12 → 16 (owner, 2026-08-15: "a little more zoomed in", then "even more"). ONE number now
// governs BOTH marks, which
// it did not in practice before: the marsh tufts appeared here while the conifers waited for the
// scatter replay, and the replay was being held off by COVER_CHUNK_BUDGET until a noticeably closer
// zoom, so the two plates popped in at different heights. That is fixed at both ends — the budget
// below no longer binds at this threshold, and the glyph pass now refuses to stamp EITHER mark
// unless the replay ran (see _drawGlyphs).
const GLYPH_MIN_PX   = 16

// Drainage — what makes ground read as WET — lives in src/biome.js (isWetGround) with its
// thresholds in data/biomes.js, alongside the meadow test it is the small-radius sibling of. It was
// once inlined here on its own lattice with its own constants, which made it impossible to see that
// the two were the same idea, and left it covering 0.47% of ground.

// ── Background overscan ───────────────────────────────────────────────────────────────────────
// The cached background is rendered OVERSCAN× the screen in each axis, centred on the view, so
// half a screen of map already exists off every edge. Mid-drag, render() blits that bitmap at an
// offset (the sharp redraw waits for the gesture to settle — see _deferBgRedraw); at 1× the
// leading edge had nothing to reveal and scrolled in blank until you let go, which read as the
// map being generated under you. With the margin the sheet feels pre-printed: you are dragging a
// window over paper that is already drawn.
//
// It is a cheat, not a guarantee — drag further than the margin in one gesture and you outrun it.
// Costs OVERSCAN² in redraw work and bitmap memory, which is why it is 2 and not 3.
const BG_OVERSCAN = 2

// ── The collar (border) ───────────────────────────────────────────────────────────────────────
// The sheet is buried in an off-white margin carrying tick marks and an A–Z / 1–n index, so any
// single frame reads as a photograph of a whole printed map rather than as a viewport onto one.
// The collar is drawn PER FRAME over the top of everything (never into the cached background):
// it is fixed to the screen while the sheet slides under it, and painting it last also masks
// whatever the map layer bled into the margin — no clip-region juggling.
const COLLAR_CREAM  = '#f2efe4'   // the off-white paper of the margin
const COLLAR        = 30          // px — margin on the top/left/right edges
const COLLAR_BOTTOM = 56          // px — deeper: it also carries the scale bar + interval note
const COLLAR_TICK   = 7           // px — length of a grid tick into the margin
// World size of one index cell, metres. Chosen per frame from this ladder so a cell lands near
// GRID_CELL_PX on screen — the index has to stay countable across the whole zoom range.
const GRID_LADDER   = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000]
const GRID_CELL_PX  = 165
const GRID_LETTERS  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
// Car marker, nose-to-tail half-length in px (9 originally, 18 at the 2x pass). The triangle's
// half-width is derived from it so the arrow keeps its taper instead of going stubby or needly.
const CAR_ICON_L = 13.5

// ── Ground-wash helpers (module scope: pure, no instance state) ────────────────────────────────

/**
 * Separable box blur over a scalar field. Softens the printed edge of a clearing so the cover
 * raster's 16 m lattice does not read as squares once it is scaled up.
 */
function boxBlur(src, w, h, r) {
    if (r < 1) return src
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h)
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            let sum = 0, n = 0
            for (let k = -r; k <= r; k++) {
                const ii = i + k
                if (ii < 0 || ii >= w) continue
                sum += src[j * w + ii]; n++
            }
            tmp[j * w + i] = sum / n
        }
    }
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            let sum = 0, n = 0
            for (let k = -r; k <= r; k++) {
                const jj = j + k
                if (jj < 0 || jj >= h) continue
                sum += tmp[jj * w + i]; n++
            }
            out[j * w + i] = sum / n
        }
    }
    return out
}

/**
 * Is (x,z) inside a stream's channel? The same test WaterSystem.streamChannelAt runs, against a
 * stream record the caller has ALREADY fetched — the map tests hundreds of points against the same
 * handful of streams, and going through streamChannelAt would re-run a bbox stream query per point.
 */
function inStreamChannel(st, x, z) {
    const pad = (st.maxWidth ?? st.width) + st.bankWidth
    const pts = st.points
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]
        const abx = b.x - a.x, abz = b.z - a.z
        const len2 = abx * abx + abz * abz
        if (len2 < 1e-9) continue
        let t = ((x - a.x) * abx + (z - a.z) * abz) / len2
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const px = a.x + abx * t - x, pz = a.z + abz * t - z
        if (px * px + pz * pz < pad * pad) return true
    }
    return false
}

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
    constructor({ canvas, getSeed, getParams, getCar, onTeleport, canTeleport, getMission, getRegion, getPois, getCustomers, getCampZones, getWater, getRouteState }) {
        this._canvas    = canvas
        this._ctx       = canvas.getContext('2d')
        this._getSeed   = getSeed
        this._getParams = getParams
        this._getCar    = getCar
        this._onTeleport  = onTeleport   || null
        this._canTeleport = canTeleport  || (() => false)
        this._getMission  = getMission   || (() => null)
        // FEAT-43: story-mode region boundary — {x,z,r} or null. Drawn as a wall + dimmed exterior
        // so the player can see where the region ends instead of discovering it by hitting it.
        this._getRegion   = getRegion    || (() => null)
        // FEAT-46: story-mode POIs. This is how the player finds one — see an icon, drive to it,
        // park (latch the handbrake). Empty outside story mode.
        this._getPois     = getPois      || (() => null)
        this._getCustomers = getCustomers || (() => null)   // FEAT-61 newspaper customers
        // FEAT-61: `{ onRoute: boolean, arrow: {x,z,ang}|null }`, or null when nothing is driving it.
        // onRoute is TRUE ONLY ON A PAPER ROUTE and drives the customer glyph (see _drawCustomers);
        // arrow is the start direction of whatever mission line is drawn (see _drawStartArrow), and
        // the two are independent — a POI mission has an arrow and onRoute false.
        this._getRouteState = getRouteState || (() => null)
        // FEAT-45: story-mode dispersed-camping zones — `{x,z,r}[]`, empty outside story mode. NOT
        // drawn as discs: see _drawCampZones.
        this._getCampZones = getCampZones || (() => null)
        // The play WaterSystem. Read-only, and OPTIONAL — without it the sheet simply prints no
        // rivers and the cover raster stops rejecting trees for standing in water, which is a
        // degradation and not a crash (the headless gates construct the map this way).
        this._getWater    = getWater     || null
        // FEAT-60: one Path2D per POI type, built on first draw (see _drawPois).
        this._iconPaths = new Map()

        // Tree-cover memo, keyed 'cx,cz'. Cover is a property of the WORLD, so an entry stays valid
        // across every pan and zoom for the life of the seed — this is what makes _coverRaster
        // affordable. Cleared on a seed change (see _ensureRoad), never on a view change.
        this._coverMemo   = new Map()
        this._coverCanvas = null   // offscreen the ground bitmap is scaled from; reused across redraws
        this._pondCanvas  = null   // offscreen one pond's shoreline raster is built in (see _drawPond)
        this._coverGrid   = null   // last resolved lattice — handed from _paintGround to _drawGlyphs

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
        this._radiusCap    = MAP_RADIUS_MAX   // FEAT-43: raised by setRadiusCap inside story mode
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
        this._bgOffX  = 0                // overscan margin (px); real values set in _resize
        this._bgOffY  = 0
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
    /**
     * FEAT-43: raise the streaming cap above MAP_RADIUS_MAX. Story mode calls this so the map can
     * draw the network out to its region boundary — otherwise the outer ring of a 2.5 km region is
     * blank map inside a drawn wall, which reads as "the roads stop here" rather than "the map
     * hasn't built that far". Safe there because the region's routes are already cached; do NOT
     * call it from free roam, where those rings would route cold.
     */
    setRadiusCap(r) { this._radiusCap = Math.max(MAP_RADIUS, r) }

    setRadiusTarget(r) {
        const want = Math.max(MAP_RADIUS, Math.min(this._radiusCap ?? MAP_RADIUS_MAX, r))
        if (want <= this._radiusTarget) return
        this._radiusTarget = want
        this._streamFull = false
        if (this._open) this._startStream()
    }

    /**
     * FEAT-43: in story mode the network is streamed ONCE, around the region centre, and then left
     * alone (owner, 2026-08-11).
     *
     * Free roam has to chase the pan cursor: the world is unbounded, so the only way to show the
     * road under your cursor is to re-stream around it. A story-mode region is not unbounded —
     * main.js already asks for `region.r + 200` on open, so a single stream anchored at the centre
     * covers everything the player can legally reach, and re-centring it on every pan is pure
     * churn. Measured on a 2.5 km region: each re-stream update ran ~2.2 s and the map issues one
     * per radius step, and because the window is a DISC being dragged around a region it already
     * covered, an 850 m pan dropped 21 edges off the trailing side while gaining 15 on the leading
     * one — strictly less map, for seconds of main-thread work.
     *
     * Returns the region when one stream from its centre covers it, else null (→ cursor-follow).
     */
    _regionLock() {
        const reg = this._getRegion()
        if (!reg) return null
        return this._radiusTarget >= reg.r ? reg : null
    }

    // The world point the network is streamed around: the region centre when locked, else the pan
    // cursor. Single source of truth for both _startStream and the drift checks that trigger it —
    // if those two disagreed, a locked map would re-stream forever chasing a centre it never moves to.
    _streamAnchor() {
        const lock = this._regionLock()
        return lock ? { x: lock.x, z: lock.z } : { x: this._panX, z: this._panZ }
    }

    // Has the anchor moved far enough from what we last streamed around to need another pass?
    // Always false once a locked region is fully streamed — which is the whole point.
    _anchorDrifted() {
        if (!this._streamAt) return true
        const a = this._streamAnchor()
        return Math.hypot(a.x - this._streamAt.x, a.z - this._streamAt.z) > RESTREAM_MOVE
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
        if (!this._road || sig !== this._sig) {
            this._buildRoad(); this._sig = sig
            // The memo is keyed by chunk only, so it MUST be dropped with the signature it was
            // resolved under — a new seed puts a different forest in the same chunk coordinates,
            // and a stale entry would print the old world's clearings on the new one.
            this._coverMemo.clear()
        }

        if (!this._centeredOnce) {
            const car = this._getCar()
            this._panX = car.x; this._panZ = car.z
            this._centeredOnce = true
        }
        // Resume/begin the chunked stream unless the anchor is already fully streamed.
        if (!this._streamFull || this._anchorDrifted()) this._startStream()

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
        // Fit to the SHEET, not the window — the collar is border, not map, and a route framed to
        // the full canvas would put its endpoints under the border.
        const { w, h } = this._sheet()
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
        if (this._anchorDrifted()) {
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
    // A signature over the seed + every road*/tunnel* param, so the kept instance is rebuilt iff
    // the network it represents could have changed (mode/graph-knob/tunnel tuning) — and reused
    // (instant) otherwise. tunnel* is separate from road* on purpose (routeCacheSig must not see
    // it — FEAT-40), but the tunnel pass DOES change spans/profiles, so the map must re-stream.
    _paramSig() {
        const p = this._getParams()
        let s = 'seed=' + this._getSeed()
        for (const k of Object.keys(p)) if (/^road|^tunnel/i.test(k) && typeof p[k] !== 'function') s += '|' + k + '=' + p[k]
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
        }
    }

    // Begin/restart the chunked stream around the anchor (pan cursor in free roam, region centre in
    // story mode — see _regionLock): grow the radius through MAP_RADIUS_STEPS one chunk per timer
    // tick, marking the bg dirty after each so the network visibly fills in. Already-routed edges
    // hit the warm route cache, so re-streaming a centre that's already covered is comparatively
    // cheap — but not free, which is why a locked region never asks for a second pass.
    _startStream() {
        clearTimeout(this._pumpTimer)
        // Restart the radius growth from the smallest step for the NEW center (first ring paints fast).
        this._streamStep = 0
        this._streamFull = false
        const a = this._streamAnchor()
        this._streamCenter = new THREE.Vector3(a.x, 0, a.z)
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
    // The sheet — the drawable map area inside the collar. The collar is deeper at the bottom
    // (scale bar + interval note), so this rect is NOT canvas-centred, and the whole view
    // transform hangs off ITS centre instead. Anything that converts between world and screen
    // must go through here, or the map slides out from under its own border: _sx/_sy, the
    // wheel-zoom anchor, the double-click pick, the cached-background blit delta, and the
    // sample-grid origin in _drawTopo all share this one definition.
    _sheet() {
        const W = this._canvas.clientWidth, H = this._canvas.clientHeight
        const x0 = COLLAR, y0 = COLLAR, x1 = W - COLLAR, y1 = H - COLLAR_BOTTOM
        return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
    }

    _sx(wx) { return (wx - this._panX) * this._zoom + this._sheet().cx }
    _sy(wz) { return (wz - this._panZ) * this._zoom + this._sheet().cy }

    _resize() {
        const dpr = window.devicePixelRatio || 1
        const w = window.innerWidth, h = window.innerHeight
        this._canvas.width = Math.round(w * dpr)
        this._canvas.height = Math.round(h * dpr)
        // The cached background is bigger than the screen on every side — see BG_OVERSCAN.
        this._bgOffX = Math.round(w * (BG_OVERSCAN - 1) / 2)
        this._bgOffY = Math.round(h * (BG_OVERSCAN - 1) / 2)
        this._bg.width  = Math.round(w * BG_OVERSCAN * dpr)
        this._bg.height = Math.round(h * BG_OVERSCAN * dpr)
        this._canvas.style.width = w + 'px'
        this._canvas.style.height = h + 'px'
        this._dpr = dpr
        // Fit MAP_RADIUS*2 to the short edge of the SHEET (not the window) on the very first
        // sizing — the collar is not drawable, so fitting to the window would push the outer ring
        // of the network under the border.
        if (!this._zoomInit) {
            const s = this._sheet()
            this._zoom = Math.min(s.w, s.h) / (MAP_RADIUS * 2)
            this._zoomInit = true
        }
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
        // Re-stream (chunked) only if the anchor drifted far from where we last streamed, and
        // debounced so a flurry of small drags doesn't kick off repeated streams. Inside a locked
        // story region the anchor never moves, so panning costs nothing at all.
        if (this._anchorDrifted()) {
            clearTimeout(this._streamTimer)
            this._streamTimer = setTimeout(() => this._startStream(), STREAM_DEBOUNCE)
        }
    }

    _onWheelEvent(e) {
        e.preventDefault()
        // Zoom about the cursor — a PURE canvas transform, no re-stream.
        const rect = this._canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left, my = e.clientY - rect.top
        const s = this._sheet()
        // World point under the cursor before zoom.
        const wx = (mx - s.cx) / this._zoom + this._panX
        const wz = (my - s.cy) / this._zoom + this._panZ
        const factor = Math.exp(-e.deltaY * 0.0015)
        this._zoom = Math.max(0.005, Math.min(4, this._zoom * factor))
        // Keep that same world point under the cursor after zoom.
        this._panX = wx - (mx - s.cx) / this._zoom
        this._panZ = wz - (my - s.cy) / this._zoom
        this._deferBgRedraw()   // scale-blit until the wheel goes quiet, then one sharp redraw
    }

    // Double-click → teleport the truck here (free-roam only). Snaps to the nearest road within
    // TELEPORT_SNAP_RADIUS using the map's OWN read-only network (window-invariant, so world coords
    // resolve identically to play), passing the road-top Y + tangent heading to main.js. When no
    // road is near, passes the raw clicked XZ (main drops on terrain, keeps the current heading).
    _onDblClick(e) {
        if (!this._canTeleport() || !this._onTeleport || !this._road) return
        const rect = this._canvas.getBoundingClientRect()
        const s = this._sheet()
        const wx = (e.clientX - rect.left - s.cx) / this._zoom + this._panX
        const wz = (e.clientY - rect.top  - s.cy) / this._zoom + this._panZ
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
        const s = this._sheet()
        // (dx, dy) maps a SCREEN coord in the bg's frame to one in the current frame. The bitmap's
        // pixel (0,0) is screen (-bgOffX, -bgOffY) in that frame — it was drawn through a translate
        // by the overscan margin — so the destination corner backs off by that margin, scaled.
        const dx = s.cx - k * s.cx + (this._bgPanX - this._panX) * this._zoom
        const dy = s.cy - k * s.cy + (this._bgPanZ - this._panZ) * this._zoom
        ctx.drawImage(this._bg,
                      dx - k * this._bgOffX, dy - k * this._bgOffY,
                      W * BG_OVERSCAN * k, H * BG_OVERSCAN * k)

        this._drawRegion(ctx)    // under the mission route — it's world furniture, not the subject
        this._drawCampZones(ctx) // FEAT-45: yellow casing on the road stretches inside a camp zone
        this._drawTunnels(ctx)   // FEAT-40: over the casing — a bore inside a zone must still read
        this._drawCustomers(ctx) // FEAT-61: newspaper customers, UNDER the POIs — there are 15 of
                                 // them and one of them is mom, so they must never mask a landmark
        this._drawPois(ctx)      // likewise furniture: placed at entry, so not in the cached bg
        this._drawMission(ctx)   // under the car marker, over the cached bg
        this._drawStartArrow(ctx)   // FEAT-61: which way to set off, on any drawn mission line
        this._drawCar(ctx)
        this._drawCollar(ctx)    // LAST of the map layers: it masks the margin (see _drawCollar)
        this._drawCursorCoords(ctx)
        if (this._canTeleport()) this._drawTeleportPrompt(ctx)
        if (this._streaming) this._drawStreamingBadge(ctx)
    }

    // Top-center hint that double-clicking teleports (free-roam only).
    // Transient HUD chips (this and the streaming badge) sit just INSIDE the neatline — they are
    // app chrome rather than map content, so they must not cover the collar's index lettering.
    _drawTeleportPrompt(ctx) {
        const s = this._sheet()
        const txt = 'double click to teleport'
        ctx.font = `12px ${MAP_LABEL_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        const w = ctx.measureText(txt).width + 22
        const cx = (s.x0 + s.x1) / 2
        ctx.fillStyle = 'rgba(242,239,228,0.92)'; ctx.fillRect(cx - w / 2, s.y0 + 10, w, 24)
        ctx.strokeStyle = MAP_INK; ctx.lineWidth = 1
        ctx.strokeRect(cx - w / 2 + 0.5, s.y0 + 10.5, w - 1, 23)
        ctx.fillStyle = MAP_TEXT; ctx.fillText(txt, cx, s.y0 + 22)
        ctx.textAlign = 'left'
    }

    // Road-Feel QoL: seed / x / z of the world point under the cursor. Same screen→world transform
    // as the wheel-zoom anchor. Set as marginalia in the bottom collar (dev text belongs in the
    // margin, not over the map) — hence no dark chip behind it any more.
    _drawCursorCoords(ctx) {
        if (this._hoverX === undefined) return
        const H = this._canvas.clientHeight
        const s = this._sheet()
        const wx = (this._hoverX - s.cx) / this._zoom + this._panX
        const wz = (this._hoverY - s.cy) / this._zoom + this._panZ
        ctx.font = `11px ${MAP_LABEL_FONT}`
        ctx.textBaseline = 'middle'; ctx.textAlign = 'center'
        ctx.fillStyle = MAP_TEXT
        ctx.fillText(`seed ${this._getSeed()} · ${wx.toFixed(0)}, ${wz.toFixed(0)}`,
                     (s.x0 + s.x1) / 2, (s.y1 + H) / 2 + 8)
        ctx.textAlign = 'left'
    }

    // Small bottom-center badge while the network is still filling in (chunked stream in flight).
    _drawStreamingBadge(ctx) {
        const s = this._sheet()
        const txt = `streaming network… ${Math.round(100 * this._streamStep / this._radiusSteps().length)}%`
        ctx.font = `12px ${MAP_LABEL_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        const w = ctx.measureText(txt).width + 22
        const cx = (s.x0 + s.x1) / 2
        ctx.fillStyle = 'rgba(242,239,228,0.92)'; ctx.fillRect(cx - w / 2, s.y1 - 36, w, 24)
        ctx.strokeStyle = MAP_INK; ctx.lineWidth = 1
        ctx.strokeRect(cx - w / 2 + 0.5, s.y1 - 35.5, w - 1, 23)
        ctx.fillStyle = '#8a5a00'; ctx.fillText(txt, cx, s.y1 - 24)
        ctx.textAlign = 'left'
    }

    _drawBackground() {
        const ctx = this._bg.getContext('2d')
        const W = this._canvas.clientWidth, H = this._canvas.clientHeight
        const ox = this._bgOffX, oy = this._bgOffY
        // Translate by the overscan margin so every layer below can keep drawing in ordinary
        // SCREEN coordinates via _sx/_sy — the margin then falls outside [0,W]x[0,H] naturally,
        // and nothing but this line has to know the bitmap is oversized.
        ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0)
        ctx.clearRect(0, 0, W * BG_OVERSCAN, H * BG_OVERSCAN)
        ctx.translate(ox, oy)
        // Record the transform this bitmap is valid for — render() blits through the delta.
        this._bgPanX = this._panX; this._bgPanZ = this._panZ; this._bgZoom = this._zoom

        this._drawTopo(ctx, -ox, -oy, W + ox, H + oy)
        // Water and the vegetation/marsh glyphs go OVER the contours and UNDER the roads, which is
        // the order a quadrangle is printed in: the blue plate reads through the brown, and the
        // black road plate covers both.
        this._drawWater(ctx)
        this._drawGlyphs(ctx)
        this._drawRoads(ctx)
        this._drawCrossings(ctx)
        this._drawNodes(ctx)
    }

    // (1) The topographic sheet: pale-green vegetated ground + brown contour lines.
    //
    // Contours come straight off the height field the rest of the sim already agrees on
    // (`road._coarseH`, ×terrainAmplitude so the labels are the metres the truck actually climbs).
    // Sample a regular grid over the view, then MARCHING SQUARES it once per crossed level: each
    // grid cell knows which levels pass through it from its own min/max, so the whole field is
    // walked ONE time regardless of how many contours are on screen — the naive "sweep the grid per
    // level" costs levels× more for an identical picture.
    //
    // Segments are emitted disjointly (no contour tracing / polyline stitching). With a round
    // lineCap the joins are invisible at any zoom this map supports, and it saves carrying the
    // edge-adjacency bookkeeping that tracing needs. Cost lands only in the CACHED background
    // redraw, which is already debounced behind a settled pan/zoom (see _deferBgRedraw).
    /**
     * @param ctx
     * @param px0,py0,px1,py1 — the SCREEN-space rect to cover. Not necessarily the canvas: the
     *        cached background is overscanned, so this is normally inset by a negative margin on
     *        two sides and past the canvas on the other two.
     */
    _drawTopo(ctx, px0, py0, px1, py1) {
        const road = this._road
        if (!road) return
        const amp = this._getParams().terrainAmplitude ?? 1
        const Wpx = px1 - px0, Hpx = py1 - py0

        // Ground first — the green/white cover wash with hillshade multiplied through it. Painted
        // as one scaled bitmap, so everything below (water, glyphs, contours, roads) draws over a
        // finished sheet in the order a printer would lay them down.
        this._paintGround(ctx, px0, py0, Wpx, Hpx, amp)

        // ── Sample grid. One cell margin past each edge so contours reach the rect's border
        //    instead of stopping a cell short of it.
        let step = Math.min(TOPO_STEP_MAX, Math.max(TOPO_STEP_MIN, TOPO_STEP_PX / this._zoom))
        let nx = Math.ceil(Wpx / (step * this._zoom)) + 3
        let nz = Math.ceil(Hpx / (step * this._zoom)) + 3
        if (nx > TOPO_GRID_MAX || nz > TOPO_GRID_MAX) {
            const k = Math.max(nx, nz) / TOPO_GRID_MAX
            step *= k
            nx = Math.ceil(nx / k); nz = Math.ceil(nz / k)
        }
        // World origin of the grid = the world point under the rect's top-left screen corner,
        // backed off one cell.
        const s = this._sheet()
        const x0 = this._panX + (px0 - s.cx) / this._zoom - step
        const z0 = this._panZ + (py0 - s.cy) / this._zoom - step

        const h = new Float32Array(nx * nz)
        for (let j = 0; j < nz; j++) {
            const wz = z0 + j * step
            for (let i = 0; i < nx; i++) h[j * nx + i] = road._coarseH(x0 + i * step, wz) * amp
        }

        // Grid line positions in SCREEN space, precomputed — the marching-squares inner loop then
        // interpolates in px directly (linear either way) instead of going through _sx/_sy per hit.
        const gx = new Float64Array(nx), gy = new Float64Array(nz)
        for (let i = 0; i < nx; i++) gx[i] = this._sx(x0 + i * step)
        for (let j = 0; j < nz; j++) gy[j] = this._sy(z0 + j * step)

        const iv = CONTOUR_IV

        // Two batches: intermediate contours and index contours (every INDEX_EVERY-th, drawn
        // heavier — the reading aid that lets you count elevation without tracing every line).
        const thin = [], thick = []

        for (let j = 0; j < nz - 1; j++) {
            const r0 = j * nx, r1 = r0 + nx
            for (let i = 0; i < nx - 1; i++) {
                const a = h[r0 + i], b = h[r0 + i + 1], c = h[r1 + i + 1], d = h[r1 + i]
                let lo = a, hi = a
                if (b < lo) lo = b; else if (b > hi) hi = b
                if (c < lo) lo = c; else if (c > hi) hi = c
                if (d < lo) lo = d; else if (d > hi) hi = d
                const k0 = Math.ceil(lo / iv), k1 = Math.floor(hi / iv)
                if (k1 < k0) continue
                const xl = gx[i], xr = gx[i + 1], yt = gy[j], yb = gy[j + 1]
                for (let k = k0; k <= k1; k++) {
                    const v = k * iv
                    // Corner classification: a=top-left, b=top-right, c=bottom-right, d=bottom-left.
                    const idx = (a > v ? 8 : 0) | (b > v ? 4 : 0) | (c > v ? 2 : 0) | (d > v ? 1 : 0)
                    if (idx === 0 || idx === 15) continue
                    const out = (k % INDEX_EVERY === 0) ? thick : thin
                    // Crossing point on each edge, lerped by value. Only the edges the case needs
                    // are read (the ternaries below), so no wasted interpolation.
                    const tx = () => xl + (xr - xl) * ((v - a) / (b - a))     // top edge
                    const bx = () => xl + (xr - xl) * ((v - d) / (c - d))     // bottom edge
                    const ly = () => yt + (yb - yt) * ((v - a) / (d - a))     // left edge
                    const ry = () => yt + (yb - yt) * ((v - b) / (c - b))     // right edge
                    switch (idx) {
                        case 1: case 14: out.push(xl, ly(), bx(), yb); break              // left ↔ bottom
                        case 2: case 13: out.push(bx(), yb, xr, ry()); break              // bottom ↔ right
                        case 3: case 12: out.push(xl, ly(), xr, ry()); break              // left ↔ right
                        case 4: case 11: out.push(tx(), yt, xr, ry()); break              // top ↔ right
                        case 6: case  9: out.push(tx(), yt, bx(), yb); break              // top ↔ bottom
                        case 7: case  8: out.push(xl, ly(), tx(), yt); break              // top ↔ left
                        // Saddles: two disjoint arcs through the cell. Resolved the same way every
                        // time rather than by the corner average — at this cell size the two
                        // readings differ by a sub-pixel wiggle, and a consistent choice keeps
                        // neighbouring cells agreeing on which way the pass runs.
                        case 5:  out.push(xl, ly(), tx(), yt,  bx(), yb, xr, ry()); break
                        case 10: out.push(tx(), yt, xr, ry(),  xl, ly(), bx(), yb); break
                    }
                }
            }
        }

        const strokeBatch = (segs, color, width) => {
            if (!segs.length) return
            ctx.strokeStyle = color
            ctx.lineWidth = width
            ctx.lineCap = 'round'
            ctx.beginPath()
            for (let s = 0; s < segs.length; s += 4) {
                ctx.moveTo(segs[s], segs[s + 1])
                ctx.lineTo(segs[s + 2], segs[s + 3])
            }
            ctx.stroke()
            ctx.lineCap = 'butt'
        }
        // The index contour is separated from the intermediates by INK first and weight second —
        // both are hairlines now, so a width ratio alone would not have carried the distinction.
        strokeBatch(thin,  CONTOUR_COLOR, CONTOUR_W)
        strokeBatch(thick, INDEX_COLOR,   INDEX_W)
    }

    // (1a) The ground wash: green where the forest stands, white where it does not, hillshaded.
    //
    // Both layers resolve onto ONE world-aligned lattice and leave as a single ImageData, scaled up
    // under the contours with smoothing on. That is what buys the soft clearing edges — a per-cell
    // fillRect would print 16 m stair-steps no matter how the thresholds were tuned.
    //
    // The lattice can be sampled this coarsely because of what the height field is: `_coarseH`'s
    // finest octave is a 250 m wavelength, so a 16 m lattice is four times finer than Nyquist and
    // the hillshade is fully resolved, not approximated.
    //
    // Leaves `this._coverGrid` behind for _drawWater (its bbox) and _drawGlyphs (the cover bins it
    // just resolved, rather than resolving them twice). Redraw-local: written and consumed inside
    // one cached-background rebuild.
    _paintGround(ctx, px0, py0, Wpx, Hpx, amp) {
        const road = this._road
        const zoom = this._zoom
        const s = this._sheet()

        // World rect under the screen rect, snapped OUT to the cover lattice. Snapping is what
        // makes the raster window-invariant: the texel covering a given patch of world is the same
        // texel at every pan and zoom, so a clearing keeps its shape instead of shimmering.
        const wx0 = Math.floor((this._panX + (px0 - s.cx) / zoom) / COVER_CELL) * COVER_CELL
        const wz0 = Math.floor((this._panZ + (py0 - s.cy) / zoom) / COVER_CELL) * COVER_CELL
        const wx1 = Math.ceil((this._panX + (px0 + Wpx - s.cx) / zoom) / COVER_CELL) * COVER_CELL
        const wz1 = Math.ceil((this._panZ + (py0 + Hpx - s.cy) / zoom) / COVER_CELL) * COVER_CELL

        const gw = Math.max(2, Math.round((wx1 - wx0) / COVER_CELL))
        const gh = Math.max(2, Math.round((wz1 - wz0) / COVER_CELL))

        // Heights on the lattice, for the hillshade gradient.
        const hg = new Float32Array(gw * gh)
        for (let j = 0; j < gh; j++) {
            const wz = wz0 + j * COVER_CELL
            for (let i = 0; i < gw; i++) hg[j * gw + i] = road._coarseH(wx0 + i * COVER_CELL, wz) * amp
        }

        // Cover, if the sheet is close enough in for it to mean anything — see COVER_CHUNK_BUDGET.
        const { bin: cover, replayed } = this._coverRaster(wx0, wz0, gw, gh)
        // Handed to _drawWater (for its bbox) and _drawGlyphs (for the cover bins). NOT the height
        // lattice: the only thing that read it was the old inlined wet test, and drainage now
        // samples the field directly at each glyph — see isWetGround.
        //
        // `replayed` travels with the bins because the glyph pass has to know whether the MED/HIGH
        // split in them is real; see _drawGlyphs.
        this._coverGrid = { wx0, wz0, gw, gh, cover, replayed }

        // ── Compose, at COVER_SS texels per lattice cell.
        //
        // The supersample is what lets the cover stay HARD-EDGED without printing 16 m squares. The
        // bins are interpolated as a continuous field and then re-thresholded per texel, so a
        // boundary follows a smooth curve through the lattice while every texel on either side of
        // it is exactly white or exactly green — never a blend of the two. Letting the upscale
        // filter do it instead would fade green into white across the seam, which is the one thing
        // a binned sheet must not do.
        //
        // Hillshade is interpolated normally: it IS a continuous quantity, and it is the one soft
        // thing the owner asked for.
        const iw = gw * COVER_SS, ih = gh * COVER_SS
        const img = ctx.createImageData(iw, ih)
        const px = img.data
        const gR = parseInt(PAPER_GREEN.slice(1, 3), 16), gG = parseInt(PAPER_GREEN.slice(3, 5), 16),
              gB = parseInt(PAPER_GREEN.slice(5, 7), 16)
        const oR = parseInt(PAPER_OPEN.slice(1, 3), 16), oG = parseInt(PAPER_OPEN.slice(3, 5), 16),
              oB = parseInt(PAPER_OPEN.slice(5, 7), 16)
        const lx = Math.cos(HILLSHADE_AZ), lz = Math.sin(HILLSHADE_AZ)

        // Per-cell shade, computed once on the lattice and interpolated per texel below.
        const shadeG = new Float32Array(gw * gh)
        for (let j = 0; j < gh; j++) {
            for (let i = 0; i < gw; i++) {
                // Central differences, clamped at the border (a one-sided difference there would
                // draw a bright or dark rule down the edge of every cached bitmap — and with a 2x
                // overscan those seams land mid-sheet, not off it).
                const iL = i > 0 ? i - 1 : i, iR = i < gw - 1 ? i + 1 : i
                const jU = j > 0 ? j - 1 : j, jD = j < gh - 1 ? j + 1 : j
                const dx = (hg[j * gw + iR] - hg[j * gw + iL]) / ((iR - iL) * COVER_CELL || 1)
                const dz = (hg[jD * gw + i] - hg[jU * gw + i]) / ((jD - jU) * COVER_CELL || 1)
                // Slope-aspect dot with the light. Not a physical lambert — a shallow, clamped
                // ramp, because the job is to say which way a face turns, not to render it.
                const lit = Math.max(-1, Math.min(1, -(dx * lx + dz * lz) * HILLSHADE_K))
                shadeG[j * gw + i] = 1 + (lit < 0 ? lit : lit * 0.35) * (1 - HILLSHADE_MIN)
            }
        }

        // Bilinear read of a lattice field at texel (u,v), in lattice units.
        const lerpG = (fld, u, v) => {
            const i0 = Math.min(gw - 1, Math.max(0, Math.floor(u))), i1 = Math.min(gw - 1, i0 + 1)
            const j0 = Math.min(gh - 1, Math.max(0, Math.floor(v))), j1 = Math.min(gh - 1, j0 + 1)
            const fu = u - i0, fv = v - j0
            const a = fld[j0 * gw + i0], b = fld[j0 * gw + i1]
            const c = fld[j1 * gw + i0], d = fld[j1 * gw + i1]
            return (a + (b - a) * fu) + ((c + (d - c) * fu) - (a + (b - a) * fu)) * fv
        }

        for (let jj = 0; jj < ih; jj++) {
            const v = (jj + 0.5) / COVER_SS - 0.5
            for (let ii = 0; ii < iw; ii++) {
                const u = (ii + 0.5) / COVER_SS - 0.5
                const shade = lerpG(shadeG, u, v)

                // Cover → one of two fills, thresholded, never blended. `cover` is null past the
                // budget, which prints plain green: at that zoom the pattern is sub-pixel anyway.
                // The cut sits at COVER_LOW..COVER_MED's midpoint, so it is the LOW/MED boundary
                // that gets drawn — HIGH and MED share a fill and are told apart by glyphs.
                const open = cover ? lerpG(cover, u, v) < (COVER_LOW + COVER_MED) / 2 : false
                const r = open ? oR : gR, g = open ? oG : gG, b = open ? oB : gB

                const o = (jj * iw + ii) * 4
                px[o]     = Math.max(0, Math.min(255, r * shade))
                px[o + 1] = Math.max(0, Math.min(255, g * shade))
                px[o + 2] = Math.max(0, Math.min(255, b * shade))
                px[o + 3] = 255
            }
        }

        // putImageData ignores the transform and cannot scale, so the bitmap goes through an
        // offscreen canvas to be drawn scaled + smoothed. Reused across redraws — reallocating a
        // canvas per rebuild is what makes this kind of pass show up in a profile.
        if (!this._coverCanvas) this._coverCanvas = document.createElement('canvas')
        const cc = this._coverCanvas
        if (cc.width !== iw || cc.height !== ih) { cc.width = iw; cc.height = ih }
        cc.getContext('2d').putImageData(img, 0, 0)

        const sx0 = this._sx(wx0), sy0 = this._sy(wz0)
        const sw = (wx1 - wx0) * zoom, sh = (wz1 - wz0) * zoom
        // Smoothing ON only to take the stair-steps off the supersampled texels (4 m each, so this
        // is antialiasing a hard edge, NOT fading one bin into the next — the threshold above has
        // already decided which side of the boundary every texel is on).
        const prev = ctx.imageSmoothingEnabled
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(cc, sx0, sy0, sw, sh)
        ctx.imageSmoothingEnabled = prev
    }

    /**
     * Resolve the tree-cover raster over a lattice rect, as a 0..1 vegetation weight per cell.
     *
     * Per-chunk results are memoized FOREVER (keyed by chunk, cleared only when the seed changes),
     * which is the whole reason this is affordable: cover is a property of the world, not of the
     * view, so a chunk resolved once at one zoom is still valid at every other zoom and after any
     * pan. Only newly-revealed chunks ever cost anything.
     *
     * Returns null when the visible chunk count blows the budget — see COVER_CHUNK_BUDGET.
     */
    _coverRaster(wx0, wz0, gw, gh) {
        const road = this._road
        const CH = FLORA_PARAMS.chunkSize
        const amp = this._getParams().terrainAmplitude ?? 1

        const cx0 = Math.floor(wx0 / CH), cz0 = Math.floor(wz0 / CH)
        const cx1 = Math.floor((wx0 + gw * COVER_CELL) / CH), cz1 = Math.floor((wz0 + gh * COVER_CELL) / CH)
        // What is gated, and what never is (owner, 2026-08-15 — the fill is drawn at every zoom):
        //
        //   biome per cell   — cheap, and it ALONE decides green vs white. Always resolved.
        //   scatter replay   — ~44 candidates a chunk, and its only product is the MED/HIGH split,
        //                      which shows up solely as foliage glyphs.
        //
        // So the replay is gated on whether those glyphs can be seen at all, not on area. Tying it
        // to area instead is what made the glyphs vanish at ordinary reading zooms: the background
        // is overscanned 2x per axis, so the chunk count is 4x what is on screen and blew a cap
        // that looked roomy. The count check survives only as a bound on the pathological case.
        const replay = this._glyphsVisible() &&
                       (cx1 - cx0 + 1) * (cz1 - cz0 + 1) <= COVER_CHUNK_BUDGET

        // Water rejects, fetched ONCE for the whole rect rather than queried per candidate. The
        // scatter asks `is this point in a pond / in a stream channel` per tree; asking the
        // WaterSystem that directly, ~44 times per chunk over hundreds of chunks, is the one way
        // this pass could have become expensive.
        const water = this._getWater ? this._getWater() : null
        const m = 64
        const ponds = water ? water.pondsInBBox(wx0 - m, wz0 - m, wx0 + gw * COVER_CELL + m, wz0 + gh * COVER_CELL + m) : []
        const streams = water ? water.streamsInBBox(wx0 - m, wz0 - m, wx0 + gw * COVER_CELL + m, wz0 + gh * COVER_CELL + m) : []

        const samplers = {
            // Slope in the scatter's own units — see slopeFromGradient. The ±8 m offsets are half a
            // cover cell, matching the lattice the answer is binned into.
            slopeAt: (x, z) => {
                const e = 8
                const dx = (road._coarseH(x + e, z) - road._coarseH(x - e, z)) * amp / (2 * e)
                const dz = (road._coarseH(x, z + e) - road._coarseH(x, z - e)) * amp / (2 * e)
                return slopeFromGradient(dx, dz)
            },
            // Feeds the biome relief ring. Coarse field, matching slopeAt — the ring spans 70 m, so
            // the detail octave the map cannot see contributes nothing at that scale anyway.
            heightAt: (x, z) => road._coarseH(x, z) * amp,
            rejectAt: (x, z) => {
                for (const p of ponds) {
                    const dx = x - p.floorX, dz = z - p.floorZ
                    if (dx * dx + dz * dz < p.radius * p.radius) return true
                }
                for (const st of streams) if (inStreamChannel(st, x, z)) return true
                return false
            },
        }

        const out = new Float32Array(gw * gh)
        const open = new Uint8Array(gw * gh)   // 1 = biome says this cell is not forest at all
        const seed = this._getSeed()
        for (let cz = cz0; cz <= cz1; cz++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                const key = cx + ',' + cz
                let cc = this._coverMemo.get(key)
                if (!cc) {
                    // The per-CELL biome read — always resolved, and the thing that draws the
                    // meadow's EDGE. The replay below evaluates biome once per CLUSTER, which is
                    // correct for deciding whether a tree stands but far too coarse to draw a
                    // boundary with: a chunk whose four clusters all landed in a meadow zeroes as
                    // one 64 m square, and the sheet grows visible blocks. 16 evaluations a chunk,
                    // and the edge then follows the terrain that defines it.
                    const bio = new Uint8Array(CELLS_PER_CHUNK * CELLS_PER_CHUNK)
                    for (let lj = 0; lj < CELLS_PER_CHUNK; lj++) {
                        for (let li = 0; li < CELLS_PER_CHUNK; li++) {
                            const wx = cx * CH + (li + 0.5) * COVER_CELL
                            const wz = cz * CH + (lj + 0.5) * COVER_CELL
                            bio[lj * CELLS_PER_CHUNK + li] =
                                biomeAt(wx, wz, seed, samplers) === BIOME.FOREST ? 0 : 1
                        }
                    }
                    cc = { counts: null, bio }
                    this._coverMemo.set(key, cc)
                }
                // Counts fill in lazily. A chunk first resolved while zoomed out holds biome only;
                // zooming in upgrades it in place rather than discarding the biome read.
                if (replay && !cc.counts) cc.counts = chunkCover(cx, cz, seed, samplers)
                for (let lj = 0; lj < CELLS_PER_CHUNK; lj++) {
                    const gj = Math.round((cz * CH + lj * COVER_CELL - wz0) / COVER_CELL)
                    if (gj < 0 || gj >= gh) continue
                    for (let li = 0; li < CELLS_PER_CHUNK; li++) {
                        const gi = Math.round((cx * CH + li * COVER_CELL - wx0) / COVER_CELL)
                        if (gi < 0 || gi >= gw) continue
                        // No counts (replay skipped) → leave the count at 0 and mark the cell
                        // DENSITY-UNKNOWN via `known`, so the binning below cannot mistake a
                        // missing read for genuinely open ground.
                        if (cc.counts) out[gj * gw + gi] = cc.counts[lj * CELLS_PER_CHUNK + li]
                        open[gj * gw + gi] = cc.bio[lj * CELLS_PER_CHUNK + li]
                    }
                }
            }
        }

        // ── Counts → one of THREE bins. No ramp between them (owner, 2026-08-15): a printed sheet
        //    states a category, it does not fade between two. So the sheet only ever carries two
        //    fill colours, and the third bin is distinguished by carrying foliage glyphs on the
        //    same green as the second:
        //
        //      COVER_LOW   → white   (meadow, bare rock, water margin — open ground)
        //      COVER_MED   → green
        //      COVER_HIGH  → green + foliage glyphs (see _drawGlyphs)
        //
        // The counts are AREA-AVERAGED before binning, and that order is the correctness of this
        // layer. "Is this ground forested" is a property of a neighbourhood, not of a 16 m cell: a
        // cell with no trunk in it, ringed by cells full of trees, is the gap between two trunks,
        // not a meadow. Binning the bare counts put 41% of the world under white (measured, seed 6)
        // purely because the scatter drops trees in clusters.
        const area = boxBlur(out, gw, gh, COVER_COUNT_BLUR)
        const bin = new Float32Array(area.length)
        for (let k = 0; k < area.length; k++) {
            // The biome is decisive. Meadow and bare rock are open ground by definition, and no
            // count of trees that happened to be replayed nearby may argue them back to green —
            // this is also what keeps the map's white agreeing with the world, since the scatter
            // clears exactly these cells.
            // White means "not the forest biome" and nothing else, so the biome alone decides the
            // fill and the counts only choose whether glyphs are stamped on top of the green.
            // That is what keeps both region types solid: the count can no longer punch white
            // holes into forest, and it never could paint green into a meadow.
            if (open[k]) { bin[k] = COVER_LOW; continue }
            bin[k] = (replay && area[k] >= DENSE_MIN) ? COVER_HIGH : COVER_MED
        }
        return { bin, replayed: replay }
    }

    /**
     * Is the glyph lattice far enough apart on screen to be read as separate marks?
     *
     * ONE definition with two callers, and they must agree: _drawGlyphs uses it to decide whether
     * to stamp, and _coverRaster uses it to decide whether the scatter replay is worth running at
     * all — the replay's only product is the MED/HIGH split, which nothing but those glyphs
     * expresses. If the two ever disagreed, the map would either pay for a replay it cannot show or
     * try to stamp glyphs from densities it never resolved.
     */
    _glyphsVisible() { return GLYPH_CELL * this._zoom >= GLYPH_MIN_PX }

    // (1b) Rivers and ponds — the blue plate.
    //
    // Straight off the play WaterSystem, which is the same water the truck fords and the router
    // avoids, so the sheet cannot disagree with the world about where a creek runs. Both queries
    // are cell-cached inside that system, making this a fetch rather than a generation pass — the
    // reason water could be added to a per-redraw layer at all.
    _drawWater(ctx) {
        const water = this._getWater && this._getWater()
        if (!water) return
        const g = this._coverGrid
        if (!g) return
        const x0 = g.wx0 - WATER_MARGIN, z0 = g.wz0 - WATER_MARGIN
        const x1 = g.wx0 + g.gw * COVER_CELL + WATER_MARGIN, z1 = g.wz0 + g.gh * COVER_CELL + WATER_MARGIN

        // Ponds first: a stream draining into one should read as running INTO the water body, so
        // its centreline is drawn over the pond fill rather than under it.
        for (const p of water.pondsInBBox(x0, z0, x1, z1)) {
            this._drawPond(ctx, water, p)
        }

        ctx.strokeStyle = WATER_INK
        ctx.lineWidth = WATER_W
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        for (const st of water.streamsInBBox(x0, z0, x1, z1)) {
            const pts = st.points
            if (!pts || pts.length < 2) continue
            ctx.moveTo(this._sx(pts[0].x), this._sy(pts[0].z))
            for (let i = 1; i < pts.length; i++) ctx.lineTo(this._sx(pts[i].x), this._sy(pts[i].z))
        }
        ctx.stroke()
        ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'
    }

    /**
     * One pond, clipped to its real shoreline.
     *
     * A pond record is a disc (floorX/floorZ/radius), but a pond is NOT disc-shaped. The water is a
     * flat plane at `waterLevel` and the land rises into it, so the shore is wherever the terrain
     * crosses that plane — which is what you see from above in-game, and why the map's perfect
     * circles disagreed with the world (owner, 2026-08-15).
     *
     * The test is WaterSystem.waterSurfaceY's own, not an approximation of it: inside the disc AND
     * ground below waterLevel. Same rule, so the printed shore is the shore the truck drives to.
     *
     * Rasterised rather than traced. Marching squares would give a path, but filling one needs the
     * segments stitched into closed rings — bookkeeping this map has deliberately avoided
     * everywhere else (see _drawTopo's note on disjoint segments) — and a pond's outline can be
     * several disjoint rings anyway, once islands and inlets are in play. A small bitmap gets the
     * exact shape for none of that machinery, and the shoreline INK falls out of the same pass: a
     * water texel with a dry 4-neighbour is an edge texel.
     */
    _drawPond(ctx, water, p) {
        const zoom = this._zoom
        const rpx = p.radius * zoom
        if (rpx < 1.5) return          // below a pixel and a half it is a blue speck, not a pond

        // Ground height. Prefer the WaterSystem's OWN height closure — it is the function that
        // decided waterLevel in the first place (full raw terrain), so shoreline and water level
        // come from one field and cannot disagree. The coarse fallback keeps this drawable if the
        // system is ever handed a different shape.
        const hAt = water._height ? (x, z) => water._height(x, z)
                                  : (x, z) => this._road._coarseH(x, z) * (this._getParams().terrainAmplitude ?? 1)

        // Texel grid over the pond's bounding square, ~1 screen px per texel (the square spans the
        // DIAMETER, 2·rpx px), so the shore resolves at the limit of what can be seen. Capped so a
        // large pond at high zoom cannot turn into an unbounded raster.
        const n = Math.max(8, Math.min(POND_TEXELS_MAX, Math.ceil(rpx * 2)))
        const d = (p.radius * 2) / n
        const img = ctx.createImageData(n, n)
        const px = img.data
        const wet = new Uint8Array(n * n)

        for (let j = 0; j < n; j++) {
            const wz = p.floorZ - p.radius + (j + 0.5) * d
            for (let i = 0; i < n; i++) {
                const wx = p.floorX - p.radius + (i + 0.5) * d
                const dx = wx - p.floorX, dz = wz - p.floorZ
                if (dx * dx + dz * dz > p.radius * p.radius) continue
                if (hAt(wx, wz) >= p.waterLevel) continue
                wet[j * n + i] = 1
            }
        }

        const fR = parseInt(WATER_FILL.slice(1, 3), 16), fG = parseInt(WATER_FILL.slice(3, 5), 16),
              fB = parseInt(WATER_FILL.slice(5, 7), 16)
        const iR = parseInt(WATER_INK.slice(1, 3), 16), iG = parseInt(WATER_INK.slice(3, 5), 16),
              iB = parseInt(WATER_INK.slice(5, 7), 16)
        for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
                const k = j * n + i
                if (!wet[k]) continue
                // Edge texel = wet with a dry (or off-grid) 4-neighbour. Off-grid counts as dry,
                // which is correct: the grid spans the whole disc, so there is no water past it.
                const edge = (i === 0     || !wet[k - 1]) || (i === n - 1 || !wet[k + 1]) ||
                             (j === 0     || !wet[k - n]) || (j === n - 1 || !wet[k + n])
                const o = k * 4
                px[o]     = edge ? iR : fR
                px[o + 1] = edge ? iG : fG
                px[o + 2] = edge ? iB : fB
                px[o + 3] = 255
            }
        }

        if (!this._pondCanvas) this._pondCanvas = document.createElement('canvas')
        const pc = this._pondCanvas
        if (pc.width !== n || pc.height !== n) { pc.width = n; pc.height = n }
        const pctx = pc.getContext('2d')
        pctx.clearRect(0, 0, n, n)      // texels outside the shore stay transparent, not black
        pctx.putImageData(img, 0, 0)

        const sx = this._sx(p.floorX - p.radius), sy = this._sy(p.floorZ - p.radius)
        const prev = ctx.imageSmoothingEnabled
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(pc, sx, sy, p.radius * 2 * zoom, p.radius * 2 * zoom)
        ctx.imageSmoothingEnabled = prev
    }

    // (1c) Vegetation and wet-ground glyphs — the texture that tells you what the tint MEANS.
    //
    // Two marks on one shared lattice: a conifer where the cover raster says trees actually stand
    // thickly, and a marsh tick-tuft where the drainage test says the ground collects water. They
    // can and do coexist — a wet cell under forest gets both, exactly as on the reference, where
    // the tufts run under the tree marks along a creek.
    //
    // The lattice is WORLD-anchored and jittered by world position, not by index, so a glyph stays
    // on the patch it marks through every pan and zoom. A screen-space scatter would make the whole
    // sheet crawl under the cursor, which is the single fastest way to destroy the illusion of paper.
    _drawGlyphs(ctx) {
        const g = this._coverGrid
        if (!g || !g.cover) return
        const zoom = this._zoom
        if (!this._glyphsVisible()) return
        // ONE POP-IN FOR BOTH PLATES (owner, 2026-08-15). The marsh tufts need no cover data and the
        // conifers need the scatter replay, so on any sheet where the replay was skipped the tufts
        // used to appear alone and the trees followed at a closer zoom. Neither is drawn unless the
        // bins under them are real — the glyph layer arrives whole or not at all.
        if (!g.replayed) return

        const { wx0, wz0, gw, gh, cover } = g
        const x1 = wx0 + gw * COVER_CELL, z1 = wz0 + gh * COVER_CELL
        const i0 = Math.floor(wx0 / GLYPH_CELL), i1 = Math.ceil(x1 / GLYPH_CELL)
        const j0 = Math.floor(wz0 / GLYPH_CELL), j1 = Math.ceil(z1 / GLYPH_CELL)
        const s = GLYPH_PX

        // Height sampler for the drainage read. Sampled at the glyph's own world position rather
        // than off the cover lattice: isWetGround's ring is 48 m, finer than that lattice would
        // resolve, and a marsh symbol has to sit on the hollow it marks.
        const amp = this._getParams().terrainAmplitude ?? 1
        const wetSamplers = { heightAt: (x, z) => this._road._coarseH(x, z) * amp }

        ctx.lineWidth = 1
        for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
                // Deterministic per-slot jitter from world lattice indices. Same hash discipline as
                // the rest of the sim: the mark does not move because the view did.
                const hsh = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
                const hx = hsh - Math.floor(hsh)
                const hs2 = Math.sin(i * 269.5 + j * 183.3) * 43758.5453
                const hz = hs2 - Math.floor(hs2)
                const wx = (i + 0.15 + hx * 0.7) * GLYPH_CELL
                const wz = (j + 0.15 + hz * 0.7) * GLYPH_CELL

                const gi = Math.floor((wx - wx0) / COVER_CELL), gj = Math.floor((wz - wz0) / COVER_CELL)
                if (gi < 0 || gj < 0 || gi >= gw || gj >= gh) continue
                const k = gj * gw + gi

                const px = this._sx(wx), py = this._sy(wz)

                // ── Wet ground. Independent of cover and layered over it, so a hollow under closed
                //    canopy gets a marsh mark and a well-drained meadow does not.
                if (isWetGround(wx, wz, wetSamplers)) {
                    // Marsh tuft: three short uprights off a baseline, the USGS wetland mark.
                    ctx.strokeStyle = GLYPH_WET_INK
                    ctx.beginPath()
                    ctx.moveTo(px - s * 0.5, py); ctx.lineTo(px + s * 0.5, py)
                    ctx.moveTo(px - s * 0.3, py); ctx.lineTo(px - s * 0.3, py - s * 0.45)
                    ctx.moveTo(px,           py); ctx.lineTo(px,           py - s * 0.62)
                    ctx.moveTo(px + s * 0.3, py); ctx.lineTo(px + s * 0.3, py - s * 0.45)
                    ctx.stroke()
                }

                // ── Foliage: the HIGH bin only. MED gets the same green and no mark — the whole
                //    med-vs-high distinction is carried by this glyph, which is what the owner
                //    asked for and what the reference sheet does.
                if (cover[k] === COVER_HIGH) {
                    ctx.strokeStyle = GLYPH_TREE_INK
                    ctx.beginPath()
                    ctx.moveTo(px, py - s * 0.55); ctx.lineTo(px, py + s * 0.35)   // trunk
                    ctx.moveTo(px, py - s * 0.55); ctx.lineTo(px - s * 0.35, py + s * 0.1)
                    ctx.moveTo(px, py - s * 0.55); ctx.lineTo(px + s * 0.35, py + s * 0.1)
                    ctx.stroke()
                }
            }
        }
    }

    // (2) Road centerlines — each streamed network run projected (x,z) → screen. A single solid
    //     black stroke (owner, 2026-08-11): the cased double line a quadrangle uses for a
    //     light-duty road needs ~4 px of width to show its fill, and below that it degrades into a
    //     grey smudge. One black line holds its weight at every zoom this map supports.
    _drawRoads(ctx) {
        const road = this._road
        if (!road || !road._network) return
        ctx.lineJoin = 'round'
        ctx.lineCap  = 'round'
        ctx.strokeStyle = ROAD_INK
        ctx.lineWidth = ROAD_W
        for (const e of road._network.values()) {
            const { points } = e
            if (!points || points.length < 2) continue
            // Bored stretches are SKIPPED here and drawn by _drawTunnels in a lighter ink. Cutting
            // them out at the source is what makes that possible: the alternative — laying the
            // black road down whole and painting the tunnel over it — would need an opaque erase
            // stroke, and that would gouge a blank swath through the contours the bore runs under.
            // On a topo sheet the ground above a tunnel is exactly what must stay drawn.
            for (const seg of this._surfaceSlices(e)) {
                ctx.beginPath()
                ctx.moveTo(this._sx(seg[0].x), this._sy(seg[0].z))
                for (let i = 1; i < seg.length; i++) ctx.lineTo(this._sx(seg[i].x), this._sy(seg[i].z))
                ctx.stroke()
            }
        }
        ctx.lineCap = 'butt'
    }

    /**
     * Sample a run polyline at arc-length `s` (the polyCum domain tunnelSpans are stated in),
     * returning the point, the unit tangent there, and the index of the segment it landed on.
     */
    _atArc(points, cum, s) {
        let lo = 0, hi = points.length - 1
        while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m }
        const a = points[lo], b = points[lo + 1]
        const t = (s - cum[lo]) / ((cum[lo + 1] - cum[lo]) || 1)
        const dx = b.x - a.x, dz = b.z - a.z
        const m = Math.hypot(dx, dz) || 1
        return { x: a.x + dx * t, z: a.z + dz * t, tx: dx / m, tz: dz / m, i: lo }
    }

    // The sub-polyline of a run between arc-lengths a..b, endpoints interpolated exactly onto it.
    _arcSlice(points, cum, a, b) {
        const total = cum[cum.length - 1]
        a = Math.max(0, a); b = Math.min(total, b)
        if (!(b > a)) return null
        const A = this._atArc(points, cum, a), B = this._atArc(points, cum, b)
        const out = [{ x: A.x, z: A.z }]
        for (let i = A.i + 1; i <= B.i; i++) out.push(points[i])
        out.push({ x: B.x, z: B.z })
        return out
    }

    // A run's polyline minus its bored stretches — i.e. the parts that are actually on the surface.
    // Returns the whole polyline untouched when the run carries no tunnel.
    _surfaceSlices(e) {
        const { points, polyCum: cum, tunnelSpans: spans } = e
        if (!spans || !spans.length || !cum) return [points]
        const out = []
        let s = 0
        for (const sp of [...spans].sort((p, q) => p.s0 - q.s0)) {
            const seg = this._arcSlice(points, cum, s, sp.s0)
            if (seg) out.push(seg)
            s = Math.max(s, sp.s1)
        }
        const tail = this._arcSlice(points, cum, s, cum[cum.length - 1])
        if (tail) out.push(tail)
        return out
    }

    // FEAT-40: bored stretches, drawn the way a quadrangle draws a tunnel (owner, 2026-08-11) —
    // the road continues through the hill in a LIGHTER ink, and each portal is stamped with a bar
    // square across the roadway. It replaces the arch pictogram that used to sit at the bore's
    // midpoint: an icon said "a tunnel is somewhere near here", whereas the portal bars say
    // exactly where you go underground and where you come out, which is the thing a driver reading
    // the map actually needs. Spans live on the net entries (netEntry.tunnelSpans, run-arc metres
    // in the polyCum domain set at assembly).
    //
    // Drawn as FURNITURE, not into the cached background (owner, 2026-08-07): a camp zone paints a
    // yellow casing along every road stretch inside it, and from the background the tunnels came
    // out underneath it — a tunnel inside a camping area simply vanished. Running the pass up here
    // also means it rides the LIVE transform instead of the background bitmap's blit delta, so the
    // portals stay pinned to their bores mid-pan rather than sliding with the stale bitmap.
    _drawTunnels(ctx) {
        const road = this._road
        if (!road || !road._network) return
        ctx.lineJoin = 'round'
        for (const e of road._network.values()) {
            if (!e.tunnelSpans || !e.points || !e.polyCum) continue
            for (const sp of e.tunnelSpans) {
                // The bore itself: same centreline, lighter ink and a shade thinner, so it reads as
                // road-under-ground without competing with the surface network.
                const seg = this._arcSlice(e.points, e.polyCum, sp.s0, sp.s1)
                if (seg) {
                    ctx.strokeStyle = TUNNEL_INK
                    ctx.lineWidth = TUNNEL_W
                    ctx.lineCap = 'butt'
                    ctx.beginPath()
                    ctx.moveTo(this._sx(seg[0].x), this._sy(seg[0].z))
                    for (let i = 1; i < seg.length; i++) ctx.lineTo(this._sx(seg[i].x), this._sy(seg[i].z))
                    ctx.stroke()
                }
                // The portals. Full-strength black, square across the road — the bar is what marks
                // the mouth, so it must hold the weight the surface road has, not the bore's.
                ctx.strokeStyle = ROAD_INK
                ctx.lineWidth = PORTAL_W
                ctx.lineCap = 'round'
                for (const s of [sp.s0, sp.s1]) {
                    const p = this._atArc(e.points, e.polyCum, s)
                    // Perpendicular to the roadway, in SCREEN space — the tangent is a world
                    // direction and the two axes share a scale here, so rotating it 90° is enough.
                    const px = -p.tz, pz = p.tx
                    const half = PORTAL_LEN / 2
                    const sx = this._sx(p.x), sy = this._sy(p.z)
                    ctx.beginPath()
                    ctx.moveTo(sx - px * half, sy - pz * half)
                    ctx.lineTo(sx + px * half, sy + pz * half)
                    ctx.stroke()
                }
            }
        }
        ctx.lineCap = 'butt'
    }

    // (3) Classified crossings — colored by kind (at-grade junction vs near-parallel graze).
    _drawCrossings(ctx) {
        const road = this._road
        if (!road || typeof road.crossingList !== 'function') return
        // Re-inked for the paper sheet: the old bright green/yellow were picked to glow on a near-
        // black canvas and wash straight out on pale green. These are the same two categories in
        // ink that holds against it.
        const col = { AT_GRADE: '#0e6b33', NEAR_PARALLEL: '#96660a' }
        for (const c of road.crossingList()) {
            const p = c.point; if (!p) continue
            ctx.fillStyle = col[c.kind] || '#666666'
            ctx.beginPath()
            ctx.arc(this._sx(p.x), this._sy(p.z), 3, 0, Math.PI * 2)
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
                // leaf (deg≤1) dim, degree-2 pass-through mid, hub (deg≥3) strong — re-inked dark
                // for the paper sheet (the cyan/slate ramp was tuned against the old dark canvas).
                ctx.fillStyle = deg >= 3 ? '#15628f' : deg === 2 ? '#5d6f7d' : '#8a9298'
                ctx.beginPath()
                ctx.arc(this._sx(a.x), this._sy(a.z), deg >= 3 ? 4 : 2.5, 0, Math.PI * 2)
                ctx.fill()
            }
        }
    }

    // FEAT-43: story-mode region boundary. The hard wall is invisible in-world (FEAT-28's
    // trail-closed barriers are the diegetic version), so the map is where the player reads it —
    // without this you only learn where the region ends by driving into it.
    //
    // Drawn as: everything OUTSIDE the circle dimmed (the "you can't go there" read, done with an
    // evenodd fill so it needs no clip/save juggling), a solid boundary ring, and a distance label.
    // Per-frame layer, not the cached bg: the region is captured after entry and the bg may already
    // have been baked by then.
    _drawRegion(ctx) {
        const reg = this._getRegion()
        if (!reg) return
        const cx = this._sx(reg.x), cy = this._sy(reg.z), r = reg.r * this._zoom
        const W = this._canvas.clientWidth, H = this._canvas.clientHeight
        // Dim the exterior: full-canvas rect MINUS the region disc (evenodd), so only outside fills.
        ctx.beginPath()
        ctx.rect(0, 0, W, H)
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(8,10,14,0.42)'
        ctx.fill('evenodd')
        // The wall itself.
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,150,90,0.9)'
        ctx.lineWidth = 2
        ctx.stroke()
        // Region center tick — the spawn, and the anchor the radius is measured from.
        ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,150,90,0.9)'; ctx.fill()
        // Label the boundary where it crosses straight up from the center, clamped into view so it
        // stays readable when the player has panned/zoomed away from the region edge.
        const ly = Math.min(H - 10, Math.max(14, cy - r))
        ctx.font = `600 11px ${MAP_LABEL_FONT}`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        const txt = `Region boundary · ${(reg.r / 1000).toFixed(1)} km`
        const tw = ctx.measureText(txt).width + 14
        ctx.fillStyle = 'rgba(8,10,14,0.75)'; ctx.fillRect(cx - tw / 2, ly - 9, tw, 18)
        ctx.fillStyle = '#ff965a'; ctx.fillText(txt, cx, ly)
        ctx.textAlign = 'left'
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
            ctx.font = `600 11px ${MAP_LABEL_FONT}`
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            // Light halo then black text — the paper-sheet lettering treatment (see _drawPois).
            ctx.strokeStyle = 'rgba(242,239,228,0.92)'; ctx.lineWidth = 3.5; ctx.lineJoin = 'round'
            ctx.strokeText(label, sx, sy - 15)
            ctx.fillStyle = MAP_TEXT_POI
            ctx.fillText(label, sx, sy - 15)
            ctx.textAlign = 'left'
        }
        pin(m.start, '#5ad06a', 'Start')
        pin(m.end, '#ffcf3c', 'Drop')
    }

    // FEAT-45: dispersed-camping zones, rendered the way a BLM/forest-service map renders them —
    // as a coloured CASING along the roads inside the zone, never as a filled blob. That is not a
    // stylistic choice: camping is tethered to `campRoadEdgeM` of the road edge (camp.js), so the
    // stretch of road IS the affordance. A filled disc would promise a square kilometre of legal
    // ground the player can't actually use, which is exactly the wrong read.
    //
    // Drawn as world FURNITURE (with the region ring and the POIs) rather than into the cached
    // background: zones are built at story-mode entry, by which time the bg may already be baked.
    // Because the roads are already in that baked bitmap, the casing is laid down WIDE and the road
    // stroke is then re-drawn narrow on top of it — same visual result as an under-stroke, without
    // needing the bg rebuilt. Cheap at furniture cadence: the region carries ~50 edges and the
    // membership test is one point-in-disc per polyline vertex.
    _drawCampZones(ctx) {
        const zones = this._getCampZones()
        if (!zones || !zones.length) return
        const road = this._road
        if (!road || !road._network) return

        const inZone = (p) => {
            for (const q of zones) {
                const dx = q.x - p.x, dz = q.z - p.z
                if (dx * dx + dz * dz <= q.r * q.r) return true
            }
            return false
        }

        // Collect the in-zone sub-polylines once, then stroke them twice (casing, then road colour).
        //
        // Sourced from _surfaceSlices, NOT the raw run polyline: this pass re-lays the black road
        // on top of its casing, and over a bored stretch that re-stroke was painting the tunnel
        // back in as solid road — which then showed through the lighter bore drawn after it and
        // made a tunnel inside a camping area read as an ordinary road. Skipping the bores is also
        // the correct claim on its own terms: you cannot camp inside a tunnel, so the casing that
        // advertises where camping is legal has no business running through one.
        const runs = []
        for (const e of road._network.values()) {
            if (!e.points || e.points.length < 2) continue
            for (const points of this._surfaceSlices(e)) {
                if (!points || points.length < 2) continue
                let cur = null
                let prevIn = inZone(points[0])
                for (let i = 1; i < points.length; i++) {
                    const nowIn = inZone(points[i])
                    // A segment belongs to a zone when BOTH endpoints do — the conservative read,
                    // so the casing never claims road that leaves the zone.
                    if (prevIn && nowIn) {
                        if (!cur) { cur = [points[i - 1]]; runs.push(cur) }
                        cur.push(points[i])
                    } else {
                        cur = null
                    }
                    prevIn = nowIn
                }
            }
        }
        if (!runs.length) return

        const stroke = (color, width) => {
            ctx.strokeStyle = color
            ctx.lineWidth = width
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'
            for (const r of runs) {
                ctx.beginPath()
                ctx.moveTo(this._sx(r[0].x), this._sy(r[0].z))
                for (let i = 1; i < r.length; i++) ctx.lineTo(this._sx(r[i].x), this._sy(r[i].z))
                ctx.stroke()
            }
        }
        stroke(CAMP_CASING, CAMP_CASING_W)   // the casing — ~2.5x the road stroke
        stroke(ROAD_INK, ROAD_W)             // the road itself, back on top (matches _drawRoads)
        ctx.lineCap = 'butt'
    }

    // Draw one 24-box glyph from data/map-icons.js centred on (sx, sy), filled in whatever
    // fillStyle is already set and outlined near-black. The single place any glyph is rendered, so
    // the POI markers and the tunnel arch cannot drift apart in weight or outline. Caller sets
    // fillStyle/strokeStyle; `key` is the Path2D cache key (glyphs are static, only positions move,
    // so this is a handful of objects for the life of the map).
    _drawGlyph(ctx, key, d, sx, sy) {
        const S = POI_ICON_PX / 24          // the icon table's viewBox is 24 units
        let p = this._iconPaths.get(key)
        if (!p) { p = new Path2D(d); this._iconPaths.set(key, p) }
        ctx.save()
        ctx.translate(sx - POI_ICON_PX / 2, sy - POI_ICON_PX / 2)
        ctx.scale(S, S)
        ctx.lineWidth = 1.5 / S             // undo the scale so the outline stays hairline
        ctx.fill(p); ctx.stroke(p)
        ctx.restore()
    }

    /**
     * FEAT-61: the newspaper customers. A small green dot each — the roster glyphs are pictograms
     * in their own colours, so a customer needs a distinct silhouette or the map stops being
     * readable at a glance. Deliberately smaller than a POI: you plan a route AROUND landmarks and
     * THROUGH these, and there are fifteen of them.
     *
     * Owner-reported (2026-08-05): the houses existed in the world as green circles but had no map
     * presence at all, which made planning a round impossible — you cannot drive a route you cannot
     * see. Mom appears here too (she is a customer) and then gets her roster glyph drawn over the
     * top, which is why this runs before _drawPois.
     */
    _drawCustomers(ctx) {
        const list = this._getCustomers()
        if (!list || !list.length) return
        // TWO STATES, because the marker means two different things (owner, 2026-08-15).
        //
        // OFF a route these are scenery you are learning: fifteen anonymous white dots, deliberately
        // quiet, saying only "papers get delivered around here". ON a route (the offer included, so
        // the briefing map reads the same as the drive) every one of them is a job, and each gets
        // the newspaper roll — the same object the player is about to throw. White fill with a
        // near-black stroke on both: on the paper sheet the stroke is what carries the contrast
        // (an unstroked glow colour is what used to sit invisibly on PAPER_GREEN).
        const onRoute = !!this._getRouteState()?.onRoute
        if (!onRoute) {
            ctx.lineWidth = 1.2
            ctx.strokeStyle = '#101010'
            ctx.fillStyle = '#ffffff'
            for (const c of list) {
                ctx.beginPath()
                ctx.arc(this._sx(c.x), this._sy(c.z), 3.5, 0, Math.PI * 2)
                ctx.fill(); ctx.stroke()
            }
            return
        }
        ctx.lineWidth = 1.5
        ctx.strokeStyle = '#101010'
        ctx.fillStyle = '#ffffff'
        for (const c of list) {
            this._drawGlyph(ctx, '#news', NEWSPAPER, this._sx(c.x), this._sy(c.z))
        }
    }

    /**
     * FEAT-61: WHICH WAY TO SET OFF, drawn on every mission line the map shows.
     *
     * A paper round routinely passes back through Larry's — customers lie on both sides of him — so
     * the line alone cannot say which end to start from, and the player is left guessing at exactly
     * the moment they are deciding whether to take the job (owner-reported on seed 90).
     *
     * A CHEVRON, 50 m down the route, aimed the way the first GPS chevrons will point — the same
     * glyph in the same role, so the map and the windscreen agree. A solid arrow at the route HEAD
     * was the first attempt and it fought the car marker for the same pixels, since the route starts
     * where the car is parked.
     *
     * ALWAYS, not just on a self-crossing paper offer (owner, 2026-08-15). A drawn line has two ends
     * whatever drew it, so a POI mission earns the same mark, and it stays up while you drive — the
     * in-world chevrons answer the question only once you are already on the road pointing at them.
     * Placement is main.js's `_startArrow`; this method only draws what it is handed.
     */
    _drawStartArrow(ctx) {
        const a = this._getRouteState()?.arrow
        if (!a) return
        const sx = this._sx(a.x), sy = this._sy(a.z)
        const c = Math.cos(a.ang), s2 = Math.sin(a.ang)
        // Local frame: +fwd is down-route, +lat is to its right on screen.
        const pt = (fwd, lat) => [sx + c * fwd - s2 * lat, sy + s2 * fwd + c * lat]
        const L = 9, W = 9
        const [tx, ty] = pt(L, 0), [lx, ly] = pt(-L, -W), [rx, ry] = pt(-L, W)
        ctx.beginPath()
        ctx.moveTo(lx, ly); ctx.lineTo(tx, ty); ctx.lineTo(rx, ry)
        ctx.lineJoin = 'round'; ctx.lineCap = 'round'
        ctx.strokeStyle = '#101010'; ctx.lineWidth = 7      // halo, so it reads over the blue line
        ctx.stroke()
        // The ROUTE's blue, not a warning yellow (owner, 2026-08-15): this marker is a statement
        // about the blue line it sits on, so it belongs to that line rather than competing with it.
        ctx.strokeStyle = '#5ab4ff'; ctx.lineWidth = 3.5
        ctx.stroke()
        ctx.lineJoin = 'miter'; ctx.lineCap = 'butt'
    }

    // FEAT-46/60: POI markers — the navigate-to-it affordance. Each roster type carries its own
    // glyph, colour and label (data/map-icons.js), because "drive to the gas station" is only a
    // plan if the map says which marker that is. Drawn as world FURNITURE (with the region ring,
    // under the mission overlay and the car) rather than into the cached background: POIs are
    // placed at story-mode entry, by which time the background may already have been baked. Empty
    // outside story mode.
    _drawPois(ctx) {
        const list = this._getPois()
        if (!list || !list.length) return
        for (const q of list) {
            const ico = POI_ICONS[q.type] ?? POI_ICONS.missionGiver
            const sx = this._sx(q.x), sy = this._sy(q.z)
            ctx.lineWidth = 1.5
            ctx.strokeStyle = '#101010'
            ctx.fillStyle = ico.color
            if (ico.path) {
                this._drawGlyph(ctx, q.type, ico.path, sx, sy)
            } else {
                // No pictogram authored yet — the plain diamond, in the type's own colour. Sized
                // off POI_ICON_PX so it keeps pace with the drawn glyphs instead of shrinking to a
                // speck beside them whenever the icons are resized.
                const r = POI_ICON_PX * 0.4
                ctx.beginPath()
                ctx.moveTo(sx, sy - r); ctx.lineTo(sx + r, sy); ctx.lineTo(sx, sy + r); ctx.lineTo(sx - r, sy)
                ctx.closePath()
                ctx.fill(); ctx.stroke()
            }
            // The label is what makes the roster findable; an unlabelled marker is the problem
            // FEAT-60 set out to fix. Mission givers carry none on purpose (see data/map-icons.js).
            if (ico.label) {
                // Quadrangle lettering: black humanist sans, haloed in the PAPER colour so it lifts
                // off the contour hatching without being a black-on-black smudge. (The halo used to
                // be near-black under the glyph's own colour — that was for the dark canvas.)
                ctx.font = `600 11px ${MAP_LABEL_FONT}`
                ctx.textAlign = 'center'
                ctx.textBaseline = 'top'
                const ly = sy + POI_ICON_PX / 2 + 3
                ctx.strokeStyle = 'rgba(207,226,189,0.9)'
                ctx.lineWidth = 3.5
                ctx.lineJoin = 'round'
                ctx.strokeText(ico.label, sx, ly)
                ctx.fillStyle = MAP_TEXT_POI
                ctx.fillText(ico.label, sx, ly)
                ctx.textAlign = 'left'
                ctx.textBaseline = 'alphabetic'
            }
        }
    }

    // (5) Car marker — a triangle at the car's world XZ, pointing along its world-forward XZ.
    _drawCar(ctx) {
        const car = this._getCar()
        const sx = this._sx(car.x), sy = this._sy(car.z)
        let fx = car.fx, fz = car.fz
        const m = Math.hypot(fx, fz) || 1; fx /= m; fz /= m   // forward (screen: x→right, z→down)
        const px = -fz, pz = fx                               // perpendicular
        const L = CAR_ICON_L, Wd = CAR_ICON_L * (5 / 9)       // half-width keeps the original taper
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

    /**
     * The collar: the off-white margin the sheet is buried in, its neatline, the live grid index,
     * and the marginalia (scale bar + contour interval). Drawn LAST and per frame — see the
     * COLLAR_* block for why it is neither in the cached background nor a clip region.
     *
     * The index marks are the point of the whole thing. Ticks sit at true world-grid boundaries
     * and the letters/numbers name the cells BETWEEN them, so the collar slides continuously as
     * you pan — the frame stops reading as a viewport and starts reading as a photograph of a
     * printed map that happens to be centred where you are.
     */
    _drawCollar(ctx) {
        const W = this._canvas.clientWidth, H = this._canvas.clientHeight
        const s = this._sheet()

        // (a) Mask the margin. Painting over the map layer is what keeps the sheet inside its
        //     border without a clip region — anything that bled out is simply covered.
        ctx.fillStyle = COLLAR_CREAM
        ctx.fillRect(0, 0, W, s.y0)
        ctx.fillRect(0, s.y1, W, H - s.y1)
        ctx.fillRect(0, 0, s.x0, H)
        ctx.fillRect(s.x1, 0, W - s.x1, H)

        // (b) Grid geometry. One index cell lands near GRID_CELL_PX at any zoom, so the collar
        //     stays countable from a 60 m view to a 40 km one.
        let cell = GRID_LADDER[GRID_LADDER.length - 1]
        for (const c of GRID_LADDER) if (c * this._zoom >= GRID_CELL_PX) { cell = c; break }

        // Cell labels CYCLE. The world is infinite and procedural, so no finite index can be
        // globally unique — and a view only ever spans a handful of cells, which is the only span
        // over which an index has to disambiguate anything.
        //
        // Both axes cycle on the SAME period of 26. Letters wrapping Z→A reads as an ordinary
        // atlas grid, but the numbers first ran 1–99 and the 99→1 wrap landed in view as a jump
        // from two digits to one — which reads as a glitch, not as a repeating index. Matching the
        // periods makes the vertical wrap look like what it is.
        const colLabel = n => GRID_LETTERS[((n % 26) + 26) % 26]
        const rowLabel = m => String((((m % 26) + 26) % 26) + 1)

        ctx.strokeStyle = MAP_INK      // ticks stay full strength; only the lettering is faint
        ctx.lineWidth = 1
        ctx.fillStyle = MAP_TEXT
        ctx.font = `600 11px ${MAP_LABEL_FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        // Columns: ticks on the world-grid lines, letters centred in the cells between them.
        const nA = Math.floor((this._panX - s.cx / this._zoom) / cell)
        const nB = Math.floor((this._panX + (W - s.cx) / this._zoom) / cell)
        for (let n = nA; n <= nB + 1; n++) {
            const px = this._sx(n * cell)
            if (px > s.x0 && px < s.x1) {
                ctx.beginPath()
                ctx.moveTo(px, s.y0); ctx.lineTo(px, s.y0 - COLLAR_TICK)
                ctx.moveTo(px, s.y1); ctx.lineTo(px, s.y1 + COLLAR_TICK)
                ctx.stroke()
            }
            // Label the cell [n, n+1), clamped so a cell running off the edge keeps its letter
            // on screen instead of dropping it the moment the boundary leaves the sheet.
            const mid = Math.min(s.x1 - 9, Math.max(s.x0 + 9, this._sx((n + 0.5) * cell)))
            if (this._sx((n + 1) * cell) > s.x0 + 6 && px < s.x1 - 6) {
                ctx.fillText(colLabel(n), mid, s.y0 - COLLAR_TICK - 8)
                ctx.fillText(colLabel(n), mid, s.y1 + COLLAR_TICK + 8)
            }
        }

        // Rows: same, numbers down the left and right margins.
        const mA = Math.floor((this._panZ - s.cy / this._zoom) / cell)
        const mB = Math.floor((this._panZ + (H - s.cy) / this._zoom) / cell)
        for (let m = mA; m <= mB + 1; m++) {
            const py = this._sy(m * cell)
            if (py > s.y0 && py < s.y1) {
                ctx.beginPath()
                ctx.moveTo(s.x0, py); ctx.lineTo(s.x0 - COLLAR_TICK, py)
                ctx.moveTo(s.x1, py); ctx.lineTo(s.x1 + COLLAR_TICK, py)
                ctx.stroke()
            }
            const mid = Math.min(s.y1 - 9, Math.max(s.y0 + 9, this._sy((m + 0.5) * cell)))
            if (this._sy((m + 1) * cell) > s.y0 + 6 && py < s.y1 - 6) {
                ctx.fillText(rowLabel(m), s.x0 - COLLAR_TICK - 9, mid)
                ctx.fillText(rowLabel(m), s.x1 + COLLAR_TICK + 9, mid)
            }
        }

        // (c) The neatline (heavy rule bounding the sheet) and an outer hairline, the two rules a
        //     printed quad carries. Drawn after the ticks so they butt cleanly into it.
        ctx.strokeStyle = MAP_INK
        ctx.lineWidth = 1.6
        ctx.strokeRect(s.x0 + 0.5, s.y0 + 0.5, s.w - 1, s.h - 1)
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(26,26,26,0.45)'
        ctx.strokeRect(6.5, 6.5, W - 13, H - 13)

        this._drawMarginalia(ctx, s, H)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
    }

    // Scale bar + contour interval, set in the deep bottom margin (owner, 2026-08-11) where a
    // printed sheet puts them — off the map itself, so neither can sit on top of terrain.
    _drawMarginalia(ctx, s, H) {
        const by = (s.y1 + H) / 2 + 8      // baseline of the marginalia row, below the index letters
        // A "nice" world length near 120 px wide.
        const rawM = 120 / this._zoom
        const pow = Math.pow(10, Math.floor(Math.log10(rawM)))
        const niceM = (rawM / pow >= 5 ? 5 : rawM / pow >= 2 ? 2 : 1) * pow
        const barPx = niceM * this._zoom

        const bx = s.x1 - barPx
        ctx.strokeStyle = MAP_INK; ctx.lineWidth = 1.6
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + barPx, by)
        ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 4)
        ctx.moveTo(bx + barPx, by - 4); ctx.lineTo(bx + barPx, by + 4)
        ctx.stroke()
        ctx.fillStyle = MAP_TEXT
        ctx.font = `11px ${MAP_LABEL_FONT}`
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'
        ctx.fillText(niceM >= 1000 ? (niceM / 1000) + ' km' : niceM + ' m', bx - 8, by + 4)

        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
        ctx.fillText(`Contour interval ${CONTOUR_IV} m`, s.x0, by)
    }
}
