---
id: DEC-477
status: standing
decided: 2026-11-21
area: ui
governs: FEAT-319, src/gamepad.js, src/menu-nav.js, pause menu, pad, keyboard, menu-nav, steering, throttle, brake
supersedes:
---

# DEC-477: The pause menu does not take the truck's steering, throttle or brake

**Ruling.** Owner, 2026-11-21: "I feel like there's no reason to prevent steering or throttle or brake in the pause menu on pad or keyboard. D-pad should be used to interact with the UI but if you steer with left stick in the background it should still steer since we're not taking that input right now."

Readings (the lane's): "the pause menu" is the pause list, its settings page and the give-up confirm card that stands in for it. There the pad's left stick and both triggers drive in both layouts (Professor, Ventura Highway); the D-pad, A, B and Start work the menu; every other button stays silent. The keyboard already drove there (W / S / A / D / Space are no menu keys; the arrows and Enter are no driving keys), so it is unchanged. The other menus (the run's end, the intro card, the main menu, the story seed dialog) still hold the truck. The world already runs behind the pause menu outside a scenario; a scenario's pause still freezes its sim (FEAT-62).

**Why.** The menu takes no stick or trigger input, so there is nothing to protect by dropping it.

**Replaces.** menu-nav.js's "a menu holds the truck" for the pause menu only. DEC-411 (the pause menu's buttons) stands.

**Source.** Owner, 2026-11-21, via the orchestrator. Owner's words; readings marked as the lane's.
