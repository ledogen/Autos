---
id: BUG-45
type: bug
status: closed
severity: major
opened: 2026-08-09
closed: 2026-08-09
source: owner drive — re-entering story mode on an already-loaded seed
relates: FEAT-60, FEAT-61, FEAT-46, FEAT-43
invariants: SM-INV-12
---

# BUG-45: mom's and Larry's houses swap when you re-enter story mode on the same seed

## Report

> I load the default seed 6 in freeplay. Then I switch to story mode and define seed "90" … then I
> pause the game and go to free roam and then I pause and go back to story mode — the seed is
> pre-populated with 90 because it's already been loaded, when I hit start the world quickly loads
> in but it appears that mom's house and Larry's house have swapped places.

## Root cause — a selection that depended on how many, not on which

Two links in a chain, and the second is the defect:

1. **The region centre is not stable across entries.** `story.js` sets `_center` to wherever the
   truck lands (`_beginWarm`: *"the truck is at the spawn, so that IS the region center"*). On a
   re-entry with the seed already loaded, `enter()` takes the `reseat()` branch rather than
   `applySeed()`, and `_reseatTruckAtSpawn` resolves the spawn with a two-tier probe —
   `queryNearest(baseX, baseZ, tightR)` then a wider one — **against whatever is streamed at the
   time**. After a story region has been warmed to 2500 m and exited, far more network is resident
   than on the cold entry, so the tight probe can hit a different (often nearer) road. The comment
   on that code already concedes it: *"14 spawn IDENTICAL, the 1 that differs lands on a CLOSER
   on-road point."* The centre therefore moves by tens of metres.

2. **The roster was an index into a variable-length list.** `_pickAny` did
   `avail.splice(Math.floor(rnd() * avail.length), 1)`, and `_pickNearSpawn` fed it a ring filtered
   by distance from that centre. One pad crossing the ring boundary changes `ring.length`, which
   changes the index the same PRNG draw lands on, which re-casts the slot — and mom and Larry are
   the first two slots filled, both from the same near-spawn ring. Houses had the identical flaw:
   `_pickSpread` shuffled with a Fisher-Yates that consumes one draw per element, so a ring holding
   one more candidate re-orders the entire list and picks fifteen different customers.

Measured before the fix (seed 90, region centre displaced along +X):

| centre drift | mom | larry |
|---|---|---|
| +0 / +1 / +5 / +20 m | (−905, 550) | (232, 720) |
| **+50 m** | (−905, 550) | **(768, 546)** — a different pad entirely |

## Fix — select by a stable per-candidate key

`_pickAny` → **`_pickStable(cands, n, salt)`**: order candidates by `hash32(poi-pick:seed:salt:id)`
and take the first `n`. `_pickSpread` does the same in place of its Fisher-Yates, keeping the
greedy `minSep` acceptance. A pad's `id` is its abstract graph edge (`poi:ka|kb`) — already the
window-invariant identity this module keys everything else off (see the header's runKey note).

The selection now depends on **which** pads exist, not **how many**. A pad away from the ring
boundary keeps its slot no matter what churns at the rim. `salt` is the roster slot, so two slots
drawing from one pool never want the same pad; ties break on the id so equal hashes are still an
order.

After the fix, the roster is stable to a **50 m** centre drift on both seeds 6 and 90 — far past
anything the spawn probe produces. At +100 m on seed 90 mom does change, but legitimately: a
genuinely nearer pad entered the near-spawn ring and outranked hers. That is the ring meaning what
it says, not a reshuffle.

**Gate:** `test/story-poi.mjs` §6c — 5 / 20 / 50 m spawn drifts do not swap mom and Larry, the
roster is still a pure function of (seed, pool), and no pad is ever assigned to two slots.

## Left open

**The spawn drift itself is untouched**, and it is the upstream cause. It moves the region WALL
between entries too, not just the roster, and `poiSystem.build`/`buildHouses`/`campSystem.build` all
key off that centre. Worth its own ticket if region-boundary drift ever shows up as a symptom; this
fix makes the roster immune to it rather than eliminating it.

Customer selection is now stable to ~20 m of drift but still churns beyond that, because the house
candidate pool itself is filtered by the moving centre. Less visible than the roster (a run does not
survive a mode exit), so it is left as is.
