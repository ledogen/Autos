---
id: FEAT-300
type: feature
status: open
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "When you're at the joint. It should show your hunger. And sleep. and the time."
relates: FEAT-184, DEC-152, DEC-155, DEC-304, DEC-326, src/main.js, src/hud-menu.js
---
lane: SM-1 tutorial (scribe: with FEAT-298, the same scene; Sonnet)

# FEAT-300: At the burger joint, show hunger, sleep and the time

## Next steps
Built (land/feat-300-joint-status): the joint's shop menu keeps the HUD dock (energy, hunger, clock) beside the card. The firing and the paycheck stop already showed all three. Owner looks (owed card feat300-joint-status-look).

## Summary
Owner's words:
> When you're at the joint. It should show your hunger. And sleep. and the time.

### The scribe's reading (flagged: not verified in a running game)
The owner is at "the joint" (the burger joint). The code names it two ways: the opening (the firing scene at the joint, DEC-040) and the morning-after paycheck stop (`_dayStop() === 'joint'`, `src/main.js` ~4834 and ~5099). The scribe thinks he means the PAYCHECK scene (it is the one he edited in FEAT-298 the same morning, 06:48 then 07:05): the tutorial holds the clock (`clockHeld(..., _tutDrive(), ...)`) and dialogue cards cover the status readouts, so the player sees no hunger, no energy and no time while he reads the manager. Second guess: during the firing at the start. Not confirmed.

## Description
(See Summary.)

## Tracker
- [x] Find where the status readouts are hidden at the joint and why: only the shop menu (FEAT-167 hid the whole dock behind any shop card); the firing and paycheck show all three
- [x] Hunger, sleep (energy) and the time show at the joint (storefront menus keep the dock, slid left of the card)
- [ ] Owner has looked

## Open questions
- Which scene: the firing (day 0 start), the paycheck (morning after), or both? The scribe guesses the paycheck.
- Show where: the normal HUD cluster, or a card? The owner said "show", not where. Scribe assumes the usual HUD.
- No governing decision found (DEC-422 is the tutorial monologue pass, DEC-304 the order of the joint errands).

## Files
`src/main.js` (tutorial HUD gating ~4734-5101) · `src/hud-menu.js`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
- 2026-11-20: measured in Chrome: firing and paycheck show run-hud (clock), energy and hunger (clock held, still drawn). The shop menu hid the dock (src/service-screen.js FEAT-167 rule). Fix: the dock stays for storefronts, `right` moved left of the card; auto shop unchanged. Sheet wip/feat-300/sheet.jpg. pad-e2e and service gate green; smoke: see below. Also visible now beside the card: the park badge and the start-truck hint (not touched).
- 2026-11-20: main merged; also hide #hud-icons + #ignition-hint behind a storefront card. service, pad-e2e, smoke (42 steps) green.
