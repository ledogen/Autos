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
| ASSET-15 produce stall | `produce-stall.glb` | **missing** | — | no — **a POI model and a food vendor**, see below |
| ASSET-14 gas pump | `gas-pump.glb` | `gasPump` | `gasStation` | **no — nothing names that pool** |

`gasStation` is deliberately orphaned (owner ruling 2026-08-22: this POI sells fuel, it does not
hand out work) and its consumer arrives with **FEAT-50 refuelling**. That is correct and should
stay correct — the standing rule is **do not re-tag an asset `missionGiver` to make it appear.**
The produce stall is the real gap: a finished 1752-tri model with no entry at all.

## Scope

- A `data/prop-models.js` entry for `produceStall`, with the collision box **restated for the
  trailer form**: deck mass only, excluding the 1.2 m drawbar and the sign. The ticket's original
  box was authored for a trestle table that the asset is no longer.
- Tag the produce stall `missionGiver` — no new pool, no new roster slot. See below.
- Audit every roster slot in `src/poi.js` against the built assets, so "shipped but unreachable"
  cannot recur silently. A gate that fails when a registry entry carries a tag no roster slot names
  would catch this class of gap permanently — `test/dist-assets.mjs` already walks the registry and
  is the natural place.

## The pool question — RESOLVED, and it was already ratified

**The produce stall is a POI model AND a food vendor, and a food vendor hands out work**
(owner, 2026-08-25). Examples the owner gave: a burger joint whose jobs are delivering food to
customers; a market stall whose job is fetching a load of fertiliser and bringing it back.

**This was already ruled and it is already in the code.** `src/poi.js`, above the roster:

> *"Most POIs are mission givers, and a mission giver MAY present as a food vendor (owner,
> 2026-08-05) — food vendors get no reservation of their own because a vendor that also hands out
> work costs the region nothing."*

So there is no new pool and no new roster slot. **A food vendor is a mission giver wearing a
different model**, and the produce stall goes straight into the `missionGiver` pool. Adding to a
pool is a one-line registry edit and is allowed to reshuffle which marker wears what on an existing
seed (owner ruling 2026-08-15).

**The gas-pump precedent does not apply and the distinction is worth stating**, because it is the
thing that will get mis-generalised: a gas pump was kept out of `missionGiver` because it sells a
*service* and hands out no work — its consumer is FEAT-50 refuelling. A food vendor sells *and*
hands out work, so it costs the region nothing to be both. The test is "does it give the player a
job", not "does money change hands".

What a food vendor's jobs actually *are* — delivery out, supply fetch back — is mission-taxonomy
work and belongs in `.planning/story-mode/missions.md`, not here. This ticket only has to put the
model on the board.

## Acceptance

- `produce-stall.glb` has a registry entry with correct collision metadata for the trailer form.
- The produce stall carries the `missionGiver` tag and spawns in-world on the existing roster slot.
- A gate fails if a registry entry carries a tag that no roster slot names, so the next stranded
  asset is caught by the harness and not by a ticket audit six weeks later.
