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
| ASSET-15 produce stall | `produce-stall.glb` | **missing** | — | no — **a POI model**, see below |
| ASSET-14 gas pump | `gas-pump.glb` | `gasPump` | `gasStation` | **no — nothing names that pool** |

`gasStation` is deliberately orphaned (owner ruling 2026-08-22: this POI sells fuel, it does not
hand out work) and its consumer arrives with **FEAT-50 refuelling**. That is correct and should
stay correct — the standing rule is **do not re-tag an asset `missionGiver` to make it appear.**
The produce stall is the real gap: a finished 1752-tri model with no entry at all.

## Scope

- A `data/prop-models.js` entry for `produceStall`, with the collision box **restated for the
  trailer form**: deck mass only, excluding the 1.2 m drawbar and the sign. The ticket's original
  box was authored for a trestle table that the asset is no longer.
- Wire the produce stall onto a POI roster slot — see "The pool question" for which pool.
- Audit every roster slot in `src/poi.js` against the built assets, so "shipped but unreachable"
  cannot recur silently. A gate that fails when a registry entry carries a tag no roster slot names
  would catch this class of gap permanently — `test/dist-assets.mjs` already walks the registry and
  is the natural place.

## The pool question

**The produce stall is a POI model** (owner, 2026-08-24) — it anchors a zone the way the trailer
home and the Winnebago do, and it is explicitly *not* yard clutter. So it belongs on a POI roster
slot; the only thing left to pick is which pool.

**Default to `missionGiver` unless the owner says otherwise.** It is the one pool `src/poi.js`
resolves, adding to a pool is allowed to reshuffle which marker wears what (owner ruling
2026-08-15), and a roadside trailer with someone behind it reads as a place that hands out work.

The one thing that argues against it: the gas pump was deliberately kept out of `missionGiver`
because it *sells* rather than hands out work, and a produce stall sells too. If the owner wants
that distinction held, the stall gets a `vendor` pool alongside `gasStation` — orphaned until a
buying path exists, which means the model still would not appear. That is the trade: `missionGiver`
puts it in the world today, `vendor` is more honest about what it is and leaves it invisible.

Any actual buying or selling is a story-mode ticket, not this one —
`.planning/story-mode/items.md` has the cargo/catch vocabulary and DESIGN.md's invariants govern.

## Acceptance

- `produce-stall.glb` has a registry entry with correct collision metadata for the trailer form.
- The produce stall is on a POI roster slot and spawns in-world, or — if the owner picks `vendor` —
  is documented as deliberately orphaned with the ticket that will consume it, the `gasStation`
  pattern.
- A gate fails if a registry entry carries a tag that no roster slot names, so the next stranded
  asset is caught by the harness and not by a ticket audit six weeks later.
