---
id: FEAT-16
type: feature
status: completed
severity: minor
opened: 2026-06-28
closed: 2026-06-28
source: user-request (2026-06-28 — validating the road-network v2 rework without freecaming everywhere)
relates: FEAT-13 (road-network graph v2 — this is the validation tool for it), .planning/ROAD-GRAPH-HANDOFF.md
---

## Resolution (2026-06-28, UNCOMMITTED)

Built per the resolved design. New `src/map2d.js` `Map2D` class + `<canvas id="map2d">` overlay in
`index.html`; wired in `src/main.js` (import, single construct after the vehicle model, `M`-key
toggle in the existing keydown listener, `map2d.render()` in the loop gated on `isOpen()`).

- **Data source:** a SEPARATE read-only `new RoadSystem(seed, RANGER_PARAMS)` streamed around the PAN
  cursor — never touches the live play network. KEPT ALIVE across opens (warm route cache) and rebuilt
  only when the seed or any `road*` param changes (`_paramSig`), so it always reflects the current
  `roadNetworkMode`/graph knobs (the thing under validation) while a no-change reopen is instant. Reads
  injected accessors only (`getSeed`/`getParams`/`getCar`) — fully decoupled from main's state. Never
  `init(scene)`'d / `setDebugVisible`'d — pure data, no THREE objects.
- **Render (cached bg layer + live car overlay):** coarse-height grayscale shading via the map
  instance's own `_coarseH` (no terrain-system dep), road centerlines from `_network`, crossing dots
  by `crossingList()` kind, anchor nodes by `_graphAnchorDegree`, red car triangle (world-forward
  `-Z` XZ), on-canvas legend + nice-number scale bar. Bg cached to an offscreen canvas, only
  rebuilt when the transform/network changes → idle map costs ~nothing per frame.
- **Pan** = drag (debounced re-stream only after the pan drifts > 300 m). **Zoom** = wheel about the
  cursor, pure canvas transform, no re-stream.
- **Open perf (chunked streaming):** routing the full 1500 m radius synchronously is ~10 s. Profiled:
  cost is entirely `_streamNetwork` route computation (slice + `crossingList` are ~free), scales with
  area, and the per-connection ROUTE CACHE persists across re-streams on one instance (re-stream at the
  same radius = 0.1 ms). So: (1) the map's RoadSystem is now KEPT ALIVE across opens and rebuilt only
  when a `road*` param or seed changes (signature) → reopen is instant; (2) the network streams in
  PROGRESSIVELY through `MAP_RADIUS_STEPS` (400→1500), one chunk per timer tick — terrain + the local
  network paint in ~0.3 s with a `streaming network… N%` badge, the rest fills in across frames instead
  of one 10 s freeze.

**Files touched:** `src/map2d.js` (new), `index.html` (`<canvas id="map2d">` overlay), `src/main.js`
(import + single `Map2D` construct after the vehicle model with injected accessors; `m`/`M` added to
the existing keydown listener; `map2d.render()` in the loop gated on `isOpen()`).

**Verification:** `npm test` 22/22 green (additive, no shared `src/` path touched). In-browser via
the CDP harness (`reference_inbrowser_verify_cdp.md`): `M` opens the overlay over a running sim,
terrain/network/legend/scale render; first open paints terrain + local net at ~0.3 s with a
`streaming… N%` badge then fills in; a no-change reopen is instant; wheel-zoom reveals the car marker
on its road at a hub node; drag pans. Screenshots captured this session.

**Follow-up filed → QUAL-08** (`qual-map2d-worker-streaming-cache.md`): move map streaming to its own
Worker (stream on world load → ready on open, zero main-thread hitch) and make pan caching incremental
(today a far pan re-streams the whole band rather than extending the streamed region). Small potatoes,
deferred.

**Deferred (ticket "Future"):** graduating the canvas to a `CanvasTexture` for the fluttering 3D
map-prop — render kept decoupled so it can feed a render target without a rewrite.

# FEAT-16: 2D top-down map

## Request

A 2D top-down view of the world, primarily as a **dev/validation tool** for the road-network v2 rework
(Urquhart-over-blue-noise graph, secondary-node T/X intersections, parallel pruning — see
`.planning/ROAD-GRAPH-HANDOFF.md`). Today the only way to inspect the network's shape is to freecam around
it, which is slow and gives no global picture. A pannable top-down map lets the network be eyeballed
whole — are roads parallel, do intersections look right, are there disconnected pockets, etc.

**Scope for now: simple.** A flat 2D pannable (and ideally zoomable) overhead render of the road network +
terrain reference. Dev tool first; gameplay map later (see Future).

## Design (resolved 2026-06-28 after codebase read)

- **Data source = a SEPARATE read-only `RoadSystem` instance** dedicated to the map, NOT the live play
  network. The live `roadSystem._network` only holds the ~320 m streamed window (`setRadius(320)`) and is
  the same structure physics + the ribbon mesh consume — re-streaming it around a pan cursor would
  re-shape the road under the truck. The network is window-invariant (pure fn of seed+coords), so the map
  builds its own `new RoadSystem(worldSeed, RANGER_PARAMS)`, streamed around the **pan cursor** at a large
  radius, fully independent of play. (Headless gates already do exactly this `new RoadSystem(...)`+`update`
  pattern, so it's a known-good path.)
- **2D canvas overlay**, not an ortho Three camera: a dedicated HTML5 `2d`-context `<canvas>` drawing the
  `_network` run polylines projected `(x,z) → screen` with pan/zoom transforms. Fully decoupled from the
  WebGL scene; trivial pan/zoom; and it doubles as a `CanvasTexture` source for the future fluttering
  map-prop (the "build it to graduate" requirement) with no rewrite.
- **Roads-only need ZERO terrain sampling** — only the XZ of `_network.get(k).points` is required. Terrain
  shading (below) is a fast-follow, not v1.
- **Toggle = `M`** (verified free: `` ` `` `\` `Ctrl+I` `p` `C`/`Shift+C` `Esc` `Space` are taken). Sim keeps
  running underneath. The overlay owns the mouse only while open (camera.js mouse handlers are already
  camera-mode gated, so no conflict).
- **Pan re-streams the map's sampler DEBOUNCED / on-demand** (streaming a large radius is expensive — it's
  why play radius is 320 m), not every frame. Zoom is a pure canvas transform (no re-stream).
- Lives in a new **`src/map2d.js`**, wired in `main.js` alongside the other overlays — kept entirely off
  the physics/frame-critical path (CLAUDE.md "src/ is the product").

## Acceptance

- A toggleable (`M`) 2D top-down overlay that does not disturb the 3D sim (sim keeps running underneath).
- Renders the **road network** as lines/ribbons from `road._network` centerlines — the thing under
  validation. Shows enough world extent (pan + zoom) to see the network's macro shape, not just near the
  car, so parallel runs / disconnected pockets / intersection density are visible at a glance.
- **Pannable** (drag) and ideally **zoomable** (scroll). Re-streams / samples the network for whatever
  region is panned to (must work with the streaming model — the map can request network data for an
  arbitrary world region, not only the loaded play area).
- Marks the **car's current position + heading** on the map.
- Light terrain reference underneath (e.g. coarse height shading or contour) so roads read in context —
  cheap, not a full terrain render.
- Read-only: no edits to sim/physics state. Lives outside the frame-critical path (per CLAUDE.md "src/ is
  the product" — this is a dev/validation surface; keep it cleanly separable so it can later graduate to
  a gameplay element without dragging diagnostic plumbing into the hot loop).

## Implementation hints

- `src/map2d.js`: a dedicated `2d`-context `<canvas>` overlay (add it to index.html alongside `#hud`,
  hidden by default). Draw each `mapRoadSystem._network.get(k).points` polyline via `(x,z)→screen` with a
  pan offset + zoom scale. `M` toggles visibility; while visible, attach pan (drag) / zoom (wheel) mouse
  listeners and detach on hide.
- The map's `RoadSystem` is a second instance: `new RoadSystem(worldSeed, RANGER_PARAMS)`, `setRadius(big)`,
  and `update(panCenter)` debounced on pan. No surface sampler needed for roads-only (XZ only). It must be
  rebuilt on seed change (mirror `debouncedRebuildFull`'s road re-init) so the map tracks the active seed.
- Reuse `crossingList()` on the map instance for junction dots; `_network` `cellA/cellB` are available if
  node markers want anchor identity.
- Useful overlays for v2 validation (nice-to-have, gate on usefulness): node markers colored by type
  (primary anchor vs secondary/promoted crossing vs leaf), edges colored by kept-vs-pruned, NEAR_PARALLEL
  flags. These line up directly with `road.crossingList()` and the node taxonomy in ROAD-GRAPH-HANDOFF §8.

## Future (out of scope now — captured so the dev tool is built to graduate)

The map eventually becomes a **gameplay element**: the 2D map texture mapped onto a 3D shape (a physical
paper map prop) that **flutters/animates as the player drives**. Build the dev tool so the 2D map render
is a reusable texture/render-target, not hard-wired to a screen overlay — so it can later be sampled onto
the fluttering map mesh without a rewrite.
