---
id: FEAT-46
type: feature
status: completed
opened: 2026-07-28
closed: 2026-08-01
severity: minor
source: user-request (scoping session 2026-07-28)
relates_to: >
  FEAT-43 slice 1 (story-mode fixed region — this ticket OWNS that slice now),
  FEAT-21 (road POI scatter — reframed, see "Relationship to FEAT-21"),
  FEAT-45 (dispersed camping areas — shares the good-ground scoring),
  FEAT-16 (2D map), FEAT-29/mission.js (par + Quick Job), QUAL-10/11/13 (junction pad carve)
---

# FEAT-46: Story-mode POIs — orange cubes on their own lay-by pads

Points of interest dispersed along the road network, each on its own flattened pull-off pad
beside the road. Placeholder art is an **orange cube**. Drive up, press a key, get a mission
that starts *there*. Story mode only.

This is FEAT-43's slice 1, grown into its own ticket because the pad earthwork and the siting
rule are real work, not a placeholder detail.

## Ratified constraints (from the scoping session + DESIGN.md)

- **POIs are arbitrary `(edge, arcS)` points, never graph nodes.** DESIGN.md "Where missions and
  POIs live" [RATIFIED 2026-07-20]. Nodes are a routing artifact ~640 m apart, mostly junctions;
  a place is no likelier at a T than mid-edge.
- **Story mode only, for now.** Free roam never builds pads or cubes.
- **POIs must not influence routing determinism** (NEW, owner 2026-07-28). The same seed opened
  in free roam and in story mode must produce **identical centerlines, identical road surface,
  identical par** — you just don't see the pads in free roam. Concretely:
  - Nothing about POIs may enter `routeCacheSig`, the abstract graph, the router cost model, or
    the crossing cull. POI placement runs strictly *downstream* of routing.
  - **The pad carve must never modify the road's own cross-section.** It composes as an extension
    of the shoulder/embankment *beside* the road; wherever the road cross-section covers a sample,
    the road wins. This is what makes "drives the same" literally true, not approximately true.
- **Uniform siting with bad ground rejected** (owner choice). Flat open ground bordering a road.
  **ON water is rejectable; near water is not** — waterside pullouts are good, and FEAT-45's camp
  scoring wants proximity to water as a *positive*.
- **No teleport on accept.** The POI mission starts where the player is standing. "The player
  should know they need to get outta there quick." (Quick Job's own teleport-to-start flow is
  unchanged — this is a second, distinct entry path.)

## Design

### 1. Placement — deterministic, window-invariant

Key the roll off the **abstract graph edge id (`cellA`/`cellB` node ids)**, *not* the streamed
`runKey`. BUG-25: the window-bounded crossing cull flips whole edges on re-stream, so runKey-derived
placement would not be window-invariant. (In story mode the network is frozen after entry so it is
stable in practice — keying off the graph keeps it honest and survives a future region re-anchor.)

Per graph edge inside the region:

1. `hash(worldSeed, cellA, cellB)` → whether this edge carries a POI at the density knob, plus an
   ordered list of candidate `arcS` values along the edge.
2. Take the first candidate that **passes every reject test** (below). All candidates rejected ⇒
   the edge yields no POI. Order-independent, deterministic, no global state.

The lay-by anchor for a candidate is the centerline point at `arcS`, offset laterally by
`roadHalfWidth + roadShoulderWidth + POI_PAD_GAP` on the hashed side.

**Reject tests** (each cheap, each reading a signal the sim already produces):

- **On water.** Pad footprint overlaps a pond/lake polygon or a stream channel → reject.
  *Near* water is explicitly fine.
- **Earthwork cap** — the "flat open ground" test, expressed as the scar it would cut. Sample raw
  terrain over the pad footprint; reject if `max |rawY − padY| > POI_MAX_CUT_FILL`. This bounds the
  cut bank directly rather than via an abstract slope threshold, and it is the same quantity that
  makes a pad look wrong when it's wrong.
- **Junction proximity.** Inside or near a junction pad ring, a deg-2 connector fillet, a tunnel
  portal, or a stream causeway → reject. These already own their earthwork; a pad on top of one
  fights it.
- **Road cross-slope cap.** A lay-by hung off a superelevated sweeper reads wrong — reject above a
  camber threshold at that `arcS`.

The accept/reject score should be written so **FEAT-45 can reuse it** as its good-ground field
(DESIGN.md already asks FEAT-38/FEAT-45/FEAT-21 to read one shared "good ground" signal).

### 2. The pad — a lay-by carve

```
      ______________________
  ─────────────────────────────  road
        \____________/
         [pad]  ▪cube
```

Reuses the **exact shape** of `_junctionPadCarve` (`src/road.js:4862`) minus the legs: a footprint
with `blendW = 1` inside + `PAD_RIM_HOLD`, then the shoulder + fill/cut ramp out to the toe, DIRT
convention, composed by `_mergeCarve`. Differences from a junction pad:

- **Design surface is flat**, not the ruled inter-leg blend — there are no legs. Top Y = the road's
  top Y at that `arcS`, so the pad is flush with the shoulder and driveable onto.
- **Footprint is a stadium/oblong aligned to the road tangent**, not a circle — a pullout is longer
  than it is wide. (A circle is the fallback if the oblong signed-distance turns out fiddly.)
- Provides `padTopY` / `padSd` the same way, so the physics on-pad overlay (`_sampleCarveWorld`,
  `src/road.js:4024`) works unchanged and **mesh == collision** holds on the pad.

**No `CARVE SYNC` worker mirroring needed.** The terrain worker receives a main-thread-built
`carveTable` Float32Array (`src/terrain.js:1282`) and never runs road carve code itself — so this is
a main-thread-only addition. That is the single biggest scope win in this ticket.

### 3. The cube

Orange cube, ~1.5 m, sitting on the pad centre. Placeholder art (FEAT-43's language) — this stands
in for a building/NPC/trailhead sign until there is real art.

**Recommendation: give it a solid collider** (the existing prop-collider class). A marker you drive
through reads as fake, and the physics is the whole point of the project. Trivially flipped if it
turns out to be annoying in play.

### 4. Interaction

- Within `POI_INTERACT_R` (~15 m) and near-stationary → an on-screen prompt appears.
- **Press `E`** → generate a mission whose **start point is that POI's `(runKey, arcS)`**, end
  rolled as Quick Job does today, priced by the FEAT-29 par oracle, **countdown starts immediately
  with no teleport**. (`E` is unbound today — checked `src/main.js` keydown handlers.)
- `src/mission.js`'s shared start path (`_startRun`, `src/mission.js:179`) currently *always*
  teleports to the start pin. It needs splitting: teleporting entry (Quick Job) vs in-place entry
  (POI). The `_roll()` region-confinement guards (FEAT-43 fix 1) still apply to the **end** point.
- Quick Job is **unaffected** — still anywhere-to-anywhere, with or without POIs present.

Par note: the mission's start is the POI point, which sits a few metres off the centerline. Par
integrates from the road point at `arcS`; the lay-by metres are unpriced. Accepted — it's noise
against a multi-km leg.

### 5. The 2D map

New `_drawPOIs(ctx)` in `src/map2d.js`, drawn under the car marker (world furniture, like
`_drawRegion`), orange to match the cubes, plus a legend entry. Story mode only. This is the
navigate-to-it affordance — you see an icon, you drive there, you press `E`.

## Relationship to FEAT-21

FEAT-21 ("POIs scattered along road edges") was opened 2026-06-30, **before free roam and story
mode were separate things** — its free-roam framing is an artifact of that, not intent (owner,
2026-07-28). FEAT-46 supersedes its core. On landing FEAT-46, close FEAT-21 as superseded, or
retain it only for the *variety* pass (POI types, naming, siting flavour) explicitly scoped to
story mode.

## Acceptance

- [x] POIs are deterministic and window-invariant: same seed + region -> same POIs, from any stream
      centre and across a re-enter.
- [x] **Routing parity**: POI placement provably touches no routing input - gated (no edge
      registered or deleted, `_networkRev` untouched).
- [x] **Road-surface parity gate**: 11,725 carve probes across five lateral offsets on every
      registered run are bit-identical with and without the pads.
- [x] Pads are flush with the shoulder and driveable onto; mesh == collision on the pad (both
      composition sites share `_poiPadCarve`; gated flat + fully carved).
- [x] No POI on water; none overlapping a junction ring, connector fillet or tunnel portal;
      earthwork bounded by `poiMaxCutFill`.
- [x] Orange cube renders on each pad; map shows orange icons with a legend entry, story mode only.
- [x] Driving within range + `E` starts a mission from that POI, **no teleport**, priced by the par
      oracle.
- [x] Quick Job flow unchanged (still teleports, still anywhere-to-anywhere, still region-confined).
- [x] Free roam is bit-for-bit unchanged - no pads, no cubes, no map icons, no perf cost.
- [x] `npm run test:all` green (41 gates, +1 new: `test/story-poi.mjs`).

## What shipped

- **`src/poi.js`** - placement + siting + the cube's hard contact. THREE-free, no worldgen of its
  own, everything through a `deps` adapter (the `src/story.js` isolation discipline).
- **`RoadSystem`** - `setPoiPads` / `_poiPadCarve` / `poiPadBlocked`, and `junctionPadNodes()`
  renamed `padReachNodes()` now that it lists both pad kinds.
- **`terrain.js`** - one composition line in `_carveTableGen` (plus hoisting `latDist`). No
  `CARVE SYNC` worker mirroring: the worker consumes a main-thread-built `carveTable`.
- **`mission.js`** - `enterFromPoi()`, an anchored `_roll(anchor)` that pins the start to the POI's
  `(edge, arcS)` and prepends its partial stretch as a par segment, and a `_launch()` that skips the
  teleport for a POI job.
- **`story.js`** - `_goLive(frozen)` + `onRegionLive` / `onRegionExit` deps.
- **`main.js` / `index.html` / `map2d.js`** - cubes, the `E` prompt, the contact splice, the prop
  keep-out, map icons + legend, `window.__poi` harness handle.

**Measured on seed 6**: 4 POIs in the live 2500 m story region; 30% of forced candidate edges accept
(the rest reject on their ground); story entry unchanged; no console errors on a real entry.

### Decisions taken during implementation

- **The earthwork cap measures against the ROAD-CARVED surface, not raw terrain.** Raw bills the pad
  for the road's own cut/fill - a seed-6 median of 10 m - and rejected literally everything. Against
  the carved surface the best-of-two-sides distribution is p25 2.7 m / p50 3.5 m, so the 3.0 m cap
  admits about a third of candidates.
- **The side is chosen by the ground, not the hash** - both sides are evaluated and the cheaper bench
  wins. On a mountain road the two sides are a 1:1 cut bank and a 3:1 fill, so this is both the
  cheaper bench and the more believable siting. Emergent, not injected.
- **The region clip is a POST-FILTER, never a reject test.** Inside candidate selection it made
  *which* arc position won depend on the region centre, so POIs 400 m inside the wall moved when the
  window moved - caught by the window-invariance check at 375 m of drift.
- **`streamChannelAt` always returns a record** (`{inChannel:false,inBank:false,stream:null}` away
  from any stream), so it must be read, not truth-tested. Truth-testing it rejected every candidate.
  Only `inChannel` rejects - the bank is exactly the waterside pullout we want.
- **The cube is solid** (sphere-vs-box spliced into the contact pipeline) and **props are kept off
  the pad** (the scatter's road keep-out now covers a pad; chunks scattered before the pads existed
  are released so they re-scatter against the finished ground).

## Open (deliberately deferred)

- Density: `poiEdgeChance` 0.20 gives 10 POIs in the seed-6 2500 m region (was 0.10 / 4 POIs —
  doubled on owner request 2026-07-28, the original 4 are a subset since the roll is per-edge
  independent).
- The prompt is a HUD line, not a world-space label.
- No POI variety (types, names, differing mission flavours) - that is FEAT-21's remaining scope.
