# HANDOFF — FEAT-46 Story-mode POIs on lay-by pads

**Read this, then `.planning/todos/pending/feat-story-poi-pads.md` (the ticket, which carries the
full design + the implementation record), then `DESIGN.md` §"Where missions and POIs live".**
Date: 2026-07-28/29.

> **STATUS: IMPLEMENTED, GATED, COMMITTED, NOT MERGED.** Six commits on `feature/poi-pads`
> (`b04c669` → `9130fb4`), off `origin/main` @ `a50090a`. `npm run test:all` green — 41 gates
> (40 existing + the new `test/story-poi.mjs`). Verified in the running game, not only headlessly.
> Awaiting the owner's merge call.

---

## Where the work lives

- **Worktree:** `/Users/ledogen/CodeShit/CarGame-poi-pads`, branch **`feature/poi-pads`**.
  `node_modules` installed. Dev server: `npm run dev -- --port 8137 --strictPort` (it was left
  running on **8137**).
- **Main is clean** — the scoping copy of the ticket that briefly lived there as an untracked file
  was deleted, so the merge won't hit an "untracked file would be overwritten" block.
- Gates: `npm test` (affected) / `npm run test:all` (full). Build: `npm run build`.

## What this is

Orange placeholder cubes standing on their own flattened lay-by pads, dispersed along the road
network. Drive up, press **E**, get a mission that starts there — **no teleport**. Story mode only.

This closes FEAT-43 slice 1 and supersedes the core of FEAT-21. FEAT-21 predates the free-roam /
story split, so its free-roam framing is an artifact rather than intent (owner, 2026-07-28); on
merge, close it as superseded or retain it only for the **variety** pass (POI types, names,
differing mission flavours), explicitly scoped to story mode.

## THE RULE the design is built around

**POIs must not influence routing determinism** (owner, 2026-07-28). The same seed opened in free
roam and in story mode must produce identical centerlines, identical road surface and identical par
— you just don't see the pads in free roam. This is held **structurally**, not by tuning:

1. **Placement runs strictly downstream of routing** — in `story.js`'s new `onRegionLive` dep, after
   the region is routed and frozen. It reads `networkGraph()` / `edgeParData()` and writes nothing
   back. POI knobs live in `POI_PARAMS` (src/poi.js), deliberately **not** in `RANGER_PARAMS`,
   because that object feeds `routeCacheSig` — a `poi*` key landing in it would re-key every baked
   route bundle for a marker's size.
2. **`_poiPadCarve` is gated by the resolved lateral distance** — zero authority at and inside
   `roadHalfWidth + roadShoulderWidth`, smoothstepping to full over `POI_ROAD_FEATHER` (2 m). A pad
   cannot move the ribbon, its shoulder, or its camber. **This is the load-bearing invariant**; the
   gate proves it with 11,725 carve probes on every registered run, bit-identical with and without
   pads.
3. **Free roam never calls `build()`**, so it never sets a pad and pays nothing.

If you touch the carve composition, that parity check is the one that matters. Everything else in
this feature is cosmetic by comparison.

## Architecture

| Piece | Where | Note |
|---|---|---|
| Placement, siting, cube contact | **`src/poi.js`** (new) | THREE-free, no worldgen of its own, everything through a `deps` adapter — the `src/story.js` isolation discipline |
| Pad carve + prop keep-out | `src/road.js` | `setPoiPads` / `_poiPadCarve` / `poiPadBlocked`; `junctionPadNodes()` → **`padReachNodes()`** (now lists both pad kinds) |
| Mesh composition | `src/terrain.js` | ONE line in `_carveTableGen` + hoisting `latDist`. **No `CARVE SYNC` worker mirroring** — the worker consumes a main-thread-built `carveTable`. Biggest scope win in the feature |
| Anchored missions | `src/mission.js` | `enterFromPoi()`, `_roll(anchor)`, `_launch({seat,setSpawn})`, anchor retained for `regenerate` |
| Lifecycle hooks | `src/story.js` | `_goLive(frozen)` + `onRegionLive` / `onRegionExit` deps |
| Cubes, prompt, contact splice, map icons | `src/main.js`, `index.html`, `src/map2d.js` | |
| Gate | `test/story-poi.mjs` (new) | registered in `test/gates.mjs`, subsystem `story`, cost `heavy` |

Composition uses **dominance + feather** (like `_connectorCarve`), NOT `_mergeCarve` — the latter
gives the leg carve priority everywhere it reaches, which on a fill embankment is the whole pad, and
the bench would silently do nothing.

## Findings worth not re-learning (each cost a cycle)

1. **The earthwork cap must measure against the ROAD-CARVED surface (`analyticHeight`), not raw
   terrain.** Raw bills the pad for the *road's* own cut/fill — seed-6 median **10 m** — and rejects
   literally every candidate. Against the carved surface, best-of-two-sides runs p25 2.7 / p50 3.5 m,
   so `poiMaxCutFill` 3.0 admits about a third.
2. **`WaterSystem.streamChannelAt()` ALWAYS returns a record** (`{inChannel:false, inBank:false,
   stream:null}` away from any stream). Truth-testing it rejects everything. Read `.inChannel`. Only
   the channel rejects — the **bank** is the waterside pullout we want (owner: on-water rejects,
   near-water does not).
3. **A window/region test inside candidate selection destroys window-invariance.** The region clip
   made *which* arc position won depend on the region centre, so POIs 400 m inside the wall moved
   375 m when the window moved. It is a **post-filter in `build()`**, never a reject test.
4. **`build()` must clear the previous build's pads before placing.** `_evaluate`'s junction reject
   reads `padReachNodes()`, which lists POI pads too — so a rebuild (new seed / re-anchored region)
   sited against the region it was replacing. History, not determinism. Found by checking the claim
   that a lower `poiEdgeChance` only ever *removes* POIs; it failed until the pads were cleared.
   Note this would have stayed dormant on the shipped path (re-entering with the same seed hits
   `build()`'s early-return cache) until FEAT-28 re-anchors regions.
5. **Placement keys off the abstract graph site-id pair**, never the streamed runKey — post-BUG-25
   the cull flips whole edges on a re-stream.
6. **Side is chosen by the ground** (cheaper bench of the two), not by the hash. The two sides of a
   mountain road are a 1:1 cut bank and a 3:1 fill. Emergent, not injected.

## UI as it now stands (all owner-directed, 2026-07-28)

- **Offer:** `decline · regenerate · accept mission`. The mission panel's **seed control is gone** —
  you choose the world at story entry, and offering it again mid-run meant a world rebuild could
  fire under a live planner. The debug panel's seed field remains the testing path.
- **Decline** → back in story mode, nothing active, still in the region. Leaving the mode is the
  pause menu (and `back to free roam` on the result card).
- **Accept** → **moves the spawn** to where the run begins (the POI pad, or the start pin Quick Job
  just seated you at). Taking the job is the commitment, so it is the checkpoint. Routed through the
  existing `setSpawnHere()` so there is one spawn-override write path.
- **Retry** always seats and never moves the spawn — it is a calibration second-lap and is only
  comparable from the same start line.
- **Regenerate** re-rolls the **destination only**; the start stays pinned to the POI.
- **Result card:** `retry · continue · back to free roam`, calibration form kept. **Continue
  dismisses** rather than auto-rolling another job — with POIs as the job source the next one is
  something you drive to. *(This one was my call, not an explicit instruction — flip
  `missionSystem.exit()` back to `.enter()` in main.js's `mp-accept` handler if the owner wanted
  "hand me another job now".)*

## Measured (seed 6)

- **10 POIs** in the live 2500 m region at `poiEdgeChance` 0.20 (doubled from 0.10 on owner
  request; the original 4 are a subset, nothing moved).
- ~30% of forced candidate edges accept; the rest reject on their ground.
- Story entry unchanged; no console errors on a real entry.
- Accept at POI (−280,−924) seats at (−284,−928); drive 48 m away, press R, back to (−284,−928).

## How to verify without driving

`?prof=1` exposes `window.__story()`, **`window.__poi()`**, **`window.__mission()`**. The pattern
used throughout this work (scripts were scratch, not committed):

```js
await ev("window.__story().enter('6')")            // wait for _phase === 'live'
const poi = JSON.parse(await ev('JSON.stringify(window.__poi().list()[0])'))
await ev(`window.__tp(${poi.x - 4}, ${poi.z - 4}, 0)`)   // park on the pad
// press E → offer; click #mp-accept; then:
const end = JSON.parse(await ev('JSON.stringify(window.__mission().mission.end)'))
await ev(`window.__tp(${end.x}, ${end.z}, 0)`)     // jump to the drop → result card
```

**Trap:** `teleportToGround` (`window.__tp`) **sets the spawn itself**. A test that teleports to
"drive away" and then presses R is testing nothing — it overwrote the spawn it meant to check. Drive
with W instead.

## Open / next

- **Merge decision** is the owner's; nothing else blocks.
- Density `poiEdgeChance` 0.20 → 10 POIs per region. Sparse by design; raise if it reads empty.
- The prompt is a HUD line, not a world-space label.
- No POI **variety** — types, names, differing mission flavours. That is FEAT-21's remaining scope
  and the natural next slice.
- Most quest givers should eventually **lose the regenerate button** (DESIGN.md has no do-overs; a
  re-rollable marker is a slot machine). It stays while the par economy is calibrated.
- FEAT-45 (dispersed camping) should reuse `_evaluate`'s good-ground scoring rather than inventing a
  second siting rule — DESIGN.md already asks FEAT-38/45/21 to read one shared field.
- FEAT-43's remaining slice 2 (the two sandbox-lockout flags: `DEBUG_LOCKOUT`, `isTeleportEnabled`)
  is untouched and still deliberately open.
