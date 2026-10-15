---
id: FEAT-118
type: feature
status: open
severity: major
opened: 2026-10-14
source: owner, 2026-10-14 — "Players need spaces where the clock doesn't tick, otherwise the game is a
  mad rush slogfest for hours straight. I propose time doesn't pass when idle at camp and map is
  available. Planning period." Ratified earlier: run-shape.md "The clock" [RATIFIED 2026-08-02] —
  shops, service stations and camp pause the clock until you take an action; the map is reachable.
relates: FEAT-104 (carries the same rule for the shop), FEAT-113 (the mission clock reads the world
  clock, so it holds too), src/day.js, src/camp.js
design: run-shape.md "The clock: what runs it, what pauses it, what skips it"
---

# FEAT-118: The camp is a planning pause

While the player is at a pitched camp and has not taken an action, the day clock does not advance
and the map can be opened. Taking an action (sleep, cooking, breaking camp, driving off) resumes the
clock or skips it by the action's cost, as run-shape.md already rules. Nothing drains while paused.

The rule was ratified 2026-08-02 and never built for camp; FEAT-104 builds it for the shop.

> **Ruled 2026-10-15 (owner):** the map is not always open, but it can be opened. The camp
> menu lists the camp's options: sleep, fish, use item, open map, talk to the spirits.

## Acceptance

- [ ] Idle at camp, the day clock, energy and any active job's `elapsed` (FEAT-113) hold.
- [ ] The map opens from camp and closing it returns to camp, still paused.
- [ ] Any camp action resumes the clock or applies its time skip.

## Progress (2026-10-15)

Built: the frame loop skips `daySystem.update` while a camp face is up (pitched camp, mom's, the
sleep timer; the "make camp?" confirm still ticks). The camp menu gains "open map" (live), plus
"use item" and "talk to the spirits" as disabled (wip) buttons beside "fish". Sleep and break camp
are the actions that spend or resume the clock. No job can be on while camping today, so the
`elapsed` hold is moot until FEAT-113. Gates green; not yet checked in the browser.
