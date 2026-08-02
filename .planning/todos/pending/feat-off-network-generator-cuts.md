---
id: FEAT-52
type: feature
status: open
opened: 2026-08-01
severity: major
source: owner scoping 2026-08-01 — "The Highway and the Shortcut", plus the consolidation ruling that
  four tickets were each growing tracks into the same empty back-country
relates_to: >
  DESIGN.md "The off-network layer" [RATIFIED 2026-08-01] — the consolidation ruling;
  spirits-and-pacts.md #05/#06 The Highway and The Shortcut (the deferred spirit layer this substrate
  serves, and #03 The Verge which it retires);
  FEAT-38 (dirt roads — mode B dispersed spurs FOLDS IN HERE; mode A re-surfacing stays there),
  FEAT-32 (logged forest — logging sites become a purpose tag on this generator's output),
  FEAT-21 (POI scatter — variety pass), FEAT-46 (shipped POI pads — the routing-parity precedent),
  FEAT-45 (shipped camp zones — consumes this generator's good-ground score),
  FEAT-39/src/gps.js (routing preference + the shortcut-GPS item), FEAT-29/src/par.js (par is
  ALWAYS the road route — see below)
blocks: the Shortcut relationship (deferred); FEAT-38 mode B; FEAT-32 siting
note: "ONE generator for everything off the routed network — spurs, cuts, camping areas, logging
sites, POI candidates. A track that dead-ends is a spur; a track that rejoins is a cut. Strictly
downstream of routing: road centerlines must be BIT-IDENTICAL with and without it (FEAT-46's shipped
parity gate is the template). Hazard PLACEMENT is worldgen; hazard REMOVAL is run-layer, gated on the
Shortcut's esteem (amended 2026-08-02 — was 'passability is worldgen, full stop'). Two passes:
inherent difficulty (free), then discrete CARVED hazards (favour-gated)."
---

# FEAT-52: The off-network generator — spurs, cuts, and the shared good-ground field

## Why this exists

Four separate tickets were each growing dirt tracks into the empty space between road edges:
**FEAT-38** mode B (dispersed-camping spurs), **FEAT-32** (logging landings), **FEAT-45** (camp
areas), **FEAT-21/46** (POI siting). They compete for the same ground, the same crossing cull, and
the same "is this good ground" question — and nothing said who owned it.

**Owner ruling 2026-08-01: they are one system.** One generator emits off-network tracks and their
endpoints; *purpose* is a tag on the output, and **topology decides it**:

> **A track that dead-ends is a spur. A track that rejoins the network is a cut.**

That is also, exactly, the fiction of the Highway/Shortcut pair — same substance, different fate.

## Hard constraints (non-negotiable — these are inherited, not invented)

1. **Strictly downstream of routing.** Nothing in this layer may enter `routeCacheSig`, the abstract
   graph, the router cost model, or the crossing cull. **Road centerlines, road surface and par must
   be bit-identical with and without the off-network layer.** FEAT-46 shipped exactly this gate
   (11,725 carve probes across five lateral offsets, `test/story-poi.mjs`) — extend it, don't
   reinvent it.
2. **Pure `(worldSeed, coords)`, window-invariant** (SM-INV-12). Same seed → same tracks from any
   stream centre and across a re-enter. Key the roll off **abstract graph edge identity**
   (`cellA`/`cellB`), never the streamed `runKey` — BUG-25 flips whole edges on re-stream, so
   runKey-derived placement is not window-invariant. This is the mistake FEAT-46 already made and
   documented.
3. **Hazard PLACEMENT is worldgen; hazard REMOVAL is run-layer** [amended 2026-08-02 — was
   "washout passability is WORLDGEN, not run-layer"]. Where a hazard sits is pure `(worldSeed, coords)`
   and fixed on that seed forever. **Whether it has been cleared is a function of the Shortcut's
   esteem**, moving only at day boundaries (SM-INV-12). **Literacy survives and improves**: you learn
   *"that one has a slide two thirds in"* and it is true every run on that seed — what changes is
   whether you can get past it. See `spirits-and-pacts.md` #05/#06 (rebuilt 2026-08-02).

4. **Two passes** [RATIFIED 2026-08-02]:
   - **Pass 1 — inherent difficulty.** Tight radii, no banking, bad surface. **Free** — it is what an
     unengineered route *is*, and it is exactly why the router honestly costs a cut as bad line.
     Nothing to author, nothing to clear. **Steep and tight are not hazards.**
   - **Pass 2 — discrete hazards.** Rockslide, water crossing, rutted-out section, sharp rock.
     **These must be carved.** [owner] *"A cut might happen to cross a natural stream, but we get no
     control over where, how, or whether it's drivable. To guarantee a hazard that is drivable,
     punishing at the right level and rewarding at the right level, we have to generate it."*

   Budget discipline, because pass 2 is the only favour-gated part and therefore the only thing that
   invalidates: **keep hazard carves short (~20 m, not 200)**; **keep favour tiers coarse (4–5,
   day-boundary only)** — that is ~4–5 re-carve events per run, a region-unlock-shaped cost rather
   than a per-day one; and **never let a favour change trigger a world regen**, only local segment
   invalidation.

   *Terrain-fragility weighting (inherited from the retired #03 The Verge) finds its consumer here:
   which hazard type a cut gets, given its ground.*
5. **No hand-placement.** The pattern emerges from the mask (`[[feedback_emergent_over_injected]]`).

## Scope

### 1. The generator

Seeded growth off host edges into the gap between network edges, **chained** with a decaying budget
so tracks thin out with distance from the road (a spur may sprout a child spur). Must respect the
existing self-clear / crossing-cull discipline: a track that would collide is simply not grown.

Placement character, per the owner's scoping:

- **Mostly leg-to-leg corner shaves** — adjacent legs with a wide interior angle. This is what real
  social trails are; nobody bushwhacks a novel route, they cut the switchback.
- **Occasional long ones** where the network detours around terrain — the old ford, the drainage
  crossing. These read as history and feed the horror layer for free.
- **Seeded with pre-existing tracks** (logging spurs, mining tracks, stock driveways) so using a cut
  is **following, not founding**. The good line was already there.

### 2. Purpose tagging

| topology | purpose | consumer |
|---|---|---|
| dead-ends at a scored clearing | **spur** → camp candidate / POI candidate | FEAT-45 (shipped), FEAT-21 |
| dead-ends at a worked site | **logging landing** | FEAT-32 |
| **rejoins the network** | **cut** | the Highway/Shortcut pair (deferred), par, GPS |

### 3. The shared good-ground score

One field, read by every consumer: **flatness · shade (tree density) · water proximity · view**
(terrain area visible from the site — a raytrace/horizon sample; the most expensive term, make it
optional). FEAT-45 already ships a camp vibe score — **extend it, do not fork it.**

Note the three-layer camping model this feeds (DESIGN.md): region campable flag → **valid camp
locations** (hard rejects: in water, not flat enough) → **site quality** (the score). Spurs and
landings *feed candidates*; they never gate.

### 4. GPS and par

- **GPS routes the road, not the cut** (FEAT-39). It prefers the maintained network and takes a cut
  only when there is no road route to the destination. **The obfuscation is structural, not
  cosmetic** — by the router's own cost function a cut *is* bad line (tight radii, no banking, bad
  surface), so honest routing avoids it. Nothing is hidden; the router simply disagrees with you.
- **Par is ALWAYS computed on the road route, and nothing here changes that** [clarified
  2026-08-01]. Geometry-only, item-blind, pact-blind (SM-INV-2). A player who takes a cut beats par
  by *driving a shorter way* — par did not move, their route did. Two consumers sit downstream and
  neither belongs to this ticket:
  - **The Shortcut relationship** (deferred) — *he* is what reveals cuts, in three stages: on the
    map, then a marker floating over the ones that go, then hazards clearing. **Rebuilt 2026-08-02:
    there is no pact and no par penalty** — the route domain is relationships, not pacts.
  - **The shortcut-GPS item** (`items.md` §2) — a **display layer** over what he has already revealed:
    FEAT-39's chevrons and junction boards applied to cuts. It is worthless at zero esteem, so it
    cannot ship as a standalone ahead of the spirit layer. *(It previously could — that was the
    "strictly stronger than the pact" model, retired 2026-08-02.)*

  **Gating rule this ticket must support:** with no standing and no chip, the player is **never routed
  through a cut** and does not know where they are — cuts stay something you find yourself.

### 5. Cut-traversal detection (a small, load-bearing signal)

Emit an event when the player **completes** a cut: entered from one road, exited onto **a different
road**. A through-passage — reversing back out the way you came is **not** a completion.

Small, but two systems need it and one is already ratified:

- **It is the Shortcut's summoning ledger** (`spirits-and-pacts.md` #06, ratified 2026-08-01). He has
  no memory of being built and cannot know he goes anywhere until someone proves it by coming out the
  other side — so the completion event is literally what tells him he connects. He then visits at the
  **campsite the following night**, never mid-drive.
- **It gates the Highway's skip detector** (#05, rebuilt 2026-08-02) — but with the **opposite sign
  to the original spec**. ⚠ **A completed cut no longer offends the Highway; cuts are fine by him.**
  What this event does for #05 is *suppress* his check: entering a cut must silence the
  intentional-non-shortcut-skip test until the player rejoins the network, or a forgiven
  cross-country escape from a **failed** cut reads as a bypass. Cheap, and easy to forget.

**Also needed by #05 — the intentional-non-shortcut-skip detector** [RATIFIED 2026-08-02]. A separate
signal from the above: the player **left the maintained network and rejoined it having saved more
than ~200 m of road distance, by a path that was not a cut.** The **magnitude of the distance skipped
scales the penalty** (a 250 m shave costs a little camber; a kilometre costs a lot), and the effect is
graded and cumulative — flat is a floor it approaches, never reaches in one event. It must be
impossible to trip by accident: parking on grass, using a shoulder, or sliding off a corner never
rejoin *downstream*, so they never skip road distance. ⚠ **Verify against junction-pad and lay-by
geometry** — graded pads are wide, and a pad chain might let a player save ~200 m without leaving the
road surface. *(Owner: if it breaks in practice, that is a bug to fix, not a reason to redesign.)*

**Precision matters here more than it looks.** A false positive costs the player their Highway favour
and a visibly worse world, so the event must fire on a genuine through-passage only — **in from one
road, out onto a different road.** Reversing back out the way you came is not a completion. Parking on
a spur, using a shoulder, or sliding off a corner must never trip it.

Keep it a plain event with the cut's identity and both road endpoints; do not build a ledger here.

## Explicitly out of scope

The Highway/Shortcut **spirits** (deferred with the whole spirit system — do not build pact plumbing).
Wear/fatigue/tow costs of cut travel (those land with SM-3's wear model and the tow economy; this
ticket only makes the ground exist). FEAT-38 **mode A** edge re-surfacing stays in FEAT-38.

## Open questions (plan mode)

- **Does a cut re-enter the crossing cull as an obstacle?** It must not affect road routing, but two
  cuts crossing each other, or a cut crossing a stream, needs a rule.
- **Surface treatment** — do cuts reuse FEAT-38's dirt ribbon + noise, or are they rougher still
  (unmaintained two-track, no carve at all, just terrain the truck can survive)? The second is
  cheaper and arguably more honest: a cut that got a carve pass is a road.
- **Density knobs** and how "cut-richness" varies by region (a per-region parameter state, SM-INV-11).
- **Washout representation** — a boulder field, a slide, a collapsed culvert? It has to be legible as
  *impassable* from far enough back that committing is a real decision, but not so far that the
  decision is free.
- **View scoring cost.** A visibility raytrace per candidate is the one expensive term in the
  good-ground field; sample count and whether it runs at all is a perf call.

## Acceptance

- [ ] One generator emits off-network tracks; **topology assigns purpose** (dead-end = spur, rejoin
      = cut) and every existing consumer reads from it rather than growing its own.
- [ ] **Routing parity gate**: road centerlines, carve surface and par are **bit-identical** with and
      without the off-network layer — extending `test/story-poi.mjs`'s probe methodology.
- [ ] Deterministic and window-invariant across seeds and re-streams, keyed off abstract graph edge
      identity, verified from multiple stream centres.
- [ ] **Washout passability is deterministic per seed** — the same cut is passable or not on every
      visit, in every run, forever.
- [ ] Cuts read as *found*, not built: no lane markings, no banking, tight radii, rough surface.
- [ ] GPS prefers the maintained network and routes over a cut only when no road route exists.
- [ ] **Cut-traversal completion fires an event** (in one road, out a different road); reversing out
      does not. This is the Shortcut's summoning ledger — see §5.
- [ ] The good-ground score is one shared function; FEAT-45's camp scoring consumes it unchanged.
- [ ] New tunables exposed as **USER-OWNED sliders**; HUD/log audited (`[[feedback_phase_housekeeping]]`).
- [ ] `npm run test:all` green; route cache re-baked if any `road*` param moved
      (`[[project_qual13_sloped_pads]]`).

## Related

- Precedent for the whole parity discipline: `todos/completed/feat-story-poi-pads.md` (FEAT-46) —
  read its "Decisions taken during implementation" before starting, especially the region-clip-as-
  post-filter trap and `streamChannelAt` always returning a record.
- Design: DESIGN.md "The off-network layer"; `spirits-and-pacts.md` #05/#06 (and #03, retired).
- Determinism: SM-INV-12; `[[project_reachability_window_noise]]`, `[[project_bug25_edge_flip]]`.
