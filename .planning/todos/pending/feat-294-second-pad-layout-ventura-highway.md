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
Built on `land/feat-294-pad-layouts`; owner tries it (owed card feat294-pad-layouts-try) and answers the guessed cells below.

## Summary
The current pad layout is named "Professor". "Ventura Highway" differs while driving only: A handbrake, B upshift,
X downshift, LB clutch, RB held = the side menu (RB tap still throws a paper while aiming). Menus, cards and the map
keep A select / B back in both. A visible setting on the controller page switches them, saved with the other settings.

## Description
### What each physical button does, per context (DEC-431)
`*` = a cell the build had to guess (owner's call; on the owed card). Professor is today's layout, unchanged.

| Context | Layout | A | B | X | Y | LB | RB |
|---|---|---|---|---|---|---|---|
| Driving | Professor | upshift | side menu (hold) | downshift | ignition | clutch | handbrake / park tap; aiming: tap throws, held = handbrake |
| Driving | Ventura | handbrake / park tap | upshift | downshift | ignition | clutch | side menu (hold); aiming: tap throws, held = side menu |
| Pump open | Professor | pump (hold) | side menu | downshift | ignition | clutch | handbrake (tap pays) |
| Pump open | Ventura | pump (hold) `*` | upshift | downshift | ignition | clutch | side menu — no handbrake button here: the gas pays `*` |
| Result card (drives through) | Professor | upshift | back | downshift | ignition | clutch | handbrake |
| Result card (drives through) | Ventura | handbrake `*` | back | downshift | ignition | clutch | handbrake `*` (no upshift until it closes) |
| Card (offer, camp, inventory, damage, recovery, paper) | both | select | back | — | ignition | clutch | handbrake = Space: declines an offer, backs a camp face `*` (Ventura) |
| Tabbed card (shop) / card over the map | both | select | back | — | ignition | tab / offer ← | tab / offer → |
| Map | both | select | back | Missions / Shopping | waypoint | card ← | card → |
| Menu (pause, settings, main) | both | select | back | — | — | — | — |

RB tap / hold (Ventura): not aiming, an RB press opens the side menu at once (as B did). Aiming, the press is held back
200 ms (`throwTapMs`): released sooner it throws, held longer it becomes the side menu (D-pad walks, release picks).

### Context-owned presses (DEC-431)
`gamepad.js held` now records every pressed button with the key its context gave it, `null` when silent, until it
is released. A select (Enter) or back (Escape) never becomes a driving key when its screen closes under it, and a
button pressed where it was silent stays silent. BUG-193's re-read of a held clutch / handbrake stands, except for A
and B (they are always the screen's). Professor change, edge only: X, the D-pad ↓ or another silent button still held
when a screen closes no longer fires its driving key (it used to).

### Parked screens and back
Offer card, shop, camp / mom's card, inventory, damage screen, the map at rest: each closes on B, then the gas
rolls the truck away (pad-e2e: inventory, damage, map; cdp-smoke pad step: mom's card, the offer card, the shop, the
pump). The pump does not close on B (Professor: B is the side menu there; Ventura: the upshift) but needs none: it
never locks the brake (mom's forced fill aside), so the gas pays and leaves.

### Keycaps
Driving keycaps follow the layout (`park-badge.js keycap` reads `padOf`): PARK, "X to call a tow", the abandon's
`RB + ↑` / armed `RB`, the side menu's "hold RB" line, the chart. Dialogue lines mark a moved button `data-pad`
(Katie's / mom's "hold B" → "hold RB", mom's "tap RB to set the handbrake" → "tap A"). The camp card's backs name RB
outright (RB is Space on a card in both layouts).

## Tracker
- [x] A layout is a small swap table applied to the driving table only; menu, card and map tables untouched.
- [x] The setting, named Professor / Ventura Highway, saved; the button chart follows the chosen layout.
- [x] A press belongs to the context it began in, for every button (today only B has this rule).
- [x] Every parked screen closes on B and the gas then rolls away: proven in pad-e2e, both layouts.
- [x] pad-e2e passes in both layouts; Professor's behaviour is unchanged.
- [ ] Owner tries Ventura Highway and answers the guessed cells.

## Open questions
- Ventura, on a plain card: RB stays the handbrake (Space), as in Professor — so RB taps decline an offer and back a camp face. Or should RB be silent on cards?
- Ventura, the result card: A is the handbrake and B is back, so there is no upshift until the card closes. OK?
- Ventura, the pump: A pumps, so the handbrake has no button there; the gas pays and drives off. OK, or RB = handbrake at the pump?

## Decisions
DEC-431.

## Log
- 2026-11-18 minted by the orchestrator from the owner's ruling.
