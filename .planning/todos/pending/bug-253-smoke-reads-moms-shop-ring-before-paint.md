---
id: BUG-253
type: bug
status: open
severity: minor
opened: 2026-11-20
source: orchestrator, 2026-11-20 — the main.js smoke failed at "opening" on three lanes at load 9–14
relates: FEAT-305, FEAT-288, BUG-183, test/cdp-smoke.mjs, src/tut-gate.js
---
lane: s2

# BUG-253: the smoke reads mom's Shop-tab ring before the gate has painted it

## Next steps
Orchestrator lands land/bug-253-opening-ring (test-only change).

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
Passing run: `91 ms until=svcshop · 91 ms ring=(empty) · 124 ms ring=shop` — a 33 ms empty window every time.
The five runs below log the same ordering plus what the old one-shot read would have returned.

### Fix
The check waits (bounded, 3 s × the smoke's load stretch) for `until === 'svcshop'` AND the ring on the Shop tab. Still
strict: a ring that never comes still fails.

## Tracker
- [x] Cause found from the code and confirmed by timestamps: test race (ring follows state, 100 ms paint)
- [x] The check waits on the condition, bounded; no fixed sleep
- [ ] SMOKE_THROTTLE=4 opening step 5/5
- [x] `node test/tut-gate.mjs` green

## Files
`test/cdp-smoke.mjs`

## Log
- 2026-11-20: instrumented run at 4× throttle: card 91 ms, ring 124 ms after check-out (pass by luck of read timing).
