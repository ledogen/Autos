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
  (this ticket is milestone SM-0's keystone; SM-4 wires XP/story beats to the unlock trigger — SM-INV-13:
  the barrier must stay diegetic)."
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
  bounded repair (below). Cost is paid ONCE at a level-up boundary during a load you already own — never
  per-stream.
- **Culling stays aggressive at generation time.** The region check validates connectivity at the MACRO level
  only (does region R reach the network at all), never per-edge — dead-ends / thinned junctions / sparse
  branching all survive. If the cull happens to island a region, it's caught here.
- **Failure handling is bounded & local:** either defer the unlock (pick an adjacent region that DOES connect)
  or restore the single cheapest DROPPED interface edge (Kruskal-of-one over the discard pile at the region
  interface — tractable because both regions are loaded & finite). This is the "rather add a bridge than
  prevent a cull" instinct, made cheap.
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

## Acceptance (when scheduled)

- [ ] Region tiling defined, aligned to macro-band boundaries; border edges provably identical across
      unlock states (extend graph-cull-radius-invariance discipline).
- [ ] Unlock-time validation: generate new region headlessly, union-find connect-check vs reachable set,
      deterministic pass/fail.
- [ ] Interface-bridge repair: restore cheapest dropped interface edge when a region fails to connect; bounded,
      no new routing.
- [ ] Trail-closed diegetic barriers at locked region edges; player cannot enter an unvalidated region.
- [ ] Headless test: across seeds, every unlocked region is in one connected component with the spawn region;
      spawn is always on it; no stranded islands reachable.
- [ ] Overhead: zero added per-stream/per-frame cost; validation confined to unlock events.
