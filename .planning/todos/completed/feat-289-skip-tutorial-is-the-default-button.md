---
id: FEAT-289
type: feature
status: closed
severity: minor
opened: 2026-11-18
source: owner, 2026-11-18 (inbox)
---
lane: free lane

# FEAT-289: Swap the Skip and Play tutorial buttons; Skip is the default

## Next steps
Closed 2026-11-20. Owner looked and said good.

## Summary
Swap the Skip and Play tutorial buttons; Skip is the default.

## Description
Owner: "Switch, skip, and play tutorial. Skip should be the default option."

## Tracker
- [x] Built
- [x] A gate or smoke step holds it
- [x] Owner has looked

## Decisions

## Open questions

## Links

## Files
index.html, src/main.js

## Log
- 2026-11-18 minted by the orchestrator from the owner's inbox.
- 2026-11-18 ui-1117b: #tc-skip now first in #tut-card (the menu-nav default selection), play second; smoke asserts focus opens on tc-skip. A first-ever playthrough still gets the DEC-148 confirmation on skip. Look pending.
- 2026-11-20: owner, card ui-1117b-look: "Good: close them". Closed. On main (aa0009cc).

