---
id: BUG-253
type: bug
status: closed
severity: minor
opened: 2026-11-20
source: orchestrator, 2026-11-20 — the main.js smoke failed at "opening" on three lanes at load 9–14
relates: FEAT-305, FEAT-288, BUG-183, test/cdp-smoke.mjs, src/tut-gate.js
---
lane: s2

# BUG-253: the smoke reads mom's Shop-tab ring before the gate has painted it

## Next steps
Orchestrator lands land/bug-253-opening-ring (test-only change), then closes this ticket.

## Summary
`test/cdp-smoke.mjs` step "opening", check "checked out, mom does not point at the Shop tab", failed 5 of 5 runs on
three branches at load 9–14 (and passed on a fourth). It is a race in the TEST, not the game: the test read the ring
the instant the card turned, but the ring lands on the gate's next 100 ms paint.

## Description
### Why the game cannot lose the ring
`src/tut-gate.js` holds no state: `paint()` runs on a 100 ms `setInterval` and draws `.tut-hi` from `stepOf()`, i.e.
from `dialogueSystem.current()` — the same card `window.__tutorial().until` reads. So once the `svcshop` card is up, the
ring follows within one paint period on any machine, and it is re-drawn every period after that. Nothing one-shot.

### Why the test raced
The card turns on the HUD poll (`_untilTick`, main.js). The old check polled `until === 'svcshop'` and then read
`ringed()` once, at once. Between the card turning and the next paint the ring is empty (the check-out ring is wiped
when its button goes). Under load that gap grows, so the one read lands inside it often.

### Evidence (page-side recorder, 2 ms poll, SMOKE_THROTTLE=4, t = 0 at the check-out click)
Every run shows the same ordering: the card turns, the ring is empty, the next paint rings the Shop tab.
- failing read: `103 ms until=svcshop · 148 ms ring=shop`; the old one-shot read landed in the gap and got `""`
  (the new wait in the same run passed).
- passing reads: `91 → 124 ms`, `135 → 176 ms`, `138 → 159 ms`, `89 → 138 ms` (card → ring), read after the ring.

### Sibling race fixed in the same step
The first throttled run then failed at DEC-357's blink: after `tap('l')` the test called `readCards()` before the HUD
poll cleared the lights card, so readCards took it for an action card and returned, leaving mom's slow-down card up
(it holds the blink countdown). The test now waits (bounded) for the lights card to clear first.

### Fix
The check waits (bounded, 3 s × the smoke's load stretch) for `until === 'svcshop'` AND the ring on the Shop tab. Still
strict: a ring that never comes still fails.

## Tracker
- [x] Cause found from the code and confirmed by timestamps: test race (ring follows state, 100 ms paint)
- [x] The check waits on the condition, bounded; no fixed sleep
- [x] SMOKE_THROTTLE=4 opening step 5/5 (final code, stretch ×5.6–7.2)
- [x] `node test/tut-gate.mjs` green

## Files
`test/cdp-smoke.mjs`

## Log
- 2026-11-20: instrumented run at 4× throttle: card 91 ms, ring 124 ms after check-out (pass by luck of read timing).
- 2026-11-21: fa65d2c4 (both waits), main merged 4eb94bf2. SMOKE_THROTTLE=4 boot,opening 5/5 PASS (wip/bug-253/f4-*.log);
  tut-gate PASS; run-all --serial --changed: only cdp-smoke selected (browser, run directly above). No src/ change.
