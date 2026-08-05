---
id: FEAT-60
type: feature
status: open
severity: minor
opened: 2026-08-03
source: feat59-followup
relates: FEAT-59, FEAT-46, FEAT-43
---

# FEAT-60: Modelled POI markers (replace the orange placeholder cube)

## Request

Every POI renders as the same placeholder orange emissive cube. Now that FEAT-59's model import
service exists, POIs should be able to look like what they are — mom's house, a gas station, a
newspaper customer's mailbox — with the cube as the fallback for anything unmodelled.

## Findings (2026-08-03, investigated during FEAT-59)

- **Current state:** `_rebuildPoiMarkers()` (`src/main.js` ~2111) draws one shared
  geometry/material cube (`poiCubeSize` 1.6 m) per POI, plus the orange interaction ring. There is
  no visual identity per POI: `PoiSystem` records carry no type/model field anywhere.
- **The FEAT-59 hook is ready:** `spawnModel(key, { castShadow: true, receiveShadow: true })` is
  exactly the static-POI path (Consumer B in FEAT-59). Per-mesh draw calls at POI counts (a
  handful per region) are fine — no instancing needed.
- **Collision is the real coupling:** the marker is SOLID — `poi.js` ~197 resolves sphere-vs-AABB
  contact against the *same* `poiCubeSize` cube the renderer draws. A modelled POI must drive that
  contact box from the registry's `collision` metadata (already carried per record by the service)
  instead of `poiCubeSize`. Physics-facing — small but deserves its own verification.
- **Distance readability:** the cube is emissive so it reads far away under ACES tone mapping; a
  naturalistic model won't. The interaction ring already carries part of that signal — decide
  whether it carries all of it, or models get a beacon/glow assist.
- **Draw distance reality check:** the game draws ~160 m (FEAT-52 pending); POI models only need
  to read within that.

## POI types (ratified 2026-08-03)

- mom's house
- Larry's house
- newspaper customers
- mission providers
- food vendors
- **the burger joint** — **the place the player character is fired from in the opening beat**
  (ruled 2026-08-05). A **story landmark, not a food vendor and not a hub**: no work, no wage, no
  fallback, and the player can never earn from it again. Sited so they keep driving past what they
  left. It may source an unrelated mission later, which is the only reason it needs interaction at
  all — model it as scenery first.
- **service shop** — this IS the in-run mechanic (ruled 2026-08-03): field repairs cover the
  simple stuff; complicated work (engine repair) is service-shop-only, and they change a tire
  faster than you can. Distinct from THE GARAGE, which stays the between-runs meta-roster.
- gas stations
- **general store** — the items catalog (`items.md`: consumables, tools, parts) lists most items
  as "bought/found" with nowhere to buy. Distinct from food vendors.
- **tackle shop** — the catch category (`items.md` §5). ⚠ Fishing and The Confluence are
  deferred; the type exists, don't build its systems first.

### Rejected

- **Log landing / sawmill drop-off** (2026-08-03): the log-drag is *clear the road*, not a
  delivery — the log goes nowhere. (And the mission type itself is now uncertain — owner may cut
  it; `missions.md` still lists it as the main mission.)
- **Campground:** dispersed camping is the ratified model (no developed campsites,
  Innkeeper → THE HOST). No campsite POI type should exist.

### Resolved — the firing vs the day-job income floor (raised and ruled 2026-08-05)

The firing initially collided with `opening.md` §"The day job as a hub", which had the day job
persisting as the income floor and was itself owner-ratified. **Owner ruled: the firing wins.** The
day job does not persist, there is no income from the burger joint at all, and **the newspaper route
is the income floor** — that is what it is for. `opening.md` has been rewritten (§"The firing",
§"There is no day-job income floor") and its provenance now records the withdrawal.

Consequence for this ticket: the burger joint is **scenery with a possible later mission hook**, not
a service POI. Nothing in FEAT-60 needs an interaction affordance for it on day one.

## The region-1 roster (ratified 2026-08-05)

14 POIs per region, on every seed. Nine reserved, five mission givers. Canonical form lives in
`POI_ROSTER` (`src/poi.js`) — this table is the provenance, that array is the source of truth.

| Type | Count | Siting |
|---|---|---|
| mom's house | 1 | within 1 km of spawn |
| Larry's house | 1 | within 1 km of spawn |
| gas station | 2 | coverage (see below) |
| service shop | 2 | coverage |
| burger joint | 1 | anywhere |
| general store | 1 | anywhere |
| tackle shop | 1 | anywhere |
| mission giver | 5 | anywhere — **may present as a food vendor**, which is why food vendors get no reservation of their own |

Newspaper customers are deferred until the paper-route branch merges; no slot yet.

### Ratified during implementation

- **Placement became a SELECTION, not a coin flip.** `poiEdgeChance` is gone. Every viable edge
  enters a candidate pool (46–48 over a real 2500 m region) and the roster is filled from it. This
  is the only way "there is a gas station in this region" can be true on every seed.
- **Count is hard, distances relax.** A region always gets its full roster; siting radii widen in
  steps until a placement exists. `POI_ROSTER` order is a PRIORITY order — a pool too small for 14
  starves mission givers from the bottom, never the reserved types.
- **3.5 km station separation was measured and rejected → coverage objective.** The region is 5 km
  wide and its road network only spans ~4.7 km of that, so a 3.5 km floor drove both stations onto
  opposite rims and left a station-free band through the middle *including spawn* — the inverse of
  the intent. Stations are now sited to minimise the worst drive from any pad to the nearest one,
  with a 2 km anti-clustering floor (`poiStationMinSep`). Measured: worst drive 2.25–2.42 km on
  seeds 6/1/42/777, rosters complete and both houses inside 1 km on all four.
- **Rings are near-field** (`POI_RING_SHOW_R` 50 m). A modelled POI reads as itself from far off;
  a field of orange curtains flattened the landscape into a game board. The ring's job is now
  "here is where you stop", not "there is something here".
- **Window-invariance moved, and narrowed.** A pad's POSITION is still a pure function of
  (seed, edge) and is asserted over the candidate pool. WHICH pads are promoted, and to what type,
  is necessarily region-scoped — no edge-local rule can promise a region two gas stations.
  `build()` runs once per region on the spawn, so selection is stable in play.
- **Solid contact is an ORIENTED box.** `queryContact` rotates into the marker's frame and uses the
  registry's authored dims. A 12 m trailer at 40° to the world axes has a world AABB half again its
  size — an AABB would stop the truck two metres shy of the wall. Keyless POIs keep the cube, whose
  contact is bit-identical to before (a cube is rotation-invariant).
- Collision metadata is stamped onto the POI record at build time, off the registry — physics never
  waits on a GLB fetch to decide whether a building is solid.

## Acceptance (sketch — refine when scheduled)

- POI records (or a type→key lookup) carry an optional `modelKey` into `data/prop-models.js`.
- `_rebuildPoiMarkers()` spawns the model when a key is present; keyless POIs keep the orange
  cube. Ring logic untouched (already independent of the marker mesh).
- Solid contact uses the registry `collision` metadata when a model is present, `poiCubeSize`
  otherwise; driving into a modelled POI feels identical to driving into the cube today.
- Far-distance readability is decided explicitly (ring-only vs beacon assist) and stated.
- At least one POI type is modelled in-world as proof.

## Notes

- Asset authoring follows `.planning/research/ASSETS.md` (base-seated, forward = −Z, no
  Draco/KTX2); each model is a `.glb` drop + one `PROP_MODELS` entry + one vite `RUNTIME_ASSETS`
  line (the copy list is explicit, not a glob).
- POI *types* themselves (which POIs exist, where they spawn, what missions they source) are
  story-mode design territory — DESIGN.md invariants win over this ticket on any conflict.
