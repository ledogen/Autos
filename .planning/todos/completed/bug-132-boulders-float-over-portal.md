---
id: BUG-132
type: bug
status: closed
opened: 2026-11-07
severity: minor
source: Spare, seen in BUG-107's shots (2026-11-07), on main
owner: Spare
relates_to: BUG-107 (same portal), BUG-54 (rocks sink by their size), the tunnel hill carve
---

# BUG-132: large dark boulders hang in the air over a tunnel portal

## What happens

Over the tunnel portal at seed 19 (−1210, 1837), the one BUG-107 fixed, large dark boulders float in the air on main.
They show in BUG-107's shots: https://claude.ai/artifact/H9Zjf9UVCkuhq7i9mxU64k.

## Acceptance

- [x] Root cause: which ground the boulders seat on (raw hill vs the carved portal face / bore cut), and why they
      hang.
- [x] A census on random seeds: props hanging over portals (or anywhere) by more than a few cm, before and after.
- [x] They sit on the drawn ground everywhere; `fingerprint-world` changes explained (props only, expected).

## Root cause and fix (Spare, 2026-11-07, land/bug-132)

**Not the portal.** The boulders sit on the raw hill; the hill is then re-cut under them. Props take their seat from
`analyticHeight` when their chunk scatters. Later the ground of a live chunk changes and no one tells them:

1. **A positional adopt re-carves ground under standing props.** Recorded at seed 19: terrain chunk −20,29 built (road
   generation 0), its props scattered, then 1.4 s later `recarveInPlace(lastAdoptDirty)` re-cut it, still generation
   0. The adopt path re-carves terrain and rebuilds road tiles, but props only get the road-INTRUSION sweep, so the
   ones on the new cutting's slopes kept the old hill height: 5–14 m in the air there, +37.6 m at worst.
2. **Props scattered before their terrain chunk existed.** At seed 3845087383, chunk 3,−24's props were scattered on
   network rev 6, and the terrain chunk was built 0.3 s later on rev 7. A fresh build is not a re-carve: 22 rocks stood
   up to 7 m inside new fill.
3. **Tree clusters spill over chunk borders.** An aspen of prop chunk 0,−22 stands on terrain chunk 0,−23; when only that
   neighbour re-carved, it stayed 2.65 m deep.

**Fix:**
- `terrain.js` `setRecarveHook(fn)`: `fn(cx, cz)` runs when a re-carve CHANGES a live chunk's carve table
  (`_sameCarve`). Every `recarveInPlace` caller passes through it: positional adopts, story regions, pads, camp.
- `PropSystem.releaseGround(cx, cz)`: releases every live chunk with a prop standing on that ground (its own, plus a
  neighbour whose props spill over) and restarts a scatter in flight there. The chunks re-scatter through the
  normal path. `main.js` wires the hook.
- `PropSystem._groundReady` (sampler `groundReady` = terrain `isChunkDrivable`): a chunk scatters only once its
  ground is built, so every later change to that ground is a re-carve. Headless (no sampler) nothing changes.

**Census** (`wip/bug-132/census.mjs`, in the LIVE game: the freecam visits spots, then every live prop is compared
with a fresh scatter of its chunk on today's ground, matched by variant and x/z to 1 cm). Seed 19 at the portal plus 3
random seeds (3845087383, 1791962762, 4240533734) × 4 spots 1.5 km apart, 13 spots in all:

| | main | fix |
|---|---|---|
| hanging > 5 cm (> 1 m) | 477 (293) | 0 |
| sunk > 5 cm (> 1 m) | 2,222 (1,518) | 0 |
| worst | +37.6 m (seed 19, chunk −20,28) | — |

**Cost:** the hook released 15–20 chunks per 1.5 km jump: the chunks whose ground really changed. Each re-scatters
through the normal budgeted path, and nothing re-scatters where the carve is unchanged.

**Not this bug:** at 2 of 13 spots a few hundred props have no exact twin in a fresh scatter. All of them sit on the
ground (none off by > 1.5 m), and main shows the same counts. They come from the scatter's random sequence shifting
when a chunk is scattered against a different road window (BUG-71's known limit).

**Gates:** affected 37/37 green.
**fingerprint-world** vs main 05794d48: identical in all six windows (it scatters headless on finished ground).
**cdp-smoke:** 25/25 on the rerun. The first run missed "pad": parking at the giver opened no offer card, the pump
prompt showed instead; world 1505891932, load ~10.
**Shots** (seed 19 portal, before/after): https://claude.ai/artifact/CfbJo9qenVmHShkLguGsF6

Closed on landing.

## Landed (orchestrator, 2026-11-07)

Merge of fa7fd2ba on main (no src/test/data change since its base): affected 37/37, fingerprint identical, cdp-smoke 25/25 on main.
