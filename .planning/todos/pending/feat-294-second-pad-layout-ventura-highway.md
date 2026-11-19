---
id: FEAT-294
type: feature
status: open
severity: minor
opened: 2026-11-18
source: owner, 2026-11-18 (chat with the orchestrator)
relates: FEAT-125, DEC-431, src/gamepad.js
---
lane: free lane

# FEAT-294: A second pad layout, "Ventura Highway", switched in settings beside "Professor"

## Next steps
Build per DEC-431 on `land/feat-294-pad-layouts`.

## Summary
The current pad layout is named "Professor". "Ventura Highway" differs while driving only: A handbrake, B upshift,
X downshift, LB clutch, RB held = the side menu (RB tap still throws a paper while aiming). Menus, cards and the map
keep A select / B back in both. A visible setting on the controller page switches them, saved with the other settings.

## Tracker
- [ ] A layout is a small swap table applied to the driving table only; menu, card and map tables untouched.
- [ ] The setting, named Professor / Ventura Highway, saved; the button chart follows the chosen layout.
- [ ] A press belongs to the context it began in, for every button (today only B has this rule).
- [ ] Every parked screen closes on B and the gas then rolls away: proven in pad-e2e, both layouts.
- [ ] pad-e2e passes in both layouts; Professor's behaviour is unchanged.

## Decisions
DEC-431.

## Log
- 2026-11-18 minted by the orchestrator from the owner's ruling.
