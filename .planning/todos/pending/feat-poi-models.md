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
- **the burger joint** (a specific, named food vendor)
- **service shop** — this IS the in-run mechanic (ruled 2026-08-03): field repairs cover the
  simple stuff; complicated work (engine repair) is service-shop-only, and they change a tire
  faster than you can. Distinct from THE GARAGE, which stays the between-runs meta-roster.
- gas stations
- **general store** — the items catalog (`items.md`: consumables, tools, parts) lists most items
  as "bought/found" with nowhere to buy. Distinct from food vendors.
- **tackle shop** — the catch category (`items.md` §5). ⚠ Fishing and The Confluence are
  deferred; the type exists, don't build its systems first.

### Still proposed (unratified — accept/reject)

- **Scrap / junk yard** — the "found" half of "bought/found"; a browsable place for cheap or
  one-off items.
- **Day-job site** — `opening.md`'s day job is the opening beat and needs a physical place to
  report to.
- **Community board** — a mission-provider *variant* (paper notices, no NPC) that fits remote
  junctions where a staffed provider wouldn't; cheap way to spread offers spatially.

### Rejected

- **Log landing / sawmill drop-off** (2026-08-03): the log-drag is *clear the road*, not a
  delivery — the log goes nowhere. (And the mission type itself is now uncertain — owner may cut
  it; `missions.md` still lists it as the main mission.)
- **Campground:** dispersed camping is the ratified model (no developed campsites,
  Innkeeper → THE HOST). No campsite POI type should exist.

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
