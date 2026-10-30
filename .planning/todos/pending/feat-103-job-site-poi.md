---
id: FEAT-103
type: feature
status: open
severity: major
opened: 2026-10-07
source: owner, 2026-10-07 — "Places and Missions" (pois.md § Places and Missions); re-scoped 2026-10-16; expedition ruled 2026-10-19
relates: FEAT-28 (region unlock + the wall), FEAT-43 (story region), FEAT-91 (haul yards), FEAT-102 (fetch),
  FEAT-113 (deadlines), FEAT-38 (dirt roads), FEAT-27 (static rockslide), BUG-85 (wall-cut pieces), SM-4,
  missions.md main missions, ASSET-71
---

# FEAT-103: The R1 conclusion — the expedition camp on the region wall

Step 6 of **Places and Missions**. (The file keeps its old `job-site` name so links survive.)

> **Design ruled** (owner, 2026-10-16 and 2026-10-19), except one trigger (Open, below). Build waits
> on FEAT-28 (the ladder's walls and the unlock) and is SM-4 work.

## The region and the wall it opens

The ladder (DESIGN.md, ratified 2026-10-12/15): **R1** is a 50° sector at six o'clock, 3.3–5.1 km
from the origin; **R2** is the parallel-sided band 1.5–3.3 km out. So R1's wall to R2 is its **north
edge, the 3.3 km arc (~2.9 km long)**. R1's outer arc and two side walls never open.

## Ruled

**The camp is its own POI type; the construction site stays a client** (owner, 2026-10-24, game-feel
review Q-2: "go with rec. split them"). The `workSite` POI ("{last} Construction") keeps posting courier
and freight jobs and receiving cinder blocks, concrete and the job box. The expedition camp is a NEW
type this ticket adds, on the story circle's edge at the end of a road (alpha slice), behind the
six-deed lock. Nothing is pulled from the offer pools for it. ASSET-71 is the camp's model; the
construction site keeps whatever placeholder-replacing model it gets later.


**The boss.**
- **R1 only, for now.** It is the R1 boss: the mission that lets you leave region 1.
- **It is an expedition camp**, not a bridge: a crew at the wall searching for the Roamer's old trail
  out. The bridge's suppliers (lumber, stone) are the R2 and R3 yards, so the bridge moves later.
  *Direction, not ruled:* each region's boss is fed by its own yard — R1 the expedition (splitting
  yard: firewood), R2 the bridge (sawmill: lumber), R3 open (quarry: stone).
- **Gated by 6 good deeds** — six well-driven jobs. Unavailable before, always available after,
  outside the job budget.
- **No penalty for failing.** A lost or late load is a line delivered again. The only danger is the
  physics on the way (SM-INV-1).
- **The boss doesn't pay**, for now. The board keeps running, so a player short of cash can run a paid
  job between lines. A keep-afloat reward may be added if playtests show players going broke.

**The requisition.** Five lines, one trip each, one per mission type:

| line | source | class |
|---|---|---|
| firewood | the splitting yard (FEAT-91) | haul |
| crew | the POI where the crew waits | courier (passengers) |
| food | a food vendor | courier |
| fuel | a gas station | courier |
| gear | the general store | courier |

- **One fixed source per line**, per run: the nearest POI of that kind to the camp (deterministic).
- **Same job, two map tags.** Each line is posted at the camp and at its source POI. Hovering either
  shows it; accepting at either starts the same job.
- **The clock starts at the pickup.** A waypoint leads to the source, untimed; par (route geometry,
  SM-INV-2) runs from source to camp.
- **No deadline, no giver lockout.** FEAT-113's rule (missed deadline → giver locked) does not apply:
  a missed or lost line goes back on the list unchanged, or the run could become unwinnable (SM-INV-7).
- **Lines persist** until delivered. One mission at a time still holds.
- **Budget:** ~1.5 deeds/day → the gate opens around day 4; five trips at ~2 jobs/day ≈ 2.5 days;
  ≈ 6.5 of R1's provisional 7 days.
- **Carried over:** it is a place (SM-INV-13 as amended); the beat/labor split (the Roamer's scene
  once per profile, the requisition every run); clearance is run state.

**The wall and the roads (amends SM-INV-13, 2026-10-19).**
- **Roads end before the wall.** Every road that crosses an R1 wall is trimmed back to its junction
  inside R1, so the network just stops; no signs. The trim runs on the road graph **before** junctions
  are built and POIs are placed (a trimmed T is rebuilt as a bend; BUG-82's pads are built per leg).
  The free-roam network is untouched; story mode hides edges, it never routes new ones.
- **One exception: the trail.** One road crossing the north wall into R2's network is trimmed **at the
  wall** instead, and the camp sits at its end. The stretch from its junction to the camp is the
  **connector**; the part beyond the wall is the trail the expedition finds.
- **The connector is the boss's difficulty.** All five trips end at the camp, mostly loaded. It is
  rough and hazardous: dirt (FEAT-38), rocks in the road / rockslide (FEAT-27), washboard or ruts (no
  ticket yet; MESH == PHYSICS means the deck itself must carry them). Hazards are **fixed for the
  run**, so the road is learnable. The camp can ship on a plain road first; each hazard lands with its
  own ticket.
- **Cross-country:** near the wall, a banner warning, then a hard wall shown as a 3D overlay. The
  owner rejected a softer teleport-and-reorient: more complicated and less transparent.
- **Funding it:** deliver the fifth line, **sleep at the camp, wake to the trail**. The overnight
  hides the network rebuild (FEAT-28 wants the unlock load hidden) and costs only the night.
- **The other R1↔R2 roads come back after 2 good deeds earned in R2**, revealed at the next sleep
  (owner, 2026-10-19). Until then the trail is the only link. Story mode only ever prunes and restores
  existing edges; it never adds a road (owner: *"simpler to just prune existing roads instead of
  trying to add some back"*).
- **The requisition is boss-only.** No ordinary giver posts one.
- **A seed with no road across the north wall into R2's network** is a bigger problem than this
  ticket — R2 is unreachable. It must be checked (measured over seeds) under FEAT-28 before this is
  built.

## Alpha slice (owner, 2026-10-26)

The alpha has one region, today's 2500 m story circle (MILESTONES.md § Release cuts). Everything above
about R1's sector, the north wall, R2 and the unlock is beta. In the alpha the camp sits on the
circle's edge at the end of a road, and completing the requisition is the win (FEAT-146).

### Where the camp sits (measured)

`node test/camp-edge-census.mjs --seeds=1-100` builds the story region at each seed's spawn, with the
planners' wall at 2400 m (`REGION_RADIUS_M − REGION_MARGIN`). The camp goes on a road that **already
crosses the wall**, cut there. No road is ever added.

- **Every seed has one.** Count the roads that cross the wall and leave a dead end when cut, which
  excludes a road that leaves and comes back in. There are at least 12 per seed. Add a 14 × 8 m camp
  pad within 400 m of the cut (ASSET-71's pad, through the POI reject tests) and ≥ 300 m of road back
  to the last junction: 100 / 100 seeds qualify, with at least 5 roads each (median 11).
- **Any direction** (owner, 2026-10-26). The uncle's line (data/dialogue.js, today "the north road")
  names the camp's true compass direction, filled in at run start.
- **The road past the camp is blocked, not hidden** (owner, 2026-10-26). The camp model plus a barrier
  across the deck ends the road. The 100–120 m beyond it, out to the invisible wall at 2500 m, stays
  as it is: every crossing road already runs into that wall. *Hiding the deck past the camp is more
  correct, since the expedition hasn't found a way out yet. It is a later toggle (FEAT-28's trim
  brought forward, and it needs a mid-edge cut in road.js).*
- **Cutting at the wall strands nothing.** The camp's edge has one node past 2400 m, so the POI
  pool, the newspaper customers and the planners' graph already exclude it (poi.js `build`,
  `buildHouses`, mission.js `buildGraphAdj`). Nothing the game sends a player to sits past the inner
  node on it. A cut inside the wall could strand things (that is the beta trim's check, under
  FEAT-28); this one cannot. It only removes two player-only things, both unmeasured and minor: a
  camping zone in the 2400–2500 m strip beyond the camp (zones are kept out to 2500 m), and a
  shortcut along that strip between two crossing roads.
- **Two plumbing changes.** (1) The camp is sited outside the roster, on that edge. The pool skips
  any edge with a node past the wall, so the camp cannot come from it. (2) The planner learns a
  destination it enters from one node only: route to the inner node, then drive the stretch to the
  camp. Today it returns null for any POI whose edge has a node off its graph (mission.js, the
  `adj.has(qa) && adj.has(qb)` tests).

### The pick rule

Deterministic per seed. Of the roads crossing the wall:

- **Required:** it leaves a dead end when cut, it is on the spawn's piece, a camp pad fits within
  400 m of the cut, and there is ≥ 300 m of road from the last junction to the cut. That keeps room
  for the connector's hazards later.
- **Then:** the farthest from the spawn by road. That gives 3.1–9.1 km (median 4.9 km). Cap it if
  the first drive there is too long.

The **connector** is the road from the last junction (planner degree ≥ 3) to the camp.

### The connector stays ordinary in the alpha (owner, 2026-10-26)

*"Descope expedition camp connector upfit. It should just run the existing road gen for simplicity
and to get alpha shipped. We will bring in the unique challenge afterward."* In the alpha the
connector is an ordinary road. Below is the design for when the challenge comes in.

**After the alpha — the connector is the step up.** Owner, same day: the road leading to the camp
should be uniquely perilous. You gear up in R1 for the camp missions, which are a step up in
difficulty.
- **Dirt.** A surface tag on the connector's runs: dirt colour, no lane markings, dust, and lower
  grip per tire type. data/parts.js's all-terrain +15 % and sport −10 % on dirt wait on it. The tag
  goes on the run record so the map can draw it. Routing is untouched.
- **Extra dips and bumps.** The worst `roadQuality` on the connector (src/road-quality.js already
  drives potholes in both the ribbon and the physics surface), plus coarse undulation as real deck
  geometry (MESH == PHYSICS).
- **Rocks.** A FEAT-27 static rockfall with a line always around it (SM-INV-7), paired with FEAT-93's
  hazard punctures.
- **A stream crossing — picked, not built.** Every seed has a qualifying road whose connector already
  crosses a stream (100 / 100, at least 1 per seed, median 4). Today every crossing is a causeway.
  For 500–1500 m connectors, 95 / 100 seeds still have a stream road.
- **Fixed per seed**, so the road is learnable. What it rewards: all-terrain tires, lift kit, welded
  diff, patches, compressor.

**Questions to settle when it comes in** (recommendations from 2026-10-26):
1. **Story and free roam would build different roads**, against FEAT-46's same-road rule. Free roam
   cannot know which road is the connector. *Rec: an exception scoped to the connector.*
2. **Par knows only curves and grade**, at one fixed grip (src/par.js). *Rec: par reads a reference
   dirt grip on the connector; fallback, a contract slack on the requisition lines.*
3. **Connector length.** *Rec: 500–1500 m with a stream; drop the stream first where none fits.*
4. **Ford or causeway.** *Rec: causeway first, ford later.*
5. **Keep ordinary jobs off the connector.** *Rec: yes.*
6. **Files.** Dirt grip lives in tire.js and punctures in damage.js (Lane B's); the surface lives in
   road.js and road-mesh.js.

## Built (alpha slice, 2026-10-28, feature/run-shape)

- **The camp** — `expeditionCamp`, `CAMP_SLOT` in src/poi.js, sited by `_siteCamp` after the roster
  (never from the pool), dressed like a slot. Pick rule as above; on the chosen road the pad nearest
  the cut wins. The ASSET-71 model (`expeditionCamp`, 9 solid boxes) since 2026-10-29. Map label "Expedition" (data/map-icons.js).
- **The barrier** — `_barriers`: a row of three ASSET-71 Type III barricades (`roadBarrier`, 3 m each)
  4 m past the pad's far end, across the 10 m paved road with 0.5 m gaps (owner, 2026-10-29: five
  abutting across the shoulders read as overlapping), striped faces back toward the camp. Each sits on the lowest deck under its width, so it sinks a little on a cross-slope and never
  floats. Each is one more box on the camp's body (`_barrierBox`), so the wheels and the chassis hit
  what main.js draws. (The 10-28 build used a placeholder slab; replaced 2026-10-29.)
- **The planner** (src/mission.js) — a destination POI may have ONE node on the graph (the camp's);
  `dest.anyLeg` lifts the leg band and hop cap for a line, so every line always plans (SM-INV-7).
- **The requisition** — data/offers.js `REQUISITION`; src/offer-board.js `r` slots: closed until
  `openLines()` (main.js `_renderRunHud`, at `ECONOMY_PARAMS.campDeeds`), shown at the camp and the
  source as one offer, no expiry, no deadline, no lock, no pay, no deed. A line taken at the camp is
  untimed until you park at the source (`approach` / `reachSource()`); the GPS stays off and the
  source's own park spot is lit until then. The run HUD shows "requisition n / 5" once open.
- **The uncle** — data/dialogue.js `{dir}` + `COMPASS`, filled by main.js `_runIntro()` (8 points).
- Gate: test/expedition-camp.mjs. Census: test/camp-edge-census.mjs now reports `camp` per seed.
- **Census, seeds 1–100 (2026-10-28, with BUG-90 merged): 100 / 100 place the camp.** Road distance
  from the spawn 3.4–9.5 km (median 5.2); the pad 2053–2391 m from the centre (median 2351); every
  direction occurs (N 12, NE 17, E 4, SE 10, S 17, SW 14, W 11, NW 15). Seed 6: north, 4.1 km by road.
  Distance is measured from the spawn's own road (both ends of its edge plus the partial stretch); the
  nearest junction was no stand-in — on seed 4 it sits 1.9 km of road from the spawn's edge.

**Calls made where the ticket was silent — the owner may overrule any:**
1. **A line counts at C or better**; a D (late, or too much of the load lost) puts it back on the
   list. Read from "a lost or late load is a line delivered again" with no deadline.
2. **The crew waits at the construction site** (`workSite`): "the POI where the crew waits" names none.
3. **The firewood line is 20 bundles, free** (owner 2026-10-30; was 25, the haul S count) — no picker, no stock cost; the card shows the yard's stock on hand.
4. **"Nearest source" is straight-line** to the camp. Every source type is a singleton today, so it
   only matters once a type has two.
5. All words on the line card, the prompts and the result rows are placeholders.

Not built: a GPS line from the camp to a line's source (the map's start pin and the lit park spot
lead there); the win itself (FEAT-146).

## Acceptance

**Alpha:**

- [x] Every seed in a 100-seed census places the camp, by the pick rule above. The census runs headless
      and reports the pick per seed.
- [x] The camp is a POI type of its own (not the roster's `workSite`), on the picked road inside the
      planners' wall. The road past it is blocked by the model and a barrier. *(ASSET-71 placed 2026-10-29)*
- [x] The requisition's routes reach the camp through its one inner node. No other POI, customer or
      route changes on a seed (test/region-pieces.mjs stays green). *(expedition-camp gate)*
- [x] The uncle names the camp's true compass direction.
- [x] The camp, its road and the requisition are the same on every load of the seed (no worldgen in saves).

**Beta:** to be written when FEAT-28's walls exist and the north-wall crossing check has been measured.
