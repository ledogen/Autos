---
id: BUG-88
type: bug
status: open
severity: minor
opened: 2026-10-16
source: found by story-poi.mjs §7a on feature/feat-74 (the roster change moved the board's dice onto it)
relates: FEAT-102 (fetch), FEAT-67 (offer board — planDistinct, the 2026-09-27 no-duplicates rule)
---

# BUG-88: Two live fetches of the same thing at one place — the second card has no route

## What happens

The board can roll two live offers at one POI that are both a **fetch of the same thing from a class
with only one member**. Example: seed 6 on feature/feat-74, the tackle shop at 66–74 h, slots b0 and
b1, both "a ball of string" fetched from the general store. `planDistinct` (`src/offer-board.js`)
excludes the older sibling's pickup so the two are not the same job. The only general store is
then excluded, so the younger card plans **no route**. story-poi §7a fails: "3/306 failed: tackleShop".

This is latent on main. Any change to the roster or the board's draws can land a seed on it.

## Root cause

Distinctness is enforced at **plan** time, by excluding destinations. A fetch's destination is its
pickup, and a class with one member has nothing else to offer. The roll never checks for this.

## Needs a ruling (owner)

What should the younger slot do? Options:
1. **Re-roll the thing** when a fetch's whole pickup class is already used by an identical sibling.
   This is deterministic from the siblings, but it breaks `spec()`'s "rolled on first read, WHEN it
   is read never changes WHAT it is" contract.
2. **Allow it.** Two identical fetches from the sole store are honestly the same job, but the player
   can take only one at a time anyway (one mission at a time). Skip the exclusion for a fetch whose
   pickup class has one member.
3. **Leave the slot empty** until the sibling clears.

## Acceptance

- [ ] story-poi §7a green on feature/feat-74's roster (seed 6).
- [ ] No route-less card on any source, over several days of turnover.
