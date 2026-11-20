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
A lane finds why the hunger, sleep (energy) and clock readouts are not on screen at the joint and shows them there. The owner answers which scene he means.

## Summary
Owner's words:
> When you're at the joint. It should show your hunger. And sleep. and the time.

### The scribe's reading (flagged: not verified in a running game)
The owner is at "the joint" (the burger joint). The code names it two ways: the opening (the firing scene at the joint, DEC-040) and the morning-after paycheck stop (`_dayStop() === 'joint'`, `src/main.js` ~4834 and ~5099). The scribe thinks he means the PAYCHECK scene (it is the one he edited in FEAT-298 the same morning, 06:48 then 07:05): the tutorial holds the clock (`clockHeld(..., _tutDrive(), ...)`) and dialogue cards cover the status readouts, so the player sees no hunger, no energy and no time while he reads the manager. Second guess: during the firing at the start. Not confirmed.

## Description
(See Summary.)

## Tracker
- [ ] Find where the status readouts are hidden at the joint and why (the opening, or the paycheck scene, or both)
- [ ] Hunger, sleep (energy) and the time show at the joint
- [ ] Owner has looked

## Open questions
- Which scene: the firing (day 0 start), the paycheck (morning after), or both? The scribe guesses the paycheck.
- Show where: the normal HUD cluster, or a card? The owner said "show", not where. Scribe assumes the usual HUD.
- No governing decision found (DEC-422 is the tutorial monologue pass, DEC-304 the order of the joint errands).

## Files
`src/main.js` (tutorial HUD gating ~4734-5101) · `src/hud-menu.js`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
