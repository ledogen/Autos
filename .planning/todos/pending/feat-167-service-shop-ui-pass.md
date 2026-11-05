---
id: FEAT-167
type: feature
status: open
severity: major
opened: 2026-11-05
source: owner, 2026-11-05 — six inbox items from a play session (quoted under What)
relates: [FEAT-165, FEAT-166, SM-3]
---
lane: B

# Service shop UI pass — collapsible repair list, one alignment price, lean stock rows, jobs tab, no HUD behind it

Build on feature/machine, on top of the landing set: that set already edits these rows (the bench
prompt is gone, "always in stock", the clutch-LSD filter). Doing this on main would conflict.

Already on main (orchestrator, 2026-11-05): the grey "sound" band is now ≥ 80 % (was 90 %). The shop's
bars already read `bandColor` from damage-screen.js, so the shop and the diagnostics screen share one
scale by construction. The at-cap repair line now reads "Cannot repair above 80%." The diagnostics
damper / brake / armor lines are in the owner's words.

## What

1. **Collapsible repair sections, coloured by their worst part** (owner: "make the sections collapsible,
   wheels, tires, and so on so that it's not an overwhelming amount of information when you first look
   at it. Then we should color the section based on the worst component in that section… if a tire is
   at 40%, the tires section will appear as orange while collapsed").
   Every `GROUPS` header in My Vehicle is a toggle. All sections start collapsed. A collapsed header
   shows `bandColor` of its worst shown track, using the damage screen's flat-tire-is-0 rule. The pad
   and keyboard (menu-nav) must step onto the headers and open them.
2. **Alignment is one job for all four corners, $15 base** (owner: "alignment in the repair menu should
   be one cost to fully align all 4 corners. $15 base"). One row in place of four, with one price and
   one button that straightens every corner. Keep the labour time honest (one setup). Gate it when
   all four are already straight.
3. **Lean stock rows** (owner: "too much detail text going on"):
   - Drop "new · " / "used · ". The condition bar already says it.
   - Move the fitting price to the right with the part price, as two lines:
     `part: $x.xx` / `installation: $x.xx`.
   - Flavour text is at most two lines. The owner's examples: brakes → "more stopping power."; sport
     tire → "good grip on road. worse off road". The owner writes the rest of the descriptions, so list
     today's long ones as a make item. Never invent the words.
   - Alignment fix: move the condition bar further right to give the text back its width.
4. **Jobs is a tab** (owner: "jobs should just be another tab that shows up next to repair and
   parts"). It sits beside My Vehicle and Parts Shop, replacing the header's "jobs (n)" button. It
   shows only when the shop has live offers. Its body is the shop's offers. Taking one goes the way
   the button does today (close, then `openJobs`). LB/RB stepping (BUG-109, Spare) must reach it.
5. **No HUD behind the shop** (owner: "i dont like how the shop panels cover the time/wallet/
   sleepiness/dashboard panels. lets hide all that when in the shop. stuff that needs to be present can
   be moved into the shop menu (like we already have with the wallet)"). While `#svc-screen.open`, hide
   the clock, wallet, energy, the cluster/dashboard and the icon column, using the same
   `body:has(#svc-screen.open)` rule as `#quickjob-btn`. The wallet is already in the card. The shop
   time passes on the clock, so the card header shows the time of day if it doesn't already.

## Acceptance

- [x] Every repair section collapses and starts collapsed. A collapsed header carries its worst part's band colour (a 40 % tire → orange `Tires`).
- [x] One "Alignment" row: $15 base, straightens all four corners, disabled when straight. The service gate covers its price.
- [x] Stock rows: no new/used word; `part:` / `installation:` stacked at the right; desc ≤ 2 lines; the bar no longer crowds the text.
- [x] A Jobs tab appears only with live offers; LB/RB and the D-pad reach it.
- [x] Nothing of the HUD shows through or around the open shop; the time and wallet are readable inside it.
- [ ] Screenshot of each tab for the owner (after the compute hold lifts), then the owner's look.

## Work log

**2026-11-05, Lane B (feature/machine, on the landing set).** Built; the in-game look waits on the compute hold.

- **Sections** (`src/service-screen.js` `_vehicle`): every `GROUPS` header is a button (`data-act="group"`), all
  closed on open. The header text wears `bandColor` of the section's worst shown track, a flat reading 0, in
  both states. Sections with no condition track (Anti-roll bars, Lift) keep the plain header colour. menu-nav
  reaches the headers as ordinary buttons, so the D-pad and Enter / A open them.
- **Alignment** (`src/service.js` `bent` / `alignQuote` / `align`): one job, `REPAIRS.alignment.price` = $15 ×
  the day tier, flat. Hours = one `REPAIR_SETUP` (0.5 h) + 0.5 h × each corner's gap. It straightens all four
  corners and zeroes the bend arrays. `repair()` now refuses an alignment corner on its own, so there is one
  price path. The screen shows one row, "All four corners", with the worst corner's bar; the button is
  disabled when nothing is bent. `test/service.mjs` covers the refusal, the price, the hours and all four.
- **Stock rows**: no new/used word. The right column stacks the condition bar, `part: $x` and
  `installation: $x` (a non-part item, the jacks, shows its one price). The description is clamped to two
  lines (CSS line-clamp, with an ellipsis) until the owner's words replace the long ones. The name column
  gains ~80 px (≈ 240 px, about 33 characters a line at 12 px).
- **Jobs tab**: `data-act="tab" data-tab="jobs"`, shown only while `_takeableOffers` has any. Each offer is its
  map card's sentence and pay line (`_boardView.view(...).card`), with a "see the job" button that closes the
  screen and opens the offers starting at that one (the list rotated, so Q / E still cycle all of them). Spare's
  BUG-109 LB/RB stepping reads `[data-act="tab"]`, so it reaches the tab with no change.
- **HUD**: `body:has(#svc-screen.open)` hides `#hud-dock` (wallet, clock, energy, icon column) and `#cluster`.
  The dock comes back while the map is open over the shop. The card header now stacks the wallet over the
  clock (`formatDue`, the HUD's own notation).
- `test/cdp-smoke.mjs`: opens Tires before selecting the RR tire, takes the shop's jobs through the tab, and
  checks the dock is hidden. **Not run yet** (compute hold).
- Found on the way: FEAT-166's clutch-pack track had no jalopy range and crashed `rollJalopy`, which runs at
  every story start (4d725dd0 fixes it; the random sequence is unchanged from main).

### MAKE (owner): descriptions over two lines

Applied the owner's two lines: Sport tire → "Good grip on road. Worse off road."; **brakes → "More stopping
power." on the Sport front pads** (the inbox said only "brakes"; move it if another brake part was meant).
These still run past two lines at the new width (≈ 33 characters a line). The shop shows the first two lines
with an ellipsis until they are rewritten:

| Part | Today |
|---|---|
| springsFrontHD | Stiffer coils. Hold the nose up under a load, and crash over bumps when empty. |
| springsFrontSport | Shorter, stiffer coils that drop the nose. Flat and sharp on pavement; they hit the stops sooner on rough ground and tire sooner. |
| springsRearSport | Lowering leaves, stiffer than stock. Squats less and corners flat; bottoms out sooner loaded or on rough ground, and they tire sooner. |
| dampersFrontHD | Firm valving that settles a loaded truck. Busy and harsh when empty. |
| dampersRearHD | Firm valving that settles a loaded bed. Busy and harsh when empty. |
| dampersFrontSport | Quick, firm valving. The nose stays put and the ride gets busy. They wear out faster. |
| dampersRearSport | Quick, firm valving. The tail settles fast and the ride gets busy. They wear out faster. |
| brakesRearRace | Aggressive rear lining. Brake while turning and the tail comes round. |
| arbFrontNone | The front wheels move free of each other. It leans, and it turns in. |
| arbRearSport | Ties the rear wheels together. Rotates the truck; one bump becomes both wheels’ problem. |
| diffClutchLSD | Clutch packs share the drive until they wear out, then it is an open diff again. A shop can rebuild it, for a price. |
| diffLSD | Gears, not clutches, share the drive: nothing in it wears out. Pulls out of corners, and pushes into them. |
| diffWelded | The spider gears welded solid. Both rear wheels turn together, always: they chirp and hop through every tight turn. |
| liftKit | Spacers and longer shocks. Clears ruts and rocks; leans more, and rolls sooner. |
| radiatorStock | The factory radiator. Keeps the engine cool when it isn’t leaking. |
| airFilterStock | A paper filter. A clean one lets the engine breathe. Swaps in by hand, no shop needed. |

The shelf's non-part items (compressor, jacks, plug kit…) fit in two lines: with no bar or installation
line their text column is wider.

**Owed after the hold:** cdp-smoke, then a screenshot of each tab for the owner.
