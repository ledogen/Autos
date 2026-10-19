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

## Acceptance

Written when FEAT-28's walls exist and the north-wall crossing check has been measured.
