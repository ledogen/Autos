---
id: BUG-98
type: bug
status: done
severity: minor
opened: 2026-10-29
closed: 2026-10-29
source: owner, 2026-10-29 — "I've noticed that sometimes turning headlights on for the first time causes a
  lag. Can you just fix it right now?" (found while proving FEAT-152's spark light prewarm)
relates: PERF-21 (lamp shader prewarm), FEAT-152 (spark light), FEAT-66 campfire light
---

# BUG-98: first headlights / reverse / spark light compiled shaders mid-drive

## Cause

three.js bakes the number of each light type into every lit material's shader program, so a lamp
switching on needs a new program variant per material. PERF-21's boot prewarm compiled those, with
two gaps:

1. **Materials that arrive after boot** (streamed terrain, road tiles, props, the truck's .glb) were
   never prewarmed, so each compiled its variants the first time a lamp state appeared: the
   first-headlights lag (+4 programs on main).
2. **A missing state:** tails + reverse lamps (braking while reversing by day: 4 spots, no cookie
   maps) was not in the list (+7 on main).

## Fix

- `src/vehicle-model.js`: one `LAMP_STATES` list by light COUNT (off, tails, tails+reverse,
  head+tail, all) × the point light off/on (the campfire). It is shared by
  the boot `prewarmLightPrograms` and a new synchronous `compileLightState(i)`, which borrows a state,
  compiles and restores within one tick, so no rendered frame sees it.
- `src/main.js` `_lampSweepStep`: after each render, if the program count moved since our own last
  compile, sweep every state again, one per frame (~1.2 ms each on a warm scene). A render that
  compiles mid-sweep restarts it.

## Proof (headless Chrome, `nomenu`, same script on both)

| action | main | branch |
|---|---|---|
| headlights first on | +4 | 0 |
| reverse while braking | +7 | 0 |
| rims grinding (spark light) | +11 | 0 |
| any lamp after a 600 m teleport | 0 | 0 |

(The spark-light row was measured while FEAT-152 had a point light; the owner removed it the same day.
Its +11 on main was the tails+reverse gap above.)

Cost: the boot prewarm now compiles 10 states instead of 4, ~30 programs a frame, so it finishes
~0.4 s later (behind the main menu in normal play). 313 programs warm vs 148. After boot the sweep
caused no frame over 20 ms.
