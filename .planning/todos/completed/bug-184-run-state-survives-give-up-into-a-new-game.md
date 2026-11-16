---
id: BUG-184
type: bug
status: closed
severity: major
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "I failed out of it run with a damaged wheel and I used the give up menu button. Then I I started a new game and accepted the tutorial. Once I got in game, I noticed that the wheel with functional tire is behaving as if it is popped and the wheel is destroyed. I can see sparks, I can hear the sound effect playing of a wheel metal on pavement. Additionally, when I opened the map I saw the map of my previous world for a brief second. I think we should focus on doing better resets between matches and game modes"
relates: BUG-183, src/main.js, src/damage.js, src/map2d.js
---
lane: A (after FEAT-229 lands)

# BUG-184: A destroyed wheel and the old map survive give-up into a new game

## Next steps
Orchestrator: land `land/bug-184` (smoke `boot,story,opening,skipMenus,newRun` green on the branch), then smoke main.

## Summary
After give-up with a destroyed wheel, a new game starts with that wheel still destroyed (sparks, metal-on-road sound) although its tire shows as fine, and the map briefly shows the previous world. The owner: "we should focus on doing better resets between matches and game modes". BUG-183 built one reset point for menus; this is the same class for vehicle damage, audio, effects and the map's cached tiles.

## Description
### What survived (repro, `SMOKE_STEPS=boot,newRun` on main 122a606f, `wip/bug-184/repro-main.log`)
Rear-right wheel run down to its rim (tire 0, flat, wheel 0), map opened, give up, new game, tutorial played. The damage
model was whole (wheel 0.74, tire 0.68, no flat, not collapsed: the new run's `setAll(1)` + jalopy roll did run), but
`vehicleState.rimOnRoad[3]` was still **true**. That one flag is what the sparks (`dirt-spray.js`) and the rim grind
(`tire-audio.js`) read. **The split:** `rimOnRoad` (and `engineHealth`, the crank-time seam) are signals `damage.js`
derives from its state inside `step()`, and the tutorial's held step (`damageModel.held`, DEC-151) returned before
deriving them, so they kept the last run's values for the whole tutorial. A skipped tutorial un-holds and recomputes,
which is why the owner saw it after accepting the tutorial. Free roam was clean (its steps are not held).
The map: `_buildRoad` (every world change) drops the tile memos and starts a new sheet, but `render()` blits the bitmap
it already holds while a rebuild runs in slices (PERF-46), and after a world change that bitmap is the last world's.
Headless the map's width moves between opens, which forces a resize that wipes it; at a fixed window size (a player's)
the smoke reproduced it (`wip/bug-184/run4-nomapfix.log`).

### Audit: per-run state (the run save, `_runSnapshot`, plus what the truck and the screens derive) — 45 items, 4 un-reset
| Item | Owner | Reset on a new run / mode change? | Where |
|---|---|---|---|
| Damage tracks (body, armor, wheels, tires, engine, fluids, brakes, springs…) | damage.js | yes | `onRegionLive` `setAll(1)` + `rollJalopy`; free-roam seat `setAll(1)` |
| Flats, toe/camber offsets | damage.js | yes | `setAll(1)` |
| Damage transients (bursts, peaks, pinch energy) | damage.js | yes | seat `resetTransients` |
| Engine temperature, fatal impact | damage.js | yes | `_startStory` |
| **Rim-on-road signal (sparks, grind)** | damage.js | **no: held step skipped it** | fixed: `_signals` every step |
| **engineHealth (crank seam; a seized last engine would not catch in the tutorial)** | damage.js | **no: held step skipped it; the seat keeps it on purpose** | fixed: `_signals` every step |
| **Damage alert icon + its drop baseline** | damage-screen.js | **no in story** (free-roam seat only); the jalopy roll read as a hit against the last truck | fixed: `clearAlert` after the roll, re-takes the baseline |
| Tire-pop queue, tire condition cap | damage.js / main.js | yes | drained per frame / set per step |
| Fitted parts, durability, tire grip | parts.js | yes | `partsSystem.start` |
| Fuel, sputter count | fuel / main.js | yes | `makeFuelState`; count compared by `!==` |
| Motion (velocity, wheel spin, struts, drivetrain, ignition, park) | vehicle-state.js | yes | seat `makeVehicleState` |
| Odometer, headlights | gauges / main.js | yes | `_startStory` |
| Freight, haul, loose load bodies | main.js | yes | dropped the frame their job is gone |
| Thrown papers, ground items, world items | main.js | yes | `onRegionExit` / `onRegionLive` |
| Debris rocks, props, water, terrain | world owners | yes | rebuilt with the world (cold, DEC-057) |
| Audio loops (tire, contact, knock, engine, wind, glass) | *-audio.js | yes (derived per frame) | from vehicleState + damage |
| Sparks, dust, clods, smoke | dirt-spray.js, dust.js, smoke.js | yes (derived; particles live < 1 s) | — |
| Map tiles, cover memo, stream state, region freeze | map2d.js | yes | `_buildRoad` |
| **Map's blitted sheet** | map2d.js | **no** | fixed: `_buildRoad` sets `_bgZoom = 0` |
| Map radius target | map2d.js | yes | `releaseRegion` |
| Waypoint | main.js | yes | `_resetRunLocals`, `onRegionLive` |
| GPS route, evening guide, start board | gps / main.js | yes | `clearRoute` on a seed change; `_eveningGuide` |
| Alerts (machine words, wrong way) | main.js | yes (derived) | `_machineWords` |
| Rank timer | rank-timer.js | yes (derived from the job) | — |
| Clock, energy, hunger, coffee, crashes, blinks | day.js | yes | `daySystem.start` |
| Camps, camp pads, camp card | camp / main.js | yes | `campSystem.clear/build`, menu list |
| Mission, paper route, Larry's tier | mission / paper | yes | `missionSystem.exit`, `abort`, `resetPaperRun` |
| Offer board, its log | offers / main.js | yes | new on live, null on exit |
| Wallet, deeds, paycheck hold | economy.js | yes | `economySystem.start` |
| Inventory, mom's lunches | inventory.js | yes | `inventorySystem.start` |
| Shop shelves | shop-stock | yes | `startShelves` |
| Dialogue seen, tutorial queue, card hold | dialogue / main.js | yes | `dialogueSystem.start`, exit |
| Menus, owed tow answer | main.js | yes | `_closeMenus` (BUG-183) |
| Tutorial locals, worst day, skip arm | main.js | yes | `_resetRunLocals` |
| Free cam, firing cam | main.js | yes | `exitFreecam`, exit |
| Playtime, run ended, run world, gearbox, return seed | main.js | yes | `_startStory` |
| Barricades, POIs | poi / main.js | yes | `_placeBarricades`, `poiSystem.clear/build` |
| Run save slot | save.js | yes | `clearRun` on a new game |
| Profile: played-before, settings, won truck | settings / save.js | kept on purpose (DEC-008) | — |

### The fix
Not a new reset call: the run-entry resets were all there. The two misses were state DERIVED from what was reset, and
a cache drawn from what was reset. So each is fixed where it lives: `damage.js` `_signals()` publishes the rim and
engine signals on every step, held, locked or wearing (bit-identical on the wearing path); `map2d.js _buildRoad` marks
the held sheet invalid, so the first frame of a new world builds whole as a first open does; `damage-screen.js
clearAlert` re-takes its drop baseline and story entry calls it after the jalopy roll.

## Tracker
- [x] Reproduced: give-up with a destroyed wheel, new game, wheel still destroyed
- [x] Audit: every piece of per-run state (damage, wheels, tires, audio loops, particle effects, map tiles and waypoint, GPS, alerts, clocks) and where a new run resets it
- [x] One reset path for a new run and for a mode change; nothing per-run survives
- [x] Smoke step: wreck a wheel, give up, new game, assert a healthy truck and a map of the new seed

## Open questions
- Holes left, not fixed: Continue of a save whose truck is worse than the fresh roll can raise the damage alert on
  resume (repro: wreck, save & exit, Continue: the icon flashes); arguably right (it was unread), not changed.
  `engineHealth` in the tutorial is fixed by the same line but not asserted (repro on main: seize the engine, give up,
  play the tutorial: the key never catches).

## Files
`src/damage.js` · `src/map2d.js` · `src/damage-screen.js` · `src/main.js` · `test/cdp-smoke.mjs` (step `newRun`)

## Log
- 2026-11-16: filed from the owner's inbox note.
- 2026-11-16 (Lane A, `land/bug-184`): repro FAIL on main (rim signal live after a played tutorial; map blits the last
  sheet at a held window size). Fix: damage.js `_signals`, map2d.js `_bgZoom = 0`, damage-screen.js baseline, main.js
  one line. `SMOKE_STEPS=boot,story,opening,skipMenus,newRun` PASS (`wip/bug-184/smoke-set.log`); affected gates 31/31
  (`wip/bug-184/gates.log`). Unverified: fingerprint-physics (wearing path unchanged by reading), Continue of an old save.
- 2026-11-16: landed on main (local). Closed.
