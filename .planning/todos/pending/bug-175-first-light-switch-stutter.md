---
id: BUG-175
type: bug
status: open
severity: major
opened: 2026-11-15
source: owner, 2026-11-15 — "I think there's still a stutter whenever I switch on the truck lights for the first time And it also seems like it was triggered when the service station lights turned on when I parked. i dont think we have this issue with reverse or brake lights."
---
lane: Spare

# BUG-175: Stutter the first time the truck lights or a POI's lights switch on

## Next steps
Spare (lighting bundle): measure the hitch, confirm the cause, fix at the root.

## Summary
Suspect, unconfirmed: adding a light changes the light count, and Three.js then recompiles every lit material's shader (the GPU program) on the spot. Brake and reverse lamps are glowing materials, not lights, which would explain why they do not hitch.

## Tracker
- [ ] Built to the owner's words above
- [ ] Owner has looked / driven it
