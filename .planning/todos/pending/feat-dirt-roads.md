---
id: FEAT-38
type: feature
status: open
opened: 2026-07-19
severity: minor
source: user-request
relates_to: >
  road router + graph (src/road-graph.js, ROUTE SYNC region of src/road-carve.js),
  road ribbon (src/road-mesh.js), tire friction (src/tire.js frictionCoeff),
  dust (src/dust.js onRoadFactorAt), FEAT-06 props/dust flair, FEAT-21 POI/campsite scatter,
  FEAT-28 region unlock, story mode (SM-INV-6/11/12/13)
note: "Dirt roads: a second road surface class. Same router architecture, different tuning
(less earthwork, less camber, tighter radii) + a noise-textured ribbon sweep, its own (lower)
friction coefficient, and dust flair. Two placement modes — (a) RE-SURFACE a fraction of the
router's existing graph edges as dirt, and (b) GROW dispersed spurs off those edges into the
empty space between the network as 'dispersed camping' stubs, kept chained so the highway never
feels interrupted. Regionality dials dirt presence up in later story regions. Ambient world
variety in free roam; a story parameter-state + campsite feeder under story mode. Capture only —
the story coupling is designed against DESIGN.md when story mode is scheduled, not now."
---

# FEAT-38: Dirt roads — a second surface class (re-surfaced edges + dispersed camping spurs)

## Context

Today every road is one surface: a crowned, cambered asphalt ribbon (`src/road-mesh.js`, SURF-01/02),
routed by one cost model and gripped at one global `frictionCoeff` (`data/ranger.js` → `src/tire.js`).
The world reads as an all-paved network. **Dirt roads** add a second surface *class* that reuses the
whole road pipeline — graph → router → per-connection centerline → ribbon sweep → carve → dust — but
swaps the *character* at each stage: rougher routing, a noise-perturbed surface, less grip, and dust
where asphalt is clean. That single change buys a lot of world texture cheaply, and it opens two
distinct placement stories the user wants:

- **A — Re-surfaced edges:** a fraction (the user's framing: **~20–100%**, region-dependent) of the
  router's *existing* graph edges generate as dirt instead of asphalt. The network topology is
  unchanged; only the surface class of chosen edges flips.
- **B — Dispersed-camping spurs:** *new* dead-end dirt tracks that **grow outward off the base edges
  into the empty space between the network** — the "forest road that peters out at a clearing" —
  standing in for **dispersed camping areas**. These must be **chained** (a spur hangs off a road, and
  further stubs can chain off a spur) so a region reads as "the highway, with dirt tributaries," never
  "the highway randomly interrupted by an orphan dirt stretch."

**Regionality** gates the amount: early story regions are mostly paved; later regions are increasingly
dirt (both a higher re-surface fraction and more/longer camping spurs). In free roam this is ambient
variety; under story mode it is a per-region **parameter state** (SM-INV-11), keyed off `metaState`
(SM-INV-12), exactly like FEAT-32's logged-ness.

## Desired behaviour

### Router / topology
- A **per-edge surface class** (`asphalt | dirt`) chosen by a deterministic, window-invariant rule
  (see Mechanism). Dirt edges route with a **modified weight set**, same router architecture:
  - **Less earthwork** — dirt roads hug the terrain (higher grade tolerance, cheaper to leave the
    ground lumpy rather than cut/fill it flat). This is the `roadWork`/grade-pricing lever, relaxed.
  - **Less camber** — dirt roads are ~flat, not banked. The crown/camber amplitude is reduced (near
    zero) for dirt cross-sections.
  - **Tighter radii** — dirt roads accept a smaller min turn radius (the valid-by-construction radius
    floor is lowered for dirt), giving them a twistier, less engineered feel.
- **Dispersed-camping spurs (mode B):** short dirt dead-ends seeded off a host edge, heading into the
  gap between network edges, terminating at a small clearing/pad (a natural campsite candidate). Spurs
  **chain** — a spur may itself sprout a further stub — with a decaying budget so they thin out with
  distance from the network. They must not re-cross the network or each other in a way the cull rejects
  (respect the existing self-clear / crossing-cull discipline; a spur that would collide is simply not
  grown).

### Surface (ribbon)
- **Noise-textured sweep:** the dirt ribbon's surface is perturbed by a **noise algorithm** for
  "texture" — subtle height/normal variation (ruts, washboard, undulation) layered onto the swept
  cross-section, plus a dirt vertex colour instead of asphalt grey. Lane markings are **off** on dirt
  (the `markEnable` path in `road-mesh.js` already gates this — dirt sets it to 0, like the existing
  skirt). Decide whether the noise is **mesh geometry** (real vertex-Y, so `computeVertexNormals` and
  physics `analyticNormal` agree — consistent with D-04) or a **normal-map/shader** effect (cheaper,
  but physics stays smooth). Honest-physics bias says at least the coarse undulation should be real
  geometry so the truck actually feels the road; fine grain can be shader-only.

### Physics (friction)
- Dirt has a **lower peak friction** than asphalt. `frictionCoeff` is currently a single global read in
  `tire.js`; dirt needs a **per-contact-patch surface lookup** so a wheel on dirt grips less than one on
  asphalt (and than one on raw terrain — order likely asphalt > dirt > off-road grass, TBD). This is the
  first time surface *type* (not just road membership) reaches the tire model — see Mechanism.

### Visual flair (dust)
- Dust **kicks up on dirt** where it is suppressed on asphalt. `dust.js` already takes an
  `onRoadFactorAt(x,z)` multiplier (currently used to *suppress* dust on the paved ribbon) — invert/extend
  it so a dirt ribbon *drives* dust rather than killing it. Intensity scales with speed/slip as the dust
  system already does.

## Mechanism notes (where this plugs in)

- **Surface class is a per-edge tag, chosen by a deterministic mask.** The road graph is a blue-noise
  Urquhart graph (`src/road-graph.js`); routing is per-connection over its edges. Add a **stable
  per-edge surface decision** — a pure function of the edge's node identity (already
  `[cmx,cmz,k]`) + `worldSeed` + a low-freq regional "dirtness" field. A region's dirtness scalar sets
  the *fraction* of edges that flip (the ~20–100% knob) and the spur budget. Must be **window-invariant
  and re-stream-stable** (same discipline as everything — [[project_reachability_window_noise.md]],
  [[project_perf_worldgen_routing.md]] cull invariance). Do NOT hand-pick edges; the pattern must
  **emerge** from the mask, per [[feedback_emergent_over_injected]].
- **Chaining spurs deterministically.** Grow spurs by a seeded rule keyed off the host edge identity so
  the same spurs appear every visit and across windows. A spur is just another routed dirt run with a
  synthetic endpoint (a scored clearing in the gap); chaining = the spur's endpoint can host a
  child spur with a reduced budget. This likely wants its own small generator alongside the graph, not a
  bolt-on in the hot path.
- **Router weights become surface-dependent.** The router (canonical `arcPrimitiveConnect` + Dubins in
  the **ROUTE SYNC** region of `src/road-carve.js`, **mirrored verbatim into `WORKER_SOURCE`** in
  `src/terrain.js`) reads the weight set. If dirt weights are per-run, the worker mirror must reflect it
  in the **same commit** (`test/route-worker-sync.mjs` gate asserts byte-identity, modulo escaping —
  watch the backtick-escaping gotcha in [[project_perf_worldgen_routing.md]]).
- **Any new `road*` param ⇒ re-bake the route cache bundle** (`data/route-cache-default.json.gz`) — the
  standing rule from [[project_qual13_sloped_pads.md]]; road character reads the *routed* points.
- **Per-surface friction needs a contact-patch surface query.** RoadSystem already resolves road surface
  at a point (`_resolveRoadSurface`, `queryNearest`) and the mesh/carve read it; extend that to return a
  **surface class** so the physics step can pick the tire `mu` per wheel. Keep it cheap — this runs in
  the physics loop, so a coarse cached membership (like the carve's) is preferable to a full re-resolve
  per wheel per substep. `frictionCoeff` in `tire.js` becomes `frictionCoeff × surfaceMuScale`.
- **Ribbon noise reuses existing seed/noise helpers** (`src/seed.js`, simplex) so it is deterministic
  and, if it becomes real geometry, matches physics. Follow the SURF-01/02 attribute plumbing already in
  `road-mesh.js` (add a per-vertex surface/noise attribute rather than a new material where possible).

## Story hook (design later, against the bible — do not build the story parts now)

Two clean invariant ties; both are *why* this is worth more than ambient flavour:

- **Regionality = a story parameter state (SM-INV-11).** Dirt prevalence per region is a baked
  per-region parameter keyed off `metaState` (SM-INV-12) — early regions paved and civilised, deep
  regions dirt and wild, delivered with zero authored text. Same delivery surface as FEAT-32
  logged-ness and the sky/prop-palette states DESIGN.md already lists. Under story mode this is
  **baked, not slider-driven** (Game modes: story mode locks debug tooling).
- **Dispersed-camping spurs feed SM-INV-6 camping-is-a-place.** A spur that peters out at a scored
  clearing **is** a campsite candidate — the worldgen designating campable ground, exactly what SM-1's
  campsite detection and FEAT-21's POI/campsite siting need. Prefer spur-endpoint scoring that overlaps
  the camp-quality dimensions (flat, shade, water proximity) so the two systems share one "is this good
  ground" signal. Flag to FEAT-21 / the camp placer when either is scoped.
- Progression gating rides FEAT-28's per-region `metaState`, diegetically (SM-INV-13) — the trail into
  the dirt-heavy back-country opens as a region unlocks, not as a menu wall.

## Open design questions (decide at planning — do NOT resolve unilaterally; some are owner's per DESIGN.md)

- **Re-surface fraction curve:** is 20–100% a per-region *scalar* (one dirtness value per region) or a
  finer mask (dirt clusters *within* a region)? Likely a regional scalar feeding a per-edge mask; confirm.
- **Spur reach + chaining budget:** how far into the gap, how many chain generations, how dense — tuned
  so it reads as tributaries, not a second network. Sliders, USER-OWNED.
- **Noise = geometry vs shader** (physics honesty vs cost — see Surface). Probably coarse-geometry +
  fine-shader.
- **Friction ordering + values:** asphalt vs dirt vs raw off-road terrain — and does dirt grip vary
  wet/dry or with the surface noise? Keep v1 a flat per-class scalar unless cheap.
- **Wear coupling (story):** dirt roads don't add a wear *track*, but **dust exposure on dirt/dusty
  roads accelerates air-filter degradation** — a concrete, resolved tie into the SM-3 damage model
  (DESIGN.md "Damage, wear & repair"; air filter does ~nothing until ~20%, then accelerates engine
  wear). FEAT-38's job is only to expose a per-position "dustiness" signal the wear model can read;
  the filter track itself is built in SM-3, not here. Grip/crashes remain the v1 driving consequence.
- **Does a re-surfaced edge change the router's *reachability/par*?** Dirt's tighter radii + lower grip
  make a route slower — the FEAT-29 par oracle should read the surface class so par stays physics-honest.
  Flag to FEAT-29; don't wire it here.
- **Transitions:** how an asphalt edge meets a dirt edge at a shared node (a surface seam at the
  junction pad) — cosmetic blend vs hard line.

## Acceptance

- Driving the world, some road edges read clearly as **dirt** — flatter (no camber), twistier, hugging
  the terrain, with a **noise-textured surface**, **no lane markings**, a dirt colour, **less grip**, and
  **dust** where asphalt stays clean. The rest of the network is unchanged asphalt.
- **Dispersed-camping spurs** grow off base edges into the empty space, **chained** so the network reads
  as highway-plus-tributaries; each spur ends at a small clearing that is a plausible campsite.
- **Emergent + deterministic + window-invariant:** surface class and spurs come from a seed-driven,
  world-space rule (edge identity + `worldSeed` + regional dirtness field), identical across chunk
  windows and re-streams; no hand-placement. Existing asphalt edges keep their routed geometry (no world
  churn where dirtness is 0).
- **Per-surface friction** reaches the tire model: a wheel on dirt grips less than on asphalt, via a
  contact-patch surface-class lookup — cheap enough to stay in the physics loop.
- **Regionality knob** raises dirt prevalence (fraction + spur budget) for later regions; wired as a
  per-region parameter that story mode can bake off `metaState` (no slider access in story mode).
- New tunables (dirtness field freq/threshold, dirt router weight set, ribbon noise amp/freq, dirt μ
  scale, spur reach/budget, dust-on-dirt gain) exposed as **USER-OWNED sliders** in the debug panel; HUD/
  log audited for any new state ([[feedback_phase_housekeeping.md]]).
- Route cache bundle re-baked; `test/route-worker-sync.mjs` and the road/carve/prop gates stay green
  (`npm run test:all` before commit — heavy road+carve gates are affected).

## Related

- Router + graph: `src/road-graph.js`, ROUTE SYNC region of `src/road-carve.js` + `WORKER_SOURCE` mirror
  in `src/terrain.js`; [[project_perf_worldgen_routing.md]], [[project_qual08_router_worker.md]].
- Ribbon surface: `src/road-mesh.js` (SURF-01/02, `aMark`/`markEnable`, D-04 real-geometry camber);
  carve `src/road-carve.js`, `_resolveRoadSurface`/`queryNearest` (`src/terrain.js`).
- Friction: `src/tire.js` (`frictionCoeff`), `data/ranger.js`; dust: `src/dust.js` (`onRoadFactorAt`).
- Campsites / POI: FEAT-21 scatter, SM-1 campsite detection; FEAT-28 region unlock / per-region
  `metaState`; FEAT-29 par oracle (should read surface class).
- Story mode: [[project_story_mode_framing.md]], `.planning/story-mode/DESIGN.md` (SM-INV-6 camping,
  SM-INV-11 parameter-state story, SM-INV-12 determinism, SM-INV-13 diegetic gating); analogous
  world-content ticket FEAT-32 (logged forest) — same mask/determinism/story-hook pattern.
- Emergent-not-injected: [[feedback_emergent_over_injected]]. Route-bundle rebake rule:
  [[project_qual13_sloped_pads.md]].
