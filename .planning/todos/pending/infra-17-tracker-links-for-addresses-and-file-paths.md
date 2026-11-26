---
id: INFRA-17
type: infra
status: open
severity: minor
opened: 2026-11-25
source: owner, tracker inbox 2026-11-25 — "add hyperlinks to the tracker for localhost, m4air, and local file locations (i.e. sheets)."
---
lane: free lane

# INFRA-17: The tracker links addresses and local file paths

## Next steps
Build with INFRA-16 (same files, `tools/dashboard/`): in owed cards, inbox replies and ticket bodies, turn `http://localhost:PORT`, `http://m4air:PORT` and absolute local file paths (sheets such as `/Users/.../wip/.../sheet.jpg`) into links. A file path needs a server route that serves the file (read-only, images and html, paths under the owner's CodeShit checkouts only).

## Summary
Addresses and sheet paths on cards are plain text today; the owner wants to click them.

## Tracker
- [ ] Built to the owner's words above
- [ ] Owner has looked

## Decisions
None.

## Open questions
None.

## Links
INFRA-16

## Files
`tools/dashboard/index.mjs`, `tools/dashboard/app.html`

## Log
- 2026-11-25: minted from the inbox.
