---
id: FEAT-194
type: feature
status: open
severity: major
opened: 2026-11-12
source: owner, 2026-11-11 inbox, three items — (1) "Tapping or holding the brakes with the parking brake on should not release it. Only the gasor shifting into gear if manual should release it." (2) "I think we should lock the parking brake on whenever the player enters a menu that requires them to be parked for example When you stop at a mission provider And you're looking around in the Map if you accidentally tap the gas and the car starts rolling you might not notice I think it's perfectly reasonable in that case to just lock the handbrake on" (3) "I think it might be interesting to have no time pass while the handbrake is pulled up. First off, let me know if there are any huge glaring issues I'm missing with this plan. I think it would give players more time to make decisions, feel less pressured, consider using more items, and looking at their car more. Right now every moment you take to make decisions is a penalty which does not feel very comfortable. It makes the gameplay feel very rushed. Because you have to completely stop to park, I think this is a reasonable trade."
relates: [FEAT-125, FEAT-65]
---
lane: A (clock) + B (the brake input)

# Parking brake rules: brake pedal does not release it, parked menus set it, and (owner call) time stops while it is set

## What

**Part 1 — release.** The brake pedal, tapped or held, never releases the parking brake. Only the throttle
releases it, or shifting into gear on a manual.

**Part 2 — parked menus set it.** Entering any menu that requires being parked (a mission giver, a shop, the
map while stopped) sets the parking brake, so a stray throttle tap cannot roll the truck unnoticed.

**Part 3 — no time passes while the parking brake is set. OWNER CALL, not built until answered.**
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

## Acceptance

- [ ] Part 1: brake input leaves the parking brake set; throttle (or a gear on manual) releases it. Pad and keyboard.
- [ ] Part 2: opening a parked-only menu sets it; the HUD lamp shows it.
- [ ] Part 3: built only after the owner's ruling on the six points above; then DESIGN.md's clock section is updated first.
