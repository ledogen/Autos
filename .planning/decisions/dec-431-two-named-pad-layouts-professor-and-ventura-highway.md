---
id: DEC-431
status: standing
decided: 2026-11-18
area: ui
governs: FEAT-294, FEAT-125, src/gamepad.js, gamepad, controller, pad layout
supersedes:
---

# DEC-431: Two named pad layouts, "Professor" and "Ventura Highway", switched in settings

**Ruling.** Owner, 2026-11-18: "I have a friend who wants to remap the controls so I think we should make a second gamepad
layout profile that he can just switch to. This keeps the bug surface area smaller before we build an actual control
mapping menu UI in the settings menu." His preference: "LB on clutch, hand brake on A, upshift on B, downshift on X."
"Go ahead and build it and put his side menu on RB. Let's call the current control configuration 'Professor' and
let's call the alternate 'Ventura Highway'."

How A as both handbrake and select is settled (orchestrator's wording, approved by the owner: "Good readback"):
- A layout changes the DRIVING buttons only. While a menu, a card or the map is up, A is select and B is back in
  every layout.
- The way out of a parked screen is B (back), then the gas, which drops the parking latch once no parked screen is up.
- Any screen that locks the parking brake must close on back (mom's forced fill-up stays the exception).
- A press belongs to the context it began in: a press that selected or backed in a screen never also acts as a
  driving button when the screen closes under it.
- In Ventura Highway the side menu is RB held; RB tap stays the paper throw while aiming.

**Why.** A fixed second profile gives the friend his layout now, with a small bug surface, ahead of a full remapping menu.

**Replaces.** Nothing. Professor is the FEAT-125 layout unchanged.

**Source.** Owner, chat with the orchestrator, 2026-11-18.
