---
id: FEAT-71
type: feature
status: open
severity: minor
opened: 2026-08-23
updated: 2026-08-23
relates: FEAT-46, FEAT-59, ASSET-01, ASSET-02, ASSET-04, ASSET-05, ASSET-06, ASSET-08
---

# FEAT-71: POI-satellite scatter for lawn furniture

The consumer for the `lawnFurniture` tag. It does not exist, and its absence is what blocks
every lawn-furniture asset from closing.

## The gap

`data/prop-models.js` already carries the tag on `bbqGrill` (ASSET-04), and the flamingos
(ASSET-01) and gnome (ASSET-02) are shipped models with nowhere to be placed. The only pool
`src/poi.js` resolves today is `missionGiver` — "a place that hands out work" — via `modelPool`
on a roster slot. A flamingo is not a place that hands out work, so there is no path from a
built `.glb` to a thing standing in the world.

Consequence: every lawn-furniture ticket has shipped its asset and then had to record "still not
consumable in-world" in its resolution. ASSET-01, ASSET-02 and ASSET-04 all say a version of it.
That note should exist once, here, and be discharged once.

## What it must do

**Scatter satellites around an already-placed POI, never on bare ground.** This is the standing
rule from every lawn-furniture ticket and it is the whole design: an awning and a fire pit beside
a log cabin read as *that cabin's*. The same objects on empty dirt read as litter, not habitation.
So the scatter is anchored to a POI record, and its budget, radius and count come from that POI —
it is not a world-wide density.

- Anchor on the POI's pad and its collision extent, so satellites sit *around* the building
  rather than inside it.
- Deterministic in the seed, the way `src/poi.js` derives `modelKey` — `hash32(...)`, never
  `Math.random()`. That includes the **palette variant index**: `spawnModel(key, { variant: n })`
  takes any integer modulo the pool length, and DESIGN's determinism rules make the caller own it.
- Respect each model's authored `collision` box so two satellites cannot interpenetrate and none
  lands on the road.
- Yaw: rotationally-asymmetric assets have a stated forward (−Z). Random yaw is correct for most
  lawn furniture; a grill or an awning facing the building is better. Decide per asset, from a
  field on the registry entry, not from a hard-coded list of keys.

## Open questions for the owner

- **Density.** How many satellites per POI, and does it scale with the POI's role (a log cabin
  should dress heavier than a lone mailbox)?
- **Pools.** Is `lawnFurniture` one flat pool, or does it split — `campDressing` (grill, propane
  tank, awning, fire pit) vs `yardOrnament` (flamingo, gnome)? The camp-dressing cluster is
  already named as a cluster in ASSET-04/05/06/08, which argues for the split.
- **Draw-call budget.** These are one-material-per-colour models placed a handful of times each,
  not scatter density — but a POI dressed with six satellites is six model loads. Where is the cap?

## Acceptance

- A POI placed in-world is dressed with satellites drawn from the tag pool, deterministic in the
  seed, reproducible across a re-stream of the same region.
- Nothing spawns on bare ground with no anchor.
- Nothing interpenetrates the POI, the road, or another satellite.
- A gate asserts the determinism (same seed + centre ⇒ identical satellite set), in the shape of
  the existing `story-poi` / `world-determinism` gates.

## Notes

- `assets/models/gas-pump.glb` carries an unconsumed `gasStation` tag for the same class of
  reason, but that one wants a *POI*, not a satellite scatter — do not fold it into this ticket.
- Camp gear (ASSET-23..26) is a different placement path: it renders at the player's own campsite
  under items.md's visible-kit rule, on a 6 m pad. Not this.
