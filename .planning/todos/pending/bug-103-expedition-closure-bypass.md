---
id: BUG-103
type: bug
status: open
severity: major
opened: 2026-11-01
source: owner, 2026-11-01 — seed 3852053035, story map: the road closed at the expedition camp is reachable from behind via a spur that wraps round the play-area perimeter
relates: FEAT-103 (the camp and its siting rule, poi.js `_siteCamp`), FEAT-154 (a barricade row on every road out + the edge fade), FEAT-43 (the map's region ring, map2d.js `_drawRegion`), FEAT-28 (the beta trim / region ladder), BUG-63 (`~p` parallel runs)
---

# BUG-103: the expedition camp's closed road loops back to the network outside the wall

## What the owner saw

Seed `3852053035`, story mode. The map shows the Expedition node near the play-area edge arc, a
Drop marker just above it, and a long spur leaving north and then curving east.

> Stuff like this is gonna drive me nuts. We need a clean solution to messy stuff like this. Either
> that spur needs to be blocked off somewhere.

The owner also "thought we built barriers on all legs where they leave the play area but maybe just
not yet".

## Short answer

- **The spur is already blocked, twice.** It crosses the 2400 m planners' wall, and FEAT-154 put a
  barricade row on that crossing. Ten metres further out the edge fade sends the truck home. In a
  live run nobody can drive round to the back of the camp.
- **The owner's belief is right.** Every road leaving the play area carries a row. On this seed: 25
  wall crossings, 25 rows, 0 missing, 0 standing past the fade line.
- **The map is what misleads.** It draws the play-area ring at 2500 m and dims only outside it. The
  game actually ends at 2400 m (rows) and 2410 m (fade). The camp's far junction (r 2469 m) and the
  perimeter road (r 2356–2501 m) sit in that 100 m strip, drawn as normal road. The map also draws
  no barricades. So the closed road reads as one leg of a loop inside the play area.
- **The siting rule has a blind spot.** `_siteCamp` checks "leaves a dead end when cut" on the
  planners' graph, which is clipped at the wall. Every road out is a dead end on that graph by
  construction. What the road does past the wall is never looked at.

## What closes the road today

All in `src/poi.js` unless named.

| Piece | What it does | Where |
|---|---|---|
| The planners' wall | `wall = radius − REGION_MARGIN` = 2500 − 100 = **2400 m**. The planners' graph keeps an edge only when both NODES are inside it (node positions, not the centreline). | `build` :645; `mission.js` :109 (`REGION_MARGIN`), :166 (`buildGraphAdj`) |
| Camp site | A road with exactly one node on the spawn's piece of that graph. ≥ 300 m of road from the last junction to the wall crossing. A 14 × 8 m pad within 400 m of the crossing. Then the farthest by road from the spawn. | `_siteCamp` :1333; the one-node test :1372; the pick :1385 |
| Camp barricade row | Three 3 m Type III barricades across the 10 m deck, 4 m past the pad's far end, striped faces back toward the player. Shoulders open (owner, 2026-10-29). | row arc `rowS` :1400; `_barrierRow` :1416; placed at `build` :679–680 |
| Edge rows (FEAT-154) | One row at every crossing of 2400 m on every edge OFF the planners' graph. Slid 20 m clear of a junction mouth. The camp's edge is skipped (its row is at the pad). | `_edgeRows` :1445 |
| Barricade bodies | Within 120 m of the truck each row becomes three loose 10 kg debris bodies. The truck smashes straight through. They are a sign, not a wall. | `src/main.js` :5317–5366 (`pinned` here only means "outside the debris cap") |
| Edge fade | Past `wall + poiEdgeFadeM` = **2410 m** (radial, on or off road), fade to black and reseat the truck on the nearest job-road spot at ≤ 2390 m, facing in. A debug teleport disarms it until the truck is back inside. | `src/main.js` :5381 (`_checkEdge`); return spots `_returnSpots` :1470 |
| Hard wall | Clamp at 2500 m (backstop; suspended during a Quick Job). | `src/story.js` :370 |
| Map ring | Ring and exterior dim drawn at `region().r` = **2500 m**. No barricade glyphs. Roads in 2400–2500 m drawn like any other road. | `src/map2d.js` :2226 (`_drawRegion`) |

So "the road is closed" means: a soft row of barricades at the pad, and a hard radial fade 38 m of
road further on. The mission planner never routes past the camp's inner node (`mission.js` :948).

### Known gaps in the edge rows (none bites on this seed)

- **An edge on the planners' graph that bulges past 2400 m gets no row**, by design (a row there
  would stand on a job route). The fade still catches it.
- **A BUG-63 parallel run (`~p` key) gets no row.** `networkGraph` skips parallels (`src/road.js`
  :1978), and `_edgeRows` walks `networkGraph`. This seed has 0 parallel runs.

## Reproduction, seed 3852053035 (headless, Classic world)

`node test/camp-edge-census.mjs --seeds=3852053035` reproduces the camp and the row census in ~30 s.
The bypass numbers below came from a throwaway script on the same build sequence (spawnDecision →
RoadSystem warmed to 2800 m → `validateArea` → `poi.build`), since deleted.

**The region.** Spawn (221, −154). One piece, 49 nodes on the planners' graph, nothing condemned.
18 roads leave the home piece across the wall.

**The camp.** At (510, 2194): r 2366 m, bearing 173° (south). 5745 m of road from the spawn.

| Item | Value |
|---|---|
| Camp edge | `1,2,1` ↔ `509789,2298400,-1`, 709 m long |
| Inner node `1,2,1` | r 1910 m, degree 2 (a bend in the connector) |
| Camp barricade row | r 2372 m, arc 609 m |
| Edge crosses 2400 m / 2410 m | arc ≈ 640 m / ≈ 647 m |
| Back side drivable in a live run | ≈ 38 m of road (row → fade line) |
| Far node `509789,2298400,-1` | r 2469 m: 69 m past the wall, 31 m inside the drawn ring. A mid-span T, degree 3. |
| Its other legs | 80 m to `0,3,2` (r 2507 m); 727 m to `-1,3,1` (r 2442 m) |

**The two loops back.** Both close through the strip outside the wall.

| Loop | Path | Road length | Past the wall | Rows crossed | Peak r |
|---|---|---|---|---|---|
| East | home → `0,2,2` → `0,1,2` → `1,1,2` → `2,1,2` → `2,2,2` (3832 m on the graph) → leaves the wall at bearing 151° → `1,3,2` (r 2606) → `0,3,2` → far node | 5857 m | ≈ 1.2 km | 1 | 2688 m |
| West | `-1,2,2` (r 2046, bearing 198°, 7669 m from home) → leaves the wall at bearing ≈ 190° → `-1,3,1` (r 2442) → skirts the perimeter at 2356–2501 m → far node | 8985 m | ≈ 0.85 km | 1 (+2 on a pocket, below) | 2501 m |

The west leg skirts the drawn ring within 1–144 m. It is probably the "spur that skirts the
perimeter". The east leg runs just outside the ring, in the dimmed zone.

The west leg `-1,3,1` ↔ far node also dips back inside the wall, to r 2356 m at bearing 178°, about
200 m west of the camp. That dip is a pocket of road with a row at each end, facing into it. It joins
nothing inside, so it is reachable only cross-country.

**Shortest path from the camp's inner node to the far node, camp edge removed:**

| Allowed edges | Result |
|---|---|
| Any road in the warmed network | 5857 m (the east loop) |
| No edge carrying a barricade row | unreachable |
| Only roads that stay inside the fade line (≤ 2410 m) | unreachable |
| Planners' graph only | unreachable |

**How much road the map misdraws.** 3.76 km of road lies between 2410 m and 2500 m on this seed. The
map draws all of it undimmed, although the fade fires on all of it. For scale, 40.7 km lies inside
2410 m.

**How common loops are.** For each of the 18 roads out: does its far side reconnect to the home
piece without it, using only roads that stay inside radius R?

| R (m) | 2410 | 2500 | 2510 | 2600 | 2700 | 2800 (warm horizon) |
|---|---|---|---|---|---|---|
| Roads out that loop back | 1 | 2 | 4 | 4 | 8 | 8 |
| The camp's road | tree | tree | **loop** | loop | loop | loop |

The camp's road counts as a tree at 2500 m and a loop at 2510 m, because its west leg peaks at
2501 m. Any rule keyed to a radius is that brittle near the ring. In an infinite world every road out
reconnects somewhere, so "tree" only means "no loop within R".

## Root cause

1. **Drawn edge ≠ enforced edge.** The map ring sits at 2500 m, but FEAT-154 moved the real edge to
   2400 m (rows) and 2410 m (fade). The FEAT-103 ticket still describes "the invisible wall at
   2500 m", which predates FEAT-154.
2. **The siting test is run on a clipped graph.** "Leaves a dead end when cut" is evaluated where
   every road out already ends at the wall. FEAT-103 noted the consequence and called it minor: "a
   shortcut along that strip between two crossing roads."

Neither is a missing barrier. Physically, the whole world beyond the wall is already one region,
and the 25 rows plus the radial fade already cut it off.

## Options

"Moves roads" means re-routes: every world's network changes, captures and scenarios go stale. None
of these options does that.

| | Option | What changes | Generation cost | Cold / deterministic | What moves | How the player reads it | With the edge rows | Failure modes on other seeds |
|---|---|---|---|---|---|---|---|---|
| a | **Close the whole far side (graph cut)** | Barricade every road reaching the camp's far side without passing the camp. | — | — | Nothing. | Unchanged. | **Already true.** In a connected, infinite network the "far side" is everything outside the wall. The minimal cut between it and the inside is the set of all wall crossings, which is exactly FEAT-154's rows. A cut further in would close roads inside the play area. That goes against "connectivity goes up". | Nothing new. The map still shows the loop. |
| b | **Camp roads must be trees** (placement rule) | `_siteCamp` also requires the far side of the cut to have no road back to the home piece within R_obs. R_obs = what the map can show (≤ the 2800 m warm band; use ~2700 m to stay off the streamed horizon). | One graph search per road out: ≤ 32 roads × ~170 edges. Microseconds against a ~27 s region build. | Pure function of (seed, network, centre), like today. Depends on the warm band, so changing `WARM_MARGIN_M` would move camps. | **The camp, on seeds where today's pick loops.** On this seed at R_obs 2700–2800 m: from 173° to the 43° road out of `1,-4,2` (≈ 5.2 km to the cut, down from ≈ 6.2 km; estimate from the census row, not run through `_siteCamp`). The uncle's direction line and the requisition follow it. No gate pins camp coordinates. | The expedition's road visibly leads **out**, not round. That matches the fiction: a crew looking for a way out. | Independent. The rows still close every other road. | Radius-brittle: this seed flips between 2500 and 2510 m. A seed may have no tree road, so it needs a fallback (today's pick plus the map fix). Unmeasured how many seeds change camp. Beta (R2 trail) needs a road that does reconnect to R2's network, so the rule must be revisited for the ladder. |
| c | **Barricade the bypass spur** at the play-area edge or at its far junction | A row on each spur. | — | — | Nothing. | Unchanged. | **Already built at the edge.** The spurs carry rows at 151° and ≈ 190°. A row at the far T (r 2469) would stand past the fade, where nobody can drive. | Map-only problem untouched. |
| d | **Prefer leaves of the road graph** | Site the camp at an existing dead end (degree 1). | Trivial. | Fine. | The camp, everywhere. | A road that just stops does not lead out. That fits the fiction worse than (b). | Independent. | **Fails on this seed:** 0 dead ends on the home piece ≥ 1800 m out. T-promotion keeps dead ends rare. Needs a fallback on most seeds. |
| e | **Accept and reframe** in words | Dialogue / card copy: "the road beyond is closed; the crew came in the back way". | None. | Fine. | Nothing. | Lampshades it. The map still shows a drivable-looking loop that isn't one. | Independent. | Explains one case and leaves the misleading map for every other road out. |
| f | **Honest map** (draw the edge where the game enforces it) | `_drawRegion` draws the ring and the exterior dim at the fade line (2410 m) instead of 2500 m. A short closure tick at every barricade row (`poiSystem.barricades()`, every 3rd entry is a row middle), the camp's included. The label reads 2.4 km. | Render-only, per frame: one arc plus 26 ticks on this seed. | No worldgen change at all. | Nothing in the world. | The camp's road crosses the ring just past the camp at a tick. The T, the stub and the perimeter road all fall in the dimmed exterior, behind two more ticks. Every road out reads the same way: closed at the line. | Makes the rows visible on the map. They are the cut, so the map now shows it. | Covers every seed and every loop outside the wall, not just the camp's. The camp is then 44 m from the ring, not 134 m. The 3D view still shows the deck continuing ~100 m past the camp ("blocked, not hidden", owner 2026-10-26). |
| g | **Hide the deck past the camp** (FEAT-103's "later toggle") | A mid-edge cut in `road.js`, so the camp edge ends at the row. | Road-system change. Carve and surface change past the cut. | Deterministic, but the world fingerprint changes on every seed. | The road surface near every camp. | No road behind the camp at all, in 3D or on the map. | Independent. | Removes only the camp stub. The perimeter road still loops on the map unless (f) also lands. Heaviest option. |

## Recommendation

**First choice: (f), the honest map.** The spur is not open. The game already cuts it twice: a row
at the wall and the fade 10 m on. What is wrong is a picture that puts the edge 100 m too far out
and hides the cut. Fixing the picture fixes the whole class (3.76 km of road on this seed) in one
render-only change. Nothing in any world moves, and no gate or scenario goes stale. Main tradeoff:
the camp's road still technically joins a loop outside the line. The player sees that loop dimmed
and behind closure ticks, but sees it. If the expedition's road must also *lead out* in the
fiction, add (b).

**Second choice: (b), tree-only camp roads**, with R_obs ≈ 2700 m. Fall back to today's pick when
no road qualifies. It makes the camp's road a true road out on most seeds, at microseconds of
generation cost. It moves the camp on some seeds. It is radius-brittle near the ring, and it has to
be re-ruled for the beta ladder, where the trail must reach R2. It is a complement to (f), not a
replacement: without (f) the other roads out still draw as normal road into the 2410–2500 m strip.

Options (a) and (c) are already built. (d) fails on this seed. (e) leaves the map wrong. (g) is the
heaviest and still needs (f).

**Owner's call:** (f) alone, or (f) + (b).

## What a prototype measures

- **(f), in-browser** (`test/cdp-smoke.mjs`-style screenshot of the map on seed 3852053035 around
  (510, 2194)): the far T, the 80 m stub and the perimeter road are all inside the dimmed exterior.
  Ticks on the camp's road and on the spurs at 151° and ≈ 190°. Tick count = rows = 26 (25 edge +
  the camp's). Headless: road length drawn undimmed past the fade line = 0 (today 3.76 km).
- **(b), headless, an extension of `test/camp-edge-census.mjs`** over seeds 1–100: per seed, roads
  out that are trees at R_obs = 2500 / 2700 / 2800 m. How often today's pick is a loop (so the camp
  moves). The change in camp road-distance. Seeds with no tree road (fallback rate). Pick stability
  when R_obs moves ±50 m (the brittleness this seed shows at 2500/2510 m).

## Acceptance

- [ ] Owner picks (f), (f) + (b), or another option above.
- [ ] (f): the story map's ring and exterior dim sit at the fade line (`REGION_RADIUS_M −
      REGION_MARGIN + poiEdgeFadeM`), read from the same constants the fade uses so they cannot
      drift. Every barricade row shows as a closure mark. On seed 3852053035 the camp's far junction
      and both loop legs draw in the exterior.
- [ ] (b), if chosen: `_siteCamp` rejects a road whose far side reconnects to the home piece within
      R_obs. Fallback when none qualifies is defined and logged. Census numbers from the prototype
      above are recorded here. `expedition-camp`, `story-poi` and `region-pieces` gates stay green.
- [ ] FEAT-103's "invisible wall at 2500 m" paragraph is updated to the FEAT-154 edge (rows at
      2400 m, fade at 2410 m).
- [ ] Note in FEAT-154: rows are not placed on BUG-63 `~p` parallel runs (they are absent from
      `networkGraph`). Measure how often a parallel crosses the wall, or close it as not occurring.
