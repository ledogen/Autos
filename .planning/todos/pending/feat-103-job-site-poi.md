---
id: FEAT-103
type: feature
status: open
severity: major
opened: 2026-10-07
source: owner, 2026-10-07 — "Places and Missions" (pois.md § Places and Missions); re-scoped 2026-10-16; expedition ruled 2026-10-19
relates: FEAT-98, FEAT-28 (trail barrier), FEAT-91 (haul yards), FEAT-102 (fetch), FEAT-113 (deadlines), SM-4, missions.md main missions, ASSET-71
---

# FEAT-103: The R1 conclusion — the expedition camp on the region wall

Step 6 of **Places and Missions**. (The file keeps its old `job-site` name so links survive.)

> **Shape ruled, numbers ruled, two questions open** (owner, 2026-10-19). Do not build until the
> open questions below are answered and acceptance is written.

## Ruled (owner, 2026-10-16)

- **Region 1 only, for now.**
- **It is the R1 boss: the mission that lets you leave region 1.**
- **Gated by good deeds.** Completely unavailable until the player has the required good deeds, then
  always available. It is not in the job budget. Nothing about it is impossible for the stock truck.

## Ruled (owner, 2026-10-19)

- **R1's boss is an expedition camp**, not a bridge: a camp at the region wall, searching for the
  Roamer's old trail out. The bridge's suppliers (lumber, stone) are the R2 and R3 yards, so the
  bridge moves later. *Direction, not ruled:* each region's boss is fed by its own yard — R1 the
  expedition (splitting yard: firewood), R2 the bridge (sawmill: lumber), R3 open (quarry: stone).
- **The shape is a requisition**: a list of lines, one bar each, filled by ordinary deliveries to the
  camp. Each line is one trip. **Five lines, one trip each, one per mission type**:

  | line | source | class |
  |---|---|---|
  | firewood | the splitting yard (FEAT-91) | haul |
  | crew | one POI per run, deterministic from the seed, where the crew waits | courier (passengers) |
  | food | a food vendor | courier |
  | fuel | a gas station | courier |
  | gear | the general store | courier |

- **The gate is 6 good deeds** — six well-driven jobs. Budget check against R1's provisional 7 days:
  ~1.5 deeds/day → the gate opens around day 4; five trips at ~2 jobs/day ≈ 2.5 days; total ≈ 6.5
  days, about half a day of slack. Overrunning costs money, not the run (days are a pace).
- **Acquiring a line.** Select the expedition camp on the map; its open lines are listed below it.
  Picking one accepts that line's job without driving to the camp. A GPS waypoint goes to the
  **nearest source of that kind** — zero distance if the player is already parked at one. Arriving
  there starts the job. **The clock starts at the pickup**: the leg to the source is untimed; par
  (route geometry only, SM-INV-2) runs from source to camp. This is the FEAT-102 fetch with two
  changes: it is taken from the map, and its outbound leg is not timed.
- **No deadline, no giver lockout.** FEAT-113's rule (missed deadline → job expires, giver locked)
  does not apply: a missed or lost line goes back on the camp's list unchanged. Otherwise one miss
  could make the run unwinnable (SM-INV-7). Fails soft (missions.md, drag rule 3).
- **Lines persist.** Once the gate opens, every unfilled line waits on the camp until delivered.
  One mission at a time still holds (2026-10-14): take a line, deliver it, take the next.
- **Carried over from the drag/bridge design:** it is a place (SM-INV-13); the beat/labor split
  (the Roamer's scene once per profile, the requisition every run); clearance is run state (the
  tally resets with the run).

## Open — the owner's

1. **What does failing cost?** Proposed, not ruled: no fail flag. SM-INV-1 allows death only by crash
   or breakdown, so the boss kills through the physics (dangerous ground near the wall) and
   otherwise costs days, against the rising cost curve ("you run out of money, not days").
2. **Does the boss pay?** The owner agrees it is hard: region access is already a lot of value
   before any cash or item reward. missions.md's economy rule says the boss pays in access only.
   Base pay only, or nothing, is undecided.
3. **Is the requisition boss-only, or a general mission family** that ordinary givers can post for a
   larger reward? A non-boss requisition would need a real payout — part of the separate
   mission-rewards conversation.
4. **Placement** detail: on the R1 wall, within ~300 m of it, deterministic. Which edge of the wall,
   and how the camp reads on the map before the gate opens.

## Acceptance

Written when the open questions are ruled.
