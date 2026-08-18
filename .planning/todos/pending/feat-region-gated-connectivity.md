---
id: FEAT-28
type: feature
status: open
opened: 2026-07-16
severity: major
source: design discussion (2026-07-16) following QUAL-19 corridor-tune — how to guarantee a player never
  spawns on / drives into a disconnected road island without adding meaningful road-gen overhead
relates_to: QUAL-19 (deferred corridor tune that surfaced this), QUAL-14 (corridor clearance + cull),
  FEAT-13 (Urquhart graph network), graph-cull-radius-invariance gate, project_reachability_window_noise memory
note: "Precursor to STORY MODE region unlocking — the connectivity-validation gate and the progression gate
  are the same mechanism. Design agreed; not yet scheduled. Do NOT pursue the earlier detect-and-bridge or
  cut-edge-protection ideas (see Rejected). Story-mode intent + invariants: .planning/story-mode/DESIGN.md
  (this ticket is milestone SM-0's keystone; SM-4 wires MISSION POINTS/story beats to the unlock trigger
  — SM-INV-13: the barrier must stay diegetic). 2026-08-01: unlocks are RUN-LAYER (Open Q3), so the
  validation load RECURS every run — hidden by warming the next region on region-unlock-mission ACCEPT,
  not budgeted. See 'The unlock load is HIDDEN, not budgeted'."
---

# FEAT-28: Region-gated connectivity validation (bounded unlock-time component check) — precursor to story-mode region unlocking

## Goal

Guarantee that every place a player can drive is part of one fully-connected road network — no spawning on
a stranded island, no long "run" that dead-ends into a region with no way back — **without adding per-stream
or per-frame road-gen overhead**, and **without softening the aggressive edge-culling** that gives the
forest-road vibe (thinned 4-ways, dead-ends, sparse branching; kills the self-looping/multi-crossing ugliness
that grade/length-primary routing produced — the reason the cull exists).

## The core problem this solves

Connectivity is a GLOBAL property; streaming is LOCAL. You cannot know whether a component is a true island
without walking its entire (possibly unbounded) boundary — and a detect-then-bridge scheme in a free-roam
streamed world would only conclude "island" after the player has already streamed the whole perimeter, then
pop an escape-hatch bridge somewhere they've already been. Two players on different paths would stream
different regions in different orders. Unbounded + path-dependent ⇒ intractable.

**Key insight:** bound the domain. The moment the playable universe is a FINITE set of unlocked **regions**,
"is this an island?" becomes finite and decidable — you only ever check "does this new region connect to my
already-validated reachable set," both sides bounded.

## Design (agreed 2026-07-16)

- **Regions** = fixed macro tiles (≈ the 1500 m window scale), coordinates + seed derived → deterministic,
  identical for every player.
- **Unlock-time validation:** when the play area grows (player levels up / story beat unlocks the next area),
  a **brief load** generates the newly-unlocking region(s) headlessly and runs a union-find component check
  between the new region's boundary nodes and the existing reachable set. Connected → unlock. Not connected →
  bounded repair (below). ~~Cost is paid ONCE at a level-up boundary during a load you already own~~ —
  **⚠ superseded 2026-08-01: unlocks are run-layer, so this is paid ~6× per run on EVERY run. See "The
  unlock load is HIDDEN, not budgeted" below.** Still never per-stream.
- **Culling stays aggressive at generation time.** The region check validates connectivity at the MACRO level
  only (does region R reach the network at all), never per-edge — dead-ends / thinned junctions / sparse
  branching all survive. If the cull happens to island a region, it's caught here.
- **Failure handling is bounded & local:** either defer the unlock (pick an adjacent region that DOES connect)
  or restore the single cheapest DROPPED interface edge (Kruskal-of-one over the discard pile at the region
  interface — tractable because both regions are loaded & finite). This is the "rather add a bridge than
  prevent a cull" instinct, made cheap. **⚠ See "The unsatisfiable region" below — the discard pile can be
  empty of viable edges, and this ticket must own that case too.**
- **Diegetic boundary:** a "Trail Closed / Area Beyond This Point Restricted" barrier at region edges so the
  player physically can't enter an unvalidated region. On-theme for the forest-ranger world — the connectivity
  mechanism and the progression gate become the SAME in-world object (level up → ranger reopens the next trail
  → validated-connected by construction). THIS is the story-mode hook.

## Constraints to nail (so it doesn't leak)

1. **Region borders must align to the macro-band / margin structure** so a border-straddling edge generates
   IDENTICALLY whether or not the neighbor is unlocked — otherwise unlocking a neighbor mutates a border edge
   and growth stops being monotonic. The existing window-invariance machinery gives this for free IF the region
   tiling respects the band boundaries and the margin covers the interface.
2. **Check runs over the GENERATED graph, not a windowed sample.** This is what avoids the reachability-metric
   noise (boundary-clip artifacts came from measuring a live stream window — see
   project_reachability_window_noise). A dedicated unlock-time full-region generation gives a clean,
   artifact-free component check.
3. **Deterministic unlock order** (pure fn of level/story state) → every player at level N validates & sees the
   identical network.
4. **Monotonic growth** — a region, once unlocked & validated, never becomes disconnected by a later unlock.

## Trade-off (accepted)

Makes the world **bounded-but-expanding** rather than truly infinite free-roam. For guaranteed-completable
long runs this is a FEATURE — a hard promise that every unlocked area is fully drivable, which pure infinite
streaming can never give. Progression naturally gates world growth.

## Relationship to story mode

This IS the substrate for **story-mode region unlocking**: the level/beat that opens a new area is exactly the
event that triggers the connectivity validation + trail-closed-barrier removal. Build the connectivity gate and
you have the region-unlock primitive; layer narrative triggers on top later.

## Rejected alternatives (recorded — do not retry)

- **Detect-components-then-bridge (in free-roam streaming).** Broken: island detection is global/unbounded;
  the bridge pops in somewhere already driven; path-dependent across players.
- **Cull cut-edge protection ("never drop a bridge").** Does the OPPOSITE of the aesthetic goal — it PRESERVES
  ugly load-bearing edges. User explicitly vetoed: prefers culling ugly edges and adding a bridge elsewhere.
- **Per-drop band-local conservative cull ("drop an edge only when a local detour is visible in band+margin").**
  Valid and window-invariant IF band-scoped (NOT play-window-scoped — that would be path-dependent), but it
  pays connectivity cost continuously at generation and only ever yields a conservative approximation bounded
  by the fixed margin. The region-gate carries the guarantee more cheaply (amortized to level-up loads) and
  bounds the domain outright, so the per-drop rule is likely unnecessary if growth is gated anyway. Kept on the
  shelf as a possible always-on cheap default, not the primary.

## The unsatisfiable region [ADDED 2026-08-18 — from the BUG-51 grade-ceiling work]

The failure handling above assumes a viable dropped interface edge exists to restore. **Some terrain
admits none.** The BUG-51 work is adding a hard ceiling on built road grade (~40% sustained,
`roadMaxBuiltGrade`) with a connectivity-guarded drop ladder — so an edge can now be *topologically
necessary but geometrically unbuildable*: every candidate crossing between two regions is a cliff,
the discard pile holds only over-cap edges, and "restore the cheapest dropped edge" restores a road
that violates the grade ceiling. A valley ringed by cliffs has no compliant road in or out, and no
topology cleverness changes that.

Within a region the router work degrades gracefully (the worst edge survives steep, marked
`e.gradeExceeded` — connectivity outranks the cap, per the 2026-08-18 priority ruling). At a REGION
INTERFACE the same concession may not be acceptable: an unlock whose only link is a marked 60% wall
is a progression gate behind an undrivable road.

**Candidate remedies (owner-listed 2026-08-18 — recorded as OPTIONS, not decisions):**

1. **Increase the region radius** for the failing unlock until a compliant interface exists — more
   candidate crossings, bounded re-validation.
2. **Refuse the seed** at world creation: run the region-graph validation for the run's region set
   up front and reject seeds that cannot satisfy connectivity + grade ceiling.
3. **Silently substitute another seed** on validation failure (derive seed′ = f(seed) and retry) so
   the player never sees a refusal.
4. (Implicit in the existing design) **restore the least-bad dropped edge and mark it** — accept one
   `gradeExceeded` interface road, diegetically framed ("washed-out pass"), when remedies 1–3 are
   judged worse.

**Two constraints bind any remedy chosen:**

- **SM-INV-12** (worldgen is meta-free) plus this ticket's own "determinism unaffected" acceptance
  box: radius growth or seed substitution must be a **pure function of (seed, region set)** —
  deterministic, path-independent, identical for every player — or `world-determinism` /
  `spawn-identity` break. A substitution scheme is fine (seed′ is derivable); a "try until it works
  against wall-clock/attempt state" scheme is not, unless the attempt count itself is derivable.
- **SM-INV-1** ("Death is crash or breakdown only. No other fail states."): a run walled off by
  impassable terrain is a fail state SM-INV-1 does not admit. This is the design-level argument that
  the unsatisfiable case MUST resolve to something — deferring the unlock forever is not an option
  if the deferred region is on the story's critical path.

Decision on which remedy (and where the acceptance bar sits) is the owner's, at scheduling time.

## The unlock load is HIDDEN, not budgeted [RATIFIED 2026-08-01]

**The "paid once" justification above expired**, and this section replaces it. That argument —
*"cost is paid ONCE at a level-up boundary during a load you already own"* — assumed region unlocks
persist across runs. **Open Q3 (resolved 2026-07-29) made region clearance run-layer**: death puts the
barriers back, so every run reopens every trail. At the ratified 6-region run shape that is **~6
validation loads per run, on every run**, in a game most players will replay dozens of times. For
scale, PERF-27 measured the story region warm at **~5.5 s** live-routed (~1.6 s when the route bundle
already covers it — and the bundle only covers the dev seed).

**The ruling: warm the next region the moment the player ACCEPTS the region-unlock main mission.**

- **Trigger** — the accept event on the region-unlock main mission (the log drag; `missions.md`
  "Main missions"). Not chapter start. Accepting the drag is an **unambiguous commitment** to opening
  that specific trail, so nothing is ever warmed speculatively for a region the player never reaches.
- **Which region is knowable** — unlock order is deterministic (constraint 3 above), so "the next
  region" is a pure function of run state. No guessing.
- **The window is the mission** — travel to the trailhead plus the drag itself, on the order of
  5–15 minutes against a ~5.5 s warm. Enormous margin.
- **Off the main thread** — reuse the existing `RoadSystem.warmRoutes()` worker path (PERF-03
  Workstream A), which exists precisely to pre-warm the per-connection centerline cache without a
  routing hitch. Do **not** warm on the main thread; the player is driving.
- **Fallback, never a silent stall** — if the player clears the drag before the warm completes, show
  the loading screen for the remainder. The warm is an optimisation, not a correctness dependency.
- **Not a determinism change.** Warming populates a cache. It must not alter what any tile or edge
  generates (SM-INV-12), and the gates must not care whether it ran.

**A second benefit, and it may matter more than the load time.** Validating early means the
**connect-check result is known before the player finishes the drag** — so when a region fails to
connect, the interface-bridge repair (below) happens *invisibly during the mission* rather than at the
barrier. Without this, a failed check at the moment of unlock is an awkward "you cleared the trail and
it goes nowhere" beat with a visible pause attached to it.

**Cost to watch:** unlocked regions stay resident, so route-cache memory grows with **regions
unlocked** across a run — the cumulative-play-space cost noted in `run-shape.md`. PERF-27's REGION
bundle was 4.67 MB gzipped / ~25 MB parsed for one region. Six resident regions is a real number;
decide whether distant regions can be evicted and re-warmed on approach.

## Acceptance (when scheduled)

- [ ] Region tiling defined, aligned to macro-band boundaries; border edges provably identical across
      unlock states (extend graph-cull-radius-invariance discipline).
- [ ] Unlock-time validation: generate new region headlessly, union-find connect-check vs reachable set,
      deterministic pass/fail.
- [ ] Interface-bridge repair: restore cheapest dropped interface edge when a region fails to connect; bounded,
      no new routing.
- [ ] **Unsatisfiable-region remedy chosen and implemented** (see "The unsatisfiable region"): when the
      discard pile holds no grade-compliant interface edge, the chosen remedy (radius growth / seed
      refusal / seed substitution / marked exception road) resolves it deterministically — a pure fn of
      (seed, region set), SM-INV-1 and SM-INV-12 both upheld.
- [ ] Trail-closed diegetic barriers at locked region edges; player cannot enter an unvalidated region.
- [ ] Headless test: across seeds, every unlocked region is in one connected component with the spawn region;
      spawn is always on it; no stranded islands reachable.
- [ ] Overhead: zero added per-stream/per-frame cost; validation confined to unlock events.
- [ ] **Warm-on-accept**: accepting the region-unlock main mission kicks the next region's warm +
      connect-check on the **worker** (`warmRoutes()`), with no measurable frame-time cost while
      driving. Verified by a trace, not by feel.
- [ ] **The unlock itself is instant in the common case** — by the time the drag is cleared the
      region is validated and resident, so the barrier lifts with no loading screen. The screen
      appears only when the player beats the warm, and never as a silent stall.
- [ ] **A failed connect-check resolves during the mission**, not at the barrier: the
      interface-bridge repair is chosen and applied before the player arrives.
- [ ] **Determinism unaffected**: warming is cache-only. Gates pass identically with the warm forced
      on and forced off, and no tile or edge generates differently because it ran.
- [ ] Route-cache residency across ~6 unlocked regions measured, with an eviction policy if the
      footprint warrants one.
