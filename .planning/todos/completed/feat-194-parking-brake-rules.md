---
id: FEAT-194
type: feature
status: closed
severity: major
opened: 2026-11-12
source: owner, 2026-11-11 inbox, three items — (1) "Tapping or holding the brakes with the parking brake on should not release it. Only the gasor shifting into gear if manual should release it." (2) "I think we should lock the parking brake on whenever the player enters a menu that requires them to be parked for example When you stop at a mission provider And you're looking around in the Map if you accidentally tap the gas and the car starts rolling you might not notice I think it's perfectly reasonable in that case to just lock the handbrake on" (3) "I think it might be interesting to have no time pass while the handbrake is pulled up. First off, let me know if there are any huge glaring issues I'm missing with this plan. I think it would give players more time to make decisions, feel less pressured, consider using more items, and looking at their car more. Right now every moment you take to make decisions is a penalty which does not feel very comfortable. It makes the gameplay feel very rushed. Because you have to completely stop to park, I think this is a reasonable trade."
relates: [FEAT-125, FEAT-65]
---
lane: A (clock) + B (the brake input)

# FEAT-194: Parking brake rules: brake pedal does not release it, parked menus set it, and no time passes while it is set

## Next steps
Closed. Owner: one drive to feel a stop (owed: feat194-drive). The clock stands still while the BRAKE lamp is lit, including after leaving a camp or shop until the brake is released.

## Summary
The parking brake's latch gets three rules: the brake pedal never releases it (part 1), a menu that needs the truck
parked sets it (part 2), and no game time passes while it is latched (part 3, owner 2026-11-13).

## Description

**Part 1 — release.** The brake pedal, tapped or held, never releases the parking brake. Only the throttle
releases it, or shifting into gear on a manual.

**Part 2 — parked menus set it.** Entering any menu that requires being parked (a mission giver, a shop, the
map while stopped) sets the parking brake, so a stray throttle tap cannot roll the truck unnoticed.

**Part 3 — no time passes while the parking brake is set.** (Ruled 2026-11-13, see Decisions.)
DESIGN.md already pauses the clock in shops and menus ("The clock runs, pauses, or skips", ratified
2026-08-02), so this extends an existing rule rather than breaking one. The orchestrator's review of what it
changes, for the owner to rule on:
1. *It must require being stopped.* Gate on speed under ~0.5 m/s, or a handbrake slide freezes the mission clock.
2. *The speed tip gets softer.* Pay is "based on speed" and the mission clock runs on world time. With this, a
   stop mid-mission costs nothing, so the tip measures driving time only. That looks like the intent.
3. *Offer expiry and "due in" freeze too.* A job cannot expire while parked. Waiting out a timer is no longer
   possible either, but nothing in the design needs waiting.
4. *Hunger and energy* follow the clock, so they freeze. Engine idle fuel burn and coolant temperature are
   physics, not clock: recommended to keep running, so idling parked still costs fuel.
5. *Camping and sleep* still skip time by their own rule; unaffected.
6. *Part 2 then means every parked menu pauses time*, which is already true for shops.
No glaring hole found. The one real trade is item 2.

### Parts 1–2 built (2026-11-13, Lane B)

- **Part 1.** The latch's rules moved into `src/park-brake.js` (pure, `stepParkBrake`); vehicle.js feeds it. Latched,
  it lets go on the throttle (W / RT), a Space / RB tap (the lever itself — kept: the offer card's decline and the
  pump's pay both ride that tap), or on a manual a shift that LANDS in a gear (the synchro's end, so a resume or
  sitting in gear never counts). S / LT, tapped or held, never. Consequence on the automatic: S at rest is reverse,
  so backing out of a parked spot starts with a Space tap.
- **Part 2.** `setParkLock` (vehicle.js), set before every step from main.js `_parkLocked()`: an offer card (mission
  'generating'/'offer', paper 'planning'/'offer'), the service/shop screen, the damage screen, the inventory or a camp
  face — each while the latch is set, as they open on it (so the debug Quick Job's offer, taken rolling, never brakes
  a moving truck) — or the map when it was opened at rest. While set the handbrake is on even unlatched — the BRAKE lamp reads it —
  and the throttle or a gear cannot release the latch; Space still can. The map's is a hold, not a latch: writing the
  latch would fire the park trigger behind the map (a giver's card, a pump).
- The pad audit's mid-press fix (gamepad.js rbOwned) is untouched.
- Gate `test/park-brake.mjs` (real updateVehicle, keyboard listeners + pad). `test/pad-e2e.mjs` (rainy-day) updated:
  an LT tap/hold while parked keeps it; RT on a map opened at rest does not move the truck.
- Part 3 still waits on the owner.

### Part 3 built (2026-11-13, Lane A)

- **The stop test.** The latch sets only on a Space tap with horizontal speed under `PARK_SPEED` (1.389 m/s ≈ 5 km/h,
  park-brake.js), or on a spawn / teleport / resume, which are at rest. A handbrake slide (Space held above 5 km/h)
  is momentary and never latches, so it never holds the clock. A tap at up to 5 km/h latches while the truck is
  still creeping: the rear wheels lock and it stops in well under a metre (about 0.3 m at ~3.5 m/s² from 5 km/h). That creep is the owner's "real stop",
  so there is no second threshold.
- **One pause path.** `clockHeld(camp, service, evening, parked)` (day.js) is the rule main.js's fixed step already
  used for camp, the service screen and the opening's evening, with the latch added. Every timed thing reads
  `DaySystem.clockH`, so they all freeze with it: the day clock and sky, energy (and blinks / dozes), hunger, an
  energy drink's crash, a job's elapsed time and due time, a paper route's clock, offer expiry. Fuel (stepFuel in
  stepPhysics) and coolant heat (damageModel.step) are not on that path, so idling parked still burns fuel and heats.
- **HUD.** No new element: the shop and camp pause show nothing extra either. The clock's minutes stop, the energy
  and hunger bars stop scrolling, and the BRAKE lamp is lit. Nothing was restyled.
- **What is not held.** The map opened at rest *without* the latch is a brake hold (part 2), not the latch, so the
  clock runs there; a Space tap stops it.

## Tracker
- [x] Part 1: brake input leaves the parking brake set; throttle (or a gear on manual) releases it. Pad and keyboard.
- [x] Part 2: opening a parked-only menu sets it; the HUD lamp shows it.
- [x] Part 3: DESIGN.md's clock section updated first; the clock, job timer and due time, offer expiry, hunger and
  energy stand still while latched, fuel burns on; gate `test/park-brake.mjs` §6.

## Decisions
- 2026-11-13, owner, on handbrake-clock (part 3, the clock stops while the parking brake is set): "1. We only latch handbrake at a \"real stop\" already so use that logic for both. 2. A stop still costs slowing down and speeding up. It's fine. Rest fine". So: build it as written. The clock stops while the latch is set, and the latch's own real-stop condition is the only stop test (no separate 0.5 m/s rule). The speed tip measuring driving time only is accepted. Offer expiry, "due in", hunger and energy freeze with the clock; idle fuel burn and coolant heat keep running.

## Files
`src/park-brake.js` · `src/vehicle.js` · `src/day.js` (clockHeld) · `src/main.js` (_parkLocked, the clock step) · `test/park-brake.mjs`

## Log
- 2026-11-13: parts 1–2 landed (Lane B).
- 2026-11-13: part 3 built (Lane A, feature/run-shape): day.js `clockHeld` + main.js's clock step; DESIGN.md's clock
  bullet amended. `test/park-brake.mjs` 15/15; with `parked` dropped from clockHeld it fails 4 checks (the gate bites).

- 2026-11-13: part 3 on main 5fae6fd8 (55/55 affected gates; smoke 26 steps, zero console errors after the camp step was updated in 4a4876eb: a re-seat latches the brake, so the clock holds until Space). Closed.
