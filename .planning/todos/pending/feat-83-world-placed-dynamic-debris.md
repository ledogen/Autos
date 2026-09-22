---
id: FEAT-83
type: feature
status: open
severity: minor
opened: 2026-09-22
source: spun out of FEAT-36 (owner ruling 2026-09-22)
relates: FEAT-36 (closed — the debris system this builds on), FEAT-26, FEAT-27 (rockslides — the
  likely first consumer), FEAT-71 (POI satellites — static dressing, deliberately NOT this), SM-3
  (the wear model the causesDamage flag gates)
---

# FEAT-83: World-placed dynamic debris — deterministic spawn/despawn, and `causesDamage`

Spun out of **FEAT-36**, which the owner closed on 2026-09-22 rather than hold open on its
remainder. FEAT-36 delivered the debris system: `src/debris.js`, hull colliders, density-derived
mass, two-way truck coupling, the throw mechanic, and (2026-09-22) a deterministic barrel stack
that settles and sleeps. Everything here is what that ticket did **not** do.

This is deliberately a fresh ticket, not a re-opening. FEAT-36's close is final.

## The gap

**Nothing in the world ever places a debris body.** Every dynamic prop that has ever existed was
spawned by the player pressing F, or by the debug stack button. So the two things a world fixture
needs have never been built:

1. **Deterministic placement.** A rockpile must be keyed from `(seed, coords)` per **SM-INV-12** —
   `hash32(...)`, never `Math.random()`. The pieces exist: `stackLayout()` in `src/debris.js` is
   already pure and gated as such (`test/debris-stack.mjs` asserts two fresh worlds settle to
   bit-identical transforms), and `spawn()` takes a `spin` override so a caller can opt out of the
   throw's random tumble. What is missing is the layer that decides *where*.
2. **Despawn against streaming.** Bodies must come and go with their tiles without leaking and
   without a hitch as a region streams in. FEAT-36 flagged this as the item most likely to surface
   a leak, and it was never exercised — `DEBRIS_CAP` oldest-reclaim is a debug-throw discipline,
   not a streaming policy.

## `causesDamage` — do this first, it is already live the wrong way round

The per-prop flag ruled by the owner on 2026-07-29 (*boxes and trash cans don't hurt; rocks and
logs do*) was never built, and **SM-3 shipped without it**, so the default is currently ON for
everything: every non-ground chassis contact above `DAMAGE_PARAMS.impactMinMph` feeds the wear
model regardless of what hit the truck (`src/main.js`, the `feedContact` call on the fixed step).

Today that only affects thrown props, which is a debug surface. **The moment this ticket puts a
body in the world, it becomes a gameplay bug**: driving into a roadside barrel would cost real
condition with no way to say it shouldn't.

The flag gates the **report**, never the contact — the physics is identical either way and only
the consumer changes. Wire `DEBRIS_TYPES` (`src/debris.js`) through to the `feedContact` call
rather than inventing a new seam.

## Not in scope

- **Static POI dressing is FEAT-71**, and the owner ruled on 2026-09-22 that rigid bodies do not
  belong in that ticket. Lawn furniture and yard clutter are meshes. Do not fold the two together
  and do not make FEAT-71 depend on this.
- Rockslide *behaviour* (trigger, warning, hazard framing) is FEAT-26/27. This ticket owns the
  placement and lifecycle machinery those would sit on, not the event.

## Acceptance

- A world fixture (a rockpile is the natural first one) spawns dynamic bodies from `(seed, coords)`
  alone — same seed, same region, identical bodies in identical resting poses, across a re-stream.
  Asserted in a headless gate in the shape of `world-determinism` / `debris-stack`.
- Bodies despawn with their region: no leak over repeated stream in/out cycles, asserted by body
  count returning to baseline.
- Streaming a region in with fixtures present does not stall the frame beyond the existing budget.
- `causesDamage` per debris type, defaulting so that a non-damaging prop cannot reach the wear
  model. A gate asserts a flagged-off prop leaves condition untouched after a hard hit, and a
  flagged-on one does not.
- Body count stays within a stated cap with world fixtures and player throws coexisting.

## Related

- `src/debris.js` — `stackLayout`, `spawnStack`, `DEBRIS_TYPES`, `DEBRIS_CAP`.
- `test/debris-stack.mjs` — the determinism/settle gate this ticket's placement layer must keep green.
- `test/debris-coupling.mjs` — two-way truck↔debris coupling.
- `src/physics-engine.js` — the adapter; no engine type may leak past it (FEAT-48).
- `test-rock.glb` (20 tris) is still placeholder art with no ASSET ticket. Real rockpiles want real
  rock; mint an ASSET ticket when this needs it.
