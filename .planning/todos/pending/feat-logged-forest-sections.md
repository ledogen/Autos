---
id: FEAT-32
type: feature
status: open
opened: 2026-07-16
severity: minor
source: user-request
relates_to: FEAT-06 (prop palette + scatter), FEAT-15 (fallen logs), FEAT-28 (region unlock), story mode (SM-INV-11/12/13/6)
note: "Logged / clearcut sections of forest: patches where the normal tree scatter is replaced by
stumps, or a mix of stumps + saplings/small trees + slash. Ambient world variety on its own, but the
real intent is a story hook — a logged region reads as a place with a history, and specific items or
characters could spawn there later. Capture only; the story coupling is designed against DESIGN.md
when story mode is scheduled, not now."
---

# FEAT-32: Logged / clearcut forest sections

## Context

Right now forest density varies by a smooth biome mask (`biomeNoise` in `src/props/prop-scatter.js`,
biasing the aspen/pine mix and cluster density) but the forest is always *standing* — every patch
looks untouched. A logged section — stumps where trees were, maybe a scatter of saplings and slash
(branch piles) coming back — instantly reads as a place with a human history: someone worked here.
That's cheap, atmospheric world variety by itself, and it's a natural anchor for story.

The user's framing: patches that **replace tree props with stumps**, or a **mixture of stumps and
small tree props** (selective cut / regrowth). Long-term this ties into story — a region's logged
state could be part of its character, and **specific items or characters might spawn** at these
sites. This ticket captures the world-feature; the story spawns are downstream and get designed
against the story bible, not invented here.

## Desired behaviour

- Some forest patches generate as **logged ground** instead of standing forest, on a spectrum:
  - **Clearcut:** standing trees suppressed to ~zero, replaced by **stumps** (new prop variant) at
    roughly the density the trees had, plus optional slash piles / brush and the odd FEAT-15 downed
    log left behind.
  - **Selective / regrowth:** a *mix* — some stumps, some surviving mature trees, and **saplings /
    small tree props** filling in. A gradient from fresh-cut (mostly stumps, bare) to old-cut
    (mostly saplings, few stumps) is the ideal, if it falls out cheaply.
- The patch is a **place**, not per-tree noise: coherent areas you drive into and recognize, with a
  soft edge back into standing forest — not salt-and-pepper stumps everywhere.
- Ground may read slightly more bare/disturbed inside a cut (optional — a texture/scatter tweak, not
  required for v1).

## Mechanism notes (where this plugs in)

- **Reuse the deterministic biome mask pattern.** `biomeNoise(x, z, freq, seed)` is already a
  cheap, low-freq, **window-invariant** world-space field (independent of chunk window). A second
  low-freq "logged-ness" channel (or a threshold band of a new mask) selects logged patches the same
  way. This keeps placement a pure function of world coords + seed — mandatory for determinism
  (SM-INV-12) and for not re-rolling on re-stream. Do NOT hand-place patches; the character must
  **emerge from the mask**, per [[feedback_emergent_over_injected]].
- **Stump = new prop variant in the FEAT-06 palette.** Small, low geometry, instanced like the rest.
  FEAT-15 already places downed logs (`placeLog`, the last additive scatter pass) — slash piles / left
  logs can reuse or extend that. Saplings can be a scaled-down tree variant or a dedicated small mesh.
- **Density coupling:** inside a logged patch the tree-cluster pass (`clustersPerChunk` /
  `treesPerCluster`) is scaled down and a stump/sapling pass scaled up, blended by the mask value so
  edges feather. Keep every existing placement's rng draw order intact if adding passes (FEAT-15's
  "logs are LAST so nothing upstream shifts" discipline).
- **Collision class (open):** stumps are low — are they a hard obstacle (like trees/boulders), a
  soft-drag (like bushes), or low enough to drive over given Ranger clearance? Probably a short hard
  hit, but decide against the collision classes FEAT-06 defines.

## Story hook (design later, against the bible — do not build the story parts now)

This is the actual reason to build it, but it must land inside the story invariants:

- **SM-INV-11 — story is delivered through generator parameter states, never cutscenes/exposition.**
  A logged region *is* a parameter state: dial the logged-ness mask per region and the world tells you
  "this place was worked" with zero authored text. This is exactly the intended delivery surface
  (DESIGN.md lists prop-palette params as the story channel). Logged-ness keys off `metaState`
  (SM-INV-12) so a region can read pristine, freshly-cut, or long-abandoned as the story moves.
- **SM-INV-6 — camping is a place the worldgen designates.** An old logging camp / landing is a
  natural, diegetic campsite candidate — a strong tie-in worth flagging to FEAT-28 / the camp placer.
- **Items / characters that spawn here (the user's "later"):** must be **deterministic** (SM-INV-12,
  window-invariant like everything else) and **diegetic** (SM-INV-13) — a spawn *registry* keyed off
  the logged mask + region metaState, NOT ad-hoc scripting. This ticket only reserves the hook: a
  logged patch exposes a stable, queryable "this is a logging site at (x,z), age = …" so a later story
  ticket can attach spawns to it. Designing the spawns themselves is out of scope until story mode is
  scheduled (see [[project_story_mode_framing.md]]).

## Open design questions (decide at planning)

- **Ambient vs. story-driven:** do logged patches appear in free roam as pure ambient variety (a
  standing mask everywhere), or ONLY where a region's story state calls for them, or both (a low
  ambient rate that story can dial up per region)? Both is likely — but confirm.
- **Clearcut vs. mix as the default look** — is the interesting one the stark stumps-only clearcut, or
  the messier selective/regrowth mix? Maybe a fresh→old age parameter drives the blend.
- **Stump collision class** (above).
- **Access:** real cuts have skid trails / a landing connected to a road. Do we imply that (a dirt
  scar, a spur off the network), or is a bare patch enough? (Roads spurs are a much bigger lift.)
- **Ground treatment:** worth a disturbed-dirt ground look inside cuts, or leave the terrain as-is and
  let the stumps carry it?
- **The spawn-hook shape:** what does a later story ticket need to query — a patch centroid + radius +
  age, a per-point "inLoggedPatch(x,z)" like the existing water/road membership samplers? Pick the
  minimal stable surface.

## Acceptance

- Driving through the world, some forest patches read as logged — coherent areas of stumps (and/or a
  stumps + saplings mix), feathering back into standing forest, recognizably a worked-over place.
- **Emergent + deterministic + window-invariant:** patches come from a seed-driven world-space mask
  (biomeNoise-style), identical across chunk windows and re-streams; no hand-placement.
- New stump (and sapling, if taken) prop variant(s) in the FEAT-06 instanced palette; existing scatter
  placements keep their rng draw order (no world churn for pre-existing props).
- A stable, queryable "logged site" hook is exposed for a future story ticket to attach items /
  characters to — but the spawns themselves are NOT built here.
- New tunables (patch rate, patch size, stump density, sapling mix, age blend) exposed as sliders —
  USER-OWNED param set, like the rest of the prop params.
- `npm test` stays green (prop scatter / determinism gates).

## Related

- FEAT-06 prop scatter + palette (`src/props/prop-scatter.js`, `biomeNoise`, cluster passes);
  FEAT-15 fallen logs (`placeLog`) — the reuse surface for slash / left logs.
- Story mode: [[project_story_mode_framing.md]] and `.planning/story-mode/DESIGN.md` (SM-INV-11 story
  = parameter states; SM-INV-12 determinism; SM-INV-13 diegetic; SM-INV-6 camping-is-a-place).
- FEAT-28 region unlock / per-region metaState — the keying surface for story-driven logged-ness.
- Emergent-not-injected discipline: [[feedback_emergent_over_injected]].
