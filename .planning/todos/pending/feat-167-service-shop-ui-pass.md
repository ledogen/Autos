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

- [ ] Every repair section collapses and starts collapsed. A collapsed header carries its worst part's band colour (a 40 % tire → orange `Tires`).
- [ ] One "Alignment" row: $15 base, straightens all four corners, disabled when straight. The service gate covers its price.
- [ ] Stock rows: no new/used word; `part:` / `installation:` stacked at the right; desc ≤ 2 lines; the bar no longer crowds the text.
- [ ] A Jobs tab appears only with live offers; LB/RB and the D-pad reach it.
- [ ] Nothing of the HUD shows through or around the open shop; the time and wallet are readable inside it.
- [ ] Screenshot of each tab for the owner (after the compute hold lifts), then the owner's look.
