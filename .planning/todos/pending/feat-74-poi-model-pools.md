---
id: FEAT-74
type: feature
status: open
severity: minor
opened: 2026-08-24
relates: ASSET-15, ASSET-14, ASSET-09, ASSET-18, ASSET-21, FEAT-46, FEAT-50, FEAT-59
---

# FEAT-74: POI model pools — register what is built, and give the orphan pools a consumer

The **POI model** class is the one asset class that already has a working placement path. This
ticket closes the gaps in it rather than building it.

## The gap

`src/poi.js` resolves exactly one pool — `missionGiver`, "a place that hands out work" — through
`modelPool` on a roster slot (`{ type: 'missionGiver', count: 5, modelPool: 'missionGiver' }`).
Three models are in it and spawn correctly: `trailerHomeA`, `winnebago`, `brokenCar`.

Everything else built for this class is stranded:

| Asset | Model | Registry | Pool | Spawns |
|---|---|---|---|---|
| ASSET-15 produce stall | `produce-stall.glb` | **missing** | — | no |
| ASSET-14 gas pump | `gas-pump.glb` | `gasPump` | `gasStation` | **no — nothing names that pool** |

`gasStation` is deliberately orphaned (owner ruling 2026-08-22: this POI sells fuel, it does not
hand out work) and its consumer arrives with **FEAT-50 refuelling**. That is correct and should
stay correct — the standing rule is **do not re-tag an asset `missionGiver` to make it appear.**
The produce stall is the real gap: a finished 1752-tri model with no entry at all.

## Scope

- A `data/prop-models.js` entry for `produceStall`, with the collision box **restated for the
  trailer form**: deck mass only, excluding the 1.2 m drawbar and the sign. The ticket's original
  box was authored for a trestle table that the asset is no longer.
- Decide what pool the produce stall belongs to (see below) and wire the roster slot for it.
- Audit every roster slot in `src/poi.js` against the built assets, so "shipped but unreachable"
  cannot recur silently. A gate that fails when a registry entry carries a tag no roster slot names
  would catch this class of gap permanently — `test/dist-assets.mjs` already walks the registry and
  is the natural place.

## The question the owner owns

**Is a produce stall a place that hands out work?** It is a roadside trailer with someone behind
it, which reads as a mission giver; but it is also a place that *sells* — closer to the gas pump,
which was explicitly ruled out of `missionGiver` for exactly that reason. The options:

1. Add it to `missionGiver`. Cheapest, and adding to a pool is allowed to reshuffle which marker
   wears what (owner ruling 2026-08-15).
2. Its own `vendor` pool alongside `gasStation`, with no consumer until a buying/selling path
   exists. Consistent with the gas pump, and honest about the fact that nothing can be bought yet.
3. Both — a stall that trades *and* passes on a job.

`.planning/story-mode/items.md` has the cargo/catch vocabulary and DESIGN.md's invariants govern;
any actual buying or selling is a story-mode ticket, not this one.

## Acceptance

- `produce-stall.glb` has a registry entry with correct collision metadata for the trailer form.
- Its pool is decided and either wired to a roster slot or documented as deliberately orphaned with
  the ticket that will consume it — the `gasStation` pattern.
- A gate fails if a registry entry carries a tag that no roster slot names, so the next stranded
  asset is caught by the harness and not by a ticket audit six weeks later.
