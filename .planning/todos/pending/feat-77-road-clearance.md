---
id: FEAT-77
type: feature
status: in-progress
severity: major
---

# FEAT-77 — two roads may not share each other's earthwork

**Owner rulings 2026-09-07/08** (three passes; the last two correct the first):

1. Adjacent roads keep **12 m of daylight between their pavement edges**, and **neither road's
   earthwork may reach the other**. The taper is the carve's own (`roadFillSlope` 3:1,
   `roadCutSlope` 1:1, capped at `carveHalfWidth + roadMaxEmbankmentToe` = 18 m from the centre).
2. "Reach the other" is the PHYSICAL case, not any apron overlap (2026-09-08): the upper road's
   fill still above the lower road's deck at the lower's shoulder, or the lower road's cut face
   still below the upper's deck under the upper's shoulder. Two fills merging, two cuts meeting
   and aprons that end short are benign. So `req = max(22, min(2·edge + slope·Δy, cap + edge))`,
   at most 28.5 m. Deck-to-deck height alone was rejected (65 m at the photo site).
3. Switchbacks may come close when that holds. Mechanism: **height-aware CONFLICT** — a pair
   inside the rule is a conflict and resolves through the merge planner into a T; where the rule
   makes main's T impossible, the pair re-plans under the old 18 m proximity (`promote-legacy`) so
   no T is lost; pairs "too distant to combine" (inside the rule, never inside `mergeProxM`) get a
   **second routing pass**: the loser re-routes with the winner's pass-1 line priced as occupied
   (`wClear`) — the owner's "make the secondary edge aware of the primary and give it a berth".

## What is built (feature/junction-stitch)

- `corridor-router.clearReq` — the rule, pure, ONE copy; `RoadSystem._v2ClearReq` delegates.
- Conflict predicate `_v2Near`/`_v2NearVs` in `_conflictIntervalsXZ` and its callers, with the
  `clearThroatM` (30 m) throat where `mergeProxM` still decides; R6's floor = the rule; shove floor;
  fork `clears` + parting point by the rule; a band-lateral test (a departure band may not overshoot
  across the trunk); sibling-fork stagger (MINREG) in the probe; `_v2ForkAbreastMax`.
- Legacy fallback: `_v2NodeMerges(g, drop, nk, legacy)` + `_v2MergeFor` retry, counted.
- Second pass: `_v2EdgeDirsBase` (pure graph) + `_v2ClearanceFor` (pass-1 samples, node-sharing
  + chord partners, loser = longer route) → `dirs.occupied` → `corridorSearch` occupancy cost
  (`wClear`), content-keyed cache namespace `#o`, flip-safe. Build cost ≈ +5 %.
- Gate `test/road-clearance.mjs` (GATING zero pairs; BUG-64 class-B ruler as report).
- Mission planner: free-roam rolls fenced to the streamed band (frontier Ts are not the planner's).
- POI: houses and lay-bys keep out of OTHER roads (`_otherRoadNear`).

## Measured (nine battery windows, refined rule, main → branch)

See the review artifact and the resolution note at close. Owner review 2026-09-08 of the plates:
branch preferred at every now-passing site; the nine regressions of the first cut were Ts the
wider rule declined, and are gone under the refined rule.

## Known red on main

2026-10-01, main `f163e6c`: `road-clearance.mjs` fails on a clean HEAD checkout — `lone-pine spawn`
(29 runs, 1 violating pair, 2 carve walls reported) and `seed3 origin` (58 runs, 1 violating pair,
6 carve walls). This is the open residue below, not a new regression. Any session that sees this
red can skip re-running the gate on main to prove it.

## Open

- The second pass moves few losers (1–5 of 15 on the seed-6 window at wClear 12–120): the
  32 m corridor grid and the terrain price dominate. The residue is a handful of pairs.
- `story-poi`'s 50 m-drift check: mom's pad now sits 980 m from spawn, 20 m inside a 1000 m
  nearSpawn ring the drift crosses — a fragile threshold in the roster, exposed by a new pad.
- BUG-63 (mid-span key collision), BUG-64 class B (carve composition walls).
