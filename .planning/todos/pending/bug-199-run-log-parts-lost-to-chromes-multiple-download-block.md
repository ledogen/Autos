---
id: BUG-199
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 — "I actually had a much longer much more typical gameplay log But lost it because chrome freaked out about downloading multiple files"
relates: FEAT-242, DEC-358, src/run-log.js
---
lane: unplaced

# BUG-199: A run log part is lost when Chrome blocks the second automatic download

## Next steps
A free lane (Sonnet): keep the parts in the browser until the run ends, then save ONE file; add a "Save log now" button.

## Summary
The run logger downloads one file per game day with no prompt. Chrome treats the second automatic download from a page as
suspicious and asks or blocks, and the blocked part is gone. The owner lost a long, typical run this way.

## Description
Keep each part in IndexedDB (the browser's built-in database, which survives a reload or crash) instead of downloading it
at the day roll. Download once at run end, as one `.jsonl`, and offer a "Save log now" button in the debug panel's Run
logging folder (a click-started download is never blocked). On boot, if parts from an unfinished run are stored, offer them.
`tools/run-log-summary.mjs` already takes several parts, so one concatenated file must read the same.
Workaround today: Chrome → the site's settings → Automatic downloads → Allow, for the play build's address.

## Tracker
- [ ] No download before run end
- [ ] Parts survive a reload or a crash
- [ ] "Save log now" button
- [ ] The summary tool reads the single file
